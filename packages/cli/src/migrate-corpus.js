import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveTarget } from "./context.js";
import { collectCorpusDocuments } from "./corpus-documents.js";
import { hashEmbeddingInputs } from "./embedding-inputs.js";
import {
    FORMAT_VERSION as EMBEDDINGS_FORMAT_VERSION,
    splitEmbeddingsFile,
    validateHeader,
    writeEmbeddingsBuffer,
} from "./embeddings-file.js";
import { logger } from "./logger.js";
import {
    LEGACY_SCHEMA_VERSION,
    SIDECAR_SCHEMA_VERSION,
    contentHashOf,
    readSidecar,
    writeSidecarFile,
} from "./sidecar.js";

const LEGACY_FORMAT_VERSION = 1;
const FLOAT_BYTES = 4;

// Rewrites the sidecar manifests and the binary headers to schema 2. The chunks
// and the vectors are kept as they are, so this command never calls the webapp
// and never spends an embedding token.
export async function runMigrateCorpus({ path, contentsDir, dryRun }) {
    const context = await resolveTarget({ path, contentsDir, command: "migrate-corpus" });
    const { kind, collection, documents } = await collectCorpusDocuments({ context });
    const counts = {
        migrated: 0,
        already: 0,
        missing: 0,
        embeddingsMigrated: 0,
        embeddingsAlready: 0,
        embeddingsMissing: 0,
    };
    const stale = [];

    for (const document of documents) {
        await migrateDocument({ ...document, dryRun, counts, stale });
    }

    logger.info(
        {
            path,
            kind,
            collection: collection === "root" ? "both" : collection,
            files: documents.length,
            migrated: counts.migrated,
            already: counts.already,
            missing: counts.missing,
            embeddings_migrated: counts.embeddingsMigrated,
            embeddings_already: counts.embeddingsAlready,
            embeddings_missing: counts.embeddingsMissing,
            stale: stale.length,
            dry_run: dryRun,
        },
        "Corpus migration done",
    );

    if (stale.length > 0) {
        const listed = stale.slice(0, 10).join(", ");
        const more = stale.length > 10 ? ` (+${stale.length - 10} more)` : "";

        throw new Error(
            `${stale.length} sidecar(s) were stale before the migration: ${listed}${more}; run generate-sidecars --force on them, then generate-embeddings`,
        );
    }
}

async function migrateDocument({ absolutePath, sourceFile, rootTitle, raw, body, dryRun, counts, stale }) {
    const sidecarPath = `${absolutePath}.yaml`;
    const existing = await readSidecar(sidecarPath);

    if (!existing?.manifest) {
        counts.missing += 1;
        logger.warn({ file: sourceFile }, "Sidecar missing");
        return;
    }

    if (existing.manifest.schema_version === SIDECAR_SCHEMA_VERSION) {
        counts.already += 1;
        logger.info({ file: sourceFile }, "Sidecar already migrated");
        return;
    }

    if (existing.manifest.schema_version !== LEGACY_SCHEMA_VERSION) {
        stale.push(`${sourceFile}.yaml`);
        logger.warn(
            { file: sourceFile, schema_version: existing.manifest.schema_version },
            "Unknown schema_version; sidecar left untouched",
        );
        return;
    }

    // A schema 1 sidecar records the hash of the whole file. When it no longer
    // matches, the chunks were already outdated before the migration, and only
    // a re-chunk can fix them.
    if (existing.manifest.source_file_hash !== rawFileHash(raw)) {
        stale.push(`${sourceFile}.yaml`);
        logger.warn({ file: sourceFile }, "Sidecar is stale; run generate-sidecars --force first");
        return;
    }

    if (!Array.isArray(existing.chunks)) {
        stale.push(`${sourceFile}.yaml`);
        logger.warn({ file: sourceFile }, "Sidecar has no chunks list");
        return;
    }

    const embeddings = await migrateEmbeddings({
        absolutePath,
        sourceFile,
        manifest: existing.manifest,
        chunks: existing.chunks,
        dryRun,
        counts,
    });

    const manifest = migratedManifest(existing.manifest, {
        sourceFile,
        contentHash: contentHashOf(rootTitle, body),
    });

    if (!dryRun) {
        await writeSidecarFile(sidecarPath, { manifest, chunks: existing.chunks });
    }

    counts.migrated += 1;
    logger.info({ file: sourceFile, embeddings }, dryRun ? "Sidecar would be migrated" : "Sidecar migrated");
}

async function migrateEmbeddings({ absolutePath, sourceFile, manifest, chunks, dryRun, counts }) {
    if (typeof manifest.embedding_file !== "string" || !manifest.embedding_file) {
        counts.embeddingsMissing += 1;
        return "missing";
    }

    const binaryPath = join(dirname(absolutePath), manifest.embedding_file);
    let buffer;

    try {
        buffer = await readFile(binaryPath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        counts.embeddingsMissing += 1;
        logger.warn({ file: sourceFile, embeddings: manifest.embedding_file }, "Embeddings file missing");
        return "missing";
    }

    const { header, payload } = splitEmbeddingsFile(buffer);

    if (header.format_version === EMBEDDINGS_FORMAT_VERSION) {
        counts.embeddingsAlready += 1;
        return "already";
    }

    if (header.format_version !== LEGACY_FORMAT_VERSION) {
        throw new Error(
            `Embeddings header format_version is ${header.format_version} for ${sourceFile}; expected ${LEGACY_FORMAT_VERSION}`,
        );
    }

    if (header.source_file_hash !== manifest.source_file_hash) {
        throw new Error(
            `Embeddings header does not match the sidecar for ${sourceFile}; run generate-embeddings first`,
        );
    }

    if (header.chunk_count !== chunks.length) {
        throw new Error(
            `Embeddings header has ${header.chunk_count} chunks, but the sidecar has ${chunks.length} for ${sourceFile}`,
        );
    }

    const expectedBytes = header.chunk_count * header.dimension * FLOAT_BYTES;

    if (payload.byteLength !== expectedBytes) {
        throw new Error(
            `Embeddings payload must be ${expectedBytes} bytes for ${sourceFile}, got ${payload.byteLength}`,
        );
    }

    const migratedHeader = migratedEmbeddingsHeader(header, hashEmbeddingInputs(chunks));
    validateHeader(migratedHeader);

    if (!dryRun) {
        const migratedBuffer = Buffer.concat([Buffer.from(`${JSON.stringify(migratedHeader)}\n`, "utf8"), payload]);

        await writeEmbeddingsBuffer(binaryPath, migratedBuffer);
    }

    counts.embeddingsMigrated += 1;
    return "migrated";
}

function rawFileHash(raw) {
    return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

// Object.entries keeps the field order, so the new field lands where the old
// one was and the YAML diff stays readable.
function migratedManifest(manifest, { sourceFile, contentHash }) {
    const migrated = {};

    for (const [key, value] of Object.entries(manifest)) {
        if (key === "source_file_hash") {
            migrated.source_content_hash = contentHash;
        } else if (key === "source_file") {
            migrated.source_file = sourceFile;
        } else if (key === "schema_version") {
            migrated.schema_version = SIDECAR_SCHEMA_VERSION;
        } else {
            migrated[key] = value;
        }
    }

    if (!("source_content_hash" in migrated)) {
        migrated.source_content_hash = contentHash;
    }

    return migrated;
}

function migratedEmbeddingsHeader(header, chunksHash) {
    const migrated = {};

    for (const [key, value] of Object.entries(header)) {
        if (key === "source_file_hash") {
            migrated.source_content_chunks_hash = chunksHash;
        } else if (key === "format_version") {
            migrated.format_version = EMBEDDINGS_FORMAT_VERSION;
        } else {
            migrated[key] = value;
        }
    }

    if (!("source_content_chunks_hash" in migrated)) {
        migrated.source_content_chunks_hash = chunksHash;
    }

    return migrated;
}

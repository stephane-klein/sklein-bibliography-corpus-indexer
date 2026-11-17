import { resolveTarget } from "./context.js";
import { collectCorpusDocuments } from "./corpus-documents.js";
import { MAX_CHUNK_TOKENS, SPLITTER, TOKENIZER, chunkMarkdown } from "./chunking.js";
import { logger } from "./logger.js";
import {
    SIDECAR_SCHEMA_VERSION,
    compareSidecarManifest,
    contentHashOf,
    readSidecar,
    writeSidecarFile,
} from "./sidecar.js";

export async function runGenerateSidecars({ path, contentsDir, dryRun, force }) {
    const context = await resolveTarget({ path, contentsDir, command: "generate-sidecars" });
    const counts = { written: 0, skipped: 0, moved: 0, chunks: 0 };
    const { kind, collection, documents } = await collectCorpusDocuments({ context });

    for (const document of documents) {
        await generateSidecar({ ...document, dryRun, force, counts });
    }

    logger.info(
        {
            path,
            kind,
            collection: collection === "root" ? "both" : collection,
            files: documents.length,
            written: counts.written,
            skipped: counts.skipped,
            moved: counts.moved,
            chunks: counts.chunks,
            dry_run: dryRun,
            forced: force,
        },
        "Sidecar generation done",
    );
}

async function generateSidecar({ absolutePath, sourceFile, rootTitle, body, dryRun, force, counts }) {
    const sidecarPath = `${absolutePath}.yaml`;
    const manifest = {
        type: "manifest",
        schema_version: SIDECAR_SCHEMA_VERSION,
        source_file: sourceFile,
        source_content_hash: contentHashOf(rootTitle, body),
        tokenizer: TOKENIZER,
        max_chunk_tokens: MAX_CHUNK_TOKENS,
        splitter: SPLITTER,
    };
    const existing = await readSidecar(sidecarPath);
    const state = compareSidecarManifest(manifest, existing);

    if (state === "legacy" && !force) {
        throw new Error(
            `${sourceFile}.yaml uses schema_version 1; run migrate-corpus first. --force re-chunks it and drops its embedding fields`,
        );
    }

    if (state === "moved" && !force) {
        await writeMovedSidecar({ sidecarPath, sourceFile, manifest, existing, dryRun, counts });
        return;
    }

    if (state === "unchanged" && !force) {
        counts.skipped += 1;
        logger.info({ file: sourceFile, chunks: existing.manifest.chunk_count }, "Sidecar unchanged");
        return;
    }

    const chunks = chunkMarkdown(body, rootTitle);
    manifest.chunk_count = chunks.length;

    if (dryRun) {
        counts.written += 1;
        counts.chunks += chunks.length;
        logger.info({ file: sourceFile, chunks: chunks.length, forced: force }, "Sidecar would be written");
        return;
    }

    await writeSidecarFile(sidecarPath, { manifest, chunks });
    counts.written += 1;
    counts.chunks += chunks.length;
    logger.info({ file: sourceFile, sidecar: `${sourceFile}.yaml`, chunks: chunks.length }, "Sidecar generated");
}

// A rename changes source_file only. Keep the chunks and the embedding fields:
// the vectors are still valid, so generate-embeddings has nothing to do.
async function writeMovedSidecar({ sidecarPath, sourceFile, manifest, existing, dryRun, counts }) {
    const movedManifest = {
        ...existing.manifest,
        schema_version: SIDECAR_SCHEMA_VERSION,
        source_file: sourceFile,
        source_content_hash: manifest.source_content_hash,
    };

    if (dryRun) {
        counts.moved += 1;
        logger.info({ file: sourceFile, chunks: existing.chunks.length }, "Sidecar path would be updated");
        return;
    }

    await writeSidecarFile(sidecarPath, { manifest: movedManifest, chunks: existing.chunks });
    counts.moved += 1;
    logger.info({ file: sourceFile, sidecar: `${sourceFile}.yaml` }, "Sidecar path updated");
}

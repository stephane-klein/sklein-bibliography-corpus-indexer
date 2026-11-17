import { createHash } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import * as yaml from "js-yaml";
import { logger } from "./logger.js";

export const SIDECAR_SCHEMA_VERSION = 2;
export const LEGACY_SCHEMA_VERSION = 1;

export async function readSidecar(sidecarPath) {
    try {
        const document = yaml.load(await readFile(sidecarPath, "utf8"));

        return document && typeof document === "object" && !Array.isArray(document) ? document : null;
    } catch (error) {
        if (error.code !== "ENOENT") {
            logger.warn({ sidecar: sidecarPath, err: error }, "Could not read existing sidecar");
        }
        return null;
    }
}

// The chunker consumes the breadcrumb title and the body. Hashing those inputs
// instead of the file bytes keeps a frontmatter edit from re-chunking the book.
export function contentHashOf(rootTitle, body) {
    return `sha256:${createHash("sha256").update(`${rootTitle}\n${body}`).digest("hex")}`;
}

// Returns "unchanged" when the chunks are still valid, "moved" when only the
// source path changed, "legacy" for a schema 1 sidecar, and "stale" otherwise.
export function compareSidecarManifest(manifest, existing) {
    const existingManifest = existing?.manifest;

    if (!isObject(existingManifest)) {
        return "stale";
    }

    if (existingManifest.schema_version === LEGACY_SCHEMA_VERSION) {
        return "legacy";
    }

    if (existingManifest.schema_version !== manifest.schema_version) {
        return "stale";
    }

    if (!Array.isArray(existing.chunks) || existingManifest.chunk_count !== existing.chunks.length) {
        return "stale";
    }

    if (
        existingManifest.type !== manifest.type ||
        existingManifest.source_content_hash !== manifest.source_content_hash ||
        existingManifest.tokenizer !== manifest.tokenizer ||
        existingManifest.max_chunk_tokens !== manifest.max_chunk_tokens ||
        existingManifest.splitter !== manifest.splitter
    ) {
        return "stale";
    }

    return existingManifest.source_file === manifest.source_file ? "unchanged" : "moved";
}

function isObject(value) {
    return value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function writeSidecarFile(sidecarPath, document) {
    const content = yaml.dump(document, { lineWidth: -1, noRefs: true, sortKeys: false });
    const temporaryPath = `${sidecarPath}.${process.pid}.tmp`;

    try {
        await writeFile(temporaryPath, content, "utf8");
        await rename(temporaryPath, sidecarPath);
    } finally {
        await unlink(temporaryPath).catch(() => {});
    }
}

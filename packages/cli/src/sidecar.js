import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import * as yaml from "js-yaml";
import { logger } from "./logger.js";

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

export function isUnchangedManifest(manifest, existing) {
    const existingManifest = existing?.manifest;

    return (
        existingManifest !== undefined &&
        typeof existingManifest === "object" &&
        existingManifest !== null &&
        existingManifest.type === manifest.type &&
        existingManifest.schema_version === manifest.schema_version &&
        existingManifest.source_file === manifest.source_file &&
        existingManifest.source_file_hash === manifest.source_file_hash &&
        existingManifest.tokenizer === manifest.tokenizer &&
        existingManifest.max_chunk_tokens === manifest.max_chunk_tokens &&
        existingManifest.splitter === manifest.splitter &&
        typeof existingManifest.chunk_count === "number" &&
        Array.isArray(existing.chunks) &&
        existing.chunks.length === existingManifest.chunk_count
    );
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

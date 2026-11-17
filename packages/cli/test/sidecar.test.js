import assert from "node:assert/strict";
import test from "node:test";

import { SIDECAR_SCHEMA_VERSION, compareSidecarManifest, contentHashOf } from "../src/sidecar.js";

const manifest = {
    type: "manifest",
    schema_version: SIDECAR_SCHEMA_VERSION,
    source_file: "books/test-book/markdown/01-preface.md",
    source_content_hash: contentHashOf("Test Book > Preface", "\n# Preface\n\nHello world.\n"),
    tokenizer: "cl100k_base",
    max_chunk_tokens: 1000,
    splitter: "sentences",
};

const existing = {
    manifest: { ...manifest, chunk_count: 2 },
    chunks: [{ chunk_index: 0 }, { chunk_index: 1 }],
};

test("content hash covers the breadcrumb title", () => {
    assert.equal(contentHashOf("A", "body"), contentHashOf("A", "body"));
    assert.notEqual(contentHashOf("A", "body"), contentHashOf("B", "body"));
});

test("reports an unchanged sidecar", () => {
    assert.equal(compareSidecarManifest(manifest, existing), "unchanged");
});

test("reports a moved sidecar when only the source path changed", () => {
    const moved = { ...manifest, source_file: "books/renamed/markdown/01-preface.md" };

    assert.equal(compareSidecarManifest(moved, existing), "moved");
});

test("reports a legacy sidecar", () => {
    const legacy = { ...existing, manifest: { ...existing.manifest, schema_version: 1 } };

    assert.equal(compareSidecarManifest(manifest, legacy), "legacy");
});

test("reports a stale sidecar when the content hash changed", () => {
    const changed = { ...manifest, source_content_hash: contentHashOf("Test Book > Preface", "Other.") };

    assert.equal(compareSidecarManifest(changed, existing), "stale");
});

test("reports a stale sidecar when the chunk count does not match", () => {
    assert.equal(compareSidecarManifest(manifest, { ...existing, chunks: [{}] }), "stale");
});

test("reports a stale sidecar when it is missing", () => {
    assert.equal(compareSidecarManifest(manifest, null), "stale");
});

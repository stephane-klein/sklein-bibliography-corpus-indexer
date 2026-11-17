import assert from "node:assert/strict";
import test from "node:test";

import { embeddingTextOf, hashEmbeddingInputs } from "../src/embedding-inputs.js";

const chunks = [
    { heading_path: "Book > Chapter", text: "First paragraph." },
    { heading_path: "Book > Chapter", text: "Second paragraph." },
];

test("builds the text sent to the embedding model", () => {
    assert.equal(embeddingTextOf(chunks[0]), "Book > Chapter\n\nFirst paragraph.");
});

test("hashes the embedding inputs in the sha256 format", () => {
    assert.match(hashEmbeddingInputs(chunks), /^sha256:[0-9a-f]{64}$/);
    assert.equal(hashEmbeddingInputs(chunks), hashEmbeddingInputs(chunks));
});

test("changes when a chunk text changes", () => {
    const changed = [chunks[0], { ...chunks[1], text: "Other." }];

    assert.notEqual(hashEmbeddingInputs(chunks), hashEmbeddingInputs(changed));
});

test("changes when the chunk order changes", () => {
    assert.notEqual(hashEmbeddingInputs(chunks), hashEmbeddingInputs([chunks[1], chunks[0]]));
});

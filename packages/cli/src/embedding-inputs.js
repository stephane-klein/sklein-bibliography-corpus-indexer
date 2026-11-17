import { createHash } from "node:crypto";

// The webapp receives one string per chunk. The chunks hash must cover exactly
// those strings, so the binary header can prove the vectors were computed from
// the chunks stored in the sidecar.
export function embeddingTextOf(chunk) {
    return `${chunk.heading_path}\n\n${chunk.text}`;
}

// JSON.stringify keeps the boundaries between inputs. A plain join would let
// two different chunk lists produce the same bytes.
export function hashEmbeddingInputs(chunks) {
    const inputs = chunks.map((chunk) => embeddingTextOf(chunk));

    return `sha256:${createHash("sha256").update(JSON.stringify(inputs)).digest("hex")}`;
}

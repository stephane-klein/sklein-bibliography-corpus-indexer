import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import * as yaml from "js-yaml";

import { hashEmbeddingInputs } from "../src/embedding-inputs.js";
import { splitEmbeddingsFile } from "../src/embeddings-file.js";
import { parseMarkdown } from "../src/markdown.js";
import { runMigrateCorpus } from "../src/migrate-corpus.js";
import { contentHashOf } from "../src/sidecar.js";

const BOOK_ROOT_TITLE = "Test Book > Preface";
const BOOK_BODY = "\n# Preface\n\nHello world.\n";
const VECTOR = [0.5, -0.25];

test("migrates a book sidecar and its header without touching chunks or vectors", async () => {
    await withFixture(async (root) => {
        const fixture = await createBookFixture(root);
        const payloadBefore = payloadHex(await readFile(fixture.binaryPath));

        await runMigrateCorpus({ path: join(root, "contents", "books"), dryRun: false });

        const sidecar = await readDocument(fixture.sidecarPath);
        const { body } = parseMarkdown(fixture.raw);

        assert.equal(sidecar.manifest.schema_version, 2);
        assert.equal(sidecar.manifest.source_content_hash, contentHashOf(BOOK_ROOT_TITLE, body));
        assert.equal(sidecar.manifest.source_file, "books/test-book/markdown/01-preface.md");
        assert.equal(sidecar.manifest.embedding_file, "01-preface.md.embeddings.bin");
        assert.equal("source_file_hash" in sidecar.manifest, false);
        assert.deepEqual(sidecar.chunks, fixture.chunks);

        const buffer = await readFile(fixture.binaryPath);
        const { header } = splitEmbeddingsFile(buffer);

        assert.equal(payloadHex(buffer), payloadBefore);
        assert.equal(header.format_version, 2);
        assert.equal(header.source_content_chunks_hash, hashEmbeddingInputs(fixture.chunks));
        assert.equal("source_file_hash" in header, false);
    });
});

test("keeps the migrated files unchanged on a second run", async () => {
    await withFixture(async (root) => {
        const fixture = await createBookFixture(root);
        const path = join(root, "contents", "books");

        await runMigrateCorpus({ path, dryRun: false });
        const sidecarBytes = await readFile(fixture.sidecarPath);
        const binaryBytes = await readFile(fixture.binaryPath);

        await runMigrateCorpus({ path, dryRun: false });

        assert.deepEqual(await readFile(fixture.sidecarPath), sidecarBytes);
        assert.deepEqual(await readFile(fixture.binaryPath), binaryBytes);
    });
});

test("writes nothing in dry-run mode", async () => {
    await withFixture(async (root) => {
        const fixture = await createBookFixture(root);

        await runMigrateCorpus({ path: join(root, "contents", "books"), dryRun: true });

        assert.equal((await readDocument(fixture.sidecarPath)).manifest.schema_version, 1);
        assert.equal(splitEmbeddingsFile(await readFile(fixture.binaryPath)).header.format_version, 1);
    });
});

test("refuses a schema 1 sidecar whose file hash no longer matches", async () => {
    await withFixture(async (root) => {
        const fixture = await createBookFixture(root);
        await writeFile(fixture.markdownPath, `${fixture.raw}Changed.\n`, "utf8");

        await assert.rejects(() => runMigrateCorpus({ path: join(root, "contents", "books"), dryRun: false }), /stale/);

        assert.equal((await readDocument(fixture.sidecarPath)).manifest.schema_version, 1);
        assert.equal(splitEmbeddingsFile(await readFile(fixture.binaryPath)).header.format_version, 1);
    });
});

test("migrates a single document with the file name as the title fallback", async () => {
    await withFixture(async (root) => {
        const markdownPath = join(root, "contents", "single-document-texts", "2020-01-01_hello.fr.md");
        const body = "\n# Hello\n\nWorld.\n";

        await mkdir(dirname(markdownPath), { recursive: true });

        const fixture = await writeLegacyDocument({
            markdownPath,
            frontmatter: { authors: ["A. Author"], language: "fr" },
            body,
            sourceFile: "single-document-texts/2020-01-01_hello.fr.md",
            rootTitle: "Hello",
        });

        await runMigrateCorpus({ path: join(root, "contents", "single-document-texts"), dryRun: false });

        const sidecar = await readDocument(fixture.sidecarPath);

        assert.equal(sidecar.manifest.schema_version, 2);
        assert.equal(sidecar.manifest.source_content_hash, contentHashOf("Hello", parseMarkdown(fixture.raw).body));
    });
});

async function createBookFixture(root) {
    const bookDir = join(root, "contents", "books", "test-book");
    const markdownDir = join(bookDir, "markdown");
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(bookDir, "config.yaml"), "slug: test-book\ntitle: Test Book\n", "utf8");
    // A wrong toc.yaml proves that the importer ignores it.
    await writeFile(
        join(bookDir, "toc.yaml"),
        yaml.dump({ title: "Ignored toc title", toc: [{ title: "Ignored", path: "01-preface", children: [] }] }),
        "utf8",
    );

    return await writeLegacyDocument({
        markdownPath: join(markdownDir, "01-preface.md"),
        frontmatter: { path: "01-preface", title: "Preface" },
        body: BOOK_BODY,
        sourceFile: "books/test-book/markdown/01-preface.md",
        rootTitle: BOOK_ROOT_TITLE,
    });
}

async function writeLegacyDocument({ markdownPath, frontmatter, body, sourceFile, rootTitle }) {
    const raw = `---\n${yaml.dump(frontmatter)}---\n${body}`;
    const sourceFileHash = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
    const chunks = [{ chunk_index: 0, heading_path: rootTitle, content_token_count: 2, text: "Hello world." }];
    const binaryName = `${basename(markdownPath)}.embeddings.bin`;
    const sidecarPath = `${markdownPath}.yaml`;
    const binaryPath = join(dirname(markdownPath), binaryName);

    await writeFile(markdownPath, raw, "utf8");
    await writeFile(
        sidecarPath,
        yaml.dump(
            {
                manifest: {
                    type: "manifest",
                    schema_version: 1,
                    source_file: sourceFile,
                    source_file_hash: sourceFileHash,
                    tokenizer: "cl100k_base",
                    max_chunk_tokens: 1000,
                    splitter: "sentences",
                    chunk_count: chunks.length,
                    embedding_provider: "voyage",
                    embedding_model: "voyage-4",
                    dimension: VECTOR.length,
                    embedding_file: binaryName,
                    embedding_format: "float32le",
                    embedding_input_format: "heading_path_text_v1",
                    embedding_input_type: "document",
                    embedding_strategy: "standard",
                },
                chunks,
            },
            { lineWidth: -1, noRefs: true, sortKeys: false },
        ),
        "utf8",
    );
    await writeFile(
        binaryPath,
        encodeLegacyEmbeddings({
            header: {
                format: "float32le",
                format_version: 1,
                provider: "voyage",
                model: "voyage-4",
                dimension: VECTOR.length,
                chunk_count: chunks.length,
                source_file_hash: sourceFileHash,
                input_format: "heading_path_text_v1",
                input_type: "document",
                strategy: "standard",
            },
            embeddings: [VECTOR],
        }),
    );

    return { markdownPath, raw, sidecarPath, binaryPath, chunks };
}

function encodeLegacyEmbeddings({ header, embeddings }) {
    const payload = Buffer.alloc(embeddings.length * VECTOR.length * 4);

    embeddings.forEach((vector, vectorIndex) => {
        vector.forEach((value, valueIndex) => {
            payload.writeFloatLE(value, (vectorIndex * VECTOR.length + valueIndex) * 4);
        });
    });

    return Buffer.concat([Buffer.from(`${JSON.stringify(header)}\n`, "utf8"), payload]);
}

function payloadHex(buffer) {
    return splitEmbeddingsFile(buffer).payload.toString("hex");
}

async function readDocument(path) {
    return yaml.load(await readFile(path, "utf8"));
}

async function withFixture(run) {
    const root = await mkdtemp(join(tmpdir(), "migrate-corpus-"));

    try {
        await run(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

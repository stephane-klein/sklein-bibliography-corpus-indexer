import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverBooks, isBookDir, loadBook } from "../src/book-loader.js";

test("discovers book directories and ignores a directory with only a toc.yaml", async () => {
    const root = await mkdtemp(join(tmpdir(), "book-loader-"));

    try {
        const books = join(root, "books");
        const book = join(books, "test-book");
        const tocOnly = join(books, "toc-only");

        await mkdir(join(book, "markdown"), { recursive: true });
        await mkdir(tocOnly, { recursive: true });
        await writeFile(join(book, "config.yaml"), "slug: test-book\ntitle: Test Book\n", "utf8");
        await writeFile(join(tocOnly, "toc.yaml"), "title: Ignored\ntoc: []\n", "utf8");

        assert.equal(await isBookDir(book), true);
        assert.equal(await isBookDir(tocOnly), false);
        assert.deepEqual(await discoverBooks(books), [book]);
        assert.deepEqual(await discoverBooks(book), [book]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("loads the config and parses every Markdown file without reading toc.yaml", async () => {
    const root = await mkdtemp(join(tmpdir(), "book-loader-"));

    try {
        const book = join(root, "test-book");
        const markdown = join(book, "markdown", "01-preface");

        await mkdir(markdown, { recursive: true });
        await writeFile(join(book, "config.yaml"), "slug: test-book\ntitle: Test Book\n", "utf8");
        await writeFile(join(book, "toc.yaml"), "title: Ignored\ntoc: []\n", "utf8");
        await writeFile(
            join(markdown, "01-a.md"),
            "---\nepub_to_markdown_schema: 1\ntitle: A\npath: 01-preface/01-a\nhref: book.xhtml#a\n---\n\nHello.\n",
            "utf8",
        );

        const loaded = await loadBook(book);

        assert.equal(loaded.config.slug, "test-book");
        assert.equal(loaded.config.title, "Test Book");
        assert.equal(loaded.bookDirName, "test-book");
        assert.equal(loaded.files.length, 1);
        assert.equal(loaded.files[0].relativePath, "01-preface/01-a.md");
        assert.equal(loaded.files[0].frontmatter.title, "A");
        assert.equal(loaded.files[0].frontmatter.epub_to_markdown_schema, 1);
        assert.equal(loaded.files[0].body, "\nHello.\n");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

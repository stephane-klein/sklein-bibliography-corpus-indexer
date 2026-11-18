import assert from "node:assert/strict";
import test from "node:test";

import { buildBookTree } from "../src/book-tree.js";

const bibliography = {
    authors: ["A. Author"],
    contributors: ["B. Editor"],
    original_published_date: "1900",
    edition_date: "2000-01-01",
    language: "en",
    source_kind: "epub",
};

const config = {
    slug: "test-book",
    title: "Test Book",
    exclude: ["02-book-i/02-contents.md", "03-empty/01-x.md"],
    bibliography,
};

const schema = { epub_to_markdown_schema: 1 };

function file(relativePath, frontmatter, body) {
    return {
        relativePath,
        raw: Buffer.from(body),
        frontmatter: { ...schema, ...frontmatter },
        body,
    };
}

const files = [
    file("04-part/00-index.md", { path: "04-part", title: "Part" }, "part body"),
    file("02-book-i/00-index.md", { path: "02-book-i", title: "Book I" }, "book body"),
    file("02-book-i/01-chapter-i.md", { path: "02-book-i/01-chapter-i", title: "Chapter I" }, "chapter body"),
    file("01-preface.md", { path: "01-preface", title: "Preface" }, "preface body"),
    file("02-book-i/02-contents.md", { path: "02-book-i/02-contents", title: "Contents" }, "contents body"),
    file("03-empty/01-x.md", { path: "03-empty/01-x", title: "X" }, "x body"),
];

test("builds the work, the directories and the file nodes", () => {
    const nodes = buildBookTree({ config, files });

    assert.deepEqual(
        nodes.map((node) => node.slug),
        [
            "test-book",
            "test-book/01-preface",
            "test-book/02-book-i",
            "test-book/02-book-i/01-chapter-i",
            "test-book/04-part",
        ],
    );
});

test("keeps the work as a structural node and gives each directory its page", () => {
    const [root, preface, part] = buildBookTree({ config, files });

    assert.equal(root.parent_slug, null);
    assert.equal(root.depth, 0);
    assert.equal(root.position, 0);
    assert.equal(root.title, "Test Book");
    assert.equal(root.content, "");
    assert.equal(root.file, null);
    assert.deepEqual(root.metadata.breadcrumb, ["Test Book"]);
    assert.deepEqual(root.metadata.bibliography, bibliography);

    assert.equal(preface.parent_slug, "test-book");
    assert.equal(preface.depth, 1);
    assert.equal(preface.position, 0);
    assert.equal(preface.content, "preface body");
    assert.equal(preface.file.relativePath, "01-preface.md");
    assert.deepEqual(preface.metadata.breadcrumb, ["Test Book", "Preface"]);

    assert.equal(part.slug, "test-book/02-book-i");
    assert.equal(part.parent_slug, "test-book");
    assert.equal(part.depth, 1);
    assert.equal(part.position, 1);
    assert.equal(part.title, "Book I");
    assert.equal(part.content, "book body");
    assert.equal(part.file.relativePath, "02-book-i/00-index.md");
    assert.deepEqual(part.metadata.breadcrumb, ["Test Book", "Book I"]);
});

test("uses 00-index.md as the content of its directory node", () => {
    const part = buildBookTree({ config, files }).find((node) => node.slug === "test-book/04-part");

    assert.equal(part.title, "Part");
    assert.equal(part.content, "part body");
    assert.equal(part.file.relativePath, "04-part/00-index.md");
    assert.deepEqual(part.metadata.breadcrumb, ["Test Book", "Part"]);
});

test("skips excluded files and drops the directories left empty", () => {
    const nodes = buildBookTree({ config, files });

    assert.equal(
        nodes.some((node) => node.slug.endsWith("02-contents")),
        false,
    );
    assert.equal(
        nodes.some((node) => node.slug.endsWith("03-empty")),
        false,
    );
});

test("positions siblings in path order", () => {
    const nodes = buildBookTree({ config, files });
    const preface = nodes.find((node) => node.slug === "test-book/01-preface");
    const part = nodes.find((node) => node.slug === "test-book/02-book-i");
    const lastPart = nodes.find((node) => node.slug === "test-book/04-part");
    const chapter = nodes.find((node) => node.slug === "test-book/02-book-i/01-chapter-i");

    assert.equal(preface.position, 0);
    assert.equal(part.position, 1);
    assert.equal(lastPart.position, 2);
    assert.equal(chapter.parent_slug, "test-book/02-book-i");
    assert.equal(chapter.depth, 2);
    assert.equal(chapter.position, 0);
    assert.deepEqual(chapter.metadata.breadcrumb, ["Test Book", "Book I", "Chapter I"]);
});

test("rejects two files that share a path", () => {
    const duplicateFiles = [
        file("01-preface.md", { path: "01-preface", title: "Preface" }, "preface body"),
        file("01-preface-copy.md", { path: "01-preface", title: "Preface again" }, "copy body"),
    ];

    assert.throws(
        () => buildBookTree({ config, files: duplicateFiles }),
        /duplicate path "01-preface" in 01-preface\.md and 01-preface-copy\.md/,
    );
});

test("rejects a directory without 00-index.md", () => {
    const orphanFiles = [
        file("02-book-i/01-chapter-i.md", { path: "02-book-i/01-chapter-i", title: "Chapter I" }, "chapter body"),
    ];

    assert.throws(
        () => buildBookTree({ config, files: orphanFiles }),
        /missing 00-index\.md for "02-book-i" in 02-book-i\/01-chapter-i\.md/,
    );
});

test("requires a title in config.yaml", () => {
    assert.throws(
        () => buildBookTree({ config: { slug: "test-book" }, files: [] }),
        /config\.yaml must define a title/,
    );
});

test("rejects a legacy schema 0 corpus", () => {
    const legacyFiles = [
        file("01-preface.md", { path: "01-preface", title: "Preface", epub_to_markdown_schema: 0 }, "body"),
    ];

    assert.throws(
        () => buildBookTree({ config, files: legacyFiles }),
        /Markdown schema is 0, expected 1; run "epub-to-markdown migrate"/,
    );
});

test("rejects a mixed schema corpus", () => {
    const mixedFiles = [
        file("01-preface.md", { path: "01-preface", title: "Preface" }, "body"),
        file("02-book-i/00-index.md", { path: "02-book-i", title: "Book I", epub_to_markdown_schema: 2 }, "body"),
        file("02-book-i/01-chapter-i.md", { path: "02-book-i/01-chapter-i", title: "Chapter I" }, "body"),
    ];

    assert.throws(() => buildBookTree({ config, files: mixedFiles }), /mixed Markdown schema versions \(1, 2\)/);
});

test("rejects a schema newer than the importer", () => {
    const newerFiles = [
        file("01-preface.md", { path: "01-preface", title: "Preface", epub_to_markdown_schema: 2 }, "body"),
    ];

    assert.throws(() => buildBookTree({ config, files: newerFiles }), /this importer supports 1; upgrade the importer/);
});

test("rejects a path that escapes the markdown directory", () => {
    const invalidFiles = [file("01-preface.md", { path: "../01-preface", title: "Preface" }, "preface body")];

    assert.throws(
        () => buildBookTree({ config, files: invalidFiles }),
        /invalid path in 01-preface\.md: "\.\.\/01-preface"/,
    );
});

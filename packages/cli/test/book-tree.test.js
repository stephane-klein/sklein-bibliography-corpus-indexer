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

function file(relativePath, frontmatter, body) {
    return {
        relativePath,
        raw: Buffer.from(body),
        frontmatter,
        body,
    };
}

const files = [
    file("04-part/00-index.md", { path: "04-part", title: "Part" }, "part body"),
    file(
        "02-book-i/01-chapter-i.md",
        { path: "02-book-i/01-chapter-i", title: "Chapter I", ancestors: ["Book I"] },
        "chapter body",
    ),
    file("01-preface.md", { path: "01-preface", title: "Preface" }, "preface body"),
    file(
        "02-book-i/02-contents.md",
        { path: "02-book-i/02-contents", title: "Contents", ancestors: ["Book I"] },
        "contents body",
    ),
    file("03-empty/01-x.md", { path: "03-empty/01-x", title: "X", ancestors: ["Empty"] }, "x body"),
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

test("keeps the work and the directories as structural nodes", () => {
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
    assert.equal(part.content, "");
    assert.equal(part.file, null);
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

test("rejects conflicting titles for the same directory", () => {
    const conflictingFiles = [
        file(
            "02-book-i/01-chapter-i.md",
            { path: "02-book-i/01-chapter-i", title: "Chapter I", ancestors: ["Book I"] },
            "chapter body",
        ),
        file(
            "02-book-i/02-chapter-ii.md",
            { path: "02-book-i/02-chapter-ii", title: "Chapter II", ancestors: ["Book One"] },
            "chapter body",
        ),
    ];

    assert.throws(
        () => buildBookTree({ config, files: conflictingFiles }),
        /conflicting ancestor titles for "02-book-i": "Book I" and "Book One"/,
    );
});

test("rejects a directory whose title no ancestor provides", () => {
    const orphanFiles = [
        file("02-book-i/01-chapter-i.md", { path: "02-book-i/01-chapter-i", title: "Chapter I" }, "chapter body"),
    ];

    assert.throws(
        () => buildBookTree({ config, files: orphanFiles }),
        /cannot resolve the title of "02-book-i" for 02-book-i\/01-chapter-i\.md/,
    );
});

test("rejects a directory page whose title conflicts with its descendants", () => {
    const conflictingFiles = [
        file("04-part/00-index.md", { path: "04-part", title: "Part" }, "part body"),
        file(
            "04-part/01-chapter.md",
            { path: "04-part/01-chapter", title: "Chapter", ancestors: ["Another part"] },
            "chapter body",
        ),
    ];

    assert.throws(
        () => buildBookTree({ config, files: conflictingFiles }),
        /conflicting titles for "04-part": "Another part" in its descendants and "Part" in 04-part\/00-index\.md/,
    );
});

test("requires a title in config.yaml", () => {
    assert.throws(
        () => buildBookTree({ config: { slug: "test-book" }, files: [] }),
        /config\.yaml must define a title/,
    );
});

test("rejects an ancestors value that is not a list", () => {
    const invalidFiles = [
        file(
            "02-book-i/01-chapter-i.md",
            { path: "02-book-i/01-chapter-i", title: "Chapter I", ancestors: "Book I" },
            "chapter body",
        ),
    ];

    assert.throws(
        () => buildBookTree({ config, files: invalidFiles }),
        /frontmatter ancestors must be a list in 02-book-i\/01-chapter-i\.md/,
    );
});

test("rejects a path that escapes the markdown directory", () => {
    const invalidFiles = [file("01-preface.md", { path: "../01-preface", title: "Preface" }, "preface body")];

    assert.throws(
        () => buildBookTree({ config, files: invalidFiles }),
        /invalid path in 01-preface\.md: "\.\.\/01-preface"/,
    );
});

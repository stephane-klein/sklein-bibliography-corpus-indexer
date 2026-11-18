import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { discoverBooks, isBookDir, loadBook } from "./book-loader.js";
import { buildBookTree } from "./book-tree.js";
import { assertDirectory, collectionRoot, isInside } from "./context.js";
import { logger } from "./logger.js";
import { parseMarkdown, titleOf } from "./markdown.js";

// Lists every Markdown document the sidecar commands must process. Each entry
// carries the chunking title, so the content hash and the chunks always agree.
export async function collectCorpusDocuments({ context }) {
    const runs = await collectionsFor(context);
    const documents = [];

    for (const run of runs) {
        documents.push(
            ...(run.collection === "book"
                ? await bookDocuments({ ...run, contentsDir: context.contentsDir })
                : await singleDocumentDocuments({ ...run, contentsDir: context.contentsDir })),
        );
    }

    return { kind: kindOf(context), collection: context.collection, documents };
}

async function collectionsFor(context) {
    if (context.collection === "root") {
        const runs = [
            {
                collection: "single-document",
                target: collectionRoot(context.contentsDir, "single-document"),
                isDirectory: true,
            },
            {
                collection: "book",
                target: collectionRoot(context.contentsDir, "book"),
                isDirectory: true,
            },
        ];

        await Promise.all(runs.map((run) => assertDirectory(run.target)));

        return runs;
    }

    return [{ collection: context.collection, target: context.target, isDirectory: context.isDirectory }];
}

function kindOf(context) {
    if (context.collection === "root") {
        return "contents";
    }

    return context.isDirectory ? "directory" : "file";
}

async function singleDocumentDocuments({ target, isDirectory, contentsDir }) {
    const directoryRoot = isDirectory ? target : dirname(target);
    const fileNames = isDirectory
        ? (await readdir(directoryRoot, { recursive: true }))
              .filter((fileName) => fileName.endsWith(".md") && !fileName.endsWith(".dialogue.md"))
              .sort()
        : [basename(target)];

    if (fileNames.length === 0) {
        throw new Error("No Markdown files found");
    }

    logger.info(
        { path: target, kind: isDirectory ? "directory" : "file", files: fileNames.length },
        "Found Markdown files",
    );

    return await Promise.all(
        fileNames.map(async (fileName) => {
            const absolutePath = join(directoryRoot, fileName);
            const raw = await readFile(absolutePath);
            const { frontmatter, body } = parseMarkdown(raw.toString("utf8"));

            return {
                absolutePath,
                sourceFile: relative(contentsDir, absolutePath).split(sep).join("/"),
                rootTitle: titleOf(frontmatter, body, basename(absolutePath, ".md")),
                raw,
                body,
            };
        }),
    );
}

async function bookDocuments({ target, isDirectory, contentsDir }) {
    const booksRoot = collectionRoot(contentsDir, "book");
    const bookDirs = await resolveBookDirs({ target, isDirectory, booksRoot });
    const documents = [];

    for (const bookDir of bookDirs) {
        const { config, files, bookDirName } = await loadBook(bookDir);
        const nodes = buildBookTree({ config, files });
        const fileNodes = nodes.filter((node) => node.file);
        const targetedNodes = fileNodes.filter((node) =>
            isTargeted({ target, isDirectory, absolutePath: join(bookDir, "markdown", node.file.relativePath) }),
        );

        if (targetedNodes.length === 0) {
            logger.warn({ book: relative(contentsDir, bookDir) }, "No Markdown files to process in this book");
            continue;
        }

        logger.info(
            {
                book: relative(contentsDir, bookDir),
                files: targetedNodes.length,
            },
            "Found book Markdown files",
        );

        for (const node of targetedNodes) {
            documents.push({
                absolutePath: join(bookDir, "markdown", node.file.relativePath),
                sourceFile: `books/${bookDirName}/markdown/${node.file.relativePath}`,
                rootTitle: node.metadata.breadcrumb.join(" > "),
                raw: node.file.raw,
                body: node.file.body,
            });
        }
    }

    if (documents.length === 0) {
        throw new Error("No Markdown files found");
    }

    return documents;
}

async function resolveBookDirs({ target, isDirectory, booksRoot }) {
    const start = isDirectory ? target : dirname(target);
    const bookDir = await findBookDir(start, booksRoot);

    if (bookDir !== null) {
        return [bookDir];
    }

    if (!isDirectory) {
        throw new Error("File is not inside a book directory with a config.yaml and a markdown/ directory");
    }

    return await discoverBooks(target);
}

async function findBookDir(target, booksRoot) {
    let current = target;

    while (isInside(booksRoot, current)) {
        if (await isBookDir(current)) {
            return current;
        }

        const parent = dirname(current);

        if (parent === current) {
            break;
        }

        current = parent;
    }

    return null;
}

function isTargeted({ target, isDirectory, absolutePath }) {
    if (!isDirectory) {
        return absolutePath === target;
    }

    return absolutePath === target || absolutePath.startsWith(`${target}${sep}`);
}

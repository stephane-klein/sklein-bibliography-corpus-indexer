import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { discoverBooks, loadBook, pathExists } from "./book-loader.js";
import { buildBookTree } from "./book-tree.js";
import { MAX_CHUNK_TOKENS, SPLITTER, TOKENIZER, chunkMarkdown } from "./chunking.js";
import { assertDirectory, collectionRoot, isInside, resolveTarget } from "./context.js";
import { logger } from "./logger.js";
import { parseMarkdown, titleOf } from "./markdown.js";
import { isUnchangedManifest, readSidecar, writeSidecarFile } from "./sidecar.js";

const SCHEMA_VERSION = 1;

export async function runGenerateSidecars({ path, contentsDir, dryRun, force }) {
    const context = await resolveTarget({ path, contentsDir, command: "generate-sidecars" });
    const counts = { written: 0, skipped: 0, chunks: 0 };
    const runs = await collectionsFor(context);

    for (const run of runs) {
        if (run.collection === "book") {
            await generateBookSidecars({ ...run, contentsDir: context.contentsDir, dryRun, force, counts });
        } else {
            await generateSingleDocumentSidecars({ ...run, contentsDir: context.contentsDir, dryRun, force, counts });
        }
    }

    logger.info(
        {
            path,
            kind: kindOf(context),
            collection: context.collection === "root" ? "both" : context.collection,
            files: counts.written + counts.skipped,
            written: counts.written,
            skipped: counts.skipped,
            chunks: counts.chunks,
            dry_run: dryRun,
            forced: force,
        },
        "Sidecar generation done",
    );
}

async function collectionsFor(context) {
    if (context.collection === "root") {
        const runs = [
            {
                collection: "single-document",
                target: collectionRoot(context.contentsDir, "single-document"),
                isDirectory: true,
            },
            { collection: "book", target: collectionRoot(context.contentsDir, "book"), isDirectory: true },
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

async function generateSingleDocumentSidecars({ target, isDirectory, contentsDir, dryRun, force, counts }) {
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

    for (const fileName of fileNames) {
        const absolutePath = join(directoryRoot, fileName);
        const sourceFile = relative(contentsDir, absolutePath).split(sep).join("/");
        const raw = await readFile(absolutePath);
        const { frontmatter, body } = parseMarkdown(raw.toString("utf8"));
        const rootTitle = titleOf(frontmatter, body, basename(absolutePath, ".md"));

        await generateSidecar({ absolutePath, sourceFile, rootTitle, raw, body, dryRun, force, counts });
    }
}

async function generateBookSidecars({ target, isDirectory, contentsDir, dryRun, force, counts }) {
    const booksRoot = collectionRoot(contentsDir, "book");
    const bookDirs = await resolveBookDirs({ target, isDirectory, booksRoot });
    let processedFiles = 0;

    for (const bookDir of bookDirs) {
        const { config, toc, filesByPath, bookDirName } = await loadBook(bookDir);
        const nodes = buildBookTree({ toc, config, filesByPath });
        const fileNodes = nodes.filter((node) => node.file);
        const targetedNodes = fileNodes.filter((node) =>
            isTargeted({ target, isDirectory, absolutePath: join(bookDir, "markdown", node.file.relativePath) }),
        );

        warnAboutOrphanFiles({ bookDirName, config, filesByPath, fileNodes });

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
            const absolutePath = join(bookDir, "markdown", node.file.relativePath);
            const sourceFile = `books/${bookDirName}/markdown/${node.file.relativePath}`;
            const rootTitle = node.metadata.breadcrumb.join(" > ");

            await generateSidecar({
                absolutePath,
                sourceFile,
                rootTitle,
                raw: node.file.raw,
                body: node.file.body,
                dryRun,
                force,
                counts,
            });
            processedFiles += 1;
        }
    }

    if (processedFiles === 0) {
        throw new Error("No Markdown files found");
    }
}

async function generateSidecar({ absolutePath, sourceFile, rootTitle, raw, body, dryRun, force, counts }) {
    const sidecarPath = `${absolutePath}.yaml`;
    const manifest = {
        type: "manifest",
        schema_version: SCHEMA_VERSION,
        source_file: sourceFile,
        source_file_hash: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
        tokenizer: TOKENIZER,
        max_chunk_tokens: MAX_CHUNK_TOKENS,
        splitter: SPLITTER,
    };
    const existing = force ? null : await readSidecar(sidecarPath);

    if (isUnchangedManifest(manifest, existing)) {
        counts.skipped += 1;
        logger.info({ file: sourceFile, chunks: existing.manifest.chunk_count }, "Sidecar unchanged");
        return;
    }

    const chunks = chunkMarkdown(body, rootTitle);
    manifest.chunk_count = chunks.length;

    if (dryRun) {
        counts.written += 1;
        counts.chunks += chunks.length;
        logger.info({ file: sourceFile, chunks: chunks.length, forced: force }, "Sidecar would be written");
        return;
    }

    await writeSidecarFile(sidecarPath, { manifest, chunks });
    counts.written += 1;
    counts.chunks += chunks.length;
    logger.info({ file: sourceFile, sidecar: `${sourceFile}.yaml`, chunks: chunks.length }, "Sidecar generated");
}

async function resolveBookDirs({ target, isDirectory, booksRoot }) {
    const start = isDirectory ? target : dirname(target);
    const bookDir = await findBookDir(start, booksRoot);

    if (bookDir !== null) {
        return [bookDir];
    }

    if (!isDirectory) {
        throw new Error("File is not inside a book directory with a toc.yaml");
    }

    return await discoverBooks(target);
}

async function findBookDir(target, booksRoot) {
    let current = target;

    while (isInside(booksRoot, current)) {
        if (await pathExists(join(current, "toc.yaml"))) {
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

function warnAboutOrphanFiles({ bookDirName, config, filesByPath, fileNodes }) {
    const knownFiles = new Set(fileNodes.map((node) => node.file.relativePath));
    const excludedFiles = new Set();

    for (const entry of config.exclude ?? []) {
        excludedFiles.add(entry.endsWith(".md") ? entry : `${entry}.md`);

        const file = filesByPath.get(entry) ?? filesByPath.get(entry.replace(/\.md$/, ""));

        if (file) {
            excludedFiles.add(file.relativePath);
        }
    }

    for (const file of filesByPath.values()) {
        if (knownFiles.has(file.relativePath) || excludedFiles.has(file.relativePath)) {
            continue;
        }

        logger.warn(
            { file: `books/${bookDirName}/markdown/${file.relativePath}` },
            "Markdown file is not part of the book tree",
        );
    }
}

function isTargeted({ target, isDirectory, absolutePath }) {
    if (!isDirectory) {
        return absolutePath === target;
    }

    return absolutePath === target || absolutePath.startsWith(`${target}${sep}`);
}

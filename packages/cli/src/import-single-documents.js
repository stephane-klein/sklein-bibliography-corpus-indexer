import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { createApiClient, resolveApiOptions } from "./api-client.js";
import { collectionRoot, resolveTarget } from "./context.js";
import { buildChunkSyncPayload, hasEmbeddingSidecar, readEmbeddingSidecar } from "./embedding-import.js";
import { logger } from "./logger.js";
import {
    normalizeAuthors,
    normalizeLanguage,
    normalizeOriginalPublishedDate,
    normalizeSourceUrl,
    parseMarkdown,
    titleOf,
} from "./markdown.js";

export async function runImportSingleDocuments({
    path,
    contentsDir,
    url,
    token,
    dryRun,
    prune,
    skipEmbeddings,
    requireEmbeddings,
}) {
    const context = await resolveTarget({ path, contentsDir, command: "import-single-documents" });
    const target =
        context.collection === "root" ? collectionRoot(context.contentsDir, "single-document") : context.target;
    const targetStat = await stat(target).catch(() => null);

    if (!targetStat) {
        throw new Error(`Import path does not exist: ${target}`);
    }

    const isDirectory = targetStat.isDirectory();

    if (!isDirectory && !targetStat.isFile()) {
        throw new Error("Import path must be a Markdown file or a directory");
    }

    if (!isDirectory && (!target.endsWith(".md") || target.endsWith(".dialogue.md"))) {
        throw new Error("Import file must be a Markdown file, excluding *.dialogue.md");
    }

    if (!isDirectory && prune) {
        throw new Error("--prune can only be used with a directory");
    }

    if (skipEmbeddings && requireEmbeddings) {
        throw new Error("--skip-embeddings and --require-embeddings are mutually exclusive");
    }

    const api = createApiClient(resolveApiOptions({ url, token }));
    const relativeImportTarget = relative(context.contentsDir, target);
    const firstSegment = relativeImportTarget.split(sep)[0];
    const slugBase =
        firstSegment && (isDirectory || relativeImportTarget.includes(sep))
            ? join(context.contentsDir, firstSegment)
            : context.contentsDir;
    const directoryRoot = isDirectory ? target : dirname(target);
    const fileNames = isDirectory
        ? (await readdir(directoryRoot, { recursive: true }))
              .filter((fileName) => fileName.endsWith(".md") && !fileName.endsWith(".dialogue.md"))
              .sort()
        : [basename(target)];
    const relativeImportTargetPosix = relativeImportTarget.split(sep).join("/");
    const importPrefix = relativeImportTargetPosix ? relativeImportTargetPosix + "/" : "";

    if (prune && importPrefix === "") {
        throw new Error("--prune requires a directory inside contents/, not contents/ itself");
    }

    if (prune && fileNames.length === 0) {
        throw new Error("Refusing to prune with an empty file list");
    }

    const documents = await Promise.all(
        fileNames.map(async (fileName) => {
            const absolutePath = join(directoryRoot, fileName);
            const raw = await readFile(absolutePath);
            const { frontmatter, body } = parseMarkdown(raw.toString("utf8"));
            const relativeToSlugBase = relative(slugBase, absolutePath).split(sep).join("/");
            const relativeToContents = relative(context.contentsDir, absolutePath).split(sep).join("/");
            const slug = relativeToSlugBase.replace(/\.(?:fr\.)?md$/, "");

            return {
                slug,
                title: titleOf(frontmatter, body, slug),
                content: body,
                sourceUrl: normalizeSourceUrl(frontmatter.source_url),
                authors: normalizeAuthors(frontmatter.authors),
                originalPublishedDate: normalizeOriginalPublishedDate(frontmatter.original_published_date),
                language: normalizeLanguage(frontmatter.language, fileName),
                markdownSourceFile: relativeToContents,
                markdownSourceFileHash: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
                // Rough estimate: four characters per token, frontmatter excluded.
                markdownSourceFileEstimateTokenCount: Math.ceil(body.length / 4),
                metadata: frontmatter,
            };
        }),
    );

    logger.info({ path, kind: isDirectory ? "directory" : "file", files: documents.length }, "Parsed Markdown files");

    const counts = {
        inserted: 0,
        updated: 0,
        unchanged: 0,
        deleted: 0,
        embeddingsImported: 0,
        embeddingsUnchanged: 0,
        embeddingsMissing: 0,
        chunks: 0,
    };

    for (const document of documents) {
        const action = await syncDocument({ api, document, dryRun });
        counts[action] += 1;
        let embeddingResult = { status: "skipped", inserted: 0, chunks: 0 };

        if (!skipEmbeddings) {
            embeddingResult = await syncEmbeddings({
                api,
                document,
                contentsDir: context.contentsDir,
                dryRun,
                requireEmbeddings,
            });

            if (embeddingResult.status === "imported") {
                counts.embeddingsImported += 1;
                counts.chunks += embeddingResult.inserted;
            } else if (embeddingResult.status === "unchanged") {
                counts.embeddingsUnchanged += 1;
            } else if (embeddingResult.status === "missing") {
                counts.embeddingsMissing += 1;
            }
        }

        logger.info(
            {
                file: document.markdownSourceFile,
                action,
                embeddings: embeddingResult.status,
                chunks: embeddingResult.chunks,
            },
            "Imported",
        );
    }

    if (prune) {
        const result = await pruneContent({ api, documents, importPrefix, dryRun });
        counts.deleted = result.deleted;
        logger.info({ deleted: result.deleted, deleted_paths: result.deleted_paths }, "Pruned");
    }

    let reindex = null;

    if (!dryRun && counts.inserted + counts.updated + counts.deleted > 0) {
        try {
            reindex = await reindexIndex(api);
            logger.info({ ...reindex }, "BM25 index reindexed");
        } catch (error) {
            logger.warn(
                { err: error },
                "BM25 index reindex failed; search stays slow until REINDEX INDEX CONCURRENTLY idx_hierarchical_content_nodes_bm25 succeeds",
            );
        }
    }

    logger.info(
        {
            path,
            kind: isDirectory ? "directory" : "file",
            files: documents.length,
            inserted: counts.inserted,
            updated: counts.updated,
            unchanged: counts.unchanged,
            deleted: counts.deleted,
            embeddings_imported: counts.embeddingsImported,
            embeddings_unchanged: counts.embeddingsUnchanged,
            embeddings_missing: counts.embeddingsMissing,
            chunks: counts.chunks,
            reindexed: reindex !== null,
        },
        "Content import done",
    );
}

async function syncDocument({ api, document, dryRun }) {
    const result = await sendSyncRequest(api, "/api/v1/admin/hierarchical-content-nodes/sync", {
        upsert: [toApiDocument(document)],
        dry_run: dryRun,
    });

    return result.items[0].action;
}

async function syncEmbeddings({ api, document, contentsDir, dryRun, requireEmbeddings }) {
    const sourcePath = join(contentsDir, document.markdownSourceFile);

    if (!(await hasEmbeddingSidecar(sourcePath))) {
        if (requireEmbeddings) {
            throw new Error(
                `Embeddings sidecar is missing for ${document.markdownSourceFile}; run generate-sidecars and generate-embeddings first`,
            );
        }

        return { status: "missing", inserted: 0, chunks: 0 };
    }

    const { manifest, chunks, embeddings } = await readEmbeddingSidecar(
        sourcePath,
        document.markdownSourceFile,
        document.markdownSourceFileHash,
    );
    const result = await sendSyncRequest(
        api,
        "/api/v1/admin/hierarchical-content-chunks/sync",
        buildChunkSyncPayload({ manifest, chunks, embeddings, dryRun }),
    );

    return { status: result.unchanged ? "unchanged" : "imported", ...result };
}

async function pruneContent({ api, documents, importPrefix, dryRun }) {
    return await sendSyncRequest(api, "/api/v1/admin/hierarchical-content-nodes/sync", {
        prune: {
            scope: importPrefix,
            keep: documents.map((document) => document.markdownSourceFile),
        },
        dry_run: dryRun,
    });
}

async function sendSyncRequest(api, path, payload) {
    return await api.put(path, payload);
}

async function reindexIndex(api) {
    return await api.post("/api/v1/admin/hierarchical-content-nodes/reindex");
}

function toApiDocument(document) {
    return {
        slug: document.slug,
        title: document.title,
        content: document.content,
        source_url: document.sourceUrl,
        authors: document.authors,
        original_published_date: document.originalPublishedDate,
        language: document.language,
        markdown_source_file: document.markdownSourceFile,
        markdown_source_file_hash: document.markdownSourceFileHash,
        markdown_source_file_estimate_token_count: document.markdownSourceFileEstimateTokenCount,
        metadata: document.metadata,
    };
}

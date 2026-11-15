import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createApiClient, resolveApiOptions } from "./api-client.js";
import { discoverBooks, loadBook } from "./book-loader.js";
import { buildBookTree } from "./book-tree.js";
import { collectionRoot, resolveTarget } from "./context.js";
import { buildChunkSyncPayload, hasEmbeddingSidecar, readEmbeddingSidecar } from "./embedding-import.js";
import { logger } from "./logger.js";
import { normalizeAuthors, normalizeOriginalPublishedDate } from "./markdown.js";

const MAX_UPSERT_ITEMS = 500;

export async function runImportBooks({
    path,
    contentsDir,
    url,
    token,
    dryRun,
    prune,
    skipEmbeddings,
    requireEmbeddings,
}) {
    const context = await resolveTarget({ path, contentsDir, command: "import-books" });
    const target = context.collection === "root" ? collectionRoot(context.contentsDir, "book") : context.target;
    const targetStat = await stat(target).catch(() => null);

    if (!targetStat?.isDirectory()) {
        throw new Error("Import path must be a book directory");
    }

    if (skipEmbeddings && requireEmbeddings) {
        throw new Error("--skip-embeddings and --require-embeddings are mutually exclusive");
    }

    const api = createApiClient(resolveApiOptions({ url, token }));
    const books = await discoverBooks(target);
    const relativeTarget = relative(process.cwd(), target);

    logger.info({ path: relativeTarget, books: books.length }, "Discovered books");

    const counts = {
        books: 0,
        nodes: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        deleted: 0,
        embeddingsImported: 0,
        embeddingsUnchanged: 0,
        embeddingsMissing: 0,
        chunks: 0,
    };

    for (const bookDir of books) {
        const { config, nodes, result, embeddings } = await importBook({
            api,
            bookDir,
            dryRun,
            prune,
            skipEmbeddings,
            requireEmbeddings,
        });

        counts.books += 1;
        counts.nodes += nodes.length;
        counts.inserted += result.inserted;
        counts.updated += result.updated;
        counts.unchanged += result.unchanged;
        counts.deleted += result.deleted;
        counts.embeddingsImported += embeddings.imported;
        counts.embeddingsUnchanged += embeddings.unchanged;
        counts.embeddingsMissing += embeddings.missing;
        counts.chunks += embeddings.chunks;

        logger.info(
            {
                book: relative(process.cwd(), bookDir),
                slug: config.slug,
                nodes: nodes.length,
                inserted: result.inserted,
                updated: result.updated,
                unchanged: result.unchanged,
                deleted: result.deleted,
                deleted_slugs: result.deleted_slugs,
                embeddings_imported: embeddings.imported,
                embeddings_unchanged: embeddings.unchanged,
                embeddings_missing: embeddings.missing,
                chunks: embeddings.chunks,
            },
            "Imported book",
        );
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
            path: relativeTarget,
            books: counts.books,
            nodes: counts.nodes,
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
        "Book import done",
    );
}

async function importBook({ api, bookDir, dryRun, prune, skipEmbeddings, requireEmbeddings }) {
    const { config, toc, filesByPath, bookDirName } = await loadBook(bookDir);
    const nodes = buildBookTree({ toc, config, filesByPath });

    if (nodes.length > MAX_UPSERT_ITEMS) {
        throw new Error(
            `Book ${config.slug} has ${nodes.length} nodes, more than the ${MAX_UPSERT_ITEMS} accepted in one sync request`,
        );
    }

    const payload = {
        upsert: nodes.map((node) => toApiDocument({ node, config, bookDirName })),
        dry_run: dryRun,
    };

    if (prune) {
        payload.prune = {
            scope_slug: config.slug,
            keep_slugs: nodes.map((node) => node.slug),
        };
    }

    const result = await sendSyncRequest(api, "/api/v1/admin/hierarchical-content-nodes/sync", payload);
    const embeddings = await importBookEmbeddings({
        api,
        nodes,
        bookDir,
        bookDirName,
        dryRun,
        skipEmbeddings,
        requireEmbeddings,
    });

    return { config, nodes, result, embeddings };
}

async function importBookEmbeddings({ api, nodes, bookDir, bookDirName, dryRun, skipEmbeddings, requireEmbeddings }) {
    const counts = { imported: 0, unchanged: 0, missing: 0, chunks: 0 };

    if (skipEmbeddings) {
        return counts;
    }

    for (const node of nodes.filter((node) => node.file)) {
        const sourceFile = `books/${bookDirName}/markdown/${node.file.relativePath}`;
        const absolutePath = join(bookDir, "markdown", node.file.relativePath);

        if (!(await hasEmbeddingSidecar(absolutePath))) {
            if (requireEmbeddings) {
                throw new Error(
                    `Embeddings sidecar is missing for ${sourceFile}; run generate-sidecars and generate-embeddings first`,
                );
            }

            counts.missing += 1;
            logger.warn({ file: sourceFile }, "Embeddings sidecar missing");
            continue;
        }

        const sourceFileHash = `sha256:${createHash("sha256").update(node.file.raw).digest("hex")}`;
        const { manifest, chunks, embeddings } = await readEmbeddingSidecar(absolutePath, sourceFile, sourceFileHash);

        if (dryRun) {
            counts.imported += 1;
            counts.chunks += chunks.length;
            logger.info({ file: sourceFile, chunks: chunks.length }, "Book chunks would be imported");
            continue;
        }

        const result = await sendSyncRequest(
            api,
            "/api/v1/admin/hierarchical-content-chunks/sync",
            buildChunkSyncPayload({ manifest, chunks, embeddings, dryRun: false }),
        );

        if (result.unchanged) {
            counts.unchanged += 1;
        } else {
            counts.imported += 1;
            counts.chunks += result.inserted;
        }

        logger.info({ file: sourceFile, chunks: chunks.length, unchanged: result.unchanged }, "Imported book chunks");
    }

    return counts;
}

function toApiDocument({ node, config, bookDirName }) {
    const bibliography = config.bibliography ?? {};
    const file = node.file;

    return {
        slug: node.slug,
        parent_slug: node.parent_slug,
        depth: node.depth,
        position: node.position,
        title: node.title,
        content: node.content,
        source_url: null,
        source_kind: bibliography.source_kind ?? null,
        language: bibliography.language ?? "en",
        authors: normalizeAuthors(bibliography.authors),
        original_published_date: normalizeOriginalPublishedDate(bibliography.original_published_date),
        markdown_source_file: file ? `books/${bookDirName}/markdown/${file.relativePath}` : null,
        markdown_source_file_hash: file ? `sha256:${createHash("sha256").update(file.raw).digest("hex")}` : null,
        markdown_source_file_estimate_token_count: file ? Math.ceil(file.body.length / 4) : 0,
        metadata: node.metadata,
    };
}

async function sendSyncRequest(api, path, payload) {
    return await api.put(path, payload);
}

async function reindexIndex(api) {
    return await api.post("/api/v1/admin/hierarchical-content-nodes/reindex");
}

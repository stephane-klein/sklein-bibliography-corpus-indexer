import { createApiClient, resolveApiOptions } from "./api-client.js";
import { logger } from "./logger.js";

const REINDEX_PATH = "/api/v1/admin/hierarchical-content-nodes/reindex";

export async function runReindexBm25({ url, token }) {
    const api = createApiClient(resolveApiOptions({ url, token }));
    const result = await api.post(REINDEX_PATH, {}, { timeoutMs: 600_000 });

    logger.info(
        {
            index: result.index,
            mutable: result.mutable,
            num_docs: result.num_docs,
            duration_ms: result.duration_ms,
        },
        "BM25 index reindexed",
    );

    if (result.mutable) {
        logger.warn(
            { index: result.index, mutable: result.mutable, num_docs: result.num_docs },
            "BM25 index is still mutable after reindex",
        );
    }

    return result;
}

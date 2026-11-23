import assert from "node:assert/strict";
import test from "node:test";

import { runReindexBm25 } from "../src/reindex-bm25.js";

const URL = "https://example.test";

test("posts the reindex request with a JSON body", async (t) => {
    const calls = [];
    const originalFetch = globalThis.fetch;

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return Response.json({
            data: {
                index: "idx_hierarchical_content_nodes_bm25",
                mutable: false,
                num_docs: 269,
                duration_ms: 42,
            },
        });
    };

    const result = await runReindexBm25({ url: URL, token: "secret-token" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${URL}/api/v1/admin/hierarchical-content-nodes/reindex`);
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(calls[0].options.headers, {
        Authorization: "Bearer secret-token",
        Accept: "application/json",
        "Content-Type": "application/json",
    });
    assert.equal(calls[0].options.body, "{}");
    assert.deepEqual(result, {
        index: "idx_hierarchical_content_nodes_bm25",
        mutable: false,
        num_docs: 269,
        duration_ms: 42,
    });
});

test("surfaces the server message when the request is rejected", async (t) => {
    const originalFetch = globalThis.fetch;

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async () =>
        Response.json({ message: "Cross-site POST form submissions are forbidden" }, { status: 403 });

    await assert.rejects(
        () => runReindexBm25({ url: URL, token: "secret-token" }),
        /Cross-site POST form submissions are forbidden/,
    );
});

test("surfaces the detail when the token is rejected", async (t) => {
    const originalFetch = globalThis.fetch;

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async () => Response.json({ detail: "Admin token required" }, { status: 401 });

    await assert.rejects(() => runReindexBm25({ url: URL, token: "secret-token" }), /Admin token required/);
});

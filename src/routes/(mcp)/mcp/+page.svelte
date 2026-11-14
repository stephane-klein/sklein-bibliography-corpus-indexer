<script>
    import { getLocale } from "#lib/paraglide/runtime.js";

    import PageEn from "./page.en.svelte";
    import PageFr from "./page.fr.svelte";

    let { data } = $props();

    const endpoint = $derived(`${data.origin}/mcp/readonly/`);

    const snippets = $derived({
        endpoint,
        opencodeConfig: JSON.stringify(
            {
                mcp: {
                    "bibliography-corpus": {
                        type: "remote",
                        url: endpoint,
                        enabled: true,
                        headers: {
                            Authorization: "Bearer YOUR_MCP_TOKEN",
                        },
                    },
                },
            },
            null,
            2,
        ),
        curlList: [
            `curl -s -X POST ${endpoint} \\`,
            '    -H "Authorization: Bearer YOUR_MCP_TOKEN" \\',
            '    -H "Content-Type: application/json" \\',
            '    -H "Accept: application/json, text/event-stream" \\',
            `    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        ].join("\n"),
        semanticSearchCall: [
            `curl -s -X POST ${endpoint} \\`,
            '    -H "Authorization: Bearer YOUR_MCP_TOKEN" \\',
            '    -H "Content-Type: application/json" \\',
            '    -H "Accept: application/json, text/event-stream" \\',
            `    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"semanticSearch","arguments":{"query":"le principe de Condorcet","authors":"Thibaut Giraud","limit":1,"purpose":"Illustrer la documentation"}}}'`,
        ].join("\n"),
        semanticSearchResponse: JSON.stringify(
            {
                query: "le principe de Condorcet",
                filters: { authors: "Thibaut Giraud", title: null, kind: null },
                page: 1,
                total: 2,
                total_pages: 2,
                hybrid: true,
                semantic_error: null,
                semantic_diagnostics: {
                    corpus_vectors: 11292,
                    filtered_vectors: 52,
                    selection_total: 2,
                    corpus_total: 246,
                },
                next_step:
                    "Read only the returned passages with readOnlySqlQuery, using their content_node_id " +
                    "and chunk_index. Do not select every chunk of a document.",
                documents: [
                    {
                        content_node_id: 189,
                        nanoid: "my1nmzqi10",
                        title: "LE PRINCIPE DE CONDORCET (1/2) Une norme démocratique - Grain de philo #9",
                        authors: ["Thibaut Giraud"],
                        original_published_date: "2017-05-24",
                        source_url: "https://www.youtube.com/watch?v=hI89r4LqaCc",
                        kind: "document",
                        chunk_index: 0,
                        heading_path:
                            "LE PRINCIPE DE CONDORCET (1/2) Une norme démocratique - Grain de philo #9 > " +
                            "Le principe de Condorcet : une norme démocratique",
                        excerpt:
                            "Aujourd'hui, nous allons parler d'une idée qui semble cruciale en démocratie : " +
                            "le principe de Condorcet…",
                        distance: 0.2318,
                        bm25_rank: 1,
                        vector_rank: 1,
                        rrf: 0.0328,
                    },
                ],
            },
            null,
            2,
        ),
        sqlExample: [
            "SELECT c.content_node_id,",
            "       n.title,",
            "       c.heading_path,",
            "       left(c.content, 500) AS excerpt,",
            "       c.embedding <=> vectorize('le principe de condorcet') AS distance",
            "  FROM content_chunks c",
            "  JOIN hierarchical_content_nodes n ON n.id = c.content_node_id",
            " WHERE c.embedding IS NOT NULL",
            `   AND c.embedding_model = '${data.embeddingModel ?? "voyage-4"}'`,
            "   AND c.embedding_strategy = 'standard'",
            " ORDER BY distance",
            " LIMIT 10;",
        ].join("\n"),
    });
</script>

{#if getLocale() === "fr"}
    <PageFr
        {data}
        {snippets}
    />
{:else}
    <PageEn
        {data}
        {snippets}
    />
{/if}

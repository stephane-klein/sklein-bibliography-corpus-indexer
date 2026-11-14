<script>
    let { data, snippets } = $props();

    const title = "MCP read-only server";
    const codeClass = "bg-gray-100 px-1 py-0.5 rounded-sm";
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<main class="doc">
    <h1>{title}</h1>

    <p class="mb-2">
        The service exposes a
        <a
            href="https://modelcontextprotocol.io/"
            class="text-blue-600 hover:underline">Model Context Protocol</a
        >
        (MCP) server that lets an AI agent read the bibliography corpus. It is available at
        <code class={codeClass}>{snippets.endpoint}</code>.
    </p>

    <nav
        aria-label="On this page"
        class="doc-toc"
    >
        <p>On this page</p>
        <ul>
            <li><a href="#tools">Tools</a></li>
            <li><a href="#semanticsearch">semanticSearch</a></li>
            <li><a href="#readonlysqlquery">readOnlySqlQuery</a></li>
            <li><a href="#usage">Usage</a></li>
            <li><a href="#configuration">Configuration in a Harness</a></li>
        </ul>
    </nav>

    <section>
        <h2 id="tools">Tools</h2>

        <p>This MCP server exposes two tools:</p>

        <table class="my-4 text-sm">
            <thead>
                <tr class="text-left border-b border-gray-300">
                    <th class="pr-4 py-1">Tool</th>
                    <th class="py-1">Description</th>
                </tr>
            </thead>
            <tbody>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">semanticSearch</td>
                    <td class="py-1">
                        Search by meaning with BM25 + vector fusion; returns the best passage per document with
                        identifiers for a follow-up SQL query.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">readOnlySqlQuery</td>
                    <td class="py-1">
                        Execute one read-only SQL statement (SELECT, WITH ... SELECT or EXPLAIN SELECT) against the
                        corpus. Accepts the virtual
                        <code class={codeClass}>vectorize()</code> function for vector search.
                    </td>
                </tr>
            </tbody>
        </table>
    </section>

    <section>
        <h2 id="semanticsearch">semanticSearch</h2>

        <p class="mb-2">
            <code class={codeClass}>semanticSearch</code> searches the corpus by meaning. It runs a BM25 search over documents
            and a vector search over passages, then it fuses both rankings. It returns the best passage of each document.
        </p>

        <p class="mb-2">The tool runs a fixed query with the application role. It does not accept SQL.</p>

        <h3>Parameters</h3>

        <table class="my-4 text-sm">
            <thead>
                <tr class="text-left border-b border-gray-300">
                    <th class="pr-4 py-1">Parameter</th>
                    <th class="pr-4 py-1">Required</th>
                    <th class="py-1">Description</th>
                </tr>
            </thead>
            <tbody>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">query</td>
                    <td class="pr-4 py-1">yes</td>
                    <td class="py-1">Natural language question or keywords, at most 2000 characters.</td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">purpose</td>
                    <td class="pr-4 py-1">yes</td>
                    <td class="py-1">
                        Reason for the call, at most 400 characters. The server writes it to the access log.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">authors</td>
                    <td class="pr-4 py-1">no</td>
                    <td class="py-1">
                        One string or an array of strings. All words must match, ignoring accents and case.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">title</td>
                    <td class="pr-4 py-1">no</td>
                    <td class="py-1">Title words. All words must match.</td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">kind</td>
                    <td class="pr-4 py-1">no</td>
                    <td class="py-1">
                        <code class={codeClass}>book</code> or <code class={codeClass}>document</code>. Without this
                        filter, the tool searches both.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">page</td>
                    <td class="pr-4 py-1">no</td>
                    <td class="py-1">Page number, 1 by default.</td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">limit</td>
                    <td class="pr-4 py-1">no</td>
                    <td class="py-1">Documents per page, 10 by default, 20 at most.</td>
                </tr>
                <tr>
                    <td class="pr-4 py-1 font-mono">maxCharacters</td>
                    <td class="pr-4 py-1">no</td>
                    <td class="py-1">
                        Maximum response size, 50000 characters by default. Beyond that, the server truncates the text
                        and says so.
                    </td>
                </tr>
            </tbody>
        </table>

        <h3>Response</h3>

        <p class="mb-2">
            If the embedding provider is unavailable, the tool falls back to BM25 and returns
            <code class={codeClass}>semantic_error: "unavailable"</code>. The call still succeeds.
        </p>

        <h3>Example</h3>

        <p class="mb-2">Call:</p>

        <pre
            class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.semanticSearchCall}</pre>

        <p class="mb-2">Response:</p>

        <pre
            class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.semanticSearchResponse}</pre>
    </section>

    <section>
        <h2 id="readonlysqlquery">readOnlySqlQuery</h2>

        <section>
            <h3>Read-only SQL access by design</h3>

            <p class="mb-2">SQL access is read-only through two mechanisms:</p>

            <ul class="list-disc pl-6 mb-2">
                <li>
                    Database role: queries run as the dedicated PostgreSQL role
                    <code class={codeClass}>{data.readerRole}</code>, with SELECT on the corpus tables and nothing else.
                </li>
                <li>
                    Transaction: every query runs inside a READ ONLY transaction with a 10-second statement timeout.
                </li>
            </ul>
        </section>

        <section>
            <h3>Vector search with readOnlySqlQuery</h3>

            <p class="mb-2">
                It is possible to generate embeddings directly in SQL with the
                <code class={codeClass}>vectorize('some text')</code> function, which enables semantic searches.
            </p>

            <p class="mb-2">
                The argument of <code class={codeClass}>vectorize</code> must be one string literal. Column references
                and expressions are rejected. A query can use at most {data.maxTexts} distinct texts, with at most
                {data.maxChars} characters each.
            </p>

            <p class="mb-2">
                The server generates embeddings with the query model
                <code class={codeClass}>voyage-4-lite</code> from
                <a
                    href="https://docs.voyageai.com/docs/embeddings"
                    class="text-blue-600 hover:underline">Voyage AI</a
                >.
            </p>

            <p class="mb-2">Example:</p>

            <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.sqlExample}</pre>
        </section>

        <h3>Available tables</h3>

        {#if data.schema}
            <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{data.schema}</pre>
        {:else}
            <p class="mb-4 text-sm text-gray-500 italic">
                The schema is unavailable because the MCP reader role is not configured.
            </p>
        {/if}
    </section>

    <section>
        <h2 id="usage">Usage</h2>

        <p class="mb-2">List the tools:</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-2">{snippets.curlList}</pre>

        <p class="mb-4 text-sm text-gray-500">
            Keep the trailing slash: /mcp/readonly is redirected to /mcp/readonly/, and some MCP clients do not follow a
            308 redirect on POST.
        </p>
    </section>

    <section>
        <h2 id="configuration">Configuration in a Harness</h2>

        <h3>OpenCode</h3>

        <p class="mb-2">Add this to your opencode.jsonc:</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.opencodeConfig}</pre>

        <h3>Claude Desktop</h3>

        <p class="mb-2">
            In Claude Desktop, open Settings → Connectors → Add custom connector and enter the URL
            <code class={codeClass}>{snippets.endpoint}</code>.
        </p>
    </section>
</main>

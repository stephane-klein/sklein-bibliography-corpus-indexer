<script>
    let { data, snippets } = $props();

    const title = "Serveur MCP en lecture seule";
    const codeClass = "bg-gray-100 px-1 py-0.5 rounded-sm";
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<main class="page px-5 pt-9 pb-24">
    <h1 class="text-xl font-bold mb-6 tracking-tight">{title}</h1>

    <p class="mb-2">
        <em>Sklein Bibliography Corpus RAG Manager</em> expose un serveur
        <a
            href="https://modelcontextprotocol.io/"
            class="text-blue-600 hover:underline">Model Context Protocol</a
        >
        (MCP) qui permet à un agent IA de lire le corpus bibliographique. Il est disponible à l'adresse
        <code class={codeClass}>{snippets.endpoint}</code>.
    </p>

    <section>
        <h2 class="text-lg font-bold mb-3 mt-6">Outils</h2>

        <p>Ce serveur MCP expose deux outils :</p>

        <table class="my-4 text-sm">
            <thead>
                <tr class="text-left border-b border-gray-300">
                    <th class="pr-4 py-1">Outil</th>
                    <th class="py-1">Description</th>
                </tr>
            </thead>
            <tbody>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">semanticSearch</td>
                    <td class="py-1">
                        Recherche par sens avec fusion BM25 + vecteur ; renvoie le meilleur passage par document avec
                        les identifiants pour une requête SQL de suivi.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">readOnlySqlQuery</td>
                    <td class="py-1">
                        Exécute une instruction SQL en lecture seule (SELECT, WITH ... SELECT ou EXPLAIN SELECT) sur le
                        corpus. Accepte la fonction virtuelle
                        <code class={codeClass}>vectorize()</code> pour la recherche vectorielle.
                    </td>
                </tr>
            </tbody>
        </table>
    </section>

    <section>
        <h2 class="text-lg font-bold mb-3 mt-6">semanticSearch</h2>

        <p class="mb-2">
            <code class={codeClass}>semanticSearch</code> cherche dans le corpus par le sens. Il lance une recherche BM25
            sur les documents et une recherche vectorielle sur les passages, puis il fusionne les deux classements. Il renvoie
            le meilleur passage de chaque document.
        </p>

        <p class="mb-2">L'outil exécute une requête fixe avec le rôle applicatif. Il n'accepte pas de SQL.</p>

        <h3 class="text-lg font-bold mb-3 mt-6">Paramètres</h3>

        <table class="my-4 text-sm">
            <thead>
                <tr class="text-left border-b border-gray-300">
                    <th class="pr-4 py-1">Paramètre</th>
                    <th class="pr-4 py-1">Requis</th>
                    <th class="py-1">Description</th>
                </tr>
            </thead>
            <tbody>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">query</td>
                    <td class="pr-4 py-1">oui</td>
                    <td class="py-1">Question en langage naturel ou mots-clés, 2000 caractères au plus.</td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">purpose</td>
                    <td class="pr-4 py-1">oui</td>
                    <td class="py-1">
                        Raison de l'appel, 400 caractères au plus. Le serveur l'écrit dans le journal d'accès.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">authors</td>
                    <td class="pr-4 py-1">non</td>
                    <td class="py-1">
                        Une chaîne ou un tableau de chaînes. Tous les mots doivent correspondre, sans tenir compte des
                        accents ni de la casse.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">title</td>
                    <td class="pr-4 py-1">non</td>
                    <td class="py-1">Mots du titre. Tous les mots doivent correspondre.</td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">kind</td>
                    <td class="pr-4 py-1">non</td>
                    <td class="py-1">
                        <code class={codeClass}>book</code> ou <code class={codeClass}>document</code>. Sans ce filtre,
                        l'outil cherche dans les deux.
                    </td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">page</td>
                    <td class="pr-4 py-1">non</td>
                    <td class="py-1">Numéro de page, 1 par défaut.</td>
                </tr>
                <tr class="border-b border-gray-200">
                    <td class="pr-4 py-1 font-mono">limit</td>
                    <td class="pr-4 py-1">non</td>
                    <td class="py-1">Documents par page, 10 par défaut, 20 au plus.</td>
                </tr>
                <tr>
                    <td class="pr-4 py-1 font-mono">maxCharacters</td>
                    <td class="pr-4 py-1">non</td>
                    <td class="py-1">
                        Taille maximale de la réponse, 50000 caractères par défaut. Au-delà, le serveur tronque le texte
                        et le signale.
                    </td>
                </tr>
            </tbody>
        </table>

        <h3 class="text-lg font-bold mb-3 mt-6">Réponse</h3>

        <p class="mb-2">
            La réponse porte <code class={codeClass}>query</code>, <code class={codeClass}>filters</code>,
            <code class={codeClass}>page</code>, <code class={codeClass}>total</code>,
            <code class={codeClass}>total_pages</code>, <code class={codeClass}>hybrid</code>,
            <code class={codeClass}>semantic_error</code>, <code class={codeClass}>semantic_diagnostics</code>,
            <code class={codeClass}>next_step</code> et <code class={codeClass}>documents</code>.
        </p>

        <p class="mb-2">
            Chaque document porte <code class={codeClass}>content_node_id</code>,
            <code class={codeClass}>nanoid</code>, <code class={codeClass}>title</code>,
            <code class={codeClass}>authors</code>, <code class={codeClass}>original_published_date</code>,
            <code class={codeClass}>source_url</code>, <code class={codeClass}>kind</code>,
            <code class={codeClass}>chunk_index</code>, <code class={codeClass}>heading_path</code>,
            <code class={codeClass}>excerpt</code>, <code class={codeClass}>distance</code>,
            <code class={codeClass}>bm25_rank</code>, <code class={codeClass}>vector_rank</code> et
            <code class={codeClass}>rrf</code>.
        </p>

        <p class="mb-2">
            Rejouez ensuite <code class={codeClass}>content_node_id</code> et
            <code class={codeClass}>chunk_index</code> dans <code class={codeClass}>readOnlySqlQuery</code> pour lire le passage
            complet. Ne sélectionnez pas tous les passages d'un document.
        </p>

        <p class="mb-2">
            Si le fournisseur d'embeddings est indisponible, l'outil se rabat sur BM25 et renvoie
            <code class={codeClass}>semantic_error: "unavailable"</code>. L'appel réussit quand même.
        </p>

        <h3 class="text-lg font-bold mb-3 mt-6">Exemple</h3>

        <p class="mb-2">Appel :</p>

        <pre
            class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.semanticSearchCall}</pre>

        <p class="mb-2">Réponse :</p>

        <pre
            class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.semanticSearchResponse}</pre>
    </section>

    <section>
        <h2 class="text-lg font-bold mb-3 mt-6">readOnlySqlQuery</h2>

        <h3 class="text-lg font-bold mb-3 mt-6">Lecture seule par conception</h3>

        <p class="mb-2">L'accès est en lecture seule à trois niveaux :</p>

        <ul class="list-disc pl-6 mb-2">
            <li>
                Rôle PostgreSQL : les requêtes utilisent le rôle dédié
                <code class={codeClass}>{data.readerRole}</code>, avec SELECT sur les tables du corpus et rien d'autre.
            </li>
            <li>
                Transaction : chaque requête s'exécute dans une transaction READ ONLY avec un délai d'expiration de 10
                secondes.
            </li>
            <li>
                Authentification HTTP : chaque requête doit porter
                <code class={codeClass}>Authorization: Bearer &lt;your-token&gt;</code>. Créez un jeton dans
                <a
                    href="/my/tokens/"
                    class="text-blue-600 hover:underline">Jetons MCP</a
                >.
            </li>
        </ul>

        <h3 class="text-lg font-bold mb-3 mt-6">Recherche vectorielle avec readOnlySqlQuery</h3>

        <p class="mb-2">
            Cette fonction n'est disponible que dans les requêtes SQL envoyées à l'outil
            <code class={codeClass}>readOnlySqlQuery</code>. L'outil
            <code class={codeClass}>semanticSearch</code> effectue déjà sa propre recherche vectorielle ; il n'utilise
            pas <code class={codeClass}>vectorize()</code>.
        </p>

        <p class="mb-2">
            <code class={codeClass}>vectorize('some text')</code>
            est une fonction virtuelle. Le serveur MCP remplace chaque appel par un littéral vector avant l'exécution ; PostgreSQL
            ne voit jamais de fonction <code class={codeClass}>vectorize()</code>.
        </p>

        <p class="mb-2">
            L'argument doit être un seul littéral de chaîne. Les colonnes et les expressions sont refusées. Une requête
            peut utiliser au plus {data.maxTexts} textes distincts, avec au plus
            {data.maxChars} caractères chacun.
        </p>

        <p class="mb-2">Exemple :</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.sqlExample}</pre>

        <h3 class="text-lg font-bold mb-3 mt-6">Tables disponibles</h3>

        {#if data.schema}
            <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{data.schema}</pre>
        {:else}
            <p class="mb-4 text-sm text-gray-500 italic">
                Le schéma est indisponible car le rôle lecteur MCP n'est pas configuré.
            </p>
        {/if}
    </section>

    <section>
        <h2 class="text-lg font-bold mb-3 mt-6">Utilisation</h2>

        <p class="mb-2">Lister les outils :</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-2">{snippets.curlList}</pre>

        <p class="mb-4 text-sm text-gray-500">
            Conservez le slash final : /mcp/readonly est redirigé vers /mcp/readonly/, et certains clients MCP ne
            suivent pas une redirection 308 sur un POST.
        </p>
    </section>

    <section>
        <h2 class="text-lg font-bold mb-3 mt-6">Configuration dans un Harness</h2>

        <h3 class="text-lg font-bold mb-3 mt-6">OpenCode</h3>

        <p class="mb-2">Ajoutez ceci à votre opencode.jsonc :</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.opencodeConfig}</pre>

        <h3 class="text-lg font-bold mb-3 mt-6">Claude Desktop</h3>

        <p class="mb-2">
            Dans Claude Desktop, ouvrez Settings → Connectors → Add custom connector et saisissez l'URL
            <code class={codeClass}>{snippets.endpoint}</code>.
        </p>
    </section>
</main>

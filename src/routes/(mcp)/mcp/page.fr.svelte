<script>
    let { data, snippets } = $props();

    const title = "Serveur MCP en lecture seule";
    const codeClass = "bg-gray-100 px-1 py-0.5 rounded-sm";
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<main class="doc">
    <h1>{title}</h1>

    <p class="mb-2">
        <em>Sklein Bibliography Corpus Indexer</em> expose un serveur
        <a
            href="https://modelcontextprotocol.io/"
            class="text-blue-600 hover:underline">Model Context Protocol</a
        >
        (MCP) qui permet à un agent IA de lire le corpus bibliographique. Il est disponible à l'adresse
        <code class={codeClass}>{snippets.endpoint}</code>.
    </p>

    <nav
        aria-label="Sur cette page"
        class="doc-toc"
    >
        <p>Sur cette page</p>
        <ul>
            <li><a href="#outils">Outils</a></li>
            <li><a href="#semanticsearch">semanticSearch</a></li>
            <li><a href="#readonlysqlquery">readOnlySqlQuery</a></li>
            <li><a href="#utilisation">Utilisation</a></li>
            <li><a href="#configuration">Configuration dans un Harness</a></li>
        </ul>
    </nav>

    <section>
        <h2 id="outils">Outils</h2>

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
        <h2 id="semanticsearch">semanticSearch</h2>

        <p class="mb-2">
            <code class={codeClass}>semanticSearch</code> cherche dans le corpus par le sens. Il lance une recherche BM25
            sur les documents et une recherche vectorielle sur les passages, puis il fusionne les deux classements. Il renvoie
            le meilleur passage de chaque document.
        </p>

        <p class="mb-2">L'outil exécute une requête fixe avec le rôle applicatif. Il n'accepte pas de SQL.</p>

        <h3>Paramètres</h3>

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

        <h3>Réponse</h3>

        <p class="mb-2">
            Si le fournisseur d'embeddings est indisponible, l'outil se rabat sur BM25 et renvoie
            <code class={codeClass}>semantic_error: "unavailable"</code>. L'appel réussit quand même.
        </p>

        <h3>Exemple</h3>

        <p class="mb-2">Appel :</p>

        <pre
            class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.semanticSearchCall}</pre>

        <p class="mb-2">Réponse :</p>

        <pre
            class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.semanticSearchResponse}</pre>
    </section>

    <section>
        <h2 id="readonlysqlquery">readOnlySqlQuery</h2>

        <section>
            <h3>Accès SQL en lecture seule par conception</h3>

            <p class="mb-2">L'accès SQL est limité en lecture par ces deux mécanismes :</p>

            <ul class="list-disc pl-6 mb-2">
                <li>
                    Rôle PostgreSQL : les requêtes utilisent le rôle dédié
                    <code class={codeClass}>{data.readerRole}</code>, avec SELECT sur les tables du corpus et rien
                    d'autre.
                </li>
                <li>
                    Transaction : chaque requête s'exécute dans une transaction READ ONLY avec un délai d'expiration de
                    10 secondes.
                </li>
            </ul>
        </section>

        <section>
            <h3>Recherche vectorielle avec readOnlySqlQuery</h3>

            <p class="mb-2">
                Il est possible de générer des embeddings directement en SQL à l'aide de la fonction
                <code class={codeClass}>vectorize('some text')</code>, ce qui permet d'effectuer des recherches
                sémantiques.
            </p>

            <p class="mb-2">
                L'argument de <code class={codeClass}>vectorize</code> doit être un seul littéral de type chaîne. Les
                colonnes et les expressions sont refusées. Une requête peut utiliser au plus {data.maxTexts} textes distincts,
                avec au plus {data.maxChars} caractères chacun.
            </p>

            <p class="mb-2">
                Le serveur génère les embeddings avec le modèle de requête
                <code class={codeClass}>voyage-4-lite</code> de
                <a
                    href="https://docs.voyageai.com/docs/embeddings"
                    class="text-blue-600 hover:underline">Voyage AI</a
                >.
            </p>

            <p class="mb-2">Exemple :</p>

            <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.sqlExample}</pre>
        </section>

        <h3>Tables disponibles</h3>

        {#if data.schema}
            <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{data.schema}</pre>
        {:else}
            <p class="mb-4 text-sm text-gray-500 italic">
                Le schéma est indisponible car le rôle lecteur MCP n'est pas configuré.
            </p>
        {/if}
    </section>

    <section>
        <h2 id="utilisation">Utilisation</h2>

        <p class="mb-2">Lister les outils :</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-2">{snippets.curlList}</pre>

        <p class="mb-4 text-sm text-gray-500">
            Conservez le slash final : /mcp/readonly est redirigé vers /mcp/readonly/, et certains clients MCP ne
            suivent pas une redirection 308 sur un POST.
        </p>
    </section>

    <section>
        <h2 id="configuration">Configuration dans un Harness</h2>

        <h3>OpenCode</h3>

        <p class="mb-2">Ajoutez ceci à votre opencode.jsonc :</p>

        <pre class="bg-gray-100 p-4 rounded-md overflow-x-auto text-xs font-mono mb-4">{snippets.opencodeConfig}</pre>

        <h3>Claude Desktop</h3>

        <p class="mb-2">
            Dans Claude Desktop, ouvrez Settings → Connectors → Add custom connector et saisissez l'URL
            <code class={codeClass}>{snippets.endpoint}</code>.
        </p>
    </section>
</main>

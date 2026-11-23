# Sklein Bibliography Corpus Indexer

`sklein-bibliography-corpus-indexer` builds and serves an index of a bibliography corpus, with full-text and semantic search over it.

It has two parts: a web application, which lets me explore the corpus, and a CLI, which splits the Markdown files into _chunks_, triggers the embedding computation, then imports the result into the database.

The corpus data lives in a PostgreSQL database. The web application exposes an [MCP](https://modelcontextprotocol.io/) server that lets an AI agent query this document base with [BM25](https://en.wikipedia.org/wiki/Okapi_BM25) and vector searches fused by [Reciprocal Rank Fusion](https://www.paradedb.com/learn/search-concepts/reciprocal-rank-fusion) (RRF). That server provides the retrieval component of a [RAG](https://en.wikipedia.org/wiki/Retrieval-augmented_generation), the generation being handled by the client AI agent ([OpenCode](https://opencode.ai/) or [Claude](https://claude/), for example) connected to this MCP server.

The CLI ships separately as `@stephane-klein/sklein-bibliography-corpus-indexer-cli`, and its source code lives in [`packages/cli`](./packages/cli). The [`./contents/`](./contents/) directory holds a sample corpus in the expected format: books and standalone documents.

> [!WARNING]
> **Status**: the project is under active development, and I use it primarily for myself. The application still has bugs and rough edges in its interface, and it changes fast.

## Tech Stack

This project was built on the [SvelteKit SSR skeleton](https://github.com/stephane-klein/sveltekit-ssr-skeleton/tree/main).

- Runtime: Node.js 26 (ESM)
- Package manager: pnpm
- Framework: SvelteKit 3 (SSR)
- Bundler: Vite
- Adapter: @sveltejs/adapter-node
- Database: PostgreSQL 18 with [ParadeDB pg_search (BM25)](https://github.com/paradedb/paradedb), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) and [pgvector](https://github.com/pgvector/pgvector)
- SQL client: [postgres](https://github.com/porsager/postgres)
- Migrations: [postgres-shift](https://github.com/porsager/postgres-shift)
- Mail: [nodemailer](https://nodemailer.com/) over SMTP
- CSS: [UnoCSS](https://unocss.dev/)
- i18n: [Paraglide JS](https://paraglidejs.com/)
- Lint / Format: ESLint + Prettier (eslint-plugin-svelte, prettier-plugin-svelte)
- Tooling: [Mise](https://mise.jdx.dev/), [Pitchfork](https://pitchfork.jdx.dev/)
- Dev mail: [Mailpit](https://github.com/axllent/mailpit) (SMTP + web UI)
- Containers: Podman Compose
- Secret detection: [betterleaks](https://github.com/betterleaks/betterleaks)

## Getting Started

The dev-stack services run under [Pitchfork](https://pitchfork.jdx.dev/): one
command starts PostgreSQL, Mailpit, the migrations, the seed and the dev server,
in dependency order and in the background. Safe to rerun.

```bash
$ mise install                # install Node.js, pnpm and Pitchfork via mise
$ pnpm install
$ pitchfork start webapp      # start postgres and mailpit,
                              # run migrate and seed,
                              # then the dev server
$ pitchfork logs webapp --tail
```

Open http://localhost:5173 in your browser.

Default user (see [`./sqls/seeds/00002_users.sql`](./sqls/seeds/00002_users.sql)):

- email: `alice@example.com`
- password: `password123`

To send a test email, run `mise run send-test-mail`. Mailpit captures all the
emails it sends: run `pitchfork proxy status` to get its URL.

### Web application environment variables

The web application reads these variables at runtime. The defaults apply when a
variable is unset or empty.

- **Database**
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_POSTGRES_URL` — PostgreSQL connection
    URL. No default; set it to a valid connection URL. The container image sets
    `postgres://postgres:postgres@postgres:5432/postgres`, and the dev stack
    exports the URL of the local container.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_POSTGRES_SCHEMA` — schema the
    application reads and writes. Default `public`.
- **Admin API**
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_ADMIN_TOKEN` — bearer token for
    `/api/v1/admin/*`. No default. The routes return 500 when it is unset or
    shorter than 32 characters.
- **Authentication**
  - `AUTHELIA_ISSUER`, `AUTHELIA_CLIENT_ID`, `AUTHELIA_CLIENT_SECRET` — OIDC
    settings for Authelia. No default; sign-in stays disabled when one of them is
    missing.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_ORIGIN` — origin used to build the
    OIDC callback URL. Default `http://localhost:5173`.
  - `LOGIN_MAX_ATTEMPTS` — failed sign-in attempts allowed per IP address and
    per email address. Default `5`.
  - `LOGIN_WINDOW_MS` — window of the sign-in throttle, in milliseconds. Default
    `900000` (15 minutes).
- **Mail**
  - `SMTP_HOST` — SMTP host. Default empty, which disables email sending.
  - `SMTP_PORT` — SMTP port. Default `587`.
  - `SMTP_USER` — SMTP user. Default empty, which disables authentication.
  - `SMTP_PASS` — SMTP password. Default empty.
  - `SMTP_SECURE` — implicit TLS. Only the value `true` enables it. Default empty
    (`false`).
  - `EMAIL_FROM` — sender address. Default `noreply@example.com`.
  - `TEST_EMAIL_TO` — default recipient of
    `POST /api/v1/admin/send-test-mail`. No default; the request body must
    provide `to` when it is unset.
- **Embeddings**
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_PROVIDER` — embedding
    provider, `voyage` or `openai`. Default `voyage`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_MODEL` — document model.
    Default `voyage-4` for Voyage and `text-embedding-3-small` for OpenAI.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_QUERY_MODEL` — query model.
    Default `voyage-4-lite` for Voyage and the document model for OpenAI.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_DIMENSION` — vector
    dimension. Default `1024` for Voyage and `1536` for OpenAI.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_BASE_URL` — provider base
    URL. No default.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_API_KEY` — provider API
    key. No default; the embedding endpoints fail without it.
- **MCP read-only server**
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_READONLY_POSTGRES_PASSWORD` —
    password of the reader role. No default; the endpoint returns 503 when it is
    unset.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_READONLY_POSTGRES_ROLE` — reader
    role name. Default `sklein_bibliography_mcp_reader`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_OUTPUT_CHARS` — maximum
    output size in characters. Default `200000`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_DEFAULT_MAX_OUTPUT_CHARS` —
    default output size in characters. Default `50000`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_QUERY_CHARS` — maximum query
    size in characters. Default `100000`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_VECTORIZE_TEXTS` — maximum
    distinct texts per `vectorize()` query. Default `8`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_VECTORIZE_TEXT_CHARS` —
    maximum length of one `vectorize()` text. Default `2000`.
  - `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_LARGE_RESULT_ROWS` — row count
    that triggers the large-result warning. Default `50`.
- **Runtime**
  - `NODE_ENV` — `production` switches the logs from `debug` to `info` and marks
    the session cookie `Secure`. No default; any other value behaves like
    development.
  - `PORT` — HTTP port (adapter-node). Default `3000`.
  - `HOST` — HTTP bind address (adapter-node). Default `0.0.0.0`.
  - `BODY_SIZE_LIMIT` — maximum request body size (adapter-node). Default
    `512K`; the container image sets `50M`.
  - `ADDRESS_HEADER` — header that carries the client IP (adapter-node). No
    default; set it to `x-forwarded-for` behind a reverse proxy so the login
    throttle sees the real client IP.

### Command-line client

The commands below come from the `@stephane-klein/sklein-bibliography-corpus-indexer-cli`
package, in [`packages/cli`](./packages/cli). The repository depends on it through
the pnpm workspace, so `pnpm install` puts the
`sklein-bibliography-corpus-indexer` command on the `PATH` when mise is
active, and that command runs the same code that is published to npm. In a shell
where mise is not active, run it with
`pnpm exec sklein-bibliography-corpus-indexer …`.

The path argument is required: pass `contents/single-document-texts`,
`contents/books`, a subdirectory of either, or a single Markdown file. The CLI
finds the `contents/` directory by walking up from that path; `--contents-dir`
overrides the search.

The webapp URL and the admin token come from `--url` and `--token`, then from
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_URL` and
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_TOKEN`. See
[`packages/cli/README.md`](./packages/cli/README.md) for installation and
reference.

### Importing corpus contents

`sklein-bibliography-corpus-indexer import-single-documents` loads
standalone Markdown files into `hierarchical_content_nodes` and, when a
`.md.yaml` sidecar and its `.md.embeddings.bin` exist, imports the chunks into
`content_chunks`. The command accepts a directory or a single Markdown file:

```bash
$ sklein-bibliography-corpus-indexer import-single-documents contents/single-document-texts
$ sklein-bibliography-corpus-indexer import-single-documents contents/single-document-texts/mr-phi
$ sklein-bibliography-corpus-indexer import-single-documents contents/single-document-texts/mr-phi/2017-05-24_le-principe-de-condorcet-1-2-une-norme-democratique-grain-de-philo-9.fr.md
$ sklein-bibliography-corpus-indexer import-single-documents contents/single-document-texts/mr-phi --dry-run
```

`sklein-bibliography-corpus-indexer import-books` imports the books under
`contents/books/`. It reads each book's `config.yaml` (title, slug, bibliography,
excluded files) and the Markdown files under `markdown/`, builds the
work/part/chapter tree from their `path` and their `00-index.md` pages, and sends
it to the same sync endpoint. When a section has a `.md.yaml` sidecar and its
`.md.embeddings.bin`, the command also imports its chunks:

```bash
$ sklein-bibliography-corpus-indexer import-books contents/books
$ sklein-bibliography-corpus-indexer import-books contents/books/an-inquiry-into-the-nature-and-causes-of-the-wealth-of-nations-by-smith-and-garnier --dry-run
$ sklein-bibliography-corpus-indexer import-books contents/books --skip-embeddings
$ sklein-bibliography-corpus-indexer import-books contents/books --require-embeddings
```

The webapp must be running with the migrations applied. The CLI sends each
document to `PUT /api/v1/admin/hierarchical-content-nodes/sync`, then its chunks
to `PUT /api/v1/admin/hierarchical-content-chunks/sync`.

`--prune` removes rows whose source file no longer exists. It only works with a
directory. `--skip-embeddings` imports documents only. `--require-embeddings`
fails when a document has no sidecar. By default, a document without a sidecar
is imported and its embeddings are reported as missing.

### Searching documents

The `/documents/` page searches the document catalog with BM25. Enable
"Semantic search" to embed the query with Voyage and fuse the best matching
chunks with the BM25 ranking. Query vectors are cached in `query_embedding_cache`,
keyed by the normalized query, the provider, the model and the dimension. The
page falls back to BM25 when Voyage, the cache, or the `content_chunks` table is
unavailable.

### Generating sidecars

`sklein-bibliography-corpus-indexer generate-sidecars` writes one `.md.yaml`
sidecar next to each Markdown document under `contents/single-document-texts` or
`contents/books`. The command accepts a directory or a single Markdown file:

```bash
$ sklein-bibliography-corpus-indexer generate-sidecars contents/single-document-texts
$ sklein-bibliography-corpus-indexer generate-sidecars contents/single-document-texts/mr-phi
$ sklein-bibliography-corpus-indexer generate-sidecars contents/single-document-texts/mr-phi/2017-05-24_le-principe-de-condorcet-1-2-une-norme-democratique-grain-de-philo-9.fr.md
$ sklein-bibliography-corpus-indexer generate-sidecars contents/books
$ sklein-bibliography-corpus-indexer generate-sidecars contents/books/principales-of-political-economy-by-john-stuart-mill --dry-run
$ sklein-bibliography-corpus-indexer generate-sidecars contents/single-document-texts --force
```

The command does not vectorize anything. It splits each document into
paragraphs, counts tokens with the `cl100k_base` tokenizer, and stores the
result in `source.md.yaml` next to `source.md`. The file contains a `manifest`
section and a `chunks` list; each chunk has its heading path and token count.
For a book section, the heading path starts with the book breadcrumb built from
`config.yaml.title` and the `00-index.md` pages, for example
`Book I. Production. > Chapter III. Of Capital. > § 1. ...`.

By default, the command skips a sidecar when its manifest has the same source
hash, schema version, tokenizer, threshold and splitter, and when the number of
chunks matches `chunk_count`. `--force` regenerates every sidecar. `--dry-run`
reports what would be written without writing.

`yq` reads the sidecars directly:

```bash
$ yq '.' contents/single-document-texts/mr-phi/2017-05-24_le-principe-de-condorcet-1-2-une-norme-democratique-grain-de-philo-9.fr.md.yaml
$ yq '.chunks[] | [.chunk_index, .content_token_count, .heading_path] | @tsv' contents/single-document-texts/mr-phi/2017-05-24_le-principe-de-condorcet-1-2-une-norme-democratique-grain-de-philo-9.fr.md.yaml
$ yq -o=json '.' contents/single-document-texts/mr-phi/2017-05-24_le-principe-de-condorcet-1-2-une-norme-democratique-grain-de-philo-9.fr.md.yaml | jq .
```

The command respects each book's `config.exclude` list. A Markdown file listed
there gets no sidecar, because the node import does not create a node for it.

### Generating embeddings

`sklein-bibliography-corpus-indexer generate-embeddings` reads the `.md.yaml`
sidecars, asks the webapp for vectors, and writes one `.md.embeddings.bin` file
next to each sidecar. The command does not write to PostgreSQL.

The webapp must be running with a Voyage API key:

```bash
$ export SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_API_KEY="pa-..."
```

Generate the sidecars first, then the embeddings:

```bash
$ sklein-bibliography-corpus-indexer generate-sidecars contents/single-document-texts
$ sklein-bibliography-corpus-indexer generate-embeddings contents/single-document-texts
$ sklein-bibliography-corpus-indexer generate-embeddings contents/single-document-texts/mr-phi
$ sklein-bibliography-corpus-indexer generate-sidecars contents/books
$ sklein-bibliography-corpus-indexer generate-embeddings contents/books
$ sklein-bibliography-corpus-indexer generate-embeddings contents/single-document-texts --dry-run
$ sklein-bibliography-corpus-indexer generate-embeddings contents/single-document-texts --force
```

The CLI calls `GET /api/v1/admin/embeddings` to read the document model and
dimension, then `POST /api/v1/admin/embeddings` with `input_type: "document"` and
one document's chunks. The webapp calls Voyage with AI SDK, and the API key never
leaves the server.

The document model is `voyage-4` with 1024 dimensions. Queries use
`voyage-4-lite`; both models share the same embedding space, so you can change
the query model without reindexing. The webapp returns `query_model` in the
embedding configuration for the future search endpoint.

Each binary file starts with a JSON header line (format, provider, model,
dimension, chunk count, source hash, input format, input type, strategy and
cost) followed by Float32LE vectors. The YAML manifest stores
`embedding_provider`, `embedding_model`, `dimension`, `embedding_file`,
`embedding_format`, `embedding_input_format`, `embedding_input_type` and
`embedding_strategy`.

The `cost` block records the number of tokens, the amount in US dollars and the
price per million tokens used at generation time:

```json
"cost": {
  "amount_usd": 0.0001518,
  "basis": "list_price",
  "tokens": 2530,
  "price_per_million_tokens_usd": 0.06
}
```

The amount is the list price. Voyage's 200 million free tokens are not deducted,
so the value is an estimate of what the call would cost, not the billed amount.
Prices are hardcoded in `src/lib/server/embedding.js` for `voyage-4`
($0.06 per million tokens) and `voyage-4-lite` ($0.02 per million tokens). Any
other model gives a null cost, and the command reports the total as partial.

The command prints the tokens and the total cost of the calls it made. Files
skipped because their embeddings are current do not add to that total.
`--dry-run` makes no call, so it prints a null cost.

By default, the command skips a document when the manifest and the binary header
match the source hash, the provider, the model, the dimension and the embedding
strategy. `--force` regenerates everything. Existing binary files without a
`cost` block stay valid; run
`sklein-bibliography-corpus-indexer generate-embeddings contents/single-document-texts --force`
once to add the metadata to the whole corpus. `--dry-run` reports what would be
embedded without generating vectors.

The embedding input is `heading_path + "\n\n" + text`. `text` stays the exact
paragraph used for display and BM25.

Override the defaults with
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_PROVIDER`,
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_MODEL`,
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_QUERY_MODEL`,
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_DIMENSION` and optionally
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_BASE_URL`. Set
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_EMBEDDING_PROVIDER=openai` to use OpenAI
instead of Voyage.

### MCP read-only server

The application exposes a read-only MCP endpoint at `/mcp/readonly/`. It lets an
MCP client write SQL against the corpus and, when the query needs a vector,
call a virtual `vectorize('...')` function. The public documentation page is
`/mcp/`.

The endpoint authenticates with an API token. Create one in
`/my/tokens/`, then configure the client:

```json
{
  "mcpServers": {
    "bibliography": {
      "type": "http",
      "url": "https://your-host/mcp/readonly/",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

The trailing slash matters: the application uses `trailingSlash = "always"`.
Some MCP clients do not follow a 308 redirect on POST.

The server exposes two tools. Both require a `purpose` string for the access
log.

- `semanticSearch` searches the corpus by meaning. It runs BM25 over documents
  and vector search over paragraph chunks, fuses the rankings with Reciprocal
  Rank Fusion, and returns the best matching passage for each document. Each result
  carries `content_node_id`, `nanoid`, `chunk_index`, `heading_path`, `kind`,
  `source_url` and an excerpt, so a follow-up SQL query can read the full text.
  It accepts `query`, optional `authors`, `title` and `kind` filters (`book` or
  `document`), `page` and `limit` (default 10, max 20).
- `readOnlySqlQuery` accepts one `SELECT`, `WITH ... SELECT` or
  `EXPLAIN SELECT` statement. Use it for drill-down and custom queries.

A typical `semanticSearch` call:

```json
{
  "name": "semanticSearch",
  "arguments": {
    "query": "limites de l'utilitarisme",
    "authors": ["Thibaut Giraud"],
    "limit": 10,
    "purpose": "Find passages about the limits of utilitarianism"
  }
}
```

`semanticSearch` runs fixed SQL through the application database role, because
it does not accept SQL from the client. `readOnlySqlQuery` remains the only path
for arbitrary SQL and keeps using the dedicated reader role. If the embedding
provider is unavailable, `semanticSearch` falls back to BM25 and reports
`semantic_error` in its response. `semantic_error` distinguishes `no-vectors`,
`filtered-out`, `no-matches` and `unavailable`; the response also carries
`filters`, `semantic_diagnostics` and a `next_step` hint that explains an empty
result or points to the returned `content_node_id`/`chunk_index` passages.

`vectorize('some text')` is not a PostgreSQL function. The MCP server finds the
call in the SQL, embeds the literal text with the query model, replaces the call
with a `vector` literal, then executes the rewritten query. PostgreSQL never
sees `vectorize`.

```sql
SELECT c.content_node_id,
       n.title,
       c.heading_path,
       left(c.content, 500) AS excerpt,
       c.embedding <=> vectorize('le principe de condorcet') AS distance
  FROM content_chunks c
  JOIN hierarchical_content_nodes n ON n.id = c.content_node_id
 WHERE c.embedding IS NOT NULL
   AND c.embedding_model = 'voyage-4'
   AND c.embedding_strategy = 'standard'
 ORDER BY distance
 LIMIT 10;
```

The argument of `vectorize` must be one string literal. `vectorize(c.content)` is rejected
because the server cannot know the value before running the query. A query can
use at most 8 distinct texts, and each text is limited to 2000 characters.
Identical texts share one embedding call and one vector. Query embeddings reuse
the `query_embedding_cache` table.

`readOnlySqlQuery` appends a warning when a result has at least 50 rows and
selects `content` from `content_chunks` (or uses `SELECT *`). The warning
suggests reading only the `chunk_index` values returned by `semanticSearch`.
The threshold is configurable with
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_LARGE_RESULT_ROWS`.

The MCP server connects with a dedicated role,
`sklein_bibliography_mcp_reader` by default. `pnpm migrate` creates the role when
the application role is allowed to `CREATE ROLE`, then grants `SELECT` on
`hierarchical_content_nodes` and `content_chunks`. Set
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_READONLY_POSTGRES_PASSWORD` to
enable the endpoint; without it the endpoint returns 503. Override the role name
with
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_READONLY_POSTGRES_ROLE`.

Optional limits:

- `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_OUTPUT_CHARS` (default 200000)
- `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_DEFAULT_MAX_OUTPUT_CHARS` (default 50000)
- `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_QUERY_CHARS` (default 100000)
- `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_VECTORIZE_TEXTS` (default 8)
- `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_MAX_VECTORIZE_TEXT_CHARS` (default 2000)
- `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_MCP_LARGE_RESULT_ROWS` (default 50)

Each tool call is recorded in `mcp_access_log` and shown on `/mcp/log/`. The
page shows only the calls of the signed-in user. It shows the query as written,
the embedding calls, tokens and cost, but never the vector itself.

MCP sessions live in memory. The endpoint is meant for a single replica; a
multi-replica deployment needs a shared session store or sticky sessions.

### Testing the built version of the webapp locally

```bash
$ pitchfork start preview
```

Open http://localhost:4173 in your browser.

### Stopping and cleaning up

```bash
$ pitchfork stop --local      # stop the daemons (PostgreSQL volume preserved)
$ mise run teardown           # stop the daemons, remove containers and volumes (destructive, deletes PostgreSQL data)
```

## Build and push container image

```bash
$ mise run build-image
$ mise run login-ghcr
$ mise run push-image
```

Alternatively, build and push via a GitHub Action workflow (manual trigger).
Configure the repository settings once before the first run:

```bash
$ mise run setup-ghcr-actions
```

The task sets the `GHCR_USERNAME` variable with `gh variable set` and pushes
`GHCR_PAT` with `fnox push`. `fnox.toml` declares `GHCR_PAT` and the
`github-actions` push target.

Then trigger the workflow:

```bash
$ mise run ci-build-push-image
```

This runs the `build-push-image.yml` workflow through `gh workflow run`. The
workflow requires the `GHCR_PAT` secret (a PAT with `write:packages`) and the
`GHCR_USERNAME` variable.

## Publish Helm chart

```bash
$ mise run login-ghcr-helm
$ mise run publish-chart
```

## Local monitoring stack (VictoriaMetrics + Grafana)

[`victoriametrics-grafana-test-dev/`](./victoriametrics-grafana-test-dev/)
contains a Podman Compose stack to test the metrics locally: VictoriaMetrics
scrapes `/-/metrics` and Grafana shows the result through provisioned dashboards.

```bash
$ pitchfork start grafana     # VictoriaMetrics + Grafana
```

Go to Grafana: <http://localhost:3001> — `admin` / `admin123`.

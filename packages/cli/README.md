# Sklein Bibliography Corpus RAG Manager CLI

`sklein-bibliography-corpus-rag-manager` prepares and imports a Markdown corpus
into the [Sklein Bibliography Corpus RAG Manager](https://github.com/stephane-klein/sklein-bibliography-corpus-rag-manager)
webapp.

The corpus lives in a `contents/` directory with two collections:

```
contents/
├── single-document-texts/   # standalone Markdown documents
└── books/                   # one directory per book, with config.yaml and markdown/
```

Five subcommands work on that tree:

| Command                   | What it does                                                                            | Needs the webapp |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| `generate-sidecars`       | Splits each Markdown file into chunks and writes a `.md.yaml` sidecar next to it        | no               |
| `generate-embeddings`     | Asks the webapp for vectors and writes a `.md.embeddings.bin` file next to each sidecar | yes              |
| `migrate-corpus`          | Rewrites sidecars and headers to schema 2, without re-chunking or re-embedding          | no               |
| `import-single-documents` | Imports standalone documents and their chunk embeddings                                 | yes              |
| `import-books`            | Imports books, their hierarchy and their chunk embeddings                               | yes              |

A typical run is `generate-sidecars`, `generate-embeddings`, then one of the two
import commands. When you upgrade from version 0.1.x, run `migrate-corpus` once
before the others.

## Requirements

- Node.js 22.12 or later.

## Install

The package is published on npmjs as `@stephane-klein/sklein-bibliography-corpus-rag-manager-cli`.
Install it globally to get the `sklein-bibliography-corpus-rag-manager` command
on your `PATH`:

```sh
$ npm install -g @stephane-klein/sklein-bibliography-corpus-rag-manager-cli
```

With pnpm:

```sh
$ pnpm add -g @stephane-klein/sklein-bibliography-corpus-rag-manager-cli
```

Or run it without installing it:

```sh
$ npx @stephane-klein/sklein-bibliography-corpus-rag-manager-cli generate-sidecars ./contents/books
$ pnpx @stephane-klein/sklein-bibliography-corpus-rag-manager-cli generate-sidecars ./contents/books
```

Run `sklein-bibliography-corpus-rag-manager --help` to list the commands.

## The path argument

Every subcommand takes a required `<path>`. The path is resolved against the
current directory, and it must point inside a directory named `contents`. The
CLI walks up from the path to find that directory, so the same path works from
any subdirectory of the corpus.

```sh
# From the corpus root: the path is contents/ itself
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./contents
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./contents/books
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./contents/single-document-texts/mr-phi
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./contents/books/wealth-of-nations/markdown/01-introduction.md
```

When the corpus directory is not named `contents`, pass `--contents-dir`:

```sh
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./corpus/books --contents-dir ./corpus
```

Each command applies its own rule:

| Command                   | Accepted path                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `generate-sidecars`       | `single-document-texts/`, `books/`, or `contents/` for both                                      |
| `generate-embeddings`     | same                                                                                             |
| `migrate-corpus`          | same                                                                                             |
| `import-books`            | `books/`, or `contents/` which means `books/`                                                    |
| `import-single-documents` | anything inside `contents/` except `books/`, or `contents/` which means `single-document-texts/` |

`import-single-documents` refuses a path under `books/`, because importing a
book as flat documents would create slugs and `markdown_source_file` values that
differ from the ones `import-books` writes for the same book.

## Options

| Option                 | Environment variable                                  | Default                  |
| ---------------------- | ----------------------------------------------------- | ------------------------ |
| `--url <url>`          | `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_URL`          | `http://localhost:5173`  |
| `--token <token>`      | `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_TOKEN`        | none                     |
| `--contents-dir <dir>` | `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_CONTENTS_DIR` | discovered from `<path>` |
| `--verbose`            | —                                                     | `false`                  |

An option wins over its environment variable, which wins over the default.

`--token` and the environment variable take the super-admin token: the value the
webapp reads from `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_ADMIN_TOKEN`. User API
tokens created in the webapp are not accepted by the `/api/v1/admin/*` routes.

Prefer the environment variable in scripts. A token passed with `--token` appears
in the shell history and in the output of `ps`.

`generate-sidecars` accepts `--url` and `--token` and ignores them, because it
never calls the webapp.

## Command reference

### `generate-sidecars <path>`

Writes one `.md.yaml` sidecar next to each Markdown file. The sidecar holds a
`manifest` and a `chunks` list; each chunk has a heading path, a token count and
the exact paragraph text. The splitter counts tokens with the `cl100k_base`
tokenizer and keeps chunks under 1000 tokens. For a book section, the heading
path starts with the breadcrumb built from `config.yaml.title` and the
`00-index.md` pages.

```sh
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./contents/single-document-texts --dry-run
$ sklein-bibliography-corpus-rag-manager generate-sidecars ./contents/books --force
```

`--dry-run` reports what would be written. `--force` regenerates every sidecar.
Without `--force`, a sidecar is skipped when its manifest still matches the
chunking content hash, the schema version, the tokenizer, the threshold and the
splitter.

The manifest stores `source_content_hash`, the sha256 of `rootTitle + "\n" + body`.
It does not hash the file bytes, so editing the frontmatter does not re-chunk the
document. A renamed folder only refreshes `source_file`: the chunks and the
embedding fields are kept, and `generate-embeddings` has nothing to do.

A sidecar written with `schema_version: 1` is refused, because regenerating it
would drop its embedding fields and force a paid re-embedding. Run
`migrate-corpus` first, or pass `--force` when you really want to re-chunk and
re-embed it.

### `generate-embeddings <path>`

Reads the sidecars, asks the webapp for vectors, and writes one
`.md.embeddings.bin` next to each sidecar. The binary starts with a JSON header
line, followed by Float32LE vectors for each chunk. The sidecar manifest records
the provider, the model, the dimension and the embedding file name.

```sh
$ sklein-bibliography-corpus-rag-manager generate-embeddings ./contents/single-document-texts --dry-run
$ sklein-bibliography-corpus-rag-manager generate-embeddings ./contents/books --force
```

The command calls `GET /api/v1/admin/embeddings` to read the document model and
dimension, then `POST /api/v1/admin/embeddings` once per batch of chunks. The
Voyage or OpenAI API key stays on the server. The final log line reports the
number of tokens and the total list-price cost.

Without `--force`, a document is skipped when its manifest and binary header
match the chunks hash, the provider, the model, the dimension and the embedding
strategy. The chunks hash is the sha256 of the embedding inputs, so a log with
`skipped` means no vector was requested from the webapp.

### `migrate-corpus <path>`

Rewrites the `.md.yaml` manifests and the `.md.embeddings.bin` headers from
schema 1 to schema 2. The chunks and the vectors are copied as they are: the
command never calls the webapp and never spends an embedding token.

```sh
$ sklein-bibliography-corpus-rag-manager migrate-corpus ./contents --dry-run
$ sklein-bibliography-corpus-rag-manager migrate-corpus ./contents
```

The manifest replaces `source_file_hash` with `source_content_hash` and bumps
`schema_version` to 2. The binary header replaces `source_file_hash` with
`source_content_chunks_hash` and bumps `format_version` to 2. The vectors are
copied byte for byte, so the migration cannot change a query result.

A schema 1 sidecar is migrated only when its `source_file_hash` still matches
the Markdown file. Otherwise the sidecar was already stale before the migration,
and the command reports it and exits with `1`: run `generate-sidecars --force`
on that file, then `generate-embeddings`.

Running the command twice is safe: the second run reports `already` and writes
nothing. This command is unrelated to the `pnpm migrate` of the webapp, which
migrates the PostgreSQL schema.

### `import-single-documents <path>`

Imports each Markdown file as a row of `hierarchical_content_nodes`, then its
chunks as rows of `content_chunks`. The command sends
`PUT /api/v1/admin/hierarchical-content-nodes/sync` and
`PUT /api/v1/admin/hierarchical-content-chunks/sync`, then asks the webapp to
reindex the BM25 index when something changed.

```sh
$ sklein-bibliography-corpus-rag-manager import-single-documents ./contents/single-document-texts --dry-run
$ sklein-bibliography-corpus-rag-manager import-single-documents ./contents/single-document-texts/mr-phi
$ sklein-bibliography-corpus-rag-manager import-single-documents ./contents/single-document-texts --prune
```

`--prune` deletes rows whose `markdown_source_file` is no longer in the imported
directory. It only works with a directory. `--skip-embeddings` imports documents
only. `--require-embeddings` fails when a document has no sidecar. By default, a
document without a sidecar is imported and its embeddings are reported as
missing.

### `import-books <path>`

Reads each book's `config.yaml` (title, slug, bibliography, excluded files) and
the Markdown files under `markdown/`, builds the work/part/chapter tree from
their `path` and their `00-index.md` pages, and sends it to the same sync
endpoint. Sections with a sidecar and its binary also get their chunks.

`toc.yaml` is input for `epub-to-markdown` only. `import-books` never reads it:
the Markdown file paths give the hierarchy, and every directory stores its title
and content in `00-index.md`. The importer supports only the latest
`epub_to_markdown_schema`; run `epub-to-markdown migrate` on an older corpus.
Every Markdown file that is not listed in `config.exclude` becomes a node.

```sh
$ sklein-bibliography-corpus-rag-manager import-books ./contents/books
$ sklein-bibliography-corpus-rag-manager import-books ./contents/books/wealth-of-nations --dry-run
$ sklein-bibliography-corpus-rag-manager import-books ./contents/books --prune --require-embeddings
```

`--prune` deletes book nodes whose slug is no longer in the imported tree. It
is scoped to the book slug, so it never touches the other books.

## Output and exit codes

Log lines go to stderr, so stdout stays free. Each line carries a time, a level
and the relevant fields; `--verbose` adds debug lines and the stack trace of an
error.

The command exits with `0` on success and `1` on failure.

## Shell completion

```sh
$ sklein-bibliography-corpus-rag-manager completion >> ~/.zshrc
```

## Install the development version globally on your workstation

To run the CLI from other projects while working on its source, link the checkout
into `~/.local/bin` instead of installing the published package:

```sh
$ cd packages/cli
$ mise run install-cli-to-local-bin
```

Run `pnpm install` at the workspace root first, because the linked script resolves
its dependencies from `packages/cli/node_modules`.

The task symlinks `src/cli.js`, so the command runs the working tree and every edit
is active on the next call. It creates no global package state. Remove the link
with `mise run uninstall-cli-from-local-bin`.

## Publishing

The package is published by hand, by the maintainer. Bump `version` in
`package.json`, then run the mise task from the package directory:

```sh
$ cd packages/cli
$ pnpm login          # once, with an account allowed to publish the package
$ mise run publish-to-npmjs
```

The task checks the npm session with `npm whoami`, then runs `npm publish`. It
publishes the version written in `package.json`, so bump it first.

Run `mise trust` once in `packages/cli`: mise ignores a configuration file it has
not trusted yet, and the task stays invisible until then.

The tarball is built from the `files` field of `package.json`: it contains
`src/`, `README.md`, `LICENSE` and `package.json`. The `mise.toml` file of the
package is not published.

To read the tarball contents without publishing:

```sh
$ cd packages/cli
$ npm pack --dry-run
```

## License

MIT.

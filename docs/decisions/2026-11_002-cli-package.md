# ADR 002 — Publish the corpus CLI as a workspace package

**Status**: Accepted
**Date**: 2026-11-15

## Context

Four scripts lived in `src/` and were run with `mise run …`:

- `generate-sidecars`
- `generate-embeddings`
- `import-books`
- `import-single-documents`

They shared four modules in `src/lib/server/` (`book-loader.js`, `book-tree.js`,
`embedding-import.js`, `embeddings-file.js`). No route of the SvelteKit
application imported those modules, so the boundary was already clean.

The scripts computed their root with `new URL("..", import.meta.url)` and read
`contents/` at that location. That works inside the repository and fails as soon
as the code is installed from npm. The goal is a package that users install with
npm or pnpm, or run with `npx`/`pnpx`, and point at their own corpus.

## Decision Drivers

- One implementation, not a copy published next to the original
- The repository keeps exercising the same entry point that users run
- The corpus tree stays the anchor for `manifest.source_file` and
  `markdown_source_file`, so existing sidecars and database rows stay valid
- No build step: the code is already executable ESM
- A published package that carries only the CLI, not the SvelteKit application

## Considered Options

### 1. Separate repository, copied code

- **Pros**: simplest publishing story
- **Cons**: the four shared modules and the chunking rules would live twice

### 2. Bundle from `src/` at publish time

- **Pros**: the application tree does not move
- **Cons**: the CLI exists only after a build; esbuild must resolve `#lib/*`; the
  published artifact is harder to audit

### 3. pnpm workspace with `packages/cli` owning the code (chosen)

- **Pros**: one implementation; the application keeps only `logger.js`; the
  published folder is `packages/cli`
- **Cons**: `pnpm-workspace.yaml` must be copied in the container build, and the
  root `package.json` gains a `workspace:*` devDependency

## Decision

Create `packages/cli`, named `sklein-bibliography-corpus-rag-manager-cli` (now
`@stephane-klein/sklein-bibliography-corpus-indexer-cli`), with the binary
`sklein-bibliography-corpus-rag-manager` (now
`sklein-bibliography-corpus-indexer`). The package owns the four commands, the
four former `src/lib/server/` modules, the chunking code and the sidecar
read/write code. The application keeps `src/lib/server/logger.js`.

The root package depends on the CLI through the workspace, so `pnpm install`
links the binary into `node_modules/.bin`. The repository runs the same code
that is published.

### Path contract

`<path>` is a required positional argument, resolved against the current
directory. The CLI walks up from that path to find a directory named `contents`;
`--contents-dir` overrides the search. A path at the corpus root means both
collections for the generation commands, `books/` for `import-books`, and
`single-document-texts/` for `import-single-documents`.

`import-single-documents` refuses a path under `books/`. Importing a book as flat
documents would write slugs and `markdown_source_file` values that differ from
the ones `import-books` writes for the same book.

### Options and environment

| Option           | Environment variable                                  | Default                  |
| ---------------- | ----------------------------------------------------- | ------------------------ |
| `--url`          | `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_URL`          | `http://localhost:5173`  |
| `--token`        | `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_TOKEN`        | none                     |
| `--contents-dir` | `SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_CONTENTS_DIR` | discovered from `<path>` |

These variables now use the `SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_*` prefix (the
names above are the historical record).

An option wins over its variable, which wins over the default. The token is the
super-admin token, the same value the server reads from
`SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_ADMIN_TOKEN` (now
`SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_ADMIN_TOKEN`). There is no local length
check: the server answers `401` when the token is wrong.

### Output and packaging

Log lines go to stderr with a small internal logger; `--verbose` switches to
debug. `pino` and `pino-pretty` are not dependencies of the package. The package
ships its sources with three runtime dependencies (`yargs`, `js-yaml`,
`gpt-tokenizer`) and needs Node.js 22.12 or later. Publishing is manual, through
the `publish-to-npmjs` task in `packages/cli/mise.toml`.

## Consequences

- Positive: one implementation, tested once, exercised by the repository
- Positive: existing sidecars and database rows stay valid, because the anchor
  is still `contents/`
- Positive: the package has no build step and few dependencies
- Negative: `<path>` is required, by design
- Negative: the container build copies `pnpm-workspace.yaml` and
  `packages/cli/package.json` before `pnpm install`
- Neutral: developers run the CLI command directly; there are no mise tasks for
  the four commands

## Related Files

| File                             | Purpose                                  |
| -------------------------------- | ---------------------------------------- |
| `packages/cli/src/cli.js`        | yargs wiring and error handling          |
| `packages/cli/src/context.js`    | `<path>` resolution and collection rules |
| `packages/cli/src/api-client.js` | URL/token resolution and HTTP calls      |
| `packages/cli/src/logger.js`     | stderr logger                            |
| `pnpm-workspace.yaml`            | workspace declaration                    |
| `mise.toml`                      | root tasks and zsh completion hooks      |
| `packages/cli/mise.toml`         | publish task                             |
| `packages/cli/README.md`         | user documentation                       |

#!/usr/bin/env node
import { createRequire } from "node:module";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runGenerateEmbeddings } from "./generate-embeddings.js";
import { runGenerateSidecars } from "./generate-sidecars.js";
import { runImportBooks } from "./import-books.js";
import { runImportSingleDocuments } from "./import-single-documents.js";
import { configureLogger } from "./logger.js";
import { runMigrateCorpus } from "./migrate-corpus.js";

const { version } = createRequire(import.meta.url)("../package.json");
const PROGRAM = "sklein-bibliography-corpus-rag-manager";

const handle = (run) => async (argv) => {
    configureLogger({ verbose: argv.verbose });

    try {
        await run(argv);
    } catch (error) {
        console.error(`error: ${error.message}`);

        if (argv.verbose && error.stack) {
            console.error(error.stack);
        }

        process.exitCode = 1;
    }
};

const dryRun = {
    describe: "Report changes without writing",
    type: "boolean",
    default: false,
};

const embeddingsOptions = (yargs) =>
    yargs
        .option("dry-run", dryRun)
        .option("skip-embeddings", {
            describe: "Import documents only, without their chunk embeddings",
            type: "boolean",
            default: false,
        })
        .option("require-embeddings", {
            describe: "Fail when a document has no embedding sidecar",
            type: "boolean",
            default: false,
        });

const cli = yargs(hideBin(process.argv))
    .scriptName("")
    .usage(`${PROGRAM} <command> <path> [options]`)
    .option("url", {
        describe: "Base URL of the webapp (default: SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_URL)",
        type: "string",
    })
    .option("token", {
        describe: "Admin token (default: SKLEIN_BIBLIOGRAPHY_CORPUS_RAG_MANAGER_TOKEN)",
        type: "string",
    })
    .option("contents-dir", {
        describe: "Corpus contents directory (default: discovered from <path>)",
        type: "string",
    })
    .option("verbose", {
        describe: "Print debug details and error stacks",
        type: "boolean",
        default: false,
    })
    .command(
        "generate-sidecars <path>",
        "Write one .md.yaml sidecar per Markdown document",
        (yargs) =>
            yargs
                .option("dry-run", {
                    describe: "Report what would be written without writing",
                    type: "boolean",
                    default: false,
                })
                .option("force", {
                    describe: "Regenerate sidecars even when the manifest matches",
                    type: "boolean",
                    default: false,
                }),
        handle((argv) =>
            runGenerateSidecars({
                path: argv.path,
                contentsDir: argv.contentsDir,
                dryRun: argv.dryRun,
                force: argv.force,
            }),
        ),
    )
    .command(
        "generate-embeddings <path>",
        "Generate .md.embeddings.bin files for the YAML sidecars",
        (yargs) =>
            yargs
                .option("dry-run", {
                    describe: "Report what would be embedded without generating vectors",
                    type: "boolean",
                    default: false,
                })
                .option("force", {
                    describe: "Regenerate embeddings even when they match",
                    type: "boolean",
                    default: false,
                }),
        handle((argv) =>
            runGenerateEmbeddings({
                path: argv.path,
                contentsDir: argv.contentsDir,
                url: argv.url,
                token: argv.token,
                dryRun: argv.dryRun,
                force: argv.force,
            }),
        ),
    )
    .command(
        "migrate-corpus <path>",
        "Rewrite sidecar manifests and embeddings headers to schema 2, without re-chunking or re-embedding",
        (yargs) =>
            yargs.option("dry-run", {
                describe: "Report what would be migrated without writing",
                type: "boolean",
                default: false,
            }),
        handle((argv) =>
            runMigrateCorpus({
                path: argv.path,
                contentsDir: argv.contentsDir,
                dryRun: argv.dryRun,
            }),
        ),
    )
    .command(
        "import-single-documents <path>",
        "Import standalone Markdown documents and their chunk embeddings",
        (yargs) =>
            embeddingsOptions(yargs).option("prune", {
                describe: "Delete rows whose source file no longer exists (directories only)",
                type: "boolean",
                default: false,
            }),
        handle((argv) =>
            runImportSingleDocuments({
                path: argv.path,
                contentsDir: argv.contentsDir,
                url: argv.url,
                token: argv.token,
                dryRun: argv.dryRun,
                prune: argv.prune,
                skipEmbeddings: argv.skipEmbeddings,
                requireEmbeddings: argv.requireEmbeddings,
            }),
        ),
    )
    .command(
        "import-books <path>",
        "Import books with their hierarchy and chunk embeddings",
        (yargs) =>
            embeddingsOptions(yargs).option("prune", {
                describe: "Delete book nodes no longer present in the imported tree",
                type: "boolean",
                default: false,
            }),
        handle((argv) =>
            runImportBooks({
                path: argv.path,
                contentsDir: argv.contentsDir,
                url: argv.url,
                token: argv.token,
                dryRun: argv.dryRun,
                prune: argv.prune,
                skipEmbeddings: argv.skipEmbeddings,
                requireEmbeddings: argv.requireEmbeddings,
            }),
        ),
    )
    .command(
        "completion",
        "Generate a shell completion script for bash or zsh",
        () => {},
        () => cli.showCompletionScript(PROGRAM, "completion"),
    )
    .demandCommand(1, `Use one of the available commands, or run \`${PROGRAM} --help\`.`)
    .strictCommands()
    .recommendCommands()
    .version(version)
    .help();

cli.parse();

import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import * as yaml from "js-yaml";
import { createApiClient, resolveApiOptions } from "./api-client.js";
import { resolveTarget } from "./context.js";
import { readEmbeddingsFile, writeEmbeddingsFile } from "./embeddings-file.js";
import { logger } from "./logger.js";
import { writeSidecarFile } from "./sidecar.js";

const EMBEDDING_INPUT_FORMAT = "heading_path_text_v1";
const EMBEDDING_INPUT_TYPE = "document";
const EMBEDDING_STRATEGY = "standard";
const EMBEDDING_FORMAT = "float32le";
const EMBEDDING_FORMAT_VERSION = 1;
const COST_BASIS = "list_price";
const MAX_TEXTS_PER_REQUEST = 128;
const MAX_CHARS_PER_REQUEST = 200_000;

export async function runGenerateEmbeddings({ path, contentsDir, url, token, dryRun, force }) {
    const context = await resolveTarget({ path, contentsDir, command: "generate-embeddings" });
    const api = createApiClient(resolveApiOptions({ url, token }));
    const sidecarPaths = await findSidecarPaths(context);

    logger.info(
        { path, kind: context.isDirectory ? "directory" : "file", files: sidecarPaths.length },
        "Found sidecar files",
    );

    let info;

    try {
        info = await fetchEmbeddingInfo(api);
    } catch (error) {
        throw new Error(`Could not read the embedding configuration: ${error.message}`, { cause: error });
    }

    logger.info(
        { provider: info.provider, model: info.model, query_model: info.query_model, dimension: info.dimension },
        "Embedding configuration",
    );

    const counts = { embedded: 0, skipped: 0, chunks: 0, tokens: 0, costUsd: 0, pricedFiles: 0, unpricedFiles: 0 };

    for (const sidecarPath of sidecarPaths) {
        const sourcePath = sidecarPath.replace(/\.yaml$/, "");

        if (!sourcePath.endsWith(".md")) {
            throw new Error(`Sidecar is not next to a Markdown file: ${sidecarPath}`);
        }

        const relativeToContents = relative(context.contentsDir, sourcePath).split(sep).join("/");

        try {
            await access(sidecarPath);
        } catch {
            throw new Error(`Sidecar not found: ${relativeToContents}.yaml; run generate-sidecars first`);
        }

        const document = yaml.load(await readFile(sidecarPath, "utf8"));
        const { manifest, chunks } = validateSourceSidecar(document, sourcePath, relativeToContents);
        const sourceHash = `sha256:${createHash("sha256")
            .update(await readFile(sourcePath))
            .digest("hex")}`;

        if (manifest.source_file_hash !== sourceHash) {
            throw new Error(`Sidecar is stale for ${relativeToContents}; run generate-sidecars first`);
        }

        if (!force && (await isCurrent(manifest, chunks, info, sourcePath))) {
            counts.skipped += 1;
            logger.info({ file: relativeToContents, chunks: chunks.length }, "Sidecar embeddings unchanged");
            continue;
        }

        if (dryRun) {
            counts.embedded += 1;
            counts.chunks += chunks.length;
            logger.info({ file: relativeToContents, chunks: chunks.length }, "Sidecar embeddings would be generated");
            continue;
        }

        const { embeddings, tokens, costUsd, costBasis, pricePerMillionTokensUsd } = await embedChunks(chunks, {
            api,
            info,
        });
        const binaryName = `${basename(sourcePath)}.embeddings.bin`;
        const binaryPath = join(dirname(sourcePath), binaryName);
        const header = {
            format: EMBEDDING_FORMAT,
            format_version: EMBEDDING_FORMAT_VERSION,
            provider: info.provider,
            model: info.model,
            dimension: info.dimension,
            chunk_count: chunks.length,
            source_file_hash: manifest.source_file_hash,
            input_format: EMBEDDING_INPUT_FORMAT,
            input_type: EMBEDDING_INPUT_TYPE,
            strategy: EMBEDDING_STRATEGY,
            cost:
                costUsd === null
                    ? null
                    : {
                          amount_usd: costUsd,
                          basis: costBasis,
                          tokens,
                          price_per_million_tokens_usd: pricePerMillionTokensUsd,
                      },
        };

        await writeEmbeddingsFile(binaryPath, { header, embeddings });
        await verifyWrittenEmbeddings(binaryPath, header, chunks.length);

        manifest.embedding_provider = info.provider;
        manifest.embedding_model = info.model;
        manifest.dimension = info.dimension;
        manifest.embedding_file = binaryName;
        manifest.embedding_format = EMBEDDING_FORMAT;
        manifest.embedding_input_format = EMBEDDING_INPUT_FORMAT;
        manifest.embedding_input_type = EMBEDDING_INPUT_TYPE;
        manifest.embedding_strategy = EMBEDDING_STRATEGY;
        await writeSidecarFile(sidecarPath, { manifest, chunks });

        counts.embedded += 1;
        counts.chunks += chunks.length;
        counts.tokens += tokens;

        if (costUsd === null) {
            counts.unpricedFiles += 1;
        } else {
            counts.costUsd += costUsd;
            counts.pricedFiles += 1;
        }

        logger.info(
            {
                file: relativeToContents,
                sidecar: `${relativeToContents}.yaml`,
                embeddings: binaryName,
                chunks: chunks.length,
                tokens,
                cost_usd: costUsd,
                cost_basis: costBasis,
                model: info.model,
                dimension: info.dimension,
            },
            "Sidecar embeddings generated",
        );
    }

    const totalCostUsd = dryRun
        ? null
        : counts.pricedFiles === 0 && counts.unpricedFiles > 0
          ? null
          : roundUsd(counts.costUsd);

    logger.info(
        {
            path,
            kind: context.isDirectory ? "directory" : "file",
            files: sidecarPaths.length,
            embedded: counts.embedded,
            skipped: counts.skipped,
            chunks: counts.chunks,
            tokens: counts.tokens,
            cost_usd: totalCostUsd,
            cost_currency: "USD",
            cost_basis: COST_BASIS,
            cost_partial: !dryRun && counts.unpricedFiles > 0,
            dry_run: dryRun,
            forced: force,
        },
        "Embedding generation done",
    );
}

async function findSidecarPaths({ target, isDirectory }) {
    if (!isDirectory) {
        const sidecarPath = `${target}.yaml`;

        try {
            await access(sidecarPath);
        } catch {
            throw new Error(`Sidecar not found: ${sidecarPath}; run generate-sidecars first`);
        }

        return [sidecarPath];
    }

    const sidecarPaths = (await readdir(target, { recursive: true }))
        .filter((fileName) => fileName.endsWith(".md.yaml"))
        .sort()
        .map((fileName) => join(target, fileName));

    if (sidecarPaths.length === 0) {
        throw new Error("No sidecar files found; run generate-sidecars first");
    }

    return sidecarPaths;
}

async function embedChunks(chunks, { api, info }) {
    const embeddings = [];
    let tokens = 0;
    let costUsd = 0;
    let costPriced = true;
    let costBasis = COST_BASIS;
    let pricePerMillionTokensUsd = null;

    for (const batch of splitEmbeddingInputs(chunks.map((chunk) => `${chunk.heading_path}\n\n${chunk.text}`))) {
        const data = await requestEmbeddings(api, batch);

        if (data.provider !== info.provider || data.model !== info.model || data.dimension !== info.dimension) {
            throw new Error(
                `Webapp returned ${data.provider}/${data.model}/${data.dimension}, expected ${info.provider}/${info.model}/${info.dimension}`,
            );
        }

        if (!Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) {
            throw new Error(`Webapp returned ${data.embeddings?.length ?? 0} vectors for ${batch.length} texts`);
        }

        embeddings.push(...data.embeddings);
        tokens += data.usage?.tokens ?? 0;

        if (typeof data.usage?.cost_usd === "number") {
            costUsd += data.usage.cost_usd;
        } else {
            costPriced = false;
        }

        if (typeof data.usage?.cost_basis === "string" && data.usage.cost_basis.trim()) {
            costBasis = data.usage.cost_basis;
        }

        if (typeof data.usage?.price_per_million_tokens_usd === "number") {
            pricePerMillionTokensUsd = data.usage.price_per_million_tokens_usd;
        }
    }

    if (embeddings.length !== chunks.length) {
        throw new Error(`Webapp returned ${embeddings.length} vectors for ${chunks.length} chunks`);
    }

    return {
        embeddings,
        tokens,
        costUsd: costPriced && pricePerMillionTokensUsd !== null ? roundUsd(costUsd) : null,
        costBasis,
        pricePerMillionTokensUsd,
    };
}

function splitEmbeddingInputs(texts) {
    const batches = [];
    let current = [];
    let currentChars = 0;

    for (const text of texts) {
        if (text.length > MAX_CHARS_PER_REQUEST) {
            throw new Error(`Embedding input exceeds ${MAX_CHARS_PER_REQUEST} characters`);
        }

        const batchIsFull =
            current.length >= MAX_TEXTS_PER_REQUEST || currentChars + text.length > MAX_CHARS_PER_REQUEST;

        if (current.length > 0 && batchIsFull) {
            batches.push(current);
            current = [];
            currentChars = 0;
        }

        current.push(text);
        currentChars += text.length;
    }

    if (current.length > 0) {
        batches.push(current);
    }

    return batches;
}

async function isCurrent(manifest, chunks, info, sourcePath) {
    if (manifest.embedding_provider !== info.provider) {
        return false;
    }

    if (manifest.embedding_model !== info.model || manifest.dimension !== info.dimension) {
        return false;
    }

    if (
        manifest.embedding_input_format !== EMBEDDING_INPUT_FORMAT ||
        manifest.embedding_input_type !== EMBEDDING_INPUT_TYPE ||
        manifest.embedding_strategy !== EMBEDDING_STRATEGY
    ) {
        return false;
    }

    if (manifest.embedding_format !== EMBEDDING_FORMAT) {
        return false;
    }

    if (typeof manifest.embedding_file !== "string" || basename(manifest.embedding_file) !== manifest.embedding_file) {
        return false;
    }

    try {
        const { header, embeddings } = await readEmbeddingsFile(join(dirname(sourcePath), manifest.embedding_file));

        return (
            header.format === EMBEDDING_FORMAT &&
            header.format_version === EMBEDDING_FORMAT_VERSION &&
            header.provider === info.provider &&
            header.model === info.model &&
            header.dimension === info.dimension &&
            header.chunk_count === chunks.length &&
            header.source_file_hash === manifest.source_file_hash &&
            header.input_format === EMBEDDING_INPUT_FORMAT &&
            header.input_type === EMBEDDING_INPUT_TYPE &&
            header.strategy === EMBEDDING_STRATEGY &&
            embeddings.length === chunks.length
        );
    } catch {
        return false;
    }
}

async function verifyWrittenEmbeddings(binaryPath, header, chunkCount) {
    const { header: writtenHeader, embeddings } = await readEmbeddingsFile(binaryPath);

    if (
        writtenHeader.provider !== header.provider ||
        writtenHeader.model !== header.model ||
        writtenHeader.dimension !== header.dimension ||
        writtenHeader.chunk_count !== header.chunk_count ||
        writtenHeader.source_file_hash !== header.source_file_hash ||
        writtenHeader.input_format !== header.input_format ||
        writtenHeader.input_type !== header.input_type ||
        writtenHeader.strategy !== header.strategy ||
        writtenHeader.cost?.amount_usd !== header.cost?.amount_usd ||
        writtenHeader.cost?.tokens !== header.cost?.tokens ||
        embeddings.length !== chunkCount
    ) {
        throw new Error(`Written embeddings file does not match its header: ${binaryPath}`);
    }
}

function roundUsd(value) {
    return Math.round(value * 1e9) / 1e9;
}

function validateSourceSidecar(document, sourcePath, relativeToContents) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
        throw new Error(`Sidecar must be a YAML object: ${sourcePath}`);
    }

    const { manifest, chunks } = document;

    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error(`Sidecar has no manifest: ${sourcePath}`);
    }

    if (!Array.isArray(chunks)) {
        throw new Error(`Sidecar has no chunks list: ${sourcePath}`);
    }

    if (manifest.type !== "manifest") {
        throw new Error(`Sidecar manifest type must be "manifest": ${sourcePath}`);
    }

    if (manifest.schema_version !== 1) {
        throw new Error(`Sidecar schema_version must be 1: ${sourcePath}`);
    }

    if (manifest.source_file !== relativeToContents) {
        throw new Error(`Sidecar source_file must be ${relativeToContents}: ${sourcePath}`);
    }

    if (manifest.chunk_count !== chunks.length) {
        throw new Error(`Sidecar chunk_count is ${manifest.chunk_count}, but chunks has ${chunks.length} items`);
    }

    for (const [index, chunk] of chunks.entries()) {
        if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
            throw new Error(`Sidecar chunk ${index} must be an object: ${sourcePath}`);
        }

        if (chunk.chunk_index !== index) {
            throw new Error(`Sidecar chunk_index must be ${index}: ${sourcePath}`);
        }

        if (typeof chunk.heading_path !== "string" || !chunk.heading_path.trim()) {
            throw new Error(`Sidecar chunk ${index} has no heading_path: ${sourcePath}`);
        }

        if (typeof chunk.text !== "string" || !chunk.text.trim()) {
            throw new Error(`Sidecar chunk ${index} has no text: ${sourcePath}`);
        }
    }

    return { manifest, chunks };
}

async function fetchEmbeddingInfo(api) {
    const data = await api.get("/api/v1/admin/embeddings", { timeoutMs: 30_000 });

    if (
        typeof data.provider !== "string" ||
        typeof data.model !== "string" ||
        !Number.isInteger(data.dimension) ||
        data.dimension <= 0
    ) {
        throw new Error("Webapp returned an invalid embedding configuration");
    }

    return data;
}

async function requestEmbeddings(api, texts) {
    return await api.post(
        "/api/v1/admin/embeddings",
        { texts, input_type: EMBEDDING_INPUT_TYPE },
        { timeoutMs: 180_000 },
    );
}

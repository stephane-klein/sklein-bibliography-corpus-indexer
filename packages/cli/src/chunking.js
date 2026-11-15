import { countTokens } from "gpt-tokenizer/encoding/cl100k_base";

export const TOKENIZER = "cl100k_base";
export const MAX_CHUNK_TOKENS = 1000;
export const SPLITTER = "sentences";

const SENTENCE_SEGMENTER = new Intl.Segmenter("fr", { granularity: "sentence" });

export function chunkMarkdown(body, title) {
    return parseBlocks(body, title)
        .flatMap((block) => splitBlock(block))
        .map((chunk, index) => ({
            chunk_index: index,
            heading_path: chunk.headingPath,
            content_token_count: chunk.tokenCount,
            text: chunk.text,
        }));
}

function parseBlocks(body, title) {
    const blocks = [];
    const headingStack = [];
    let currentLines = [];
    let currentHeadingPath = title;
    let fenceMarker = null;

    const flush = () => {
        if (currentLines.length > 0) {
            blocks.push({ text: currentLines.join("\n"), headingPath: currentHeadingPath });
            currentLines = [];
        }
    };

    for (const line of body.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (fenceMarker !== null) {
            currentLines.push(line);
            if (trimmed.startsWith(fenceMarker)) {
                fenceMarker = null;
            }
            continue;
        }

        if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
            flush();
            fenceMarker = trimmed.slice(0, 3);
            currentLines.push(line);
            continue;
        }

        if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
            flush();
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*$/);

        if (headingMatch) {
            flush();
            const level = headingMatch[1].length;
            const headingText = headingMatch[2].trim();

            if (level > 1 && headingText) {
                headingStack.length = Math.min(headingStack.length, level - 2);
                headingStack[level - 2] = headingText;
                currentHeadingPath = [title, ...headingStack.filter(Boolean)].join(" > ");
            }

            continue;
        }

        if (trimmed === "") {
            flush();
            continue;
        }

        currentLines.push(line);
    }

    flush();
    return blocks;
}

function splitBlock(block) {
    const text = block.text.trim();

    if (!text) {
        return [];
    }

    const tokenCount = countTokens(text);

    if (tokenCount <= MAX_CHUNK_TOKENS) {
        return [{ headingPath: block.headingPath, text, tokenCount }];
    }

    return splitLongText(text).map((chunkText) => ({
        headingPath: block.headingPath,
        text: chunkText,
        tokenCount: countTokens(chunkText),
    }));
}

function splitLongText(text) {
    const sentences = splitSentences(text);
    const chunks = [];
    let current = "";
    let lastSentence = "";

    for (const sentence of sentences) {
        if (!sentence.trim()) {
            continue;
        }

        if (countTokens(sentence) > MAX_CHUNK_TOKENS) {
            if (current) {
                chunks.push(current.trim());
                current = "";
                lastSentence = "";
            }
            chunks.push(...splitByWords(sentence));
            continue;
        }

        if (!current) {
            current = sentence;
            lastSentence = sentence;
            continue;
        }

        const candidate = current + sentence;

        if (countTokens(candidate) <= MAX_CHUNK_TOKENS) {
            current = candidate;
            lastSentence = sentence;
            continue;
        }

        chunks.push(current.trim());
        const withOverlap = lastSentence + sentence;
        current = countTokens(withOverlap) <= MAX_CHUNK_TOKENS ? withOverlap : sentence;
        lastSentence = sentence;
    }

    if (current) {
        chunks.push(current.trim());
    }

    return chunks;
}

function splitSentences(text) {
    // Replace soft line breaks with spaces before segmentation. The offsets stay
    // identical, so each sentence is sliced from the original text and keeps its
    // line breaks.
    const normalized = text.replace(/\n/g, " ");

    return Array.from(SENTENCE_SEGMENTER.segment(normalized), (segment) =>
        text.slice(segment.index, segment.index + segment.segment.length),
    );
}

function splitByWords(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;

        if (current && countTokens(candidate) > MAX_CHUNK_TOKENS) {
            chunks.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks;
}

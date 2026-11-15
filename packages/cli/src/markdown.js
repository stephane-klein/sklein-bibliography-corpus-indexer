import * as yaml from "js-yaml";

export function parseMarkdown(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

    if (!match) {
        return { frontmatter: {}, body: text };
    }

    const parsed = yaml.load(match[1]);
    const frontmatter = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};

    return { frontmatter, body: text.slice(match[0].length) };
}

export function titleOf(frontmatter, body, fallback) {
    if (typeof frontmatter.video_title === "string" && frontmatter.video_title.trim()) {
        return frontmatter.video_title.trim();
    }

    const heading = body.match(/^#\s+(.+?)\s*$/m);

    return heading ? heading[1].trim() : fallback;
}

export function normalizeSourceUrl(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeAuthors(value) {
    if (Array.isArray(value)) {
        return value.filter((author) => typeof author === "string" && author.trim()).map((author) => author.trim());
    }

    return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

export function normalizeOriginalPublishedDate(value) {
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }

    if (Number.isInteger(value)) {
        return String(value);
    }

    return null;
}

export function normalizeLanguage(value, fileName) {
    if (value === "fr" || value === "en") {
        return value;
    }

    return /\.en\.md$/.test(fileName) ? "en" : "fr";
}

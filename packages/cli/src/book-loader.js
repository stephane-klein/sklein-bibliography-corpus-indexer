import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import * as yaml from "js-yaml";
import { parseMarkdown } from "./markdown.js";

// A book directory holds a config.yaml and a markdown/ directory. A parent
// directory such as contents/books is accepted too: discoverBooks looks one
// level below it. The toc.yaml file belongs to epub-to-markdown; the importer
// never reads it.
export async function discoverBooks(target) {
    if (await isBookDir(target)) {
        return [target];
    }

    const entries = await readdir(target, { withFileTypes: true });
    const discovered = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const bookDir = join(target, entry.name);

        if (await isBookDir(bookDir)) {
            discovered.push(bookDir);
        }
    }

    if (discovered.length === 0) {
        throw new Error(`No book directory with a config.yaml and a markdown/ directory found under ${target}`);
    }

    return discovered.sort();
}

export async function isBookDir(bookDir) {
    const config = await stat(join(bookDir, "config.yaml")).catch(() => null);
    const markdown = await stat(join(bookDir, "markdown")).catch(() => null);

    return Boolean(config?.isFile() && markdown?.isDirectory());
}

export async function loadBook(bookDir) {
    const configPath = join(bookDir, "config.yaml");
    const config = yaml.load(await readFile(configPath, "utf8")) ?? {};

    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error(`Invalid config.yaml: ${configPath}`);
    }

    const markdownDir = join(bookDir, "markdown");
    const files = await Promise.all(
        (await readdir(markdownDir, { recursive: true }))
            .filter((fileName) => fileName.endsWith(".md"))
            .sort()
            .map(async (fileName) => {
                const raw = await readFile(join(markdownDir, fileName));
                const { frontmatter, body } = parseMarkdown(raw.toString("utf8"));

                return {
                    relativePath: fileName.split(sep).join("/"),
                    raw,
                    frontmatter,
                    body,
                };
            }),
    );

    return { config, files, bookDirName: basename(bookDir) };
}

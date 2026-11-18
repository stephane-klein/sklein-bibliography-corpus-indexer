import { basename } from "node:path";
import { markdownTitleOf } from "./markdown.js";

// Builds the document tree of one book from its config.yaml and the Markdown
// files found under markdown/. The function is pure: the caller reads the files
// and passes them in, which keeps the tree rules testable.
//
// The path frontmatter names the node: "book-i/chapter-i" is a child of the
// "book-i" directory. The ancestors frontmatter gives the title of each
// parent directory, because a path segment is a slug. A directory that has
// children and its own page stores that page in 00-index.md, whose path is the
// directory path itself.

export function buildBookTree({ config, files }) {
    const rootSlug = config?.slug;

    if (
        typeof rootSlug !== "string" ||
        rootSlug.length === 0 ||
        rootSlug.includes("/") ||
        rootSlug.split("/").includes("..")
    ) {
        throw new Error("config.yaml must define a single-segment slug");
    }

    const rootTitle = typeof config?.title === "string" ? config.title.trim() : "";

    if (rootTitle.length === 0) {
        throw new Error("config.yaml must define a title");
    }

    const excluded = new Set(Array.isArray(config.exclude) ? config.exclude : []);
    const bibliography = config.bibliography ?? {};

    const entries = files
        .filter((file) => !isExcluded(file, excluded))
        .map((file) => {
            const path = pathOf(file);
            validatePath(path, file);

            return {
                file,
                path,
                segments: path.split("/"),
                title: markdownTitleOf(file.frontmatter, file.body, basename(file.relativePath, ".md")),
            };
        })
        .sort((left, right) => compareStrings(left.path, right.path));

    const seenPaths = new Map();

    for (const entry of entries) {
        const previous = seenPaths.get(entry.path);

        if (previous) {
            throw new Error(
                `duplicate path "${entry.path}" in ${previous.relativePath} and ${entry.file.relativePath}`,
            );
        }

        seenPaths.set(entry.path, entry.file);
    }

    const directoryTitles = titlesOfDirectories(entries);
    const nodesByPath = new Map([["", { path: "", title: rootTitle, file: null, children: [] }]]);

    for (const entry of entries) {
        const descendantTitle = directoryTitles.get(entry.path);

        if (descendantTitle !== undefined && descendantTitle !== entry.title) {
            throw new Error(
                `conflicting titles for "${entry.path}": "${descendantTitle}" in its descendants and "${entry.title}" in ${entry.file.relativePath}`,
            );
        }

        nodesByPath.set(entry.path, {
            path: entry.path,
            title: entry.title,
            file: entry.file,
            children: [],
        });
    }

    for (const entry of entries) {
        for (let index = 1; index < entry.segments.length; index++) {
            const directoryPath = entry.segments.slice(0, index).join("/");

            if (nodesByPath.has(directoryPath)) {
                continue;
            }

            const title = directoryTitles.get(directoryPath);

            if (title === undefined) {
                throw new Error(
                    `cannot resolve the title of "${directoryPath}" for ${entry.file.relativePath}; add it to the ancestors frontmatter`,
                );
            }

            nodesByPath.set(directoryPath, { path: directoryPath, title, file: null, children: [] });
        }
    }

    for (const node of nodesByPath.values()) {
        if (node.path === "") {
            continue;
        }

        const parentPath = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
        nodesByPath.get(parentPath).children.push(node);
    }

    for (const node of nodesByPath.values()) {
        node.children.sort((left, right) => compareStrings(lastSegment(left.path), lastSegment(right.path)));
    }

    const nodes = [];

    function add(node, parentSlug, depth, position, breadcrumb) {
        const slug = node.path === "" ? rootSlug : `${rootSlug}/${node.path}`;
        const nodeBreadcrumb = [...breadcrumb, node.title];

        nodes.push({
            slug,
            parent_slug: parentSlug,
            depth,
            position,
            title: node.title,
            content: node.file?.body ?? "",
            file: node.file,
            metadata:
                node.path === ""
                    ? { bibliography, breadcrumb: nodeBreadcrumb }
                    : { ...(node.file?.frontmatter ?? {}), breadcrumb: nodeBreadcrumb },
        });

        node.children.forEach((child, index) => add(child, slug, depth + 1, index, nodeBreadcrumb));
    }

    add(nodesByPath.get(""), null, 0, 0, []);

    return nodes;
}

function pathOf(file) {
    const path = file.frontmatter?.path;

    return typeof path === "string" && path.trim() ? path.trim() : file.relativePath.replace(/\.md$/, "");
}

function validatePath(path, file) {
    if (path.startsWith("/") || path.endsWith("/") || path.includes("\\")) {
        throw new Error(`invalid path in ${file.relativePath}: "${path}"`);
    }

    for (const segment of path.split("/")) {
        if (segment === "" || segment === "." || segment === "..") {
            throw new Error(`invalid path in ${file.relativePath}: "${path}"`);
        }
    }
}

function isExcluded(file, excluded) {
    return excluded.has(file.relativePath) || excluded.has(`${pathOf(file)}.md`);
}

function titlesOfDirectories(entries) {
    const titles = new Map();

    for (const entry of entries) {
        const ancestors = ancestorsOf(entry.file);

        if (ancestors.length > entry.segments.length - 1) {
            throw new Error(
                `${entry.file.relativePath} has ${ancestors.length} ancestors for ${entry.segments.length - 1} parent directories`,
            );
        }

        ancestors.forEach((title, index) => {
            const directoryPath = entry.segments.slice(0, index + 1).join("/");
            const known = titles.get(directoryPath);

            if (known !== undefined && known !== title) {
                throw new Error(`conflicting ancestor titles for "${directoryPath}": "${known}" and "${title}"`);
            }

            titles.set(directoryPath, title);
        });
    }

    return titles;
}

function ancestorsOf(file) {
    const ancestors = file.frontmatter?.ancestors;

    if (ancestors === undefined) {
        return [];
    }

    if (!Array.isArray(ancestors)) {
        throw new Error(`frontmatter ancestors must be a list in ${file.relativePath}`);
    }

    return ancestors.map((title) => {
        if (typeof title !== "string" || title.trim().length === 0) {
            throw new Error(`invalid ancestor title in ${file.relativePath}`);
        }

        return title.trim();
    });
}

function lastSegment(path) {
    return path.slice(path.lastIndexOf("/") + 1);
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

import { stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const COLLECTION_ROOTS = {
    "single-document": "single-document-texts",
    book: "books",
};

const POLICY = {
    "generate-sidecars": ["single-document", "book", "root"],
    "generate-embeddings": ["single-document", "book", "root"],
    "import-books": ["book", "root"],
    "import-single-documents": ["single-document", "other", "root"],
};

// Resolves <path> against the current directory, then finds the contents
// directory that anchors it. The contents directory is what makes sidecar
// source_file values stable across machines, so it must be found, not guessed
// from the package location.
export async function resolveTarget({ path, contentsDir, command }) {
    if (!path) {
        throw new Error("<path> is required");
    }

    const target = resolve(process.cwd(), path);
    const targetStat = await statTarget(target, path);
    const isDirectory = targetStat.isDirectory();
    const contentsRoot = contentsDir
        ? await resolveExplicitContentsDir(contentsDir)
        : await discoverContentsDir(isDirectory ? target : dirname(target));

    if (!isInside(contentsRoot, target)) {
        throw new Error(`${path} is not inside the contents directory ${contentsRoot}`);
    }

    const relativeToContents = relative(contentsRoot, target).split(sep).join("/");
    const collection = collectionOf(relativeToContents);

    if (!POLICY[command].includes(collection)) {
        throw new Error(describeRefusal({ command, collection, contentsRoot, relativeToContents }));
    }

    return { contentsDir: contentsRoot, target, isDirectory, collection, relativeToContents };
}

export function collectionRoot(contentsDir, collection) {
    return join(contentsDir, COLLECTION_ROOTS[collection]);
}

export async function assertDirectory(path) {
    const info = await stat(path).catch(() => null);

    if (!info?.isDirectory()) {
        throw new Error(`Directory not found: ${path}`);
    }
}

export function isInside(root, target) {
    const relativePath = relative(root, target);

    return (
        relativePath === "" ||
        (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
    );
}

async function statTarget(target, displayPath) {
    try {
        return await stat(target);
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`Path does not exist: ${displayPath}`, { cause: error });
        }

        throw error;
    }
}

async function resolveExplicitContentsDir(contentsDir) {
    const contentsRoot = resolve(process.cwd(), contentsDir);
    const info = await statTarget(contentsRoot, contentsDir);

    if (!info.isDirectory()) {
        throw new Error(`Contents directory is not a directory: ${contentsDir}`);
    }

    return contentsRoot;
}

async function discoverContentsDir(start) {
    let current = start;

    while (true) {
        if (basename(current) === "contents") {
            return current;
        }

        const parent = dirname(current);

        if (parent === current) {
            throw new Error(`No contents directory found above ${start}; pass --contents-dir`);
        }

        current = parent;
    }
}

function collectionOf(relativeToContents) {
    if (relativeToContents === "") {
        return "root";
    }

    if (isWithin(relativeToContents, COLLECTION_ROOTS["single-document"])) {
        return "single-document";
    }

    if (isWithin(relativeToContents, COLLECTION_ROOTS.book)) {
        return "book";
    }

    return "other";
}

function isWithin(relativeToContents, root) {
    return relativeToContents === root || relativeToContents.startsWith(`${root}/`);
}

function describeRefusal({ command, collection, contentsRoot, relativeToContents }) {
    const display = relativeToContents === "" ? contentsRoot : join(contentsRoot, relativeToContents);

    if (command === "import-books" && collection === "single-document") {
        return `${display} is not a book directory; import-books expects a path inside ${collectionRoot(contentsRoot, "book")}`;
    }

    if (command === "import-single-documents" && collection === "book") {
        return `${display} is inside ${collectionRoot(contentsRoot, "book")}; use import-books for book contents`;
    }

    if (collection === "other") {
        return `${display} is not a supported collection; expected a path inside ${collectionRoot(contentsRoot, "single-document")} or ${collectionRoot(contentsRoot, "book")}`;
    }

    return `${display} is not a supported target for ${command}`;
}

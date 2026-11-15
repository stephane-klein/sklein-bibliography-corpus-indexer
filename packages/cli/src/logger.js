const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LABELS = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR" };
const COLORS = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" };
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const SIMPLE_VALUE = /^[A-Za-z0-9_./:@-]+$/;

let threshold = LEVELS.info;

const useColor = process.stderr.isTTY === true;

export function configureLogger({ verbose = false } = {}) {
    threshold = verbose ? LEVELS.debug : LEVELS.info;
}

function timestamp() {
    const now = new Date();
    const pad = (value, size = 2) => String(value).padStart(size, "0");

    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function formatValue(value) {
    if (value instanceof Error) {
        return value.stack?.split("\n")[0] ?? String(value);
    }

    if (typeof value === "string") {
        return SIMPLE_VALUE.test(value) ? value : JSON.stringify(value);
    }

    if (value !== null && typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

function formatFields(fields) {
    const entries = Object.entries(fields ?? {}).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
        return "";
    }

    return ` ${entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" ")}`;
}

function write(level, fields, message) {
    if (LEVELS[level] < threshold) {
        return;
    }

    const head = useColor
        ? `${DIM}${timestamp()}${RESET} ${COLORS[level]}${LABELS[level]}${RESET}`
        : `${timestamp()} ${LABELS[level]}`;

    process.stderr.write(`${head} ${message}${formatFields(fields)}\n`);
}

function logAt(level) {
    return (fields, message) => {
        if (typeof fields === "string") {
            write(level, {}, fields);
        } else {
            write(level, fields, message);
        }
    };
}

export const logger = {
    debug: logAt("debug"),
    info: logAt("info"),
    warn: logAt("warn"),
    error: logAt("error"),
};

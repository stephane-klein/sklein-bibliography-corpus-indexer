const URL_VARIABLE = "SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_URL";
const TOKEN_VARIABLE = "SKLEIN_BIBLIOGRAPHY_CORPUS_INDEXER_TOKEN";
const DEFAULT_URL = "http://localhost:5173";

export function resolveApiOptions({ url, token }, env = process.env) {
    return {
        url: normalizeUrl(url || env[URL_VARIABLE] || DEFAULT_URL),
        token: requireToken(token || env[TOKEN_VARIABLE]),
    };
}

export function createApiClient({ url, token }) {
    async function request(method, path, { body, timeoutMs = 180_000 } = {}) {
        const headers = { Authorization: `Bearer ${token}` };
        const payload = body === undefined ? undefined : JSON.stringify(body);

        if (payload !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const endpoint = `${url}${path}`;
        let response;

        try {
            response = await fetch(endpoint, {
                method,
                headers,
                body: payload,
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            throw new Error(`Could not reach ${endpoint}: ${error.cause?.message ?? error.message}`, { cause: error });
        }

        const result = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(result?.detail || `HTTP ${response.status} from ${endpoint}`);
        }

        if (!result?.data) {
            throw new Error(`Invalid response from ${endpoint}`);
        }

        return result.data;
    }

    return {
        get(path, options) {
            return request("GET", path, options);
        },
        post(path, body, options) {
            return request("POST", path, { body, ...options });
        },
        put(path, body, options) {
            return request("PUT", path, { body, ...options });
        },
    };
}

function requireToken(token) {
    if (token) {
        return token;
    }

    throw new Error(`A token is required; pass --token or set ${TOKEN_VARIABLE}`);
}

function normalizeUrl(value) {
    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Invalid URL: ${value}`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`URL must use http or https: ${value}`);
    }

    return value.replace(/\/+$/, "");
}

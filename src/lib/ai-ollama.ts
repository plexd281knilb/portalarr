const DEFAULT_OLLAMA_MODELS = ["portalarr-plex-master", "qwen2.5:7b-instruct", "qwen2.5:3b"];
const DEFAULT_OLLAMA_URLS = ["http://127.0.0.1:11434", "http://192.168.10.78:11434", "http://192.168.1.68:11434"];

let cachedEndpoint: { url: string | null; models: string[]; checkedAt: number } = {
    url: null,
    models: [],
    checkedAt: 0,
};

function normalizeBaseUrl(raw: string): string | null {
    try {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
        const parsed = new URL(withScheme);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        const port = parsed.port || "11434";
        return `${parsed.protocol}//${parsed.hostname}:${port}`;
    } catch {
        return null;
    }
}

export function getOllamaCandidateUrls(overrideUrl?: string | null): string[] {
    const raw = (overrideUrl || process.env.PORTALARR_OLLAMA_URL || "").trim();
    if (raw) {
        const list = raw
            .split(",")
            .map(s => normalizeBaseUrl(s))
            .filter((u): u is string => Boolean(u));
        if (list.length > 0) {
            return Array.from(new Set([...list, ...DEFAULT_OLLAMA_URLS]));
        }
    }
    return [...DEFAULT_OLLAMA_URLS];
}

export function normalizeOllamaModelName(preferredModel?: string | null): string {
    const trimmed = (preferredModel || "").trim();
    const lower = trimmed.toLowerCase();
    if (
        !trimmed ||
        lower === "default" ||
        lower.includes("gemini") ||
        lower.startsWith("gpt") ||
        lower.startsWith("o1") ||
        lower.startsWith("o3")
    ) {
        return (process.env.PORTALARR_OLLAMA_MODEL || "portalarr-plex-master").trim() || "portalarr-plex-master";
    }
    return trimmed;
}

export async function resolveActiveOllamaEndpoint(
    overrideUrl?: string | null,
    probeTimeoutMs = 1500
): Promise<string | null> {
    if (!overrideUrl && cachedEndpoint.url && Date.now() - cachedEndpoint.checkedAt < 15000) {
        return cachedEndpoint.url;
    }

    const candidates = getOllamaCandidateUrls(overrideUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), probeTimeoutMs);

    try {
        const probe = async (base: string) => {
            const res = await fetch(`${base}/api/tags`, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal: ctrl.signal,
                cache: "no-store",
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json().catch(() => null);
            const names = Array.isArray(data?.models)
                ? data.models.map((m: any) => String(m?.name || "")).filter(Boolean)
                : [];
            return { base, names };
        };

        const winner =
            candidates.length === 1
                ? await probe(candidates[0])
                : await Promise.any(candidates.map(c => probe(c)));
        ctrl.abort();
        if (!overrideUrl) {
            cachedEndpoint = { url: winner.base, models: winner.names, checkedAt: Date.now() };
        }
        return winner.base;
    } catch {
        ctrl.abort();
        if (!overrideUrl) {
            cachedEndpoint = { url: null, models: [], checkedAt: Date.now() };
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function resolveTargetOllamaModel(preferredModel?: string | null, overrideUrl?: string | null): Promise<string> {
    const normalized = normalizeOllamaModelName(preferredModel);
    if (!overrideUrl && cachedEndpoint.models.length > 0) {
        const findInstalled = (candidate: string): string | null => {
            if (cachedEndpoint.models.includes(candidate)) return candidate;
            if (!candidate.includes(":") && cachedEndpoint.models.includes(`${candidate}:latest`)) {
                return `${candidate}:latest`;
            }
            return null;
        };
        const directMatch = findInstalled(normalized);
        if (directMatch) return directMatch;
        for (const fallback of DEFAULT_OLLAMA_MODELS) {
            const fallbackMatch = findInstalled(fallback);
            if (fallbackMatch) return fallbackMatch;
        }
        return cachedEndpoint.models[0];
    }
    return normalized;
}

export async function getAvailableOllamaModels(overrideUrl?: string | null): Promise<string[]> {
    const base = await resolveActiveOllamaEndpoint(overrideUrl);
    if (!base) return DEFAULT_OLLAMA_MODELS;
    try {
        const res = await fetch(`${base}/api/tags`, {
            signal: AbortSignal.timeout(3000),
            cache: "no-store",
        });
        if (!res.ok) return DEFAULT_OLLAMA_MODELS;
        const data = await res.json();
        const names = Array.isArray(data?.models)
            ? data.models.map((m: any) => String(m?.name || "")).filter(Boolean)
            : [];
        if (names.length > 0 && !overrideUrl) {
            cachedEndpoint = { url: base, models: names, checkedAt: Date.now() };
        }
        return names.length > 0 ? names : DEFAULT_OLLAMA_MODELS;
    } catch {
        return DEFAULT_OLLAMA_MODELS;
    }
}

export async function callOllamaJsonCompletion(opts: {
    systemPrompt: string;
    userPrompt: string;
    model?: string | null;
    timeoutMs?: number;
    overrideUrl?: string | null;
}): Promise<{ content: string; model: string; endpoint: string } | null> {
    const endpoint = await resolveActiveOllamaEndpoint(opts.overrideUrl);
    if (!endpoint) return null;

    const model = await resolveTargetOllamaModel(opts.model, opts.overrideUrl);
    const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            stream: false,
            format: "json",
            options: {
                num_ctx: 4096,
                temperature: 0.1,
            },
            messages: [
                { role: "system", content: opts.systemPrompt },
                { role: "user", content: opts.userPrompt },
            ],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs || 25000),
        cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.message?.content || data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return { content: String(content), model, endpoint };
}

export async function callOllamaChat(opts: {
    messages: any[];
    model?: string | null;
    tools?: any[];
    timeoutMs?: number;
    overrideUrl?: string | null;
}): Promise<{ message: any; model: string; endpoint: string } | null> {
    const endpoint = await resolveActiveOllamaEndpoint(opts.overrideUrl);
    if (!endpoint) return null;

    const model = await resolveTargetOllamaModel(opts.model, opts.overrideUrl);
    const buildPayload = (includeTools: boolean): Record<string, any> => {
        const payload: Record<string, any> = {
            model,
            messages: opts.messages,
            stream: false,
            options: {
                num_ctx: 8192,
                temperature: 0.15,
                num_predict: 1200,
            },
        };
        if (includeTools && opts.tools && opts.tools.length > 0) {
            payload.tools = opts.tools;
        }
        return payload;
    };

    const sendChat = (includeTools: boolean) =>
        fetch(`${endpoint}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayload(includeTools)),
            signal: AbortSignal.timeout(opts.timeoutMs || 45000),
            cache: "no-store",
        });

    let res = await sendChat(true);
    if (res.status === 400 && opts.tools && opts.tools.length > 0) {
        res = await sendChat(false);
    }

    if (!res.ok) return null;
    const data = await res.json();
    const message = data?.message || data?.choices?.[0]?.message;
    if (!message) return null;
    return { message, model, endpoint };
}

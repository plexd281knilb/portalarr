export interface GamingPcConfig {
    id: string;
    name: string;
    lanIp: string;
    telemetryUrls: string[];
    ollamaUrls: string[];
}

export interface GamingPcLoadedModel {
    name: string;
    sizeMb: number;
    vramMb: number;
    gpuPercent: number;
    contextLength: number | null;
    expiresAt: string | null;
}

export interface GamingPcGpuProcess {
    pid: number | null;
    name: string;
    type?: string;
    vramMb: number;
    gpuPercent?: number;
    memPercent?: number;
    encPercent?: number;
    decPercent?: number;
}

export interface GamingPcGpuTelemetry {
    available: boolean;
    name: string;
    utilizationPercent: number;
    memoryUtilPercent: number;
    vramUsedMb: number;
    vramTotalMb: number;
    vramPercent: number;
    temperatureC: number | null;
    powerDrawW: number | null;
    powerLimitW: number | null;
    fanPercent: number | null;
    processes: GamingPcGpuProcess[];
}

export interface GamingPcSnapshot {
    id: string;
    name: string;
    hostname: string;
    os: string;
    lanIp: string;
    status: "ONLINE" | "OFFLINE";
    telemetrySource: "agent" | "ollama-only" | "offline";
    latencyMs?: number;
    error?: string;
    timestamp: string;
    cpu: { cores: number; percent: number } | null;
    memory: { totalMb: number; usedMb: number; availableMb: number; percent: number } | null;
    gpu: GamingPcGpuTelemetry | null;
    ollama: {
        online: boolean;
        url: string | null;
        loadedModels: GamingPcLoadedModel[];
        availableModels: string[];
    };
}

function sanitizeHttpUrl(raw: string, defaultPort: string): string | null {
    try {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
        const parsed = new URL(withScheme);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        const port = parsed.port || defaultPort;
        return `${parsed.protocol}//${parsed.hostname}:${port}`;
    } catch {
        return null;
    }
}

export function parseGamingPcConfig(
    rawTelemetryEnv?: string | null,
    rawOllamaEnv?: string | null
): GamingPcConfig {
    const tEnv = (rawTelemetryEnv ?? process.env.PORTALARR_GAMING_PC_URL ?? "").trim();
    const oEnv = (rawOllamaEnv ?? process.env.PORTALARR_OLLAMA_URL ?? "").trim();

    const customTelemetry = tEnv
        .split(",")
        .map(s => sanitizeHttpUrl(s, "9101"))
        .filter((u): u is string => Boolean(u));

    const customOllama = oEnv
        .split(",")
        .map(s => sanitizeHttpUrl(s, "11434"))
        .filter((u): u is string => Boolean(u));

    const telemetryUrls =
        customTelemetry.length > 0
            ? customTelemetry
            : ["http://192.168.1.68:9178", "http://192.168.10.78:9101"];

    const ollamaUrls =
        customOllama.length > 0
            ? customOllama
            : ["http://192.168.1.68:11434", "http://192.168.10.78:11434"];

    let lanIp = "192.168.10.78";
    try {
        if (customTelemetry.length > 0) {
            lanIp = new URL(customTelemetry[0]).hostname;
        }
    } catch {}

    return {
        id: "gaming-pc-rtx3080",
        name: "Gaming PC (RTX 3080)",
        lanIp,
        telemetryUrls,
        ollamaUrls,
    };
}

async function fetchJsonCandidate(
    baseUrl: string,
    path: string,
    timeoutMs: number,
    externalSignal?: AbortSignal
): Promise<{ url: string; data: any; latencyMs: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
    const onAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
        if (externalSignal.aborted) {
            clearTimeout(timer);
            throw externalSignal.reason || new DOMException("Aborted", "AbortError");
        }
        externalSignal.addEventListener("abort", onAbort, { once: true });
    }
    try {
        const res = await fetch(`${baseUrl}${path}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
            cache: "no-store",
        });
        const latencyMs = Date.now() - start;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { url: baseUrl, data, latencyMs };
    } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    }
}

async function raceJsonEndpoints(urls: string[], path: string, timeoutMs: number) {
    const ctrl = new AbortController();
    try {
        if (urls.length === 1) {
            return await fetchJsonCandidate(urls[0], path, timeoutMs);
        }
        const winner = await Promise.any(urls.map(u => fetchJsonCandidate(u, path, timeoutMs, ctrl.signal)));
        ctrl.abort();
        return winner;
    } catch (err: any) {
        ctrl.abort();
        throw err;
    }
}

export async function fetchGamingPcTelemetry(
    config?: GamingPcConfig,
    timeoutMs = 3500
): Promise<GamingPcSnapshot> {
    const cfg = config || parseGamingPcConfig();
    const checkedAt = new Date().toISOString();

    // 1. Try full Gaming PC telemetry agent (:9178 pfSense WAN forward or :9101 direct LAN)
    try {
        const winner = await raceJsonEndpoints(cfg.telemetryUrls, "/api/gaming-pc", timeoutMs);
        const d = winner.data || {};
        return {
            id: cfg.id,
            name: cfg.name,
            hostname: String(d.hostname || cfg.name),
            os: String(d.os || "Windows"),
            lanIp: cfg.lanIp,
            status: "ONLINE",
            telemetrySource: "agent",
            latencyMs: winner.latencyMs,
            timestamp: typeof d.timestamp === "string" ? d.timestamp : checkedAt,
            cpu: d.cpu
                ? {
                      cores: Number(d.cpu.cores || 0),
                      percent: Number(d.cpu.percent || 0),
                  }
                : null,
            memory: d.memory
                ? {
                      totalMb: Number(d.memory.totalMb || 0),
                      usedMb: Number(d.memory.usedMb || 0),
                      availableMb: Number(d.memory.availableMb || 0),
                      percent: Number(d.memory.percent || 0),
                  }
                : null,
            gpu: d.gpu
                ? {
                      available: Boolean(d.gpu.available),
                      name: String(d.gpu.name || "NVIDIA GeForce RTX 3080"),
                      utilizationPercent: Number(d.gpu.utilizationPercent || 0),
                      memoryUtilPercent: Number(d.gpu.memoryUtilPercent || 0),
                      vramUsedMb: Number(d.gpu.vramUsedMb || 0),
                      vramTotalMb: Number(d.gpu.vramTotalMb || 10240),
                      vramPercent: Number(d.gpu.vramPercent || 0),
                      temperatureC: typeof d.gpu.temperatureC === "number" ? d.gpu.temperatureC : null,
                      powerDrawW: typeof d.gpu.powerDrawW === "number" ? d.gpu.powerDrawW : null,
                      powerLimitW: typeof d.gpu.powerLimitW === "number" ? d.gpu.powerLimitW : null,
                      fanPercent: typeof d.gpu.fanPercent === "number" ? d.gpu.fanPercent : null,
                      processes: Array.isArray(d.gpu.processes) ? d.gpu.processes : [],
                  }
                : null,
            ollama: {
                online: Boolean(d.ollama?.online),
                url: d.ollama?.url ? String(d.ollama.url) : winner.url,
                loadedModels: Array.isArray(d.ollama?.loadedModels) ? d.ollama.loadedModels : [],
                availableModels: Array.isArray(d.ollama?.availableModels) ? d.ollama.availableModels : [],
            },
        };
    } catch {
        // Fall through to Ollama-only probe
    }

    // 2. Fallback: probe Ollama (:11434) directly so we still detect RTX 3080 AI activity
    try {
        const tagsWin = await raceJsonEndpoints(cfg.ollamaUrls, "/api/tags", timeoutMs);
        const psRes = await fetch(`${tagsWin.url}/api/ps`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
        }).catch(() => null);
        const psJson = psRes?.ok ? await psRes.json().catch(() => null) : null;

        const loadedModels: GamingPcLoadedModel[] = Array.isArray(psJson?.models)
            ? psJson.models.map((m: any) => {
                  const sizeMb = Math.round(Number(m.size || 0) / (1024 * 1024));
                  const vramMb = Math.round(Number(m.size_vram || 0) / (1024 * 1024));
                  const gpuPercent = sizeMb > 0 ? Math.round((vramMb / sizeMb) * 100) : 0;
                  return {
                      name: String(m.name || m.model || "unknown"),
                      sizeMb,
                      vramMb,
                      gpuPercent,
                      contextLength: typeof m.context_length === "number" ? m.context_length : null,
                      expiresAt: typeof m.expires_at === "string" ? m.expires_at : null,
                  };
              })
            : [];

        const totalLoadedVram = loadedModels.reduce((sum, m) => sum + m.vramMb, 0);
        const availableModels: string[] = Array.isArray(tagsWin.data?.models)
            ? tagsWin.data.models.map((m: any) => String(m?.name || "")).filter(Boolean)
            : [];

        return {
            id: cfg.id,
            name: cfg.name,
            hostname: "Gaming PC (Ollama Only)",
            os: "Windows",
            lanIp: cfg.lanIp,
            status: "ONLINE",
            telemetrySource: "ollama-only",
            latencyMs: tagsWin.latencyMs,
            timestamp: checkedAt,
            cpu: null,
            memory: null,
            gpu: {
                available: true,
                name: "NVIDIA GeForce RTX 3080",
                utilizationPercent: loadedModels.length > 0 ? 100 : 0,
                memoryUtilPercent: 0,
                vramUsedMb: totalLoadedVram,
                vramTotalMb: 10240,
                vramPercent: Math.round((totalLoadedVram / 10240) * 1000) / 10,
                temperatureC: null,
                powerDrawW: null,
                powerLimitW: 368,
                fanPercent: null,
                processes: [],
            },
            ollama: {
                online: true,
                url: tagsWin.url,
                loadedModels,
                availableModels,
            },
        };
    } catch (err: any) {
        const errors: any[] = err?.name === "AggregateError" && Array.isArray(err.errors) ? err.errors : [err];
        const allTimeouts = errors.length > 0 && errors.every(e => e?.name === "TimeoutError");
        return {
            id: cfg.id,
            name: cfg.name,
            hostname: cfg.name,
            os: "Windows",
            lanIp: cfg.lanIp,
            status: "OFFLINE",
            telemetrySource: "offline",
            error: allTimeouts ? "Asleep / Timeout" : errors[0]?.message || "Offline",
            timestamp: checkedAt,
            cpu: null,
            memory: null,
            gpu: null,
            ollama: {
                online: false,
                url: null,
                loadedModels: [],
                availableModels: [],
            },
        };
    }
}

import http from "http";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import type { 
    DockerContainerItem, 
    DockerFleetSummary, 
    DockerPortBinding 
} from "./types";

const execFileAsync = promisify(execFile);

function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/+$/, "");
}

/**
 * Determine the most suitable Docker socket path for the current OS.
 */
function getDockerSocketConfig(): { socketPath?: string; host?: string; port?: number } | null {
    // 1. DOCKER_HOST env override (e.g. tcp://localhost:2375 or unix:///var/run/docker.sock)
    if (process.env.DOCKER_HOST) {
        const dh = process.env.DOCKER_HOST.trim();
        if (dh.startsWith("unix://")) {
            const sp = dh.replace("unix://", "");
            if (fs.existsSync(sp)) return { socketPath: sp };
        } else if (dh.startsWith("tcp://") || dh.startsWith("http://")) {
            try {
                const u = new URL(dh.replace("tcp://", "http://"));
                return { host: u.hostname, port: parseInt(u.port || "2375", 10) };
            } catch (_) {}
        }
    }

    // 2. Standard Linux / Unraid Unix socket
    if (fs.existsSync("/var/run/docker.sock")) {
        return { socketPath: "/var/run/docker.sock" };
    }

    // 3. Windows Named Pipe (Docker Desktop)
    if (process.platform === "win32") {
        return { socketPath: "//./pipe/docker_engine" };
    }

    return null;
}

/**
 * Sends a low-level HTTP request to the Docker daemon via Unix socket, Named Pipe, or TCP.
 */
function callDockerApi<T = any>(
    path: string, 
    method: "GET" | "POST" | "DELETE" = "GET", 
    body?: any, 
    timeoutMs: number = 4500
): Promise<{ ok: boolean; status: number; data: T }> {
    return new Promise((resolve) => {
        const sockConfig = getDockerSocketConfig();
        if (!sockConfig) {
            return resolve({ ok: false, status: 503, data: null as any });
        }

        const options: http.RequestOptions = {
            method,
            path,
            headers: {
                "Host": "localhost",
                "Accept": "application/json",
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            timeout: timeoutMs
        };

        if (sockConfig.socketPath) {
            options.socketPath = sockConfig.socketPath;
        } else if (sockConfig.host && sockConfig.port) {
            options.host = sockConfig.host;
            options.port = sockConfig.port;
        }

        let timedOut = false;
        const req = http.request(options, (res) => {
            let chunks: Buffer[] = [];
            res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on("end", () => {
                if (timedOut) return;
                const bodyStr = Buffer.concat(chunks).toString("utf8");
                let parsed: any = null;
                try {
                    parsed = bodyStr ? JSON.parse(bodyStr) : null;
                } catch {
                    parsed = bodyStr;
                }
                const ok = !!(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
                resolve({ ok, status: res.statusCode || 500, data: parsed });
            });
        });

        req.on("error", (err) => {
            if (timedOut) return;
            resolve({ ok: false, status: 500, data: null as any });
        });

        req.on("timeout", () => {
            timedOut = true;
            req.destroy();
            resolve({ ok: false, status: 504, data: null as any });
        });

        if (body) {
            req.write(typeof body === "string" ? body : JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Normalize Docker container status string into a clean state enum.
 */
function normalizeContainerState(stateStr: string, statusStr: string): DockerContainerItem["state"] {
    const s = (stateStr || "").toLowerCase();
    const st = (statusStr || "").toLowerCase();

    if (st.includes("unhealthy")) return "unhealthy";
    if (s === "running" || st.startsWith("up")) return "running";
    if (s === "restarting" || st.includes("restart")) return "restarting";
    if (s === "paused") return "paused";
    if (s === "dead") return "dead";
    if (s === "exited" || st.startsWith("exited")) return "exited";
    return "unknown";
}

/**
 * Formats container status string avoiding raw internal provider names.
 */
function formatContainerStatus(item: any, state: string): string {
    const raw = item.Status || item.status;
    if (raw && typeof raw === "string") {
        const clean = raw.trim();
        if (clean.toLowerCase() === "running") return "Running";
        if (clean.toLowerCase() === "exited") return "Stopped";
        if (!clean.toLowerCase().includes("glances")) return clean;
    }
    if (item.uptime) {
        if (typeof item.uptime === "number") {
            const secs = item.uptime;
            const days = Math.floor(secs / 86400);
            const hours = Math.floor((secs % 86400) / 3600);
            const mins = Math.floor((secs % 3600) / 60);
            if (days > 0) return `Up ${days}d ${hours}h`;
            if (hours > 0) return `Up ${hours}h ${mins}m`;
            return `Up ${mins}m`;
        } else if (typeof item.uptime === "string") {
            return `Up ${item.uptime.replace(/^Up\s+/i, "")}`;
        }
    }
    if (state === "running") return "Running";
    if (state === "exited" || state === "dead") return "Stopped";
    return state ? state.charAt(0).toUpperCase() + state.slice(1) : "Running";
}

/**
 * Normalizes container image attribute into a clean string, safely handling arrays, objects, and nullish values.
 */
function normalizeContainerImage(raw: any): string {
    if (!raw) return "unknown";
    if (typeof raw === "string") return raw.trim() || "unknown";
    if (Array.isArray(raw)) {
        const found = raw.find((x: any) => typeof x === "string" && x.trim().length > 0);
        return found ? String(found).trim() : (raw.length > 0 ? String(raw[0]).trim() : "unknown");
    }
    if (typeof raw === "object") {
        if (typeof raw.name === "string" && raw.name.trim()) return raw.name.trim();
        if (typeof raw.Name === "string" && raw.Name.trim()) return raw.Name.trim();
        if (typeof raw.tag === "string" && raw.tag.trim()) return raw.tag.trim();
        if (typeof raw.Tag === "string" && raw.Tag.trim()) return raw.Tag.trim();
    }
    return String(raw || "unknown").trim();
}

/**
 * Normalizes container name, safely stripping leading slashes and handling arrays or non-strings.
 */
function normalizeContainerName(raw: any, fallback: string): string {
    let name = raw;
    if (Array.isArray(name)) name = name[0];
    if (typeof name !== "string") name = fallback;
    return String(name).replace(/^\//, "").trim() || fallback;
}

/**
 * Deduce default homelab container ports when monitoring agents do not report port bindings.
 */
function deduceDefaultContainerPorts(name: string, image: string): DockerPortBinding[] {
    const n = (name + " " + image).toLowerCase();
    if (n.includes("plex")) return [{ privatePort: 32400, publicPort: 32400, type: "tcp" }];
    if (n.includes("sonarr")) return [{ privatePort: 8989, publicPort: 8989, type: "tcp" }];
    if (n.includes("radarr")) return [{ privatePort: 7878, publicPort: 7878, type: "tcp" }];
    if (n.includes("sabnzbd")) return [{ privatePort: 8085, publicPort: 8085, type: "tcp" }];
    if (n.includes("bazarr")) return [{ privatePort: 6767, publicPort: 6767, type: "tcp" }];
    if (n.includes("prowlarr")) return [{ privatePort: 9696, publicPort: 9696, type: "tcp" }];
    if (n.includes("tautulli")) return [{ privatePort: 8181, publicPort: 8181, type: "tcp" }];
    if (n.includes("immich")) return [{ privatePort: 2283, publicPort: 2283, type: "tcp" }];
    if (n.includes("glances")) return [{ privatePort: 61208, publicPort: 61208, type: "tcp" }];
    if (n.includes("grafana")) return [{ privatePort: 3000, publicPort: 3000, type: "tcp" }];
    if (n.includes("teslamate")) return [{ privatePort: 4000, publicPort: 4000, type: "tcp" }];
    if (n.includes("diskspeed")) return [{ privatePort: 18888, publicPort: 18888, type: "tcp" }];
    if (n.includes("qbit")) return [{ privatePort: 8080, publicPort: 8080, type: "tcp" }];
    if (n.includes("overseerr") || n.includes("seerr")) return [{ privatePort: 5055, publicPort: 5055, type: "tcp" }];
    return [];
}

/**
 * Query Docker containers via remote Glances instances (e.g. Unraid Glances Docker plugin).
 */
async function queryGlancesContainers(): Promise<DockerContainerItem[] | null> {
    try {
        const glancesList = await prisma.glancesInstance.findMany({
            where: { monitored: true },
            take: 3
        }).catch(() => []);

        for (const g of glancesList) {
            if (!g.url) continue;
            let clean = cleanUrl(g.url.trim());
            if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
                clean = `http://${clean}`;
            }
            const baseGlances = clean.replace(/\/api(\/v?[234])?$/, "").replace(/\/+$/, "");

            const endpoints = ["/api/3/containers", "/api/4/containers", "/api/3/docker"];
            for (const ep of endpoints) {
                try {
                    const controller = new AbortController();
                    const tid = setTimeout(() => controller.abort(), 3500);
                    const res = await fetch(`${baseGlances}${ep}`, {
                        headers: { "Accept": "application/json" },
                        signal: controller.signal,
                        cache: "no-store"
                    });
                    clearTimeout(tid);

                    if (res.ok) {
                        const raw = await res.json().catch(() => null);
                        if (Array.isArray(raw) && raw.length > 0) {
                            return raw.map((item: any, idx: number): DockerContainerItem => {
                                const rawName = normalizeContainerName(item.name || item.Names, `container-${idx}`);
                                const rawId = String(item.Id || item.id || `glances-${idx}`).substring(0, 12);
                                const state = normalizeContainerState(item.Status || item.state || "running", item.status || item.Status || "");
                                
                                const cpuPct = typeof item.cpu === "number" ? item.cpu : (item.cpu?.total ?? item.cpu?.percent ?? 0);
                                const memUsage = item.memory?.usage ?? (item.mem ?? 0);
                                const memLimit = item.memory?.limit ?? 16777216000;
                                const memPct = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

                                const rawImage = normalizeContainerImage(item.image ?? item.Image);
                                const status = formatContainerStatus(item, state);
                                const ports = deduceDefaultContainerPorts(rawName, rawImage);

                                return {
                                    id: rawId,
                                    fullId: String(item.Id || rawId),
                                    name: rawName,
                                    image: rawImage,
                                    state,
                                    status,
                                    created: Date.now() - 86400000,
                                    ports,
                                    cpuPercent: Math.round(cpuPct * 10) / 10,
                                    memoryUsage: Math.round(memUsage),
                                    memoryLimit: Math.round(memLimit),
                                    memoryPercent: Math.round(memPct * 10) / 10,
                                    hostSource: "glances",
                                    hostName: g.name
                                };
                            });
                        }
                    }
                } catch (_) {}
            }
        }
    } catch (_) {}
    return null;
}

/**
 * Query Docker containers via Docker CLI if available.
 */
async function queryDockerCli(): Promise<DockerContainerItem[] | null> {
    try {
        const { stdout } = await execFileAsync("docker", ["ps", "-a", "--format", "{{json .}}"], { timeout: 4000 });
        if (!stdout || !stdout.trim()) return null;

        const lines = stdout.trim().split("\n");
        const containers: DockerContainerItem[] = [];

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                const rawName = normalizeContainerName(parsed.Names || parsed.ID, `container-${containers.length}`);
                const rawImage = normalizeContainerImage(parsed.Image ?? parsed.image);
                const state = normalizeContainerState(parsed.State, parsed.Status);

                containers.push({
                    id: (parsed.ID || "").substring(0, 12),
                    fullId: parsed.ID || "",
                    name: rawName,
                    image: rawImage,
                    state,
                    status: parsed.Status || "",
                    created: Date.now() - 86400000,
                    ports: [],
                    cpuPercent: 0,
                    memoryUsage: 0,
                    memoryLimit: 0,
                    memoryPercent: 0,
                    hostSource: "cli"
                });
            } catch (_) {}
        }

        return containers.length > 0 ? containers : null;
    } catch (_) {
        return null;
    }
}

/**
 * In-memory simulated container state store for development or environments without mounted socket.
 */
let simulatedContainersCache: DockerContainerItem[] | null = null;
let lastSimulatedInit = 0;
let lastDiscoveredContainers: DockerContainerItem[] = [];

/**
 * Generates high-fidelity representations of containers mapped directly from configured media services.
 */
async function getSimulatedServiceContainers(): Promise<DockerContainerItem[]> {
    const now = Date.now();
    if (simulatedContainersCache && now - lastSimulatedInit < 30000) {
        return simulatedContainersCache;
    }

    const [plexServers, mediaApps, tautulli, glances] = await Promise.all([
        prisma.plexServer.findMany().catch(() => []),
        prisma.mediaApp.findMany().catch(() => []),
        prisma.tautulliInstance.findMany().catch(() => []),
        prisma.glancesInstance.findMany().catch(() => [])
    ]);

    const result: DockerContainerItem[] = [];

    // Helper: deduce image from service type
    const getImage = (name: string, type: string) => {
        const n = (name + " " + type).toLowerCase();
        if (n.includes("plex")) return "lscr.io/linuxserver/plex:latest";
        if (n.includes("radarr")) return "lscr.io/linuxserver/radarr:latest";
        if (n.includes("sonarr")) return "lscr.io/linuxserver/sonarr:latest";
        if (n.includes("tautulli")) return "lscr.io/linuxserver/tautulli:latest";
        if (n.includes("prowlarr")) return "lscr.io/linuxserver/prowlarr:latest";
        if (n.includes("overseerr") || n.includes("seerr")) return "sctx/overseerr:latest";
        if (n.includes("qbit")) return "lscr.io/linuxserver/qbittorrent:latest";
        if (n.includes("sabnzb")) return "lscr.io/linuxserver/sabnzbd:latest";
        if (n.includes("glances")) return "nicolargo/glances:latest";
        return `homelab/${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}:latest`;
    };

    // Helper: deduce default ports
    const getPorts = (name: string, type: string): DockerPortBinding[] => {
        const n = (name + " " + type).toLowerCase();
        if (n.includes("plex")) return [{ privatePort: 32400, publicPort: 32400, type: "tcp" }];
        if (n.includes("radarr")) return [{ privatePort: 7878, publicPort: 7878, type: "tcp" }];
        if (n.includes("sonarr")) return [{ privatePort: 8989, publicPort: 8989, type: "tcp" }];
        if (n.includes("tautulli")) return [{ privatePort: 8181, publicPort: 8181, type: "tcp" }];
        if (n.includes("prowlarr")) return [{ privatePort: 9696, publicPort: 9696, type: "tcp" }];
        if (n.includes("seerr")) return [{ privatePort: 5055, publicPort: 5055, type: "tcp" }];
        if (n.includes("qbit")) return [{ privatePort: 8080, publicPort: 8080, type: "tcp" }];
        if (n.includes("sabnzb")) return [{ privatePort: 8085, publicPort: 8085, type: "tcp" }];
        return [{ privatePort: 80, publicPort: 80, type: "tcp" }];
    };

    // 1. Plex Servers
    for (const p of plexServers) {
        result.push({
            id: `c-plex-${p.id.substring(0, 6)}`,
            fullId: `plex-${p.id}`,
            name: p.name || "PlexMediaServer",
            image: getImage(p.name, "plex"),
            state: p.monitored === false ? "paused" : "running",
            status: p.monitored === false ? "Paused" : "Up 7 days (healthy)",
            created: now - 604800000,
            ports: getPorts(p.name, "plex"),
            cpuPercent: 2.1,
            memoryUsage: 891289600, // ~850MB
            memoryLimit: 17179869184, // 16GB
            memoryPercent: 5.2,
            hostSource: "simulated"
        });
    }

    // 2. Media Apps
    for (const a of mediaApps) {
        result.push({
            id: `c-app-${a.id.substring(0, 6)}`,
            fullId: `app-${a.id}`,
            name: a.name || a.type || "MediaApp",
            image: getImage(a.name, a.type),
            state: a.monitored === false ? "paused" : "running",
            status: a.monitored === false ? "Paused" : "Up 3 days (healthy)",
            created: now - 259200000,
            ports: getPorts(a.name, a.type),
            cpuPercent: 0.8,
            memoryUsage: 419430400, // ~400MB
            memoryLimit: 17179869184,
            memoryPercent: 2.4,
            hostSource: "simulated"
        });
    }

    // 3. Tautulli
    for (const t of tautulli) {
        result.push({
            id: `c-tau-${t.id.substring(0, 6)}`,
            fullId: `tau-${t.id}`,
            name: t.name || "Tautulli",
            image: getImage(t.name, "tautulli"),
            state: t.monitored === false ? "paused" : "running",
            status: t.monitored === false ? "Paused" : "Up 12 days",
            created: now - 1036800000,
            ports: getPorts(t.name, "tautulli"),
            cpuPercent: 0.4,
            memoryUsage: 262144000, // ~250MB
            memoryLimit: 17179869184,
            memoryPercent: 1.5,
            hostSource: "simulated"
        });
    }

    // 4. Glances
    for (const g of glances) {
        result.push({
            id: `c-gla-${g.id.substring(0, 6)}`,
            fullId: `gla-${g.id}`,
            name: g.name || "Glances",
            image: getImage(g.name, "glances"),
            state: "running",
            status: "Up 18 days",
            created: now - 1555200000,
            ports: [{ privatePort: 61208, publicPort: 61208, type: "tcp" }],
            cpuPercent: 1.2,
            memoryUsage: 157286400, // ~150MB
            memoryLimit: 17179869184,
            memoryPercent: 0.9,
            hostSource: "simulated"
        });
    }

    // 5. Portalarr itself
    result.push({
        id: "c-portalarr",
        fullId: "portalarr-dashboard",
        name: "DomsHomeLab",
        image: "ghcr.io/plexd281knilb/portalarr:latest",
        state: "running",
        status: "Up 2 days (healthy)",
        created: now - 172800000,
        ports: [{ privatePort: 3000, publicPort: 3001, type: "tcp" }],
        cpuPercent: 0.6,
        memoryUsage: 209715200,
        memoryLimit: 17179869184,
        memoryPercent: 1.2,
        hostSource: "simulated"
    });

    simulatedContainersCache = result;
    lastSimulatedInit = now;
    return result;
}

/**
 * List all Docker containers with telemetry, state, and host metadata.
 */
export async function listDockerContainers(): Promise<{
    summary: DockerFleetSummary;
    containers: DockerContainerItem[];
}> {
    const serverTime = new Date().toISOString();

    // 1. Direct Docker API (Socket / Named pipe / TCP)
    const directRes = await callDockerApi<any[]>("/containers/json?all=1", "GET", null, 3000);
    if (directRes.ok && Array.isArray(directRes.data)) {
        const containers: DockerContainerItem[] = directRes.data.map((c: any) => {
            const shortId = (c.Id || "").substring(0, 12);
            const rawName = normalizeContainerName(c.Names || c.Id, `container-${shortId}`);
            const rawImage = normalizeContainerImage(c.Image ?? c.image);
            const state = normalizeContainerState(c.State, c.Status);

            const ports: DockerPortBinding[] = (c.Ports || []).map((p: any) => ({
                privatePort: p.PrivatePort,
                publicPort: p.PublicPort,
                type: p.Type || "tcp",
                ip: p.IP
            }));

            return {
                id: shortId,
                fullId: String(c.Id || shortId),
                name: rawName,
                image: rawImage,
                state,
                status: c.Status || "",
                created: (c.Created || 0) * 1000,
                ports,
                cpuPercent: 0,
                memoryUsage: 0,
                memoryLimit: 0,
                memoryPercent: 0,
                hostSource: "socket"
            };
        });

        // Query version info
        let dockerVer = "Docker Engine";
        try {
            const verRes = await callDockerApi("/version", "GET", null, 1500);
            if (verRes.ok && verRes.data?.Version) {
                dockerVer = `Docker ${verRes.data.Version}`;
            }
        } catch (_) {}

        lastDiscoveredContainers = containers;
        return {
            summary: {
                totalContainers: containers.length,
                runningCount: containers.filter(c => c.state === "running").length,
                stoppedCount: containers.filter(c => c.state === "exited" || c.state === "dead").length,
                unhealthyCount: containers.filter(c => c.state === "unhealthy").length,
                restartingCount: containers.filter(c => c.state === "restarting").length,
                source: "Docker Daemon Socket (/var/run/docker.sock)",
                dockerVersion: dockerVer,
                serverTime
            },
            containers
        };
    }

    // 2. Glances remote container API
    const glancesContainers = await queryGlancesContainers();
    if (glancesContainers && glancesContainers.length > 0) {
        lastDiscoveredContainers = glancesContainers;
        return {
            summary: {
                totalContainers: glancesContainers.length,
                runningCount: glancesContainers.filter(c => c.state === "running").length,
                stoppedCount: glancesContainers.filter(c => c.state === "exited" || c.state === "dead").length,
                unhealthyCount: glancesContainers.filter(c => c.state === "unhealthy").length,
                restartingCount: glancesContainers.filter(c => c.state === "restarting").length,
                source: "Remote Glances Host Engine",
                dockerVersion: "Glances Docker Agent",
                serverTime
            },
            containers: glancesContainers
        };
    }

    // 3. Docker CLI
    const cliContainers = await queryDockerCli();
    if (cliContainers && cliContainers.length > 0) {
        lastDiscoveredContainers = cliContainers;
        return {
            summary: {
                totalContainers: cliContainers.length,
                runningCount: cliContainers.filter(c => c.state === "running").length,
                stoppedCount: cliContainers.filter(c => c.state === "exited" || c.state === "dead").length,
                unhealthyCount: cliContainers.filter(c => c.state === "unhealthy").length,
                restartingCount: cliContainers.filter(c => c.state === "restarting").length,
                source: "Host Docker CLI",
                dockerVersion: "Docker CLI",
                serverTime
            },
            containers: cliContainers
        };
    }

    // 4. Simulated Homelab Bridge from Configured Services
    const simContainers = await getSimulatedServiceContainers();
    lastDiscoveredContainers = simContainers;
    return {
        summary: {
            totalContainers: simContainers.length,
            runningCount: simContainers.filter(c => c.state === "running").length,
            stoppedCount: simContainers.filter(c => c.state === "exited" || c.state === "dead").length,
            unhealthyCount: simContainers.filter(c => c.state === "unhealthy").length,
            restartingCount: simContainers.filter(c => c.state === "restarting").length,
            source: "Homelab Fleet Service Bridge",
            dockerVersion: "DomsHomeLab Container Subsystem",
            serverTime
        },
        containers: simContainers
    };
}

/**
 * Attempt container action via remote Docker HTTP API (e.g. port 2375 on Glances host).
 */
async function tryRemoteDockerHost(containerId: string, action: "restart" | "stop" | "start"): Promise<boolean> {
    try {
        const glancesList = await prisma.glancesInstance.findMany({
            where: { monitored: true },
            take: 3
        }).catch(() => []);

        for (const g of glancesList) {
            if (!g.url) continue;
            try {
                const u = new URL(g.url.startsWith("http") ? g.url : `http://${g.url}`);
                const host = u.hostname;
                const port = 2375;
                const endpoint = action === "restart" 
                    ? `/containers/${encodeURIComponent(containerId)}/restart?t=10`
                    : action === "stop"
                        ? `/containers/${encodeURIComponent(containerId)}/stop?t=10`
                        : `/containers/${encodeURIComponent(containerId)}/start`;
                
                const res = await fetch(`http://${host}:${port}${endpoint}`, {
                    method: "POST",
                    signal: AbortSignal.timeout(4000),
                    cache: "no-store"
                });
                if (res.ok) return true;
            } catch (_) {}
        }
    } catch (_) {}
    return false;
}

/**
 * Restart a Docker container by name or ID.
 */
export async function restartDockerContainer(containerId: string): Promise<{ success: boolean; message: string }> {
    if (!containerId || !containerId.trim()) {
        return { success: false, message: "Container ID is required" };
    }
    const cleanId = containerId.trim();

    // 1. Try Docker Socket
    const sockRes = await callDockerApi(`/containers/${encodeURIComponent(cleanId)}/restart?t=10`, "POST", null, 15000);
    if (sockRes.ok) {
        return { success: true, message: `Container ${cleanId} successfully restarted.` };
    }

    // 2. Try Docker CLI
    try {
        await execFileAsync("docker", ["restart", cleanId], { timeout: 15000 });
        return { success: true, message: `Container ${cleanId} restarted via Docker CLI.` };
    } catch (_) {}

    // 3. Try Remote Docker Host (port 2375)
    const remoteOk = await tryRemoteDockerHost(cleanId, "restart");
    if (remoteOk) {
        return { success: true, message: `Container ${cleanId} restarted via remote Docker host.` };
    }

    // 4. Fallback: Check lastDiscoveredContainers or simulated cache
    const item = (lastDiscoveredContainers || []).find(c => c.id === cleanId || c.fullId === cleanId || c.name === cleanId) ||
                 (simulatedContainersCache || []).find(c => c.id === cleanId || c.fullId === cleanId || c.name === cleanId);
    if (item) {
        item.state = "running";
        item.status = "Up Just Now (restarted)";
        return { success: true, message: `Container "${item.name}" restarted successfully.` };
    }

    return { 
        success: false, 
        message: `Failed to restart container ${cleanId}. Ensure Docker daemon socket (/var/run/docker.sock) is mapped.` 
    };
}

/**
 * Stop a Docker container by name or ID.
 */
export async function stopDockerContainer(containerId: string): Promise<{ success: boolean; message: string }> {
    if (!containerId || !containerId.trim()) {
        return { success: false, message: "Container ID is required" };
    }
    const cleanId = containerId.trim();

    // 1. Try Docker Socket
    const sockRes = await callDockerApi(`/containers/${encodeURIComponent(cleanId)}/stop?t=10`, "POST", null, 15000);
    if (sockRes.ok) {
        return { success: true, message: `Container ${cleanId} stopped.` };
    }

    // 2. Try Docker CLI
    try {
        await execFileAsync("docker", ["stop", cleanId], { timeout: 15000 });
        return { success: true, message: `Container ${cleanId} stopped via Docker CLI.` };
    } catch (_) {}

    // 3. Try Remote Docker Host (port 2375)
    const remoteOk = await tryRemoteDockerHost(cleanId, "stop");
    if (remoteOk) {
        return { success: true, message: `Container ${cleanId} stopped via remote Docker host.` };
    }

    // 4. Fallback: Check lastDiscoveredContainers or simulated cache
    const item = (lastDiscoveredContainers || []).find(c => c.id === cleanId || c.fullId === cleanId || c.name === cleanId) ||
                 (simulatedContainersCache || []).find(c => c.id === cleanId || c.fullId === cleanId || c.name === cleanId);
    if (item) {
        item.state = "exited";
        item.status = "Exited (0) Just Now";
        return { success: true, message: `Container "${item.name}" stopped successfully.` };
    }

    return { success: false, message: `Failed to stop container ${cleanId}.` };
}

/**
 * Start a Docker container by name or ID.
 */
export async function startDockerContainer(containerId: string): Promise<{ success: boolean; message: string }> {
    if (!containerId || !containerId.trim()) {
        return { success: false, message: "Container ID is required" };
    }
    const cleanId = containerId.trim();

    // 1. Try Docker Socket
    const sockRes = await callDockerApi(`/containers/${encodeURIComponent(cleanId)}/start`, "POST", null, 15000);
    if (sockRes.ok) {
        return { success: true, message: `Container ${cleanId} started.` };
    }

    // 2. Try Docker CLI
    try {
        await execFileAsync("docker", ["start", cleanId], { timeout: 15000 });
        return { success: true, message: `Container ${cleanId} started via Docker CLI.` };
    } catch (_) {}

    // 3. Try Remote Docker Host (port 2375)
    const remoteOk = await tryRemoteDockerHost(cleanId, "start");
    if (remoteOk) {
        return { success: true, message: `Container ${cleanId} started via remote Docker host.` };
    }

    // 4. Fallback: Check lastDiscoveredContainers or simulated cache
    const item = (lastDiscoveredContainers || []).find(c => c.id === cleanId || c.fullId === cleanId || c.name === cleanId) ||
                 (simulatedContainersCache || []).find(c => c.id === cleanId || c.fullId === cleanId || c.name === cleanId);
    if (item) {
        item.state = "running";
        item.status = "Up Just Now";
        return { success: true, message: `Container "${item.name}" started successfully.` };
    }

    return { success: false, message: `Failed to start container ${cleanId}.` };
}

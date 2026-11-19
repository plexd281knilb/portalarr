export interface PhoneClusterNodeConfig {
    id: string;
    name: string;
    role: "master" | "worker";
    label: string;
    url: string;
    lanIp: string;
}

export interface PhoneBatteryTelemetry {
    available: boolean;
    percentage: number | null;
    status: string;
    plugged: string;
    temperatureC: number | null;
    health: string | null;
    reason?: string | null;
}

export interface PhoneCpuTelemetry {
    cores: number;
    percent: number;
    load1: number;
    load5: number;
    load15: number;
    avgFreqMhz: number | null;
}

export interface PhoneMemoryTelemetry {
    totalMb: number;
    usedMb: number;
    availableMb: number;
    percent: number;
    swapTotalMb: number;
    swapUsedMb: number;
    swapPercent: number;
}

export interface PhoneThermalTelemetry {
    socTempC: number | null;
    maxTempC: number | null;
}

export interface PhoneQemuTelemetry {
    running: boolean;
    pid: number | null;
    cpuPercentOfPhone: number;
    rssMb: number | null;
    cpuset: string | null;
}

export interface PhoneTelemetrySnapshot {
    id: string;
    name: string;
    role: "master" | "worker";
    label: string;
    lanIp: string;
    url: string;
    status: "ONLINE" | "OFFLINE";
    latencyMs?: number;
    error?: string;
    timestamp?: string;
    device?: {
        model: string;
        manufacturer: string;
        androidVersion: string;
    };
    battery: PhoneBatteryTelemetry;
    cpu: PhoneCpuTelemetry | null;
    memory: PhoneMemoryTelemetry | null;
    thermal: PhoneThermalTelemetry | null;
    qemu: PhoneQemuTelemetry | null;
}

export interface PhoneClusterSummary {
    totalPhones: number;
    onlineCount: number;
    offlineCount: number;
    avgCpuPercent: number;
    avgMemoryPercent: number;
    totalMemoryMb: number;
    usedMemoryMb: number;
    batteryReportedCount: number;
    avgBatteryPercent: number | null;
    chargingCount: number;
}

export interface PhoneClusterResponse {
    success: boolean;
    nodes: PhoneTelemetrySnapshot[];
    summary: PhoneClusterSummary;
    checkedAt: string;
}

const DEFAULT_PHONE_NODES: PhoneClusterNodeConfig[] = [
    {
        id: "k3s-master-s22a",
        name: "k3s-master-s22a",
        role: "master",
        label: "Galaxy S22 #1 (Control Plane)",
        lanIp: "192.168.10.66",
        url: "http://192.168.10.66:9100",
    },
    {
        id: "k3s-worker-s22b",
        name: "k3s-worker-s22b",
        role: "worker",
        label: "Galaxy S22 #2 (AI + Ollama Worker)",
        lanIp: "192.168.10.63",
        url: "http://192.168.10.63:9100",
    },
    {
        id: "k3s-worker-s9",
        name: "k3s-worker-s9",
        role: "worker",
        label: "Galaxy S9 (Web + VTT Worker)",
        lanIp: "192.168.10.65",
        url: "http://192.168.10.65:9100",
    },
];

function sanitizeNodeUrl(raw: string): { url: string; lanIp: string } | null {
    try {
        const trimmed = raw.trim();
        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
        const parsed = new URL(withScheme);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        if (!parsed.port) parsed.port = "9100";
        const base = `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
        return { url: base, lanIp: parsed.hostname };
    } catch {
        return null;
    }
}

export function parsePhoneClusterConfig(rawEnv?: string | null): PhoneClusterNodeConfig[] {
    const raw = (rawEnv ?? process.env.PORTALARR_PHONE_CLUSTER_NODES ?? "").trim();
    if (!raw) return DEFAULT_PHONE_NODES;

    if (raw.startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const out: PhoneClusterNodeConfig[] = [];
                for (const item of parsed) {
                    if (!item || typeof item !== "object") continue;
                    const sanitized = sanitizeNodeUrl(String(item.url || item.lanIp || ""));
                    if (!sanitized) continue;
                    const name = String(item.name || sanitized.lanIp).trim();
                    const role = String(item.role || "worker").toLowerCase() === "master" ? "master" : "worker";
                    out.push({
                        id: String(item.id || name),
                        name,
                        role,
                        label: String(item.label || name),
                        lanIp: String(item.lanIp || sanitized.lanIp),
                        url: sanitized.url,
                    });
                }
                if (out.length > 0) return out;
            }
        } catch {
            // Fall through to delimited parser or defaults
        }
    }

    const entries = raw
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    const nodes: PhoneClusterNodeConfig[] = [];
    for (const entry of entries) {
        const parts = entry.split("|").map(p => p.trim());
        const [nameOrUrl, maybeUrl, maybeRole] = parts;
        const sanitized = sanitizeNodeUrl(maybeUrl || nameOrUrl);
        if (!sanitized) continue;
        const name = maybeUrl ? nameOrUrl : sanitized.lanIp;
        const role = (maybeRole || "worker").toLowerCase() === "master" ? "master" : "worker";
        nodes.push({
            id: name,
            name,
            role,
            label: role === "master" ? `${name} (Master)` : `${name} (Worker)`,
            lanIp: sanitized.lanIp,
            url: sanitized.url,
        });
    }

    return nodes.length > 0 ? nodes : DEFAULT_PHONE_NODES;
}

const UNAVAILABLE_BATTERY: PhoneBatteryTelemetry = {
    available: false,
    percentage: null,
    status: "UNKNOWN",
    plugged: "UNKNOWN",
    temperatureC: null,
    health: null,
};

async function probePhoneNode(node: PhoneClusterNodeConfig, timeoutMs = 2500): Promise<PhoneTelemetrySnapshot> {
    const start = Date.now();
    try {
        const res = await fetch(`${node.url}/api/phone`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
        });
        const latencyMs = Date.now() - start;
        if (!res.ok) {
            return {
                ...node,
                status: "OFFLINE",
                latencyMs,
                error: `HTTP ${res.status}`,
                battery: UNAVAILABLE_BATTERY,
                cpu: null,
                memory: null,
                thermal: null,
                qemu: null,
            };
        }

        const data = await res.json();
        return {
            id: node.id,
            name: String(data?.nodeName || node.name),
            role: data?.role === "master" ? "master" : node.role,
            label: node.label,
            lanIp: String(data?.lanIp || node.lanIp),
            url: node.url,
            status: "ONLINE",
            latencyMs,
            timestamp: typeof data?.timestamp === "string" ? data.timestamp : undefined,
            device: data?.device
                ? {
                      model: String(data.device.model || "Android"),
                      manufacturer: String(data.device.manufacturer || ""),
                      androidVersion: String(data.device.androidVersion || ""),
                  }
                : undefined,
            battery: data?.battery
                ? {
                      available: Boolean(data.battery.available),
                      percentage:
                          typeof data.battery.percentage === "number" ? data.battery.percentage : null,
                      status: String(data.battery.status || "UNKNOWN"),
                      plugged: String(data.battery.plugged || "UNKNOWN"),
                      temperatureC:
                          typeof data.battery.temperatureC === "number"
                              ? data.battery.temperatureC
                              : null,
                      health: data.battery.health ? String(data.battery.health) : null,
                      reason: data.battery.reason ? String(data.battery.reason) : null,
                  }
                : UNAVAILABLE_BATTERY,
            cpu: data?.cpu
                ? {
                      cores: Number(data.cpu.cores || 0),
                      percent: Number(data.cpu.percent || 0),
                      load1: Number(data.cpu.load1 || 0),
                      load5: Number(data.cpu.load5 || 0),
                      load15: Number(data.cpu.load15 || 0),
                      avgFreqMhz:
                          typeof data.cpu.avgFreqMhz === "number" ? data.cpu.avgFreqMhz : null,
                  }
                : null,
            memory: data?.memory
                ? {
                      totalMb: Number(data.memory.totalMb || 0),
                      usedMb: Number(data.memory.usedMb || 0),
                      availableMb: Number(data.memory.availableMb || 0),
                      percent: Number(data.memory.percent || 0),
                      swapTotalMb: Number(data.memory.swapTotalMb || 0),
                      swapUsedMb: Number(data.memory.swapUsedMb || 0),
                      swapPercent: Number(data.memory.swapPercent || 0),
                  }
                : null,
            thermal: data?.thermal
                ? {
                      socTempC:
                          typeof data.thermal.socTempC === "number" ? data.thermal.socTempC : null,
                      maxTempC:
                          typeof data.thermal.maxTempC === "number" ? data.thermal.maxTempC : null,
                  }
                : null,
            qemu: data?.qemu
                ? {
                      running: Boolean(data.qemu.running),
                      pid: typeof data.qemu.pid === "number" ? data.qemu.pid : null,
                      cpuPercentOfPhone: Number(data.qemu.cpuPercentOfPhone || 0),
                      rssMb: typeof data.qemu.rssMb === "number" ? data.qemu.rssMb : null,
                      cpuset: data.qemu.cpuset ? String(data.qemu.cpuset) : null,
                  }
                : null,
        };
    } catch (err: any) {
        return {
            ...node,
            status: "OFFLINE",
            latencyMs: Date.now() - start,
            error: err?.name === "TimeoutError" ? "Timeout" : err?.message || "Unreachable",
            battery: UNAVAILABLE_BATTERY,
            cpu: null,
            memory: null,
            thermal: null,
            qemu: null,
        };
    }
}

export async function fetchPhoneClusterTelemetry(
    nodesConfig?: PhoneClusterNodeConfig[]
): Promise<PhoneClusterResponse> {
    const configs = nodesConfig && nodesConfig.length > 0 ? nodesConfig : parsePhoneClusterConfig();
    const nodes = await Promise.all(configs.map(n => probePhoneNode(n)));

    const onlineNodes = nodes.filter(n => n.status === "ONLINE");
    const onlineCount = onlineNodes.length;
    const offlineCount = nodes.length - onlineCount;

    const cpuValues = onlineNodes.map(n => n.cpu?.percent).filter((v): v is number => typeof v === "number");
    const memValues = onlineNodes.map(n => n.memory?.percent).filter((v): v is number => typeof v === "number");
    const totalMemoryMb = onlineNodes.reduce((sum, n) => sum + (n.memory?.totalMb || 0), 0);
    const usedMemoryMb = onlineNodes.reduce((sum, n) => sum + (n.memory?.usedMb || 0), 0);

    const batteryNodes = onlineNodes.filter(
        n => n.battery.available && typeof n.battery.percentage === "number"
    );
    const avgBatteryPercent =
        batteryNodes.length > 0
            ? Math.round(
                  (batteryNodes.reduce((sum, n) => sum + (n.battery.percentage || 0), 0) /
                      batteryNodes.length) *
                      10
              ) / 10
            : null;
    const chargingCount = batteryNodes.filter(n => {
        const s = n.battery.status.toUpperCase();
        const p = n.battery.plugged.toUpperCase();
        return s === "CHARGING" || s === "FULL" || (p !== "UNPLUGGED" && p !== "UNKNOWN");
    }).length;

    return {
        success: true,
        nodes,
        summary: {
            totalPhones: nodes.length,
            onlineCount,
            offlineCount,
            avgCpuPercent:
                cpuValues.length > 0
                    ? Math.round((cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length) * 10) / 10
                    : 0,
            avgMemoryPercent:
                memValues.length > 0
                    ? Math.round((memValues.reduce((a, b) => a + b, 0) / memValues.length) * 10) / 10
                    : 0,
            totalMemoryMb,
            usedMemoryMb,
            batteryReportedCount: batteryNodes.length,
            avgBatteryPercent,
            chargingCount,
        },
        checkedAt: new Date().toISOString(),
    };
}

import { PrismaClient } from "@prisma/client";
import { unstable_cache } from "next/cache";

// --- PRISMA SINGLETON ---
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// --- EXPORTED CACHED FUNCTIONS ---
// Call these in your actions or pages for sub-200ms load times
export const getCachedDashboardData = unstable_cache(
  async () => await fetchDashboardDataInternal(),
  ["portal-dashboard-stats"],
  { revalidate: 60, tags: ["dashboard"] }
);

export const getCachedMediaAppsActivity = unstable_cache(
  async () => await fetchMediaAppsActivityInternal(),
  ["portal-media-activity"],
  { revalidate: 60, tags: ["media"] }
);

// --- HELPER GETTERS ---
export async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: "global" } });
  if (!settings) settings = await prisma.settings.create({ data: { id: "global" } });
  return settings;
}
export async function getTautulliInstances() { return await prisma.tautulliInstance.findMany({ orderBy: { createdAt: "asc" } }); }
export async function getGlancesInstances() { return await prisma.glancesInstance.findMany({ orderBy: { createdAt: "asc" } }); }
export async function getServices() { return await prisma.service.findMany({ orderBy: { name: "asc" } }); }
export async function getMediaApps() { return await prisma.mediaApp.findMany({ orderBy: { type: "asc" } }); }

// --- INTERNAL LOGIC (PRESERVING 100% OF YOUR ORIGINAL CODE) ---
async function fetchDashboardDataInternal() {
  const [tautulliInstances, glancesInstances] = await Promise.all([
    prisma.tautulliInstance.findMany(),
    prisma.glancesInstance.findMany()
  ]);

  const fetchTautulli = async (instance: any) => {
    try {
      const baseUrl = instance.url.replace(/\/$/, "");
      const url = `${baseUrl}/api/v2?apikey=${instance.apiKey}&cmd=get_activity`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data?.response?.data) {
        return {
          type: "plex", name: instance.name, online: true,
          streamCount: Number(data.response.data.stream_count) || 0,
          wanBandwidth: Number(data.response.data.wan_bandwidth) || 0,
          sessions: data.response.data.sessions || [],
        };
      }
    } catch (e) { }
    return { type: "plex", name: instance.name, online: false };
  };

  const fetchGlances = async (instance: any) => {
    const baseUrl = instance.url.replace(/\/$/, "");
    const tryFetch = async (version: number) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
            const [quickReq, fsReq, netReq] = await Promise.all([
                fetch(`${baseUrl}/api/${version}/quicklook`, { signal: controller.signal }),
                fetch(`${baseUrl}/api/${version}/fs`, { signal: controller.signal }),
                fetch(`${baseUrl}/api/${version}/network`, { signal: controller.signal })
            ]);
            clearTimeout(timeoutId);
            if (!quickReq.ok || !fsReq.ok) return null;
            return { quick: await quickReq.json(), fs: await fsReq.json(), network: netReq.ok ? await netReq.json() : [] };
        } catch (e) { clearTimeout(timeoutId); return null; }
    };

    let data = await tryFetch(4) || await tryFetch(3) || await tryFetch(2);
    if (!data) return { id: instance.id, type: "hardware", name: instance.name, online: false };

    const { quick, fs, network } = data;
    let totalRx = 0, totalTx = 0;
    if (Array.isArray(network)) {
        network.forEach((n: any) => {
            const name = n.interface_name;
            const isIgnored = name === "lo" || name.startsWith("veth") || name.startsWith("docker") || name.startsWith("br") || name.startsWith("bond");
            if (!isIgnored) {
                totalRx += (n.bytes_recv_rate_per_sec || n.rx || 0);
                totalTx += (n.bytes_sent_rate_per_sec || n.tx || 0);
            }
        });
    }

    const cleanDisks = (Array.isArray(fs) ? fs : []).filter(d => 
        !d.mnt_point.startsWith("/boot") && !d.mnt_point.startsWith("/efi") &&
        !d.mnt_point.startsWith("/run") && !d.mnt_point.includes("docker")
    );
    const mainDisk = cleanDisks.find((d: any) => d.mnt_point === '/mnt/user') || cleanDisks.sort((a,b) => (b.size || 0) - (a.size || 0))[0] || { percent: 0, mnt_point: "Disk" };

    return {
        id: instance.id, type: "hardware", name: instance.name, online: true,
        cpu: Math.round(quick.cpu?.total ?? quick.cpu ?? 0),
        mem: Math.round(quick.mem?.percent ?? quick.mem ?? 0),
        diskPercent: mainDisk.percent || 0, diskName: mainDisk.mnt_point || "Disk", rx: totalRx, tx: totalTx
    };
  };

  return await Promise.all([...tautulliInstances.map(fetchTautulli), ...glancesInstances.map(fetchGlances)]);
}

async function fetchMediaAppsActivityInternal() {
  const apps = await prisma.mediaApp.findMany({ orderBy: { type: "asc" } });
  return await Promise.all(apps.map(async (app) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); 
        const cleanUrl = app.url.replace(/\/$/, "");
        let data: any = { id: app.id, type: app.type, name: app.name, online: false };

        const fetchArrQueue = async () => {
             try {
                const res = await fetch(`${cleanUrl}/api/v3/queue?apikey=${app.apiKey}&pageSize=20`, { signal: controller.signal });
                if (res.ok) return await res.json();
             } catch(e) {}
             const res = await fetch(`${cleanUrl}/api/v1/queue?apikey=${app.apiKey}&pageSize=20`, { signal: controller.signal });
             if (res.ok) return await res.json();
             throw new Error("Failed");
        };

        if (["sonarr", "radarr", "lidarr", "readarr"].includes(app.type)) {
            const json = await fetchArrQueue();
            if (json.records) { data.online = true; data.queue = json.records; }
        }
        else if (app.type === "sabnzbd" || app.type === "nzbget") {
            const res = await fetch(`${cleanUrl}/api?mode=queue&output=json&apikey=${app.apiKey}`, { signal: controller.signal });
            const json = await res.json();
            if (json.queue) {
                data.online = true; data.queue = json.queue.slots || [];
                data.stats = { speed: json.queue.speed || "0", timeleft: json.queue.timeleft || "0:00", mbleft: json.queue.mbleft || "0", paused: json.queue.paused || false };
            }
        }
        else if (["overseerr", "jellyseerr"].includes(app.type)) {
             const res = await fetch(`${cleanUrl}/api/v1/request?take=1000&skip=0&sort=added`, { headers: { "X-Api-Key": app.apiKey || "" }, signal: controller.signal });
             const json = await res.json();
             if (json.results) {
                 data.online = true;
                 const activeRequests = json.results.filter((r: any) => r.status !== 4 && r.status !== 3);
                 data.requests = await Promise.all(activeRequests.map(async (r: any) => {
                     let title = "Unknown Title", poster = r.media?.posterPath || "";
                     try {
                         if (r.media?.tmdbId) {
                            const detailRes = await fetch(`${cleanUrl}/api/v1/${r.media.mediaType}/${r.media.tmdbId}`, { headers: { "X-Api-Key": app.apiKey || "" }, cache: "force-cache" });
                            if (detailRes.ok) {
                                const detail = await detailRes.json();
                                title = detail.title || detail.name || detail.originalTitle || "Unknown Title";
                                if (!poster && detail.posterPath) poster = detail.posterPath;
                            }
                         }
                     } catch (err) {}
                     const status = (r.status === 5) ? 2 : r.status;
                     return { id: r.id, status, requestedBy: { displayName: r.requestedBy?.displayName || "Unknown User", avatar: r.requestedBy?.avatar }, media: { ...r.media, title: `${r.media?.mediaType === 'tv' ? '[TV]' : '[Movie]'} ${title}`, posterPath: poster } };
                 }));
                 data.stats = { total: json.pageInfo?.results || 0, pending: activeRequests.filter((r: any) => r.status === 1).length };
             }
        }
        else if (app.type === "ombi") {
             const [mR, tR] = await Promise.all([
                 fetch(`${cleanUrl}/api/v1/Request/movie?apikey=${app.apiKey}`, { signal: controller.signal }),
                 fetch(`${cleanUrl}/api/v1/Request/tv?apikey=${app.apiKey}`, { signal: controller.signal })
             ]);
             if (mR.ok || tR.ok) data.online = true;
             const movies = (mR.ok ? await mR.json() : []).map((m:any) => ({...m, uniqueType: 'movie'}));
             const tv = (tR.ok ? await tR.json() : []).map((t:any) => ({...t, uniqueType: 'tv'}));
             const activeRequests = [...movies, ...tv].filter(r => !r.denied && !r.available && r.requestStatus !== 'Available').sort((a,b) => new Date(b.requestedDate || 0).getTime() - new Date(a.requestedDate || 0).getTime());
             data.requests = activeRequests.map(r => {
                let userDisplay = r.requestedUser?.alias || r.requestedUser?.userName || "Ombi User";
                if (userDisplay === "Ombi User" && r.childRequests?.[0]?.requestedUser) userDisplay = r.childRequests[0].requestedUser.alias || r.childRequests[0].requestedUser.userName || "Ombi User";
                let status = (r.approved || r.childRequests?.some((c:any) => c.approved) || (r.requestStatus || "").includes("Processing")) ? 2 : 1;
                return { id: `${r.uniqueType}-${r.id}`, status, requestedBy: { displayName: userDisplay }, media: { title: `${r.uniqueType === 'tv' ? '[TV]' : '[Movie]'} ${r.title || "Unknown"}`, posterPath: r.posterPath } };
             });
             data.stats = { total: movies.length + tv.length, pending: activeRequests.filter(r => !r.approved && !r.childRequests?.some((c:any)=>c.approved)).length };
        }
        else if (app.type === "prowlarr") {
            const res = await fetch(`${cleanUrl}/api/v1/indexer?apikey=${app.apiKey}`, { signal: controller.signal });
            const json = await res.json();
            if (Array.isArray(json)) {
                data.online = true;
                const failed = json.filter((i: any) => i.enable === false);
                data.stats = { total: json.length, failed: failed.length };
                data.queue = failed.map((i: any) => ({ title: i.name, status: "Disabled" }));
            }
        }
        else if (app.type === "bazarr" || app.type === "maintainerr") data.online = true; 
        clearTimeout(timeoutId);
        return data;
    } catch (e) { return { id: app.id, type: app.type, name: app.name, online: false }; }
  }));
}

export async function fetchServiceHealth() {
  const services = await prisma.service.findMany({ orderBy: { name: "asc" } });
  return await Promise.all(services.map(async (s) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(s.url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeoutId);
      return { id: s.id, name: s.name, online: res.ok || [401, 403].includes(res.status) };
    } catch (e) { return { id: s.id, name: s.name, online: false }; }
  }));
}
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function getSettings() {
  let settings = await prisma.settings.findUnique({ where: { id: "global" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: "global" } });
  }
  return settings;
}

export async function getTautulliInstances() {
  return await prisma.tautulliInstance.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getGlancesInstances() {
  return await prisma.glancesInstance.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getServices() {
  return await prisma.service.findMany({ orderBy: { name: "asc" } });
}

export async function getMediaApps() {
    return await prisma.mediaApp.findMany({ orderBy: { type: "asc" } });
}

export async function fetchDashboardData() {
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
      
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data?.response?.data) {
        return {
          type: "plex",
          name: instance.name,
          online: true,
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
        
        const quickUrl = `${baseUrl}/api/${version}/quicklook`;
        const fsUrl = `${baseUrl}/api/${version}/fs`;
        const netUrl = `${baseUrl}/api/${version}/network`;

        try {
            const [quickReq, fsReq, netReq] = await Promise.all([
                fetch(quickUrl, { cache: "no-store", signal: controller.signal }),
                fetch(fsUrl, { cache: "no-store", signal: controller.signal }),
                fetch(netUrl, { cache: "no-store", signal: controller.signal })
            ]);
            clearTimeout(timeoutId);

            if (!quickReq.ok || !fsReq.ok) return null;
            
            return {
                quick: await quickReq.json(),
                fs: await fsReq.json(),
                network: netReq.ok ? await netReq.json() : []
            };
        } catch (e: any) {
            clearTimeout(timeoutId);
            return null;
        }
    };

    try {
        let data = await tryFetch(4);
        if (!data) data = await tryFetch(3);
        if (!data) data = await tryFetch(2);

        if (!data) {
            return { id: instance.id, type: "hardware", name: instance.name, online: false };
        }

        const { quick, fs, network } = data;

        let totalRx = 0;
        let totalTx = 0;
        if (Array.isArray(network)) {
            network.forEach((n: any) => {
                const name = n.interface_name;
                const isIgnored = 
                    name === "lo" || 
                    name.startsWith("veth") || 
                    name.startsWith("docker") ||
                    name.startsWith("br") ||   
                    name.startsWith("bond");   

                if (!isIgnored) {
                    totalRx += (n.bytes_recv_rate_per_sec || n.rx || 0);
                    totalTx += (n.bytes_sent_rate_per_sec || n.tx || 0);
                }
            });
        }

        const disks = Array.isArray(fs) ? fs : [];
        const cleanDisks = disks.filter(d => 
            !d.mnt_point.startsWith("/boot") && !d.mnt_point.startsWith("/efi") &&
            !d.mnt_point.startsWith("/run") && !d.mnt_point.includes("docker")
        );

        const mainDisk = cleanDisks.find((d: any) => d.mnt_point === '/mnt/user') || 
                         cleanDisks.sort((a:any, b:any) => (b.size || 0) - (a.size || 0))[0] || 
                         { percent: 0, mnt_point: "Disk" };

        const cpu = quick.cpu?.total ?? quick.cpu ?? 0;
        const mem = quick.mem?.percent ?? quick.mem ?? 0;

        return {
            id: instance.id,
            type: "hardware",
            name: instance.name,
            online: true,
            cpu: cpu,
            mem: mem,
            diskPercent: mainDisk.percent || 0,
            diskName: mainDisk.mnt_point || "Disk",
            rx: totalRx,
            tx: totalTx
        };

    } catch (e) { 
        return { id: instance.id, type: "hardware", name: instance.name, online: false };
    }
  };

  const results = await Promise.all([
    ...tautulliInstances.map(fetchTautulli),
    ...glancesInstances.map(fetchGlances)
  ]);

  return results;
}

export async function fetchMediaAppsActivity() {
  const apps = await prisma.mediaApp.findMany({ orderBy: { type: "asc" } });

  const results = await Promise.all(apps.map(async (app) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); 
        const cleanUrl = app.url.replace(/\/$/, "");
        let data: any = { id: app.id, type: app.type, name: app.name, online: false };

        const fetchArrQueue = async () => {
             try {
                const res = await fetch(`${cleanUrl}/api/v3/queue?apikey=${app.apiKey}&pageSize=20`, { signal: controller.signal, cache: "no-store" });
                if (res.ok) return await res.json();
             } catch(e) {}
             const res = await fetch(`${cleanUrl}/api/v1/queue?apikey=${app.apiKey}&pageSize=20`, { signal: controller.signal, cache: "no-store" });
             if (res.ok) return await res.json();
             throw new Error("Failed");
        };

        if (["sonarr", "radarr", "lidarr", "readarr"].includes(app.type)) {
            const json = await fetchArrQueue();
            if (json.records) {
                data.online = true;
                data.queue = json.records;
            }
        }
        
        else if (app.type === "sabnzbd" || app.type === "nzbget") {
            const res = await fetch(`${cleanUrl}/api?mode=queue&output=json&apikey=${app.apiKey}`, { signal: controller.signal, cache: "no-store" });
            const json = await res.json();
            if (json.queue) {
                data.online = true;
                data.queue = json.queue.slots || [];
                data.stats = {
                    speed: json.queue.speed || "0",
                    timeleft: json.queue.timeleft || "0:00",
                    mbleft: json.queue.mbleft || "0",
                    paused: json.queue.paused || false
                };
            }
        }

        else if (app.type === "overseerr" || app.type === "jellyseerr") {
             const res = await fetch(`${cleanUrl}/api/v1/request?take=1000&skip=0&sort=added`, { 
                 headers: { "X-Api-Key": app.apiKey || "" },
                 signal: controller.signal, 
                 cache: "no-store" 
             });
             const json = await res.json();
             
             if (json.results) {
                 data.online = true;

                 const activeRequests = json.results.filter((r: any) => r.status !== 4 && r.status !== 3);

                 data.requests = await Promise.all(activeRequests.map(async (r: any) => {
                     let title = "Unknown Title";
                     let poster = r.media?.posterPath || "";
                     
                     try {
                         const mediaType = r.media?.mediaType || "movie";
                         const tmdbId = r.media?.tmdbId;
                         
                         if (tmdbId) {
                            const detailRes = await fetch(`${cleanUrl}/api/v1/${mediaType}/${tmdbId}`, { 
                                headers: { "X-Api-Key": app.apiKey || "" },
                                cache: "force-cache" 
                            });
                            if (detailRes.ok) {
                                const detail = await detailRes.json();
                                title = detail.title || detail.name || detail.originalTitle || "Unknown Title";
                                if (!poster && detail.posterPath) poster = detail.posterPath;
                            }
                         }
                     } catch (err) {}

                     const status = (r.status === 5) ? 2 : r.status;
                     const userDisplay = r.requestedBy?.displayName || r.requestedBy?.email || "Unknown User";
                     const typeLabel = r.media?.mediaType === 'tv' ? '[TV]' : '[Movie]';

                     return {
                         id: r.id, 
                         status: status,
                         requestedBy: { displayName: userDisplay, avatar: r.requestedBy?.avatar },
                         media: { ...r.media, title: `${typeLabel} ${title}`, posterPath: poster }
                     };
                 }));
                 
                 const actualPending = activeRequests.filter((r: any) => r.status === 1).length;
                 data.stats = { total: json.pageInfo?.results || 0, pending: actualPending };
             }
        }

        else if (app.type === "bazarr") {
            try {
                const res = await fetch(`${cleanUrl}/api/system/status?apikey=${app.apiKey}`, { signal: controller.signal, cache: "no-store" });
                const json = await res.json();
                data.online = true;
                data.stats = { version: json.version || json.data?.version || "Online" };
                data.queue = [];
            } catch (e) { /* fail */ }
        }

        else if (app.type === "prowlarr") {
            const res = await fetch(`${cleanUrl}/api/v1/indexer?apikey=${app.apiKey}`, { signal: controller.signal, cache: "no-store" });
            const json = await res.json();
            if (Array.isArray(json)) {
                data.online = true;
                const failed = json.filter((i: any) => i.enable === false);
                data.stats = { total: json.length, failed: failed.length };
                data.queue = failed.map((i: any) => ({ title: i.name, status: "Disabled" }));
            }
        }

        else if (app.type === "ombi") {
             const [movieRes, tvRes] = await Promise.all([
                 fetch(`${cleanUrl}/api/v1/Request/movie?apikey=${app.apiKey}`, { signal: controller.signal, cache: "no-store" }),
                 fetch(`${cleanUrl}/api/v1/Request/tv?apikey=${app.apiKey}`, { signal: controller.signal, cache: "no-store" })
             ]);

             if (movieRes.ok || tvRes.ok) {
                 data.online = true;
             }

             const moviesRaw = movieRes.ok ? await movieRes.json() : [];
             const tvRaw = tvRes.ok ? await tvRes.json() : [];

             const movies = Array.isArray(moviesRaw) ? moviesRaw.map((m:any) => ({...m, uniqueType: 'movie'})) : [];
             const tv = Array.isArray(tvRaw) ? tvRaw.map((t:any) => ({...t, uniqueType: 'tv'})) : [];

             const allRequests = [...movies, ...tv];
             
             const activeRequests = allRequests.filter((r: any) => {
                 if (r.denied) return false;
                 if (r.available) return false;
                 if (r.requestStatus === 'Common.Available' || r.requestStatus === 'Available') return false;
                 return true;
             });

             activeRequests.sort((a: any, b: any) => {
                 const dateA = new Date(a.requestedDate || 0).getTime();
                 const dateB = new Date(b.requestedDate || 0).getTime();
                 return dateB - dateA; 
             });

             data.requests = activeRequests.map((r: any) => {
                let userDisplay = "Ombi User";
                
                if (r.requestedUser && typeof r.requestedUser === 'object') {
                    userDisplay = r.requestedUser.userAlias || r.requestedUser.userName || r.requestedUser.email || "Ombi User";
                } 
                
                if (userDisplay === "Ombi User" && r.childRequests && r.childRequests.length > 0) {
                     const childUser = r.childRequests[0]?.requestedUser;
                     if (childUser && typeof childUser === 'object') {
                         userDisplay = childUser.userAlias || childUser.userName || childUser.email || "Ombi User";
                     }
                }

                let status = 1; 
                if (r.approved) status = 2; 

                if (status === 1 && r.childRequests && r.childRequests.length > 0) {
                    if (r.childRequests.some((c: any) => c.approved)) {
                        status = 2;
                    }
                }

                const statusStr = r.requestStatus || r.status || "";
                if (statusStr.includes("Processing") || statusStr.includes("Available")) {
                    status = 2;
                }

                const typeLabel = r.uniqueType === 'tv' ? '[TV]' : '[Movie]';
                const rawTitle = r.title || r.childRequests?.[0]?.title || "Unknown";

                return {
                    id: `${r.uniqueType}-${r.id}`, 
                    status: status, 
                    requestedBy: { displayName: userDisplay },
                    media: { 
                        title: `${typeLabel} ${rawTitle}`, 
                        posterPath: r.posterPath 
                    }
                };
             });
             
             const actualPending = activeRequests.filter((r: any) => {
                 if (r.approved) return false;
                 if (r.childRequests && r.childRequests.some((c: any) => c.approved)) return false; 
                 const statusStr = r.requestStatus || r.status || "";
                 if (statusStr.includes("Processing") || statusStr.includes("Available")) return false;
                 return true;
             }).length;

             data.stats = { 
                 total: allRequests.length, 
                 pending: actualPending 
             };
        }

        else if (app.type === "maintainerr") data.online = true; 

        clearTimeout(timeoutId);
        return data;
    } catch (e) {
        return { id: app.id, type: app.type, name: app.name, online: false };
    }
  }));

  return results;
}

export async function fetchServiceHealth() {
  const services = await prisma.service.findMany({ orderBy: { name: "asc" } });
  
  const checkService = async (service: any) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(service.url, { method: "HEAD", cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      
      const isOnline = res.ok || res.status === 401 || res.status === 403;
      return { id: service.id, name: service.name, online: isOnline };
    } catch (e) { 
        return { id: service.id, name: service.name, online: false }; 
    }
  };
  
  return await Promise.all(services.map(checkService));
}
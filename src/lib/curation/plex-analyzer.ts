if (typeof process !== "undefined" && process.env) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getPlexServers, getPlexCloudServersMap } from "@/lib/plex";

export interface PlexMediaStreamInfo {
    ratingKey: string;
    key: string;
    title: string;
    year?: number;
    type: "movie" | "show" | "season" | "episode";
    thumb?: string;
    art?: string;
    duration?: number;
    summary?: string;
    studio?: string;
    contentRating?: string;
    rating?: number;
    audienceRating?: number;
    imdbRating?: number;
    rtCriticsRating?: number;
    rtAudienceRating?: number;
    addedAt?: number;
    lastViewedAt?: number;
    viewCount?: number;
    fileSize?: number;
    filePath?: string;
    guids: {
        imdb?: string;
        tmdb?: string;
        tvdb?: string;
    };
    media: {
        id: number;
        videoResolution?: string; // 4k, 1080, 720, sd
        videoCodec?: string; // hevc, h264, av1, vc1
        videoProfile?: string; // main 10, high
        videoFrameRate?: string; // 24p, 60p
        hdrFormat?: "Dolby Vision" | "HDR10+" | "HDR10" | "HDR" | "SDR";
        audioCodec?: string; // eac3, truehd, dca, aac, flac
        audioProfile?: string; // atmos, dts:x, ma, es
        audioChannels?: number; // 2, 6 (5.1), 8 (7.1)
        audioTitle?: string; // "Dolby Atmos TrueHD 7.1", etc.
        bitrate?: number;
        width?: number;
        height?: number;
        container?: string; // mkv, mp4
    }[];
    detectedBadges: {
        resolution?: "4K" | "1080p" | "720p" | "SD";
        hdr?: "DV" | "HDR10+" | "HDR10" | "HDR";
        audio?: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1";
        audioChannels?: string;
        codec?: string;
        edition?: string;
        studio?: string;
        contentRating?: string;
        audioFormatLabel?: string;
        videoFormatLabel?: string;
    };
    isLeavingSoon?: boolean;
}

/**
 * Parses Plex stream attributes to detect 4K, HDR, Dolby Vision, Atmos, audio channels, codecs, editions, etc.
 */
export function analyzeMediaStreamInfo(metadata: any): PlexMediaStreamInfo {
    const guids: { imdb?: string; tmdb?: string; tvdb?: string } = {};
    
    // Parse Guid tags: imdb://tt1234567, tmdb://12345, tvdb://12345
    if (Array.isArray(metadata.Guid)) {
        for (const g of metadata.Guid) {
            const idStr = String(g.id || "");
            if (idStr.startsWith("imdb://")) guids.imdb = idStr.replace("imdb://", "");
            else if (idStr.startsWith("tmdb://")) guids.tmdb = idStr.replace("tmdb://", "");
            else if (idStr.startsWith("tvdb://")) guids.tvdb = idStr.replace("tvdb://", "");
        }
    }
    if (metadata.guid) {
        const idStr = String(metadata.guid);
        if (idStr.includes("imdb://") && !guids.imdb) guids.imdb = idStr.split("imdb://")[1]?.split("?")[0];
        if (idStr.includes("tmdb://") && !guids.tmdb) guids.tmdb = idStr.split("tmdb://")[1]?.split("?")[0];
        if (idStr.includes("tvdb://") && !guids.tvdb) guids.tvdb = idStr.split("tvdb://")[1]?.split("?")[0];
    }

    const rawMediaList = Array.isArray(metadata.Media) ? metadata.Media : metadata.Media ? [metadata.Media] : [];
    const mediaList: PlexMediaStreamInfo["media"] = [];

    let detectedRes: "4K" | "1080p" | "720p" | "SD" | undefined;
    let detectedHdr: "DV" | "HDR10+" | "HDR10" | "HDR" | undefined;
    let detectedAudio: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1" | undefined;
    let detectedAudioChannels: string | undefined;
    let detectedCodec: string | undefined;
    let detectedEdition: string | undefined;
    let detectedStudio: string | undefined;
    let detectedContentRating: string | undefined;
    let audioFormatLabel: string | undefined;
    let videoFormatLabel: string | undefined;

    // Detect edition from Plex editionTitle, title, or filePath
    const titleLower = (metadata.title || "").toLowerCase();
    const editionTitle = (metadata.editionTitle || "").toLowerCase();
    const firstPartFile = (rawMediaList[0]?.Part?.[0] || rawMediaList[0]?.Part)?.file || "";
    const fileLower = firstPartFile.toLowerCase();

    if (editionTitle.includes("imax") || titleLower.includes("imax") || fileLower.includes("imax")) detectedEdition = "IMAX";
    else if (editionTitle.includes("criterion") || titleLower.includes("criterion") || fileLower.includes("criterion")) detectedEdition = "Criterion";
    else if (editionTitle.includes("director") || titleLower.includes("director's cut") || fileLower.includes("directors.cut") || fileLower.includes("director.cut")) detectedEdition = "Director's Cut";
    else if (editionTitle.includes("extended") || titleLower.includes("extended") || fileLower.includes("extended.cut") || fileLower.includes("extended.edition")) detectedEdition = "Extended";
    else if (editionTitle.includes("remaster") || titleLower.includes("remaster") || fileLower.includes("remastered")) detectedEdition = "Remastered";
    else if (fileLower.includes("remux")) detectedEdition = "Remux";

    // Detect Studio
    const studioRaw = (metadata.studio || "").toLowerCase();
    if (studioRaw.includes("hbo") || studioRaw.includes("max")) detectedStudio = "HBO";
    else if (studioRaw.includes("netflix")) detectedStudio = "Netflix";
    else if (studioRaw.includes("disney")) detectedStudio = "Disney+";
    else if (studioRaw.includes("apple")) detectedStudio = "Apple TV+";
    else if (studioRaw.includes("amazon") || studioRaw.includes("prime")) detectedStudio = "Prime";
    else if (studioRaw.includes("marvel")) detectedStudio = "Marvel";
    else if (studioRaw.includes("dc comics") || studioRaw.includes("dc entertainment")) detectedStudio = "DC";
    else if (studioRaw.includes("a24")) detectedStudio = "A24";
    else if (studioRaw.includes("paramount")) detectedStudio = "Paramount+";
    else if (studioRaw.includes("hulu")) detectedStudio = "Hulu";

    // Detect Content Rating
    const crRaw = (metadata.contentRating || "").toUpperCase();
    if (crRaw) {
        if (crRaw.includes("PG-13") || crRaw.includes("TV-14")) detectedContentRating = "PG-13";
        else if (crRaw.includes("PG") || crRaw.includes("TV-PG")) detectedContentRating = "PG";
        else if (crRaw === "G" || crRaw.includes("TV-G") || crRaw.includes("TV-Y")) detectedContentRating = "G";
        else if (crRaw.includes("NC-17")) detectedContentRating = "NC-17";
        else if (crRaw.includes("TV-MA") || crRaw.includes("R")) detectedContentRating = "R";
    }

    for (const m of rawMediaList) {
        const rawRes = (m.videoResolution || "").toLowerCase();
        const width = parseInt(m.width || "0", 10);
        const height = parseInt(m.height || "0", 10);
        const rawCodec = (m.videoCodec || "").toLowerCase();

        if (rawCodec.includes("hevc") || rawCodec.includes("h265") || rawCodec.includes("x265")) detectedCodec = "HEVC";
        else if (rawCodec.includes("av1")) detectedCodec = "AV1";
        else if (rawCodec.includes("prores")) detectedCodec = "ProRes";
        else if (rawCodec.includes("h264") || rawCodec.includes("avc") || rawCodec.includes("x264")) detectedCodec = "AVC";

        let res: "4K" | "1080p" | "720p" | "SD" = "1080p";
        if (rawRes === "4k" || width >= 3800 || height >= 2100) res = "4K";
        else if (rawRes === "1080" || width >= 1900 || height >= 1000) res = "1080p";
        else if (rawRes === "720" || width >= 1200 || height >= 700) res = "720p";
        else if (rawRes === "sd" || rawRes === "480" || rawRes === "576") res = "SD";

        if (!detectedRes || (res === "4K") || (res === "1080p" && detectedRes !== "4K")) {
            detectedRes = res;
        }

        const rawParts = Array.isArray(m.Part) ? m.Part : m.Part ? [m.Part] : [];
        let itemHdr: "Dolby Vision" | "HDR10+" | "HDR10" | "HDR" | "SDR" = "SDR";
        let itemAudioCodec = (m.audioCodec || "").toLowerCase();
        let itemAudioProfile = (m.audioProfile || "").toLowerCase();
        let itemAudioChannels = parseInt(m.audioChannels || "2", 10);
        let itemAudioTitle = "";

        if (itemAudioChannels >= 8) detectedAudioChannels = "7.1";
        else if (itemAudioChannels >= 6) detectedAudioChannels = "5.1";
        else if (itemAudioChannels === 2) detectedAudioChannels = "2.0";

        for (const part of rawParts) {
            const streams = Array.isArray(part.Stream) ? part.Stream : part.Stream ? [part.Stream] : [];
            
            // Analyze video stream
            const videoStream = streams.find((s: any) => s.streamType === 1 || s.streamType === "1");
            if (videoStream) {
                const colorPrimaries = (videoStream.colorPrimaries || "").toLowerCase();
                const doviTitle = (videoStream.doviTitle || "").toLowerCase();
                const doviProfile = videoStream.doviProfile;
                const displayTitle = (videoStream.displayTitle || "").toLowerCase();
                const extendedDisplayTitle = (videoStream.extendedDisplayTitle || "").toLowerCase();

                if (doviProfile || doviTitle || displayTitle.includes("dovi") || displayTitle.includes("dolby vision") || extendedDisplayTitle.includes("dolby vision")) {
                    itemHdr = "Dolby Vision";
                    detectedHdr = "DV";
                } else if (displayTitle.includes("hdr10+") || extendedDisplayTitle.includes("hdr10+")) {
                    itemHdr = "HDR10+";
                    if (detectedHdr !== "DV") detectedHdr = "HDR10+";
                } else if (colorPrimaries.includes("bt2020") || displayTitle.includes("hdr") || extendedDisplayTitle.includes("hdr") || videoStream.colorSpace?.toLowerCase().includes("bt2020")) {
                    itemHdr = "HDR10";
                    if (!detectedHdr || (detectedHdr !== "DV" && detectedHdr !== "HDR10+")) detectedHdr = "HDR10";
                }
            }

            // Analyze audio streams (pick primary / highest quality)
            const audioStreams = streams.filter((s: any) => s.streamType === 2 || s.streamType === "2");
            for (const as of audioStreams) {
                const aTitle = (as.title || "").toLowerCase();
                const aDisplay = (as.displayTitle || "").toLowerCase();
                const aExtended = (as.extendedDisplayTitle || "").toLowerCase();
                const aCodec = (as.codec || "").toLowerCase();
                const aChannels = parseInt(as.channels || "2", 10);

                if (aChannels >= 8) detectedAudioChannels = "7.1";
                else if (aChannels >= 6 && detectedAudioChannels !== "7.1") detectedAudioChannels = "5.1";

                if (aTitle.includes("atmos") || aDisplay.includes("atmos") || aExtended.includes("atmos") || as.audioChannelLayout?.toLowerCase().includes("atmos")) {
                    detectedAudio = "ATMOS";
                    audioFormatLabel = "Dolby Atmos";
                    itemAudioProfile = "atmos";
                } else if (aCodec === "truehd" || aDisplay.includes("truehd")) {
                    if (!detectedAudio || detectedAudio !== "ATMOS") {
                        detectedAudio = "TRUEHD";
                        audioFormatLabel = aChannels >= 8 ? "TrueHD 7.1" : "TrueHD 5.1";
                    }
                } else if (aTitle.includes("dts:x") || aDisplay.includes("dts:x") || aExtended.includes("dts:x") || as.profile?.toLowerCase().includes("dts:x")) {
                    if (detectedAudio !== "ATMOS") {
                        detectedAudio = "DTS:X";
                        audioFormatLabel = "DTS:X";
                    }
                } else if (aCodec.includes("dca") || aCodec.includes("dts") || aDisplay.includes("dts-hd") || aDisplay.includes("master audio")) {
                    if (!detectedAudio || (detectedAudio !== "ATMOS" && detectedAudio !== "DTS:X" && detectedAudio !== "TRUEHD")) {
                        detectedAudio = "DTS-HD";
                        audioFormatLabel = aChannels >= 8 ? "DTS-HD MA 7.1" : "DTS-HD MA 5.1";
                    }
                } else if (aChannels >= 8) {
                    if (!detectedAudio) {
                        detectedAudio = "7.1";
                        audioFormatLabel = "7.1 Surround";
                    }
                } else if (aChannels >= 6) {
                    if (!detectedAudio) {
                        detectedAudio = "5.1";
                        audioFormatLabel = "5.1 Surround";
                    }
                }

                if (!itemAudioTitle && (aDisplay || aTitle)) {
                    itemAudioTitle = as.displayTitle || as.title || "";
                }
            }
        }

        mediaList.push({
            id: m.id,
            videoResolution: res,
            videoCodec: m.videoCodec,
            videoProfile: m.videoProfile,
            videoFrameRate: m.videoFrameRate,
            hdrFormat: itemHdr,
            audioCodec: itemAudioCodec,
            audioProfile: itemAudioProfile,
            audioChannels: itemAudioChannels,
            audioTitle: itemAudioTitle,
            bitrate: m.bitrate,
            width,
            height,
            container: m.container
        });
    }

    if (detectedRes === "4K") {
        videoFormatLabel = detectedHdr === "DV" ? "4K UHD • Dolby Vision" : detectedHdr ? "4K UHD • HDR" : "4K UHD";
    } else if (detectedRes === "1080p") {
        videoFormatLabel = detectedHdr ? "1080p • HDR" : "1080p FHD";
    }

    const totalSize = rawMediaList.reduce((acc: number, m: any) => {
        const parts = Array.isArray(m.Part) ? m.Part : m.Part ? [m.Part] : [];
        return acc + parts.reduce((pAcc: number, p: any) => pAcc + (parseInt(p.size || "0", 10)), 0);
    }, 0);

    const firstPart = rawMediaList[0]?.Part?.[0] || rawMediaList[0]?.Part;
    const filePath: string | undefined = firstPart?.file;

    return {
        ratingKey: String(metadata.ratingKey),
        key: metadata.key,
        title: metadata.title,
        year: metadata.year ? parseInt(metadata.year, 10) : undefined,
        type: metadata.type || "movie",
        thumb: metadata.thumb,
        art: metadata.art,
        duration: metadata.duration ? parseInt(metadata.duration, 10) : undefined,
        summary: metadata.summary,
        studio: metadata.studio,
        contentRating: metadata.contentRating,
        rating: metadata.rating ? parseFloat(metadata.rating) : undefined,
        audienceRating: metadata.audienceRating ? parseFloat(metadata.audienceRating) : undefined,
        addedAt: metadata.addedAt ? parseInt(metadata.addedAt, 10) * 1000 : undefined,
        lastViewedAt: metadata.lastViewedAt ? parseInt(metadata.lastViewedAt, 10) * 1000 : undefined,
        viewCount: metadata.viewCount ? parseInt(metadata.viewCount, 10) : 0,
        fileSize: totalSize > 0 ? totalSize : undefined,
        filePath,
        guids,
        media: mediaList,
        detectedBadges: {
            resolution: detectedRes,
            hdr: detectedHdr,
            audio: detectedAudio,
            audioChannels: detectedAudioChannels,
            codec: detectedCodec,
            edition: detectedEdition,
            studio: detectedStudio,
            contentRating: detectedContentRating,
            audioFormatLabel,
            videoFormatLabel
        }
    };
}

/**
 * Expands a single URL or candidate list into deduplicated http/https endpoints.
 */
export function expandCandidateUrls(serverUrlOrCandidates: string | string[]): string[] {
    const rawList = Array.isArray(serverUrlOrCandidates) ? serverUrlOrCandidates : [serverUrlOrCandidates];
    const results: string[] = [];

    const add = (u?: string) => {
        if (!u) return;
        const clean = u.replace(/\/+$/, "").trim();
        if (!clean) return;
        if (!results.includes(clean)) results.push(clean);
        if (clean.startsWith("http://")) {
            const httpsAlt = clean.replace("http://", "https://");
            if (!results.includes(httpsAlt)) results.push(httpsAlt);
        } else if (clean.startsWith("https://")) {
            const httpAlt = clean.replace("https://", "http://");
            if (!results.includes(httpAlt)) results.push(httpAlt);
        }
    };

    for (const raw of rawList) {
        add(raw);
    }
    return results;
}

function parsePlexXmlMetadata(xml: string): any[] {
    const items: any[] = [];
    const itemMatches = xml.matchAll(/<(Video|Directory)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi);
    for (const match of itemMatches) {
        const tag = match[1];
        const attrs = match[2] || "";
        const inner = match[3] || "";

        const getAttr = (name: string) => {
            const m = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
            return m ? m[1] : undefined;
        };

        const ratingKey = getAttr("ratingKey") || getAttr("key")?.replace("/library/metadata/", "") || "";
        if (!ratingKey) continue;

        const guids: { id: string }[] = [];
        const guidMatches = inner.matchAll(/<Guid\b([^>]*?)(?:\/>|>.*?<\/Guid>)/gi);
        for (const gm of guidMatches) {
            const gAttrs = gm[1] || "";
            const gId = gAttrs.match(/\bid=["']([^"']*)["']/i)?.[1];
            if (gId) guids.push({ id: gId });
        }

        const mediaList: any[] = [];
        const mediaMatches = inner.matchAll(/<Media\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Media>)/gi);
        for (const mm of mediaMatches) {
            const mAttrs = mm[1] || "";
            const mInner = mm[2] || "";
            const getMAttr = (name: string) => {
                const m = mAttrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
                return m ? m[1] : undefined;
            };

            const parts: any[] = [];
            const partMatches = mInner.matchAll(/<Part\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Part>)/gi);
            for (const pm of partMatches) {
                const pAttrs = pm[1] || "";
                const pInner = pm[2] || "";
                const getPAttr = (name: string) => {
                    const m = pAttrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
                    return m ? m[1] : undefined;
                };

                const streams: any[] = [];
                const streamMatches = pInner.matchAll(/<Stream\b([^>]*?)(?:\/>|>.*?<\/Stream>)/gi);
                for (const sm of streamMatches) {
                    const sAttrs = sm[1] || "";
                    const getSAttr = (name: string) => {
                        const m = sAttrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
                        return m ? m[1] : undefined;
                    };
                    streams.push({
                        streamType: parseInt(getSAttr("streamType") || "0", 10),
                        codec: getSAttr("codec"),
                        title: getSAttr("title"),
                        displayTitle: getSAttr("displayTitle"),
                        extendedDisplayTitle: getSAttr("extendedDisplayTitle"),
                        channels: getSAttr("channels"),
                        audioChannelLayout: getSAttr("audioChannelLayout"),
                        colorPrimaries: getSAttr("colorPrimaries"),
                        colorSpace: getSAttr("colorSpace"),
                        doviTitle: getSAttr("doviTitle"),
                        doviProfile: getSAttr("doviProfile"),
                        profile: getSAttr("profile")
                    });
                }

                parts.push({
                    id: getPAttr("id"),
                    file: getPAttr("file"),
                    size: getPAttr("size"),
                    duration: getPAttr("duration"),
                    Stream: streams
                });
            }

            mediaList.push({
                id: getMAttr("id"),
                videoResolution: getMAttr("videoResolution"),
                videoCodec: getMAttr("videoCodec"),
                videoProfile: getMAttr("videoProfile"),
                videoFrameRate: getMAttr("videoFrameRate"),
                audioCodec: getMAttr("audioCodec"),
                audioProfile: getMAttr("audioProfile"),
                audioChannels: getMAttr("audioChannels"),
                bitrate: getMAttr("bitrate") ? parseInt(getMAttr("bitrate")!, 10) : undefined,
                width: getMAttr("width") ? parseInt(getMAttr("width")!, 10) : undefined,
                height: getMAttr("height") ? parseInt(getMAttr("height")!, 10) : undefined,
                container: getMAttr("container"),
                Part: parts
            });
        }

        items.push({
            ratingKey,
            key: getAttr("key") || `/library/metadata/${ratingKey}`,
            title: getAttr("title") || "Untitled",
            year: getAttr("year"),
            type: getAttr("type") || (tag.toLowerCase() === "video" ? "movie" : "show"),
            thumb: getAttr("thumb"),
            art: getAttr("art"),
            duration: getAttr("duration"),
            summary: getAttr("summary"),
            studio: getAttr("studio"),
            contentRating: getAttr("contentRating"),
            rating: getAttr("rating"),
            audienceRating: getAttr("audienceRating"),
            addedAt: getAttr("addedAt"),
            lastViewedAt: getAttr("lastViewedAt"),
            viewCount: getAttr("viewCount"),
            guid: getAttr("guid"),
            Guid: guids,
            Media: mediaList
        });
    }
    return items;
}

function parsePlexXmlCollections(xml: string): { 
    ratingKey: string; 
    title: string; 
    summary?: string; 
    thumb?: string; 
    art?: string;
    childCount: number; 
    sortTitle?: string; 
    smart?: boolean;
    promotedToHome?: boolean;
    promotedToRecommended?: boolean;
    promotedToSharedHome?: boolean;
}[] {
    const items: { 
        ratingKey: string; 
        title: string; 
        summary?: string; 
        thumb?: string; 
        art?: string;
        childCount: number; 
        sortTitle?: string; 
        smart?: boolean;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
    }[] = [];
    const itemMatches = xml.matchAll(/<(Directory|Video)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/gi);
    for (const match of itemMatches) {
        const attrs = match[2] || "";
        const getAttr = (name: string) => {
            const m = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
            return m ? m[1] : undefined;
        };

        const ratingKey = getAttr("ratingKey") || getAttr("key")?.replace("/library/metadata/", "") || "";
        const title = getAttr("title") || "";
        if (ratingKey && title) {
            items.push({
                ratingKey,
                title,
                summary: getAttr("summary"),
                thumb: getAttr("thumb"),
                art: getAttr("art"),
                childCount: parseInt(getAttr("childCount") || "0", 10),
                sortTitle: getAttr("titleSort"),
                smart: getAttr("smart") === "1" || getAttr("subtype") === "smart",
                promotedToHome: getAttr("promotedToHome") !== "0",
                promotedToRecommended: getAttr("promotedToRecommended") !== "0",
                promotedToSharedHome: getAttr("promotedToSharedHome") !== "0"
            });
        }
    }
    return items;
}

function parsePlexXmlHubs(xml: string, targetSectionKey?: string): {
    ratingKey: string;
    title: string;
    summary?: string;
    thumb?: string;
    art?: string;
    childCount: number;
    sortTitle?: string;
    smart?: boolean;
    isHub?: boolean;
    hubIdentifier?: string;
    promotedToHome?: boolean;
    promotedToRecommended?: boolean;
    promotedToSharedHome?: boolean;
}[] {
    const hubs: {
        ratingKey: string;
        title: string;
        summary?: string;
        thumb?: string;
        art?: string;
        childCount: number;
        sortTitle?: string;
        smart?: boolean;
        isHub?: boolean;
        hubIdentifier?: string;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
    }[] = [];
    const hubMatches = xml.matchAll(/<Hub\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Hub>)/gi);
    for (const match of hubMatches) {
        const attrs = match[1] || "";
        const inner = match[2] || "";
        const getAttr = (name: string) => {
            const m = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
            return m ? m[1] : undefined;
        };

        const title = getAttr("title") || "";
        const hubIdentifier = getAttr("hubIdentifier") || getAttr("key") || "";
        const librarySectionID = getAttr("librarySectionID");

        if (targetSectionKey && librarySectionID && String(librarySectionID) !== String(targetSectionKey)) {
            continue;
        }

        const thumb = getAttr("thumb") || inner.match(/<(Video|Directory)\b[^>]*?\bthumb=["']([^"']*)["']/i)?.[1];
        const art = getAttr("art") || inner.match(/<(Video|Directory)\b[^>]*?\bart=["']([^"']*)["']/i)?.[1];
        const count = parseInt(getAttr("size") || getAttr("count") || "0", 10);

        if (title) {
            hubs.push({
                ratingKey: `hub:${hubIdentifier || title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                title,
                summary: getAttr("summary") || `Plex Hub: ${title}`,
                thumb,
                art,
                childCount: count,
                sortTitle: getAttr("titleSort") || title,
                smart: true,
                isHub: true,
                hubIdentifier,
                promotedToHome: getAttr("promoted") !== "0",
                promotedToRecommended: true,
                promotedToSharedHome: true
            });
        }
    }
    return hubs;
}

/**
 * Fetches all media items from a Plex library section with stream metadata.
 */
export async function getPlexLibraryMediaItems(
    serverUrlOrCandidates: string | string[],
    token: string,
    sectionKey: string | number,
    limit = 500
): Promise<PlexMediaStreamInfo[]> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);
    let lastError: any = null;

    for (const cleanBase of urlsToTry) {
        if (!cleanBase) continue;

        // 1. Try standard query with includeGuids=1
        try {
            const urlWithGuids = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?includeGuids=1&X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}&X-Plex-Token=${encodeURIComponent(token)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            const res = await fetch(urlWithGuids, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const text = await res.text();
                const trimmed = text.trim();
                let metadata: any[] = [];
                if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                    try {
                        const data = JSON.parse(trimmed);
                        const m = data.MediaContainer?.Metadata || data.MediaContainer?.Directory || data.MediaContainer?.Video || [];
                        metadata = Array.isArray(m) ? m : [m];
                    } catch (e) {}
                }
                if (metadata.length === 0 && (trimmed.includes("<MediaContainer") || trimmed.includes("<Video") || trimmed.includes("<Directory"))) {
                    metadata = parsePlexXmlMetadata(trimmed);
                }
                if (metadata.length > 0) {
                    return metadata.map(analyzeMediaStreamInfo);
                }
            } else {
                lastError = new Error(`HTTP ${res.status}`);
            }
        } catch (e: any) {
            lastError = e;
        }

        // 2. Try fast fallback without includeGuids=1
        try {
            const fallbackUrl = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}&X-Plex-Token=${encodeURIComponent(token)}`;
            const fbController = new AbortController();
            const fbTimeoutId = setTimeout(() => fbController.abort(), 15000);
            const fbRes = await fetch(fallbackUrl, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: fbController.signal,
                cache: "no-store"
            });
            clearTimeout(fbTimeoutId);

            if (fbRes.ok) {
                const text = await fbRes.text();
                const trimmed = text.trim();
                let metadata: any[] = [];
                if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                    try {
                        const data = JSON.parse(trimmed);
                        const m = data.MediaContainer?.Metadata || data.MediaContainer?.Directory || data.MediaContainer?.Video || [];
                        metadata = Array.isArray(m) ? m : [m];
                    } catch (e) {}
                }
                if (metadata.length === 0 && (trimmed.includes("<MediaContainer") || trimmed.includes("<Video") || trimmed.includes("<Directory"))) {
                    metadata = parsePlexXmlMetadata(trimmed);
                }
                if (metadata.length > 0) {
                    return metadata.map(analyzeMediaStreamInfo);
                }
            }
        } catch (fbErr: any) {
            lastError = fbErr;
        }
    }

    if (lastError) {
        logger.addLog("WARN", "PLEX", `Query library section ${sectionKey} items failed: ${lastError.message}`);
    }
    return [];
}

/**
 * Fetches existing Plex collections, smart collections, and section hubs for a library section.
 */
export async function getPlexLibraryCollections(
    serverUrlOrCandidates: string | string[],
    token: string,
    sectionKey: string | number
): Promise<{ 
    ratingKey: string; 
    title: string; 
    summary?: string; 
    thumb?: string; 
    art?: string;
    childCount: number;
    sortTitle?: string;
    smart?: boolean;
    isHub?: boolean;
    hubIdentifier?: string;
    promotedToHome?: boolean;
    promotedToRecommended?: boolean;
    promotedToSharedHome?: boolean;
}[]> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);
    const discoveredMap = new Map<string, any>();

    for (const cleanBase of urlsToTry) {
        if (!cleanBase) continue;

        // 1. Try /library/sections/{sectionKey}/collections (Standard Collections endpoint)
        try {
            const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/collections?X-Plex-Token=${encodeURIComponent(token)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const text = await res.text();
                const trimmed = text.trim();

                if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                    try {
                        const data = JSON.parse(trimmed);
                        const metadata = data.MediaContainer?.Metadata || data.MediaContainer?.Directory || [];
                        const collections = Array.isArray(metadata) ? metadata : [metadata];
                        for (const c of collections) {
                            const rKey = String(c.ratingKey || c.key?.replace("/library/metadata/", "") || "");
                            if (rKey && !discoveredMap.has(rKey)) {
                                discoveredMap.set(rKey, {
                                    ratingKey: rKey,
                                    title: c.title || "Untitled Collection",
                                    summary: c.summary,
                                    thumb: c.thumb,
                                    art: c.art,
                                    childCount: parseInt(c.childCount || "0", 10),
                                    sortTitle: c.titleSort,
                                    smart: Boolean(c.smart === "1" || c.smart === 1 || c.subtype === "smart"),
                                    promotedToHome: c.promotedToHome !== "0" && c.promotedToHome !== 0,
                                    promotedToRecommended: c.promotedToRecommended !== "0" && c.promotedToRecommended !== 0,
                                    promotedToSharedHome: c.promotedToSharedHome !== "0" && c.promotedToSharedHome !== 0
                                });
                            }
                        }
                    } catch (e) {}
                } else if (trimmed.includes("<MediaContainer") || trimmed.includes("<Directory") || trimmed.includes("<Video")) {
                    const parsed = parsePlexXmlCollections(trimmed);
                    for (const p of parsed) {
                        if (p.ratingKey && !discoveredMap.has(p.ratingKey)) discoveredMap.set(p.ratingKey, p);
                    }
                }
            }
        } catch (e) {}

        // 2. Try /library/sections/{sectionKey}/all?type=18 (Type 18 collections in PMS)
        try {
            const url2 = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?type=18&X-Plex-Token=${encodeURIComponent(token)}`;
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 8000);
            const res2 = await fetch(url2, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller2.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId2);

            if (res2.ok) {
                const text2 = await res2.text();
                const trimmed2 = text2.trim();
                if (trimmed2.startsWith("{") || trimmed2.startsWith("[")) {
                    try {
                        const data2 = JSON.parse(trimmed2);
                        const metadata2 = data2.MediaContainer?.Metadata || data2.MediaContainer?.Directory || [];
                        const collections2 = Array.isArray(metadata2) ? metadata2 : [metadata2];
                        for (const c of collections2) {
                            const rKey = String(c.ratingKey || c.key?.replace("/library/metadata/", "") || "");
                            if (rKey && !discoveredMap.has(rKey)) {
                                discoveredMap.set(rKey, {
                                    ratingKey: rKey,
                                    title: c.title || "Untitled Collection",
                                    summary: c.summary,
                                    thumb: c.thumb,
                                    art: c.art,
                                    childCount: parseInt(c.childCount || "0", 10),
                                    sortTitle: c.titleSort,
                                    smart: Boolean(c.smart === "1" || c.smart === 1 || c.subtype === "smart"),
                                    promotedToHome: c.promotedToHome !== "0" && c.promotedToHome !== 0,
                                    promotedToRecommended: c.promotedToRecommended !== "0" && c.promotedToRecommended !== 0,
                                    promotedToSharedHome: c.promotedToSharedHome !== "0" && c.promotedToSharedHome !== 0
                                });
                            }
                        }
                    } catch (e) {}
                } else if (trimmed2.includes("<MediaContainer") || trimmed2.includes("<Directory") || trimmed2.includes("<Video")) {
                    const parsed2 = parsePlexXmlCollections(trimmed2);
                    for (const p of parsed2) {
                        if (p.ratingKey && !discoveredMap.has(p.ratingKey)) discoveredMap.set(p.ratingKey, p);
                    }
                }
            }
        } catch (e) {}

        // 3. Try /hubs/sections/{sectionKey} to discover Section Hubs & Recommended Carousels (Recently Added, Top Movies, Adventure, etc.)
        try {
            const url3 = `${cleanBase}/hubs/sections/${encodeURIComponent(String(sectionKey))}?count=50&includeFeatured=1&includeStations=1&X-Plex-Token=${encodeURIComponent(token)}`;
            const controller3 = new AbortController();
            const timeoutId3 = setTimeout(() => controller3.abort(), 8000);
            const res3 = await fetch(url3, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller3.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId3);

            if (res3.ok) {
                const text3 = await res3.text();
                const trimmed3 = text3.trim();
                if (trimmed3.startsWith("{") || trimmed3.startsWith("[")) {
                    try {
                        const data3 = JSON.parse(trimmed3);
                        const hubs = data3.MediaContainer?.Hub || [];
                        const hubList = Array.isArray(hubs) ? hubs : [hubs];
                        for (const h of hubList) {
                            const hubTitle = h.title?.trim();
                            if (hubTitle) {
                                const alreadyExists = Array.from(discoveredMap.values()).some(
                                    x => x.title.toLowerCase() === hubTitle.toLowerCase()
                                );
                                if (!alreadyExists) {
                                    const hubKey = `hub:${h.hubIdentifier || hubTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                                    discoveredMap.set(hubKey, {
                                        ratingKey: hubKey,
                                        title: hubTitle,
                                        summary: h.summary || `Plex Built-in Hub: ${hubTitle}`,
                                        thumb: h.thumb || h.Metadata?.[0]?.thumb || undefined,
                                        art: h.art,
                                        childCount: parseInt(h.size || h.count || (h.Metadata ? h.Metadata.length : 0) || "0", 10),
                                        smart: true,
                                        isHub: true,
                                        hubIdentifier: h.hubIdentifier,
                                        promotedToHome: h.promoted !== "0" && h.promoted !== 0,
                                        promotedToRecommended: true,
                                        promotedToSharedHome: true
                                    });
                                }
                            }
                        }
                    } catch (e) {}
                } else if (trimmed3.includes("<MediaContainer") || trimmed3.includes("<Hub")) {
                    const parsedHubs = parsePlexXmlHubs(trimmed3, String(sectionKey));
                    for (const ph of parsedHubs) {
                        const alreadyExists = Array.from(discoveredMap.values()).some(
                            x => x.title.toLowerCase() === ph.title.toLowerCase()
                        );
                        if (!alreadyExists && ph.ratingKey) {
                            discoveredMap.set(ph.ratingKey, ph);
                        }
                    }
                }
            }
        } catch (e) {}

        // 4. Try /hubs/promoted to discover Promoted Home Screen Hubs (Recently Added in Movies, Recently Added in TV, Continue Watching, etc.)
        try {
            const urlPromoted = `${cleanBase}/hubs/promoted?count=50&X-Plex-Token=${encodeURIComponent(token)}`;
            const controller4 = new AbortController();
            const timeoutId4 = setTimeout(() => controller4.abort(), 8000);
            const res4 = await fetch(urlPromoted, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller4.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId4);

            if (res4.ok) {
                const text4 = await res4.text();
                const trimmed4 = text4.trim();
                if (trimmed4.startsWith("{") || trimmed4.startsWith("[")) {
                    try {
                        const data4 = JSON.parse(trimmed4);
                        const hubs4 = data4.MediaContainer?.Hub || [];
                        const hubList4 = Array.isArray(hubs4) ? hubs4 : [hubs4];
                        for (const h of hubList4) {
                            const hubSecId = String(h.librarySectionID || "");
                            const hubKeyStr = String(h.key || "");
                            const isMatch = !sectionKey || 
                                            (hubSecId && hubSecId === String(sectionKey)) || 
                                            hubKeyStr.includes(`/sections/${sectionKey}/`) || 
                                            hubKeyStr.includes(`/sections/${sectionKey}?`);
                            if (isMatch) {
                                const hubTitle = h.title?.trim();
                                if (hubTitle) {
                                    const alreadyExists = Array.from(discoveredMap.values()).some(
                                        x => x.title.toLowerCase() === hubTitle.toLowerCase()
                                    );
                                    if (!alreadyExists) {
                                        const hubKey = `hub:${h.hubIdentifier || hubTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                                        discoveredMap.set(hubKey, {
                                            ratingKey: hubKey,
                                            title: hubTitle,
                                            summary: h.summary || `Plex Built-in Hub: ${hubTitle}`,
                                            thumb: h.thumb || h.Metadata?.[0]?.thumb || undefined,
                                            art: h.art,
                                            childCount: parseInt(h.size || h.count || (h.Metadata ? h.Metadata.length : 0) || "0", 10),
                                            smart: true,
                                            isHub: true,
                                            hubIdentifier: h.hubIdentifier,
                                            promotedToHome: h.promoted !== "0" && h.promoted !== 0,
                                            promotedToRecommended: true,
                                            promotedToSharedHome: true
                                        });
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                } else if (trimmed4.includes("<MediaContainer") || trimmed4.includes("<Hub")) {
                    const parsedHubs4 = parsePlexXmlHubs(trimmed4, String(sectionKey));
                    for (const ph of parsedHubs4) {
                        const alreadyExists = Array.from(discoveredMap.values()).some(
                            x => x.title.toLowerCase() === ph.title.toLowerCase()
                        );
                        if (!alreadyExists && ph.ratingKey) {
                            discoveredMap.set(ph.ratingKey, ph);
                        }
                    }
                }
            }
        } catch (e) {}

        // 5. Try /hubs to discover all Home Screen Hubs (Continue Watching, Recently Added, etc.)
        try {
            const urlAllHubs = `${cleanBase}/hubs?count=50&X-Plex-Token=${encodeURIComponent(token)}`;
            const controller5 = new AbortController();
            const timeoutId5 = setTimeout(() => controller5.abort(), 8000);
            const res5 = await fetch(urlAllHubs, {
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller5.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId5);

            if (res5.ok) {
                const text5 = await res5.text();
                const trimmed5 = text5.trim();
                if (trimmed5.startsWith("{") || trimmed5.startsWith("[")) {
                    try {
                        const data5 = JSON.parse(trimmed5);
                        const hubs5 = data5.MediaContainer?.Hub || [];
                        const hubList5 = Array.isArray(hubs5) ? hubs5 : [hubs5];
                        for (const h of hubList5) {
                            const hubSecId = String(h.librarySectionID || "");
                            const hubKeyStr = String(h.key || "");
                            const isMatch = !sectionKey || 
                                            (hubSecId && hubSecId === String(sectionKey)) || 
                                            hubKeyStr.includes(`/sections/${sectionKey}/`) || 
                                            hubKeyStr.includes(`/sections/${sectionKey}?`);
                            if (isMatch) {
                                const hubTitle = h.title?.trim();
                                if (hubTitle) {
                                    const alreadyExists = Array.from(discoveredMap.values()).some(
                                        x => x.title.toLowerCase() === hubTitle.toLowerCase()
                                    );
                                    if (!alreadyExists) {
                                        const hubKey = `hub:${h.hubIdentifier || hubTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                                        discoveredMap.set(hubKey, {
                                            ratingKey: hubKey,
                                            title: hubTitle,
                                            summary: h.summary || `Plex Built-in Hub: ${hubTitle}`,
                                            thumb: h.thumb || h.Metadata?.[0]?.thumb || undefined,
                                            art: h.art,
                                            childCount: parseInt(h.size || h.count || (h.Metadata ? h.Metadata.length : 0) || "0", 10),
                                            smart: true,
                                            isHub: true,
                                            hubIdentifier: h.hubIdentifier,
                                            promotedToHome: h.promoted !== "0" && h.promoted !== 0,
                                            promotedToRecommended: true,
                                            promotedToSharedHome: true
                                        });
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                } else if (trimmed5.includes("<MediaContainer") || trimmed5.includes("<Hub")) {
                    const parsedHubs5 = parsePlexXmlHubs(trimmed5, String(sectionKey));
                    for (const ph of parsedHubs5) {
                        const alreadyExists = Array.from(discoveredMap.values()).some(
                            x => x.title.toLowerCase() === ph.title.toLowerCase()
                        );
                        if (!alreadyExists && ph.ratingKey) {
                            discoveredMap.set(ph.ratingKey, ph);
                        }
                    }
                }
            }
        } catch (e) {}

        if (discoveredMap.size > 0) {
            return Array.from(discoveredMap.values());
        }
    }
    return Array.from(discoveredMap.values());
}

/**
 * Creates or updates a Plex collection and populates it with item rating keys.
 */
export async function syncPlexCollection(
    serverUrlOrCandidates: string | string[],
    token: string,
    sectionKey: string | number,
    collectionTitle: string,
    itemRatingKeys: string[],
    options?: {
        summary?: string;
        sortTitle?: string;
        posterBuffer?: Buffer;
        posterUrl?: string;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
        orderIndex?: number;
    }
): Promise<{ success: boolean; collectionRatingKey?: string; message?: string }> {
    if (!collectionTitle || itemRatingKeys.length === 0) {
        return { success: false, message: "Missing collection title or items." };
    }

    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);
    let collectionRatingKey: string | undefined;

    // 1. Check if collection already exists
    const existingCollections = await getPlexLibraryCollections(urlsToTry, token, sectionKey);
    const existing = existingCollections.find(c => c.title.toLowerCase() === collectionTitle.toLowerCase());

    if (existing) {
        collectionRatingKey = existing.ratingKey;
    } else {
        // Create collection by tagging the first item
        const firstKey = itemRatingKeys[0];
        for (const cleanBase of urlsToTry) {
            if (collectionRatingKey) break;
            const tagUrl = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?type=1&id=${encodeURIComponent(firstKey)}&collection%5B0%5D.tag.tag=${encodeURIComponent(collectionTitle)}&X-Plex-Token=${encodeURIComponent(token)}`;
            try {
                const tagRes = await fetch(tagUrl, {
                    method: "PUT",
                    headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                });
                if (tagRes.ok) {
                    const refreshed = await getPlexLibraryCollections(urlsToTry, token, sectionKey);
                    const found = refreshed.find(c => c.title.toLowerCase() === collectionTitle.toLowerCase());
                    if (found) {
                        collectionRatingKey = found.ratingKey;
                        break;
                    }
                }
            } catch (e: any) {
                // Try next URL
            }
        }
    }

    // 2. Add all items to the collection
    let addedCount = 0;
    for (const rKey of itemRatingKeys) {
        let added = false;
        for (const cleanBase of urlsToTry) {
            if (added) break;
            try {
                const addUrl = `${cleanBase}/library/metadata/${encodeURIComponent(rKey)}?collection%5B%5D.tag.tag=${encodeURIComponent(collectionTitle)}&X-Plex-Token=${encodeURIComponent(token)}`;
                const putRes = await fetch(addUrl, {
                    method: "PUT",
                    headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                });
                if (putRes.ok) {
                    addedCount++;
                    added = true;
                }
            } catch (e) {}
        }
    }

    // 3. Update collection summary, sort title, and Home Promotion if rating key resolved
    if (collectionRatingKey) {
        for (const cleanBase of urlsToTry) {
            try {
                const params = new URLSearchParams();
                params.set("type", "18"); // Collection metadata type
                params.set("id", collectionRatingKey);
                if (options?.summary) {
                    params.set("summary.value", options.summary);
                    params.set("summary.locked", "1");
                }
                if (options?.sortTitle) {
                    params.set("titleSort.value", options.sortTitle);
                    params.set("titleSort.locked", "1");
                }
                if (options?.promotedToHome !== undefined) {
                    params.set("promotedToHome.value", options.promotedToHome ? "1" : "0");
                    params.set("promotedToHome.locked", "1");
                }
                if (options?.promotedToRecommended !== undefined) {
                    params.set("promotedToRecommended.value", options.promotedToRecommended ? "1" : "0");
                    params.set("promotedToRecommended.locked", "1");
                }
                if (options?.promotedToSharedHome !== undefined) {
                    params.set("promotedToSharedHome.value", options.promotedToSharedHome ? "1" : "0");
                    params.set("promotedToSharedHome.locked", "1");
                }
                params.set("X-Plex-Token", token);

                const res = await fetch(`${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}`, {
                    method: "PUT",
                    headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                });

                // Also try metadata endpoint directly
                await fetch(`${cleanBase}/library/metadata/${encodeURIComponent(collectionRatingKey)}?${params.toString()}`, {
                    method: "PUT",
                    headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                }).catch(() => {});

                // Also update home promotion prefs
                if (options?.promotedToHome !== undefined || options?.promotedToRecommended !== undefined || options?.promotedToSharedHome !== undefined) {
                    const prefsParams = new URLSearchParams();
                    if (options.promotedToHome !== undefined) prefsParams.set("promotedToHome", options.promotedToHome ? "1" : "0");
                    if (options.promotedToRecommended !== undefined) prefsParams.set("promotedToRecommended", options.promotedToRecommended ? "1" : "0");
                    if (options.promotedToSharedHome !== undefined) prefsParams.set("promotedToSharedHome", options.promotedToSharedHome ? "1" : "0");
                    prefsParams.set("X-Plex-Token", token);

                    await fetch(`${cleanBase}/library/metadata/${encodeURIComponent(collectionRatingKey)}/prefs?${prefsParams.toString()}`, {
                        method: "PUT",
                        headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                    }).catch(() => {});
                }

                if (res.ok) break;
            } catch (e) {}
        }
    }

    // 4. Upload custom collection poster if provided
    if (collectionRatingKey && options?.posterBuffer) {
        await uploadPlexItemPoster(urlsToTry, token, collectionRatingKey, options.posterBuffer);
    } else if (collectionRatingKey && options?.posterUrl) {
        await uploadPlexItemPosterFromUrl(urlsToTry, token, collectionRatingKey, options.posterUrl);
    }

    logger.addLog("SUCCESS", "PLEX", `Synced collection "${collectionTitle}" (${addedCount}/${itemRatingKeys.length} items added) on section ${sectionKey}`);
    return {
        success: true,
        collectionRatingKey,
        message: `Synced collection "${collectionTitle}" with ${addedCount} items.`
    };
}

/**
 * Updates a Plex collection's sort title and Home / Recommended / Shared Home visibility flags.
 */
export async function updatePlexCollectionPromotionAndOrder(
    serverUrlOrCandidates: string | string[],
    token: string,
    sectionKey: string | number,
    collectionRatingKey: string,
    options: {
        sortTitle?: string;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
    }
    if (collectionRatingKey.startsWith("hub:")) {
        return { success: true, message: "Hub promotion setting recorded." };
    }

    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);
    let lastError: any = null;

    for (const cleanBase of urlsToTry) {
        try {
            const params = new URLSearchParams();
            params.set("type", "18"); // Collection
            params.set("id", collectionRatingKey);

            if (options.sortTitle) {
                params.set("titleSort.value", options.sortTitle);
                params.set("titleSort.locked", "1");
            }
            if (options.promotedToHome !== undefined) {
                params.set("promotedToHome.value", options.promotedToHome ? "1" : "0");
                params.set("promotedToHome.locked", "1");
            }
            if (options.promotedToRecommended !== undefined) {
                params.set("promotedToRecommended.value", options.promotedToRecommended ? "1" : "0");
                params.set("promotedToRecommended.locked", "1");
            }
            if (options.promotedToSharedHome !== undefined) {
                params.set("promotedToSharedHome.value", options.promotedToSharedHome ? "1" : "0");
                params.set("promotedToSharedHome.locked", "1");
            }
            params.set("X-Plex-Token", token);

            const res = await fetch(`${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}`, {
                method: "PUT",
                headers: {
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });

            if (res.ok) return { success: true };
        } catch (e: any) {
            lastError = e;
        }
    }

    return { success: false, message: lastError?.message || "Failed to update collection promotion" };
}

/**
 * Uploads a poster image buffer directly to a Plex item (Movie, Show, or Collection).
 */
export async function uploadPlexItemPoster(
    serverUrlOrCandidates: string | string[],
    token: string,
    ratingKey: string,
    imageBuffer: Buffer,
    mimeType = "image/jpeg"
): Promise<boolean> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);

    for (const cleanBase of urlsToTry) {
        const url = `${cleanBase}/library/metadata/${encodeURIComponent(ratingKey)}/posters?X-Plex-Token=${encodeURIComponent(token)}`;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": mimeType,
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                body: new Uint8Array(imageBuffer)
            });

            if (res.ok) return true;
        } catch (e: any) {
            // Try next candidate
        }
    }

    logger.addLog("WARN", "PLEX", `Failed to upload poster buffer to item ${ratingKey}`);
    return false;
}

/**
 * Uploads a poster image from a URL to a Plex item.
 */
export async function uploadPlexItemPosterFromUrl(
    serverUrlOrCandidates: string | string[],
    token: string,
    ratingKey: string,
    imageUrl: string
): Promise<boolean> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);

    for (const cleanBase of urlsToTry) {
        const url = `${cleanBase}/library/metadata/${encodeURIComponent(ratingKey)}/posters?url=${encodeURIComponent(imageUrl)}&X-Plex-Token=${encodeURIComponent(token)}`;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });

            if (res.ok) return true;
        } catch (e) {
            // Try next candidate
        }
    }

    return false;
}

/**
 * Deletes a collection from Plex.
 */
export async function deletePlexCollection(
    serverUrlOrCandidates: string | string[],
    token: string,
    collectionRatingKey: string
): Promise<boolean> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);

    for (const cleanBase of urlsToTry) {
        const url = `${cleanBase}/library/metadata/${encodeURIComponent(collectionRatingKey)}?X-Plex-Token=${encodeURIComponent(token)}`;
        try {
            const res = await fetch(url, {
                method: "DELETE",
                headers: {
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) return true;
        } catch (e) {
            // Try next candidate
        }
    }
    return false;
}

/**
 * Fetches the active raw image buffer of an item's poster from Plex.
 */
export async function fetchPlexPosterBuffer(
    serverUrl: string,
    token: string,
    thumbPath: string
): Promise<Buffer | null> {
    if (!thumbPath) return null;
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const fullUrl = thumbPath.startsWith("http")
        ? thumbPath
        : `${cleanBase}${thumbPath.startsWith("/") ? "" : "/"}${thumbPath}?X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(fullUrl, {
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });

        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
    } catch (e) {
        return null;
    }
}

/**
 * Prune candidate representation with disk footprint and watch stats.
 */
export interface PruneCandidateItem {
    ratingKey: string;
    title: string;
    year?: number;
    type: "movie" | "show" | "season" | "episode";
    sectionKey: string;
    sectionTitle?: string;
    serverId: string;
    serverName?: string;
    addedAt?: number;
    lastViewedAt?: number;
    viewCount: number;
    fileSizeGb: number;
    filePath?: string;
    imdbId?: string;
    tmdbId?: string;
    reason: string;
    daysOld: number;
}

/**
 * Evaluates oldest and unwatched media items across sections for a server to simulate or execute capacity pruning.
 */
export async function evaluatePruneCandidatesForServer(
    serverUrl: string,
    token: string,
    serverId: string,
    serverName: string,
    options: {
        minAgeDays?: number;
        unwatchedOnly?: boolean;
        targetFreeGb?: number;
        maxCandidates?: number;
    } = {}
): Promise<{
    candidates: PruneCandidateItem[];
    totalRecoverableGb: number;
    evaluatedCount: number;
}> {
    const minAgeDays = options.minAgeDays ?? 90;
    const unwatchedOnly = options.unwatchedOnly ?? true;
    const maxCandidates = options.maxCandidates ?? 50;

    const cleanBase = serverUrl.replace(/\/+$/, "");
    const sectionsUrl = `${cleanBase}/library/sections?X-Plex-Token=${encodeURIComponent(token)}`;
    
    let sections: { key: string; title: string; type: string }[] = [];
    try {
        const secRes = await fetch(sectionsUrl, {
            headers: { "Accept": "application/json", "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" },
            cache: "no-store"
        });
        if (secRes.ok) {
            const secData = await secRes.json();
            const directories = secData.MediaContainer?.Directory || [];
            sections = (Array.isArray(directories) ? directories : [directories])
                .filter((d: any) => d.type === "movie" || d.type === "show")
                .map((d: any) => ({ key: String(d.key), title: d.title, type: d.type }));
        }
    } catch (e) {}

    const allCandidates: PruneCandidateItem[] = [];
    let totalEvaluated = 0;
    const nowMs = Date.now();
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

    for (const sec of sections) {
        const items = await getPlexLibraryMediaItems(serverUrl, token, sec.key, 1000);
        totalEvaluated += items.length;

        for (const item of items) {
            const addedAtMs = item.addedAt || nowMs;
            const ageMs = nowMs - addedAtMs;
            const daysOld = Math.floor(ageMs / (24 * 60 * 60 * 1000));

            // Filter out items younger than minAgeDays
            if (daysOld < minAgeDays) continue;

            const viewCount = item.viewCount || 0;
            const lastViewedAtMs = item.lastViewedAt;

            // Filter out items that have been watched recently if unwatchedOnly is true
            if (unwatchedOnly) {
                if (viewCount > 0 && lastViewedAtMs) {
                    const daysSinceViewed = Math.floor((nowMs - lastViewedAtMs) / (24 * 60 * 60 * 1000));
                    if (daysSinceViewed < 180) continue; // Watched in last 6 months
                }
            }

            const sizeBytes = item.fileSize || 0;
            const sizeGb = parseFloat((sizeBytes / (1024 * 1024 * 1024)).toFixed(2));

            let reason = `Added ${daysOld} days ago (Unwatched)`;
            if (viewCount > 0 && lastViewedAtMs) {
                const daysSinceViewed = Math.floor((nowMs - lastViewedAtMs) / (24 * 60 * 60 * 1000));
                reason = `Last watched ${daysSinceViewed} days ago (${viewCount} total plays)`;
            }

            allCandidates.push({
                ratingKey: item.ratingKey,
                title: item.title,
                year: item.year,
                type: item.type,
                sectionKey: sec.key,
                sectionTitle: sec.title,
                serverId,
                serverName,
                addedAt: item.addedAt,
                lastViewedAt: item.lastViewedAt,
                viewCount,
                fileSizeGb: sizeGb > 0 ? sizeGb : (item.type === "movie" ? 4.5 : 12.0),
                filePath: item.filePath,
                imdbId: item.guids.imdb,
                tmdbId: item.guids.tmdb,
                reason,
                daysOld
            });
        }
    }

    // Sort by oldest addedAt ascending (oldest first)
    allCandidates.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

    const selected = allCandidates.slice(0, maxCandidates);
    const totalRecoverableGb = parseFloat(selected.reduce((acc, c) => acc + c.fileSizeGb, 0).toFixed(2));

    return {
        candidates: selected,
        totalRecoverableGb,
        evaluatedCount: totalEvaluated
    };
}

/**
 * Searches Plex library items across hubs or a specific library section.
 */
export async function searchPlexLibraryItems(
    serverUrl: string,
    token: string,
    query: string,
    sectionKey?: string
): Promise<PlexMediaStreamInfo[]> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const endpointsToTry: string[] = [];

    if (sectionKey) {
        endpointsToTry.push(`${cleanBase}/library/sections/${encodeURIComponent(sectionKey)}/search?query=${encodeURIComponent(query)}&limit=30`);
        endpointsToTry.push(`${cleanBase}/hubs/search?query=${encodeURIComponent(query)}&sectionId=${encodeURIComponent(sectionKey)}&limit=30`);
        endpointsToTry.push(`${cleanBase}/library/sections/${encodeURIComponent(sectionKey)}/all?title=${encodeURIComponent(query)}&X-Plex-Container-Start=0&X-Plex-Container-Size=30`);
        endpointsToTry.push(`${cleanBase}/hubs/search?query=${encodeURIComponent(query)}&limit=50`);
    } else {
        endpointsToTry.push(`${cleanBase}/hubs/search?query=${encodeURIComponent(query)}&limit=50`);
        endpointsToTry.push(`${cleanBase}/search?query=${encodeURIComponent(query)}&limit=50`);
    }

    const seenKeys = new Set<string>();
    const results: PlexMediaStreamInfo[] = [];

    for (const endpoint of endpointsToTry) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(endpoint, {
                headers: {
                    Accept: "application/json",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);

            if (!res.ok) continue;

            const data = await res.json();
            const rawMetadata = data.MediaContainer?.Metadata;
            const items: any[] = [];

            if (rawMetadata) {
                if (Array.isArray(rawMetadata)) items.push(...rawMetadata);
                else items.push(rawMetadata);
            }

            const hubs = data.MediaContainer?.Hub;
            if (Array.isArray(hubs)) {
                for (const hub of hubs) {
                    const hubMeta = hub.Metadata || [];
                    if (Array.isArray(hubMeta)) items.push(...hubMeta);
                    else if (hubMeta) items.push(hubMeta);
                }
            }

            for (const item of items) {
                const rKey = String(item.ratingKey || item.key || "");
                if (!rKey || seenKeys.has(rKey)) continue;

                const itemType = (item.type || "").toLowerCase();
                // Filter out non-media items (e.g. actors, directors, genres) unless they are media
                if (itemType && !["movie", "show", "season", "episode"].includes(itemType)) {
                    continue;
                }

                // If sectionKey filter is present and item has section info, match it
                if (sectionKey) {
                    const itemSecId = String(item.librarySectionID || item.librarySectionKey || "");
                    if (itemSecId && itemSecId !== String(sectionKey) && endpointsToTry.indexOf(endpoint) < 3) {
                        continue;
                    }
                }

                seenKeys.add(rKey);
                results.push(analyzeMediaStreamInfo(item));
            }

            if (results.length > 0) {
                return results;
            }
        } catch (e: any) {
            // Try next search endpoint
        }
    }

    return results;
}

/**
 * Deep inspection of a single Plex media item (full video/audio telemetry, streams, parts, and overlays).
 */
export async function inspectPlexMediaItemFull(
    serverUrl: string,
    token: string,
    ratingKey: string,
    serverId?: string
): Promise<{
    item: PlexMediaStreamInfo;
    rawStreams: {
        video: any[];
        audio: any[];
        subtitles: any[];
    };
    parts: Array<{ id: number; file: string; sizeGb: number; container: string }>;
    hasBackup: boolean;
    isLeavingSoon: boolean;
    leavingSoonDate?: Date | null;
    leavingReason?: string | null;
} | null> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const endpoint = `${cleanBase}/library/metadata/${encodeURIComponent(ratingKey)}?includeStreams=1&includeGuids=1`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(endpoint, {
            headers: {
                Accept: "application/json",
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            signal: controller.signal,
            cache: "no-store"
        });
        clearTimeout(timeoutId);

        if (!res.ok) return null;

        const data = await res.json();
        const rawItem = data.MediaContainer?.Metadata?.[0] || data.MediaContainer?.Metadata;
        if (!rawItem) return null;

        const analyzed = analyzeMediaStreamInfo(rawItem);

        const videoStreams: any[] = [];
        const audioStreams: any[] = [];
        const subtitleStreams: any[] = [];
        const parts: Array<{ id: number; file: string; sizeGb: number; container: string }> = [];

        const mediaList = Array.isArray(rawItem.Media) ? rawItem.Media : rawItem.Media ? [rawItem.Media] : [];
        for (const m of mediaList) {
            const partList = Array.isArray(m.Part) ? m.Part : m.Part ? [m.Part] : [];
            for (const p of partList) {
                const sizeBytes = p.size || 0;
                parts.push({
                    id: p.id,
                    file: p.file || "",
                    sizeGb: parseFloat((sizeBytes / (1024 * 1024 * 1024)).toFixed(2)),
                    container: p.container || m.container || "mkv"
                });

                const streamList = Array.isArray(p.Stream) ? p.Stream : p.Stream ? [p.Stream] : [];
                for (const st of streamList) {
                    if (st.streamType === 1) {
                        videoStreams.push({
                            id: st.id,
                            codec: st.codec,
                            profile: st.profile,
                            width: st.width,
                            height: st.height,
                            bitrate: st.bitrate ? `${Math.round(st.bitrate / 1000)} Mbps` : undefined,
                            frameRate: st.frameRate || (st.displayTitle?.match(/(\d+p|\d+\.\d+fps)/i)?.[0]),
                            bitDepth: st.bitDepth ? `${st.bitDepth}-bit` : undefined,
                            colorSpace: st.colorSpace,
                            colorRange: st.colorRange,
                            colorPrimaries: st.colorPrimaries,
                            dovTitle: st.DOVIBaselinePresent ? "Dolby Vision" : (st.colorPrimaries === "bt2020" ? "HDR10" : "SDR"),
                            displayTitle: st.displayTitle || `${st.width}x${st.height} ${st.codec?.toUpperCase()}`
                        });
                    } else if (st.streamType === 2) {
                        audioStreams.push({
                            id: st.id,
                            codec: st.codec,
                            profile: st.profile,
                            channels: st.channels,
                            channelLayout: st.channelLayout,
                            audioChannelLayout: st.audioChannelLayout,
                            bitrate: st.bitrate ? `${Math.round(st.bitrate / 1000)} kbps` : undefined,
                            language: st.language || "Unknown",
                            languageCode: st.languageCode,
                            title: st.title || st.displayTitle,
                            selected: Boolean(st.selected),
                            default: Boolean(st.default)
                        });
                    } else if (st.streamType === 3) {
                        subtitleStreams.push({
                            id: st.id,
                            codec: st.codec,
                            language: st.language || "Unknown",
                            languageCode: st.languageCode,
                            title: st.title || st.displayTitle,
                            forced: Boolean(st.forced),
                            selected: Boolean(st.selected),
                            default: Boolean(st.default)
                        });
                    }
                }
            }
        }

        // Check if backed up
        let hasBackup = false;
        let isLeavingSoon = false;
        let leavingSoonDate: Date | null = null;
        let leavingReason: string | null = null;

        if (serverId) {
            const backup = await prisma.mediaArtBackup.findUnique({
                where: { serverId_ratingKey: { serverId, ratingKey } }
            });
            hasBackup = Boolean(backup);

            const adv = await prisma.mediaContentAdvisory.findUnique({
                where: { ratingKey_serverId: { ratingKey, serverId } }
            });
            if (adv && adv.isLeavingSoon) {
                isLeavingSoon = true;
                leavingSoonDate = adv.leavingSoonDate;
                leavingReason = adv.leavingReason;
            }
        }

        return {
            item: analyzed,
            rawStreams: {
                video: videoStreams,
                audio: audioStreams,
                subtitles: subtitleStreams
            },
            parts,
            hasBackup,
            isLeavingSoon,
            leavingSoonDate,
            leavingReason
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Deep inspection failed for ratingKey "${ratingKey}": ${e.message}`);
        return null;
    }
}

/**
 * Permanently deletes a media item from Plex Media Server (and disk if Plex media deletion is enabled).
 */
export async function deleteMediaFromPlexServer(
    serverUrl: string,
    token: string,
    ratingKey: string
): Promise<{ success: boolean; message?: string }> {
    try {
        const cleanBase = serverUrl.replace(/\/+$/, "");
        const url = `${cleanBase}/library/metadata/${ratingKey}`;
        const res = await fetch(url, {
            method: "DELETE",
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        if (res.ok) {
            logger.addLog("SUCCESS", "PLEX", `Deleted media ratingKey "${ratingKey}" from Plex.`);
            return { success: true, message: `Deleted item from Plex.` };
        } else {
            const txt = await res.text();
            logger.addLog("WARN", "PLEX", `Failed to delete ratingKey "${ratingKey}" from Plex (${res.status}): ${txt}`);
            return { success: false, message: `Plex returned HTTP ${res.status}` };
        }
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Exception deleting media from Plex: ${e.message}`);
        return { success: false, message: e.message };
    }
}


import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { logger } from "@/lib/logger";
import { getTmdbVideos } from "@/lib/curation/tmdb";

let isYtDlpChecked = false;
let isYtDlpAvailable = false;

/**
 * Checks if the yt-dlp binary is installed and executable on the host system.
 */
export async function checkYtDlpAvailable(): Promise<boolean> {
    if (isYtDlpChecked) return isYtDlpAvailable;
    return new Promise((resolve) => {
        try {
            const proc = spawn("yt-dlp", ["--version"]);
            proc.on("error", () => {
                isYtDlpChecked = true;
                isYtDlpAvailable = false;
                resolve(false);
            });
            proc.on("close", (code) => {
                isYtDlpChecked = true;
                isYtDlpAvailable = code === 0;
                resolve(isYtDlpAvailable);
            });
        } catch {
            isYtDlpChecked = true;
            isYtDlpAvailable = false;
            resolve(false);
        }
    });
}

/**
 * Searches YouTube for an official trailer URL via direct HTTPS query (no external npm dependencies).
 */
export async function searchYouTubeVideoUrl(title: string, year?: number): Promise<string | null> {
    try {
        const query = `${title}${year ? ` ${year}` : ""} official trailer`;
        const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
            },
            signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
            const html = await res.text();
            const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (match && match[1]) {
                return `https://www.youtube.com/watch?v=${match[1]}`;
            }
        }
    } catch {}
    return null;
}

/**
 * Copies the bundled static fallback placeholder video (placeholder.mp4).
 */
export async function copyFallbackPlaceholderVideo(outputPath: string): Promise<boolean> {
    const candidates = [
        path.join(process.cwd(), "public", "assets", "placeholder.mp4"),
        path.join(process.cwd(), "public", "placeholder.mp4"),
        path.join(__dirname, "..", "..", "..", "public", "assets", "placeholder.mp4")
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                const parentDir = path.dirname(outputPath);
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }
                await fsPromises.copyFile(p, outputPath);
                try { fs.chmodSync(outputPath, 0o666); } catch {}
                logger.addLog("INFO", "CURATION", `Generated playable placeholder video at "${path.basename(outputPath)}"`);
                return true;
            } catch (err: any) {
                logger.addLog("WARN", "CURATION", `Failed copying fallback placeholder from "${p}": ${err.message}`);
            }
        }
    }

    return false;
}

/**
 * Downloads a YouTube trailer using yt-dlp binary with 1080p limit and duration filtering (<240s).
 */
export async function downloadWithYtDlp(videoUrl: string, outputPath: string, maxDuration = 240): Promise<boolean> {
    const hasBinary = await checkYtDlpAvailable();
    if (!hasBinary) {
        return false;
    }

    return new Promise((resolve) => {
        const parentDir = path.dirname(outputPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        const args = [
            "--no-playlist",
            "--break-on-reject",
            "--match-filter",
            `duration < ${maxDuration}`,
            "-f",
            "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]/best",
            "--merge-output-format",
            "mp4",
            "-o",
            outputPath,
            videoUrl
        ];

        let ytdlpProcess: any;
        try {
            ytdlpProcess = spawn("yt-dlp", args, { timeout: 90000 });
        } catch {
            return resolve(false);
        }

        let stderr = "";
        let stdout = "";

        ytdlpProcess.stdout?.on("data", (d: any) => {
            stdout += d.toString();
        });

        ytdlpProcess.stderr?.on("data", (d: any) => {
            stderr += d.toString();
        });

        ytdlpProcess.on("error", () => {
            resolve(false);
        });

        ytdlpProcess.on("close", (code: number) => {
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100000) {
                try { fs.chmodSync(outputPath, 0o666); } catch {}
                logger.addLog("SUCCESS", "CURATION", `Downloaded official YouTube trailer for "${path.basename(outputPath)}" (${Math.round(fs.statSync(outputPath).size / 1024 / 1024 * 10) / 10} MB)`);
                resolve(true);
            } else {
                // If rejected by duration filter or unavailable, silently resolve false to trigger fallback
                resolve(false);
            }
        });
    });
}

/**
 * Downloads an official YouTube trailer video for a placeholder item or copies the bundled placeholder.mp4.
 */
export async function downloadOrCopyTrailerVideo(options: {
    title: string;
    year?: number;
    tmdbId?: number | string;
    mediaType?: "movie" | "tv";
    trailerUrl?: string;
    destinationPath: string;
}): Promise<{ success: boolean; isOfficialTrailer: boolean; path: string }> {
    const { title, year, tmdbId, mediaType, trailerUrl, destinationPath } = options;
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    let targetVideoUrl = trailerUrl || "";

    // 1. If tmdbId is provided and no trailerUrl, resolve official trailer from TMDb
    if (!targetVideoUrl && tmdbId) {
        const numId = typeof tmdbId === "string" ? parseInt(tmdbId, 10) : tmdbId;
        if (numId && !isNaN(numId)) {
            try {
                const videos = await getTmdbVideos(numId, mediaType || "movie");
                if (videos.length > 0 && videos[0].url) {
                    targetVideoUrl = videos[0].url;
                }
            } catch {}
        }
    }

    // 2. If still no direct trailer URL, search YouTube
    if (!targetVideoUrl) {
        const searched = await searchYouTubeVideoUrl(title, year);
        if (searched) {
            targetVideoUrl = searched;
        }
    }

    // 3. Try downloading with yt-dlp if available on the system
    if (targetVideoUrl) {
        try {
            const downloaded = await downloadWithYtDlp(targetVideoUrl, destinationPath);
            if (downloaded) {
                return { success: true, isOfficialTrailer: true, path: destinationPath };
            }
        } catch {}
    }

    // 4. Fallback to bundled playable placeholder.mp4 video
    const fallbackOk = await copyFallbackPlaceholderVideo(destinationPath);
    return {
        success: fallbackOk,
        isOfficialTrailer: false,
        path: destinationPath
    };
}

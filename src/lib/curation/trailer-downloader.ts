import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { logger } from "@/lib/logger";

let youtubeSearchModule: any = null;

async function getYoutubeSearch() {
    if (!youtubeSearchModule) {
        try {
            const imported: any = await import("youtube-search-without-api-key");
            youtubeSearchModule = imported.default || imported;
        } catch (e: any) {
            logger.addLog("WARN", "CURATION", `Could not import youtube-search-without-api-key: ${e.message}`);
        }
    }
    return youtubeSearchModule;
}

/**
 * Copies the bundled static fallback placeholder video.
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
                logger.addLog("INFO", "CURATION", `Copied bundled fallback placeholder.mp4 to "${outputPath}"`);
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

        logger.addLog("INFO", "CURATION", `Attempting YouTube trailer download with yt-dlp: ${videoUrl}`);

        let ytdlpProcess: any;
        try {
            ytdlpProcess = spawn("yt-dlp", args, { timeout: 90000 });
        } catch (spawnErr: any) {
            logger.addLog("WARN", "CURATION", `yt-dlp not found or failed to spawn: ${spawnErr.message}`);
            return resolve(false);
        }

        let stderr = "";

        ytdlpProcess.stderr?.on("data", (d: any) => {
            stderr += d.toString();
        });

        ytdlpProcess.on("error", (err: any) => {
            logger.addLog("WARN", "CURATION", `yt-dlp process error: ${err.message}`);
            resolve(false);
        });

        ytdlpProcess.on("close", (code: number) => {
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100000) {
                try { fs.chmodSync(outputPath, 0o666); } catch {}
                logger.addLog("SUCCESS", "CURATION", `Successfully downloaded YouTube trailer to "${outputPath}" (${Math.round(fs.statSync(outputPath).size / 1024 / 1024 * 10) / 10} MB)`);
                resolve(true);
            } else {
                logger.addLog("WARN", "CURATION", `yt-dlp exited with code ${code}. Stderr: ${stderr.slice(-200)}`);
                resolve(false);
            }
        });
    });
}

/**
 * Searches YouTube for an official trailer and downloads it to destinationPath.
 * If download fails or yt-dlp is unavailable, falls back to the bundled placeholder.mp4.
 */
export async function downloadOrCopyTrailerVideo(options: {
    title: string;
    year?: number;
    trailerUrl?: string;
    destinationPath: string;
}): Promise<{ success: boolean; isOfficialTrailer: boolean; path: string }> {
    const { title, year, trailerUrl, destinationPath } = options;
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    let targetVideoUrl = trailerUrl || "";

    // 1. If no direct trailer URL, search YouTube
    if (!targetVideoUrl) {
        try {
            const ytSearch = await getYoutubeSearch();
            if (ytSearch && typeof ytSearch.search === "function") {
                const query = `${title}${year ? ` ${year}` : ""} official trailer`;
                const searchResults = await ytSearch.search(query);
                if (searchResults && searchResults.length > 0) {
                    const first = searchResults[0];
                    const videoId = first.id?.videoId || first.videoId || first.id;
                    if (videoId) {
                        targetVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                        logger.addLog("INFO", "CURATION", `Found YouTube trailer for "${title}": ${first.snippet?.title || videoId} (${targetVideoUrl})`);
                    }
                }
            }
        } catch (searchErr: any) {
            logger.addLog("WARN", "CURATION", `YouTube search error for "${title}": ${searchErr.message}`);
        }
    }

    // 2. Try downloading with yt-dlp
    if (targetVideoUrl) {
        try {
            const downloaded = await downloadWithYtDlp(targetVideoUrl, destinationPath);
            if (downloaded) {
                return { success: true, isOfficialTrailer: true, path: destinationPath };
            }
        } catch (dlErr: any) {
            logger.addLog("WARN", "CURATION", `yt-dlp download failed: ${dlErr.message}`);
        }
    }

    // 3. Fallback to bundled playable placeholder.mp4 video
    const fallbackOk = await copyFallbackPlaceholderVideo(destinationPath);
    return {
        success: fallbackOk,
        isOfficialTrailer: false,
        path: destinationPath
    };
}

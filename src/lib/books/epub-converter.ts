import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import JSZip from "jszip";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

let cachedBinaryPath: string | null = null;

/**
 * Finds the Calibre ebook-convert executable path across OS environments
 */
export function getEbookConvertBinaryPath(): string | null {
    if (cachedBinaryPath && fs.existsSync(cachedBinaryPath)) {
        return cachedBinaryPath;
    }

    const possiblePaths = process.platform === "win32"
        ? [
            "ebook-convert.exe",
            "C:\\Program Files\\Calibre2\\ebook-convert.exe",
            "C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe",
            "C:\\Calibre\\ebook-convert.exe",
            path.join(process.env.LOCALAPPDATA || "", "Programs", "Calibre", "ebook-convert.exe")
        ]
        : [
            "ebook-convert",
            "/usr/bin/ebook-convert",
            "/usr/local/bin/ebook-convert",
            "/opt/calibre/ebook-convert"
        ];

    for (const bin of possiblePaths) {
        try {
            if (bin.includes(path.sep) && fs.existsSync(bin)) {
                cachedBinaryPath = bin;
                return bin;
            }
        } catch (e) {}
    }

    // Default to binary name in PATH
    cachedBinaryPath = process.platform === "win32" ? "ebook-convert.exe" : "ebook-convert";
    return cachedBinaryPath;
}

export interface ConversionResult {
    success: boolean;
    epubPath?: string;
    originalDeleted?: boolean;
    error?: string;
}

/**
 * Converts any non-EPUB ebook (.mobi, .azw3, .azw, .azw4, .pdf, .cbz, .cbr, .fb2, .lit, .txt, .rtf)
 * to standard .epub using Calibre and deletes the non-EPUB original.
 */
export async function convertEbookToEpub(inputFilePath: string): Promise<ConversionResult> {
    if (!fs.existsSync(inputFilePath)) {
        return { success: false, error: `File not found on disk: ${inputFilePath}` };
    }

    const ext = path.extname(inputFilePath).toLowerCase();
    if (ext === ".epub") {
        return { success: true, epubPath: inputFilePath, originalDeleted: false };
    }

    const bin = getEbookConvertBinaryPath();
    if (!bin) {
        return { success: false, error: "Calibre ebook-convert binary is not installed or accessible." };
    }

    const targetEpubPath = inputFilePath.replace(/\.[a-zA-Z0-9]+$/i, ".epub");

    try {
        console.log(`[EPUB-CONVERTER] 🔄 Converting "${path.basename(inputFilePath)}" (${ext}) -> "${path.basename(targetEpubPath)}"...`);
        
        // Execute conversion with 120s timeout and standard reflow options
        const args = [
            inputFilePath,
            targetEpubPath,
            "--language", "en",
            "--dont-split-on-page-breaks",
            "--epub-version", "2" // Amazon Send-to-Kindle has 100% compatibility with clean EPUB 2
        ];

        await execFileAsync(bin, args, { timeout: 120000 });

        if (fs.existsSync(targetEpubPath) && fs.statSync(targetEpubPath).size > 500) {
            console.log(`[EPUB-CONVERTER] ✅ Successfully converted "${path.basename(inputFilePath)}" to EPUB!`);
            logger.addLog("SUCCESS", "KINDLE", `✅ Converted "${path.basename(inputFilePath)}" (${ext}) to EPUB.`);

            // Delete the non-epub original file from disk
            try {
                if (fs.existsSync(inputFilePath) && inputFilePath !== targetEpubPath) {
                    fs.unlinkSync(inputFilePath);
                    console.log(`[EPUB-CONVERTER] 🗑️ Deleted non-EPUB original from disk: ${inputFilePath}`);
                }
            } catch (delErr: any) {
                console.warn(`[EPUB-CONVERTER] Could not delete original file: ${delErr.message}`);
            }

            return { success: true, epubPath: targetEpubPath, originalDeleted: true };
        } else {
            throw new Error("Output EPUB was not created or has invalid size.");
        }
    } catch (err: any) {
        console.error(`[EPUB-CONVERTER] ❌ Conversion failed for "${inputFilePath}":`, err.message);
        logger.addLog("ERROR", "KINDLE", `❌ Failed to convert "${path.basename(inputFilePath)}" to EPUB: ${err.message}`);
        return { success: false, error: err.message || "Ebook conversion failed." };
    }
}

export interface KindleValidationResult {
    valid: boolean;
    repaired: boolean;
    finalPath: string;
    fileSize: number;
    fileSizeMb: string;
    error?: string;
}

/**
 * Deeply validates and sanitizes an EPUB to guarantee Amazon Send-to-Kindle compliance.
 * If the EPUB contains formatting errors or non-standard headers, it automatically repairs it with Calibre.
 */
export async function validateAndFixEpubForKindle(filePath: string): Promise<KindleValidationResult> {
    if (!fs.existsSync(filePath)) {
        return {
            valid: false,
            repaired: false,
            finalPath: filePath,
            fileSize: 0,
            fileSizeMb: "0",
            error: "File not found on disk."
        };
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const fileSizeMb = (stat.size / (1024 * 1024)).toFixed(1);

    // Amazon Send-to-Kindle 50MB email limit
    if (fileSize > 50 * 1024 * 1024) {
        return {
            valid: false,
            repaired: false,
            finalPath: filePath,
            fileSize,
            fileSizeMb,
            error: `File size (${fileSizeMb} MB) exceeds Amazon Send-to-Kindle's 50MB limit.`
        };
    }

    let needsRepair = false;
    let repairReason = "";

    // 1. Basic ZIP header check ('PK\x03\x04')
    try {
        const fd = fs.openSync(filePath, "r");
        const header = Buffer.alloc(4);
        fs.readSync(fd, header, 0, 4, 0);
        fs.closeSync(fd);
        if (header.toString("hex") !== "504b0304") {
            needsRepair = true;
            repairReason = "Invalid ZIP magic header.";
        }
    } catch (e: any) {
        needsRepair = true;
        repairReason = `Cannot read file header: ${e.message}`;
    }

    // 2. Deep EPUB Structure Check with JSZip
    if (!needsRepair) {
        try {
            const data = fs.readFileSync(filePath);
            const zip = await JSZip.loadAsync(data);

            const mimetypeFile = zip.file("mimetype");
            if (!mimetypeFile) {
                needsRepair = true;
                repairReason = "Missing mimetype entry in EPUB archive.";
            } else {
                const mimeContent = (await mimetypeFile.async("string")).trim();
                if (!mimeContent.includes("application/epub+zip")) {
                    needsRepair = true;
                    repairReason = `Invalid mimetype: "${mimeContent}". Expected application/epub+zip.`;
                }
            }

            const containerFile = zip.file("META-INF/container.xml");
            if (!containerFile) {
                needsRepair = true;
                repairReason = "Missing META-INF/container.xml.";
            } else {
                const containerXml = await containerFile.async("string");
                const rootfileMatch = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
                if (!rootfileMatch || !rootfileMatch[1]) {
                    needsRepair = true;
                    repairReason = "Cannot locate root OPF package file in container.xml.";
                } else {
                    const opfPath = rootfileMatch[1];
                    const opfFile = zip.file(opfPath);
                    if (!opfFile) {
                        needsRepair = true;
                        repairReason = `OPF package file "${opfPath}" missing from EPUB archive.`;
                    } else {
                        const opfContent = await opfFile.async("string");
                        if (!opfContent.includes("<package") || !opfContent.includes("<metadata")) {
                            needsRepair = true;
                            repairReason = "OPF package file is corrupted or missing standard XML package tags.";
                        }
                    }
                }
            }
        } catch (zipErr: any) {
            needsRepair = true;
            repairReason = `EPUB ZIP structure parse error: ${zipErr.message}`;
        }
    }

    // If clean and valid, return success
    if (!needsRepair) {
        return {
            valid: true,
            repaired: false,
            finalPath: filePath,
            fileSize,
            fileSizeMb
        };
    }

    // Attempt Auto-Repair using Calibre
    console.log(`[EPUB-VALIDATOR] ⚠️ EPUB "${path.basename(filePath)}" requires Kindle sanitation: ${repairReason}. Attempting Calibre auto-repair...`);
    const bin = getEbookConvertBinaryPath();
    if (!bin) {
        return {
            valid: false,
            repaired: false,
            finalPath: filePath,
            fileSize,
            fileSizeMb,
            error: `EPUB failed Kindle preflight check (${repairReason}) and Calibre ebook-convert is not available to repair it.`
        };
    }

    const tempRepairedPath = filePath + ".repaired.epub";
    try {
        const args = [
            filePath,
            tempRepairedPath,
            "--language", "en",
            "--dont-split-on-page-breaks",
            "--epub-version", "2"
        ];
        await execFileAsync(bin, args, { timeout: 120000 });

        if (fs.existsSync(tempRepairedPath) && fs.statSync(tempRepairedPath).size > 500) {
            // Overwrite original with the repaired EPUB
            fs.copyFileSync(tempRepairedPath, filePath);
            try { fs.unlinkSync(tempRepairedPath); } catch (e) {}

            const newStat = fs.statSync(filePath);
            console.log(`[EPUB-VALIDATOR] ✅ Successfully sanitized and repaired "${path.basename(filePath)}" for Amazon Send-to-Kindle!`);
            logger.addLog("SUCCESS", "KINDLE", `✅ Repaired EPUB "${path.basename(filePath)}" for Amazon Send-to-Kindle.`);

            return {
                valid: true,
                repaired: true,
                finalPath: filePath,
                fileSize: newStat.size,
                fileSizeMb: (newStat.size / (1024 * 1024)).toFixed(1)
            };
        } else {
            throw new Error("Repaired EPUB was not created.");
        }
    } catch (repErr: any) {
        try { if (fs.existsSync(tempRepairedPath)) fs.unlinkSync(tempRepairedPath); } catch (e) {}
        console.error(`[EPUB-VALIDATOR] ❌ Calibre repair failed for "${filePath}":`, repErr.message);
        return {
            valid: false,
            repaired: false,
            finalPath: filePath,
            fileSize,
            fileSizeMb,
            error: `EPUB failed Amazon Kindle validation (${repairReason}) and repair attempt failed: ${repErr.message}`
        };
    }
}

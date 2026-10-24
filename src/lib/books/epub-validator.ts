import fs from "fs";

/**
 * Validates EPUB file size (< 50MB) and ZIP archive magic bytes (PK\x03\x04).
 * Decoupled from actions.ts to prevent circular dependencies and whole-project NFT asset tracing in App Router.
 */
export async function processEpubForKindle(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
        throw new Error("File does not exist.");
    }

    const stats = fs.statSync(filePath);
    if (stats.size > 50 * 1024 * 1024) {
        throw new Error("File size exceeds 50MB Kindle limit.");
    }

    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    if (buffer.toString("hex") !== "504b0304") {
        throw new Error("Invalid file format. File is not a valid ZIP/EPUB archive.");
    }

    return filePath;
}

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    console.log("=== STARTING FULL DATABASE & LIBRARY AUTO-SYNC ===");

    // 1. Detect existing book folder on disk
    const candidatePaths = [
        "/user/Books",
        "/Userbooks",
        "/user/books",
        "/Kidsbooks",
        "/Kyrabooks",
        "/books",
        "/audiobooks",
        "/downloads",
        "/mnt/user/Books",
        "./Userbooks",
        "./books"
    ];

    let foundPath = "";
    for (const p of candidatePaths) {
        if (p && fs.existsSync(p)) {
            foundPath = p;
            console.log(`[DISCOVERY] Located media folder on disk: "${foundPath}"`);
            break;
        }
    }

    if (!foundPath) {
        console.warn("[DISCOVERY] No standard media folder found on disk. Checking current working directory...");
        foundPath = process.cwd();
    }

    // 2. Ensure Public Ebook Library exists with valid path
    let ebookLib = await prisma.library.findFirst({
        where: { mediaType: "ebook" }
    });

    if (!ebookLib) {
        ebookLib = await prisma.library.create({
            data: {
                name: "Public Library",
                description: "Main Ebook library for EPUBs, PDFs, and MOBI files",
                path: foundPath,
                allowedUsers: "*",
                restrictedUsers: "",
                mediaType: "ebook",
                downloadCategory: "books"
            }
        });
        console.log(`[SEED] Created default Ebook Library: "${ebookLib.name}" (ID: ${ebookLib.id})`);
    } else {
        await prisma.library.update({
            where: { id: ebookLib.id },
            data: { path: foundPath, allowedUsers: "*" }
        });
        console.log(`[UPDATE] Updated Ebook Library "${ebookLib.name}" path to: "${foundPath}"`);
    }

    // 3. Ensure Public Audiobook Library exists with valid path
    let audioLib = await prisma.library.findFirst({
        where: { mediaType: "audiobook" }
    });

    if (!audioLib) {
        audioLib = await prisma.library.create({
            data: {
                name: "Public Audiobooks",
                description: "Main Audiobook library for M4B, MP3, and FLAC files",
                path: foundPath,
                allowedUsers: "*",
                restrictedUsers: "",
                mediaType: "audiobook",
                downloadCategory: "audiobooks"
            }
        });
        console.log(`[SEED] Created default Audiobook Library: "${audioLib.name}" (ID: ${audioLib.id})`);
    } else {
        await prisma.library.update({
            where: { id: audioLib.id },
            data: { path: foundPath, allowedUsers: "*" }
        });
        console.log(`[UPDATE] Updated Audiobook Library "${audioLib.name}" path to: "${foundPath}"`);
    }

    // 4. Update all other libraries with empty path
    const allLibs = await prisma.library.findMany();
    for (const lib of allLibs) {
        if (!lib.path || !fs.existsSync(lib.path)) {
            await prisma.library.update({
                where: { id: lib.id },
                data: { path: foundPath }
            });
            console.log(`[UPDATE] Set path for library "${lib.name}" -> "${foundPath}"`);
        }
    }

    console.log("=== DATABASE LIBRARIES FULLY CONFIGURED ===");
}

main().catch(console.error).finally(() => prisma.$disconnect());

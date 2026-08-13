const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== CURRENT BOOKS IN SQLITE ===");
    const books = await prisma.book.findMany({
        include: { library: true }
    });
    console.log(`Total books in DB: ${books.length}`);
    for (const b of books) {
        console.log(`- [${b.id}] "${b.title}" by "${b.author}" (Type: ${b.fileType}, Size: ${b.fileSize}, Library: ${b.library?.name || b.libraryId})`);
    }

    console.log("\n=== CURRENT LIBRARIES IN SQLITE ===");
    const libs = await prisma.library.findMany();
    console.log(`Total libraries in DB: ${libs.length}`);
    for (const l of libs) {
        console.log(`- [${l.id}] "${l.name}" (Type: ${l.mediaType}, Path: "${l.path}")`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());

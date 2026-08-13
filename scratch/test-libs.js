const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== LIBRARIES ===");
    const libs = await prisma.library.findMany();
    console.log(JSON.stringify(libs, null, 2));

    console.log("=== BOOKS ===");
    const books = await prisma.book.findMany();
    console.log(JSON.stringify(books.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        libraryId: b.libraryId,
        filePath: b.filePath,
        mediaType: b.mediaType
    })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
    console.log("Wiping all ebooks so they can be re-scanned from scratch...");
    const result = await prisma.book.deleteMany({
        where: {
            library: {
                mediaType: "ebook" // only touch the ebook library
            }
        }
    });
    console.log(`Deleted ${result.count} corrupted ebooks from the database.`);
}

clean().then(() => prisma.$disconnect()).catch(e => console.error(e));

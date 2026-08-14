const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBooks() {
    const books = await prisma.book.findMany({
        where: { title: { contains: "Project Hail Mary" } },
        include: { library: true }
    });
    console.log(JSON.stringify(books, null, 2));
    process.exit(0);
}
checkBooks();

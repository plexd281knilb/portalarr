const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
    const libs = await prisma.library.findMany();
    console.log('Libraries:', libs);
    const books = await prisma.book.findMany();
    console.log('Total Books:', books.length);
    const ebookBooks = books.filter(b => b.mediaType === 'ebook' || !b.mediaType);
    console.log('Ebooks:', ebookBooks.length);
    for (const b of ebookBooks) {
        if (b.title.includes('Blood Rites')) console.log(b);
    }
}
check().then(() => prisma.$disconnect());

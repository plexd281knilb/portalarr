const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const l = await prisma.library.findFirst({ where: { name: 'General Public Library' } });
    if (!l) return;
    
    // delete first to prevent unique constraint error
    await prisma.book.deleteMany({ where: { title: 'Harry Potter and the Sorcerer\'s Stone, Book 1' }});
    
    const b = await prisma.book.create({
        data: {
            title: 'Harry Potter and the Sorcerer\'s Stone, Book 1',
            author: 'J.K. Rowling',
            filePath: 'C:/Users/Dom/Downloads/test_books/J.K. Rowling/Harry Potter and the Sorcerer\'s Stone, Book 1',
            fileType: 'missing',
            fileSize: 0,
            mediaType: 'ebook',
            libraryId: l.id
        }
    });
    console.log("Restored:", b);
    
    // Ensure the fake folder exists so they see it
    const fs = require('fs');
    const p = require('path');
    const folderPath = 'C:/Users/Dom/Downloads/test_books/J.K. Rowling/Harry Potter and the Sorcerer\'s Stone, Book 1';
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    
    await prisma.$disconnect();
}
run();

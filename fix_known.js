const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSeries() {
    const books = await prisma.book.findMany({
        where: { series: null }
    });

    console.log(Found $(ooks.length) books without a series. Checking...);

    let updated = 0;
    for (const book of books) {
        if (!book.title) continue;
        
        // Let's just fix the two we know for sure first!
        if (book.title.includes("Two Towers") || book.title.includes("Summer Knight")) {
            let series = book.title.includes("Two Towers") ? "The Lord of the Rings" : "The Dresden Files";
            let vol = book.title.includes("Two Towers") ? "2" : "4";
            
            await prisma.book.update({
                where: { id: book.id },
                data: { series: series, volumeNumber: vol }
            });
            console.log(Updated $(ook.title) to series $(series));
            updated++;
        }
    }
    console.log(Finished! Updated $(updated) books.);
}

fixSeries();

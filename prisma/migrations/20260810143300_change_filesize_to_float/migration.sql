-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "coverUrl" TEXT,
    "filePath" TEXT NOT NULL,
    "fileSize" REAL,
    "fileType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
    "libraryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Book_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Book" ("author", "coverUrl", "createdAt", "filePath", "fileSize", "fileType", "id", "libraryId", "mediaType", "title", "updatedAt") SELECT "author", "coverUrl", "createdAt", "filePath", "fileSize", "fileType", "id", "libraryId", "mediaType", "title", "updatedAt" FROM "Book";
DROP TABLE "Book";
ALTER TABLE "new_Book" RENAME TO "Book";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

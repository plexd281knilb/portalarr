-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "coverUrl" TEXT,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
    "libraryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Book_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Book" ("author", "coverUrl", "createdAt", "filePath", "fileSize", "fileType", "id", "libraryId", "title", "updatedAt") SELECT "author", "coverUrl", "createdAt", "filePath", "fileSize", "fileType", "id", "libraryId", "title", "updatedAt" FROM "Book";
DROP TABLE "Book";
ALTER TABLE "new_Book" RENAME TO "Book";
CREATE TABLE "new_BookRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "coverUrl" TEXT,
    "publishYear" TEXT,
    "requestedBy" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'book',
    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BookRequest" ("author", "coverUrl", "createdAt", "id", "publishYear", "requestedBy", "status", "title", "type", "updatedAt") SELECT "author", "coverUrl", "createdAt", "id", "publishYear", "requestedBy", "status", "title", "type", "updatedAt" FROM "BookRequest";
DROP TABLE "BookRequest";
ALTER TABLE "new_BookRequest" RENAME TO "BookRequest";
CREATE TABLE "new_Library" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "allowedUsers" TEXT NOT NULL DEFAULT '',
    "downloadCategory" TEXT NOT NULL DEFAULT 'books',
    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Library" ("allowedUsers", "createdAt", "description", "downloadCategory", "id", "name", "path", "updatedAt") SELECT "allowedUsers", "createdAt", "description", "downloadCategory", "id", "name", "path", "updatedAt" FROM "Library";
DROP TABLE "Library";
ALTER TABLE "new_Library" RENAME TO "Library";
CREATE UNIQUE INDEX "Library_name_key" ON "Library"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

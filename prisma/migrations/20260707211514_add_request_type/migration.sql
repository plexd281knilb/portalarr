-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "requestedBy" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'book',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BookRequest" ("author", "createdAt", "id", "requestedBy", "status", "title", "updatedAt") SELECT "author", "createdAt", "id", "requestedBy", "status", "title", "updatedAt" FROM "BookRequest";
DROP TABLE "BookRequest";
ALTER TABLE "new_BookRequest" RENAME TO "BookRequest";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

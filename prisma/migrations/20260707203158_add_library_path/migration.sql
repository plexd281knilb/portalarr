-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Library" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "allowedUsers" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Library" ("allowedUsers", "createdAt", "description", "id", "name", "updatedAt") SELECT "allowedUsers", "createdAt", "description", "id", "name", "updatedAt" FROM "Library";
DROP TABLE "Library";
ALTER TABLE "new_Library" RENAME TO "Library";
CREATE UNIQUE INDEX "Library_name_key" ON "Library"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

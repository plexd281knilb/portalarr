-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Library" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "allowedUsers" TEXT NOT NULL DEFAULT '',
    "restrictedUsers" TEXT NOT NULL DEFAULT '',
    "downloadCategory" TEXT NOT NULL DEFAULT 'books',
    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Library" ("allowedUsers", "createdAt", "description", "downloadCategory", "id", "mediaType", "name", "path", "updatedAt") SELECT "allowedUsers", "createdAt", "description", "downloadCategory", "id", "mediaType", "name", "path", "updatedAt" FROM "Library";
DROP TABLE "Library";
ALTER TABLE "new_Library" RENAME TO "Library";
CREATE UNIQUE INDEX "Library_name_key" ON "Library"("name");
CREATE TABLE "new_MediaApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "externalUrl" TEXT,
    "apiKey" TEXT,
    "enabledForUsers" BOOLEAN NOT NULL DEFAULT false,
    "allowedQualityProfileIds" TEXT,
    "allowedRootFolderIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_MediaApp" ("apiKey", "createdAt", "externalUrl", "id", "name", "type", "updatedAt", "url") SELECT "apiKey", "createdAt", "externalUrl", "id", "name", "type", "updatedAt", "url" FROM "MediaApp";
DROP TABLE "MediaApp";
ALTER TABLE "new_MediaApp" RENAME TO "MediaApp";
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "mainPlexUrl" TEXT,
    "mainPlexToken" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFrom" TEXT NOT NULL DEFAULT '',
    "refreshInterval" INTEGER NOT NULL DEFAULT 10,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "autoSyncInterval" INTEGER NOT NULL DEFAULT 6,
    "lastAutoSync" DATETIME,
    "betaDashboardText" TEXT,
    "roadmapText" TEXT,
    "alertBannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alertBannerText" TEXT,
    "downloadsPath" TEXT DEFAULT '/downloads',
    "aiProvider" TEXT DEFAULT 'default',
    "aiApiKey" TEXT,
    "aiModel" TEXT DEFAULT 'gemini-2.5-flash',
    "aiAutoResolve" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Settings" ("aiApiKey", "aiAutoResolve", "aiModel", "aiProvider", "alertBannerEnabled", "alertBannerText", "autoSyncInterval", "betaDashboardText", "downloadsPath", "id", "lastAutoSync", "mainPlexToken", "mainPlexUrl", "refreshInterval", "roadmapText", "smtpFrom", "smtpHost", "smtpPass", "smtpPort", "smtpUser", "theme") SELECT "aiApiKey", coalesce("aiAutoResolve", true) AS "aiAutoResolve", "aiModel", "aiProvider", "alertBannerEnabled", "alertBannerText", "autoSyncInterval", "betaDashboardText", "downloadsPath", "id", "lastAutoSync", "mainPlexToken", "mainPlexUrl", "refreshInterval", "roadmapText", "smtpFrom", "smtpHost", "smtpPass", "smtpPort", "smtpUser", "theme" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

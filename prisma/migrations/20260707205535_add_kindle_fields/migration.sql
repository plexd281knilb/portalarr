-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "alertBannerText" TEXT
);
INSERT INTO "new_Settings" ("alertBannerEnabled", "alertBannerText", "autoSyncInterval", "betaDashboardText", "id", "lastAutoSync", "mainPlexToken", "mainPlexUrl", "refreshInterval", "roadmapText", "smtpHost", "smtpPass", "smtpPort", "smtpUser", "theme") SELECT "alertBannerEnabled", "alertBannerText", "autoSyncInterval", "betaDashboardText", "id", "lastAutoSync", "mainPlexToken", "mainPlexUrl", "refreshInterval", "roadmapText", "smtpHost", "smtpPass", "smtpPort", "smtpUser", "theme" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "kindleEmail" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "password", "role", "username") SELECT "createdAt", "email", "id", "password", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

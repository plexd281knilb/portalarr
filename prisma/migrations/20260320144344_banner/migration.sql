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
    "refreshInterval" INTEGER NOT NULL DEFAULT 10,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "autoSyncInterval" INTEGER NOT NULL DEFAULT 6,
    "lastAutoSync" DATETIME,
    "betaDashboardText" TEXT,
    "roadmapText" TEXT,
    "alertBannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alertBannerText" TEXT
);
INSERT INTO "new_Settings" ("autoSyncInterval", "betaDashboardText", "id", "lastAutoSync", "mainPlexToken", "mainPlexUrl", "refreshInterval", "roadmapText", "smtpHost", "smtpPass", "smtpPort", "smtpUser", "theme") SELECT "autoSyncInterval", "betaDashboardText", "id", "lastAutoSync", "mainPlexToken", "mainPlexUrl", "refreshInterval", "roadmapText", "smtpHost", "smtpPass", "smtpPort", "smtpUser", "theme" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "mainPlexUrl" TEXT,
    "mainPlexToken" TEXT,
    "tautulliUrl" TEXT,
    "tautulliApiKey" TEXT,
    "backupPlexUrl" TEXT,
    "backupPlexToken" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "refreshInterval" INTEGER NOT NULL DEFAULT 10,
    "theme" TEXT NOT NULL DEFAULT 'dark'
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plexId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "amountDue" REAL NOT NULL DEFAULT 15.00,
    "lastPaymentDate" DATETIME,
    "nextPaymentDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

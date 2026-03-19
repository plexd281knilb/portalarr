-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "betaDashboardText" TEXT;

-- CreateTable
CREATE TABLE "BetaCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "buttonText" TEXT,
    "buttonUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN "seerrAutoApproveAll" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovieProfileId" INTEGER;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTvProfileId" INTEGER;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovieRootFolder" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTvRootFolder" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovieAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTvAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovie4kAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTv4kAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrQuotaMovies" INTEGER DEFAULT 10;
ALTER TABLE "Settings" ADD COLUMN "seerrQuotaTv" INTEGER DEFAULT 10;
ALTER TABLE "Settings" ADD COLUMN "seerrQuotaDays" INTEGER DEFAULT 7;
ALTER TABLE "Settings" ADD COLUMN "seerrNotificationOnAvailable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "canRequest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "canRequest4k" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "autoApproveMovies" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "autoApproveTv" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "requestLimitMovies" INTEGER DEFAULT 10;
ALTER TABLE "User" ADD COLUMN "requestLimitTv" INTEGER DEFAULT 10;
ALTER TABLE "User" ADD COLUMN "requestLimitDays" INTEGER DEFAULT 7;

-- CreateTable MediaRequest
CREATE TABLE IF NOT EXISTS "MediaRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "tvdbId" INTEGER,
    "imdbId" TEXT,
    "title" TEXT NOT NULL,
    "releaseYear" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "overview" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "status4k" TEXT,
    "is4k" BOOLEAN NOT NULL DEFAULT false,
    "requestedByUserId" TEXT,
    "requestedByUsername" TEXT NOT NULL,
    "seasons" TEXT,
    "servarrAppId" TEXT,
    "qualityProfileId" INTEGER,
    "rootFolderPath" TEXT,
    "servarrId" INTEGER,
    "errorMessage" TEXT,
    "downloadProgress" REAL,
    "availableAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaRequest_tmdbId_mediaType_idx" ON "MediaRequest"("tmdbId", "mediaType");
CREATE INDEX IF NOT EXISTS "MediaRequest_status_idx" ON "MediaRequest"("status");
CREATE INDEX IF NOT EXISTS "MediaRequest_requestedByUsername_idx" ON "MediaRequest"("requestedByUsername");
CREATE INDEX IF NOT EXISTS "MediaRequest_requestedByUserId_idx" ON "MediaRequest"("requestedByUserId");

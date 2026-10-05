-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "curationSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "curationSyncSchedule" TEXT DEFAULT 'every_6_hours';
ALTER TABLE "Settings" ADD COLUMN "curationSyncCron" TEXT;
ALTER TABLE "Settings" ADD COLUMN "curationSyncOverlays" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "curationSyncCollections" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "curationSyncReleases" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "curationSyncPruning" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "curationLastRunAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "curationLastRunStatus" TEXT;

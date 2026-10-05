-- AlterTable
ALTER TABLE "MediaCollection" ADD COLUMN "collectionMode" TEXT DEFAULT 'default';
ALTER TABLE "MediaCollection" ADD COLUMN "activeDays" TEXT DEFAULT 'all';
ALTER TABLE "MediaCollection" ADD COLUMN "activeTimeRange" TEXT DEFAULT 'all_day';

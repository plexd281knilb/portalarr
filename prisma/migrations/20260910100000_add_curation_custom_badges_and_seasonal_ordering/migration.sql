-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN "placeholderTheatricalNoticeDays" INTEGER DEFAULT 60;
ALTER TABLE "Settings" ADD COLUMN "placeholderDigitalCountdownDays" INTEGER DEFAULT 30;
ALTER TABLE "Settings" ADD COLUMN "placeholderNowStreamingGraceDays" INTEGER DEFAULT 7;
ALTER TABLE "Settings" ADD COLUMN "placeholderAutoPruneDays" INTEGER DEFAULT 14;
ALTER TABLE "Settings" ADD COLUMN "placeholderBannerPosition" TEXT DEFAULT 'bottom';
ALTER TABLE "Settings" ADD COLUMN "placeholderBannerTheme" TEXT DEFAULT 'indigo-purple';
ALTER TABLE "Settings" ADD COLUMN "placeholderCustomText" TEXT;
ALTER TABLE "Settings" ADD COLUMN "placeholderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "leavingSoonPromotedToHome" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "leavingSoonPromotedToRecommended" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "leavingSoonPromotedToSharedHome" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "leavingSoonHomeOrder" INTEGER DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "leavingSoonAutoThresholdDays" INTEGER DEFAULT 14;
ALTER TABLE "Settings" ADD COLUMN "leavingSoonAutoHideEmpty" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable MediaCollection
ALTER TABLE "MediaCollection" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaCollection" ADD COLUMN "promotedToHome" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MediaCollection" ADD COLUMN "promotedToRecommended" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MediaCollection" ADD COLUMN "promotedToSharedHome" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MediaCollection" ADD COLUMN "sortPrefix" TEXT DEFAULT '!00_';
ALTER TABLE "MediaCollection" ADD COLUMN "isSeasonal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaCollection" ADD COLUMN "scheduleStartMonth" INTEGER;
ALTER TABLE "MediaCollection" ADD COLUMN "scheduleStartDay" INTEGER;
ALTER TABLE "MediaCollection" ADD COLUMN "scheduleEndMonth" INTEGER;
ALTER TABLE "MediaCollection" ADD COLUMN "scheduleEndDay" INTEGER;
ALTER TABLE "MediaCollection" ADD COLUMN "seasonalAction" TEXT DEFAULT 'promote_hide';

-- AlterTable MediaOverlayRule
ALTER TABLE "MediaOverlayRule" ADD COLUMN "showAudioChannels" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaOverlayRule" ADD COLUMN "showCodec" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaOverlayRule" ADD COLUMN "showEdition" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaOverlayRule" ADD COLUMN "showStudio" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaOverlayRule" ADD COLUMN "showContentRating" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaOverlayRule" ADD COLUMN "customBadgeIds" TEXT;

-- CreateTable CustomBadge
CREATE TABLE IF NOT EXISTS "CustomBadge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'png',
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "position" TEXT NOT NULL DEFAULT 'top-right',
    "width" INTEGER NOT NULL DEFAULT 140,
    "height" INTEGER NOT NULL DEFAULT 46,
    "opacity" REAL NOT NULL DEFAULT 1.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "matchRule" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

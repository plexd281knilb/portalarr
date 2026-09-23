-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN "seerrFullAutoApprove" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "seerrFullUnlimited" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "seerrFullQuotaMovies" INTEGER DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "seerrFullQuotaTv" INTEGER DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "seerrFullQuotaDays" INTEGER DEFAULT 7;
ALTER TABLE "Settings" ADD COLUMN "seerrTrialAutoApprove" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "seerrTrialQuotaMovies" INTEGER DEFAULT 3;
ALTER TABLE "Settings" ADD COLUMN "seerrTrialQuotaTv" INTEGER DEFAULT 3;
ALTER TABLE "Settings" ADD COLUMN "seerrTrialQuotaDays" INTEGER DEFAULT 7;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsAutoApprovePg" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsRequireApprovalPg13" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovieAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsTvAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovie4kAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsTv4kAppId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovieRootFolder" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrKidsTvRootFolder" TEXT;
ALTER TABLE "Settings" ADD COLUMN "seerrAutoDual1080pFor4k" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable MediaRequest
ALTER TABLE "MediaRequest" ADD COLUMN "isKids" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaRequest" ADD COLUMN "contentRating" TEXT;
ALTER TABLE "MediaRequest" ADD COLUMN "isDual1080pChild" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaRequest" ADD COLUMN "parent4kRequestId" TEXT;

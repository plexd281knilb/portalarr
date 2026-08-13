-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "aiProvider" TEXT DEFAULT 'default';
ALTER TABLE "Settings" ADD COLUMN "aiApiKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN "aiModel" TEXT DEFAULT 'gemini-2.5-flash';
ALTER TABLE "Settings" ADD COLUMN "aiAutoResolve" BOOLEAN DEFAULT true;

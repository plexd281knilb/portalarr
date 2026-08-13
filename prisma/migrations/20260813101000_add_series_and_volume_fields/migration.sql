-- AlterTable
ALTER TABLE "Book" ADD COLUMN "series" TEXT;
ALTER TABLE "Book" ADD COLUMN "volumeNumber" TEXT;

-- AlterTable
ALTER TABLE "BookRequest" ADD COLUMN "series" TEXT;
ALTER TABLE "BookRequest" ADD COLUMN "volumeNumber" TEXT;

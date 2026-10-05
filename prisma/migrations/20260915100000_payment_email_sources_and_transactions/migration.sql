-- AlterTable Settings
ALTER TABLE "Settings" ADD COLUMN "paymentEmailAutoScan" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "paymentEmailScanInterval" INTEGER DEFAULT 15;
ALTER TABLE "Settings" ADD COLUMN "paymentLastScanAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "paymentLastScanResult" TEXT;

-- CreateTable PaymentEmailSource
CREATE TABLE IF NOT EXISTS "PaymentEmailSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 993,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "user" TEXT NOT NULL,
    "pass" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScannedAt" DATETIME,
    "lastStatus" TEXT,
    "lastUid" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable PaymentTransaction
CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT,
    "provider" TEXT NOT NULL,
    "externalTxId" TEXT,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "senderHandle" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "emailSubject" TEXT,
    "emailDate" DATETIME NOT NULL,
    "emailUid" TEXT,
    "matchedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "appliedSubscription" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionPeriodGranted" TEXT,
    "adminNotes" TEXT,
    "rawPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PaymentEmailSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_matchedUserId_fkey" FOREIGN KEY ("matchedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_provider_externalTxId_key" ON "PaymentTransaction"("provider", "externalTxId");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_matchedUserId_idx" ON "PaymentTransaction"("matchedUserId");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_emailDate_idx" ON "PaymentTransaction"("emailDate");

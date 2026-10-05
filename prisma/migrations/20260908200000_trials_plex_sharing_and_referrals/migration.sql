-- CreateTable
CREATE TABLE IF NOT EXISTS  KindleDeliveryLog (
    id TEXT NOT NULL PRIMARY KEY,
    bookId TEXT,
    bookTitle TEXT NOT NULL,
    bookAuthor TEXT,
    recipientEmail TEXT NOT NULL,
    userEmail TEXT,
    username TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DELIVERED',
    errorMessage TEXT,
    fileSize REAL,
    fileType TEXT,
    diagnostics TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS FailedRelease (
    id TEXT NOT NULL PRIMARY KEY,
    releaseTitle TEXT NOT NULL,
    downloadUrl TEXT,
    guid TEXT,
    protocol TEXT NOT NULL DEFAULT 'torrent',
    reason TEXT,
    bookRequestId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS FeatureSuggestion (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    createdBy TEXT NOT NULL DEFAULT 'Admin',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS FeatureVote (
    id TEXT NOT NULL PRIMARY KEY,
    suggestionId TEXT NOT NULL,
    username TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FeatureVote_suggestionId_fkey FOREIGN KEY (suggestionId) REFERENCES FeatureSuggestion (id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE new_BookRequest (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    series TEXT,
    volumeNumber TEXT,
    coverUrl TEXT,
    publishYear TEXT,
    requestedBy TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'book',
    mediaType TEXT NOT NULL DEFAULT 'ebook',
    status TEXT NOT NULL DEFAULT 'Pending',
    monitorSeries BOOLEAN NOT NULL DEFAULT false,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
);
INSERT INTO new_BookRequest (author, coverUrl, createdAt, id, mediaType, publishYear, requestedBy, series, status, title, type, updatedAt, volumeNumber) SELECT author, coverUrl, createdAt, id, mediaType, publishYear, requestedBy, series, status, title, type, updatedAt, volumeNumber FROM BookRequest;
DROP TABLE BookRequest;
ALTER TABLE new_BookRequest RENAME TO BookRequest;
CREATE TABLE new_Settings (
    id TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    mainPlexUrl TEXT,
    mainPlexToken TEXT,
    smtpHost TEXT,
    smtpPort INTEGER,
    smtpUser TEXT,
    smtpPass TEXT,
    smtpFrom TEXT NOT NULL DEFAULT '',
    refreshInterval INTEGER NOT NULL DEFAULT 10,
    theme TEXT NOT NULL DEFAULT 'dark',
    autoSyncInterval INTEGER NOT NULL DEFAULT 6,
    lastAutoSync DATETIME,
    betaDashboardText TEXT,
    roadmapText TEXT,
    alertBannerEnabled BOOLEAN NOT NULL DEFAULT false,
    alertBannerText TEXT,
    downloadsPath TEXT DEFAULT '/downloads',
    aiProvider TEXT DEFAULT 'default',
    aiApiKey TEXT,
    aiModel TEXT DEFAULT 'gemini-2.5-flash',
    aiAutoResolve BOOLEAN NOT NULL DEFAULT true,
    googleBooksApiKey TEXT,
    defaultTrialDays INTEGER NOT NULL DEFAULT 14,
    defaultPlexLibraries TEXT,
    paymentPaypal TEXT,
    paymentVenmo TEXT,
    paymentInstructions TEXT,
    subscriptionPrice TEXT,
    requireReferralForSignup BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO new_Settings (aiApiKey, aiAutoResolve, aiModel, aiProvider, alertBannerEnabled, alertBannerText, autoSyncInterval, betaDashboardText, downloadsPath, googleBooksApiKey, id, lastAutoSync, mainPlexToken, mainPlexUrl, refreshInterval, roadmapText, smtpFrom, smtpHost, smtpPass, smtpPort, smtpUser, theme) SELECT aiApiKey, aiAutoResolve, aiModel, aiProvider, alertBannerEnabled, alertBannerText, autoSyncInterval, betaDashboardText, downloadsPath, googleBooksApiKey, id, lastAutoSync, mainPlexToken, mainPlexUrl, refreshInterval, roadmapText, smtpFrom, smtpHost, smtpPass, smtpPort, smtpUser, theme FROM Settings;
DROP TABLE Settings;
ALTER TABLE new_Settings RENAME TO Settings;
CREATE TABLE new_User (
    id TEXT NOT NULL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    kindleEmail TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'USER',
    status TEXT NOT NULL DEFAULT 'APPROVED',
    trialEndsAt DATETIME,
    subscriptionEndsAt DATETIME,
    plexUsername TEXT,
    plexEmail TEXT,
    plexLibrarySectionIds TEXT,
    referralCode TEXT,
    referredByUserId TEXT,
    convertedAt DATETIME,
    lastLogin DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT User_referredByUserId_fkey FOREIGN KEY (referredByUserId) REFERENCES User (id) ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO new_User (createdAt, email, id, kindleEmail, lastLogin, password, role, status, username) SELECT createdAt, email, id, kindleEmail, lastLogin, password, role, status, username FROM User;
DROP TABLE User;
ALTER TABLE new_User RENAME TO User;
CREATE UNIQUE INDEX User_username_key ON User(username);
CREATE UNIQUE INDEX User_email_key ON User(email);
CREATE UNIQUE INDEX User_referralCode_key ON User(referralCode);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS FeatureVote_suggestionId_username_key ON FeatureVote(suggestionId, username);

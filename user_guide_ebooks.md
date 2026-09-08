# 📖 Portalarr Ebooks & Audiobooks User Guide

Welcome to the comprehensive user guide for **Portalarr's Ebooks and Audiobooks** ecosystem! This document explains all features available in the library, in-browser readers, Send-to-Kindle delivery, audio chapter management, media requests, series tracking, and indexer integration.

---

## 📑 Table of Contents
1. [Getting Started & Navigation](#1-getting-started--navigation)
2. [Ebook & Comic In-Browser Reading](#2-ebook--comic-in-browser-reading)
3. [Send-to-Kindle Wireless Delivery & Failure Diagnostics](#3-send-to-kindle-wireless-delivery--failure-diagnostics)
4. [Audiobooks & Floating Audio Player](#4-audiobooks--floating-audio-player)
5. [Chapter Management & Track Reordering](#5-chapter-management--track-reordering)
6. [Requesting Media (Title & Author Discovery)](#6-requesting-media-title--author-discovery)
7. [Series Tracking & Auto-Monitoring](#7-series-tracking--auto-monitoring)
8. [Release Selection, Blocklisting & Download Ingestion](#8-release-selection-blocklisting--download-ingestion)
9. [AI Metadata Agent & Cover Artwork Engine](#9-ai-metadata-agent--cover-artwork-engine)
10. [Frequently Asked Questions (FAQ)](#10-frequently-asked-questions-faq)

---

## 🚀 1. Getting Started & Navigation

Portalarr offers dedicated library views for your reading and listening collection:
- **📖 Ebooks Tab:** Browse EPUB, PDF, MOBI, and comic files across public and user-restricted library shelves.
- **🎧 Audiobooks Tab:** Browse single-file and multi-track audiobooks with duration stats, cover art, and track listings.
- **📨 Requests Tab:** Monitor active book grabs with real-time download progress, pipeline health pulse, search indexers, retry failed requests, or import downloads.
- **⚙️ Kindle Settings Tab:** Configure Send-to-Kindle email addresses, run pre-flight diagnostics, check Amazon approved sender whitelists, and view outbound delivery transaction logs.
- **❓ Help & Guide Tab:** This in-app guide, keeping you up-to-date with the latest features.

---

## 📱 2. Ebook & Comic In-Browser Reading

Portalarr includes high-performance in-browser readers for all major book and comic formats—no third-party apps required.

### 📖 Kindle-Style EPUB Reader
Click **`Read`** or **`Resume (X%)`** on any EPUB book card to launch the reader:
- **Instant 0ms Reopening:** Uses browser CacheStorage (`portalarr-books-v1`) to cache downloaded books for instant offline reopening without waiting on network transfers.
- **Fast Reading Percentage & Progress Bar:** Real-time accurate percentage calculations shown directly on library cards and in the reader.
- **Estimated Reading Time:**
  - *"X mins left in chapter"*
  - *"Y hrs Z mins left in book"* (calibrated to a standard 220 WPM reading rate).
- **Tappable Kindle Status Footer:** Tap the bottom footer bar to cycle between:
  `Time Left in Book` ↔ `Time Left in Chapter` ↔ `Page in Book` ↔ `Location` ↔ `Percentage`
- **Kindle `Aa` Typography Customization:**
  - **Typefaces:** Bookerly (Kindle Serif), Ember (Kindle Sans-Serif), and System Monospace.
  - **Font Size:** Stepped adjustment from 70% to 200%.
  - **Margins:** Narrow, Normal, or Wide page gutters.
  - **Line Height:** Compact, Normal, or Relaxed line spacing.
  - **Themes:** Dark (Night Mode), Sepia (Warm Paper), or Light (Daylight).
- **Distraction-Free Reading:** Tap the center of the page to auto-hide toolbars. A discrete corner badge continues to show your active reading metric.
- **Reading Progress Persistence:** Automatically bookmarks your position and displays a **`Resume (X%)`** amber badge on library cards.

### 🦸 Comic Book Reader (`.cbr`, `.cbz`, & Folder Archives)
- **Zero-Conversion Streaming:** Streams compressed archive pages on-the-fly via WebAssembly `unrar` and `JSZip`.
- **Display Modes:** Toggle between Fit-to-Width, Fit-to-Height, and Original resolution.
- **Navigation:** Use keyboard arrow keys, spacebar, on-screen arrows, or the bottom thumbnail scrubber to quickly jump between pages.
- **Page Position Memory:** Automatically resumes at the exact page you last viewed.

### 📄 PDF Document Viewer
- Embedded inline PDF rendering with zoom controls, page jumping, and direct download capabilities.

---

## 📧 3. Send-to-Kindle Wireless Delivery & Failure Diagnostics

Send books wirelessly to your Kindle e-reader in seconds with end-to-end delivery tracking and automated diagnostics:

### Step 1: Find your Kindle Email
- On Amazon, go to *Account & Lists* > *Content & Devices* > *Preferences* > *Personal Document Settings*.
- Copy your Kindle email address (ends in `@kindle.com`).

### Step 2: Authorize Portalarr's Sender Email
- Under *Approved Personal Document E-mail List*, click *Add a new approved e-mail address*.
- Add your server's SMTP sender address (displayed in the Portalarr Kindle Setup tab).

### Step 3: 1-Click Dispatch
- Click the **`📧 Send to Kindle`** icon on any book card.
- Portalarr automatically verifies the file integrity (<50MB, valid EPUB ZIP magic bytes, sanitized ASCII filename) and delivers it directly to your Amazon account.

### 🩺 Kindle Pre-Flight Diagnostics Check
- Navigate to the **Kindle Settings** tab and click **`Run Pre-Flight Delivery Check`**.
- Portalarr runs live checks across your SMTP configuration, sender address authorization, Kindle email syntax, and ebook storage limits.

### 📋 Outbound Delivery History & Error Tracker
- All outbound deliveries are logged in the **Kindle Delivery History** panel with timestamps, recipient emails, file formats, and file sizes.
- **Status Indicators:**
  - 🟢 **`DELIVERED`**: The file was accepted by the SMTP mail relay and dispatched to Amazon.
  - 🔴 **`DELIVERY FAILED`**: Displays the exact failure cause (e.g. unwhitelisted sender, file size over 50MB, or network timeout) along with actionable troubleshooting tips.
- **1-Click Retry (`RotateCcw`):** Click **`Retry Delivery`** on any failed log entry to re-attempt sending once the issue has been resolved.

---

## 🎧 4. Audiobooks & Floating Audio Player

Portalarr delivers an Audible-quality audiobook experience right in your web browser:

- **Floating Web Player:** Pinned audio controls at the bottom of your screen let you listen uninterrupted while browsing other libraries and tabs.
- **Continuous Autoplay:** Seamlessly transitions to the next chapter track when the current chapter finishes.
- **HTTP Range Streaming:** Fast scrubbing and instant seeking without waiting for the full audio file to download.
- **Playback Speed & Volume Memory:** Remembers your volume, playback speed (1.0x, 1.25x, 1.5x, 2.0x), and current track position across sessions.
- **Multi-Disc & Multi-Track Auto-Consolidation:** Folder structures with chapter tracks (`01 Intro.mp3`, `02 Chapter 1.mp3`) or multi-disc subdirectories (`Disc 01/`, `Disc 02/`) are automatically merged into a single audiobook card displaying total duration and consolidated size.

---

## 🎼 5. Chapter Management & Track Reordering

Need to correct chapter numbers or track ordering?

1. Click **`Listen & Chapters`** on any audiobook card to open the Chapter Selector Modal.
2. Click **`✏️ Reorder & Edit Chapters`**.
3. Use the **`⬆️ Up`** / **`⬇️ Down`** buttons or type custom chapter numbers to rearrange tracks.
4. Click **`Save Order`**. Portalarr physically renames and synchronizes track files on disk so the new order is permanent for all users across the server.

---

## 🔍 6. Requesting Media (Title & Author Discovery)

Can't find a book in your library? Request and auto-grab it in seconds:

### Pipeline Health Pulse & Status Bar
- The **Requests** tab features a real-time **Pipeline Pulse** bar showing the connection status of **Prowlarr**, **Usenet (SABnzbd)**, and **Torrent (qBittorrent)**.

### Combined Title & Author Search (Narrow Down Results)
- You can enter both the **Book Title and Author Name** in the title input (e.g. `Project Hail Mary Andy Weir` or `The Way of Kings Brandon Sanderson`).
- Portalarr queries Audible keywords, iTunes, Open Library, and Google Books with smart token relevance scoring, immediately ranking the exact book by that author at the top of the suggestions list.
- Clicking the result automatically populates and separates the Title and Author fields cleanly and verifies the selection.

### Requesting by Title Only
1. Go to the **Requests** tab (or click *Request* in the header).
2. Select your desired format: **`📖 Ebook`** or **`🎧 Audiobook`**.
3. Type the book title into the title field.
4. An autocomplete dropdown will query Audible, iTunes, OpenLibrary, and Google Books.
5. Click any matching result to auto-fill title, author, year, and cover art, and then click **`Submit Request`**!

### Requesting by Author
1. Type the author's name into the **Author** field (e.g. *Brandon Sanderson*, *Andy Weir*, *J.K. Rowling*).
2. Portalarr searches connected book registries for all top titles and audiobooks by that author.
3. Browse the list of available releases with cover art, release year, and format badges.
4. Click any book from the list to populate and verify the form, and then click **`Submit Request`**!

### 🔒 Verified Registry Selection (Required for Single Requests)
To guarantee accurate book metadata, official HD cover artwork, and correct indexer searching, single book/audiobook requests require selecting a verified result from the auto-populated suggestions dropdown.

### 📥 Direct File Upload & Drag-and-Drop Fulfill
- Have a local copy of the book or a custom `.torrent` / `.nzb`?
- Click the **`Upload` (`FileUp`)** button on any request card to upload `.epub`, `.pdf`, `.m4b`, `.mp3`, `.torrent`, or `.nzb`.
- Book files are immediately ingested into the library, and torrents/NZBs are sent directly to your download client!

### 🔔 Request Completion Email Notifications
- Once an item finishes downloading and is imported to your library, Portalarr automatically sends a rich HTML email notification with deep links:
  - 📖 **Read in Browser** (for Ebooks)
  - 🎧 **Listen in Player** (for Audiobooks)
  - 🚀 **Send to Kindle** (for Ebooks)

---

## 📚 7. Series Tracking & Auto-Monitoring

Portalarr tracks book series and helps you complete your collections:

- **Group by Series:** Check the *Group by Series* toggle on any library shelf to organize books sequentially by series name and volume number.
- **📡 Auto-Monitor Series:** Click the **`Monitor Series` (`Zap`)** button on any series request card. Portalarr's background scheduler will automatically check book registries for new installments and queue downloads as soon as they become available.
- **🔍 Show Missing Books:** Click *Show Missing Books* on any series card to automatically scan iTunes, OpenLibrary, and Google Books for unacquired installments.
- **⚡ 1-Click Auto-Grab:** Click **`Auto-Grab`** on individual missing installments (or **`Grab All Missing`**) to automatically search indexers and download them.
- **Missing Book Stubs:** Missing books appear on your shelf as grayscale cards with a `MISSING` badge and `.portalarr-missing` immunity markers. When the real file is downloaded, the stub is automatically replaced.

---

## ⚙️ 8. Release Selection, Blocklisting & Download Ingestion

Portalarr connects directly to Prowlarr, Torznab indexers, SABnzbd, NZBGet, and qBittorrent:

### Interactive Release Chooser
- If an automatic grab picks the wrong release or you want to pick a specific group, click **`🔍 Search Release`** on any request card.
- Filter and review all available indexer releases with file size, protocol (Torrent vs Usenet), seeders, age, and format tags.
- Click **`Grab` (`📥`)** to dispatch that exact release to your download client.

### 🚫 Permanent Release Blocklisting
- Corrupted, password-protected, foreign-language, or mismatched releases are automatically recorded to the blocklist database (`FailedRelease`).
- Subsequent auto-searches will skip these releases automatically, and they will be marked with a **`🚫 Blocklisted Release`** badge in the Interactive Release Chooser.

### 📥 1-Click Download Import (`Import Download`)
- If a download completes in SABnzbd/qBittorrent but wasn't automatically organized, click **`📥 Import Download`**.
- Portalarr scans completed download folders, matches the media, moves it into your library, and updates the database record to `Downloaded`.

---

## 🤖 9. AI Metadata Agent & Cover Artwork Engine

- **3-Tier Cover Artwork Engine:** Automatically queries iTunes HD (600x600/600x900), OpenLibrary, and Google Books. Click the **`🖼️ Fetch Cover`** button on any card to refresh missing or low-res covers.
- **AI Metadata Agent:** Powered by Gemini, Claude, OpenAI, Ollama, Groq, or DeepSeek. Click **`🤖 Run AI Metadata Agent`** on any card to extract official title, author, series name, volume numbers, and high-resolution artwork from noisy file names.

---

## ❓ 10. Frequently Asked Questions (FAQ)

**Q: Can I read EPUB files offline?**  
A: Yes. Once an EPUB is opened in Portalarr's reader, it is stored in your browser's persistent cache. You can resume reading even if you temporarily lose server connection.

**Q: Why did my Kindle email delivery fail?**  
A: Go to the **Kindle Settings** tab and inspect the **Kindle Delivery History** log. Common reasons:
1. Your server's sending email is not on your Amazon Approved Personal Document E-mail List.
2. The file size exceeds Amazon's 50MB limit.
3. The recipient email was not an `@kindle.com` address.
After correcting the issue, click **`Retry Delivery`** to resend immediately.

**Q: Can I upload a file directly to fulfill a request?**  
A: Yes. Click **`Upload`** on the request card and choose any `.epub`, `.pdf`, `.m4b`, `.mp3`, `.torrent`, or `.nzb` file.

**Q: How do I fix an incorrect book title or author on disk?**  
A: Admins can click the **`✏️ Edit`** button on any book card. Updating the Title or Author physically reorganizes the disk folder structure (`Library / Author / Title`) safely without leaving orphaned folders behind.

**Q: How do I scan for newly added files in my shared folders?**  
A: Click **`Scan Share Folder`** (for Ebooks) or **`Scan Audio Folder`** (for Audiobooks) at the top of any library shelf to trigger an instant background scan.

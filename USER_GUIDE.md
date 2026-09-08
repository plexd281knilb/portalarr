# 📖 User Guide: Portalarr Media Portal, Plex Hub & Libraries

Welcome to Portalarr! This guide will walk you through monitoring your Plex streams, diagnosing playback issues, testing network speeds, setting up automatic Kindle delivery, requesting new Ebooks & Audiobooks, listening or reading media, and managing your server stack.

---

## 📑 Table of Contents
1. [Getting Started & Logging In](#1-getting-started--logging-in)
2. [My Plex Hub, Stream Diagnostics & Speed Tests](#2-my-plex-hub-stream-diagnostics--speed-tests)
3. [Plex Device Setup & Optimization Guides](#3-plex-device-setup--optimization-guides)
4. [Optional Send-to-Kindle Setup (For E-Readers)](#4-optional-send-to-kindle-setup-for-e-readers)
5. [Browsing & Accessing Media (Ebooks & Audiobooks)](#5-browsing--accessing-media-ebooks--audiobooks)
6. [Requesting New Books & Audiobooks](#6-requesting-new-books--audiobooks)
7. [Troubleshooting, Release Selection & 1-Click Import](#7-troubleshooting-release-selection--1-click-import)
8. [Need Help or Technical Support?](#8-need-help-or-technical-support)

---

## 🚀 1. Getting Started & Logging In

1. Open your browser and navigate to the Portalarr server address (e.g. `https://home.yourdomain.com`).
2. Log in using your Username/Email & Password or click **Sign in with Plex**.
3. If you are a new user, click **Request Account Access** on the login screen. An administrator will review and approve your account.
4. Once logged in, your session remains securely active for 30 days with sliding automatic renewal.

---

## 🎬 2. My Plex Hub, Stream Diagnostics & Speed Tests

Your personalized **My Plex Hub** dashboard gives you real-time insight into your active streams, server connections, watch statistics, and playback health.

### 🔴 Real-Time Active Stream Monitoring
- **Live Playback Cards:** View everything currently streaming on your account across TVs, tablets, web browsers, and phones.
- **Playback Telemetry:** See video resolution (4K, 1080p, 720p), video/audio codecs, playback progress, direct stream bitrate, and server bandwidth consumption.
- **Direct Play vs. Transcode Indicators:**
  - 🟢 **Direct Play / Direct Stream:** The media is streaming at original pristine quality without taxing server CPU/GPU.
  - 🟡 **Transcoding (Video/Audio/Subtitles):** The server is converting the file on-the-fly to match your player's capabilities or bandwidth limit.

### 🩺 Transcode Doctor
If a stream is transcoding, click **Transcode Doctor** on the playback card:
- **Instant Root-Cause Analysis:** Identifies why transcoding is occurring (e.g. incompatible audio codec like TrueHD/DTS, burning PGS/VOBSUB subtitles, player maximum bitrate limit, or remote quality cap).
- **Device-Specific Fixes:** Provides tailored instructions to adjust your Plex client settings to achieve Direct Play.

### ⏹️ Terminating Stuck Playback Sessions (`Stop Stream`)
If a TV app crashed, lost Wi-Fi, or left a "ghost session" running in the background holding server bandwidth:
1. Click the **Stop Stream** (`⏹️`) button on the active playback card.
2. Confirm the prompt to safely terminate the stuck session.
3. *Security Note:* Users are strictly authorized to terminate only their own playback sessions; administrators can manage all active server streams. You can restart playback on your device anytime!

### 🌐 Connected Plex Servers Modal
Click the **Connected Servers** badge in the hub header to view:
- All healthy Plex Media Server instances linked to your ecosystem.
- Server names, active versions, local/public IP addresses, and secure HTTPS connection statuses.

### ⚡ In-Browser Server Speed Test
Diagnose buffering or stuttering directly from your current viewing device:
1. Click the **Speed Test** (`⚡`) button in My Plex Hub.
2. Click **Start Test** to measure real-time download bandwidth and latency directly between your browser/device and the Plex media server.
3. Use the measured speed to select the ideal streaming quality preset on your player.

---

## 📱 3. Plex Device Setup & Optimization Guides

To eliminate buffering and enjoy maximum 4K HDR / 1080p video quality, configure your Plex client apps using our built-in interactive guides:

1. Click **Setup Guides** (`📖`) in the My Plex Hub header.
2. Select your streaming platform:
   - 🍏 **Apple TV:** Enable Direct Play, set Home & Remote Streaming to *Maximum/Original*, and enable Match Dynamic Range & Frame Rate.
   - 📺 **Roku:** Set Video Quality to *Original*, configure Audio to *Passthrough*, and enable Burn Subtitles *Automatic/Only Image Formats*.
   - 🔥 **Amazon Fire TV / Fire Stick:** Enable hardware acceleration, set Remote Streaming to *Maximum*, and set Subtitle Burn to *Automatic*.
   - 🤖 **Android TV / Google TV / Nvidia Shield:** Enable Refresh Rate Switching, set Remote Quality to *Original*, and enable Audio Passthrough (HDMI).
   - 📱 **Smart TVs (LG webOS / Samsung Tizen):** Disable *Auto Quality Adjust*, set Local and Remote Quality to *Original*, and avoid PGS subtitles if unsupported.
   - 💻 **Web Browsers & Mobile (iOS / Android):** Use the official Plex Desktop app or native mobile apps for direct codec support.

---

## 📱 4. Optional Send-to-Kindle Setup (For E-Readers)

When you first visit the Library, you will be prompted to set up Send-to-Kindle for 1-click Wireless Ebook Delivery.

### Step 1: Find your Kindle Email
1. Log into your Amazon account and go to **Account & Lists > Content & Devices**.
2. Click the **Preferences** tab at the top.
3. Scroll down and click **Personal Document Settings**.
4. Look under **Send-to-Kindle E-mail Settings** to find your e-reader's email address (usually ends in `@kindle.com`).

### Step 2: Authorize Portalarr's Sender Email
Amazon requires all senders to be approved before emails can reach your Kindle:
1. Under *Personal Document Settings*, scroll to **Approved Personal Document E-mail List**.
2. Click **Add a new approved e-mail address**.
3. Add the server sender address provided in your Portalarr Kindle Setup prompt (or ask your server admin).

### Step 3: Save or Skip
- Enter your Kindle email in Portalarr and click **Save Email & Unlock Automatic Delivery**.
- *Don't have a Kindle or want to download files manually?* Click **Skip for Now & Browse Library**. You can update this anytime by clicking the **Kindle Settings** button in the header.

---

## 📚 5. Browsing & Accessing Media (Ebooks & Audiobooks)

Portalarr organizes your reading and listening collection into dedicated tabs:

### 📖 Ebooks Tab
- **Browse & Search:** Filter by library shelves, search by title or author, and sort by date or title.
- **Series Grouping:** Toggle *Group by Series* to view books neatly organized by their book series with volume numbers.
- **🔍 Show Missing Books:** Click **Show Missing Books** on any series group to discover unacquired books in that series.
- **⚡ 1-Click Auto-Grab:** In the Missing Books view, click **Auto-Grab** on any missing installment (or grab the entire series) to immediately auto-request and download it.
- **🌫️ Missing Book Cards:** Missing books display on your shelf with a grayscale poster, "MISSING" badge, and 0 MB indicator. You can click **Re-Grab Release** directly from the book card modal to search indexers anytime.
- **1-Click Kindle Send (`📧`):** Click the Kindle button on any book card to wirelessly dispatch the EPUB/MOBI file directly to your e-reader.
- **Direct Download (`⬇️`):** Click the Download button to download EPUB or PDF files directly to your phone, tablet, or computer.
- **Kindle-Style In-Browser Reader:** Read EPUBs with instant 0ms CacheStorage reopening, Bookerly typography, dark/sepia themes, and reading time estimation.
- **Comic Reader:** Stream `.cbr`, `.cbz`, and archive pages with WebAssembly unrar and JSZip.

### 🎧 Audiobooks Tab
- **Listen Online:** Click Play (`▶️`) on any audiobook to start streaming immediately in the built-in web audio player.
- **Interactive Chapter Selector:** Click **Listen & Chapters** on any audiobook card to open the Chapter Selector Modal, jump to any specific chapter, or view file details.
- **Reorder & Edit Chapters:** Click **✏️ Reorder & Edit Chapters** in the Chapter Selector Modal to change chapter numbers or click ⬆️ / ⬇️ buttons. Click **Save** to rename track files on disk so your custom order is permanent for all users!
- **Multi-Track & Multi-Disc Support:** All chapter tracks and multi-disc folders (`Disc 01`, `Disc 02`) are seamlessly consolidated into a single master audiobook card with consolidated duration and total size.
- **Continuous Autoplay:** The built-in player automatically proceeds to the next chapter track seamlessly when the current chapter finishes.
- **Floating Player:** The web audio player stays pinned at the bottom of your screen as you browse.

---

## 🔍 6. Requesting New Books & Audiobooks

Can't find a title in the library? Request to download it in seconds!

### Step 1: Open the Request Modal
Click the `+ Request Ebook / Audiobook` button on the Library page.

### Step 2: Search & Auto-Complete
1. Start typing the **Title** or **Author**. Instant autocomplete suggestions from the central book registry will appear.
2. Select the matching book to auto-fill title, author, publish year, and official high-definition cover artwork.

### Step 3: Choose Format
- Format: Select **📖 Ebook** or **🎧 Audiobook**.

### Step 4: Submit & Track Progress
Click **Submit Request**. You can track live progress under the **Requests** tab:
- ⏳ **Pending / Approved:** Request is auto-approved and queued for background processing.
- 🔍 **Searching:** Multi-tier search engine is querying connected indexers for the best quality release.
- 📥 **Downloading:** Download active in SABnzbd or qBittorrent.
- ✅ **Downloaded:** Download complete! The book is automatically organized onto your library shelf and ready for reading/listening. (The system continuously validates that the physical media file exists on disk).
- ❌ **Failed / Failed (Missing):** If a grab fails or the file is removed, the request displays in red with actionable retry buttons.

---

## 🛠️ 7. Troubleshooting, Release Selection & 1-Click Import

- 🔄 **User Scan Folder:** All approved users can click **Scan Share Folder** or **Scan Audio Folder** directly on library shelves to instantly scan folders for new files without needing admin intervention.
- 🖼️ **Fetch Cover (`🖼️`):** Click the Fetch Cover button on any library card to query iTunes HD (600x600/600x900), OpenLibrary, and Google Books to refresh low-resolution or missing covers.

### 🔍 Manual Release Search (`Search Release` / `Re-Search`)
1. Go to the **Requests** tab.
2. On your request card, click **`🔍 Search Release`** (or `Re-Search`).
3. Portalarr will query connected torrent and Usenet/NZB indexers and open an **Interactive Release Chooser Modal**.
4. Browse available releases showing title, size, format, protocol (Torrent vs Usenet), seeders, and age.
5. Click **Push Release** (`📥`) on your preferred release to send that exact file to the download client.

### 📥 1-Click Download Import (`Import Download`)
- If SABnzbd or qBittorrent finished downloading a file but it hasn't appeared on your shelf yet, click **`📥 Import Download`** on your request card. Portalarr will scan all completed download directories, copy the files to your shelf, auto-consolidate multi-track audiobooks, and mark the status as `Downloaded`.

### 🔄 Retrying Failed Downloads (`Auto-Retry`)
- If a request shows `Failed` or `Failed (Missing)`, click **Auto-Retry** to trigger an immediate automated background search using all fallback queries.

---

## ❓ 8. Need Help or Technical Support?

If a download fails, a stream won't play, or you need server assistance:
1. Click the **Support** (`💬`) icon in the main navigation bar.
2. Submit a ticket detailing the issue.
3. You will receive email updates as the administrator investigates and resolves your request.

*Happy Streaming, Reading & Listening!* 🎬📖🎧


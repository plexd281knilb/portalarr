# 📖 User Guide: Portalarr Media Library & Requests

Welcome to **Portalarr**! This guide will walk you through accessing our library, setting up automatic Kindle delivery, requesting new Ebooks & Audiobooks, listening or downloading media, and manually selecting releases or importing downloads if needed.

---

## 🚀 1. Getting Started & Logging In

1. Open your browser and navigate to the Portalarr server address (e.g. `https://home.domshomelab.com`).
2. Log in using your **Username/Email & Password** or click **Sign in with Plex**.
3. If you are a new user, click **Request Account Access** on the login screen. An administrator will review and approve your account.

---

## 📱 2. Optional Send-to-Kindle Setup (For E-Readers)

When you first visit the Library, you will be prompted to set up **Send-to-Kindle** for 1-click Wireless Ebook Delivery.

### Step 1: Find your Kindle Email
1. Log into your Amazon account and go to **Account & Lists** > **Content & Devices**.
2. Click the **Preferences** tab at the top.
3. Scroll down and click **Personal Document Settings**.
4. Look under **Send-to-Kindle E-mail Settings** to find your e-reader's email address (usually ends in `@kindle.com` or `@kindle.mobi`).

### Step 2: Authorize Portalarr's Sender Email
Amazon requires all senders to be approved before emails can reach your Kindle:
1. Under **Personal Document Settings**, scroll to **Approved Personal Document E-mail List**.
2. Click **Add a new approved e-mail address**.
3. Add the server sender address provided in your Portalarr Kindle Setup prompt (or ask your server admin).

### Step 3: Save or Skip
* Enter your Kindle email in Portalarr and click **Save Email & Unlock Automatic Delivery**.
* *Don't have a Kindle or want to download files manually?* Click **Skip for Now & Browse Library**. You can update this anytime by clicking the **Kindle Settings** button in the header.

---

## 📚 3. Browsing & Accessing Media

Portalarr organizes your media into dedicated tabs:

### 📖 Ebooks Tab
* **Browse & Search**: Filter by library shelves, search by title or author, and sort by date or title.
* **Series Grouping**: Toggle **Group by Series** to view books neatly organized by their book series.
* **1-Click Kindle Send (`📧`)**: Click the Kindle button on any book card to wirelessly dispatch the EPUB/MOBI file directly to your e-reader.
* **Direct Download (`⬇️`)**: Click the Download button to download EPUB or PDF files directly to your phone, tablet, or computer.

### 🎧 Audiobooks Tab
* **Listen Online**: Click **Play (`▶️`)** on any audiobook to start streaming immediately in the built-in web audio player.
* **Multi-Track & Multi-Disc Support**: All chapter tracks and multi-disc folders (`Disc 01`, `Disc 02`) are consolidated into a single audiobook card.
* **Floating Player**: The web audio player stays pinned at the bottom of your screen as you browse.

---

## 🔍 4. Requesting New Books & Audiobooks

Can't find a title in the library? Request to download it in seconds!

### Step 1: Open the Request Modal
Click the **`+ Request Ebook / Audiobook`** button on the Library page.

### Step 2: Search & Auto-Complete
1. Start typing the **Title** or **Author**. Instant autocomplete suggestions from the central book registry will appear.
2. Select the matching book to auto-fill title, author, publish year, and cover artwork.

### Step 3: Choose Format & Type
* **Format**: Select **📖 Ebook** or **🎧 Audiobook**.
* **Request Type**: Select **Single Book** or **Entire Series**.

### Step 4: Submit & Track Progress
Click **Submit Request**. You can track its live progress under the **Requests** tab:
* ⏳ **Pending**: Request queued for processing.
* 🔍 **Searching**: System is searching indexers for the best quality release.
* 📥 **Downloading**: Download active in SABnzbd or qBittorrent.
* ✅ **Downloaded**: Download complete! The book is automatically added to the library shelf for instant reading or streaming.

---

## 🛠️ 5. Troubleshooting, Release Selection & 1-Click Import

* **📖 Ebooks**: View available PDF, EPUB, MOBI, and AZW3 e-books across all accessible public and private libraries.
* **🎧 Audiobooks**: Browse audiobooks with embedded chapter metadata, HD cover art, total file sizes, and floating HTML5 audio playback. Click **`Scan Audio Folder`** anytime to refresh and discover newly added audiobooks on disk!
* **🔄 User Scan Folder**: All approved users can click **`Scan Share Folder`** or **`Scan Audio Folder`** directly on library shelves to instantly scan folders for new files without needing admin intervention.
* **📥 Request Media**: Click the **Requests** tab to search for missing books or audiobooks. If an entry is incomplete, click **`🔍 Re-Grab Release`** / **`🔍 Search Release`** to open the interactive Prowlarr release chooser modal. Toggle between **`📖 Ebook`** and **`🎧 Audiobook`** modes in the modal header to pick specific releases!

### 🔍 Manual Release Search (`Search Release` / `Re-Search`)
1. Go to the **Requests** tab.
2. On your request card, click **`🔍 Search Release`** (or **`Re-Search`**).
3. Portalarr will query connected torrent and Usenet/NZB indexers and open an **Interactive Release Chooser Modal**.
4. Browse available releases showing title, size, format, protocol (Torrent vs Usenet), seeders, and age.
5. Click **`Push Release` (`📥`)** on your preferred release to send that exact file to the download client.

### 📥 1-Click Download Import (`Import Download`)
* If SABnzbd or qBittorrent finished downloading a file but it hasn't appeared yet, click **`📥 Import Download`** on your request card. Portalarr will scan all completed download directories, copy the files to your shelf, auto-consolidate multi-track audiobooks, and mark the status as **`Downloaded`**.

### 🔄 Retrying Failed Downloads
* If a request shows **Failed**, click **`Retry Search`** to trigger an automated background re-search.

---

## ❓ 6. Need Help or Technical Support?

If a download fails or you need assistance:
1. Click the **Support (`💬`)** icon in the main navigation bar.
2. Submit a ticket detailing the issue.
3. You will receive updates as the administrator resolves your request.

---

*Happy Reading & Listening!* 📖🎧

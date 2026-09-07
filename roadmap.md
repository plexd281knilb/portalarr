# 🗺️ Portalarr Roadmap & Feature Announcements

Welcome to the **Portalarr Roadmap & Release Center**! Here you will find the latest feature releases, active beta initiatives, and upcoming developments across the Portalarr media ecosystem.

---

## ✨ Recently Released & New Features

### 📚 Complete Unified Ebook & Audiobook Ecosystem
- **Dual Media Type Architecture:** Full separation and dedicated tabbed browsing for **`📖 Ebooks`** and **`🎧 Audiobooks`** with automatic format routing and indexer categorization.
- **In-Browser Kindle Paperwhite Reader:** Zero-latency offline caching (`0ms` reopening via browser CacheStorage), accurate reading percentages, estimated reading time (*"X mins left in chapter"*, *"Y hrs Z mins in book"* at 220 WPM), tappable status footer, and custom typography controls (Bookerly, Ember, Monospace, line height, margins, dark/sepia/light themes).
- **In-Browser Comic Viewer:** Stream `.cbr`, `.cbz`, and image archive formats directly inside your browser with WebAssembly UnRAR and JSZip.
- **Floating HTML5 Audiobook Player:** Continuous playback, custom speed controls (0.75x–2.0x), 15s forward/backward skips, sleep timer, and persistent listening progress.
- **Interactive Chapter & Track Reordering:** Modal chapter browser allowing users and admins to view track durations, reorder chapters, and persist corrected numbering to disk.
- **Smart Multi-Track Audiobook Consolidation:** Consolidates multi-file chapter audiobooks (`01 Chapter 1.mp3`, `02 Chapter 2.mp3`) into unified master book cards with cumulative duration and metadata.

### 📨 Smart Media Requests & 1-Click Discovery
- **Enforced Title & Author Autocomplete:** Streamlined search bar querying Audible, iTunes, OpenLibrary, and Google Books with instant cover artwork preview and mandatory selection to ensure pristine metadata.
- **Multi-Tier Torznab Fallback Engine (`executeProwlarrSearch`):** 4-tier fallback query strategy (Literal Title $\to$ Cleaned Punctuation $\to$ UK / Alternate Title $\to$ Category-less search) to eliminate zero-result indexer queries.
- **Strict Fuzzy Download Matching & Ingestion:** 75% threshold fuzzy matcher preventing multi-volume series releases from cross-matching in shared `/downloads` folders.
- **Automatic Request Health Monitoring & Self-Healing:** Reactive 5-second polling on `/library` alongside a 5-minute background safety job that monitors, retries, or revalidates stuck downloads.
- **Release Blocklisting & Foreign Language Filter:** Automated detection of foreign language releases (German, French, Spanish, Italian, Swedish, etc.) with automatic cancellation, deletion, and indexer blocklisting.

### 📧 Send-to-Kindle Wireless Delivery & Failure Diagnostics
- **Comprehensive SMTP Pre-Flight Diagnostics:** Health test modal inspecting SMTP connectivity, port configurations, and sender authorization before initiating deliveries.
- **Delivery Log Audit Trail:** Detailed tracking of every outbound book dispatch (`KindleDeliveryLog`) with 1-click retry actions and error analysis.
- **Amazon Approved Senders Guide:** Step-by-step in-app documentation helping users add server sender addresses to their Amazon Manage Your Content & Devices whitelist.

### 🎨 Modern Glassmorphic UI/UX & Micro-Interactions
- **Glowing Hover Rings & Active States:** Glowing visual accents across all navigation tabs, library shelves, Radarr/Sonarr views, and action buttons.
- **Mobile-First Responsive Navigation:** Adaptive mobile drawer and persistent bottom bar with fluid spring transitions.
- **In-App Ebooks & Audiobooks User Guide:** Comprehensive user manual located directly under the `Help & Guide` tab in `/library`.

---

## 🚀 Active Roadmap & Upcoming Milestones

### 📍 Milestone 1: Multi-User Audio Playback Sync (In Progress)
- [ ] Cross-device playback position synchronization for audiobooks via SQLite user session state.
- [ ] Dedicated *"Continue Listening"* shelf on the main dashboard.
- [ ] User-specific bookmarking and personal chapter notes.

### 📍 Milestone 2: Enhanced Metadata & Series Management (Planned)
- [ ] Multi-author series linking and crossover universe tracking.
- [ ] Bulk batch volume renaming and series cover assignment tool.
- [ ] Goodreads & Hardcover.app reading list import integration.

### 📍 Milestone 3: Download Client & Indexer Analytics (Planned)
- [ ] Per-indexer success rate telemetry and speed benchmarking.
- [ ] Automated download client queue priority management.
- [ ] Disk space forecasting and proactive storage threshold warnings.

### 📍 Milestone 4: Notification Integrations (Planned)
- [ ] Discord Webhook notifications for completed book downloads and requests.
- [ ] Telegram & Pushover real-time alert dispatchers.
- [ ] Customizable user notification preferences in `/settings/profile`.

---

## 🧪 Active Beta Programs & Experiments

- **AI Metadata Agent:** Multi-provider LLM resolution (Gemini, Claude, OpenAI, DeepSeek, Groq, Ollama) for smart series volume numbering and author identification.
- **Direct Download Importer:** Instant 1-click completed folder ingestion bypassing standard indexer delays.
- **Server Health Pulse:** Real-time multi-instance monitoring for Tautulli and Glances.

---

## 💡 Feedback & Feature Requests

Have an idea for a new feature or improvement?
- Submit a support ticket under the **Support** section or visit `/admin/tickets`.
- Check out the **Beta Testing Hub** at [`/beta`](/beta) to test upcoming services and features.

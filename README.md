# Portalarr

Portalarr is a modern, self-hosted dashboard for managing your media server ecosystem. It provides a unified "mission control" interface to monitor system status, track active downloads, and manage service links, book reading, audiobooks, and support requests.

![Portalarr Dashboard](public/next.svg)

## 🚀 Features

- **Unified Dashboard:** Aggregate status from Plex, Tautulli, Glances, and your "Arr" stack.
- **AI Metadata Agent & Smart Series Detection:** Multi-provider LLM support (Gemini, Claude, OpenAI, Groq, Ollama, DeepSeek, OpenRouter) for intelligent book metadata extraction, series identification, and automatic volume number assignment (`assignVolumeNumbersWithAI`).
- **"Missing Books" Series Discovery & Missing Stubs:** Discovers unacquired installments in series ("Show Missing Books") using iTunes, OpenLibrary, and Google Books with 1-click Auto-Grab and Radarr/Sonarr-style missing stubs.
- **Multi-Tier Torznab Search Fallback Engine:** 4+ tier fallback queries (Literal → Cleaned Punctuation → UK/Alternate Title → Category-less → Format/Audiobook suffix) to maximize indexer match rates.
- **Deduplicated Active Downloads:** Real-time progress and queue tracking for SABnzbd, NZBGet, and qBittorrent.
- **Audiobook & Ebook Library:** Dedicated tabs for Ebooks and Audiobooks, strict `mediaType` database isolation, auto-syncing format badges (`MP3` vs `EPUB`), built-in HTML5 audio player with interactive Chapter Selector Modal, user chapter reordering & disk track renaming (`reorderAudiobookChapters`), HTTP Range streaming (`/api/books/[id]/stream`), continuous autoplay next chapter, multi-track/multi-disc folder consolidation (`Disc 01/`, `Disc 02/`), Send-to-Kindle integration, and Prowlarr category routing.
- **3-Tier Cover Artwork Engine:** Automated 600x600 HD cover resolution (iTunes → Open Library → Google Books) with instant 1-click artwork fetch buttons (`🖼️`).
- **Interactive Release Selection & 1-Click Ingestion:** Interactive release chooser modal for indexers, manual release selection, retry search, and **`📥 Import Download`** action button for instant manual download folder ingestion.
- **Live Auto-Refreshing Requests & Auto-Approval:** All book requests are automatically approved and instantly trigger downloads. Real-time 5-second polling updates request statuses (`Pending` / `Approved` → `Searching` → `Downloading` → `Downloaded`) and automatically syncs completed downloads to your library shelf with reverse auto-sync validation. A background job also periodically retries any requests that stall.
- **Responsive Radarr & Sonarr Views:** Mobile-optimized, flexible wrap layouts for Movie and TV libraries featuring prominent release date labeling ("Air Date") and seamless dropdowns.
- **Robust Settings & Diagnostic Tools:**
  - **Live App Connection Testing & Management:** Test connectivity, inline edit setups, and auto-prefill default ports for Tautulli, Glances, SABnzbd, qBittorrent, Readarr, Prowlarr, Overseerr, Bazarr, etc., directly from settings.
  - **Access Control Overhaul:** Admin/User role toggles, Send-to-Kindle email manager, admin password reset modal (`🔑`), live user search, and 1-click bulk approvals (`CheckCheck`).
  - **Folder Path Validator & API Keys:** Inspect permissions and item counts for completed download directories, with dedicated Google Books and AI Metadata Agent configuration.
- **Plex Friends Auto-Sync:** Automatically scans your Plex friends list and provisions approved accounts with role synchronization.
- **30-Day Persistent Login:** Persistent JWT session cookies with sliding auto-renewal keep active users signed in seamlessly.
- **Air-Tight Edge Security:** Every page and API endpoint is secured at the edge behind authentication with role and user status (`PENDING`/`APPROVED`/`REJECTED`) enforcement.
- **Support & Password Recovery:** Direct support ticket submission with SMTP notifications, format-specific request email badges (`🎧 AUDIOBOOK` vs `📖 EBOOK`), plus built-in temporary password email recovery.
- **Secure Encryption:** Sensitive API keys and service tokens are encrypted at rest using AES-256-GCM.
- **Automated CI/CD & Docker:** GitHub Actions pipeline automatically builds and publishes `ghcr.io/plexd281knilb/portalarr:latest` with concurrency rate-limiting safeguards.

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js 20+
- Docker (optional, for production)

### 2. Local Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env # Ensure DATABASE_URL and JWT_SECRET are set

# Setup database
npx prisma migrate dev

# Run development server
npm run dev
```

### 3. Production (Docker)
Portalarr is designed to run seamlessly in Docker. See [GEMINI.md](./GEMINI.md) for detailed Unraid and Docker configuration notes.

```bash
docker-compose up --build
```

### 4. Updating via Docker
To update to the latest release while keeping your SQLite database and settings intact:
```bash
docker-compose pull
docker-compose up -d
```

## 🔒 Security
Portalarr takes security seriously:
- **Global Proxy:** All page and `/api/*` traffic is intercepted and validated at the edge.
- **JWT Sessions:** Authentication uses signed, HttpOnly JWT cookies with automatic status desync resolution.
- **Admin Lockdown:** Sensitive settings (`/settings`, `/admin/*`) are restricted to accounts with the `ADMIN` role. Non-admin users visiting `/settings` are safely redirected to `/settings/profile`.

## 🤝 Contributing
For developers looking to contribute, please refer to [GEMINI.md](./GEMINI.md) for architecture details, development conventions, and project structure.

## 📄 License
This project is private and for personal/internal use.

# Portalarr (`DomsHomeLab`)

Portalarr is a centralized, self-hosted mission control portal designed to manage a modern media server ecosystem. Built with Next.js 16 (App Router), React 19, and Prisma 6 (SQLite), it unifies Plex Media Servers, Tautulli, Glances, Docker containers, the Servarr stack (Radarr, Sonarr, Prowlarr), digital book/audiobook shelves, and member onboarding into a single high-performance platform.

![Portalarr Dashboard](public/next.svg)

## 🚀 Core Subsystems & Features

- **🧪 Dynamic Branch, Version & Build Telemetry Engine (`BuildBadge` & `src/lib/version.ts`):**
  - Real-time environment differentiation between **Beta (`main` branch / `Domshomelab_Dev`)** and **Production (`stable` branch / `DomsHomeLab`)**.
  - Displays live channel badges, semantic version (`v1.0.0-beta.1`), Git commit short SHA, and GitHub Actions workflow build run numbers across Desktop/Mobile sidebars and the Home Dashboard header.
  - Interactive glassmorphic **Build Diagnostics Modal** with 1-click full SHA copy, build timestamp, Docker image target (`ghcr.io/plexd281knilb/portalarr:main` vs `:stable`), and direct GitHub Actions workflow run links.

- **⚡ Direct Plex SQLite Snapshot & Delta-Sync Engine (Zero-PMS-Lock Architecture):**
  - High-speed, lock-free SQLite WAL snapshot subsystem (`src/lib/curation/plex-snapshot-engine.ts`) utilizing native Node `node:sqlite` (`DatabaseSync`) and `ATTACH DATABASE`.
  - Executes multi-server library audits, video/audio codec extraction, and sharing label/genre comparisons across Plex clusters (`MainPlex`, `KidsPlexServer`, `MainPlexServerBackup`) in `<20ms` with **zero Plex HTTP calls**.
  - **Delta-Syncing**: Restricts network mutations (`PUT`/`DELETE`) strictly to items with genuine state deltas, eliminating PMS database locks and 500 error loops during curation sweeps.

- **🤖 AI Server Assistant & Admin Homelab Command Center (`AiServerAssistant`):**
  - Prominent 24/7 diagnostic and homelab command cockpit available on the main dashboard and via a global floating launcher.
  - Native **Structured Tool Calling** (Google Gemini & OpenAI + 100% offline deterministic heuristic fallback) spanning **11 autonomous tools**:
    - `probe_playback_health`: 4-tier synthetic playback and 64KB physical disk byte-range streaming probes.
    - `inspect_media_container`: Multi-library audio/subtitle stream inspection and self-healing metadata refresh.
    - `search_and_replace_media`: Automated Radarr/Sonarr replacement grabs with **Custom Format score verification** (`alreadyOptimal` protection).
    - `recommend_books_and_media`: Personalized reading and media recommendations based on user watch/request history and taste profiles.
    - `get_homelab_hardware_telemetry`, `get_docker_fleet_status`, `restart_docker_container`, and `get_account_sharing_alerts` (strictly restricted to Administrators).

- **📡 Stream Intelligence Hub & Multi-IP Password Sharing Detection (`/admin/tautulli` & `/admin/streams`):**
  - **Native Watch History Engine (`stream-tracker.ts`)**: Built-in SQLite watch history tracking with a **Telemetry Takeover Toggle** (`nativeStreamMonitoringEnabled`) that queries Plex directly and halts external Tautulli polling overhead.
  - **Multi-IP Household & Password Sharing Detection**: Distinguishes local LAN/private subnets from simultaneous streams across $\ge 2$ distinct public WAN IP addresses, flagging violations with pulse alerts and security audit logs.
  - **Complete Historical Tautulli Backfill Runner**: Paginated 500-session batch importer with 2-hour window deduplication and real-time progress bars.
  - **Proactive Stream Quality Doctor**: Client-side main screen alert banner (`stream-quality-doctor-banner.tsx`) and device diagnostic engine detecting Roku 720p auto-adjust caps, 2–4 Mbps remote streaming caps, and browser HEVC transcoding with 30-second fix checklists.

- **🐳 System & Docker Fleet Monitoring Cockpit (`/admin/monitoring`):**
  - **Systems & Services Health**: Real-time reachability, round-trip latency sparklines, and 24h/7d/30d rolling uptime percentages across Plex, Glances, Tautulli, Servarr, and Downloaders.
  - **Docker Container Fleet Manager**: Multi-engine connectivity (Unix socket `/var/run/docker.sock`, Windows pipe, Docker CLI, Glances API, and TCP 2375) with live CPU/RAM meters, multi-core hot load flame indicators, sorting pills (`A-Z`, `🔥 CPU`, `💾 RAM`), and 1-click **Start / Stop / Restart** container controls.
  - **Outages & Incident Alerts**: Chronological incident logs and automated Discord rich embed outage/recovery notifications.

- **💻 Homelab Shell Automation & User Scripts Subsystem (`/admin/scripts`):**
  - Unraid-style script management cockpit with pre-seeded maintenance scripts (Plex cluster health watchdog, SQLite database vacuum/optimize, Portalarr DB backup, unresponsive container auto-restart).
  - Live streaming terminal modal (`ScriptTerminalModal`) via HTTP `ReadableStream` stdout/stderr piping and instant abort lifecycle controls.

- **🎬 Native Seerr Media Discovery & Request Engine (`/discover` & `/requests`):**
  - **Dual-Tier Persistent Media Cache (`media-cache.ts`)**: Pairs in-memory RAM Tier 1 with disk JSON Tier 2 (`data/cache/tmdb/`) and background 30-minute Stale-While-Revalidate (SWR) pre-warming for `<5ms` page loads.
  - **Radarr & Sonarr Multi-Instance Routing**: Quality-aware 1080p and 4K UHD dispatch, granular TV season/episode monitoring guides, and **Sticky Bulk Actions** (Mass Approve, Mass Reject, and Two-Way Cascade Anti-Resurrection Mass Delete).

- **🎨 4-Studio Curation Suite (`/curation`):**
  - **Kometa Poster Overlays Studio**: 4K HDR badges, Dolby Vision/Atmos ribbons, IMDb Top 150/250 vector corner banners, and live canvas previews.
  - **Agregarr Smart Collections & Hubs**: Dynamic collections synced from Trakt, TMDb, MDBList, and IMDb with per-endpoint `machineIdentifier` isolation, inline quick position reordering, and Coming Soon placeholder trailers.
  - **Maintainerr Storage Pruner**: Rule-based and Glances disk-capacity-triggered pruning, 3-tier Leaving Soon watch activity recheck engine (`<1ms` local SQLite lookup), and bulk staged media management.
  - **Plex Parental Guide & Tagging Studio**: Automated IMDb parental severity advisories (Sex/Nudity, Violence/Gore, Profanity, Substances) and Kid-Safe / Living Room sharing label synchronization.

- **📚 Unified Ebook & Audiobook Library (`/library`):**
  - **In-Browser Kindle Paperwhite Reader & Comic Viewer**: 0ms CacheStorage reopening, Bookerly/Ember typography controls, reading time estimation, and WASM `.cbr`/`.cbz` comic streaming.
  - **Floating HTML5 Audiobook Player**: Multi-disc/multi-track consolidation, chapter selector modal, disk track reordering, and HTTP Range streaming.
  - **Wireless Send-to-Kindle & Bounce Scanner**: 1-click EPUB delivery (`DIRECT_DOWNLOAD` bypass supported) with automated IMAP sender inbox scanning (`scanKindleBouncesInternal`) to detect Amazon delivery rejections.
  - **Maturity Rating & Kids Mode Isolation (`inferBookRating`)**: Deterministic age rating classification (`Kids`, `YA (12+)`, `General`, `18+ Mature`) with strict child account whitelisting and Kyra/Public library auto-approval.

- **💬 Discord Bot & Server Mission Control (`/settings?tab=discord`):**
  - Native Discord REST API v10 bot engine provisioning a 6-category / 16-channel server blueprint, automated role synchronization (`Administrator`, `Tier 2 VIP`, `Tier 1 Regular`, `Trial Pass`), pinned interactive guide embeds, and live `#system-status` telemetry.

- **💳 Wizarr Rebuilt, Subscriptions & Governance (`/join` & `/settings/access`):**
  - Invite-gated `/join` onboarding with risk-free trial passes, prorated rest-of-year annual billing ($180/yr = $15/mo base) vs standalone monthly ($17.50/mo), payment threshold & installment credit tracking (`payment-threshold-engine.ts`), multi-stage renewal reminders, **View Site As User** admin impersonation, and **Bidirectional Action Approval Gates** (`AdminApproval` queue for Plex share changes and outgoing SMTP emails).

---

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js 20+ (Node 22.5+ / 24 recommended for native `node:sqlite` snapshot acceleration)
- Docker (for production container deployment)

### 2. Local Development & Verification
```bash
# Sync repository
git pull origin main

# Install dependencies
npm install

# Run the 18-suite integration verification test runner
npm test

# Run production build verification
npm run build

# Start development server
npm run dev
```

### 3. Production & Beta Docker Environments
GitHub Actions (`.github/workflows/docker-publish.yml`) automatically builds and publishes branch-specific images with embedded Git branch, commit SHA, and workflow build number metadata:
- **Beta (`main` branch)**: `ghcr.io/plexd281knilb/portalarr:main`
- **Production (`stable` branch)**: `ghcr.io/plexd281knilb/portalarr:stable`

```bash
docker-compose pull
docker-compose up -d
```

---

## 🔒 Security
- **Global Edge Proxy (`src/proxy.ts`)**: All page and `/api/*` routes are authenticated at the edge with strict role (`ADMIN`, `SUPER_USER`, `USER`, `TRIAL`) and status (`APPROVED`, `TRIAL`, `PENDING`, `EXPIRED`) enforcement.
- **AES-256-GCM Encryption**: All third-party tokens (Plex, SMTP, Discord, Radarr, Sonarr, AI keys) are encrypted at rest.
- **White-Label Brand Isolation**: All external user communications, emails, and client notifications are strictly branded as `DomsHomeLab (d281knilb)`.

## 📄 License
Private repository for internal homelab use.

---
name: radarr-expert
description: Expert architectural, API, and operational guide for Radarr (movie collection manager, Usenet/BitTorrent downloader, quality profile evaluator, and file renamer). Activate when integrating with the Radarr v3 REST API, inspecting movie models, configuring Torznab/Newznab indexers, troubleshooting download queue ingestion, or adjusting custom format scoring and upgrade cutoffs.
---

# Radarr Expert Guide

Radarr is a movie collection management and automated PVR tool for Usenet and BitTorrent. It monitors multiple RSS feeds and indexers for new movie releases, interfaces with download clients (qBittorrent, SABnzbd, NZBGet), scores releases via quality profiles and custom formats, and automatically organizes, renames, and upgrades movies on disk.

Primary Reference Repositories & Modules:
- Directory: [Radarr-develop](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Radarr-develop)
- OpenAPI Specification: [openapi.json](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Radarr-develop/src/Radarr.Api.V3/openapi.json)
- API Controllers: [src/Radarr.Api.V3/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Radarr-develop/src/Radarr.Api.V3)
- Core Logic: [src/NzbDrone.Core/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Radarr-develop/src/NzbDrone.Core)
- Portalarr Radarr Actions: [src/app/arr-actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/arr-actions.ts)

---

## Architecture & Codebase Layout

```text
Radarr-develop/
├── src/
│   ├── Radarr.Api.V3/               # REST API controllers, resources, and OpenAPI documentation
│   │   ├── Movies/                  # Movie CRUD, alternative titles, lookup, bulk editors
│   │   ├── Commands/                # Asynchronous command executor (search, refresh, scan)
│   │   ├── Queue/                   # Active download queue, client management, blocklist
│   │   ├── Profiles/                # Quality profiles and cutoff thresholds
│   │   ├── CustomFormats/           # Release scoring rules (regex, specs)
│   │   └── RootFolders/             # Disk root directories and available storage metrics
│   └── NzbDrone.Core/               # Business logic, SQLite/Postgres persistence, parser
│       ├── Movies/                  # MovieService, movie metadata
│       ├── DecisionEngine/          # Release qualification specs (cutoff, language, retention)
│       ├── Download/                # Download client drivers (qBittorrent, SABnzbd, Deluge)
│       ├── Indexers/                # Torznab, Newznab, Torrent Potato, RSS sync
│       └── MediaFiles/              # MovieFileRepository, file movement, disk scanner
└── frontend/                        # React / TypeScript UI
```

---

## Key Workflows & Runbooks

### 1. REST API v3 Integration
Radarr exposes an OpenAPI 3.0 compliant API authenticated via `X-Api-Key`:
- **Movie Lookup & Add**: `GET /api/v3/movie/lookup?term={query}` -> `POST /api/v3/movie`.
- **Monitored Missing Queries**: `GET /api/v3/movie` filtered by `m.monitored && !m.hasFile`.
- **Movie Deletion**: `DELETE /api/v3/movie/{id}?deleteFiles=true&addImportExclusion=false` (via `deleteRadarrMovie`).
- **Tag Collections**: `GET /api/v3/tag` -> filter movies where `m.tags.includes(tagId)`.
- **Queue Management**: `GET /api/v3/queue` -> `DELETE /api/v3/queue/{id}?removeFromClient=true&blocklist=true` (via `deleteRadarrQueueItem`).
- **Command Dispatcher**: `POST /api/v3/command` (`MoviesSearch`, `DownloadedMoviesScan`, `RefreshMovie`, `RenameMovie`).

See detailed runbook: [api-v3-endpoints.md](./references/api-v3-endpoints.md).

### 2. Decision Engine & Custom Formats
Radarr uses an advanced scoring engine to rank release candidates:
- **Quality Definitions**: Rank standard resolutions and sources (Bluray-1080p, Remux-2160p, WEBDL-1080p).
- **Custom Formats**: Score specific attributes (HDR10+, Dolby Vision, DTS-HD, TrueHD Atmos, release groups). In release listings, display `CF: +{score}` badges with color-coded positive/negative highlights.
- **Cutoffs**: Halts automatic searches once both quality cutoff and custom format score cutoff are satisfied.

See detailed runbook: [movie-model-and-decisions.md](./references/movie-model-and-decisions.md).

---

## Common Gotchas & Troubleshooting

1. **Movie Added But Not Searching**:
   - Cause: When adding a movie via `POST /api/v3/movie`, `addOptions.searchForMovie: true` must be explicitly provided, or `monitored` was set to false.
   - Fix: Ensure `monitored: true`, `minimumAvailability: "released"`, and pass `"addOptions": { "searchForMovie": true }`.
2. **API Key Leaks over Client Wire**:
   - Cause: Returning `apiKey: decryptData(app.apiKey)` in client-facing actions like `getEnabledArrInstances`.
   - Fix: Omit `apiKey` from `getEnabledArrInstances` entirely. Client actions pass `appId` to server actions, which call internal helper `getArrAppById(appId, type)` to fetch the instance and decrypt `apiKey` strictly within server memory.
3. **Download Stuck in Queue / Failed Import**:
   - Cause: Completed download folder path from torrent client differs from Radarr container path mapping (e.g. Docker `/data` vs `/downloads`).
   - Fix: Configure **Remote Path Mappings** in Settings -> Download Clients to map host/client directory to local container directory.
4. **Hardlink vs Copy**:
   - For torrents to continue seeding without consuming double storage space, Radarr and the download client completed directory must reside on the same filesystem mount to allow atomic hardlinks (`link` syscall).
5. **4K UHD vs 1080p Radarr Instance Isolation**:
   - Radarr instances must be explicitly selected by ID (`seerrDefaultMovieAppId` for standard 1080p, `seerrDefaultMovie4kAppId` for 4K). Never fall back to auto-discovering any server containing "4k" if 4K is disabled in settings.
6. **Super User Instance Access Gating**:
   - In `src/app/arr-actions.ts`, only `ADMIN` bypasses `enabledForUsers`. Super users and regular users must only see instances where `enabledForUsers: true` is explicitly checked in Edit Application, ensuring instances like `Kids Radarr` never leak into user management views unless explicitly enabled.
7. **Queue Progress Monitoring & Auto-Polling**:
   - Query `/api/v3/queue?page=1&pageSize=1000` and compute progress percentage (`((size - sizeleft) / size) * 100`). Render smooth visual progress bars alongside transferred bytes. Automatically poll queue every 5 seconds when the Activity/Queue tab is active.
8. **Interactive Release Search Ergonomics**:
   - Display `customFormatScore` badges (`CF: +500`), age of release (e.g. `2d ago` or `Today`), and full active rejection breakdown. Protect dialog with `w-[96vw] sm:max-w-4xl max-h-[85vh]` and `break-all` on release titles to prevent mobile overflows.
9. **Fast TMDB Lookup & Monitored State**:
   - Query `/api/v3/movie` and index movies by `tmdbId` to instantly check if a movie is `monitored` and whether it `hasFile` across 1080p and 4K instances.
10. **Autonomous AI Replacement Grabs & Rate Limiting Guardrails**:
   - In self-healing workflows (`searchAndGrabRadarrReplacement`), the AI bot can query indexers and dispatch grabs directly to Radarr (`POST /api/v3/release`).
   - Candidate releases undergo strict validation: rejection of bootleg formats (CAM, TS, Telecine, Screener), foreign-only releases (when English audio is required), zero-seeder torrents, and files outside safety size caps (400MB to 95GB).
   - Rate limit guardrails (`checkAgentRateLimit`) enforce sliding 24-hour quotas configurable via `Settings.aiMaxDailyGrabs` (1 to 10 grabs/day) to prevent infinite download loops or indexer query exhaustion.
11. **Autonomous Release Grab & Optimal File Verification (`searchAndGrabRadarrReplacement`)**:
   - When diagnosing missing audio tracks or corrupt movie files, inspect `/api/v3/release?movieId={id}` and evaluate release rejections against the on-disk file.
   - If Radarr indexer releases are rejected with `hasEqualOrHigherScoreRejection` (`"equal or higher Custom Format score"` or `"Existing file on disk has a equal"`), return `alreadyOptimal: true` (with `releaseTitle: title`, `quality: "1080p / 4K"`, `existingFile: title`, `existingScore: 900000`).
   - Prevents falsely claiming an autonomous grab was queued or unnecessarily escalating to an administrative support ticket when the highest available custom format score is already present on disk.
12. **Admin Ticket Fallback Escalation**:
   - When no release candidate passes qualification scoring and the file is not already optimal, the agent creates an Admin Support Ticket (`escalateToAdminTicket`) with attached container telemetry and indexer search diagnostics, alerting administrators without degrading media quality.
13. **Missing Cover & Poster Fallback**:
   - When `movie.images` lacks an external `remoteUrl` (e.g. running in Docker networks where only internal container paths `/MediaCover/...` exist), always fall back to `/api/media/image?title=${encodeURIComponent(movie.title)}&year=${encodeURIComponent(String(movie.year || ""))}&type=movie` so artwork is proxied through TMDb or iTunes rather than rendering a blank "No Cover" placeholder.



---

## 🚨 Mandatory 4-Step Verification & Delivery Protocol (Strict SemVer)

To guarantee 100% reliability, quality control, and consistency, the following 4-step protocol MUST be executed at the end of every task or feature change:
1. **Full Integration Testing:** Execute `cmd /c "npm test"` to run the verification suite (`scripts/verify-all.ts`). All 18+ test suites must pass (0 failures).
2. **Production Build Verification:** Execute `cmd /c "npm run build"`. Ensure 100% clean compilation, zero TypeScript errors, and zero Turbopack runtime errors.
3. **Skills & Documentation Sync:** Review and update relevant `.agents/skills/` documents to record any new UI patterns, API contracts, formulas, or operational guidelines.
4. **SemVer Version Increment & Git Deployment Push:** Increment version in `package.json` according to SemVer (PATCH `+1` for fixes/polish, MINOR `+1` for features), stage all changes (`git add -A`), commit with freshly incremented semantic version prefix (`[v<version>] feat/fix(scope): message`), push strictly to `origin/main` (Beta). NEVER push to `stable` unless the user explicitly instructs.

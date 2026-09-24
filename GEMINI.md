# Portalarr

Portalarr is a centralized, self-hosted dashboard designed to manage a media server ecosystem. It serves as a unified portal that aggregates system status, active downloads, service links, and support tools for both users and administrators.

## Project Overview

- **Core Purpose:** To provide a single "mission control" interface for media server stacks (Plex, Tautulli, Glances, and "Arr" apps).
- **Architecture:** Next.js 16 (App Router) with React 19. It uses Server Actions for backend logic and Prisma with SQLite for data persistence.
- **Tech Stack:**
  - **Framework:** Next.js 16 (App Router, Turbopack)
  - **Database:** SQLite (Prisma 6 ORM)
    - **CRITICAL:** Do NOT upgrade to Prisma 7+. The project is locked to Prisma 6 for stability.
  - **Styling:** Tailwind CSS, Radix UI (Shadcn UI style)
  - **Icons:** Lucide React
  - **Auth:** Custom JWT-based session management using `jose` and `bcryptjs`.
  - **Security:** AES-256-GCM encryption for sensitive service tokens (Plex, SMTP, API keys).
  - **My Plex Hub & Live Stream Diagnostics (`MyPlexHub`):** Personalized user mission control for Plex and Tautulli ecosystems. Features real-time active stream monitoring, stream telemetry (video/audio codec, transcode decision, hardware NVENC acceleration, bitrate, transcode speed), **Transcode Doctor** stream health diagnostics with tailored device fix steps, user self-service stream termination (`killUserStream`), deduplicated multi-server integration modal (`serverMap`), personal watch-time statistics (hours streamed, movies finished, episodes watched), in-browser **Server Speed Test**, and **Plex Device Setup Guides** (Apple TV, Roku, Fire TV, Samsung/LG TV, Android TV, iOS, Web).
  - **Unified Status Widgets:** Real-time stream stats (Tautulli), server health metrics (Glances), and deduplicated active download queues (qBittorrent, SABnzbd, NZBGet).
  - **Responsive Radarr & Sonarr Views:** Mobile-optimized, flexible wrap layouts for Movie and TV libraries featuring prominent release date labeling ("Air Date") and seamless dropdowns.
  - **Tier 1 Request-First Metadata Binding & Relational Schema Linking:** Verified requests (`BookRequest` and `MediaRequest`) submitted via Seerr/Discovery serve as the authoritative primary source of truth for canonical `title`, `author`, `series`, `volumeNumber`, and `coverUrl`. Library scans (`scanLibraryInternal`), background download monitoring (`monitorAndRetryDownload`), download imports (`importCompletedDownload`), missing stub creation (`autoDownloadBookRequest`), and manual book edits (`updateBook`) automatically bind foreign keys `Book.authorId` and `Book.seriesId` into SQLite `Author` and `BookSeries` tables via `resolveOrLinkAuthorAndSeries`, reserving the LLM AI metadata agent strictly as a Tier 4 fallback for unrequested loose legacy files.
  - **Interactive Ingest & Unlinked Series Matcher (`BookMatchModal`):** Radarr/Sonarr-style interactive metadata matcher for unlinked or manually uploaded books and audiobooks. Non-destructively inspects file metadata and presents candidate suggestions with confidence scoring from the local SQLite database (`Author`/`BookSeries` relations), multi-source registries (OpenLibrary, Audible, Google Books), and AI agent fallback. Allows manual field overrides, volume linking, high-definition cover selection, optional disk restructuring (`renameBookFileOnDisk`), and automatic request state reconciliation (`Downloaded` / `AVAILABLE`).
  - **AI Metadata Agent & Smart Series Detection:** Multi-provider LLM support (Gemini, Claude, OpenAI, Groq, Ollama, DeepSeek, OpenRouter) for intelligent book metadata extraction, series identification, volume backfilling (`assignVolumeNumbersWithAI`), and automated resolution during library scans.
  - **"Missing Books" Series Discovery & Radarr/Sonarr-Style Missing Stubs:** Discovers unacquired installments in series ("Show Missing Books") using iTunes, OpenLibrary, and Google Books with 1-click Auto-Grab. Generates `fileType: "missing"` directory stubs with `.portalarr-missing` immunity markers, rendered with grayscale visual cards.
  - **Multi-Tier Torznab Search Fallback Engine (`executeProwlarrSearch`):** 4+ tier fallback queries (Literal → Cleaned Punctuation → UK/Alternate Title → Category-less → Format/Audiobook suffix) to maximize indexer match rates and eliminate zero-result searches.
  - **Strict Fuzzy Download Matching & Ingestion (`findDownloadedFile`):** Deduplicated word sets and 75% match threshold to prevent multi-book series cross-matching in completed download folders.
  - **Reverse Request Auto-Sync & Revalidation:** Validates `Downloaded` requests against actual disk files (ignoring missing stubs) and dynamically reverts false positive downloads to `Failed (Missing)` for manual retry.
  - **Audiobook & Ebook Unified Library:** Dedicated tabs for Ebooks and Audiobooks, library media type filtering (`ebook` vs `audiobook`), built-in floating HTML5 audio player with interactive Chapter Selector Modal, user chapter reordering & disk track renaming (`reorderAudiobookChapters`), HTTP Range streaming (`/api/books/[id]/stream`), continuous autoplay next chapter, Send-to-Kindle integration, multi-disc folder ingestion (`Disc 01/`, `Disc 02/`), and Prowlarr category routing (`3030` Audiobooks vs `3040` Ebooks).
  - **3-Tier Cover Artwork & Poster Engine:** Automated high-definition artwork resolution (Direct PMS → Tautulli → iTunes 600x900 HD → Open Library `-L.jpg` → Google Books `zoom=0`), with strict 2:3 vertical poster proportions, background `<Film />` placeholder layers, and instant **"Fetch Cover" (`🖼️`)** actions.
  - **Smart Multi-Track Audiobook Consolidation:** Folder-level metadata resolution for multi-track audiobooks (`01 Dudley Demented.mp3`, `02 A Peck of Owls.mp3`), auto-merging chapter tracks into unified book entries (`Harry Potter and the Order of the Phoenix` by `J. K. Rowling`) with total size calculation and HD artwork.
  - **Interactive Release Selection & 1-Click Ingestion:** Interactive release chooser modal for indexers, manual release selection, retry search, and **`📥 Import Download`** action button for instant manual download folder ingestion.
  - **Live Request Auto-Refresh & Auto-Approval:** All book and series requests are instantly auto-approved. Reactive polling on `/library` updates media request states every 5 seconds (`Pending` / `Approved` → `Searching` → `Downloading` → `Downloaded`) and automatically syncs new library items upon completion. A 5-minute background job acts as a safety net, automatically retrying any requests stuck in `Approved`, `Searching`, or `Downloading` states for over 12 hours.
  - **In-Browser Kindle Reader & Comic Viewer:** Kindle Paperwhite reading experience with 0ms CacheStorage reopening, accurate reading percentage, estimated time remaining ("X mins left in chapter", "Y hrs Z mins left in book"), tappable status footer, Kindle `Aa` typography controls (Bookerly, Ember, Monospace, margins, line-height, themes), center-tap distraction-free mode, and persistent `Resume (X%)` shelf badges. Comic reader streams `.cbr`, `.cbz`, and image archives via WASM unrar and JSZip.
  - **Multi-Source Title & Author Request Autocomplete with 1-Click Downloads:** Interactive registry autocomplete for both Title and Author fields querying Audible, iTunes, OpenLibrary, and Google Books with high-definition artwork, format badges (`📖 EBOOK` vs `🎧 AUDIOBOOK`), and 1-click **`Download`** buttons.
  - **Dedicated Ebooks & Audiobooks User Guide Tab:** Built-in `Help & Guide` tab in `/library` rendering `user_guide_ebooks.md` with responsive Markdown styling, live refresh, and an in-app Admin Markdown Editor.
  - **Audiobook vs Ebook Request Email Notifications:** HTML notification emails sent to administrators feature styled format badges (`🎧 AUDIOBOOK` vs `📖 EBOOK`), distinct subject headers, and dynamic public URL resolution (`getAppUrl()`).
  - **Overhauled System Settings Tabs:**
    - **General & Email:** Dashboard alert banner, SMTP server setup, test email dispatch, Send-to-Kindle Amazon approved senders guide, Google Books API key integration, AI metadata agent provider settings, and Completed Downloads folder path access validator (`FolderCheck`).
    - **Access Control:** User directory live search, status filters, inline role toggling (`Admin` vs `User`), Kindle email manager (`✏️`), Admin password reset modal (`🔑`), 1-click bulk approvals (`CheckCheck`), and Plex friends auto-sync.
    - **Monitoring & Apps:** Live connection diagnostic buttons (`"Test"`), inline edit states (`✏️`), dynamic port pre-filling, visibility toggles for sensitive tokens, and unified settings management for Tautulli, Glances, SABnzbd, qBittorrent, Readarr, Prowlarr, Overseerr, Jellyseerr, Bazarr, etc.
    - **Beta & Announcements:** Markdown Roadmap editor and interactive Beta Testing Cards manager.
  - **Support System:** Direct ticket submission for users, and a ticket management panel at `/admin/tickets` for administrators (with SMTP email updates).
  - **Persistent 30-Day Sessions:** Signed HttpOnly JWT session cookies with 30-day lifetime and sliding auto-renewal.
  - **Upcoming Roadmap:**
    - **Step 1 — Curation & Poster Studio (Agregarr, Kometa & Maintainerr Replacement):** Native built-in collection generator, dynamic smart playlists, automated poster overlays (4K HDR, Dolby Vision/Atmos), Media Inspector stream telemetry, unified timestamp calculation (`max(addedAt, modifiedAt, lastWatchedAt)`), season-level TV pruning, and staged prune headroom queue with soft (85%) / hard (95%) danger thresholds.
    - **Step 2 — Native *Seerr Replacement (Overseerr / Jellyseerr):** All-in-one native Movie & TV media discovery, interactive trailer playback, trending carousels, and Radarr/Sonarr request engine eliminating external Overseerr/Jellyseerr containers, featuring quotas (series, season, and dynamic TMDB/Sonarr episode-based counting), auto-approvals, and stream readiness notifications.
    - **Step 3 — User Onboarding, Membership Subscriptions & Authorization (Wizarr Replacement):** Rebuilt Wizarr onboarding portal, automated PayPal / Venmo / Zelle (Friends & Family / P2P) subscription tracking (Annual discount vs Monthly fee with premium), dynamic payment links & QR codes with memo tags, referral rewards (+1 free month per referral), tiered membership perks (IPTV / Live TV / 4K transcode access), granular shelf visibility, dedicated Kid / Living Room shared profiles, and full user notification & email preference controls.
    - **Step 4 — Autonomous AI Support Agent & Deep Server Diagnostics:** In-app first-response conversational support bot with autonomous diagnostic tools (stream health fixes, downloading replacement language audio tracks, fixing/sending book downloads, 1-click ticket escalation with auto-attached telemetry/logs), combined with deep Plex/Tautulli/Arr server log ingestion and correlated incident analysis.
    - **Step 5 — Native Readarr Replacement & Unified Book Engine:** Rebuilt Ebook and Audiobook management on a native author/series/book schema with *Seerr-style request discovery, multi-tier indexer fallback scoring, multi-track chapter consolidation, Send-to-Kindle, floating web player, and offline in-browser EPUB/comic reader.
    - **Step 6 — Native Uptime & Service Health Monitoring Engine (Uptime Kuma / Ping Replacement):** Multi-protocol heartbeat polling (HTTP/HTTPS, TCP/UDP port pings, SSL cert expiry), instant outage alerting (SMTP email, Discord rich embed cards, Web Push), downtime debouncing, and public/admin latency & uptime percentage status dashboards.

## Building and Running

### Development
1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Create a `.env` file with at least:
   ```env
   DATABASE_URL="file:./prisma/dev.db"
   JWT_SECRET="your-super-secret-key"
   ALLOWED_ORIGINS="your-domain.com,192.168.1.50:8080" # Optional: For Server Actions
   ```
3. **Database Setup:**
   ```bash
   npx prisma@6.2.1 migrate dev
   ```
4. **Run Dev Server:**
   ```bash
   npm run dev
   ```
   The server will start on `http://0.0.0.0:3000` to allow local network access.

### Production (Docker)
Portalarr is optimized for Docker deployment, particularly on Unraid.
1. **Configure environment:** Ensure `JWT_SECRET` is set in your `docker-compose.yml` or environment.
2. **Build and Run:**
   ```bash
   docker-compose up --build
   ```
3. **Database Migrations:** The Docker container is configured to run `prisma migrate deploy` automatically on startup. This safely updates the schema without affecting your data.
4. **Volumes:**
   Data is persisted in `/app/data` (mapped to `/mnt/user/appdata/portalarr/data` in the default `docker-compose.yml`).

### Updating Portalarr
To update to the latest version while preserving your settings and database:
1. **Pull the latest image:** `docker-compose pull`
2. **Restart the container:** `docker-compose up -d`
The persistent volume ensures your `dev.db` file is maintained across updates, and automatic migrations will apply any new schema changes.

## Development Conventions

### 1. Data Access & Mutations
- **Server Actions:** All database interactions should be handled via Server Actions in `src/app/actions.ts` or `src/app/auth-actions.ts`.
- **Security:** Actions that modify settings or sensitive data MUST call `verifyAdmin()` to ensure the user has proper permissions.

### 2. UI Components
- **Radix UI:** Use the Radix UI primitives located in `src/components/ui` for consistent accessible components.
- **Lucide Icons:** Use `lucide-react` for all iconography.
- **Theme:** The project is hardcoded to a dark theme using `next-themes` and custom CSS in `src/app/globals.css`.

### 3. Encryption
- **Sensitive Fields:** Fields like `mainPlexToken`, `smtpPass`, and service `apiKey`s must be encrypted before saving to the database using `encryptData` and decrypted before use with `decryptData` (from `src/lib/encryption.ts`).

### 4. Global Route Protection & Edge Security
- **Proxy Configuration:** All routes are protected by `src/proxy.ts` (Next.js 16 convention).
- **Enforcement:** Users are redirected to `/login` if no valid session exists. API requests without valid sessions are rejected at the edge with HTTP 401.
- **Strict Shelf Access Control:** `checkLibraryAccess()` validates username/email directly against `allowedUsers` and `restrictedUsers`. Empty or `*` allows all users, while explicit user lists strictly grant access ONLY to listed accounts. Fallbacks returning all libraries on empty matches are strictly prohibited.
- **Role & Status Protection:** Admin routes (`/settings`, `/admin/*`) are restricted to users with the `ADMIN` role. Users with `PENDING` or `REJECTED` status are blocked from all app/API routes by `src/proxy.ts` and redirected to `/pending`. Non-admin users attempting to visit `/settings` are safely redirected to `/settings/profile`.
- **Static Asset Guards:** Static asset bypass checks in `proxy.ts` explicitly exclude `/api` paths to prevent API route session bypasses via file extension tricks.

### 5. Account Approval, Plex Auto-Sync & Session Resilience
- **Pending Account Requests:** New users can submit a temporary account request on `/login`. This sets `status = "PENDING"` and emails an admin notification via SMTP with dynamic public URL links (`getAppUrl()`). Admins manage approval/rejection at `/settings/access`.
- **Plex Owner Token Auto-Save & Friend Sync:** Logging in as the Plex server owner automatically saves the owner's encrypted token into `prisma.settings` and triggers a background sync. The scheduler in `src/lib/prisma.ts` scans `/api/v2/friends`, auto-provisions `APPROVED` accounts for new friends, updates changed emails/usernames, and revokes access (`status = "REJECTED"`) for removed friends.
- **Session Desync & Loop Prevention:** `getCurrentUser()` detects changes between the database status/role and the active JWT payload. If an admin approves a pending user, `getCurrentUser()` automatically re-issues a fresh session cookie with `status = "APPROVED"`, preventing redirect loops between `proxy.ts` and `/pending`.
- **Persistent Login:** Session cookies persist for 30 days with sliding renewal so active users stay logged in across browser restarts and reboots.
- **Send-to-Kindle Email Gate & Settings Header:** Users must configure a valid Send-to-Kindle email (`kindleEmail`) to unlock access to books on `/library`. A prominent Kindle Settings action button in the `/library` header allows users to manage delivery preferences and view the Amazon Approved Senders Guide.
- **Forgot Password Email Workflow:** Users can click "Forgot password?" on `/login`. Entering an email or username generates a temporary password, updates the user's password in SQLite, and sends the temp password via SMTP. Users can update to a new permanent password on `/settings/access`.

### 6. Gotchas & Best Practices
- **Windows File Locks:** SQLite database and Prisma engine files lock during `npm run dev`. Stop the dev server before running `npx prisma migrate dev`.
- **Case-Insensitive SQLite Queries:** Perform lowercased string matching in JS when querying `prisma.user` to avoid Prisma SQLite `mode: "insensitive"` type errors and `P2002` unique constraint crashes.
- **Registry Autocomplete:** Use `onMouseDown` instead of `onClick` for dropdown suggestion list items to prevent input `onBlur` from unmounting items prematurely.
- **Open Library, iTunes & Chapter Track Normalization:** Combine title queries with author name, clean out scene release noise (`(Rob Inglis)-PoF`, `Disc 01`), and normalize chapter titles (`dudley demented`, `peck of owls`) to official book titles (`Harry Potter and the Order of the Phoenix` by `J. K. Rowling`) to fetch crisp 600x600 cover artwork.
- **Multi-Track Audiobook Consolidation:** In `getEffectiveBookBaseName()`, detect track number patterns (`01 `, `02 `, `1-01 `) and use parent release folder names to consolidate chapter audio files into a single master audiobook card.
- **Download Client Matching & Ingestion:** Track torrents across both `books` and `audiobooks` categories in qBittorrent, and fall back to title substring matching in SABnzbd when `nzo_id` is missing. Provide `importCompletedDownload()` for 1-click manual download directory ingestion.
- **Library Access Defaults:** Public libraries use `allowedUsers = "*"` or empty string to allow all approved users access.
- **Server Action Error Handling:** Server actions invoked from Client Components should return a serializable `{ success: boolean, error?: string }` object instead of throwing raw `Error`s. In production Next.js builds, raw errors are masked with a generic *"An error occurred in the Server Components render"* message, preventing detailed user-facing error reporting.
- **Kindle & Library Scan Renaming Loops:** Keep on-disk file paths pretty (e.g. `Author - Title.ext`) and avoid cleaning or lowercase-renaming them on disk during library scans. This prevents infinite scan-rename cycles and race conditions where download/Kindle delivery checks fail because the path keeps changing. For Kindle email delivery, sanitize the attachment filename *in the email options* instead of renaming the file on disk.
- **Download Client File Cleanup & Deduplication:** When a book download finishes and is successfully copied to a library, call the download client API to delete the torrent/NZB and its files. Active downloads fetched from SABnzbd, NZBGet, and qBittorrent are deduplicated by clean filename/title on both server and client.
- **Foreign Language Ebook Filtering:** To maintain an English-centric library on automated grabs, use the `isForeignLanguage` helper. Releases with foreign indicators (e.g. `swedish`, `svensk`, `german`, `french`, etc.) must be filtered out during Prowlarr search. If a downloaded file contains these keywords, delete it from the client and disk, and set `downloadStatus = "failed"` to trigger the monitor failover and attempt the next release.
- **Ebook vs Audiobook Library Isolation:** Isolate libraries by strictly enforcing `mediaType` checks during cross-library database matching. Never allow an ebook (`.epub`) to match an audiobook (`.mp3`) database record by title, or file types will desync.
- **File Type Sync on Reassignment:** When a book's path changes or is cross-matched during a library scan, always synchronize `fileType` in the `updateData` payload so the UI correctly displays the format badge (`EPUB` vs `MP3`).
- **Audiobook Release Folder Parent Resolution:** When parsing audiobook titles from disk via `getEffectiveBookBaseName`, ensure you pass the `effectiveFilePath` (the path to a sample track file) rather than the parent directory path. Passing the directory path causes `path.dirname` to evaluate to the root `audiobooks/` library folder, incorrectly stripping all release metadata.
- **Scanner Sub-Folder Size Calculation:** When validating folders, `calcFolderSize` must unconditionally sum `fs.statSync` size for *all* files. Do not gate size accumulation behind audio/book file extensions, or you will accidentally skip legacy release folders with non-standard files.
- **Download Client Cleanup Race Conditions:** When `deleteDownload` successfully delegates file cleanup to the download client (e.g., SABnzbd/qBittorrent), strictly skip manual `fs.unlinkSync` and `fs.rmSync` operations in Node.js to avoid `EACCES` file locking collisions.
- **Robust Folder Metadata Parsing:** When raw filenames lack author information (e.g. `Death Masks.epub`), `extractMetadataFromPath` falls back to parsing the folder hierarchy. It safeguards against misidentifying unhyphenated multi-word titles (like `Project Hail Mary`) as authors by explicitly substring-matching the folder name against the file title.
- **UI Auto-Organizer & File Moving:** `updateBook` in `actions.ts` calls `renameBookFileOnDisk`, which does MORE than rename a file. If an admin edits a book's Author in the UI, `renameBookFileOnDisk` physically restructures the filesystem, safely migrating the entire contents of the original folder into a new `Library / Author / Title` directory structure, then cleaning up the empty directories behind it.
- **AI Metadata Scanner Renaming Guard:** Automated on-disk file/directory renaming during AI metadata scans is strictly forbidden to prevent hallucination-induced folder restructuring and race conditions; physical restructuring is strictly gated to manual admin UI edits (`updateBook` -> `renameBookFileOnDisk`).
- **Missing Stub Architecture & Immunity:** Missing book placeholders are created as `fileType = "missing"` with `.portalarr-missing` directory markers. The zombie sweeper (`purgeEmptyDirectories`) and library scanners explicitly preserve these directories. The title deduplicator automatically purges missing stubs when the real media file with positive file size is imported.
- **Kindle & Background Monitor Directory Guards:** `monitorAndRetryDownload` and `sendBookToUserKindleInternal` must filter out `fileType === 'missing'` and strictly verify `fs.statSync().isFile()` to prevent `ESTREAM` directory read errors when processing requests.
- **Instant Fulfill Missing Stub Bypass:** `autoDownloadBookRequest`'s instant fulfill check must ignore `fileType === 'missing'` so users can retry failed grabs without falsely triggering instant completion.
- **URL Query Parameter Hacks in Requests (`coverUrl`):** When passing target `libraryId` through `coverUrl`, always use valid query parameter syntax (`&lib=` if `?` is present, else `?lib=`). UI rendering must strip `/[\?&]lib=[a-zA-Z0-9_\-]+/` before checking length and passing to `<img src>` to avoid broken 404 image errors.
- **Download Ingestion Fuzzy Matching Rules:** In `findDownloadedFile`, deduplicate search words using `Set` and enforce a minimum 75% match threshold to prevent multi-volume series releases (e.g. *Sorcerer's Stone* vs *Order of the Phoenix*) from cross-matching in shared `/downloads` folders.
- **Plex Hub User Stream Ownership & Termination:** In `killUserStream`, expand user aliases via `getPlexOwnerUser` (for admins) and `getPlexServerFriends` (for regular users) identical to `getUserPlexHubData`. Match `sessionUser`, `sessionEmail`, and `sessionFriendly` (device name) against this alias set before authorizing stream termination, and fall back from Tautulli to Direct PMS token termination if Tautulli API returns an error.
- **Plex Transcode & Poster Aspect Ratios:** For movie and TV show cards, always use standard 2:3 vertical poster proportions (`aspect-[2/3]`). In `/api/media/image/route.ts`, pass `width=600&height=900` to Plex `/photo/:/transcode` endpoints rather than landscape dimensions (`600x400`) to prevent Plex from cropping portrait posters.
- **Card Subtitle Typography:** `BookCard` and `AudiobookCard` titles must use `line-clamp-3 h-[60px] block` instead of `flex items-center` to avoid squished text on non-fiction books with extensive subtitles.
- **Plex Collection Deletion Performance & Cascading:** Never iterate and untag individual items before deleting a collection in Plex. PMS automatically cascades collection deletion to all tagged metadata items in ~10ms. Attempting to fetch and untag thousands of items individually causes 30-40s request latency and Server Action timeout failures (*"An unexpected response was received from the server"*). Always issue `DELETE /library/metadata/{ratingKey}` directly.
- **Plex Hub Moving & Timeout Avoidance:** Order home screen hubs using the official `PUT /hubs/sections/{sectionKey}/manage/{hubId}/move?after={afterHubId}` endpoint along with locked `titleSort` prefixes. When pushing hub visibility changes across multiple collections, dispatch updates concurrently with a 4-second timeout guard (`AbortSignal.timeout(4000)`) to prevent connection hangs from triggering Server Action errors.
- **Seerr 4K UHD vs 1080p Quality Gating & Instance Resolution:** In Seerr media request management, 4K Radarr and Sonarr instances must strictly resolve only when explicitly configured in settings (`seerrDefaultMovie4kAppId` / `seerrDefaultTv4kAppId` !== `"none"`). Never fall back to auto-discovering any app with "4k" in its name when the admin has disabled or unconfigured 4K in Seerr settings. In the UI, gate all 4K options and copy behind `canRequest4k = Boolean(quotaData?.canRequest4k && arrDetails?.isConfigured4k)`. When 4K is unavailable, banner copy and status badges should cleanly adapt (e.g. "Monitored in Sonarr" without referencing 4K UHD).
- **Radix Dialog `sm:max-w-lg` Tailwind Merge Specificity Override:** In Radix UI / Shadcn UI `DialogContent`, `sm:max-w-lg` is included in default base classes. Passing an unprefixed `max-w-6xl` does NOT override `sm:max-w-lg` in `tailwind-merge` because the modifier prefix differs. To properly expand modal width across viewports, `DialogContent` must receive explicit prefixed classes (`sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1500px] w-[96vw] sm:w-[94vw] md:w-[92vw] lg:w-[90vw] xl:w-[86vw] 2xl:w-[82vw]`).
- **Deep Episode-Level Monitoring & Targeted Requests:** In Sonarr media checking (`getArrMediaMonitoringDetails`), query `/api/v3/episode?seriesId=...` to build a granular episode map (`s{season}e{episode}`) tracking both 1080p and 4K monitored states. This allows users to request specific unmonitored episodes or seasons without re-requesting already acquired media. When requesting episodes, dispatch `/api/v3/episode/monitor` and trigger the `EpisodeSearch` command.
- **Seerr Multi-Channel Notifications (Discord & Rich HTML Emails):** Media request lifecycle transitions (`PENDING`, `AUTO_APPROVED`, `APPROVED`, `DECLINED`, `AVAILABLE`, `FAILED`) dispatch rich Discord embed cards (with poster image, requester username, format badges, and clickable links) and customizable HTML emails to administrators and users. All outbound notification links use dynamic host resolution (`getAppUrl()`).
- **SQLite PRAGMA table_info BigInt Gotcha & Table Rebuild Migrations:** In Prisma Client with SQLite, `prisma.$queryRawUnsafe("PRAGMA table_info(...)")` returns integer metadata (such as `notnull`, `pk`, `cid`) as JavaScript `BigInt` (e.g. `1n`, `0n`). Strict equality comparisons like `tmdbCol.notnull === 1` evaluate to `false` (`1n === 1` is `false` in JS!), silently skipping schema auto-migrations on existing user databases. Always use `Number(col.notnull) === 1 || col.notnull == 1`. When performing SQLite table rebuild migrations to alter constraints (e.g. relaxing `tmdbId` to nullable for non-TMDB media like Books/Audiobooks), always execute `DROP TABLE IF EXISTS "Table_migrating";` before `CREATE TABLE`, disable foreign keys with `PRAGMA foreign_keys=OFF;` during copy and rename, and restore with `PRAGMA foreign_keys=ON;`.
- **MediaRequest Multi-Format Architecture & Nullable tmdbId:** `MediaRequest` serves as the unified request tracking model for Movies, TV, Ebooks, and Audiobooks. Non-TMDB media (Ebooks, Audiobooks) use `openLibraryId`, `googleBooksId`, `asin`, `bookAuthor`, `bookSeries`, and `bookVolume`, with `tmdbId` set to `null`.
- **Volume-Ordered Missing Series Discovery & Quality Heuristics:** In `findMissingBooksInSeries`, missing series installments are strictly sorted ascending by volume (`Vol 1`, `Vol 2`, `Vol 3`...). Knockoff study guides, summary publishers (e.g. "BookCaps", "Instaread", "Scribd"), and foreign adaptations are filtered out via strict author matching (`isSeriesAuthorMatch`), clean title extraction, and volume checks. Discovered missing books are persisted into the `BookSeries` SQLite relation and surfaced in *Seerr discovery ("Missing from Your Series" carousel).
- **Protected Zombie Folder Sweeper:** `purgeEmptyDirectories` queries both active `Book` disk paths and pending/approved `BookRequest` records to build a `protectedFolderSet`. Empty directory trees for pending/downloading requested books are never deleted, ensuring upcoming media folders remain intact.
- **Library-Specific Download Client Category Routing:** Each `Library` has its own configurable `downloadCategory` (e.g. `books`, `audiobooks`, `kids-books`). Portalarr routes Usenet (SABnzbd) and Torrent (qBittorrent) downloads using the specific library's configured category, preventing cross-library folder placement issues.
- **Cross-Library Isolation Rules:** Maintain strict library boundary isolation. Never cross-match or compare media records or folders between different libraries (e.g. Public Library vs Kids Library) during scans, requests, or purges.
- **Path Normalization & Scanner Update Idempotency:** Path comparisons across Windows and Linux environments must use `normalizePathForLookup` (`(p || "").replace(/\\/g, "/").toLowerCase().trim()`) to prevent backslash vs forward-slash discrepancies from triggering infinite `DB-CHANGE (Update)` loops during library scans. `resolveOrLinkAuthorAndSeries` performs fallback matching across both `name`/`cleanName` and `title`/`cleanTitle` to gracefully handle unique constraint violations and missing relational links, ensuring scanner updates remain 100% idempotent no-ops when media on disk is already synchronized.
- **Interactive Matcher vs Blind AI Restructuring:** Loose manual files or downloads without request bindings are non-destructively imported without forced disk restructuring or blind AI hallucinated renaming. Users can click `🔗 Match` on any book or audiobook card to preview detection telemetry, search online registries, select correct volumes, and safely apply canonical metadata with relational linking (`authorId`, `seriesId`).
- **OpenLibrary API Constraints & Rate Limit Resilience:** Always specify explicit projection fields (`&fields=key,title,author_name,cover_i,first_publish_year`) on all OpenLibrary searches to prevent massive payloads and server socket timeouts (`fetch failed`). Pass a valid identifying application `User-Agent` (`Portalarr/3.0 ...`) to comply with OpenLibrary's API policy and prevent aggressive Cloudflare/IP throttling. Enforce bounded `AbortController` timeouts (5–7s) and concurrent `Promise.allSettled` execution for batch series lookups.
- **Next.js 16 App Router Tab SearchParams Hydration Alignment:** Pages hosting tabbed client hubs (`/discover`) must accept and await `searchParams: Promise<{ tab?: string; section?: string }>` in server components (`page.tsx`) and pass down `initialTab` and `initialSection` wrapped inside `<Suspense>` to prevent tab state hydration desync. Client components must consume `useSearchParams()` and reflect manual tab switches to the browser URL (`window.history.replaceState` or `router.replace`) to maintain deep-link integrity.
- **Scanner Multi-File Matching Guards & Reorganization Deduplication:** During library scanning (`scanLibraryDirectInternal`), exact path lookups via `dbBooksByPathLower.get(fullPath)` MUST verify `!matchedDbBookIds.has(existing.id)` to prevent multiple on-disk files or folder chapters from claiming and overwriting the same database record in the same scan pass. When files are reorganized or moved on disk, pre-creation lookups use robust `isTitleMatch` (stripping series prefixes `[Series 01]`, parenthetical tags, and track digits) and `isAuthorMatch` (supporting inverted `"Last, First"` formats, token permutations, and substrings) with normalized `mediaType` checks to link existing database rows and update their `filePath` in place, completely eliminating duplicate insertion-and-purge churn. Post-scan deduplication groups records by a composite `${mediaType}:::${authorKey}:::${cleanTitleKey}` and prioritizes retaining valid on-disk media files with positive file sizes over missing stubs.
- **On-Disk Ebook Consolidation Across Subfolders:** When consolidating ebook files on disk (`consolidatedEbookMap`), `ebookGroups` MUST be keyed by canonical author and normalized title (`normAuthorKey + ":::" + normTitleKey`) rather than the local `parentDir`. This prevents duplicate entries in `finalMediaItems` when both an old unbracketed folder (e.g. `Elsie Silver/Wild Eyes`) and a new bracketed directory (`Elsie Silver/[Chestnut Springs 04] Wild Eyes`) exist on disk. Groups automatically sort to prioritize organized bracketed paths and higher-quality/larger EPUB files, yielding exactly one consolidated media entry per unique book.
- **Media Card Button Layout & Radix DropdownMenu Standard:** Media and book cards on responsive shelves must never place 3+ text/icon buttons side-by-side in narrow card footers (<180px), which causes severe truncation (e.g. `Res...`, `k...`, `f...`, `e...`) and tiny mystery buttons. Standardize on a clean 2-tier layout:
  1. Full-width Hero CTA button (`Resume (31%)` / `Read Book` / `Listen & Chapters`) spanning 100% width.
  2. A secondary action button (`flex-1` `Send to Kindle` or `Download`) paired with a Radix UI `DropdownMenu` trigger button (`•••` or `MoreHorizontal`).
  3. Secondary administrative/management actions (Fetch Cover, Match Book, Edit, Delete, Reassign, Admin Kindle dispatch) live inside the Radix `DropdownMenuContent` with descriptive text labels and icons.
- **Radix Sub-Menu Portaling Gotcha (`DropdownMenuSubContent`):** In Radix UI / Shadcn UI primitives, `DropdownMenuSubContent` MUST be wrapped inside `<DropdownMenuPrimitive.Portal>`. If omitted, the sub-menu mounts inline as a child of `DropdownMenuContent`, which has `overflow: hidden`, causing the sub-menu to be clipped and invisible when expanded.
- **Canonical Series Discovery & Bundle/Spinoff Elimination:** `findMissingBooksInSeries` defines canonical series lists (`CANONICAL_SERIES`) for high-profile series (Harry Potter, Lord of the Rings, Percy Jackson, Hunger Games, Narnia, Expanse, Dune, Wheel of Time) to ensure canonical volume numbers (#1 through #N) and titles are always prioritized. Strict regex `JUNK_OR_BUNDLE_REGEX` filters out multi-volume ranges (e.g. `1-3`, `1-4`, `1-5`, `1-6`, `1-7`, `(1-7)`), boxsets, omnibuses, complete collections, almanacs, and reference companions. Candidate books by the same author that lack a series volume number and do not match the series name (like *Fantastic Beasts*, *Quidditch Through the Ages*, *The Tales of Beedle the Bard*) are eliminated as spinoffs rather than inserted into the core series. Series queries pass and respect `libraryId` and verify disk existence to avoid cross-library false-negative filtering.





### 7. Mandatory Pre-Push Testing & Verification Protocol
- **Strict Requirement Before Every Git Push:** NEVER push untested code to `origin/main` or remote. Before committing and pushing any code changes, the agent/developer MUST perform and pass the complete 6-step verification suite:
  1. **Prisma Schema Validation:** Run `npx prisma validate` and verify the schema is clean with 0 syntax errors.
  2. **TypeScript Typecheck:** Run `npx tsc --noEmit` and confirm **0 compile errors**.
  3. **Full System Integration Test Suite:** Run `npx tsx scripts/verify-all.ts` (or `npm test` / scratch verification) and confirm **100% of integration & database assertion tests pass**.
  4. **Production Turbopack Build:** Run `npm run build` (`next build`) and confirm Turbopack compiler, static route generation, and NFT dependency tracing exit with **code 0**.
  5. **Continuous Documentation & Skill Knowledge Sync:** Document all architectural decisions, bug root causes, API gotchas, UI patterns, and learned domain knowledge in `GEMINI.md` and the relevant `.agents/skills/` reference guides (e.g. `seerr-expert`, `portalarr-ui`, `plex-api-expert`, `agregarr-expert`, `kometa-expert`, `maintainerr-expert`, etc.) so future agent sessions immediately possess the accumulated learnings.
  6. **Git Sanity Check & Clean Atomic Push:** Run `git status` and `git diff` to confirm only intended changes are staged, commit with semantic prefixes (`feat:`, `fix:`, `refactor:`, `chore:`), and push to `origin/main`.
- **Fix Before Push:** If any step fails or reports an error, resolve the underlying issue immediately and re-run all verification tiers until 100% clean before committing or pushing to git.

- **Git Workflow Overrides & Daily Multi-Device Sync:**
  - **Daily Git Pull & Sync First:** Always check and pull the latest changes from `origin/main` (`git pull origin main` or `git fetch`) at the start of each day or session before modifying files to ensure synchronization across multiple development computers/devices.
  - **Mandatory Pre-Push Verification:** Always run the complete 6-step verification protocol (`npx prisma validate`, `npx tsc --noEmit`, `npm run build`, documentation & skills sync) before pushing commits.
  - **Main Branch Pushes:** Always push completed updates directly to `origin/main` unless `stable` is explicitly requested by the user. Pushing to `stable` is strictly forbidden to protect production unless explicitly commanded.
- **Autonomous Agent Directives & Auto-Approve:**
  - **Always Proceed:** Automatically execute all file edits, refactors, and code modifications immediately using write tools without asking for confirmation.
  - **Direct Command Execution:** Run required terminal commands (builds, migrations, tests, git operations) directly and proactively.
  - **Full Pre-Push Testing & Knowledge Updates:** Always run `npx prisma validate`, `npx tsc --noEmit`, `npm run build`, and synchronize learned findings to `.md` documentation and skills before pushing to git.
  - **Daily Repository Sync:** Check and pull the latest changes from remote Git repository at the beginning of each conversation/task.


## Key Files
- `prisma/schema.prisma`: The source of truth for the database schema.
- `src/proxy.ts`: Global edge authentication, role-based, static file, and user status access control.
- `src/app/actions.ts`: Main repository for system logic, Plex friend sync, active download parsing, cover resolution, connection testers, download ingestion, stream diagnosis, and database mutations.
- `src/app/auth-actions.ts`: Logic for login, 30-day session creation, account requests, Plex authentication, and session cookie resync.
- `src/components/my-plex-hub.tsx`: Personalized Plex mission control, live active streams, Transcode Doctor, connected servers modal, watch time statistics, and recently watched carousel.
- `src/app/api/media/image/route.ts`: Multi-tier image proxy and artwork resolver supporting Direct PMS, Tautulli, all-server broadcast, and automated iTunes 600x900 HD poster fallbacks.
- `src/lib/plex.ts`: Direct Plex Media Server API integration, session history queries, friend sync, and stream termination.
- `src/components/server-speed-test.tsx`: Interactive client-to-server download and latency bandwidth tester modal.
- `src/components/plex-setup-guides.tsx`: Step-by-step device configuration and quality optimization guides for Apple TV, Roku, Fire TV, Smart TVs, Android TV, iOS, and Web.
- `src/app/pending/page.tsx`: Pending account approval status screen for non-approved users.
- `src/app/settings/page.tsx`: System settings page embedding tab views for General, Access Control, Monitoring, and Beta.
- `src/app/settings/access/page.tsx`: Admin management screen for users, role toggling, Kindle emails, admin password resets, and Plex sync.
- `src/app/settings/profile/page.tsx`: Self-service account profile and password change screen for all users.
- `src/app/admin/tickets/page.tsx`: Admin management screen for user support tickets.
- `src/app/library/page.tsx`: Book & Audiobook library page with Send-to-Kindle gate, Kindle settings header, live request auto-polling, interactive release chooser, and cover artwork fetchers.
- `src/components/active-downloads.tsx`: Client component for deduplicated active downloads queue rendering.
- `src/components/sidebar.tsx`: Main navigation component.
- `src/lib/encryption.ts`: AES-256-GCM encryption utilities.
- `.github/workflows/docker-publish.yml`: GitHub Actions CI/CD workflow for automated Docker build and push to GHCR.

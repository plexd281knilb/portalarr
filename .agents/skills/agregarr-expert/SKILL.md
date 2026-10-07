---
name: agregarr-expert
description: Expert architectural and operational guide for Agregarr (collection aggregator, smart playlists, home screen hubs, placeholder stubs, filtered smart hubs, hub dismissal blacklists, and poster styling). Activate when implementing or debugging collection synchronization, list providers (Trakt/TMDb/MDBList/Letterboxd/MAL/Radarr/Sonarr), placeholder stubs, home screen hub promotion, filtered smart hubs, or Agregarr database and API models.
---

# Agregarr Expert Guide

Agregarr is an automated media collection curation and Plex home screen management platform. It aggregates media lists from multiple upstream providers (Trakt, TMDb, MDBList, Letterboxd, IMDb, MyAnimeList, Radarr, Sonarr, Overseerr, Plex Watchlist), matches items against local libraries, creates static or smart collections, promotes collections to Plex Home and Recommended screens, generates placeholder video stubs for upcoming content, deploys filtered smart hubs that exclude placeholder trailers, and dynamically applies styled artwork overlays.

Primary Reference Repositories & Modules:
- Directory: [agregarr-latest](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/agregarr-latest/agregarr-latest)
- API Definition: [agregarr-api.yml](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/agregarr-latest/agregarr-latest/agregarr-api.yml)
- Server Entry: [index.ts](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/agregarr-latest/agregarr-latest/server/index.ts)
- Portalarr Native Engine: [src/app/curation-actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/curation-actions.ts)
- Portalarr Preset Catalog: [src/lib/curation/presets.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/lib/curation/presets.ts)

---

## Core Architecture & Module Layout

```text
agregarr-latest/server/
├── api/
│   ├── plexapi.ts              # Native Plex Media Server client (hubs, collections, labels, ratings)
│   └── overseerr.ts            # Overseerr / Jellyseerr media request integration
├── entity/
│   ├── CollectionMetadata.ts   # Collection settings, visibility, sort titles, time restrictions
│   ├── PlaceholderItem.ts      # Active placeholder files, tmdbId, path, plexRatingKey
│   └── PosterTemplate.ts       # Canvas styling, typography, colors, badges
├── lib/
│   ├── collectionsSync.ts      # Main synchronization orchestrator and task state
│   ├── collections/
│   │   ├── services/           # CollectionSyncService, HubSyncService, DiscoveryService
│   │   ├── plex/               # PlexHubManager, PlexSmartCollectionManager, UnifiedOrdering
│   │   └── sources/            # Upstream list fetchers (trakt, tmdb, mdblist, letterboxd, radarr, sonarr, mal)
│   ├── placeholders/           # placeholderManager.ts, trailerDownload.ts, PlaceholderDiscovery.ts
│   └── posterGeneration.ts     # Dynamic canvas poster renderer
└── routes/
    ├── collections.ts          # CRUD endpoints for collections, sync triggers, previews
    └── collection-posters.ts   # Poster upload, template generation, downloads
```

---

## Key Workflows & Recipes

### 1. Synchronizing Collections & Hubs
Sync evaluates each active collection configuration:
1. **Fetch Upstream List**: Queries provider (e.g. `trakt.trending`, `tmdb.popular`, `mdblist.custom_url`, `radarr:monitored_missing`, `sonarr:monitored_missing`, `letterboxd`, `mal`).
2. **Resolve to Plex Media**: Matches TMDb/IMDb/TVDb IDs or normalized titles against library `Guid` or `ratingKey`.
3. **Handle Placeholders**: If `createPlaceholdersForMissing: true`, creates on-disk `.mp4`/`.disc`/`.strm` stubs for unacquired items.
4. **Update Plex Collection**: Calls `POST /library/collections` (if new) or increments items via `updateCollectionContents`.
5. **Set Order & Hub Visibility**: Calls `HubSyncService` to configure `promotedToOwnHome`, `promotedToSharedHome`, and `promotedToRecommended`.

See detailed runbook: [plex-hubs-and-sync.md](./references/plex-hubs-and-sync.md).

### 2. Filtered Smart Hubs & Placeholder Exclusion
When trailer placeholders exist in a Plex library, standard default Plex hubs ("Recently Added", "Recently Released") display trailer stubs. Agregarr and Portalarr deploy **Filtered Smart Hubs**:
- **Movies**: `?type=1&label!=trailer-placeholder&editionTitle!=Trailer&sort=addedAt:desc`
- **TV Shows**: `?type=2&label!=trailer-placeholder&episode.title!=Trailer (Placeholder)&sort=addedAt:desc`
- **Top Unwatched (Personalized)**: Dynamic filter with `collectionFilterBasedOnUser=1` so Plex computes unwatched recommendations dynamically per logged-in user.

See detailed runbook: [filtered-smart-hubs-and-dismissal.md](./references/filtered-smart-hubs-and-dismissal.md).

### 3. Permanent Hub & Collection Dismiss / Blacklist System
To prevent deleted Plex-generated hubs (like "Top Movies by Director" or deleted smart collections) from reappearing when clicking "Import from Plex" or running automated sweeps:
- Deleted items are registered in a persistent dismissed/ignored registry (`Settings.dismissedHubs`, `MediaCollection.isIgnored: true`).
- Library collection importers match against dismissed `ratingKey`s and normalized titles and permanently skip them.
- An Ignored Hubs modal allows administrators to inspect and unignore/restore hubs on demand.

See detailed runbook: [filtered-smart-hubs-and-dismissal.md](./references/filtered-smart-hubs-and-dismissal.md).

### 4. Missing Content & Placeholder Stubs
Agregarr bridges the gap between unreleased media and Plex collections by creating physical video files:
- **Movies**: `{libraryPath}/{Title} ({Year})/{Title} ({Year}) {tmdb-{id}} {edition-Trailer}.mp4`
- **TV Shows**: `{libraryPath}/{Title} ({Year})/Season 00/S00E00.Trailer.mp4`
- **Cleanup**: When real media is ingested, the placeholder file and directory are safely purged.

See detailed runbook: [placeholders-and-stubs.md](./references/placeholders-and-stubs.md).

### 5. Label & Tagging Integration
Agregarr manages metadata labels on items:
- **Add Label**: Fetches existing `metadata.Label`, appends tag, and sends `PUT /library/metadata/{ratingKey}?label[0].tag.tag=...&label[N].tag.tag=...`.
- **Clear All Labels**: Sends `label[0].tag.tag-=`.
- **Query by Label**: `GET /library/sections/{libraryKey}/all?label={labelName}`.

### 6. Collection Edit Modal & Reset to Preset Defaults
The Collections & Hubs studio provides interactive per-collection configuration via the **Edit** action button:
- **Edit Modal (`Edit Collection: {title}`)**: Configures Plex client screen targets (Owner Home, Shared Home, Recommended), inline library display mode (`default`, `hide`, `hideItems`, `showItems`), home screen numerical ranking (#1 - #99) and sort prefix, day-of-week active scheduling, daily time windows, seasonal date ranges, excluded Plex labels, and trailer placeholder generation.
- **Reset to Defaults (`RotateCcw`)**: Locates the underlying preset from `COLLECTION_PRESETS` (via exact title, preset ID, `sourceType`/`sourceQuery`, or normalized alphanumeric match) and restores all configuration fields to their preset baseline settings (or default studio settings for custom collections). Changes are applied and written to Plex on clicking **"Save & Sync to Plex"**.

---

## Common Gotchas & Troubleshooting

1. **"Synced Collections & Hubs successfully: 0 rules evaluated"**:
   - Cause: The collection has no active source rules, `isActive: false`, or current date is outside `timeRestriction` start/end window.
   - Fix: Verify collection rule toggle is enabled, and check `timeRestriction.removeFromPlexWhenInactive` settings.
2. **Deleted Plex Hubs Resurrecting on Sync/Import**:
   - Cause: Plex auto-generates category/actor/director hubs, or "Import from Plex" blindly re-inserts deleted collections.
   - Fix: Always record deleted hub ratingKeys and normalized titles into `dismissedHubs` and filter them out during sync and import.
3. **Placeholder files not showing in Plex or polluting Recently Added**:
   - Cause: Plex library scanner has not refreshed the target folder, or placeholders lack `trailer-placeholder` labels.
   - Fix: Run the placeholder tagging worker (`tagAllPlaceholdersInPlexInternal`) and deploy Filtered Smart Hubs.
4. **Smart Collections Reordering Failure**:
   - Cause: Smart collections in Plex are dynamically populated by Plex search filters. Attempting to call `/move` or `/items` on a smart collection will corrupt or error out.
   - Rule: Always check `isSmartCollection(ratingKey)`. Never call incremental item moves on smart collections.
5. **Collection Deletion Latency & Server Action Timeouts**:
   - Cause: Manually fetching and untagging thousands of media items prior to deleting a collection in Plex causes 30-40s latency spikes, resulting in Next.js Server Action timeout errors (*"An unexpected response was received from the server"*).
   - Rule: Plex Media Server automatically cascades collection deletion to all items tagged with that collection in ~10ms. Always issue direct `DELETE /library/metadata/{ratingKey}` without pre-clearing tags.
6. **Hub Reordering & Visibility Timeouts**:
   - Use `PUT /hubs/sections/{sectionKey}/manage/{hubId}/move?after={afterHubId}` alongside locked `titleSort` prefixes for immediate, stable home screen positioning.
   - Concurrently dispatch visibility updates (`promotedToOwnHome`, `promotedToSharedHome`, `promotedToRecommended`) using `Promise.all` wrapped in 4s timeout guards (`AbortSignal.timeout(4000)`) to prevent single unresponsive endpoints from stalling execution.
7. **Automated Scheduler Execution, Mutex Locks & Telemetry Resilience**:
   - Agregarr curation sync runs automatically via `isScheduleDue()` in `src/lib/prisma.ts` evaluated against `agregarrSyncSchedule` (default `every_6_hours`) and `agregarrLastRunAt`.
   - Global concurrency lock `(global as any).__PORTALARR_AGREGARR_RUNNING` protects `runAgregarrSyncInternal` against simultaneous runs from background cron timers and manual admin triggers.
   - **Scheduler Mutex Ownership & Debouncing**: The background scheduler in `src/lib/prisma.ts` MUST NOT set `(global as any).__PORTALARR_AGREGARR_RUNNING = true` before calling `runAgregarrSyncInternal()`. `runAgregarrSyncInternal()` manages its own mutex lock. Setting it externally causes the function to immediately abort with "An Agregarr collection sync task is already in progress.", skip updating `agregarrLastRunAt`, and loop every 60 seconds. The scheduler updates `agregarrLastRunAt = now` immediately upon schedule trigger to debounce subsequent 60-second ticks.
   - If execution fails or Plex tokens are missing, `agregarrLastRunAt` and `agregarrLastRunStatus` are explicitly updated in `prisma.settings` (capturing error telemetry) to prevent infinite 60-second retry loops and surface error states directly in the UI.
   - Fixed daily, weekly Sunday, and monthly schedules enforce `lastRun && elapsedMs >= threshold` for catch-up, preventing fresh installations from prematurely triggering calendar-locked jobs outside their intended low-traffic maintenance window.
8. **Collection Title Truncation with Placeholders**:
   - Cause: Hardcoded `max-w-[200px]` constraints with `truncate` on collection title spans cause names like "Netflix Trending & Top Charts" to be cut off as "Netflix Trending & ..." when badges (e.g. `Placeholders: ON`, `Seasonal`, `Limit`) are enabled.
   - Rule: Let collection titles take natural width (`font-bold text-white text-xs sm:text-sm tracking-tight`) inside flex header containers so titles and status badges wrap cleanly without clipping.
9. **Custom Collection Media Type Isolation & Server ID Resilience**:
   - Custom collections created via `handleCreateCustomCollection` must dynamically inherit `type: isTvSection ? "show" : "movie"` from the active library section so TV collection queries match series models instead of movie models.
   - Server Actions (`getMediaCollectionsAction`, `deleteAllPlexCollectionsAction`, `syncSeasonalAndScheduledCollectionsInternal`) must resolve candidate server identifiers (`[serverId, resolved?.serverId, "main"]`) to ensure collections created under legacy `"main"` or discovered PMS machine identifiers are consistently retrieved and wiped without leaving orphaned records.
10. **Popular Media Native TMDb Resolution & MDBList Fallback**:
    - Cause: "Popular Movies" originally configured with `sourceType: "mdblist"` and `sourceQuery: "official/movies/popular"` returned 0 results whenever the user had not configured an external MDBList API key (or when MDBList rate limits/fails).
    - Rule: Popular movies & TV blueprints natively use `sourceType: "tmdb"` with `sourceQuery: "popular"` to query `getTmdbPopularMovies` / `getTmdbPopularTv` across multiple pages in parallel with zero external dependencies. For backward compatibility with existing databases, all MDBList resolution routines (`previewCollectionMatchingAction`, `syncCollectionToPlexAction`, `getCollectionMediaPreviewAction`, `runAgregarrSyncInternal`) automatically fall back to native TMDb popular media if MDBList returns empty.
11. **Anime & Crunchyroll Presets & Dedicated Studio Filter Chip**:
    - Agregarr equips dedicated anime presets: "Crunchyroll Trending Anime" (`sourceType: "tmdb"`, `sourceQuery: "provider:283"`, `mediaType: "both"`), "Crunchyroll Anime Series" (`sourceType: "tmdb"`, `sourceQuery: "network:1112"`), and the "🍙 Anime & Crunchyroll" category filter chip in Agregarr Studio (`agregarr-studio.tsx`).
12. **Dual Placeholder Labeling Convention (`Coming Soon-placeholder` vs `trailer-placeholder`)**:
    - Items monitored in Radarr/Sonarr receive the Plex label `Coming Soon-placeholder` with `edition: Trailer` and `DOWNLOADING SOON` or `COMING SOON MONITORED` banners.
    - General collection placeholders (e.g. Netflix Trending, Disney+, awards, studio charts) receive `trailer-placeholder` with `edition: Trailer` and `NOT REQUESTED YET` banners.
    - Filtered Smart Hubs filter out both `label!=Coming Soon-placeholder&label!=trailer-placeholder&editionTitle!=Trailer` to keep standard "Recently Added" rows clean while enabling dedicated "Coming Soon" hubs.
13. **Non-Blocking Background Preset Installation & Plex Multi-URI Batch Syncing**:
    - **UI Unblocking**: When installing a curated preset (`handleInstallPreset`) or creating a custom collection (`handleCreateCustomCollection`), `saveMediaCollectionAction` persists to SQLite immediately (~15ms). The modal closes instantly (`setInspectModalOpen(false)`), allowing the user to continue browsing and installing other presets right away without waiting.
    - **Concurrent Multi-Sync Tracking**: Collections track active syncing state in `syncingCollIds: Record<string, boolean>`. Individual collection cards display spinning sync indicators, preset cards show `✓ INSTALLED` or `SYNCING TO PLEX` badges, and a floating glassmorphic toast notification alerts the user of background progress and item counts without blocking navigation.
    - **Plex Batch Addition Optimization**: `syncPlexCollection` constructs multi-`uri` query parameters (`?uri=...&uri=...`) to batch up to 50 items in a single HTTP PUT request to Plex Media Server. Fallbacks execute in concurrent batches of 8 items against the confirmed reachable Plex server IP, eliminating the 400-request sequential loops that previously caused 10-minute sync stalls.
14. **Genre & Keyword Discovery, Candidate Year Verification & Placeholder Exclusion**:
    - **Genre & Keyword TMDb Discover Queries**: Curation rules with `genre:<id>` (e.g. `genre:28` Action, `genre:27` Horror, `genre:10751` Family) and `keyword:<word>` (e.g. `keyword:christmas`, `keyword:halloween`, `keyword:superhero`) query TMDb Discover (`/discover/movie` and `/discover/tv`) sorted by `vote_count.desc` and popularity with high vote count minimums (`vote_count.gte=200` for genre, `100` for keyword). This prevents genre queries from falling back to generic weekly trending that returns obscure unreleased projects.
    - **Strict Release Year Verification on Title Matching**: When matching candidate items against local Plex libraries by title (when GUIDs are absent or unindexed), matching strictly enforces `Math.abs(libraryItem.year - candidate.year) <= 1` via `buildCandidateIndex` and `matchLibraryItemToCandidates` in `@/lib/curation/plex-analyzer`. This prevents legacy catalog movies (e.g. 2002 *Resident Evil*) from matching upcoming reboots/remakes (e.g. 2026 *Resident Evil*).
    - **Strict Placeholder & Trailer Stub Exclusion from Standard Collections**: Helper `isPlexItemPlaceholderOrStub` detects and excludes trailer stubs (duration < 15min, file size < 25MB, trailer editions/labels, `.portalarr-missing`, `.disc`, `.strm`) and future unreleased items (`year > currentYear`) from standard released movie and show collections unless `includePlaceholders: true` is explicitly enabled.
    - **Seasonal Active In-Season vs Out-of-Season Status Display**: UI components dynamically compute whether the current calendar date falls within the seasonal schedule window (`scheduleStartMonth/Day` to `scheduleEndMonth/Day`, correctly handling year-end rollover). Collections and presets outside their season (e.g. Summer Blockbusters in October) are styled with neutral out-of-season badges (`Out of Season (5/15 - 8/31)`) and excluded from active home screen promotion.
15. **Full Preset Catalog Audit, Franchise Mapping & Built-in Academy Award Fallback**:
    - **TMDb Franchise Universes (`franchise:mcu`, `franchise:dceu`, `franchise:starwars`)**: Rather than pointing to limited sub-collections (e.g. TMDb collection 86311 which only contains the 4 *Avengers* films), franchise presets query `franchise:<key>`. `getTmdbFranchiseMedia` queries company IDs (e.g. Marvel Studios `420`, DC Films `128064|429|9993`, Lucasfilm `1`) and universe keywords across movies and TV series across up to 3 pages in parallel, returning the complete cinematic universe filmography.
    - **Studio & Company Multi-Page Filmographies (`company:<id>`)**: `getTmdbStudioMovies` queries up to 3 pages in parallel (`maxPages = 3`), returning up to 60 titles. This prevents studios with large catalogs (e.g. Pixar `company:3` with 28+ films, Studio Ghibli `company:10342` with 25+ films) from being truncated to page 1 (20 items).
    - **Streaming Network Movie Section Originals (`network:<id>`)**: TMDb's `/discover/tv` `with_networks` endpoint only returns TV series. When a network preset (e.g. Netflix `network:213`, Disney+ `network:2739`, Apple TV+ `network:2552`, HBO `network:49`) is targeted to a Movie library section, `getTmdbNetworkOriginalMovies` transparently maps the network ID to its streaming provider equivalent and queries feature films.
    - **Built-in Academy Award Best Picture Winners Registry (`src/lib/curation/oscar-best-picture-data.ts`)**: Upstream MDBList charts (`top-oscar-best-picture`) require an external API key. To ensure 100% offline reliability, all 4 candidate resolution routines (`syncCollectionToPlexInternal`, `generateCollectionCandidateItemsPreviewAction`, `generateCollectionPlaceholdersInternal`, `getCollectionMediaPreviewAction`) fall back to `getBuiltinOscarBestPictureList()`, containing 96+ verified historical Oscar winners from *Oppenheimer* (2023) back to *Wings* (1927) with verified TMDb & IMDb IDs.
    - **Servarr Tag Query Standardization (`tag:<tagname>`)**: Tag collections use `sourceQuery: "tag:portalarr"`. Handlers verify the tag exists in Radarr (`/api/v3/tag`) and Sonarr; if the tag does not exist or has no tagged items, the candidate list defaults to empty (`[]`) rather than returning the entire media library.
16. **Trending Auto-Placeholders, Coming Soon Exclusion & Selective Placeholder Filtering**:
    - **Trending Presets Default Settings**: Presets tracking trending and anticipated media (`trending-this-week`, `netflix-trending`, `netflix-kids-trending`, `disney-trending`, `disney-kids-trending`, `crunchyroll-trending`, `trakt-anticipated-movies`, `trakt-anticipated-tv`, `tmdb-in-theatres`) default to `defaultIncludePlaceholders: true` and `defaultExcludedLabels: "Coming Soon-placeholder, coming_soon, leaving-soon"`. This ensures upcoming media automatically generates trailer stubs while excluding monitored Coming Soon items to avoid cluttering trending carousels with upcoming backlog.
    - **Coming Soon Presets Default Settings**: Servarr Coming Soon presets (`radarr-coming-soon`, `sonarr-coming-soon`) default to `defaultIncludePlaceholders: true` and `defaultExcludedLabels: "trailer-placeholder, trailers, leaving-soon"`. This keeps the hub focused strictly on items monitored for download in Radarr/Sonarr while suppressing general trending/collection trailer stubs.
    - **Selective Label & Tag Exclusion Engine (`isPlexItemExcludedByLabels` in `src/lib/curation/plex-analyzer.ts`)**:
      - Differentiates between Coming Soon stubs (`Coming Soon-placeholder`, `coming_soon`, `radarr_monitored`) and general collection trailer placeholders (`trailer-placeholder`, `trailers`, `collection`).
      - When `allowPlaceholders: true` is enabled, avoids wiping all placeholder-related tokens. If `hasComingSoonExclusion` is configured, only Coming Soon items are excluded; if `hasTrailerExclusion` is configured, only general trailer stubs are excluded.
      - In `generateCollectionPlaceholdersInternal`, checks `excludesComingSoonFromColl` to skip generating redundant trailer stubs for items already monitored in Radarr or Sonarr.
17. **Collection Update Priority Preservation & Plex Hub Ordering Integrity**:
    - **Preserve Existing Order on Updates**: Updating or re-inspecting an installed preset (`handleInspectPreset`, `handleInstallPreset`, `handleCreateCustomCollection`) preserves the collection's existing `orderIndex` and `sortPrefix` rather than appending to the bottom (`maxOrder + 1`). `saveMediaCollectionAction` resolves existing records by ID or title first and retains their priority rank.
    - **Non-Destructive Hub Promotion**: `updatePlexCollectionPromotionAndOrder` executes `PUT` visibility changes on canonical and fallback hub IDs before issuing `POST /hubs/sections/{sectionKey}/manage`. This prevents Plex Media Server from moving an already managed hub to the bottom of the home screen priority list.
    - **Sort Title Normalization & Compounding Prevention**: Sort titles strip duplicated or recursive prefix tags via `.replace(/^(![\d]+_)+/, "").trim()`, ensuring sort titles never compound into `!01_!01_Trending`.
    - **Selective Hub Reordering Synchronization**: When collection placement or contents update, `reorderPlexHubsSelective` synchronizes the home screen hub order in PMS to strictly match SQLite `orderIndex` ascending.
18. **Plex Direct HTTPS Enforcement, Private LAN IP Isolation & Robust Poster Uploads**:
    - **Strict HTTPS on `.plex.direct`**: Plex dynamic DNS domains (`*.plex.direct`) bind wildcard TLS certificates. Plain HTTP requests to `.plex.direct` ports trigger immediate TLS handshake termination (`ECONNRESET / fetch failed`). All candidate URL builders (`expandCandidateUrls` in `plex-analyzer.ts`, `addCandidate` in `plex.ts`) enforce `https://` and strictly forbid generating `http://` for `.plex.direct`.
    - **Private LAN vs. Public WAN IP Isolation (`isPrivateOrLocalIp`)**: Decoded IP addresses from `.plex.direct` are verified against private subnets (10.x, 172.16-31.x, 192.168.x, 127.0.0.1, link-local, Docker). Only verified private IPs are routed to `directLanList` / `directLanUrls`. Public WAN IPs (e.g. `162.231.214.194`) are strictly routed to `otherList` / `otherUrls` (WAN fallback), preventing local routers lacking NAT loopback/hairpinning from dropping connections.
    - **Confirmed Working Server URL Precedence**: `expandCandidateUrls` guarantees Candidate #0 is always the primary, verified server URL supplied by the caller.
    - **Portalarr-Buffered Poster Upload Strategy (`uploadPlexItemPosterFromUrl`)**: Rather than asking Plex Media Server to download external image URLs (which often fail due to PMS container DNS issues, VPN tunnels, or CDN User-Agent blocking on Unsplash/TMDb), Portalarr downloads the image buffer locally first using browser headers and streams the raw bytes via `uploadPlexItemPoster`. It locks the uploaded poster with `thumb.locked=1` and falls back to PMS `?url=` only if local buffer download fails.

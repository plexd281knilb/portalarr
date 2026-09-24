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
7. **Automated Scheduler Execution & Missing Token Guard**:
   - Agregarr curation sync runs automatically via `isScheduleDue()` in `src/lib/prisma.ts`.
   - If Plex tokens or global settings are missing, `runFullCurationSyncInternal` must persist `curationLastRunAt: new Date()` to prevent the 60-second background ticker from triggering repeatedly every minute.
8. **Collection Title Truncation with Placeholders**:
   - Cause: Hardcoded `max-w-[200px]` constraints with `truncate` on collection title spans cause names like "Netflix Trending & Top Charts" to be cut off as "Netflix Trending & ..." when badges (e.g. `Placeholders: ON`, `Seasonal`, `Limit`) are enabled.
   - Rule: Let collection titles take natural width (`font-bold text-white text-xs sm:text-sm tracking-tight`) inside flex header containers so titles and status badges wrap cleanly without clipping.


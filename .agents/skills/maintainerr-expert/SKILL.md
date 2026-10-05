---
name: maintainerr-expert
description: Expert architectural and operational guide for Maintainerr and Portalarr Prune Engine (media library pruning, rule engine, "Leaving Soon" staging, Servarr unmonitoring/deletion, poster countdown overlays, and storage reclamation). Activate when designing or troubleshooting retention rules, complex boolean conditions, Leaving Soon grace periods, poster countdown banners, or Radarr/Sonarr file cleanup.
---

# Maintainerr & Prune Engine Expert Guide

Maintainerr and Portalarr's Storage Prune Engine automate disk space reclamation and media lifecycle management. They monitor Plex, Jellyfin, and Emby servers alongside Radarr, Sonarr, Tautulli, and Overseerr to identify low-engagement or surplus media based on custom nested rule sets, stage candidate files into "Leaving Soon" collections with dynamic countdown artwork, and execute automated prune actions.

Primary Reference Repositories & Modules:
- Directory: [Maintainerr-development](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Maintainerr-development/Maintainerr-development)
- Architecture Overview: [ARCHITECTURE.md](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Maintainerr-development/Maintainerr-development/ARCHITECTURE.md)
- Server Source: [apps/server/src/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Maintainerr-development/Maintainerr-development/apps/server/src)
- Portalarr Prune Actions: [src/app/curation-actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/curation-actions.ts)
- Portalarr Leaving Soon API: [src/app/api/curation/leaving-soon/route.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/api/curation/leaving-soon/route.ts)

---

## Monorepo Architecture

```text
Maintainerr-development/
├── apps/
│   ├── server/                      # NestJS backend (API, cron jobs, DB, integrations)
│   │   └── src/modules/
│   │       ├── rules/               # Rule evaluation engine, operators, entity repositories
│   │       ├── collections/         # "Leaving Soon" collection handlers & staging lifecycle
│   │       ├── actions/             # Radarr/Sonarr deletion, unmonitoring, leftover cleanup
│   │       ├── overlays/            # node-canvas / sharp countdown poster rendering
│   │       └── api/media-server/    # Server-agnostic adapters (Plex, Jellyfin, Emby)
│   └── ui/                          # Vite + React + TanStack Query + TailwindCSS UI
└── packages/
    └── contracts/                   # Shared types, Zod schemas, rule & action enums
```

---

## Core Capabilities & Runbooks

### 1. Complex Boolean Rule Engine
Evaluates hierarchical rules combining conditions from Plex, Radarr, Sonarr, Seerr, and Tautulli:
- **Condition Operators**: `BIGGER`, `SMALLER`, `EQUALS`, `CONTAINS`, `BEFORE`, `AFTER`, `IN_LAST`, `IN_NEXT`.
- **User Scoping**: Evaluates watch history per specific user (`viewCountByUser`, `watchTimeByUser`) or globally.
- **Disk Triggers**: Triggers cleanups when free disk space falls below a specified gigabyte threshold (`diskspace_remaining_gb`).

See detailed runbook: [rules-and-operators.md](./references/rules-and-operators.md).

### 2. "Leaving Soon" Staging, Banners & Prune Actions
Provides a safe grace period before permanent deletion:
- **Staging Collection**: Creates a visible Plex/Jellyfin collection highlighting expiring items.
- **Dynamic Poster Overlays**: Renders "Leaving in X Days" or target deletion dates onto posters using `sharp` / canvas.
- **Prune Execution**: Executes configured `ServarrAction` (Delete file, Unmonitor, Remove series if empty, Downgrade profile).
- **Client Sweeper**: Deletes associated torrents/NZBs from qBittorrent/Transmission/SABnzbd, clears Seerr requests, and cleans empty folders without `EACCES` file locks.

See detailed runbook: [leaving-soon-and-actions.md](./references/leaving-soon-and-actions.md).

---

## Common Gotchas & Troubleshooting

1. **"Leaving Soon" Banner Not Showing Text**:
   - Cause: The text variable (`field: 'daysLeft'` or `field: 'date'`) evaluates against `TemplateRenderContext`. If `deleteAfterDays` is 0, null, or outside safe bounds (`DELETE_AFTER_MAX_DAYS = 36500`), `deleteDate` becomes `null`, rendering an empty background pill.
   - Fix: Ensure the collection rule defines a positive integer for `deleteAfterDays` (e.g. `14`), and verify date arithmetic produces a valid timestamp.
2. **Accidental Mass Deletion Protection**:
   - Always provide dry-run / candidate preview modes before executing disk prune actions.
3. **File Lock Collisions (`EACCES`)**:
   - When deleting media that is actively seeding or downloading, delegate torrent/NZB deletion to the client API first before attempting filesystem unlinks.
4. **Oldest Files Discovery & Rule Sandbox Grid Overlaps**:
   - Cause: Using `lg:grid-cols-6` without intermediate breakpoints or `min-w-0` on container cards causes text-heavy `<SelectValue>` text (e.g. `⚡ Dual-Lane Cascade (Never Watched → Oldest Watched)`) to expand beyond column widths and overlap adjacent dropdowns.
   - Rule: Use `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3`, ensure all cells have `min-w-0`, and add `w-full min-w-0 truncate [&>span]:truncate [&>span]:block` to all `SelectTrigger` and `SelectValue` elements.
5. **"Date Added" Pre-dating Server Setup (Preserved Release Timestamps & Plex addedAt Behavior)**:
   - Cause: Plex Media Server's `addedAt` timestamp frequently derives from physical file creation dates (`mtime` / `ctime`) preserved by torrent downloaders, Usenet NZB clients, or archive extractions (e.g. 2012, 2016, 2018). When Plex scans these files, it inserts the release file's original timestamp into `metadata_items.added_at`, making newly downloaded legacy content appear as though it was added years before the server existed. Furthermore, TV show seasons often inherit the show's or earliest episode's date.
   - Solution: The Prune Engine extracts both `addedAt` and `updatedAt` (when the file/metadata was last touched/refreshed on the current server), renders `• Mod: {updatedDateStr}` in the telemetry grid, and provides the **'Oldest Modified on Disk'** sort strategy (`sortBy: 'oldest_modified'`) to evaluate media against the actual timeframe it has resided on the current server.
6. **Watch Revocation Loop on Oldest Watched (Lane 1)**:
   - Cause: Checking `currentViewCount > 0` without verifying playback recency caused items staged under Lane 1 (Oldest Watched) to unflag themselves immediately upon staging, creating an endless flapping loop.
   - Fix: Require `lastViewedAt >= (flaggedAt - 86400000)` so that only plays occurring during the active grace period rescue media items.
7. **Sonarr TV Season Pruning Nuking Whole Series**:
   - Cause: Truncating `- Season X` to the base show title and calling `DELETE /api/v3/series/{id}?deleteFiles=true` deleted the entire series and all seasons from Sonarr instead of just the expired season.
   - Fix: Inspect for season numbering; when present, query `/api/v3/episode?seriesId={id}&seasonNumber={seasonNum}`, delete the individual episode files via `/api/v3/episodefile/{id}`, unmonitor the season's episodes and season model, and never delete the parent series entity.
8. **Automated Scheduler Execution, Baseline Parity & Mutex Locks**:
   - In `prune-studio.tsx`, initialize `baselineSettings.curationSyncSchedule` with `settingsRes.pruneSyncSchedule || settingsRes.curationSyncSchedule || "daily_6am"` so that the dedicated prune schedule matches initial state and does not trigger false unsaved changes flags (`isScheduleDirty`).
   - Concurrency lock `(global as any).__PORTALARR_PRUNE_RUNNING` prevents background evaluations from colliding with manual admin triggers.
   - In `runMaintainerrSyncInternal`, `catch (e: any)` updates `pruneLastRunAt: new Date()` and `pruneLastRunStatus` with error telemetry to prevent 60-second crash loops and surface errors in the UI.
   - **Unraid Plex Container Maintenance Blackout (5:00 AM – 5:30 AM)**: Unraid runs database integrity checks and restarts Plex containers daily from 5:00 AM to 5:30 AM. Maintainerr's recommended schedule is `daily_6am` (6:00 AM). The universal helper `isPlexMaintenanceWindow(now)` strictly blocks all scheduled and manual Maintainerr pruning runs during 5:00:00 AM – 5:29:59 AM. Existing legacy schedules set to `daily_5am` automatically defer to 5:30:00 AM after maintenance concludes.



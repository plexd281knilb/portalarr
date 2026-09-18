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

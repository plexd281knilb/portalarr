---
name: seerr-expert
description: Expert architectural, API, and operational guide for Seerr (Overseerr / Jellyseerr media request management, discovery carousels, user quotas, auto-approval rules, Radarr/Sonarr dispatch, and Plex/Jellyfin availability synchronization). Activate when integrating with the Seerr/Overseerr REST API, managing media requests, configuring user permissions, or troubleshooting Servarr dispatch workflows.
---

# Seerr Expert Guide

Seerr (Overseerr / Jellyseerr) is an open-source media discovery and request management platform for Plex, Jellyfin, and Emby ecosystems. It allows users to browse trending, popular, and upcoming movies/shows via TMDb, submit requests, and automatically coordinates approvals, user quotas, and dispatching to Radarr and Sonarr download managers.

Primary Reference Repositories & Modules:
- Directory: [seerr-develop](file:///c:/Users/Dom/Documents/GitHub/Other_Repos/seerr-develop)
- OpenAPI Specification: [seerr-api.yml](file:///c:/Users/Dom/Documents/GitHub/Other_Repos/seerr-develop/seerr-api.yml)
- Server Source: [server/](file:///c:/Users/Dom/Documents/GitHub/Other_Repos/seerr-develop/server)
- Entity Definitions: [server/entity/](file:///c:/Users/Dom/Documents/GitHub/Other_Repos/seerr-develop/server/entity)
- API Routes: [server/routes/](file:///c:/Users/Dom/Documents/GitHub/Other_Repos/seerr-develop/server/routes)
- Portalarr Native Request Engine: [src/app/actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/actions.ts)

---

## Architecture & Codebase Layout

```text
seerr-develop/
├── server/
│   ├── api/                         # Upstream clients (TMDb, TVDb, Radarr, Sonarr, Plex, Jellyfin)
│   ├── entity/                      # TypeORM entities (MediaRequest, Media, User, OverrideRule, Watchlist)
│   ├── routes/                      # REST API routes (request, media, discover, movie, tv, search)
│   ├── subscriber/                  # MediaRequestSubscriber (dispatches approved requests to Radarr/Sonarr)
│   ├── lib/
│   │   ├── availabilitySync.ts      # Periodic background sync matching Plex/Jellyfin library files
│   │   ├── permissions.ts           # Integer bitflag permission evaluator
│   │   ├── downloadtracker.ts       # Active download queue listener
│   │   └── notifications/           # Multi-channel notification engine (Discord, Slack, Pushbullet, Email)
│   └── datasource.ts                # SQLite / Postgres persistence config
└── src/                             # Next.js / React frontend
```

---

## Core Capabilities & Runbooks

### 1. REST API & Request Lifecycle
Seerr provides full request lifecycle management authenticated via `X-Api-Key`:
- **Submit Request**: `POST /api/v1/request` (checks permissions, user quotas, duplicate requests, and blocklists).
- **Approve / Decline / Retry**: `POST /api/v1/request/{id}/approve`, `POST /api/v1/request/{id}/decline`, `POST /api/v1/request/{id}/retry`.
- **Permissions Bitmask**: Granular permissions (`REQUEST`, `AUTO_APPROVE`, `REQUEST_4K`, `MANAGE_REQUESTS`, `ADMIN`).

See detailed runbook: [api-v1-endpoints.md](./references/api-v1-endpoints.md).

### 2. Servarr Dispatch & Override Rules
When requests are approved:
- **`MediaRequestSubscriber`**: Dispatches movie payload to Radarr or series payload to Sonarr.
- **`OverrideRule`**: Dynamically assigns custom quality profiles, root paths, or tags based on language (e.g. Japanese anime -> `/data/anime`), genres, or keywords.
- **`AvailabilitySync`**: Periodic scanner checks Plex/Jellyfin libraries to flip media to `AVAILABLE` and notifies the requester.

### 3. Granular TV Episode Monitoring & Deep Arr Inspection
Portalarr's native Seerr engine features deep per-episode monitoring synchronization:
- **Episode Mapping**: Queries `/api/v3/episode?seriesId={id}` on target Sonarr instances to construct a per-episode map (`s{season}e{episode}`) tracking monitored and on-disk file availability for both 1080p and 4K instances.
- **Season Status Reconciliation**: Compares `monitoredEpisodeCount` against `totalEpisodeCount` to flag seasons as `isFullyMonitored`, `isPartiallyMonitored`, or `Unmonitored`.
- **Targeted Episode Grabs**: Allows users to select individual unmonitored episodes or unmonitored seasons, dispatching `/api/v3/episode/monitor` and triggering `EpisodeSearch` commands without redundant series re-imports.

### 4. Multi-Channel Notification Engine (Discord Webhooks & HTML Emails)
- **Discord Webhook Cards**: Dispatches embed cards for `PENDING`, `AUTO_APPROVED`, `APPROVED`, `DECLINED`, `AVAILABLE`, and `FAILED` events. Embeds feature poster artwork, format badges (🎬 MOVIE vs 📺 TV SERIES, 4K UHD vs 1080p), requester username, season counts, and direct action links.
- **Rich HTML Emails**: Sends branded HTML emails via SMTP for admin approval alerts and user status updates, using dynamic public host resolution (`getAppUrl()`).

---

## Common Gotchas & Troubleshooting

1. **Request Stuck in "Approved" Without Reaching Radarr/Sonarr**:
   - Cause: Radarr/Sonarr server settings misconfigured (invalid API key, unreachable hostname), or no default server was flagged.
   - Fix: Check `MediaRequest.status`. If `FAILED`, inspect server connection settings, ensure port and URL base match, and click `/retry`.
2. **Duplicate Request Error (HTTP 409)**:
   - Cause: Another user already submitted a request for this TMDb ID or season.
   - Fix: Seerr blocks duplicate requests. The UI attaches multiple users to the existing `Media` record instead.
3. **4K vs Standard Media Isolation & Strict Gating**:
   - 4K Radarr and Sonarr instances must strictly resolve only when explicitly configured in settings (`seerrDefaultMovie4kAppId` / `seerrDefaultTv4kAppId` !== `"none"`).
   - Never fall back to auto-discovering any app containing "4k" in its name if 4K has been disabled in settings.
   - The UI must gate all 4K checkboxes, target quality indicators, and banner messages behind `canRequest4k = Boolean(quotaData?.canRequest4k && arrDetails?.isConfigured4k)`.
4. **Radix Dialog `sm:max-w-lg` Tailwind Specificity**:
   - Radix `DialogContent` includes `sm:max-w-lg` in base classes. Passing an unprefixed `max-w-6xl` fails to override `sm:max-w-lg` during `tailwind-merge`.
   - Pass explicit prefixed responsive classes (`sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1500px] w-[96vw] sm:w-[94vw] md:w-[92vw] lg:w-[90vw] xl:w-[86vw] 2xl:w-[82vw]`) to render wide, spacious modals for TV series episode guides and cast grids.

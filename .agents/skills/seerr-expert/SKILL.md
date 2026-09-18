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

See detailed runbook: [servarr-dispatch-and-sync.md](./references/servarr-dispatch-and-sync.md).

---

## Common Gotchas & Troubleshooting

1. **Request Stuck in "Approved" Without Reaching Radarr/Sonarr**:
   - Cause: Radarr/Sonarr server settings misconfigured (invalid API key, unreachable hostname), or no default server was flagged.
   - Fix: Check `MediaRequest.status`. If `FAILED`, inspect server connection settings, ensure port and URL base match, and click `/retry`.
2. **Duplicate Request Error (HTTP 409)**:
   - Cause: Another user already submitted a request for this TMDb ID or season.
   - Fix: Seerr blocks duplicate requests. The UI attaches multiple users to the existing `Media` record instead.
3. **4K vs Standard Media Isolation**:
   - Seerr tracks `status` (standard) and `status4k` (4K) independently. A movie can be `AVAILABLE` in 1080p while pending in 4K. Ensure 4K Radarr/Sonarr servers are flagged with `is4k: true`.

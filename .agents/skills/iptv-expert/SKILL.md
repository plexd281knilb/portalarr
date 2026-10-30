---
name: iptv-expert
description: Expert architectural, API, and operational guide for Portalarr IPTV & Live TV Hub subsystem (Dispatcharr integration, M3U/EPG streams, DVR buffer reservation, live session diagnostics, Plex Home tuner privileges, Jellyfin policies, media market shelves, and channel catalog management). Activate when developing or troubleshooting live TV streams, Dispatcharr lineups, DVR recording buffers, Plex Home Live TV/DVR restrictions, Jellyfin Live TV policies, or channel requests.
---

# IPTV & Live TV Hub Expert Guide

Portalarr integrates a unified Live TV & IPTV subsystem that bridges upstream IPTV providers (M3U / Xtream Codes), Dispatcharr lineup management, Plex Media Server Live TV & DVR tuners, and Jellyfin Live TV policies. It features real-time stream telemetry, DVR recording headroom protection, localized media market carousels, and 1-click Plex Home privilege provisioning.

Primary Reference Repositories & Modules:
- IPTV Core Engine: [`src/lib/iptv/plex-jellyfin-livetv.ts`](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/lib/iptv/plex-jellyfin-livetv.ts)
- IPTV Settings & Types: [`src/lib/iptv/types.ts`](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/lib/iptv/types.ts)
- IPTV Server Actions: [`src/app/iptv-actions.ts`](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/iptv-actions.ts)
- Admin IPTV Client UI: [`src/components/iptv/admin-iptv-client.tsx`](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/components/iptv/admin-iptv-client.tsx)
- User Live Channels UI: [`src/app/channels/page.tsx`](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/channels/page.tsx)
- Origin Logo Proxy: [`src/app/api/iptv/logo/[id]/route.ts`](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/api/iptv/logo/[id]/route.ts)

---

## Architecture & Subsystem Layout

```text
src/
├── app/
│   ├── admin/iptv/page.tsx           # Mission control: Providers, Dispatcharr, DVR, Telemetry, Users
│   ├── channels/page.tsx             # User-facing Live TV catalog with local market & sports shelves
│   ├── iptv-actions.ts               # Server actions for providers, lineups, DVR, users, and audit
│   └── api/iptv/
│       ├── logo/[id]/route.ts        # Origin HTTPS logo caching proxy (7-day cache)
│       ├── m3u/route.ts              # Virtual M3U playlist generator
│       └── epg/route.ts              # XMLTV electronic program guide feed
├── components/iptv/
│   ├── admin-iptv-client.tsx         # Admin command center (5 tabs with glassmorphic cards)
│   ├── channels-client.tsx           # Client catalog with filter chips, search, and market switcher
│   └── channel-card.tsx              # Resilient card with logo fallback to Lucide genre icons
└── lib/iptv/
    ├── types.ts                      # Interfaces for providers, lineups, DVR, audit, and sessions
    └── plex-jellyfin-livetv.ts       # Plex Home & DVR auditor, Jellyfin policy manager, session history
```

---

## Core Capabilities & Runbooks

### 1. Dispatcharr Integration & Authentication
- **API Authentication**: Dispatcharr requires `X-API-Key: {apiKey}` in HTTP request headers. Never pass API keys in query parameters or request bodies.
- **Lineup Sync & Profiles**: Queries Dispatcharr `/api/v1/lineups` and `/api/v1/channels`. Supports filtering by user-assigned profiles.
- **Auto-Sync & Admin Manual Trigger**: Lineup sync runs automatically via `syncDispatcharrLineupAction` and provides an instant manual sync button on both admin and catalog views.

### 2. DVR Stream Buffer Reservation (`dvrBufferReservation`)
- **Tuner Headroom Protection**: Homelab IPTV providers typically have hard limits on concurrent connections (e.g. 2–5 streams). If family members watch live streams simultaneously, scheduled Plex DVR recordings fail with "No tuner available".
- **Reservation Buffer**: Configurable via `Settings.dvrBufferReservation` (default: 1 stream).
- **Zero-Buffer Mode**: Homelab administrators who do not use Plex DVR recording can dial reservation down to `0` to allocate 100% of tuner connections to active client viewers.

### 3. Origin Channel Logo Proxy (`/api/iptv/logo/[id]`)
- **Mixed Content & LAN Block Prevention**: Dispatcharr often serves channel logos over unencrypted `http://` or private LAN IPs (`192.168.x.x`). Remote HTTPS clients block these requests.
- **HTTPS Reverse Proxy**: Logo URLs are proxied through `/api/iptv/logo/[id]`, returning high-speed image bytes with 7-day browser caching:
  `Cache-Control: public, max-age=604800, stale-while-revalidate=86400`.
- **Fail-Safe Semantic Fallback**: `ChannelCard` handles `onError` events and renders Lucide genre icons (`Trophy` for Sports, `Newspaper` for News, `Tv` for Networks, `Film` for Cinema, `Baby` for Kids) to ensure cards never display broken image icons.

### 4. Dynamic Media Market Customization Shelves
- **Anchor Market Feeds**: Always anchors the primary server market (e.g. Dallas CBS/NBC/FOX/ABC/CW).
- **Client Market Switcher**: Allows members to switch to their local broadcast media market (New York, Los Angeles, Chicago, etc.) or auto-detect based on IP geolocation.
- **Specialty Showcase Shelves**: Dedicated carousels for College Football (NCAA), NFL GameDay, Major League Baseball, and 24/7 National News.

### 5. Plex Home Live TV & DVR 3-Tier Permission Model
Plex Media Server enforces three distinct radio restriction states under **Restrictions > Live TV & DVR Access**:

| Plex Web Restriction | Plex API Flags | Portalarr Badge | Action Buttons |
| :--- | :--- | :--- | :--- |
| **`No Live TV and DVR access`** | `allowTuners: 0`<br/>`allowDvr: 0` | `⚠️ Missing Live TV & DVR` (Rose) | `[Enable Live TV]` \| `[Enable DVR]` |
| **`Allow Live TV only`** | `allowTuners: 1`<br/>`allowDvr: 0` | `Live TV Only` (Sky Blue) | `[Live TV: ON]` \| `[Enable DVR]` |
| **`Allow Live TV and DVR access`** | `allowTuners: 1`<br/>`allowDvr: 1` | `Live TV + DVR` (Emerald) | `[Live TV: ON]` \| `[DVR: ON]` |

- **Hierarchical 1-Click Transitions**:
  - *Clicking `[Enable Live TV]`*: Sets `allowTuners=1` and `allowChannels=1`, promoting user to **"Allow Live TV only"**.
  - *Clicking `[Enable DVR]`*: Automatically sets `allowDvr=1`, `allowTuners=1`, and `allowChannels=1`, promoting user to **"Allow Live TV and DVR access"** (since Plex requires tuner access to manage recordings).
  - *Clicking `[DVR: ON]`*: Revokes only DVR (`allowDvr=0`), gracefully dropping the user down to **"Allow Live TV only"**.
  - *Clicking `[Live TV: ON]`*: Revokes both Live TV and DVR (`allowTuners=0`, `allowDvr=0`), dropping the user to **"No Live TV and DVR access"**.

### 6. Plex Home & 3-Tier Live TV / DVR Restrictions Architecture
- **Plex 3-Tier Restriction Standard**:
  - **Tier 1: No Live TV and DVR access** (`allowTuners="0"`, `allowDvr="0"`): Both Live TV and DVR are completely disabled for the friend/member. In Portalarr UI, displays clean `No Live TV / DVR` badge and `Enable Live TV` / `Enable DVR` buttons.
  - **Tier 2: Allow Live TV only** (`allowTuners="1"`, `allowDvr="0"`): User can stream live broadcasts from virtual tuners, but cannot record or schedule DVR passes. In Portalarr UI, displays sky `Live TV Only` badge and `Live TV: ON` button.
  - **Tier 3: Allow Live TV and DVR access** (`allowTuners="1"`, `allowDvr="1"`): User can stream live TV and schedule individual DVR recordings. In Portalarr UI, displays emerald `Live TV + DVR` badge and `DVR: ON` button.
- **`allowChannels` vs `allowTuners` Separation**:
  - `allowChannels` in Plex Media Server XML/REST API refers strictly to legacy online channels/plugins (e.g. TED, Vimeo, YouTube plugins) and is enabled by default on shared servers. It MUST NEVER be used to infer or grant Live TV access.
  - Live TV privilege is strictly governed by `allowTuners`.
- **`allowTuners` vs `allowDvr` Independence**:
  - `allowTuners="1"` does NOT imply `allowDvr="1"`. A user can have Live TV without DVR access ("Allow Live TV only").
  - Enabling DVR requires both `allowTuners="1"` and `allowDvr="1"`.
  - Revoking DVR (`allowDvr="0"`) leaves `allowTuners="1"` intact.
  - Revoking Live TV (`allowTuners="0"`) automatically sets `allowDvr="0"`.
- **Live Plex API Authoritative Precedence Over SQLite**:
  - When Plex is reachable (`plexReachable === true`), the live values from `https://plex.tv/api/users` and `https://plex.tv/api/v2/home/users` (`item.allowTuners`, `item.allowDvr`, `item.isPlexHomeMember`) are authoritative. Never OR cached SQLite values (`matchedPortalUser?.hasPlexLiveTvAccess`) into live state when Plex is reachable, or user privilege revocations made in Plex Web will be ignored and perpetually re-written to SQLite.
- **Hard Limit**: Plex caps Plex Home at 15 total users (1 owner + 14 member slots). Regular Plex friends cannot tune Live TV channels unless admitted to Plex Home.
- **Inactivity Audit**: Evaluates `lastIptvWatchedAt` and `plexHomeJoinedAt` against `plexHomeInactivityDays` (default: 21 days).
- **Non-Destructive Candidate Flagging**: Inactive members are surfaced with visual warning borders (`border-amber-500/30 bg-amber-500/5`) and labeled `• Slot Rotation Candidate (Protected)`. Auto-kick is strictly `false` by default, preserving administrator control.

### 7. Jellyfin Live TV Policy Management
- **Policy Synchronization**: Audits and provisions `EnableLiveTvAccess` in Jellyfin via `POST /Users/{id}/Policy`.
- **Folder Preservation Contract**: Always fetches existing user policies first and merges changes:
  `{ ...currentPolicy, EnableLiveTvAccess: enable, EnableLiveTvManagement: false }`.
  Never sends an unmerged policy payload, which would inadvertently reset `EnabledFolders` and revoke media library access.

### 8. Live Stream Session Telemetry & Watch History Integration
- **Tautulli & PMS Session Scans**: Scans active streams and session history via `/status/sessions/history/all` and Tautulli `get_history`.
- **Heuristic Live Stream Detection**: Detects live broadcasts using media type (`live`, `channel`, `clip`, `iptv`), channel identifiers, and title patterns (`/world series|mlb|baseball|nfl|ncaa|football|fox|cbs|nbc|abc|espn/i`).
- **Activity Persistence**: Updates `lastIptvWatchedAt` on the User record to track genuine live TV engagement for slot rotation calculations.

---

## 🚨 Mandatory Task Completion Protocol (Strict SemVer)

Before completing any task or pushing to git:
0. **Step 0: Read Skill Upfront**: Call `read_file` on the relevant `SKILL.md` before writing code.
1. **Step 1: Integration Testing**: Execute `cmd /c "npm test"` (all 23 suites must pass, 0 failures).
2. **Step 2: Production Build**: Execute `cmd /c "npm run build"` (Turbopack 100% clean, 0 errors).
3. **Step 3: Edge Security & Cloudflare Policy Audit**: Register any route changes in `src/lib/edge-policy-paths.ts`.
4. **Step 4: Skills & Documentation Sync**: Update relevant `.agents/skills/` documents with new findings **BEFORE** committing.
5. **Step 5: SemVer Bump & Push**: Bump version in `package.json`, stage all changes, commit with `[v<version>]`, push strictly to `origin/main` (Beta).

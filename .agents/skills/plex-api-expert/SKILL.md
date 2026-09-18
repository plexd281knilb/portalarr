---
name: plex-api-expert
description: Expert architectural and API specification guide for Plex Media Server (PMS REST API, token authentication, library sections, metadata schemas, tag/label manipulation, custom collection hubs, photo transcoding, and stream session diagnostics). Activate when integrating with Plex, calling Plex endpoints, diagnosing playback sessions, managing collections and labels, or referencing openapi.json.
---

# Plex Media Server (PMS) API Expert Guide

Plex Media Server (PMS) provides an extensive HTTP REST API for media cataloging, metadata extraction, user management, library scanning, stream transcoding, home screen hub recommendations, and playback session telemetry.

Primary Reference Files & OpenAPI:
- OpenAPI 3.1 Specification: [openapi.json](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/openapi.json)
- Portalarr Plex Engine: [src/app/actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/actions.ts)
- Portalarr Curation Actions: [src/app/curation-actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/curation-actions.ts)

---

## API Architecture & Key Concepts

- **Authentication**: Token-based via `X-Plex-Token` HTTP header or `?X-Plex-Token=` query parameter.
- **Client Identification**: Mandatory `X-Plex-Client-Identifier` and `X-Plex-Product` headers.
- **Data Formats**: PMS defaults to XML; clients should explicitly supply `Accept: application/json` for JSON payloads.
- **Relative Path Resolution**: PMS API responses return relative `key` attributes that resolve against `/library/sections/` or root endpoints.
- **Multi-Server Candidate URLs Resolution**: To maintain 100% reliable connectivity across LAN, remote direct, and Plex Relay, clients should resolve all candidate URLs via `https://plex.tv/api/v2/resources` and test reachability with fastest-path failover.
- **Type Identifiers**:
  - `1`: `movie`
  - `2`: `show`
  - `3`: `season`
  - `4`: `episode`
  - `8`: `artist`
  - `9`: `album`
  - `10`: `track`
  - `15`: `playlist`
  - `18`: `collection`

---

## Core Capabilities & Runbooks

### 1. Server Endpoints & Telemetry
- **Identity & Capabilities**: `GET /identity`, `GET /myplex/account`.
- **Sections & Items**: `GET /library/sections`, `GET /library/sections/{id}/all`.
- **Stream Telemetry**: `GET /status/sessions`, `DELETE /status/sessions/{id}?reason=...`.
- **Image Transcoder**: `GET /photo/:/transcode?width=600&height=900&url=...`.

See detailed runbook: [pms-endpoints-reference.md](./references/pms-endpoints-reference.md).

### 2. Tags, Collections & Home Screen Hubs
- **Tag / Label Updates**: `PUT /library/metadata/{ratingKey}?label[0].tag.tag=...`.
- **Clear Labels**: `PUT /library/metadata/{ratingKey}?label[0].tag.tag-=`.
- **Collections**: `POST /library/collections`, batch add via `POST /library/collections/{id}/items?uri=server://...`.
- **Smart Collections**: `POST /library/collections?type={type}&title={title}&smart=1&uri={filterUri}`.
- **Personalized Recommendations**: `PUT /library/metadata/{ratingKey}/prefs?collectionFilterBasedOnUser=1`.
- **Hub Visibility**: Initialize via `POST /hubs/sections/{id}/manage?metadataItemId={id}`, then toggle `promotedToOwnHome`, `promotedToSharedHome`, `promotedToRecommended`.

See detailed runbook: [tags-collections-and-hubs.md](./references/tags-collections-and-hubs.md).

---

## Common Gotchas & Best Practices

1. **Tag Clearing Syntax**:
   - Omitting `label[0].tag.tag-=` when clearing all labels will leave existing tags intact in PMS. Always send `label[0].tag.tag-=` when emptying tag arrays.
2. **Locking Custom Metadata**:
   - Any manual edit made via `PUT /library/metadata/{ratingKey}` should include `<fieldName>.locked=1` (e.g. `title.locked=1`, `titleSort.locked=1`). Otherwise, the next automated library metadata refresh will overwrite the modification with agent data.
3. **Smart vs Static Collections**:
   - Never call `/move` or item manipulation endpoints on a collection created with `smart=1`. Smart collections are dynamically populated by Plex search filters.
4. **Portrait Poster Dimensions**:
   - Always request 2:3 vertical poster proportions (`width=600&height=900`) on `/photo/:/transcode` to prevent PMS from cropping portrait artwork to landscape dimensions.
5. **Session Stream Termination Fallback**:
   - When terminating active playback streams, verify user alias permissions and fall back from Tautulli to Direct PMS `DELETE /status/sessions/{sessionId}` if Tautulli is unavailable.

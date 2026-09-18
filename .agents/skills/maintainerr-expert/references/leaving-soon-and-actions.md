# Maintainerr "Leaving Soon" Staging, Banners & Actions Reference

This document details the lifecycle of staged media items, countdown banner overlays, and prune actions across Plex, Radarr, Sonarr, and download clients.

Reference source files:
- [apps/server/src/modules/collections/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Maintainerr-development/Maintainerr-development/apps/server/src/modules/collections)
- [apps/server/src/modules/actions/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Maintainerr-development/Maintainerr-development/apps/server/src/modules/actions)
- [src/app/curation-actions.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/curation-actions.ts)

---

## 1. "Leaving Soon" Staging Workflow

1. **Rule Evaluation**: Candidates are identified based on inactivity, watch status, age, or disk thresholds.
2. **Staging**:
   - Items are tagged with Plex label `leaving-soon`.
   - Items are added to a dedicated Plex collection: `⚠️ Leaving Soon`.
   - The collection is promoted to the Plex Home screen to alert household members and friends.
3. **Grace Period**:
   - A configurable timer (e.g. 7 days, 14 days, 30 days) begins counting down.
   - If a user watches the media item during this grace period, the rule resets and the item is un-staged.

---

## 2. Dynamic Countdown Banner Overlays

To visually alert users browsing library posters:
- Maintainerr and Portalarr render dynamic countdown banners at the bottom or top of candidate posters:
  - `LEAVING IN 7 DAYS`
  - `EXPIRING OCT 15`
  - `LOW DISK SPACE CLEANUP`
- Banners are composited using `sharp` / SVG and uploaded to PMS via `POST /library/metadata/{ratingKey}/posters`.

---

## 3. Prune Actions & Safe Disk Deletion

When the grace period expires without activity:
1. **Radarr Prune**:
   - Calls `DELETE /api/v3/movie/{id}?deleteFiles=true&addImportExclusion=false`.
2. **Sonarr Prune**:
   - Calls `DELETE /api/v3/series/{id}?deleteFiles=true&addImportExclusion=false` or deletes specific season/episode files.
3. **Download Client Purge**:
   - Instructs qBittorrent, SABnzbd, or Transmission to delete associated torrents and NZBs to prevent re-downloads.
4. **Filesystem Cleanup**:
   - Removes empty parent folders (`purgeEmptyDirectories`).
   - Cleans up associated `.nfo`, `.srt`, and subtitle files.

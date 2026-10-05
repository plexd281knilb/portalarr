# Filtered Smart Hubs & Hub Dismissal Blacklist Reference

This document explains the technical implementation of **Filtered Smart Hubs** (which exclude placeholder trailers from default Plex rows) and the **Permanent Hub & Collection Dismiss / Blacklist System** (which prevents deleted auto-generated hubs from resurfacing).

---

## 1. Filtered Smart Hubs Architecture

### The Problem
When unreleased media trailers (`edition-Trailer`, `s00e00`, `.disc`, `.strm`) are imported into Plex to populate "Coming Soon" hubs, default Plex rows (such as "Recently Added Movies" or "Recently Released TV") immediately display those trailer stubs, confusing users who expect playable full movies/episodes.

### The Solution: Dynamic Plex Smart Collections
By deploying Plex Smart Collections that explicitly filter out placeholder criteria, we replace or augment default Plex hubs with clean, trailer-free hubs.

### Filter Queries by Subtype & Default Titles

1. **Recently Added Movies (`recently_added` - Movies)**:
   - Default Title: `Recently Added Movies (Curated)`
   - Filter URI: `?type=1&label!=trailer-placeholder&editionTitle!=Trailer&sort=addedAt:desc`
   - Excludes items with Plex label `trailer-placeholder` or edition `Trailer`.

2. **Recently Added TV (`recently_added` - TV Shows)**:
   - Default Title: `Recently Added TV (Curated)`
   - Filter URI: `?type=2&label!=trailer-placeholder&episode.title!=Trailer (Placeholder)&sort=addedAt:desc`
   - Excludes shows whose episodes are marked with `Trailer (Placeholder)`.

3. **Recently Released Movies (`recently_released` - Movies)**:
   - Default Title: `Recently Released Movies (Curated)`
   - Filter URI: `?type=1&label!=trailer-placeholder&editionTitle!=Trailer&sort=originallyAvailableAt:desc`
   - Orders by premiere/theatrical release date while excluding placeholder trailers.

4. **Recently Released TV / Episodes (`recently_released` / `recently_released_episodes` - TV)**:
   - Default Title: `Recently Released Episodes (Curated)` (or `Recently Released TV (Curated)`)
   - Filter URI: `?type=2&label!=trailer-placeholder&episode.title!=Trailer (Placeholder)&sort=originallyAvailableAt:desc`

5. **Top Unwatched (Personalized per User) (`top_unwatched`)**:
   - Default Title: `Top Unwatched Movies (Curated)` (Movies) / `Top Unwatched TV (Curated)` (TV)
   - Filter URI: `?type=1&unwatched=1&sort=rating:desc` (Movies) or `?type=2&unwatched=1&sort=rating:desc` (TV)
   - User Personalization API:
     ```http
     PUT /library/metadata/{ratingKey}/prefs?collectionFilterBasedOnUser=1
     ```
     This instructs PMS to evaluate the `unwatched=1` filter per individual logged-in user rather than globally across the server owner.

---

## 2. Permanent Hub & Collection Dismiss / Blacklist Engine

### The Problem
When an administrator deletes an auto-generated Plex hub (such as *"Top Movies by Vicky Jenson"*, *"Action Movies from the 90s"*, or an old smart collection) from their dashboard, subsequent actions like clicking **"Import from Plex"** or running background library syncs detect the collection on PMS and blindly re-import it into the database.

### The Solution: Persistent Dismissal Blacklist
1. **Schema Registry**:
   - `Settings.dismissedHubs`: Stores a JSON array of dismissed hub records:
     ```typescript
     interface DismissedHubEntry {
         ratingKey: string;
         title: string;
         normalizedTitle: string;
         serverId?: string;
         sectionKey?: string;
         dismissedAt: string;
     }
     ```
   - `MediaCollection.isIgnored`: Boolean flag marking database records as ignored.

2. **Deletion Workflow (`deleteMediaCollectionAction`)**:
   - When a collection or hub is deleted in the UI:
     - Register the hub's `ratingKey`, `title`, and normalized lowercase title into `Settings.dismissedHubs`.
     - Update the database record with `isIgnored: true`.
     - If the user selects "Delete from Plex", PMS collection endpoint is also invoked (`DELETE /library/collections/{ratingKey}`).

3. **Plex Import Guard (`importPlexLibraryCollectionsAction`)**:
   - Before importing collections from PMS:
     - Fetch the current `dismissedHubs` set.
     - For each PMS collection:
       - If `dismissedSet.has(c.ratingKey)` or `dismissedSet.has(c.title.toLowerCase().trim())`, **skip it unconditionally**.
     - Only valid, non-dismissed collections are imported into the active database.

4. **Ignored Hubs Management**:
   - Admins can open the **"Ignored Hubs"** modal in Agregarr Studio.
   - Any hub can be restored via `unignoreMediaCollectionAction(ratingKeyOrTitle, serverId, sectionKey)`, removing it from the blacklist and resetting `isIgnored: false`.

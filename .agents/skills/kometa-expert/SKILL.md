---
name: kometa-expert
description: Expert architectural and configuration guide for Kometa (formerly Plex Meta Manager) and Portalarr Poster Studio. Activate when creating, debugging, or optimizing media metadata, automated image overlays (4K HDR badges, Dolby Vision/Atmos ribbons, rating badges, audio/video specs), collection builders, playlist rules, schedule settings, or Kometa YAML configurations.
---

# Kometa & Poster Studio Expert Guide

Kometa (formerly Plex Meta Manager) and Portalarr's Native Poster Studio automate Plex media metadata management and artwork enhancement. They build dynamic collections and smart playlists, apply graphical poster and backdrop overlays (resolution, HDR, audio codec, streaming source, network, IMDb/TMDb/Rotten Tomatoes ratings, awards ribbons), and standardize media library styling.

Primary Reference Repositories & Modules:
- Directory: [Kometa-master](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Kometa-master/Kometa-master)
- Entry Point: [kometa.py](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Kometa-master/Kometa-master/kometa.py)
- Modules: [modules/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Kometa-master/Kometa-master/modules)
- Default Overlays & Templates: [defaults/](file:///C:/Users/Dom/Documents/GitHub/Other_Repos/Kometa-master/Kometa-master/defaults)
- Portalarr Poster Engine: [src/app/api/curation/badges/route.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/api/curation/badges/route.ts)
- Portalarr Media Image API: [src/app/api/media/image/route.ts](file:///C:/Users/Dom/Documents/GitHub/portalarr/src/app/api/media/image/route.ts)

---

## Architecture & Module Directory

```text
Kometa-master/modules/
├── builder.py       # Core collection, playlist, and smart builder resolver
├── overlay.py       # Overlay coordinate math, variables, special text, dimensions
├── overlays.py      # Image loading, PIL composite pipeline, original asset preservation
├── meta.py          # Metadata mass updating (titles, locked fields, genres, labels)
├── plex.py          # Plex Media Server client, collections, hub visibility, poster uploads
├── operations.py    # Library sweeps, genre mapping, label purging, asset directory linking
└── config.py        # YAML configuration loader and environmental parameter parser
```

---

## Core Capabilities & Runbooks

### 1. Dynamic Poster & Backdrop Overlays
Kometa and Portalarr generate 1000x1500 (2:3 portrait) or 1920x1080 (16:9 landscape) layered artwork:
- **Ribbon & Awards**: Oscars, Golden Globes, Emmy award badges.
- **Resolution & Media Flags**: 4K UHD, HDR, HDR10+, Dolby Vision, IMAX Enhanced, audio codec (TrueHD, Atmos, DTS-HD).
- **Ratings & Dynamic Badges**: Real-time IMDb, Rotten Tomatoes (Certified Fresh / Popcorn), TMDb ratings.
- **Suppression & Queues**: Weights and group rules prevent overlapping badges.
- **Multi-Position Rendering**: Supports `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center-top`, `center-bottom`.

See detailed runbook: [overlay-engine.md](./references/overlay-engine.md).

### 2. Collection & Smart Playlist Builders
Builds collections from over 20+ list providers:
- **TMDb, IMDb, Trakt, Letterboxd, MDBList**: Auto-populated based on trends, awards, actors, directors, or user lists.
- **Filtering Pipeline**: Exclude or include by genre, year, rating, country, audio codec, and release dates.
- **Sync Modes**: `sync` (strict parity, removing unlisted items) vs `append` (keep manual additions).

See detailed runbook: [collection-builders.md](./references/collection-builders.md).

---

## Common Gotchas & Troubleshooting

1. **Poster Aspect Ratio & Transcoder Cropping**:
   - Cause: Requesting landscape dimensions (e.g. `600x400`) from Plex `/photo/:/transcode` forces PMS to center-crop portrait posters.
   - Solution: Always request standard 2:3 vertical poster proportions (`width=600&height=900&minSize=1`).
2. **Overlay Degradation / Quality Loss**:
   - Cause: Re-applying overlays on top of already overlaid posters causes blur and artifacting.
   - Solution: Always preserve clean original source posters in an asset cache or pristine storage before compositing overlays.
3. **Plex Client Caching Glitches**:
   - Cause: Plex Web and mobile clients aggressively cache posters in local cache storage.
   - Fix: Force a cache busting parameter or update PMS `thumb` timestamp upon uploading new artwork.
4. **Weight & Group Collision**:
   - Cause: Multiple overlays render on the same corner without a common `group` or `queue`.
   - Rule: Overlays that share screen coordinates must define a `group` with distinctive `weight` values.

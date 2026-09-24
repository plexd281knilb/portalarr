# Card & Poster Design Patterns in Portalarr

Posters and cards are the primary visual building blocks across Portalarr (Discover, Library, Agregarr, Kometa, Requests, and Radarr/Sonarr views).

---

## 1. Strict 2:3 Vertical Poster Aspect Ratio

- Always enforce standard 2:3 vertical poster proportions:
  ```tsx
  <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-md transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:border-slate-700">
    <img
      src={posterUrl}
      alt={title}
      className="w-full h-full object-cover"
      loading="lazy"
    />
  </div>
  ```
- **Never** use arbitrary aspect ratios (like 4:3 or landscape 16:9) for movie, TV, book, or comic posters.
- When generating or fetching Plex transcode images via `/api/media/image`, always pass `width=600&height=900`.

---

## 2. Corner Badges & Ribbon Overlays

- **Top-Right Corner**: Format & Type Badges (e.g. `🎬 MOVIE`, `📺 TV`, `📖 EBOOK`, `🎧 AUDIOBOOK`, `4K UHD`, `1080p`).
  ```tsx
  <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md bg-slate-950/80 text-cyan-300 border border-cyan-500/30">
    4K UHD
  </div>
  ```
- **Top-Left Corner**: Availability Status (`✓ Available`, `⏳ Downloading`, `⌛ Pending`, `🔥 Coming Soon`).
- **Bottom Ribbon**: Dynamic Overlay ribbons (e.g. `LEAVING IN 3 DAYS`, `STREAMING ON {date}`, `4K HDR • ATMOS`).

---

## 3. Title Typography & Line Clamping

- Multi-word non-fiction book titles and long movie titles can break layout grids if heights vary.
- **Rule**: Standardize card text container heights and clamp titles:
  ```tsx
  <div className="pt-2 px-1">
    <h3 className="font-semibold text-xs sm:text-sm text-slate-100 line-clamp-2 sm:line-clamp-3 h-[36px] sm:h-[48px] leading-tight group-hover:text-amber-400 transition-colors">
      {title}
    </h3>
    <p className="text-[11px] text-slate-400 truncate mt-0.5">
      {subtitleOrAuthor}
    </p>
  </div>
  ```

---

## 4. Missing Stubs & Grayscale Immunity Cards

- When displaying unacquired installments in a series or placeholder stubs:
  ```tsx
  <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-slate-950 border-2 border-dashed border-slate-700/70 grayscale opacity-60 hover:opacity-90 transition-opacity">
    <img src={coverUrl} className="w-full h-full object-cover" />
    <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center p-2 text-center">
      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/50 bg-amber-950/40">
        Missing Stub
      </Badge>
    </div>
  </div>
  ```

---

## 5. Responsive Grid Breakpoints

Standard grid layout for media shelves and discovery pages:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-3 sm:gap-4 lg:gap-5">
  {items.map(item => <MediaCard key={item.id} item={item} />)}
</div>
```

---
name: portalarr-ui
description: Comprehensive UI/UX design, component styling, layout architecture, and responsiveness guide for Portalarr. Activate when building, modifying, or refining frontend components, modals, dialogs, media cards, forms, settings panels, navigation, or dark theme styling.
---

# Portalarr UI Design & Component System Guide

This skill serves as the single source of truth for all UI/UX design patterns, component conventions, responsiveness rules, and aesthetic standards across Portalarr. Use and update this guide whenever implementing new views, tweaking existing layouts, or refining user interaction flows.

---

## 🎨 Core Design Foundations

Portalarr uses a **Modern Cinematic Dark Theme** powered by Tailwind CSS, Radix UI primitives, Lucide React icons, and custom glassmorphic styling.

### 1. Color Palette & Hierarchy
- **Canvas / App Background**: `bg-slate-950` or `bg-black` with subtle gradients (`from-slate-950 via-slate-900 to-slate-950`).
- **Primary Cards & Containers**: `bg-slate-900/90` with `border border-slate-800 backdrop-blur-md`.
- **Secondary Nested Wells / Inner Boxes**: `bg-slate-950/60` or `bg-slate-900/40` with `border border-slate-800/80`.
- **Active / Unsaved Dirty State Warning**:
  - Border: `border-2 border-amber-500/70`
  - Glow: `shadow-[0_0_20px_rgba(245,158,11,0.2)]`
- **Semantic Accents**:
  - 🟢 **Emerald (`emerald-400` / `emerald-500`)**: Success, available in library, active streaming, auto-approved.
  - 🟡 **Amber (`amber-400` / `amber-500`)**: Pending review, warnings, unsaved dirty states, monitored coming soon.
  - 🟣 **Purple / Indigo (`purple-400` / `indigo-400`)**: Poster overlays, Kometa studio, AI metadata agents, automation schedules.
  - 🔵 **Cinematic Blue / Cyan (`sky-400` / `cyan-400`)**: Live stream telemetry, Plex direct play, speed test, digital releases.
  - 🔴 **Crimson / Rose (`rose-500` / `red-500`)**: Prune deletions, errors, stream terminations, declined requests.

---

## 📐 Key Layout & Component Rules

### 1. Modals & Dialogs (Space Optimization & Responsive Widths)
- **Radix Tailwind Merge Gotcha**: Base `DialogContent` contains `sm:max-w-lg`. Passing an unprefixed `max-w-6xl` gets overridden!
- **Rule**: Always pass explicit prefixed responsive classes for wide modals (Media Detail, Seerr requests, Episode Guide, Collection Builders):
  ```tsx
  className="sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1500px] w-[96vw] sm:w-[94vw] md:w-[92vw] lg:w-[90vw] xl:w-[86vw] 2xl:w-[82vw] max-h-[92vh] overflow-y-auto p-0 bg-slate-950 border border-slate-800 shadow-2xl rounded-2xl"
  ```
- **Zero Wasted Header Space**:
  - Use a compact hero backdrop layout with gradient fades (`bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent`).
  - Keep titles, badges (Year, Rating, Runtime, Status), and quick-action buttons aligned without massive empty top margins.
  - Place trailer playback triggers and primary action buttons (Request / Download) directly in the header action bar for instant 1-click access without vertical scrolling.

See detailed reference: [modal-and-dialog-patterns.md](./references/modal-and-dialog-patterns.md).

---

### 2. Media Cards & Posters (Strict 2:3 Proportions)
- **Strict Aspect Ratio**: Always enforce standard 2:3 vertical poster proportions (`aspect-[2/3]` or `h-[270px] w-[180px]`).
- **Plex Photo Transcode Dimensions**: In `/api/media/image` and PMS endpoints, pass `width=600&height=900` (never landscape `600x400` which crops portrait posters).
- **Extensive Non-Fiction Subtitles**:
  - In `BookCard`, `AudiobookCard`, and `MediaCard`, use `line-clamp-3 h-[60px] block` instead of `flex items-center` to avoid squishing long titles.
- **Grayscale Missing Stubs**:
  - Missing book or media stubs use `grayscale opacity-60 hover:opacity-90` with dashed amber/slate borders and `.portalarr-missing` immunity.

See detailed reference: [card-and-poster-patterns.md](./references/card-and-poster-patterns.md).

---

### 3. Forms, Autocomplete & Dirty State Management
- **Autocomplete Dropdowns**: Always use `onMouseDown` on dropdown suggestion items instead of `onClick` to prevent input `onBlur` from unmounting items before the click event fires.
- **Unsaved Settings Protection**:
  - Highlight dirty sections with amber glowing borders.
  - Render a fixed bottom floating save bar (`Save Settings *`) when changes are pending.
- **Sensitive Fields**:
  - Mask tokens and passwords by default (`type={showToken ? "text" : "password"}`).
  - Provide an inline toggle button with Lucide `<Eye />` / `<EyeOff />`.
- **Live Connection Diagnostics**:
  - Provide a dedicated `"Test"` button next to server/app URLs and API tokens with `<Loader2 className="animate-spin" />` feedback.

See detailed reference: [form-and-input-patterns.md](./references/form-and-input-patterns.md).

---

### 4. Responsive Media Grids
Use dynamic wrapping columns optimized across all screen breakpoints:
```tsx
className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-3 sm:gap-4 lg:gap-5"
```

---

### 5. Dense Grid Dropdowns, Slider Bounding & Title Formatting
- **Badge Toggles & Slider Controls**: Never nest horizontal `sm:grid-cols-2` inside an outer multi-column card. Stack Placement dropdowns (`h-7.5 w-32 shrink-0`) and Scale Size sliders vertically with `w-full min-w-0` on range inputs inside `max-w-[150px]` flex containers to prevent dropdowns from overlapping sliders and sliders from overflowing card boundaries.
- **Collection Card Titles**: In flex header wrappers, avoid hardcoded pixel max widths (like `max-w-[200px]`) with `truncate` on titles that cause clipping when multiple status badges (like `Placeholders: ON`, `Limit: 20`, `Seasonal`) are active. Allow titles to breathe naturally (`font-bold text-white text-xs sm:text-sm tracking-tight`) alongside wrapping badges.
- **Dense Discovery & Sandbox Grids (`min-w-0` & Select Truncation)**: In multi-column discovery toolbars (e.g. Maintainerr Oldest Files Discovery & Rule Sandbox), avoid forcing `lg:grid-cols-6` without intermediate breakpoints. Use `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3`, give every cell `min-w-0`, and add `w-full min-w-0 truncate [&>span]:truncate [&>span]:block` to `SelectTrigger` and `SelectValue` to prevent text-heavy options from expanding and overlapping neighboring dropdowns.
- **Radix UI `SelectTrigger` Width & Truncation Guard**: In `select.tsx` and all forms, `SelectTrigger` MUST enforce `w-full min-w-0` with `*:data-[slot=select-value]:truncate` so option labels never blow past column widths.
- **Studio Schedule & Automation Card Layouts**: When configuring multi-parameter studio schedules (e.g. Kometa Overlays, Agregarr, Maintainerr, Tagging) within side-by-side cards (`grid-cols-1 lg:grid-cols-2`), avoid placing 3 select controls in a single 3-column row (`sm:grid-cols-3`). Instead, give the **Schedule Frequency** dropdown full width on Row 1 to accommodate descriptive text, and place secondary sub-options (**Scope** and **Batch Size**) side-by-side in a 2-column subgrid (`grid grid-cols-1 sm:grid-cols-2 gap-2.5`) on Row 2. Ensure all grid cells and parent cards have `min-w-0`.

---

### 6. Multi-Resolution Responsive Layout System (Mobile, 720p, 1080p, 4K)

- **Mobile Phones (`< 640px`)**:
  - Container padding: `p-2.5 sm:p-4 md:p-6 lg:p-8 3xl:p-10`.
  - Poster grids: Standardize on `grid-cols-2 sm:grid-cols-3` so mobile displays show a clean 2-card grid without excessive vertical scrolling.
  - Action toolbars: Always wrap controls with `flex-wrap gap-2 w-full sm:w-auto`, allowing search inputs and filter selects to collapse gracefully to full width on mobile (`w-full sm:w-64`).
  - Dropdown & Select Truncation: Every select trigger must include `w-full min-w-0 truncate` to prevent long option text from breaking out of the viewport.
  - Slide-out Mobile Sidebar: Ensure drawer body has `flex-1 overflow-y-auto min-h-0` with touch-friendly tap targets (`min-h-[38px]`).
- **720p Displays (`1280 x 720` / Compact Height Viewports)**:
  - **Vertical Height Defense**: Total browser viewport height is often under 650px. Dialogs and modals must strictly constrain height with `max-h-[85vh]` or `max-h-[88vh]` and place `overflow-y-auto` on the inner body container.
  - Sidebars: Both desktop and mobile sidebars must use `h-full min-h-0` with `flex-1 overflow-y-auto` so the footer logout button and bottom items remain accessible.
  - Dense grids: Use intermediate breakpoints (`md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`) so items do not crowd before reaching 1080p.
- **1080p Displays (`1920 x 1080` Full HD)**:
  - Standard desktop baseline: 5 to 6 poster cards (`xl:grid-cols-5 2xl:grid-cols-6`), 2 to 3 widget cards (`lg:grid-cols-2 xl:grid-cols-3`), balanced typography and generous breathing room.
- **4K UHD & Ultrawide (`2560px` to `3840px`)**:
  - **No Stretched Monoliths**: Wrap outer content in `max-w-[2560px] mx-auto w-full min-w-0` to prevent single form inputs or text lines from spanning 3800px.
  - **Scalable Grids**: Scale grids beyond `2xl` with native Tailwind v4 `3xl:` and `4xl:` breakpoints (`3xl:grid-cols-7 4xl:grid-cols-8` or `3xl:grid-cols-8 4xl:grid-cols-10` for posters; `3xl:grid-cols-3 4xl:grid-cols-4` for dashboard cards) so cards maintain optimal 2:3 proportions and avoid giant 500px wide cards.
  - Detail Modals: Expand wide modal caps to `2xl:max-w-7xl 3xl:max-w-[1800px]` on 4K so rich media detail views utilize the expansive screen real estate.

---

## 🛠️ How to Update and Tweak This Skill

As the Portalarr frontend evolves or new design decisions are finalized:
1. **Adding a New UI Rule**: Add the rule to the relevant section above or under `references/`.
2. **Tweaking Component Defaults**: Update the corresponding reference file in `references/`.
3. **Documenting New Pages or Studios**: Create a new reference file in `references/` and link it here.

Detailed guide on updating: [updating-this-skill.md](./references/updating-this-skill.md).

---

## 📚 Reference Documents

- [Modal & Dialog Patterns](./references/modal-and-dialog-patterns.md)
- [Card & Poster Patterns](./references/card-and-poster-patterns.md)
- [Form & Input Patterns](./references/form-and-input-patterns.md)
- [Theme & Color Tokens](./references/theme-and-color-tokens.md)
- [Updating This Skill](./references/updating-this-skill.md)

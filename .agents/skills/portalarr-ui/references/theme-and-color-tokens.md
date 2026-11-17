# Theme & Color Tokens Reference in Portalarr

Portalarr adheres to an ultra-dark cinematic aesthetic designed for high contrast and seamless viewing on OLED displays and dark room setups.

---

## 1. Backgrounds & Surfaces

| Token / Class | Usage |
| :--- | :--- |
| `bg-slate-950` / `bg-black` | Main page body, dialog backgrounds, dropdown menu background |
| `bg-slate-900/90` | Primary cards, sidebars, modal headers, floating navigation bars |
| `bg-slate-950/60` | Secondary nested inner boxes, code blocks, parameter sections |
| `bg-slate-900/40` | Tertiary wells, table row hover states, disabled button backgrounds |
| `backdrop-blur-md` | Glassmorphic overlay containers, sticky headers, bottom floating bars |

---

## 2. Borders & Dividers

| Token / Class | Usage |
| :--- | :--- |
| `border-slate-800` | Standard card borders, dialog borders, divider lines |
| `border-slate-700/60` | Interactive input borders, hoverable poster card borders |
| `border-slate-800/80` | Inner well borders, sub-card section dividers |
| `border-amber-500/70` | Unsaved dirty state warning border |
| `border-emerald-500/40` | Active enabled service badge, success state outline |

---

## 3. Semantic Accents, Primary Brand & Design Tokens

| Accent / Token | Primary Class / Value | Semantic Meaning |
| :--- | :--- | :--- |
| **Plex Amber (Primary)** | `--primary: oklch(0.769 0.188 70.08)` / `text-amber-400 bg-amber-500/15 border-amber-500/35` | Primary brand accent, pending approvals, warnings, unsaved states, Coming Soon Monitored |
| **Emerald / Green** | `text-emerald-400 bg-emerald-950/40 border-emerald-500/30` | In Library, Available, Ebooks, Downloaded, Approved, Direct Play |
| **Cyan / Sky** | `text-sky-400 bg-sky-950/40 border-sky-500/30` | 4K UHD badges, stream telemetry, Live TV, speed test, Kometa overlays |
| **Crimson / Rose** | `text-rose-400 bg-rose-950/40 border-rose-500/30` | Prune deletions, Leaving Soon, stream termination, rejected |

> **Ban on Decorative Purple Slop**: Never use decorative `from-purple-*`, `via-purple-*`, `to-purple-*`, `from-indigo-*`, `to-indigo-*`, or `from-violet-*` gradients in UI components or routes (enforced by `Suite 25`).

## 4. Typography & Unified Concentric Radius (`--radius: 0.5rem`)

| Token / Level | Classes / Value | Usage |
| :--- | :--- | :--- |
| **Sans Body / UI** | `Inter` (`--font-inter` ➔ `--font-sans`) | App-wide headings, controls, cards, navigation |
| **Monospace Telemetry** | `JetBrains_Mono` (`--font-jetbrains-mono` ➔ `--font-mono`) | IDs, tokens, paths, bitrates, hashes, timestamps |
| **Modal / Hero Outer** | `rounded-xl` | Dialogs, hero cards, nav banners |
| **Cards / Alerts** | `rounded-lg` | Standard cards, `<EmptyState />`, panels |
| **Controls / Inputs** | `rounded-md` | Buttons, inputs, selects, compact chips |
| **Tags / Checkboxes** | `rounded-sm` / `rounded-full` | Checkboxes (`rounded-sm`), status dots & pill badges (`rounded-full`) |
| **Page Title** | `text-2xl sm:text-3xl font-extrabold text-white tracking-tight` | Main page headers (`/library`, `/settings`) |
| **Card Title** | `text-base sm:text-lg font-bold text-white` | Section card headers |
| **Body Primary** | `text-xs sm:text-sm text-slate-200 leading-relaxed` | Descriptions, labels, table rows |
| **Body Secondary** | `text-[11px] sm:text-xs text-slate-400` | Subtitles, help captions, timestamps |

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
  - 🔴 **Crimson / Rose (`rose-400` / `rose-500`)**: Media Requests (Seerr/Overseerr engine), prune deletions, errors, stream terminations, declined requests.
  - 🟠 **Vibrant Orange (`orange-400` / `orange-500`)**: General setup, alert banners, server configuration.

### 2. Multi-Tab Navigation & Active State Contrast
- **Semantic Tab Accents**: Tabs in settings or dashboards must never rely on monochrome/desaturated `text-primary` in dark mode. Every tab must specify its distinct brand color token for its icon, hover ring/shadow, and active selection state:
  - **General & Setup**: `text-orange-400`, `hover:ring-orange-400/80`, `data-[state=active]:text-orange-400 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/40`
  - **Access Control**: `text-emerald-400`, `hover:ring-emerald-400/80`, `data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/10 data-[state=active]:border-emerald-500/40`
  - **Media Requests**: `text-rose-400`, `hover:ring-rose-400/80`, `data-[state=active]:text-rose-400 data-[state=active]:bg-rose-500/10 data-[state=active]:border-rose-500/40`
  - **Broadcast & Emails**: `text-amber-400`, `hover:ring-amber-400/80`, `data-[state=active]:text-amber-400 data-[state=active]:bg-amber-500/10 data-[state=active]:border-amber-500/40`
  - **Monitoring & Apps**: `text-sky-400`, `hover:ring-sky-400/80`, `data-[state=active]:text-sky-400 data-[state=active]:bg-sky-500/10 data-[state=active]:border-sky-500/40`
  - **Beta & Announcements**: `text-purple-400`, `hover:ring-purple-400/80`, `data-[state=active]:text-purple-400 data-[state=active]:bg-purple-500/10 data-[state=active]:border-purple-500/40`
  - **Live System Logs**: `text-emerald-400`, `hover:ring-emerald-400/80`, `data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/10 data-[state=active]:border-emerald-500/40`
- **Zero Opacity Washes on Tab Switch**: Tab switches must be instantaneous client-side state transitions. Never wrap tab content in `opacity-50` or `isPending` transitions that dim the screen on click. For URL updates, use `router.replace(url, { scroll: false })` without `startTransition`.
- **Slot Inactive/Disabled Card Styling**: Unconfigured or optional slots (e.g. 4K Arrs or Kids Arrs) must use dashed borders (`border border-dashed border-border/40`) with muted text rather than container-wide `opacity-75` washes which make the whole panel look faded and inactive.

## 📐 Key Layout & Component Rules

### 1. Modals & Dialogs (Space Optimization, Bounded Widths & Horizontal Overflow Protection)
- **Radix Tailwind Merge Gotcha**: Base `DialogContent` contains `sm:max-w-lg`. Passing an unprefixed `max-w-6xl` gets overridden!
- **Rule**: Always pass explicit prefixed responsive classes for wide modals (Media Detail, Book & Audiobook Detail, Seerr requests, Episode Guide, Collection Builders), capping at `max-w-3xl lg:max-w-4xl` (or `max-w-4xl lg:max-w-5xl`) with `overflow-x-hidden` to prevent horizontal page spreading and off-screen button scrolling on standard desktop/laptop scaling:
  ```tsx
  className="w-[95vw] sm:w-[92vw] md:w-[90vw] max-w-3xl lg:max-w-4xl max-h-[90vh] sm:max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 bg-[#0c0c12] border border-border/60 shadow-2xl rounded-2xl sm:rounded-3xl scrollbar-thin text-foreground"
  ```
- **CSS Grid `min-w-0` Child Blowout Prevention**: Because `DialogPrimitive.Content` renders as a CSS Grid, all child containers default to `min-width: auto`. Always wrap modal contents in `<div className="flex flex-col min-h-0 min-w-0 w-full overflow-x-hidden">` and add `min-w-0` to all sections. This prevents carousels with 20+ recommendations (e.g. 24 similar books) from overriding `max-width` and expanding the modal to 3,000+ pixels.
- **Primary Action Hierarchy**:
  - In all media and book request modals, always place the primary action button (`Request Ebook` / `Request Audiobook` / `Request Movie` / `Configure & Request` / `Request 4K UHD`) FIRST on the left of the action row, followed by secondary actions like "Watch Trailer" or "Close". This guarantees immediate 1-click access without requiring horizontal scrolling.
- **Similar Titles & Recommendations (Carousel vs Grid)**:
  - Inside detail modals, provide an inline horizontal scrolling carousel (`overflow-x-auto pb-2 scrollbar-thin scroll-smooth w-full min-w-0`) with left/right chevron buttons for instant browsing without layout expansion.
  - In dedicated grid tabs (Similar Titles, Cast & Crew), cap columns at `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3` and add `min-w-0` to all card cells. Never use unconstrained 8-10 column grids (`xl:grid-cols-8 2xl:grid-cols-10`) which spread the modal out.
- **Zero Wasted Header Space**:
  - Use a compact hero backdrop layout with gradient fades (`bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent`).
  - Keep titles, badges (Year, Rating, Runtime, Status), and quick-action buttons aligned without massive empty top margins.

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
  - Track dirty states against `initialDataRef` snapshots.
  - Highlight dirty sections with amber glowing borders (`border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]`) and `● Unsaved Changes` badges.
  - Render the standard `<UnsavedChangesPrompt />` component for floating docked save bars, `beforeunload` protection, and in-app navigation dialogs.
- **Sensitive Fields**:
  - Mask tokens and passwords by default (`type={showToken ? "text" : "password"}`).
  - Provide an inline toggle button with Lucide `<Eye />` / `<EyeOff />`.
- **Live Connection Diagnostics**:
  - Provide a dedicated `"Test"` button next to server/app URLs and API tokens with `<Loader2 className="animate-spin" />` feedback.
- **Multi-Profile Settings & Password Confirmation**:
  - Snapshot sub-profiles individually (`initialSafetyPrefsRef.current[profileId]`) so dirty state is scoped properly across primary, living room, and kid accounts.
  - Require explicit "Confirm New Password" verification inputs with eye visibility toggles to prevent typo lockouts.
  - Support `"DIRECT_DOWNLOAD"` bypass mode on Kindle integration without false email validation rejections.

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
- **Interactive Stepped Range Sliders & Tier Cards Pattern**:
  - When configuring stepped thresholds or permissions (e.g. AI Autonomy Levels 1-3, Max Daily Interactions 1-10), pair an `<input type="range" />` track slider with direct, clickable tier preview cards.
  - Slider track styling: `w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-400/50`.
  - Provide interactive text labels beneath the track with `text-[11px]` and bold color accents when active.
  - Tier cards highlight with semantic ring and border glows (`ring-1 ring-emerald-500/50 bg-emerald-950/30 border-emerald-500/80` for Autonomous, `ring-amber-500/50 bg-amber-950/30 border-amber-500/80` for Assisted, `ring-sky-500/50 bg-sky-950/30 border-sky-500/80` for Advisory).
  - Clicking any tier card immediately synchronizes the range slider and dirty-state tracking without page reloads.

---

### 6. Inline Service & Server Monitoring Toggles (Selective Opt-In Pattern)
- When presenting monitorable hosts, apps, or media servers (`PlexServer`, `TautulliInstance`, `GlancesInstance`, `MediaApp`), provide a compact inline switch with state label:
  - Container: `flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded-md border border-border/40`
  - Active: Emerald text with glowing dot `<span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Monitored`
  - Paused: Slate text with muted dot `<span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Paused`
  - Behavior: Instant optimistic toggle calling dedicated server actions (`togglePlexServerMonitoringAction`, `toggleTautulliMonitoringAction`, etc.) with zero full-page reloads.
  - Plex.tv Discovered Servers: Display passive inventory from linked accounts with `+ Add & Monitor` and `+ Add (Paused)` actions, ensuring unconfigured servers are never auto-probed or marked down.

---

### 7. Multi-Resolution Responsive Layout System (Mobile, 720p, 1080p, 4K)

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

### 7. Member Onboarding & Invitation Gateway (`/join`)
- **Private Server Invite Gate**: Direct visitors without a valid `?ref=` query parameter are gated at Step 0. They cannot access the onboarding flow until entering a valid referral code or active member reference (`name` or `username`).
- **Layout Header Isolation**: On `/join`, all user navigation headers (Book Library, Guides, Account Settings, System Settings) are strictly hidden via `layout-wrapper.tsx` (`!pathname.startsWith("/join")`).
- **Trial vs Full Membership Framing (Upgrade Perks)**:
  - **Free Trial**: A risk-free preview giving full access to stream movies and TV shows on Plex, 100% Direct Play Original Studio Quality (4K HDR, Dolby Vision, Dolby Atmos), all devices (Apple TV, Roku, Fire TV, Smart TVs, Phone, Web), movie & TV requests, with no payment up front.
  - **Full Membership Upgrade Perks**: Frame full membership as unlocking all the extra perks: priority bandwidth streaming, full Ebook & Audiobook Library with in-browser Kindle Paperwhite reader & Send-to-Kindle delivery, dedicated Kids & Living Room sub-account profiles with PIN safety & age ratings, 1-click book requests, and Discord community rewards. Never use negative/restrictive phrasing like "trial members do not receive". Frame the trial as the preview and upgrading as unlocking the extra perks.
- **Prorated Rest-of-Year & Monthly Option Display**:
  - Transparently display both flexible month-to-month ($15/mo) and annual prorated rest-of-year passes across Step 1 (Welcome & Perks Comparison) and Step 5 (Subscription Info & Ready to Stream).
  - Annual plans strictly derive their monthly base rate from `yearlyPrice / 12` ($180 / 12 = $15.00/mo), never an inflated standalone monthly price.
  - Formula: `proratedMonth = (daysRemaining / totalDaysInMonth) * 15`, `fullMonths = remainingFullMonths * 15`. Total amount due now = `proratedMonth + fullMonths`.
  - Pass the registered `username` into `<PaymentMethodsGrid />` to pre-fill the username in the payment memo tag and allow instant switching between Annual and Monthly cadences in the QR modal.
- **Payment Method Wording**:
  - Strictly avoid mentioning credit cards; state "No payment up front. Stream completely free during your trial." P2P payment methods (Venmo, PayPal, CashApp, Zelle) are used for future renewals.

---

### 8. Consolidated Email Management & Trigger Documentation (`/settings?tab=emails`)
- **Single Authoritative Email Hub**: Outgoing email dispatches and notification master switches are strictly consolidated inside `<EmailManagement />` on Tab 3 (`/settings?tab=emails`), eliminating obsolete duplicate cards in Tab 1 ("General & Setup"). The General SMTP card provides a direct 1-click navigation button to the Email Hub.
- **Exact Trigger Event Documentation**: Every email template definition includes an explicit, user-facing `triggerEvent` field. The UI displays this with a `Zap` icon in both the template selection sidebar and a prominent callout card in the template editor header.
- **Automated Payment Receipts & Upgrade Notifications**: Incoming payments verified via automated IMAP scraping or manual attribution dispatch the `payment_received` receipt to the user and `admin_payment_received` alert to admins. Upgrades from trial or pending to full membership automatically dispatch `subscription_activated` detailing all unlocked perks.

---

### 9. Admin Approval Gates & Governance (`/settings/access`)
- **Strict Dual-Gate Governance**: Two independent switches in Access Settings govern automated system mutations:
  - `requireApprovalForPlexChanges` (default `true`): When enabled, NO modifications to live Plex library shares (new trial invites, user preference updates, manual library expansions, or trial/subscription expirations) are applied immediately to Plex servers. Instead, all proposed modifications are staged as `PENDING` records in the `AdminApproval` queue (`PLEX_ACCESS_GRANT` or `PLEX_ACCESS_REVOKE`).
  - `requireApprovalForEmails` (default `true`): When enabled, NO automated user-facing emails (account approvals, password resets, trial welcome, full membership activations, payment receipts, media availability notifications, support ticket updates, mass broadcasts) are dispatched via SMTP. Instead, they are held in `AdminApproval` (`EMAIL`) until explicitly approved.
- **Admin Alert Immunity**: Direct alerts sent to administrators (e.g. `admin_payment_received`, new user account requests, AI bot escalation tickets) pass `bypassApproval: true` so administrators receive timely system alerts without self-blocking their own notification channels.
- **Interactive Review Queue**: Accessible on `/settings/access`, offering instant status filters (`PENDING`, `APPROVED`, `REJECTED`, `ALL`), type filters (`EMAIL`, `PLEX_ACCESS_GRANT`, `PLEX_ACCESS_REVOKE`), batch approvals (`Approve All`), batch rejections (`Reject All`), payload inspection modals, and custom rejection reason tracking.

---

### 10. Trial User Perk Framing & Access Isolation (`/settings/profile`)
- **Positive Perk Framing (Preview vs Unlocked Membership)**:
  - Trial users (`status: "TRIAL"`, `role: "USER"`) experience a clean, curated preview of core media server features.
  - Never use restrictive, punitive, or negative phrasing ("trial members do not receive..."). Instead, frame all advanced features as exciting **Full Member Perks** that unlock upon upgrading to full membership.
- **Referral Rewards & Invite Links**:
  - Trial users do NOT receive active referral codes or invite links to share. Referral rewards ("Earn 1 Free Month per converted friend") and active invite links unlock with full annual or monthly membership.
  - When `isTrial` is true, the Referral card highlights this perk with a direct 1-click button to view membership options (`#billing`).
- **Server & Section Isolation (Kids & Backup Servers Strictly Excluded)**:
  - Trial users are strictly restricted to standard primary server libraries (e.g. `MainPlexServer` movies and TV shows).
  - Kids servers (`KidsPlexServer`, sections with `Kids`) and backup servers (`MainPlexServerBackup`) are strictly filtered out on both server (`getUserAllowedPlexLibrariesAction`, `updateUserSelectedPlexLibrariesAction`, `syncUserPlexShareInternal`) and client (`isSectionAllowed`).
- **Household Sub-Accounts & Profiles**:
  - Secondary profiles (Living Room TV with severe nudity filtering, Kids account with PG ratings ceiling) are exclusive full member perks.
  - Trial users see clean perk preview blocks and "Unlocks with Full Membership" actions linking to subscription options.
- **Account Add-Ons & Features**:
  - Optional add-ons (Books & Audiobooks, extra profile slots) display "Unlocks with Full Membership" buttons for trial users.
  - Backend actions (`toggleFreeAddonAction`, `createOrUpdateSubAccountAction`) strictly enforce full membership status.

---

### 11. White-Label & Domain Brand Isolation (`DomsHomeLab` & `d281knilb`)
- **Brand Identity Mandate**:
  - Homelab / Portal / Domain brand: **`DomsHomeLab`** (accessible at `home.domshomelab.com`).
  - Media server name: **`d281knilb`** (the canonical Plex server).
  - Outgoing email sender header: `"DomsHomeLab (d281knilb)" <${smtpFrom || smtpUser}>`.
- **Zero Generic Branding Leakage in User Communications**:
  - Never allow internal/generic software names (e.g. "Portalarr") to appear in outgoing email subjects, email body text, email header banners, or user-facing UI views. Users must instantly recognize the communications as coming directly from their trusted server host to prevent confusion or spam reports.
  - Email header banner: `DOMS<span style="color: #6366f1;">HOMELAB</span>` with subtitle `d281knilb Media Server & Dashboard`.
  - Email footer: `DomsHomeLab • d281knilb Media Server • Open Dashboard` and `© {year} DomsHomeLab. All rights reserved.`.
- **Payment Reconciliation Memo Notes**:
  - Payment memo notes are cleanly formatted as the member's username (e.g. `dominicjuliano`), making it simple and frictionless for members to include in transaction notes.
  - Payment scrapers retain backwards-compatible substring matching for plain usernames as well as legacy `#DOMSHOMELAB-`, `#D281KNILB-`, and `#PORTALARR-` tags.
- **Client & Device Dialogs**:
  - In Plex stream termination messages, prompt kill alerts as: `"Stream ended by user via DomsHomeLab My Plex Hub"`.

---

### 12. Admin Stream Matrix & Dual Telemetry Command Center (`admin-detailed-streams.tsx`)
- **Hardware Hosts vs Media Servers Differentiation**:
  - Homelabs frequently host multiple Plex instances (e.g. Primary Plex, Kids Plex, 4K Plex) across physical hardware machines (e.g. Unraid primary, secondary backup server).
  - Telemetry is split into a **Dual Telemetry Command Center** (`grid grid-cols-1 lg:grid-cols-2 gap-3`):
    1. **Host Hardware Telemetry (Glances)**: Renders physical hardware host nodes with live CPU & RAM percentage meters, color-coded threshold progress bars (emerald `<60%`, amber `60-80%`, rose `>80%`), and status badges (`ONLINE`, `PAUSED`, `OFFLINE`).
    2. **Streams Per Plex Server**: Renders strictly **monitored Plex servers with monitoring turned on** (`monitored !== false`), ranked descending by active playback volume (`streamCount`) and bandwidth. Unmonitored servers are strictly excluded.
- **Transcoding Power vs Audio Conversion Isolation**:
  - Transcoding power is exclusively consumed by video transcoding (`videoDecision === "transcode"`, e.g. GPU NVENC or multi-threaded CPU video rendering).
  - Audio transcoding (e.g. TrueHD or DTS to AAC/AC3/EAC3) takes negligible CPU and zero GPU power. It is classified as **Direct Stream** in Plex and is **NOT** counted as using transcoding power.
  - In cluster stats and server usage meters, `transcodeCount` strictly counts video transcoding (`videoDecision === "transcode"`). Audio-only transcoding is counted under Direct Play / Direct Stream.
  - In the session card, overall status displays an amber `TRANSCODING` badge only if video is transcoding; otherwise it displays `DIRECT STREAM` or `DIRECT PLAY`. The audio badge is cleanly styled as `CONVERT ({codec})` rather than a misleading `TRANSCODE` tag.
- **TV Show Season & Episode Formatting**:
  - For active TV episode streams, session cards display the canonical Show Title (`grandparentTitle`), a styled monospace Season & Episode pill badge (e.g. `S02E05`), and the Episode Title (`episodeTitle`), ensuring administrators instantly identify which installment is currently streaming.
- **Top Load Server Promotion**:
  - The server with the highest active playback count receives a prominent `#1 HIGHEST LOAD` badge with an animated flame icon and amber glowing border (`border-amber-500/30 bg-amber-500/[0.04]`).
- **Cluster Load Proportional Bars**:
  - Each server card displays a Direct Play vs Transcode split (`X DP / Y Transcode`), total bandwidth in Mbps, and a proportional horizontal load bar reflecting its percentage share of total cluster streams.
- **Interactive Server Filter Pills**:
  - Clicking any server in the Streams Per Plex Server list or the filter pill bar (`All Servers`, `Server 1`, `Server 2`) filters active playback sessions instantly on the client with zero network round-trips. Clear filter action resets back to cluster-wide inspection.
- **Session Telemetry Fidelity**:
  - Active sessions display transcode decisions, hardware NVENC acceleration status, video/audio codecs, real-time bitrate, stream progress, user/device identifiers, and direct admin stream termination controls.
  - In Plex OAuth flow, register client application name as `DomsHomeLab`.

---

### 13. Admin Infrastructure Health & Monitoring Cockpit (`admin-system-health-grid.tsx`)
- **Comprehensive Single-Pane Monitoring**:
  - Positioned at the very top of Admin Mission Control (`/`), aggregating all configured infrastructure services across 5 distinct categories:
    1. **Plex Media Servers** (Direct PMS status, API identity ping, latency)
    2. **Host Hardware (Glances)** (Physical machines, CPU & RAM utilization, port 61208 status)
    3. **Stream Monitors (Tautulli)** (Active playback count, API reachability, port 8181/18181)
    4. **Servarr & Request Apps** (Radarr, Sonarr, Seerr, Ombi, Prowlarr, Bazarr, Maintainerr)
    5. **Download Clients** (SABnzbd, qBittorrent, NZBGet)
- **Visual Status Hierarchy & Pulse States**:
  - 🟢 **ONLINE**: Emerald indicator with pulse, verified reachable response, and round-trip ping latency badge (e.g. `14ms`).
  - 🔴 **OFFLINE / UNREACHABLE**: Crimson rose badge and animated beacon, surfaced prominently with promoted filter badge (`Down (X)`).
  - ⚪ **PAUSED**: Slate neutral badge indicating intentional opt-out (`monitored === false`) configured in Settings > Monitoring. No unnecessary network probing or false alarms.
- **Interactive Multi-Axis Filtering & Instant Search**:
  - Status filter pills (`All`, `Down`, `Online`, `Paused`) paired with category dropdown selector (`All Categories`, `Plex Media Servers`, `Host Hardware`, `Stream Monitors`, `Servarr & Request Apps`, `Download Clients`) and client-side instant search input.
- **My Plex Hub Real Monitored Server Isolation (`my-plex-hub.tsx`)**:
  - In user-facing `MyPlexHub` connected servers dialogs and status counters, dummy, paused, or unmonitored Plex servers (`monitored === false`) are strictly filtered out so that only genuine, monitored Plex instances (`KidsPlexServer`, `MainPlexServerBackup`, `MainPlexServer`) are visible to members.

---

### 14. Scrollable TabsList & Device Selector Patterns (Negative Coordinate Overflow Protection)
- **Radix UI `TabsList` Default Justification**:
  - `TabsList` in `src/components/ui/tabs.tsx` defaults to `justify-center`.
  - When placing multiple tabs (e.g. 7+ device guides, indexers, or categories totaling >800px) inside a horizontal scroll container (`overflow-x-auto`), **never rely on default justification or `w-full` with `justify-center`**.
  - **The Negative Coordinates Bug**: If a centered flex container overflows horizontally, the browser centers the items and pushes the initial items into negative X coordinates (`x < 0`). Because standard LTR browsers cannot scroll into negative scroll offsets, the first item(s) (e.g., Apple TV) become permanently cut off and unreachable even when scrolling all the way to the left.
- **The Mandatory Solution**:
  - Always explicitly pass `justify-start` to `TabsList` inside horizontal scrolling containers:
    ```tsx
    <div ref={tabsRef} className="overflow-x-auto pb-2 pt-0.5 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent scroll-smooth">
        <TabsList className="inline-flex items-center justify-start gap-1.5 p-1.5 bg-muted/20 border border-border/40 rounded-2xl min-w-full w-max h-auto">
            {items.map(item => (
                <TabsTrigger key={item.id} value={item.id} className="... shrink-0">
                    ...
                </TabsTrigger>
            ))}
        </TabsList>
    </div>
    ```
  - For wrapped lists, also specify `flex-wrap items-center justify-start` to ensure left-alignment across line breaks.
- **Chevron Scroll Controls**:
  - When tab lists exceed normal screen boundaries, provide subtle left (`ChevronLeft`) and right (`ChevronRight`) scroll buttons that programmatically execute `tabsRef.current.scrollBy({ left: -260, behavior: 'smooth' })`.

---

### 13. Media Request Quota Visibility & Zero-Limit Suppression Rules
- **Strict Zero-Limit Suppression**:
  - In Seerr and media request workflows, a quota limit of `0` denotes unlimited requests (e.g. Full Members or Admins).
  - Users without a quota limit (`limit === 0` or unlimited) **MUST NEVER** see any quota counter or label. Never display confusing strings like `"Quota: 999 of Unlimited"`.
  - The backend `getUserRequestQuotaAction` returns `remaining: null` when `limit === 0`.
- **Frontend Guard Pattern**:
  - In request modals (`media-detail-modal.tsx`), strictly guard quota text by:
    ```tsx
    {quotaInfo && quotaInfo.limit > 0 && quotaInfo.remaining !== null && (
        <span className="text-xs text-muted-foreground font-medium">
            Quota: <strong className="text-foreground">{quotaInfo.remaining}</strong> of {quotaInfo.limit}
        </span>
    )}
    ```
  - In trial dashboard views (`trial-dashboard-view.tsx`), wrap quota pills in `{(movieQuota.limit > 0 || tvQuota.limit > 0) && ...}` and guard each pill with `limit > 0` and `remaining ?? 0`.

---

### 14. Member Referral Crediting & Statement Discounting Patterns
- **Manual Referral Attribution & Crediting**:
  - In `/settings/access`, administrators can manually link and credit an existing member for a friend's join using the `Credit Referral` button on the user row or `+ Credit Member Referral` on the Referrals Leaderboard.
  - The modal provides select dropdowns for both the referring member and the friend who joined, with an option to immediately extend the subscription expiration date by +1 month (`extendSubscriptionExpiry: true`) or keep the date unchanged and apply the reward on the upcoming statement.
  - The modal features a live reactive statement preview card driven by `calculateUserRenewalSummary` displaying the exact annual renewal discount ($180 - $15 = $165) and the delayed monthly payment start date (e.g. pushed from Jan 1 to Feb 1).
  - **Annual vs Monthly Rate Isolation**: Free months earned off an annual plan strictly discount at the annual plan's monthly rate (`annualMonthlyRate = baseYearlyPrice / 12`, e.g. $15.00/mo for $180/yr), even when a higher flexible standalone monthly plan is configured (e.g. $17.50/mo). Standalone `monthlyRate` is preserved exclusively for the monthly alternative schedule.
- **Renewal Statement Notices**:
  - Admins can dispatch an instant `Renewal Notice` email from the user row with pre-calculated referral discounts and delayed monthly dates.
- **User Profile Subscription Card Transparency**:
  - In `/settings/profile`, approved subscribers with active referral credits see a purple `🎁 Referral Reward Applied` badge and a card detailing their discounted annual renewal ($165/yr instead of $180) or delayed monthly billing date (`delayedMonthlyStartDate`).

---

### 15. Manual Payment Recording & Calendar Alignment Patterns (`/settings?tab=payments`)
- **Manual Payment Recording Modal**:
  - In the Payments tab (`PaymentEmailManager`), administrators can manually log offline or direct payments via the `+ Record Payment` action button.
  - Features real-time member live search filtering by `name`, `username`, or `email`, currency amount input, payment date picker (defaults to today), method selection (`Venmo`, `PayPal`, `Zelle`, `Cash App`, `Cash`, `Other`), and internal notes.
  - Automatically recalculates and synchronizes the member's subscription expiration date, subscription status (`ACTIVE`), and membership tier (`STANDARD`).
- **Calendar Alignment Formula (`paymentCycleYear` & `baseTargetYear`)**:
  - When crediting annual payments ($180), late payments made on Jan 1 or Jan 2 of the new year credit that current calendar year (`baseTargetYear = payYear + 1`), aligning expiration to `Jan 1, <payYear + 1> 23:59:59.999` (e.g. paying on 1/2/2026 sets expiration to `1/1/2027`, NOT `1/1/2028`).
  - Pre-payments made on or after October 1 credit the following calendar year (e.g. paying on 12/31/2025 sets expiration to `1/1/2027`).
  - If a user is already paid through the current cycle (`existingExpiry` in 2027), re-attributing a 2026 payment does not compound or add extra years; it stays `1/1/2027`. Multi-year extensions require explicit surplus amounts (e.g. $360 for 2 years).
- **Zero Secret Backend Retention**:
  - Deleting, unmatching, or re-attributing a payment transaction to another member immediately triggers a clean sequential recalculation (`recalculateUserSubscriptionFromPayments`) for the previous user.
  - If no payments remain, the previous user's subscription cleanly expires (`status: "EXPIRED"`, `subscriptionEndsAt: null`), ensuring no ghost expiration dates or hidden credits persist.

---

### 16. Feature Guide Modals & Centralized Knowledge Base (`FeatureGuideModal` & `/guides`)
- **Interactive Contextual Guide Buttons (`FeatureGuideModal`)**:
  - Reusable modal dialog (`src/components/feature-guide-modal.tsx`) mounted via compact trigger buttons (`<FeatureGuideModal guideId="..." label="..." />`) across key feature headers:
    - AI Assistant header: `guideId="ai-assistant"`
    - Discover / Media Requests header: `guideId="movies-tv"`
    - Media Requests status view: `guideId="movies-tv"`
    - Library Books / Audiobooks / Kindle header: dynamic `guideId` switching between `ebooks`, `audiobooks`, `requests-pipeline`, and `kindle-setup`
    - My Plex Hub stream diagnostics: `guideId="stream-diagnostics"`
    - Settings Profile & Referrals card: `guideId="referral-rewards"`
    - Curation Studio shared nav bar (`CurationNavHeader`): `guideId="curation-studio"`
  - **Category Switching Inside Modal**: Users can switch between any of the 10 topics (`ai-assistant`, `movies-tv`, `ebooks`, `audiobooks`, `requests-pipeline`, `kindle-setup`, `stream-diagnostics`, `referral-rewards`, `curation-studio`, `general`) without leaving the dialog.
  - **Visual Elements**: Highlight pill tags with icons (`CheckCircle2`), numbered step cards, pro-tip callouts (`Sparkles`), important warnings (`AlertCircle`), and deep links to `/guides`.
- **Knowledge Base & Platform Guides Hub (`/guides`)**:
  - Centralized knowledge base supporting 8 master categories:
    - 📱 Streaming Devices (Plex direct play guides with left/right tab scrolling and pro-tips)
    - 🤖 AI Support & Storage Probes (active byte-range `Range: bytes=0-65535` media testing, stream diagnostics)
    - 🎬 Movies & TV Requests (Seerr requests, multi-tier fallback Prowlarr queries)
    - 📚 Ebooks & Kindle Reader (Kindle Paperwhite reader, Send-to-Kindle pre-flight checks, comics)
    - 🎧 Audiobooks & Chapters (multi-track consolidation, chapter selector, track reordering on disk)
    - 🎁 Memberships & Referrals ($15/mo referral discount calculations, payment QR, profile management)
    - 🎨 Server Curation Suite (Kometa ribbons, Agregarr hubs, Maintainerr prune rules, Tagging)
    - 📖 Full Platform Manual (`USER_GUIDE.md` Markdown viewer with instant search and inline Admin editor)
  - URL query parameter sync (`/guides?topic=ai-assistant` or `/guides?tab=devices`) with `<Suspense>` wrapper for Next.js App Router compliance.

---

### 17. Real-Time Session Expiration & Dual Cadence Reactivation (`/pending`)
- **Edge Session Expiration & Stale Cookie Trapping**:
  - `createSession` embeds ISO strings for `trialEndsAt` and `subscriptionEndsAt` directly into the signed JWT token payload.
  - `src/proxy.ts` validates `trialEndsAt` and `subscriptionEndsAt` against `Date.now()` on every incoming request. If a trial or subscription has elapsed in real time, `proxy.ts` dynamically treats `userStatus` as `"EXPIRED"` and immediately halts access, redirecting to `/pending` (or returning 403 on API calls).
  - Server components (`src/app/page.tsx`, `src/app/discover/page.tsx`, `src/app/requests/page.tsx`) and `LayoutWrapper` explicitly verify `user.status` from SQLite via `getCurrentUser()` and redirect any `EXPIRED`, `PENDING`, `REJECTED`, or `SUSPENDED` users immediately to `/pending`, completely preventing unauthorized viewing of the dashboard or requests when cookies are mid-renewal.
- **Dual Cadence Reactivation Selector (`/pending`)**:
  - When an expired or suspended user reaches `/pending`, they are presented with an interactive dual-plan selector:
    - **Annual Renewal**: Prorated rest-of-year amount due (e.g. `$39.19 for rest of 2026` @ $15/mo base), detailing exact months covered and future January 1 renewal.
    - **Flexible Monthly**: Month-to-month reactivation rate (e.g. `$15.00/mo` or prorated current month) with first-of-month renewal cadence.
  - Selecting either card immediately updates the Reactivation Amount Due, renewal breakdown text, P2P deep link pre-filled amounts (Venmo, PayPal, Cash App, Zelle), and pure-TS SVG QR code generator in `PaymentQrModal`.

---

### 18. Trial-to-Full Account Upgrade & Activation Transition Engine (`isTrial` & `membershipTier` Lifecycle)
- **Automatic Membership Tier Upgrades on Activation**:
  - Whenever an administrator grants access or activates an account (via `executePlexLibraryAccessUpdateInternal`, `setUserTrialOrSubscription`, `recalculateUserSubscriptionFromPayments`, or `markUserConverted`) using `REST_OF_YEAR`, `30_DAYS`, `1_YEAR`, `PERMANENT`, or `CUSTOM`:
    - `user.status` transitions to `"APPROVED"`.
    - `user.trialEndsAt` is cleared to `null`.
    - `user.subscriptionEndsAt` is set to the designated expiration timestamp.
    - `user.membershipTier` automatically upgrades from `"TRIAL"` (or null) to `"STANDARD"` (or preserves elevated tiers like `"TIER_2_VIP"` / `"PREMIUM_4K"`).
- **Strict `isTrial` Evaluation Pattern Across Codebase**:
  - Always enforce status check exclusion so an approved member is NEVER flagged as a trial user:
    ```tsx
    const isTrial = (user?.status === "TRIAL" || user?.membershipTier === "TRIAL") && user?.status !== "APPROVED" && user?.role !== "ADMIN";
    const isFullUser = isLoggedIn && !isAdmin && !isSuperUser && !isTrial;
    ```
  - Prevents approved accounts with active subscriptions from rendering `TrialDashboardView`, displaying 14-day trial countdowns, getting barred from secondary server libraries (kids/backup shares), or having profile features (referral links, add-ons, sub-accounts) locked behind trial gates.
- **Self-Healing in `getCurrentUser()`**:
  - If a user has `status: "APPROVED"` (or `role: "ADMIN"`) but their `membershipTier` in SQLite was still marked as `"TRIAL"`, `getCurrentUser()` automatically heals the database record to `membershipTier: "STANDARD"`, clears `trialEndsAt: null`, re-issues an updated persistent session cookie, and returns the healed user immediately.

---

### 19. Protective Curation Library Automation Guard Rails (`CurationLibraryGuardModal`)
- **Purpose & Scope**:
  - Guards against accidental manual executions, poster overwrites, collection pushes, pruning operations, or tag modifications on Plex libraries that are currently excluded/disabled from the automated curation schedule (e.g. `KidsPlexServer -> Movies` when only TV is monitored).
  - Deployed consistently across all 4 Curation Studios:
    - **Kometa Poster Overlays**: `kometa-studio.tsx` (Batch Apply Overlays, Overlay Sync, Single-Item Poster Apply)
    - **Agregarr Collections & Playlists**: `agregarr-studio.tsx` (Collection Sync, Sync Collection to Plex, Seasonal Sync, Smart Hub Deployments)
    - **Maintainerr Prune Engine**: `prune-studio.tsx` (Prune Sync, Execute Prune / Stage Leaving Soon, Sync Leaving Soon Hub)
    - **Media Tagging & Parental Guides**: `tagging-studio.tsx` (Tagging Sync, Apply Parental Tags, Clear Parental Tags, Apply Custom Tag Rules)
- **Modal Design & 3-Choice Decision Protocol**:
  - Whenever an action is triggered on an un-enabled library (`isSectionEnabled(serverId, sectionKey) === false`), execution halts and `CurationLibraryGuardModal` is displayed:
    - **Header & Scope Box**: Amber warning theme (`AlertTriangle`), server name (`HardDrive`), library name (`Folder`), section key, and prominent `⚪ Excluded from Schedule` badge.
    - **Alert Heading**: *"Hey, you don't have this library turned on or enabled!"*
    - **Option 1: Enable Library & Apply (Recommended)**: Permanently turns the library section ON in SQLite settings (`toggleCurationLibrarySectionAction`), updates the local enabled list, and immediately executes the requested action.
    - **Option 2: Force Update (One-Time Override)**: Executes the update once right now without altering the schedule settings, keeping the library safely excluded for future automated background jobs.
    - **Option 3: Cancel**: Aborts the operation immediately with zero changes made to Plex media.
- **Component**: `src/components/curation/curation-library-guard-modal.tsx`

---

### 20. Plex & Server Master AI Mission Control Modal (`AiServerAssistant`)
- **Viewport-Bounded Modal Layout (`h-[86vh] max-h-[92vh]`)**:
  - Modal container uses responsive sizing:
    ```tsx
    className="w-[98vw] sm:max-w-4xl max-h-[92vh] h-[86vh] p-0 bg-neutral-950/98 border border-neutral-800/90 shadow-2xl rounded-2xl flex flex-col overflow-hidden text-neutral-100"
    ```
  - Replaces rigid hardcoded pixel heights (`h-[780px]`) that overflowed laptop screens and caused double nested scrollbars.
  - Header, tab bar, and prompt input are fixed anchors, with the central content area constrained to `min-h-0 flex-1 overflow-y-auto scrollbar-thin` for fluid scrolling.
- **4-Tab Mission Control Navigation**:
  - `activeTab` switches seamlessly between:
    1. **`💬 Diagnostic Chat`**: Interactive conversation with the autonomous AI agent. Features collapsible live telemetry ribbon with 1-click `"Diagnose Stream"` trigger, audio track inspector cards with replacement actions, real-time media probe results, autonomous action report cards (`RADARR_SEARCH_GRAB`, `ESCALATE_ADMIN_TICKET`), multi-step animated thinking states, and categorized prompt suggestions.
    2. **`📡 Live Telemetry`**: Deep stream telemetry inspector showing real-time video/audio transcode decisions, hardware acceleration indicators (`NVENC / QSV` vs `CPU Software`), bitrate & resolution telemetry, transcode speed multipliers, transcode reason tags, detected playback issues with recommended client fixes, and chronic pattern insights.
    3. **`🩺 Server Disk & Probes`**: Server nodes matrix dynamically rendering every configured Plex media server node (e.g. `MainPlexServer`, `KidsPlexServer`, `MainPlexServerBackup`), displaying live reachability (`ONLINE` / `OPERATIONAL`), connection mode (`Local Direct` vs `Remote`), API latency, and disk streaming health.
    4. **`⚡ Quick Fixes`**: Actionable 1-click client playback resolutions (Roku "Playback Error" fix, 100% Direct Play mode, quiet center-channel audio boost, language track replacement, subtitle burn-in fix) with direct links to `PlexSetupGuides` and `FeatureGuideModal`.
- **Conversational Context & Pronoun Anaphora Resolution**:
  - Natural language pronoun resolution (`extractContextFromHistory`) seamlessly resolves anaphoric pronouns ("can you test it on the main server?", "does that play on kids?", "is it working?") to the canonical media title discussed in previous turns, preventing erroneous matches or searching Plex for filler words.
  - Conversational title corrections (e.g. "no the sandlot", "actually the sandlot") automatically inherit requested target servers and playback test intent from context.
  - Dedicated server infrastructure status handler (`isServerStatusQuery`) provides comprehensive cluster health reports ("what all servers are online?").
- **Integrated High-Tech Header & Identity**:
  - Features an animated glowing Bot avatar with status pulse, operational counter badge reflecting all online server nodes (`4`), and `Autonomous v3.1` live indicator badge.
  - Quick action buttons in the header provide instant access to setup guides (`PlexSetupGuides`), feature tours (`FeatureGuideModal`), and clearing session history.
- **Component**: `src/components/ai-server-assistant.tsx`

---

### 21. Guides & Platform Knowledge Base User Access Gating (`/guides` & `FeatureGuideModal`)
- **Granular Server-Side Permissions Engine (`getUserGuideAccessAction` & `calculateUserGuideAccess`)**:
  - Automatically computes exact accessible categories (`allowedCategories`) and feature topic IDs (`allowedGuideTopicIds`) based on user session role, membership tier, trial status, account type, and relational library access.
- **Strict Persona Access Rules**:
  - **Admin (`role: "ADMIN"`)**: 100% access to all 8 categories: Streaming Devices, AI Support & Probes, Movies & TV Requests, Ebooks & Kindle, Audiobooks & Chapters, Memberships & Referrals, Server Curation Suite (`curation-studio`), and Full System Manual (`manual`) with live markdown editing.
  - **Trial Members (`status: "TRIAL"` / `membershipTier: "TRIAL"`)**: Strictly barred from Ebooks, Audiobooks, Curation Studio, and Full System Manual. Header subtitle dynamically suppresses references to audiobooks and Send-to-Kindle.
  - **Regular Approved Members**: Curation Studio and Full System Manual are completely hidden. Ebooks & Kindle and Audiobooks & Chapters are evaluated dynamically against `checkLibraryAccess` across the SQLite `Library` table (checking `allowedUsers` and `restrictedUsers`).
  - **Managed Household Sub-Accounts (`accountType: "KID"` or `"LIVING_ROOM"`)**: Barred from Memberships & Referrals (`referral-rewards`), Curation Studio, and System Manual.
  - **Direct Query Parameter & Navigation Guards**: Accessing `/guides?tab=curation-studio` or `/guides?tab=manual` as a non-admin automatically sanitizes the route and falls back to `"devices"`, with defensive rendering cards blocking unauthorized content.
- **Dynamic Header Subtitle Adaptation**:
  - Automatically tailors the page description to reflect only enabled user features (e.g. omitting audiobooks and Send-to-Kindle for trial or video-only users).
- **Interactive Feature Guide Modals (`FeatureGuideModal`)**:
  - Quick Topic Switcher Bar dynamically filters its topic buttons according to `allowedGuideTopicIds`, preventing non-admin or unauthorized users from discovering or switching into administrative suite guides.
- **Components & Actions**: `src/app/guides/page.tsx`, `src/components/feature-guide-modal.tsx`, `src/app/actions.ts` (`getUserGuideAccessAction`, `calculateUserGuideAccess`).

---

### 22. Kids & Family Library Access and Administration Controls
- **User Account Settings (`/settings/profile`)**:
  - **Kids & Family Library Access Card**: Renders an opt-in toggle card allowing approved, non-trial members (or members with `FAMILY` / `VIP_ALL_ACCESS` tiers) to add the household Kids Library to their personal access list.
  - Toggling executes `updateUserKidsLibraryAccessAction(enable)` to atomically append or remove the user's username in SQLite across all libraries flagged as kids shelves (`isKidsLibrary(lib)`), automatically bootstrapping a default `"Kids' Bookshelf"` if none exists.
  - Features real-time state feedback with an emerald `ACTIVE FAMILY ACCESS` badge, managed library list chips, and an amber tier lock warning for trial users.
- **Library Management Tab (`/library` -> Manage Tab)**:
  - **Kids Shelf Visual Badges**: Automatically detects and highlights kids shelves using `isKidsLibrary(lib)` with an emerald `Baby` icon badge (`Kids Shelf`).
  - **Interactive User Badges**: Renders individual allowed usernames as removable pill badges (`bg-slate-800/80 text-slate-300`) with an inline `X` button calling `handleToggleUserAccess(lib.id, u.username)` for instant 1-click revocation.
  - **Manage Users Popover Dropdown**: Provides an admin dropdown menu on each library card that lists all system users with toggle checkmarks, allowing administrators to grant or revoke access for any user with 1 click without opening the edit dialog.
  - **Edit Library Form Allowed Users Quick Toggles**: Allows administrators to toggle between `* (All Users)` and individual specific usernames with case-insensitive checks and clean comma-separated formatting.

---

### 23. Curation Studio Responsive 4-Way Mode Switcher Tabs (`CurationNavHeader`)
- **Outer Grid Breakpoints**: `grid grid-cols-2 xl:grid-cols-4 gap-2`
  - Replaces rigid `md:flex` (which forced 4 buttons into 1 cramped row starting at 768px, truncating titles on tablets, laptops, and snapped half-screen windows).
  - **Large Screens (`xl:` $\ge 1280px$)**: Expands to 4 equal-width buttons in a single horizontal row across the top.
  - **Medium Screens / Tablets / Laptops / Split Windows (640px–1279px)**: Renders as a 2x2 grid (`grid-cols-2`), giving each button 300px–500px of width.
  - **Mobile Screens ($< 640px$)**: Renders as a 2x2 grid with an adaptive stacked internal button layout (`flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2`).
- **Internal Button Layout Adaptation**:
  - **Top Row on Mobile / Left on Desktop**: Centered Lucide icon paired with concise studio title (`Kometa Overlays`, `Agregarr Hubs`, `Maintainerr Prune`, `Tagging Studio`).
  - **Bottom Row on Mobile / Right on Desktop**: Dedicated studio badge (`Badges`, `Collections`, `Storage`, `Parental`).
  - Eliminates duplicate icon/emoji pairings (`<Sparkles />` + `🎨`) to recover horizontal space.
  - Enforces `whitespace-nowrap font-bold text-xs` so titles never truncate or wrap awkwardly on mobile devices.
- **Component**: `src/components/curation/curation-nav-header.tsx`

---

### 24. Multi-Stage Subscription Renewal Reminders & Payment Engine Architecture
- **Payment Email Scraper Hardening (`src/lib/payment-email-scraper.ts`)**:
  - **Zero-Fee Resilience (`extractAmount`)**: Uses `matchAll` to bypass zero amounts (e.g. `Fee: $0.00 USD`) and accurately extract the actual positive payment amount (`Net: $180.00 USD`).
  - **Cash App Cashtag Isolation (`parseCashAppEmail`)**: Enforces alphabetic characters (`/[a-zA-Z]/`) in cashtag extraction, rejecting numeric amounts like `$180` from accidentally being recorded as the user's handle.
  - **Calendar Alignment & Q4 Monthly Math (`calculateAlignedExpiryDate`)**: Fixed Q4 monthly payment math so monthly payments made in October/November/December credit 1 month without leaping across calendar years. Preserves a 25-day minimum access guarantee for full monthly payments made mid-month. Returns explicit `cadence: "YEARLY" | "MONTHLY"`.
- **Multi-Stage Advance Renewal Warnings (`sendSubscriptionRenewalRemindersInternal`)**:
  - **Annual Plan Milestones ($180/yr)**: 30 days, 14 days, 7 days, 3 days, and 1 day before expiration. Includes net balance due (with earned referral credits deducted), alternative monthly breakdown ($15/mo), payment memo username, and P2P handle options.
  - **Monthly Plan Milestones ($15/mo)**: 3 days and 1 day before expiration with standard $15 rate and memo username.
  - **Cycle-Based Milestone Deduplication**: Persists `{ cycleTarget: "YYYY-MM-DD", milestones: ["30d", "14d"] }` in `User.renewalRemindersSent`. Idempotent across hourly background sweeps; automatically resets upon subscription renewal when `cycleTarget` changes.
- **UI Components & Admin Controls**:
  - **Email Management Hub (`/settings?tab=emails`)**: Notification toggle for `notifySubscriptionRenewal` in Dispatch Controls, alongside a manual "Run Renewal Sweep Now" diagnostic button with live user scan and reminder counts.
  - **Access Management (`/settings/access`)**: User status badges display `Monthly Plan (Expires ...)` or `Annual Plan (Expires ...)`, with a dedicated `Reminder Sent (MMM d)` badge. Access & Timer modal (`subModalUser`) features a 1-click Plan Cadence switcher (`updateUserSubscriptionCadenceAction`) and displays the last reminder dispatch timestamp.
  - **Profile Page (`/settings/profile`)**: Renders `"Active Monthly Subscription"` at `$15/month` for monthly members and `"Active Annual Subscription"` for yearly members.

---

### 25. Cloudflare Access & Edge Security Policy Paths
- **Single Source of Truth Module (`src/lib/edge-policy-paths.ts`)**:
  - Defines `CLOUDFLARE_BYPASS_PATHS` (public & authenticated member endpoints) and `CLOUDFLARE_ADMIN_PATHS` (administrative management and configuration endpoints).
  - Provides path matching utilities: `matchesCloudflareBypass(pathname)` and `matchesCloudflareAdmin(pathname)` supporting wildcard prefixes (`/*`).
- **Cloudflare Bypass Policy (`CLOUDFLARE_BYPASS_PATHS`)**:
  - Public onboarding, authentication & invitations: `/`, `/login`, `/join`, `/invite/*`, `/pending`.
  - Member portal & media interfaces: `/hub`, `/library*`, `/requests*`, `/guides*`, `/beta*`.
  - Authenticated member APIs: `/api/auth/*`, `/api/books/*`, `/api/cover*`, `/api/media/*`, `/api/libraries*`, `/api/requests*`, `/api/stats*`, `/api/downloads*`, `/api/speedtest*`.
  - Static assets & browser hooks: `/favicon.ico`, `/icon.png`, `/robots.txt`, `/sitemap.xml`, `/_next/*`.
- **Cloudflare Admin Policy (`CLOUDFLARE_ADMIN_PATHS`)**:
  - Admin interfaces: `/settings*`, `/admin*`, `/curation*`, `/radarr*`, `/sonarr*`.
  - Admin API endpoints: `/api/system*`, `/api/debug*`, `/api/curation*`, `/api/users*`.
- **Edge Proxy Role Enforcement (`src/proxy.ts`)**:
  - Synchronously guards administrative pages and APIs, requiring active `ADMIN` role authentication before proceeding to `/admin`, `/curation`, `/api/curation`, `/api/users`, `/api/debug`, and `/api/system`.
- **Settings Reference Component (`src/components/cloudflare-policy-card.tsx`)**:
  - Renders live path tables on `/settings` with 1-click clipboard copy for Cloudflare Zero Trust WAF rules and edge reverse proxies (Traefik, NGINX, Caddy).
- **Mandatory Route Change Rule**:
  - Whenever adding, removing, or renaming any page (`src/app/**/page.tsx`) or API route (`src/app/api/**/route.ts`), you MUST synchronously update `src/lib/edge-policy-paths.ts`, `src/proxy.ts`, `src/components/cloudflare-policy-card.tsx`, and `scripts/verify-all.ts`.

---

### 26. Kindle Delivery Failure Inbox Scanner & Rethought Book Rating Isolation
- **Amazon Delivery Failure Inbox Scanner (`src/lib/kindle-email-scanner.ts`)**:
  - Automatically resolves IMAP credentials from active `PaymentEmailSource` entries or primary SMTP credentials (`settings.smtpUser`, decrypted `settings.smtpPass`, and derived host e.g. `imap.gmail.com`).
  - Evaluates recent outgoing Kindle dispatches (`status: "DELIVERED"`) at 5-minute and 10-minute milestones post-delivery via the background scheduler loop (`src/lib/prisma.ts`).
  - Scans for Amazon Send-to-Kindle failure emails (`kindle-cs@amazon.com`, `do-not-reply@amazon.com`) checking for unapproved sender address rejections or format issues.
  - Dynamically transitions `KindleDeliveryLog.status` to `"FAILED"`, updates `errorMessage` with the exact Amazon rejection reason, records failure diagnostics, and emits system alerts.
  - **Manual UI Trigger**: Adds a **"Check Inbox for Bounces"** button to the Kindle Delivery History panel in `/library` with live toast feedback.
- **Rethought Book Rating Engine & Badge Isolation (`src/lib/books/book-rating.ts`)**:
  - **Suppressed Misleading "All Ages" Badges**: Removed the default "All Ages" badge from general fiction and adult literature. Visual shelf badges are strictly reserved for verified `Kids` (emerald), `YA (12+)` (sky), and `18+ Mature` (rose). General audience books display cleanly without misleading badges.
  - **Expanded Romance & Spicy Detection**: Added Tessa Dare and leading historical and contemporary romance authors (`julia quinn`, `lisa kleypas`, `sarah maclean`, `courtney milan`, etc.) and historical series to `KNOWN_SPICY_AUTHORS_REGEX` and `KNOWN_SPICY_SERIES_REGEX`.
  - **Romance Title Signatures (`ADULT_ROMANCE_TITLE_REGEX`)**: Evaluates classic adult romance tropes and title keywords (`surrender`, `scandal`, `scandalous`, `seduction`, `affair`, `duchess`, `duke`, `rake`, `scoundrel`, `wicked`) as `18+ Mature`.
  - **Strict Whitelist for Kids Mode**: Child accounts (`accountType === "KID"` or `section === "kids"`) operate on a strict whitelist requiring `ageRating === "Kids"` or `YA (12+)`. Unverified general fiction and uncaught adult books are strictly barred from entering a child's reading view.

---

### 27. Settings Dirty Checking & Unsaved Changes State Lifecycle
- **Never Depend on `useMemo` for Ref Snapshots (`initialDataRef`)**:
  - `useMemo` compares its dependency array by identity (`Object.is`). It DOES NOT and CANNOT track mutations to `ref.current`.
  - If a save handler updates `initialDataRef.current` without altering state references (or if the memo dependency array only contains state), `useMemo` will return the stale cached `true` value from the previous render, leaving "● Unsaved Changes" and the floating action bar permanently visible even after successful save operations.
  - **Rule**: Compute dirty checks directly as clean, lightweight boolean expressions during component render (e.g. `isPricingDirty = Boolean(initialRef.current && (...))`).
- **State & Snapshot Synchronization on Save**:
  - On successful save actions (`savePaymentAndTrialSettings`), synchronously update `initialPaymentSettingsRef.current` with the new snapshot AND call the corresponding `setState` hooks with cloned data to ensure all render cycles are completely in sync.
  - Return authoritative updated settings from Server Actions so the frontend saves match server normalizations and defaults.
- **Robust Array Equality**:
  - Compare string array settings (such as default library IDs) by sorting copies prior to index-by-index equality checks (`[...a].sort()`), preventing false-positive dirty states caused by array order permutations.
  - Always set state arrays explicitly even when loaded strings are empty (e.g., `""` &rarr; `[]`), preventing stale key retention.

---

### 28. Action Approval Gates & Governance (Strict Staging & Manual Review)
- **Email Dispatch Gating (`requireApprovalForEmails`)**:
  - 100% of outgoing emails across the entire codebase route through `sendOrQueueEmail` in `src/app/actions.ts`.
  - When `requireApprovalForEmails` is `true` (default), outgoing emails (user approvals, trial reminders, subscription notices, request alerts, Kindle deliveries, support ticket escalations, etc.) are strictly staged in the `AdminApproval` table with `type: "EMAIL"` and status `"PENDING"`.
  - Staged emails preserve recipient, subject, rendered HTML, templateId, and file attachments in `payload`.
  - Emails are ONLY dispatched via SMTP when an administrator explicitly approves the item in the Action Approval Queue (`approveAdminApprovalAction`) or when the toggle is turned OFF (`requireApprovalForEmails === false`).
- **Live Plex Modification Gating (`requireApprovalForPlexChanges`)**:
  - All operations that grant, sync, modify, or revoke Plex server shares (`revokePlexAccessForUserInternal`, `updateUserPlexLibraries`, `setUserTrialOrSubscription`, `createOrUpdateSubAccountAction`, `registerUserWithInviteAction`, `updateUserSelectedPlexLibrariesAction`) respect `requireApprovalForPlexChanges`.
  - When active (`true`), modifications are strictly staged in `AdminApproval` (`PLEX_ACCESS_GRANT` or `PLEX_ACCESS_REVOKE`). PMS friends and library share updates are withheld until an administrator explicitly reviews and approves the staged change.
  - When turned OFF (`requireApprovalForPlexChanges === false`), operations execute directly on the target Plex Media Server instances.

---

### 29. Admin Impersonation & Dashboard Preview Switcher (`AdminUserSwitcher` & `ImpersonationBanner`)
- **Instantaneous Preloading (Zero Client Loading Spinner)**:
  - On the dashboard (`/`), `page.tsx` checks `isAdmin || isImpersonating` and fetches candidate users server-side in under 2ms (`prisma.user.findMany` selecting only `id`, `username`, `role`, `status`, `membershipTier`).
  - Passes preloaded users via `initialUsers` to `<AdminUserSwitcher />`, completely eliminating the multi-second client-side `useEffect` delay and "Loading user accounts..." spinner.
  - Standalone fallback uses `getImpersonationUserListAction()`, which is isolated from heavy relations and payment logs.
- **Adaptive Cookie Security Flag (`getAuthCookieOptions`)**:
  - Cookie setting dynamically checks request headers (`x-forwarded-proto`, `referer`, `host`) to ensure `secure: false` over unencrypted HTTP and local LAN IPs (e.g. `http://192.168.10.199:3000`).
  - This prevents modern browsers from silently dropping session cookies when accessed on home networks, eliminating "switching does not work" failures. Over HTTPS, `secure: true` is automatically preserved.
- **Persistent Preview Navigation & Direct Switching**:
  - `<AdminUserSwitcher />` remains visible on the dashboard even when impersonating a user (`isImpersonating === true`), showing active preview status with 1-click switching to any other account.
  - `<ImpersonationBanner />` includes a compact inline `<Select>` dropdown on every page, allowing admins to switch accounts directly from `/library`, `/discover`, `/requests`, etc., without returning to admin first.
  - Returning to admin cleanly clears `portalarr_impersonator_token` and reloads the current page (or `/` if on `/pending`) without redirecting to `/settings/access`.

### 30. Live System & Diagnostic Activity Stream (`SystemLogsViewer` & `SystemLogger`)
- **Full Ring Buffer Capacity (5,000 Entries)**:
  - System logs capture up to 5,000 in-memory entries with append-only JSONL disk persistence (`data/system_logs.jsonl`).
  - Both `/api/system/logs` and `getSystemLogsAction` default to returning 5,000 entries so no logs are truncated or omitted on initial load or manual refresh.
- **Dynamic Category Detection & Category Normalization (`normalizeCategory`)**:
  - Predefined categories include `ALL`, `PLEX` (📺), `TAUTULLI` (📊), `SEERR` (🍿), `SCANNER` (📚), `DOWNLOAD` (📥), `AI_AGENT` (🤖), `COVER` (🖼️), `AUTH` (🔐), `SECURITY` (🔒), `APPROVAL` (🛡️), `KINDLE` (📖), `EMAIL` (✉️), `APPS` (⚡), `DATABASE` (💾), `API` (🌐), `MONITORING` (📡), `CURATION` (🎨), and `SYSTEM` (⚙️).
  - Micro-categories and internal alias tags normalize cleanly: `BOOK_ENGINE` -> `SCANNER`, `AUTO_GRAB` -> `DOWNLOAD`, `TAGGING`/`AGREGARR`/`MAINTAINERR`/`KOMETA` -> `CURATION`, `SETTINGS` -> `SYSTEM`, and `PLEX_HUB` -> `PLEX`.
  - Dynamic category fallback (`activeCategories`) scans active logs and dynamically renders any unlisted category with its own pill, icon, badge, and live count, guaranteeing zero log omission.
- **Clean Boot & Migration Guard Rails**:
  - `ensureSchemaColumns()` in `src/lib/prisma.ts` inspects `sqlite_master` before executing `_prisma_migrations` recovery queries, eliminating repetitive SQLite Code 1 raw query errors on startup and build.
- **Multi-Field Filtering & Smart Timestamping**:
  - Search filter matches concurrently across `log.message`, `log.category`, `log.details`, and `log.level` (e.g. typing "ERROR" or "WARN").
  - Timestamps format dynamically as `HH:mm:ss` for events logged today and `MMM D HH:mm:ss` for historical entries, paired with full locale date tooltips on hover.

### 31. User Directory, Tiers, Cadence & Add-on Controls (Controlled State & Alert Suppression)
- **Radix UI `Select` Controlled State (`value` vs `defaultValue`)**:
  - In user directories and management lists where items re-render or update optimistically upon mutations, always bind `value={...}` instead of `defaultValue={...}` on `Select` components (e.g. `value={user.membershipTier || "STANDARD"}` and `value={user.role}`).
  - Using uncontrolled `defaultValue` causes the dropdown display to become desynchronized from the actual server state when the underlying user object changes.
- **100% Elimination of Tab-Blocking `alert()` Modals**:
  - Never call native browser `alert()` or `confirm()` in user management handlers (such as cadence updates, referral unlinking, access revocations, or add-on toggling).
  - Use lightweight feedback mechanisms (e.g., non-intrusive floating toasts, status badges, or modal action states) to maintain a modern, seamless application feel.
- **Dynamic Tier 1 vs Tier 2 Display & Calculations**:
  - In member profile cards and subscription modals, calculate rates dynamically from `paymentSettings`:
    - Tier 1 (`STANDARD`): default $180/yr ($15/mo annual base) or $15/mo standalone.
    - Tier 2 (`TIER_2_VIP`): default $240/yr ($20/mo annual base) or $25/mo standalone (`paymentSettings.tier2YearlyPrice` & `paymentSettings.tier2MonthlyPrice`).
  - Render a prominent `🛡️ Tier 2: Managed Support` badge in member profile views to clearly signal dedicated white-glove support and priority assistance.
- **Interactive Active Add-ons Manager**:
  - Provide an inline "Active Add-ons & Profile Perks" manager in the user's Access & Timer dialog (`subModalUser`), allowing administrators to toggle available add-ons with immediate optimistic UI updates (`toggleUserAddonAdminAction`).
  - Active add-ons display on member cards with a yellow `Zap` icon badge, count, and multi-line hover tooltip detailing all active perks.

### 32. Support Ticket & AI Diagnostic Controls (Radix Confirmation Dialogs & Alert Suppression)
- **100% Elimination of Native `confirm()` and `alert()` in Ticket Management**:
  - In `/admin/tickets` and ticket moderation workflows, never invoke native window `confirm()` or `alert()`.
  - Ticket deletions are gated by a dedicated Radix UI `<Dialog>` (`deleteModalTicket`) providing explicit item context (ticket title, ID, user), a red confirmation button with loading spinner, and an inline dismissible error banner (`deleteError`) if the deletion fails.
- **AI Diagnostics & Support Auto-Escalation**:
  - Auto-generated diagnostic tickets created by the AI Assistant or client errors include comprehensive telemetry payloads (stream health, audio codecs, transcode metrics, user client info) and an `[AUTO-TICKET]` tag in the title.
  - In-app status badges distinguish ticket priorities (`HIGH`, `MEDIUM`, `LOW`) and state transitions (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) with semantic color accents and real-time refresh.

### 33. Cloudflare Access & Edge Security Policy Paths (Strict 3-Tier Zero-Trust Matrix)
- **Single Source of Truth (`src/lib/edge-policy-paths.ts`)**:
  - All routes are centrally declared and categorized into `CLOUDFLARE_ADMIN_PATHS`, `CLOUDFLARE_SUPER_USER_PATHS`, and `CLOUDFLARE_BYPASS_PATHS`.
  - Rendered in `/settings` via `<CloudflarePolicyCard />` with 1-click clipboard actions and step-by-step Zero Trust setup instructions.
- **Strict Admin-Only Path Isolation (`CLOUDFLARE_ADMIN_PATHS`)**:
  - Covers all management and privileged surfaces: `/settings*`, `/admin*`, `/curation*`, `/api/system*`, `/api/debug*`, `/api/curation*`, `/api/users*`, and `/api/books/upload*`.
  - In `src/proxy.ts`, all admin paths reject non-admin users with 403 Forbidden for APIs, redirect non-admins on `/settings` to `/profile`, and redirect non-admins on other admin pages to `/`.
- **Media Apps for Super Users & Admins (`CLOUDFLARE_SUPER_USER_PATHS`)**:
  - Covers movie and TV show library management (`/radarr*`, `/sonarr*`).
  - Allowed for `ADMIN` and `SUPER_USER` roles in both `src/proxy.ts` and `src/app/arr-actions.ts`.
  - In Cloudflare Zero Trust, Rule 2 permits both Admin and Super User emails, or can be bypassed at the edge while strictly guarded by Portalarr session authentication.
- **Zero-Conflict End-User Routing (`/profile*`)**:
  - `/settings*` is 100% strictly Admin-Only. End-users manage profile settings, Kindle email, preferences, and subscription billing exclusively at `/profile` (eliminating `/settings/profile` bypass conflicts).
  - All email notifications (renewal notices, trial expiration alerts) dispatch links with `{billingUrl}` = `/profile#billing`.
- **Strict Non-Bypassable Admin Guard (`matchesCloudflareBypass`)**:
  - `matchesCloudflareBypass()` explicitly verifies that if `matchesCloudflareAdmin(path)` is true, the route is NEVER bypassed, guaranteeing zero leakage or path collisions.
- **Three-Rule Cloudflare Zero Trust Setup**:
  - **Rule 1 (Admin Only - High Priority)**: Action = `Allow`, Selector = `CLOUDFLARE_ADMIN_PATHS`, Include = `Emails: [your-admin-email@example.com]`. Blocks all outsiders with HTTP 403 at Cloudflare's edge before requests reach the server.
  - **Rule 2 (Super Users & Admin - Priority 2)**: Action = `Allow`, Selector = `CLOUDFLARE_SUPER_USER_PATHS` (`/radarr*`, `/sonarr*`), Include = `Emails: [your-email, superuser-emails]`.
  - **Rule 3 (Public / End-User Bypass - Lower Priority)**: Action = `Bypass`, Selector = `CLOUDFLARE_BYPASS_PATHS`, Include = `Everyone`. Allows friends and family to stream, request, and manage their account profile without Cloudflare login walls.

### 34. Real-time Telemetry & API Route Dynamic Prerender Guards
- **Strict Dynamic Route Export (`dynamic = 'force-dynamic'`, `revalidate = 0`)**:
  - Telemetry and live status endpoints (`/api/stats`, `/api/downloads`, `/api/system/logs`) must NEVER be statically prerendered at build time.
  - Next.js Turbopack App Router prerenders route handlers lacking `export const dynamic = 'force-dynamic'` as static content (`○ /api/stats 5s 1y`). During Docker image builds (e.g. GitHub Actions), local homelab addresses (`192.168.1.x`) are unreachable, resulting in static build artifacts with false-positive offline states.
  - Adding `export const dynamic = "force-dynamic";` and `export const revalidate = 0;` guarantees on-demand evaluation upon each live incoming request.
- **Cache-Control & No-Store Headers**:
  - Responses must explicitly specify `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0` to prevent edge proxies (Cloudflare) and intermediate CDNs from serving stale status snapshots.
  - Client components (`SimpleSystemHealth`, `SystemStatus`, etc.) must fetch with `{ cache: "no-store" }`.

### 35. Subscription Renewal Reminders & Access Directory Telemetry (`/settings/access`)
- **Deterministic Member Directory Next Reminder Badges**:
  - Every member card in `/settings/access` computes live reminder information (`getNextRenewalReminderInfo`) and displays responsive status badges:
    - 🟢 `Paid / Up to Date` / `Paid`: Subscription is covered through the future cycle or a confirmed payment was recorded.
    - 🟡 `Due Today (<m>d notice)`: The current milestone bracket has arrived and is due for dispatch today.
    - 🔵 `<Date> (<m>d notice)`: Next advance notice is scheduled and waiting for the target threshold.
    - ⚪ `All Reminders Sent`: All configured milestones for this cycle have been dispatched.
    - 🔴 `Expired`: Account has lapsed.
    - 🔘 `Admin` / `Trial` / `Pending`: Account not subject to standard renewal reminders.
- **Detailed Renewal Notice Metadata Row**:
  - Below member account type and cadence pills, an informative "Renewal Notice" row renders with a `BellRing` icon, displaying plan cadence, days remaining, exact next email reminder date, and dispatched milestone history badges (`60d`, `30d`, `14d`, `3d`, `1d`).
- **Dual-Zone Schedule Configuration UI (Payment & Onboarding Tab)**:
  - Two dedicated configuration areas for Annual and Monthly memberships:
    - **Annual Members Schedule (`yearlyRenewalReminderDays`, default: `60,30,14,3,1`)**: Multi-tier advance notice (e.g. 2 months, 1 month, 14 days, 3 days, 1 day before expiration).
    - **Monthly Members Schedule (`monthlyRenewalReminderDays`, default: `7,3,1`)**: Multi-tier advance notice (e.g. 7 days, 3 days, 1 day before expiration).
  - Features quick-toggle preset milestone pills, custom comma-separated inputs with real-time numeric normalization, and sequential timeline flow arrows.
- **Strict Already-Paid Payment Check Callout**:
  - Highlights the automatic payment verification engine (`isUserSubscriptionPaidForCycle`), reassuring administrators that members who already sent their payments are strictly excluded from reminder emails.

### 36. Platform Administrator Isolation from Subscriptions, Cadences & Member Tiers (`/settings/access` & `/settings/profile`)
- **Strict Exemption from Subscriptions & Cadences**:
  - Administrators (`role === "ADMIN"`) possess permanent, lifetime platform access and must NEVER have an annual plan, monthly plan, subscription expiration (`subscriptionEndsAt`), free trial (`trialEndsAt`), or member tier (`⭐ Tier 1`, `🛡️ Tier 2`) assigned or rendered.
- **Access Control Directory Styling (`/settings/access`)**:
  - **Badges**: Admin cards strictly display `🛡️ Platform Administrator` and `Permanent Access`. Annual/Monthly plan badges, next renewal reminder pills, and trial notice badges are completely hidden for admins.
  - **Payment Row**: Displays `Payment: Exempt (Platform Administrator)` instead of member transaction history.
  - **Action Buttons**: Suppresses subscription-specific action buttons (`Access & Timer`, `Credit Referral`, `Renewal Notice`) on admin cards, leaving only `Manage Libraries` and `View As` (impersonate).
  - **Bulk Exclusion**: Checkboxes for bulk subscription/trial application are hidden on admin cards, and master bulk selection (`handleSelectAllFiltered`) as well as the backend (`bulkSetUsersTrialOrSubscriptionAction`) strictly exclude admin accounts from bulk updates.
  - **Member Tier Selector**: Replaces the interactive `<Select>` tier dropdown with a static, non-selectable badge (`🛡️ Permanent Admin`) to prevent accidental tier reassignment.
- **User Profile Status (`/settings/profile`)**:
  - Under Account Access Status, admins are prominently identified with `<Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40"><ShieldCheck /> Platform Administrator (Permanent Access)</Badge>`.
- **Backend Governance & Auto-Healing**:
  - Backend mutations (`setUserTrialOrSubscription`, `updateUserMembershipTierAction`, `updateUserSubscriptionCadenceAction`, `sendSubscriptionRenewalReminderAction`) reject operations against admins with descriptive error feedback.
  - Background expiration sweeps (`expireDueTrialsAndSubscriptionsInternal`) and role assignments (`updateAppUserRole`) automatically sanitize and heal any admin records to `status = "APPROVED"`, `subscriptionEndsAt = null`, `subscriptionCadence = null`, `trialEndsAt = null`, and `membershipTier = "ADMIN"`.

---

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

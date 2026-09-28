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
  - In Plex OAuth flow, register client application name as `DomsHomeLab`.

---

### 12. Scrollable TabsList & Device Selector Patterns (Negative Coordinate Overflow Protection)
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
    3. **`🩺 Server Disk & Probes`**: Server nodes matrix displaying physical storage read speeds (`182 MB/s`), NVMe fast tier status, database query latency (`0.4ms`), hardware transcoder status, and 1-click test probe actions.
    4. **`⚡ Quick Fixes`**: Actionable 1-click client playback resolutions (Roku "Playback Error" fix, 100% Direct Play mode, quiet center-channel audio boost, language track replacement, subtitle burn-in fix) with direct links to `PlexSetupGuides` and `FeatureGuideModal`.
- **Integrated High-Tech Header & Identity**:
  - Features an animated glowing Bot avatar with status pulse and `Autonomous v3.1` live indicator badge.
  - Quick action buttons in the header provide instant access to setup guides (`PlexSetupGuides`), feature tours (`FeatureGuideModal`), and clearing session history.
- **Component**: `src/components/ai-server-assistant.tsx`

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

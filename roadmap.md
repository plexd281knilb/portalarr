### ✨ Recently Released

- **🛡️ User Onboarding, Membership Subscriptions & Authorization (Wizarr Rebuilt):**
  - **Frictionless User Onboarding (Wizarr Rebuilt):** Seamless, customizable `/join` portal with automated Plex server friend invites, default library access pre-assignment, Discord server auto-join, and guided client setup wizards (Apple TV, Roku, Fire TV, Smart TV, Google TV, Mobile, Web).
  - **Automated Membership Subscriptions & Payment Tracking (PayPal / Venmo / Zelle — Friends & Family / P2P):**
    - Native P2P payment routing supporting **PayPal (Friends & Family / PayPal.me)**, **Venmo (@handle / deep links / QR codes)**, **Cash App ($cashtag)**, and **Zelle (email / phone / QR codes)** with zero commercial gateway fees.
    - Standalone pure-TS SVG QR code generator and interactive modal (`PaymentQrModal`) with payment cadence switcher ($180/year vs $17.50/month), direct app deep links, and pre-filled reconciliation memo tags (e.g. `#PORTALARR-ALICE-OCT2026`).
    - Automated upcoming renewal reminders, payment confirmation logging with automated IMAP inbox scraper, customizable grace periods (`subscriptionGracePeriodDays`), and automated Plex access suspension upon non-payment.
  - **Referral Rewards & Automated Account Credits:**
    - Dedicated referral link tracking with reward rules (e.g., *"Earn 1 Free Month per converted friend"*).
    - Automated subscription extension / billing postponement upon successful referral conversions with user referral dashboards and metrics tracking.
  - **Granular Membership Tiers & Service Add-ons:**
    - Flexible subscription tiers (`STANDARD`, `PREMIUM_4K`, `VIP_ALL_ACCESS`, `FAMILY`) with dedicated 4K transcode gating, Live TV / IPTV access permissions, and self-service user upgrade request workflows.
  - **Kid Accounts & Shared Living Room Profiles:**
    - Dedicated **Kid Accounts** (`👶 Kid Profile`) with automated parental rating filters (G / PG / TV-Y7) and safe library restrictions.
    - Dedicated **Main Living Room / Shared Household Accounts** (`📺 Living Room`) designed for shared TV displays with customizable family-safe content tags and individual user shelf toggles.
  - **Granular Notification & Email Preference Controls:**
    - Complete self-service user customization over all incoming communications and alerts in User Profile.
    - Granular toggle preferences for: Media Request Ready alerts, New Content Added digests, Server Announcements & Maintenance notices, Support Ticket replies, Subscription & Billing renewal reminders, and Referral conversion rewards (delivered via Email, Discord DM, or Webhook).

- **🎨 Curation & Poster Studio Suite (Native Agregarr, Kometa & Maintainerr Replacement):**
  - **Native Agregarr Collections & Smart Hubs:** Built-in collection generator, dynamic smart playlists, and trending hubs (Trakt, TMDb, MDBList, Letterboxd, MyAnimeList, Sonarr, Radarr, IMDb) promoted directly to Plex Home and Recommended screens with zero extra Docker containers. Includes home screen slotting (`!00_`, `!01_`), hub dismissal blacklists, dynamic backdrop/poster synthesis, and placeholder stubs with immunity markers.
  - **Kometa Automated HD Poster Overlays:** High-definition badge and ribbon overlay generator (4K HDR, Dolby Vision, Dolby Atmos, Audio Codecs, Edition tags, Production Studios, IMDb/Rotten Tomatoes parental and rating badges, and dynamic "Leaving Soon" countdown banners). Complete with non-destructive artwork backup & restore vault (`ArtBackup` / `BadgeStats`).
  - **Maintainerr Storage Pruning Engine & Array Safeguards:**
    - **Unified Activity Timestamp Engine (Max-Date Rule):** Computes `lastActivityDate = max(addedAt, modifiedAt, lastWatchedAt)` across Tautulli and PMS, sorting true inactivity to protect actively watched legacy media.
    - **Season-Level TV Pruning:** Groups TV series by season, calculating watch activity per season and cleanly pruning completed/inactive seasons via `DELETE /library/metadata/{seasonRatingKey}` without wiping ongoing series.
    - **Two-Tier Headroom Storage Capacity:** Warning / Staging threshold (default 85% used / 15% free) auto-stages candidates towards a configured headroom target (default 100 GB) into Leaving Soon, while the Danger threshold (default 95% used) triggers automated active space reclamation.
    - **Servarr Synchronized Deletion:** Automatically unmonitors and removes media from Radarr (`DELETE /api/v3/movie/{id}`) and Sonarr (`DELETE /api/v3/series/{id}`) upon live deletion to prevent re-download loops.
    - **Glances Storage Array Integration:** Real-time disk capacity telemetry and mount point inspection.

- **🍿 Native *Seerr Replacement & Media Request Engine (Overseerr / Jellyseerr):**
  - **All-in-One Movie & TV Media Discovery:** Built-in trending carousels, personalized recommendations, interactive trailer playback, upcoming theatrical/digital releases, and full cast/crew filmographies without needing external Overseerr or Jellyseerr containers (`/discover` & `/requests`).
  - **1-Click Radarr & Sonarr Dispatch:** Instant request routing to Radarr and Sonarr instances with multi-server root folder, language profile, custom format score tagging, and quality profile mapping.
  - **Granular Request Quotas & Auto-Approval Engine:** Custom weekly/monthly request limits by user role, auto-approval workflows for trusted accounts, and live request status tracking (`Requested` → `Searching` → `Downloading` → `Available on Plex`).
  - **Episode-Level & Season-Level TV Monitoring Guides:** Interactive episode guides displaying episode thumbnails, air dates, and individual monitoring switches with dynamic `PUT /api/v3/episode/monitor` sync and automated `EpisodeSearch` triggers.
  - **Quality-Aware 4K UHD vs 1080p Routing:** Granular 4K permission gating, separate instance dispatch, and quality-aware UI control adaptation.
  - **Plex Availability & Stream-Ready Notifications:** Multi-channel notification engine dispatching rich Discord embed cards (poster artwork, status colors, 4K badges) and styled HTML emails to users and administrators.

- **📚 Native Readarr Replacement & Unified Book Engine:**
  - **Native Book Architecture & Relational Schema:** Built on a robust SQLite relational `Author` / `BookSeries` / `Book` schema mirroring Readarr's structural excellence—completely eliminating external Readarr container dependencies. Includes author discographies, series progression tracking, missing installment detection, and automated on-disk folder/file organization.
  - **Unified Request & Discovery Experience:** Integrated book and audiobook requests directly into the unified *Seerr media discovery interface (`/discover` and `/requests`) alongside Movies & TV. Multi-provider metadata resolution querying Audible, iTunes, Google Books, OpenLibrary, and Goodreads with format badges (`📖 Ebook` vs `🎧 Audiobook`).
  - **Interactive Ingest & Unlinked Series Matcher (`BookMatchModal`):** Radarr/Sonarr-style interactive metadata matcher inspecting file metadata, confidence scoring candidate matches from local SQLite and online registries, volume linking, high-definition cover selection, optional disk restructuring (`renameBookFileOnDisk`), and automatic request state reconciliation.
  - **Intelligent Release Scoring & Ingestion:** Multi-tier Torznab indexer search fallback with smart scoring, automatic multi-track audiobook chapter consolidation, multi-disc folder ingestion (`Disc 01/`, `Disc 02/`), ID3 chapter extraction, Send-to-Kindle delivery, in-browser EPUB/comic reader, and floating HTML5 web player with chapter reordering.

- **🤖 Plex & Server Master AI:** Real-time stream telemetry diagnostics, device error troubleshooting (e.g. Roku auto-adjust quality / minimum bandwidth errors), automated step-by-step resolution guides, and 1-click support ticket escalation with full diagnostic snapshot attachments.

- **👁️ View Site As User (Admin Impersonation):** 1-click user view switching from the User Directory (`/settings/access`) with a persistent top warning banner and instant return to admin, enabling administrators to inspect exact user shelves, permissions, watch histories, and dashboard views.

- **🎬 My Plex Hub & Stream Diagnostics:** Live playback telemetry (codecs, bitrates, bandwidth), **Transcode Doctor** stream health fixes, self-service stuck stream termination, and client setup guides for Apple TV, Roku, Fire TV, and Smart TVs.

- **⚡ Server Bandwidth & Connected Nodes:** In-browser download/latency speed tester and unified multi-server inspector for linked Plex Media Server instances.

- **📚 Unified Book & Audio Ecosystem:** Dedicated Ebook & Audiobook shelves with built-in Kindle/Comic reader, floating audio player with chapter reordering, Send-to-Kindle delivery, and 600x900 HD posters.

- **🔍 Smart Media Requests & AI Agent:** Instant book/series discovery with autocomplete, 1-click auto-grab for missing installments, multi-tier indexer fallback search, and LLM metadata enrichment.

- **🚪 Public Join Portal & Plex Friends Sync:** Guided onboarding portal, automated Plex server friend invitations, library access pre-assignment, and background friend synchronization.

---

### 🚧 Development Roadmap

- **🤖 Step 1: Autonomous AI Support Agent & Deep Server Log Diagnostics**
  - **Autonomous AI First-Response Support Agent:** Interactive in-app troubleshooting bot acting as the primary support gate before escalating to admin tickets.
  - **Live Stream Diagnostics & Device Remedies:** Inspects active playback telemetry (transcode decisions, codecs, bitrates, audio channels) and delivers tailored client fix steps (e.g., Roku bandwidth throttling, Apple TV direct play toggles, audio sync adjustments).
  - **Self-Service Media & Download Doctor:**
    - Direct integration to inspect active and completed downloads in SABnzbd, NZBGet, and qBittorrent.
    - Automatically triggers targeted re-searches and replacement downloads if a user reports wrong audio language (e.g., Spanish-only audio track), out-of-sync audio, or corrupt media files.
    - Diagnoses failed book/audiobook grabs, triggers indexer failover searches, and re-dispatches Send-to-Kindle deliveries.
  - **1-Click Ticket Escalation with Rich Diagnostic Context:**
    - If the AI support bot cannot automatically resolve the issue (or if the user requests human intervention), the chat presents an instant **"Submit Support Ticket" (`🎫`)** action.
    - Automatically bundles and attaches the complete diagnostic payload: chat conversation history, active client/device profile, live stream telemetry snapshot (codecs, transcode decisions, bandwidth), correlated server log snippets, and download client state directly into a new admin support ticket with instant SMTP email notification.
  - **Deep Server Log Analysis & Incident Correlation:**
    - Continuous background log ingestion from Plex Media Server, Tautulli, Transcoder, and Arr applications with persistent indexed storage.
    - Correlates user playback error timestamps directly with raw server log events to identify root causes (transcode buffer starvation, disk I/O bottlenecks, network drops).
    - Generates 1-click administrative diagnostic reports with proactive server remediation suggestions.

- **📡 Step 2: Native Uptime & Service Health Monitoring Engine (Uptime Kuma / Ping Replacement)**
  - **Automated Service Heartbeat & Multi-Protocol Health Checks:**
    - Continuous background polling and health monitoring for all configured media server stack services (Plex Media Server, Tautulli, Glances, Radarr, Sonarr, Prowlarr, Readarr, SABnzbd, qBittorrent, Overseerr, Bazarr, etc.).
    - Support for custom external HTTP/HTTPS endpoints, TCP/UDP port pings, DNS resolution checks, and SSL/TLS certificate expiry tracking.
    - Configurable heartbeat intervals (e.g. 30s / 60s), request timeouts, retry thresholds before alerting, and response latency benchmarking.
  - **Instant Incident Alerts & Outage Notifications:**
    - Real-time multi-channel notifications the moment a server, node, or service goes **DOWN** (`🔴`), suffers **DEGRADED** performance / packet loss (`🟡`), or recovers back **UP** (`🟢`).
    - Multi-channel delivery: Direct SMTP emails to administrators, rich Discord webhook embed alerts with outage duration and error codes, Telegram notifications, and browser Web Push.
    - Configurable alert debouncing and cooldown rules to eliminate false alarm storms during brief transient network blips.
  - **Public & Admin Status Dashboard:**
    - Clean status overview showing 24-hour, 7-day, and 30-day uptime percentage bars, real-time latency graphs, and historical incident logs.
    - Ability to post scheduled maintenance notices and incident resolution updates directly on the dashboard.

- **⚡ Step 3: Smart Bandwidth Shaper & Transcode Governor**
  - **Dynamic Download Throttling:** When active remote Plex streams begin or spike above a threshold (e.g. 80% upload bandwidth), Portalarr automatically throttles qBittorrent and SABnzbd speed limits, ramping them back up once streams conclude.
  - **Transcode Prioritization & GPU Guard:** If hardware NVENC/QuickSync capacity or CPU hits critical thresholds (95%+), intelligently throttle background tasks or prioritize VIP/paying tiers while gracefully coaching standard users to adjust client playback quality.
  - **Direct Play Coach & Network Profiler:** In-app telemetry alerts users with device-tailored tips to enable Direct Play on their specific client hardware (saving server power, GPU cycles, and eliminating buffering).

- **📺 Step 4: Native IPTV & Live TV Stream Manager (xTeVe / Threadfin Replacement)**
  - **M3U & XMLTV EPG Aggregator:** Import, filter, and organize IPTV playlists into clean channel bouquets with custom logos, category mappings, and official electronic program guides.
  - **Dead Stream Auto-Pruning & Failover Routing:** Background health checks periodically test stream URLs, filtering out dead feeds and seamlessly routing to backup stream sources.
  - **Virtual HDHomeRun Tuner Emulation:** Emulates a virtual HDHomeRun device so Plex Media Server can ingest curated live TV feeds and sports channels directly into Plex Live TV & DVR.

- **🧹 Step 5: Automated Audio/Video Cleaner & Custom Format Upgrader (TRaSH Guides Engine)**
  - **TRaSH Guides Scoring & Upgrade Engine:** Automatically tags and scores releases against community-standard profiles, automatically upgrading lower-quality releases to preferred HDR10+/Dolby Vision/properly mastered audio tracks when indexers find upgrades.
  - **Audio Track Normalizer & Compatibility Injector:** Scans video files lacking stereo/AAC compatibility tracks and auto-generates a lightweight secondary stereo AAC track to ensure 100% Direct Play on mobile, web, and Smart TVs without transcoding.
  - **Subtitle & Audio Track Pruner:** Strips unnecessary non-native language commentary tracks and foreign audio/sub streams to conserve disk space and streamline player track selection.

- **💬 Step 6: Native Subtitle Engine & Auto-Sync (Bazarr Replacement)**
  - **Automated Multi-Provider Hunting:** Automatically grabs missing `.srt` subtitles across OpenSubtitles, Subscene, Subdl, and Addic7ed based on user language preferences.
  - **AI Audio-Sync & Offset Alignment:** Built-in audio waveform and speech-to-text alignment (using lightweight Whisper / audio track sync) to fix out-of-sync subtitles automatically.
  - **User Self-Service "Fix Subtitles":** If a user is watching a movie with missing or desynchronized subtitles, they can click a 1-click **"Request / Fix Subtitles"** button on My Plex Hub; Portalarr downloads, cleans, aligns, and injects the `.srt` directly into Plex within seconds.

- **☁️ Step 7: Disaster Recovery, Automated Cloud Backups & Migration Wizard**
  - **Automated Database & Config Snapshots:** Scheduled encrypted backups of the SQLite database, custom poster artwork, curated collection rules, and user watch histories.
  - **Cloud & Remote Storage Sync:** 1-click automated backup export to Google Drive, OneDrive, Nextcloud, AWS S3, Backblaze B2, or local NFS/SMB shares.
  - **1-Click Restore & Migration Assistant:** Effortlessly restore or migrate the entire Portalarr deployment onto a new host/Unraid server with zero manual re-entry.

- **🌐 Step 8: Multi-Server Federation & Load-Balanced Failover**
  - **Plex Server Failover & Health Switching:** If the Primary PMS node goes offline or undergoes maintenance, Portalarr automatically redirects active users or incoming requests to the Secondary PMS node.
  - **Unified Global Search & Cross-Server Availability:** Search across multiple connected Plex servers simultaneously with deduplicated search results, consolidated stream monitoring, and unified library status badges.

- **📊 Step 9: Advanced Analytics, User Engagement & Server Wrapped**
  - **Annual "Server Wrapped" Experience:** Beautiful, shareable Spotify-style end-of-year infographics for users showcasing total hours watched, top movies/shows, favorite genres, and peak viewing hours.
  - **Admin Infrastructure Intelligence:** Long-term storage growth projections, transcode vs direct-play efficiency trends, popular request analysis, and indexer health scorecards.

---

### 💡 Have an Idea or Need Help?

Got a feature suggestion or noticed an issue? Vote on community suggestions in the **Feature Voting Poll** on the [Beta Services](/beta) page or submit a support ticket anytime!

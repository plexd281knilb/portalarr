### ✨ Recently Released

- **🤖 Plex & Server Master AI:** Real-time stream telemetry diagnostics, device error troubleshooting (e.g. Roku auto-adjust quality / minimum bandwidth errors), automated step-by-step resolution guides, and 1-click support ticket escalation with full diagnostic snapshot attachments.

- **👁️ View Site As User (Admin Impersonation):** 1-click user view switching from the User Directory (`/settings/access`) with a persistent top warning banner and instant return to admin, enabling administrators to inspect exact user shelves, permissions, watch histories, and dashboard views.

- **🎨 Curation Studio Suite (Beta):** Native Kometa Overlays Studio (stock ribbon/badge presets & custom asset guides), Agregarr Hubs, Maintainerr Prune storage manager, and Plex Tagging Studio.

- **🎬 My Plex Hub & Stream Diagnostics:** Live playback telemetry (codecs, bitrates, bandwidth), **Transcode Doctor** stream health fixes, self-service stuck stream termination, and client setup guides for Apple TV, Roku, Fire TV, and Smart TVs.

- **⚡ Server Bandwidth & Connected Nodes:** In-browser download/latency speed tester and unified multi-server inspector for linked Plex Media Server instances.

- **📚 Unified Book & Audio Ecosystem:** Dedicated Ebook & Audiobook shelves with built-in Kindle/Comic reader, floating audio player with chapter reordering, Send-to-Kindle delivery, and 600x900 HD posters.

- **🔍 Smart Media Requests & AI Agent:** Instant book/series discovery with autocomplete, 1-click auto-grab for missing installments, multi-tier indexer fallback search, and LLM metadata enrichment.


---


### 🚧 Development Roadmap

- **🎯 Step 1: Curation & Poster Studio (Agregarr, Kometa & Maintainerr Replacement)**
  - **Native Collections & Smart Hubs:** Built-in collection generator, dynamic smart playlists, and trending hubs (Trakt / IMDb / TMDb / Letterboxd / MDBList) directly on Plex home screens without extra Docker containers.
  - **Automated High-Definition Poster Overlays:** Dynamic badge and ribbon overlay generator (4K HDR, Dolby Vision, Dolby Atmos, Audio Codecs, Edition tags, Production Studios, and dynamic "Leaving Soon" countdown banners).
  - **Smart Storage Pruning Engine & Array Health Safeguards:**
    - **Unified Activity Timestamp Engine (Max-Date Rule):** Evaluates every available timestamp per file (`addedAt`, `fileModifiedAt`, `lastWatchedAt` via Tautulli & PMS) and computes `lastActivityDate = max(addedAt, modifiedAt, lastWatchedAt)`. Media is sorted by true inactivity to prevent purging actively re-watched titles.
    - **Season-Level TV Pruning:** Groups TV series by season, calculating the most recent activity timestamp across all episodes in that season. Purges entire completed/inactive seasons in clean batches rather than leaving orphaned episodes or wiping entire ongoing shows.
    - **Dynamic Storage Headroom & Staged Prune Pool:**
      - Continuously tracks total projected GBs to be freed across the library array.
      - Maintains a rolling, prioritized candidate list of media staged for deletion instead of executing unpredictable batch purges every *X* days.
      - **Two-Tier Array Capacity Thresholds:**
        - **Warning / Staging Threshold (e.g., 85% Disk Usage):** Automatically begins staging oldest inactive files into the "Leaving Soon" staging pool with countdown poster overlays.
        - **Danger / Active Reclamation Threshold (e.g., 95% Disk Usage):** Activates aggressive automated pruning from the prioritized staged pool to restore healthy array headroom and prevent disk exhaustion.

- **🍿 Step 2: Native *Seerr Replacement (Overseerr / Jellyseerr)**
  - **All-in-One Movie & TV Media Discovery:** Built-in trending carousels, personalized recommendations, interactive trailer playback, upcoming releases, and full cast/crew filmographies without needing external Overseerr or Jellyseerr containers.
  - **1-Click Radarr & Sonarr Dispatch:** Instant request routing to Radarr and Sonarr instances with multi-server root folder, language profile, and quality profile mapping.
  - **Granular Request Quotas & Auto-Approval Engine:** Custom weekly/monthly request limits by user role, auto-approval workflows for trusted accounts, and live request status tracking (`Requested` → `Searching` → `Downloading` → `Available on Plex`).
  - **Plex Availability & Notification Sync:** Automated background library sync to detect 4K/1080p availability, auto-close fulfilled requests, and dispatch instant ready-to-watch notifications via SMTP email and Discord webhooks.

- **🛡️ Step 3: User Onboarding, Membership Subscriptions & Authorization (Wizarr Replacement)**
  - **Frictionless User Onboarding (Wizarr Rebuilt):**
    - Seamless, customizable join portal with automated Plex server friend invites, library access pre-assignment, Discord server auto-join, and guided client setup wizards.
    - User directory management with 1-click account provisioning and auto-sync with Plex Friends.
  - **Automated Recurring Billing Engine (Stripe / PayPal Integration):**
    - Fully automated payment processing with flexible cadence options: Annual subscriptions (e.g., $180/year) and Monthly subscriptions with a convenience premium (e.g., $17.50/month).
    - Automated invoice generation, payment receipts, renewal reminders, expired subscription grace periods, and auto-revocation upon non-payment.
  - **Referral Rewards & Automated Account Credits:**
    - Dedicated referral link tracking with reward rules (e.g., *"Earn 1 Free Month per converted friend"*).
    - Automated subscription extension / billing postponement upon successful referral conversions with user referral dashboards.
  - **Granular Membership Tiers & Service Add-ons:**
    - Flexible subscription tiers (e.g., Standard Media, 4K HDR Dedicated Transcode Tier, Live TV / IPTV Stream Integration, Multi-Server Links, Extra Concurrent Streams).
    - Tier-gated library visibility, auto-applied Plex user labels, and self-service user upgrade portal.
  - **Kid Accounts & Shared Living Room Profiles:**
    - Dedicated **Kid Accounts** with automated parental rating filters (G / PG / TV-Y7) and safe library restrictions.
    - Dedicated **Main Living Room / Shared Household Accounts** designed for shared TV displays with customizable family-safe content tags and individual user shelf toggles.
  - **Granular Notification & Email Preference Controls:**
    - Complete self-service user customization over all incoming communications and alerts.
    - Granular toggle preferences for: Media Request Ready alerts, New Content Added digests, Server Announcements & Maintenance notices, Support Ticket replies, Subscription & Billing renewal reminders, and Referral conversion rewards (delivered via Email, Discord DM, or Web Push).

- **🤖 Step 4: Autonomous AI Support Agent & Deep Server Log Diagnostics**
  - **Autonomous AI First-Response Support Agent:**
    - Interactive in-app troubleshooting bot acting as the primary support gate before escalating to admin tickets.
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

- **📚 Step 5: Native Readarr Replacement & Unified Book Engine**
  - **Native Book Architecture & Storage Engine:**
    - Rebuild the Ebook and Audiobook backend on a robust, native author/series/book schema mirroring Readarr's structural excellence—completely eliminating external Readarr container dependencies.
    - Comprehensive author discographies, series progression tracking, missing installment detection, multiple edition management, and automated on-disk folder/file organization.
  - **Unified Request & Discovery Experience:**
    - Integrates book and audiobook requests directly into the Step 2 unified *Seerr media discovery interface alongside Movies & TV.
    - Multi-provider metadata resolution querying Audible, iTunes, Google Books, OpenLibrary, and Goodreads with format badges (`📖 Ebook` vs `🎧 Audiobook`).
  - **Intelligent Release Scoring & Ingestion:**
    - Multi-tier Torznab indexer search fallback with smart scoring (format, language, narrator, unabridged vs abridged, scene release tagging).
    - Automatic multi-track audiobook chapter consolidation, multi-disc folder ingestion (`Disc 01/`, `Disc 02/`), ID3 chapter extraction, and high-definition cover art fetching.
    - Seamless Send-to-Kindle delivery, in-browser EPUB/comic reader with offline caching, and built-in floating HTML5 audio player with chapter reordering.

- **📡 Step 6: Native Uptime & Service Health Monitoring Engine (Uptime Kuma / Ping Replacement)**
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

### 7. ⚡ Smart Bandwidth Shaper &       
  Transcode Governor

  Keep your home network responsive and
  prioritize live streams over background
  downloads.

  • Dynamic Download Throttling: When
  active remote Plex streams begin or spike
  above a threshold (e.g. 80% upload
  bandwidth), Portalarr automatically
  throttles qBittorrent and SABnzbd speed
  limits, ramping them back up once streams
  end.
  • Transcode Prioritization & GPU Guard:
  If hardware NVENC/QuickSync capacity or
  CPU hits 100%, prioritize direct stream
  bandwidth or VIP/paying tiers while
  gracefully notifying standard users to
  adjust client playback quality.
  • Direct Play Coach: In-app telemetry
  alerts users with tips on how to enable
  Direct Play on their specific client
  device (saving server power and
  eliminating buffering).

### 8. 📺 Native IPTV & Live TV Stream   
  Manager (xTeVe / Threadfin Replacement)

  Seamlessly manage live channels, sports,
  and news inside Portalarr and Plex.
  • M3U & XMLTV EPG Aggregator: Import,
  filter, and organize IPTV playlists into
  clean channel bouquets with custom logos
  and official electronic program guides.
  • Dead Stream Auto-Pruning: Background
  health-checks periodically test stream
  URLs, filtering out dead feeds or routing
  to backup stream sources.
  • Virtual HDHomeRun Tuner: Emulates a
  virtual HDHomeRun device so Plex can
  ingest the curated channels directly into
  Plex Live TV & DVR.

  ### 9. 🧹 Automated Audio/Video Cleaner &
  Custom Format Upgrader (Trash Guides     
  Engine)

  Keep media library files pristine,
  universally compatible, and space-
  efficient.

  • TRaSH Guides Scoring Engine:
  Automatically tags and scores releases,
  upgrading lower-quality releases to
  preferred HDR10+/Dolby Vision/properly
  mastered audio tracks when indexers find
  upgrades.
  • Audio Track Normalizer & Compatibility
  Injector: Scans video files lacking
  stereo/AAC compatibility tracks and auto-
  generates a lightweight secondary stereo
  AAC track to ensure 100% Direct Play on
  mobile, web, and Smart TVs without
  transcoding.

  ### 10. ☁️ Disaster Recovery, Automated   
  Cloud Backups & Migration Wizard

  Never worry about losing server
  configuration, custom collections, or
  user records.

  • Automated Database & Config Snapshots:
  Scheduled encrypted backups of the SQLite
  database, custom poster artwork, curated
  collection rules, and user watch
  histories.
  • Cloud & Remote Storage Sync: 1-click
  automated backup export to Google Drive,
  OneDrive, Nextcloud, AWS S3, Backblaze B2,
  or local NFS/SMB share.
  • 1-Click Restore & Migration Assistant:
  Effortlessly restore or migrate the
  entire Portalarr deployment onto a new
  host/Unraid server with zero manual re-
  entry.

  ### 11. 🌐 Multi-Server Federation & Load-
  Balanced Failover

  For server owners managing multiple
  physical or cloud server nodes.

  • Plex Server Failover: If the Primary
  PMS node goes offline or is undergoing
  maintenance, Portalarr automatically
  redirects active users or requests to the
  Secondary PMS node.
  • Unified Global Search: Search across
  multiple connected Plex servers
  simultaneously with deduplicated search
  results and unified library status badges.


### 💡 Have an Idea or Need Help?

Got a feature suggestion or noticed an issue? Vote on community suggestions below or submit a support ticket anytime!

 ### 1. 💬 Native Subtitle Engine & Auto- 
  Sync (Bazarr Replacement)

  Eliminate missing or out-of-sync subtitle
  frustrations for both users and admins.

  • Automated Multi-Provider Hunting:
  Automatically grabs missing .srt
  subtitles across OpenSubtitles, Subscene,
  Subdl, and Addic7ed based on user
  language preferences.
  • AI Audio-Sync / Offset Alignment:
  Built-in audio waveform & speech-to-text
  alignment (using lightweight Whisper or
  audio track sync) to fix out-of-sync
  subtitles automatically.
  • User Self-Service "Fix Subtitles": If a
  user is watching a movie with missing/bad
  subtitles, they can click a 1-click
  "Request / Fix Subtitles" button on My
  Plex Hub; Portalarr downloads, cleans,
  and injects the .srt directly into Plex
  within seconds.

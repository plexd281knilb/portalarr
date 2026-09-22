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


---


### 💡 Have an Idea or Need Help?

Got a feature suggestion or noticed an issue? Vote on community suggestions below or submit a support ticket anytime!

# Portalarr

Portalarr is a centralized, self-hosted dashboard designed to manage a media server ecosystem. It serves as a unified portal that aggregates system status, active downloads, service links, and support tools for both users and administrators.

## Project Overview

- **Core Purpose:** To provide a single "mission control" interface for media server stacks (Plex, Tautulli, Glances, and "Arr" apps).
- **Architecture:** Next.js 16 (App Router) with React 19. It uses Server Actions for backend logic and Prisma with SQLite for data persistence.
- **Tech Stack:**
  - **Framework:** Next.js 16
  - **Database:** SQLite (Prisma 6 ORM)
    - **CRITICAL:** Do NOT upgrade to Prisma 7+. The project is locked to Prisma 6 for stability.
  - **Styling:** Tailwind CSS, Radix UI (Shadcn UI style)
  - **Icons:** Lucide React
  - **Auth:** Custom JWT-based session management using `jose` and `bcryptjs`.
  - **Security:** AES-256-GCM encryption for sensitive service tokens (Plex, SMTP, etc.).
- **Core Features:**
  - **Unified Status Widgets:** Real-time stream stats (Tautulli), server health metrics (Glances), and deduplicated active download queues (qBittorrent, SABnzbd, NZBGet).
  - **Support System:** Direct ticket submission for users, and a ticket management panel at `/admin/tickets` for administrators (with SMTP email updates).
  - **Interactive Beta Portal:** A modular dashboard at `/beta` showcasing active and upcoming beta features/services.
  - **Announcements & Roadmap:** Centralized banner controls and GFM-supported Markdown roadmaps updated directly from admin settings.
  - **Persistent 30-Day Sessions:** Signed HttpOnly JWT session cookies with 30-day lifetime and sliding auto-renewal.

## Building and Running

### Development
1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Create a `.env` file with at least:
   ```env
   DATABASE_URL="file:./prisma/dev.db"
   JWT_SECRET="your-super-secret-key"
   ALLOWED_ORIGINS="your-domain.com,192.168.1.50:8080" # Optional: For Server Actions
   ```
3. **Database Setup:**
   ```bash
   npx prisma@6.2.1 migrate dev
   ```
4. **Run Dev Server:**
   ```bash
   npm run dev
   ```
   The server will start on `http://0.0.0.0:3000` to allow local network access.

### Production (Docker)
Portalarr is optimized for Docker deployment, particularly on Unraid.
1. **Configure environment:** Ensure `JWT_SECRET` is set in your `docker-compose.yml` or environment.
2. **Build and Run:**
   ```bash
   docker-compose up --build
   ```
3. **Database Migrations:** The Docker container is configured to run `prisma migrate deploy` automatically on startup. This safely updates the schema without affecting your data.
4. **Volumes:**
   Data is persisted in `/app/data` (mapped to `/mnt/user/appdata/portalarr/data` in the default `docker-compose.yml`).

### Updating Portalarr
To update to the latest version while preserving your settings and database:
1. **Pull the latest image:** `docker-compose pull`
2. **Restart the container:** `docker-compose up -d`
The persistent volume ensures your `dev.db` file is maintained across updates, and automatic migrations will apply any new schema changes.

## Development Conventions

### 1. Data Access & Mutations
- **Server Actions:** All database interactions should be handled via Server Actions in `src/app/actions.ts` or `src/app/auth-actions.ts`.
- **Security:** Actions that modify settings or sensitive data MUST call `verifyAdmin()` to ensure the user has proper permissions.

### 2. UI Components
- **Radix UI:** Use the Radix UI primitives located in `src/components/ui` for consistent accessible components.
- **Lucide Icons:** Use `lucide-react` for all iconography.
- **Theme:** The project is hardcoded to a dark theme using `next-themes` and custom CSS in `src/app/globals.css`.

### 3. Encryption
- **Sensitive Fields:** Fields like `mainPlexToken`, `smtpPass`, and service `apiKey`s must be encrypted before saving to the database using `encryptData` and decrypted before use with `decryptData` (from `src/lib/encryption.ts`).

### 4. Global Route Protection & Edge Security
- **Proxy Configuration:** All routes are protected by `src/proxy.ts` (Next.js 16 convention).
- **Enforcement:** Users are redirected to `/login` if no valid session exists. API requests without valid sessions are rejected at the edge with HTTP 401.
- **Role & Status Protection:** Admin routes (`/settings`, `/admin/*`) are restricted to users with the `ADMIN` role. Users with `PENDING` or `REJECTED` status are blocked from all app/API routes by `src/proxy.ts` and redirected to `/pending`.
- **Static Asset Guards:** Static asset bypass checks in `proxy.ts` explicitly exclude `/api` paths to prevent API route session bypasses via file extension tricks.

### 5. Account Approval, Plex Auto-Sync & Session Resilience
- **Pending Account Requests:** New users can submit a temporary account request on `/login`. This sets `status = "PENDING"` and emails an admin notification via SMTP. Admins manage approval/rejection at `/settings/access`.
- **Plex Owner Token Auto-Save & Friend Sync:** Logging in as the Plex server owner automatically saves the owner's encrypted token into `prisma.settings` and triggers a background sync. The scheduler in `src/lib/prisma.ts` scans `/api/v2/friends`, auto-provisions `APPROVED` accounts for new friends, updates changed emails/usernames, and revokes access (`status = "REJECTED"`) for removed friends.
- **Session Desync & Loop Prevention:** `getCurrentUser()` detects changes between the database status/role and the active JWT payload. If an admin approves a pending user, `getCurrentUser()` automatically re-issues a fresh session cookie with `status = "APPROVED"`, preventing redirect loops between `proxy.ts` and `/pending`.
- **Persistent Login:** Session cookies persist for 30 days with sliding renewal so active users stay logged in across browser restarts and reboots.
- **Send-to-Kindle Email Gate & Settings Header:** Users must configure a valid Send-to-Kindle email (`kindleEmail`) to unlock access to books on `/library`. A prominent Kindle Settings action button in the `/library` header allows users to manage delivery preferences and view the Amazon Approved Senders Guide.
- **Forgot Password Email Workflow:** Users can click "Forgot password?" on `/login`. Entering an email or username generates a temporary password, updates the user's password in SQLite, and sends the temp password via SMTP. Users can update to a new permanent password on `/settings/access`.

### 6. Gotchas & Best Practices
- **Windows File Locks:** SQLite database and Prisma engine files lock during `npm run dev`. Stop the dev server before running `npx prisma migrate dev`.
- **Case-Insensitive SQLite Queries:** Perform lowercased string matching in JS when querying `prisma.user` to avoid Prisma SQLite `mode: "insensitive"` type errors and `P2002` unique constraint crashes.
- **Registry Autocomplete:** Use `onMouseDown` instead of `onClick` for dropdown suggestion list items to prevent input `onBlur` from unmounting items prematurely.
- **Open Library Queries:** Combine series queries with the author name (e.g. `Series Author`) and filter out compilations (box sets, bundles, omnibus) to avoid duplicate or unrelated bulk results.
- **Library Access Defaults:** Public libraries use `allowedUsers = "*"` or empty string to allow all approved users access.
- **Server Action Error Handling:** Server actions invoked from Client Components should return a serializable `{ success: boolean, error?: string }` object instead of throwing raw `Error`s. In production Next.js builds, raw errors are masked with a generic *"An error occurred in the Server Components render"* message, preventing detailed user-facing error reporting.
- **Kindle & Library Scan Renaming Loops:** Keep on-disk file paths pretty (e.g. `Author - Title.ext`) and avoid cleaning or lowercase-renaming them on disk during library scans. This prevents infinite scan-rename cycles and race conditions where download/Kindle delivery checks fail because the path keeps changing. For Kindle email delivery, sanitize the attachment filename *in the email options* instead of renaming the file on disk.
- **Download Client File Cleanup & Deduplication:** When a book download finishes and is successfully copied to a library, call the download client API to delete the torrent/NZB and its files. Active downloads fetched from SABnzbd, NZBGet, and qBittorrent are deduplicated by clean filename/title on both server and client.
- **Foreign Language Ebook Filtering:** To maintain an English-centric library on automated grabs, use the `isForeignLanguage` helper. Releases with foreign indicators (e.g. `swedish`, `svensk`, `german`, `french`, etc.) must be filtered out during Prowlarr search. If a downloaded file contains these keywords, delete it from the client and disk, and set `downloadStatus = "failed"` to trigger the monitor failover and attempt the next release.

## Key Files
- `prisma/schema.prisma`: The source of truth for the database schema.
- `src/proxy.ts`: Global edge authentication, role-based, static file, and user status access control.
- `src/app/actions.ts`: Main repository for system logic, Plex friend sync, active download parsing, and database mutations.
- `src/app/auth-actions.ts`: Logic for login, 30-day session creation, account requests, Plex authentication, and session cookie resync.
- `src/app/pending/page.tsx`: Pending account approval status screen for non-approved users.
- `src/app/settings/access/page.tsx`: Admin management screen for users, pending access requests, and Plex sync.
- `src/app/admin/tickets/page.tsx`: Admin management screen for user support tickets.
- `src/app/library/page.tsx`: Book library page with Send-to-Kindle gate and Kindle settings header.
- `src/components/active-downloads.tsx`: Client component for deduplicated active downloads queue rendering.
- `src/components/sidebar.tsx`: Main navigation component.
- `src/lib/encryption.ts`: AES-256-GCM encryption utilities.

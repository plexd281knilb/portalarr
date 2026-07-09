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
  - **Unified Status Widgets:** Real-time stream stats (Tautulli), server health metrics (Glances), and active download queues.
  - **Support System:** Direct ticket submission for users, and a ticket management panel at `/admin/tickets` for administrators (with SMTP email updates).
  - **Interactive Beta Portal:** A modular dashboard at `/beta` showcasing active and upcoming beta features/services.
  - **Announcements & Roadmap:** Centralized banner controls and GFM-supported Markdown roadmaps updated directly from admin settings.

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

### 4. Global Route Protection
- **Proxy Configuration:** All routes are protected by `src/proxy.ts` (Next.js 16 convention).
- **Enforcement:** Users are redirected to `/login` if no valid session exists.
- **Role-Based Access:** Admin routes (`/settings`, `/admin/*`) are restricted to users with the `ADMIN` role. Standard users are redirected back to the home page if they attempt to access these routes.

### 5. Gotchas & Best Practices
- **Windows File Locks:** SQLite database and Prisma engine files lock during `npm run dev`. Stop the dev server before running `npx prisma migrate dev`.
- **Registry Autocomplete:** Use `onMouseDown` instead of `onClick` for dropdown suggestion list items to prevent input `onBlur` from unmounting items prematurely.
- **Open Library Queries:** Combine series queries with the author name (e.g. `Series Author`) and filter out compilations (box sets, bundles, omnibus) to avoid duplicate or unrelated bulk results.
- **Library Access Defaults:** New libraries must default to restricted access (`allowedUsers = ""`) so that the admin must explicitly authorize users rather than defaulting to public (`*`).
- **Server Action Error Handling:** Server actions invoked from Client Components should return a serializable `{ success: boolean, error?: string }` object instead of throwing raw `Error`s. In production Next.js builds, raw errors are masked with a generic *"An error occurred in the Server Components render"* message, preventing detailed user-facing error reporting.
- **Kindle & Library Scan Renaming Loops:** Keep on-disk file paths pretty (e.g. `Author - Title.ext`) and avoid cleaning or lowercase-renaming them on disk during library scans. This prevents infinite scan-rename cycles and race conditions where download/Kindle delivery checks fail because the path keeps changing. For Kindle email delivery, sanitize the attachment filename *in the email options* instead of renaming the file on disk.
- **Download Client File Cleanup:** When a book download finishes and is successfully copied to a library, always call the download client API to delete the torrent/NZB and its files. This releases active OS/Docker file locks and automatically frees up storage on the downloads share.

## Key Files
- `prisma/schema.prisma`: The source of truth for the database schema.
- `src/proxy.ts`: Global authentication and role-based access control.
- `src/app/actions.ts`: Main repository for system logic and database mutations.
- `src/app/auth-actions.ts`: Logic for login, session creation, and Plex authentication.
- `src/app/admin/tickets/page.tsx`: Admin management screen for user support tickets.
- `src/app/beta/page.tsx`: User dashboard displaying active beta testing services.
- `src/components/sidebar.tsx`: Main navigation component.
- `src/lib/encryption.ts`: AES-256-GCM encryption utilities.

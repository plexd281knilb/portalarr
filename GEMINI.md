# Portalarr

Portalarr is a centralized, self-hosted dashboard designed to manage a media server ecosystem. It serves as a unified portal that aggregates system status, active downloads, service links, and support tools for both users and administrators.

## Project Overview

- **Core Purpose:** To provide a single "mission control" interface for media server stacks (Plex, Tautulli, Glances, and "Arr" apps).
- **Architecture:** Next.js 16 (App Router) with React 19. It uses Server Actions for backend logic and Prisma with SQLite for data persistence.
- **Tech Stack:**
  - **Framework:** Next.js 16
  - **Database:** SQLite (Prisma ORM)
  - **Styling:** Tailwind CSS, Radix UI (Shadcn UI style)
  - **Icons:** Lucide React
  - **Auth:** Custom JWT-based session management using `jose` and `bcryptjs`.
  - **Security:** AES-256-GCM encryption for sensitive service tokens (Plex, SMTP, etc.).

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
   npx prisma migrate dev
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
3. **Database Migrations:** The Docker container is configured to run `prisma migrate deploy` automatically on startup.
4. **Volumes:**
   Data is persisted in `/app/data` (mapped to `/mnt/user/appdata/portalarr/data` in the default `docker-compose.yml`).

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

## Key Files
- `prisma/schema.prisma`: The source of truth for the database schema.
- `src/proxy.ts`: Global authentication and role-based access control.
- `src/app/actions.ts`: Main repository for system logic and database mutations.
- `src/app/auth-actions.ts`: Logic for login, session creation, and Plex authentication.
- `src/components/sidebar.tsx`: Main navigation component.
- `src/lib/encryption.ts`: AES-256-GCM encryption utilities.

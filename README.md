# Portalarr

Portalarr is a modern, self-hosted dashboard for managing your media server ecosystem. It provides a unified "mission control" interface to monitor system status, track active downloads, and manage service links and support requests.

![Portalarr Dashboard](public/next.svg) <!-- Placeholder for a real screenshot if available -->

## 🚀 Features

-   **Unified Dashboard:** Aggregate status from Plex, Tautulli, Glances, and your "Arr" stack.
-   **Active Downloads:** Real-time progress tracking for SABnzbd, NZBGet, and qBittorrent.
-   **Global Protection:** Every page is secured behind a login screen with built-in role-based access control.
-   **Support System:** Users can submit support tickets directly from the home page.
-   **Secure Storage:** Sensitive API keys and service tokens are encrypted at rest using AES-256-GCM.
-   **Docker Ready:** Optimized for Docker and Unraid with automatic migrations and persistent data volumes.

## 🛠️ Quick Start

### 1. Prerequisites
-   Node.js 20+
-   Docker (optional, for production)

### 2. Local Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env # Ensure DATABASE_URL and JWT_SECRET are set

# Setup database
npx prisma migrate dev

# Run development server
npm run dev
```

### 3. Production (Docker)
Portalarr is designed to run seamlessly in Docker. See the [GEMINI.md](./GEMINI.md) for detailed Unraid and Docker configuration notes.

```bash
docker-compose up --build
```

## 🔒 Security
Portalarr takes security seriously:
-   **Global Proxy:** All traffic is intercepted and validated via a secure proxy.
-   **JWT Sessions:** Authentication uses signed, HttpOnly JWT cookies.
-   **Admin Lockdown:** Sensitive settings are only accessible to accounts with the `ADMIN` role.

## 🤝 Contributing
For developers looking to contribute, please refer to the [GEMINI.md](./GEMINI.md) file for architecture details, development conventions, and project structure.

## 📄 License
This project is private and for personal/internal use.

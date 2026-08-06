# Portalarr

Portalarr is a modern, self-hosted dashboard for managing your media server ecosystem. It provides a unified "mission control" interface to monitor system status, track active downloads, and manage service links, book reading, and support requests.

![Portalarr Dashboard](public/next.svg)

## 🚀 Features

- **Unified Dashboard:** Aggregate status from Plex, Tautulli, Glances, and your "Arr" stack.
- **Deduplicated Active Downloads:** Real-time progress and queue tracking for SABnzbd, NZBGet, and qBittorrent.
- **Plex Friends Auto-Sync:** Automatically scans your Plex friends list and provisions approved accounts with role synchronization.
- **30-Day Persistent Login:** Persistent JWT session cookies with sliding auto-renewal keep active users signed in seamlessly.
- **Air-Tight Edge Security:** Every page and API endpoint is secured at the edge behind authentication with role and user status (`PENDING`/`APPROVED`/`REJECTED`) enforcement.
- **Book Library & Kindle Integration:** Public book library access with mandatory Send-to-Kindle configuration and a dedicated Kindle Settings management tab.
- **Support & Password Recovery:** Direct support ticket submission with SMTP notifications, plus built-in temporary password email workflows.
- **Secure Storage:** Sensitive API keys and service tokens are encrypted at rest using AES-256-GCM.
- **Docker Ready:** Optimized for Docker and Unraid with automatic migrations and persistent data volumes.

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js 20+
- Docker (optional, for production)

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
Portalarr is designed to run seamlessly in Docker. See [GEMINI.md](./GEMINI.md) for detailed Unraid and Docker configuration notes.

```bash
docker-compose up --build
```

## 🔒 Security
Portalarr takes security seriously:
- **Global Proxy:** All page and `/api/*` traffic is intercepted and validated at the edge.
- **JWT Sessions:** Authentication uses signed, HttpOnly JWT cookies with automatic status desync resolution.
- **Admin Lockdown:** Sensitive settings (`/settings`, `/admin/*`) are only accessible to accounts with the `ADMIN` role.

## 🤝 Contributing
For developers looking to contribute, please refer to [GEMINI.md](./GEMINI.md) for architecture details, development conventions, and project structure.

## 📄 License
This project is private and for personal/internal use.

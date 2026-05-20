This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

# Portalarr 🌐

Portalarr is a modern, unified self-hosted dashboard designed specifically for media server administrators and their users. It aggregates real-time performance tracking, support ticketing, and custom system announcements into a single, elegant web interface.

Built as a highly reactive, force-dynamic Next.js application, Portalarr interfaces securely with popular self-hosted applications and infrastructure metrics providers while providing robust administrative controls.

---

## ✨ Features

### 👤 User-Facing Dashboard
* **Real-Time System Status:** At-a-glance health monitoring across media systems, explicitly displaying active stream breakdowns across servers and flagging offline or down services.
* **Integrated Support Desk:** A native user ticketing submission form allowing users to report streaming or server issues directly to the administrator. Pre-authenticates and auto-fills fields for logged-in users.
* **Announcements & Feature Discovery:** * **Alert Banner:** A global emergency markdown header for broadcast maintenance notices or downtime warnings.
  * **Interactive Roadmap:** Dedicated markdown space detailing upcoming server features, expansions, or content changes.
  * **Beta Services Portal:** An isolated space displaying modular feature testing cards with markdown instructions and call-to-action buttons for testing new environments.

### 🛡️ Admin & Control Layer
* **JWT-Secured Admin Panel:** Complete server configuration suite gated behind rigorous JSON Web Token verification middleware (`verifyAdmin`).
* **Hardware Telemetry Integration:** Syncs multi-version Glances API endpoints to safely capture server CPU utilization and RAM metrics over non-cors contexts.
* **Dynamic Media App Settings:** Securely configure external URLs, internal addresses, and credentials for background API workers.
* **At-Rest Field Encryption:** Industry-standard local symmetric payload cryptographic encryption routines securing highly sensitive fields directly in the local SQLite instance.
* **Automated SMTP Mailer Pipelines:** Automatically signals user notifications upon support ticket updates ("Acknowledged" or "Completed"), sends manual administrative emails, and routes structural admin alerts when new support desk tickets land.
* **Granular User Administration:** Comprehensive user registration database management supporting full bcrypt password-hashing cycles and explicit Admin/User RBAC definitions.

---

## 🛠️ Tech Stack

* **Framework:** Next.js 16 (App Router, Server Actions, React Server Components)
* **UI & Styling:** Tailwind CSS 4, Radix UI Primitives, Lucide Icons, Shadcn-inspired custom design layouts
* **Database & ORM:** SQLite database engine managed natively via Prisma ORM
* **Security & Authentication:** `jose` (JWT), `bcryptjs` (password-hashing), and custom local encryption layers
* **Utility Engines:** `nodemailer` (SMTP transport layers), `react-markdown` (GFM and raw HTML injection capabilities for announcements)

---

## 🚀 Getting Started

### Prerequisites
* **Node.js:** Ensure `Node.js 20` or higher is installed locally.
* **Environment Configuration:** A `.env` file must exist in your root directory containing:
  ```env
  DATABASE_URL="file:./prisma/dev.db"
  JWT_SECRET="your-super-secure-long-jwt-secret-string"

  ├── .github/workflows/      # Automated Github Actions for container building/publishing
├── prisma/
│   ├── schema.prisma       # Prisma DB definition (Settings, Tautulli, Services, MediaApps, Tickets, Beta)
│   └── migrations/         # Schema structural transition history files
├── src/
│   ├── app/
│   │   ├── actions.ts      # Primary server-side logic (Secure Admin Panel & Public Feeds)
│   │   ├── auth-actions.ts # User account tracking and authentication checks
│   │   ├── page.tsx        # Dynamic system homepage routing layout
│   │   ├── beta/page.tsx   # React client-state tracking for the interactive Beta cards
│   │   └── admin/          # Gated administrative dashboard views
│   ├── components/
│   │   ├── system-status.tsx    # Live hardware & streaming metrics renderer
│   │   └── landing-support.tsx  # Interactive user support ticket submission layout
│   └── lib/
│       ├── encryption.ts   # Hardware-level string cryptography tooling
│       └── utils.ts        # UI design styling combinations
├── Dockerfile              # Deployment packaging container configurations
└── package.json            # Framework specifications, script macros, and dependency trees

# chat-me

Self-hosted multi-tenant chat platform for Russian data perimeter requirements.

Current production domain: `https://chat.black8.tech`

## What is inside

- One backend API with local PostgreSQL storage
- One operator admin console
- One embeddable widget engine
- One reusable SDK for Next.js and generic script embeds
- Multi-project tenancy via `projectKey`
- Safe internal notifications with explicit Telegram PII guard

## Monorepo layout

```text
chat-me/
├── apps/
│   ├── admin/        # Next.js operator console (/admin/*)
│   ├── api/          # Fastify + pg backend, migrations, seeds
│   └── widget/       # standalone browser bundle build
├── packages/
│   ├── sdk/          # React wrapper + DOM widget engine
│   └── shared/       # shared schemas, types, constants
├── examples/
│   ├── next-site-a/
│   ├── next-site-b/
│   └── insales-liquid/
└── docs/
    └── vps-deploy.md
```

## Architecture

- `apps/api` stores all messages, contacts, operators, sessions, notes and audit events in local PostgreSQL.
- `apps/admin` is a separate operator console with local auth, httpOnly session cookie and CSRF token.
- `packages/sdk` exposes both a React component and a no-framework DOM widget.
- `apps/widget` bundles the standalone script served from `/widget/chat-me-widget.js`.
- Realtime delivery uses SSE first, with client polling fallback. No external broker or SaaS transport is used.

## Data model

Primary tables:

- `chat_projects`
- `chat_visitors`
- `chat_conversations`
- `chat_messages`
- `chat_internal_notes`
- `chat_operators`
- `chat_operator_sessions`
- `chat_internal_notifications`
- `chat_audit_log`

Implemented in [schema.sql](/Users/yakovradchenko/Documents/Projects/chat-me/apps/api/src/db/schema.sql).

## API surface

Public widget API:

- `POST /v1/widget/session/init`
- `POST /v1/widget/conversations/active`
- `POST /v1/widget/messages`
- `GET /v1/widget/conversations/:conversationId/messages`
- `GET /v1/widget/conversations/:conversationId/stream`
- `GET /health`

Admin API:

- `POST /v1/admin/auth/login`
- `GET /v1/admin/auth/me`
- `POST /v1/admin/auth/logout`
- `GET /v1/admin/projects`
- `GET /v1/admin/conversations`
- `GET /v1/admin/conversations/:conversationId`
- `GET /v1/admin/conversations/:conversationId/messages`
- `GET /v1/admin/conversations/:conversationId/stream`
- `POST /v1/admin/conversations/:conversationId/messages`
- `POST /v1/admin/conversations/:conversationId/notes`
- `POST /v1/admin/conversations/:conversationId/status`
- `POST /v1/admin/notifications/dispatch`

## Security defaults

- Message bodies are treated as plain text and sanitized before storage/rendering.
- Widget public routes validate `Origin` against per-project `allowedOrigins`.
- Admin auth uses local password hash + DB-backed session table.
- Session cookie is `httpOnly`; CSRF token is required for admin mutations.
- Visitor spam is constrained by honeypot and in-memory rate limiting.
- Operator actions write to `chat_audit_log`.
- Telegram alerts are generated only through the safe formatter and never receive message text, email, phone, name, IP, URL or attachments.

## Environment variables

See [.env.example](/Users/yakovradchenko/Documents/Projects/chat-me/.env.example).

Core variables:

- `DATABASE_URL`
- `API_HOST`
- `API_PORT`
- `API_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `ADMIN_PUBLIC_URL`
- `SESSION_COOKIE_NAME`
- `CSRF_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `PASSWORD_PEPPER`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_FROM`
- `NOTIFICATION_EMAIL_TO`
- `TELEGRAM_ALERTS_ENABLED`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SEED_OPERATOR_LOGIN`
- `SEED_OPERATOR_EMAIL` (legacy fallback)
- `SEED_OPERATOR_PASSWORD`
- `SEED_ETERN8_MAIN_ORIGINS`
- `SEED_ETERN8_STORE_ORIGINS`
- `SEED_INSALES_STORE_ORIGINS`

## Local run

1. Copy `.env.example` to `.env` and edit values.
2. Start PostgreSQL locally.
3. Export env variables:

```bash
set -a
source .env
set +a
```

4. Install dependencies:

```bash
npm install
```

5. Apply schema and seed:

```bash
npm run migrate
npm run seed
```

6. Run development servers:

```bash
npm run dev:api
npm run dev:admin
npm run dev:widget
```

Admin opens at `http://localhost:3100/admin/login`, API at `http://localhost:4100`.

## VPS deployment

Detailed server notes live in [docs/vps-deploy.md](/Users/yakovradchenko/Documents/Projects/chat-me/docs/vps-deploy.md).

Current production layout:

- app: `/srv/chat-me/app`
- env: `/etc/chat-me.env`
- systemd: `chat-me-api.service`, `chat-me-admin.service`
- nginx site: `/etc/nginx/sites-available/chat-me`
- HTTPS cert: `/etc/letsencrypt/live/chat.black8.tech/`

## Connect from Next.js

See:

- [next-site-a example](/Users/yakovradchenko/Documents/Projects/chat-me/examples/next-site-a/README.md)
- [next-site-b example](/Users/yakovradchenko/Documents/Projects/chat-me/examples/next-site-b/README.md)

Minimal usage:

```tsx
"use client";

import { ChatWidget } from "@chat-me/sdk";

export function SupportChat() {
  return (
    <ChatWidget
      config={{
        projectKey: "etern8-main",
        apiBaseUrl: "https://chat.black8.tech",
        locale: "ru"
      }}
    />
  );
}
```

## Connect from InSales / Liquid

See [optimized InSales example](/Users/yakovradchenko/Documents/Projects/chat-me/examples/insales-liquid/chat-me-widget-optimized.liquid).
For the full branded IWANT variant, use [iwant snippet](/Users/yakovradchenko/Documents/Projects/chat-me/examples/insales-liquid/iwant-chat-widget.liquid).

Minimal optimized pattern:

```html
<script>
  // Load + mount only after first user interaction.
  const mount = () => {
    const script = document.createElement("script");
    script.src = "https://chat.black8.tech/widget/chat-me-widget.js";
    script.async = true;
    script.onload = () => {
      window.ChatMeWidget?.init({
        projectKey: "insales-store",
        apiBaseUrl: "https://chat.black8.tech",
        locale: "ru"
      });
    };
    document.head.appendChild(script);
  };
  window.addEventListener("pointerdown", mount, { once: true, passive: true, capture: true });
</script>
```

## Current MVP limits

- Realtime uses SSE with in-process subscriptions bridged by PostgreSQL `NOTIFY`; no horizontal sticky-session strategy yet.
- Rate limiting is in-memory, so for multi-node production it should move to Redis or PostgreSQL-backed counters.
- Attachments are not implemented yet.
- Operator password reset and profile management are not implemented yet.
- Email notification transport is coded, but production SMTP still needs actual credentials/relay.
- `etern8-store` and `insales-store` are intentionally paused on production until real embed origins are confirmed.

## Phase 2

- Attachments with local object storage / S3-compatible storage in Russian-friendly contour
- Conversation assignment, tags and SLA queues
- Better unread/read tracking per operator
- Rich admin filters and search
- Password reset / invite flow
- Soft-delete and anonymization jobs
- Redis-backed rate limiting and queueing
- Full audit exports and compliance reports

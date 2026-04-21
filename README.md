# chat-me

Self-hosted multi-tenant chat platform with:
- backend API (`Fastify` + `PostgreSQL`)
- operator admin console (`Next.js`)
- embeddable widget engine (plain script + React SDK)

The project is designed for teams that want to host chat infrastructure in their own perimeter.

## Features

- Multi-project tenancy via `projectKey`
- Widget API + operator admin API
- SSE-first real-time updates with polling fallback
- CSRF-protected admin mutations
- DB-backed operator sessions and audit log
- Telegram notification guard that avoids sending PII message content

## Monorepo layout

```text
chat-me/
├── apps/
│   ├── admin/        # Next.js operator console (/admin/*)
│   ├── api/          # Fastify backend, migrations, seeds
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

## Requirements

- Node.js 22+
- npm 10+
- PostgreSQL 15+

## Quick start

1. Copy env template:

```bash
cp .env.example .env
```

2. Update `.env` values (at minimum `DATABASE_URL` and `PASSWORD_PEPPER`).

3. Install dependencies:

```bash
npm install
```

4. Export env variables for local shell session:

```bash
set -a
source .env
set +a
```

5. Apply schema and seed demo data:

```bash
npm run migrate
npm run seed
```

6. Start local services:

```bash
npm run dev:api
npm run dev:admin
npm run dev:widget
```

Local URLs:
- admin: `http://localhost:3100/admin/login`
- api: `http://localhost:4100`
- widget bundle: `http://localhost:4100/widget/chat-me-widget.js`

## Build and verify

```bash
npm run check
```

`check` runs production builds for all workspace packages/apps.

## Environment variables

See [.env.example](.env.example).

Core variables:
- `DATABASE_URL`
- `API_HOST`, `API_PORT`, `API_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`, `ADMIN_PUBLIC_URL`
- `SESSION_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `SESSION_TTL_HOURS`
- `PASSWORD_PEPPER`
- `SMTP_*` and `NOTIFICATION_EMAIL_TO`
- `TELEGRAM_ALERTS_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`

## Integration examples

- Next.js site A: [examples/next-site-a/README.md](examples/next-site-a/README.md)
- Next.js site B: [examples/next-site-b/README.md](examples/next-site-b/README.md)
- InSales/Liquid snippets: [examples/insales-liquid/](examples/insales-liquid)

## Data model

Primary tables include:
- `chat_projects`
- `chat_visitors`
- `chat_conversations`
- `chat_messages`
- `chat_internal_notes`
- `chat_operators`
- `chat_operator_sessions`
- `chat_internal_notifications`
- `chat_audit_log`

Schema: [apps/api/src/db/schema.sql](apps/api/src/db/schema.sql)

## Deployment

Generic VPS deployment template: [docs/vps-deploy.md](docs/vps-deploy.md)

## Security notes

- Keep `.env` and production secrets out of git.
- Rotate `SEED_OPERATOR_PASSWORD` after first seed in production.
- Set strict `allowedOrigins` per project before enabling production traffic.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening PRs.

## License

MIT, see [LICENSE](LICENSE).

# VPS deployment notes (template)

This document is a generic checklist for deploying `chat-me` on your own VPS.

## Example target

- Domain: `chat.example.com`
- App root: `/srv/chat-me/app`
- Env file: `/etc/chat-me.env`
- Services: `chat-me-api.service`, `chat-me-admin.service`

## Recommended routing

- `/admin/*` -> Next admin service
- `/v1/*` -> API service
- `/widget/*` -> static widget bundle served by API
- `/health` -> API healthcheck

## Suggested deployment flow

1. Sync repository to server app root.
2. Install dependencies:

```bash
npm ci
```

3. Build packages/apps:

```bash
npm run build
```

4. Apply DB schema and seed:

```bash
npm run migrate
npm run seed
```

5. Restart services and reload nginx:

```bash
sudo systemctl restart chat-me-api.service chat-me-admin.service
sudo nginx -t && sudo systemctl reload nginx
```

## Useful diagnostics

```bash
systemctl status chat-me-api.service chat-me-admin.service
journalctl -u chat-me-api.service -n 100 --no-pager
journalctl -u chat-me-admin.service -n 100 --no-pager
curl -s https://chat.example.com/health
```

## Security checklist

- Keep `/etc/chat-me.env` readable only by trusted system users.
- Rotate `SEED_OPERATOR_PASSWORD` right after first bootstrap.
- Set strict `allowedOrigins` for each project before opening public traffic.
- Configure TLS certificates before enabling external access.

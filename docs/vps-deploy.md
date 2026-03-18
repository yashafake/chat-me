# VPS deployment notes

Production target: `chat.black8.tech`

## Current production state

- HTTPS enabled with Let's Encrypt on `chat.black8.tech`
- Nginx reverse proxy routes:
  - `/admin/*` -> Next admin on `127.0.0.1:3005`
  - `/v1/*` -> API on `127.0.0.1:4105`
  - `/widget/*` -> static widget bundle from API
  - `/health` -> API healthcheck
- Local PostgreSQL database: `chat_me`
- Local PostgreSQL role: `chat_me`
- Systemd services:
  - `chat-me-api.service`
  - `chat-me-admin.service`

## Files on server

- app root: `/srv/chat-me/app`
- env file: `/etc/chat-me.env`
- nginx site: `/etc/nginx/sites-available/chat-me`
- nginx symlink: `/etc/nginx/sites-enabled/chat-me`
- SSL certs: `/etc/letsencrypt/live/chat.black8.tech/`

## Deploy flow

1. Sync repository to `/srv/chat-me/app`
2. `npm ci`
3. `npm run build`
4. `npm run migrate`
5. `npm run seed`
6. `systemctl restart chat-me-api.service chat-me-admin.service`
7. `nginx -t && systemctl reload nginx`

## Useful commands

```bash
systemctl status chat-me-api.service chat-me-admin.service
journalctl -u chat-me-api.service -n 100 --no-pager
journalctl -u chat-me-admin.service -n 100 --no-pager
curl -s https://chat.black8.tech/health
sudo -u postgres psql -d chat_me
```

## Notes

- `SEED_OPERATOR_PASSWORD` currently lives in `/etc/chat-me.env`; rotate it there and rerun `npm run seed`.
- `etern8-main` is active with production origins.
- `etern8-store` and `insales-store` should be unpaused only after their real `allowedOrigins` are set.
- SMTP is not yet wired on the server. The application code supports it, but `NOTIFICATION_EMAIL_TO` is empty until a relay/account is ready.

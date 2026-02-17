# KreAction Quotes - Setup Guide

## Quick Deploy (Recommended)

On a fresh **Ubuntu 22.04/24.04** VPS:

```bash
# 1. Point your domain DNS to the server IP first

# 2. SSH into the VPS as a regular user (not root)

# 3. Clone and run the setup script
sudo apt install git -y
git clone <your-repo-url> ~/kreaction-quotes
cd ~/kreaction-quotes
./docs/deploy.sh
```

The script walks you through everything interactively:

1. **Domain** — your app's URL (e.g., `billing.company.com`)
2. **SSL email** — for Let's Encrypt certificate notifications
3. **SMTP** — optional, can configure later in the app

Then it automatically:
- Installs Node.js 20, PostgreSQL, Redis, Caddy, pm2
- Creates the database with a random password
- Builds and starts the app
- Configures Caddy as reverse proxy with automatic SSL
- Opens firewall ports 22, 80, 443
- Sets up auto-start on reboot

When done, open your domain — first signup becomes admin.

## What Gets Installed

| Component | Purpose |
|-----------|---------|
| Node.js 20 | Runtime |
| PostgreSQL | Database |
| Redis | Background job queue (emails, reminders) |
| Caddy | Reverse proxy + automatic SSL (replaces Nginx + Certbot) |
| pm2 | Process manager (auto-restart, logs) |

## After Setup

### Configure in the app (Settings)
- **Branding** — company name, logos, accent color
- **Email** — SMTP settings and email templates (if not done during setup)
- **Auth** — Google OAuth or OIDC single sign-on (optional)
- **Payments** — Stripe and/or PayPal (optional)

### Common commands

```bash
pm2 status              # Check app status
pm2 logs                # View logs
pm2 restart all         # Restart app + worker
sudo caddy reload       # Reload reverse proxy config
```

### Update the app

```bash
cd ~/kreaction-quotes
git pull
npm install
npm run build
pm2 restart all
```

If the update includes database changes:

```bash
npx drizzle-kit push
```

## Ports

The VPS needs these ports open:

| Port | Service | Why |
|------|---------|-----|
| 22 | SSH | Server access |
| 80 | HTTP | Let's Encrypt certificate challenges |
| 443 | HTTPS | App traffic (Caddy handles SSL) |

Port 3001 (API) is internal only — Caddy proxies external traffic to it.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| SSL not working | Verify domain DNS points to server: `dig +short A yourdomain.com` |
| App not loading | Check if running: `pm2 status` and `pm2 logs` |
| Emails not sending | Configure SMTP in Settings > Email, check worker: `pm2 logs kreaction-worker` |
| Redis not running | `sudo systemctl status redis-server` |
| Database error | Check `.env` DATABASE_URL, verify PG is running: `sudo systemctl status postgresql` |
| Can't sign up | First signup may need email verification — check server logs for the link if SMTP isn't configured |
| Firewall blocking | `sudo ufw status` — should show 22, 80, 443 allowed |

## File Locations

| What | Where |
|------|-------|
| App code | `~/kreaction-quotes/` |
| Environment config | `~/kreaction-quotes/.env` |
| Caddy config | `/etc/caddy/Caddyfile` |
| Uploaded files | `~/kreaction-quotes/server/uploads/` |
| pm2 logs | `~/.pm2/logs/` |

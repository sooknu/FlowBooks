#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# ─── Already-installed check ──────────────────────────────────────────────────
FORCE=false
for arg in "$@"; do
  [[ "$arg" == "--force" ]] && FORCE=true
done

if [[ -f ".env" && "$FORCE" == false ]]; then
  warn "This app is already installed (.env exists)."
  warn "Run with ${BOLD}--force${NC} to re-install."
  exit 1
fi

# ─── Derive names from directory ──────────────────────────────────────────────
APP_NAME="$(basename "$PWD")"
DB_NAME="${APP_NAME//-/_}"
DB_USER="${DB_NAME}"
DB_PASSWORD="$(openssl rand -hex 16)"
AUTH_SECRET="$(openssl rand -hex 32)"

info "App name:  ${BOLD}${APP_NAME}${NC}"
info "DB name:   ${BOLD}${DB_NAME}${NC}"
info "DB user:   ${BOLD}${DB_USER}${NC}"

# ─── Ask for domain name ─────────────────────────────────────────────────────
echo ""
read -rp "Domain name: " DOMAIN_NAME

if [[ -z "$DOMAIN_NAME" ]]; then
  err "Domain name is required."
  exit 1
fi

ok "Domain: ${BOLD}${DOMAIN_NAME}${NC}"

# ─── Auto-detect available ports ─────────────────────────────────────────────
find_available_port() {
  local start=$1
  local port=$start
  while ss -tlnp | grep -q ":${port} "; do
    ((port++))
  done
  echo "$port"
}

REDIS_PORT=$(find_available_port 6379)
APP_PORT=$(find_available_port 3001)

ok "Redis port: ${BOLD}${REDIS_PORT}${NC}"
ok "App port:   ${BOLD}${APP_PORT}${NC}"

# ─── Create PostgreSQL user + database ────────────────────────────────────────
echo ""
info "Creating PostgreSQL user and database..."

if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  warn "PostgreSQL user ${BOLD}${DB_USER}${NC} already exists, skipping."
else
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
  ok "Created PostgreSQL user ${BOLD}${DB_USER}${NC}"
fi

if sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  warn "PostgreSQL database ${BOLD}${DB_NAME}${NC} already exists, skipping."
else
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  ok "Created PostgreSQL database ${BOLD}${DB_NAME}${NC}"
fi

# ─── Create Docker Redis ─────────────────────────────────────────────────────
info "Creating Docker Redis container..."

if docker ps -a --format '{{.Names}}' | grep -q "^${APP_NAME}-redis$"; then
  warn "Docker container ${BOLD}${APP_NAME}-redis${NC} already exists, skipping."
else
  docker run -d \
    --name "${APP_NAME}-redis" \
    --restart unless-stopped \
    -p "${REDIS_PORT}:6379" \
    redis:7-alpine
  ok "Created Redis container ${BOLD}${APP_NAME}-redis${NC} on port ${REDIS_PORT}"
fi

# ─── Generate .env ────────────────────────────────────────────────────────────
info "Generating .env file..."

cat > .env <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
BETTER_AUTH_SECRET=${AUTH_SECRET}
BETTER_AUTH_URL=https://${DOMAIN_NAME}
API_PORT=${APP_PORT}
CLIENT_ORIGIN=https://${DOMAIN_NAME}
REDIS_URL=redis://localhost:${REDIS_PORT}
PASSKEY_RP_ID=${DOMAIN_NAME}
PASSKEY_RP_NAME=${APP_NAME}
EOF

ok "Generated .env"

# ─── Generate ecosystem.config.cjs ───────────────────────────────────────────
info "Generating ecosystem.config.cjs..."

cat > ecosystem.config.cjs <<EOF
module.exports = {
  apps: [
    {
      name: '${APP_NAME}-server',
      script: 'npx',
      args: 'tsx --env-file=.env server/index.ts',
      cwd: __dirname,
    },
    {
      name: '${APP_NAME}-worker',
      script: 'npx',
      args: 'tsx --env-file=.env server/worker.ts',
      cwd: __dirname,
    },
  ],
};
EOF

ok "Generated ecosystem.config.cjs"

# ─── npm install, db push, build ─────────────────────────────────────────────
echo ""
info "Running npm install..."
npm install
ok "npm install complete"

info "Pushing database schema..."
npm run db:push
ok "Database schema pushed"

info "Building application..."
npm run build
ok "Build complete"

# ─── Generate Nginx config ───────────────────────────────────────────────────
echo ""
info "Generating Nginx config..."

sudo tee "/etc/nginx/sites-available/${DOMAIN_NAME}" > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 10M;
    }
}
EOF

sudo ln -sf "/etc/nginx/sites-available/${DOMAIN_NAME}" "/etc/nginx/sites-enabled/"
sudo nginx -t && sudo systemctl reload nginx

ok "Nginx configured for ${BOLD}${DOMAIN_NAME}${NC}"

# ─── Certbot ─────────────────────────────────────────────────────────────────
info "Requesting SSL certificate..."
sudo certbot --nginx -d "${DOMAIN_NAME}" --non-interactive --agree-tos --register-unsafely-without-email
ok "SSL certificate installed"

# ─── Start pm2 ───────────────────────────────────────────────────────────────
info "Starting pm2 processes..."
pm2 start ecosystem.config.cjs
pm2 save
ok "pm2 processes started and saved"

# ─── Completion banner ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}App URL:${NC}       https://${DOMAIN_NAME}"
echo -e "  ${BOLD}Setup URL:${NC}     https://${DOMAIN_NAME}/setup"
echo ""
echo -e "  ${BOLD}Database:${NC}      ${DB_NAME}"
echo -e "  ${BOLD}Redis port:${NC}    ${REDIS_PORT}"
echo -e "  ${BOLD}App port:${NC}      ${APP_PORT}"
echo -e "  ${BOLD}pm2 server:${NC}    ${APP_NAME}-server"
echo -e "  ${BOLD}pm2 worker:${NC}    ${APP_NAME}-worker"
echo ""
echo -e "  Go to ${BOLD}https://${DOMAIN_NAME}/setup${NC} to complete installation."
echo ""

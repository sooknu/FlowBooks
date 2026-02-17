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

# ─── Must run from app root (where package.json lives) ──────────────────────
if [[ ! -f "package.json" ]]; then
  err "package.json not found in current directory."
  err "Run this script from the app root: ${BOLD}cd ~/YourApp && bash scripts/install.sh${NC}"
  exit 1
fi

# ─── Already-installed check ────────────────────────────────────────────────
FORCE=false
for arg in "$@"; do
  [[ "$arg" == "--force" ]] && FORCE=true
done

if [[ -f ".env" && "$FORCE" == false ]]; then
  warn "This app is already installed (.env exists)."
  warn "Run with ${BOLD}--force${NC} to re-install."
  exit 1
fi

# ─── Derive names from directory ─────────────────────────────────────────────
APP_NAME="$(basename "$PWD")"
# Lowercase, replace hyphens with underscores, strip anything not alphanumeric/underscore
DB_NAME="$(echo "${APP_NAME}" | tr '[:upper:]' '[:lower:]' | tr '-' '_' | sed 's/[^a-z0-9_]//g')"
DB_USER="${DB_NAME}"
DB_PASSWORD="$(openssl rand -hex 16)"
AUTH_SECRET="$(openssl rand -hex 32)"

if [[ -z "$DB_NAME" ]]; then
  err "Could not derive a valid database name from directory: ${APP_NAME}"
  exit 1
fi

info "App name:  ${BOLD}${APP_NAME}${NC}"
info "DB name:   ${BOLD}${DB_NAME}${NC}"
info "DB user:   ${BOLD}${DB_USER}${NC}"

# ─── Ask for domain name ────────────────────────────────────────────────────
echo ""
read -rp "Domain name: " DOMAIN_NAME

if [[ -z "$DOMAIN_NAME" ]]; then
  err "Domain name is required."
  exit 1
fi

ok "Domain: ${BOLD}${DOMAIN_NAME}${NC}"

echo ""
echo "  SSL options:"
echo "    1) Certbot (Let's Encrypt) — direct server, no proxy"
echo "    2) Cloudflare proxy — Origin Certificate for Full (Strict) mode"
echo "    3) Skip — configure SSL later"
echo ""
read -rp "  Choose [1/2/3]: " SSL_CHOICE
SSL_CHOICE="${SSL_CHOICE:-1}"

if [[ "$SSL_CHOICE" == "2" ]]; then
  echo ""
  echo "  Create an Origin Certificate in Cloudflare:"
  echo "    SSL/TLS → Origin Server → Create Certificate"
  echo "    Keep defaults (RSA, 15 years) → Create"
  echo ""
  echo "  Paste the ${BOLD}Origin Certificate${NC} below, then press Enter and Ctrl+D:"
  CF_CERT=$(cat)
  echo ""
  echo "  Paste the ${BOLD}Private Key${NC} below, then press Enter and Ctrl+D:"
  CF_KEY=$(cat)

  if [[ -z "$CF_CERT" || -z "$CF_KEY" ]]; then
    warn "Certificate or key is empty. Falling back to skip."
    SSL_CHOICE="3"
  else
    sudo tee /etc/ssl/cloudflare-cert.pem > /dev/null <<< "$CF_CERT"
    sudo tee /etc/ssl/cloudflare-key.pem > /dev/null <<< "$CF_KEY"
    sudo chmod 600 /etc/ssl/cloudflare-key.pem
    ok "Cloudflare Origin Certificate saved"
  fi
fi

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

# ─── Auto-detect PostgreSQL port ─────────────────────────────────────────────
PG_PORT=$(sudo -u postgres psql -tc "SHOW port;" 2>/dev/null | tr -d ' ' || echo "5432")
if [[ -z "$PG_PORT" ]]; then
  PG_PORT="5432"
fi
ok "PG port:    ${BOLD}${PG_PORT}${NC}"

# ─── Create PostgreSQL user + database ──────────────────────────────────────
echo ""
info "Creating PostgreSQL user and database..."

if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  # User exists — update password to match the new .env (handles --force re-installs)
  sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
  ok "PostgreSQL user ${BOLD}${DB_USER}${NC} already exists, password updated"
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

# ─── Create Docker Redis ────────────────────────────────────────────────────
info "Creating Docker Redis container..."

REDIS_CONTAINER="${APP_NAME}-redis"
if docker ps -a --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
  # Ensure it's running
  docker start "${REDIS_CONTAINER}" &>/dev/null || true
  warn "Docker container ${BOLD}${REDIS_CONTAINER}${NC} already exists, ensured running."
else
  docker run -d \
    --name "${REDIS_CONTAINER}" \
    --restart unless-stopped \
    -p "${REDIS_PORT}:6379" \
    redis:8-alpine
  ok "Created Redis container ${BOLD}${REDIS_CONTAINER}${NC} on port ${REDIS_PORT}"
fi

# ─── Generate .env ───────────────────────────────────────────────────────────
info "Generating .env file..."

cat > .env <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PG_PORT}/${DB_NAME}
BETTER_AUTH_SECRET=${AUTH_SECRET}
BETTER_AUTH_URL=https://${DOMAIN_NAME}
API_PORT=${APP_PORT}
CLIENT_ORIGIN=https://${DOMAIN_NAME}
REDIS_URL=redis://localhost:${REDIS_PORT}
PASSKEY_RP_ID=${DOMAIN_NAME}
PASSKEY_RP_NAME=${APP_NAME}
EOF

ok "Generated .env"

# ─── Generate ecosystem.config.cjs ──────────────────────────────────────────
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

# ─── npm install, db push, build ────────────────────────────────────────────
echo ""
info "Running npm install..."
npm install
ok "npm install complete"

info "Pushing database schema..."
if ! npm run db:push; then
  err "Database schema push failed. Check DATABASE_URL in .env"
  exit 1
fi
ok "Database schema pushed"

info "Building application..."
if ! npm run build; then
  err "Build failed."
  exit 1
fi
ok "Build complete"

# ─── Start pm2 + auto-start on reboot ───────────────────────────────────────
# Start pm2 BEFORE SSL — so the app is running even if certbot fails
echo ""
info "Starting pm2 processes..."
pm2 start ecosystem.config.cjs
pm2 save

# Set up pm2 to start on boot
sudo env PATH="$PATH" "$(which pm2)" startup systemd -u "$(whoami)" --hp "$HOME"

ok "pm2 processes started and saved"

# ─── Generate Nginx config ──────────────────────────────────────────────────
echo ""
info "Generating Nginx config..."

PROXY_BLOCK="        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 10M;"

if [[ "$SSL_CHOICE" == "2" ]]; then
  # Cloudflare Origin Certificate — Nginx listens on 80 + 443
  sudo tee "/etc/nginx/sites-available/${DOMAIN_NAME}" > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN_NAME};

    ssl_certificate /etc/ssl/cloudflare-cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare-key.pem;

    location / {
${PROXY_BLOCK}
    }
}
EOF
else
  # Certbot or Skip — Nginx listens on port 80 only (certbot adds SSL later)
  sudo tee "/etc/nginx/sites-available/${DOMAIN_NAME}" > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    location / {
${PROXY_BLOCK}
    }
}
EOF
fi

sudo ln -sf "/etc/nginx/sites-available/${DOMAIN_NAME}" "/etc/nginx/sites-enabled/"
sudo nginx -t && sudo systemctl reload nginx

ok "Nginx configured for ${BOLD}${DOMAIN_NAME}${NC}"

# ─── SSL (Certbot only) ─────────────────────────────────────────────────────
if [[ "$SSL_CHOICE" == "1" ]]; then
  info "Requesting SSL certificate via Certbot..."
  if sudo certbot --nginx -d "${DOMAIN_NAME}" --non-interactive --agree-tos --register-unsafely-without-email; then
    ok "SSL certificate installed"
  else
    warn "Certbot failed — the app is running but without SSL."
    warn "Fix DNS and re-run: ${BOLD}sudo certbot --nginx -d ${DOMAIN_NAME}${NC}"
  fi
elif [[ "$SSL_CHOICE" == "2" ]]; then
  ok "Cloudflare Origin Certificate configured — set SSL/TLS to ${BOLD}Full (Strict)${NC}"
elif [[ "$SSL_CHOICE" == "3" ]]; then
  ok "Skipping SSL — configure manually later"
fi

# ─── Completion banner ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Installation complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}App URL:${NC}       https://${DOMAIN_NAME}"
echo -e "  ${BOLD}Setup URL:${NC}     https://${DOMAIN_NAME}/setup"
echo ""
echo -e "  ${BOLD}Database:${NC}      ${DB_NAME} (port ${PG_PORT})"
echo -e "  ${BOLD}Redis port:${NC}    ${REDIS_PORT}"
echo -e "  ${BOLD}App port:${NC}      ${APP_PORT}"
echo -e "  ${BOLD}pm2 server:${NC}    ${APP_NAME}-server"
echo -e "  ${BOLD}pm2 worker:${NC}    ${APP_NAME}-worker"
echo ""
echo -e "  Go to ${BOLD}https://${DOMAIN_NAME}/setup${NC} to complete installation."
echo ""

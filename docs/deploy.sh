#!/usr/bin/env bash
# ============================================================================
# KreAction Quotes — One-Command VPS Setup
# Tested on Ubuntu 22.04 / 24.04
#
# Prerequisites: Fresh VPS with Ubuntu, domain DNS pointing to the server
# Ports 80 and 443 must be open (script configures firewall automatically)
#
# Usage:
#   git clone <repo-url> ~/kreaction-quotes
#   cd ~/kreaction-quotes
#   ./docs/deploy.sh
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors & helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "  ${CYAN}>>>${NC} $1"; }
success() { echo -e "  ${GREEN} +${NC} $1"; }
warn()    { echo -e "  ${YELLOW} !${NC} $1"; }
fail()    { echo -e "  ${RED} x${NC} $1"; exit 1; }
step()    { echo -e "\n${BOLD}$1${NC}"; echo -e "${DIM}$(printf '%.0s─' {1..50})${NC}"; }

ask() {
  local prompt="$1" default="${2:-}" reply
  if [ -n "$default" ]; then
    read -rp "$(echo -e "  ${BOLD}$prompt${NC} [${DIM}$default${NC}]: ")" reply
    echo "${reply:-$default}"
  else
    read -rp "$(echo -e "  ${BOLD}$prompt${NC}: ")" reply
    echo "$reply"
  fi
}

ask_secret() {
  local prompt="$1" reply
  read -srp "$(echo -e "  ${BOLD}$prompt${NC}: ")" reply
  echo ""
  echo "$reply"
}

yesno() {
  local prompt="$1" reply
  read -rp "$(echo -e "  ${BOLD}$prompt${NC} [y/N]: ")" reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}┌──────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│       KreAction Quotes — Server Setup        │${NC}"
echo -e "${BOLD}└──────────────────────────────────────────────┘${NC}"
echo ""

if [ "$EUID" -eq 0 ]; then
  fail "Don't run as root. Use a regular user with sudo access."
fi

command -v sudo &>/dev/null || fail "sudo is required."
command -v git  &>/dev/null || fail "git is required. Install: sudo apt install git"

# Detect install dir (script lives in docs/, app root is one level up)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../package.json" ]; then
  INSTALL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  info "Detected app directory: $INSTALL_DIR"
  ALREADY_CLONED=true
else
  INSTALL_DIR="/home/$USER/kreaction-quotes"
  ALREADY_CLONED=false
fi

# ---------------------------------------------------------------------------
# Step 1: Required info
# ---------------------------------------------------------------------------
step "Step 1/7 — Your domain"

echo -e "  Before continuing, make sure your domain's DNS A record"
echo -e "  points to this server's IP address."
echo ""

DOMAIN=$(ask "Domain (e.g., billing.company.com)")
[ -z "$DOMAIN" ] && fail "Domain is required"

SSL_EMAIL=$(ask "Email for SSL certificate (Let's Encrypt)" "")

if ! $ALREADY_CLONED; then
  echo ""
  REPO_URL=$(ask "Git repository URL")
  [ -z "$REPO_URL" ] && fail "Repository URL is required"
fi

# ---------------------------------------------------------------------------
# Step 2: Optional — SMTP
# ---------------------------------------------------------------------------
step "Step 2/7 — Email (SMTP)"

echo -e "  SMTP is needed to send quotes, invoices, and notifications."
echo -e "  You can skip this and configure it later in Settings > Email."
echo ""

SMTP_HOST="" SMTP_PORT="587" SMTP_USER="" SMTP_PASS="" SMTP_FROM=""
if yesno "Configure SMTP now?"; then
  SMTP_HOST=$(ask "SMTP host" "smtp.gmail.com")
  SMTP_PORT=$(ask "SMTP port" "587")
  SMTP_USER=$(ask "SMTP username/email")
  SMTP_PASS=$(ask_secret "SMTP password")
  SMTP_FROM=$(ask "From email address" "$SMTP_USER")
  success "SMTP configured"
else
  info "Skipped — configure later in the app"
fi

# ---------------------------------------------------------------------------
# Auto-generate everything else
# ---------------------------------------------------------------------------
DB_NAME="kreaction"
DB_USER="kreaction"
DB_PASS=$(openssl rand -hex 16)
AUTH_SECRET=$(openssl rand -hex 32)
API_PORT="3001"
REDIS_PORT="6379"

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------
step "Review"

echo -e "  ${BOLD}Domain:${NC}     $DOMAIN"
echo -e "  ${BOLD}App URL:${NC}    https://$DOMAIN"
echo -e "  ${BOLD}Directory:${NC}  $INSTALL_DIR"
echo -e "  ${BOLD}Database:${NC}   $DB_NAME"
echo -e "  ${BOLD}SMTP:${NC}       ${SMTP_HOST:-not configured (will set up later)}"
echo ""

if ! yesno "Everything look good? Start installation?"; then
  echo "Aborted."
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 3: Install system packages
# ---------------------------------------------------------------------------
step "Step 3/7 — Installing system packages"

sudo apt-get update -qq

# Node.js 20.x
if ! command -v node &>/dev/null || ! node -v 2>/dev/null | grep -q "v20"; then
  info "Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
  sudo apt-get install -y -qq nodejs
fi
success "Node.js $(node -v)"

# PostgreSQL
if ! command -v psql &>/dev/null; then
  info "Installing PostgreSQL..."
  sudo apt-get install -y -qq postgresql postgresql-contrib
  sudo systemctl enable --now postgresql >/dev/null
fi
success "PostgreSQL $(psql --version | grep -oP '\d+\.\d+')"

# Redis
if ! command -v redis-server &>/dev/null; then
  info "Installing Redis..."
  sudo apt-get install -y -qq redis-server
fi
sudo systemctl enable --now redis-server >/dev/null
success "Redis $(redis-server --version | grep -oP 'v=\K[0-9.]+')"

# Caddy (automatic SSL)
if ! command -v caddy &>/dev/null; then
  info "Installing Caddy..."
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
fi
success "Caddy $(caddy version 2>/dev/null | head -1)"

# pm2
if ! command -v pm2 &>/dev/null; then
  info "Installing pm2..."
  sudo npm install -g pm2 >/dev/null 2>&1
fi
success "pm2 $(pm2 -v 2>/dev/null)"

# ---------------------------------------------------------------------------
# Step 4: Firewall
# ---------------------------------------------------------------------------
if command -v ufw &>/dev/null; then
  info "Configuring firewall (ports 22, 80, 443)..."
  sudo ufw allow 22/tcp >/dev/null 2>&1
  sudo ufw allow 80/tcp >/dev/null 2>&1
  sudo ufw allow 443/tcp >/dev/null 2>&1
  sudo ufw --force enable >/dev/null 2>&1
  success "Firewall configured (SSH + HTTP + HTTPS)"
fi

# ---------------------------------------------------------------------------
# Step 5: PostgreSQL database
# ---------------------------------------------------------------------------
step "Step 4/7 — Database"

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null | grep -q 1; then
  success "User '$DB_USER' exists"
else
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" >/dev/null
  success "Created user '$DB_USER'"
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
  success "Database '$DB_NAME' exists"
else
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null
  success "Created database '$DB_NAME'"
fi

PG_PORT=$(sudo -u postgres psql -tAc "SHOW port" 2>/dev/null | tr -d '[:space:]')
PG_PORT=${PG_PORT:-5432}
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:$PG_PORT/$DB_NAME"

# ---------------------------------------------------------------------------
# Step 6: App setup
# ---------------------------------------------------------------------------
step "Step 5/7 — Application"

# Clone if needed
if ! $ALREADY_CLONED; then
  info "Cloning repository..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
success "Code ready"

# Install deps
info "Installing dependencies (this may take a minute)..."
npm install --production=false --loglevel=error
success "Dependencies installed"

# Create .env
cat > "$INSTALL_DIR/.env" <<ENVEOF
DATABASE_URL=$DATABASE_URL
BETTER_AUTH_SECRET=$AUTH_SECRET
BETTER_AUTH_URL=https://$DOMAIN
API_PORT=$API_PORT
CLIENT_ORIGIN=https://$DOMAIN
REDIS_URL=redis://localhost:$REDIS_PORT
ENVEOF

chmod 600 "$INSTALL_DIR/.env"
success ".env created"

# Push schema
info "Setting up database tables..."
npx drizzle-kit push --force 2>&1 | tail -3
success "Database schema ready"

# Seed SMTP settings into app_settings if provided
if [ -n "$SMTP_HOST" ]; then
  info "Saving SMTP settings to database..."
  sudo -u postgres psql -d "$DB_NAME" -q <<SQLEOF
INSERT INTO app_settings (key, value) VALUES
  ('smtp_enabled', 'true'),
  ('smtp_host', '$SMTP_HOST'),
  ('smtp_port', '$SMTP_PORT'),
  ('smtp_user', '$SMTP_USER'),
  ('smtp_pass', '$SMTP_PASS'),
  ('smtp_from', '$SMTP_FROM'),
  ('smtp_encryption', 'TLS')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQLEOF
  success "SMTP settings saved"
fi

# Build frontend
info "Building frontend..."
npm run build 2>&1 | tail -5
success "Frontend built"

# ---------------------------------------------------------------------------
# Step 7: Start services
# ---------------------------------------------------------------------------
step "Step 6/7 — Starting services"

# pm2
cd "$INSTALL_DIR"
pm2 delete kreaction-quotes 2>/dev/null || true
pm2 delete kreaction-worker 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save --force >/dev/null

# pm2 startup on reboot
STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | grep "sudo" | head -1) || true
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" >/dev/null 2>&1 || true
fi
success "App running (pm2)"

# Wait for app to be ready
info "Waiting for app to start..."
for i in {1..15}; do
  if curl -sf "http://127.0.0.1:$API_PORT/api/settings/public" >/dev/null 2>&1; then
    success "App is responding"
    break
  fi
  sleep 1
  if [ "$i" -eq 15 ]; then
    warn "App may still be starting. Check: pm2 logs"
  fi
done

# ---------------------------------------------------------------------------
# Step 8: Caddy reverse proxy + automatic SSL
# ---------------------------------------------------------------------------
step "Step 7/7 — Caddy (reverse proxy + SSL)"

# Stop default Caddy if running
sudo systemctl stop caddy 2>/dev/null || true

# Write Caddyfile
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDYEOF
$DOMAIN {
    reverse_proxy 127.0.0.1:$API_PORT

    # File upload limit
    request_body {
        max_size 10MB
    }
}
CADDYEOF

# Add email for SSL if provided
if [ -n "$SSL_EMAIL" ]; then
  sudo sed -i "1i\\
{\\
    email $SSL_EMAIL\\
}\\
" /etc/caddy/Caddyfile
fi

sudo systemctl enable caddy >/dev/null
sudo systemctl start caddy

# Wait for Caddy to obtain certificate
info "Caddy is obtaining SSL certificate (may take 30-60 seconds)..."
SSL_OK=false
for i in {1..60}; do
  if curl -sf "https://$DOMAIN/api/settings/public" >/dev/null 2>&1; then
    SSL_OK=true
    break
  fi
  sleep 2
done

if $SSL_OK; then
  success "SSL certificate active — https://$DOMAIN is live!"
else
  warn "SSL may still be provisioning. Verify: sudo caddy validate --config /etc/caddy/Caddyfile"
  warn "Make sure your domain DNS points to this server and ports 80/443 are open."
fi

# ---------------------------------------------------------------------------
# Done!
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}┌──────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│           Setup Complete!                     │${NC}"
echo -e "${BOLD}└──────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${GREEN}Your app is live at:${NC}  ${BOLD}https://$DOMAIN${NC}"
echo ""
echo -e "  ${BOLD}What to do next:${NC}"
echo -e "  1. Open ${BOLD}https://$DOMAIN${NC} in your browser"
echo -e "  2. Sign up with email & password"
echo -e "  3. ${GREEN}First signup = admin${NC} (full access to Settings)"
echo -e "  4. Go to Settings to configure branding, email, payments"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "  ${DIM}pm2 status${NC}              Check app status"
echo -e "  ${DIM}pm2 logs${NC}                View logs"
echo -e "  ${DIM}pm2 restart all${NC}         Restart app"
echo -e "  ${DIM}sudo caddy reload${NC}       Reload Caddy config"
echo ""
echo -e "  ${BOLD}Update the app:${NC}"
echo -e "  ${DIM}cd $INSTALL_DIR && git pull && npm install && npm run build && pm2 restart all${NC}"
echo ""
echo -e "  ${BOLD}Credentials saved in:${NC}  $INSTALL_DIR/.env"
echo -e "  ${BOLD}Database password:${NC}     $DB_PASS"
echo -e "  ${DIM}(save this somewhere safe — it won't be shown again)${NC}"
echo ""

#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# VPS Provisioning Script for Ubuntu 22.04 / 24.04
# Installs: Node.js 20, PostgreSQL, Docker CE, pm2, Nginx, Certbot, UFW
# Each section is idempotent — safe to re-run.
# =============================================================================

# -- Colors -------------------------------------------------------------------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

done_msg()  { echo -e "${GREEN}${BOLD} done${RESET}  $1"; }
info_msg()  { echo -e "${BLUE}${BOLD} installing${RESET}  $1"; }

# -- Root check ---------------------------------------------------------------
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Error: this script must be run as root." >&2
  exit 1
fi

echo ""
echo -e "${BOLD}VPS Provisioning Script${RESET}"
echo "========================================"
echo ""

# =============================================================================
# 1. System update
# =============================================================================
info_msg "System packages (apt update && apt upgrade)"
apt update -qq
apt upgrade -y -qq
done_msg "System packages up to date"

# =============================================================================
# 2. Node.js 24 LTS via NodeSource
# =============================================================================
if node --version 2>/dev/null | grep -q 'v24'; then
  done_msg "Node.js 24 already installed ($(node --version))"
else
  info_msg "Node.js 24 LTS via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt install -y -qq nodejs
  done_msg "Node.js installed ($(node --version))"
fi

# =============================================================================
# 3. PostgreSQL (official pgdg repo)
# =============================================================================
if command -v psql &>/dev/null; then
  done_msg "PostgreSQL already installed ($(psql --version))"
else
  info_msg "PostgreSQL from pgdg repository"
  apt install -y -qq curl ca-certificates
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt update -qq
  apt install -y -qq postgresql postgresql-contrib
  done_msg "PostgreSQL installed ($(psql --version))"
fi

# =============================================================================
# 4. Docker CE (official Docker repo)
# =============================================================================
if command -v docker &>/dev/null; then
  done_msg "Docker already installed ($(docker --version))"
else
  info_msg "Docker CE from official repository"
  apt install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt update -qq
  apt install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  done_msg "Docker installed ($(docker --version))"
fi

# =============================================================================
# 5. pm2 (global via npm)
# =============================================================================
if command -v pm2 &>/dev/null; then
  done_msg "pm2 already installed ($(pm2 --version))"
else
  info_msg "pm2 (global)"
  npm install -g pm2
  done_msg "pm2 installed ($(pm2 --version))"
fi

# =============================================================================
# 6. Nginx
# =============================================================================
if command -v nginx &>/dev/null; then
  done_msg "Nginx already installed ($(nginx -v 2>&1))"
else
  info_msg "Nginx"
  apt install -y -qq nginx
  done_msg "Nginx installed ($(nginx -v 2>&1))"
fi

# =============================================================================
# 7. Certbot via snap
# =============================================================================
if command -v certbot &>/dev/null; then
  done_msg "Certbot already installed ($(certbot --version 2>&1))"
else
  info_msg "Certbot via snap"
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
  done_msg "Certbot installed ($(certbot --version 2>&1))"
fi

# =============================================================================
# 8. UFW firewall
# =============================================================================
if ufw status 2>/dev/null | grep -q 'Status: active'; then
  done_msg "UFW already active"
else
  info_msg "UFW firewall rules"
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable
  done_msg "UFW enabled (OpenSSH + Nginx Full)"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================"
echo -e "${BOLD}Provisioning Complete${RESET}"
echo "========================================"
echo ""
echo "  Node.js      $(node --version 2>/dev/null || echo 'not found')"
echo "  npm          $(npm --version 2>/dev/null || echo 'not found')"
echo "  PostgreSQL   $(psql --version 2>/dev/null || echo 'not found')"
echo "  Docker       $(docker --version 2>/dev/null || echo 'not found')"
echo "  pm2          $(pm2 --version 2>/dev/null || echo 'not found')"
echo "  Nginx        $(nginx -v 2>&1 || echo 'not found')"
echo "  Certbot      $(certbot --version 2>&1 || echo 'not found')"
echo "  UFW          $(ufw status | head -1)"
echo ""
echo "Next steps:"
echo "  1. Create app user:    adduser deploy"
echo "  2. Configure PostgreSQL databases and users"
echo "  3. Start Redis containers (Docker)"
echo "  4. Clone app repos and npm install"
echo "  5. Set up Nginx server blocks + certbot --nginx"
echo ""

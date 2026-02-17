#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# VPS Provisioning Script
# Supports: Ubuntu 22.04+, Debian 11+
# Installs: Node.js 24, PostgreSQL, Docker CE, pm2, Nginx, Certbot, UFW
# Each section is idempotent — safe to re-run.
# =============================================================================

# -- Colors -------------------------------------------------------------------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

done_msg()  { echo -e "${GREEN}${BOLD} done${RESET}  $1"; }
info_msg()  { echo -e "${BLUE}${BOLD} installing${RESET}  $1"; }
err_msg()   { echo -e "${RED}${BOLD} error${RESET}  $1"; }

# -- Root check ---------------------------------------------------------------
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Error: this script must be run as root." >&2
  exit 1
fi

# -- Suppress interactive prompts during apt ----------------------------------
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo ""
echo -e "${BOLD}VPS Provisioning Script${RESET}"
echo "========================================"
echo ""

# -- Detect distro ------------------------------------------------------------
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  DISTRO="${ID}"
  CODENAME="${VERSION_CODENAME:-}"
else
  err_msg "Cannot detect OS. /etc/os-release not found."
  exit 1
fi

if [[ "$DISTRO" != "ubuntu" && "$DISTRO" != "debian" ]]; then
  err_msg "Unsupported distro: ${DISTRO}. Only Ubuntu and Debian are supported."
  exit 1
fi

done_msg "Detected ${BOLD}${DISTRO} ${CODENAME}${RESET}"

# =============================================================================
# 1. System update + essentials
# =============================================================================
info_msg "System packages (apt update && apt upgrade)"
apt update -qq
apt upgrade -y -qq
apt install -y -qq curl ca-certificates gnupg lsb-release
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

# Update npm to latest
npm install -g npm@latest &>/dev/null
done_msg "npm $(npm --version)"

# =============================================================================
# 3. PostgreSQL (official pgdg repo)
# =============================================================================
if command -v psql &>/dev/null; then
  done_msg "PostgreSQL already installed ($(psql --version))"
else
  info_msg "PostgreSQL from pgdg repository"
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main" \
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
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DISTRO}/gpg" \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${DISTRO} ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt update -qq
  apt install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  done_msg "Docker installed ($(docker --version))"
fi

# Add all non-root users with login shells to docker group
for u in $(awk -F: '$7 ~ /(bash|zsh|sh)$/ && $3 >= 1000 { print $1 }' /etc/passwd); do
  if ! id -nG "$u" 2>/dev/null | grep -qw docker; then
    usermod -aG docker "$u"
    done_msg "Added ${u} to docker group"
  fi
done

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
# 7. Certbot
# =============================================================================
if command -v certbot &>/dev/null; then
  done_msg "Certbot already installed ($(certbot --version 2>&1))"
elif command -v snap &>/dev/null; then
  info_msg "Certbot via snap"
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
  done_msg "Certbot installed ($(certbot --version 2>&1))"
else
  info_msg "Certbot via apt (snap not available)"
  apt install -y -qq certbot python3-certbot-nginx
  done_msg "Certbot installed ($(certbot --version 2>&1))"
fi

# =============================================================================
# 8. UFW firewall
# =============================================================================
if ! command -v ufw &>/dev/null; then
  apt install -y -qq ufw
fi

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
echo -e "  ${BOLD}Note:${RESET} Log out and back in for docker group to take effect."
echo ""
echo "Next steps:"
echo "  1. Log out and back in (docker group)"
echo "  2. Clone the app repo"
echo "  3. Run: bash scripts/install.sh"
echo ""

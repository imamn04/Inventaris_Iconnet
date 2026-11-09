#!/bin/bash
# ========================================================
# ICONNET INVENTORY SYSTEM - VPS AUTO DEPLOYMENT SCRIPT
# Supported OS: Ubuntu 20.04 / 22.04 / 24.04 LTS & Debian
# ========================================================

set -e

echo "=== [1/5] Updating System Packages ==="
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw fail2ban certbot

echo "=== [2/5] Installing Docker & Docker Compose ==="
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "Docker installed successfully."
fi

echo "=== [3/5] Configuring Firewall (UFW) ==="
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
echo "y" | sudo ufw enable

echo "=== [4/5] Preparing Environment Variables ==="
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Please review credentials if necessary."
fi

echo "=== [5/5] Building & Launching Docker Services ==="
docker compose up -d --build

echo ""
echo "========================================================"
echo "🎉 DEPLOYMENT SUKSES!"
echo "Iconnet Inventory System kini aktif di port 80/443."
echo "Silakan akses server melalui IP / Domain Anda."
echo "Login default: admin / admin123"
echo "========================================================"


#!/usr/bin/env bash
# ============================================================
# OmniCanvas — One-Click Docker Deployment Script (Linux/Mac)
# ============================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}         🎨 OmniCanvas One-Click Docker Deploy      ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Check Docker installation
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[Error] Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check Docker Compose installation
DOCKER_COMPOSE="docker compose"
if ! docker compose version &> /dev/null; then
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        echo -e "${RED}[Error] Docker Compose is not installed.${NC}"
        exit 1
    fi
fi

# Ensure server/.env exists
if [ ! -f "server/.env" ]; then
    if [ -f "server/.env.example" ]; then
        echo -e "${YELLOW}[Notice] server/.env not found. Creating from server/.env.example...${NC}"
        cp server/.env.example server/.env
    else
        echo -e "${YELLOW}[Notice] Creating server/.env configuration...${NC}"
        touch server/.env
    fi
fi

# Build and start containers
echo -e "${CYAN}[1/3] Building and starting OmniCanvas Docker containers...${NC}"
$DOCKER_COMPOSE up -d --build

echo -e "${CYAN}[2/3] Checking container status...${NC}"
$DOCKER_COMPOSE ps

echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN} 🎉 OmniCanvas Successfully Deployed with Docker!   ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e " 🌐 Frontend Canvas App : ${CYAN}http://localhost${NC}"
echo -e " 🛠️ Admin Dashboard     : ${CYAN}http://localhost/admin${NC}"
echo -e " ⚙️ Backend API Engine  : ${CYAN}http://localhost:3000${NC}"
echo -e "${GREEN}====================================================${NC}"

#!/usr/bin/env bash
# ============================================================
# OmniCanvas Server — One-Click Docker Deployment (Linux/Mac)
# ============================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}      🎨 OmniCanvas Backend Server Docker Deploy     ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[Error] Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check Docker Compose
DOCKER_COMPOSE="docker compose"
if ! docker compose version &> /dev/null; then
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        echo -e "${RED}[Error] Docker Compose is not installed.${NC}"
        exit 1
    fi
fi

# Ensure .env exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}[Notice] .env not found. Creating from .env.example...${NC}"
        cp .env.example .env
    else
        echo -e "${YELLOW}[Notice] Creating .env configuration...${NC}"
        touch .env
    fi
fi

# Preflight checks: lockfiles
if [ ! -f "bun.lock" ]; then
    echo -e "${RED}[Error] Missing bun.lock — required for frozen installation.${NC}"
    exit 1
fi

# Build and start container
echo -e "${CYAN}[1/2] Building and starting OmniCanvas Backend container...${NC}"
$DOCKER_COMPOSE up -d --build

echo -e "${CYAN}[2/2] Checking container status...${NC}"
$DOCKER_COMPOSE ps

echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN} 🎉 Backend Server Successfully Deployed with Docker! ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e " ⚙️ Backend API Engine  : ${CYAN}http://localhost:3000${NC}"
echo -e "${GREEN}====================================================${NC}"

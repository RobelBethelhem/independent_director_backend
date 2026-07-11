#!/usr/bin/env bash
# Run this ON the Application Server (10.1.2.136), from wherever the backend
# repo is cloned (e.g. ~/zemen/backend). Pulls the latest backend + frontend
# code and rebuilds/restarts the on-prem stack.
#
#   bash deploy/onprem/deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")/../.."   # -> backend/ repo root

echo "==> Pulling backend..."
git pull --ff-only

echo "==> Pulling frontend (expected as a sibling folder: ../frontend)..."
(cd ../frontend && git pull --ff-only)

echo "==> Rebuilding & restarting containers..."
docker compose -f docker-compose.onprem.yml up -d --build

echo "==> Pruning old images..."
docker image prune -f >/dev/null

echo "==> Status:"
docker compose -f docker-compose.onprem.yml ps

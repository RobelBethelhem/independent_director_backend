#!/usr/bin/env bash
# Interactively fills in deploy/onprem/backend.env and deploy/onprem/minio.env
# on the Application Server. Contains NO real secrets itself — it only prompts
# for them at runtime — so it's safe to keep in git, unlike the .env files
# themselves (which are gitignored).
#
# Run from the backend/ repo root:
#   bash deploy/onprem/configure-env.sh
set -euo pipefail
cd "$(dirname "$0")/../.."   # -> backend/ repo root

BACKEND_ENV="deploy/onprem/backend.env"
MINIO_ENV="deploy/onprem/minio.env"

[ -f "$BACKEND_ENV" ] || cp deploy/onprem/backend.env.example "$BACKEND_ENV"
[ -f "$MINIO_ENV" ]   || cp deploy/onprem/minio.env.example   "$MINIO_ENV"

# Minimal, dependency-free encoder for the handful of characters that break a
# postgres:// connection URL if left literal (most likely offender: '@').
urlencode() {
  local s="$1"
  s="${s//%/%25}"
  s="${s//@/%40}"
  s="${s//:/%3A}"
  s="${s//\//%2F}"
  s="${s// /%20}"
  echo "$s"
}

echo "=== Database connection (must match deploy/db/postgres.env on the DB server) ==="
read -rp   "Database Server IP [10.1.2.21]: " DB_HOST
DB_HOST=${DB_HOST:-10.1.2.21}
read -rp   "Database port [3306]: " DB_PORT
DB_PORT=${DB_PORT:-3306}
read -rp   "Database name [zemen_director_portal]: " DB_NAME
DB_NAME=${DB_NAME:-zemen_director_portal}
read -rp   "Database user: " DB_USER
read -rsp  "Database password: " DB_PASS; echo

echo
echo "=== Portal admin login (you'll use this to sign in as admin) ==="
read -rsp "Admin password: " ADMIN_PASS; echo

echo
echo "=== Document storage (MinIO) ==="
read -rp   "MinIO access key [zemen_minio]: " MINIO_USER
MINIO_USER=${MINIO_USER:-zemen_minio}
read -rsp  "MinIO secret key (leave blank to auto-generate): " MINIO_PASS; echo
if [ -z "$MINIO_PASS" ]; then
  MINIO_PASS=$(openssl rand -hex 16)
  echo "Generated MinIO secret key: $MINIO_PASS"
fi

JWT_ACCESS=$(openssl rand -hex 32)
JWT_REFRESH=$(openssl rand -hex 32)
DB_PASS_ENC=$(urlencode "$DB_PASS")

sed -i \
  -e "s|DATABASE_URL=.*|DATABASE_URL=postgres://${DB_USER}:${DB_PASS_ENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}|" \
  -e "s|SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=${ADMIN_PASS}|" \
  -e "s|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${JWT_ACCESS}|" \
  -e "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH}|" \
  -e "s|S3_ACCESS_KEY=.*|S3_ACCESS_KEY=${MINIO_USER}|" \
  -e "s|S3_SECRET_KEY=.*|S3_SECRET_KEY=${MINIO_PASS}|" \
  "$BACKEND_ENV"

sed -i \
  -e "s|MINIO_ROOT_USER=.*|MINIO_ROOT_USER=${MINIO_USER}|" \
  -e "s|MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_PASS}|" \
  "$MINIO_ENV"

echo
echo "Done. $BACKEND_ENV and $MINIO_ENV are filled in and consistent with each other."
echo "SMTP_* was left blank (fill in later once you have the bank's mail server details —"
echo "until then, emails are logged, not sent)."
echo
echo "Review with:  cat $BACKEND_ENV"
echo "Next step:    docker compose -f docker-compose.onprem.yml up -d --build"

# On-prem deployment (Zemen Bank internal servers)

Segregated two-server layout, fully independent of the Vercel/Render deployment
(that keeps running unchanged — see `render.yaml` and `../frontend/vercel.json`):

| Server | IP | Role |
|---|---|---|
| **Application Server** | `10.1.1.94` | Docker: `backend` (NestJS API) + `frontend` (nginx serving the SPA, reverse-proxying `/api`) + `minio` (document storage) |
| **Database Server** | `10.1.1.174` | Docker: `postgres` only |

The app server talks to Postgres over the internal network at `10.1.1.174:5432`.
Nothing here touches `render.yaml`, `../frontend/vercel.json`, or the existing
local dev `docker-compose.yml` — those are separate deployments.

**Before anything else:** the credentials you were emailed for these two servers
were shared in plaintext. Once you can log in with your own SSH key (step 1
below), change both passwords and prefer key-based SSH going forward.

---

## 0. Prerequisites (both servers)

Each server needs Docker + the Docker Compose plugin. If they're not installed:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out/in once so `docker` works without sudo
```

> If either server is Windows Server rather than Linux, install **Docker
> Desktop** (or Docker Engine via WSL2) instead, and run the commands below in
> PowerShell — `docker`/`docker compose` are identical either way.

**If these servers have no internet egress** (common on a segregated banking
network), `git clone`/`docker pull` from GitHub/Docker Hub won't reach them.
Work around it from a machine that does have internet access (your laptop, or
a jump host):

```bash
git clone <backend-repo> && git clone <frontend-repo>
# build + save the images as tar files
docker compose -f backend/docker-compose.onprem.yml build
docker save zemen-backend zemen-frontend minio/minio postgres:16-alpine \
  -o zemen-images.tar
# copy the code + tar to the app/db servers (scp/rsync), then on each server:
docker load -i zemen-images.tar
```

The rest of this guide assumes normal internet egress; skip the `--build` step
below and just `docker compose up -d` if you pre-built and loaded images this way.

---

## 1. Database Server (10.1.1.174)

```bash
ssh user@10.1.1.174
git clone https://github.com/RobelBethelhem/independent_director_backend.git
cd independent_director_backend/deploy/db

cp postgres.env.example postgres.env
nano postgres.env      # set POSTGRES_USER / POSTGRES_PASSWORD (strong, unique)

docker compose -f docker-compose.db.yml up -d
docker compose -f docker-compose.db.yml ps      # should show "healthy"
```

**Firewall it to the app server only** (`ufw` example — adjust for your distro):

```bash
sudo ufw allow from 10.1.1.94 to any port 5432 proto tcp
sudo ufw deny 5432
```

The compose file also binds the published port to `10.1.1.174` specifically
(not `0.0.0.0`), so it's never reachable via another interface even without
the firewall rule — the firewall is the second layer of defense.

---

## 2. Application Server (10.1.1.94)

Clone **both** repos as sibling folders — the on-prem compose file expects
`../frontend` to exist next to `backend`:

```bash
ssh user@10.1.1.94
mkdir -p ~/zemen && cd ~/zemen
git clone https://github.com/RobelBethelhem/independent_director_backend.git backend
git clone https://github.com/RobelBethelhem/independent_director_frontend.git frontend

cd backend
cp deploy/onprem/backend.env.example deploy/onprem/backend.env
cp deploy/onprem/minio.env.example   deploy/onprem/minio.env
nano deploy/onprem/backend.env   # DATABASE_URL (match the DB server's user/password),
                                 # JWT secrets (openssl rand -hex 32, twice),
                                 # SEED_ADMIN_PASSWORD, SMTP_*, S3_ACCESS_KEY/S3_SECRET_KEY
nano deploy/onprem/minio.env     # MINIO_ROOT_USER / MINIO_ROOT_PASSWORD —
                                 # MUST match S3_ACCESS_KEY / S3_SECRET_KEY above

docker compose -f docker-compose.onprem.yml up -d --build
docker compose -f docker-compose.onprem.yml ps      # backend + frontend + minio, all healthy
```

Open `http://10.1.1.94` from another machine on the internal network — you
should see the portal, register/log in, and the admin account seeded from
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in `backend.env`.

### What's actually running

- `frontend` (nginx, port **80**) — serves the built SPA and reverse-proxies
  `/api/*` to the `backend` container. This is the only port you connect to.
- `backend` (NestJS, port 3000) — **not published** to the host; reachable
  only from `frontend`/other containers via `http://backend:3000`. Uncomment
  the `ports:` line in `docker-compose.onprem.yml` only if you need to hit the
  API directly for debugging.
- `minio` (S3-compatible storage for uploaded documents) — console on
  `127.0.0.1:9001` only (SSH-tunnel in: `ssh -L 9001:localhost:9001 user@10.1.1.94`,
  then browse `http://localhost:9001` from your machine).

---

## 3. Redeploying after a `git push`

On the Application Server:

```bash
cd ~/zemen/backend
bash deploy/onprem/deploy.sh
```

This pulls both repos, rebuilds the changed images, restarts the stack, and
prunes old images. The Postgres data on the DB server is untouched — schema
changes apply automatically on backend boot (`DB_SYNCHRONIZE=true`, same as
the Render deployment).

If you ever change `deploy/db/docker-compose.db.yml` or `postgres.env`, re-run
`docker compose -f docker-compose.db.yml up -d` on the DB server too.

---

## 4. Troubleshooting

- **`backend` unhealthy / can't reach Postgres** — check `DATABASE_URL` in
  `deploy/onprem/backend.env` matches the DB server's real user/password/IP,
  and that the DB server's firewall allows `10.1.1.94` on port 5432:
  `docker logs zemen-backend`, and from the app server: `nc -zv 10.1.1.174 5432`.
- **Uploads fail** — `S3_ACCESS_KEY`/`S3_SECRET_KEY` in `backend.env` must
  exactly match `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` in `minio.env`.
- **502 from nginx** — the `backend` container isn't up yet or crashed:
  `docker logs zemen-backend`.
- **Rebuild everything from scratch**: `docker compose -f docker-compose.onprem.yml down && docker compose -f docker-compose.onprem.yml up -d --build`
  (this does **not** touch the Postgres volume on the DB server, so applicant
  data survives).

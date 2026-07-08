# Multi-stage build for the NestJS API — used for the on-prem deployment
# (docker-compose.onprem.yml). Does NOT affect the Render deployment, which
# builds from source directly via render.yaml.
#
# The build stage installs devDependencies (needed for `nest build`) regardless
# of NODE_ENV — this avoids the classic "npm ci skips devDeps under
# NODE_ENV=production" trap. The runtime stage installs production-only deps
# and carries over only the compiled dist/.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

RUN groupadd -r app && useradd -r -g app app && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]

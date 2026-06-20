# Fast Docker Development

Use `docker-compose.dev.yml` when you need to test integrations quickly without rebuilding the production Cal.diy images.

## First Run

```bash
docker compose -f docker-compose.dev.yml up calcom-dev calcom-api-dev
```

This starts Postgres, Redis, installs dependencies into a named Docker volume, then runs:

- Web app: `yarn dev` on `http://localhost:3000`
- API v2: `yarn workspace @calcom/api-v2 dev:no-docker` on `${API_PORT:-5555}`

## Daily Use

```bash
docker compose -f docker-compose.dev.yml up calcom-dev calcom-api-dev
```

Source code is bind-mounted, so TypeScript/React changes are picked up by the dev servers without rebuilding Docker images.

## After Dependency Changes

Run this after changing `package.json`, `yarn.lock`, or workspace dependencies:

```bash
docker compose -f docker-compose.dev.yml up --force-recreate calcom-deps
docker compose -f docker-compose.dev.yml up calcom-dev calcom-api-dev
```

## Reset Dev Volumes

If dependencies or caches get corrupted:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up calcom-dev calcom-api-dev
```

Use the original `docker-compose.yml` for production-like image builds only.

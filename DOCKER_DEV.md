# WhapCalendar Fast Docker Development

Use `docker-compose.dev.yml` when you need to test integrations quickly without rebuilding the production Cal.diy images.
This is the recommended local flow for WhapCalendar (`wc`) development.

## First Run

```bash
./wc-dev.sh
```

This starts Postgres, Redis, installs dependencies into a named Docker volume, then runs:

- Web app: `yarn dev` on `http://localhost:3000`
- API v2: `yarn workspace @calcom/api-v2 dev:no-docker:watch` on `${API_PORT:-5555}`

The API dev command keeps Nest in watch mode and also watches the platform packages used by API v2.

## Daily Use

```bash
./wc-dev.sh
```

Source code is bind-mounted, so TypeScript/React changes are picked up by the dev servers without rebuilding Docker images.
The compose file enables polling-based watchers by default because Docker Desktop on macOS can miss filesystem events from bind mounts.

## After Dependency Changes

Run this after changing `package.json`, `yarn.lock`, or workspace dependencies:

```bash
./wc-dev.sh deps
./wc-dev.sh
```

## Reset Dev Volumes

If dependencies or caches get corrupted:

```bash
./wc-dev.sh reset
```

## Script Commands

```bash
./wc-dev.sh up      # Start web + API dev services with hot reload
./wc-dev.sh deps    # Reinstall dependencies into the Docker node_modules volume
./wc-dev.sh reset   # Remove dev volumes and start from a clean state
./wc-dev.sh down    # Stop dev services
./wc-dev.sh logs    # Follow web + API dev logs
./wc-dev.sh ps      # Show dev service status
```

Use the original `docker-compose.yml` for production-like image builds only.

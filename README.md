# First Light — Disney Edition

A self-hosted, **zero-dependency** live Disney parks dashboard: wait times,
park hours, weather (with heat alerts), showtimes, and a set of curated trip
guides (limited-time eats, Dole Whip finder, restrooms/first aid, AP perks,
PhotoPass spots, resort contacts) that you can edit from your phone at runtime
— no redeploys. Covers **Walt Disney World and Disneyland** with a one-tap
resort switcher; the quick-nav is sticky and grouped (RIGHT NOW / PLAN /
REFERENCE).

> Screenshot placeholder — add a capture of the dashboard here.

Built as a thin PWA shell + folder-per-module frontend over a ~400-line Node.js
server (`node:http`, built-in `fetch`, JSON files — **no npm dependencies**).
The server proxies and caches the upstream APIs (themeparks.wiki, National
Weather Service) so one fetch feeds every device, with stale-on-error fallback
so the dashboard degrades gracefully instead of erroring in the park.

## Quick start

**Node (local dev):**

```bash
node server/index.js          # or: npm run dev  (node --watch)
# open http://localhost:8080
```

**Docker:**

```bash
docker run -d -p 8080:8080 -v $(pwd)/appdata:/config \
  -e TZ=America/New_York -e ADMIN_TOKEN=change-me \
  ghcr.io/blackthoarne/disney-tracker:latest
```

**Docker Compose:**

```bash
ADMIN_TOKEN=change-me docker compose up -d
```

## Unraid

1. Copy `unraid/first-light.xml` into `/boot/config/plugins/dockerMan/templates-user/` (or add it via **Docker → Add Container → Template**).
2. Set the appdata path (`/mnt/user/appdata/first-light`), TZ, and an **Admin Token** (masked).
3. Apply — the Docker tab shows a WebUI button and health status. Updates arrive like any community app: check for updates → apply.

Full operator walkthrough (GitHub → GHCR → Unraid → Cloudflare): **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**.

## Cloudflare Tunnel + Access (recommended exposure)

Don't port-forward. Run the `cloudflared` container (Community Applications),
create a tunnel, and point a public hostname at `http://UNRAID_IP:8080`. Then
add a Cloudflare **Access** policy (email one-time PIN for your household) on
`/admin` — the `ADMIN_TOKEN` stays as a second layer. Bypass cache for
`/api/*`; cache `/css/*`, `/js/*`, `/modules/*` normally. Details in
`docs/ARCHITECTURE.md` §6 and `docs/SETUP-GUIDE.md`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `DATA_DIR` | `/config` (Docker) / `./data` (local) | Persistent data root (store, curated, backups) |
| `TZ` | `America/New_York` | Container timezone (park-local) |
| `ADMIN_TOKEN` | *(unset = admin writes disabled)* | Gate for `/admin` publishes and curated `PUT`s |
| `DESTINATION_ID` | WDW resort ID | themeparks.wiki destination |
| `WEATHER_GRID` | `MLB/20,61` | NWS gridpoint |

## Editing curated content

Open `/admin`, pick a module, edit with the form (or raw JSON), preview, and
**Publish** with your admin token. Every publish snapshots the previous version
to `DATA_DIR/backups/` — one-click restore. Items past their `expires` date
render dimmed with an "expired?" flag so stale content is self-evident.

## Adding a module

Every dashboard section is a folder under `modules/` with a manifest and a
two-function client — auto-discovered at startup, no shared files to touch.
See **[docs/ADDING-MODULES.md](docs/ADDING-MODULES.md)** for the methodology and
a complete worked example.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the full architecture and rationale
- [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) — the phased build plan
- [docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md) — operator setup, step by step
- [docs/ADDING-MODULES.md](docs/ADDING-MODULES.md) — how to add a dashboard section
- [docs/STATUS.md](docs/STATUS.md) — what's built, verification results, next steps

## Tests

```bash
npm test   # node:test units for cache, store key validation, curated auth + backups
```

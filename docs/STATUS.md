# First Light — Disney Edition · Project Status

**Last updated:** 2026-07-06
**State:** Phases 1–4 of the implementation plan are **built and verified**. Phase 5 (AI-assisted curation drafts) is **not implemented** (optional, by design last in the roadmap).

---

## What this application is

A self-hosted, zero-npm-dependency Walt Disney World dashboard. A Node.js 20+
server (built on `node:http`, built-in `fetch`, and JSON files) serves a PWA
shell plus a folder-per-module frontend, proxies + caches the upstream APIs
(themeparks.wiki, National Weather Service) with stale-on-error fallback, and
persists shared state (favorites, curated content, backups) under `DATA_DIR`.
Curated trip-guide content is editable at runtime from `/admin` — no redeploys.

## Feature list

- **Live data** (server-cached, one upstream fetch feeds every device):
  wait times, park hours (incl. Early Entry / Extended Evening), crowd
  estimates, best-park ranking, next-hour wait forecasts, marquee showtimes,
  NWS forecast + hourly rain, horizon timeline (rope-drop + storm windows),
  pet-boarding hours computed from actual park hours, Lightning Lane Multi
  Pass pricing.
- **Shared favorites**: server-backed via `/api/store/favorites` with one-time
  localStorage migration; star toggles in the rides list and a pinned card.
- **Active curation**: six curated modules stored as JSON in
  `DATA_DIR/curated/`, seeded on first run from each module's `seed.json`;
  generic card renderer with freshness line ("Curated · updated Jul 6") and
  auto-dim of expired items; `/admin` editor (form + raw JSON + live preview);
  every publish snapshots the previous version to `DATA_DIR/backups/` with
  one-click restore.
- **Degrades gracefully**: stale-on-error cache; per-part `stale`/`cached`
  meta flags; a failed module shows an error note only in its own section.
- **PWA**: manifest + icons + service worker (cache-first shell/static,
  network-only `/api/*`).
- **Packaging**: `node:22-alpine` Dockerfile (no npm install), compose file,
  Unraid CA v2 template, GitHub Actions → GHCR workflow.

## Repo layout

```
public/            shell (index.html, css/app.css, js/app.js, js/core/*, sw.js, manifest, icons)
modules/           15 modules + _template (skipped by loader)
server/            index.js, config.js, lib/{cache,upstream,store,static,modules,curated}.js, test/
admin/             curation editor (index.html + admin.js)
unraid/            first-light.xml CA template
.github/workflows/ docker.yml (GHCR publish)
docs/              ARCHITECTURE, IMPLEMENTATION-PLAN, SETUP-GUIDE, ADDING-MODULES, STATUS
```

## API surface

| Endpoint | Method | Notes |
|---|---|---|
| `/api/health` | GET | `{ok, version, uptime, modules[]}` — drives Docker HEALTHCHECK |
| `/api/modules` | GET | Module registry (manifests, sorted by order) |
| `/api/live` | GET | themeparks.wiki live, 60s TTL |
| `/api/schedule` | GET | park schedules, 15min TTL |
| `/api/weather/forecast` · `/hourly` | GET | NWS, 10min TTL |
| `/api/data` | GET | All four in parallel; per-part `{value, meta:{fetchedAt,stale,cached}}` |
| `/api/store/:key` | GET/PUT | JSON store; key `^[a-z0-9-_]{1,64}$`, 256KB cap, atomic writes |
| `/api/curated/:module` | GET | Public read (falls back to seed) |
| `/api/curated/:module` | PUT | Requires `Authorization: Bearer <ADMIN_TOKEN>`; 401 bad token, 403 when unset; snapshots previous version |
| `/api/curated/:module/backups` | GET | List backups |
| `/api/curated/:module/restore` | POST | Restore a backup (admin) |
| `/api/modules/<id>/<path>` | any | Auto-mounted per-module `server.js` routes |
| `/modules/*` | GET | Static, whitelisted `.js .css .json .html` |
| `/admin` | GET | Curation editor |

## Modules (15)

| Order | Module | Type | Slot |
|---|---|---|---|
| 0 | horizon | live | header |
| 5 | favorites | live | main (nav hidden) |
| 10 | overview | live | main |
| 20 | next-hour | live | main |
| 30 | weather | live | main |
| 40 | best-park | live | main |
| 50 | parks | live + curated card text | main |
| 60 | entertainment | live | main |
| 70 | limited-eats | **curated** | main |
| 80 | dole-whip | **curated** | main |
| 90 | pet-boarding | live + static | main |
| 100 | ap-perks | **curated** | main |
| 110 | adults-only | **curated** | main |
| 120 | photopass | **curated** | main |
| 130 | contacts | **curated** | main |

`modules/_template/` is a documented scaffold, skipped by the loader.

## Environment variables

`PORT` (8080) · `DATA_DIR` (/config in Docker, ./data local) · `TZ`
(America/New_York) · `ADMIN_TOKEN` (unset = writes disabled) · `DESTINATION_ID`
(WDW) · `WEATHER_GRID` (MLB/20,61).

## Phase status

| Phase | Status | Commit |
|---|---|---|
| 1 — Containerize as-is | ✅ done | `c45f2f7` |
| 2 — Backend proxy + persistence | ✅ done | `4f20468` |
| 3 — Modular frontend | ✅ done | `8931249` |
| 4 — Active curation + admin + docs | ✅ done | (this commit) |
| 5 — AI-assisted drafts | ⬜ not implemented (optional) | — |

## Verification results (2026-07-06, sandbox)

- `node --check` on every `.js` in server/public/modules/admin: **pass**.
- `npm test` (node:test — cache TTL/stale-on-error, store key validation, curated auth + backup snapshot): **10/10 pass**.
- Live server checks: `/api/health` ok with 15 modules (`_template` excluded); `/api/modules` correct order; shell `/` 200; `/modules/weather/client.js` 200 `text/javascript`; `/api/curated/dole-whip` 200 with seeded content; PUT without token **401**; PUT with Bearer token **200** and a timestamped backup file appeared in `DATA_DIR/backups/`; backups list endpoint works; `/api/store/favorites` PUT→GET round-trip; `/admin` 200; `/api/data` returns the enveloped bundle (upstream was reachable in the sandbox; stale/cached meta flags verified on cache hits).
- Headless Chromium: dashboard renders 14 sections, 13 nav pills, live status "Live · updated …", curated dole-whip cards render (12); `/admin` lists 6 curated modules. **Zero console errors** attributable to the app (only sandbox-blocked Google Fonts and the by-design 404 for a not-yet-set store key). Full-page screenshot captured.

Not verifiable in the sandbox: actual Docker build/run, GHCR publish, Unraid
install, Cloudflare tunnel — these are operator steps.

## Next steps for the owner

Follow **[SETUP-GUIDE.md](SETUP-GUIDE.md) Part 1** — push to GitHub, let the
Actions workflow publish the GHCR image, install on Unraid from
`unraid/first-light.xml`, then wire up the Cloudflare tunnel + Access policy
on `/admin`. Set an `ADMIN_TOKEN` to enable curation.

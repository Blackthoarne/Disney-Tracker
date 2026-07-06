# First Light — Disney Edition
## Implementation Plan

Companion to `FIRST-LIGHT-ARCHITECTURE.md`. This is the build order: concrete tasks, the files each one creates, what "done" means, and how to verify — phased so the app is deployable after every phase. No step requires a big-bang rewrite; the current dashboard keeps working throughout.

**Target repo layout (end state):**

```
Disney-Tracker/
├── public/                  # frontend shell
│   ├── index.html           # shell only (header, nav mount, status line)
│   ├── manifest.json        # moved from root
│   ├── sw.js                # service worker
│   ├── icon-192.png / icon-512.png
│   ├── css/app.css          # design system extracted from index.html <style>
│   └── js/
│       ├── app.js           # boot: registry → nav → import modules → mount
│       └── core/            # api.js, bus.js, data.js, favorites.js, format.js, parks.js, curated.js
├── modules/                 # one folder per dashboard section
│   ├── _template/           # scaffold for new modules (skipped by loader)
│   ├── horizon/ favorites/ overview/ next-hour/ weather/ best-park/
│   ├── parks/ entertainment/ limited-eats/ dole-whip/ pet-boarding/
│   └── ap-perks/ adults-only/ photopass/ contacts/
├── server/
│   ├── index.js             # http server + router
│   ├── config.js            # env parsing (PORT, DATA_DIR, TZ, ADMIN_TOKEN, …)
│   └── lib/                 # cache.js, store.js, upstream.js, modules.js, static.js, curated.js
├── admin/                   # admin editor page (phase 4)
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── unraid/first-light.xml
├── .github/workflows/docker.yml
├── docs/ARCHITECTURE.md     # the architecture doc
├── package.json             # zero deps; scripts only
└── README.md
```

---

## Phase 1 — Containerize as-is (goal: running on Unraid behind Cloudflare this week)

*The existing `index.html` untouched; just make it a service.*

| # | Task | Files | Notes |
|---|---|---|---|
| 1.1 | Minimal static server | `server/index.js`, `server/config.js`, `server/lib/static.js` | `node:http`; serve repo files; MIME map; path-traversal guard; `/api/health` returning `{ok, version, uptime}` |
| 1.2 | Packaging | `package.json`, `Dockerfile`, `.dockerignore`, `docker-compose.yml` | `node:22-alpine`, `EXPOSE 8080`, HEALTHCHECK via wget, `VOLUME /config` (empty for now but the mount point is stable from day one) |
| 1.3 | CI → GHCR | `.github/workflows/docker.yml` | docker/metadata-action + build-push-action; tags: `latest` + `sha`; runs on push to `main` |
| 1.4 | Unraid template | `unraid/first-light.xml` | Port 8080, appdata `/config`, TZ, WebUI, icon URL |
| 1.5 | Cloudflare | (no code) | Install `cloudflared` from CA, create tunnel, hostname → `http://UNRAID_IP:8080`; cache rule: bypass `/api/*` |

**Acceptance:** `docker run -p 8080:8080 ghcr.io/…` serves the exact current dashboard; Unraid Docker tab shows the app healthy with a WebUI button; `https://firstlight.yourdomain.com` loads from a phone off-network.

**Verify:** `curl localhost:8080/api/health`; open the app, confirm live waits/weather still load (they still call upstream APIs directly in this phase).

---

## Phase 2 — Backend proxy + persistence (goal: resilience + shared favorites, UI unchanged)

| # | Task | Files | Notes |
|---|---|---|---|
| 2.1 | TTL cache with stale-on-error | `server/lib/cache.js` | `fetch(key, ttlMs, loader)` → `{value, stale}`; keeps last good value on loader failure |
| 2.2 | Upstream client | `server/lib/upstream.js` | `fetchJson(url)` with AbortController timeout (~10s) and a proper `User-Agent` (NWS requires one) |
| 2.3 | API endpoints | extend `server/index.js` | `/api/live` (60s), `/api/schedule` (15m), `/api/weather/forecast` + `/api/weather/hourly` (10m), `/api/data` bundle (parallel fetch of all four, per-part `stale` flags). Destination/grid come from `config.js` env |
| 2.4 | JSON store | `server/lib/store.js` | `GET/PUT /api/store/:key` → `/config/store/<key>.json`; key regex `[a-z0-9-_]{1,64}`; 256 KB body cap; atomic write (tmp+rename) |
| 2.5 | Point the page at the backend | edit `index.html` (~10 lines) | `loadLiveData()` fetches `/api/data` instead of four upstream URLs; show a "stale data" note when flagged |
| 2.6 | Server-backed favorites | edit `index.html` (~20 lines) | `getFavorites/toggleFavorite` → `/api/store/favorites`, with one-time migration from `localStorage.flFavorites` |

**Acceptance:** two devices see the same favorites; killing outbound network on the server (or a themeparks.wiki outage) still serves the last good dashboard flagged stale; a page reload after restart is served entirely by the container.

**Verify:** `curl localhost:8080/api/data | jq '.meta'`; second `curl` within 60s returns fast (cache hit — add a `cached` flag to confirm); `PUT` then `GET` a store key; restart container → store survives (it's in appdata).

---

## Phase 3 — Modularize the frontend (goal: the module methodology becomes real)

*The one structural phase. Port section-by-section; the old page keeps working until cutover.*

| # | Task | Files | Notes |
|---|---|---|---|
| 3.1 | Module registry (server) | `server/lib/modules.js` | Scan `modules/*/module.json` at startup (skip `_`-prefixed); validate; sort by `order`; serve `GET /api/modules`; statically serve `/modules/*` (whitelist `.js .css .json .html`); auto-mount any `server.js` routes at `/api/modules/<id>/…` |
| 3.2 | Shell + core services | `public/index.html`, `public/js/app.js`, `public/js/core/*`, `public/css/app.css` | Extract CSS verbatim; shell = header/ticket + clock + status + nav; boot: fetch registry → build nav/sections → `import()` each `client.js` (`Promise.allSettled`; a failed module shows an error note in its own section only) |
| 3.3 | Data hub | `public/js/core/data.js` | `/api/data` on load + refresh button + 5-min timer; port `renderParks()`'s stats math into `computeParkStats()` (avgWait, ranked, closures, earliestOpen, earliestRegularOpen/latestRegularClose); emit on bus |
| 3.4 | Port live modules | `modules/{horizon,favorites,overview,next-hour,weather,best-park,parks,entertainment,pet-boarding}/` | Mostly transplanting existing render functions into `onData()`. Changes: inline `onclick` → event delegation (`data-fav` attributes); add `esc()` on all upstream strings; parks module keeps its tab logic locally |
| 3.5 | Port static/curated-content modules | `modules/{limited-eats,dole-whip,ap-perks,adults-only,photopass,contacts}/` | Phase 3: HTML moved as-is into `mount()` (they become *curated* in phase 4) |
| 3.6 | Template + docs | `modules/_template/`, `docs/ADDING-MODULES.md` | The §3.2 methodology checklist + worked example lives next to the code |
| 3.7 | PWA polish + cutover | `public/sw.js`, move `manifest.json`/icons into `public/`, delete root `index.html` | SW: cache-first shell/static, network-only `/api/*`; bump start_url |

**Porting order within the phase** (each is independently commit-able): shell+core → weather → overview/best-park/parks (share parkStats) → entertainment/next-hour → horizon/pet-boarding → favorites → the six content sections → template/docs → cutover.

**Acceptance:** feature parity with today's page — same sections, same order, same look; favorites toggle works from both the parks list and the pinned card; disabling a module in its manifest removes it from nav and page with no other edits; a deliberately broken `client.js` degrades only its own section.

**Verify:** side-by-side old vs new in two tabs before deleting the old file; Lighthouse PWA installability check; `enabled:false` toggle test; JS console clean.

---

## Phase 4 — Active curation (goal: edit content from your phone, no redeploys)

| # | Task | Files | Notes |
|---|---|---|---|
| 4.1 | Curated schema + generic renderer | `docs/curated-schema.md`, `public/js/core/curated.js` | groups → items → {name, location, desc, pill, apExclusive, expires}; renderer emits the existing card markup; auto-dim expired items; "updated \<date\>" badge from `updatedAt` |
| 4.2 | Convert the six content modules | `modules/*/seed.json`, slim `client.js` | Hand-convert current HTML into seed JSON (mechanical); client becomes ~5 lines calling the generic renderer |
| 4.3 | Curated API | `server/lib/curated.js` | `GET /api/curated/:module` public; `PUT` requires `Authorization: Bearer <ADMIN_TOKEN>`; seed-on-first-run into `/config/curated/`; every PUT snapshots previous version to `/config/backups/<module>-<ts>.json` |
| 4.4 | Admin page | `admin/index.html` (+ js) | Module list w/ freshness + expiring-soon flags; form editor over the schema + raw-JSON fallback; preview using the same renderer; publish + restore-from-backup |
| 4.5 | Lock it down | Cloudflare config (no code) | Access application on `/admin` and method-PUT paths; email OTP for household; long session for the public dashboard decision per architecture doc §6.3 |

**Acceptance:** edit a Dole Whip entry in `/admin` from a phone → visible on all devices within one refresh; container update/reinstall does not lose edits; unauthenticated PUT is rejected both by Cloudflare and by the app token; a bad edit is recoverable from backups.

**Verify:** `curl -X PUT /api/curated/dole-whip` without token → 401; with token → 200 + backup file appears; delete container, reinstall, edits persist.

---

## Phase 5 (optional) — AI-assisted curation drafts

| # | Task | Files | Notes |
|---|---|---|---|
| 5.1 | Draft job | `server/lib/drafts.js` | On demand (admin button) and/or weekly timer; only when `ANTHROPIC_API_KEY` set. Prompt: current JSON + schema + "verify windows, drop expired, add announced items, cite sources"; Claude API with web-search tool; output validated against schema → `/config/curated/drafts/` |
| 5.2 | Review UI | extend `admin/` | Per-module diff view (current vs draft, per-item), approve/edit/reject; approve = normal PUT (so it backs up like any edit) |
| 5.3 | Guardrails | — | Drafts never auto-publish; hard cap on job frequency; API key only via env |

**Acceptance:** with a key set, "Refresh drafts" produces schema-valid drafts with sources; approving one publishes it; with no key, the feature is invisible.

---

## Cross-cutting

- **Branch/PR flow:** each phase = one PR on `claude/app-architecture-unraid-4h50gv` (or per-phase branches off it); phases 3–4 split into the commit-able chunks listed above.
- **Testing stance:** the server's lib files (`cache`, `store`, `curated`, `modules`) get small `node:test` unit tests (~an hour of work, no deps — `node --test`); frontend verified by the phase acceptance checks + a Playwright smoke script (load page, wait for live status "updated", screenshot) that can run in CI against the built container.
- **Effort ballpark:** P1 ~½ day · P2 ~1 day · P3 ~2–3 days (the bulk is mechanical porting) · P4 ~2 days · P5 ~1 day.
- **Definition of done overall:** Unraid app installed from the XML template pulling GHCR `latest`; Cloudflare hostname live; feature parity + shared favorites; all six content sections runtime-editable; `docs/ADDING-MODULES.md` proven by building one brand-new module (suggestion: a simple **"Trip Countdown"** module — good first exercise of the methodology, pure client, ~30 lines).

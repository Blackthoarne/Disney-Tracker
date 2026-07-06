# First Light — Disney Edition
## Plan & Architecture: From Webpage to Self-Hosted Application (Unraid + Cloudflare)

**Status:** Implemented — Phases 1–4 of this plan are built (see `IMPLEMENTATION-PLAN.md` and `STATUS.md`); Phase 5 (AI-assisted drafts) is not yet implemented.
**Scope:** How to evolve the current single-file PWA into a true, modular, self-hosted application running as a Docker container on Unraid, exposed via Cloudflare, with "active curation" replacing hardcoded content, and a repeatable methodology for adding new modules.

---

## 1. Where the app is today

The entire application is one `index.html` (~1,600 lines) plus `manifest.json` and two icons:

| Aspect | Current state | Limitation |
|---|---|---|
| Hosting | Static file (opened directly or via static host) | Not a service; nothing to point Unraid/Cloudflare at |
| Live data | Browser calls `api.themeparks.wiki` and `api.weather.gov` directly | Every device hits upstream APIs independently; you're exposed to their rate limits, outages, and any future CORS changes; no caching |
| Favorites | `localStorage` per browser | Not shared between your phone, your partner's phone, and desktop |
| Curated sections (Limited-Time Eats, Dole Whip, AP Perks, Adults Only, PhotoPass, Contacts) | Hardcoded HTML | Updating means editing a 1,600-line file and redeploying — the footer literally says "ask Claude to refresh it" |
| Structure | All 13 sections' HTML, CSS, and JS interleaved in one file | Adding a section means touching nav, markup, CSS, the `loadLiveData()` orchestrator, and render functions — high collision risk, no isolation |

What's worth keeping: the visual design system, the section pattern (section-head / cards / pills / badges), the PWA manifest, and all the render logic — it ports over nearly verbatim.

---

## 2. Target architecture

```
                        Internet
                           │
              ┌────────────▼─────────────┐
              │        Cloudflare        │  DNS + TLS + WAF
              │  Tunnel ─ Access ─ Cache │  (no ports opened on your router)
              └────────────┬─────────────┘
                           │ outbound-only tunnel
 ┌─────────────────────────┼─────────────────────────────────┐
 │ UNRAID                  │                                  │
 │   ┌─────────────────────▼───────────┐                      │
 │   │  cloudflared (container)        │                      │
 │   └─────────────────────┬───────────┘                      │
 │                         │ http://firstlight:8080           │
 │   ┌─────────────────────▼───────────────────────────────┐  │
 │   │  first-light (container, Node.js — zero deps)        │  │
 │   │                                                      │  │
 │   │  • Static host: PWA shell + module bundles           │  │
 │   │  • /api/data   : proxy + TTL cache + stale-on-error  │──┼──▶ api.themeparks.wiki
 │   │  • /api/store  : persistent JSON (favorites, prefs)  │──┼──▶ api.weather.gov
 │   │  • /api/curated: runtime-editable curated content    │  │
 │   │  • /admin      : curation editor (Access-protected)  │  │
 │   │  • /api/modules: module registry (auto-discovered)   │  │
 │   │  • /api/health : Docker healthcheck                  │  │
 │   └───────────────┬──────────────────────────────────────┘  │
 │                   │ /config volume                          │
 │        /mnt/user/appdata/first-light/                       │
 │          ├── store/      favorites.json, settings.json      │
 │          ├── curated/    limited-eats.json, dole-whip.json… │
 │          └── backups/    timestamped curated versions       │
 └─────────────────────────────────────────────────────────────┘
```

### 2.1 Backend — small on purpose

**Recommendation: Node.js 20+ with zero npm dependencies** (`node:http`, built-in `fetch`, `node:fs`). The server has exactly five jobs:

1. **Serve static files** — the PWA shell and module files.
2. **Proxy + cache upstream APIs** — one server-side fetch feeds every device:
   - `/api/live` → themeparks.wiki live data, **60s TTL**
   - `/api/schedule` → park schedules, **15min TTL**
   - `/api/weather/*` → NWS forecast + hourly, **10min TTL**
   - `/api/data` → all four bundled in one round-trip for the client
   - **Stale-on-error:** if upstream is down, serve the last good payload flagged `stale: true` — the dashboard degrades gracefully instead of erroring in the park.
3. **Persistent store** — `GET/PUT /api/store/:key`, JSON files in `/config/store/`. Favorites become shared across all devices (fixes the `localStorage` island problem).
4. **Curated content API** — `GET /api/curated/:module` (public read) and `PUT` (admin write) backed by `/config/curated/*.json`. See §4.
5. **Module registry** — scans `modules/` at startup, serves manifests at `/api/modules`. See §3.

**Why zero-dep instead of Express/Fastify + SQLite:** ~200-line server, `node:22-alpine` image around 50 MB, no `npm install` in the Docker build, no supply-chain surface, nothing to patch except the base image. JSON files are the right database for one household's favorites and a dozen curated documents. **Upgrade path** (only if it grows: multi-user auth, historical wait-time charts): swap the store for SQLite (`better-sqlite3`) and the hand-rolled router for Fastify — the module/API contracts below don't change.

### 2.2 Frontend — shell + modules

The frontend becomes a thin **shell** plus independent **modules**:

- **Shell** (`public/index.html`, `public/js/app.js`): header/ticket branding, clock, refresh button, live-status line, nav. On boot it fetches `/api/modules`, builds the nav and one `<section>` per module, and dynamically `import()`s each module's `client.js`.
- **Data hub** (`public/js/core/data.js`): fetches `/api/data` on load, on manual refresh, and on a 5-minute timer; computes the shared **park stats** once (avg waits, ranked "best park", closures, earliest open / latest close — currently duplicated logic inside `renderParks()`); broadcasts `{live, schedule, forecast, hourly, parkStats}` on an event bus.
- **Core services** passed to every module as `ctx`: `api` (fetch helper), `bus` (pub/sub), `favorites` (server-backed, replaces `localStorage`), `format` (time/escape helpers), `parks` (park IDs/metadata constants).
- **Design system**: the existing CSS moves wholesale to `public/css/app.css` and becomes the shared vocabulary all modules use (`.item-card`, `.park-group-title`, `.window-pill`, `.live-tag`, …) — new modules inherit the look for free.
- **PWA**: keep the manifest; add a small service worker (cache-first for shell/CSS/module JS, network-only for `/api/*`) so it installs to the home screen and opens instantly on park Wi-Fi.

---

## 3. Module system — and the methodology for adding one

### 3.1 Anatomy of a module

Every section of the dashboard is a folder under `modules/`:

```
modules/
  weather/
    module.json     ← manifest (required)
    client.js       ← browser code (required)
    client.css      ← module-specific styles (optional)
    server.js       ← server-side routes (optional)
    seed.json       ← default curated content (optional, curated modules only)
```

**`module.json` — the manifest:**

```json
{
  "id": "weather",
  "title": "Weather",
  "navLabel": "Weather",
  "tag": "Section 2",
  "badges": [{ "type": "live", "label": "Live" }],
  "type": "live",              // "live" | "curated" | "static"
  "order": 30,                 // position on page and in nav
  "slot": "main",              // "main" | "header" (horizon timeline)
  "enabled": true
}
```

**`client.js` — the browser contract (two functions):**

```js
export default {
  // Called once at boot. Build your DOM inside `el`.
  async mount(el, ctx) {
    el.innerHTML = `<p class="empty-note">Loading…</p>`;
  },

  // Called after every successful data refresh (~5 min + manual).
  onData(data, ctx) {
    // data: { live, schedule, forecast, hourly, parkStats, fetchedAt, stale }
    // ctx:  { api, bus, favorites, format, parks, refresh() }
  }
};
```

**`server.js` — optional server routes**, auto-mounted under the module's namespace:

```js
export default {
  routes: {
    // becomes GET /api/modules/weather/radar
    "GET /radar": async (req, res, ctx) => {
      // ctx: { cache, store, config, fetchJson }
      const data = await ctx.cache.fetch("radar", 10 * 60_000,
        () => ctx.fetchJson("https://example.gov/radar.json"));
      return data;
    }
  }
};
```

The server discovers all of this at startup — **no central file lists the modules.** The shell renders nav + section chrome (title, badges, tag) from the manifest; the module only ever touches its own container. One broken module shows an error note in its own section; everything else keeps working.

### 3.2 Methodology: adding a new module, step by step

Say you want a **"Rope Drop Planner"** module:

1. **Classify it.** Live (renders API data), curated (content you'll edit over time), or static (fixed reference)? This decides which files you need.
2. **Scaffold**: copy `modules/_template/` → `modules/rope-drop/`.
3. **Manifest**: set `id`, `title`, `navLabel`, `badges`, pick an `order` (gap-numbered — 10, 20, 30… — so you can insert without renumbering).
4. **Client**:
   - *Live module*: implement `onData()` using `data.live` / `data.parkStats`; build HTML with the shared CSS classes; escape all upstream strings with `ctx.format.esc()`.
   - *Curated module*: usually **no code at all** — declare `"type": "curated"` plus a `seed.json`, and the generic curated-card renderer (§4) displays it. Only write a custom `client.js` if the layout is unusual.
   - *Static module*: `mount()` sets fixed HTML; no `onData`.
5. **Server routes** only if you need a new upstream API or heavy computation — put fetching/caching in `server.js` so every device shares one cached call.
6. **Interactions**: attach listeners inside your container (event delegation); persist user state via `ctx.api.put('/api/store/rope-drop')`; announce cross-module changes on `ctx.bus`.
7. **Test**: restart the container (or `node --watch` locally) — the module appears in nav and page automatically. `enabled: false` hides it without deleting it.
8. **Ship**: commit the folder; CI builds the image; Unraid pulls the update. A module is one folder in one commit — trivially reviewable and revertible.

### 3.3 Mapping today's 13 sections onto the module system

| Order | Module | Type | Notes |
|---|---|---|---|
| 0 | `horizon` | live | Header slot; rope-drop + storm windows timeline |
| 5 | `favorites` | live | Pinned rides; server-backed, shared across devices |
| 10 | `overview` | live | Stat grid + alert banner |
| 20 | `next-hour` | live | Wait-time forecast deltas |
| 30 | `weather` | live | NWS forecast + hourly rain tags |
| 40 | `best-park` | live | Ranked from shared `parkStats` |
| 50 | `parks` | live + curated | Live hours/crowds/closures; curated LL & dining tips per park |
| 60 | `entertainment` | live | Marquee showtimes |
| 70 | `limited-eats` | **curated** | First candidate for active curation |
| 80 | `dole-whip` | **curated** | |
| 90 | `pet-boarding` | live + static | Hours computed from `parkStats` open/close |
| 100 | `ap-perks` | **curated** | Date-bound (V.I.PASSHOLDER windows) — benefits most from runtime edits |
| 110 | `adults-only` | **curated** | |
| 120 | `photopass` | **curated** | |
| 130 | `contacts` | curated (slow-moving) | Phone numbers change rarely but do change |

---

## 4. Active curation vs static content

Three explicit content tiers, declared per module in the manifest:

| Tier | Source of truth | Updated by | Example |
|---|---|---|---|
| **Live** | Upstream APIs via server cache | Automatic, every refresh | Wait times, weather, showtimes |
| **Curated** | JSON documents in `/config/curated/` | You, at runtime, no redeploy | Limited-time eats, AP perks |
| **Static** | Shipped in the image | Code commit + image update | Design system, park metadata, monorail crawl route |

### 4.1 Curated content model

Each curated module's content is a JSON document with a generic card schema mirroring today's visual patterns:

```json
{
  "module": "limited-eats",
  "updatedAt": "2026-07-06T14:00:00Z",
  "updatedBy": "admin",
  "note": "Most items tie to V.I.PASSHOLDER Summer Days (May 1 – Jul 31).",
  "groups": [
    {
      "title": "EPCOT",
      "items": [
        {
          "name": "La Poutinerie — Québec: L'authentique & Spiced Apple Slushy",
          "location": "Near the Canada Pavilion",
          "desc": "Poutine and a non-alcoholic frozen ginger-apple slushy.",
          "pill": { "label": "Jul 1 – ongoing", "style": "default" },
          "apExclusive": false,
          "expires": null
        }
      ]
    }
  ]
}
```

One **generic curated renderer** in the frontend core draws any document in this schema (park groups → item cards → pills/AP notes), so most curated modules need zero custom code. Two nice built-ins the schema enables:

- **Auto-expiry**: items with a past `expires` date render dimmed with an "expired?" flag (or auto-hide) — stale content becomes self-evident instead of silently wrong.
- **Freshness badge**: each curated section shows "Curated · updated Jul 6" from `updatedAt`, so you know at a glance what needs a pass before a trip.

**Seeding:** the repo ships each module's current content as `seed.json`. On first run the server copies seeds into `/config/curated/`; after that, `/config` is the source of truth and survives container updates (standard Unraid appdata behavior).

### 4.2 The admin editor (`/admin`)

A single admin page — served by the same container, **protected by Cloudflare Access** (§6) plus an app-side admin token (`ADMIN_TOKEN` env var) as defense in depth:

- Lists curated modules with last-updated dates and expiring-soon warnings.
- Edits content as a form over the card schema (add/remove groups and items, set pills and expiry dates), with raw-JSON mode as a fallback.
- **Preview before publish**, and every `PUT` writes a timestamped backup to `/config/backups/` — one-click restore.

This is the "active curation" loop: notice something changed at the parks → open `/admin` on your phone → edit the card → publish. Seconds, not a redeploy.

### 4.3 Optional phase: AI-assisted curation

Once the admin loop exists, add a **draft-and-approve** job (opt-in, `ANTHROPIC_API_KEY` env var):

- On a schedule (e.g., weekly, or a "Refresh drafts" button in admin), the server asks the Claude API — with web search enabled — to update each curated document *in the exact same JSON schema*: verify date windows, drop expired items, add newly announced ones, and cite sources per change.
- Results land in `/config/curated/drafts/`, **never published directly**. The admin page shows a side-by-side diff; you approve, edit, or reject per module.

This keeps a human hand on anything guests will rely on, while removing the tedious research pass. It's deliberately last in the roadmap — everything else works without it.

---

## 5. Unraid deployment

### 5.1 Container

```dockerfile
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/config
WORKDIR /app
COPY server ./server
COPY public ./public
COPY modules ./modules
VOLUME /config
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/index.js"]
```

No build step, no `npm install` — the image is the repo plus the Node runtime.

**Environment variables:**

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `DATA_DIR` | `/config` | Persistent data root |
| `TZ` | `America/New_York` | Container timezone (park-local) |
| `ADMIN_TOKEN` | *(unset = admin disabled)* | App-side gate for `/admin` and curated `PUT`s |
| `DESTINATION_ID` | WDW resort ID | themeparks.wiki destination (theoretically reusable for Disneyland) |
| `WEATHER_GRID` | `MLB/20,61` | NWS gridpoint |
| `ANTHROPIC_API_KEY` | *(unset)* | Enables optional AI curation drafts |

### 5.2 Publishing images — GitHub Actions → GHCR

A workflow (`.github/workflows/docker.yml`) builds and pushes `ghcr.io/blackthoarne/disney-tracker:latest` (plus version tags) on every push to `main`. Unraid then updates the app the same way it updates any community app: **Docker tab → check for updates → apply**. Your deploy pipeline is `git push`.

### 5.3 Unraid template (installs like any other Unraid app)

An XML template (`unraid/first-light.xml`) gives it the standard Unraid experience — icon, WebUI button, appdata mapping:

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>FirstLight</Name>
  <Repository>ghcr.io/blackthoarne/disney-tracker:latest</Repository>
  <Network>bridge</Network>
  <WebUI>http://[IP]:[PORT:8080]/</WebUI>
  <Icon>https://raw.githubusercontent.com/Blackthoarne/Disney-Tracker/main/icon-192.png</Icon>
  <Overview>First Light — Disney Edition. Live WDW wait times, park hours, weather and showtimes, plus curated trip guides.</Overview>
  <Category>Tools: Status:Stable</Category>
  <Config Name="WebUI Port"  Target="8080"    Default="8080" Mode="tcp" Type="Port">8080</Config>
  <Config Name="AppData"     Target="/config" Default="/mnt/user/appdata/first-light" Mode="rw" Type="Path">/mnt/user/appdata/first-light</Config>
  <Config Name="TZ"          Target="TZ"      Default="America/New_York" Type="Variable">America/New_York</Config>
  <Config Name="Admin Token" Target="ADMIN_TOKEN" Default="" Type="Variable" Mask="true"/>
</Container>
```

Install path: **Docker → Add Container → Template** (or drop the XML in the CA templates folder / publish to a personal template repo). Backup story: `/mnt/user/appdata/first-light/` is plain JSON — the standard Appdata Backup plugin covers it completely.

### 5.4 Local dev

`node server/index.js` (or `node --watch`) and open `http://localhost:8080` — same code path as production, no Docker required for iteration. `docker compose up` mirrors the Unraid setup for a final check.

---

## 6. Cloudflare exposure

**Recommendation: Cloudflare Tunnel (`cloudflared`) — do not port-forward.**

1. **Tunnel**: run the `cloudflared` container on Unraid (available in Community Applications). It makes an *outbound-only* connection to Cloudflare; zero open ports on your router. In Cloudflare Zero Trust → Tunnels, add a public hostname, e.g. `firstlight.yourdomain.com → http://[unraid-ip]:8080` (or the container name if both share a custom Docker network).
2. **Access policy on `/admin`**: Zero Trust → Access → Application for `firstlight.yourdomain.com/admin` (and `/api/curated/*` PUTs) with an **email one-time-PIN policy** limited to your household's addresses. Cloudflare handles login before requests ever reach Unraid; the `ADMIN_TOKEN` remains as a second layer.
3. **Public dashboard choice**: leave the read-only dashboard open (convenient in the parks — no login on a phone), or wrap the whole hostname in an Access policy if you'd rather keep it private. Recommendation: Access on everything *except* keep sessions long (30 days) so park-day friction stays near zero.
4. **Cache rules**: bypass cache for `/api/*` (the app's own TTL cache is the freshness authority); cache static assets (`/css/*`, `/js/*`, `/modules/*`, icons) normally. Everything gets Cloudflare TLS, HTTP/3, and WAF for free.
5. **Bonus**: with the tunnel in place the PWA is installable from anywhere over HTTPS — which is also what service workers require.

---

## 7. Migration roadmap — each phase ships something usable

| Phase | What | Outcome |
|---|---|---|
| **1. Containerize as-is** | Wrap the *current* `index.html` in the Node static server + Dockerfile + Unraid template + Cloudflare tunnel | The exact app you have today, but installed on Unraid with a WebUI button and a public URL. Proves the whole hosting chain end-to-end in an afternoon. |
| **2. Backend proxy + persistence** | Add `/api/data` (proxy + TTL cache + stale-on-error), `/api/store` (shared favorites), `/api/health`; point the existing JS at them | Faster loads, resilient to upstream hiccups, favorites shared across devices. UI unchanged. |
| **3. Modularize the frontend** | Split the monolith into shell + 13 modules + core services per §3 | Adding/removing sections becomes a one-folder operation; the methodology in §3.2 becomes real. |
| **4. Active curation** | Curated JSON in `/config`, generic card renderer, `/admin` editor, Cloudflare Access policy, backups | Update eats/perks/contacts from your phone in seconds; freshness badges + auto-expiry keep content honest. |
| **5. AI-assisted drafts** *(optional)* | Scheduled Claude-drafted curated updates with human approve/reject in admin | Research pass automated; human keeps final say. |

Phases 1–2 don't touch the UI at all, so there's no "big rewrite" moment — the app keeps working throughout.

---

## 8. Security & ops recommendations

- **No secrets in the image or repo** — `ADMIN_TOKEN` / `ANTHROPIC_API_KEY` only as container env vars (masked in the Unraid template).
- **Two layers on anything that writes** (Cloudflare Access + app token); the dashboard itself has no writes except favorites.
- **Escape upstream strings** (`esc()` helper) when rendering — ride names and forecasts are third-party data going into innerHTML.
- **Store hygiene**: sanitize store keys (`[a-z0-9-_]`), cap body sizes (~256 KB), atomic writes (tmp + rename) so a power cut can't corrupt JSON.
- **Health & monitoring**: `/api/health` drives the Docker HEALTHCHECK; Unraid shows unhealthy state on the Docker tab. Optionally add an Uptime Kuma check against the public URL.
- **Backups**: appdata backup plugin covers `/config`; curated edits also self-version into `/config/backups/`.
- **Updates**: base-image bumps via a scheduled CI rebuild (weekly), pulled on Unraid like any app update. Zero npm dependencies means effectively zero dependency-CVE churn.

---

## 9. Summary of key recommendations

1. **Zero-dependency Node.js backend** in a ~50 MB Alpine container — proxy/cache, JSON persistence, module registry. Fastify/SQLite only if requirements grow.
2. **Folder-per-module architecture** with a manifest + two-function client contract and optional server routes — auto-discovered, so adding a module never touches shared files.
3. **Three explicit content tiers** — live / curated / static — declared per module; curated content lives in `/config` as schema-validated JSON with an admin editor, freshness badges, auto-expiry, and versioned backups.
4. **Cloudflare Tunnel + Access**, not port forwarding; Access email-OTP on `/admin` at minimum.
5. **GHCR image via GitHub Actions + Unraid XML template** so deploys are `git push` and updates are one click in the Unraid Docker tab.
6. **Migrate in five phases**, starting with containerizing the app exactly as it is today.

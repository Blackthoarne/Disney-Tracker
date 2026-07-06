# Adding a Module

First Light is a **shell + modules** app. Every section of the dashboard is a
self-contained folder under `modules/`. The server discovers modules at
startup — **no central file lists them** — so adding a section is dropping in a
folder and restarting (or `node --watch` locally). One broken module shows an
error note in its own section; everything else keeps working.

## Anatomy of a module

```
modules/
  my-module/
    module.json     ← manifest (required)
    client.js       ← browser code (required)
    client.css      ← module-specific styles (optional)
    server.js       ← server-side routes (optional)
    seed.json       ← default curated content (curated modules only)
```

### `module.json` — the manifest

```json
{
  "id": "my-module",
  "title": "My Module",
  "navLabel": "My Module",
  "tag": "Section X",
  "badges": [{ "type": "live", "label": "Live" }],
  "type": "live",
  "order": 45,
  "slot": "main",
  "nav": true,
  "enabled": true
}
```

| Field | Meaning |
|---|---|
| `id` | Folder-safe id; also the URL path (`/modules/<id>/client.js`) and section id. |
| `title` | Heading shown in the section head. |
| `navLabel` | Quick-nav pill text (falls back to `title`). |
| `tag` | Small right-aligned label in the section head. |
| `badges` | Array of `{type, label}`. `type: "live"` → green pill, `"curated"` → blue pill. |
| `type` | `live` \| `curated` \| `static` (documentation/intent). |
| `order` | Position on the page and in nav. **Gap-numbered** (10, 20, 30…) so you can insert without renumbering. |
| `slot` | `main` (a section) or `header` (mounts above nav, like the horizon timeline). |
| `nav` | `false` hides the quick-nav pill (e.g. the favorites card). |
| `enabled` | `false` hides the module entirely without deleting it. |

### `client.js` — the browser contract

```js
export default {
  // Called once at boot. Build your DOM inside `el`.
  async mount(el, ctx) { /* … */ },

  // Called after every successful data refresh (~5 min + manual).
  onData(data, ctx, el) { /* … */ }
};
```

- `data` = `{ live, schedule, forecast, hourly, parkStats, stale, meta, fetchedAt }`
- `ctx`  = `{ api, bus, favorites, format, parks, refresh() }`
  - `format.esc(str)` — **escape every upstream/user string** before putting it in `innerHTML`.
  - `favorites` — `list()`, `has(name)`, `toggle(name)` (server-backed, shared across devices).
  - `bus` — `on(event, fn)` / `emit(event, payload)` for cross-module signals.
  - `parks` — `PARK_ORDER`, `PARK_META`, `crowdLabel`, `llStatus`, `MARQUEE_KEYWORDS`.

### `server.js` — optional server routes

Auto-mounted under the module's namespace (`GET /example` → `GET /api/modules/<id>/example`).
The handler gets `(req, res, ctx)` where `ctx = { cache, fetchJson, config, store }`.
Put upstream fetching/caching here so one server-side call feeds every device.

## Methodology — step by step

1. **Classify it.** Live (renders API data), curated (content you edit over time), or static (fixed reference)? This decides which files you need.
2. **Scaffold:** copy `modules/_template/` → `modules/<your-id>/`.
3. **Manifest:** set `id`, `title`, `navLabel`, `badges`; pick a gap-numbered `order`.
4. **Client:**
   - *Live:* implement `onData()` using `data.live` / `data.parkStats`; build HTML with the shared CSS classes; `esc()` all upstream strings.
   - *Curated:* usually no custom code — declare `"type": "curated"` + a `seed.json`, and the generic curated renderer (`public/js/core/curated.js`) draws it. Only write a `client.js` if the layout is unusual (see `modules/dole-whip/client.js` for the ~10-line standard curated client).
   - *Static:* `mount()` sets fixed HTML; no `onData`.
5. **Server routes** only if you need a new upstream API or heavy computation.
6. **Interactions:** attach listeners inside your container (event delegation — **never inline `onclick`**); persist user state via `ctx.api.put('/api/store/<key>')`; announce cross-module changes on `ctx.bus`.
7. **Test:** restart (`node --watch` locally) — the module appears in nav and page automatically. `enabled: false` hides it.
8. **Ship:** commit the folder; CI builds the image; Unraid pulls the update.

---

## Worked example: a "Trip Countdown" module

A pure-client module that counts down to a trip date the user picks and stores
server-side (so it's the same on every device). ~30 lines, no `onData`.

**`modules/trip-countdown/module.json`**

```json
{
  "id": "trip-countdown",
  "title": "Trip Countdown",
  "navLabel": "Countdown",
  "tag": "Bonus",
  "badges": [],
  "type": "static",
  "order": 15,
  "slot": "main",
  "enabled": true
}
```

**`modules/trip-countdown/client.js`**

```js
// Counts down to a trip date the guest picks. The date persists server-side
// via /api/store/trip-date, so it's shared across every device.

const STORE_KEY = "trip-date";

function daysUntil(dateStr) {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86_400_000);
}

function render(el, ctx, dateStr) {
  const { esc } = ctx.format;
  let headline = "Set your trip date to start the countdown.";
  if (dateStr) {
    const d = daysUntil(dateStr);
    headline =
      d > 0 ? `${d} day${d === 1 ? "" : "s"} until your trip!`
      : d === 0 ? "Your trip is today! 🎉"
      : `Your trip was ${Math.abs(d)} day${d === -1 ? "" : "s"} ago.`;
  }
  el.innerHTML = `
    <div class="item-card">
      <div class="item-name">${esc(headline)}</div>
      <div class="item-desc" style="margin-top:10px;">
        <input type="date" id="tc-date" value="${esc(dateStr || "")}"
               style="font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;">
      </div>
    </div>`;
  el.querySelector("#tc-date").addEventListener("change", async (e) => {
    const value = e.target.value;
    try { await ctx.api.put(`/api/store/${STORE_KEY}`, { date: value }); }
    catch (err) { console.warn("could not save trip date:", err.message); }
    render(el, ctx, value);
  });
}

export default {
  async mount(el, ctx) {
    let saved = "";
    try {
      const doc = await ctx.api.get(`/api/store/${STORE_KEY}`);
      saved = doc && doc.date ? doc.date : "";
    } catch (err) {
      if (err.status !== 404) console.warn("trip-date load failed:", err.message);
    }
    render(el, ctx, saved);
  },
};
```

That's the whole module. Drop the folder in, restart, and "Countdown" appears
in the nav between Favorites (order 5) and Overview (order 10). No shared file
was edited; deleting the folder removes it cleanly. Because it stores its date
in the shared JSON store, the countdown reads the same on your phone, your
partner's phone, and the desktop.

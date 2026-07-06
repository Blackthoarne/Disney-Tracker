// ============================================================================
// MODULE TEMPLATE — copy this folder to modules/<your-id>/ to start a module.
// The loader SKIPS any folder whose name starts with "_", so _template never
// appears on the page. See docs/ADDING-MODULES.md for the full methodology.
// ============================================================================
//
// A module is a folder with:
//   module.json   (required) — the manifest (id, title, order, slot, badges…)
//   client.js     (required) — this file: browser code with mount()/onData()
//   client.css    (optional) — module-specific styles
//   server.js     (optional) — server-side routes, auto-mounted at
//                              /api/modules/<id>/<path>
//   seed.json     (optional) — default curated content (curated modules only)
//
// The shell renders the section chrome (title, badges, tag) from the manifest.
// Your code only ever touches its own container element `el`.

export default {
  // Called once at boot. Build your initial DOM inside `el`.
  async mount(el, ctx) {
    // ctx = { api, bus, favorites, format, parks, refresh() }
    el.innerHTML = `<p class="empty-note">Loading…</p>`;
  },

  // Called after every successful data refresh (~5 min + manual refresh).
  // data = { live, schedule, forecast, hourly, parkStats, stale, meta, fetchedAt }
  onData(data, ctx, el) {
    const { esc } = ctx.format;
    el.innerHTML = `<div class="item-card">
      <div class="item-name">Template module</div>
      <div class="item-desc">Data last fetched ${esc(data.fetchedAt)}.</div>
    </div>`;
  },
};

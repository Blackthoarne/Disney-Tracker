// Entertainment: marquee shows (parades, fireworks, major stage shows) with
// today's showtimes. Ported from renderEntertainment(), filtered by
// MARQUEE_KEYWORDS.

import { esc, fmtShowTime } from "../../js/core/format.js";
import { PARK_ORDER, PARK_META, MARQUEE_KEYWORDS } from "../../js/core/parks.js";

export default {
  async mount(el) {
    el.innerHTML = `<p class="empty-note">Loading live showtimes…</p>`;
  },

  onData(data, ctx, el) {
    const liveRes = data.live;
    const now = Date.now();
    const byPark = {};
    PARK_ORDER.forEach((id) => (byPark[id] = []));

    (liveRes.liveData || []).forEach((item) => {
      if (item.entityType !== "SHOW" || !byPark[item.parkId] || !item.showtimes || !item.showtimes.length) return;
      const nameLower = item.name.toLowerCase();
      if (!MARQUEE_KEYWORDS.some((k) => nameLower.includes(k))) return;
      byPark[item.parkId].push(item);
    });

    let html = "";
    PARK_ORDER.forEach((parkId) => {
      const shows = byPark[parkId];
      if (!shows.length) return;
      const meta = PARK_META[parkId];
      html += `<div class="park-group"><div class="park-group-title">${meta.emoji} ${esc(meta.name)}</div>`;
      shows.forEach((show) => {
        const times = show.showtimes.map((s) => s.startTime).sort();
        const upcoming = times.filter((t) => new Date(t).getTime() > now);
        const allTimesText = times.map(fmtShowTime).join(" · ");
        const nextText = upcoming.length ? "Next: " + fmtShowTime(upcoming[0]) : "Finished for today";
        html += `<div class="item-card">
          <div class="item-top">
            <div><div class="item-name">${esc(show.name)}</div><div class="item-loc">${esc(nextText)}</div></div>
            <span class="window-pill">${times.length} show${times.length > 1 ? "s" : ""} today</span>
          </div>
          <div class="item-desc">${esc(allTimesText)}</div>
        </div>`;
      });
      html += `</div>`;
    });

    if (!html) {
      html = `<p class="empty-note">No marquee entertainment schedule found in today's live feed yet — check back closer to park open, or confirm in My Disney Experience.</p>`;
    }
    el.innerHTML = html;
  },
};

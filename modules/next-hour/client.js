// Next Hour: attractions whose standby wait is forecast to drop or climb in
// the next 60 minutes. Ported from renderNext1Hour().

import { esc } from "../../js/core/format.js";
import { PARK_META } from "../../js/core/parks.js";

export default {
  async mount(el) {
    el.innerHTML = `<p class="empty-note">Loading live wait-time forecasts…</p>`;
  },

  onData(data, ctx, el) {
    const liveRes = data.live;
    const now = Date.now();
    const oneHrOut = now + 60 * 60 * 1000;
    const candidates = [];
    (liveRes.liveData || []).forEach((item) => {
      if (item.entityType !== "ATTRACTION" || item.status !== "OPERATING" || !item.forecast || !item.queue || !item.queue.STANDBY) return;
      const current = item.queue.STANDBY.waitTime;
      if (typeof current !== "number") return;
      let nearest = null, nearestDiff = Infinity;
      item.forecast.forEach((f) => {
        const t = new Date(f.time).getTime();
        if (t >= now && t <= oneHrOut) {
          const diff = Math.abs(t - oneHrOut);
          if (diff < nearestDiff) { nearestDiff = diff; nearest = f; }
        }
      });
      if (nearest && typeof nearest.waitTime === "number") {
        candidates.push({ name: item.name, parkId: item.parkId, current, future: nearest.waitTime, delta: nearest.waitTime - current });
      }
    });
    const dropping = candidates.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    const rising = candidates.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);

    let html = "";
    if (dropping.length) {
      html += `<div class="park-group"><div class="park-group-title">📉 Waits dropping in the next hour — worth waiting on</div>`;
      dropping.forEach((c) => {
        const pm = PARK_META[c.parkId];
        html += `<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(c.name)}</div><div class="item-loc">${esc(pm ? pm.name : "")}</div></div><span class="window-pill">${c.current}→${c.future} min</span></div></div>`;
      });
      html += `</div>`;
    }
    if (rising.length) {
      html += `<div class="park-group"><div class="park-group-title">📈 Waits climbing in the next hour — go now if it's on your list</div>`;
      rising.forEach((c) => {
        const pm = PARK_META[c.parkId];
        html += `<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(c.name)}</div><div class="item-loc">${esc(pm ? pm.name : "")}</div></div><span class="window-pill ap">${c.current}→${c.future} min</span></div></div>`;
      });
      html += `</div>`;
    }
    if (!html) {
      html = `<p class="empty-note">No strong 1-hour trend detected right now — wait times look fairly steady resort-wide.</p>`;
    }
    el.innerHTML = html;
  },
};

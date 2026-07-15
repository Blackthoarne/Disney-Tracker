// Best Park Today: parks ranked by live average standby wait (lower = better).
// Ported from the ranking half of renderParks().

import { esc } from "../../js/core/format.js";
import { PARK_META, crowdLabel } from "../../js/core/parks.js";

// Tracks the previous refresh's average waits to show 📈/📉 trend arrows (v2).
const prevAvgWait = {};

export default {
  async mount(el) {
    el.innerHTML = `
    <div class="park-rank" id="park-rank-list">
      <p class="empty-note">Loading live wait times…</p>
    </div>
    <p style="font-size:12.5px;color:var(--text-dim);margin-top:10px;">"Crowd" here is estimated live from current wait times resort-wide, not Disney's official crowd calendar — a real-time read, not a prediction. Numbers shift throughout the day, so check back before committing to a park.</p>`;
  },

  onData(data, ctx, el) {
    const ps = data.parkStats;
    const rankList = el.querySelector("#park-rank-list");
    rankList.innerHTML = "";
    ps.ranked.forEach((parkId, idx) => {
      const s = ps.stats[parkId];
      const meta = PARK_META[parkId];
      const cl = crowdLabel(s.avgWait);
      let trend = "";
      if (s.avgWait != null && prevAvgWait[parkId] != null) {
        const diff = s.avgWait - prevAvgWait[parkId];
        if (diff >= 3) trend = " 📈";
        else if (diff <= -3) trend = " 📉";
      }
      const div = document.createElement("div");
      div.className = "rank-card" + (idx === 0 ? " best" : "");
      div.innerHTML = `
        <div class="rank-num">0${idx + 1}</div>
        <div>
          <div class="rank-park">${idx === 0 ? "⭐ " : ""}${meta.emoji} ${esc(meta.name)}${idx === 0 ? " — Best Choice Right Now" : ""}${trend}</div>
          <div class="rank-meta">${s.avgWait != null ? `Average standby wait ~${s.avgWait} min across ${s.operatingCount} attractions` : "Wait time data unavailable"}${s.downCount ? ` · ${s.downCount} attraction${s.downCount > 1 ? "s" : ""} down` : ""}</div>
        </div>
        <span class="crowd-pill ${cl.cls}">${esc(cl.text)}</span>`;
      rankList.appendChild(div);
      if (s.avgWait != null) prevAvgWait[parkId] = s.avgWait;
    });
  },
};

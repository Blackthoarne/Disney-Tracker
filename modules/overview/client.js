// Today's Overview: a 4-tile stat grid (weather, best park, attractions down,
// Lightning Lane) + a storm alert banner + a last-updated line.
// Ported from renderOverview().

import { fmtClock } from "../../js/core/format.js";
import { PARK_ORDER, PARK_META } from "../../js/core/parks.js";

export default {
  async mount(el) {
    el.innerHTML = `
    <div class="overview-grid">
      <div class="stat-card">
        <div class="label">Weather</div>
        <div class="value" id="ov-weather-val">—</div>
        <div class="note" id="ov-weather-note">Loading…</div>
      </div>
      <div class="stat-card">
        <div class="label">Best Park</div>
        <div class="value" id="ov-bestpark-val">—</div>
        <div class="note" id="ov-bestpark-note">Loading…</div>
      </div>
      <div class="stat-card">
        <div class="label">Attractions Down</div>
        <div class="value" id="ov-down-val">—</div>
        <div class="note" id="ov-down-note">Loading…</div>
      </div>
      <div class="stat-card">
        <div class="label">Lightning Lane</div>
        <div class="value" id="ov-ll-val">—</div>
        <div class="note" id="ov-ll-note">Loading…</div>
      </div>
    </div>

    <div class="alert-banner">
      <span>🎆</span>
      <div><b>Storms are possible this afternoon</b> — Florida summer weather can turn quickly. Arrive at rope drop, book Lightning Lane the moment your window opens, and use the live wait times below to plan around any weather delays.</div>
    </div>

    <div class="refresh-note"><span class="dot"></span> <span id="lastUpdated">Not yet loaded</span> · tap Refresh above anytime for current numbers</div>`;
  },

  onData(data, ctx, el) {
    const q = (id) => el.querySelector("#" + id);
    const wx = data.forecast;
    if (wx && wx.properties) {
      const today = wx.properties.periods.find((p) => p.isDaytime) || wx.properties.periods[0];
      q("ov-weather-val").textContent = today.temperature + "°" + today.temperatureUnit;
      const pop = today.probabilityOfPrecipitation && today.probabilityOfPrecipitation.value;
      q("ov-weather-note").textContent = (pop != null ? pop + "% rain chance · " : "") + today.shortForecast;
    }

    const ps = data.parkStats;
    const bestId = ps.ranked[0];
    if (bestId) {
      const bestMeta = PARK_META[bestId];
      const bestStat = ps.stats[bestId];
      q("ov-bestpark-val").textContent = bestMeta.name;
      q("ov-bestpark-note").textContent = bestStat.avgWait != null
        ? `Lowest live wait right now (~${bestStat.avgWait} min avg)`
        : "Live data limited right now";
    }

    let totalDown = 0;
    let downList = [];
    PARK_ORDER.forEach((id) => {
      totalDown += ps.stats[id].downCount;
      downList = downList.concat(ps.stats[id].downNames);
    });
    q("ov-down-val").textContent = totalDown;
    q("ov-down-note").textContent = totalDown
      ? downList.slice(0, 2).join(", ") + (totalDown > 2 ? "…" : "")
      : "All attractions reporting operational";

    q("ov-ll-val").textContent = "See park cards";
    q("ov-ll-note").textContent = "Live Multi Pass pricing shown per park below";

    q("lastUpdated").textContent = "Live as of " + fmtClock();
  },
};

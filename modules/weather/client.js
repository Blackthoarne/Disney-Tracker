// Weather: NWS forecast summary + hourly rain-chance tags.
// Ported from renderWeather() and renderHourlyPop().

import { esc } from "../../js/core/format.js";

export default {
  async mount(el) {
    el.innerHTML = `
    <div class="overview-grid">
      <div class="stat-card"><div class="label">Right Now</div><div class="value" id="wx-current">—</div><div class="note" id="wx-current-note">Loading…</div></div>
      <div class="stat-card"><div class="label">High / Low</div><div class="value" id="wx-hilo">—</div></div>
      <div class="stat-card"><div class="label">Rain Chance</div><div class="value" id="wx-pop">—</div><div class="note">Today, per NWS</div></div>
      <div class="stat-card"><div class="label">Source</div><div class="value" style="font-size:14px;">National Weather Service</div></div>
    </div>
    <p style="font-size:13.5px;color:var(--text-dim);margin-top:14px;" id="wx-outlook">Loading forecast…</p>
    <p style="font-size:13.5px;color:var(--text-dim);" id="wx-tonight"></p>
    <div class="park-group-title" style="margin-top:18px;">Hourly Rain Chance</div>
    <div id="hourlyPop" class="tag-list"></div>`;
  },

  onData(data, ctx, el) {
    const q = (id) => el.querySelector("#" + id);
    const wx = data.forecast;
    if (wx && wx.properties) {
      const periods = wx.properties.periods;
      const today = periods.find((p) => p.isDaytime) || periods[0];
      const tonight = periods.find((p) => !p.isDaytime) || periods[1];
      // v2: "Right Now" reads the current hourly period, not today's forecast.
      const nowP = data.hourly?.properties?.periods?.[0];
      q("wx-current").textContent = (nowP || today).temperature + "°" + (nowP || today).temperatureUnit;
      q("wx-current-note").textContent = (nowP || today).shortForecast;
      q("wx-hilo").textContent = today.temperature + "° / " + (tonight ? tonight.temperature + "°" : "—");
      const pop = today.probabilityOfPrecipitation && today.probabilityOfPrecipitation.value;
      q("wx-pop").textContent = pop != null ? pop + "%" : "—";
      q("wx-outlook").innerHTML = "<b style='color:var(--text)'>" + esc(today.name) + ":</b> " + esc(today.detailedForecast);
      if (tonight) {
        q("wx-tonight").innerHTML = "<b style='color:var(--text)'>" + esc(tonight.name) + ":</b> " + esc(tonight.detailedForecast);
      }
    }

    // Hourly rain chance.
    const hourlyEl = q("hourlyPop");
    const wxHourly = data.hourly;
    if (hourlyEl && wxHourly && wxHourly.properties) {
      const periods = wxHourly.properties.periods.slice(0, 12);
      let html = "";
      periods.forEach((p) => {
        const pop = (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value) ?? 0;
        let color = "var(--ok)";
        if (pop >= 60) color = "var(--bad)";
        else if (pop >= 30) color = "var(--warn)";
        const time = new Date(p.startTime).toLocaleTimeString("en-US", { hour: "numeric" });
        html += `<span class="tag" style="border-color:${color};color:${color};font-weight:600;">${esc(time)}: ${pop}%</span>`;
      });
      hourlyEl.innerHTML = html || '<span class="empty-note">Hourly data unavailable</span>';
    }
  },
};

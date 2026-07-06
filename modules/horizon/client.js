// Horizon timeline (header slot): a 6am–9pm axis with a live rope-drop window,
// a storm-risk window (NWS hourly pop >= 40%), and a now-marker.
// Ported from renderHorizonWindows / updateHorizonNow / timeToAxisX.

import { fmtShowTime } from "../../js/core/format.js";

// maps a Date onto the 6am-9pm (900 min) horizon axis, 0-1000 units, clamped
function timeToAxisX(date) {
  const d = new Date(date);
  const minsSince6am = (d.getHours() - 6) * 60 + d.getMinutes();
  return Math.max(0, Math.min(1000, (minsSince6am / 900) * 1000));
}

function updateHorizonNow(el) {
  const now = new Date();
  const minsSince6am = (now.getHours() - 6) * 60 + now.getMinutes();
  const clamped = Math.max(0, Math.min(900, minsSince6am));
  const cx = (clamped / 900) * 1000;
  const marker = el.querySelector("#horizonNow");
  if (marker) marker.setAttribute("cx", cx);
}

export default {
  async mount(el, ctx) {
    el.innerHTML = `
<div class="horizon">
  <svg viewBox="0 0 1000 52" preserveAspectRatio="none">
    <line x1="0" y1="30" x2="1000" y2="30" stroke="#CBDCEA" stroke-width="1"/>
    <rect id="ropeDropRect" x="0" y="26" width="0" height="8" fill="#F0A830" opacity="0.45"/>
    <rect id="stormRect" x="0" y="26" width="0" height="8" fill="#C94A36" opacity="0.35"/>
    <text x="0" y="16" fill="#33465C" font-size="17" font-weight="600" font-family="Barlow Condensed">6A</text>
    <text x="470" y="16" fill="#33465C" font-size="17" font-weight="600" font-family="Barlow Condensed">2P</text>
    <text x="948" y="16" fill="#33465C" font-size="17" font-weight="600" font-family="Barlow Condensed">9P</text>
    <circle id="horizonNow" cx="0" cy="30" r="5" fill="#F0A830"/>
  </svg>
  <div class="horizon-legend">
    <span><i style="background:#F0A830"></i><span id="ropeDropLegend">Rope drop window</span></span>
    <span><i style="background:#C75B4A"></i><span id="stormLegend">Storm risk</span></span>
    <span><i style="background:#F0A830;box-shadow:0 0 4px #F0A830"></i>Now</span>
  </div>
</div>`;
    updateHorizonNow(el);
    setInterval(() => updateHorizonNow(el), 60_000);
  },

  onData(data, ctx, el) {
    updateHorizonNow(el);
    const earliestOpen = data.parkStats.earliestOpen;
    const wxHourly = data.hourly;

    const ropeRect = el.querySelector("#ropeDropRect");
    const stormRect = el.querySelector("#stormRect");
    const ropeLegend = el.querySelector("#ropeDropLegend");
    const stormLegend = el.querySelector("#stormLegend");

    // Rope drop: earliest gate-open time across the 4 parks, 2-hour window.
    if (earliestOpen && ropeRect) {
      const start = earliestOpen;
      const end = new Date(earliestOpen.getTime() + 2 * 60 * 60 * 1000);
      const x1 = timeToAxisX(start), x2 = timeToAxisX(end);
      ropeRect.setAttribute("x", x1);
      ropeRect.setAttribute("width", Math.max(2, x2 - x1));
      if (ropeLegend) ropeLegend.textContent = "Rope drop window (" + fmtShowTime(start) + "–" + fmtShowTime(end) + ")";
    }

    // Storm window: contiguous hours today (6am-9pm) where rain chance >= 40%.
    if (wxHourly && wxHourly.properties && wxHourly.properties.periods && stormRect) {
      const periods = wxHourly.properties.periods;
      const todayStr = new Date().toLocaleDateString("en-CA");
      const relevant = periods.filter((p) => {
        const d = new Date(p.startTime);
        return d.toLocaleDateString("en-CA") === todayStr && d.getHours() >= 6 && d.getHours() <= 21;
      });
      const wetHours = relevant.filter((p) => (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value) >= 40);
      if (wetHours.length) {
        const start = new Date(wetHours[0].startTime);
        const last = new Date(wetHours[wetHours.length - 1].startTime);
        const end = new Date(last.getTime() + 60 * 60 * 1000);
        const x1 = timeToAxisX(start), x2 = timeToAxisX(end);
        stormRect.setAttribute("x", x1);
        stormRect.setAttribute("width", Math.max(2, x2 - x1));
        stormRect.setAttribute("opacity", "0.35");
        const maxPop = Math.max(...wetHours.map((p) => p.probabilityOfPrecipitation.value));
        if (stormLegend) stormLegend.textContent = "Storm risk " + fmtShowTime(start) + "–" + fmtShowTime(end) + " (" + maxPop + "% pop)";
      } else {
        stormRect.setAttribute("width", "0");
        if (stormLegend) stormLegend.textContent = "No significant storm risk detected today";
      }
    }
  },
};

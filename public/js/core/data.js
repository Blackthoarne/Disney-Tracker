// DataHub: fetches /api/data on load, on manual refresh, and on a 5-minute
// timer; computes the shared park stats once (ported from the original
// renderParks()); broadcasts a normalized {live, schedule, forecast, hourly,
// parkStats, meta} payload on the bus.

import { PARK_ORDER, currentResort } from "./parks.js";
import { localDateStr, fmtTime } from "./format.js";

const REFRESH_MS = 5 * 60 * 1000;

export function createDataHub({ api, bus }) {
  let timer = null;
  const hub = {
    last: null,
    async refresh() {
      bus.emit("data:loading");
      try {
        const raw = await api.get(`/api/data?resort=${encodeURIComponent(currentResort)}`);
        const data = normalize(raw);
        hub.last = data;
        bus.emit("data", data);
        bus.emit("data:status", { ok: true, fetchedAt: data.fetchedAt, stale: data.stale });
        return data;
      } catch (err) {
        bus.emit("data:status", { ok: false, error: err.message });
        throw err;
      }
    },
    start() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => hub.refresh().catch(() => {}), REFRESH_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
  return hub;
}

function normalize(raw) {
  // /api/data → { live:{value,meta}, schedule:{value,meta}, ... }
  const live = raw.live?.value || { liveData: [] };
  const schedule = raw.schedule?.value || { parks: [] };
  const forecast = raw.forecast?.value || null;
  const hourly = raw.hourly?.value || null;
  const grid = raw.grid?.value || null;
  const stale =
    !!raw.live?.meta?.stale ||
    !!raw.schedule?.meta?.stale ||
    !!raw.forecast?.meta?.stale ||
    !!raw.hourly?.meta?.stale;

  const parkStats = computeParkStats(live, schedule);

  return {
    resort: raw.resort || "wdw",
    live,
    schedule,
    forecast,
    hourly,
    grid,
    parkStats,
    stale,
    meta: {
      live: raw.live?.meta,
      schedule: raw.schedule?.meta,
      forecast: raw.forecast?.meta,
      hourly: raw.hourly?.meta,
      grid: raw.grid?.meta,
    },
    fetchedAt: raw.fetchedAt || new Date().toISOString(),
  };
}

// Ported from the original renderParks() — pure computation, no DOM.
export function computeParkStats(liveRes, schedRes) {
  let earliestOpen = null;
  let earliestRegularOpen = null;
  let latestRegularClose = null;

  const attractionsByPark = {};
  PARK_ORDER.forEach((id) => (attractionsByPark[id] = []));
  (liveRes.liveData || []).forEach((item) => {
    if (item.entityType === "ATTRACTION" && attractionsByPark[item.parkId]) {
      attractionsByPark[item.parkId].push(item);
    }
  });

  const stats = {};
  const todayStr = localDateStr();

  PARK_ORDER.forEach((parkId) => {
    const items = attractionsByPark[parkId];
    const operating = items.filter(
      (i) => i.status === "OPERATING" && i.queue && i.queue.STANDBY && typeof i.queue.STANDBY.waitTime === "number"
    );
    const down = items.filter((i) => i.status && i.status !== "OPERATING");
    const avgWait = operating.length
      ? Math.round(operating.reduce((s, i) => s + i.queue.STANDBY.waitTime, 0) / operating.length)
      : null;

    // Hours from schedule.
    const parkSched = (schedRes.parks || []).find((p) => p.id === parkId);
    let hoursHtml = "Hours unavailable";
    let llText = null;
    if (parkSched) {
      const todays = (parkSched.schedule || []).filter((s) => s.date === todayStr);
      const operatingEntry = todays.find((s) => s.type === "OPERATING");
      const earlyEntry = todays.find((s) => s.type === "TICKETED_EVENT" && /early entry/i.test(s.description || ""));
      const extraHours = todays.find((s) => s.type === "EXTRA_HOURS");
      if (operatingEntry) {
        hoursHtml = fmtTime(operatingEntry.openingTime) + " – " + fmtTime(operatingEntry.closingTime);
        if (operatingEntry.purchases) {
          const llp = operatingEntry.purchases.find((p) => /multi pass/i.test(p.name || ""));
          if (llp) llText = llp.name + ": " + llp.price.formatted + (llp.available === false ? " (sold out)" : "");
        }
      }
      if (earlyEntry) hoursHtml += "<br>Early Entry " + fmtTime(earlyEntry.openingTime);
      if (extraHours) hoursHtml += "<br>Extended Evening " + fmtTime(extraHours.openingTime) + "–" + fmtTime(extraHours.closingTime);

      const candidateOpen = earlyEntry ? earlyEntry.openingTime : operatingEntry ? operatingEntry.openingTime : null;
      if (candidateOpen) {
        const t = new Date(candidateOpen);
        if (!earliestOpen || t < earliestOpen) earliestOpen = t;
      }
      if (operatingEntry) {
        const openT = new Date(operatingEntry.openingTime);
        const closeT = new Date(operatingEntry.closingTime);
        if (!earliestRegularOpen || openT < earliestRegularOpen) earliestRegularOpen = openT;
        if (!latestRegularClose || closeT > latestRegularClose) latestRegularClose = closeT;
      }
    }

    stats[parkId] = {
      avgWait,
      downCount: down.length,
      downNames: down.map((i) => i.name),
      operatingCount: operating.length,
      hoursHtml,
      llText,
    };
  });

  const ranked = PARK_ORDER.slice().sort((a, b) => {
    const wa = stats[a].avgWait == null ? 999 : stats[a].avgWait;
    const wb = stats[b].avgWait == null ? 999 : stats[b].avgWait;
    return wa - wb;
  });

  return { stats, ranked, earliestOpen, earliestRegularOpen, latestRegularClose };
}

export default createDataHub;

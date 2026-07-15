// Park Details: four curated park-detail cards filled with live hours / crowd /
// closures / Lightning Lane pricing, plus a By Park / All Rides tab view.
// Ported from renderParks() (DOM fills) + renderAllRides() + tab logic.
// Star favorites toggle via event delegation on data-fav (no inline onclick).

import { esc, fmtTime } from "../../js/core/format.js";
import { PARK_ORDER, PARK_META, crowdLabel, llStatus, currentResort } from "../../js/core/parks.js";

let ridesFilter = "open";
let lastLive = null;

const DETAIL_HTML = `
<div class="tab-bar">
  <button class="subtab-btn active" data-tab="bypark" aria-label="Show park details by park">By Park</button>
  <button class="subtab-btn" data-tab="allrides" aria-label="Show all rides list">All Rides</button>
</div>
<div id="tabPanelByPark">

<div class="park-detail" style="--park-color:var(--mk);" data-park="75ea578a-adc8-4116-a54d-dccb60765ef9">
  <div class="park-detail-head">
    <h3>Magic Kingdom</h3>
    <div class="park-hours" data-hours>—</div>
  </div>
  <dl>
    <dt>Crowd Level</dt><dd data-crowd>—</dd>
    <dt>Closures</dt><dd data-closures>—</dd>
    <dt>Lightning Lane</dt><dd data-ll>Tiana's Bayou Adventure and Seven Dwarfs typically sell out by mid-morning</dd>
    <dt>Entertainment</dt><dd>Festival of Fantasy Parade 3:00 PM · Disney Starlight: Dream the Night Away 9:00 PM · Happily Ever After 10:00 PM</dd>
    <dt>Dining</dt><dd>Skipper Canteen and Be Our Guest lunch availability usually opens up after 1:30 PM</dd>
    <dt>Construction</dt><dd>Walls remain up near the Central Plaza for ongoing castle-area refurbishment</dd>
  </dl>
  <a class="map-link" href="https://disneyworld.disney.go.com/attractions/map/magic-kingdom/" target="_blank" rel="noopener">🗺️ Open Official Map</a>
</div>

<div class="park-detail" style="--park-color:var(--ep);" data-park="47f90d2c-e191-4239-a466-5892ef59a88b">
  <div class="park-detail-head">
    <h3>EPCOT</h3>
    <div class="park-hours" data-hours>—</div>
  </div>
  <dl>
    <dt>Crowd Level</dt><dd data-crowd>—</dd>
    <dt>Closures</dt><dd data-closures>—</dd>
    <dt>Lightning Lane</dt><dd data-ll>Guardians of the Galaxy: Cosmic Rewind — book at park open</dd>
    <dt>Nighttime Show</dt><dd>Luminous: The Symphony of Us — check the live Entertainment section below for tonight's exact time</dd>
  </dl>
  <a class="map-link" href="https://disneyworld.disney.go.com/attractions/map/epcot/" target="_blank" rel="noopener">🗺️ Open Official Map</a>
</div>

<div class="park-detail" style="--park-color:var(--hs);" data-park="288747d1-8b4f-4a64-867e-ea7c9b27bad8">
  <div class="park-detail-head">
    <h3>Disney's Hollywood Studios</h3>
    <div class="park-hours" data-hours>—</div>
  </div>
  <dl>
    <dt>Crowd Level</dt><dd data-crowd>—</dd>
    <dt>Closures</dt><dd data-closures>—</dd>
    <dt>Lightning Lane</dt><dd data-ll>Slinky Dog Dash and Mickey &amp; Minnie's Runaway Railway highest priority</dd>
    <dt>Nighttime Show</dt><dd>Check the live Entertainment section below for tonight's fireworks/show schedule</dd>
  </dl>
  <a class="map-link" href="https://disneyworld.disney.go.com/attractions/map/hollywood-studios/" target="_blank" rel="noopener">🗺️ Open Official Map</a>
</div>

<div class="park-detail" style="--park-color:var(--ak);" data-park="1c84a229-8862-4648-9c71-378ddd2c7693">
  <div class="park-detail-head">
    <h3>Disney's Animal Kingdom</h3>
    <div class="park-hours" data-hours>—</div>
  </div>
  <dl>
    <dt>Crowd Level</dt><dd data-crowd>—</dd>
    <dt>Closures</dt><dd data-closures>—</dd>
    <dt>Lightning Lane</dt><dd data-ll>Flight of Passage highest priority</dd>
    <dt>Animal Experiences</dt><dd>Kilimanjaro Safaris best viewing in the first two hours after open, before midday heat</dd>
    <dt>Dining</dt><dd>Yak &amp; Yeti and Satu'li Canteen good midday options to dodge the heat</dd>
  </dl>
  <a class="map-link" href="https://disneyworld.disney.go.com/attractions/map/animal-kingdom/" target="_blank" rel="noopener">🗺️ Open Official Map</a>
</div>
</div>
<div id="dlParkDetails" style="display:none;"></div>
<div id="tabPanelAllRides" style="display:none;">
  <div class="tab-bar" style="margin-bottom:12px;">
    <button class="filter-chip active" data-rides="open" aria-label="Filter to open rides with wait times">Wait Times</button>
    <button class="filter-chip" data-rides="closed" aria-label="Filter to closed rides">Closed</button>
  </div>
  <div id="allrides-content">
    <p class="empty-note">Loading live wait times…</p>
  </div>
</div>`;

function renderAllRides(el, ctx) {
  const liveRes = lastLive || { liveData: [] };
  const byPark = {};
  PARK_ORDER.forEach((id) => (byPark[id] = []));
  (liveRes.liveData || []).forEach((item) => {
    if (item.entityType === "ATTRACTION" && byPark[item.parkId]) byPark[item.parkId].push(item);
  });

  let html = "";
  PARK_ORDER.forEach((parkId) => {
    const meta = PARK_META[parkId];
    let rides = byPark[parkId];
    rides = rides.filter((r) => (ridesFilter === "closed" ? r.status && r.status !== "OPERATING" : !r.status || r.status === "OPERATING"));
    rides.sort((a, b) => {
      const wa = (a.queue && a.queue.STANDBY && a.queue.STANDBY.waitTime) ?? -1;
      const wb = (b.queue && b.queue.STANDBY && b.queue.STANDBY.waitTime) ?? -1;
      return wb - wa;
    });
    html += `<details class="park-group" open><summary class="park-group-title custom-disclosure">${meta.emoji} ${esc(meta.name)} (${rides.length})<span class="chevron">▾</span></summary>`;
    if (!rides.length) {
      html += `<p class="empty-note">${ridesFilter === "closed" ? "Nothing down right now" : "No rides in this view"}</p>`;
    }
    rides.forEach((r) => {
      const wait = r.queue && r.queue.STANDBY ? r.queue.STANDBY.waitTime : null;
      const isDown = r.status && r.status !== "OPERATING";
      const waitText = isDown ? r.status.replace(/_/g, " ") : typeof wait === "number" ? wait + " min" : "—";
      const ll = llStatus(r);
      const isFav = ctx.favorites.has(r.name);
      html += `<div class="item-card" style="margin-bottom:6px;padding:10px 14px;">
        <div class="item-top">
          <div class="item-name" style="display:flex;align-items:center;font-size:13.5px;">
            <button class="fav-star" aria-label="${isFav ? "Unpin" : "Pin"} ${esc(r.name)}" data-fav="${esc(r.name)}">${isFav ? "⭐" : "☆"}</button>
            <span>${esc(r.name)}</span>
          </div>
          <span class="window-pill ${isDown ? "ap" : ""}">${esc(waitText)}</span>
        </div>
        ${ll ? `<div class="item-desc">${esc(ll.text)}</div>` : ""}
      </div>`;
    });
    html += `</details>`;
  });
  el.querySelector("#allrides-content").innerHTML = html;
}

// Disneyland park-detail cards, generated live (ported from v2's
// renderDLParkDetails — DL has no curated per-park card content yet).
function renderDLParkDetails(el, data) {
  const container = el.querySelector("#dlParkDetails");
  if (!container || currentResort !== "dl") return;
  const liveRes = data.live;
  const schedRes = data.schedule;
  const attractionsByPark = {};
  PARK_ORDER.forEach((id) => (attractionsByPark[id] = []));
  (liveRes.liveData || []).forEach((item) => {
    if (item.entityType === "ATTRACTION" && attractionsByPark[item.parkId]) {
      attractionsByPark[item.parkId].push(item);
    }
  });
  const todayStr = new Date().toLocaleDateString("en-CA");
  let html = "";
  PARK_ORDER.forEach((parkId) => {
    const meta = PARK_META[parkId];
    const items = attractionsByPark[parkId];
    const operating = items.filter((i) => i.status === "OPERATING" && i.queue && i.queue.STANDBY && typeof i.queue.STANDBY.waitTime === "number");
    const down = items.filter((i) => i.status && i.status !== "OPERATING");
    const avgWait = operating.length ? Math.round(operating.reduce((s, i) => s + i.queue.STANDBY.waitTime, 0) / operating.length) : null;
    const parkSched = (schedRes.parks || []).find((p) => p.id === parkId);
    let hoursText = "Hours unavailable";
    if (parkSched) {
      const todays = (parkSched.schedule || []).filter((sc) => sc.date === todayStr);
      const op = todays.find((sc) => sc.type === "OPERATING");
      if (op) hoursText = fmtTime(op.openingTime) + " – " + fmtTime(op.closingTime);
    }
    const cl = crowdLabel(avgWait);
    html += `<div class="park-detail" style="--park-color:var(--amber);">
      <div class="park-detail-head"><h3>${esc(meta.name)}</h3><div class="park-hours">${esc(hoursText)}</div></div>
      <dl>
        <dt>Crowd Level</dt><dd>${esc(cl.text)}${avgWait != null ? ` (avg standby ~${avgWait} min)` : ""}</dd>
        <dt>Closures</dt><dd>${down.length ? esc(down.map((i) => i.name).slice(0, 4).join(", ")) : "Nothing reported down"}</dd>
      </dl>
    </div>`;
  });
  container.innerHTML = html;
}

function applyResortPanels(el) {
  const byPark = el.querySelector("#tabPanelByPark");
  const dl = el.querySelector("#dlParkDetails");
  const allRides = el.querySelector("#tabPanelAllRides");
  const onAllRides = allRides.style.display !== "none";
  byPark.style.display = !onAllRides && currentResort === "wdw" ? "block" : "none";
  dl.style.display = !onAllRides && currentResort === "dl" ? "block" : "none";
}

export default {
  async mount(el, ctx) {
    el.innerHTML = DETAIL_HTML;

    // Capture the base (curated) Lightning Lane text so live prefixes don't
    // accumulate across refreshes.
    el.querySelectorAll("[data-ll]").forEach((dd) => {
      dd.dataset.base = dd.textContent;
    });

    // Tab switching (By Park / All Rides), resort-aware.
    el.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        const allRides = el.querySelector("#tabPanelAllRides");
        el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
        allRides.style.display = tab === "allrides" ? "block" : "none";
        applyResortPanels(el);
      });
    });

    // Swap By Park (WDW curated cards) for generated DL cards on resort switch.
    ctx.bus.on("resort:changed", () => applyResortPanels(el));

    // Rides filter (Wait Times / Closed).
    el.querySelectorAll("[data-rides]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ridesFilter = btn.getAttribute("data-rides");
        el.querySelectorAll("[data-rides]").forEach((b) => b.classList.toggle("active", b === btn));
        renderAllRides(el, ctx);
      });
    });

    // Star toggles (event delegation).
    el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-fav]");
      if (!t) return;
      ctx.favorites.toggle(t.getAttribute("data-fav"));
    });

    // Re-render the rides list when favorites change (star glyphs).
    ctx.bus.on("favorites:changed", () => renderAllRides(el, ctx));
  },

  onData(data, ctx, el) {
    lastLive = data.live;
    const ps = data.parkStats;

    PARK_ORDER.forEach((parkId) => {
      const s = ps.stats[parkId];
      const card = el.querySelector(`[data-park="${parkId}"]`);
      if (!card) return;
      card.querySelector("[data-hours]").innerHTML = s.hoursHtml; // hoursHtml is server-derived, safe (fmtTime output)
      const cl = crowdLabel(s.avgWait);
      card.querySelector("[data-crowd]").textContent = cl.text + (s.avgWait != null ? ` (avg standby wait ~${s.avgWait} min)` : "");
      card.querySelector("[data-closures]").textContent = s.downCount
        ? s.downNames.slice(0, 4).join(", ") + (s.downCount > 4 ? ` +${s.downCount - 4} more` : "")
        : "Nothing reported down right now";
      const llEl = card.querySelector("[data-ll]");
      const base = llEl.dataset.base || "";
      llEl.textContent = s.llText ? s.llText + " — " + base : base;
    });

    renderAllRides(el, ctx);
    renderDLParkDetails(el, data);
    applyResortPanels(el);
  },
};

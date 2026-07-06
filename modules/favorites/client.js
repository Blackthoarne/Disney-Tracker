// Pinned Favorites: a compact card of the guest's starred attractions with
// live waits. Server-backed favorites (shared across devices). Hidden when
// empty. Star toggles use event delegation on data-fav (no inline onclick).

import { esc } from "../../js/core/format.js";
import { llStatus } from "../../js/core/parks.js";

let lastLive = null;

function render(el, ctx) {
  const favs = ctx.favorites.list();
  const section = el.closest("section");
  if (!favs.length) {
    if (section) section.style.display = "none";
    el.innerHTML = "";
    return;
  }
  if (section) section.style.display = "";

  const all = (lastLive?.liveData || []).filter((i) => i.entityType === "ATTRACTION");
  let html = "";
  favs.forEach((name) => {
    const r = all.find((i) => i.name === name);
    const wait = r && r.queue && r.queue.STANDBY ? r.queue.STANDBY.waitTime : null;
    const isDown = r && r.status && r.status !== "OPERATING";
    const waitText = !r ? "—" : isDown ? r.status.replace(/_/g, " ") : typeof wait === "number" ? wait + " min" : "—";
    const ll = r ? llStatus(r) : null;
    html += `<div class="item-card" style="margin-bottom:6px;padding:10px 14px;">
      <div class="item-top">
        <div class="item-name fav-toggle" style="font-size:13.5px;" data-fav="${esc(name)}">⭐ ${esc(name)}</div>
        <span class="window-pill ${isDown ? "ap" : ""}">${esc(waitText)}</span>
      </div>
      ${ll ? `<div class="item-desc">${esc(ll.text)}</div>` : ""}
    </div>`;
  });
  el.innerHTML = html;
}

export default {
  async mount(el, ctx) {
    el.innerHTML = "";
    // Event delegation for star toggles.
    el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-fav]");
      if (!t) return;
      ctx.favorites.toggle(t.getAttribute("data-fav"));
    });
    // Re-render when favorites change from any module.
    ctx.bus.on("favorites:changed", () => render(el, ctx));
    render(el, ctx);
  },

  onData(data, ctx, el) {
    lastLive = data.live;
    render(el, ctx);
  },
};

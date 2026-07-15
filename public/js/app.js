// First Light — boot orchestrator.
// Fetches the module registry, builds nav + section chrome from manifests,
// dynamically imports each module's client.js, wires core services, and kicks
// off the first data refresh. One broken module degrades only its own section.

import { api } from "./core/api.js";
import { createBus } from "./core/bus.js";
import * as format from "./core/format.js";
import * as parks from "./core/parks.js";
import { createFavorites } from "./core/favorites.js";
import { createDataHub } from "./core/data.js";

const bus = createBus();
const favorites = createFavorites(api, bus);
const data = createDataHub({ api, bus });

const ctx = {
  api,
  bus,
  favorites,
  format,
  parks,
  refresh: () => data.refresh().catch(() => {}),
};

function badgeSpans(badges) {
  return (badges || [])
    .map((b) => {
      const cls = b.type === "curated" ? "live-tag curated" : "live-tag";
      return `<span class="${cls}">${format.esc(b.label || "")}</span>`;
    })
    .join(" ");
}

// Section accent border by nav group (mirrors v2's per-section inline styles).
const GROUP_ACCENT = {
  "RIGHT NOW": "var(--amber)",
  "PLAN": "var(--updated)",
  "REFERENCE": "var(--text-faint)",
};

// Build the section chrome (title, badges, tag) + an empty body for a module.
function buildSection(mod) {
  const section = document.createElement("section");
  section.id = mod.id;
  const accent = GROUP_ACCENT[mod.group];
  if (accent) {
    section.style.borderLeft = `4px solid ${accent}`;
    section.style.paddingLeft = "16px";
  }
  if (mod.resorts && !mod.resorts.includes("dl")) section.classList.add("wdw-only");
  const head = document.createElement("div");
  head.className = "section-head";
  head.innerHTML =
    `<h2>${format.esc(mod.title)} ${badgeSpans(mod.badges)}</h2>` +
    (mod.tag ? `<span class="section-tag">${format.esc(mod.tag)}</span>` : "");
  const body = document.createElement("div");
  body.className = "module-body";
  section.appendChild(head);
  section.appendChild(body);
  return { section, body };
}

async function boot() {
  // Core clock.
  updateClock();
  setInterval(updateClock, 30_000);

  // Load the registry.
  let modules = [];
  try {
    const reg = await api.get("/api/modules");
    modules = reg.modules || [];
  } catch (err) {
    setStatus("Couldn't load the module registry — " + err.message, true);
    return;
  }

  const quicknav = document.getElementById("quicknav");
  const sections = document.getElementById("sections");
  const headerSlots = document.getElementById("headerSlots");

  // Build nav + section chrome; collect mount targets.
  const mounts = []; // { mod, el }
  let lastNavGroup = null;
  for (const mod of modules) {
    if (mod.slot === "header") {
      const wrap = document.createElement("div");
      wrap.id = `header-${mod.id}`;
      headerSlots.appendChild(wrap);
      mounts.push({ mod, el: wrap });
      continue;
    }
    // main slot
    if (mod.nav !== false) {
      if (mod.group && mod.group !== lastNavGroup) {
        const label = document.createElement("span");
        label.className = "nav-group-label";
        label.textContent = mod.group;
        quicknav.appendChild(label);
        lastNavGroup = mod.group;
      }
      const a = document.createElement("a");
      a.href = `#${mod.id}`;
      a.textContent = mod.navLabel || mod.title;
      quicknav.appendChild(a);
    }
    const { section, body } = buildSection(mod);
    sections.appendChild(section);
    mounts.push({ mod, el: body });
  }

  // Load favorites (server-backed) before mounting so modules see them.
  await favorites.load();

  // Dynamically import + mount every module. Failures are isolated.
  const loaded = [];
  const results = await Promise.allSettled(
    mounts.map(async ({ mod, el }) => {
      const client = await import(`/modules/${mod.id}/client.js`);
      const impl = client.default || client;
      if (typeof impl.mount === "function") await impl.mount(el, ctx);
      return { mod, el, impl };
    })
  );
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      loaded.push(r.value);
    } else {
      const { mod, el } = mounts[i];
      console.error(`module "${mod.id}" failed:`, r.reason);
      el.innerHTML = `<div class="module-error"><b>This section failed to load.</b> ${format.esc(String(r.reason?.message || r.reason))}</div>`;
    }
  });

  // Re-render loaded modules on every data refresh.
  bus.on("data", (payload) => {
    for (const { mod, el, impl } of loaded) {
      if (typeof impl.onData === "function") {
        try {
          impl.onData(payload, ctx, el);
        } catch (err) {
          console.error(`module "${mod.id}" onData threw:`, err);
        }
      }
    }
  });

  // Live status line.
  bus.on("data:loading", () => setStatus("Refreshing live data…", false));
  bus.on("data:status", (s) => {
    if (s.ok) {
      const t = format.fmtClock();
      setStatus((s.stale ? "Showing last good data · " : "Live · updated ") + t, s.stale);
    } else {
      setStatus("Couldn't reach live data — check your connection and tap Refresh. (" + s.error + ")", true);
    }
  });

  // Refresh button.
  const btn = document.getElementById("refreshBtn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "↻ Loading…";
    updateClock();
    await data.refresh().catch(() => {});
    btn.disabled = false;
    btn.textContent = "↻ Refresh";
  });

  // Header "right now" temperature from the hourly feed (v2's stubTemp).
  bus.on("data", (payload) => {
    const el = document.getElementById("stubTemp");
    const now = payload.hourly?.properties?.periods?.[0];
    if (el && now) el.textContent = now.temperature + "°" + now.temperatureUnit + " " + now.shortForecast;
  });

  // Resort switcher (WDW / Disneyland) — ported from v2's switchResort().
  const btnWdw = document.getElementById("resortBtnWdw");
  const btnDl = document.getElementById("resortBtnDl");
  function applyResort(r) {
    parks.setResort(r);
    btnWdw.classList.toggle("active", r === "wdw");
    btnDl.classList.toggle("active", r === "dl");
    document.querySelectorAll(".wdw-only").forEach((el) => {
      el.style.display = r === "wdw" ? "" : "none";
    });
    bus.emit("resort:changed", r);
    data.refresh().catch(() => {});
  }
  btnWdw.addEventListener("click", () => applyResort("wdw"));
  btnDl.addEventListener("click", () => applyResort("dl"));

  // Back-to-top button (v2).
  const backToTop = document.getElementById("backToTop");
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => {
    if (window.scrollY > 500) backToTop.classList.add("show");
    else backToTop.classList.remove("show");
  });

  // First load + periodic refresh.
  await data.refresh().catch(() => {});
  data.start();

  // Service worker (installability + instant park-Wi-Fi opens).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function setStatus(text, isErr) {
  const t = document.getElementById("liveStatusText");
  const d = document.getElementById("liveDot");
  if (t) t.textContent = text;
  if (d) d.className = isErr ? "dot err" : "dot";
}

function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById("stubDate");
  const timeEl = document.getElementById("stubTime");
  if (dateEl) dateEl.textContent = format.fmtDate(now);
  if (timeEl) timeEl.textContent = format.fmtClock(now);
}

boot();

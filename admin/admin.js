// First Light — Curation Admin. Dependency-free vanilla JS. Lists curated
// modules, edits them with a form over the schema (plus a raw-JSON fallback),
// previews with the same renderer the dashboard uses, and publishes with a
// Bearer admin token (remembered in sessionStorage).

import { renderCurated } from "/js/core/curated.js";

const TOKEN_KEY = "flAdminToken";
const $ = (id) => document.getElementById(id);

let curatedModules = []; // [{id, title}]
let current = null; // { id, title }
let doc = null; // working document

// ---- token -----------------------------------------------------------------
function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}
$("tokenInput").value = getToken();
$("tokenSave").addEventListener("click", () => {
  sessionStorage.setItem(TOKEN_KEY, $("tokenInput").value.trim());
  toast("Token saved for this session.", "ok");
});

function authHeaders() {
  return { Authorization: `Bearer ${$("tokenInput").value.trim() || getToken()}` };
}

// ---- helpers ---------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast " + (kind || "");
  if (msg) setTimeout(() => { if (t.textContent === msg) { t.textContent = ""; } }, 4000);
}
function isExpiringSoon(expires) {
  if (!expires) return false;
  const d = new Date(expires);
  if (isNaN(d)) return false;
  const soon = new Date();
  soon.setDate(soon.getDate() + 14);
  return d < soon; // past or within 14 days
}
function countExpiring(d) {
  let n = 0;
  (d?.groups || []).forEach((g) => (g.items || []).forEach((i) => { if (isExpiringSoon(i.expires)) n++; }));
  return n;
}

// ---- module list -----------------------------------------------------------
async function loadList() {
  const grid = $("modGrid");
  try {
    const reg = await fetch("/api/modules").then((r) => r.json());
    curatedModules = (reg.modules || []).filter((m) => m.type === "curated");
  } catch (err) {
    grid.innerHTML = `<p class="empty-note">Could not load modules: ${esc(err.message)}</p>`;
    return;
  }
  if (!curatedModules.length) {
    grid.innerHTML = `<p class="empty-note">No curated modules found.</p>`;
    return;
  }
  const cards = await Promise.all(
    curatedModules.map(async (m) => {
      let d = null;
      try { d = await fetch(`/api/curated/${m.id}`).then((r) => (r.ok ? r.json() : null)); } catch { /* ignore */ }
      const updated = d?.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "never";
      const exp = countExpiring(d);
      return `<div class="mod-card" data-open="${esc(m.id)}">
        <h3>${esc(m.title)}</h3>
        <div class="mod-meta">Updated ${esc(updated)}</div>
        <div class="mod-meta">${exp ? `<span class="warn-flag">${exp} item${exp > 1 ? "s" : ""} expiring/expired</span>` : "No expiring items"}</div>
      </div>`;
    })
  );
  grid.innerHTML = cards.join("");
  grid.querySelectorAll("[data-open]").forEach((c) =>
    c.addEventListener("click", () => openEditor(c.getAttribute("data-open")))
  );
}

// ---- editor ----------------------------------------------------------------
async function openEditor(id) {
  current = curatedModules.find((m) => m.id === id) || { id, title: id };
  try {
    doc = await fetch(`/api/curated/${id}`).then((r) => (r.ok ? r.json() : {}));
  } catch {
    doc = {};
  }
  if (!doc || typeof doc !== "object") doc = {};
  if (!Array.isArray(doc.groups)) doc.groups = [];
  $("editTitle").textContent = current.title;
  $("listView").classList.add("hidden");
  $("editView").classList.remove("hidden");
  renderForm();
  renderPreview();
  loadBackups();
}

function renderForm() {
  const docFields = `
    <div class="field"><label>Intro (optional leading note)</label><input data-doc="intro" value="${esc(doc.intro || "")}"></div>
    <div class="field"><label>Note (optional trailing disclaimer)</label><textarea data-doc="note" rows="2">${esc(doc.note || "")}</textarea></div>
  `;
  const groups = (doc.groups || []).map((g, gi) => {
    const items = (g.items || []).map((it, ii) => `
      <div class="item-box">
        <div class="field"><label>Name</label><input data-g="${gi}" data-i="${ii}" data-f="name" value="${esc(it.name || "")}"></div>
        <div class="row-inline">
          <div class="field"><label>Location</label><input data-g="${gi}" data-i="${ii}" data-f="location" value="${esc(it.location || "")}"></div>
        </div>
        <div class="field"><label>Description</label><textarea data-g="${gi}" data-i="${ii}" data-f="desc" rows="2">${esc(it.desc || "")}</textarea></div>
        <div class="row-inline">
          <div class="field"><label>Pill label</label><input data-g="${gi}" data-i="${ii}" data-f="pillLabel" value="${esc(it.pill?.label || "")}"></div>
          <div class="field"><label>Pill style</label><select data-g="${gi}" data-i="${ii}" data-f="pillStyle">
            <option value="default"${it.pill?.style !== "ap" ? " selected" : ""}>default</option>
            <option value="ap"${it.pill?.style === "ap" ? " selected" : ""}>ap (passholder)</option>
          </select></div>
          <div class="field"><label>Expires</label><input type="date" data-g="${gi}" data-i="${ii}" data-f="expires" value="${esc(it.expires || "")}"></div>
          <div class="field" style="flex:0 0 auto;"><label>AP excl.</label><input type="checkbox" data-g="${gi}" data-i="${ii}" data-f="apExclusive"${it.apExclusive ? " checked" : ""}></div>
        </div>
        <button class="mini-btn danger" data-remove-item="${gi}:${ii}">Remove item</button>
      </div>`).join("");
    return `<div class="group-box">
      <div class="field"><label>Group title</label><input data-g="${gi}" data-gf="title" value="${esc(g.title || "")}"></div>
      <div class="field"><label>Group note (optional)</label><input data-g="${gi}" data-gf="note" value="${esc(g.note || "")}"></div>
      ${items}
      <div class="row-inline">
        <button class="mini-btn" data-add-item="${gi}">+ Add item</button>
        <button class="mini-btn danger" data-remove-group="${gi}">Remove group</button>
      </div>
    </div>`;
  }).join("");

  $("formEditor").innerHTML = docFields + groups + `<button class="mini-btn" id="addGroup">+ Add group</button>`;

  // Wire inputs → doc.
  $("formEditor").querySelectorAll("[data-doc]").forEach((el) =>
    el.addEventListener("input", () => { doc[el.getAttribute("data-doc")] = el.value; renderPreview(); syncRaw(); })
  );
  $("formEditor").querySelectorAll("[data-gf]").forEach((el) =>
    el.addEventListener("input", () => { doc.groups[+el.getAttribute("data-g")][el.getAttribute("data-gf")] = el.value; renderPreview(); syncRaw(); })
  );
  $("formEditor").querySelectorAll("[data-f]").forEach((el) =>
    el.addEventListener("input", () => { applyItemField(el); renderPreview(); syncRaw(); })
  );
  $("formEditor").querySelectorAll("[data-add-item]").forEach((b) =>
    b.addEventListener("click", () => { const gi = +b.getAttribute("data-add-item"); doc.groups[gi].items = doc.groups[gi].items || []; doc.groups[gi].items.push({ name: "New item" }); renderForm(); renderPreview(); syncRaw(); })
  );
  $("formEditor").querySelectorAll("[data-remove-item]").forEach((b) =>
    b.addEventListener("click", () => { const [gi, ii] = b.getAttribute("data-remove-item").split(":").map(Number); doc.groups[gi].items.splice(ii, 1); renderForm(); renderPreview(); syncRaw(); })
  );
  $("formEditor").querySelectorAll("[data-remove-group]").forEach((b) =>
    b.addEventListener("click", () => { doc.groups.splice(+b.getAttribute("data-remove-group"), 1); renderForm(); renderPreview(); syncRaw(); })
  );
  $("addGroup").addEventListener("click", () => { doc.groups.push({ title: "New group", items: [] }); renderForm(); renderPreview(); syncRaw(); });
}

function applyItemField(el) {
  const gi = +el.getAttribute("data-g"), ii = +el.getAttribute("data-i"), f = el.getAttribute("data-f");
  const it = doc.groups[gi].items[ii];
  if (f === "apExclusive") it.apExclusive = el.checked;
  else if (f === "pillLabel") { it.pill = it.pill || {}; it.pill.label = el.value; if (!it.pill.style) it.pill.style = "default"; }
  else if (f === "pillStyle") { it.pill = it.pill || {}; it.pill.style = el.value; }
  else if (f === "expires") it.expires = el.value || null;
  else it[f] = el.value;
}

function renderPreview() {
  $("preview").innerHTML = renderCurated(doc);
}
function syncRaw() {
  if (!$("rawWrap").classList.contains("hidden")) $("rawJson").value = JSON.stringify(doc, null, 2);
}

// ---- raw json toggle -------------------------------------------------------
$("rawToggle").addEventListener("click", () => {
  const wrap = $("rawWrap");
  wrap.classList.toggle("hidden");
  if (!wrap.classList.contains("hidden")) $("rawJson").value = JSON.stringify(doc, null, 2);
});
$("rawApply").addEventListener("click", () => {
  try {
    doc = JSON.parse($("rawJson").value);
    if (!Array.isArray(doc.groups)) doc.groups = [];
    renderForm();
    renderPreview();
    toast("JSON applied.", "ok");
  } catch (err) {
    toast("Invalid JSON: " + err.message, "err");
  }
});

// ---- save + backups --------------------------------------------------------
$("saveBtn").addEventListener("click", async () => {
  if (!current) return;
  doc.module = current.id;
  doc.updatedAt = new Date().toISOString();
  doc.updatedBy = "admin";
  try {
    const res = await fetch(`/api/curated/${current.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(doc),
    });
    if (res.status === 401) return toast("Unauthorized — check your admin token.", "err");
    if (res.status === 403) return toast("Admin writes are disabled (ADMIN_TOKEN not set on the server).", "err");
    if (!res.ok) return toast("Save failed: " + res.status, "err");
    toast("Published ✓", "ok");
    loadBackups();
  } catch (err) {
    toast("Save failed: " + err.message, "err");
  }
});

async function loadBackups() {
  const wrap = $("backups");
  try {
    const { backups } = await fetch(`/api/curated/${current.id}/backups`).then((r) => r.json());
    if (!backups.length) { wrap.innerHTML = `<p class="empty-note">No backups yet.</p>`; return; }
    wrap.innerHTML = backups.map((b) =>
      `<div class="backup-item"><span>${esc(b.timestamp)}</span><button class="mini-btn" data-restore="${esc(b.name)}">Restore</button></div>`
    ).join("");
    wrap.querySelectorAll("[data-restore]").forEach((btn) =>
      btn.addEventListener("click", () => restore(btn.getAttribute("data-restore")))
    );
  } catch (err) {
    wrap.innerHTML = `<p class="empty-note">Could not load backups: ${esc(err.message)}</p>`;
  }
}

async function restore(name) {
  if (!confirm(`Restore backup ${name}? The current version is backed up first.`)) return;
  try {
    const res = await fetch(`/api/curated/${current.id}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name }),
    });
    if (res.status === 401) return toast("Unauthorized — check your admin token.", "err");
    if (res.status === 403) return toast("Admin writes are disabled.", "err");
    if (!res.ok) return toast("Restore failed: " + res.status, "err");
    toast("Restored ✓", "ok");
    openEditor(current.id);
  } catch (err) {
    toast("Restore failed: " + err.message, "err");
  }
}

$("backBtn").addEventListener("click", () => {
  $("editView").classList.add("hidden");
  $("listView").classList.remove("hidden");
  loadList();
});

loadList();

// Generic curated-content renderer. Draws any document in the curated schema
// into the existing .park-group / .item-card / .window-pill markup, so most
// curated modules need zero custom layout code.
//
// Schema:
//   {
//     module, updatedAt, updatedBy, note, intro,
//     groups: [
//       { title, note, items: [
//         { name, location, desc, pill: {label, style}, apExclusive, expires }
//       ] }
//     ]
//   }
//   - pill.style: "ap" → blue passholder pill; anything else → default amber.
//   - expires: ISO date; if in the past the item renders dimmed + flagged.

import { esc, fmtShortDate } from "./format.js";

function isExpired(expires) {
  if (!expires) return false;
  const d = new Date(expires);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function renderItem(item) {
  const expired = isExpired(item.expires);
  const pill = item.pill && item.pill.label
    ? `<span class="window-pill ${item.pill.style === "ap" ? "ap" : ""}">${esc(item.pill.label)}${expired ? '</span><span class="expired-flag">expired?</span>' : "</span>"}`
    : expired
    ? `<span class="expired-flag">expired?</span>`
    : "";
  const loc = item.location ? `<div class="item-loc">${esc(item.location)}</div>` : "";
  const desc = item.desc ? `<div class="item-desc">${esc(item.desc)}</div>` : "";
  const apNote = item.apExclusive ? `<div class="ap-note">Annual Passholder exclusive</div>` : "";
  return `<div class="item-card${expired ? " expired" : ""}">
    <div class="item-top">
      <div><div class="item-name">${esc(item.name)}</div>${loc}</div>
      ${pill}
    </div>
    ${desc}${apNote}
  </div>`;
}

function renderGroup(group) {
  const note = group.note
    ? `<p class="curated-note" style="margin-bottom:8px;">${esc(group.note)}</p>`
    : "";
  const items = (group.items || []).map(renderItem).join("");
  return `<div class="park-group">
    <div class="park-group-title">${esc(group.title || "")}</div>
    ${note}${items}
  </div>`;
}

// Render a curated document to an HTML string.
export function renderCurated(doc) {
  if (!doc || typeof doc !== "object") {
    return `<p class="empty-note">No curated content yet.</p>`;
  }
  const updated = doc.updatedAt
    ? `<div class="curated-updated">Curated · updated ${esc(fmtShortDate(doc.updatedAt))}</div>`
    : "";
  const intro = doc.intro ? `<p class="curated-note" style="margin-bottom:12px;">${esc(doc.intro)}</p>` : "";
  const groups = (doc.groups || []).map(renderGroup).join("");
  const note = doc.note ? `<p class="curated-note" style="margin-top:4px;">${esc(doc.note)}</p>` : "";
  return updated + intro + groups + note;
}

// Convenience: fetch + render a module's curated doc into `el`.
export async function mountCurated(el, ctx, moduleId) {
  try {
    const doc = await ctx.api.get(`/api/curated/${moduleId}`);
    el.innerHTML = renderCurated(doc);
  } catch (err) {
    el.innerHTML = `<p class="empty-note">Curated content is unavailable right now (${esc(String(err.message || err))}).</p>`;
  }
}

export default { renderCurated, mountCurated };

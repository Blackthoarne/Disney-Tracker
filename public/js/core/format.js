// Formatting + escaping helpers shared by every module.

// HTML-escape a string for safe interpolation into innerHTML. ALL upstream /
// user-provided strings must pass through this before hitting the DOM.
export function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "3:45 PM" from an ISO timestamp (with hour+minute).
export function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

// Same as fmtTime — kept as a distinct name for showtimes for readability.
export const fmtShowTime = fmtTime;

// "Sat, Jul 6"
export function fmtDate(d = new Date()) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// "Jul 6" (used by curated freshness lines)
export function fmtShortDate(d) {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

// "9:41 AM" clock
export function fmtClock(d = new Date()) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Local YYYY-MM-DD (avoids the UTC-rollover bug in the evening).
export function localDateStr(d = new Date()) {
  return new Date(d).toLocaleDateString("en-CA");
}

export default { esc, fmtTime, fmtShowTime, fmtDate, fmtShortDate, fmtClock, localDateStr };

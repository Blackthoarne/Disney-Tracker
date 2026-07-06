// Park identity constants + crowd labelling. Ported verbatim from the
// original single-file app so behaviour is identical.

export const PARK_ORDER = [
  "75ea578a-adc8-4116-a54d-dccb60765ef9", // Magic Kingdom
  "47f90d2c-e191-4239-a466-5892ef59a88b", // EPCOT
  "288747d1-8b4f-4a64-867e-ea7c9b27bad8", // Hollywood Studios
  "1c84a229-8862-4648-9c71-378ddd2c7693", // Animal Kingdom
];

export const PARK_META = {
  "75ea578a-adc8-4116-a54d-dccb60765ef9": { name: "Magic Kingdom", short: "MK", emoji: "🏰" },
  "47f90d2c-e191-4239-a466-5892ef59a88b": { name: "EPCOT", short: "EPCOT", emoji: "🌐" },
  "288747d1-8b4f-4a64-867e-ea7c9b27bad8": { name: "Disney's Hollywood Studios", short: "HS", emoji: "🎬" },
  "1c84a229-8862-4648-9c71-378ddd2c7693": { name: "Disney's Animal Kingdom", short: "AK", emoji: "🌴" },
};

// Keywords used to surface marquee entertainment (parades, fireworks, major
// stage shows) and filter out the long tail of street performers and
// individual character meet-and-greets.
export const MARQUEE_KEYWORDS = [
  "parade", "fireworks", "fantasmic", "starlight", "luminous", "celebrate america",
  "symphony", "flag retreat", "frozen sing-along", "beauty and the beast",
  "indiana jones", "festival of the lion king", "finding nemo",
  "friendship faire", "roundup", "cavalcade", "concert in the sky", "tribute",
];

// Lightning Lane / Individual Lightning Lane status for a live attraction.
// Ported verbatim from the original llStatus(). Returns {text, cls} or null.
export function llStatus(item) {
  const fmt = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const q = item.queue || {};
  if (q.PAID_RETURN_TIME) {
    const p = q.PAID_RETURN_TIME;
    if (p.state === "AVAILABLE" && p.price) return { text: p.price.formatted, cls: "ap" };
    if (p.state === "FINISHED") return { text: "ILL sold out", cls: "" };
    return { text: "ILL not yet open", cls: "" };
  }
  if (q.RETURN_TIME) {
    const r = q.RETURN_TIME;
    if (r.state === "AVAILABLE" && r.returnStart) {
      return { text: "LL " + fmt(r.returnStart) + "–" + fmt(r.returnEnd), cls: "" };
    }
    if (r.state === "FINISHED") return { text: "LL sold out", cls: "" };
    return { text: "LL not yet open", cls: "" };
  }
  return null;
}

export function crowdLabel(avgWait) {
  if (avgWait == null) return { text: "—", cls: "crowd-mod" };
  if (avgWait < 15) return { text: "Low", cls: "crowd-low" };
  if (avgWait < 30) return { text: "Moderate", cls: "crowd-mod" };
  if (avgWait < 45) return { text: "Busy", cls: "crowd-mod" };
  return { text: "Very High", cls: "crowd-high" };
}

export default { PARK_ORDER, PARK_META, MARQUEE_KEYWORDS, crowdLabel, llStatus };

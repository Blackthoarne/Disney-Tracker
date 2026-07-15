// Park identity constants + crowd labelling, now multi-resort (ported from the
// v2 single-file page). PARK_ORDER is a live ESM binding — setResort()
// reassigns it and every importer sees the new value, mirroring v2's
// `let PARK_ORDER` behaviour.

export const RESORTS = {
  wdw: {
    id: "e957da41-3552-4cf6-b636-5babc5cbc4e5",
    parks: [
      "75ea578a-adc8-4116-a54d-dccb60765ef9", // Magic Kingdom
      "47f90d2c-e191-4239-a466-5892ef59a88b", // EPCOT
      "288747d1-8b4f-4a64-867e-ea7c9b27bad8", // Hollywood Studios
      "1c84a229-8862-4648-9c71-378ddd2c7693", // Animal Kingdom
    ],
    label: "Walt Disney World",
  },
  dl: {
    id: "bfc89fd6-314d-44b4-b89e-df1a89cf991e",
    parks: [
      "7340550b-c14d-4def-80bb-acdb51d49a66", // Disneyland Park
      "832fcd51-ea19-4e77-85c7-75d5843b127c", // Disney California Adventure
    ],
    label: "Disneyland Resort",
  },
};

export let currentResort = "wdw";
export let PARK_ORDER = RESORTS.wdw.parks;

export function setResort(r) {
  if (!RESORTS[r]) return;
  currentResort = r;
  PARK_ORDER = RESORTS[r].parks;
}

export const PARK_META = {
  "75ea578a-adc8-4116-a54d-dccb60765ef9": { name: "Magic Kingdom", short: "MK", emoji: "🏰" },
  "47f90d2c-e191-4239-a466-5892ef59a88b": { name: "EPCOT", short: "EPCOT", emoji: "🌐" },
  "288747d1-8b4f-4a64-867e-ea7c9b27bad8": { name: "Disney's Hollywood Studios", short: "HS", emoji: "🎬" },
  "1c84a229-8862-4648-9c71-378ddd2c7693": { name: "Disney's Animal Kingdom", short: "AK", emoji: "🌴" },
  "7340550b-c14d-4def-80bb-acdb51d49a66": { name: "Disneyland Park", short: "DL", emoji: "🏰" },
  "832fcd51-ea19-4e77-85c7-75d5843b127c": { name: "Disney California Adventure", short: "DCA", emoji: "🎢" },
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
// Ported from v2's llStatus() (adds the "closing soon" hint). Returns
// {text, cls} or null.
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
      const closingSoon = r.returnEnd && new Date(r.returnEnd).getTime() - Date.now() < 60 * 60 * 1000;
      return { text: "LL " + fmt(r.returnStart) + "–" + fmt(r.returnEnd) + (closingSoon ? " ⏰ closing soon" : ""), cls: "" };
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

export default { RESORTS, PARK_META, MARQUEE_KEYWORDS, crowdLabel, llStatus, setResort };

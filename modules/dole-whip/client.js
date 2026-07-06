// Dole Whip Finder — curated. Rendered by the generic curated renderer from
// /api/curated/dole-whip (seeded from seed.json, editable at runtime via /admin).
import { mountCurated } from "../../js/core/curated.js";

export default {
  async mount(el, ctx) {
    await mountCurated(el, ctx, "dole-whip");
  },
};

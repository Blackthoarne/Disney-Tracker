// Adults Only — curated. Rendered by the generic curated renderer from
// /api/curated/adults-only (seeded from seed.json, editable via /admin).
import { mountCurated } from "../../js/core/curated.js";

export default {
  async mount(el, ctx) {
    await mountCurated(el, ctx, "adults-only");
  },
};

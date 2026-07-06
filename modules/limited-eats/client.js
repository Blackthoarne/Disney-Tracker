// Limited-Time Eats & Drinks — curated. Rendered by the generic curated
// renderer from /api/curated/limited-eats (seeded from seed.json, editable
// at runtime via /admin).
import { mountCurated } from "../../js/core/curated.js";

export default {
  async mount(el, ctx) {
    await mountCurated(el, ctx, "limited-eats");
  },
};

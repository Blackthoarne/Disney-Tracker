// Restrooms, First Aid & Baby Care — curated. Rendered by the generic curated
// renderer from /api/curated/facilities (seeded from seed.json, editable via
// /admin). Content ported from the v2 page's facilities section.
import { mountCurated } from "../../js/core/curated.js";

export default {
  async mount(el, ctx) {
    await mountCurated(el, ctx, "facilities");
  },
};

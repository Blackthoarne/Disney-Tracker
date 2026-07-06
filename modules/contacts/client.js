// Resort Contacts — curated. Rendered by the generic curated renderer from
// /api/curated/contacts (seeded from seed.json, editable via /admin).
import { mountCurated } from "../../js/core/curated.js";

export default {
  async mount(el, ctx) {
    await mountCurated(el, ctx, "contacts");
  },
};

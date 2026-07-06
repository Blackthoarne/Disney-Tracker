// OPTIONAL server-side routes for a module. Delete this file if your module
// doesn't need its own upstream fetch or heavy computation.
//
// Routes are auto-mounted under the module's namespace. The key is
// "<METHOD> /<path>" and becomes GET /api/modules/<id>/<path>.
//
// The handler receives (req, res, ctx) where ctx = { cache, fetchJson, config,
// store }. Return a value to have it sent as JSON, or write to `res` yourself.

export default {
  routes: {
    // GET /api/modules/template/example
    "GET /example": async (req, res, ctx) => {
      // One cached upstream call feeds every device:
      // return ctx.cache.fetch("template-example", 10 * 60_000,
      //   () => ctx.fetchJson("https://example.gov/data.json"));
      return { ok: true, note: "Replace with your own cached upstream fetch." };
    },
  },
};

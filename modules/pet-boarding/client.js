// Pet Boarding: Best Friends Pet Care, with live hours computed from today's
// actual park hours (earliest regular open −1h to latest regular close +1h).
// Static informational cards otherwise. Ported from renderPetBoarding().

import { fmtShowTime } from "../../js/core/format.js";

export default {
  async mount(el) {
    el.innerHTML = `
    <div class="item-card">
      <div class="item-top">
        <div><div class="item-name">Best Friends Pet Care</div><div class="item-loc">On-site, near the Ticket &amp; Transportation Center</div></div>
        <span class="window-pill" id="petHoursPill">Loading…</span>
      </div>
      <div class="item-desc">Hours run one hour before the earliest park opens to one hour after the latest park closes today — computed live from today's actual park hours above. Check-out is by noon. Accepts dogs, cats, and small/pocket pets (owner-provided enclosure); no primates, venomous, or exotic species.</div>
    </div>
    <div class="tag-list" style="margin-top:8px;">
      <span class="tag">🛁 Grooming available</span>
      <span class="tag">🐕 Daycare available</span>
      <span class="tag">🚐 Resort pickup/drop-off, $25 round trip (select resorts)</span>
      <span class="tag">🌙 Staffed overnight (unique among Best Friends locations)</span>
    </div>
    <div class="item-card" style="margin-top:8px;">
      <div class="item-top">
        <div class="item-name">Reservations Line</div>
        <span class="window-pill" style="font-size:15px;padding:8px 16px;">📞 (407) 828-3218</span>
      </div>
      <div class="item-desc">Recommended, especially around holidays.</div>
    </div>`;
  },

  onData(data, ctx, el) {
    const pill = el.querySelector("#petHoursPill");
    if (!pill) return;
    const { earliestRegularOpen, latestRegularClose } = data.parkStats;
    if (earliestRegularOpen && latestRegularClose) {
      const open = new Date(earliestRegularOpen.getTime() - 60 * 60 * 1000);
      const close = new Date(latestRegularClose.getTime() + 60 * 60 * 1000);
      pill.textContent = fmtShowTime(open) + " – " + fmtShowTime(close);
    } else {
      pill.textContent = "Hours unavailable";
    }
  },
};

// All tunable AI bidding parameters live here. Starting assumptions, not
// official IPL rules; tune with `npm run simulate`.
export const BIDDING_CONFIG = {
  // V(i,p) = V(p) * (1 + N + R + Q), with the sum clamped.
  valuation: {
    needMin: -0.15, // role already well covered
    needMax: 0.2, // role badly needed
    overseasPenalty: 0.2, // scaled by how full the overseas quota is
    upgradeBonus: 0.08, // clearly better than best current same-role player
    depthPenalty: -0.05, // clearly worse than best current same-role player
    scarcityWeight: 0.12,
    eliteScarcityBonus: 0.05, // rating >= 95
    scarcityComparableCount: 8,
    factorMin: -0.3,
    factorMax: 0.25,
  },

  // S(i,p): stretch beyond normal valuation, drawn uniformly per tier.
  stretch: {
    low: [0, 0.05],
    useful: [0.05, 0.12],
    important: [0.12, 0.2],
    critical: [0.2, 0.3],
  },

  // z = price*(1-x) + need*Need + aggression*Aggression + bias
  probability: {
    price: 3.5,
    need: 0.9,
    aggression: 0.6,
    bias: -3.0,
  },

  // Failed challenge roll: withdraw for good if the price is this close to
  // the ceiling (x) or the challenge probability was this low; else PASS.
  withdrawRatio: 0.93,
  withdrawProbability: 0.1,

  // Fallback cheapest legal acquisition when the pool is unknown.
  defaultMinBasePrice: 0.75,
};

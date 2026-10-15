// All tunable AI bidding parameters live here. Starting assumptions, not
// official IPL rules; calibrated with `npm run simulate` (src/logic/simulation.js).
// Franchise-specific behaviour is NOT here: see strategies.js.
export const BIDDING_CONFIG = {
  // V(i,p) = M(p) * (1 + clamp(N + R + Q + S + C + U)) * noise
  valuation: {
    needMin: -0.15, // role already well covered
    needMax: 0.2, // role badly needed
    overseasPenalty: 0.2, // scaled by how full the overseas quota is
    upgradeBonus: 0.08, // clearly better than best current same-role player
    depthPenalty: -0.05, // clearly worse than best current same-role player
    scarcityWeight: 0.12,
    eliteScarcityBonus: 0.05, // rating >= 95
    scarcityComparableCount: 8,
    demandNeed: 0.34, // a team "needs" the role when roleNeed >= this
    demandWeight: 0.1, // teams chasing few comparable players
    cashWeight: 0.2, // spare cash per open slot relative to the field
    lateWeight: 0.2, // unmet needs as the quality supply runs out
    bargainWeight: 0.15, // max discount a bargain-hunter applies
    scale: 0.9, // global calibration of V against the market curve
    starDamp: 0.38, // extra damping for 90+ rated stars (many bidders)
    fillFloor: 1.1, // a needy team values a cheap lot at least this x base price
    fillMaxBase: 0.5, // ...but only when the base price is at most this (Cr)
    factorMin: -0.45,
    factorMax: 0.7,
  },

  // S(i,p): stretch beyond normal valuation, drawn uniformly per tier and
  // multiplied by the franchise's stretchMult.
  stretch: {
    low: [0, 0.04],
    useful: [0.02, 0.07],
    important: [0.05, 0.12],
    critical: [0.08, 0.2],
  },

  // Budget discipline: plan to spend a fair share of the remaining quality
  // (rated >= minRating) in the roles the team needs; hold back reserveFrac of it.
  reserve: { minRating: 66, fillerBelow: 62, slotShare: 1.5, mult: 2.0, maxHoldFrac: 0.55 },

  // A squad member counts toward a role requirement by quality: filler
  // players (rating ~55) fill a slot but barely satisfy the need.
  need: { floorRating: 56, fullRatingSpan: 16, minWeight: 0.2 },

  // No team ever bids above hardMax.mult x market price (franchise may override).
  hardMax: { mult: 1.5, floor: 1.0 },

  // P(challenge): flat plateau below the knee, then falling to a floor at the
  // ceiling.  knee = kneeBase + kneeAgg*A;  plateau = plateauBase + ...
  probability: {
    kneeBase: 0.66,
    kneeAgg: 0.2,
    plateauBase: 0.82,
    plateauAgg: 0.12,
    plateauNeed: 0.06,
    floorBase: 0.03,
    floorAgg: 0.22,
    curve: 1.15,
    plateauTries: 3, // independent rolls while the price is below the knee
  },

  // Failed challenge roll: withdraw for good if the price is this close to
  // the ceiling (x) or the challenge probability was this low; else PASS.
  withdrawRatio: 0.93,
  withdrawProbability: 0.1,

  // Delhi's estimate of a rival's limit: shrinks what it has observed toward
  // a prior peak/market ratio.
  disruptor: { priorWeight: 4, priorRatio: 1.05 },

  // Fallback cheapest legal acquisition when the pool is unknown.
  defaultMinBasePrice: 0.75,
};

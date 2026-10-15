// Market price of QUALITY plus the player traits the franchise strategies read.
// Pure; the only data it touches is the bundled player dataset (for set means).
import { players as DATASET } from "../data/players.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * M(rating): market price (₹ crore) for a player of this quality.
 * Knots are the smoothed mean of the real 2025 auction prices stored in
 * players.js (181 priced players; residual by role / nation / capped status
 * is within ±2% of 1.0, see simulation.js). The old (r/100)^3.8 power law was
 * ~30-40% too low for 80-92 rated players and 2-3.5x too high for the 52-60
 * tail, which is what made stars cheap and filler players expensive.
 */
export const MARKET_KNOTS = [
  [50, 0.25], [52, 0.3], [56, 0.8], [60, 1.5], [64, 2.0], [68, 3.1],
  [72, 4.3], [76, 5.9], [80, 7.8], [84, 9.9], [86, 11.4], [88, 13.5],
  [90, 15.5], [92, 17.8], [95, 21.5], [98, 25.5], [99, 27], [100, 28],
];

export const marketPrice = (rating, knots = MARKET_KNOTS) => {
  if (rating <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    if (rating <= knots[i][0]) {
      const [a, b] = knots[i - 1];
      const [c, d] = knots[i];
      return b + ((d - b) * (rating - a)) / (c - a);
    }
  }
  return knots[knots.length - 1][1];
};

// ---- pool statistics (static dataset) ------------------------------------
const pool = DATASET.filter((p) => !p.retained);
const setStats = new Map();
pool.forEach((p) => {
  const s = setStats.get(p.set) || { sum: 0, n: 0 };
  s.sum += p.rating;
  s.n += 1;
  setStats.set(p.set, s);
});
const setMean = (set) => {
  const s = setStats.get(set);
  return s ? s.sum / s.n : 58;
};

/** Number of auction-pool players rated >= 70 (used for auction progress). */
export const QUALITY_THRESHOLD = 70;
export const POOL_QUALITY_TOTAL = pool.filter((p) => p.rating >= QUALITY_THRESHOLD).length;

// ---- traits ---------------------------------------------------------------
const cache = new WeakMap();

/**
 * Evidence-based traits derived ONLY from real dataset fields (rating, role,
 * nation, set name, hist price). The dataset has no age / potential / caps
 * count, so:
 *   experience  <- capped (non-"Uncapped" set) scaled by rating
 *   prospect    <- uncapped Indian scaled by rating above the uncapped norm (~55)
 *   standout    <- rating relative to the player's own set (hidden-gem proxy)
 *   profile     <- set tier (Marquee > capped tier-1 > tier-2... > uncapped):
 *                  how "famous" the lot is
 */
export const playerTraits = (p) => {
  if (!p) return null;
  const hit = cache.get(p);
  if (hit && hit.rating === p.rating && hit.set === p.set) return hit.t;
  const set = p.set || "";
  const capped = !set.startsWith("Uncapped");
  const marquee = set === "Marquee-1" || p.rating >= 88;
  const tier = set === "Marquee-1" ? 0 : Number((set.match(/-(\d+)$/) || [])[1] || 1);
  const bowlerKind = p.role === "Bowler"
    ? /Spinner/.test(set) ? "spin" : /Fast Bowler/.test(set) ? "pace" : "any"
    : null;
  const t = {
    capped,
    uncapped: !capped,
    indian: p.nation === "Indian",
    foreign: p.nation === "Foreigner",
    marquee,
    tier,
    bowlerKind,
    market: marketPrice(p.rating),
    experience: capped ? 0.55 + 0.45 * clamp((p.rating - 60) / 30, 0, 1) : 0.05,
    prospect: !capped && p.nation === "Indian" ? clamp((p.rating - 56) / 14, 0, 1) : 0,
    standout: clamp((p.rating - setMean(set)) / 15, -1, 1),
    profile: set === "Marquee-1" ? 1 : !capped ? 0.2 : clamp(0.8 - 0.15 * tier, 0.3, 0.75),
    eliteBat: p.role === "Batter" ? clamp((p.rating - 78) / 14, 0, 1) : 0,
    star: clamp((p.rating - 80) / 15, 0, 1),
  };
  cache.set(p, { rating: p.rating, set: p.set, t });
  return t;
};

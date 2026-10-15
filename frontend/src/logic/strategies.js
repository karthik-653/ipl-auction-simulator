// Franchise recruitment philosophies as configuration. Keyed by the stable
// franchise code used everywhere in the data (`team.name` === `player.team`,
// e.g. "CSK"); never by display names or by the numeric ids (aiTeams.js and
// teams.js number the franchises differently).
//
// A profile only changes WHAT a team values and HOW it competes. Money rules
// (purse, reserve, increments, squad/overseas limits, hard maximum) live in
// auctionEngine.js and apply identically to every team.
//
// Every number is a weight / multiplier with a bounded effect; calibrated with
// `node src/logic/simulation.js`.
import { QUALITY_THRESHOLD, marketPrice } from "./market.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ROLES = ["Batter", "Bowler", "AllRounder", "WicketKeeper"];

/** Neutral baseline (also used for any franchise without a profile). */
export const NEUTRAL_STRATEGY = {
  code: "NEUTRAL",
  label: "Neutral baseline",
  philosophy: "No special preferences; role need, scarcity and budget only.",
  aggression: 0.75, // 0..1 appetite to keep raising
  stretchMult: 1, // scales the tier stretch above normal valuation
  noise: 0.06, // sigma of the per-lot lognormal valuation noise
  bargain: 0.3, // 0..1 discounts non-priority lots
  reserveFrac: 0.55, // share of planned future spending held back (discipline)
  maxShare: 0.32, // single player may take at most this share of 120 Cr
  hardMaxMult: 1.5, // never more than this x market price
  withdrawRatio: 0.93, // failed roll at/above this price/ceiling = permanent
  fight: 0, // extra urge to re-challenge deep into a war
  needWeight: 1, // scales the role-need adjustment
  scarcitySens: 1,
  lateUrgency: 0.5,
  cashSens: 0.5, // how much spare cash per open slot lifts valuations
  roleWeight: {}, // multiplier-1 style role preference
  w: {}, // trait weights (see strategyFactor)
  targets: {}, // composition targets that fade preferences as they fill
  roleBudget: {}, // { Role: { max, min } } shares of 120 Cr
  named: [],
  quirks: {},
};

const S = (o) => ({ ...NEUTRAL_STRATEGY, ...o });

export const TEAM_STRATEGIES = {
  CSK: S({
    code: "CSK",
    reserveFrac: 0.8,
    label: "Experience & restraint",
    philosophy: "Proven, experienced players; disciplined, value-first; stretches only for an ideal veteran filling a critical need.",
    aggression: 0.64, stretchMult: 0.4, noise: 0.05, bargain: 0.65, maxShare: 0.2,
    hardMaxMult: 1.25, withdrawRatio: 0.84, needWeight: 1.1,
    roleWeight: { AllRounder: 1.1, WicketKeeper: 1.1 },
    w: { experience: 0.9, prospect: -0.25, marquee: -0.06 },
    quirks: { veteranCritical: { minExperience: 0.8, minNeed: 0.55, bonus: 0.18, stretchMult: 3 } },
  }),
  MI: S({
    code: "MI",
    reserveFrac: 0.6,
    label: "Scouting & Indian talent",
    philosophy: "Spots promising uncapped Indian talent early, mixes it with experienced leaders, and builds a balanced squad.",
    aggression: 0.8, stretchMult: 1.1, noise: 0.07, bargain: 0.3, maxShare: 0.3,
    needWeight: 1.1,
    w: { prospect: 1.8, indian: 0.07, experience: 0.35, standout: 0.28, leaders: 0.1 },
    targets: { prospects: 6 },
  }),
  RCB: S({
    code: "RCB",
    reserveFrac: 0.45,
    label: "Star batting identity",
    philosophy: "Elite top-order batting around a star anchor, balanced by a real bowling attack.",
    aggression: 0.86, stretchMult: 1.15, noise: 0.08, bargain: 0.2, maxShare: 0.34,
    roleWeight: { Batter: 1.15 },
    w: { eliteBat: 0.6, marquee: 0.1 },
    targets: { eliteBat: 2 },
    roleBudget: { Batter: { max: 0.4 }, Bowler: { min: 0.26 } },
  }),
  KKR: S({
    code: "KKR",
    reserveFrac: 0.55,
    label: "Analytical value hunters",
    philosophy: "Hunts hidden value and tactical fit (all-round and spin options, standout players in low-profile lots); occasional high-conviction bets.",
    aggression: 0.78, stretchMult: 1.15, noise: 0.14, bargain: 0.5, maxShare: 0.3,
    w: { standout: 0.9, prospect: 0.25, experience: 0.15, versatile: 0.1, spin: 0.08 },
    targets: { prospects: 4 },
    quirks: { conviction: { chance: 0.13, bonus: 0.3 } },
  }),
  LSG: S({
    code: "LSG",
    reserveFrac: 0.1,
    label: "Aggressive & volatile",
    philosophy: "High risk appetite: long bidding wars, large stretch, volatile spending; still bound by purse and hard maximum.",
    aggression: 0.94, stretchMult: 1.9, noise: 0.22, bargain: 0, maxShare: 0.46,
    hardMaxMult: 1.9, withdrawRatio: 0.98, fight: 0.35, needWeight: 0.7,
    w: { marquee: 0.1 },
    quirks: { mood: { lo: -0.12, hi: 0.3 } },
  }),
  GT: S({
    code: "GT",
    reserveFrac: 0.65,
    label: "T20 fit & low-profile value",
    philosophy: "Role-clarity and reliability first; pays well for a low-profile specialist that fills a critical hole, ignores fame.",
    aggression: 0.74, stretchMult: 0.95, noise: 0.06, bargain: 0.4, maxShare: 0.3,
    needWeight: 1.5, roleWeight: { Bowler: 1.15 },
    w: { experience: 0.25, fame: -0.1, marquee: -0.05 },
    quirks: { gem: { minRating: 62, minNeed: 0.4, bonus: 0.36, weakBonus: 0.12 } },
  }),
  PBKS: S({
    code: "PBKS",
    reserveFrac: 0.35,
    label: "Captain-led rebuild",
    philosophy: "Rebuild around Shreyas Iyer's captaincy and batting; strong Indian batting core around the leader.",
    aggression: 0.92, stretchMult: 1.4, noise: 0.1, bargain: 0.1, maxShare: 0.38,
    roleWeight: { Batter: 1.12 },
    w: { indianBat: 0.1 },
    named: [
      {
        playerId: 48, name: "Shreyas Iyer", premium: 0.38, shareCap: 0.45, hardMaxMult: 2.0,
        minStretch: 0.2, reason: "captain-centred rebuild",
      },
    ],
  }),
  RR: S({
    code: "RR",
    reserveFrac: 0.6,
    label: "Uncapped talent + international core",
    philosophy: "Promising uncapped players around a smaller group of experienced international contributors; avoids all-in on stars.",
    aggression: 0.8, stretchMult: 1.0, noise: 0.09, bargain: 0.45, maxShare: 0.3,
    w: { prospect: 0.55, standout: 0.3, experience: 0.2, intl: 0.16 },
    targets: { prospects: 5, intl: 5 },
    roleBudget: { stars: { max: 0.4 } },
  }),
  SRH: S({
    code: "SRH",
    reserveFrac: 0.45,
    label: "Bowling-first",
    philosophy: "Build the attack first (pace and spin coverage); batting is built after, with less star spend.",
    aggression: 0.87, stretchMult: 1.3, noise: 0.09, bargain: 0.25, maxShare: 0.34,
    roleWeight: { Bowler: 1.4, Batter: 0.85, AllRounder: 1.05 },
    w: { coverage: 0.16 },
    targets: { pace: 5, spin: 3 },
    roleBudget: { Bowler: { min: 0.34 } },
  }),
  DC: S({
    code: "DC",
    reserveFrac: 0.7,
    label: "Auction operators",
    philosophy: "Precise valuer that also bids to inflate prices for rivals, withdrawing before it is hurt.",
    aggression: 0.8, stretchMult: 1.0, noise: 0.05, bargain: 0.5, maxShare: 0.28,
    w: { standout: 0.15 },
    disruptor: {
      enter: 0.5, // chance to pressure a qualifying lot
      minMarket: 3.5, // only lots whose market price is at least this (Cr)
      overpayCap: 1.28, // never push (or get stuck) above this x market price
      band: [0.76, 0.94], // exit at this fraction of the estimated rival limit
      estimateSigma: 0.13, // uncertainty of the rival-limit estimate
      maxBids: 14, // pressure raises per lot
      minOpenSlots: 3,
      stuckDecay: 0.6, // enter chance multiplier per time it got stuck
      minCashPerSlot: 1.2, // needs spare purse (after reserve) per open slot
    },
  }),
};

// "neutral" turns every franchise into the baseline: a control for simulations
// (same retained squads and purses, no personality).
let strategyMode = "real";
export const setStrategyMode = (mode) => { strategyMode = mode; };

export const getStrategy = (team) =>
  strategyMode === "neutral"
    ? NEUTRAL_STRATEGY
    : TEAM_STRATEGIES[team?.code || team?.name] || NEUTRAL_STRATEGY;

/** The named-player priority of this team for this player, if any. */
export const namedPriority = (strategy, player) =>
  strategy.named.find(
    (n) =>
      n.playerId === player.id ||
      (n.name && n.name.toLowerCase() === (player.name || "").toLowerCase()),
  ) || null;

// ---- squad snapshot the strategy reads -------------------------------------
export const squadProfile = (team) => {
  const squad = team.squad || [];
  const by = { Batter: 0, Bowler: 0, AllRounder: 0, WicketKeeper: 0 };
  const spend = { Batter: 0, Bowler: 0, AllRounder: 0, WicketKeeper: 0 };
  let prospects = 0, pace = 0, spin = 0, intl = 0, eliteBat = 0, stars = 0, starSpend = 0, uncapped = 0;
  squad.forEach((p) => {
    by[p.role] = (by[p.role] || 0) + 1;
    spend[p.role] = (spend[p.role] || 0) + (p.soldPrice || 0);
    const set = p.set || "";
    const isUncapped = set.startsWith("Uncapped");
    if (isUncapped) uncapped++;
    if (isUncapped && p.nation === "Indian" && p.rating >= 62) prospects++;
    if (p.role === "Bowler") {
      if (/Spinner/.test(set)) spin++;
      else if (/Fast Bowler/.test(set)) pace++;
      else { pace += 0.5; spin += 0.5; }
    }
    if (p.nation === "Foreigner" && !isUncapped && p.rating >= 72) intl++;
    if (p.role === "Batter" && p.rating >= 85) eliteBat++;
    if (p.rating >= 85) { stars++; starSpend += p.soldPrice || 0; }
  });
  const share = (r) => spend[r] / 120;
  return { by, spend, prospects, pace, spin, intl, eliteBat, stars, uncapped, size: squad.length, share, starShare: starSpend / 120 };
};

const gap = (have, target) => (target ? clamp(1 - have / target, 0, 1) : 1);

/**
 * Strategy contribution to the valuation factor (additive, in the same units
 * as N + R + Q). Returns { total, parts } so decisions can be explained.
 * env: { roleNeed, mood, conviction } are per-lot draws made by the caller.
 */
export const strategyFactor = (strategy, team, player, tr, ts, env = {}) => {
  const w = strategy.w;
  const tg = strategy.targets;
  const parts = {};
  const add = (k, v) => { if (v) parts[k] = (parts[k] || 0) + v; };
  const need = env.roleNeed ?? 0;

  add("role preference", ((strategy.roleWeight[player.role] ?? 1) - 1) * 0.3);
  if (w.experience) add("experience", w.experience * (tr.experience - 0.5) * 0.4);
  if (w.prospect) {
    const fade = tg.prospects ? 0.25 + 0.75 * gap(ts.prospects, tg.prospects) : 1;
    add("prospect", w.prospect * tr.prospect * (w.prospect > 0 ? fade : 1) * 0.45);
  }
  if (w.indian) add("indian talent", w.indian * (tr.indian ? 1 : -0.4));
  if (w.leaders && tr.capped && tr.indian && player.rating >= 75) add("leadership", w.leaders);
  if (w.standout) add("standout", w.standout * tr.standout * (tr.uncapped || tr.tier >= 2 ? 0.4 : 0.12));
  if (w.marquee && tr.marquee) add("marquee", w.marquee);
  if (w.fame) add("fame discount", w.fame * tr.profile * (need < 0.3 ? 1 : 0.3));
  if (w.eliteBat && player.role === "Batter") {
    const f = 0.5 + 0.5 * gap(ts.eliteBat, tg.eliteBat);
    add("elite batting core", w.eliteBat * tr.eliteBat * f);
  }
  if (w.indianBat && player.role === "Batter" && tr.indian && tr.capped && player.rating >= 78) add("captain's batting core", w.indianBat);
  if (w.versatile && player.role === "AllRounder") add("versatile", w.versatile);
  if (w.spin && tr.bowlerKind === "spin") add("spin option", w.spin);
  if (w.intl && !tr.uncapped && tr.foreign && player.rating >= 72) add("international experience", w.intl * gap(ts.intl, tg.intl));
  if (w.coverage && player.role === "Bowler") {
    const k = tr.bowlerKind;
    const g = k === "pace" ? gap(ts.pace, tg.pace) : k === "spin" ? gap(ts.spin, tg.spin) : Math.max(gap(ts.pace, tg.pace), gap(ts.spin, tg.spin)) * 0.6;
    add("attack coverage", w.coverage * g * (0.5 + tr.star));
  }
  if (w.coverage && player.role === "AllRounder") add("bowling depth", 0.03);

  // Share-of-purse balance (role budgets).
  const rb = strategy.roleBudget;
  if (rb[player.role]?.max != null && ts.share(player.role) > rb[player.role].max) add("role budget exceeded", -0.3);
  if (rb.Bowler?.min != null) {
    const short = ts.share("Bowler") < rb.Bowler.min;
    if (short && player.role === "Bowler") add("bowling short", 0.12);
    if (short && player.role === "Batter" && tr.star > 0.4) add("batters vs unresolved attack", -0.14);
  }
  if (rb.stars?.max != null && ts.starShare > rb.stars.max && player.rating >= 85) add("star spend cap", -0.25);

  // Special quirks.
  const q = strategy.quirks;
  if (q.veteranCritical && tr.experience >= q.veteranCritical.minExperience && need >= q.veteranCritical.minNeed)
    add("ideal veteran, critical need", q.veteranCritical.bonus);
  if (q.gem && player.rating >= q.gem.minRating && tr.standout > 0.1 && tr.profile < 0.6) {
    add("low-profile specialist", need >= q.gem.minNeed ? q.gem.bonus : q.gem.weakBonus);
  }
  if (q.conviction && env.conviction && (tr.standout > 0.15 || player.role === "AllRounder" || tr.bowlerKind === "spin"))
    add("high-conviction bet", q.conviction.bonus);
  if (q.mood && env.mood) add("mood swing", env.mood);

  const total = clamp(Object.values(parts).reduce((a, b) => a + b, 0), -0.5, 0.9);
  // A named-player priority is an explicit premium (x market price) added to
  // the final valuation; it is NOT scaled down with the generic star damping.
  const named = namedPriority(strategy, player);
  const namedPremium = named && !(team.squad || []).some((p) => p.id === player.id) ? named.premium : 0;
  if (namedPremium) parts[`priority: ${named.reason}`] = namedPremium;
  return { total, parts, namedPremium };
};

/** Late-auction share (0..1) of quality supply already gone. */
export const auctionProgress = (remaining, poolQuality) => {
  if (!remaining || !poolQuality) return 0;
  const left = remaining.filter((p) => p.rating >= QUALITY_THRESHOLD).length;
  return clamp(1 - left / poolQuality, 0, 1);
};

export { ROLES, marketPrice };

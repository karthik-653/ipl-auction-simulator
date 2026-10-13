// Team-specific valuation, ceilings, probabilistic challenges and a single
// authoritative bid-processing path. Pure functions, injectable randomness.
import { BIDDING_CONFIG as CFG } from "./biddingConfig.js";
import {
  MAX_OVERSEAS,
  getBidIncrement,
  getOverseasCount,
  getRoleCount,
  hasRoomFor,
  shuffle,
} from "./auctionLogic.js";

export const AI_STATE = {
  ACTIVE: "ACTIVE",
  PASSED: "PASSED",
  WITHDRAWN: "WITHDRAWN",
  INELIGIBLE: "INELIGIBLE",
  AUCTION_CLOSED: "AUCTION_CLOSED",
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (n) => +n.toFixed(2);

/** V(p): baseline valuation from rating (existing formula). */
export const baseValuation = (player) => {
  let v = Math.pow(player.rating / 100, 3.8) * 13;
  if (player.rating >= 90) v *= 1.4;
  if (player.rating >= 95) v *= 1.25;
  return v;
};

/** 0..1 how much the squad lacks this role. */
export const roleNeed = (team, player) => {
  const required = team.requirements?.[player.role] || 0;
  if (!required) return 0;
  return clamp(1 - getRoleCount(team, player.role) / required, 0, 1);
};

/** 0..1 combined Need used by the challenge probability. */
export const overallNeed = (team, player) => {
  const remaining = team.targetSquadSize - (team.squad?.length || 0);
  const urgency = clamp(remaining / team.targetSquadSize, 0, 1);
  return clamp(0.8 * roleNeed(team, player) + 0.2 * urgency, 0, 1);
};

/** Required reserve = remaining slots (after this player) * cheapest legal buy. */
export const getRequiredReserve = (team, minBase = CFG.defaultMinBasePrice) =>
  Math.max(0, team.targetSquadSize - (team.squad?.length || 0) - 1) * minBase;

/** B(i,p) = purse - reserve. */
export const getAffordableBudget = (team, minBase = CFG.defaultMinBasePrice) =>
  Math.max(0, team.purse - getRequiredReserve(team, minBase));

const scarcity = (player, remaining = []) => {
  const comparable = remaining.filter(
    (p) =>
      p.id !== player.id &&
      p.role === player.role &&
      p.rating >= player.rating - 3,
  ).length;
  return 1 - clamp(comparable / CFG.valuation.scarcityComparableCount, 0, 1);
};

// ---- the individual adjustments (exported so /math can chart them) -------
/** N: from role need (0..1) to an adjustment. */
export const needAdjustment = (need) =>
  CFG.valuation.needMin +
  (CFG.valuation.needMax - CFG.valuation.needMin) * need;

/** R (part 1): overseas-quota pressure, only for foreign players. */
export const overseasAdjustment = (overseasCount, isForeigner = true) =>
  isForeigner
    ? -CFG.valuation.overseasPenalty * (overseasCount / MAX_OVERSEAS)
    : 0;

/** R (part 2): upgrade / depth versus the best same-role player owned. */
export const depthAdjustment = (rating, bestSameRole) => {
  if (bestSameRole == null) return 0;
  if (rating > bestSameRole + 5) return CFG.valuation.upgradeBonus;
  if (rating < bestSameRole - 10) return CFG.valuation.depthPenalty;
  return 0;
};

/** Q: scarcity (0..1) plus an elite bonus. */
export const scarcityAdjustment = (scarcityValue, rating) =>
  CFG.valuation.scarcityWeight * scarcityValue +
  (rating >= 95 ? CFG.valuation.eliteScarcityBonus : 0);

export const clampFactor = (sum) =>
  clamp(sum, CFG.valuation.factorMin, CFG.valuation.factorMax);

/** Full breakdown of V(i,p) = V(p) * (1 + clamp(N + R + Q)). */
export const valuationBreakdown = (team, player, remaining = []) => {
  const N = needAdjustment(roleNeed(team, player));
  const sameRole = (team.squad || []).filter((p) => p.role === player.role);
  const best = sameRole.length ? Math.max(...sameRole.map((p) => p.rating)) : null;
  const R =
    overseasAdjustment(getOverseasCount(team), player.nation === "Foreigner") +
    depthAdjustment(player.rating, best);
  const Q = scarcityAdjustment(scarcity(player, remaining), player.rating);
  const factor = clampFactor(N + R + Q);
  const base = baseValuation(player);
  return { base, N, R, Q, factor, value: base * (1 + factor) };
};

/** V(i,p). */
export const teamValuation = (team, player, remaining = []) =>
  valuationBreakdown(team, player, remaining).value;

export const getPriorityTier = (team, player) => {
  const need = roleNeed(team, player);
  if (player.rating >= 90 && (need >= 0.3 || player.rating >= 95))
    return "critical";
  if (need >= 0.5 || (need >= 0.3 && player.rating >= 80)) return "important";
  if (player.rating >= 70 || need > 0) return "useful";
  return "low";
};

/** C(i,p) = min(B, V * (1 + S)). Returns the pieces for inspection. */
export const computeCeiling = (team, player, ctx = {}, rng = Math.random) => {
  const minBase = ctx.minBasePrice ?? CFG.defaultMinBasePrice;
  const budget = getAffordableBudget(team, minBase);
  const value = teamValuation(team, player, ctx.remaining);
  const tier = getPriorityTier(team, player);
  const [lo, hi] = CFG.stretch[tier];
  const stretch = lo + rng() * (hi - lo);
  const ceiling = round2(Math.min(budget, value * (1 + stretch)));
  return { budget, value, tier, stretch, ceiling };
};

/** P(challenge); 0 when the next bid is above the ceiling. */
export const challengeProbability = ({ next, ceiling, need, aggression }) => {
  if (!(ceiling >= next) || ceiling <= 0) return 0;
  const x = next / ceiling;
  const p = CFG.probability;
  const z = p.price * (1 - x) + p.need * need + p.aggression * aggression + p.bias;
  return 1 / (1 + Math.exp(-z));
};

// ---- the round (one player's auction) -----------------------------------

/**
 * @param human optional { name, purse, squad } of the user's franchise.
 */
export const createRound = (player, aiTeams, ctx = {}, rng = Math.random, human = null) => {
  const teams = {};
  aiTeams.forEach((team) => {
    const room = hasRoomFor(team, player, team.targetSquadSize);
    const c = room
      ? computeCeiling(team, player, ctx, rng)
      : { budget: 0, value: 0, tier: "low", stretch: 0, ceiling: 0 };
    teams[team.name] = {
      ...c,
      need: overallNeed(team, player),
      aggression: team.aggression,
      state:
        !room || c.ceiling < player.basePrice
          ? AI_STATE.INELIGIBLE
          : AI_STATE.ACTIVE,
    };
  });
  return {
    player,
    bid: player.basePrice,
    leader: "Base Price",
    version: 0,
    status: "OPEN",
    userIn: Boolean(human),
    human,
    teams,
    bids: [],
    needsCycle: true,
  };
};

export const nextLegalBid = (round) =>
  round.leader === "Base Price"
    ? round.bid
    : round2(round.bid + getBidIncrement(round.bid));

/**
 * The ONLY place a bid is accepted. Humans and AI share it.
 * opts.expectedVersion: AI bids against a stale version are rejected; a human
 * bid is recalculated at the latest price instead.
 */
export const submitBid = (round, bidder, opts = {}) => {
  if (round.status !== "OPEN") return { ok: false, reason: "closed" };
  if (bidder === round.leader) return { ok: false, reason: "already-leading" };

  const isHuman = round.human && bidder === round.human.name;
  const stale =
    opts.expectedVersion !== undefined && opts.expectedVersion !== round.version;
  const next = nextLegalBid(round);

  if (isHuman) {
    if (!round.userIn) return { ok: false, reason: "withdrawn" };
    const h = round.human;
    if (h.purse < next) return { ok: false, reason: "purse" };
    if (!hasRoomFor(h, round.player)) return { ok: false, reason: "squad" };
  } else {
    if (stale) return { ok: false, reason: "stale" };
    const info = round.teams[bidder];
    if (!info) return { ok: false, reason: "unknown-team" };
    if (
      info.state === AI_STATE.WITHDRAWN ||
      info.state === AI_STATE.INELIGIBLE ||
      info.state === AI_STATE.AUCTION_CLOSED
    )
      return { ok: false, reason: info.state };
    if (next > info.ceiling + 1e-9 || next > info.budget + 1e-9)
      return { ok: false, reason: "ceiling" };
    info.state = AI_STATE.ACTIVE;
  }

  round.bid = next;
  round.leader = bidder;
  round.version += 1;
  round.bids.push({ bidder, bid: next });
  round.needsCycle = true; // a new accepted bid reopens the response cycle
  return { ok: true, bid: next, leader: bidder, version: round.version };
};

/**
 * One response cycle against the latest accepted bid. Teams are visited in a
 * random but well-defined order; each non-withdrawn team makes a fresh
 * decision. First successful challenge is accepted and the cycle ends (every
 * other team then re-decides in the next cycle). Returns the accepted bid or
 * null when nobody challenged.
 */
export const runResponseCycle = (round, rng = Math.random) => {
  round.needsCycle = false;
  if (round.status !== "OPEN") return null;
  const next = nextLegalBid(round);
  const names = shuffle(Object.keys(round.teams), rng);

  for (const name of names) {
    const info = round.teams[name];
    if (
      info.state === AI_STATE.WITHDRAWN ||
      info.state === AI_STATE.INELIGIBLE ||
      name === round.leader
    )
      continue;

    if (next > info.ceiling + 1e-9 || next > info.budget + 1e-9) {
      info.state = AI_STATE.WITHDRAWN; // exhausted headroom: permanent
      continue;
    }

    const p = challengeProbability({
      next,
      ceiling: info.ceiling,
      need: info.need,
      aggression: info.aggression,
    });

    if (rng() < p) {
      const res = submitBid(round, name, { expectedVersion: round.version });
      if (res.ok) return res;
    } else {
      const lowHeadroom = next / info.ceiling >= CFG.withdrawRatio;
      info.state =
        lowHeadroom || p < CFG.withdrawProbability
          ? AI_STATE.WITHDRAWN
          : AI_STATE.PASSED;
    }
  }
  return null;
};

export const withdrawHuman = (round) => {
  round.userIn = false;
};

/** Close the auction; returns the outcome. */
export const closeRound = (round) => {
  round.status = "AUCTION_CLOSED";
  Object.values(round.teams).forEach((t) => (t.state = AI_STATE.AUCTION_CLOSED));
  return { bid: round.bid, leader: round.leader };
};

/** Run to completion with no human (used by Skip Set and simulations). */
export const runAiOnlyAuction = (player, aiTeams, rng = Math.random, ctx = {}) => {
  const round = createRound(player, aiTeams, ctx, rng);
  for (let i = 0; i < 2000; i++) {
    if (!runResponseCycle(round, rng)) break;
  }
  return { ...closeRound(round), round };
};

/** Market context from the players still to be auctioned. */
export const marketContext = (remaining) => ({
  remaining,
  minBasePrice: remaining.length
    ? Math.min(...remaining.map((p) => p.basePrice || CFG.defaultMinBasePrice))
    : CFG.defaultMinBasePrice,
});

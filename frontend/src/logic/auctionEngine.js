// Team-specific valuation, ceilings, probabilistic challenges and a single
// authoritative bid-processing path. Pure functions, injectable randomness.
//
// Pipeline for one AI team and one player:
//   M(p)            market price of quality            (market.js)
//   V(i,p)          M * (1 + clamp(N + R + Q + S + C + U)) * noise
//     N need, R overseas/depth, Q scarcity+demand, S franchise strategy,
//     C spare cash per open slot, U late-auction urgency
//   C(i,p)          min(affordable budget, hard max, share-of-purse cap,
//                       V * (1 + stretch))               <- ONE finance layer
//   P(challenge)    flat while price is comfortably below C, then falling
import { BIDDING_CONFIG as CFG } from "./biddingConfig.js";
import {
  MAX_OVERSEAS,
  STARTING_PURSE,
  getBidIncrement,
  getOverseasCount,
  getRoleCount,
  hasRoomFor,
  shuffle,
} from "./auctionLogic.js";
import { POOL_QUALITY_TOTAL, marketPrice, playerTraits } from "./market.js";
import {
  auctionProgress,
  getStrategy,
  namedPriority,
  squadProfile,
  strategyFactor,
} from "./strategies.js";

export const AI_STATE = {
  ACTIVE: "ACTIVE",
  PASSED: "PASSED",
  WITHDRAWN: "WITHDRAWN",
  INELIGIBLE: "INELIGIBLE",
  AUCTION_CLOSED: "AUCTION_CLOSED",
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (n) => +n.toFixed(2);
const gauss = (rng) =>
  Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng());

/** V(p): the market price of this player's quality (calibrated curve). */
export const baseValuation = (player) => marketPrice(player.rating);

/**
 * How much a squad member counts toward a role requirement: a filler fills a
 * slot but does not satisfy the need for quality.
 */
export const qualityWeight = (rating) =>
  clamp((rating - CFG.need.floorRating) / CFG.need.fullRatingSpan, CFG.need.minWeight, 1);

export const effectiveRoleCount = (team, role) =>
  (team.squad || []).reduce((n, p) => (p.role === role ? n + qualityWeight(p.rating) : n), 0);

/** 0..1 how much the squad lacks this role (quality-weighted). */
export const roleNeed = (team, player) => {
  const required = team.requirements?.[player.role] || 0;
  if (!required) return 0;
  return clamp(1 - effectiveRoleCount(team, player.role) / required, 0, 1);
};

/** 0..1 combined Need used by the challenge probability. */
export const overallNeed = (team, player) => {
  const remaining = team.targetSquadSize - (team.squad?.length || 0);
  const urgency = clamp(remaining / team.targetSquadSize, 0, 1);
  return clamp(0.8 * roleNeed(team, player) + 0.2 * urgency, 0, 1);
};

export const openSlots = (team) =>
  Math.max(0, team.targetSquadSize - (team.squad?.length || 0));

// ---- the shared finance layer ---------------------------------------------
/** Required reserve = remaining slots (after this player) * cheapest legal buy. */
export const getRequiredReserve = (team, minBase = CFG.defaultMinBasePrice) =>
  Math.max(0, team.targetSquadSize - (team.squad?.length || 0) - 1) * minBase;

/** B(i,p) = purse - reserve. */
export const getAffordableBudget = (team, minBase = CFG.defaultMinBasePrice) =>
  Math.max(0, team.purse - getRequiredReserve(team, minBase));

/** Hard maximum bid for a player no matter who is bidding. */
export const hardMaxBid = (player, mult = CFG.hardMax.mult) =>
  Math.max(CFG.hardMax.floor, mult * marketPrice(player.rating), 1.5 * (player.basePrice || 0));

/**
 * Can this team legally pay `price` for this player? Used by ceilings, by
 * submitBid and by the tests, so every code path agrees.
 */
export const financeCheck = (team, player, price, minBase = CFG.defaultMinBasePrice) => {
  if (!hasRoomFor(team, player, team.targetSquadSize ?? undefined))
    return { ok: false, reason: getOverseasCount(team) >= MAX_OVERSEAS && player.nation === "Foreigner" ? "overseas" : "squad" };
  if (price > team.purse + 1e-9) return { ok: false, reason: "purse" };
  if (price > getAffordableBudget(team, minBase) + 1e-9) return { ok: false, reason: "reserve" };
  return { ok: true };
};

const scarcity = (player, remaining = []) => {
  const comparable = remaining.filter(
    (p) =>
      p.id !== player.id &&
      p.role === player.role &&
      p.rating >= player.rating - 3,
  ).length;
  return { value: 1 - clamp(comparable / CFG.valuation.scarcityComparableCount, 0, 1), comparable };
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

/** Market-wide facts every team's valuation shares (demand, spare cash). */
export const marketEnvironment = (aiTeams, player, ctx = {}) => {
  const eligible = aiTeams.filter((t) => hasRoomFor(t, player, t.targetSquadSize));
  const demand = eligible.filter((t) => roleNeed(t, player) >= CFG.valuation.demandNeed).length;
  // Market value still to come, per role, among players worth planning for.
  const futureValue = {};
  const futureCount = {};
  const futureDemand = {};
  (ctx.remaining || []).forEach((p) => {
    if (p.id === player.id || p.rating < CFG.reserve.minRating) return;
    futureValue[p.role] = (futureValue[p.role] || 0) + marketPrice(p.rating);
    futureCount[p.role] = (futureCount[p.role] || 0) + 1;
  });
  Object.keys(futureValue).forEach((role) => {
    futureDemand[role] = aiTeams.filter((t) => roleNeed(t, { role }) >= CFG.valuation.demandNeed).length;
  });
  const cps = eligible.map((t) => (t.purse - getRequiredReserve(t, ctx.minBasePrice)) / Math.max(1, openSlots(t)));
  const avgCashPerSlot = cps.length ? cps.reduce((a, b) => a + b, 0) / cps.length : 0;
  return { demand, avgCashPerSlot, futureValue, futureCount, futureDemand, progress: auctionProgress(ctx.remaining, POOL_QUALITY_TOTAL) };
};

/**
 * Money a team expects to spend later: its fair share of the market value of
 * the quality still to come in the roles it needs. Drives budget discipline.
 */
export const plannedFuture = (team, env) => {
  const out = { spend: 0, picks: 0 };
  if (!env.futureValue) return out;
  Object.entries(env.futureValue).forEach(([role, value]) => {
    const need = roleNeed(team, { role });
    const weight = need >= CFG.valuation.demandNeed ? 1 : need > 0 ? 0.4 : 0.1;
    const share = weight / Math.max(1, env.futureDemand[role] || 1);
    out.spend += value * share;
    out.picks += (env.futureCount[role] || 0) * share;
  });
  return out;
};
export const plannedFutureSpend = (team, env) => plannedFuture(team, env).spend;

/**
 * Full breakdown of V(i,p). `env` carries market facts and the per-lot random
 * draws (z, mood, conviction); with none it is deterministic (used by tests
 * and /math).
 */
export const valuationBreakdown = (team, player, remaining = [], env = {}) => {
  const strategy = getStrategy(team);
  const tr = playerTraits(player);
  const need = roleNeed(team, player);
  const N = needAdjustment(need) * strategy.needWeight;
  const sameRole = (team.squad || []).filter((p) => p.role === player.role);
  const best = sameRole.length ? Math.max(...sameRole.map((p) => p.rating)) : null;
  const R =
    overseasAdjustment(getOverseasCount(team), player.nation === "Foreigner") +
    depthAdjustment(player.rating, best);
  const sc = scarcity(player, remaining);
  const demandAdj = env.demand != null
    ? CFG.valuation.demandWeight * clamp(env.demand / (sc.comparable + 1), 0, 1.5) / 1.5
    : 0;
  const Q = (scarcityAdjustment(sc.value, player.rating) + demandAdj) * strategy.scarcitySens;

  const ts = squadProfile(team);
  const S = strategyFactor(strategy, team, player, tr, ts, { roleNeed: need, mood: env.mood, conviction: env.conviction });

  let C = 0;
  if (env.avgCashPerSlot > 0) {
    const cps = (team.purse - getRequiredReserve(team, env.minBasePrice)) / Math.max(1, openSlots(team));
    C = strategy.cashSens * CFG.valuation.cashWeight * clamp(cps / env.avgCashPerSlot - 1, -0.5, 1) * (0.4 + 0.6 * need);
  }
  const U = strategy.lateUrgency * CFG.valuation.lateWeight * (env.progress || 0) * need;

  const factor = clampFactor(N + R + Q + S.total + C + U);
  const base = baseValuation(player);
  const noise = env.z != null ? clamp(Math.exp(strategy.noise * env.z), 0.72, 1.4) : 1;
  // Stars attract every team, so the second-highest of ten valuations sits well
  // above the average one: damp their valuation to keep the clearing price on
  // the market curve.
  const scale = CFG.valuation.scale * (1 - CFG.valuation.starDamp * (tr?.star ?? 0));
  let value = base * (1 + factor) * noise * scale + S.namedPremium * base;
  // A team that still needs players never treats a lot as worthless filler.
  // Only for genuinely cheap lots: nobody must pay a 2 Cr base price for a
  // 55-rated player just to reach a squad-size target.
  if (openSlots(team) > 0 && (player.basePrice || 0) <= CFG.valuation.fillMaxBase &&
      (need > 0.15 || (team.squad?.length || 0) < team.targetSquadSize - 3))
    value = Math.max(value, CFG.valuation.fillFloor * (player.basePrice || 0));
  return { base, N, R, Q, S: S.total, C, U, factor, noise, value, parts: S.parts };
};

/** V(i,p). */
export const teamValuation = (team, player, remaining = []) =>
  valuationBreakdown(team, player, remaining).value;

export const getPriorityTier = (team, player, strategicScore = 0, named = false) => {
  const need = roleNeed(team, player);
  if (named) return "critical";
  if (player.rating >= 90 && (need >= 0.3 || player.rating >= 95))
    return "critical";
  if (need >= 0.5 || (need >= 0.3 && player.rating >= 80) || strategicScore >= 0.25) return "important";
  if (player.rating >= 70 || need > 0) return "useful";
  return "low";
};

/** C(i,p): returns the pieces for inspection. */
export const computeCeiling = (team, player, ctx = {}, rng = Math.random) => {
  const strategy = getStrategy(team);
  const minBase = ctx.minBasePrice ?? CFG.defaultMinBasePrice;
  const budget = getAffordableBudget(team, minBase);
  const draws = {
    z: gauss(rng),
    mood: strategy.quirks.mood ? strategy.quirks.mood.lo + rng() * (strategy.quirks.mood.hi - strategy.quirks.mood.lo) : 0,
    conviction: strategy.quirks.conviction ? rng() < strategy.quirks.conviction.chance : false,
  };
  const bd = valuationBreakdown(team, player, ctx.remaining, { ...ctx, ...draws });
  const named = namedPriority(strategy, player);
  const tier = getPriorityTier(team, player, bd.S, Boolean(named) && !(team.squad || []).some((p) => p.id === player.id));
  let [lo, hi] = CFG.stretch[tier];
  let mult = strategy.stretchMult;
  if (strategy.quirks.veteranCritical && bd.parts["ideal veteran, critical need"]) mult = Math.max(mult, strategy.quirks.veteranCritical.stretchMult);
  const stretch = Math.max(lo + rng() * (hi - lo), 0) * mult;
  const floorStretch = named ? named.minStretch : 0;
  const stretchUsed = Math.max(stretch, floorStretch);

  const hardMax = hardMaxBid(player, Math.max(strategy.hardMaxMult, named?.hardMaxMult ?? 0));
  const shareCap = (named ? named.shareCap : strategy.maxShare) * STARTING_PURSE;
  // bargain hunters discount lots that are not a priority
  const tierWeight = { low: 1, useful: 0.6, important: 0.2, critical: 0 }[tier];
  const bargain = 1 - strategy.bargain * tierWeight * CFG.valuation.bargainWeight;
  const wanted = bd.value * bargain * (1 + stretchUsed);
  // Budget discipline: keep part of the purse for the quality still to come.
  // The more critical the lot, the less of that plan is held back.
  const holdBack = { low: 1, useful: 1, important: 0.6, critical: 0.3 }[tier] * strategy.reserveFrac * CFG.reserve.mult;
  const future = ctx.futureValue ? plannedFuture(team, ctx) : { spend: 0, picks: 0 };
  const planned = future.spend;
  // ...but a team can never plan to keep more than maxHoldFrac of what it has.
  const hold = Math.min(holdBack * planned, CFG.reserve.maxHoldFrac * budget);
  const softBudget = Math.max(0, budget - hold);
  // Open squad slots are kept for the quality still to come: a filler lot is
  // only worth buying while there are more open slots than expected picks.
  const slotsHeld = player.rating < CFG.reserve.fillerBelow && openSlots(team) <= Math.ceil(future.picks * CFG.reserve.slotShare);
  // Fillers (they only fill a slot) respect raw role counts: stop buying a
  // role once its requirement is met while other roles are still open.
  const rawNeed = (role) => {
    const req = team.requirements?.[role] || 0;
    return req ? clamp(1 - getRoleCount(team, role) / req, 0, 1) : 0;
  };
  const isFiller = player.rating < CFG.reserve.fillerBelow;
  const roleFull = isFiller && rawNeed(player.role) === 0 && ["Batter", "Bowler", "AllRounder", "WicketKeeper"].some((r) => rawNeed(r) > 0);
  const limits = { budget, "planned future spending": softBudget, "hard maximum": hardMax, "share-of-purse cap": shareCap, "own valuation": wanted };
  const binding = Object.entries(limits).sort((a, b) => a[1] - b[1])[0][0];
  const ceiling = slotsHeld || roleFull ? 0 : round2(Math.min(...Object.values(limits)));
  return {
    budget, value: bd.value, tier, stretch: stretchUsed, ceiling, hardMax, shareCap,
    factor: bd.factor, parts: bd.parts, strategy: strategy.code, limit: ceiling, planned: round2(planned), slotsHeld, roleFull, binding,
  };
};

/**
 * P(challenge); 0 when the next bid is above the ceiling. Flat while the
 * price is well below the ceiling, then falling toward a floor at the ceiling
 * (the floor is higher for aggressive / fighting teams).
 */
export const priceKnee = (aggression) =>
  clamp(CFG.probability.kneeBase + CFG.probability.kneeAgg * aggression, 0.55, 0.92);

export const challengeProbability = ({ next, ceiling, need, aggression, fight = 0 }) => {
  if (!(ceiling >= next) || ceiling <= 0) return 0;
  const p = CFG.probability;
  const x = next / ceiling;
  const x0 = priceKnee(aggression);
  const hi = clamp(p.plateauBase + p.plateauAgg * aggression + p.plateauNeed * need, 0.5, 0.985);
  const lo = clamp(p.floorBase + p.floorAgg * aggression + fight, 0.02, 0.9);
  if (x <= x0) return hi;
  return hi - (hi - lo) * Math.pow((x - x0) / (1 - x0), p.curve);
};

// ---- runtime-only attachments (never serialised with the round) ----------
const attach = (round, key, value) =>
  Object.defineProperty(round, key, { value, enumerable: false, writable: true, configurable: true });

export const attachRuntime = (round, { intel, diagnostics, teams, minBase } = {}) => {
  if (intel) attach(round, "intel", intel);
  if (diagnostics) attach(round, "diagnostics", []);
  if (teams) attach(round, "squads", Object.fromEntries(teams.map((t) => [t.name, t])));
  if (minBase != null) attach(round, "minBase", minBase);
  return round;
};

// ---- rival intelligence (what teams have actually done in this auction) --
export const createIntel = () => ({ teams: {}, dc: { lots: 0, success: 0, stuck: 0, extracted: 0 } });

const intelEntry = (intel, name) =>
  (intel.teams[name] ||= { n: 0, peakSum: 0, wins: 0 });

/** Learn from a finished round: how far each team actually pushed. */
export const observeRound = (intel, round) => {
  if (!intel) return;
  const M = marketPrice(round.player.rating);
  if (M < 1) return;
  const peaks = {};
  round.bids.forEach((b) => (peaks[b.bidder] = Math.max(peaks[b.bidder] || 0, b.bid)));
  const counts = round.bids.reduce((a, b) => ((a[b.bidder] = (a[b.bidder] || 0) + 1), a), {});
  Object.entries(peaks).forEach(([name, peak]) => {
    if (counts[name] < 2) return;
    const e = intelEntry(intel, name);
    e.n += 1;
    e.peakSum += peak / M;
  });
  if (round.leader !== "Base Price") intelEntry(intel, round.leader).wins += 1;
};

/** Rebuild intel from the recorded round log (after loading a save). */
export const rebuildIntel = (roundLog = []) => {
  const intel = createIntel();
  roundLog.forEach((r) => {
    if (!r?.bids || !r.player) return;
    observeRound(intel, { player: r.player, bids: r.bids, leader: r.result?.leader ?? "Base Price" });
  });
  return intel;
};

/** Estimated peak/market ratio of a rival (shrunk toward a prior). */
export const rivalRatio = (intel, name) => {
  const e = intel?.teams?.[name];
  const k = CFG.disruptor.priorWeight;
  return ((e ? e.peakSum : 0) + CFG.disruptor.priorRatio * k) / ((e ? e.n : 0) + k);
};

const record = (round, entry) => {
  if (round.diagnostics) round.diagnostics.push(entry);
};

// ---- the round (one player's auction) -----------------------------------

/**
 * @param human optional { name, purse, squad } of the user's franchise.
 * ctx: { remaining, minBasePrice, intel?, diagnostics? }
 */
export const createRound = (player, aiTeams, ctx = {}, rng = Math.random, human = null) => {
  const env = { ...ctx, ...marketEnvironment(aiTeams, player, ctx) };
  const teams = {};
  aiTeams.forEach((team) => {
    const strategy = getStrategy(team);
    const room = hasRoomFor(team, player, team.targetSquadSize);
    const c = room
      ? computeCeiling(team, player, env, rng)
      : { budget: 0, value: 0, tier: "low", stretch: 0, ceiling: 0, limit: 0, hardMax: 0, strategy: strategy.code, parts: {} };
    // A disruptor may stay in the room above its own valuation (to apply
    // pressure) as long as it can legally afford the opening price.
    const canPressure = Boolean(strategy.disruptor) && room && c.budget >= player.basePrice;
    // Why this team is sitting the lot out (kept for explanations).
    const why = !room
      ? getOverseasCount(team) >= MAX_OVERSEAS && player.nation === "Foreigner" ? "overseas quota full" : "squad full"
      : c.slotsHeld ? "holding open slots for better players"
      : c.roleFull ? "role already at its requirement; other roles still open"
      : c.budget < player.basePrice ? "purse after squad reserve is below the base price"
      : c.ceiling < player.basePrice ? "own valuation is below the base price"
      : null;
    teams[team.name] = {
      ...c,
      parts: ctx.diagnostics ? c.parts : undefined,
      need: overallNeed(team, player),
      roleNeed: roleNeed(team, player),
      aggression: strategy.aggression ?? team.aggression,
      fight: strategy.fight,
      withdrawRatio: strategy.withdrawRatio,
      why: canPressure && why === "own valuation is below the base price" ? null : why,
      state:
        !room || (c.ceiling < player.basePrice && !canPressure)
          ? AI_STATE.INELIGIBLE
          : AI_STATE.ACTIVE,
    };
  });
  const round = {
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
  attachRuntime(round, {
    intel: ctx.intel,
    diagnostics: ctx.diagnostics,
    teams: aiTeams,
    minBase: ctx.minBasePrice ?? CFG.defaultMinBasePrice,
  });
  return round;
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
    const limit = info.limit ?? info.ceiling;
    if (next > limit + 1e-9 || next > info.budget + 1e-9 || next > info.hardMax + 1e-9)
      return { ok: false, reason: "ceiling" };
    const squad = round.squads?.[bidder];
    if (squad) {
      const fin = financeCheck(squad, round.player, next, round.minBase);
      if (!fin.ok) return { ok: false, reason: fin.reason };
    }
    info.state = AI_STATE.ACTIVE;
  }

  round.bid = next;
  round.leader = bidder;
  round.version += 1;
  round.bids.push({ bidder, bid: next });
  round.needsCycle = true; // a new accepted bid reopens the response cycle
  return { ok: true, bid: next, leader: bidder, version: round.version };
};

// ---- Delhi Capitals: controlled price pressure ---------------------------
const rivalState = (round, name) =>
  round.squads?.[name] || (round.human && round.human.name === name ? round.human : null);

/**
 * Decide, once per lot, whether DC applies price pressure to the current
 * leader and where it plans to stop. Uses only public information (purses,
 * squads, role requirements) and what the rival has actually done earlier in
 * this auction, plus noise: it never reads the rival's private ceiling.
 */
export const planPressure = (round, name, info, next, rng) => {
  const strategy = getStrategy(round.squads?.[name] || { name });
  const d = strategy.disruptor;
  const plan = { active: false, target: round.leader, startPrice: round.bid, bids: 0, why: "" };
  const own = round.squads?.[name];
  const rival = rivalState(round, round.leader);
  const tr = playerTraits(round.player);
  if (!d || !own || !rival) return Object.assign(plan, { why: "no rival information" });
  if (tr.market < d.minMarket) return Object.assign(plan, { why: "lot too cheap to matter" });
  if (openSlots(own) < d.minOpenSlots) return Object.assign(plan, { why: "too few open slots" });
  const slack = info.budget - next - d.minCashPerSlot * Math.max(0, openSlots(own) - 1);
  if (slack < 0) return Object.assign(plan, { why: "cash needed for own squad" });

  const cap = Math.min(d.overpayCap * tr.market, info.hardMax, info.budget, info.shareCap ?? Infinity);
  const inc = getBidIncrement(next);
  if (next + 2 * inc > cap) return Object.assign(plan, { why: "price already above safe cap" });

  // probabilistic estimate of the rival's private limit
  const need = roleNeed(rival, round.player);
  const rivalPurseFree = Math.max(0, rival.purse - getRequiredReserve(rival, round.minBase));
  const ratio = rivalRatio(round.intel, round.leader);
  let est = tr.market * ratio * (1 + 0.5 * (need - 0.3));
  est = Math.max(est, round.bid * 1.02); // the rival has already shown this much
  est *= Math.exp(d.estimateSigma * gauss(rng));
  est = Math.min(est, rivalPurseFree + 1e-9, hardMaxBid(round.player));
  const tightness = clamp(1 - rivalPurseFree / Math.max(1, openSlots(rival)) / 6, 0, 1); // less spare cash = more damage
  const stuck = round.intel?.dc?.stuck || 0;
  const chance = clamp(d.enter * (0.6 + 0.8 * tightness + 0.4 * need) * Math.pow(d.stuckDecay, stuck), 0, 0.95);
  const band = d.band[0] + rng() * (d.band[1] - d.band[0]);
  const exit = Math.min(cap, est * band);
  Object.assign(plan, { est: round2(est), exit: round2(exit), chance: round2(chance), need: round2(need) });
  if (exit < next + inc) return Object.assign(plan, { why: "rival likely to stop before pressure helps" });
  if (rng() >= chance) return Object.assign(plan, { why: "chose not to contest" });
  return Object.assign(plan, { active: true, why: "pressure on leading rival" });
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
  const log = (name, info, entry) =>
    record(round, {
      team: name, strategy: info.strategy, player: round.player.name, role: round.player.role,
      rating: round.player.rating, valuation: round2(info.value), ceiling: info.ceiling,
      limit: info.limit, hardMax: info.hardMax, budget: round2(info.budget), next,
      price: round.bid, leader: round.leader, roleNeed: round2(info.roleNeed ?? 0),
      aggression: info.aggression, tier: info.tier, version: round.version, ...entry,
    });

  for (const name of names) {
    const info = round.teams[name];
    if (
      info.state === AI_STATE.WITHDRAWN ||
      info.state === AI_STATE.INELIGIBLE ||
      name === round.leader
    )
      continue;

    // ---- disruptor: price pressure above its own valuation ---------------
    // Considered at the moment the team would otherwise stop: the price has
    // passed its own ceiling, or it is about to drop out near that ceiling.
    const strategy = getStrategy({ name });
    const pressureStep = () => {
      if (!info.pressure) {
        info.pressure = planPressure(round, name, info, next, rng);
        info.pressure.startPrice = round.bid;
        log(name, info, { decision: info.pressure.active ? "pressure-start" : "withdraw", reason: info.pressure.why, plan: { est: info.pressure.est, exit: info.pressure.exit, chance: info.pressure.chance } });
      }
      const pl = info.pressure;
      if (pl.active) info.limit = Math.max(info.limit, pl.exit);
      if (!pl.active || next > pl.exit + 1e-9 || pl.bids >= strategy.disruptor.maxBids || next > info.budget + 1e-9) {
        if (pl.active) pl.why = next > pl.exit + 1e-9 ? "exited before rival limit" : "pressure budget used";
        pl.active = false;
        info.state = AI_STATE.WITHDRAWN;
        log(name, info, { decision: "withdraw", reason: pl.why || "pressure ended" });
        return null;
      }
      if (rng() < 0.92 || rng() < 0.92) {
        const res = submitBid(round, name, { expectedVersion: round.version });
        if (res.ok) {
          pl.bids += 1;
          log(name, info, { decision: "bid", mode: "pressure", reason: "price pressure on " + pl.target });
          return res;
        }
      }
      info.state = AI_STATE.PASSED;
      log(name, info, { decision: "pass", mode: "pressure", reason: "held back this step" });
      return null;
    };
    if (strategy.disruptor && (next > info.ceiling + 1e-9 || info.pressure?.active)) {
      const res = pressureStep();
      if (res) return res;
      continue;
    }

    if (next > info.ceiling + 1e-9 || next > info.budget + 1e-9) {
      info.state = AI_STATE.WITHDRAWN; // exhausted headroom: permanent
      log(name, info, { decision: "withdraw", reason: next > info.budget + 1e-9 ? "budget or reserve" : "above own ceiling" });
      continue;
    }

    const p = challengeProbability({
      next,
      ceiling: info.ceiling,
      need: info.need,
      aggression: info.aggression,
      fight: info.fight,
    });

    // Comfortably below its own ceiling a team gets several looks at the same
    // price, so one unlucky roll cannot end an auction a team still wants.
    const tries = next / info.ceiling <= priceKnee(info.aggression) ? CFG.probability.plateauTries : 1;
    let roll = false;
    for (let k = 0; k < tries && !roll; k++) roll = rng() < p;
    if (roll) {
      const res = submitBid(round, name, { expectedVersion: round.version });
      if (res.ok) {
        log(name, info, { decision: "bid", p: round2(p), reason: "within valuation" });
        return res;
      }
      log(name, info, { decision: "pass", p: round2(p), reason: "bid rejected: " + res.reason });
    } else {
      if (strategy.disruptor && !info.pressure && next / info.ceiling >= priceKnee(info.aggression)) {
        const res = pressureStep();
        if (res) return res;
        continue;
      }
      const lowHeadroom = next / info.ceiling >= (info.withdrawRatio ?? CFG.withdrawRatio);
      info.state =
        lowHeadroom || p < CFG.withdrawProbability
          ? AI_STATE.WITHDRAWN
          : AI_STATE.PASSED;
      log(name, info, { decision: info.state === AI_STATE.WITHDRAWN ? "withdraw" : "pass", p: round2(p), reason: lowHeadroom ? "close to own ceiling" : "declined this step" });
    }
  }
  return null;
};

export const withdrawHuman = (round) => {
  round.userIn = false;
};

/** Close the auction; returns the outcome. */
export const closeRound = (round) => {
  const outcome = () => ({
    bid: round.bid,
    leader: round.leader,
    ...(round.pressureSummary ? { pressure: round.pressureSummary } : {}),
  });
  if (round.status === "AUCTION_CLOSED") return outcome();
  round.status = "AUCTION_CLOSED";
  Object.values(round.teams).forEach((t) => (t.state = AI_STATE.AUCTION_CLOSED));
  observeRound(round.intel, round);
  // How did Delhi's pressure end? (success = the price it forced up was paid)
  const dcName = Object.keys(round.teams).find((n) => getStrategy({ name: n }).disruptor);
  const pl = dcName && round.teams[dcName].pressure;
  if (pl && pl.bids > 0) {
    const stuck = round.leader === dcName;
    const dc = round.intel?.dc;
    const summary = {
      team: dcName, target: pl.target, winner: round.leader, startPrice: pl.startPrice,
      finalPrice: round.bid, bids: pl.bids, stuck, extracted: stuck ? 0 : round2(round.bid - pl.startPrice),
    };
    round.pressureSummary = summary;
    if (dc) {
      dc.lots += 1;
      if (stuck) dc.stuck += 1; else { dc.success += 1; dc.extracted += summary.extracted; }
    }
  }
  return outcome();
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
export const marketContext = (remaining, intel = null) => ({
  remaining,
  intel,
  minBasePrice: remaining.length
    ? Math.min(...remaining.map((p) => p.basePrice || CFG.defaultMinBasePrice))
    : CFG.defaultMinBasePrice,
});

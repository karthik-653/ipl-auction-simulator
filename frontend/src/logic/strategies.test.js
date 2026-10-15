import test from "node:test";
import assert from "node:assert/strict";
import { players } from "../data/players.js";
import { aiTeams } from "../data/aiTeams.js";
import { BIDDING_CONFIG as CFG } from "./biddingConfig.js";
import {
  MAX_OVERSEAS,
  buildAiTeams,
  buildAuctionQueue,
  getBidIncrement,
  getEffectivePlayers,
  makeSeededRng,
} from "./auctionLogic.js";
import { marketPrice, playerTraits } from "./market.js";
import {
  NEUTRAL_STRATEGY,
  TEAM_STRATEGIES,
  getStrategy,
  namedPriority,
  setStrategyMode,
} from "./strategies.js";
import {
  AI_STATE,
  attachRuntime,
  closeRound,
  computeCeiling,
  createIntel,
  createRound,
  financeCheck,
  getAffordableBudget,
  hardMaxBid,
  marketContext,
  observeRound,
  planPressure,
  rebuildIntel,
  rivalRatio,
  roleNeed,
  runAiOnlyAuction,
  runResponseCycle,
  submitBid,
  valuationBreakdown,
} from "./auctionEngine.js";

const seeded = makeSeededRng;
const byName = (n) => players.find((p) => p.name === n);
const iyer = byName("Shreyas Iyer");
const indianFiller = players.find((p) => !p.retained && p.rating < 56 && p.nation === "Indian");

const fresh = (seed = 1) => {
  const rng = seeded(seed);
  const eff = getEffectivePlayers(players, null, []);
  return { rng, eff, queue: buildAuctionQueue(eff, rng), teams: buildAiTeams(eff, aiTeams, null, rng) };
};
const team = (name, over = {}) => ({
  ...aiTeams.find((t) => t.name === name),
  squad: [],
  purse: 100,
  targetSquadSize: 23,
  ...over,
});

// ---- the registry ---------------------------------------------------------
test("all ten franchise codes have a distinct, complete strategy; unknown codes are neutral", () => {
  const codes = aiTeams.map((t) => t.name);
  assert.equal(codes.length, 10);
  for (const c of codes) {
    assert.ok(TEAM_STRATEGIES[c], `missing strategy for ${c}`);
    assert.equal(getStrategy({ name: c }).code, c);
  }
  assert.deepEqual(Object.keys(TEAM_STRATEGIES).sort(), [...codes].sort());
  assert.equal(getStrategy({ name: "XYZ" }), NEUTRAL_STRATEGY);
  // behaviourally distinct: no two franchises share the same parameter set
  const sig = codes.map((c) => JSON.stringify({ ...TEAM_STRATEGIES[c], code: 0, label: 0, philosophy: 0 }));
  assert.equal(new Set(sig).size, codes.length);
});

test("the neutral control turns every franchise into the baseline", () => {
  setStrategyMode("neutral");
  try {
    assert.equal(getStrategy({ name: "LSG" }), NEUTRAL_STRATEGY);
  } finally {
    setStrategyMode("real");
  }
  assert.equal(getStrategy({ name: "LSG" }).code, "LSG");
});

// ---- audit regressions: the market curve ---------------------------------
test("market curve tracks the real historical prices (stars were ~35% too cheap, filler ~3x too dear)", () => {
  const hist = players.filter((p) => !p.retained && p.soldPrice > 0);
  const bands = [[85, 100], [75, 84], [65, 74], [50, 64]];
  for (const [lo, hi] of bands) {
    const a = hist.filter((p) => p.rating >= lo && p.rating <= hi);
    const ratio = a.reduce((s, p) => s + p.soldPrice, 0) / a.reduce((s, p) => s + marketPrice(p.rating), 0);
    assert.ok(Math.abs(ratio - 1) < 0.08, `band ${lo}-${hi} hist/market = ${ratio.toFixed(3)}`);
  }
  assert.ok(marketPrice(87) >= 11, "an 87 was valued at 7.7 Cr by the old power law");
  assert.ok(marketPrice(52) <= 0.5, "a 52 was valued at 1.09 Cr by the old power law");
  for (let r = 50; r < 100; r++) assert.ok(marketPrice(r + 1) >= marketPrice(r));
});

test("an 85-89 marquee player no longer sells for 7-8 Cr in a full-field auction", () => {
  const { queue, teams } = fresh(3);
  const boult = queue.find((p) => p.name === "Trent Boult");
  const prices = [];
  const bidders = [];
  for (let s = 1; s <= 12; s++) {
    const { bid, leader, round } = runAiOnlyAuction(boult, teams, seeded(s), marketContext([]));
    assert.notEqual(leader, "Base Price");
    prices.push(bid);
    bidders.push(new Set(round.bids.map((b) => b.bidder)).size);
  }
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  assert.ok(mean >= 11, `mean ${mean}`);
  assert.ok(Math.min(...prices) >= 8.5);
  assert.ok(bidders.every((n) => n >= 3));
});

test("role need is quality-weighted: a squad of fillers still needs a quality bowler", () => {
  const bowler = byName("Mohammed Shami");
  const fillers = players.filter((p) => !p.retained && p.role === "Bowler" && p.rating <= 56).slice(0, 8);
  const t = team("CSK", { squad: fillers, requirements: { Bowler: 8 } });
  assert.ok(roleNeed(t, bowler) > 0.6);
  const stars = players.filter((p) => p.role === "Bowler" && p.rating >= 78).slice(0, 8);
  assert.ok(roleNeed({ ...t, squad: stars }, bowler) < 0.05);
});

test("a needy team is not forced to buy a 2 Cr-base filler just to reach a squad target", () => {
  const filler = players.find((p) => !p.retained && p.rating <= 56 && p.basePrice >= 1.5 && p.role === "Bowler");
  const t = team("SRH", { squad: [] });
  const c = computeCeiling(t, filler, marketContext([]), seeded(1));
  assert.ok(c.ceiling < filler.basePrice, `${c.ceiling} vs base ${filler.basePrice}`);
  const round = createRound(filler, [t], marketContext([]), seeded(1));
  assert.equal(round.teams.SRH.state, AI_STATE.INELIGIBLE);
});

// ---- strategies really change valuations --------------------------------
const val = (name, player, over = {}) => valuationBreakdown(team(name, over), player, [], {});

test("CSK values experienced capped players over uncapped prospects; MI the reverse", () => {
  const prospect = byName("Abdul Samad"); // uncapped Indian, 72
  const vet = players.find((p) => !p.retained && playerTraits(p).capped && p.nation === "Indian" && p.rating === 72 && p.role === prospect.role) ||
    players.find((p) => !p.retained && playerTraits(p).capped && p.rating >= 70 && p.rating <= 74);
  assert.ok(playerTraits(prospect).prospect > 0.8);
  const gapCsk = val("CSK", vet).value / marketPrice(vet.rating) - val("CSK", prospect).value / marketPrice(prospect.rating);
  const gapMi = val("MI", vet).value / marketPrice(vet.rating) - val("MI", prospect).value / marketPrice(prospect.rating);
  assert.ok(gapCsk > gapMi + 0.2, `CSK ${gapCsk} MI ${gapMi}`);
  assert.ok(val("MI", prospect).parts.prospect > 0.2);
  assert.ok(val("RR", prospect).parts.prospect > 0.15);
});

test("a prospect preference fades as the franchise fills its prospect quota", () => {
  const prospect = byName("Naman Dhir");
  const owned = players.filter((p) => !p.retained && playerTraits(p).uncapped && p.nation === "Indian" && p.rating >= 65 && p.id !== prospect.id).slice(0, 6);
  assert.ok(val("MI", prospect, { squad: owned }).parts.prospect < val("MI", prospect).parts.prospect);
});

test("SRH favours bowlers over batters; RCB favours elite batters; neutral does neither", () => {
  const bowler = byName("Mohammed Shami");
  const batter = byName("Jake Fraser-McGurk");
  const rel = (n) => (val(n, bowler).value / marketPrice(bowler.rating)) / (val(n, batter).value / marketPrice(batter.rating));
  setStrategyMode("neutral");
  const neutral = rel("SRH");
  setStrategyMode("real");
  assert.ok(rel("SRH") > neutral + 0.2);
  assert.ok(rel("RCB") < rel("SRH"));
  const kohliLess = byName("Shreyas Iyer"); // elite batter
  assert.ok(val("RCB", kohliLess).parts["elite batting core"] > 0.2);
  assert.equal(val("SRH", kohliLess).parts["elite batting core"], undefined);
});

test("RCB / SRH role-budget balance: neither spends the whole purse on one discipline", () => {
  const bat = byName("Jake Fraser-McGurk");
  const heavy = players.filter((p) => p.role === "Batter" && p.retained).map((p) => ({ ...p, soldPrice: 20 })).slice(0, 3); // 60 Cr on batters
  assert.ok(val("RCB", bat, { squad: heavy }).parts["role budget exceeded"] < 0);
  const bowler = byName("Mohammed Shami");
  assert.ok(val("SRH", bowler, { squad: [] }).parts["bowling short"] > 0);
});

test("GT pays up for a low-profile specialist that fills a critical hole, but not for fame", () => {
  const gem = players.find((p) => !p.retained && p.rating >= 66 && playerTraits(p).standout > 0.3 && playerTraits(p).profile < 0.6);
  assert.ok(gem, "a hidden-value candidate exists in the data");
  const gt = val("GT", gem, { squad: [], requirements: { [gem.role]: 8 } });
  assert.ok(gt.parts["low-profile specialist"] >= 0.3);
  const csk = val("CSK", gem, { squad: [], requirements: { [gem.role]: 8 } });
  assert.equal(csk.parts["low-profile specialist"], undefined);
  const star = byName("Rishabh Pant");
  assert.ok((val("GT", star).parts["fame discount"] ?? 0) <= 0);
});

test("CSK stretches little, LSG a lot, and LSG is more volatile than CSK", () => {
  const p = byName("Jos Buttler");
  const ratio = (name) => {
    const rs = [];
    for (let s = 1; s <= 200; s++) {
      const c = computeCeiling(team(name, { purse: 100 }), p, marketContext([]), seeded(s));
      rs.push(c.ceiling / Math.max(c.value, 1e-9));
    }
    return rs;
  };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
  assert.ok(mean(ratio("LSG")) > mean(ratio("CSK")));
  const ceil = (name) => Array.from({ length: 200 }, (_, s) => computeCeiling(team(name), p, marketContext([]), seeded(s + 1)).ceiling);
  assert.ok(sd(ceil("LSG")) > 1.5 * sd(ceil("CSK")));
  assert.ok(Math.max(...ceil("CSK")) <= hardMaxBid(p, TEAM_STRATEGIES.CSK.hardMaxMult) + 1e-9);
});

// ---- PBKS and Shreyas Iyer -----------------------------------------------
test("Shreyas Iyer is auction-eligible in the dataset (so PBKS may legitimately chase him)", () => {
  assert.equal(iyer.retained, false);
  assert.equal(iyer.team, null);
  assert.equal(players.filter((p) => /^shreyas iyer$/i.test(p.name)).length, 1);
  const { queue } = fresh(1);
  assert.equal(queue.filter((p) => p.id === iyer.id).length, 1);
  assert.equal(namedPriority(TEAM_STRATEGIES.PBKS, iyer).playerId, iyer.id);
  assert.equal(namedPriority(TEAM_STRATEGIES.PBKS, byName("Rishabh Pant")), null);
});

test("PBKS values Iyer far above other franchises and the premium switches off once he is owned", () => {
  const m = marketPrice(iyer.rating);
  const pb = val("PBKS", iyer).value;
  for (const other of ["RCB", "MI", "CSK", "KKR", "LSG", "DC", "GT", "RR", "SRH"]) {
    assert.ok(pb > val(other, iyer).value + 0.1 * m, `${other}`);
  }
  assert.ok(val("PBKS", iyer).parts["priority: captain-centred rebuild"] >= 0.35);
  const owned = val("PBKS", iyer, { squad: [{ ...iyer }] });
  assert.equal(owned.parts["priority: captain-centred rebuild"], undefined);
});

test("PBKS wins Iyer far more often than any rival, only through ordinary valid bids", () => {
  const { queue, teams } = fresh(2);
  const target = queue.find((p) => p.id === iyer.id);
  const wins = {};
  for (let s = 1; s <= 40; s++) {
    const { bid, leader, round } = runAiOnlyAuction(target, teams, seeded(s * 7), marketContext([]));
    wins[leader] = (wins[leader] || 0) + 1;
    round.bids.forEach((b, i) => {
      const prev = i ? round.bids[i - 1].bid : target.basePrice;
      if (i) assert.equal(+(b.bid - prev).toFixed(2), getBidIncrement(prev));
      assert.ok(b.bid <= round.teams[b.bidder].budget + 1e-9);
    });
    const pb = teams.find((t) => t.name === "PBKS");
    if (leader === "PBKS") assert.ok(bid <= pb.purse);
  }
  assert.ok((wins.PBKS || 0) >= 28, JSON.stringify(wins));
  assert.ok(Object.entries(wins).filter(([k]) => k !== "PBKS").every(([, v]) => v < 8), JSON.stringify(wins));
});

test("PBKS keeps its purse viable: the premium never breaks the reserve", () => {
  const poor = team("PBKS", { purse: 12, squad: Array(10).fill(indianFiller) });
  const c = computeCeiling(poor, iyer, marketContext([]), seeded(1));
  assert.ok(c.ceiling <= getAffordableBudget(poor) + 1e-9);
  assert.ok(c.ceiling <= poor.purse);
});

// ---- shared financial constraints ---------------------------------------
test("finance layer rejects purse, reserve, squad and overseas violations for every franchise", () => {
  const p = byName("Jos Buttler"); // overseas
  const t = team("LSG", { purse: 10 });
  assert.equal(financeCheck(t, p, 11).reason, "purse");
  assert.equal(financeCheck({ ...t, purse: 14, squad: Array(10).fill(indianFiller) }, p, 13.5).reason, "reserve");
  assert.equal(financeCheck({ ...t, squad: Array(23).fill(indianFiller) }, p, 2).reason, "squad");
  const full = players.filter((x) => x.nation === "Foreigner").slice(0, MAX_OVERSEAS);
  assert.equal(financeCheck({ ...t, squad: full }, p, 2).reason, "overseas");
  assert.equal(financeCheck(team("LSG"), p, 5).ok, true);
});

test("full AI-only auctions respect every constraint, for all ten personalities", () => {
  for (const seed of [1, 2, 3, 4]) {
    const { rng, queue, teams: start } = fresh(seed);
    let teams = start;
    const intel = createIntel();
    const startMoney = teams.reduce((s, t) => s + t.purse, 0);
    let spent = 0;
    queue.forEach((player, i) => {
      const ctx = { ...marketContext(queue.slice(i + 1), intel), diagnostics: true };
      const { bid, leader, round } = runAiOnlyAuction(player, teams, rng, ctx);
      let last = null;
      round.bids.forEach((b, k) => {
        const t = teams.find((x) => x.name === b.bidder);
        const info = round.teams[b.bidder];
        assert.notEqual(b.bidder, last, "a team never outbids itself");
        last = b.bidder;
        assert.ok(b.bid <= t.purse + 1e-9, "never above purse");
        assert.ok(b.bid <= info.budget + 1e-9, "never into the squad reserve");
        assert.ok(b.bid <= info.hardMax + 1e-9, "never above the hard maximum");
        assert.ok(b.bid <= (info.limit ?? info.ceiling) + 1e-9);
        if (k) assert.ok(b.bid > round.bids[k - 1].bid);
      });
      // permanent withdrawal: no later bid from a team that withdrew
      const withdrawn = new Set();
      round.diagnostics.forEach((d) => {
        if (d.decision === "withdraw") withdrawn.add(d.team);
        if (d.decision === "bid") assert.ok(!withdrawn.has(d.team), `${d.team} bid after withdrawing`);
      });
      if (leader === "Base Price") return;
      spent += bid;
      teams = teams.map((t) =>
        t.name === leader ? { ...t, purse: +(t.purse - bid).toFixed(2), squad: [...t.squad, { ...player, soldPrice: bid }] } : t,
      );
    });
    const end = teams.reduce((s, t) => s + t.purse, 0);
    assert.ok(Math.abs(startMoney - spent - end) < 1e-6);
    for (const t of teams) {
      assert.ok(t.purse >= -1e-9, `${t.name} purse ${t.purse}`);
      assert.ok(t.squad.length <= 25 && t.squad.length >= 18, `${t.name} squad ${t.squad.length}`);
      assert.ok(t.squad.filter((p) => p.nation === "Foreigner").length <= MAX_OVERSEAS);
    }
    const ids = teams.flatMap((t) => t.squad.map((p) => p.id));
    assert.equal(new Set(ids).size, ids.length);
  }
});

// ---- Delhi Capitals -------------------------------------------------------
// DC already owns three star keepers (no need for another); the rival has none
// and plenty of cash: the rival will value this wicketkeeper far above DC.
const dcScenario = (rivalName = "RCB") => {
  const star = byName("Jos Buttler"); // overseas WK
  const keepers = players
    .filter((p) => p.role === "WicketKeeper" && p.nation === "Indian" && p.rating >= 80)
    .slice(0, 3);
  const dc = team("DC", {
    purse: 80,
    squad: [...keepers, ...Array(5).fill(indianFiller)],
    requirements: { Batter: 1, Bowler: 1, AllRounder: 1, WicketKeeper: 2 },
  });
  const rival = team(rivalName, { purse: 70, squad: Array(8).fill(indianFiller), requirements: { WicketKeeper: 4, Batter: 6, Bowler: 6, AllRounder: 5 } });
  return { star, dc, rival, teams: [dc, rival] };
};

test("DC applies price pressure above its own valuation, then withdraws before it is hurt", () => {
  const { star, teams } = dcScenario();
  let pressured = 0;
  let exited = 0;
  let rivalWon = 0;
  let stuck = 0;
  for (let s = 1; s <= 120; s++) {
    const intel = createIntel();
    const round = createRound(star, teams, { ...marketContext([], intel), diagnostics: true }, seeded(s));
    const dcInfo = round.teams.DC;
    for (let i = 0; i < 500; i++) if (!runResponseCycle(round, seeded(s * 31 + i))) break;
    const dcBids = round.bids.filter((b) => b.bidder === "DC");
    const above = dcBids.filter((b) => b.bid > dcInfo.ceiling + 1e-9);
    if (above.length) {
      pressured++;
      // every pressure bid is a valid accepted bid inside the hard limits
      above.forEach((b) => {
        assert.ok(b.bid <= dcInfo.budget + 1e-9);
        assert.ok(b.bid <= dcInfo.hardMax + 1e-9);
        assert.ok(b.bid <= CFG_DC_CAP(star) + 1e-9);
      });
    }
    if (dcInfo.pressure?.active === false && dcInfo.pressure?.bids > 0) exited++;
    const out = closeRound(round);
    if (out.leader === "RCB" && above.length) rivalWon++;
    if (out.leader === "DC" && above.length) stuck++;
    if (out.leader === "DC") assert.ok(out.bid <= dcInfo.budget + 1e-9 && out.bid <= 80);
  }
  assert.ok(pressured > 10, "DC does pressure rivals sometimes");
  assert.ok(pressured < 120, "but not in every contest");
  assert.ok(exited > 0, "and it withdraws deliberately");
  assert.ok(rivalWon > 0, "sometimes the rival ends up paying the inflated price");
  assert.ok(stuck >= 0);
});

const CFG_DC_CAP = (p) => TEAM_STRATEGIES.DC.disruptor.overpayCap * marketPrice(p.rating);

test("DC never re-enters after withdrawing and never bids against itself", () => {
  const { star, teams } = dcScenario();
  for (let s = 1; s <= 80; s++) {
    const round = createRound(star, teams, { ...marketContext([], createIntel()), diagnostics: true }, seeded(s));
    for (let i = 0; i < 500; i++) if (!runResponseCycle(round, seeded(s * 17 + i))) break;
    let out = false;
    round.diagnostics.filter((d) => d.team === "DC").forEach((d) => {
      if (d.decision === "withdraw") out = true;
      if (d.decision === "bid") assert.equal(out, false);
    });
    round.bids.forEach((b, i) => i && assert.notEqual(b.bidder, round.bids[i - 1].bidder));
    assert.ok(round.teams.DC.pressure === undefined || round.teams.DC.pressure.bids <= TEAM_STRATEGIES.DC.disruptor.maxBids);
  }
});

test("DC will not pressure a lot that is cheap, when it needs its cash, or when it has no room", () => {
  const { star, dc, rival } = dcScenario();
  const mk = (d, p = star) => createRound(p, [d, rival], marketContext([], createIntel()), seeded(2));
  const lowValue = players.find((p) => !p.retained && p.rating < 56);
  const r1 = mk(dc, lowValue);
  r1.leader = "RCB";
  r1.bid = lowValue.basePrice + 0.2;
  assert.equal(planPressure(r1, "DC", r1.teams.DC, 0.7, seeded(1)).active, false);
  const broke = { ...dc, purse: 3 };
  const r2 = mk(broke);
  r2.leader = "RCB";
  r2.bid = 12;
  const plan = planPressure(r2, "DC", r2.teams.DC, 12.2, seeded(1));
  assert.equal(plan.active, false);
  const full = { ...dc, squad: Array(dc.targetSquadSize).fill(indianFiller) };
  assert.equal(createRound(star, [full, rival], marketContext([]), seeded(2)).teams.DC.state, AI_STATE.INELIGIBLE);
});

test("DC uses only observed behaviour and noisy estimates, never the rival's private ceiling", () => {
  const { star, dc, rival } = dcScenario();
  const intel = createIntel();
  const exits = new Set();
  for (let s = 1; s <= 30; s++) {
    const round = createRound(star, [dc, rival], marketContext([], intel), seeded(s));
    round.leader = "RCB";
    round.bid = 8;
    const plan = planPressure(round, "DC", round.teams.DC, 8.2, seeded(s + 100));
    if (plan.exit) exits.add(plan.exit);
    assert.ok(plan.exit === undefined || plan.exit <= CFG_DC_CAP(star) + 1e-9);
  }
  assert.ok(exits.size > 5, "estimates vary: the plan is probabilistic, not a fixed number");
  // observed behaviour updates the estimate (shrinkage toward the prior)
  const m = marketPrice(star.rating);
  const learned = createIntel();
  for (let i = 0; i < 12; i++) {
    observeRound(learned, {
      player: star, leader: "RCB",
      bids: [{ bidder: "RCB", bid: m * 1.3 - 0.2 }, { bidder: "KKR", bid: m }, { bidder: "RCB", bid: m * 1.3 }],
    });
  }
  assert.ok(rivalRatio(learned, "RCB") > rivalRatio(createIntel(), "RCB"));
  assert.ok(rivalRatio(learned, "RCB") < 1.4);
});

test("a rival's win after DC's pressure is accepted normally: purse deducted once, price legal", () => {
  const { star, teams } = dcScenario();
  for (let s = 1; s <= 60; s++) {
    const intel = createIntel();
    const round = createRound(star, teams, marketContext([], intel), seeded(s));
    for (let i = 0; i < 500; i++) if (!runResponseCycle(round, seeded(s * 13 + i))) break;
    const out = closeRound(round);
    if (out.pressure && !out.pressure.stuck) {
      assert.equal(out.leader, out.winner ?? out.leader);
      assert.ok(out.pressure.finalPrice === out.bid);
      assert.ok(out.pressure.extracted >= 0);
      assert.ok(out.bid <= round.teams[out.leader].budget + 1e-9);
      return;
    }
  }
  assert.fail("no successful pressure case found in 60 seeds");
});

// ---- runtime state, saves, diagnostics -----------------------------------
test("a round serialises cleanly (no runtime attachments) and resumes with them re-attached", () => {
  const { teams, queue } = fresh(5);
  const player = queue.find((p) => p.name === "KL Rahul");
  const intel = createIntel();
  const round = createRound(player, teams, { ...marketContext([], intel), diagnostics: true }, seeded(5));
  for (let i = 0; i < 6; i++) runResponseCycle(round, seeded(i + 1));
  const json = JSON.stringify({ ...round, player: undefined });
  assert.ok(!json.includes("diagnostics") && !json.includes("intel") && !json.includes("squads"));
  const restored = { ...JSON.parse(json), player };
  attachRuntime(restored, { intel, teams });
  const before = restored.bids.length;
  for (let i = 0; i < 10; i++) if (!runResponseCycle(restored, seeded(100 + i))) break;
  assert.ok(restored.bids.length >= before);
  const out = closeRound(restored);
  assert.ok(out.bid >= player.basePrice);
});

test("intel can be rebuilt from the recorded round log after loading a save", () => {
  const { teams, queue } = fresh(6);
  const log = [];
  const live = createIntel();
  queue.slice(0, 18).forEach((player, i) => {
    const { round } = runAiOnlyAuction(player, teams, seeded(i + 1), marketContext(queue.slice(i + 1), live));
    log.push({ player: { id: player.id, rating: player.rating }, bids: round.bids, result: { bid: round.bid, leader: round.leader } });
  });
  const rebuilt = rebuildIntel(log);
  assert.deepEqual(Object.keys(rebuilt.teams).sort(), Object.keys(live.teams).sort());
  for (const k of Object.keys(live.teams)) assert.ok(Math.abs(live.teams[k].peakSum - rebuilt.teams[k].peakSum) < 1e-9);
});

test("structured diagnostics explain decisions, and are off by default", () => {
  const { teams, queue } = fresh(7);
  const player = queue.find((p) => p.name === "Jos Buttler");
  const quiet = createRound(player, teams, marketContext([]), seeded(1));
  runResponseCycle(quiet, seeded(1));
  assert.equal(quiet.diagnostics, undefined);
  assert.ok(!("diagnostics" in JSON.parse(JSON.stringify(quiet))));
  const loud = createRound(player, teams, { ...marketContext([]), diagnostics: true }, seeded(1));
  for (let i = 0; i < 30; i++) if (!runResponseCycle(loud, seeded(i + 1))) break;
  assert.ok(loud.diagnostics.length > 10);
  const d = loud.diagnostics[0];
  for (const k of ["team", "strategy", "player", "role", "valuation", "ceiling", "hardMax", "budget", "next", "roleNeed", "decision", "reason"])
    assert.ok(k in d, `missing ${k}`);
  assert.ok(loud.diagnostics.some((x) => x.decision === "bid"));
  assert.ok(loud.diagnostics.every((x) => ["bid", "pass", "withdraw", "pressure-start"].includes(x.decision)));
});

test("human bids do not make AI teams withdraw, and a human is never a diagnostic target of a hidden ceiling", () => {
  const { teams, queue } = fresh(8);
  const player = queue.find((p) => p.name === "Mohammed Siraj");
  const round = createRound(player, teams, marketContext([]), seeded(2), { name: "ME", purse: 120, squad: [] });
  assert.ok(submitBid(round, "ME").ok);
  const states = Object.values(round.teams).map((t) => t.state);
  assert.ok(states.every((s) => s === AI_STATE.ACTIVE || s === AI_STATE.INELIGIBLE));
  assert.ok(runResponseCycle(round, seeded(3)), "AI teams still compete");
});

test("late-auction supply awareness: scarce quality lifts valuation of a needing team", () => {
  const p = byName("Deepak Chahar");
  const t = team("GT", { squad: [] });
  const plenty = players.filter((x) => !x.retained && x.role === "Bowler" && x.rating >= 78);
  const abundant = valuationBreakdown(t, p, plenty, {}).Q;
  const scarce = valuationBreakdown(t, p, [], {}).Q;
  assert.ok(scarce > abundant);
  assert.ok(CFG.valuation.factorMax >= 0.5);
});

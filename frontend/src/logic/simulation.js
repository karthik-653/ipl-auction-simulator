/* global process */
// Repeatable AI-only auction simulations (+ a "human bot") used to audit and
// calibrate the economy:  node src/logic/simulation.js [seeds] [--json out.json]
// Uses only the public engine API so the same harness measures old and new.
import { players } from "../data/players.js";
import { aiTeams } from "../data/aiTeams.js";
import {
  buildAiTeams,
  buildAuctionQueue,
  getEffectivePlayers,
  makeSeededRng,
} from "./auctionLogic.js";
import { BIDDING_CONFIG } from "./biddingConfig.js";
import * as Engine from "./auctionEngine.js";
import {
  closeRound,
  createRound,
  marketContext,
  runResponseCycle,
  submitBid,
} from "./auctionEngine.js";

// Works against both the original engine (no strategies/intel) and the new one.
const createIntel = Engine.createIntel || (() => undefined);
let playerTraits = null;
let setStrategyMode = () => {};
try {
  ({ playerTraits } = await import("./market.js"));
  ({ setStrategyMode } = await import("./strategies.js"));
} catch {
  /* original engine: strategy metrics unavailable */
}

const r2 = (n) => +n.toFixed(2);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
// Top-11 average rating, padding missing players with a filler (55).
const xi11 = (squad) => {
  const r = [...squad].map((p) => p.rating).sort((a, b) => b - a).slice(0, 11);
  while (r.length < 11) r.push(55);
  return avg(r);
};
const ROLES = ["Batter", "Bowler", "AllRounder", "WicketKeeper"];

/** Real 2025 mega-auction price kept in the dataset (null = went unsold). */
export const histPrice = (p) => (p.soldPrice > 0 && !p.retained ? p.soldPrice : null);

const isMarquee = (p) => p.set === "Marquee-1";
export const isUncapped = (p) => p.set.startsWith("Uncapped");

/**
 * One full auction. `human` (optional): { maxFor(player) -> price|0 } makes a
 * human-bot that joins the bidding once the AI goes quiet, never above its cap.
 */
export function runAuction(seed, { humanBot = null, trace = false, onLot = null, onClosed = null, diagnostics = false } = {}) {
  const rng = makeSeededRng(seed);
  const eff = getEffectivePlayers(players, null, []);
  const queue = buildAuctionQueue(eff, rng);
  let teams = buildAiTeams(eff, aiTeams, null, rng);
  const human = humanBot ? { name: "HUMAN", purse: 120, squad: [] } : null;
  const lots = [];
  const diag = [];
  const intel = createIntel();

  queue.forEach((player, i) => {
    const ctx = marketContext(queue.slice(i + 1));
    const round = createRound(player, teams, { ...ctx, diagnostics: diagnostics || trace, intel }, rng, human);
    if (onLot) onLot(player, round, teams, i);
    const cap = human ? humanBot.maxFor(player, human) : 0;
    let guard = 0;
    while (guard++ < 3000) {
      const res = runResponseCycle(round, rng);
      if (res) continue;
      // AI went quiet: the human bot may step in (valid bids only).
      if (human && cap > 0 && round.leader !== "HUMAN") {
        const next = round.leader === "Base Price" ? round.bid : r2(round.bid + (round.bid < 1 ? 0.1 : round.bid < 13 ? 0.2 : 0.25));
        if (next <= cap && submitBid(round, "HUMAN").ok) continue;
      }
      break;
    }
    const { bid, leader, pressure } = closeRound(round);
    if (onClosed) onClosed(player, round, teams, i);
    if ((trace || diagnostics) && round.diagnostics) diag.push(...round.diagnostics.map((d) => ({ ...d, lot: i })));
    const bidders = new Set(round.bids.map((b) => b.bidder));
    const lot = {
      id: player.id, name: player.name, role: player.role, rating: player.rating,
      set: player.set, nation: player.nation, base: player.basePrice,
      hist: histPrice(player), price: leader === "Base Price" ? null : bid,
      leader: leader === "Base Price" ? null : leader,
      nBids: round.bids.length, nBidders: bidders.size, idx: i,
      bids: round.bids, // [{bidder, bid}] used for strategy metrics
      pressure,
    };
    lots.push(lot);
    if (leader === "Base Price") return;
    const sold = { ...player, soldPrice: bid };
    if (leader === "HUMAN") {
      human.purse = r2(human.purse - bid);
      human.squad.push(sold);
    } else {
      teams = teams.map((t) =>
        t.name === leader
          ? { ...t, purse: r2(t.purse - bid), squad: [...t.squad, sold] }
          : t,
      );
    }
  });
  return { seed, lots, teams, human, diagnostics: diag, intel };
}

const spend = (team, pred) =>
  team.squad.filter((p) => !p.retained && pred(p)).reduce((s, p) => s + p.soldPrice, 0);

export function summarise(runs) {
  const lots = runs.flatMap((r) => r.lots);
  const sold = lots.filter((l) => l.price != null);
  const marq = lots.filter((l) => isMarquee(l));
  const marqSold = marq.filter((l) => l.price != null);
  const elite = marq.filter((l) => l.rating >= 91);
  const withHist = marqSold.filter((l) => l.hist);

  const out = {};
  out.runs = runs.length;
  out.marquee = {
    soldRate: marqSold.length / marq.length,
    price: { mean: avg(marqSold.map((l) => l.price)), p10: pct(marqSold.map((l) => l.price), 0.1), p50: pct(marqSold.map((l) => l.price), 0.5), p90: pct(marqSold.map((l) => l.price), 0.9), max: Math.max(...marqSold.map((l) => l.price)) },
    avgBids: avg(marq.map((l) => l.nBids)),
    avgBidders: avg(marq.map((l) => l.nBidders)),
    ratioToHist: avg(withHist.map((l) => l.price / l.hist)),
    eliteMeanPrice: avg(elite.filter((l) => l.price != null).map((l) => l.price)),
    eliteHistMean: avg(elite.map((l) => l.hist || 0)),
    cheapUnder60pctHist: withHist.filter((l) => l.price < 0.6 * l.hist).length / withHist.length,
  };
  out.marqueeDetail = [...new Set(marq.map((l) => l.name))].map((name) => {
    const a = marq.filter((l) => l.name === name);
    const sold = a.filter((l) => l.price != null);
    return { name, rating: a[0].rating, hist: a[0].hist, mean: avg(sold.map((l) => l.price)), min: Math.min(...sold.map((l) => l.price)), max: Math.max(...sold.map((l) => l.price)), bidders: avg(a.map((l) => l.nBidders)), bids: avg(a.map((l) => l.nBids)) };
  }).sort((x, y) => y.rating - x.rating);
  out.byRating = {};
  [[90, 100], [85, 89], [80, 84], [75, 79], [70, 74], [60, 69], [0, 59]].forEach(([lo, hi]) => {
    const a = lots.filter((l) => l.rating >= lo && l.rating <= hi);
    const s = a.filter((l) => l.price != null);
    out.byRating[`${lo}-${hi}`] = { n: a.length / runs.length, soldRate: s.length / (a.length || 1), meanPrice: avg(s.map((l) => l.price)), meanHist: avg(a.filter((l) => l.hist).map((l) => l.hist)) };
  });
  out.byRole = {};
  ROLES.forEach((role) => {
    const s = sold.filter((l) => l.role === role && l.rating >= 75);
    out.byRole[role] = { meanPrice: avg(s.map((l) => l.price)), n: s.length / runs.length };
  });
  out.wars = {
    lotsWith6PlusBids: lots.filter((l) => l.nBids >= 6).length / lots.length,
    lotsWith3PlusBidders: lots.filter((l) => l.nBidders >= 3).length / lots.length,
    avgBidsAllLots: avg(lots.filter((l) => l.nBids > 0).map((l) => l.nBids)),
  };
  const q = lots.filter((l) => l.rating >= 75);
  out.quality = {
    unsold75plus: q.filter((l) => l.price == null).length / q.length,
    unsold80plus: lots.filter((l) => l.rating >= 80 && l.price == null).length / lots.filter((l) => l.rating >= 80).length,
    soldBelow60pctHist80plus: lots.filter((l) => l.rating >= 80 && l.hist && l.price != null && l.price < 0.6 * l.hist).length / lots.filter((l) => l.rating >= 80 && l.hist).length,
    soldAtBase80plus: lots.filter((l) => l.rating >= 80 && l.price != null && l.price <= l.base + 1e-9).length / lots.filter((l) => l.rating >= 80).length,
  };
  // Per-team.
  const names = aiTeams.map((t) => t.name);
  out.teams = {};
  const top30 = new Set();
  runs.forEach((r) => [...r.lots].filter((l) => l.price != null).sort((a, b) => b.rating - a.rating || b.price - a.price).slice(0, 30).forEach((l) => top30.add(r.seed + ":" + l.id)));
  names.forEach((n) => {
    const ts = runs.map((r) => r.teams.find((t) => t.name === n));
    const gotTop = runs.map((r) => r.lots.filter((l) => l.leader === n && top30.has(r.seed + ":" + l.id)).length);
    const bought = ts.map((t) => t.squad.filter((p) => !p.retained));
    out.teams[n] = {
      purse: avg(ts.map((t) => t.purse)), purseMin: Math.min(...ts.map((t) => t.purse)), purseMax: Math.max(...ts.map((t) => t.purse)),
      squad: avg(ts.map((t) => t.squad.length)), squadMin: Math.min(...ts.map((t) => t.squad.length)),
      incomplete: ts.filter((t) => t.squad.length < 18).length / ts.length,
      over25: ts.filter((t) => t.squad.length > 25).length,
      overseas: avg(ts.map((t) => t.squad.filter((p) => p.nation === "Foreigner").length)),
      uncapped: avg(bought.map((b) => b.filter(isUncapped).length)),
      indian: avg(bought.map((b) => b.filter((p) => p.nation === "Indian").length)),
      avgRatingBought: avg(bought.flat().map((p) => p.rating)),
      avgPriceBought: avg(bought.flat().map((p) => p.soldPrice)),
      top30: avg(gotTop),
      spendBat: avg(ts.map((t) => spend(t, (p) => p.role === "Batter"))),
      spendBowl: avg(ts.map((t) => spend(t, (p) => p.role === "Bowler"))),
      spendAR: avg(ts.map((t) => spend(t, (p) => p.role === "AllRounder"))),
      spendWK: avg(ts.map((t) => spend(t, (p) => p.role === "WicketKeeper"))),
      cntBat: avg(ts.map((t) => t.squad.filter((p) => p.role === "Batter").length)),
      cntBowl: avg(ts.map((t) => t.squad.filter((p) => p.role === "Bowler").length)),
      cntAR: avg(ts.map((t) => t.squad.filter((p) => p.role === "AllRounder").length)),
      cntWK: avg(ts.map((t) => t.squad.filter((p) => p.role === "WicketKeeper").length)),
      meanBoughtAge: 0,
      // quality of top 15 players in the squad
      xi: avg(ts.map((t) => xi11(t.squad))),
      roleMissing: ts.filter((t) => ROLES.some((role) => t.squad.filter((p) => p.role === role).length < (role === "WicketKeeper" ? 2 : role === "AllRounder" ? 4 : 6))).length / ts.length,
      priciest: Math.max(...bought.flat().map((p) => p.soldPrice)),
      overpayVsHist: avg(bought.flat().filter((p) => p.soldPrice && histPrice(p)).map((p) => p.soldPrice / histPrice(p))),
      purseOver0: ts.filter((t) => t.purse < -1e-9).length,
    };
  });
  const iyer = lots.filter((l) => l.name === "Shreyas Iyer");
  out.iyer = {
    price: avg(iyer.filter((l) => l.price).map((l) => l.price)),
    buyers: names.reduce((a, n) => ((a[n] = iyer.filter((l) => l.leader === n).length / iyer.length), a), {}),
  };
  out.idleCash = {
    // teams finishing with a large unspent purse while their squad is full-ish
    avgPurse: avg(names.map((n) => out.teams[n].purse)),
    over20: runs.flatMap((r) => r.teams).filter((t) => t.purse > 20).length / (runs.length * 10),
    over40: runs.flatMap((r) => r.teams).filter((t) => t.purse > 40).length / (runs.length * 10),
  };
  // Concentration: top-30 players share of the best team.
  const tops = names.map((n) => out.teams[n].top30);
  out.concentration = { maxTop30: Math.max(...tops), minTop30: Math.min(...tops) };
  if (runs[0].human) {
    const hs = runs.map((r) => r.human);
    const hl = runs.flatMap((r) => r.lots.filter((l) => l.leader === "HUMAN"));
    const eliteLots = runs.flatMap((r) => r.lots.filter((l) => l.rating >= 90));
    out.human = {
      purseLeft: avg(hs.map((h) => h.purse)), squad: avg(hs.map((h) => h.squad.length)),
      elite90Won: hl.filter((l) => l.rating >= 90).length / runs.length,
      elite90Total: eliteLots.length / runs.length,
      elite85Won: hl.filter((l) => l.rating >= 85).length / runs.length,
      priceVsHist: avg(hl.filter((l) => l.hist).map((l) => l.price / l.hist)),
      xi: avg(hs.map((h) => xi11(h.squad))),
      meanSpend: avg(hs.map((h) => 120 - h.purse)),
    };
  }
  return out;
}

// Human bot: values stars at their real historical price (+10%) and others
// at 80% of it; caps total spend so it always keeps a legal squad.
export const defaultHumanBot = {
  maxFor(player, human) {
    if (human.squad.length >= 25) return 0;
    if (player.nation === "Foreigner" && human.squad.filter((p) => p.nation === "Foreigner").length >= 8) return 0;
    const h = histPrice(player);
    if (!h || player.rating < 78) return 0;
    const reserve = Math.max(0, 18 - human.squad.length - 1) * 0.5;
    return Math.max(0, Math.min(h * 1.1, human.purse - reserve));
  },
};

const f = (n, d = 1) => (typeof n === "number" ? n.toFixed(d) : String(n));

export function printReport(s, label) {
  console.log(`\n=== ${label} (${s.runs} auctions) ===`);
  const m = s.marquee;
  console.log(`Marquee sold ${f(m.soldRate * 100, 0)}% | price mean ${f(m.price.mean)} p10 ${f(m.price.p10)} p50 ${f(m.price.p50)} p90 ${f(m.price.p90)} max ${f(m.price.max)} Cr | price/hist ${f(m.ratioToHist, 2)} | elite(91+) mean ${f(m.eliteMeanPrice)} vs hist ${f(m.eliteHistMean)} | <60% hist ${f(m.cheapUnder60pctHist * 100, 0)}%`);
  console.log(`Marquee avg bids ${f(m.avgBids)} avg distinct bidders ${f(m.avgBidders)} | all lots: >=6 bids ${f(s.wars.lotsWith6PlusBids * 100, 0)}%  >=3 bidders ${f(s.wars.lotsWith3PlusBidders * 100, 0)}%`);
  if (process.argv.includes("--marquee")) s.marqueeDetail.forEach((m) => console.log(`  ${m.name.padEnd(20)} ${m.rating} hist=${f(m.hist)} mean=${f(m.mean)} (${f(m.min)}-${f(m.max)}) ratio=${f(m.mean / m.hist, 2)} bidders=${f(m.bidders)} bids=${f(m.bids, 0)}`));
  console.log("By rating (lots/auction, sold%, mean price, mean hist):");
  Object.entries(s.byRating).forEach(([k, v]) => console.log(`  ${k.padEnd(7)} n=${f(v.n)} sold=${f(v.soldRate * 100, 0)}% price=${f(v.meanPrice)} hist=${f(v.meanHist)}`));
  console.log("Role mean price (rating>=75): " + Object.entries(s.byRole).map(([k, v]) => `${k} ${f(v.meanPrice)}`).join(" | "));
  const q = s.quality;
  console.log(`Quality: unsold 75+ ${f(q.unsold75plus * 100, 0)}% | unsold 80+ ${f(q.unsold80plus * 100, 0)}% | 80+ sold <60% hist ${f(q.soldBelow60pctHist80plus * 100, 0)}% | 80+ sold at base ${f(q.soldAtBase80plus * 100, 0)}%`);
  console.log(`Idle cash: avg final purse ${f(s.idleCash.avgPurse)} Cr | >20Cr ${f(s.idleCash.over20 * 100, 0)}% | >40Cr ${f(s.idleCash.over40 * 100, 0)}%  | top-30 share max ${f(s.concentration.maxTop30, 2)} min ${f(s.concentration.minTop30, 2)}`);
  console.log("Team   purse(min-max) squad inc% overs uncap  bat/bowl/AR/WK($)    cnt B/Bo/AR/WK  XI   top30 buyRtg buyPx");
  Object.entries(s.teams).forEach(([n, t]) => console.log(`${n.padEnd(5)} ${f(t.purse).padStart(5)}(${f(t.purseMin, 0)}-${f(t.purseMax, 0)}) ${f(t.squad)} ${f(t.incomplete * 100, 0).padStart(3)} ${f(t.overseas)} ${f(t.uncapped)}  ${f(t.spendBat, 0)}/${f(t.spendBowl, 0)}/${f(t.spendAR, 0)}/${f(t.spendWK, 0)}  ${f(t.cntBat, 1)}/${f(t.cntBowl, 1)}/${f(t.cntAR, 1)}/${f(t.cntWK, 1)}  ${f(t.xi)} ${f(t.top30, 2)} ${f(t.avgRatingBought)} ${f(t.avgPriceBought, 2)}`));
  console.log(`Shreyas Iyer: mean price ${f(s.iyer.price)} buyers ` + Object.entries(s.iyer.buyers).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${f(v * 100, 0)}%`).join(", "));
  if (s.human) {
    const h = s.human;
    console.log(`Human bot: purse left ${f(h.purseLeft)} squad ${f(h.squad)} elite90 won ${f(h.elite90Won, 2)}/${f(h.elite90Total, 2)} elite85 won ${f(h.elite85Won, 2)} price/hist ${f(h.priceVsHist, 2)} XI ${f(h.xi)} spend ${f(h.meanSpend)}`);
  }
}

/** Per-franchise behaviour metrics (identity checks, real vs neutral control). */
export function teamBehaviour(runs) {
  const names = aiTeams.map((t) => t.name);
  const out = {};
  names.forEach((n) => {
    const bought = runs.flatMap((r) => r.lots.filter((l) => l.leader === n).map((l) => ({ ...l, tr: playerTraits(l) })));
    const real = bought.filter((b) => b.rating >= 65);
    const big = bought.filter((b) => b.tr.market >= 3);
    const ratios = big.map((b) => b.price / b.tr.market);
    const sd = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
    const spendAll = bought.reduce((s, b) => s + b.price, 0) || 1;
    const spendRole = (role) => bought.filter((b) => b.role === role).reduce((s, b) => s + b.price, 0) / spendAll;
    const myBids = runs.flatMap((r) => r.lots.map((l) => l.bids.filter((b) => b.bidder === n).length));
    const bigLots = runs.flatMap((r) => r.lots.filter((l) => playerTraits(l).market >= 3).map((l) => l.bids.filter((b) => b.bidder === n).length));
    // peak price/market each time this team fought (>=3 bids) on a lot worth >= 3 Cr
    const peaks = runs.flatMap((r) => r.lots.filter((l) => playerTraits(l).market >= 3 && l.bids.filter((b) => b.bidder === n).length >= 3).map((l) => Math.max(...l.bids.filter((b) => b.bidder === n).map((b) => b.bid)) / playerTraits(l).market));
    const gems = bought.filter((b) => b.tr.standout > 0.15 && b.tr.tier >= 2 && b.tr.market >= 1.5);
    out[n] = {
      cappedShare65: real.length ? real.filter((b) => b.tr.capped).length / real.length : 0,
      experience: avg(real.map((b) => b.tr.experience)),
      prospects: bought.filter((b) => b.tr.uncapped && b.tr.indian && b.rating >= 62).length / runs.length,
      uncappedAny: bought.filter((b) => b.tr.uncapped).length / runs.length,
      indianShare: real.length ? real.filter((b) => b.tr.indian).length / real.length : 0,
      batShare: spendRole("Batter"), bowlShare: spendRole("Bowler"), arShare: spendRole("AllRounder"), wkShare: spendRole("WicketKeeper"),
      eliteBat: bought.filter((b) => b.role === "Batter" && b.rating >= 80).length / runs.length,
      overpay: avg(ratios), volatility: sd(ratios), maxRatio: ratios.length ? Math.max(...ratios) : 0,
      warBids: avg(bigLots), warsOver8: bigLots.filter((c) => c >= 8).length / runs.length,
      bigWins: big.length / runs.length, over125: big.filter((b) => b.price / b.tr.market > 1.25).length / runs.length,
      gems: gems.length / runs.length, gemRatio: avg(gems.map((b) => b.price / b.tr.market)),
      ar: bought.filter((b) => b.role === "AllRounder" && b.rating >= 65).length / runs.length,
      spin: bought.filter((b) => b.tr.bowlerKind === "spin" && b.rating >= 65).length / runs.length,
      pace: bought.filter((b) => b.tr.bowlerKind === "pace" && b.rating >= 65).length / runs.length,
      intl: bought.filter((b) => b.tr.foreign && b.tr.capped && b.rating >= 72).length / runs.length,
      stars: bought.filter((b) => b.rating >= 85).length / runs.length,
      starSpend: bought.filter((b) => b.rating >= 85).reduce((s, b) => s + b.price, 0) / runs.length,
      totalSpend: spendAll / runs.length, myBids: avg(myBids),
      peakMean: avg(peaks), peakSd: sd(peaks), peakMax: peaks.length ? Math.max(...peaks) : 0,
      bowl65: bought.filter((b) => b.role === "Bowler" && b.rating >= 65).length / runs.length,
    };
  });
  return out;
}

/** Delhi's pressure outcomes, from the simulated lots. */
export function disruptorReport(runs) {
  const ps = runs.flatMap((r) => r.lots.filter((l) => l.pressure).map((l) => ({ ...l.pressure, lot: l, seed: r.seed })));
  const attempts = ps.length;
  const stuck = ps.filter((p) => p.stuck);
  const won = ps.filter((p) => !p.stuck);
  const byVictim = {};
  won.forEach((p) => (byVictim[p.winner] = (byVictim[p.winner] || 0) + 1));
  return {
    perAuction: attempts / runs.length,
    successRate: attempts ? won.length / attempts : 0,
    stuckRate: attempts ? stuck.length / attempts : 0,
    avgExtracted: avg(won.map((p) => p.extracted)),
    avgPressureBids: avg(ps.map((p) => p.bids)),
    avgStuckPremium: avg(stuck.map((p) => p.finalPrice / playerTraits(p.lot).market)),
    maxFinalVsMarket: attempts ? Math.max(...ps.map((p) => p.finalPrice / playerTraits(p.lot).market)) : 0,
    byVictim,
    victimMarketLots: new Set(won.map((p) => p.lot.id)).size,
  };
}

/** `--set valuation.scale=0.8` style overrides of BIDDING_CONFIG (for sweeps). */
const applyOverrides = (argv) => {
  argv.forEach((a, i) => {
    if (a !== "--set") return;
    const [path, val] = argv[i + 1].split("=");
    const keys = path.split(".");
    let o = BIDDING_CONFIG;
    keys.slice(0, -1).forEach((k) => (o = o[k]));
    o[keys.at(-1)] = JSON.parse(val);
  });
};

if (process.argv[1]?.endsWith("simulation.js")) {
  applyOverrides(process.argv);
  const N = Number(process.argv[2] || 30);
  const jsonIdx = process.argv.indexOf("--json");
  const runs = [];
  for (let s = 1; s <= N; s++) runs.push(runAuction(s));
  const sA = summarise(runs);
  printReport(sA, "AI-only");
  if (process.argv.includes("--strategy")) {
    const real = teamBehaviour(runs);
    setStrategyMode("neutral");
    const nruns = [];
    for (let s = 1; s <= N; s++) nruns.push(runAuction(s));
    const neutral = teamBehaviour(nruns);
    setStrategyMode("real");
    const sNeutral = summarise(nruns);
    const keys = Object.keys(real.CSK);
    console.log("\n=== Strategy identity: real | neutral control (same seeds, same retained squads) ===");
    aiTeams.forEach((t) => {
      const n = t.name;
      console.log(`${n}: ` + keys.map((k) => `${k} ${f(real[n][k], 2)}|${f(neutral[n][k], 2)}`).join("  "));
    });
    console.log("\nNeutral control, league view:");
    printReport(sNeutral, "all-neutral");
    console.log("\nDelhi pressure:", JSON.stringify(disruptorReport(runs), (k, v) => (typeof v === "number" ? +v.toFixed(2) : v)));
  }
  const hruns = [];
  for (let s = 1; s <= N; s++) hruns.push(runAuction(1000 + s, { humanBot: defaultHumanBot }));
  const sH = summarise(hruns);
  printReport(sH, "With human bot");
  if (jsonIdx > 0) {
    const fs = await import("node:fs");
    fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ ai: sA, human: sH }, null, 1));
  }
}

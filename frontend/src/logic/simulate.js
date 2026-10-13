/* global process */
// Batch auction simulations for tuning biddingConfig.js:  npm run simulate
import { players } from "../data/players.js";
import { aiTeams } from "../data/aiTeams.js";
import {
  buildAiTeams,
  buildAuctionQueue,
  getEffectivePlayers,
} from "./auctionLogic.js";
import {
  baseValuation,
  closeRound,
  createRound,
  marketContext,
  runResponseCycle,
  submitBid,
} from "./auctionEngine.js";

export const seeded = (seed = 1) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

export function simulateAuction(seed, userTeam = "MI") {
  const rng = seeded(seed);
  const eff = getEffectivePlayers(players, userTeam, []);
  const queue = buildAuctionQueue(eff, rng);
  let teams = buildAiTeams(eff, aiTeams, userTeam, rng);
  const m = {
    marquee: 0, marqueeBidCounts: [], marqueePrices: [], marqueeContested: 0,
    marqueeCheap: 0, lateEntries: 0, lateChallenged: 0, atCeiling: 0, sold: 0,
    unsold: 0, total: queue.length, ordinaryWars: 0, ordinary: 0,
  };
  queue.forEach((player, i) => {
    const ctx = marketContext(queue.slice(i + 1));
    const round = createRound(player, teams, ctx, rng);
    while (runResponseCycle(round, rng));
    const marquee = player.set === "Marquee-1";

    // Late human entry at the moment the AI auction would have closed.
    if (marquee && round.leader !== "Base Price") {
      round.human = { name: "HUMAN", purse: 999, squad: [] };
      round.userIn = true;
      if (submitBid(round, "HUMAN").ok) {
        m.lateEntries++;
        if (runResponseCycle(round, rng)) m.lateChallenged++;
        // (drop the experiment: re-run clean for the real outcome)
      }
    }
    const real = createRound(player, teams, ctx, seeded(seed * 7919 + i));
    const r2 = seeded(seed * 104729 + i);
    while (runResponseCycle(real, r2));
    const { bid, leader } = closeRound(real);
    const nBids = real.bids.length;
    if (marquee) {
      m.marquee++; m.marqueeBidCounts.push(nBids);
      if (nBids >= 3) m.marqueeContested++;
      if (leader !== "Base Price") {
        m.marqueePrices.push(bid);
        if (bid < 0.6 * baseValuation(player)) m.marqueeCheap++;
      }
    } else {
      m.ordinary++;
      if (nBids >= 6) m.ordinaryWars++;
    }
    if (leader === "Base Price") { m.unsold++; return; }
    m.sold++;
    const info = real.teams[leader];
    if (bid >= info.ceiling * 0.97) m.atCeiling++;
    teams = teams.map((t) =>
      t.name === leader
        ? { ...t, purse: +(t.purse - bid).toFixed(2), squad: [...t.squad, { ...player, soldPrice: bid }] }
        : t,
    );
  });
  m.teams = teams;
  return m;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

if (process.argv[1]?.endsWith("simulate.js")) {
  const N = Number(process.argv[2] || 20);
  const agg = [];
  for (let s = 1; s <= N; s++) agg.push(simulateAuction(s));
  const sum = (k) => agg.reduce((x, m) => x + m[k], 0);
  const all = (k) => agg.flatMap((m) => m[k]);
  const sizes = agg.flatMap((m) => m.teams.map((t) => t.squad.length));
  const purses = agg.flatMap((m) => m.teams.map((t) => t.purse));
  const under18 = sizes.filter((x) => x < 18).length;
  console.log(`auctions: ${N}`);
  console.log(`marquee contested (>=3 bids): ${(100 * sum("marqueeContested") / sum("marquee")).toFixed(0)}%`);
  console.log(`marquee avg bids: ${avg(all("marqueeBidCounts")).toFixed(1)}  avg price: ${avg(all("marqueePrices")).toFixed(1)} Cr  max: ${Math.max(...all("marqueePrices")).toFixed(1)}`);
  console.log(`marquee sold below 60% of baseline value: ${(100 * sum("marqueeCheap") / sum("marquee")).toFixed(0)}%`);
  console.log(`late human entry challenged: ${(100 * sum("lateChallenged") / sum("lateEntries")).toFixed(0)}% of ${sum("lateEntries")}`);
  console.log(`sales at ceiling: ${(100 * sum("atCeiling") / sum("sold")).toFixed(0)}%`);
  console.log(`unsold: ${(100 * sum("unsold") / sum("total")).toFixed(0)}%   ordinary bidding wars (>=6 bids): ${(100 * sum("ordinaryWars") / sum("ordinary")).toFixed(0)}%`);
  console.log(`AI squad size avg ${avg(sizes).toFixed(1)} min ${Math.min(...sizes)} max ${Math.max(...sizes)}; <18 players: ${under18}/${sizes.length}; avg purse left ${avg(purses).toFixed(1)} Cr, min ${Math.min(...purses).toFixed(1)}`);
}

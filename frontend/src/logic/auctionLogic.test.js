import test from "node:test";
import assert from "node:assert/strict";
import { players } from "../data/players.js";
import { aiTeams } from "../data/aiTeams.js";
import {
  AUCTION_ORDER,
  MAX_OVERSEAS,
  buildAiTeams,
  buildAuctionQueue,
  buildUserTeamState,
  canUserBid,
  getBidIncrement,
  getEffectivePlayers,
} from "./auctionLogic.js";
import {
  AI_STATE,
  challengeProbability,
  closeRound,
  computeCeiling,
  createRound,
  getAffordableBudget,
  runAiOnlyAuction,
  runResponseCycle,
  submitBid,
  teamValuation,
  withdrawHuman,
} from "./auctionEngine.js";

const seeded = (seed = 1) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const mine = (name) => players.filter((p) => p.retained && p.team === name);

test("retention: only the user's franchise is affected, dataset not mutated", () => {
  const snapshot = JSON.stringify(players);
  const kept = [mine("MI")[0].id, mine("MI")[1].id];
  const eff = getEffectivePlayers(players, "MI", kept);

  assert.equal(JSON.stringify(players), snapshot);
  assert.equal(
    eff.filter((p) => p.retained && p.team === "MI").length,
    2,
  );
  for (const team of aiTeams.filter((t) => t.name !== "MI")) {
    assert.deepEqual(
      eff.filter((p) => p.retained && p.team === team.name).map((p) => p.id),
      mine(team.name).map((p) => p.id),
    );
  }
  const released = mine("MI").filter((p) => !kept.includes(p.id));
  assert.ok(released.length > 0);
  for (const r of released) {
    const e = eff.find((p) => p.id === r.id);
    assert.equal(e.set, "Marquee-1");
    assert.equal(e.retained, false);
    assert.ok(e.basePrice > 0);
  }
});

test("queue: released players auctioned, retained never, none lost or duplicated", () => {
  const kept = [mine("CSK")[0].id];
  const eff = getEffectivePlayers(players, "CSK", kept);
  const queue = buildAuctionQueue(eff, seeded(3));
  const ids = queue.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(queue.length, eff.filter((p) => !p.retained).length);
  for (const p of queue) assert.ok(AUCTION_ORDER.includes(p.set), p.set);
  assert.ok(!ids.includes(kept[0]));
  for (const r of mine("CSK").slice(1)) assert.ok(ids.includes(r.id));
  for (const p of players.filter((p) => p.retained && p.team !== "CSK"))
    assert.ok(!ids.includes(p.id));
  // released players sit in the Marquee block at the front
  const marquee = queue.filter((p) => p.set === "Marquee-1");
  assert.equal(marquee.length, 18 + mine("CSK").length - 1);
});

test("purses: retention costs counted once per team", () => {
  const kept = [mine("RCB")[0].id];
  const eff = getEffectivePlayers(players, "RCB", kept);
  const user = buildUserTeamState(eff, "RCB");
  assert.equal(user.purse, +(120 - mine("RCB")[0].soldPrice).toFixed(2));
  const ai = buildAiTeams(eff, aiTeams, "RCB", seeded(2));
  assert.equal(ai.length, 9);
  assert.ok(!ai.some((t) => t.name === "RCB"));
  for (const t of ai) {
    const cost = mine(t.name).reduce((s, p) => s + p.soldPrice, 0);
    assert.equal(t.purse, +(120 - cost).toFixed(2));
    assert.equal(t.squad.length, mine(t.name).length);
  }
});

const freshTeams = (rng) =>
  buildAiTeams(getEffectivePlayers(players, "MI", []), aiTeams, "MI", rng);

const star = players.find((p) => p.set === "Marquee-1" && p.rating >= 98);
const ALWAYS = () => 0; // every challenge roll succeeds
const NEVER = () => 0.9999; // every challenge roll fails
const human = (purse = 200) => ({ name: "HUMAN", purse, squad: [] });

// Teams with identical, ample headroom for the star.
const richTeams = (n = 3) =>
  freshTeams(seeded(1))
    .slice(0, n)
    .map((t) => ({ ...t, purse: 120, squad: [], targetSquadSize: 23 }));

// Put the round at `price` led by `leader` as if the AI had bid it up.
const setPrice = (round, price, leader) => {
  round.bid = price;
  round.leader = leader;
  round.version += 1;
  round.needsCycle = true;
};

test("AI-only auction proceeds without any human and several teams bid", () => {
  const teams = richTeams(5);
  const { bid, leader, round } = runAiOnlyAuction(star, teams, seeded(3));
  assert.notEqual(leader, "Base Price");
  assert.ok(new Set(round.bids.map((b) => b.bidder)).size >= 2);
  assert.ok(bid > star.basePrice);
  assert.equal(round.status, "AUCTION_CLOSED");
});

test("late entry: human enters at 12.2, eligible AI team gets a fresh chance and challenges", () => {
  const teams = richTeams(3);
  const round = createRound(star, teams, {}, seeded(2), human());
  const [a, b] = Object.keys(round.teams);
  // make sure both have headroom well above 12.45
  round.teams[a].ceiling = round.teams[a].budget = 20;
  round.teams[b].ceiling = round.teams[b].budget = 20;
  setPrice(round, 12, a);

  const res = submitBid(round, "HUMAN");
  assert.ok(res.ok);
  assert.equal(res.bid, 12.2); // legal increment below 13 Cr is 0.2
  assert.equal(round.leader, "HUMAN");
  assert.equal(round.needsCycle, true);

  const challenge = runResponseCycle(round, ALWAYS);
  assert.ok(challenge, "AI must be given the chance to respond");
  assert.notEqual(challenge.leader, "HUMAN");
  assert.equal(challenge.bid, 12.4);
});

test("late entry: AI may legitimately pass and the human wins", () => {
  const teams = richTeams(3);
  const round = createRound(star, teams, {}, seeded(2), human());
  Object.values(round.teams).forEach((t) => (t.ceiling = t.budget = 20));
  setPrice(round, 12, Object.keys(round.teams)[0]);
  submitBid(round, "HUMAN");
  assert.equal(runResponseCycle(round, NEVER), null);
  assert.deepEqual(closeRound(round), { bid: 12.2, leader: "HUMAN" });
});

test("temporary pass is reconsidered after a meaningful state change; withdrawal is permanent", () => {
  const teams = richTeams(3);
  const round = createRound(star, teams, {}, seeded(2), human());
  const [a, b, c] = Object.keys(round.teams);
  round.teams[a].ceiling = round.teams[a].budget = 30;
  round.teams[b].ceiling = round.teams[b].budget = 30;
  round.teams[c].ceiling = round.teams[c].budget = 12.1; // will be exhausted
  setPrice(round, 5, c);

  assert.equal(runResponseCycle(round, NEVER), null);
  assert.equal(round.teams[a].state, AI_STATE.PASSED); // headroom left => pass
  assert.equal(round.teams[b].state, AI_STATE.PASSED);

  // human enters: passed teams are reconsidered
  submitBid(round, "HUMAN");
  assert.ok(runResponseCycle(round, ALWAYS));

  // exhausted team is withdrawn for good and never bids again
  setPrice(round, 12, a);
  runResponseCycle(round, NEVER); // every team evaluates the 12.2 price
  assert.equal(round.teams[c].state, AI_STATE.WITHDRAWN);
  for (let i = 0; i < 20; i++) {
    const r = runResponseCycle(round, ALWAYS);
    if (r) assert.notEqual(r.leader, c);
  }
  assert.equal(submitBid(round, c).ok, false);
});

test("a team never bids above its ceiling, budget or reserve", () => {
  const teams = richTeams(4);
  for (let seed = 1; seed < 60; seed++) {
    const r = seeded(seed);
    const { round } = runAiOnlyAuction(star, teams, r);
    for (const { bidder, bid } of round.bids) {
      const info = round.teams[bidder];
      assert.ok(bid <= info.ceiling + 1e-9, `${bidder} ${bid} > ${info.ceiling}`);
      assert.ok(bid <= info.budget + 1e-9);
    }
  }
  const t = { ...teams[0], purse: 10, squad: Array(15).fill(players[300]), targetSquadSize: 23 };
  assert.ok(getAffordableBudget(t, 0.75) <= 10 - 7 * 0.75 + 1e-9);
  const c = computeCeiling(t, star, {}, seeded(1));
  assert.ok(c.ceiling <= c.budget);
});

test("ineligible teams (full squad / overseas) can never bid", () => {
  const foreigner = players.find((p) => !p.retained && p.nation === "Foreigner" && p.rating > 85);
  const teams = richTeams(2);
  teams[0] = { ...teams[0], squad: Array(teams[0].targetSquadSize).fill(players[300]) };
  teams[1] = { ...teams[1], squad: players.filter((p) => p.nation === "Foreigner").slice(0, MAX_OVERSEAS) };
  const round = createRound(foreigner, teams, {}, seeded(1));
  assert.ok(Object.values(round.teams).every((t) => t.state === AI_STATE.INELIGIBLE));
  assert.equal(runResponseCycle(round, ALWAYS), null);
  assert.equal(closeRound(round).leader, "Base Price");
});

test("probability: falls toward ceiling, rises with need/aggression, zero above ceiling", () => {
  const base = { ceiling: 10, need: 0.5, aggression: 0.8 };
  const lo = challengeProbability({ ...base, next: 3 });
  const hi = challengeProbability({ ...base, next: 9.5 });
  assert.ok(lo > hi);
  assert.ok(challengeProbability({ ...base, need: 1, next: 6 }) > challengeProbability({ ...base, need: 0, next: 6 }));
  assert.ok(challengeProbability({ ...base, aggression: 1, next: 6 }) > challengeProbability({ ...base, aggression: 0.3, next: 6 }));
  assert.equal(challengeProbability({ ...base, next: 10.2 }), 0);
});

test("team-specific valuation: a team needing wicketkeepers values one more", () => {
  const wk = players.find((p) => !p.retained && p.role === "WicketKeeper" && p.rating >= 80);
  const needy = { ...aiTeams[0], squad: [], targetSquadSize: 23 };
  const stocked = { ...needy, squad: players.filter((p) => p.role === "WicketKeeper").slice(0, 3) };
  assert.ok(teamValuation(needy, wk) > teamValuation(stocked, wk));
});

test("decisions vary across random draws but stay valid", () => {
  const teams = richTeams(5);
  const outcomes = new Set();
  for (let s = 1; s <= 40; s++) {
    const { bid, leader, round } = runAiOnlyAuction(star, teams, seeded(s));
    outcomes.add(`${leader}@${bid}`);
    assert.ok(round.bids.every((b, i) => i === 0 || b.bid > round.bids[i - 1].bid));
  }
  assert.ok(outcomes.size > 10);
});

test("all pass / all withdrawn closes the auction (unsold or sold at base)", () => {
  const teams = richTeams(3);
  const round = createRound(star, teams, {}, seeded(1));
  assert.equal(runResponseCycle(round, NEVER), null);
  assert.equal(closeRound(round).leader, "Base Price");
  assert.equal(submitBid(round, "HUMAN").ok, false); // closed
});

test("single authoritative path: stale AI bid rejected, human recalculated, no stale overwrite", () => {
  const teams = richTeams(3);
  const round = createRound(star, teams, {}, seeded(2), human());
  const [a, b] = Object.keys(round.teams);
  round.teams[a].ceiling = round.teams[a].budget = 30;
  round.teams[b].ceiling = round.teams[b].budget = 30;
  const v0 = round.version;
  assert.ok(submitBid(round, a, { expectedVersion: v0 }).ok);
  // another AI acts on the pre-bid version => rejected
  assert.equal(submitBid(round, b, { expectedVersion: v0 }).reason, "stale");
  // human with a stale view is recalculated at the next legal price
  const h = submitBid(round, "HUMAN", { expectedVersion: v0 });
  assert.ok(h.ok);
  assert.equal(h.bid, +(star.basePrice + getBidIncrement(star.basePrice)).toFixed(2));
  assert.equal(round.bids.length, 2);
  assert.equal(round.leader, "HUMAN");
  assert.equal(submitBid(round, "HUMAN").reason, "already-leading");
  // withdrawn human cannot bid
  withdrawHuman(round);
  assert.equal(submitBid(round, a).ok, true);
  setPrice(round, round.bid, a);
  assert.equal(submitBid(round, "HUMAN").reason, "withdrawn");
});

test("human cannot bid beyond purse or into a full squad", () => {
  const teams = richTeams(2);
  const round = createRound(star, teams, {}, seeded(2), human(1));
  assert.equal(submitBid(round, "HUMAN").reason, "purse");
  const full = createRound(star, teams, {}, seeded(2), { ...human(), squad: Array(25).fill(players[0]) });
  assert.equal(submitBid(full, "HUMAN").reason, "squad");
});

test("user bid eligibility", () => {
  const p = players.find((x) => x.set === "Batter-1");
  const base = { name: "MI", purse: 50, squad: [] };
  assert.ok(canUserBid(base, p, p.basePrice, "Base Price"));
  assert.ok(!canUserBid({ ...base, purse: 0.1 }, p, p.basePrice, "Base Price"));
  assert.ok(!canUserBid(base, p, 5, "MI"));
  assert.ok(!canUserBid({ ...base, squad: Array(25).fill(players[0]) }, p, 1, "CSK"));
});

test("full simulated auction: each player once, money conserved, limits respected", () => {
  const rng = seeded(42);
  const kept = [mine("KKR")[0].id, mine("KKR")[2].id];
  const eff = getEffectivePlayers(players, "KKR", kept);
  const queue = buildAuctionQueue(eff, rng);
  let teams = buildAiTeams(eff, aiTeams, "KKR", rng);
  const startTotal = teams.reduce((s, t) => s + t.purse, 0);
  const seen = new Set();
  let spent = 0;
  for (const player of queue) {
    assert.ok(!seen.has(player.id));
    seen.add(player.id);
    const { bid, leader } = runAiOnlyAuction(player, teams, rng);
    if (leader === "Base Price") continue;
    spent += bid;
    teams = teams.map((t) =>
      t.name === leader
        ? { ...t, purse: +(t.purse - bid).toFixed(2), squad: [...t.squad, { ...player, soldPrice: bid }] }
        : t,
    );
  }
  const endTotal = teams.reduce((s, t) => s + t.purse, 0);
  assert.ok(Math.abs(startTotal - spent - endTotal) < 1e-6);
  const squadIds = teams.flatMap((t) => t.squad.map((p) => p.id));
  assert.equal(new Set(squadIds).size, squadIds.length);
  for (const t of teams) {
    assert.ok(t.purse >= 0);
    assert.ok(t.squad.length <= 25);
  }
  assert.equal(seen.size, queue.length);
});

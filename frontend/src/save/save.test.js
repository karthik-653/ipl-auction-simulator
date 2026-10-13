import test from "node:test";
import assert from "node:assert/strict";
import { players } from "../data/players.js";
import { aiTeams } from "../data/aiTeams.js";
import {
  buildAiTeams, buildAuctionQueue, buildUserTeamState, getEffectivePlayers, makeSeededRng,
} from "../logic/auctionLogic.js";
import { createRound, runResponseCycle } from "../logic/auctionEngine.js";
import { SCHEMA_VERSION, deserializeGame, emptyGame, serializeGame, validateSnapshot } from "./gameState.js";
import { SaveEngine } from "./saveEngine.js";

const data = { players, aiTeams };
const mine = (n) => players.filter((p) => p.retained && p.team === n);

// A realistic mid-auction state, built with the real engine functions.
function midAuction({ sold = 3, withRound = true } = {}) {
  const rng = makeSeededRng(5);
  const team = { id: 2, name: "MI", purse: 120, logo: "x.png" };
  const retentions = [mine("MI")[0].id, mine("MI")[1].id];
  const eff = getEffectivePlayers(players, "MI", retentions);
  const queue = buildAuctionQueue(eff, rng);
  let ai = buildAiTeams(eff, aiTeams, "MI", rng);
  const user = buildUserTeamState(eff, "MI");
  const resolvedIds = [];
  const unsold = [];
  for (let i = 0; i < sold; i++) {
    const p = queue[i];
    resolvedIds.push(p.id);
    if (i % 2 === 0) {
      ai = ai.map((t, k) => (k === 0 ? { ...t, purse: +(t.purse - 3).toFixed(2), squad: [...t.squad, { ...p, soldPrice: 3 }] } : t));
    } else unsold.push(p);
  }
  const player = queue[sold];
  let round = null;
  if (withRound) {
    round = createRound(player, ai, {}, rng, { name: "MI", purse: user.purse, squad: user.squad });
    for (let i = 0; i < 4; i++) if (!runResponseCycle(round, rng)) break;
    round.userIn = false;
  }
  return {
    selectedTeam: team, retentions, auctionInitialized: true, purse: user.purse, squad: user.squad,
    auctionTeams: ai, auctionQueue: queue, playerIndex: sold, currentBid: round?.bid ?? player.basePrice,
    leadingTeam: round?.leader ?? "Base Price", unsoldPlayers: unsold, setHistory: { x: [{ player: "a", team: "b", price: 1 }] },
    roundLog: [], pendingSetAdvance: null, resolvedIds, round,
  };
}
const snapOf = (game, extra = {}) => ({ schemaVersion: SCHEMA_VERSION, sessionId: "s1", seq: 3, game, ...extra });
const wire = (o) => JSON.parse(JSON.stringify(o)); // what the server stores/returns

test("round trip: snapshot is plain JSON and restores the exact auction state", () => {
  const s = midAuction();
  const game = wire(serializeGame(s));
  assert.ok(validateSnapshot(snapOf(game), data).ok);
  const r = deserializeGame(game, data);

  assert.equal(r.purse, s.purse);
  assert.deepEqual(r.auctionQueue.map((p) => p.id), s.auctionQueue.map((p) => p.id));
  assert.equal(r.playerIndex, s.playerIndex);
  assert.equal(r.currentBid, s.currentBid);
  assert.equal(r.leadingTeam, s.leadingTeam);
  assert.deepEqual(r.resolvedIds, s.resolvedIds);
  assert.deepEqual(r.unsoldPlayers.map((p) => p.id), s.unsoldPlayers.map((p) => p.id));
  r.auctionTeams.forEach((t, i) => {
    assert.equal(t.purse, s.auctionTeams[i].purse);
    assert.deepEqual(t.squad.map((p) => [p.id, p.soldPrice]), s.auctionTeams[i].squad.map((p) => [p.id, p.soldPrice]));
    assert.ok(t.requirements && t.aggression); // static team data re-attached
  });
  // retained players kept with their retention price, released ones not in squad
  assert.deepEqual(r.squad.map((p) => p.id).sort(), s.retentions.slice().sort());
  assert.equal(r.effectivePlayers.filter((p) => !p.retained && p.set === "Marquee-1").length, 18 + mine("MI").length - 2);
});

test("resume during bidding: round (bids, ceilings, states, withdrawal) is restored and playable", () => {
  const s = midAuction();
  const r = deserializeGame(wire(serializeGame(s)), data);
  assert.equal(r.round.player.id, s.round.player.id);
  assert.deepEqual(r.round.bids, s.round.bids);
  assert.equal(r.round.bid, s.round.bid);
  assert.equal(r.round.leader, s.round.leader);
  assert.equal(r.round.userIn, false);
  assert.deepEqual(
    Object.fromEntries(Object.entries(r.round.teams).map(([n, t]) => [n, [t.ceiling, t.state]])),
    Object.fromEntries(Object.entries(s.round.teams).map(([n, t]) => [n, [t.ceiling, t.state]])),
  );
  // the restored round continues without replaying accepted bids
  const before = r.round.bids.length;
  const res = runResponseCycle(r.round, makeSeededRng(9));
  assert.equal(r.round.bids.length, before + (res ? 1 : 0));
  if (res) assert.ok(res.bid > s.round.bid);
});

test("resume after a sale: no duplicate sale / deduction when replayed through validation", () => {
  const s = midAuction({ withRound: false });
  const game = wire(serializeGame(s));
  const r = deserializeGame(game, data);
  const ids = r.auctionTeams.flatMap((t) => t.squad.map((p) => p.id)).concat(r.squad.map((p) => p.id), r.unsoldPlayers.map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length);
  // a tampered snapshot that sells the same player twice is rejected
  const dup = wire(game);
  const sold = dup.aiTeams[0].squad.at(-1);
  dup.aiTeams[1].squad.push({ ...sold });
  assert.equal(validateSnapshot(snapOf(dup), data).ok, false);
  const bothSoldUnsold = wire(game);
  bothSoldUnsold.unsoldIds.push(sold.id);
  assert.equal(validateSnapshot(snapOf(bothSoldUnsold), data).ok, false);
});

test("retention costs are applied once: purse equals 120 minus retained prices after restore", () => {
  const s = midAuction({ withRound: false });
  const r = deserializeGame(wire(serializeGame(s)), data);
  const cost = r.squad.reduce((a, p) => a + p.soldPrice, 0);
  assert.equal(+(120 - cost).toFixed(2), r.purse);
  for (const t of r.auctionTeams) {
    const base = t.squad.filter((p) => p.retained).reduce((a, p) => a + p.soldPrice, 0);
    const bought = t.squad.filter((p) => !p.retained).reduce((a, p) => a + p.soldPrice, 0);
    assert.equal(+(120 - base - bought).toFixed(2), t.purse);
  }
});

test("corrupted / incompatible snapshots are rejected with a reason", () => {
  const game = wire(serializeGame(midAuction()));
  const bad = (mut, extra) => {
    const g = wire(game);
    mut(g);
    return validateSnapshot(snapOf(g, extra), data);
  };
  assert.equal(validateSnapshot(null, data).ok, false);
  assert.equal(validateSnapshot("garbage", data).ok, false);
  const inc = validateSnapshot(snapOf(game, { schemaVersion: 99 }), data);
  assert.ok(!inc.ok && inc.incompatible);
  assert.equal(bad((g) => (g.queueIds[0] = 99999)).ok, false);
  assert.equal(bad((g) => (g.playerIndex = 99999)).ok, false);
  assert.equal(bad((g) => (g.purse = "x")).ok, false);
  assert.equal(bad((g) => (g.aiTeams[0].name = "ZZZ")).ok, false);
  assert.equal(bad((g) => (g.queueIds[1] = g.queueIds[0])).ok, false);
  assert.equal(bad((g) => (g.round.status = "CLOSED")).ok, false);
  assert.equal(bad((g) => delete g.setHistory).ok, false);
});

test("fresh game snapshot is valid and clean", () => {
  const g = wire(emptyGame());
  assert.ok(validateSnapshot(snapOf(g), data).ok);
  const r = deserializeGame(g, data);
  assert.equal(r.selectedTeam, null);
  assert.equal(r.auctionInitialized, false);
  assert.deepEqual(r.resolvedIds, []);
  assert.equal(r.round, null);
});

// ---- SaveEngine ----------------------------------------------------------
const makeEngine = (apiOverrides = {}) => {
  const calls = [];
  const statuses = [];
  let version = 0;
  const api = {
    putSave: async ({ snapshot, replace }) => {
      calls.push({ seq: snapshot.seq, replace, game: snapshot.game });
      return { ok: true };
    },
    ...apiOverrides,
  };
  const engine = new SaveEngine({
    api,
    getGame: () => ({ v: ++version }),
    getSessionId: () => "S",
    onStatus: (s) => statuses.push(s),
    debounceMs: 20,
  });
  return { engine, calls, statuses };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("engine: debounced autosave coalesces many changes into few writes with increasing seq", async () => {
  const { engine, calls, statuses } = makeEngine();
  for (let i = 0; i < 10; i++) engine.markDirty();
  assert.equal(statuses.at(-1), "unsaved");
  await sleep(80);
  assert.equal(calls.length, 1);
  assert.equal(statuses.at(-1), "saved");
  engine.markDirty();
  await sleep(80);
  assert.deepEqual(calls.map((c) => c.seq), [1, 2]);
});

test("engine: requests are strictly serial, in order, never overlapping (stale writes can't land late)", async () => {
  let inflight = 0, maxInflight = 0;
  const order = [];
  const { engine } = makeEngine({
    putSave: async ({ snapshot }) => {
      inflight++; maxInflight = Math.max(maxInflight, inflight);
      await sleep(snapshot.seq === 1 ? 40 : 1); // first request is the slowest
      order.push(snapshot.seq);
      inflight--;
    },
  });
  const a = engine.flush({ force: true });
  engine.markDirty(0);
  const b = engine.flush({ force: true });
  await Promise.all([a, b]);
  assert.equal(maxInflight, 1);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test("engine: flush() resolves only after the latest state is saved (Save & Exit)", async () => {
  const { engine, calls } = makeEngine();
  const r = await engine.flush({ force: true });
  assert.ok(r.ok);
  assert.equal(calls.length, 1);
});

test("engine: failed save reports error, stays unsaved, keeps retrying state, and can recover", async () => {
  let fail = true;
  const { engine, calls, statuses } = makeEngine({
    putSave: async ({ snapshot }) => {
      if (fail) throw new Error("disk full");
      calls.push(snapshot.seq);
    },
  });
  const r = await engine.flush({ force: true });
  assert.equal(r.ok, false);
  assert.equal(r.error.message, "disk full");
  assert.equal(statuses.at(-1), "error");
  assert.equal(engine.dirty, true);
  fail = false;
  assert.ok((await engine.flush()).ok);
  assert.equal(statuses.at(-1), "saved");
});

test("engine: new game sends replace once, from an override snapshot, and failure keeps replace pending", async () => {
  let fail = true;
  const sent = [];
  const { engine } = makeEngine({
    putSave: async ({ snapshot, replace }) => {
      sent.push({ replace, game: snapshot.game });
      if (fail) throw new Error("down");
    },
  });
  engine.reset(0);
  const override = { fresh: true };
  assert.equal((await engine.flush({ replace: true, force: true, game: override })).ok, false);
  fail = false;
  assert.ok((await engine.flush({ force: true })).ok);
  assert.deepEqual(sent.map((s) => s.replace), [true, true]);
  assert.deepEqual(sent.at(-1).game, override);
  assert.ok((await engine.flush({ force: true })).ok);
  assert.equal(sent.at(-1).replace, false);
});

test("engine: no active session => nothing is written", async () => {
  const calls = [];
  const engine = new SaveEngine({ api: { putSave: async (x) => calls.push(x) }, getGame: () => ({}), getSessionId: () => null, debounceMs: 5 });
  engine.markDirty();
  await sleep(30);
  assert.equal(calls.length, 0);
  assert.equal((await engine.flush()).ok, false);
});

/* global process */
// Post-auction: completion/resume routing on a REAL finished auction built with
// the production engine, plus the lineup API end to end (own temp DB; the real
// ipl_save.db is never opened).
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { players } from "./data/players.js";
import { aiTeams } from "./data/aiTeams.js";
import { buildAiTeams, buildAuctionQueue, buildUserTeamState, getEffectivePlayers, makeSeededRng } from "./logic/auctionLogic.js";
import { runAiOnlyAuction } from "./logic/auctionEngine.js";
import { serializeGame, validateSnapshot } from "./save/gameState.js";
import { isGameComplete, assign, emptySlots, toRecord, fromRecord, validateLineup } from "./logic/lineup.js";

// Resolve the first `n` lots with AI-only bidding (user team is just another squad here).
function auctionAfter(n) {
  const rng = makeSeededRng(11);
  const eff = getEffectivePlayers(players, "MI", []);
  const queue = buildAuctionQueue(eff, rng);
  const teams = buildAiTeams(eff, aiTeams, "MI", rng);
  const user = buildUserTeamState(eff, "MI");
  let ai = teams;
  const resolvedIds = [], unsold = [];
  for (const p of queue.slice(0, n ?? queue.length)) {
    const { bid, leader } = runAiOnlyAuction(p, ai, rng, {});
    resolvedIds.push(p.id);
    if (leader === "Base Price") unsold.push(p);
    else ai = ai.map((t) => (t.name === leader ? { ...t, purse: +(t.purse - bid).toFixed(1), squad: [...t.squad, { ...p, soldPrice: bid }] } : t));
  }
  const game = serializeGame({
    selectedTeam: { id: 2, name: "MI", purse: 120, logo: "x.png" }, retentions: [], auctionInitialized: true,
    purse: user.purse, squad: user.squad, auctionTeams: ai, auctionQueue: queue, playerIndex: Math.max(0, resolvedIds.length - 1),
    currentBid: 0, leadingTeam: "Base Price", unsoldPlayers: unsold, setHistory: {}, roundLog: [],
    pendingSetAdvance: null, resolvedIds, round: null,
  });
  return { game, queue, ai, user };
}

test("auction is complete only after the LAST lot resolves; survives a JSON round trip (refresh)", () => {
  const { queue } = auctionAfter(5);
  const almost = auctionAfter(queue.length - 1).game;
  assert.equal(isGameComplete(almost), false);
  const done = auctionAfter(null).game;
  assert.equal(isGameComplete(done), true);
  const reloaded = JSON.parse(JSON.stringify(done)); // what the backend returns after a restart
  assert.equal(isGameComplete(reloaded), true);
  assert.equal(validateSnapshot({ schemaVersion: 1, sessionId: "s", seq: 1, game: reloaded }, { players, aiTeams }).ok, true);
  // resolving the final lot again cannot change anything: ids are a set
  const twice = { ...reloaded, resolvedIds: [...reloaded.resolvedIds, reloaded.resolvedIds.at(-1)] };
  assert.equal(isGameComplete(twice), true);
});

test("a lineup record never changes squads or purses (pure ids)", () => {
  const { game } = auctionAfter(null);
  const before = JSON.stringify(game);
  const team = game.aiTeams[0];
  const squad = team.squad.map((r) => players.find((p) => p.id === r.id));
  let slots = emptySlots();
  squad.slice(0, 11).forEach((p, i) => { slots = assign(slots, p.id, i); });
  const rec = toRecord(slots);
  if (squad.length >= 11) assert.equal(validateLineup(slots, squad).ok, true);
  assert.deepEqual(fromRecord(JSON.parse(JSON.stringify(rec)), squad).slots, slots);
  assert.equal(JSON.stringify(game), before);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "../../backend");
const py = path.join(backend, "venv/bin/python");
const PORT = 8128;
const BASE = `http://127.0.0.1:${PORT}`;
const skip = !existsSync(py) && "backend venv not found";
const start = async (db) => {
  const proc = spawn(py, ["-m", "uvicorn", "app:app", "--port", String(PORT), "--log-level", "error"], {
    cwd: backend, env: { ...process.env, IPL_SAVE_DB: db }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/`)).ok) return proc; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("backend did not start");
};
const stop = (proc) => new Promise((res) => { proc.once("exit", res); proc.kill(); });
const putXI = (team, lineup, sessionId = "S1") =>
  fetch(`${BASE}/api/lineups/${team}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, lineup }) });
const getXI = async (sessionId = "S1") => (await (await fetch(`${BASE}/api/lineups?sessionId=${sessionId}`)).json()).lineups;

test("lineup API: independent per team, idempotent, survives restart, never touches the saved game", { skip }, async () => {
  const db = path.join(mkdtempSync(path.join(tmpdir(), "ipl-xi-")), "save.db");
  let proc = await start(db);
  try {
    const { game } = auctionAfter(null);
    const snap = { schemaVersion: 1, sessionId: "S1", seq: 7, game };
    assert.equal((await fetch(`${BASE}/api/save`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: snap, replace: false }) })).status, 200);
    const savedBefore = await (await fetch(`${BASE}/api/save/data`)).text();

    const xi = (o) => ({ startingXI: Array.from({ length: 11 }, (_, i) => o + i), impactPlayerId: o + 20 });
    assert.equal((await putXI("CSK", xi(1))).status, 200);
    assert.equal((await putXI("MI", xi(100))).status, 200);
    assert.equal((await putXI("CSK", xi(500))).status, 200);              // resubmit: update, not duplicate
    let got = await getXI();
    assert.deepEqual(Object.keys(got).sort(), ["CSK", "MI"]);
    assert.equal(got.CSK.startingXI[0], 500);
    assert.equal(got.MI.startingXI[0], 100);                               // independent

    assert.equal((await putXI("RR", { startingXI: [1, 2, 3] })).status, 422);   // < 11 rejected
    assert.equal((await putXI("RR", { startingXI: Array(11).fill(4) })).status, 422); // duplicates rejected
    assert.equal(Object.keys(await getXI()).length, 2);

    await stop(proc);                                                      // backend restart
    proc = await start(db);
    got = await getXI();
    assert.equal(got.CSK.impactPlayerId, 520);
    assert.equal(await (await fetch(`${BASE}/api/save/data`)).text(), savedBefore); // auction snapshot byte-identical
    assert.deepEqual(await getXI("OTHER"), {});
  } finally {
    await stop(proc);
  }
});

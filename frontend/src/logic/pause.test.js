import test from "node:test";
import assert from "node:assert/strict";
import { createPauseController, resumeLot, suspendLot } from "./pause.js";
import { newClock, nextAction, onAccepted, onCycleFoundNone, onHammer, shiftClock, windowInfo, PACING } from "./pacing.js";
import { squadStats } from "./squadStats.js";
import { players } from "../data/players.js";

test("countdown remaining time is preserved exactly across a pause of any length", () => {
  for (const pausedFor of [1, 700, 5_000, 600_000]) {
    const c = newClock(0);
    onAccepted(c, 1000, "ai");
    onCycleFoundNone(c, 1000 + PACING.AI_STEP_MS);
    const t = 1000 + PACING.AI_STEP_MS + 2000; // user opens a squad 2 s into the window
    const before = windowInfo(c, t).remainingMs;
    const hammerIn = nextAction(c).at - t;
    const s = suspendLot({ clock: c, now: t, playerId: 7, userIn: true, aiOpens: true });
    const resumed = resumeLot(s, { playerId: 7, now: t + pausedFor, resolved: false });
    assert.ok(resumed);
    assert.equal(windowInfo(resumed.clock, t + pausedFor).remainingMs, before); // 3500 left, always
    assert.equal(nextAction(resumed.clock).at - (t + pausedFor), hammerIn);
  }
});

test("nothing can happen while paused: the next event is always in the future after resume", () => {
  const c = newClock(0);
  onAccepted(c, 0, "ai");
  onCycleFoundNone(c, PACING.AI_STEP_MS);
  onHammer(c, 6000); // going once
  const s = suspendLot({ clock: c, now: 6400, playerId: 1, userIn: true, aiOpens: true });
  const r = resumeLot(s, { playerId: 1, now: 99_000, resolved: false });
  assert.equal(nextAction(r.clock).at - 99_000, PACING.HAMMER_STEP_MS - 400); // 600 ms of the step left
});

test("shiftClock moves all timestamps together and keeps null ones null", () => {
  const c = newClock(10);
  shiftClock(c, 5);
  assert.equal(c.acceptedAt, 15);
  assert.equal(c.cycleDoneAt, null);
  assert.equal(c.hammerAt, null);
});

test("a stale view cannot resume another player's lot, a settled lot, or a resolving lot", () => {
  const c = newClock(0);
  const s = suspendLot({ clock: c, now: 0, playerId: 5, userIn: true, aiOpens: true });
  assert.equal(resumeLot(s, { playerId: 6, now: 10, resolved: false }), null); // new lot / new game
  assert.equal(resumeLot(s, { playerId: 5, now: 10, resolved: true }), null); // already sold
  assert.equal(resumeLot(suspendLot({ clock: c, now: 0, playerId: 5, resolving: true }), { playerId: 5, now: 10, resolved: false }), null);
  assert.equal(resumeLot(null, { playerId: 5, now: 1, resolved: false }), null);
  assert.equal(suspendLot({ clock: null, now: 0, playerId: 1 }), null);
});

test("pause controller is idempotent and releases exactly once", () => {
  const p = createPauseController();
  assert.equal(p.isPaused(), false);
  p.pause("squad");
  p.pause("squad"); // rapid double click
  assert.equal(p.reasons().length, 1);
  assert.equal(p.isPaused(), true);
  p.resume("squad");
  assert.equal(p.isPaused(), false);
  p.resume("squad"); // repeated NEXT / stale cleanup
  assert.equal(p.isPaused(), false);
  // another hold keeps the auction frozen until it is released too
  p.pause("squad");
  p.pause("other");
  p.resume("squad");
  assert.equal(p.isPaused(), true);
  p.resume("other");
  assert.equal(p.isPaused(), false);
  p.pause("squad");
  p.clear(); // new game
  assert.equal(p.isPaused(), false);
});

test("a lot already idle/waiting is not started by a pause+resume (its clock simply continues)", () => {
  const c = newClock(0, { userIn: true }); // nobody has bid yet
  const before = nextAction(c);
  const s = suspendLot({ clock: c, now: 300, playerId: 2, userIn: true, aiOpens: true });
  const r = resumeLot(s, { playerId: 2, now: 5300, resolved: false });
  assert.equal(r.clock.leaderKind, "none");
  assert.equal(nextAction(r.clock).at - 5300, before.at - 300); // same time left until the AI opens
});

test("squad stats come straight from the squad: roles, overseas, spent, slots", () => {
  const mi = players.filter((p) => p.retained && p.team === "MI");
  const t = { purse: 120 - mi.reduce((a, p) => a + p.soldPrice, 0), squad: mi };
  const st = squadStats(t);
  assert.equal(st.size, mi.length);
  assert.equal(st.slotsLeft, 25 - mi.length);
  assert.equal(st.spent, +(120 - t.purse).toFixed(2));
  assert.equal(st.overseas + st.domestic, st.size);
  assert.equal(Object.values(st.counts).reduce((a, b) => a + b, 0) + st.other.length, st.size);
  const empty = squadStats({ purse: 120, squad: [] });
  assert.equal(empty.size, 0);
  assert.equal(empty.spent, 0);
  assert.equal(empty.slotsLeft, 25);
  assert.equal(squadStats(undefined).size, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  PACING, aiStepMs, holdSpeed, newClock, newSpeed, nextAction, onAccepted, onCycleFoundNone, onHammer,
  releaseSpeed, speedActive, windowInfo,
} from "./pacing.js";

test("normal AI pace is 250 ms and 2x is exactly half (125 ms)", () => {
  assert.equal(aiStepMs(false), 250);
  assert.equal(aiStepMs(true), 125);
  assert.equal(PACING.AI_STEP_MS / PACING.AI_STEP_FAST_MS, 2);
});

test("AI teams keep bidding against each other: the AI never waits for the user between bids", () => {
  const c = newClock(0);
  onAccepted(c, 1000, "ai");
  assert.equal(windowInfo(c, 1000), null); // no countdown while the AIs are still competing
  assert.deepEqual(nextAction(c), { type: "cycle", at: 1250 }); // next AI step after 250 ms
  onAccepted(c, 1250, "ai"); // another AI raises straight away
  assert.deepEqual(nextAction(c), { type: "cycle", at: 1500 });
});

test("once the AI teams go quiet the user gets a visible 5.5 s window before the hammer", () => {
  const c = newClock(0);
  onAccepted(c, 1000, "ai");
  onCycleFoundNone(c, 1250); // nobody else wants to raise
  const w = windowInfo(c, 1250);
  assert.equal(w.kind, "respond");
  assert.equal(w.totalMs, 5500);
  assert.equal(windowInfo(c, 3250).remainingMs, 3500);
  assert.deepEqual(nextAction(c), { type: "hammer", at: 1250 + 5500 });
});

test("a user bid resets everything and the AIs re-decide a step later", () => {
  const c = newClock(0);
  onAccepted(c, 1000, "ai");
  onCycleFoundNone(c, 1250);
  onAccepted(c, 4000, "user"); // user joins inside the window
  assert.equal(windowInfo(c, 4000), null);
  assert.deepEqual(nextAction(c), { type: "cycle", at: 4250 });
  onAccepted(c, 4250, "ai"); // an AI counters, bidding continues among the AIs
  assert.deepEqual(nextAction(c), { type: "cycle", at: 4500 });
});

test("user bid just before the window ends still beats the hammer", () => {
  const c = newClock(0);
  onAccepted(c, 0, "ai");
  onCycleFoundNone(c, 250);
  const deadline = nextAction(c).at;
  onAccepted(c, deadline - 1, "user");
  assert.equal(c.leaderKind, "user");
  assert.equal(c.hammerStep, 0);
  assert.equal(nextAction(c).type, "cycle");
});

test("AI-only pacing (user skipped / cannot bid): next AI step 250 ms, 125 ms when accelerated", () => {
  const c = newClock(0, { userIn: false });
  onAccepted(c, 1000, "ai");
  assert.equal(windowInfo(c, 1000), null);
  assert.equal(nextAction(c).at, 1250);
  c.accelerated = true;
  assert.equal(nextAction(c).at, 1125); // effective immediately, same state
  c.accelerated = false;
  assert.equal(nextAction(c).at, 1250); // release restores normal pacing at once

  const d = newClock(0);
  d.userCanBid = false; // e.g. not enough purse
  onAccepted(d, 0, "ai");
  assert.equal(windowInfo(d, 0), null);
  assert.equal(nextAction(d).at, 250);
});

test("acceleration only shortens the AI step; never the user's window or the hammer", () => {
  const c = newClock(0);
  onAccepted(c, 0, "ai");
  c.accelerated = true;
  assert.equal(nextAction(c).at, 125); // AI step halves
  onCycleFoundNone(c, 125);
  const before = windowInfo(c, 125).totalMs;
  c.accelerated = true;
  assert.equal(windowInfo(c, 125).totalMs, before); // window untouched
  assert.equal(nextAction(c).at, 125 + 5500);
  c.userIn = false; // user skipped: hammer follows straight away, still 1 s steps
  onHammer(c, 200);
  assert.equal(nextAction(c).at, 200 + PACING.HAMMER_STEP_MS);
});

test("quiet auction closes with going once / twice / thrice then resolve (finite)", () => {
  const c = newClock(0);
  onAccepted(c, 0, "ai");
  onCycleFoundNone(c, 250);
  assert.deepEqual(nextAction(c), { type: "hammer", at: 250 + 5500 });
  onHammer(c, 5750); // once
  assert.equal(nextAction(c).type, "hammer");
  onHammer(c, 6750); // twice
  assert.equal(nextAction(c).type, "hammer");
  onHammer(c, 7750); // thrice
  assert.deepEqual(nextAction(c), { type: "resolve", at: 8750 });
  // a late bid during the hammer reopens everything
  onAccepted(c, 8000, "user");
  assert.equal(c.hammerStep, 0);
  assert.equal(nextAction(c).type, "cycle");
});

test("lot nobody has bid on: AI opens after the reveal beat, else the user gets a 12 s opening window", () => {
  const c = newClock(0, { aiOpens: true });
  assert.deepEqual(nextAction(c), { type: "cycle", at: 1000 });
  assert.equal(windowInfo(c, 500), null);
  onCycleFoundNone(c, 1000); // nobody opened
  assert.equal(windowInfo(c, 1000).kind, "open");
  assert.deepEqual(nextAction(c), { type: "hammer", at: 12000 }); // then UNSOLD
  const h = newClock(0, { aiOpens: false });
  assert.equal(nextAction(h).at, 5500); // AI holds back for the user first
  assert.equal(windowInfo(h, 0).kind, "open");
});

test("hold lease: active only while held and heartbeating; expires on its own; release is immediate", () => {
  const s = newSpeed();
  assert.equal(speedActive(s, 0), false);
  holdSpeed(s, 1000);
  assert.equal(speedActive(s, 1100), true);
  holdSpeed(s, 1600); // heartbeat renews
  assert.equal(speedActive(s, 2200), true);
  assert.equal(speedActive(s, 1600 + PACING.ACCEL_LEASE_MS), false); // heartbeat lost => off
  holdSpeed(s, 5000);
  releaseSpeed(s);
  assert.equal(speedActive(s, 5001), false);
});

// Auction timing as a pure, testable state machine. No timers here: the UI
// asks `nextAction(clock)` what should happen next and when, and sets one
// timeout for it. Every rule below is a constant in PACING.
export const PACING = {
  AI_STEP_MS: 250, // normal pause between AI bid steps
  AI_STEP_FAST_MS: 125, // while the user holds 2x (exactly 2x the AI pace)
  RESPONSE_WINDOW_MS: 5500, // user's time to join once the AI teams go quiet
  OPENING_WINDOW_MS: 12000, // user's time to open when nobody has bid
  OPENING_HOLD_MS: 5500, // when the AI lets the user open first (10% of lots)
  REVEAL_MS: 1000, // short beat after a new player is revealed
  HAMMER_STEP_MS: 1000, // going once / twice / thrice
  ACCEL_LEASE_MS: 700, // 2x expires by itself if its heartbeat stops
};

export const aiStepMs = (accelerated) =>
  accelerated ? PACING.AI_STEP_FAST_MS : PACING.AI_STEP_MS;

/** leaderKind: "none" | "ai" | "user" */
export const newClock = (now, { aiOpens = true, userIn = true } = {}) => ({
  acceptedAt: now,
  leaderKind: "none",
  cycleDone: false,
  cycleDoneAt: null,
  hammerStep: 0,
  hammerAt: null,
  aiOpens,
  userIn,
  userCanBid: true,
  accelerated: false,
});

/** A bid (AI or human) was accepted: reopen the response cycle and reset. */
export const onAccepted = (c, now, leaderKind) => {
  c.acceptedAt = now;
  c.leaderKind = leaderKind;
  c.cycleDone = false;
  c.cycleDoneAt = null;
  c.hammerStep = 0;
  c.hammerAt = null;
};

export const onCycleFoundNone = (c, now) => {
  c.cycleDone = true;
  c.cycleDoneAt = now;
};

export const onHammer = (c, now) => {
  c.hammerStep += 1;
  c.hammerAt = now;
};

/**
 * The next thing to do and the absolute time (ms) to do it.
 * type: "cycle" (let AI teams decide) | "hammer" (announce next) | "resolve".
 */
export const nextAction = (c) => {
  const step = aiStepMs(c.accelerated);

  if (c.hammerStep >= 1) {
    return c.hammerStep >= 3
      ? { type: "resolve", at: c.hammerAt + PACING.HAMMER_STEP_MS }
      : { type: "hammer", at: c.hammerAt + PACING.HAMMER_STEP_MS };
  }

  const userWindow = c.userIn && c.userCanBid && c.leaderKind !== "user";

  if (!c.cycleDone) {
    // AI teams keep competing with each other at their own pace; they never
    // wait for the user between bids.
    const at =
      c.leaderKind === "none"
        ? !c.userIn
          ? c.acceptedAt + step
          : c.acceptedAt + (c.aiOpens ? PACING.REVEAL_MS : PACING.OPENING_HOLD_MS)
        : c.acceptedAt + step;
    return { type: "cycle", at };
  }

  // The AI had its say and nobody challenged. Before the hammer falls the user
  // gets a visible response window (a lot nobody has bid on keeps the longer
  // opening window).
  if (c.leaderKind === "none" && userWindow) {
    return { type: "hammer", at: Math.max(c.cycleDoneAt, c.acceptedAt + PACING.OPENING_WINDOW_MS) };
  }
  if (userWindow) return { type: "hammer", at: c.cycleDoneAt + PACING.RESPONSE_WINDOW_MS };
  return { type: "hammer", at: c.cycleDoneAt };
};

/**
 * Countdown to show the user, or null when no real countdown is running.
 * It only appears once the AI teams have gone quiet (nobody else wants to
 * raise), which is exactly when the user's answer decides the lot.
 */
export const windowInfo = (c, now) => {
  if (c.hammerStep > 0 || !c.userIn || !c.userCanBid) return null;
  if (c.leaderKind === "ai" && c.cycleDone) {
    const endsAt = c.cycleDoneAt + PACING.RESPONSE_WINDOW_MS;
    return { kind: "respond", remainingMs: Math.max(0, endsAt - now), totalMs: PACING.RESPONSE_WINDOW_MS };
  }
  if (c.leaderKind === "none" && (c.cycleDone || !c.aiOpens)) {
    const endsAt = c.acceptedAt + PACING.OPENING_WINDOW_MS;
    return { kind: "open", remainingMs: Math.max(0, endsAt - now), totalMs: PACING.OPENING_WINDOW_MS };
  }
  return null;
};

// ---- 2x hold with a lease --------------------------------------------------
export const newSpeed = () => ({ held: false, leaseUntil: 0 });
export const holdSpeed = (s, now) => {
  s.held = true;
  s.leaseUntil = now + PACING.ACCEL_LEASE_MS;
};
export const releaseSpeed = (s) => {
  s.held = false;
  s.leaseUntil = 0;
};
/** Accelerated only while held AND the heartbeat lease has not expired. */
export const speedActive = (s, now) => s.held && now < s.leaseUntil;

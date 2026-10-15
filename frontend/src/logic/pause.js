// Pausing the auction while the user inspects a squad. The auction itself
// stays the single source of truth: a pause just stops its timers and keeps the
// clock, then shifts it on resume so nothing is lost or restarted.
import { shiftClock } from "./pacing.js";

/** Reason-based hold. Idempotent: repeated pause/resume calls are harmless. */
export const createPauseController = () => {
  const holds = new Set();
  return {
    pause: (reason) => void holds.add(reason),
    resume: (reason) => void holds.delete(reason),
    clear: () => holds.clear(),
    isPaused: () => holds.size > 0,
    reasons: () => [...holds],
  };
};

/** Capture what is needed to continue the current lot later. */
export const suspendLot = ({ clock, now, playerId, userIn, aiOpens, resolving }) =>
  clock ? { clock, at: now, playerId, userIn, aiOpens, resolving: Boolean(resolving) } : null;

/**
 * Resume a suspended lot, or return null when it must not be resumed:
 * a different player (stale view / new game), or a lot that was already
 * settled. Remaining durations are preserved by shifting the clock.
 */
export const resumeLot = (suspension, { playerId, now, resolved }) => {
  if (!suspension || suspension.resolving || resolved) return null;
  if (suspension.playerId !== playerId) return null;
  shiftClock(suspension.clock, Math.max(0, now - suspension.at));
  return suspension;
};

// Developer diagnostics: explain AI decisions. Nothing here renders in the
// production UI. Collection is on only in dev builds or when the browser has
// localStorage["iplDebug"] = "1"; from the console use window.iplDiagnostics.
import { getStrategy } from "./strategies.js";

export const isDebug = () => {
  try {
    return Boolean(import.meta.env?.DEV) || globalThis.localStorage?.getItem("iplDebug") === "1";
  } catch {
    return false;
  }
};

const MAX_KEPT = 400;
const kept = [];

/** Remember a finished round's decisions (bounded). */
export const keepRound = (round) => {
  if (!round?.diagnostics) return;
  kept.push({
    player: round.player.name,
    role: round.player.role,
    rating: round.player.rating,
    leader: round.leader,
    price: round.bid,
    decisions: round.diagnostics,
    teams: Object.fromEntries(Object.entries(round.teams).map(([n, t]) => [n, { ...t }])),
  });
  if (kept.length > MAX_KEPT) kept.shift();
};

export const diagnosticsLog = () => kept;

const top = (parts = {}, n = 3) =>
  Object.entries(parts).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`);

/**
 * Structured explanation of one team's behaviour on one lot.
 * `round` must have been created with diagnostics on.
 */
export const explainTeam = (round, teamName) => {
  const info = round.teams[teamName];
  if (!info) return null;
  const strategy = getStrategy({ name: teamName });
  const mine = (round.diagnostics || []).filter((d) => d.team === teamName);
  const bids = round.bids.filter((b) => b.bidder === teamName);
  const last = mine[mine.length - 1];
  let principal;
  if (info.why) principal = info.why;
  else if (bids.length === 0 && last) principal = `${last.decision}: ${last.reason}`;
  else if (round.leader === teamName) principal = `won at ${round.bid} Cr (ceiling ${info.ceiling})`;
  else if (last) principal = `${last.decision}: ${last.reason}`;
  else principal = "never reached its turn";
  return {
    team: teamName,
    strategy: strategy.code,
    philosophy: strategy.label,
    player: round.player.name,
    role: round.player.role,
    rating: round.player.rating,
    valuation: +info.value.toFixed(2),
    ceiling: info.ceiling,
    limit: info.limit,
    hardMax: +(info.hardMax ?? 0).toFixed(2),
    budget: +info.budget.toFixed(2),
    heldBackForFuture: info.planned,
    roleNeed: +(info.roleNeed ?? 0).toFixed(2),
    tier: info.tier,
    ceilingSetBy: info.binding,
    stretch: +(info.stretch ?? 0).toFixed(2),
    strategyFactors: top(info.parts),
    bidsPlaced: bids.length,
    finalPrice: round.bid,
    winner: round.leader,
    pressure: info.pressure ? { active: info.pressure.active, why: info.pressure.why, exit: info.pressure.exit } : undefined,
    principalReason: principal,
  };
};

/** Install the console helper (dev only). */
export const installDebugHelpers = () => {
  if (typeof window === "undefined" || !isDebug()) return;
  window.iplDiagnostics = {
    log: diagnosticsLog,
    last: () => kept[kept.length - 1],
    find: (name) => kept.filter((k) => k.player.toLowerCase().includes(String(name).toLowerCase())),
  };
};

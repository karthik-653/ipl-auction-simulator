// Pure (de)serialisation + validation of the one saved game. No React.
// Players are stored as stable id references ({id, soldPrice}) and rebuilt
// from the bundled dataset, so a snapshot stays small and never contains
// functions, timers or promises.
import { getEffectivePlayers } from "../logic/auctionLogic.js";

export const SCHEMA_VERSION = 1;

const ref = (p) => ({ id: p.id, soldPrice: p.soldPrice ?? null });

export function serializeGame(s) {
  const round =
    s.round && s.round.status === "OPEN"
      ? { ...s.round, player: undefined, playerId: s.round.player.id, human: null }
      : null;
  return {
    selectedTeam: s.selectedTeam
      ? { id: s.selectedTeam.id, name: s.selectedTeam.name, purse: s.selectedTeam.purse, logo: s.selectedTeam.logo }
      : null,
    retentions: [...(s.retentions || [])],
    auctionInitialized: Boolean(s.auctionInitialized),
    purse: s.purse,
    userSquad: (s.squad || []).map(ref),
    aiTeams: (s.auctionTeams || []).map((t) => ({
      name: t.name,
      purse: t.purse,
      targetSquadSize: t.targetSquadSize,
      squad: (t.squad || []).map(ref),
    })),
    queueIds: (s.auctionQueue || []).map((p) => p.id),
    playerIndex: s.playerIndex,
    currentBid: s.currentBid,
    leadingTeam: s.leadingTeam,
    unsoldIds: (s.unsoldPlayers || []).map((p) => p.id),
    resolvedIds: [...(s.resolvedIds || [])],
    setHistory: s.setHistory || {},
    roundLog: s.roundLog || [],
    pendingSetAdvance: s.pendingSetAdvance || null,
    round,
  };
}

/** Rebuild the full React-side state from a validated snapshot game. */
export function deserializeGame(game, { players, aiTeams }) {
  const effective = game.auctionInitialized && game.selectedTeam
    ? getEffectivePlayers(players, game.selectedTeam.name, game.retentions)
    : [];
  const byId = new Map((effective.length ? effective : players).map((p) => [p.id, p]));
  const hydrate = (r) => ({ ...byId.get(r.id), soldPrice: r.soldPrice });
  const defs = new Map(aiTeams.map((t) => [t.name, t]));

  const round = game.round
    ? { ...game.round, player: byId.get(game.round.playerId), human: null }
    : null;
  if (round) delete round.playerId;

  return {
    selectedTeam: game.selectedTeam,
    retentions: game.retentions,
    auctionInitialized: game.auctionInitialized,
    effectivePlayers: effective,
    purse: game.purse,
    squad: game.userSquad.map(hydrate),
    auctionTeams: game.aiTeams.map((t) => ({
      ...defs.get(t.name),
      purse: t.purse,
      targetSquadSize: t.targetSquadSize,
      squad: t.squad.map(hydrate),
    })),
    auctionQueue: game.queueIds.map((id) => byId.get(id)),
    playerIndex: game.playerIndex,
    currentBid: game.currentBid,
    leadingTeam: game.leadingTeam,
    unsoldPlayers: game.unsoldIds.map((id) => byId.get(id)),
    resolvedIds: game.resolvedIds,
    setHistory: game.setHistory,
    roundLog: game.roundLog,
    pendingSetAdvance: game.pendingSetAdvance,
    round,
  };
}

export function buildSnapshot({ sessionId, seq, game }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId,
    seq,
    savedAt: new Date().toISOString(),
    game,
  };
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isIdArray = (a) => Array.isArray(a) && a.every((x) => Number.isInteger(x));

/**
 * Returns { ok:true } or { ok:false, reason, incompatible }.
 * `incompatible` = written by a different schema version.
 */
export function validateSnapshot(snap, { players, aiTeams }) {
  const bad = (reason, incompatible = false) => ({ ok: false, reason, incompatible });
  if (!snap || typeof snap !== "object") return bad("The saved data is not readable.");
  if (snap.schemaVersion !== SCHEMA_VERSION)
    return bad(`Saved with schema v${snap.schemaVersion}, this version expects v${SCHEMA_VERSION}.`, true);
  if (typeof snap.sessionId !== "string" || !Number.isInteger(snap.seq))
    return bad("Session information is missing.");
  const g = snap.game;
  if (!g || typeof g !== "object") return bad("Game state is missing.");

  const known = new Set(players.map((p) => p.id));
  const teamNames = new Set(aiTeams.map((t) => t.name));

  if (g.selectedTeam != null && typeof g.selectedTeam.name !== "string")
    return bad("Selected team is invalid.");
  if (!isIdArray(g.retentions) || !g.retentions.every((id) => known.has(id)))
    return bad("Retention data is invalid.");
  if (typeof g.auctionInitialized !== "boolean") return bad("Auction flag is invalid.");
  if (!g.auctionInitialized) return { ok: true };

  if (!g.selectedTeam) return bad("Auction started without a team.");
  if (!isNum(g.purse) || g.purse < -1e-6) return bad("Your purse is invalid.");
  const refsOk = (arr) =>
    Array.isArray(arr) && arr.every((r) => r && known.has(r.id) && (r.soldPrice === null || isNum(r.soldPrice)));
  if (!refsOk(g.userSquad)) return bad("Your squad is invalid.");
  if (!Array.isArray(g.aiTeams) || g.aiTeams.length === 0) return bad("AI teams are missing.");
  for (const t of g.aiTeams) {
    if (!teamNames.has(t.name) || !isNum(t.purse) || t.purse < -1e-6 || !isNum(t.targetSquadSize) || !refsOk(t.squad))
      return bad(`Team ${t?.name} is invalid.`);
  }
  if (!isIdArray(g.queueIds) || !g.queueIds.every((id) => known.has(id)) || new Set(g.queueIds).size !== g.queueIds.length)
    return bad("The auction queue is invalid.");
  if (!Number.isInteger(g.playerIndex) || g.playerIndex < 0 || g.playerIndex > g.queueIds.length)
    return bad("The queue position is invalid.");
  if (!isNum(g.currentBid) || typeof g.leadingTeam !== "string") return bad("The current bid is invalid.");
  if (!isIdArray(g.unsoldIds) || !isIdArray(g.resolvedIds)) return bad("Result lists are invalid.");
  if (typeof g.setHistory !== "object" || g.setHistory === null || !Array.isArray(g.roundLog))
    return bad("History is invalid.");

  // A player may appear in at most one place (no duplicate sales / squads).
  const seen = new Set();
  const retainedIds = new Set(players.filter((p) => p.retained).map((p) => p.id));
  const claim = (id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  for (const r of [...g.userSquad, ...g.aiTeams.flatMap((t) => t.squad)]) {
    if (!claim(r.id)) return bad(`Player ${r.id} appears in more than one squad.`);
  }
  for (const id of g.unsoldIds) if (!claim(id)) return bad(`Player ${id} is both sold and unsold.`);
  const resolved = new Set(g.resolvedIds);
  for (const id of g.unsoldIds) if (!resolved.has(id)) return bad("An unsold player is not marked resolved.");
  for (const r of [...g.userSquad, ...g.aiTeams.flatMap((t) => t.squad)]) {
    if (!retainedIds.has(r.id) && !resolved.has(r.id))
      return bad(`Player ${r.id} is in a squad but was never resolved.`);
  }
  if (g.round) {
    if (g.round.status !== "OPEN" || !known.has(g.round.playerId) || typeof g.round.teams !== "object")
      return bad("The in-progress bid is invalid.");
  }
  return { ok: true };
}

/** The very first snapshot of a brand-new game (no team chosen yet). */
export const emptyGame = () =>
  serializeGame({
    selectedTeam: null, retentions: [], auctionInitialized: false, purse: 120,
    squad: [], auctionTeams: [], auctionQueue: [], playerIndex: 0, currentBid: 0,
    leadingTeam: "Base Price", unsoldPlayers: [], setHistory: {}, roundLog: [],
    pendingSetAdvance: null, resolvedIds: [], round: null,
  });

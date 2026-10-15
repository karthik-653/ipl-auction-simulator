// Pure Playing XI logic (no React, no I/O). A lineup is 12 slots:
// indices 0-10 = starting XI, index 11 = Impact Player / Substitute.
// It only ever stores player ids; ownership, prices and purses are never touched.
export const XI_SIZE = 11;
export const IMPACT_SLOT = 11;
export const SLOT_COUNT = 12;

// Extra formation rules are OFF by default so the existing player pool is never
// made unusable. Set a number to enforce, e.g. { maxOverseasInXI: 4 } for IPL.
export const LINEUP_RULES = { maxOverseasInXI: null };

/** Completion is derived from persisted facts, so a refresh can never re-run it. */
export const isAuctionComplete = ({ auctionInitialized, auctionQueue, resolvedIds }) => {
  if (!auctionInitialized || !auctionQueue?.length) return false;
  const resolved = resolvedIds instanceof Set ? resolvedIds : new Set(resolvedIds);
  return auctionQueue.every((p) => resolved.has(p.id));
};

/** Same check on a saved snapshot's `game` (used to choose the resume route). */
export const isGameComplete = (game) =>
  Boolean(game?.auctionInitialized) &&
  isAuctionComplete({
    auctionInitialized: true,
    auctionQueue: (game.queueIds || []).map((id) => ({ id })),
    resolvedIds: game.resolvedIds || [],
  });

export const emptySlots = () => Array(SLOT_COUNT).fill(null);

export const slotLabel = (i) => (i === IMPACT_SLOT ? "Impact Player / Substitute" : `Slot ${i + 1}`);

/**
 * Put `playerId` into `slot`. A player already in another slot is MOVED; if the
 * target is occupied the two swap. A player coming from the squad list replaces
 * the occupant, who simply returns to the available squad (nobody is lost).
 */
export function assign(slots, playerId, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT || playerId == null) return slots;
  const next = [...slots];
  const from = next.indexOf(playerId);
  if (from === slot) return slots;
  const displaced = next[slot];
  next[slot] = playerId;
  if (from !== -1) next[from] = displaced; // swap (displaced may be null = plain move)
  return next;
}

export function removeAt(slots, slot) {
  if (slots[slot] == null) return slots;
  const next = [...slots];
  next[slot] = null;
  return next;
}

/** First empty starting slot, else the Impact slot, else -1. */
export const nextFreeSlot = (slots) => {
  const i = slots.slice(0, XI_SIZE).indexOf(null);
  if (i !== -1) return i;
  return slots[IMPACT_SLOT] == null ? IMPACT_SLOT : -1;
};

export const startingCount = (slots) => slots.slice(0, XI_SIZE).filter((x) => x != null).length;

/**
 * Validation for SUBMITTING. `squad` is the franchise's actual players.
 * Returns { ok, errors[] }.
 */
export function validateLineup(slots, squad, rules = LINEUP_RULES) {
  const errors = [];
  const own = new Map(squad.map((p) => [p.id, p]));
  const filled = slots.filter((x) => x != null);
  if (new Set(filled).size !== filled.length) errors.push("A player is assigned to more than one slot.");
  if (filled.some((id) => !own.has(id))) errors.push("A selected player does not belong to this franchise.");
  const n = startingCount(slots);
  if (n < XI_SIZE) errors.push(`Select ${XI_SIZE - n} more starting player${XI_SIZE - n === 1 ? "" : "s"} (${n}/${XI_SIZE} chosen).`);
  if (rules.maxOverseasInXI != null) {
    const os = slots.slice(0, XI_SIZE).filter((id) => own.get(id)?.nation === "Foreigner").length;
    if (os > rules.maxOverseasInXI) errors.push(`At most ${rules.maxOverseasInXI} overseas players can start (${os} chosen).`);
  }
  return { ok: errors.length === 0, errors };
}

/** Non-blocking composition summary for the builder. */
export function composition(slots, squad) {
  const own = new Map(squad.map((p) => [p.id, p]));
  const xi = slots.slice(0, XI_SIZE).map((id) => own.get(id)).filter(Boolean);
  return {
    overseas: xi.filter((p) => p.nation === "Foreigner").length,
    keepers: xi.filter((p) => p.role === "WicketKeeper").length,
    bowlers: xi.filter((p) => p.role === "Bowler").length,
    allRounders: xi.filter((p) => p.role === "AllRounder").length,
    batters: xi.filter((p) => p.role === "Batter").length,
  };
}

export const toRecord = (slots) => ({
  startingXI: slots.slice(0, XI_SIZE),
  impactPlayerId: slots[IMPACT_SLOT] ?? null,
});

/**
 * Rebuild slots from a stored record against the CURRENT squad. Players who no
 * longer belong to the team are never replaced: their slot stays empty and they
 * are reported in `missing` so the UI can tell the user.
 */
export function fromRecord(record, squad) {
  const own = new Set(squad.map((p) => p.id));
  const slots = emptySlots();
  const missing = [];
  const place = (id, i) => {
    if (id == null) return;
    if (own.has(id) && !slots.includes(id)) slots[i] = id;
    else missing.push(id);
  };
  (record?.startingXI || []).slice(0, XI_SIZE).forEach(place);
  place(record?.impactPlayerId, IMPACT_SLOT);
  return { slots, missing };
}

export const sameSlots = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

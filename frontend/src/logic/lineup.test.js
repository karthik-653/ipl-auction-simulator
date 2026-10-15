import test from "node:test";
import assert from "node:assert/strict";
import {
  IMPACT_SLOT, assign, composition, emptySlots, fromRecord, isAuctionComplete, nextFreeSlot, removeAt,
  sameSlots, startingCount, toRecord, validateLineup,
} from "./lineup.js";

const squad = Array.from({ length: 16 }, (_, i) => ({
  id: 100 + i, name: `P${i}`, role: ["Batter", "Bowler", "AllRounder", "WicketKeeper"][i % 4],
  nation: i % 5 === 0 ? "Foreigner" : "Indian",
}));
const fill = (n) => squad.slice(0, n).reduce((s, p, i) => assign(s, p.id, i), emptySlots());

test("completion is derived from resolved ids (idempotent)", () => {
  const q = [{ id: 1 }, { id: 2 }];
  assert.equal(isAuctionComplete({ auctionInitialized: true, auctionQueue: q, resolvedIds: [1] }), false);
  assert.equal(isAuctionComplete({ auctionInitialized: true, auctionQueue: q, resolvedIds: [1, 2, 2] }), true);
  assert.equal(isAuctionComplete({ auctionInitialized: true, auctionQueue: q, resolvedIds: new Set([1, 2]) }), true);
  assert.equal(isAuctionComplete({ auctionInitialized: false, auctionQueue: q, resolvedIds: [1, 2] }), false);
  assert.equal(isAuctionComplete({ auctionInitialized: true, auctionQueue: [], resolvedIds: [] }), false);
});

test("needs 11 distinct starters; the 12th slot is optional and not counted", () => {
  let s = fill(10);
  assert.equal(validateLineup(s, squad).ok, false);
  s = assign(s, squad[10].id, IMPACT_SLOT); // impact filled, XI still 10
  assert.equal(startingCount(s), 10);
  assert.equal(validateLineup(s, squad).ok, false);
  s = assign(s, squad[11].id, 10);
  assert.equal(startingCount(s), 11);
  assert.equal(validateLineup(s, squad).ok, true); // valid with impact filled
  assert.equal(validateLineup(removeAt(s, IMPACT_SLOT), squad).ok, true); // and without
});

test("no player can occupy two slots; moving swaps predictably", () => {
  let s = fill(3);
  s = assign(s, squad[0].id, 1); // P0 -> slot 1 swaps with P1
  assert.deepEqual(s.slice(0, 3), [squad[1].id, squad[0].id, squad[2].id]);
  s = assign(s, squad[0].id, 7); // move into empty slot
  assert.equal(s[1], null);
  assert.equal(s.filter((x) => x === squad[0].id).length, 1);
  const replaced = assign(s, squad[9].id, 0); // from squad over occupant: occupant freed, not duplicated
  assert.equal(replaced.includes(squad[1].id), false);
  assert.equal(replaced[0], squad[9].id);
});

test("validation rejects outsiders and duplicates; overseas rule is configurable", () => {
  const s = fill(11);
  const bad = [...s]; bad[0] = 9999;
  assert.equal(validateLineup(bad, squad).ok, false);
  const dup = [...s]; dup[1] = dup[0];
  assert.equal(validateLineup(dup, squad).ok, false);
  const os = s.slice(0, 11).filter((id) => squad.find((p) => p.id === id).nation === "Foreigner").length;
  assert.equal(validateLineup(s, squad, { maxOverseasInXI: null }).ok, true);
  assert.equal(validateLineup(s, squad, { maxOverseasInXI: os - 1 }).ok, false);
  assert.equal(composition(s, squad).overseas, os);
});

test("record round trip restores slots; stale players are reported, never substituted", () => {
  const s = assign(fill(11), squad[12].id, IMPACT_SLOT);
  const rec = JSON.parse(JSON.stringify(toRecord(s)));
  assert.ok(sameSlots(fromRecord(rec, squad).slots, s));
  const left = squad.filter((p) => p.id !== squad[3].id && p.id !== squad[12].id);
  const { slots, missing } = fromRecord(rec, left);
  assert.deepEqual(missing.sort(), [squad[3].id, squad[12].id].sort());
  assert.equal(slots[3], null);
  assert.equal(slots[IMPACT_SLOT], null);
  assert.equal(slots.filter((x) => x != null).length, 10);
});

test("nextFreeSlot fills the XI first, then the impact slot", () => {
  assert.equal(nextFreeSlot(emptySlots()), 0);
  assert.equal(nextFreeSlot(fill(11)), IMPACT_SLOT);
  assert.equal(nextFreeSlot(assign(fill(11), squad[11].id, IMPACT_SLOT)), -1);
});

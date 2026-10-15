import { MAX_OVERSEAS, MAX_SQUAD_SIZE, STARTING_PURSE } from "./auctionLogic.js";

export const ROLE_ORDER = ["Batter", "WicketKeeper", "AllRounder", "Bowler"];
export const ROLE_LABEL = { Batter: "Batters", WicketKeeper: "Wicket-keepers", AllRounder: "All-rounders", Bowler: "Bowlers" };

/** Everything the squad page shows, derived from real squad data only. */
export const squadStats = (team) => {
  const squad = team?.squad || [];
  const purse = team?.purse ?? 0;
  const byRole = Object.fromEntries(ROLE_ORDER.map((r) => [r, squad.filter((p) => p.role === r)]));
  const overseas = squad.filter((p) => p.nation === "Foreigner").length;
  return {
    size: squad.length,
    maxSize: MAX_SQUAD_SIZE,
    slotsLeft: Math.max(0, MAX_SQUAD_SIZE - squad.length),
    purse,
    spent: +(STARTING_PURSE - purse).toFixed(2),
    startingPurse: STARTING_PURSE,
    overseas,
    maxOverseas: MAX_OVERSEAS,
    domestic: squad.length - overseas,
    byRole,
    counts: Object.fromEntries(ROLE_ORDER.map((r) => [r, byRole[r].length])),
    other: squad.filter((p) => !ROLE_ORDER.includes(p.role)),
  };
};

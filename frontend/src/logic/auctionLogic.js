// Pure auction rules (no React). Everything here takes its inputs explicitly
// so it can be unit-tested and never reads stale component state.

export const STARTING_PURSE = 120;
export const MAX_SQUAD_SIZE = 25;
export const MAX_OVERSEAS = 8;
export const RELEASED_PLAYER_SET = "Marquee-1";
export const RELEASED_BASE_PRICE = 2;

export const AUCTION_ORDER = [
  "Marquee-1",
  "Batter-1",
  "Allrounder-1",
  "Wicket Keeper-1",
  "Fast Bowler-1",
  "Spinner-1",

  "Uncapped Batter-1",
  "Uncapped Allrounder-1",
  "Uncapped Wicket Keeper-1",
  "Uncapped Fast Bowler-1",
  "Uncapped Spinner-1",

  "Batter-2",
  "Allrounder-2",
  "Wicket Keeper-2",
  "Fast Bowler-2",

  "Uncapped Batter-2",
  "Uncapped Allrounder-2",
  "Uncapped Wicket Keeper-2",
  "Uncapped Fast Bowler-2",
  "Uncapped Spinner-2",

  "Allrounder-3",
  "Fast Bowler-3",

  "Allrounder-4",
  "Fast Bowler-4",

  "Uncapped Batter-3",
  "Uncapped Allrounder-3",
  "Uncapped Fast Bowler-3",
  "Uncapped Spinner-3",

  "Uncapped Batter-4",
  "Uncapped Allrounder-4",
  "Uncapped Fast Bowler-4",

  "Uncapped Allrounder-5",
  "Uncapped Fast Bowler-5",
];

export const getBidIncrement = (bid) => {
  if (bid < 1) return 0.1;
  if (bid < 13) return 0.2;
  return 0.25;
};

const round2 = (n) => +n.toFixed(2);

export const getOverseasCount = (team) =>
  (team.squad || []).filter((p) => p.nation === "Foreigner").length;

export const getRoleCount = (team, role) =>
  (team.squad || []).filter((p) => p.role === role).length;

export const shuffle = (array, rng = Math.random) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * The single source of truth for "who is where" during an auction.
 * Returns a NEW array; the imported dataset is never mutated.
 * Only the user's franchise is affected by `retentions`; every other
 * franchise keeps its retained players untouched.
 */
export const getEffectivePlayers = (allPlayers, userTeamName, retentions) => {
  const kept = new Set(Array.isArray(retentions) ? retentions : []);
  return allPlayers.map((player) => {
    if (!player.retained || player.team !== userTeamName) return player;
    if (kept.has(player.id)) return player;
    return {
      ...player,
      retained: false,
      set: RELEASED_PLAYER_SET,
      team: null,
      soldPrice: null,
      basePrice: player.basePrice > 0 ? player.basePrice : RELEASED_BASE_PRICE,
    };
  });
};

export const buildAuctionQueue = (effectivePlayers, rng = Math.random) => {
  const pool = effectivePlayers.filter((p) => !p.retained);
  const queue = [];
  AUCTION_ORDER.forEach((setName) => {
    queue.push(
      ...shuffle(
        pool.filter((p) => p.set === setName),
        rng,
      ),
    );
  });
  return queue;
};

const retainedFor = (effectivePlayers, teamName) =>
  effectivePlayers.filter((p) => p.retained && p.team === teamName);

const sumPrices = (list) =>
  round2(list.reduce((sum, p) => sum + (p.soldPrice || 0), 0));

/** Retained squad + purse for the user's franchise. */
export const buildUserTeamState = (effectivePlayers, userTeamName) => {
  const squad = retainedFor(effectivePlayers, userTeamName);
  return { squad, purse: round2(STARTING_PURSE - sumPrices(squad)) };
};

/** AI franchises start with their (unchanged) retained players. */
export const buildAiTeams = (
  effectivePlayers,
  aiTeamDefs,
  userTeamName,
  rng = Math.random,
) =>
  aiTeamDefs
    .filter((t) => t.name !== userTeamName)
    .map((team) => {
      const squad = retainedFor(effectivePlayers, team.name);
      return {
        ...team,
        purse: round2(STARTING_PURSE - sumPrices(squad)),
        squad,
        targetSquadSize: 22 + Math.floor(rng() * 4), // 22-25
      };
    });

/** Hard eligibility (capacity + overseas), independent of valuation. */
export const hasRoomFor = (team, player, maxSquad = MAX_SQUAD_SIZE) => {
  const size = team.squad?.length || 0;
  if (size >= maxSquad) return false;
  if (player.nation === "Foreigner" && getOverseasCount(team) >= MAX_OVERSEAS)
    return false;
  return true;
};

/** Can the user place the next bid on this player? */
export const canUserBid = (userTeam, player, currentBid, leader) => {
  const next = leader === "Base Price" ? currentBid : currentBid + getBidIncrement(currentBid);
  return (
    userTeam.purse >= next &&
    hasRoomFor(userTeam, player) &&
    leader !== userTeam.name
  );
};

/** Small deterministic PRNG (for tests, simulations and the /math demos). */
export const makeSeededRng = (seed = 1) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

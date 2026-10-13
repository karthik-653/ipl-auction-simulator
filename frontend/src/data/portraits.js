// Deterministic cartoon-portrait assignment (presentation only).
//
// The dataset only distinguishes `Indian` and `Foreigner`, so there are two
// nationality pools plus a general pool used as the fallback. Nationality is a
// broad grouping hint for the artwork, not a claim about anyone's appearance.
// A player's portrait depends only on `player.id` and the pool, so it is
// stable across renders, refreshes, sets and saved-game restores, and nothing
// in the auction state is touched.
export const PORTRAIT_COUNT = 35;

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const PORTRAIT_POOLS = {
  indian: range(1, 18),
  overseas: range(19, 35),
  general: range(1, PORTRAIT_COUNT),
};

// extend here if the dataset ever carries specific countries
export const NATION_POOL = { Indian: "indian", Foreigner: "overseas" };

// Golden-ratio (Weyl) sequence: spreads ids evenly over the pool and keeps
// neighbouring ids from getting neighbouring faces.
const slot = (id, n) => Math.floor((((id | 0) * 0.6180339887498949) % 1) * n);

export const poolFor = (player) => PORTRAIT_POOLS[NATION_POOL[player?.nation]] || PORTRAIT_POOLS.general;

export const portraitIdFor = (player) => {
  const pool = poolFor(player);
  return pool[slot(player?.id ?? 0, pool.length)];
};

export const portraitFile = (n) => `portrait_${String(n).padStart(3, "0")}.webp`;

export const portraitUrl = (player) => `/portraits/${portraitFile(portraitIdFor(player))}`;

// the one portrait used as the app-wide background artwork
export const BACKDROP_PORTRAIT = portraitFile(3);

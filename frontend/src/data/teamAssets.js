// Franchise logo files already shipped in /public/logos (existing project assets).
export const logoMap = {
  CSK: "Chennai Super Kings.png",
  MI: "Mumbai indians.png",
  RCB: "Royal Challengers Bengaluru.png",
  KKR: "Kolkata Knight Riders.png",
  SRH: "Sunrisers Hyderabad.png",
  DC: "Delhi Capitals.png",
  RR: "Rajasthan Royals.png",
  PBKS: "Punjab Kings.png",
  LSG: "Lucknow Super Giants.png",
  GT: "Gujarat Titans.png",
};

export const logoFor = (name) => `/logos/${logoMap[name] || `${name}.png`}`;

// ₹ crore with at most 2 decimals, at least 1 ("12.4", "0.75", "13.0")
export const fmtCr = (v) => {
  const s = (+v).toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
};

export const ROLE_META = {
  Batter: { short: "BAT", label: "Batter" },
  Bowler: { short: "BOWL", label: "Bowler" },
  AllRounder: { short: "AR", label: "All-rounder" },
  WicketKeeper: { short: "WK", label: "Wicket-keeper" },
};

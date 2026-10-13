import TeamBadge from "./TeamBadge";
import { fmtCr } from "../../data/teamAssets";

// Result moment, shown only while the engine reports a resolved player.
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  a: (i / 14) * 360,
  d: 70 + ((i * 37) % 60),
  s: 5 + ((i * 7) % 6),
}));

export default function SaleOverlay({ result }) {
  if (!result) return null;
  const sold = !result.unsold;
  return (
    <div className={`ar-result ${sold ? "is-sold" : "is-unsold"}`} role="status" aria-live="polite">
      {sold && (
        <div className="ar-particles" aria-hidden="true">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              style={{ "--a": `${p.a}deg`, "--d": `${p.d}px`, "--s": `${p.s}px`, "--i": i }}
            />
          ))}
        </div>
      )}
      <div className="ar-stamp">{sold ? "SOLD" : "UNSOLD"}</div>
      <div className="ar-result-name">{result.player}</div>
      {sold ? (
        <div className="ar-result-line">
          <TeamBadge name={result.teamName} size={34} />
          <span>
            <strong>{result.teamName}</strong> · ₹{fmtCr(result.price)} Cr
          </span>
          <small>Purse left ₹{result.remainingBudget?.toFixed(1) ?? "0.0"} Cr</small>
        </div>
      ) : (
        <div className="ar-result-line">
          <span>No franchise placed a bid</span>
        </div>
      )}
    </div>
  );
}

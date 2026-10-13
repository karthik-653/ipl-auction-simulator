import { Bot, Hand, Gavel, FastForward } from "lucide-react";
import { fmtCr } from "../../data/teamAssets";
import "./premium.css";

// Behaviour is unchanged: onBid / onSkip and the canBid / canSkip guards come
// from the auction engine. Only the presentation changed.
function BidControls({
  onBid, onSkip, canBid, canSkip, userIn = true, leadingTeam, selectedTeam, purse, currentBid, bidIncrement,
  onAccelerate, accelerating = false, canAccelerate = false,
}) {
  // Press-and-hold lifecycle: pointer capture keeps the hold alive while the
  // finger moves; every way a hold can end releases it. The parent also
  // releases on blur / tab hide / unmount / next player, and a heartbeat lease
  // expires by itself if anything is missed.
  const press = (e) => {
    if (!canAccelerate || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onAccelerate?.(true);
  };
  const release = () => onAccelerate?.(false);
  const keyDown = (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat && canAccelerate) {
      e.preventDefault();
      onAccelerate?.(true);
    }
  };
  const keyUp = (e) => {
    if (e.key === " " || e.key === "Enter") release();
  };

  const opening = leadingTeam === "Base Price";
  const nextBid = opening ? currentBid : currentBid + bidIncrement;
  const userLeading = leadingTeam === selectedTeam?.name;
  const insufficientPurse = purse < nextBid;

  let hint = "";
  if (!userIn) hint = "You withdrew from this player";
  else if (userLeading) hint = "You are the leading bidder";
  else if (insufficientPurse) hint = "Not enough purse";
  else if (!canBid) hint = "Bidding is paused";

  return (
    <div className="ar-controls">
      <button type="button" className="ar-bid-btn" onClick={onBid} disabled={!canBid}>
        <Gavel size={22} aria-hidden="true" />
        <span className="ar-bid-btn-text">
          <small>{opening ? "Open bidding at" : "Bid"}</small>
          <b>₹{fmtCr(nextBid)} Cr</b>
        </span>
      </button>
      {hint && <p className="ar-hint">{hint}</p>}

      <div className="ar-controls-row">
        <button type="button" className="ar-ai-pill" disabled aria-label="AI auto bidding is on for the other franchises">
          <Bot size={18} aria-hidden="true" />
          <span className="ar-ai-label">AI bidding</span>
          <i aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`ar-fast ${accelerating ? "is-on" : ""}`}
          disabled={!canAccelerate}
          aria-pressed={accelerating}
          aria-label="Hold to make the AI teams bid twice as fast (2×). Does not change your response time."
          title="Hold to speed up AI bidding 2×. Your response time is unchanged."
          onPointerDown={press}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          onLostPointerCapture={release}
          onBlur={release}
          onKeyDown={keyDown}
          onKeyUp={keyUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <FastForward size={18} aria-hidden="true" />
          <span>{accelerating ? "2× ACTIVE" : "Hold 2×"}</span>
        </button>
        <button type="button" className="ar-skip-btn" onClick={onSkip} disabled={!canSkip}>
          <Hand size={18} aria-hidden="true" />
          Skip player
        </button>
      </div>
    </div>
  );
}

export default BidControls;

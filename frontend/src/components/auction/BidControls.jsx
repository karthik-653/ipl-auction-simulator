import "./BidControls.css";

function BidControls({
  onBid,
  onSkip,
  isAiThinking,
  leadingTeam,
  selectedTeam,
  purse,
  currentBid,
  bidIncrement,
}) {
  const insufficientPurse = purse < currentBid + bidIncrement;
  const userLeading = leadingTeam === selectedTeam?.name;

  return (
    <div className="bid-controls">
      <button
        className="bid-button"
        onClick={onBid}
        disabled={isAiThinking || userLeading || insufficientPurse}
      >
        {isAiThinking
          ? "AI Thinking..."
          : insufficientPurse
            ? "Insufficient Purse"
            : userLeading
              ? "You Are Leading"
              : `Bid + ₹${bidIncrement} Cr`}
      </button>

      <button className="disabled-button" disabled>
        AI Auto Bidding
      </button>

      <button className="skip-button" onClick={onSkip}>
        Skip Player
      </button>
    </div>
  );
}

export default BidControls;

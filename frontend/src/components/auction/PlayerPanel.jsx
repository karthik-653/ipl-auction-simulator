import "./PlayerPanel.css";

function PlayerPanel({
  currentPlayer,
  currentBid,
  leadingTeam,
  auctionStatus,
  userTimer,
}) {
  if (!currentPlayer) return null;

  return (
    <div className="player-panel">
      <div className="player-header">
        <h2>{currentPlayer.name}</h2>

        <span className="player-set">{currentPlayer.set}</span>
      </div>

      <div className="player-info">
        <div>
          <p className="label">Role</p>
          <h3>{currentPlayer.role}</h3>
        </div>

        <div>
          <p className="label">Rating</p>
          <h3>{currentPlayer.rating}</h3>
        </div>

        <div>
          <p className="label">Base Price</p>
          <h3>₹ {currentPlayer.basePrice} Cr</h3>
        </div>
      </div>

      <div className="current-bid">
        <p>Current Bid</p>

        <h1>₹ {currentBid} Cr</h1>
      </div>

      <div className="auction-status">
        <h2>{auctionStatus}</h2>
      </div>

      <div className="leading-team">
        <p>Leading Bidder</p>

        <h2>{leadingTeam}</h2>
      </div>
    </div>
  );
}

export default PlayerPanel;

import "./AuctionHeader.css";

function AuctionHeader({ onViewSquads, onViewSets }) {
  return (
    <header className="auction-header">
      <div className="auction-header-left">
        <span className="auction-icon">⚒</span>

        <h1>IPL AUCTION ROOM</h1>
      </div>

      <div className="auction-header-actions">
        <button className="header-button" onClick={onViewSquads}>
          View Squads
        </button>

        <button className="header-button" onClick={onViewSets}>
          View Sets
        </button>
      </div>
    </header>
  );
}

export default AuctionHeader;

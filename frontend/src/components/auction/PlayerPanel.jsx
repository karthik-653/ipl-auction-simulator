import Portrait from "./Portrait";
import TeamBadge from "./TeamBadge";
import SaleOverlay from "./SaleOverlay";
import { fmtCr } from "../../data/teamAssets";
import "./premium.css";

// Cinematic player spotlight + live bid. Every animation is keyed to a real
// state change: player id (reveal), accepted bid (price), leader (chip), and
// the engine's resolved result (sold / unsold).
function PlayerPanel({ currentPlayer, currentBid, leadingTeam, auctionStatus, result, selectedTeamName }) {
  if (!currentPlayer) return null;
  const marquee = currentPlayer.set?.startsWith("Marquee");
  const noBids = leadingTeam === "Base Price";
  const yours = leadingTeam === selectedTeamName;

  return (
    <section className={`ar-spotlight ${result ? (result.unsold ? "is-unsold" : "is-sold") : ""}`}>
      <div className="ar-stage" key={currentPlayer.id}>
        <div className="ar-stage-lights" aria-hidden="true" />
        <div className="ar-stage-pitch" aria-hidden="true" />

        <Portrait player={currentPlayer} />

        <div className="ar-identity">
          <span className={`ar-set ${marquee ? "is-marquee" : ""}`}>
            {marquee && <span aria-hidden="true">★ </span>}
            {currentPlayer.set}
          </span>
          <h2 className="ar-player-name">{currentPlayer.name}</h2>
          <dl className="ar-attrs">
            <div>
              <dt>Role</dt>
              <dd>{currentPlayer.role}</dd>
            </div>
            <div>
              <dt>Nation</dt>
              <dd>{currentPlayer.nation === "Foreigner" ? "Overseas" : "India"}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd className="ar-rating">{currentPlayer.rating}</dd>
            </div>
            <div>
              <dt>Base</dt>
              <dd>₹{fmtCr(currentPlayer.basePrice)} Cr</dd>
            </div>
          </dl>
        </div>

        <SaleOverlay result={result} />
      </div>

      <div className="ar-bid-card">
        <div className="ar-bid-main">
          <span className="ar-bid-label">{noBids ? "Opening price" : "Current bid"}</span>
          <div className="ar-price" aria-live="polite">
            <span key={currentBid} className="ar-price-value">
              ₹{fmtCr(currentBid)}
            </span>
            <span className="ar-price-unit">Cr</span>
          </div>
        </div>

        <div className="ar-bid-leader">
          <span className="ar-bid-label">Leading bidder</span>
          <div key={leadingTeam} className={`ar-leader ${noBids ? "" : "is-flash"} ${yours ? "is-yours" : ""}`}>
            <TeamBadge name={leadingTeam} size={36} />
            <strong>{noBids ? "No bids yet" : leadingTeam}</strong>
            {yours && <span className="ar-you">YOU</span>}
          </div>
        </div>

        <p className="ar-state-line">
          <span className="ar-dot" aria-hidden="true" />
          {auctionStatus}
        </p>
      </div>
    </section>
  );
}

export default PlayerPanel;

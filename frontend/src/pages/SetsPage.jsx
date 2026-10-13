import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuctionContext } from "../context/AuctionContext";
import { players as basePlayers } from "../data/players";
import "./SetsPage.css";

function SetsPage() {
  const navigate = useNavigate();
  const {
    setHistory,
    auctionQueue,
    playerIndex,
    resolveSetWithAi,
    moveToNextSet,
    isSkippingSet,
    pendingSetAdvance,
    effectivePlayers,
  } = useContext(AuctionContext);
  const [viewMode, setViewMode] = useState("current");

  const players = effectivePlayers.length ? effectivePlayers : basePlayers;
  const auctionPlayers = players.filter((player) => !player.retained);
  const allSets = [...new Set(auctionPlayers.map((player) => player.set))];

  const currentSetName = useMemo(() => {
    const currentPlayer = auctionQueue[playerIndex] || auctionQueue[0];
    return currentPlayer?.set || allSets[0] || "";
  }, [auctionQueue, allSets, playerIndex]);

  const visibleSets = viewMode === "current" ? [currentSetName] : allSets;

  return (
    <div className="sets-page">
      <div className="sets-shell">
        <div className="sets-topbar">
          <div>
            <h1 className="sets-title">Auction Sets</h1>
            <p className="sets-subtitle">
              {viewMode === "current"
                ? `Showing the current set: ${currentSetName}`
                : "Showing every set in the auction"}
            </p>
          </div>

          <div className="sets-toggle-group">
            <button
              className="sets-back-btn"
              onClick={() => {
                if (pendingSetAdvance) return;
                navigate("/auction");
              }}
              disabled={Boolean(pendingSetAdvance)}
            >
              ← Back to Auction
            </button>
            <button
              className="sets-skip-btn"
              onClick={() => resolveSetWithAi(currentSetName)}
              disabled={!currentSetName || isSkippingSet}
            >
              {isSkippingSet ? "Resolving..." : "Skip Set"}
            </button>
            <button
              className={`sets-toggle-btn ${viewMode === "current" ? "active" : ""}`}
              onClick={() => setViewMode("current")}
            >
              Current Set
            </button>
            <button
              className={`sets-toggle-btn ${viewMode === "all" ? "active" : ""}`}
              onClick={() => setViewMode("all")}
            >
              All Sets
            </button>
          </div>
        </div>

        <div className="sets-summary-grid">
          <div className="sets-summary-card">
            <div className="sets-summary-label">Active View</div>
            <div className="sets-summary-value">
              {viewMode === "current" ? currentSetName : "All Sets"}
            </div>
          </div>
          <div className="sets-summary-card">
            <div className="sets-summary-label">Sets Listed</div>
            <div className="sets-summary-value">{visibleSets.length}</div>
          </div>
          <div className="sets-summary-card">
            <div className="sets-summary-label">Auction Players</div>
            <div className="sets-summary-value">{auctionPlayers.length}</div>
          </div>
        </div>

        {visibleSets.map((setName) => {
          const historyPlayers = setHistory[setName] || [];
          const setPlayers = auctionPlayers.filter(
            (player) => player.set === setName,
          );
          const totalSpent = historyPlayers
            .filter((player) => player.team !== "Base Price")
            .reduce((sum, player) => sum + player.price, 0);
          const completedCount = historyPlayers.length;
          const pendingCount = setPlayers.length - historyPlayers.length;

          return (
            <div key={setName} className="sets-card">
              <div className="sets-card-header">
                <h2 className="sets-card-title">{setName}</h2>
                <span className="sets-badge">
                  {completedCount}/{setPlayers.length} completed
                </span>
              </div>

              <div className="sets-card-meta">
                <span>Pending: {pendingCount}</span>
                <span>Spent: ₹{totalSpent.toFixed(1)} Cr</span>
                <span>
                  Status: {pendingCount === 0 ? "Complete" : "In Progress"}
                </span>
              </div>

              <table className="sets-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {setPlayers.map((player) => {
                    const result = historyPlayers.find(
                      (entry) => entry.player === player.name,
                    );
                    const isSold = result && result.team !== "Base Price";
                    const isUnsold = result && result.team === "Base Price";

                    return (
                      <tr key={player.id}>
                        <td>{player.name}</td>
                        <td>
                          {result ? (
                            <span
                              className={`sets-status ${isSold ? "sold" : isUnsold ? "unsold" : "pending"}`}
                            >
                              {isSold
                                ? result.team
                                : isUnsold
                                  ? "UNSOLD"
                                  : "Pending"}
                            </span>
                          ) : (
                            <span className="sets-status pending">Pending</span>
                          )}
                        </td>
                        <td className="sets-price">
                          {result
                            ? isSold
                              ? `₹${result.price.toFixed(1)} Cr`
                              : "-"
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {pendingSetAdvance && (
        <div className="sets-modal-overlay">
          <div className="sets-modal-card">
            <h3 className="sets-modal-title">Set Complete</h3>
            <p className="sets-modal-copy">
              The remaining players in {pendingSetAdvance.completedSetName} have
              been resolved. Move to the next set to return to the auction room.
            </p>
            <button
              className="sets-modal-btn"
              onClick={() => moveToNextSet(navigate)}
            >
              Move to Next Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SetsPage;

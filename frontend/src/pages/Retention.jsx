import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuctionContext } from "../context/AuctionContext";
import { players } from "../data/players";
import "./Retention.css";

function Retention() {
  const navigate = useNavigate();
  const { selectedTeam, setRetentions, retentions } =
    useContext(AuctionContext);
  const [localRetentions, setLocalRetentions] = useState(
    Array.isArray(retentions) ? retentions : [],
  );

  // Get players retained by the selected team
  const retainedPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return players.filter(
      (player) => player.team === selectedTeam.name && player.retained === true,
    );
  }, [selectedTeam]);

  // Calculate total retention cost
  const totalRetentionCost = useMemo(() => {
    return retainedPlayers
      .filter((player) => localRetentions.includes(player.id))
      .reduce((sum, player) => sum + player.soldPrice, 0);
  }, [retainedPlayers, localRetentions]);

  // Calculate remaining purse
  const remainingPurse = useMemo(() => {
    return (selectedTeam?.purse || 120) - totalRetentionCost;
  }, [selectedTeam, totalRetentionCost]);

  // Group players by role
  const playersByRole = useMemo(() => {
    const roles = {
      Batter: [],
      Bowler: [],
      AllRounder: [],
      WicketKeeper: [],
    };

    retainedPlayers.forEach((player) => {
      if (roles[player.role]) {
        roles[player.role].push(player);
      }
    });

    return roles;
  }, [retainedPlayers]);

  const handleToggleRetention = (playerId) => {
    const next = localRetentions.includes(playerId)
      ? localRetentions.filter((id) => id !== playerId)
      : [...localRetentions, playerId];
    setLocalRetentions(next);
    setRetentions(next); // keep the shared state (and autosave) in step
  };

  const handleProceedToAuction = () => {
    setRetentions(localRetentions);
    navigate("/auction");
  };

  if (!selectedTeam) {
    return (
      <div className="retention-page">
        <div className="retention-shell">
          <div className="retention-error">
            <h2>No Team Selected</h2>
            <p>Please select a team first.</p>
            <button
              onClick={() => navigate("/teams")}
              className="retention-back-btn"
            >
              Back to Team Selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="retention-page">
      <div className="retention-shell">
        {/* Hero Section */}
        <div className="retention-hero">
          <div className="retention-hero-left">
            <img
              className="retention-team-logo"
              src={`/logos/${selectedTeam.logo}`}
              alt={`${selectedTeam.name} logo`}
            />
            <div>
              <h1 className="retention-title">{selectedTeam.name}</h1>
              <p className="retention-subtitle">Player Retention Management</p>
            </div>
          </div>

          <div className="retention-purse-info">
            <div className="purse-card">
              <div className="purse-label">Starting Purse</div>
              <div className="purse-amount">₹{selectedTeam.purse} Cr</div>
            </div>
            <div className="purse-card retention-cost">
              <div className="purse-label">Retention Cost</div>
              <div className="purse-amount">
                ₹{totalRetentionCost.toFixed(2)} Cr
              </div>
            </div>
            <div className="purse-card remaining">
              <div className="purse-label">Remaining Purse</div>
              <div className="purse-amount">
                ₹{remainingPurse.toFixed(2)} Cr
              </div>
            </div>
          </div>
        </div>

        {/* Players Section */}
        {retainedPlayers.length === 0 ? (
          <div className="retention-empty">
            <h2>No Retained Players</h2>
            <p>This team has no retained players to manage.</p>
          </div>
        ) : (
          <div className="retention-content">
            <div className="retention-instructions">
              <p>
                Select the players you want to retain. Unselected players will
                be moved to the Marquee set.
              </p>
            </div>

            {Object.entries(playersByRole).map(([role, playersInRole]) => {
              if (playersInRole.length === 0) return null;

              return (
                <div key={role} className="retention-role-section">
                  <h2 className="role-title">{role}s</h2>
                  <div className="retention-players-grid">
                    {playersInRole.map((player) => (
                      <div
                        key={player.id}
                        className={`retention-player-card ${
                          localRetentions.includes(player.id)
                            ? "retained"
                            : "released"
                        }`}
                      >
                        <div className="player-card-header">
                          <div>
                            <h3 className="player-name">{player.name}</h3>
                            <p className="player-role">{player.role}</p>
                          </div>
                          <div className="player-nation-badge">
                            {player.nation === "Foreigner" ? "🌍" : "🇮🇳"}
                          </div>
                        </div>

                        <div className="player-stats">
                          <div className="stat">
                            <span className="stat-label">Rating</span>
                            <span className="stat-value">{player.rating}</span>
                          </div>
                          <div className="stat">
                            <span className="stat-label">Retention Price</span>
                            <span className="stat-value">
                              ₹{player.soldPrice} Cr
                            </span>
                          </div>
                        </div>

                        <div className="player-action">
                          <label className="retention-checkbox-label">
                            <input
                              type="checkbox"
                              checked={localRetentions.includes(player.id)}
                              onChange={() => handleToggleRetention(player.id)}
                              className="retention-checkbox"
                            />
                            <span className="checkbox-text">
                              {localRetentions.includes(player.id)
                                ? "Retained"
                                : "Release to Marquee"}
                            </span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Buttons */}
        <div className="retention-actions">
          <button
            className="retention-action-btn secondary"
            onClick={() => navigate("/teams")}
          >
            ← Change Team
          </button>
          <button
            className="retention-action-btn primary"
            onClick={handleProceedToAuction}
          >
            Proceed to Auction →
          </button>
        </div>
      </div>
    </div>
  );
}

export default Retention;

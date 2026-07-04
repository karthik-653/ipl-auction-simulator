import { useContext } from "react";
import { useNavigate } from "react-router-dom";

import { AuctionContext } from "../context/AuctionContext";
import { teams } from "../data/teams";
import "./TeamSelection.css";

function TeamSelection() {
  const navigate = useNavigate();

  const { setSelectedTeam } = useContext(AuctionContext);

  const selectTeam = (team) => {
    setSelectedTeam(team);
    navigate("/retention");
  };

  return (
    <div className="team-selection-page">
      <div className="team-selection-shell">
        <div className="team-selection-hero">
          <h1 className="team-selection-title">Choose Your Franchise</h1>
          <p className="team-selection-subtitle">
            Pick the team you want to build your auction squad around.
          </p>
        </div>

        <div className="team-selection-grid">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => selectTeam(team)}
              className="team-card"
              type="button"
            >
              <div className="team-card-left">
                <img
                  className="team-logo"
                  src={`/logos/${team.logo}`}
                  alt={`${team.name} logo`}
                />
                <div>
                  <div className="team-card-name">{team.name}</div>
                  <div className="team-card-meta">
                    Starting purse: ₹{team.purse} Cr
                  </div>
                </div>
              </div>
              <div className="team-card-arrow">→</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TeamSelection;

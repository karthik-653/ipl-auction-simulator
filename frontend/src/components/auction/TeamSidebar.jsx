import { useState } from "react";
import "./TeamSidebar.css";
import { ChevronRight, X } from "lucide-react";

const logoMap = {
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

export default function TeamSidebar({
  selectedTeam,
  purse,
  squad,
  auctionTeams,
}) {
  const [selectedSquadTeam, setSelectedSquadTeam] = useState(null);

  const teams = [
    {
      ...selectedTeam,
      purse,
      squad,
      isUser: true,
    },
    ...auctionTeams,
  ];

  const closeSquadModal = () => setSelectedSquadTeam(null);

  const roleGroups = [
    { key: "batter", label: "Batters", roles: ["batter"] },
    {
      key: "allrounder",
      label: "All-rounders",
      roles: ["allrounder", "all rounder", "all-rounder"],
    },
    {
      key: "wicketkeeper",
      label: "Wicketkeepers",
      roles: ["wicket keeper", "wicketkeeper", "wk"],
    },
    {
      key: "spinner",
      label: "Spin Bowlers",
      roles: ["spinner", "spin bowler", "spin"],
    },
    {
      key: "fastbowler",
      label: "Fast Bowlers",
      roles: ["fast bowler", "fastbowler", "pace bowler", "fast"],
    },
  ];

  const getGroupedSquad = (team) => {
    const squadPlayers = team?.squad || [];

    return roleGroups.map((group) => ({
      ...group,
      players: squadPlayers.filter((player) => {
        const roleValue = (player.role || "").toLowerCase();
        return group.roles.some((role) => roleValue.includes(role));
      }),
    }));
  };

  const groupedSquad = getGroupedSquad(selectedSquadTeam);

  return (
    <div className="team-sidebar">
      <div className="team-sidebar-header">
        <h3>TEAMS</h3>
      </div>

      <div className="team-list">
        {teams.map((team) => (
          <div
            key={team.name}
            className={`team-card ${team.isUser ? "user-team" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedSquadTeam(team)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedSquadTeam(team);
              }
            }}
          >
            <img
              src={`/logos/${logoMap[team.name] || `${team.name}.png`}`}
              alt={team.name}
              className="team-logo"
            />

            <div className="team-details">
              <div className="team-name">{team.name}</div>

              <div className="team-meta">
                <span className="purse">₹ {team.purse.toFixed(1)} Cr</span>

                <span>{team.squad?.length || 0} / 25</span>
              </div>
            </div>

            <ChevronRight size={18} className="team-arrow" />
          </div>
        ))}
      </div>

      {selectedSquadTeam && (
        <div className="team-squad-modal-backdrop" onClick={closeSquadModal}>
          <div
            className="team-squad-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="team-squad-modal-header">
              <div className="team-squad-modal-title">
                <img
                  src={`/logos/${logoMap[selectedSquadTeam.name] || `${selectedSquadTeam.name}.png`}`}
                  alt={selectedSquadTeam.name}
                  className="team-squad-modal-logo"
                />
                <div>
                  <h3>{selectedSquadTeam.name}</h3>
                  <p>
                    {selectedSquadTeam.squad?.length || 0} / 25 players • ₹
                    {selectedSquadTeam.purse.toFixed(1)} Cr left
                  </p>
                </div>
              </div>

              <button
                className="team-squad-modal-close"
                onClick={closeSquadModal}
                aria-label="Close squad view"
              >
                <X size={18} />
              </button>
            </div>

            <div className="team-squad-modal-body">
              {(selectedSquadTeam.squad?.length || 0) === 0 ? (
                <div className="team-squad-empty">
                  No players purchased yet.
                </div>
              ) : (
                <div className="team-squad-columns">
                  {groupedSquad.map((group) => (
                    <div key={group.key} className="team-squad-column">
                      <h4>{group.label}</h4>
                      {group.players.length === 0 ? (
                        <div className="team-squad-column-empty">—</div>
                      ) : (
                        group.players.map((player) => (
                          <div
                            key={player.id || player.name}
                            className="team-squad-player"
                          >
                            <div className="team-squad-player-name">
                              {player.name}
                            </div>
                            <div className="team-squad-player-meta">
                              {player.nation}
                            </div>
                            <div className="team-squad-player-price">
                              ₹{player.soldPrice ?? player.basePrice ?? 0} Cr
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import "./premium.css";
import TeamBadge from "./TeamBadge";
import { logoFor } from "../../data/teamAssets";
import { ChevronRight, X } from "lucide-react";

export default function TeamSidebar({
  selectedTeam,
  purse,
  squad,
  auctionTeams,
  leadingTeam,
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
    <div className="ar-card ar-teams">
      <div className="ar-card-head">
        <h3 className="ar-card-title">Franchises</h3>
        <span className="ar-count">{teams.length}</span>
      </div>

      <div className="ar-team-list">
        {teams.map((team) => {
          const count = team.squad?.length || 0;
          const leading = team.name === leadingTeam;
          return (
            <div
              key={team.name}
              className={`ar-team ${team.isUser ? "is-user" : ""} ${leading ? "is-leading" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${team.name}${team.isUser ? " (you)" : ""}: ${team.purse.toFixed(1)} crore left, ${count} of 25 players${leading ? ", leading bidder" : ""}. Open squad.`}
              onClick={() => setSelectedSquadTeam(team)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedSquadTeam(team);
                }
              }}
            >
              <TeamBadge name={team.name} size={40} />
              <div className="ar-team-body">
                <div className="ar-team-top">
                  <span className="ar-team-name">{team.name}</span>
                  {team.isUser && <span className="ar-tag ar-tag-you">YOU</span>}
                  {leading && <span className="ar-tag ar-tag-lead">LEADING</span>}
                </div>
                <div className="ar-team-meta">
                  <span key={team.purse} className="ar-purse">₹{team.purse.toFixed(1)} Cr</span>
                  <span className="ar-occupancy">{count}/25</span>
                </div>
                <div className="ar-meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (count / 25) * 100)}%` }} />
                </div>
              </div>
              <ChevronRight size={16} className="ar-team-arrow" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {selectedSquadTeam && (
        <div className="ar-modal-backdrop" onClick={closeSquadModal}>
          <div
            className="ar-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="team-squad-modal-header">
              <div className="team-squad-modal-title">
                <img
                  src={logoFor(selectedSquadTeam.name)}
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

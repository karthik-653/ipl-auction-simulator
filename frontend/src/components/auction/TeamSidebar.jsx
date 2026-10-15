import "./premium.css";
import TeamBadge from "./TeamBadge";
import { ChevronRight } from "lucide-react";

// Franchise list. Clicking a team opens its full-screen squad page (no popup);
// the auction room pauses the auction before navigating.
export default function TeamSidebar({ selectedTeam, purse, squad, auctionTeams, leadingTeam, onOpenSquad }) {
  const teams = [{ ...selectedTeam, purse, squad, isUser: true }, ...auctionTeams];

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
              aria-label={`${team.name}${team.isUser ? " (you)" : ""}: ${team.purse.toFixed(1)} crore left, ${count} of 25 players${leading ? ", leading bidder" : ""}. Open squad (pauses the auction).`}
              onClick={() => onOpenSquad?.(team)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenSquad?.(team);
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
    </div>
  );
}

import "./TeamSidebar.css";
import { ChevronRight } from "lucide-react";

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
  const teams = [
    {
      ...selectedTeam,
      purse,
      squad,
      isUser: true,
    },
    ...auctionTeams,
  ];

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
    </div>
  );
}

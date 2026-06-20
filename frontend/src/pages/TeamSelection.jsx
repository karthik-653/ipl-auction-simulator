import { useContext } from "react";
import { useNavigate } from "react-router-dom";

import { AuctionContext } from "../context/AuctionContext";
import { teams } from "../data/teams";

function TeamSelection() {
  const navigate = useNavigate();

  const { setSelectedTeam } = useContext(AuctionContext);

  const selectTeam = (team) => {
    setSelectedTeam(team);
    navigate("/retention");
  };

  return (
    <div
      style={{
        padding: "40px",
        textAlign: "center",
      }}
    >
      <h1>Select Your Team</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px",
          maxWidth: "600px",
          margin: "20px auto",
        }}
      >
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => selectTeam(team)}
            style={{
              padding: "15px",
              cursor: "pointer",
            }}
          >
            {team.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default TeamSelection;
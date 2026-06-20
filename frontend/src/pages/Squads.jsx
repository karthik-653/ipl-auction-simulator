import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuctionContext } from "../context/AuctionContext";

function Squads() {
  const navigate = useNavigate();

  const { selectedTeam, purse, squad, auctionTeams } =
    useContext(AuctionContext);

  const [selectedSquadTeam, setSelectedSquadTeam] = useState(null);

  const allTeams = [
    {
      id: 999,
      name: selectedTeam?.name,
      purse,
      squad,
    },
    ...auctionTeams,
  ];

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      <button onClick={() => navigate("/auction")}>← Back To Auction</button>

      <h1>Squad Viewer</h1>

      <hr />

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        {allTeams.map((team) => (
          <button key={team.name} onClick={() => setSelectedSquadTeam(team)}>
            {team.name}
          </button>
        ))}
      </div>

      {selectedSquadTeam && (
        <>
          <h2>{selectedSquadTeam.name}</h2>

          <p>Purse Remaining: ₹{selectedSquadTeam.purse} Cr</p>

          <p>Players Bought: {selectedSquadTeam.squad?.length || 0}</p>

          <hr />

          {(selectedSquadTeam.squad?.length || 0) === 0 ? (
            <p>No players purchased yet.</p>
          ) : (
            <ul>
              {selectedSquadTeam.squad.map((player) => (
                <li key={player.id}>
                  {player.name} - ₹{player.soldPrice} Cr
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default Squads;

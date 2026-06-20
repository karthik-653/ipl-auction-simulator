import { useContext } from "react";
import { AuctionContext } from "../context/AuctionContext";

function AuctionSummary() {
  const { selectedTeam, purse, squad, auctionTeams, unsoldPlayers } =
    useContext(AuctionContext);

  const totalSold =
    squad.length +
    auctionTeams.reduce((total, team) => total + (team.squad?.length || 0), 0);

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      <h1>🏆 Auction Complete</h1>

      <hr />

      <h2>Your Team</h2>

      <p>
        <strong>Team:</strong> {selectedTeam?.name}
      </p>

      <p>
        <strong>Purse Remaining:</strong> ₹{purse} Cr
      </p>

      <p>
        <strong>Players Bought:</strong> {squad.length}
      </p>

      <hr />

      <h2>Your Squad</h2>

      {squad.length === 0 ? (
        <p>No players purchased.</p>
      ) : (
        <ul>
          {squad.map((player) => (
            <li key={player.id}>
              {player.name} - ₹{player.soldPrice} Cr
            </li>
          ))}
        </ul>
      )}

      <hr />

      <h2>AI Teams</h2>

      {auctionTeams.map((team) => (
        <div
          key={team.id}
          style={{
            marginBottom: "20px",
            padding: "10px",
            border: "1px solid #ccc",
          }}
        >
          <h3>{team.name}</h3>

          <p>Purse Remaining: ₹{team.purse} Cr</p>

          <p>Players Bought: {team.squad?.length || 0}</p>
        </div>
      ))}

      <hr />

      <h2>Unsold Players</h2>

      {unsoldPlayers.length === 0 ? (
        <p>No unsold players.</p>
      ) : (
        <ul>
          {unsoldPlayers.map((player) => (
            <li key={player.id}>{player.name}</li>
          ))}
        </ul>
      )}

      <hr />

      <h2>Auction Stats</h2>

      <p>Total Players Sold: {totalSold}</p>

      <p>Total Unsold Players: {unsoldPlayers.length}</p>
    </div>
  );
}

export default AuctionSummary;

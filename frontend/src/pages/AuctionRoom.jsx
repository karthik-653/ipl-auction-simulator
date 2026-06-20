import { useState, useContext, useEffect } from "react";
import { players } from "../data/players";
import { AuctionContext } from "../context/AuctionContext";
import { aiTeams } from "../data/aiTeams";

function AuctionRoom() {
  const { selectedTeam, purse, setPurse, squad, setSquad } =
    useContext(AuctionContext);

  const [playerIndex, setPlayerIndex] = useState(0);

  const [currentBid, setCurrentBid] = useState(players[0]?.basePrice || 0);

  const [leadingTeam, setLeadingTeam] = useState("Base Price");

  const [teamLimits, setTeamLimits] = useState({});

  const [auctionTeams, setAuctionTeams] = useState([]);
  const [unsoldPlayers, setUnsoldPlayers] = useState([]);
  const [showSquads, setShowSquads] = useState(false);
  const [selectedSquadTeam, setSelectedSquadTeam] = useState(null);
  const currentPlayer = players[playerIndex];

  const [lastBidder, setLastBidder] = useState(null);
  console.log(aiTeams);

  const createAuctionLimits = (player) => {
    const limits = {};

    auctionTeams.forEach((team) => {
      const randomFactor = 0.8 + Math.random() * 0.6;

      limits[team.name] = Number(
        ((player.rating / 100) * 20 * randomFactor).toFixed(1),
      );
    });
    return limits;
  };

  useEffect(() => {
    if (selectedTeam) {
      const remainingTeams = aiTeams.filter(
        (team) => team.name !== selectedTeam.name,
      );

      setAuctionTeams(remainingTeams);
    }
  }, [selectedTeam]);

  useEffect(() => {
    if (currentPlayer && auctionTeams.length > 0) {
      setTeamLimits(createAuctionLimits(currentPlayer));
    }
  }, [playerIndex, auctionTeams]);

  const placeBid = () => {
    if (leadingTeam === "Base Price") {
      setLeadingTeam(selectedTeam.name);
      setLastBidder(selectedTeam.name);
      return;
    }

    setCurrentBid((prev) => +(prev + 0.2).toFixed(1));
    setLeadingTeam(selectedTeam?.name);
    setLastBidder(selectedTeam?.name);
  };

  const aiBid = () => {
    const availableTeams = auctionTeams.filter(
      (team) => team.name !== lastBidder,
    );

    if (availableTeams.length === 0) {
      return;
    }

    const randomTeam =
      availableTeams[Math.floor(Math.random() * availableTeams.length)];

    const nextBid =
      leadingTeam === "Base Price"
        ? currentBid
        : +(currentBid + 0.2).toFixed(1);

    const maxBid = teamLimits[randomTeam.name];

    if (nextBid <= maxBid) {
      setCurrentBid(nextBid);

      setLeadingTeam(randomTeam.name);

      setLastBidder(randomTeam.name);
    }
  };
  const nextPlayer = () => {
    if (playerIndex < players.length - 1) {
      const nextIndex = playerIndex + 1;

      setPlayerIndex(nextIndex);

      setCurrentBid(players[nextIndex].basePrice);
      setLeadingTeam("Base Price");
      setLastBidder(null);
    } else {
      alert("Auction Completed!");
    }
  };

  const sellPlayer = () => {
    if (leadingTeam === "Base Price") {
      alert(`${currentPlayer.name} goes UNSOLD`);

      setUnsoldPlayers((prev) => [...prev, currentPlayer]);

      nextPlayer();
      return;
    }
    if (leadingTeam === selectedTeam?.name) {
      if (purse < currentBid) {
        alert("Not enough purse!");
        return;
      }

      setPurse((prev) => +(prev - currentBid).toFixed(1));

      setSquad((prev) => [
        ...prev,
        {
          ...currentPlayer,
          soldPrice: currentBid,
        },
      ]);
    } else {
      setAuctionTeams((prev) =>
        prev.map((team) => {
          console.log("TEAM OBJECT", team);

          if (team.name === leadingTeam) {
            return {
              ...team,

              purse: team.purse - currentBid,

              squad: [
                ...(team.squad || []),
                {
                  ...currentPlayer,
                  soldPrice: currentBid,
                },
              ],
            };
          }

          return team;
        }),
      );
    }
    nextPlayer();
  };
  const allTeams = [
    {
      id: 999,
      name: selectedTeam?.name,
      purse,
      squad,
    },
    ...auctionTeams,
  ];

  if (!currentPlayer) {
    return (
      <div>
        <h1>Auction Completed</h1>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      <h1>IPL Auction Room</h1>

      <hr />

      <h3>Team: {selectedTeam?.name || "No Team Selected"}</h3>

      <h3>Purse Remaining: ₹{purse} Cr</h3>

      <button
        onClick={() => setShowSquads(!showSquads)}
        style={{
          marginBottom: "15px",
        }}
      >
        {showSquads ? "Hide Squads" : "View Squads"}
      </button>

      <hr />

      <h2>{currentPlayer.name}</h2>

      <p>
        <strong>Role:</strong> {currentPlayer.role}
      </p>

      <p>
        <strong>Rating:</strong> {currentPlayer.rating}
      </p>

      <p>
        <strong>Base Price:</strong> ₹{currentPlayer.basePrice} Cr
      </p>

      <h2>Current Bid: ₹{currentBid} Cr</h2>
      <h3>Leading Bidder: {leadingTeam}</h3>
      <hr />

      <h3>AI Limits</h3>

      <ul>
        {Object.entries(teamLimits).map(([team, limit]) => (
          <li key={team}>
            {team}: ₹{limit} Cr
          </li>
        ))}
      </ul>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <button onClick={placeBid}>Bid + ₹0.2 Cr</button>
        <button onClick={aiBid}>AI Bid</button>

        <button onClick={sellPlayer}>Sell Player</button>
        <button onClick={nextPlayer}>Skip Player</button>
      </div>

      <hr />

      <h2>My Squad</h2>

      {squad.length === 0 ? (
        <p>No players purchased yet.</p>
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
        <div key={team.id}>
          <p>
            {team.name}
            {" | "}
            Purse: ₹{team.purse}
            {" | "}
            Players: {team.squad?.length || 0}
          </p>
        </div>
      ))}

      {showSquads && (
        <div
          style={{
            border: "1px solid #444",
            padding: "20px",
            marginTop: "20px",
            borderRadius: "8px",
          }}
        >
          <h2>Squad Viewer</h2>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}
          >
            {allTeams.map((team) => (
              <button
                key={team.name}
                onClick={() => setSelectedSquadTeam(team)}
              >
                {team.name}
              </button>
            ))}
          </div>

          {selectedSquadTeam && (
            <>
              <h3>{selectedSquadTeam.name}</h3>

              <p>Purse Remaining: ₹{selectedSquadTeam.purse}</p>

              <p>
                Slots Filled:
                {selectedSquadTeam.squad?.length || 0}
              </p>

              <h4>Squad</h4>

              {(selectedSquadTeam.squad?.length || 0) === 0 ? (
                <p>No players yet.</p>
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
      )}
      <p>
        Player {playerIndex + 1} of {players.length}
      </p>
    </div>
  );
}

export default AuctionRoom;

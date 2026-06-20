import { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { players } from "../data/players";
import { AuctionContext } from "../context/AuctionContext";
import { aiTeams } from "../data/aiTeams";

function AuctionRoom() {
  const {
    selectedTeam,

    purse,
    setPurse,

    squad,
    setSquad,

    playerIndex,
    setPlayerIndex,

    currentBid,
    setCurrentBid,

    leadingTeam,
    setLeadingTeam,

    auctionTeams,
    setAuctionTeams,

    unsoldPlayers,
    setUnsoldPlayers,
  } = useContext(AuctionContext);

  const [teamLimits, setTeamLimits] = useState({});
  const currentPlayer = players[playerIndex];
  const navigate = useNavigate();

  const [isAiThinking, setIsAiThinking] = useState(false);
  const auctionRunningRef = useRef(false);

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

  useEffect(() => {
    if (currentPlayer && currentBid === 0) {
      setCurrentBid(currentPlayer.basePrice);
    }
  }, [currentPlayer]);

  const placeBid = () => {
    if (purse < currentBid + 0.2) {
      alert("You don't have enough purse for the next bid!");
      return;
    }
    if (leadingTeam === "Base Price") {
      setLeadingTeam(selectedTeam.name);

      autoAiBid(currentBid, selectedTeam.name);

      return;
    }

    const newBid = +(currentBid + 0.2).toFixed(1);

    setCurrentBid(newBid);

    setLeadingTeam(selectedTeam.name);

    autoAiBid(newBid, selectedTeam.name);
  };

  const aiBid = (bid, leader) => {
    const eligibleTeams = auctionTeams.filter((team) => {
      const maxBid = teamLimits[team.name];

      return (
        team.name !== leader &&
        team.purse >= bid + 0.2 &&
        (team.squad?.length || 0) < 25 &&
        maxBid >= bid + 0.2
      );
    });

    if (eligibleTeams.length === 0) {
      return false;
    }
    const sortedTeams = [...eligibleTeams].sort(
      (a, b) => teamLimits[b.name] - teamLimits[a.name],
    );

    const randomTeam =
      Math.random() < 0.7
        ? sortedTeams[0]
        : eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];

    const maxBid = teamLimits[randomTeam.name];
    console.log("AI:", randomTeam.name, "Current:", bid, "Limit:", maxBid);

    const newBid = +(bid + 0.2).toFixed(1);

    setCurrentBid(newBid);

    setLeadingTeam(randomTeam.name);

    return {
      bid: newBid,
      leader: randomTeam.name,
    };
  };

  const autoAiBid = (startingBid, startingLeader) => {
    if (auctionRunningRef.current) return;

    auctionRunningRef.current = true;
    setIsAiThinking(true);

    const aiBids =
      Math.random() < 0.8
        ? Math.floor(Math.random() * 4) + 1
        : Math.floor(Math.random() * 6) + 5;
    let count = 0;
    let localBid = startingBid;
    let localLeader = startingLeader;

    const interval = setInterval(() => {
      const result = aiBid(localBid, localLeader);

      if (!result) {
        clearInterval(interval);
        auctionRunningRef.current = false;
        setIsAiThinking(false);
        return;
      }

      localBid = result.bid;
      localLeader = result.leader;

      count++;

      if (count >= aiBids) {
        clearInterval(interval);
        auctionRunningRef.current = false;
        setIsAiThinking(false);
      }
    }, 1000);
  };

  const nextPlayer = () => {
    if (playerIndex < 3) {
      const nextIndex = playerIndex + 1;

      setPlayerIndex(nextIndex);

      setCurrentBid(players[nextIndex].basePrice);
      setLeadingTeam("Base Price");
      setTimeout(() => {
        const shouldAiStart = Math.random() < 0.7;
        if (shouldAiStart) {
          autoAiBid(players[nextIndex].basePrice, "Base Price");
        }
      }, 1000);
    } else {
      navigate("/summary");
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
      if (squad.length >= 25) {
        alert("Squad is full!");
        return;
      }
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
        onClick={() => navigate("/squads")}
        style={{
          marginBottom: "15px",
        }}
      >
        View Squads
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
      <p>
        Debug: {currentBid} | Leader: {leadingTeam}
      </p>
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
        <button
          onClick={placeBid}
          disabled={
            isAiThinking ||
            leadingTeam === selectedTeam?.name ||
            purse < currentBid + 0.2
          }
        >
          {isAiThinking
            ? "AI Thinking..."
            : purse < currentBid + 0.2
              ? "Insufficient Purse"
              : leadingTeam === selectedTeam?.name
                ? "You Are Leading"
                : "Bid + ₹0.2 Cr"}
        </button>{" "}
        <button disabled>AI Auto Bidding Enabled</button>
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
      <p>
        Player {playerIndex + 1} of {players.length}
      </p>
    </div>
  );
}

export default AuctionRoom;

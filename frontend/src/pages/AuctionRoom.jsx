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

    setHistory,
    setSetHistory,

    auctionInitialized,
    setAuctionInitialized,

    auctionQueue,
    setAuctionQueue,
  } = useContext(AuctionContext);

  const [teamLimits, setTeamLimits] = useState({});
  const auctionTimerRef = useRef(null);

  const officialAuctionOrder = [
    "Marquee-1",
    "Batter-1",
    "Allrounder-1",
    "Wicket Keeper-1",
    "Fast Bowler-1",
    "Spinner-1",

    "Uncapped Batter-1",
    "Uncapped Allrounder-1",
    "Uncapped Wicket Keeper-1",
    "Uncapped Fast Bowler-1",
    "Uncapped Spinner-1",

    "Batter-2",
    "Allrounder-2",
    "Wicket Keeper-2",
    "Fast Bowler-2",

    "Uncapped Batter-2",
    "Uncapped Allrounder-2",
    "Uncapped Wicket Keeper-2",
    "Uncapped Fast Bowler-2",
    "Uncapped Spinner-2",

    "Allrounder-3",
    "Fast Bowler-3",

    "Allrounder-4",
    "Fast Bowler-4",

    "Uncapped Batter-3",
    "Uncapped Allrounder-3",
    "Uncapped Fast Bowler-3",
    "Uncapped Spinner-3",

    "Uncapped Batter-4",
    "Uncapped Allrounder-4",
    "Uncapped Fast Bowler-4",

    "Uncapped Allrounder-5",
    "Uncapped Fast Bowler-5",
  ];

  const shuffle = (array) => {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  };

  const buildAuctionQueue = () => {
    const auctionPlayers = players.filter((player) => !player.retained);

    const queue = [];

    officialAuctionOrder.forEach((setName) => {
      const setPlayers = auctionPlayers.filter(
        (player) => player.set === setName,
      );

      queue.push(...shuffle(setPlayers));
    });

    return queue;
  };

  const [auctionStatus, setAuctionStatus] = useState("Waiting For Bid");
  const [userTimer, setUserTimer] = useState(null);

  const currentPlayer = auctionQueue[playerIndex];
  const navigate = useNavigate();

  const [isAiThinking, setIsAiThinking] = useState(false);
  const auctionRunningRef = useRef(false);

  const getOverseasCount = (team) => {
    return (team.squad || []).filter((player) => player.nation === "Foreigner")
      .length;
  };

  const getRoleCount = (team, role) => {
    return (team.squad || []).filter((player) => player.role === role).length;
  };

  const createAuctionLimits = (player) => {
    const limits = {};
    auctionTeams.forEach((team) => {
      let limit = Math.pow(player.rating / 100, 3) * 15;

      // Superstar premium
      if (player.rating >= 90) {
        limit *= 1.4;
      }

      if (player.rating >= 95) {
        limit *= 1.25;
      }

      // Team aggression
      limit *= team.aggression;

      // role need
      const currentRoleCount = getRoleCount(team, player.role);

      const requiredRoleCount = team.requirements[player.role];

      const overseasCount = getOverseasCount(team);

      if (player.nation === "Foreigner" && overseasCount >= 8) {
        limits[team.name] = 0;
        return;
      }

      if (currentRoleCount < requiredRoleCount) {
        limit *= 1.35;
      } else {
        limit *= 0.8;
      }
      limit *= 0.9 + Math.random() * 0.2;
      if (player.nation === "Foreigner" && overseasCount >= 8) {
        limits[team.name] = 0;
        return;
      }
      if (team.purse < 30) {
        limit *= 0.9;
      }

      if (team.purse < 15) {
        limit *= 0.75;
      }
      limit = Math.min(limit, team.purse);
      limits[team.name] = Number(limit.toFixed(1));
    });

    return limits;
  };
  useEffect(() => {
    if (selectedTeam && !auctionInitialized) {
      console.log("INITIALIZING AUCTION");
      const remainingTeams = aiTeams
        .filter((team) => team.name !== selectedTeam.name)
        .map((team) => {
          const retainedPlayers = players.filter(
            (player) => player.retained && player.team === team.name,
          );

          const retainedCost = retainedPlayers.reduce(
            (sum, player) => sum + player.soldPrice,
            0,
          );

          return {
            ...team,
            purse: +(120 - retainedCost).toFixed(1),
            squad: retainedPlayers,
          };
        });
      setAuctionQueue(buildAuctionQueue());
      setAuctionTeams(remainingTeams);

      const retainedPlayers = players.filter(
        (player) => player.retained && player.team === selectedTeam.name,
      );

      const retainedCost = retainedPlayers.reduce(
        (sum, player) => sum + player.soldPrice,
        0,
      );

      setSquad(retainedPlayers);

      setPurse(+(120 - retainedCost).toFixed(1));
      setAuctionInitialized(true);
    }
  }, [selectedTeam, auctionInitialized]);

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

  useEffect(() => {
    if (userTimer === null) return;
    clearTimeout(auctionTimerRef.current);
    if (userTimer === 0) {
      setAuctionStatus("GOING ONCE");

      auctionTimerRef.current = setTimeout(() => {
        setAuctionStatus("GOING TWICE");

        setTimeout(() => {
          setAuctionStatus("GOING THRICE");

          setTimeout(() => {
            setAuctionStatus(
              leadingTeam === "Base Price"
                ? "UNSOLD"
                : `SOLD TO ${leadingTeam} FOR ₹${currentBid} Cr`,
            );

            setTimeout(() => {
              sellPlayer();
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);

      setUserTimer(null);
      return;
    }

    const timer = setTimeout(() => {
      setUserTimer((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [userTimer, leadingTeam, currentBid]);

  const getBidIncrement = (bid) => {
    if (bid < 1) {
      return 0.1;
    }

    if (bid < 13) {
      return 0.2;
    }

    return 0.25;
  };

  const placeBid = () => {
    if (purse < currentBid + getBidIncrement(currentBid)) {
      alert("You don't have enough purse for the next bid!");
      return;
    }
    if (leadingTeam === "Base Price") {
      setLeadingTeam(selectedTeam.name);

      autoAiBid(currentBid, selectedTeam.name);

      return;
    }
    const increment = getBidIncrement(currentBid);

    const newBid = +(currentBid + increment).toFixed(2);

    setCurrentBid(newBid);

    setLeadingTeam(selectedTeam.name);

    autoAiBid(newBid, selectedTeam.name);
  };

  const aiBid = (bid, leader) => {
    const eligibleTeams = auctionTeams.filter((team) => {
      const maxBid = teamLimits[team.name];

      return (
        team.name !== leader &&
        team.purse >= bid + getBidIncrement(bid) &&
        (team.squad?.length || 0) < 25 &&
        maxBid >= bid + getBidIncrement(bid)
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

    const increment = getBidIncrement(bid);

    const newBid = +(bid + increment).toFixed(2);

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
        setUserTimer(12);
        setAuctionStatus("Waiting for your Bid");
        return;
      }

      localBid = result.bid;
      localLeader = result.leader;

      count++;

      if (count >= aiBids) {
        clearInterval(interval);
        auctionRunningRef.current = false;
        setIsAiThinking(false);

        setUserTimer(12);
        setAuctionStatus("Your Turn To Bid");
      }
    }, 1000);
  };

  const nextPlayer = () => {
    clearTimeout(auctionTimerRef.current);
    setUserTimer(null);
    setAuctionStatus("Waiting For Bid");
    if (playerIndex < auctionQueue.length - 1) {
      const nextIndex = playerIndex + 1;

      setPlayerIndex(nextIndex);

      setCurrentBid(auctionQueue[nextIndex].basePrice);
      setLeadingTeam("Base Price");
      setTimeout(() => {
        const shouldAiStart = Math.random() < 0.7;
        if (shouldAiStart) {
          autoAiBid(auctionQueue[nextIndex].basePrice, "Base Price");
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
      setSetHistory((prev) => ({
        ...prev,
        [currentPlayer.set]: [
          ...(prev[currentPlayer.set] || []),
          {
            player: currentPlayer.name,
            team: leadingTeam,
            price: currentBid,
          },
        ],
      }));
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
    setSetHistory((prev) => ({
      ...prev,
      [currentPlayer.set]: [
        ...(prev[currentPlayer.set] || []),
        {
          player: currentPlayer.name,
          team: leadingTeam,
          price: currentBid,
        },
      ],
    }));
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

      <button onClick={() => navigate("/sets")}>View Sets</button>

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
      <h3>{auctionStatus}</h3>
      {userTimer !== null && <h2>⏳ {userTimer}s</h2>}

      <h3>Leading Bidder: {leadingTeam}</h3>
      <hr />

      <h3>Team Valuations</h3>

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
            purse < currentBid + getBidIncrement(currentBid)
          }
        >
          {isAiThinking
            ? "AI Thinking..."
            : purse < currentBid + getBidIncrement(currentBid)
              ? "Insufficient Purse"
              : leadingTeam === selectedTeam?.name
                ? "You Are Leading"
                : `Bid + ₹${getBidIncrement(currentBid)} Cr`}
        </button>{" "}
        <button disabled>AI Auto Bidding Enabled</button>
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
        Player {playerIndex + 1} of {auctionQueue.length}
      </p>
    </div>
  );
}

export default AuctionRoom;

import { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { players } from "../data/players";
import { AuctionContext } from "../context/AuctionContext";
import { aiTeams } from "../data/aiTeams";

import "./AuctionRoom.css";
import AuctionHeader from "../components/auction/AuctionHeader";
import PlayerPanel from "../components/auction/PlayerPanel";
import BidControls from "../components/auction/BidControls";
import TeamSidebar from "../components/auction/TeamSidebar";

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
      <div className="auction-page">
        <AuctionHeader
          onViewSquads={() => navigate("/squads")}
          onViewSets={() => navigate("/sets")}
        />

        <div className="empty-state">
          <h1>Auction Completed</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="auction-page">
      <AuctionHeader
        onViewSquads={() => navigate("/squads")}
        onViewSets={() => navigate("/sets")}
      />

      <div className="auction-content">
        <TeamSidebar
          selectedTeam={selectedTeam}
          purse={purse}
          squad={squad}
          auctionTeams={auctionTeams}
          leadingTeam={leadingTeam}
        />

        <div className="auction-main">
          <PlayerPanel
            currentPlayer={currentPlayer}
            currentBid={currentBid}
            leadingTeam={leadingTeam}
            auctionStatus={auctionStatus}
            userTimer={userTimer}
          />
        </div>

        <div className="auction-right">
          <div className="status-card">
            <div className="status-header">Auction Status</div>

            <div
              className={`timer-circle ${userTimer !== null ? "active" : "inactive"}`}
            >
              <div
                className="circular-timer"
                style={{
                  "--progress": `${userTimer !== null ? (userTimer / 12) * 360 : 0}deg`,
                }}
              >
                <div className="timer-content">
                  <div className="timer-seconds">
                    {userTimer !== null ? userTimer : 12}
                  </div>
                  <div className="timer-label">
                    {userTimer !== null ? "SECONDS" : "IDLE"}
                  </div>
                </div>
              </div>
            </div>

            <div className="status-row">
              <span>Leading bidder</span>
              <strong>{leadingTeam}</strong>
            </div>
            <div className="status-row">
              <span>Bid turn</span>
              <strong>
                {playerIndex + 1} / {auctionQueue.length}
              </strong>
            </div>
            <div className="status-row">
              <span>Current state</span>
              <strong>{auctionStatus}</strong>
            </div>
            <div className="status-row">
              <span>Next increment</span>
              <strong>₹{getBidIncrement(currentBid).toFixed(2)} Cr</strong>
            </div>
          </div>

          <BidControls
            onBid={placeBid}
            onSkip={nextPlayer}
            isAiThinking={isAiThinking}
            leadingTeam={leadingTeam}
            selectedTeam={selectedTeam}
            purse={purse}
            currentBid={currentBid}
            bidIncrement={getBidIncrement(currentBid)}
          />
        </div>

        <div className="auction-squad-row">
          <div className="my-squad-panel">
            <div className="panel-title">My Squad</div>
            <div className="squad-list">
              {squad.length === 0 ? (
                <span className="squad-empty">No players yet</span>
              ) : (
                squad.map((player) => (
                  <span key={player.id} className="squad-chip">
                    {player.name}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="remaining-panel">
            <div className="panel-title">Remaining</div>
            <div className="remaining-value">₹{purse.toFixed(1)} Cr</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuctionRoom;

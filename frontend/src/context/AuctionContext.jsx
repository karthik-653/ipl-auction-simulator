import { createContext, useRef, useState } from "react";
import { players } from "../data/players";

export const AuctionContext = createContext();

export const AuctionProvider = ({ children }) => {
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [purse, setPurse] = useState(120);

  const [squad, setSquad] = useState([]);

  const [retentions, setRetentions] = useState([]);

  const [playerIndex, setPlayerIndex] = useState(0);

  const [currentBid, setCurrentBid] = useState(0);

  const [leadingTeam, setLeadingTeam] = useState("Base Price");

  const [auctionTeams, setAuctionTeams] = useState([]);
  const [auctionInitialized, setAuctionInitialized] = useState(false);
  const [auctionQueue, setAuctionQueue] = useState([]);

  const [unsoldPlayers, setUnsoldPlayers] = useState([]);
  const [setHistory, setSetHistory] = useState({});
  const [isSkippingSet, setIsSkippingSet] = useState(false);
  const [pendingSetAdvance, setPendingSetAdvance] = useState(null);
  const skippingSetRef = useRef(false);

  const getBidIncrement = (bid) => {
    if (bid < 1) {
      return 0.1;
    }

    if (bid < 13) {
      return 0.2;
    }

    return 0.25;
  };

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
      let limit = Math.pow(player.rating / 100, 3.8) * 13;

      if (player.rating >= 90) {
        limit *= 1.4;
      }

      if (player.rating >= 95) {
        limit *= 1.25;
      }

      limit *= team.aggression;

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

      if (team.purse < 30) {
        limit *= 0.9;
      }

      if (team.purse < 15) {
        limit *= 0.75;
      }

      const currentPlayers = team.squad?.length || 0;
      const remainingSlots = team.targetSquadSize - currentPlayers;

      let reservePerPlayer;

      if (remainingSlots > 10) {
        reservePerPlayer = 0.8;
      } else if (remainingSlots > 5) {
        reservePerPlayer = 0.6;
      } else {
        reservePerPlayer = 0.4;
      }

      const reservePurse = remainingSlots * reservePerPlayer;
      const emergencyReserve = remainingSlots > 2 ? 3 : 1;
      const spendablePurse = Math.max(
        0,
        team.purse - reservePurse - emergencyReserve,
      );

      limit = Math.min(limit, spendablePurse);
      limits[team.name] = Number(limit.toFixed(1));
    });

    return limits;
  };

  const aiBid = (player, bid, leader, limits) => {
    const eligibleTeams = auctionTeams.filter((team) => {
      const interest =
        player.rating >= 90
          ? 1
          : player.rating >= 85
            ? 0.95
            : player.rating >= 80
              ? 0.85
              : player.rating >= 75
                ? 0.7
                : player.rating >= 70
                  ? 0.55
                  : player.rating >= 65
                    ? 0.4
                    : player.rating >= 60
                      ? 0.25
                      : 0.12;

      if (Math.random() > interest) return false;

      const maxBid = limits[team.name];
      const currentPlayers = team.squad?.length || 0;
      const remainingSlots = team.targetSquadSize - currentPlayers;
      const reservePerPlayer =
        remainingSlots > 10 ? 0.8 : remainingSlots > 5 ? 0.6 : 0.4;
      const reservePurse = remainingSlots * reservePerPlayer;
      const emergencyReserve = remainingSlots > 2 ? 3 : 1;
      const spendablePurse = team.purse - reservePurse - emergencyReserve;

      return (
        team.name !== leader &&
        currentPlayers < team.targetSquadSize &&
        spendablePurse >= bid + getBidIncrement(bid) &&
        maxBid >= bid + getBidIncrement(bid)
      );
    });

    if (!eligibleTeams.length) return null;

    const sorted = [...eligibleTeams].sort(
      (a, b) => limits[b.name] - limits[a.name],
    );

    const winner =
      Math.random() < 0.7
        ? sorted[0]
        : eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];

    const newBid = +(bid + getBidIncrement(bid)).toFixed(2);

    return {
      bid: newBid,
      leader: winner.name,
    };
  };

  const finalizeResolvedPlayer = (player, leader, bid) => {
    if (leader === "Base Price") {
      setUnsoldPlayers((prev) => [...prev, player]);
      setSetHistory((prev) => ({
        ...prev,
        [player.set]: [
          ...(prev[player.set] || []),
          {
            player: player.name,
            team: leader,
            price: bid,
          },
        ],
      }));
      return;
    }

    if (leader === selectedTeam?.name) {
      setPurse((prev) => +(prev - bid).toFixed(1));
      setSquad((prev) => [
        ...prev,
        {
          ...player,
          soldPrice: bid,
        },
      ]);
    } else {
      const targetTeam = auctionTeams.find((team) => team.name === leader);
      if (targetTeam) {
        setAuctionTeams((prev) =>
          prev.map((team) => {
            if (team.name === leader) {
              return {
                ...team,
                purse: +(team.purse - bid).toFixed(1),
                squad: [
                  ...(team.squad || []),
                  {
                    ...player,
                    soldPrice: bid,
                  },
                ],
              };
            }

            return team;
          }),
        );
      }
    }

    setSetHistory((prev) => ({
      ...prev,
      [player.set]: [
        ...(prev[player.set] || []),
        {
          player: player.name,
          team: leader,
          price: bid,
        },
      ],
    }));
  };

  const moveToNextSet = (navigateFn) => {
    if (!pendingSetAdvance) return;

    const nextIndex = pendingSetAdvance.nextPlayerIndex;

    if (nextIndex >= 0 && nextIndex < auctionQueue.length) {
      const nextPlayer = auctionQueue[nextIndex];
      setPlayerIndex(nextIndex);
      setCurrentBid(nextPlayer?.basePrice ?? 0);
      setLeadingTeam("Base Price");
    }

    setPendingSetAdvance(null);

    if (navigateFn) {
      navigateFn("/auction");
    }
  };

  const resolveSetWithAi = (setName) => {
    if (!setName || skippingSetRef.current) return;

    setPendingSetAdvance(null);

    const pendingPlayers = auctionQueue.filter((player) => {
      if (player.set !== setName) return false;
      return !(setHistory[setName] || []).some(
        (entry) => entry.player === player.name,
      );
    });

    if (!pendingPlayers.length) return;

    skippingSetRef.current = true;
    setIsSkippingSet(true);

    const processNextPlayer = (index) => {
      if (index >= pendingPlayers.length) {
        const setIndices = auctionQueue
          .map((player, queueIndex) =>
            player.set === setName ? queueIndex : -1,
          )
          .filter((queueIndex) => queueIndex >= 0);
        const lastSetIndex = setIndices.length ? Math.max(...setIndices) : -1;
        const nextPlayerIndex = auctionQueue.findIndex(
          (player, queueIndex) =>
            queueIndex > lastSetIndex && player.set !== setName,
        );

        setPendingSetAdvance({
          completedSetName: setName,
          nextPlayerIndex:
            nextPlayerIndex >= 0 ? nextPlayerIndex : Math.max(playerIndex, 0),
        });
        skippingSetRef.current = false;
        setIsSkippingSet(false);
        return;
      }

      const nextPlayer = pendingPlayers[index];
      const queueIndex = auctionQueue.findIndex(
        (player) => player.id === nextPlayer.id,
      );

      setPlayerIndex(queueIndex >= 0 ? queueIndex : 0);
      setCurrentBid(nextPlayer.basePrice);
      setLeadingTeam("Base Price");

      const limits = createAuctionLimits(nextPlayer);

      const runAiBids = (bid, leader) => {
        window.setTimeout(() => {
          const result = aiBid(nextPlayer, bid, leader, limits);

          if (!result) {
            finalizeResolvedPlayer(nextPlayer, leader, bid);
            window.setTimeout(() => processNextPlayer(index + 1), 80);
            return;
          }

          runAiBids(result.bid, result.leader);
        }, 40);
      };

      window.setTimeout(
        () => runAiBids(nextPlayer.basePrice, "Base Price"),
        40,
      );
    };

    processNextPlayer(0);
  };

  return (
    <AuctionContext.Provider
      value={{
        selectedTeam,
        setSelectedTeam,

        purse,
        setPurse,

        squad,
        setSquad,

        retentions,
        setRetentions,

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

        resolveSetWithAi,
        moveToNextSet,
        isSkippingSet,
        pendingSetAdvance,
      }}
    >
      {children}
    </AuctionContext.Provider>
  );
};

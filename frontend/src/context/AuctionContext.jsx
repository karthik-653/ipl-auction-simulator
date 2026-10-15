import { createContext, useEffect, useRef, useState } from "react";
import { players } from "../data/players";
import { aiTeams } from "../data/aiTeams";
import {
  buildAiTeams,
  buildAuctionQueue,
  buildUserTeamState,
  getEffectivePlayers,
} from "../logic/auctionLogic";
import {
  createIntel,
  marketContext,
  rebuildIntel,
  runAiOnlyAuction,
} from "../logic/auctionEngine";
import { deserializeGame, serializeGame } from "../save/gameState";
import { createPauseController } from "../logic/pause";
import { isAuctionComplete } from "../logic/lineup";
import { installDebugHelpers, isDebug, keepRound } from "../logic/diagnostics";

export const AuctionContext = createContext();

installDebugHelpers();

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
  // Recorded bidding of each completed auction (shown on /math).
  const [roundLog, setRoundLog] = useState([]);
  const [isSkippingSet, setIsSkippingSet] = useState(false);
  const [pendingSetAdvance, setPendingSetAdvance] = useState(null);
  const skippingSetRef = useRef(false);

  // Effective dataset for this auction (retention applied). Single source of
  // truth for the queue, squads, sets screens and statistics.
  const [effectivePlayers, setEffectivePlayers] = useState([]);

  // Synchronous mirrors so timers/loops never read stale React state.
  const teamsRef = useRef([]);
  // The live bidding round (owned by AuctionRoom, kept here so it survives
  // navigation and can be saved/restored).
  const roundRef = useRef(null);
  // What the franchises have actually done in this auction (Delhi reads it to
  // estimate rivals). Rebuilt from the saved round log on resume.
  const intelRef = useRef(createIntel());
  // Pausing while a squad is inspected: holds (by reason) + the suspended lot
  // (clock etc.). Neither is ever saved: a pause is temporary by design.
  const pauseRef = useRef(createPauseController());
  const suspendedRef = useRef(null);
  const stateRef = useRef({});
  const changeListenerRef = useRef(null);
  const resolvedRef = useRef(new Set());


  // Latest committed values for snapshots; notify the save layer on change.
  useEffect(() => {
    stateRef.current = {
      selectedTeam, retentions, auctionInitialized, purse, squad,
      auctionTeams, auctionQueue, playerIndex, currentBid, leadingTeam,
      unsoldPlayers, setHistory, roundLog, pendingSetAdvance,
    };
    changeListenerRef.current?.();
  }, [
    selectedTeam, retentions, auctionInitialized, purse, squad,
    auctionTeams, auctionQueue, playerIndex, currentBid, leadingTeam,
    unsoldPlayers, setHistory, roundLog, pendingSetAdvance,
  ]);

  const exportGame = () =>
    serializeGame({
      ...stateRef.current,
      resolvedIds: [...resolvedRef.current],
      round: roundRef.current,
    });

  /** Replace all game state with a validated snapshot (no timers restored). */
  const importGame = (game) => {
    const s = deserializeGame(game, { players, aiTeams });
    pauseRef.current.clear();
    suspendedRef.current = null;
    resolvedRef.current = new Set(s.resolvedIds);
    intelRef.current = rebuildIntel(s.roundLog);
    teamsRef.current = s.auctionTeams;
    roundRef.current = s.round;
    setSelectedTeam(s.selectedTeam);
    setRetentions(s.retentions);
    setAuctionInitialized(s.auctionInitialized);
    setEffectivePlayers(s.effectivePlayers);
    setPurse(s.purse);
    setSquad(s.squad);
    setAuctionTeams(s.auctionTeams);
    setAuctionQueue(s.auctionQueue);
    setPlayerIndex(s.playerIndex);
    setCurrentBid(s.currentBid);
    setLeadingTeam(s.leadingTeam);
    setUnsoldPlayers(s.unsoldPlayers);
    setSetHistory(s.setHistory);
    setRoundLog(s.roundLog);
    setPendingSetAdvance(s.pendingSetAdvance);
    setIsSkippingSet(false);
    skippingSetRef.current = false;
  };

  /** Clean slate for a brand-new game: nothing leaks from the old one. */
  const resetAll = () => {
    pauseRef.current.clear();
    suspendedRef.current = null;
    resolvedRef.current = new Set();
    intelRef.current = createIntel();
    teamsRef.current = [];
    roundRef.current = null;
    setSelectedTeam(null);
    setRetentions([]);
    setAuctionInitialized(false);
    setEffectivePlayers([]);
    setPurse(120);
    setSquad([]);
    setAuctionTeams([]);
    setAuctionQueue([]);
    setPlayerIndex(0);
    setCurrentBid(0);
    setLeadingTeam("Base Price");
    setUnsoldPlayers([]);
    setSetHistory({});
    setRoundLog([]);
    setPendingSetAdvance(null);
    setIsSkippingSet(false);
    skippingSetRef.current = false;
  };

  const updateTeams = (updater) => {
    const next = typeof updater === "function" ? updater(teamsRef.current) : updater;
    teamsRef.current = next;
    setAuctionTeams(next);
  };

  /**
   * Build everything for a new auction ONCE from the retention choices.
   * All derived pieces are computed from the same effective array and
   * committed together.
   */
  const initializeAuction = (team, retained) => {
    const effective = getEffectivePlayers(players, team.name, retained);
    const aiTeamsInit = buildAiTeams(effective, aiTeams, team.name);
    const userState = buildUserTeamState(effective, team.name);
    const queue = buildAuctionQueue(effective);

    pauseRef.current.clear();
    suspendedRef.current = null;
    resolvedRef.current = new Set();
    intelRef.current = createIntel();
    roundRef.current = null;
    updateTeams(aiTeamsInit);
    setEffectivePlayers(effective);
    setAuctionQueue(queue);
    setSquad(userState.squad);
    setPurse(userState.purse);
    setUnsoldPlayers([]);
    setSetHistory({});
    setRoundLog([]);
    setPlayerIndex(0);
    setCurrentBid(queue[0]?.basePrice ?? 0);
    setLeadingTeam("Base Price");
    setPendingSetAdvance(null);
    setAuctionInitialized(true);
  };

  const logRound = (round, source = "live") => {
    keepRound(round); // no-op unless debug diagnostics were collected for this round
    setRoundLog((prev) => [
      ...prev,
      {
        source,
        player: {
          id: round.player.id,
          name: round.player.name,
          role: round.player.role,
          rating: round.player.rating,
          basePrice: round.player.basePrice,
        },
        bids: round.bids.map((b) => ({ ...b })),
        teams: Object.fromEntries(
          Object.entries(round.teams).map(([name, t]) => [
            name,
            {
              ceiling: t.ceiling,
              limit: t.limit,
              strategy: t.strategy,
              value: t.value,
              budget: t.budget,
              tier: t.tier,
              need: t.need,
              aggression: t.aggression,
              state: t.state,
            },
          ]),
        ),
        result: { bid: round.bid, leader: round.leader },
        ...(round.pressureSummary ? { pressure: round.pressureSummary } : {}),
      },
    ]);
  };

  const isResolved = (playerId) => resolvedRef.current.has(playerId);

  const pushHistory = (player, team, price) =>
    setSetHistory((prev) => ({
      ...prev,
      [player.set]: [
        ...(prev[player.set] || []),
        { player: player.name, team, price },
      ],
    }));

  /** Record a sale exactly once. Returns false if already resolved/invalid. */
  const recordSale = (player, teamName, price) => {
    if (resolvedRef.current.has(player.id)) return false;
    resolvedRef.current.add(player.id);

    const sold = { ...player, soldPrice: price };
    if (teamName === selectedTeam?.name) {
      setPurse((prev) => +(prev - price).toFixed(1));
      setSquad((prev) => [...prev, sold]);
    } else {
      updateTeams((prev) =>
        prev.map((t) =>
          t.name === teamName
            ? {
                ...t,
                purse: +(t.purse - price).toFixed(1),
                squad: [...(t.squad || []), sold],
              }
            : t,
        ),
      );
    }
    pushHistory(player, teamName, price);
    return true;
  };

  /** Record an unsold player exactly once. */
  const recordUnsold = (player) => {
    if (resolvedRef.current.has(player.id)) return false;
    resolvedRef.current.add(player.id);
    setUnsoldPlayers((prev) => [...prev, player]);
    pushHistory(player, "Base Price", player.basePrice);
    return true;
  };

  const moveToNextSet = (navigateFn) => {
    if (!pendingSetAdvance) return;

    const nextIndex = pendingSetAdvance.nextPlayerIndex;

    if (nextIndex >= 0 && nextIndex < auctionQueue.length) {
      setPlayerIndex(nextIndex);
      setCurrentBid(auctionQueue[nextIndex].basePrice ?? 0);
      setLeadingTeam("Base Price");
    }

    setPendingSetAdvance(null);

    if (navigateFn) navigateFn("/auction");
  };

  // "Skip Set": resolve every unresolved player of the set with AI-only bidding.
  const resolveSetWithAi = (setName) => {
    if (!setName || skippingSetRef.current) return;

    setPendingSetAdvance(null);

    const pendingPlayers = auctionQueue.filter(
      (p) => p.set === setName && !resolvedRef.current.has(p.id),
    );

    skippingSetRef.current = true;
    setIsSkippingSet(true);

    try {
      pendingPlayers.forEach((player) => {
        // Teams plan against the WHOLE remaining pool (later sets too), not
        // just the rest of this set; resolvedRef is updated synchronously.
        const remaining = auctionQueue.filter(
          (p) => p.id !== player.id && !resolvedRef.current.has(p.id),
        );
        const ctx = { ...marketContext(remaining, intelRef.current), diagnostics: isDebug() };
        const { bid, leader, round } = runAiOnlyAuction(
          player,
          teamsRef.current,
          Math.random,
          ctx,
        );
        logRound(round, "skip-set");
        if (leader === "Base Price") recordUnsold(player);
        else recordSale(player, leader, bid);
      });

      const setIndices = auctionQueue
        .map((p, i) => (p.set === setName ? i : -1))
        .filter((i) => i >= 0);
      const lastSetIndex = setIndices.length ? Math.max(...setIndices) : -1;
      const nextPlayerIndex = auctionQueue.findIndex(
        (p, i) => i > lastSetIndex && p.set !== setName,
      );

      setPendingSetAdvance({
        completedSetName: setName,
        nextPlayerIndex:
          nextPlayerIndex >= 0 ? nextPlayerIndex : auctionQueue.length - 1,
      });
    } finally {
      skippingSetRef.current = false;
      setIsSkippingSet(false);
    }
  };

  // Complete = every queued lot ended up in a squad or the unsold list. Derived
  // from state (not a flag), so it is identical after a refresh / resume.
  const auctionComplete = isAuctionComplete({
    auctionInitialized,
    auctionQueue,
    resolvedIds: new Set([
      ...squad.map((p) => p.id),
      ...auctionTeams.flatMap((t) => (t.squad || []).map((p) => p.id)),
      ...unsoldPlayers.map((p) => p.id),
    ]),
  });

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
        setAuctionTeams: updateTeams,

        unsoldPlayers,
        setUnsoldPlayers,

        setHistory,
        setSetHistory,

        auctionInitialized,
        setAuctionInitialized,

        auctionQueue,
        setAuctionQueue,

        // derived from the resolved set, so it is identical after a refresh/resume
        auctionComplete,

        effectivePlayers,
        teamsRef,
        intelRef,
        initializeAuction,
        isResolved,
        roundRef,
        suspendedRef,
        pauseAuction: (reason) => pauseRef.current.pause(reason),
        resumeAuction: (reason) => pauseRef.current.resume(reason),
        isAuctionPaused: () => pauseRef.current.isPaused(),
        changeListenerRef,
        exportGame,
        importGame,
        resetAll,
        roundLog,
        logRound,
        recordSale,
        recordUnsold,
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

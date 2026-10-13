import { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuctionContext } from "../context/AuctionContext";
import { canUserBid, getBidIncrement } from "../logic/auctionLogic";
import {
  closeRound,
  createRound,
  marketContext,
  runResponseCycle,
  submitBid,
  withdrawHuman,
} from "../logic/auctionEngine";

import { nowMs } from "../logic/clock";
import { portraitUrl } from "../data/portraits";
import {
  holdSpeed, newClock, newSpeed, nextAction, onAccepted, onCycleFoundNone, onHammer,
  releaseSpeed, speedActive, windowInfo,
} from "../logic/pacing";

import "../components/auction/premium.css";
import AuctionHeader from "../components/auction/AuctionHeader";
import PlayerPanel from "../components/auction/PlayerPanel";
import BidControls from "../components/auction/BidControls";
import TeamSidebar from "../components/auction/TeamSidebar";
import AuctionStatus from "../components/auction/AuctionStatus";

const AI_OPENS_CHANCE = 0.9; // otherwise the AI lets the user open first

const leaderKindOf = (leader, userName) =>
  leader === "Base Price" ? "none" : leader === userName ? "user" : "ai";

function AuctionRoom() {
  const {
    selectedTeam,

    purse,
    squad,

    retentions,

    playerIndex,
    setPlayerIndex,

    currentBid,
    setCurrentBid,

    leadingTeam,
    setLeadingTeam,

    auctionTeams,

    setHistory,

    auctionInitialized,
    initializeAuction,
    effectivePlayers,
    teamsRef,
    isResolved,
    recordSale,
    recordUnsold,
    logRound,
    roundRef,

    auctionQueue,
  } = useContext(AuctionContext);

  const navigate = useNavigate();

  const [auctionStatus, setAuctionStatus] = useState("Waiting For Bid");
  // cosmetic mirror of the real response window (never drives auction logic)
  const [windowDisplay, setWindowDisplay] = useState(null);
  const [accelOn, setAccelOn] = useState(false);
  const [salePopup, setSalePopup] = useState(null);
  const [, setIsAiThinking] = useState(false);
  // "idle" | "user" | "ai" | "hammer" | "resolved"
  const [phase, setPhase] = useState("idle");
  const [userIn, setUserIn] = useState(true);

  const timersRef = useRef([]);
  // Authoritative live state of the player currently on the block. Timers and
  // loops read this instead of React state so they can never go stale.
  const liveRef = useRef({
    token: 0,
    playerId: null,
    index: 0,
    bid: 0,
    leader: "Base Price",
    userIn: true,
    player: null,
    clock: null,
    aiOpens: true,
    tickTimer: null,
    resolving: false,
    round: null,
  });

  const currentPlayer = auctionQueue[playerIndex];
  const currentSetPlayers = effectivePlayers.filter(
    (player) => !player.retained && player.set === currentPlayer?.set,
  );
  const completedInSet = currentPlayer
    ? (setHistory[currentPlayer.set] || []).length
    : 0;

  // ---- timer helpers -----------------------------------------------------
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // Schedules a callback that is silently dropped if the player changed.
  const later = (ms, fn) => {
    const token = liveRef.current.token;
    const id = setTimeout(() => {
      if (liveRef.current.token === token) fn();
    }, ms);
    timersRef.current.push(id);
  };

  const publishBid = (bid, leader) => {
    liveRef.current.bid = bid;
    liveRef.current.leader = leader;
    setCurrentBid(bid);
    setLeadingTeam(leader);
  };

  // ---- lifecycle: initialise once ---------------------------------------
  useEffect(() => {
    if (selectedTeam && !auctionInitialized) {
      initializeAuction(selectedTeam, retentions);
    }
  }, [selectedTeam, auctionInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- resolve / advance -------------------------------------------------
  const advance = () => {
    const live = liveRef.current;
    live.token += 1; // invalidate anything still pending for this player
    clearTimers();
    releaseAccel(); // never carry 2x into the next player
    setWindowDisplay(null);
    setSalePopup(null);
    setIsAiThinking(false);

    const nextIndex = live.index + 1;
    if (nextIndex < auctionQueue.length) {
      setCurrentBid(auctionQueue[nextIndex].basePrice);
      setLeadingTeam("Base Price");
      setPlayerIndex(nextIndex);
    } else {
      navigate("/summary");
    }
  };

  const resolveCurrent = () => {
    const live = liveRef.current;
    if (live.resolving) return;
    live.resolving = true;
    setPhase("resolved");
    setIsAiThinking(false);
    releaseAccel();
    setWindowDisplay(null);

    const player = live.player;
    const { bid, leader } = closeRound(live.round);
    logRound(live.round);

    if (leader === "Base Price") {
      recordUnsold(player);
      setAuctionStatus("UNSOLD");
      setSalePopup({ player: player.name, unsold: true });
    } else {
      const before =
        leader === selectedTeam.name
          ? purse
          : teamsRef.current.find((t) => t.name === leader)?.purse;
      recordSale(player, leader, bid);
      setAuctionStatus(`SOLD TO ${leader} FOR ₹${bid} Cr`);
      setSalePopup({
        player: player.name,
        teamName: leader,
        price: bid,
        remainingBudget: before == null ? null : +(before - bid).toFixed(1),
      });
    }

    later(2500, advance);
  };

  // ---- auction clock -----------------------------------------------------
  // One timer per player, driven by the pure scheduler in logic/pacing.js:
  // AI teams decide in "response cycles" paced at 250 ms (125 ms while 2x is
  // held); after an AI bid the user gets a 5.5 s window before the AI acts
  // again; when nobody challenges the hammer falls. Any accepted bid resets it.
  const speedRef = useRef(newSpeed());
  const accelBeat = useRef(null);
  const rescheduleRef = useRef(() => {});

  const refreshClock = () => {
    const live = liveRef.current;
    const c = live.clock;
    c.userIn = live.userIn;
    c.userCanBid = canUserBid({ name: selectedTeam?.name, purse, squad }, live.player, live.bid, live.leader);
    c.accelerated = speedActive(speedRef.current, nowMs());
  };

  const scheduleAt = (at) => {
    const live = liveRef.current;
    clearTimeout(live.tickTimer);
    const token = live.token;
    live.tickTimer = setTimeout(() => {
      if (liveRef.current.token === token) tick();
    }, Math.max(0, at - nowMs()));
    timersRef.current.push(live.tickTimer);
  };

  const reschedule = () => {
    const live = liveRef.current;
    if (!live.clock || live.resolving) return;
    refreshClock();
    scheduleAt(nextAction(live.clock).at);
  };

  const tick = () => {
    const live = liveRef.current;
    if (live.resolving) return;
    refreshClock();
    const c = live.clock;
    const a = nextAction(c);
    const now = nowMs();
    if (now < a.at) {
      scheduleAt(a.at); // woken early (e.g. a speed change): wait for the real time
      return;
    }

    if (a.type === "cycle") {
      // every non-withdrawn AI team decides afresh at the latest accepted bid
      const r = runResponseCycle(live.round);
      if (r) {
        publishBid(r.bid, r.leader);
        onAccepted(c, now, "ai");
        setPhase("bidding");
        setAuctionStatus(`${r.leader} bids ₹${r.bid} Cr`);
      } else {
        onCycleFoundNone(c, now);
      }
    } else if (a.type === "hammer") {
      onHammer(c, now);
      setPhase("hammer");
      setAuctionStatus(["GOING ONCE", "GOING TWICE", "GOING THRICE"][c.hammerStep - 1]);
    } else {
      resolveCurrent();
      return;
    }
    scheduleAt(nextAction(c).at);
  };

  // 2x: AI scheduling speed only. Hold = lease renewed by a heartbeat; if the
  // heartbeat stops (blur, crash, lost pointer) the lease expires by itself.
  const releaseAccel = () => {
    releaseSpeed(speedRef.current);
    clearInterval(accelBeat.current);
    accelBeat.current = null;
    setAccelOn(false);
  };
  const setAccel = (on) => {
    if (!on) {
      releaseAccel();
      rescheduleRef.current();
      return;
    }
    const live = liveRef.current;
    if (!live.clock || live.resolving) return;
    holdSpeed(speedRef.current, nowMs());
    setAccelOn(true);
    if (!accelBeat.current) {
      accelBeat.current = setInterval(() => holdSpeed(speedRef.current, nowMs()), 250);
    }
    rescheduleRef.current();
  };
  useEffect(() => {
    rescheduleRef.current = reschedule;
  });
  useEffect(() => {
    const off = () => {
      if (accelBeat.current) setAccel(false);
    };
    const onVis = () => document.hidden && off();
    window.addEventListener("blur", off);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", off);
      document.removeEventListener("visibilitychange", onVis);
      releaseSpeed(speedRef.current);
      clearInterval(accelBeat.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- begin each player's auction --------------------------------------
  useEffect(() => {
    if (!auctionInitialized || !currentPlayer) return;

    const live = liveRef.current;
    live.token += 1;
    clearTimers();
    live.player = currentPlayer;
    live.playerId = currentPlayer.id;
    live.index = playerIndex;
    live.resolving = false;
    live.userIn = true;
    setUserIn(true);
    setSalePopup(null);
    setIsAiThinking(false);

    // Already settled (e.g. via Skip Set): move on.
    if (isResolved(currentPlayer.id)) {
      live.resolving = true;
      later(0, advance);
      return;
    }


    // Resume the exact round in progress (after navigation or a restored
    // save): same ceilings, passes, withdrawals and accepted bids. Timers are
    // never saved; the countdown simply restarts below.
    const saved = roundRef.current;
    const adopt = saved && saved.status === "OPEN" && saved.player?.id === currentPlayer.id;
    const remaining = auctionQueue
      .slice(playerIndex + 1)
      .filter((p) => !isResolved(p.id));
    if (adopt) {
      live.round = saved;
      saved.human = { name: selectedTeam.name, purse, squad };
      saved.needsCycle = true;
      live.bid = saved.bid;
      live.leader = saved.leader;
      live.userIn = saved.userIn;
      live.aiOpens = true;
      setUserIn(saved.userIn);
    } else {
      live.aiOpens = Math.random() < AI_OPENS_CHANCE;
      live.bid = currentPlayer.basePrice;
      live.leader = "Base Price";
      live.round = createRound(
        currentPlayer,
        teamsRef.current,
        marketContext(remaining),
        Math.random,
        { name: selectedTeam.name, purse, squad },
      );
    }
    roundRef.current = live.round;
    const resuming = adopt && live.leader !== "Base Price";
    setCurrentBid(live.bid);
    setLeadingTeam(live.leader);
    setPhase("bidding");
    setAuctionStatus(
      !live.userIn ? "AI Franchises Bidding..." : resuming ? "Bidding" : "Waiting For Bid",
    );
    setWindowDisplay(null);
    releaseAccel(); // acceleration is never restored or carried over
    // real timing state (not saved: a resumed lot restarts its window)
    live.clock = newClock(nowMs(), { aiOpens: live.aiOpens, userIn: live.userIn });
    onAccepted(live.clock, nowMs(), leaderKindOf(live.leader, selectedTeam.name));
    refreshClock();
    scheduleAt(nextAction(live.clock).at);
    // cosmetic countdown mirror; the auction itself only follows the clock above
    const mirror = setInterval(() => {
      const w = live.clock && !live.resolving ? windowInfo(live.clock, nowMs()) : null;
      setWindowDisplay((prev) =>
        !w ? (prev ? null : prev)
          : prev && prev.kind === w.kind && Math.abs(prev.remainingMs - w.remainingMs) < 150 ? prev : w,
      );
    }, 200);

    return () => {
      live.token += 1;
      clearTimers();
      clearInterval(mirror);
      live.clock = null;
    };
  }, [auctionInitialized, currentPlayer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // warm the cache with the next lot's portrait (presentation only)
  useEffect(() => {
    const next = auctionQueue[playerIndex + 1];
    if (next) new Image().src = portraitUrl(next);
  }, [playerIndex, auctionQueue]);

  // ---- user actions ------------------------------------------------------
  const userTeamState = { name: selectedTeam?.name, purse, squad };
  const biddingOpen = phase === "bidding" || phase === "hammer";
  const canBid =
    Boolean(currentPlayer) &&
    userIn &&
    biddingOpen &&
    canUserBid(userTeamState, currentPlayer, currentBid, leadingTeam);
  const canSkip =
    Boolean(currentPlayer) &&
    userIn &&
    biddingOpen &&
    leadingTeam !== selectedTeam?.name;

  // The human bid is processed against the LATEST accepted bid (liveRef), so
  // a bid the AI already got in is never overwritten and the amount is
  // recalculated rather than stale.
  const placeBid = () => {
    const live = liveRef.current;
    if (live.resolving || !live.userIn || !live.round) return;

    // Same authoritative path as AI bids: validated against the latest
    // accepted price, amount recalculated if the AI moved first.
    live.round.human = { name: selectedTeam.name, purse, squad };
    const res = submitBid(live.round, selectedTeam.name);
    if (!res.ok) return;

    // accepted through the single bid path: reset the clock, AIs re-decide
    publishBid(res.bid, res.leader);
    onAccepted(live.clock, nowMs(), "user");
    setPhase("bidding");
    setAuctionStatus(`${selectedTeam.name} bids ₹${res.bid} Cr`);
    reschedule();
  };

  // Withdraw from this player only; the AI auction carries on to a result.
  const skipPlayer = () => {
    const live = liveRef.current;
    if (!canSkip || !live.userIn || live.resolving) return;
    live.userIn = false;
    withdrawHuman(live.round);
    setUserIn(false);
    setWindowDisplay(null);
    setAuctionStatus("AI Franchises Bidding...");
    reschedule();
  };

  useEffect(() => {
    return () => {
      liveRef.current.token += 1;
      clearTimers();
    };
  }, []);

  if (!currentPlayer) {
    return (
      <div className="ar-page">
        <AuctionHeader onViewSets={() => navigate("/sets")} />
        <div className="ar-empty">
          <h2>Auction completed</h2>
          <p>Every player has been resolved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ar-page">
      <AuctionHeader onViewSets={() => navigate("/sets")} />

      <div className="ar-layout">
        <TeamSidebar
          selectedTeam={selectedTeam}
          purse={purse}
          squad={squad}
          auctionTeams={auctionTeams}
          leadingTeam={leadingTeam}
        />

        <div className="ar-main">
          <PlayerPanel
            currentPlayer={currentPlayer}
            currentBid={currentBid}
            leadingTeam={leadingTeam}
            auctionStatus={auctionStatus}
            result={salePopup}
            selectedTeamName={selectedTeam?.name}
          />
        </div>

        <div className="ar-right">
          <AuctionStatus
            phase={phase}
            windowInfo={windowDisplay}
            auctionStatus={auctionStatus}
            leadingTeam={leadingTeam}
            playerIndex={playerIndex}
            total={auctionQueue.length}
            completedInSet={completedInSet}
            setSize={currentSetPlayers.length}
            setName={currentPlayer.set}
            userIn={userIn}
          />

          <BidControls
            onBid={placeBid}
            onSkip={skipPlayer}
            canBid={canBid}
            canSkip={canSkip}
            userIn={userIn}
            leadingTeam={leadingTeam}
            selectedTeam={selectedTeam}
            purse={purse}
            currentBid={currentBid}
            bidIncrement={getBidIncrement(currentBid)}
            onAccelerate={setAccel}
            accelerating={accelOn}
            canAccelerate={biddingOpen}
          />
        </div>

        <div className="ar-squad-row">
          <section className="ar-card ar-squad">
            <div className="ar-card-head">
              <h3 className="ar-card-title">My squad</h3>
              <span className="ar-count">{squad.length}/25</span>
            </div>
            {squad.length === 0 ? (
              <p className="ar-muted">No players yet</p>
            ) : (
              <ul className="ar-chips">
                {squad.map((player) => (
                  <li key={player.id} className={`ar-chip ar-role-${player.role}`} title={`${player.role} · ₹${player.soldPrice ?? 0} Cr`}>
                    <span className="ar-chip-name">{player.name}</span>
                    {player.soldPrice != null && <span className="ar-chip-price">₹{player.soldPrice}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ar-card ar-budget">
            <h3 className="ar-card-title">Remaining purse</h3>
            <div key={purse} className="ar-budget-value">₹{purse.toFixed(1)}<small> Cr</small></div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AuctionRoom;

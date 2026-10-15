import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuctionContext } from "../context/AuctionContext";
import { players } from "../data/players";
import { aiTeams } from "../data/aiTeams";
import * as api from "../services/api";
import { bindings, engine, session } from "./engine";
import { isGameComplete } from "../logic/lineup";
import { emptyGame, validateSnapshot } from "./gameState";
import "./save.css";

const SaveContext = createContext(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useSave = () => useContext(SaveContext);

const GAME_PATHS = ["/teams", "/retention", "/auction", "/squads", "/sets", "/summary", "/postauction"];
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const tick = () => new Promise((r) => setTimeout(r, 0));

function Modal({ title, children, actions, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="save-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="save-modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
        <div className="save-modal-actions">{actions}</div>
      </div>
    </div>
  );
}

export function SaveProvider({ children }) {
  const auction = useContext(AuctionContext);
  const navigate = useNavigate();
  const location = useLocation();

  const auctionRef = useRef(auction);
  useEffect(() => {
    auctionRef.current = auction;
  });

  const [hasSession, setHasSession] = useState(false);
  const [saveInfo, setSaveInfo] = useState({ loading: true, exists: false, meta: null, error: null });
  const [status, setStatus] = useState({ state: "saved", error: null });
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const suppressUntil = useRef(0);
  const lastKey = useRef("");
  const toastTimer = useRef(null);

  useEffect(() => {
    bindings.getGame = () => auctionRef.current.exportGame();
    bindings.onStatus = (state, error) => setStatus({ state, error });
  }, []);

  function notify(message, kind = "ok", action = null) {
    clearTimeout(toastTimer.current);
    setToast({ message, kind, action });
    if (kind === "ok") toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  async function refreshInfo(attempt = 0) {
    try {
      const info = await api.getSaveInfo();
      setSaveInfo({ loading: false, exists: info.exists, meta: info.meta, error: null });
    } catch (error) {
      setSaveInfo({ loading: false, exists: false, meta: null, error });
      // network may not be ready yet (cold start / mobile data): retry a few times
      if (attempt < 4) setTimeout(() => refreshInfo(attempt + 1), 1500 * (attempt + 1));
    }
  }

  useEffect(() => {
    // initial fetch of the saved-game metadata
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshInfo();
    const onOnline = () => refreshInfo();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autosave on meaningful state changes
  useEffect(() => {
    auction.changeListenerRef.current = () => {
      if (!session.id || Date.now() < suppressUntil.current) return;
      const s = auctionRef.current;
      const g = s.exportGame();
      const key = JSON.stringify([
        g.playerIndex, g.resolvedIds.length, g.retentions.length, g.selectedTeam?.name, g.auctionInitialized,
      ]);
      const checkpoint = key !== lastKey.current; // sale / unsold / progression / retention
      lastKey.current = key;
      engine.markDirty(checkpoint ? 250 : undefined);
    };
    return () => {
      auction.changeListenerRef.current = null;
    };
  }, [auction.changeListenerRef]);

  // refresh the save info whenever a save completes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status.state === "saved" && session.id) refreshInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.state]);

  // best-effort flush when the tab is closed
  useEffect(() => {
    const onHide = () => {
      if (session.id && (engine.dirty || engine.timer) && !engine.running) {
        try {
          const game = auctionRef.current.exportGame();
          engine.seq += 1;
          fetch(api.SAVE_URL, {
            method: "PUT",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshot: { schemaVersion: 1, sessionId: session.id, seq: engine.seq, game }, replace: false }),
          }).catch(() => {});
        } catch {
          /* best effort */
        }
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // game pages need an active session (after a reload: go Home, then Continue)
  useEffect(() => {
    if (!hasSession && (GAME_PATHS.includes(location.pathname) || location.pathname.startsWith("/squad/") || location.pathname.startsWith("/postauction/"))) navigate("/", { replace: true });
  }, [hasSession, location.pathname, navigate]);

  function resumeRoute(game) {
    game = game ?? auctionRef.current.exportGame();
    if (game.auctionInitialized) {
      // a finished auction resumes on the post-auction dashboard, never on bidding
      return isGameComplete(game) ? "/postauction" : "/auction";
    }
    return game.selectedTeam ? "/retention" : "/teams";
  }

  async function saveNow() {
    if (!session.id || busy) return { ok: false };
    setBusy(true);
    await tick(); // let React commit the latest state first
    const r = await engine.flush({ force: true });
    setBusy(false);
    if (r.ok) notify("Game saved");
    else notify(`Save failed: ${r.error?.message}. Your previous save is intact.`, "error");
    return r;
  }

  async function saveAndExit() {
    if (!session.id || busy) return;
    setBusy(true);
    await tick();
    const r = await engine.flush({ force: true });
    setBusy(false);
    if (r.ok) {
      await refreshInfo();
      navigate("/");
    } else {
      notify(`Could not save, so you were not exited: ${r.error?.message}`, "error", {
        label: "Retry",
        run: () => saveAndExit(),
      });
    }
  }

  async function beginNewGame() {
    setBusy(true);
    const prevSession = session.id;
    const prevSeq = engine.seq;
    const id = newId();
    session.id = id;
    engine.reset(0);
    // the old save is replaced atomically on the server; if this fails it is untouched
    const r = await engine.flush({ replace: true, force: true, game: emptyGame() });
    if (!r.ok) {
      session.id = prevSession;
      engine.reset(prevSeq);
      setBusy(false);
      setDialog(null);
      notify(`Could not start a new game: ${r.error?.message}. Your previous save was not changed.`, "error");
      return;
    }
    auctionRef.current.resetAll();
    suppressUntil.current = Date.now() + 400;
    lastKey.current = "";
    setHasSession(true);
    setDialog(null);
    setBusy(false);
    await refreshInfo();
    navigate("/teams");
  }

  function requestNewGame() {
    if (saveInfo.exists) setDialog({ type: "newgame" });
    else beginNewGame();
  }

  async function continueGame() {
    if (busy) return;
    setDialog(null);
    setBusy(true);
    try {
      if (session.id && saveInfo.meta?.sessionId === session.id) {
        await engine.flush();
        navigate(resumeRoute());
        return;
      }
      const snap = await api.getSaveData();
      const v = validateSnapshot(snap, { players, aiTeams });
      if (!v.ok) {
        setDialog({ type: "corrupt", reason: v.reason, incompatible: v.incompatible });
        return;
      }
      suppressUntil.current = Date.now() + 400;
      auctionRef.current.importGame(snap.game);
      session.id = snap.sessionId;
      engine.reset(snap.seq);
      lastKey.current = "";
      setHasSession(true);
      navigate(resumeRoute(snap.game));
    } catch (error) {
      if (error.code === "corrupt") setDialog({ type: "corrupt", reason: error.message });
      else notify(`Could not load the saved game: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const value = {
    hasSession, saveInfo, status, busy, saveNow, saveAndExit, requestNewGame, continueGame, resumeRoute,
  };

  return (
    <SaveContext.Provider value={value}>
      {children}
      <div className="save-toast-region" aria-live="polite">
        {toast && (
          <div className={`save-toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
            <span>{toast.message}</span>
            {toast.action && (
              <button onClick={() => { setToast(null); toast.action.run(); }}>{toast.action.label}</button>
            )}
            <button aria-label="Dismiss" onClick={() => setToast(null)}>✕</button>
          </div>
        )}
      </div>

      {dialog?.type === "newgame" && (
        <Modal
          title="Replace your saved game?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <button className="save-btn primary" onClick={continueGame}>Resume Previous Game</button>
              <button className="save-btn danger" disabled={busy} onClick={beginNewGame}>Start New Game</button>
              <button className="save-btn" onClick={() => setDialog(null)}>Cancel</button>
            </>
          }
        >
          <p>
            Only one game can be saved. Starting a new game will <b>permanently replace</b> your previous
            session{saveInfo.meta?.teamName ? ` (${saveInfo.meta.teamName})` : ""}. It cannot be recovered afterwards.
          </p>
        </Modal>
      )}

      {dialog?.type === "corrupt" && (
        <Modal
          title={dialog.incompatible ? "Saved game is incompatible" : "Saved game can't be loaded"}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button className="save-btn" onClick={() => setDialog(null)}>Keep it for now</button>
              <button className="save-btn danger" onClick={beginNewGame}>Replace with a new game</button>
            </>
          }
        >
          <p>{dialog.reason}</p>
          <p>Your saved data has <b>not</b> been changed or deleted. It is only replaced if you choose to start a new game.</p>
        </Modal>
      )}
    </SaveContext.Provider>
  );
}

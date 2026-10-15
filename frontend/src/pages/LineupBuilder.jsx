import { useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CircleAlert, Plus, Search, Share2, Star, X } from "lucide-react";
import { AuctionContext } from "../context/AuctionContext";
import TeamBadge from "../components/auction/TeamBadge";
import PlayerThumb from "../components/lineup/PlayerThumb";
import { fmtCr, ROLE_META } from "../data/teamAssets";
import { ROLE_ORDER } from "../logic/squadStats";
import {
  IMPACT_SLOT, LINEUP_RULES, XI_SIZE, assign, composition, emptySlots, fromRecord, nextFreeSlot,
  removeAt, sameSlots, slotLabel, startingCount, toRecord, validateLineup,
} from "../logic/lineup";
import { copyLineupImage } from "../logic/shareImage";
import * as api from "../services/api";
import { session } from "../save/engine";
import { clearDraft, loadDraft, saveDraft, useLineups } from "../save/lineupStore";
import "./PostAuction.css";

export default function LineupBuilder() {
  const { team: teamParam } = useParams();
  const name = decodeURIComponent(teamParam || "");
  const { selectedTeam, purse, squad, auctionTeams, auctionComplete, auctionInitialized } = useContext(AuctionContext);
  const teams = useMemo(
    () => [{ name: selectedTeam?.name, purse, squad, isUser: true }, ...auctionTeams],
    [selectedTeam, purse, squad, auctionTeams],
  );
  const team = teams.find((t) => t.name === name);
  if (!auctionInitialized || !selectedTeam) return <Navigate to="/" replace />;
  if (!auctionComplete) return <Navigate to="/auction" replace />;
  if (!team) return <Navigate to="/postauction" replace />;
  // keyed by team so switching franchises always starts from that team's own state
  return <LoadGate key={team.name} team={team} />;
}

// Wait for the saved lineups once, so the editor can start from the right state.
function LoadGate({ team }) {
  const { lineups, loaded, error, reload } = useLineups(session.id);
  // Only wait while the very first request is in flight. If it FAILS the squad
  // is still shown (editing works, drafts are kept); only Submit is held back.
  if (!loaded && !error) {
    return (
      <div className="pa-page xi-page">
        <p className="pa-sub" role="status">Loading Playing XI…</p>
      </div>
    );
  }
  return <Builder team={team} lineups={lineups} error={error} reload={reload} />;
}

function Builder({ team, lineups, error, reload }) {
  const navigate = useNavigate();
  const sessionId = session.id;
  const players = useMemo(() => team.squad || [], [team.squad]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Start from: unfinished draft > saved lineup > empty (computed once).
  const [init] = useState(() => {
    const record = lineups[team.name];
    const saved = record ? fromRecord(record, players) : { slots: emptySlots(), missing: [] };
    const draft = loadDraft(sessionId, team.name);
    const d = draft ? fromRecord({ startingXI: draft.slice(0, XI_SIZE), impactPlayerId: draft[IMPACT_SLOT] }, players) : null;
    const useDraft = d && !sameSlots(d.slots, saved.slots);
    return { saved, slots: useDraft ? d.slots : saved.slots, fromDraft: !!useDraft };
  });
  const [slots, setSlots] = useState(init.slots);
  const [baseline, setBaseline] = useState(init.saved.slots);
  const [missing, setMissing] = useState(init.saved.missing);
  const [fromDraft, setFromDraft] = useState(init.fromDraft);
  const [picked, setPicked] = useState(null); // player id chosen, waiting for a slot
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [submitState, setSubmitState] = useState({ busy: false, error: null, ok: false });
  const [showErrors, setShowErrors] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [share, setShare] = useState({ busy: false, msg: null, blobUrl: null });

  const dirty = !sameSlots(slots, baseline);

  // Persist the unfinished work locally on every change.
  useEffect(() => {
    if (dirty) saveDraft(sessionId, team.name, slots);
    else clearDraft(sessionId, team.name);
  }, [slots, dirty, sessionId, team.name]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (next) => {
    setSlots(next);
    setSubmitState({ busy: false, error: null, ok: false });
  };

  const onSlotClick = (i) => {
    if (picked != null) {
      edit(assign(slots, picked, i));
      setPicked(null);
    } else if (slots[i] != null) setPicked(slots[i]); // pick up to move / swap
  };
  const onPlayerClick = (id) => setPicked((cur) => (cur === id ? null : id));
  const quickAdd = (id) => {
    const i = slots.includes(id) ? -1 : nextFreeSlot(slots);
    if (i >= 0) edit(assign(slots, id, i));
  };
  const onDrop = (e, i) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (byId.has(id)) { edit(assign(slots, id, i)); setPicked(null); }
  };

  async function submit() {
    const v = validateLineup(slots, players, LINEUP_RULES);
    if (!v.ok) { setShowErrors(true); return; }
    setSubmitState({ busy: true, error: null, ok: false });
    try {
      await api.putLineup(sessionId, team.name, { ...toRecord(slots), teamId: team.id ?? null });
      clearDraft(sessionId, team.name);
      setBaseline(slots);
      setMissing([]);
      setFromDraft(false);
      setShowErrors(false);
      setSubmitState({ busy: false, error: null, ok: true });
      reload();
    } catch (err) {
      setSubmitState({ busy: false, error: err, ok: false });
    }
  }

  // Share is offered once this lineup is complete and submitted (no pending edits).
  const submittedOk = !dirty && validateLineup(baseline, players, LINEUP_RULES).ok;
  async function doShare() {
    setShare({ busy: true, msg: null, blobUrl: null });
    try {
      const r = await copyLineupImage({ teamName: team.name, slots, squad: players });
      if (r.status === "copied") setShare({ busy: false, msg: "Image copied to clipboard — paste it into any chat.", blobUrl: null });
      else setShare({ busy: false, msg: "Clipboard images aren't supported here. Long-press or right-click the image to save it.", blobUrl: URL.createObjectURL(r.blob) });
    } catch (err) {
      setShare({ busy: false, msg: `Could not create the image: ${err.message}`, blobUrl: null });
    }
  }

  const goBack = () => (dirty ? setLeaving(true) : navigate("/postauction"));
  const discard = () => {
    clearDraft(sessionId, team.name);
    navigate("/postauction");
  };
  const resetToSaved = () => { edit(baseline); setFromDraft(false); setPicked(null); };

  const validation = validateLineup(slots, players, LINEUP_RULES);
  const count = startingCount(slots);
  const comp = composition(slots, players);
  const placedAt = (id) => slots.indexOf(id);
  const shown = players
    .filter((p) => (roleFilter === "All" || p.role === roleFilter) && p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  const slotView = (i) => {
    const p = byId.get(slots[i]);
    const cls = ["xi-slot", i === IMPACT_SLOT ? "is-impact" : "", p ? "is-filled" : "", picked != null ? "is-target" : "", p && picked === p.id ? "is-picked" : ""].join(" ");
    return (
      <li key={i} className={cls} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, i)}>
        <button
          type="button"
          className="xi-slot-main"
          onClick={() => onSlotClick(i)}
          draggable={!!p}
          onDragStart={(e) => p && e.dataTransfer.setData("text/plain", String(p.id))}
          aria-label={p ? `${slotLabel(i)}: ${p.name}. ${picked != null ? "Place selected player here" : "Select to move"}` : `${slotLabel(i)}: empty${picked != null ? ". Place selected player here" : ""}`}
        >
          <span className="xi-slot-no">{i === IMPACT_SLOT ? "IMP" : i + 1}</span>
          {p ? (
            <>
              <PlayerThumb player={p} size={40} />
              <span className="xi-slot-body">
                <strong title={p.name}>{p.name}</strong>
                <small>{ROLE_META[p.role]?.short || p.role}{p.nation === "Foreigner" ? " · OS" : ""}</small>
              </span>
            </>
          ) : (
            <span className="xi-slot-empty">{i === IMPACT_SLOT ? "Impact Player / Substitute (optional)" : "Empty — tap to fill"}</span>
          )}
        </button>
        {p && (
          <button type="button" className="xi-icon-btn" onClick={() => { edit(removeAt(slots, i)); setPicked(null); }} aria-label={`Remove ${p.name} from ${slotLabel(i)}`}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="pa-page xi-page">
      <header className="xi-head">
        <button type="button" className="xi-back" onClick={goBack}><ArrowLeft size={18} aria-hidden="true" /> Dashboard</button>
        <TeamBadge name={team.name} size={44} />
        <div className="xi-title">
          <span className="pa-kicker">Playing XI builder</span>
          <h1>{team.name}{team.isUser && <span className="ar-tag ar-tag-you">YOU</span>}</h1>
        </div>
        <span className={`xi-count ${count === XI_SIZE ? "is-full" : ""}`} aria-live="polite">{count}/{XI_SIZE} <small>starters</small></span>
        <button type="button" className="pa-action xi-submit" onClick={submit} disabled={submitState.busy || !!error}
          title={error ? "Saved lineups couldn't be loaded — retry first" : undefined}>
          <Check size={16} aria-hidden="true" /> {submitState.busy ? "Saving…" : "Submit Playing XI"}
        </button>
        {submittedOk && (
          <button type="button" className="pa-action is-edit xi-share" onClick={doShare} disabled={share.busy}>
            <Share2 size={16} aria-hidden="true" /> {share.busy ? "Creating…" : "Share"}
          </button>
        )}
      </header>

      <div className="xi-notes" aria-live="polite">
        {submitState.ok && <p className="pa-ok" role="status"><Check size={16} aria-hidden="true" /> {team.name} Playing XI saved. <button type="button" onClick={() => navigate("/postauction")}>Back to dashboard</button></p>}
        {submitState.error && <p className="pa-warn" role="alert"><CircleAlert size={16} aria-hidden="true" /> Not saved: {submitState.error.message}. Your selection is kept — try again.</p>}
        {showErrors && !validation.ok && <p className="pa-warn" role="alert"><CircleAlert size={16} aria-hidden="true" /> {validation.errors.join(" ")}</p>}
        {error && <p className="pa-warn" role="alert"><CircleAlert size={16} aria-hidden="true" /> Saved lineups could not be loaded ({error.message}); you can still pick players, but submitting is disabled until they load. <button type="button" onClick={reload}>Retry</button></p>}
        {missing.length > 0 && <p className="pa-warn" role="status"><CircleAlert size={16} aria-hidden="true" /> {missing.length} player{missing.length === 1 ? "" : "s"} from the saved lineup no longer belong to {team.name}; their slots were left empty (no one was substituted). Fill them and submit again.</p>}
        {fromDraft && dirty && <p className="pa-info" role="status">Restored your unfinished draft. <button type="button" onClick={resetToSaved}>Discard draft</button></p>}
        {share.msg && (
          <div className="pa-info" role="status">
            {share.msg}
            {share.blobUrl && <img className="xi-share-img" src={share.blobUrl} alt={`${team.name} Playing XI`} />}
            <button type="button" onClick={() => setShare({ busy: false, msg: null, blobUrl: null })}>Close</button>
          </div>
        )}
        {picked != null && <p className="pa-info" role="status">{byId.get(picked)?.name} selected — choose a slot (a filled slot swaps). <button type="button" onClick={() => setPicked(null)}>Cancel</button></p>}
      </div>

      <div className="xi-layout">
        <section className="xi-squad" aria-label={`${team.name} squad`}>
          <div className="xi-squad-tools">
            <label className="xi-search"><Search size={15} aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search squad" aria-label="Search squad" />
            </label>
            <div className="xi-filters" role="group" aria-label="Filter by role">
              {["All", ...ROLE_ORDER].map((r) => (
                <button key={r} type="button" aria-pressed={roleFilter === r} className={roleFilter === r ? "is-on" : ""} onClick={() => setRoleFilter(r)}>
                  {r === "All" ? "All" : ROLE_META[r].short}
                </button>
              ))}
            </div>
          </div>
          <h2 className="xi-h">Squad <span>{players.length}</span></h2>
          {players.length === 0 && <p className="pa-sub">{team.name} has no players, so a Playing XI can&apos;t be built.</p>}
          <ul className="xi-list">
            {shown.map((p) => {
              const at = placedAt(p.id);
              return (
                <li key={p.id} className={`xi-player ar-role-${p.role} ${at >= 0 ? "is-placed" : ""} ${picked === p.id ? "is-picked" : ""}`}>
                  <button
                    type="button" className="xi-player-main" draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(p.id))}
                    onClick={() => onPlayerClick(p.id)} aria-pressed={picked === p.id}
                  >
                    <PlayerThumb player={p} />
                    <span className="xi-player-body">
                      <strong title={p.name}>{p.name}</strong>
                      <small>{ROLE_META[p.role]?.label || p.role} · {p.nation === "Foreigner" ? "Overseas" : "India"}</small>
                    </span>
                    <span className="xi-player-side">
                      <span className="xi-rate"><Star size={11} aria-hidden="true" /> {p.rating}</span>
                      <small>{p.soldPrice == null ? "—" : `₹${fmtCr(p.soldPrice)} Cr`}</small>
                    </span>
                  </button>
                  {at >= 0 ? (
                    <span className="xi-placed-tag">{at === IMPACT_SLOT ? "IMP" : `#${at + 1}`}</span>
                  ) : (
                    <button type="button" className="xi-icon-btn" onClick={() => quickAdd(p.id)} disabled={nextFreeSlot(slots) < 0} aria-label={`Add ${p.name} to the next free slot`}>
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && players.length > 0 && <li className="pa-sub">No players match.</li>}
          </ul>
        </section>

        <section className="xi-formation" aria-label="Playing formation">
          <h2 className="xi-h">Starting XI <span>{count}/{XI_SIZE}</span></h2>
          <ol className="xi-slots">{Array.from({ length: XI_SIZE }, (_, i) => slotView(i))}</ol>
          <h2 className="xi-h xi-h-impact">Impact Player / Substitute <span>optional</span></h2>
          <ol className="xi-slots xi-slots-impact" start={12}>{slotView(IMPACT_SLOT)}</ol>
          <p className="xi-comp" aria-label="Starting XI composition">
            {comp.batters} BAT · {comp.keepers} WK · {comp.allRounders} AR · {comp.bowlers} BOWL · {comp.overseas} overseas
            {LINEUP_RULES.maxOverseasInXI != null && ` (max ${LINEUP_RULES.maxOverseasInXI})`}
          </p>
        </section>
      </div>

      {leaving && (
        <div className="save-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLeaving(false)}>
          <div className="save-modal" role="dialog" aria-modal="true" aria-label="Unsaved Playing XI">
            <h2>Leave without submitting?</h2>
            <p>Your {team.name} lineup has changes that aren&apos;t submitted. They&apos;re kept as a draft on this device so you can continue later.</p>
            <div className="save-modal-actions">
              <button type="button" className="save-btn" onClick={() => setLeaving(false)}>Keep editing</button>
              <button type="button" className="save-btn primary" onClick={() => navigate("/postauction")}>Leave &amp; keep draft</button>
              <button type="button" className="save-btn danger" onClick={discard}>Discard changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

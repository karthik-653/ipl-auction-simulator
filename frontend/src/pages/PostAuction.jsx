import { useContext, useMemo } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, Pencil, TriangleAlert, Trophy, Users, Wallet } from "lucide-react";
import { AuctionContext } from "../context/AuctionContext";
import TeamBadge from "../components/auction/TeamBadge";
import { fmtCr, ROLE_META } from "../data/teamAssets";
import { ROLE_ORDER, squadStats } from "../logic/squadStats";
import { fromRecord } from "../logic/lineup";
import { session } from "../save/engine";
import { hasDraft, useLineups } from "../save/lineupStore";
import "./PostAuction.css";

// Status of one franchise's Playing XI: "submitted" | "attention" | "draft" | "none".
function lineupStatus(sessionId, team, record) {
  if (record) {
    const { slots, missing } = fromRecord(record, team.squad || []);
    return missing.length || slots.slice(0, 11).includes(null) ? "attention" : "submitted";
  }
  return hasDraft(sessionId, team.name) ? "draft" : "none";
}

const STATUS_TEXT = {
  submitted: "Playing XI saved",
  attention: "Needs review",
  draft: "Draft in progress",
  none: "Not created",
};

export default function PostAuction() {
  const navigate = useNavigate();
  const { selectedTeam, purse, squad, auctionTeams, unsoldPlayers, auctionComplete, auctionInitialized } = useContext(AuctionContext);
  const { lineups, loading, error, reload } = useLineups(session.id);

  const teams = useMemo(
    () => [{ name: selectedTeam?.name, purse, squad, isUser: true }, ...auctionTeams],
    [selectedTeam, purse, squad, auctionTeams],
  );

  // Only reachable once the normal completion event has happened.
  if (!auctionInitialized || !selectedTeam) return <Navigate to="/" replace />;
  if (!auctionComplete) return <Navigate to="/auction" replace />;

  const sold = teams.flatMap((t) => (t.squad || []).filter((p) => !p.retained));
  const spent = sold.reduce((s, p) => s + (p.soldPrice || 0), 0);
  const top = sold.reduce((best, p) => ((p.soldPrice || 0) > (best?.soldPrice || 0) ? p : best), null);
  const topTeam = top && teams.find((t) => t.squad.some((p) => p.id === top.id));
  const done = teams.filter((t) => lineupStatus(session.id, t, lineups[t.name]) === "submitted").length;

  return (
    <div className="pa-page">
      <header className="pa-head">
        <div>
          <span className="pa-kicker"><Trophy size={14} aria-hidden="true" /> Auction complete</span>
          <h1>Post-Auction Dashboard</h1>
          <p className="pa-sub">All ten squads are final. Build a Playing XI for any franchise — squads, prices and purses are never changed here.</p>
        </div>
        <ul className="pa-summary" aria-label="Auction summary">
          <li><span>Players sold</span><b>{sold.length}</b></li>
          <li><span>Unsold</span><b>{unsoldPlayers.length}</b></li>
          <li><span>Total spent</span><b>₹{fmtCr(spent)} Cr</b></li>
          {top && <li><span>Top buy</span><b title={top.name}>₹{fmtCr(top.soldPrice)} Cr</b><small>{top.name} · {topTeam?.name}</small></li>}
          <li><span>Playing XIs</span><b>{done}/{teams.length}</b></li>
        </ul>
      </header>

      {error && (
        <p className="pa-warn" role="alert">
          <TriangleAlert size={16} aria-hidden="true" /> Saved lineups couldn't be loaded ({error.message}), so \"saved\" badges may be missing. You can still open every squad. Your auction is unaffected.
          <button type="button" onClick={reload}>Retry</button>
        </p>
      )}

      <nav className="pa-links" aria-label="Other views">
        <Link to="/summary">Full auction summary</Link>
        <Link to="/math">Auction math</Link>
      </nav>

      <ul className="pa-grid" aria-busy={loading}>
        {teams.map((t) => {
          const st = squadStats(t);
          const status = lineupStatus(session.id, t, lineups[t.name]);
          const open = () => navigate(`/postauction/${encodeURIComponent(t.name)}`);
          return (
            <li key={t.name} className={`pa-card is-${status}`}>
              <div className="pa-card-top">
                <TeamBadge name={t.name} size={48} />
                <div className="pa-card-name">
                  <h2>{t.name}{t.isUser && <span className="ar-tag ar-tag-you">YOU</span>}</h2>
                  <span className={`pa-status is-${status}`}>
                    {status === "submitted" ? <CheckCircle2 size={13} aria-hidden="true" /> : status === "attention" ? <TriangleAlert size={13} aria-hidden="true" /> : <ClipboardList size={13} aria-hidden="true" />}
                    {STATUS_TEXT[status]}
                  </span>
                </div>
              </div>
              <div className="pa-card-stats">
                <span><Users size={14} aria-hidden="true" /> <b>{st.size}</b> players</span>
                <span><Wallet size={14} aria-hidden="true" /> <b>₹{fmtCr(st.purse)}</b> Cr left</span>
                <span><b>{st.overseas}</b> overseas</span>
              </div>
              <ul className="pa-roles" aria-label="Squad composition">
                {ROLE_ORDER.map((r) => (
                  <li key={r} className={`ar-role-${r}`} title={ROLE_META[r].label}><b>{st.counts[r]}</b> {ROLE_META[r].short}</li>
                ))}
              </ul>
              <button type="button" className={`pa-action ${status === "submitted" ? "is-edit" : ""}`} onClick={open}>
                {status === "none" ? <ClipboardList size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
                {status === "none" ? "Create Playing XI" : status === "draft" ? "Continue Playing XI" : status === "attention" ? "Review Playing XI" : "Edit Playing XI"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


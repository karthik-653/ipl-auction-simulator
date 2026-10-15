import { useContext, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Globe2, Users, Wallet } from "lucide-react";
import { AuctionContext } from "../context/AuctionContext";
import TeamBadge from "../components/auction/TeamBadge";
import { fmtCr, ROLE_META } from "../data/teamAssets";
import { portraitUrl } from "../data/portraits";
import { ROLE_LABEL, ROLE_ORDER, squadStats } from "../logic/squadStats";
import "./SquadPage.css";

function Thumb({ player }) {
  const src = player.portrait || portraitUrl(player);
  const [failed, setFailed] = useState(false);
  const initials = player.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="sq-thumb" aria-hidden="true">
      {failed ? <b>{initials}</b> : <img src={src} alt="" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(true)} />}
    </span>
  );
}

function PlayerCard({ player }) {
  const meta = ROLE_META[player.role] || { short: "PLR", label: player.role };
  const price = player.soldPrice;
  return (
    <li className={`sq-player ar-role-${player.role}`}>
      <Thumb player={player} />
      <div className="sq-player-body">
        <strong className="sq-player-name" title={player.name}>{player.name}</strong>
        <div className="sq-player-tags">
          <span className="sq-role">{meta.short}</span>
          <span className="sq-nation">{player.nation === "Foreigner" ? "Overseas" : "India"}</span>
          {player.retained && <span className="sq-retained">Retained</span>}
        </div>
      </div>
      <div className="sq-player-side">
        <span className="sq-price">{price == null ? "—" : `₹${fmtCr(price)} Cr`}</span>
        <span className="sq-rating" title="Rating">★ {player.rating}</span>
      </div>
    </li>
  );
}

function Meter({ label, value, max, text }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  return (
    <div className="sq-meter">
      <div className="sq-meter-head"><span>{label}</span><b>{text}</b></div>
      <div className="sq-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Full-screen squad page (a route, not a popup). While it is mounted the
// auction is held; leaving it by NEXT, the browser Back button or Android Back
// releases the hold exactly once and the auction continues from the same state.
export default function SquadPage() {
  const { team: teamParam } = useParams();
  const navigate = useNavigate();
  const { selectedTeam, purse, squad, auctionTeams, pauseAuction, resumeAuction } = useContext(AuctionContext);

  useEffect(() => {
    pauseAuction("squad");
    return () => resumeAuction("squad");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const name = decodeURIComponent(teamParam || "");
  const teams = [{ name: selectedTeam?.name, purse, squad, isUser: true }, ...auctionTeams];
  const team = teams.find((t) => t.name === name);
  if (!team || !selectedTeam) return <Navigate to="/auction" replace />;

  const st = squadStats(team);
  const groups = ROLE_ORDER.map((r) => [r, [...st.byRole[r]].sort((a, b) => (b.soldPrice ?? 0) - (a.soldPrice ?? 0))]).filter(([, l]) => l.length);
  if (st.other.length) groups.push(["Other", st.other]);

  return (
    <div className="sq-page">
      <header className="sq-header">
        <div className="sq-title">
          <TeamBadge name={team.name} size={56} />
          <div>
            <span className="sq-kicker">{team.isUser ? "Your squad" : "Franchise squad"}</span>
            <h1>{team.name}{team.isUser && <span className="ar-tag ar-tag-you">YOU</span>}</h1>
          </div>
        </div>
        <ul className="sq-chips" aria-label="Squad summary">
          <li><Wallet size={16} aria-hidden="true" /><span>Purse</span><b>₹{st.purse.toFixed(1)} Cr</b></li>
          <li><Users size={16} aria-hidden="true" /><span>Squad</span><b>{st.size}/{st.maxSize}</b></li>
          <li><Globe2 size={16} aria-hidden="true" /><span>Overseas</span><b>{st.overseas}/{st.maxOverseas}</b></li>
        </ul>
        <button type="button" className="sq-next" onClick={() => navigate("/auction")} aria-label="Next: close the squad and return to the auction">
          <span><small>Back to auction</small><b>NEXT</b></span>
          <ArrowRight size={22} aria-hidden="true" />
        </button>
      </header>

      <p className="sq-paused" role="status">⏸ Auction paused — it continues from this exact point when you press NEXT.</p>

      <nav className="sq-switch" aria-label="Switch franchise">
        {teams.map((t) => (
          <Link key={t.name} to={`/squad/${encodeURIComponent(t.name)}`} replace className={t.name === team.name ? "is-active" : ""} aria-current={t.name === team.name ? "page" : undefined}>
            {t.name}
          </Link>
        ))}
      </nav>

      <main className="sq-main">
        <section className="sq-overview" aria-label="Squad overview">
          <div className="sq-stat"><span>Players</span><b>{st.size}</b><small>{st.slotsLeft} slots left</small></div>
          <div className="sq-stat"><span>Purse left</span><b>₹{st.purse.toFixed(1)}</b><small>Cr</small></div>
          <div className="sq-stat"><span>Spent</span><b>₹{st.spent.toFixed(1)}</b><small>of ₹{st.startingPurse} Cr</small></div>
          <div className="sq-stat"><span>Overseas / India</span><b>{st.overseas} / {st.domestic}</b><small>max {st.maxOverseas} overseas</small></div>
          {ROLE_ORDER.map((r) => (
            <div key={r} className={`sq-stat sq-stat-role ar-role-${r}`}><span>{ROLE_LABEL[r]}</span><b>{st.counts[r]}</b><small>{ROLE_META[r].short}</small></div>
          ))}
        </section>

        <section className="sq-meters" aria-label="Budget and composition">
          <Meter label="Squad occupancy" value={st.size} max={st.maxSize} text={`${st.size} / ${st.maxSize}`} />
          <Meter label="Overseas occupancy" value={st.overseas} max={st.maxOverseas} text={`${st.overseas} / ${st.maxOverseas}`} />
          <Meter label="Purse spent" value={st.spent} max={st.startingPurse} text={`₹${st.spent.toFixed(1)} / ₹${st.startingPurse} Cr`} />
        </section>

        {st.size === 0 ? (
          <section className="sq-empty">
            <h2>No players yet</h2>
            <p>{team.name} hasn&apos;t bought or retained anyone so far.</p>
          </section>
        ) : (
          groups.map(([role, list]) => (
            <section key={role} className="sq-group">
              <h2>{ROLE_LABEL[role] || role} <span>{list.length}</span></h2>
              <ul className="sq-grid">
                {list.map((p) => <PlayerCard key={p.id} player={p} />)}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

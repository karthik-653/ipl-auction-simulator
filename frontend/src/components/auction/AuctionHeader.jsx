import { LayoutGrid } from "lucide-react";
import "./premium.css";

function AuctionHeader({ onViewSets, title = "Auction Room" }) {
  return (
    <header className="ar-header">
      <div className="ar-brand">
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="none" stroke="var(--gold)" strokeWidth="2" />
          <path d="M7 20c3-9 11-13 19-9" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="22" cy="22" r="3.2" fill="var(--live)" />
        </svg>
        <div>
          <span className="ar-brand-kicker">IPL Auction Simulator</span>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="ar-header-actions">
        <button type="button" className="ar-ghost-btn" onClick={onViewSets} aria-label="View sets">
          <LayoutGrid size={16} aria-hidden="true" />
          <span className="ar-btn-label">View sets</span>
        </button>
      </div>
    </header>
  );
}

export default AuctionHeader;

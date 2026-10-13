// Honest status: a ring is only drawn when a real countdown is running;
// otherwise the state itself is shown (live / going once-thrice / result).
const HAMMER = { "GOING ONCE": 1, "GOING TWICE": 2, "GOING THRICE": 3 };

export default function AuctionStatus({
  phase, windowInfo, auctionStatus, leadingTeam, playerIndex, total, completedInSet, setSize, setName, userIn,
}) {
  const hammer = HAMMER[auctionStatus] || 0;
  const counting = Boolean(windowInfo) && phase !== "resolved";
  const pct = counting ? Math.min(1, windowInfo.remainingMs / windowInfo.totalMs) : 0;
  const secs = counting ? Math.ceil(windowInfo.remainingMs / 1000) : 0;
  const urgent = counting && windowInfo.remainingMs <= 2000;

  let mode = "idle";
  let big = "—";
  let small = "WAITING";
  if (phase === "resolved") {
    mode = "done";
    big = leadingTeam === "Base Price" ? "✕" : "✓";
    small = leadingTeam === "Base Price" ? "UNSOLD" : "SOLD";
  } else if (hammer) {
    mode = "hammer";
    big = String(hammer);
    small = "GOING";
  } else if (counting) {
    mode = urgent ? "urgent" : "count";
    big = String(secs);
    small = windowInfo.kind === "respond" ? "YOUR MOVE" : "OPEN BIDDING";
  } else if (phase === "bidding") {
    mode = "live";
    big = "LIVE";
    small = userIn ? "BIDDING" : "AI ONLY";
  }

  return (
    <div className="ar-card ar-status" aria-label="Auction status">
      <h3 className="ar-card-title">Auction status</h3>
      <div className={`ar-ring is-${mode}`} style={{ "--p": `${pct * 360}deg` }} role="timer" aria-label={`${small} ${big}`}>
        <div className="ar-ring-inner">
          <span className="ar-ring-big">{big}</span>
          <span className="ar-ring-small">{small}</span>
        </div>
      </div>
      {hammer > 0 && (
        <div className="ar-hammer" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= hammer ? "on" : ""} />
          ))}
        </div>
      )}
      <dl className="ar-status-rows">
        <div>
          <dt>Lot</dt>
          <dd>{playerIndex + 1} / {total}</dd>
        </div>
        <div>
          <dt>In set</dt>
          <dd>{completedInSet} / {setSize}</dd>
        </div>
        <div>
          <dt>Set</dt>
          <dd>{setName}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{auctionStatus}</dd>
        </div>
      </dl>
    </div>
  );
}

import "./TeamCard.css";

function TeamCard({
  team,
  isUser = false,
  isLeading = false,
}) {
  return (
    <div
      className={`team-card
        ${isUser ? "user-team" : ""}
        ${isLeading ? "leading-team" : ""}
      `}
    >
      <div className="team-name">

        <strong>{team.name}</strong>

        {isLeading && (
          <span className="leader-badge">
            LEADING
          </span>
        )}

      </div>

      <div className="team-details">

        <p>
          Purse
          <span>₹{team.purse.toFixed(2)} Cr</span>
        </p>

        <p>
          Players
          <span>{team.squad?.length || 0}</span>
        </p>

      </div>

    </div>
  );
}

export default TeamCard;
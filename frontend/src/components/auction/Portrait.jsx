import { useState } from "react";
import { ROLE_META } from "../../data/teamAssets";
import { portraitUrl } from "../../data/portraits";

// Cartoon portrait assigned deterministically from the player's id/nationality
// (see data/portraits.js). If the image is missing or fails to load, a designed
// silhouette is shown instead, so the spotlight never has a broken image.
export default function Portrait({ player }) {
  const meta = ROLE_META[player.role] || { short: "PLR", label: player.role };
  const src = player.portrait || portraitUrl(player);
  const [failedSrc, setFailedSrc] = useState(null);
  const useImage = Boolean(src) && failedSrc !== src;
  const initials = player.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="ar-portrait" role="img" aria-label={`${player.name}, ${meta.label}`}>
      {useImage ? (
        <img src={src} alt="" width="512" height="512" decoding="async" draggable="false" onError={() => setFailedSrc(src)} />
      ) : (
        <svg viewBox="0 0 200 240" aria-hidden="true" data-fallback="true">
          <defs>
            <linearGradient id="ar-sil" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8fa3c4" />
              <stop offset="1" stopColor="#2a3a5c" />
            </linearGradient>
          </defs>
          <path
            d="M100 22c-22 0-38 18-38 42 0 18 8 33 20 41-34 9-58 32-62 70l-2 65h164l-2-65c-4-38-28-61-62-70 12-8 20-23 20-41 0-24-16-42-38-42z"
            fill="url(#ar-sil)"
          />
          <text x="100" y="205" textAnchor="middle" className="ar-portrait-initials">
            {initials}
          </text>
        </svg>
      )}
      <span className={`ar-role-badge ar-role-${player.role}`}>{meta.short}</span>
    </div>
  );
}

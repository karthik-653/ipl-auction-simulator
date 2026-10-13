import { useState } from "react";
import { logoFor } from "../../data/teamAssets";

// Franchise emblem: the shipped logo, or a neutral monogram if it can't load.
export default function TeamBadge({ name, size = 40, className = "" }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!name || name === "Base Price" || failed) {
    return (
      <span className={`ar-badge ar-badge-mono ${className}`} style={style} aria-hidden="true">
        {name && name !== "Base Price" ? name.slice(0, 3) : "–"}
      </span>
    );
  }
  return (
    <img
      className={`ar-badge ${className}`}
      style={style}
      src={logoFor(name)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

import { useState } from "react";
import { portraitUrl } from "../../data/portraits";

// Cartoon portrait with the established initials fallback.
export default function PlayerThumb({ player, size = 44 }) {
  const [failed, setFailed] = useState(false);
  const initials = player.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="xi-thumb" style={{ width: size, height: size }} aria-hidden="true">
      {failed ? <b>{initials}</b> : (
        <img src={player.portrait || portraitUrl(player)} alt="" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

// Draws a Playing XI card to a canvas (no libraries) and copies it as a PNG.
import { portraitUrl } from "../data/portraits.js";
import { logoFor } from "../data/teamAssets.js";
import { IMPACT_SLOT, XI_SIZE } from "./lineup.js";

const ROLE = { Batter: "BAT", Bowler: "BOWL", AllRounder: "AR", WicketKeeper: "WK" };
const ROLE_COLOR = { Batter: "#4f8cff", Bowler: "#ef5b5b", AllRounder: "#34c38f", WicketKeeper: "#f2b134" };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const loadImg = (src) =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });

const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fit = (ctx, text, max) => {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > max) text = text.slice(0, -1);
  return `${text}…`;
};

function avatar(ctx, img, p, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#26324a";
  ctx.fill();
  ctx.clip();
  if (img) ctx.drawImage(img, x, y, r * 2, r * 2);
  else {
    ctx.fillStyle = "#c9d4ea";
    ctx.font = `800 ${r * 0.8}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(p.name), x + r, y + r + 1);
  }
  ctx.restore();
}

function row(ctx, img, p, x, y, w, h, label) {
  ctx.fillStyle = "#18213a";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.fillStyle = ROLE_COLOR[p.role] || "#6b7a99";
  ctx.fillRect(x, y + 8, 4, h - 16);
  let tx = x + 16;
  if (label) {
    ctx.fillStyle = "#12a597";
    ctx.font = `800 ${h * 0.4}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, tx, y + h / 2 + 1);
    tx += label.length > 2 ? 46 : 30;
  }
  const r = h / 2 - 7;
  avatar(ctx, img, p, tx, y + 7, r);
  tx += r * 2 + 10;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f2f5fb";
  ctx.font = `700 ${Math.round(h * 0.34)}px ${FONT}`;
  const sub = `${ROLE[p.role] || p.role}${p.nation === "Foreigner" ? " · Overseas" : ""}`;
  ctx.fillText(fit(ctx, p.name, x + w - tx - 10), tx, y + h / 2 - 1);
  ctx.fillStyle = "#8d9bb8";
  ctx.font = `600 ${Math.round(h * 0.26)}px ${FONT}`;
  ctx.fillText(sub, tx, y + h / 2 + h * 0.25);
}

/** slots: 12 player ids; squad: team players. Returns a PNG Blob. */
export async function renderLineupImage({ teamName, slots, squad }) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const xi = slots.slice(0, XI_SIZE).map((id) => byId.get(id)).filter(Boolean);
  const impact = byId.get(slots[IMPACT_SLOT]);
  const used = new Set(slots.filter((x) => x != null));
  const bench = squad.filter((p) => !used.has(p.id)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  const [logo, ...imgs] = await Promise.all([loadImg(logoFor(teamName)), ...squad.map((p) => loadImg(p.portrait || portraitUrl(p)))]);
  const img = new Map(squad.map((p, i) => [p.id, imgs[i]]));

  const W = 1200, PAD = 40, GAP = 14, HEAD = 120;
  const colW = (W - PAD * 2 - GAP * 2) / 2;
  const XH = 56, BH = 46;
  const left = HEAD + 44 + xi.length * (XH + 8) + (impact ? 44 + XH : 0);
  const right = HEAD + 44 + bench.length * (BH + 6);
  const H = Math.max(left, right) + 70;

  const scale = 2; // crisp when pasted
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0e131b");
  g.addColorStop(1, "#13203a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (logo) ctx.drawImage(logo, PAD, 28, 72, 72);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#12a597";
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText("PLAYING XI", PAD + 90, 52);
  ctx.fillStyle = "#f2f5fb";
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(teamName, PAD + 90, 94);

  const head = (text, x, y, color = "#f2f5fb") => {
    ctx.fillStyle = color;
    ctx.font = `800 18px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text.toUpperCase(), x, y);
  };

  const x1 = PAD, x2 = PAD + colW + GAP * 2;
  let y = HEAD + 22;
  head(`Starting XI`, x1, y);
  y += 14;
  xi.forEach((p, i) => { row(ctx, img.get(p.id), p, x1, y, colW, XH, String(i + 1)); y += XH + 8; });
  if (impact) {
    y += 14;
    head("Impact Player / Substitute", x1, y, "#e0932b");
    y += 14;
    row(ctx, img.get(impact.id), impact, x1, y, colW, XH, "IMP");
  }

  y = HEAD + 22;
  head(`Rest of the squad (${bench.length})`, x2, y);
  y += 14;
  bench.forEach((p) => { row(ctx, img.get(p.id), p, x2, y, colW, BH); y += BH + 6; });

  ctx.fillStyle = "#6b7a99";
  ctx.font = `600 13px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("IPL Auction Simulator", W - PAD, H - 24);

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the image."))), "image/png"));
}

/** Copy to clipboard. Resolves "copied", or "unsupported" so the caller can offer a download. */
export async function copyLineupImage(args) {
  const blobPromise = renderLineupImage(args);
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return { status: "unsupported", blob: await blobPromise };
  try {
    // the promise is handed over immediately so the click gesture is not lost
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
    return { status: "copied" };
  } catch {
    return { status: "unsupported", blob: await blobPromise };
  }
}

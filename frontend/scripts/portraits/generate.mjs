// Generates the portrait library:  node scripts/portraits/generate.mjs
//   public/portraits/portrait_001.webp ... (one file per character, transparent)
//   scripts/portraits/svg/portrait_001.svg (editable sources)
//   scripts/portraits/contact-sheet.png (preview only; never used in the app)
// Uses the locally installed Chrome (headless) to rasterise; no network, no paid tools.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { characterSvg } from "./characters.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../../public/portraits");
const svgDir = path.join(here, "svg");
mkdirSync(outDir, { recursive: true });
mkdirSync(svgDir, { recursive: true });

const pick = (list, i, a, b = 0) => list[(i * a + b) % list.length];

// expression "personalities": eyes + brows + mouth that belong together
const PERSONAS = [
  { eyes: "happy", brows: "default", mouth: "grin" }, // cheerful
  { eyes: "wide", brows: "raised", mouth: "oh" }, // surprised
  { eyes: "wink", brows: "cheeky", mouth: "tongue" }, // cheeky
  { eyes: "angry", brows: "angry", mouth: "gritted" }, // intense
  { eyes: "smug", brows: "cheeky", mouth: "smirk" }, // smug
  { eyes: "crazy", brows: "raised", mouth: "buck" }, // ridiculous
  { eyes: "wide", brows: "angry", mouth: "shout" }, // roaring
  { eyes: "sleepy", brows: "worried", mouth: "default" }, // sleepy
  { eyes: "normal", brows: "bushy", mouth: "smirk" }, // confident
  { eyes: "shades", brows: "default", mouth: "smirk" }, // too cool
  { eyes: "normal", brows: "worried", mouth: "gritted" }, // nervous
  { eyes: "crazy", brows: "unibrow", mouth: "tongue" }, // goofy
];
const KITS = [
  ["#e63946", "#ffd166"], ["#1d6fd8", "#ffffff"], ["#0f9d58", "#ffe14d"], ["#f4a300", "#1b2a49"], ["#7b3fe4", "#ffd2f0"],
  ["#00a6a6", "#fff"], ["#d62828", "#1b1b1b"], ["#2ec4b6", "#ff7f50"], ["#ff6b35", "#fff3b0"], ["#3a86ff", "#ffbe0b"],
  ["#8338ec", "#fff"], ["#ef476f", "#ffd166"], ["#118ab2", "#f1faee"], ["#06d6a0", "#073b4c"],
];
const HATS = ["#f7f3e8", "#1d6fd8", "#e63946", "#ffd166", "#0f9d58", "#264653", "#ff6b35", "#7b3fe4"];

const POOLS = {
  indian: {
    skin: ["#c98a5b", "#b87546", "#a0653a", "#8a5230", "#d9a46c", "#7a4a2a", "#c47f50", "#e0b07a", "#9a5c34"],
    hair: ["#17121a", "#241a14", "#2b1d16", "#17121a", "#5d5d63", "#17121a"],
    moustache: ["thick", "none", "handlebar", "pencil", "none", "walrus", "none"],
    beard: ["none", "full", "stubble", "none", "goatee", "none", "chops"],
  },
  overseas: {
    skin: ["#f6d3b3", "#efc39a", "#e5b184", "#d49a6a", "#c68a5a", "#8d5a3b", "#6b4328", "#4a2f1d", "#f2c7a5", "#3a2518", "#e8b98c"],
    hair: ["#e8c35a", "#b5521f", "#5a3a22", "#2b1d16", "#17121a", "#d8d8d8", "#8a5a2b", "#f0d98a"],
    moustache: ["none", "handlebar", "none", "thick", "none", "pencil", "walrus"],
    beard: ["none", "stubble", "full", "none", "none", "goatee", "soul"],
  },
};
const HAIRS = ["crop", "spiky", "sidepart", "afro", "long", "bun", "mohawk", "receding", "curly", "none", "crop", "sidepart"];
const HEADWEAR = ["cap", "none", "helmet", "none", "bucket", "headband", "none", "cap", "bandana", "none", "helmet", "none"];
const NOSES = ["round", "long", "button", "hook", "wide"];

export const buildSpecs = () =>
  Array.from({ length: 35 }, (_, k) => {
    const n = k + 1;
    const pool = n <= 18 ? "indian" : "overseas";
    const P = POOLS[pool];
    const i = k;
    const persona = PERSONAS[(i * 5 + 2) % PERSONAS.length];
    const kit = pick(KITS, i, 3, 1);
    let headwear = pick(HEADWEAR, i, 7, 3);
    let hair = pick(HAIRS, i, 5, 2);
    if (headwear === "helmet" && ["afro", "mohawk", "spiky", "bun"].includes(hair)) hair = "crop";
    if (headwear === "cap" && ["afro", "mohawk", "spiky", "bun"].includes(hair)) hair = "curly";
    if (["bucket", "bandana"].includes(headwear) && ["afro", "mohawk", "spiky", "bun", "long"].includes(hair)) hair = "sidepart";
    return {
      id: n, pool,
      skin: pick(P.skin, i, 4, 1),
      hairColor: pick(P.hair, i, 5, 2),
      hair, headwear,
      hatColor: pick(HATS, i, 3, 2),
      jersey: kit[0], trim: kit[1],
      collar: pick(["v", "polo", "round"], i, 2, 1),
      eyes: persona.eyes, brows: persona.brows, mouth: persona.mouth,
      nose: pick(NOSES, i, 3, 0),
      moustache: pick(P.moustache, i, 3, 1),
      beard: pick(P.beard, i, 5, 4),
      w: 192 + ((i * 37) % 34),
      h: 216 + ((i * 53) % 30),
      chin: 0.14 + ((i * 29) % 26) / 100,
      ear: 0.85 + ((i * 17) % 7) / 10,
      look: [-1, 0, 1, 0, -1, 1][i % 6],
      earring: i % 7 === 3,
      blush: i % 4 === 1,
      zinc: i % 6 === 4,
      mole: i % 9 === 5,
      sweat: persona.mouth === "gritted" || persona.eyes === "wide",
    };
  });

const pad = (n) => String(n).padStart(3, "0");

async function main() {
  const specs = buildSpecs();
  const svgs = specs.map((s) => characterSvg(s));
  specs.forEach((s, i) => writeFileSync(path.join(svgDir, `portrait_${pad(s.id)}.svg`), svgs[i]));

  const profile = mkdtempSync(path.join(tmpdir(), "portrait-chrome-"));
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", "--remote-debugging-port=9477", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank",
  ], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let list;
  for (let i = 0; i < 40; i++) { try { list = await (await fetch("http://127.0.0.1:9477/json")).json(); break; } catch { await sleep(250); } }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pend.get(d.id)?.(d); };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };

  await send("Page.enable");
  await send("Page.navigate", { url: "about:blank" });
  await sleep(300);

  // rasterise each SVG to a transparent 512px WebP via canvas (one file per character)
  const sizes = [];
  const margins = [];
  for (let i = 0; i < specs.length; i++) {
    const b64raw = await ev(`(async()=>{const svg=${JSON.stringify(svgs[i])};const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();const c=document.createElement('canvas');c.width=512;c.height=512;const x=c.getContext('2d');x.drawImage(img,0,0,512,512);const d=x.getImageData(0,0,512,512).data;let top=512,empty=true;for(let y=0;y<512&&top===512;y++){for(let xx=0;xx<512;xx++){if(d[(y*512+xx)*4+3]>20){top=y;empty=false;break}}}return JSON.stringify({top,empty,b64:c.toDataURL('image/webp',0.88).split(',')[1]})})()`);
    const info = JSON.parse(b64raw);
    margins.push(info.top);
    if (info.empty) throw new Error('empty portrait '+i);
    const buf = Buffer.from(info.b64, "base64");
    writeFileSync(path.join(outDir, `portrait_${pad(specs[i].id)}.webp`), buf);
    sizes.push(buf.length);
  }
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({
    count: specs.length,
    pools: { indian: specs.filter((s) => s.pool === "indian").map((s) => s.id), overseas: specs.filter((s) => s.pool === "overseas").map((s) => s.id) },
  }, null, 2));

  // contact sheet (preview only)
  const cells = specs.map((s, i) => `<div style="text-align:center;font:12px sans-serif;color:#cbd5e1"><div style="width:180px;height:180px;background:${i % 2 ? "#1b2230" : "#2a3446"};border-radius:12px"><img width=180 height=180 src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgs[i])}"></div>${pad(s.id)} · ${s.pool}</div>`).join("");
  await send("Emulation.setDeviceMetricsOverride", { width: 1320, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`document.body.style.cssText='margin:0;padding:16px;background:#0e131b;display:grid;grid-template-columns:repeat(7,180px);gap:14px 14px';document.body.innerHTML=${JSON.stringify(cells)};true`);
  await sleep(600);
  const h = await ev("document.body.scrollHeight");
  await send("Emulation.setDeviceMetricsOverride", { width: 1320, height: h + 16, deviceScaleFactor: 1, mobile: false });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(here, "contact-sheet.png"), Buffer.from(shot.result.data, "base64"));

  ws.close(); chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir; ignore */ }
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(`top margin px: min ${Math.min(...margins)}, max ${Math.max(...margins)}`);
  console.log(`created ${specs.length} portraits, total ${(total / 1024).toFixed(0)} KB (avg ${(total / specs.length / 1024).toFixed(1)} KB, max ${(Math.max(...sizes) / 1024).toFixed(1)} KB)`);
}
main();

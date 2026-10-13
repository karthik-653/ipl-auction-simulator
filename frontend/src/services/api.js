// Backend save API (proxied to the FastAPI server by Vite in dev).
// Browser/dev: relative URL (Vite proxies /api to the backend).
// Android app: set VITE_API_BASE at build time to the backend's HTTPS URL.
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
const BASE = `${API_BASE}/api/save`;

async function parse(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = new Error(body?.detail || body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body?.error;
    throw err;
  }
  return body;
}

export const SAVE_URL = BASE;

export const getSaveInfo = () => fetch(BASE).then(parse);

/** Raw snapshot text so corruption is detectable by the caller. */
export async function getSaveData() {
  const res = await fetch(`${BASE}/data`);
  if (!res.ok) await parse(res);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("The saved data is corrupted and could not be read.");
    err.code = "corrupt";
    throw err;
  }
}

export const putSave = ({ snapshot, replace = false }) =>
  fetch(BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot, replace }),
  }).then(parse);

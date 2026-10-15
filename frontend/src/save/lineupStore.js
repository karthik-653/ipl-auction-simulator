// Playing XI persistence: submitted lineups live on the backend (per auction
// session + team); unfinished work is kept as a per-team draft on this device so
// it survives leaving the editor or refreshing. Drafts are never the only copy of
// a submitted lineup.
import { useCallback, useEffect, useState } from "react";
import * as api from "../services/api";

const draftKey = (sessionId, team) => `ipl-xi-draft:${sessionId}:${team}`;

export function loadDraft(sessionId, team, storage = globalThis.localStorage) {
  try {
    const d = JSON.parse(storage.getItem(draftKey(sessionId, team)));
    return Array.isArray(d?.slots) && d.slots.length === 12 ? d.slots : null;
  } catch {
    return null;
  }
}

export function saveDraft(sessionId, team, slots, storage = globalThis.localStorage) {
  try {
    storage.setItem(draftKey(sessionId, team), JSON.stringify({ slots, at: Date.now() }));
  } catch {
    /* storage unavailable: the backend copy is still authoritative */
  }
}

export function clearDraft(sessionId, team, storage = globalThis.localStorage) {
  try {
    storage.removeItem(draftKey(sessionId, team));
  } catch {
    /* ignore */
  }
}

export const hasDraft = (sessionId, team) => loadDraft(sessionId, team) != null;

/** Submitted lineups of the current auction, keyed by team name. `loaded` turns
 * true after the first successful fetch; later reloads keep the data in place. */
export function useLineups(sessionId) {
  const [state, setState] = useState({ loading: true, loaded: false, lineups: {}, error: null });
  const load = useCallback(async () => {
    if (!sessionId) {
      setState({ loading: false, loaded: false, lineups: {}, error: new Error("No active auction session.") });
      return;
    }
    try {
      const { lineups } = await api.getLineups(sessionId);
      setState({ loading: false, loaded: true, lineups, error: null });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [sessionId]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

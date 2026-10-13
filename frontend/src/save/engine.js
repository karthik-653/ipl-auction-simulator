// One save engine + session holder for the whole app (there is exactly one
// saved game). SaveProvider binds the live callbacks into `bindings`.
import * as api from "../services/api";
import { SaveEngine } from "./saveEngine";

export const session = { id: null };
export const bindings = { getGame: () => null, onStatus: () => {} };

export const engine = new SaveEngine({
  api,
  getGame: () => bindings.getGame(),
  getSessionId: () => session.id,
  onStatus: (state, error) => bindings.onStatus(state, error),
});

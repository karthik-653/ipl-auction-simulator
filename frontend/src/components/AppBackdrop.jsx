import { BACKDROP_PORTRAIT } from "../data/portraits";

// App-wide background artwork: one of the cartoon portraits, large and faint,
// fixed behind every screen. Purely decorative.
export default function AppBackdrop() {
  return (
    <div
      className="app-backdrop"
      aria-hidden="true"
      style={{ "--backdrop": `url(/portraits/${BACKDROP_PORTRAIT})` }}
    />
  );
}

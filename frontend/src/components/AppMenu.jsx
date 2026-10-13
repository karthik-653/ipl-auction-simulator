import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, CircleAlert, Loader2, LogOut, Menu, Moon, Save, Sigma, Sun, X } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import { useSave } from "../save/SaveContext";

const STATUS = {
  saved: { icon: Check, text: "Saved", cls: "ok" },
  saving: { icon: Loader2, text: "Saving…", cls: "busy" },
  unsaved: { icon: CircleAlert, text: "Unsaved changes", cls: "warn" },
  error: { icon: CircleAlert, text: "Save failed", cls: "err" },
};

// Hamburger menu (fixed top-right) + unobtrusive save-status pill.
export default function AppMenu() {
  const { theme, toggleTheme } = useTheme();
  const { hasSession, status, busy, saveNow, saveAndExit, resumeRoute } = useSave();
  // the menu is "open" only for the route it was opened on, so it closes on navigation
  const [openAt, setOpenAt] = useState(null);
  const location = useLocation();
  const open = openAt === location.pathname;
  const setOpen = (v) => setOpenAt((cur) => ((typeof v === "function" ? v(cur === location.pathname) : v) ? location.pathname : null));
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const dark = theme === "dark";

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...rootRef.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const st = STATUS[status.state] ?? STATUS.saved;
  const StIcon = st.icon;

  return (
    <div className="app-controls" ref={rootRef}>
      {hasSession && (
        <span className={`save-pill ${st.cls}`} role="status" title={status.error?.message || st.text}>
          <StIcon size={14} aria-hidden="true" className={status.state === "saving" ? "spin" : ""} />
          <span>{st.text}</span>
        </span>
      )}
      <button
        ref={btnRef}
        type="button"
        className="menu-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="app-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      {open && (
        <div id="app-menu" className="app-menu" role="menu" aria-label="Game menu" onKeyDown={onMenuKey}>
          <button
            role="menuitem"
            disabled={!hasSession || busy}
            title={hasSession ? "Save the current game" : "Start or continue a game first"}
            onClick={async () => {
              await saveNow();
              setOpen(false);
            }}
          >
            <Save size={16} aria-hidden="true" /> Save Game
          </button>
          <button
            role="menuitem"
            disabled={!hasSession || busy}
            title={hasSession ? "Save, then return to the home screen" : "Start or continue a game first"}
            onClick={() => {
              setOpen(false);
              saveAndExit();
            }}
          >
            <LogOut size={16} aria-hidden="true" /> Save &amp; Exit
          </button>
          <hr />
          <Link role="menuitem" to="/math">
            <Sigma size={16} aria-hidden="true" /> Auction Math
          </Link>
          <button
            role="menuitem"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          {hasSession && location.pathname === "/math" && (
            <Link role="menuitem" to={resumeRoute()}>
              ← Back to game
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

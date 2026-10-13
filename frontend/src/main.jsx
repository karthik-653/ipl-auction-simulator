import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./index.css";
import "./theme.css";
import App from "./App";
import { AuctionProvider } from "./context/AuctionContext";
import { ThemeProvider } from "./theme/ThemeContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <AuctionProvider>
        <App />
      </AuctionProvider>
    </ThemeProvider>
  </StrictMode>
);
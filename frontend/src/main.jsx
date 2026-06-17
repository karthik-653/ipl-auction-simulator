import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuctionProvider } from "./context/AuctionContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuctionProvider>
      <App />
    </AuctionProvider>
  </StrictMode>
);
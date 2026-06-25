import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import TeamSelection from "./pages/TeamSelection";
import Retention from "./pages/Retention";
import AuctionRoom from "./pages/AuctionRoom";
import Squads from "./pages/Squads";
import AuctionSummary from "./pages/AuctionSummary";
import SetsPage from "./pages/SetsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teams" element={<TeamSelection />} />
        <Route path="/retention" element={<Retention />} />
        <Route path="/auction" element={<AuctionRoom />} />
        <Route path="/squads" element={<Squads />} />
        <Route path="/summary" element={<AuctionSummary />} />
        <Route path="/sets" element={<SetsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

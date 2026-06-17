import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import TeamSelection from "./pages/TeamSelection";
import Retention from "./pages/Retention";
import AuctionRoom from "./pages/AuctionRoom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teams" element={<TeamSelection />} />
        <Route path="/retention" element={<Retention />} />
        <Route path="/auction" element={<AuctionRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
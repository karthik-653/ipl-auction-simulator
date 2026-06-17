import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h1>IPL Auction Simulator</h1>

      <button onClick={() => navigate("/teams")}>
        Start New Auction
      </button>
    </div>
  );
}

export default Home;
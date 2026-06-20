import { useNavigate } from "react-router-dom";

function Retention() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Retention Screen</h1>

      <button onClick={() => navigate("/auction")}>Proceed To Auction</button>
    </div>
  );
}

export default Retention;

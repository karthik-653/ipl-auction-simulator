import { useContext } from "react";
import { AuctionContext } from "../context/AuctionContext";
import { players } from "../data/players";

function SetsPage() {
  const { setHistory } = useContext(AuctionContext);

  const auctionPlayers = players.filter((player) => !player.retained);

  const allSets = [...new Set(auctionPlayers.map((player) => player.set))];

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "1000px",
        margin: "0 auto",
      }}
    >
      <h1>Auction Sets</h1>

      {allSets.map((setName) => {
        const historyPlayers = setHistory[setName] || [];

        const setPlayers = auctionPlayers.filter(
          (player) => player.set === setName,
        );

        const totalSpent = historyPlayers
          .filter((player) => player.team !== "Base Price")
          .reduce((sum, player) => sum + player.price, 0);

        return (
          <div
            key={setName}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "20px",
              borderRadius: "8px",
            }}
          >
            <h2>{setName}</h2>

            <p>
              <strong>Completed:</strong> {historyPlayers.length} /{" "}
              {setPlayers.length}
            </p>

            <p>
              <strong>Pending:</strong>{" "}
              {setPlayers.length - historyPlayers.length}
            </p>

            <p>
              <strong>Total Spending:</strong> ₹{totalSpent.toFixed(1)} Cr
            </p>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: "10px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "left",
                      padding: "8px",
                    }}
                  >
                    Player
                  </th>

                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "left",
                      padding: "8px",
                    }}
                  >
                    Team
                  </th>

                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      textAlign: "left",
                      padding: "8px",
                    }}
                  >
                    Price
                  </th>
                </tr>
              </thead>

              <tbody>
                {setPlayers.map((player) => {
                  const result = historyPlayers.find(
                    (entry) => entry.player === player.name,
                  );

                  return (
                    <tr key={player.id}>
                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {player.name}
                      </td>

                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {result
                          ? result.team === "Base Price"
                            ? "UNSOLD"
                            : result.team
                          : "Pending"}
                      </td>

                      <td
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {result
                          ? result.team === "Base Price"
                            ? "-"
                            : `₹${result.price} Cr`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default SetsPage;

import { createContext, useState } from "react";

export const AuctionContext = createContext();

export const AuctionProvider = ({ children }) => {
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [purse, setPurse] = useState(120);

  const [squad, setSquad] = useState([]);

  const [retentions, setRetentions] = useState([]);

  return (
    <AuctionContext.Provider
      value={{
        selectedTeam,
        setSelectedTeam,

        purse,
        setPurse,

        squad,
        setSquad,

        retentions,
        setRetentions,
      }}
    >
      {children}
    </AuctionContext.Provider>
  );
};
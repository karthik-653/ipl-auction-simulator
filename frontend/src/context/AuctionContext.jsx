import { createContext, useState } from "react";

export const AuctionContext = createContext();

export const AuctionProvider = ({ children }) => {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [retentions, setRetentions] = useState([]);
  const [purse, setPurse] = useState(120);

  return (
    <AuctionContext.Provider
      value={{
        selectedTeam,
        setSelectedTeam,
        retentions,
        setRetentions,
        purse,
        setPurse,
      }}
    >
      {children}
    </AuctionContext.Provider>
  );
};
import { createContext, useState } from "react";

export const AuctionContext = createContext();

export const AuctionProvider = ({ children }) => {
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [purse, setPurse] = useState(120);

  const [squad, setSquad] = useState([]);

  const [retentions, setRetentions] = useState([]);

  const [playerIndex, setPlayerIndex] = useState(0);

  const [currentBid, setCurrentBid] = useState(0);

  const [leadingTeam, setLeadingTeam] = useState("Base Price");

  const [auctionTeams, setAuctionTeams] = useState([]);

  const [unsoldPlayers, setUnsoldPlayers] = useState([]);

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

        playerIndex,
        setPlayerIndex,

        currentBid,
        setCurrentBid,

        leadingTeam,
        setLeadingTeam,

        auctionTeams,
        setAuctionTeams,

        unsoldPlayers,
        setUnsoldPlayers,
      }}
    >
      {children}
    </AuctionContext.Provider>
  );
};

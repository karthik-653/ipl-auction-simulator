import { createContext, useState } from "react";
import { players } from "../data/players";

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
  const [auctionInitialized, setAuctionInitialized] = useState(false);
  const [auctionQueue, setAuctionQueue] = useState([]);

  const [unsoldPlayers, setUnsoldPlayers] = useState([]);
  const [setHistory, setSetHistory] = useState({});

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

        setHistory,
        setSetHistory,

        auctionInitialized,
        setAuctionInitialized,

        auctionQueue,
        setAuctionQueue,
      }}
    >
      {children}
    </AuctionContext.Provider>
  );
};

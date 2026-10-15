/* global process */
// Answers "why did team X do Y?" from real simulated auctions using the
// structured diagnostics:  node src/logic/explain.js [seeds]
import { runAuction } from "./simulation.js";
import { explainTeam } from "./diagnostics.js";
import { playerTraits } from "./market.js";

const N = Number(process.argv[2] || 12);
const found = {};
const want = (k) => !found[k];
const show = (k, title, round, team, note) => {
  found[k] = true;
  const e = explainTeam(round, team);
  console.log(`\n### ${title}`);
  console.log(note ? `    (${note})` : "");
  console.log(`    ${e.team} [${e.philosophy}] on ${e.player} (${e.role}, ${e.rating}); final ${e.finalPrice} Cr -> ${e.winner}`);
  console.log(`    valuation ${e.valuation} | ceiling ${e.ceiling} | hard max ${e.hardMax} | budget ${e.budget} | held back for future ${e.heldBackForFuture ?? 0} | role need ${e.roleNeed} | tier ${e.tier} | stretch ${e.stretch} | ceiling set by ${e.ceilingSetBy}`);
  console.log(`    strategy factors: ${e.strategyFactors.join(", ") || "none"} | bids placed ${e.bidsPlaced}`);
  console.log(`    principal reason: ${e.principalReason}`);
};

for (let seed = 1; seed <= N && Object.keys(found).length < 7; seed++) {
  runAuction(seed, {
    diagnostics: true,
    onClosed(player, round, teams) {
      const tr = playerTraits(player);
      const team = (n) => teams.find((t) => t.name === n);
      // 1 CSK declines to stretch for an experienced player
      if (want("csk") && tr.experience >= 0.85 && player.rating >= 84 && round.leader !== "CSK" && round.bids.some((b) => b.bidder === "CSK") && round.teams.CSK.state !== "INELIGIBLE") {
        const i = round.teams.CSK;
        if (round.bid > i.ceiling) show("csk", "Why did CSK refuse to stretch for an experienced player?", round, "CSK", `price ${round.bid} passed CSK's ceiling ${i.ceiling}; CSK's stretch multiplier is small`);
      }
      // 2 MI ignores a highly rated uncapped Indian prospect
      if (want("mi") && tr.prospect >= 0.7 && round.bids.every((b) => b.bidder !== "MI") && round.teams.MI) {
        show("mi", "Why did MI ignore a highly rated uncapped Indian prospect?", round, "MI", `prospect score ${tr.prospect.toFixed(2)}, MI purse ${team("MI").purse.toFixed(0)} Cr, squad ${team("MI").squad.length}/${team("MI").targetSquadSize}`);
      }
      // 3 LSG enters a war and overpays
      if (want("lsg") && round.leader === "LSG" && round.price !== null && round.bid / tr.market > 1.3 && tr.market >= 5) {
        show("lsg", "Why did LSG enter a bidding war and overpay?", round, "LSG", `paid ${(round.bid / tr.market).toFixed(2)}x the market price of ${tr.market.toFixed(1)} Cr`);
      }
      // 4 GT invests in a low-profile specialist
      if (want("gt") && round.leader === "GT" && tr.standout > 0.15 && tr.profile < 0.6 && tr.market >= 2.5 && round.teams.GT.parts?.["low-profile specialist"]) {
        show("gt", "Why did GT invest heavily in a low-profile specialist?", round, "GT", `profile ${tr.profile.toFixed(2)}, standout ${tr.standout.toFixed(2)}, paid ${(round.bid / tr.market).toFixed(2)}x market`);
      }
      // 5 PBKS did not win Shreyas Iyer
      if (want("pbks") && player.name === "Shreyas Iyer" && round.leader !== "PBKS") {
        show("pbks", "Why did PBKS not win Shreyas Iyer?", round, "PBKS", `winner ${round.leader}`);
      }
      // 6 SRH buys a star batter while its attack is incomplete
      if (want("srh") && round.leader === "SRH" && player.role === "Batter" && player.rating >= 78) {
        const sq = team("SRH").squad;
        const bowlers = sq.filter((p) => p.role === "Bowler" && p.rating >= 70).length;
        if (bowlers < 4) show("srh", "Why did SRH spend on a batter while its bowling attack was incomplete?", round, "SRH", `SRH owns ${bowlers} quality bowlers; strategy factors below show the batting discount applied`);
      }
      // 7 a team with lots of money fails to bid for a role it needs
      if (want("rich")) {
        for (const t of teams) {
          const need = round.teams[t.name]?.roleNeed ?? 0;
          if (t.purse >= 40 && need >= 0.5 && player.rating >= 70 && round.bids.every((b) => b.bidder !== t.name) && round.leader !== "Base Price") {
            show("rich", `Why did ${t.name}, with ${t.purse.toFixed(0)} Cr left, not bid for a role it needed?`, round, t.name, `squad ${t.squad.length}/${t.targetSquadSize}, overseas ${t.squad.filter((p) => p.nation === "Foreigner").length}`);
            break;
          }
        }
      }
    },
  });
}
const missing = ["csk", "mi", "lsg", "gt", "pbks", "srh", "rich"].filter((k) => !found[k]);
if (missing.length) console.log("\n(no example found in these seeds for: " + missing.join(", ") + ")");

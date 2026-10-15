import { useContext, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSave } from "../save/SaveContext";
import { AuctionContext } from "../context/AuctionContext";
import { players } from "../data/players";
import { aiTeams } from "../data/aiTeams";
import { MARKET_KNOTS } from "../logic/market";
import { TEAM_STRATEGIES, getStrategy } from "../logic/strategies";
import { BIDDING_CONFIG as CFG } from "../logic/biddingConfig";
import {
  MAX_OVERSEAS,
  MAX_SQUAD_SIZE,
  buildAiTeams,
  getBidIncrement,
  getEffectivePlayers,
  makeSeededRng,
} from "../logic/auctionLogic";
import {
  AI_STATE,
  baseValuation,
  challengeProbability,
  clampFactor,
  computeCeiling,
  getAffordableBudget,
  marketContext,
  needAdjustment,
  overseasAdjustment,
  roleNeed,
  runAiOnlyAuction,
  runResponseCycle,
  scarcityAdjustment,
  valuationBreakdown,
} from "../logic/auctionEngine";
import Chart from "../components/math/Chart";
import { Formula, Insight, Section, Slider, Tag, Vars } from "../components/math/ui";
import { cr } from "../components/math/format";
import "./MathPage.css";

const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const P = CFG.probability;

// Mean 2025 auction price per rating in the player data (what the market curve is fitted to).
const histByRating = (() => {
  const m = new Map();
  players.filter((p) => !p.retained && p.soldPrice > 0).forEach((p) => {
    const e = m.get(p.rating) || { s: 0, n: 0 };
    e.s += p.soldPrice; e.n += 1; m.set(p.rating, e);
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([x, e]) => ({ x, y: e.s / e.n }));
})();

// A synthetic franchise holding `owned` players of `role` (used to feed the
// REAL engine functions with hypothetical squads).
const syntheticTeam = ({ role = "Bowler", required = 8, owned = 0, overseas = 0, aggression = 0.8, purse = 100, size, target = 23 }) => ({
  name: "Example",
  aggression,
  purse,
  targetSquadSize: target,
  requirements: { [role]: required },
  squad: [
    ...Array.from({ length: owned }, (_, i) => ({ id: -i - 1, role, rating: 70, nation: "Indian" })),
    ...Array.from({ length: overseas }, (_, i) => ({ id: -100 - i, role: "Batter", rating: 70, nation: "Foreigner" })),
    ...Array.from({ length: Math.max(0, (size ?? 0) - owned - overseas) }, (_, i) => ({ id: -200 - i, role: "Batter", rating: 60, nation: "Indian" })),
  ],
});

const byName = (n) => players.find((p) => p.name === n);

/* ------------------------------------------------------------------ A */
function ValuationSection() {
  const [rating, setRating] = useState(90);
  const [owned, setOwned] = useState(2);
  const required = 8;
  const [foreigner, setForeigner] = useState(true);
  const [overseas, setOverseas] = useState(4);
  const [scarcity, setScarcity] = useState(0.5);

  const need = roleNeed(syntheticTeam({ owned, required }), { role: "Bowler" });
  const N = needAdjustment(need);
  const Rr = overseasAdjustment(overseas, foreigner);
  const Q = scarcityAdjustment(scarcity, rating);
  const factor = clampFactor(N + Rr + Q);
  const base = baseValuation({ rating });

  const curve = range(50, 100, 100).map((r) => ({ x: r, y: baseValuation({ rating: r }) }));
  const needCurves = [80, 90, 99].map((r) => ({
    name: `Rating ${r}`,
    points: range(0, 1, 40).map((n) => ({
      x: n,
      y: baseValuation({ rating: r }) * (1 + clampFactor(needAdjustment(n) + Rr + scarcityAdjustment(scarcity, r))),
    })),
  }));

  return (
    <Section id="valuation" kicker="A · Player valuation" title="What is a player worth?">
      <p>
        A player's <b>rating is quality</b>; what a franchise will <b>pay</b> is a separate question. The
        starting point is the <b>market price of that quality</b>, M(p), fitted to the real 2025 auction prices
        stored in the player data. Each franchise then adjusts it for <i>its own</i> situation and philosophy. <Tag kind="rule">rule</Tag>
      </p>
      <Formula label="market price of quality">
        <var>M</var>(<var>rating</var>) = piecewise-linear through {MARKET_KNOTS.filter((_, i) => i % 3 === 0).map(([r, v]) => `${r}→${v}`).join(", ")}, … (₹ Cr)
        <small>fitted to the mean 2025 price at each rating; residual by role, nationality or capped status is within ±2%</small>
      </Formula>
      <Vars items={[["rating", "The player's 0–100 rating from the player data."], ["M(p)", "Market price in ₹ crore: what the open market paid for that quality in 2025."]]} />

      <div className="math-lab">
        <Chart
          title="Rating versus baseline valuation"
          series={[{ name: "M(p) market curve", points: curve }, { name: "2025 prices (mean per rating)", points: histByRating }]}
          xLabel="Player rating"
          yLabel="Market price (₹ Cr)"
          xDomain={[50, 100]}
          yDomain={[0, 30]}
          marker={{ x: rating, y: base, label: cr(base) }}
          xFormat={(v) => v.toFixed(0)}
        />
        <div className="math-controls">
          <Slider label="Player rating" value={rating} min={50} max={100} step={1} onChange={setRating} />
          <p className="muted">
            Price rises steeply with quality: about 8 Cr at 80, 15 Cr at 90 and 27 Cr at 99. The earlier power-law
            curve priced an 87 at 7.7 Cr (real price: 12.5 Cr) and a 52-rated filler at over 1 Cr (real: 0.3 Cr).
          </p>
        </div>
      </div>
      <Insight>The market prices a 99-rated star at about {cr(baseValuation({ rating: 99 }))} before any team adjusts it.</Insight>

      <h3>Team-specific valuation</h3>
      <Formula label="team valuation">
        <var>V</var>(<var>i</var>,<var>p</var>) = <var>M</var>(<var>p</var>) × (1 + clamp(<var>N</var> + <var>R</var> + <var>Q</var> + <var>S</var> + <var>C</var> + <var>U</var>)) × noise × scale
        <small>clamp keeps the sum between {CFG.valuation.factorMin} and +{CFG.valuation.factorMax}; the chart below shows N, R and Q only (S, C, U in section I)</small>
      </Formula>
      <Vars
        items={[
          ["N", `Need: ${CFG.valuation.needMin} (role already full) rising linearly to +${CFG.valuation.needMax} (role empty).`],
          ["R", `Role-fit: overseas pressure (up to −${CFG.valuation.overseasPenalty} when the quota is full) plus +${CFG.valuation.upgradeBonus} for a clear upgrade / ${CFG.valuation.depthPenalty} for a clearly weaker duplicate.`],
          ["Q", `Scarcity: up to +${CFG.valuation.scarcityWeight} when few comparable players remain, +${CFG.valuation.eliteScarcityBonus} for rating ≥ 95, plus up to +${CFG.valuation.demandWeight} when many teams need the role but few comparable players are left.`],
          ["S", "Franchise strategy: the team's own preferences (experience, prospects, role priorities, named targets). Section I."],
          ["C / U", `C: spare cash per open slot compared with the field (up to ±${CFG.valuation.cashWeight}); U: late-auction urgency for unmet needs (up to +${CFG.valuation.lateWeight}).`],
          ["noise", "A per-lot lognormal draw whose spread is the franchise's own (LSG widest, CSK/DC tightest)."],
          ["V(i,p)", "What team i normally values player p at."],
        ]}
      />

      <div className="math-lab">
        <Chart
          title="Role need versus team valuation"
          series={needCurves}
          xLabel="Role need (0 = full, 1 = empty)"
          yLabel="V(i,p) (₹ Cr)"
          xDomain={[0, 1]}
          yDomain={[0, 32]}
          marker={{ x: need, y: base * (1 + factor), label: cr(base * (1 + factor)) }}
          xFormat={(v) => v.toFixed(1)}
        />
        <div className="math-controls">
          <Slider label={`Bowlers already owned (needs ${required})`} value={owned} min={0} max={required} step={1} onChange={setOwned} />
          <label className="math-slider">
            <span>Foreign player? <input type="checkbox" checked={foreigner} onChange={(e) => setForeigner(e.target.checked)} /></span>
          </label>
          <Slider label="Overseas players owned" value={overseas} min={0} max={MAX_OVERSEAS} step={1} onChange={setOverseas} />
          <Slider label="Scarcity (1 = almost none left)" value={scarcity} min={0} max={1} step={0.05} onChange={setScarcity} format={(v) => v.toFixed(2)} />
        </div>
      </div>
      <div className="math-scroll">
        <table className="math-table">
          <thead><tr><th>Term</th><th className="num">Value</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>M(p) at rating {rating}</td><td className="num">{base.toFixed(2)}</td><td>Market price of quality</td></tr>
            <tr><td>N (need {need.toFixed(2)})</td><td className="num">{N >= 0 ? "+" : ""}{N.toFixed(3)}</td><td>{owned} of {required} bowlers owned</td></tr>
            <tr><td>R (overseas)</td><td className="num">{Rr.toFixed(3)}</td><td>{foreigner ? `${overseas}/${MAX_OVERSEAS} overseas slots used` : "Indian player: no overseas penalty"}</td></tr>
            <tr><td>Q (scarcity)</td><td className="num">+{Q.toFixed(3)}</td><td>Scarcity {scarcity.toFixed(2)}</td></tr>
            <tr><td><b>Clamped factor</b></td><td className="num"><b>{factor >= 0 ? "+" : ""}{factor.toFixed(3)}</b></td><td>N + R + Q = {(N + Rr + Q).toFixed(3)}</td></tr>
            <tr><td><b>V(i,p)</b></td><td className="num"><b>{(base * (1 + factor)).toFixed(2)} Cr</b></td><td>{base.toFixed(2)} × (1 {factor >= 0 ? "+" : "−"} {Math.abs(factor).toFixed(3)})</td></tr>
          </tbody>
        </table>
      </div>
      <Insight>
        The same player is worth more to a team that badly needs his role and less to one whose squad
        already covers it, which is why franchises disagree on price.
      </Insight>
    </Section>
  );
}

/* ------------------------------------------------------------------ B */
function NeedsSection() {
  const archer = byName("Jofra Archer");
  const rows = [
    ["Needs a fast bowler urgently", syntheticTeam({ owned: 1, required: 8, size: 14, overseas: 3 })],
    ["Already well stocked in bowlers", syntheticTeam({ owned: 8, required: 8, size: 14, overseas: 3 })],
  ].map(([label, team]) => {
    const b = valuationBreakdown(team, archer);
    const c = computeCeiling(team, archer, {}, () => 0.5);
    return { label, team, b, c };
  });

  return (
    <Section id="needs" kicker="B · Squad composition" title="How a team measures its needs">
      <p>
        Needs come from the squad, not from opinion. For a role, the engine compares the <b>quality-weighted</b>{" "}
        number of players of that role the team owns with the team's requirement: a 55-rated filler fills a slot but
        counts only {CFG.need.minWeight} of a player, a 72+ counts fully. <Tag kind="rule">rule</Tag>
      </p>
      <Formula label="role need">
        <var>RoleNeed</var> = clamp(1 − Σ <var>weight</var>(rating) / <var>required</var>, 0, 1)
        <br />
        <var>Need</var> = clamp(0.8 × <var>RoleNeed</var> + 0.2 × <var>remainingSlots</var> / <var>targetSize</var>, 0, 1)
        <small>RoleNeed feeds the valuation (N) and stretch tier; the combined Need feeds the bid probability.</small>
      </Formula>
      <h3>Hard limits the engine enforces <Tag kind="param">parameters</Tag></h3>
      <ul>
        <li>Squad size: at most <b>{MAX_SQUAD_SIZE}</b> players; each AI team also has its own target of 22–25.</li>
        <li>Overseas: at most <b>{MAX_OVERSEAS}</b> foreign players; reaching it makes a team ineligible for foreign targets.</li>
        <li>Money: a team keeps enough for its remaining slots (next section).</li>
      </ul>
      <div className="math-scroll">
        <table className="math-table">
          <caption className="muted">Role requirements per franchise (from the team data)</caption>
          <thead><tr><th>Team</th><th className="num">Batter</th><th className="num">Bowler</th><th className="num">AllRounder</th><th className="num">WicketKeeper</th><th className="num">Aggression</th><th>Philosophy</th></tr></thead>
          <tbody>
            {aiTeams.map((t) => (
              <tr key={t.name}><td>{t.name}</td><td className="num">{t.requirements.Batter}</td><td className="num">{t.requirements.Bowler}</td><td className="num">{t.requirements.AllRounder}</td><td className="num">{t.requirements.WicketKeeper}</td><td className="num">{getStrategy(t).aggression}</td><td>{getStrategy(t).label}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Worked example <Tag kind="example">illustrative squads, real formulas</Tag></h3>
      <p>Two hypothetical teams evaluate {archer.name} (rating {archer.rating}).</p>
      <div className="math-cards">
        {rows.map(({ label, b, c }) => (
          <div key={label} className="math-card">
            <h4>{label}</h4>
            <div>Market M(p): {b.base.toFixed(2)}</div>
            <div>N: {b.N.toFixed(3)} · R: {b.R.toFixed(3)} · Q: {b.Q.toFixed(3)}</div>
            <div>V(i,p): <b>{b.value.toFixed(2)} Cr</b></div>
            <div>Priority tier: <b>{c.tier}</b></div>
            <div className="big">{cr(c.ceiling)}</div>
            <div className="muted">typical ceiling (mid-range stretch)</div>
          </div>
        ))}
      </div>
      <Insight>The needy team values the same player higher and treats him as a higher priority, so its ceiling is higher.</Insight>
    </Section>
  );
}

/* ------------------------------------------------------------------ C */
function FinanceSection() {
  const [purse, setPurse] = useState(60);
  const [squadSize, setSquadSize] = useState(12);
  const [value, setValue] = useState(12);
  const [stretch, setStretch] = useState(0.15);
  const target = 23;
  const minBase = CFG.defaultMinBasePrice;

  const budgetFor = (pu, size) => getAffordableBudget(syntheticTeam({ purse: pu, size, target }), minBase);
  const reserve = Math.max(0, target - squadSize - 1) * minBase;
  const B = budgetFor(purse, squadSize);
  const willing = value * (1 + stretch);
  const C = Math.min(B, willing);

  const pursePts = range(0, 120, 60);
  const series = [
    { name: `B, ${squadSize} players owned`, points: pursePts.map((x) => ({ x, y: budgetFor(x, squadSize) })) },
    { name: "B, 5 players owned (big reserve)", points: pursePts.map((x) => ({ x, y: budgetFor(x, 5) })) },
    { name: "B, 20 players owned (small reserve)", points: pursePts.map((x) => ({ x, y: budgetFor(x, 20) })) },
    { name: "C = min(B, V·(1+S))", points: pursePts.map((x) => ({ x, y: Math.min(budgetFor(x, squadSize), willing) })) },
  ];

  return (
    <Section id="finance" kicker="C · Money" title="Can afford is not the same as will pay">
      <Formula label="budget and ceiling">
        <var>B</var>(<var>i</var>,<var>p</var>) = purse − (target − squad − 1) × <var>minBase</var>
        <br />
        <var>C</var>(<var>i</var>,<var>p</var>) = min( <var>B</var>, <var>B</var><sub>soft</sub>, hard max, share-of-purse cap, <var>V</var>(<var>i</var>,<var>p</var>) × (1 + stretch) )
        <small>B_soft keeps a franchise-specific part of its planned future spending; hard max = {CFG.hardMax.mult}× market price (franchise-specific); the same checks run in the single bid path for every team</small>
      </Formula>
      <Vars
        items={[
          ["purse", "Money the franchise still has (₹ Cr)."],
          ["reserve", "(target − squad − 1) slots × the cheapest legal base price still in the pool. In the live game minBase is computed from the players remaining; here it is " + minBase + " Cr."],
          ["B", "Affordable budget for this player after protecting the reserve."],
          ["V(i,p)", "The team's normal valuation (section A)."],
          ["S", "Strategic stretch (section D)."],
          ["C", "Effective maximum bid. The engine never accepts a team bid above C."],
        ]}
      />
      <div className="math-lab">
        <Chart
          title="Effective maximum bid versus remaining purse"
          series={series}
          xLabel="Remaining purse (₹ Cr)"
          yLabel="Amount (₹ Cr)"
          xDomain={[0, 120]}
          yDomain={[0, 120]}
          lines={[{ axis: "y", value: willing, label: `willing to pay V·(1+S) = ${willing.toFixed(1)}` }]}
          marker={{ x: purse, y: C, label: `C = ${C.toFixed(1)}` }}
          xFormat={(v) => v.toFixed(0)}
          yFormat={(v) => v.toFixed(0)}
        />
        <div className="math-controls">
          <Slider label="Remaining purse (₹ Cr)" value={purse} min={0} max={120} step={1} onChange={setPurse} />
          <Slider label={`Players owned (target ${target})`} value={squadSize} min={0} max={target} step={1} onChange={setSquadSize} />
          <Slider label="Normal valuation V(i,p) (₹ Cr)" value={value} min={1} max={30} step={0.5} onChange={setValue} />
          <Slider label="Stretch S" value={stretch} min={0} max={0.3} step={0.01} onChange={setStretch} format={pct} />
          <p>
            Reserve {cr(reserve)} → B = {cr(B)}; willing {cr(willing)}; <b>C = {cr(C)}</b>
            {B > willing ? " (limited by willingness, not money)" : " (limited by money)"}.
          </p>
        </div>
      </div>
      <Insight>
        On the right of the chart the lines flatten: extra money no longer raises the ceiling because the team
        simply does not think the player is worth more. On the left, money is the binding limit.
      </Insight>
    </Section>
  );
}

/* ------------------------------------------------------------------ D */
function StretchSection() {
  const [value, setValue] = useState(12);
  const [price, setPrice] = useState(14);
  const archer = byName("Jofra Archer");
  const purses = [{ n: "Rich (₹100 Cr)", p: 100 }, { n: "Mid (₹40 Cr)", p: 40 }, { n: "Tight (₹25 Cr)", p: 25 }];
  const series = purses.map(({ n, p }) => ({
    name: n,
    points: range(0, 0.3, 30).map((s) => ({
      x: s * 100,
      y: Math.min(getAffordableBudget(syntheticTeam({ purse: p, size: 12 }), CFG.defaultMinBasePrice), value * (1 + s)),
    })),
  }));

  const personas = [
    { label: "Conservative (CSK-style)", team: syntheticTeam({ owned: 6, aggression: 0.65, purse: 90, size: 14 }) },
    { label: "Balanced", team: syntheticTeam({ owned: 4, aggression: 0.8, purse: 90, size: 14 }) },
    { label: "Aggressive (RCB/PBKS-style)", team: syntheticTeam({ owned: 6, aggression: 0.95, purse: 90, size: 14 }) },
    { label: "Critical need", team: syntheticTeam({ owned: 0, aggression: 0.8, purse: 90, size: 14 }) },
  ].map((x) => {
    const c = computeCeiling(x.team, archer, {}, () => 0.5);
    const need = Math.min(1, 0.8 * roleNeed(x.team, archer) + 0.2 * ((x.team.targetSquadSize - x.team.squad.length) / x.team.targetSquadSize));
    return { ...x, c, need, p: challengeProbability({ next: price, ceiling: c.ceiling, need, aggression: x.team.aggression }) };
  });

  return (
    <Section id="stretch" kicker="D · Strategy" title="Stretch: paying more than normal value">
      <p>
        When a player is important to a team it may pay beyond its normal valuation. The size of that stretch
        is drawn once per team and player from a range that depends on the player's priority. <Tag kind="param">parameters</Tag>
      </p>
      <div className="math-scroll">
        <table className="math-table">
          <thead><tr><th>Priority tier</th><th>When it applies</th><th className="num">Stretch range S</th></tr></thead>
          <tbody>
            <tr><td>low</td><td>Rating below 70 and no role need (or a bargain-hunter's non-priority lot)</td><td className="num">{pct(CFG.stretch.low[0])}–{pct(CFG.stretch.low[1])}</td></tr>
            <tr><td>useful</td><td>Rating ≥ 70, or some role need</td><td className="num">{pct(CFG.stretch.useful[0])}–{pct(CFG.stretch.useful[1])}</td></tr>
            <tr><td>important</td><td>Role need ≥ 0.5, or ≥ 0.3 with rating ≥ 80, or a strong strategic fit</td><td className="num">{pct(CFG.stretch.important[0])}–{pct(CFG.stretch.important[1])}</td></tr>
            <tr><td>critical</td><td>Rating ≥ 90 with role need ≥ 0.3, rating ≥ 95, or a named priority (PBKS and Shreyas Iyer)</td><td className="num">{pct(CFG.stretch.critical[0])}–{pct(CFG.stretch.critical[1])}</td></tr>
          </tbody>
        </table>
      </div>
      <p>The stretch is fixed when the auction for that player starts and is multiplied by the franchise's own stretch multiplier (CSK {TEAM_STRATEGIES.CSK.stretchMult}×, LSG {TEAM_STRATEGIES.LSG.stretchMult}×): <b>a ceiling never rises just because rivals keep bidding</b>. The one exception is Delhi's price pressure (section I), which stays inside a hard cap.</p>
      <div className="math-lab">
        <Chart
          title="Stretch percentage versus effective maximum bid"
          series={series}
          xLabel="Stretch S (%)"
          yLabel="Ceiling C (₹ Cr)"
          xDomain={[0, 30]}
          yDomain={[0, Math.max(30, value * 1.4)]}
          xFormat={(v) => v.toFixed(0)}
          yFormat={(v) => v.toFixed(0)}
        />
        <div className="math-controls">
          <Slider label="Normal valuation V(i,p) (₹ Cr)" value={value} min={2} max={30} step={0.5} onChange={setValue} />
          <p className="muted">Teams with enough money climb linearly with S. A tight-budget team is flat: its financial cap B is lower than its strategic willingness.</p>
        </div>
      </div>
      <h3>Same player, different mindsets <Tag kind="example">illustrative teams</Tag></h3>
      <Slider label="Next price to evaluate (₹ Cr)" value={price} min={1} max={30} step={0.2} onChange={setPrice} />
      <div className="math-cards">
        {personas.map((x) => (
          <div key={x.label} className="math-card">
            <h4>{x.label}</h4>
            <div>Aggression {x.team.aggression} · Need {x.need.toFixed(2)}</div>
            <div>Tier: <b>{x.c.tier}</b> · S ≈ {pct(x.c.stretch)}</div>
            <div className="big">{cr(x.c.ceiling)}</div>
            <div>P(challenge at {cr(price)}): <b>{pct(x.p)}</b></div>
          </div>
        ))}
      </div>
      <Insight>
        In the real engine aggression does <b>not</b> change a team's ceiling; it changes how willing the team is
        to keep bidding as the price approaches it (next section). Ceilings differ through need, tier and budget.
      </Insight>
    </Section>
  );
}

/* ------------------------------------------------------------------ E */
function ProbabilitySection() {
  const [need, setNeed] = useState(0.6);
  const [aggr, setAggr] = useState(0.8);
  const [x, setX] = useState(0.7);
  const ceiling = 10;
  const prob = (xx, n, a) => challengeProbability({ next: xx * ceiling, ceiling, need: n, aggression: a });
  const xs = range(0.05, 1.2, 115);
  const curve = (n, a) => xs.map((xx) => ({ x: xx, y: prob(xx, n, a) }));
  const pNow = prob(x, need, aggr);

  return (
    <Section id="probability" kicker="E · Bidding decisions" title="Will a team challenge the next bid?">
      <p>
        The ceiling decides whether a team <i>can</i> bid. A probability decides whether it <i>chooses</i> to: well
        below its ceiling a team keeps bidding (a plateau, with {P.plateauTries} looks per price so one unlucky roll
        cannot end an auction it still wants); near its ceiling the chance falls toward a floor.
        <Tag kind="rule">rule</Tag> <Tag kind="param">coefficients</Tag>
      </p>
      <Formula label="challenge probability">
        <var>x</var> = next legal bid / <var>C</var><br />
        knee = {P.kneeBase} + {P.kneeAgg} × <var>Aggression</var> &nbsp;·&nbsp; plateau = {P.plateauBase} + {P.plateauAgg} × <var>Aggression</var> + {P.plateauNeed} × <var>Need</var> &nbsp;·&nbsp; floor = {P.floorBase} + {P.floorAgg} × <var>Aggression</var> (+ fight)<br />
        <var>P</var> = plateau if <var>x</var> ≤ knee, else plateau − (plateau − floor) × ((<var>x</var> − knee)/(1 − knee))<sup>{P.curve}</sup> &nbsp;&nbsp; <small>and P = 0 whenever the next bid &gt; C</small>
      </Formula>
      <Vars
        items={[
          ["x", "Next legal bid as a fraction of the team's ceiling."],
          ["Need", "Combined role + slot need, 0–1 (section B)."],
          ["Aggression", "The franchise's persistent personality value (0.65–0.95 in the team data)."],
          ["fight", "Extra floor for franchises that keep contesting deep into a war (LSG)."],
        ]}
      />
      <div className="math-lab">
        <Chart
          title="Next bid relative to ceiling versus probability of challenging"
          series={[
            { name: "Strong need (1.0)", points: curve(1, aggr) },
            { name: "Moderate need (0.5)", points: curve(0.5, aggr) },
            { name: "Low need (0.0)", points: curve(0, aggr) },
            { name: `Your sliders (need ${need.toFixed(2)})`, points: curve(need, aggr) },
          ]}
          xLabel="x = next bid / ceiling"
          yLabel="P(challenge)"
          xDomain={[0, 1.2]}
          yDomain={[0, 1]}
          lines={[{ axis: "x", value: 1, label: "ceiling: hard stop, P = 0 beyond" }]}
          marker={{ x, y: prob(x, need, aggr), label: pct(prob(x, need, aggr)) }}
          xFormat={(v) => v.toFixed(2)}
        />
        <div className="math-controls">
          <Slider label="Need" value={need} min={0} max={1} step={0.05} onChange={setNeed} format={(v) => v.toFixed(2)} />
          <Slider label="Aggression" value={aggr} min={0.5} max={1} step={0.05} onChange={setAggr} format={(v) => v.toFixed(2)} />
          <Slider label="x = next bid / ceiling" value={x} min={0.05} max={1.2} step={0.01} onChange={setX} format={(v) => v.toFixed(2)} />
          <p>P = <b>{pct(pNow)}</b>{x > 1 && " (above ceiling: forbidden)"}</p>
        </div>
      </div>
      <Insight>
        Curves fall as the price nears the ceiling and sit higher for teams that need the player. At x &gt; 1 the
        probability is exactly zero: randomness can never push a team past its limit.
      </Insight>

      <h3>Three teams, one price (x = {x.toFixed(2)})</h3>
      <div className="math-cards">
        {[["Strong need", 1], ["Moderate need", 0.5], ["Low need", 0]].map(([l, n]) => (
          <div key={l} className="math-card">
            <h4>{l}</h4>
            <div className="big">{pct(prob(x, n, aggr))}</div>
            <div className="muted">Higher need raises the plateau by {P.plateauNeed} × Need.</div>
          </div>
        ))}
      </div>

      <h3>Personalities compared (need {need.toFixed(2)})</h3>
      <Chart
        title="Probability by team personality"
        series={[0.65, 0.8, 0.95].map((a) => ({ name: `Aggression ${a}`, points: curve(need, a) }))}
        xLabel="x = next bid / ceiling"
        yLabel="P(challenge)"
        xDomain={[0, 1.2]}
        yDomain={[0, 1]}
        lines={[{ axis: "x", value: 1, label: "ceiling" }]}
        xFormat={(v) => v.toFixed(2)}
      />
      <h3>Hard constraints beat probability</h3>
      <p>Before any dice are rolled, a team is skipped if it is <b>INELIGIBLE</b> (squad full, overseas quota full, or cannot afford even the base price) or if the next bid exceeds its ceiling or budget; the single bid-processing path also rejects such a bid from any source.</p>
      <p>
        If a roll fails, the team is <b>permanently withdrawn</b> when x ≥ {CFG.withdrawRatio} or P &lt; {pct(CFG.withdrawProbability)}; otherwise it only <b>passes</b> for now.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ F */
function RandomSection() {
  const [p, setP] = useState(0.65);
  const [draws, setDraws] = useState([]);
  const roll = (n) => setDraws((d) => [...d, ...Array.from({ length: n }, () => Math.random() < p)].slice(-60));
  const hits = draws.filter(Boolean).length;
  return (
    <Section id="randomness" kicker="F · Randomness" title="Why two auctions are never the same">
      <p>
        Each decision draws a random number <var>u</var> between 0 and 1; the team challenges if <var>u</var> &lt; P.
        A team with P = 65% bids about two times in three, never always. <Tag kind="random">randomized</Tag>
      </p>
      <ul>
        <li><b>Personalities persist.</b> Aggression and role requirements come from the team data (see the table in section B), so a franchise behaves the same way in every auction.</li>
        <li><b>What is random:</b> each team's stretch draw, its challenge rolls, the visiting order within a response cycle, and the shuffle inside each set.</li>
        <li><b>What is never random:</b> budget, squad limits, overseas limits, ceilings once drawn, and withdrawals.</li>
        <li><b>Pass vs withdrawal:</b> a pass can be reversed when a rival bids; a withdrawal is final for that player.</li>
        <li><b>Testing:</b> the engine accepts an injected random function, so tests supply fixed draws (always challenge / never challenge) or a seeded generator for repeatable simulations.</li>
      </ul>
      <h3>Try it <Tag kind="example">live demo, not an auction decision</Tag></h3>
      <div className="math-controls">
        <Slider label="Probability of challenging" value={p} min={0} max={1} step={0.01} onChange={setP} format={pct} />
        <div>
          <button className="math-btn" onClick={() => roll(1)}>Roll once</button>{" "}
          <button className="math-btn secondary" onClick={() => roll(20)}>Roll 20</button>{" "}
          <button className="math-btn secondary" onClick={() => setDraws([])}>Reset</button>
        </div>
        <div className="math-chips" aria-live="polite">
          {draws.map((d, i) => (
            <span key={i} className={`math-chip ${d ? "yes" : "no"}`}>{d ? "✓ bid" : "✗ pass"}</span>
          ))}
        </div>
        <div>{draws.length ? `${hits} of ${draws.length} rolls challenged (${pct(hits / draws.length)})` : "No rolls yet."}</div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ G */
function LifecycleSection() {
  const [price, setPrice] = useState(12);
  const [result, setResult] = useState(null);
  const inc = getBidIncrement(price);
  const humanBid = +(price + inc).toFixed(2);
  const nextAi = +(humanBid + getBidIncrement(humanBid)).toFixed(2);
  const sample = byName("Rishabh Pant");

  const teamsDef = useMemo(
    () => ({
      LEAD: { ceiling: price + 0.4, budget: 60, need: 0.5, aggression: 0.8, state: AI_STATE.ACTIVE, label: "Was leading at the price" },
      HIGH: { ceiling: 17, budget: 60, need: 0.9, aggression: 0.95, state: AI_STATE.PASSED, label: "Passed earlier, big headroom, strong need" },
      MID: { ceiling: nextAi + 0.6, budget: 60, need: 0.4, aggression: 0.8, state: AI_STATE.ACTIVE, label: "Little headroom left" },
      OUT: { ceiling: price - 1, budget: 60, need: 0.8, aggression: 0.9, state: AI_STATE.WITHDRAWN, label: "Withdrew permanently earlier" },
      FULL: { ceiling: 0, budget: 0, need: 0, aggression: 0.7, state: AI_STATE.INELIGIBLE, label: "Squad / overseas quota full" },
    }),
    [price, nextAi],
  );

  const view = Object.entries(teamsDef).map(([name, t]) => {
    let status = t.state;
    let p = 0;
    if (status !== AI_STATE.WITHDRAWN && status !== AI_STATE.INELIGIBLE) {
      if (nextAi > t.ceiling) status = "WITHDRAWN (exhausted)";
      else p = challengeProbability({ next: nextAi, ceiling: t.ceiling, need: t.need, aggression: t.aggression });
    }
    return { name, t, status, p };
  });
  const anyP = 1 - view.reduce((acc, v) => acc * (1 - v.p), 1);

  const simulate = () => {
    const round = {
      player: sample, bid: humanBid, leader: "HUMAN", version: 1, status: "OPEN", userIn: true,
      human: { name: "HUMAN", purse: 99, squad: [] }, bids: [], needsCycle: true,
      teams: Object.fromEntries(Object.entries(teamsDef).map(([n, t]) => [n, { ...t }])),
    };
    const res = runResponseCycle(round, Math.random);
    setResult({ res, states: Object.fromEntries(Object.entries(round.teams).map(([n, t]) => [n, t.state])) });
  };

  return (
    <Section id="lifecycle" kicker="G · Lifecycle" title="Late entry: what happens when you bid at ₹12 Cr">
      <h3>Bid increments <Tag kind="rule">rule</Tag></h3>
      <p>
        Below ₹1 Cr bids rise by {getBidIncrement(0.5)}; from ₹1 Cr to just under ₹13 Cr by {getBidIncrement(5)}; from ₹13 Cr by {getBidIncrement(13)}. So the next legal bid after ₹12 Cr is {cr(12 + getBidIncrement(12))}, not ₹12.25 Cr.
      </p>
      <h3>The auction loop</h3>
      <div className="flow" role="img" aria-label="Auction lifecycle flowchart">
        <div className="flow-box">Player comes up at base price (≈90% of the time an AI opens; otherwise AIs wait a few seconds for you)</div>
        <div className="flow-arrow">↓</div>
        <div className="flow-box loop">Response cycle: every team that is not WITHDRAWN / INELIGIBLE / leading decides afresh (random order, one decision each)</div>
        <div className="flow-arrow">↓</div>
        <div className="flow-box decision">Did anyone challenge?</div>
        <div className="flow-split">
          <div>
            <div className="flow-arrow">yes ↓</div>
            <div className="flow-box">Bid accepted through the single bid path. New price, new leader.<br />The cycle reopens: PASSED teams reconsider, WITHDRAWN teams stay out.</div>
            <div className="flow-arrow">↑ back to the response cycle</div>
          </div>
          <div>
            <div className="flow-arrow">no ↓</div>
            <div className="flow-box">Going once → twice → thrice<br /><span className="muted">(a human bid, if it comes, resets this and reopens the cycle)</span></div>
            <div className="flow-arrow">↓</div>
            <div className="flow-box end">Closed: sold to the leader, or unsold if no one ever bid</div>
          </div>
        </div>
      </div>
      <h3>Team states</h3>
      <div className="math-scroll">
        <table className="math-table">
          <tbody>
            <tr><td><b>ACTIVE</b></td><td>Participating and may bid.</td></tr>
            <tr><td><b>PASSED</b></td><td>Lost the dice roll with headroom left. Reconsiders when a new bid arrives.</td></tr>
            <tr><td><b>WITHDRAWN</b></td><td>Out for this player for good (ceiling exhausted, or price within {pct(1 - CFG.withdrawRatio)} of it, or very low probability).</td></tr>
            <tr><td><b>INELIGIBLE</b></td><td>Cannot legally bid (full squad, overseas quota, ceiling below the base price).</td></tr>
            <tr><td><b>AUCTION_CLOSED</b></td><td>The player has been resolved.</td></tr>
          </tbody>
        </table>
      </div>
      <h3>Worked example <Tag kind="example">illustrative teams, real decision code</Tag></h3>
      <Slider label="Price reached by AI-only bidding (₹ Cr)" value={price} min={1} max={25} step={0.2} onChange={setPrice} />
      <p>
        You bid {cr(humanBid)}. The next legal AI bid is {cr(nextAi)}. Each remaining team recalculates:
      </p>
      <div className="math-scroll">
        <table className="math-table">
          <thead><tr><th>Team</th><th>Situation</th><th>State now</th><th className="num">Ceiling</th><th className="num">x</th><th className="num">P(challenge)</th></tr></thead>
          <tbody>
            {view.map(({ name, t, status, p }) => (
              <tr key={name}>
                <td>{name}</td><td>{t.label}</td><td>{status}</td>
                <td className="num">{t.ceiling > 0 ? t.ceiling.toFixed(1) : "–"}</td>
                <td className="num">{t.ceiling > 0 ? (nextAi / t.ceiling).toFixed(2) : "–"}</td>
                <td className="num">{pct(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Chance that at least one team challenges you: <b>{pct(anyP)}</b>. It is never forced to be 100%.</p>
      <button className="math-btn" onClick={simulate}>Run one real response cycle</button>
      {result && (
        <p aria-live="polite">
          {result.res ? <>Result: <b>{result.res.leader}</b> challenged at {cr(result.res.bid)}.</> : <>Result: nobody challenged; you would win at {cr(humanBid)}.</>}{" "}
          Resulting states: {Object.entries(result.states).map(([n, s]) => `${n}=${s}`).join(", ")}.
        </p>
      )}
      <Insight>Your late bid reopens the response cycle for everyone who has not withdrawn. Eligible teams may challenge or pass, and the auction closes only when a full cycle brings no challenge.</Insight>
    </Section>
  );
}

/* ------------------------------------------------------------------ H */
function BidTable({ bids, teams, result, player }) {
  const names = Object.keys(teams);
  const ranked = [...names].sort((a, b) => teams[b].ceiling - teams[a].ceiling);
  const second = ranked.length > 1 ? teams[ranked[1]].ceiling : 0;
  return (
    <>
      <Chart
        title={`Bidding progression for ${player}`}
        series={[{ name: "Price after each bid", step: true, points: [{ x: 0, y: bids[0]?.bid ?? 0 }, ...bids.map((b, i) => ({ x: i + 1, y: b.bid }))] }]}
        xLabel="Accepted bid number"
        yLabel="Price (₹ Cr)"
        xDomain={[0, Math.max(1, bids.length)]}
        yDomain={[0, Math.max(5, Math.ceil((result.bid || 1) * 1.15))]}
        xFormat={(v) => v.toFixed(0)}
        yFormat={(v) => v.toFixed(1)}
      />
      <p>
        {result.leader === "Base Price" ? "Nobody bid: the player went unsold." : <>Sold to <b>{result.leader}</b> for <b>{cr(result.bid)}</b> after {bids.length} accepted bids.</>}{" "}
        {result.leader !== "Base Price" && <>Second-highest ceiling was {cr(second)}; the winner stops the climb once rivals pass, withdraw or reach their limits.</>}
      </p>
      <div className="math-scroll">
        <table className="math-table">
          <thead><tr><th>Team</th><th>Tier</th><th className="num">V(i,p)</th><th className="num">Ceiling</th><th className="num">Bids</th><th>Final state</th></tr></thead>
          <tbody>
            {ranked.map((n) => (
              <tr key={n}>
                <td>{n}{n === result.leader ? " 🏆" : ""}</td>
                <td>{teams[n].tier}</td>
                <td className="num">{teams[n].value?.toFixed(1)}</td>
                <td className="num">{teams[n].ceiling.toFixed(1)}</td>
                <td className="num">{bids.filter((b) => b.bidder === n).length}</td>
                <td>{teams[n].state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FinalPriceSection() {
  const { roundLog } = useContext(AuctionContext);
  const marquee = useMemo(() => players.filter((p) => p.set === "Marquee-1" && p.rating >= 86), []);
  const [pid, setPid] = useState(marquee[0].id);
  const [seed, setSeed] = useState(7);
  const [pick, setPick] = useState(0);

  const demo = useMemo(() => {
    const rng = makeSeededRng(seed);
    const eff = getEffectivePlayers(players, "MI", []);
    const teams = buildAiTeams(eff, aiTeams, "MI", rng);
    const player = eff.find((p) => p.id === pid);
    const ctx = marketContext(eff.filter((p) => !p.retained && p.id !== pid));
    return { player, ...runAiOnlyAuction(player, teams, rng, ctx) };
  }, [pid, seed]);

  const real = roundLog[Math.min(pick, roundLog.length - 1)];

  return (
    <Section id="final" kicker="H · The final price" title="Why a player sells for what he sells for">
      <p>
        The final price is <b>not</b> the player's intrinsic value. It is where competition stops: bidding climbs while at
        least one other team still has headroom and wins its dice roll, and ends when every rival has passed,
        withdrawn or hit its ceiling. Usually that is near the second-highest ceiling among the teams that stayed interested.
      </p>
      <h3>Illustrative auction <Tag kind="example">generated by the real engine with a fixed seed</Tag></h3>
      <div className="math-controls">
        <label className="math-slider">
          <span>Player</span>
          <select value={pid} onChange={(e) => setPid(Number(e.target.value))}>
            {marquee.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>)}
          </select>
        </label>
        <Slider label="Random seed" value={seed} min={1} max={99} step={1} onChange={setSeed} />
      </div>
      <BidTable bids={demo.round.bids} teams={demo.round.teams} result={{ bid: demo.bid, leader: demo.leader }} player={demo.player.name} />
      <h3>Inspect a real completed auction</h3>
      {roundLog.length === 0 ? (
        <p className="muted">
          No auctions completed in this session yet. Play some players in the <Link to="/auction">auction room</Link> and
          come back: the bids and each team's recorded ceiling and state are saved as they happen.
        </p>
      ) : (
        <>
          <label className="math-slider">
            <span>Completed auction</span>
            <select value={Math.min(pick, roundLog.length - 1)} onChange={(e) => setPick(Number(e.target.value))}>
              {roundLog.map((r, i) => (
                <option key={i} value={i}>{i + 1}. {r.player.name} → {r.result.leader === "Base Price" ? "unsold" : `${r.result.leader} ${r.result.bid}`}{r.source === "skip-set" ? " (Skip Set)" : ""}</option>
              ))}
            </select>
          </label>
          <p className="muted">Only recorded facts are shown: bids, ceilings, valuations and final team states. Human bids appear as your franchise name, who has no recorded ceiling.</p>
          <BidTable
            bids={real.bids}
            teams={real.teams}
            result={real.result}
            player={real.player.name}
          />
        </>
      )}
      <Insight>The price is an outcome of valuations, ceilings, needs, stretch, dice rolls and the order of accepted bids, not a fixed number attached to the player.</Insight>
    </Section>
  );
}

/* ------------------------------------------------------------------ I */
function FranchiseSection() {
  const rows = aiTeams.map((t) => ({ t, st: getStrategy(t) }));
  const d = TEAM_STRATEGIES.DC.disruptor;
  return (
    <Section id="franchises" kicker="I · Franchise personalities" title="Ten recruitment philosophies, one set of rules">
      <p>
        Each franchise has a strategy profile (<code>strategies.js</code>) that changes what it <i>values</i> (the
        S term) and how it <i>competes</i> (aggression, stretch, noise, budget discipline). None of it can bypass
        the shared money rules: purse, reserve, bid increments, squad and overseas limits, and the hard maximum.
        <Tag kind="param">parameters</Tag>
      </p>
      <div className="math-scroll">
        <table className="math-table">
          <thead>
            <tr><th>Team</th><th>Philosophy</th><th className="num">Aggr.</th><th className="num">Stretch ×</th><th className="num">Noise σ</th><th className="num">Hold-back</th><th className="num">Max/player</th><th className="num">Hard max ×M</th></tr>
          </thead>
          <tbody>
            {rows.map(({ t, st }) => (
              <tr key={t.name}>
                <td>{t.name}</td><td>{st.label}: {st.philosophy}</td>
                <td className="num">{st.aggression}</td><td className="num">{st.stretchMult}</td><td className="num">{st.noise}</td>
                <td className="num">{st.reserveFrac}</td><td className="num">{pct(st.maxShare)}</td><td className="num">{st.hardMaxMult}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Delhi Capitals: controlled price pressure</h3>
      <p>
        When the price passes (or is about to pass) DC's own valuation and a rival is leading, DC decides <i>once</i> per lot whether to
        keep bidding to raise that rival's price. It estimates the rival's limit from public information (purse, squad needs) and what the rival
        has actually done earlier in this auction, with noise (σ {d.estimateSigma}); it never reads the rival's private ceiling. It plans an exit at
        {" "}{d.band[0]}–{d.band[1]} of that estimate, never above {d.overpayCap}× market price, and never withdraws and re-enters.
        Sometimes the rival stops first and DC wins the player; every bid is an ordinary accepted bid.
      </p>
      <Insight>Where the data has no field (age, potential, caps), a proxy is used: capped status and rating stand in for experience; an uncapped Indian rated above the uncapped norm stands in for a prospect.</Insight>
    </Section>
  );
}

/* --------------------------------------------------------------- page */
export default function MathPage() {
  const { hasSession, resumeRoute } = useSave();
  return (
    <main className="math-page">
      <div className="math-shell">
        <header className="math-hero">
          {hasSession ? (
            <Link to={resumeRoute()} className="math-back">← Back to your game</Link>
          ) : (
            <Link to="/" className="math-back">← Home</Link>
          )}
          <h1>Auction Math</h1>
          <p>
            How the simulator decides what a player is worth, which franchises bid, when they stop, and why a
            player ends at his final price. Every number and graph here is computed by the same functions and
            settings the live auction uses.
          </p>
          <div className="math-legend" aria-label="Legend">
            <Tag kind="rule">rule: fixed formula</Tag>
            <Tag kind="param">parameter: tunable in biddingConfig.js</Tag>
            <Tag kind="random">randomized decision</Tag>
            <Tag kind="example">illustrative example</Tag>
          </div>
          <ul className="math-toc">
            {[["valuation", "A Valuation"], ["needs", "B Needs"], ["finance", "C Money"], ["stretch", "D Stretch"], ["probability", "E Probability"], ["randomness", "F Randomness"], ["lifecycle", "G Lifecycle"], ["final", "H Final price"], ["franchises", "I Franchises"]].map(([id, l]) => (
              <li key={id}><a href={`#${id}`}>{l}</a></li>
            ))}
          </ul>
        </header>
        <ValuationSection />
        <NeedsSection />
        <FinanceSection />
        <StretchSection />
        <ProbabilitySection />
        <RandomSection />
        <LifecycleSection />
        <FinalPriceSection />
        <FranchiseSection />
      </div>
    </main>
  );
}

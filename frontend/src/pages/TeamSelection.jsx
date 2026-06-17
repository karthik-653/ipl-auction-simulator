const teams = [
  "CSK",
  "MI",
  "RCB",
  "KKR",
  "SRH",
  "DC",
  "RR",
  "GT",
  "PBKS",
  "LSG"
];

function TeamSelection() {
  return (
    <div>
      <h1>Select Team</h1>

      {teams.map((team) => (
        <button key={team}>
          {team}
        </button>
      ))}
    </div>
  );
}

export default TeamSelection;
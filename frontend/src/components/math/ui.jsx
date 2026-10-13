// Small presentational helpers for the /math page.
export function Section({ id, kicker, title, children }) {
  return (
    <section id={id} className="math-section" aria-labelledby={`${id}-h`}>
      <div className="math-kicker">{kicker}</div>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

export function Formula({ children, label }) {
  return (
    <div className="math-formula" role="math" aria-label={label}>
      {children}
    </div>
  );
}

export function Vars({ items }) {
  return (
    <dl className="math-vars">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Slider({ label, value, min, max, step, onChange, format = (v) => v }) {
  return (
    <label className="math-slider">
      <span>
        {label} <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Insight({ children }) {
  return (
    <p className="math-insight">
      <strong>Takeaway. </strong>
      {children}
    </p>
  );
}

export function Tag({ kind, children }) {
  return <span className={`math-tag math-tag-${kind}`}>{children}</span>;
}


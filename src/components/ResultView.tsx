import type { AnalysisResult, SportDef } from "../types";

interface Props {
  result: AnalysisResult;
  sport: SportDef;
}

function clampPct(n: number | null | undefined): number {
  if (typeof n !== "number" || isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function ResultView({ result, sport }: Props) {
  const p = result.probabilities;
  const aWin = clampPct(p.a_win);
  const bWin = clampPct(p.b_win);
  const draw = sport.hasDraw ? clampPct(p.draw) : null;

  const bars = [
    { label: result.competitor_a || "A", value: aWin, cls: "bar-a" },
    ...(draw !== null ? [{ label: "Remis", value: draw, cls: "bar-d" }] : []),
    { label: result.competitor_b || "B", value: bWin, cls: "bar-b" },
  ];

  const confClass =
    result.confidence === "wysoka"
      ? "conf-high"
      : result.confidence === "średnia"
      ? "conf-mid"
      : "conf-low";

  return (
    <section className="card result">
      <div className="result-head">
        <h2>Szanse na wynik</h2>
        <span className={`badge ${confClass}`}>Pewność: {result.confidence}</span>
      </div>

      <div className="bars">
        {bars.map((bar, i) => (
          <div className="bar-row" key={i}>
            <div className="bar-label">
              <span>{bar.label}</span>
              <strong>{bar.value}%</strong>
            </div>
            <div className="bar-track">
              <div className={`bar-fill ${bar.cls}`} style={{ width: `${bar.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="recommend">
        <span className="rec-tag">Sugerowany typ</span>
        <p>{result.recommended_bet}</p>
        {result.predicted_score && (
          <p className="score">Przewidywany wynik: <strong>{result.predicted_score}</strong></p>
        )}
      </div>

      {result.key_factors?.length > 0 && (
        <div className="block">
          <h3>Kluczowe czynniki</h3>
          <ul>
            {result.key_factors.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {result.recent_form && (
        <div className="block">
          <h3>Aktualna forma</h3>
          <p><strong>{result.competitor_a}:</strong> {result.recent_form.a}</p>
          <p><strong>{result.competitor_b}:</strong> {result.recent_form.b}</p>
        </div>
      )}

      {result.head_to_head && (
        <div className="block">
          <h3>Bezpośrednie pojedynki</h3>
          <p>{result.head_to_head}</p>
        </div>
      )}

      {result.sources?.length > 0 && (
        <div className="block">
          <h3>Źródła</h3>
          <ul className="sources">
            {result.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="disclaimer">
        {result.disclaimer ||
          "To aplikacja rozrywkowa. Prognozy są szacunkowe i nie stanowią porady hazardowej."}
      </p>
    </section>
  );
}

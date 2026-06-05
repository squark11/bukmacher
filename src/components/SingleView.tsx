import { useMemo, useState } from "react";
import { SPORTS, getSport } from "../sports";
import { analyzeMatch } from "../claude";
import { buildEnrichment } from "../apiSports";
import { addHistory, newId } from "../history";
import type { AnalysisResult, Settings } from "../types";
import { ResultView } from "./ResultView";

interface Props {
  settings: Settings;
  openSettings: () => void;
}

export function SingleView({ settings, openSettings }: Props) {
  const [sportKey, setSportKey] = useState("football");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const sport = useMemo(() => getSport(sportKey), [sportKey]);
  const kindLabel = sport.competitorKind === "person" ? "Zawodnik" : "Drużyna";

  async function onAnalyze() {
    setError(null);
    setResult(null);
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    if (!a.trim() || !b.trim()) {
      setError("Podaj obie strony pojedynku.");
      return;
    }
    setLoading(true);
    try {
      let enrichment: string | undefined;
      if (settings.apiSportsKey) {
        const fb = await buildEnrichment(sportKey, a.trim(), b.trim(), settings.apiSportsKey).catch(
          () => null
        );
        enrichment = fb?.text;
      }
      const { result: res } = await analyzeMatch({
        apiKey: settings.apiKey,
        model: settings.model,
        sport,
        competitorA: a.trim(),
        competitorB: b.trim(),
        context: context.trim() || undefined,
        enrichment,
      });
      setResult(res);
      addHistory({
        id: newId(),
        ts: Date.now(),
        type: "single",
        sportKey,
        result: res,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nieznany błąd.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="card">
        <label className="field">
          <span>Dyscyplina</span>
          <select value={sportKey} onChange={(e) => setSportKey(e.target.value)}>
            {SPORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{kindLabel} A</span>
          <input
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder={sport.competitorKind === "person" ? "np. Iga Świątek" : "np. FC Barcelona"}
          />
        </label>

        <div className="vs">VS</div>

        <label className="field">
          <span>{kindLabel} B</span>
          <input
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder={sport.competitorKind === "person" ? "np. Aryna Sabalenka" : "np. Real Madryt"}
          />
        </label>

        <label className="field">
          <span>Kontekst (opcjonalnie)</span>
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="np. mecz ligowy, kort trawiasty, finał..."
          />
        </label>

        <button className="primary" onClick={onAnalyze} disabled={loading}>
          {loading ? "Analizuję dane w sieci…" : "Oblicz szanse"}
        </button>

        {error && <div className="error">{error}</div>}
      </section>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Szukam najnowszych statystyk, formy i historii pojedynków…</p>
        </div>
      )}

      {result && !loading && <ResultView result={result} sport={sport} />}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { SPORTS, getSport } from "./sports";
import { analyzeMatch } from "./claude";
import { loadSettings, saveSettings } from "./storage";
import type { AnalysisResult, Settings } from "./types";
import { SettingsModal } from "./components/SettingsModal";
import { ResultView } from "./components/ResultView";

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [sportKey, setSportKey] = useState<string>("football");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const sport = useMemo(() => getSport(sportKey), [sportKey]);
  const kindLabel = sport.competitorKind === "person" ? "Zawodnik" : "Drużyna";

  useEffect(() => {
    if (!settings.apiKey) setShowSettings(true);
  }, []);

  function persist(s: Settings) {
    setSettings(s);
    saveSettings(s);
  }

  async function onAnalyze() {
    setError(null);
    setResult(null);
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    if (!a.trim() || !b.trim()) {
      setError("Podaj obie strony pojedynku.");
      return;
    }
    setLoading(true);
    try {
      const res = await analyzeMatch({
        apiKey: settings.apiKey,
        model: settings.model,
        sport,
        competitorA: a.trim(),
        competitorB: b.trim(),
        context: context.trim() || undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nieznany błąd.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      {needRefresh && (
        <div className="update-bar" onClick={() => updateServiceWorker(true)}>
          Dostępna nowa wersja — dotknij, aby zaktualizować.
        </div>
      )}

      <header className="header">
        <div className="brand">
          <span className="logo">⚽</span>
          <h1>Bukmacher AI</h1>
        </div>
        <button
          className="icon-btn"
          aria-label="Ustawienia"
          onClick={() => setShowSettings(true)}
        >
          ⚙️
        </button>
      </header>

      <main className="main">
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
      </main>

      <footer className="footer">
        Aplikacja rozrywkowa. Prognozy są szacunkowe i nie stanowią porady hazardowej.
      </footer>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            persist(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

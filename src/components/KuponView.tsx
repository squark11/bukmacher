import { useState } from "react";
import { SPORTS, getSport } from "../sports";
import { analyzeMatch } from "../claude";
import { buildEnrichment } from "../apiSports";
import { addHistory, newId } from "../history";
import { bestPick, combinedProb, pickProb } from "../picks";
import { parseCoupon } from "../parseCoupon";
import type { AnalysisResult, KuponLeg, Pick, SavedKuponLeg, Settings } from "../types";

interface Props {
  settings: Settings;
  openSettings: () => void;
}

function emptyLeg(): KuponLeg {
  return { id: newId(), sportKey: "football", a: "", b: "", context: "" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Twardy limit kosztu całego kuponu (USD) i zachowawczy szacunek kosztu jednego
// meczu — strażnik nie zaczyna meczu, który mógłby przekroczyć budżet.
const BUDGET_USD = 0.5;
const MAX_LEG_COST_EST = 0.04;
const KUPON_MAX_TOKENS = 1200;

interface Verdict {
  tone: "good" | "warn" | "bad";
  text: string;
}

// Ocena typu z wklejonego kuponu: porównuje wybór użytkownika z rekomendacją
// modelu i sygnalizuje, co warto poprawić.
function couponVerdict(r: AnalysisResult, pick: Pick, hasDraw: boolean): Verdict {
  const userProb = Math.round(pickProb(r, pick));
  const best = bestPick(r, hasDraw);
  const bestProb = Math.round(pickProb(r, best));
  const bestLabel = best === "a" ? r.competitor_a : best === "b" ? r.competitor_b : "Remis";
  if (best !== pick && bestProb - userProb >= 10) {
    return {
      tone: "bad",
      text: `Zmień typ — model stawia na ${bestLabel} (${bestProb}% vs Twoje ${userProb}%).`,
    };
  }
  if (userProb < 45) {
    return { tone: "bad", text: `Słaby typ (${userProb}%) — rozważ usunięcie z kuponu.` };
  }
  if (userProb < 55) {
    return { tone: "warn", text: `Ryzykowny typ (${userProb}%) — wynik niepewny.` };
  }
  return { tone: "good", text: `Mocny typ (${userProb}%).` };
}

export function KuponView({ settings, openSettings }: Props) {
  const [legs, setLegs] = useState<KuponLeg[]>(() => [emptyLeg(), emptyLeg()]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [saved, setSaved] = useState(false);
  const [cost, setCost] = useState(0);
  const [budgetHit, setBudgetHit] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteSport, setPasteSport] = useState("tennis");
  const [pasteError, setPasteError] = useState("");

  function patchLeg(id: string, patch: Partial<KuponLeg>) {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function loadPaste() {
    const parsed = parseCoupon(pasteText);
    if (parsed.length === 0) {
      setPasteError(
        "Nie rozpoznano żadnego meczu. Format: linia z typem, „Zwycięzca meczu”, zawodnik A, godzina, zawodnik B."
      );
      return;
    }
    setLegs(
      parsed.map((p) => ({
        id: newId(),
        sportKey: pasteSport,
        a: p.a,
        b: p.b,
        context: "",
        couponPick: p.pick,
      }))
    );
    setPasteError("");
    setPasteOpen(false);
    setSaved(false);
    setBudgetHit(false);
    setCost(0);
  }

  function addLeg() {
    setSaved(false);
    setLegs((prev) => [...prev, emptyLeg()]);
  }

  function removeLeg(id: string) {
    setSaved(false);
    setLegs((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  async function analyzeAll() {
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    const targets = legs.filter((l) => l.a.trim() && l.b.trim());
    if (targets.length === 0) {
      patchLeg(legs[0].id, { error: "Uzupełnij przynajmniej jeden mecz." });
      return;
    }
    setRunning(true);
    setSaved(false);
    setBudgetHit(false);
    setCost(0);
    let spent = 0;
    for (let i = 0; i < targets.length; i++) {
      const leg = targets[i];
      // Strażnik budżetu: nie zaczynaj meczu, który mógłby przekroczyć limit.
      if (spent + MAX_LEG_COST_EST > BUDGET_USD) {
        setBudgetHit(true);
        patchLeg(leg.id, {
          loading: false,
          result: undefined,
          pick: undefined,
          error: `Pominięto — osiągnięto limit budżetu kuponu ($${BUDGET_USD.toFixed(2)}).`,
        });
        continue;
      }
      // Odstęp między meczami, by nie kumulować zużycia tokenów (limit 429).
      if (i > 0) await sleep(2500);
      setProgress(
        `Analizuję mecz ${i + 1}/${targets.length}… (koszt: $${spent.toFixed(2)})`
      );
      patchLeg(leg.id, { loading: true, error: undefined });
      const sport = getSport(leg.sportKey);
      try {
        let enrichment: string | undefined;
        if (settings.apiSportsKey) {
          const fb = await buildEnrichment(
            leg.sportKey,
            leg.a.trim(),
            leg.b.trim(),
            settings.apiSportsKey
          ).catch(() => null);
          enrichment = fb?.text;
        }
        const { result: res, costUsd } = await analyzeMatch({
          apiKey: settings.apiKey,
          model: settings.model,
          sport,
          competitorA: leg.a.trim(),
          competitorB: leg.b.trim(),
          context: leg.context.trim() || undefined,
          enrichment,
          webSearch: false, // tryb taniego kuponu: bez wyszukiwania w sieci
          maxTokens: KUPON_MAX_TOKENS,
        });
        spent += costUsd;
        setCost(spent);
        patchLeg(leg.id, {
          loading: false,
          result: res,
          // Zachowaj typ z wklejonego kuponu; w trybie ręcznym użyj rekomendacji.
          pick: leg.couponPick ?? bestPick(res, sport.hasDraw),
        });
      } catch (e) {
        patchLeg(leg.id, {
          loading: false,
          error: e instanceof Error ? e.message : "Błąd analizy.",
        });
      }
    }
    setProgress("");
    setRunning(false);
  }

  function saveKupon() {
    const done = legs.filter((l) => l.result && l.pick);
    if (done.length === 0) return;
    const savedLegs: SavedKuponLeg[] = done.map((l) => ({
      sportKey: l.sportKey,
      result: l.result!,
      pick: l.pick!,
    }));
    const combined = combinedProb(done.map((l) => pickProb(l.result!, l.pick!)));
    addHistory({
      id: newId(),
      ts: Date.now(),
      type: "kupon",
      combined,
      legs: savedLegs,
    });
    setSaved(true);
  }

  const completed = legs.filter((l) => l.result && l.pick);
  const combined = combinedProb(completed.map((l) => pickProb(l.result!, l.pick!)));
  const weakLegs = completed.filter(
    (l) =>
      l.couponPick &&
      couponVerdict(l.result!, l.pick!, getSport(l.sportKey).hasDraw).tone !== "good"
  );

  return (
    <>
      <div className="kupon-intro">
        Dodaj kilka meczów. Łączna szansa to prawdopodobieństwo trafienia
        <strong> wszystkich </strong> typów naraz. Tryb oszczędny: analiza bez
        wyszukiwania w sieci (dane z API-Sports + wiedza modelu), z twardym
        limitem kosztu <strong>${BUDGET_USD.toFixed(2)}</strong> na cały kupon.
      </div>

      <section className="card paste-card">
        <button
          className="ghost full"
          onClick={() => setPasteOpen((o) => !o)}
          disabled={running}
        >
          {pasteOpen ? "Ukryj wklejanie" : "📋 Wklej gotowy kupon"}
        </button>
        {pasteOpen && (
          <>
            <textarea
              className="paste-area"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              placeholder={
                "Wklej kupon, np.:\nJuan Manuel La Serna\nZwycięzca meczu\nJuan Manuel La Serna\n22:28\nNicolas Oliveira"
              }
            />
            <label className="field">
              <span>Dyscyplina dla wczytanych meczów</span>
              <select value={pasteSport} onChange={(e) => setPasteSport(e.target.value)}>
                {SPORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {pasteError && <div className="error">{pasteError}</div>}
            <button className="primary" onClick={loadPaste} disabled={!pasteText.trim()}>
              Wczytaj kupon
            </button>
          </>
        )}
      </section>

      {legs.map((leg, idx) => {
        const sport = getSport(leg.sportKey);
        const kind = sport.competitorKind === "person" ? "Zawodnik" : "Drużyna";
        const picks: Pick[] = sport.hasDraw ? ["a", "draw", "b"] : ["a", "b"];
        const verdict =
          leg.result && leg.couponPick
            ? couponVerdict(leg.result, leg.pick ?? leg.couponPick, sport.hasDraw)
            : null;
        return (
          <section className="card leg" key={leg.id}>
            <div className="leg-head">
              <h3>Mecz {idx + 1}</h3>
              {legs.length > 1 && (
                <button className="icon-btn small" onClick={() => removeLeg(leg.id)}>
                  ✕
                </button>
              )}
            </div>

            <select
              value={leg.sportKey}
              onChange={(e) => patchLeg(leg.id, { sportKey: e.target.value, result: undefined, pick: undefined })}
            >
              {SPORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>

            <div className="leg-inputs">
              <input
                value={leg.a}
                onChange={(e) => patchLeg(leg.id, { a: e.target.value })}
                placeholder={`${kind} A`}
              />
              <input
                value={leg.b}
                onChange={(e) => patchLeg(leg.id, { b: e.target.value })}
                placeholder={`${kind} B`}
              />
            </div>
            <input
              value={leg.context}
              onChange={(e) => patchLeg(leg.id, { context: e.target.value })}
              placeholder="Kontekst (opcjonalnie)"
            />

            {leg.loading && <div className="leg-status">Analizuję…</div>}
            {leg.error && <div className="error">{leg.error}</div>}

            {leg.result && (
              <div className="picks">
                <span className="rec-tag">
                  {leg.couponPick ? "Twój typ (możesz zmienić)" : "Wybierz typ na kupon"}
                </span>
                {verdict && <div className={`verdict ${verdict.tone}`}>{verdict.text}</div>}
                <div className="pick-row">
                  {picks.map((pk) => {
                    const prob =
                      pk === "a"
                        ? leg.result!.probabilities.a_win
                        : pk === "b"
                        ? leg.result!.probabilities.b_win
                        : leg.result!.probabilities.draw ?? 0;
                    const label =
                      pk === "a"
                        ? leg.result!.competitor_a
                        : pk === "b"
                        ? leg.result!.competitor_b
                        : "Remis";
                    return (
                      <button
                        key={pk}
                        className={`pick-btn ${leg.pick === pk ? "active" : ""}`}
                        onClick={() => {
                          patchLeg(leg.id, { pick: pk });
                          setSaved(false);
                        }}
                      >
                        <span className="pick-name">{label}</span>
                        <strong>{Math.round(prob)}%</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <button className="ghost full" onClick={addLeg} disabled={running}>
        + Dodaj mecz
      </button>

      <button className="primary" onClick={analyzeAll} disabled={running}>
        {running ? progress || "Analizuję…" : "Analizuj kupon"}
      </button>

      {budgetHit && !running && (
        <div className="error">
          Osiągnięto limit budżetu kuponu (${BUDGET_USD.toFixed(2)}). Część
          meczów pominięto. Usuń kilka pozycji i analizuj w mniejszych paczkach.
        </div>
      )}

      {completed.length > 0 && !running && (
        <section className="card combined">
          <span className="rec-tag">Szansa na trafienie całego kuponu</span>
          <div className="combined-pct">{combined.toFixed(1)}%</div>
          <ul className="combined-list">
            {completed.map((l, i) => {
              const label =
                l.pick === "a"
                  ? l.result!.competitor_a
                  : l.pick === "b"
                  ? l.result!.competitor_b
                  : "Remis";
              return (
                <li key={l.id}>
                  <span>
                    {i + 1}. {l.result!.competitor_a} – {l.result!.competitor_b}
                  </span>
                  <strong>{label} · {Math.round(pickProb(l.result!, l.pick!))}%</strong>
                </li>
              );
            })}
          </ul>
          {weakLegs.length > 0 && (
            <div className="improve">
              <span className="rec-tag">Co poprawić</span>
              <ul className="combined-list">
                {weakLegs.map((l) => {
                  const v = couponVerdict(l.result!, l.pick!, getSport(l.sportKey).hasDraw);
                  return (
                    <li key={l.id} className={v.tone}>
                      <span>
                        {l.result!.competitor_a} – {l.result!.competitor_b}
                      </span>
                      <strong>{v.text}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <button className="ghost full" onClick={saveKupon} disabled={saved}>
            {saved ? "Zapisano w historii ✓" : "Zapisz kupon do historii"}
          </button>
          {cost > 0 && (
            <p className="cost-note">
              Koszt analizy: <strong>${cost.toFixed(2)}</strong> z limitu $
              {BUDGET_USD.toFixed(2)}.
            </p>
          )}
          <p className="disclaimer">
            Im więcej meczów, tym niższa łączna szansa. Aplikacja rozrywkowa — nie
            stanowi porady hazardowej.
          </p>
        </section>
      )}
    </>
  );
}

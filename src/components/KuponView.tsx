import { useState } from "react";
import { SPORTS, getSport } from "../sports";
import { analyzeMatch } from "../claude";
import { addHistory, newId } from "../history";
import { bestPick, combinedProb, pickProb } from "../picks";
import type { KuponLeg, Pick, SavedKuponLeg, Settings } from "../types";

interface Props {
  settings: Settings;
  openSettings: () => void;
}

function emptyLeg(): KuponLeg {
  return { id: newId(), sportKey: "football", a: "", b: "", context: "" };
}

export function KuponView({ settings, openSettings }: Props) {
  const [legs, setLegs] = useState<KuponLeg[]>(() => [emptyLeg(), emptyLeg()]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [saved, setSaved] = useState(false);

  function patchLeg(id: string, patch: Partial<KuponLeg>) {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
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
    let done = 0;
    for (const leg of targets) {
      done++;
      setProgress(`Analizuję mecz ${done}/${targets.length}…`);
      patchLeg(leg.id, { loading: true, error: undefined });
      const sport = getSport(leg.sportKey);
      try {
        const res = await analyzeMatch({
          apiKey: settings.apiKey,
          model: settings.model,
          sport,
          competitorA: leg.a.trim(),
          competitorB: leg.b.trim(),
          context: leg.context.trim() || undefined,
        });
        patchLeg(leg.id, {
          loading: false,
          result: res,
          pick: bestPick(res, sport.hasDraw),
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

  return (
    <>
      <div className="kupon-intro">
        Dodaj kilka meczów. Łączna szansa to prawdopodobieństwo trafienia
        <strong> wszystkich </strong> typów naraz.
      </div>

      {legs.map((leg, idx) => {
        const sport = getSport(leg.sportKey);
        const kind = sport.competitorKind === "person" ? "Zawodnik" : "Drużyna";
        const picks: Pick[] = sport.hasDraw ? ["a", "draw", "b"] : ["a", "b"];
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
                <span className="rec-tag">Wybierz typ na kupon</span>
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
          <button className="ghost full" onClick={saveKupon} disabled={saved}>
            {saved ? "Zapisano w historii ✓" : "Zapisz kupon do historii"}
          </button>
          <p className="disclaimer">
            Im więcej meczów, tym niższa łączna szansa. Aplikacja rozrywkowa — nie
            stanowi porady hazardowej.
          </p>
        </section>
      )}
    </>
  );
}

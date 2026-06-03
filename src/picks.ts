import type { AnalysisResult, Pick } from "./types";

export function pickProb(r: AnalysisResult, pick: Pick): number {
  const p = r.probabilities;
  if (pick === "a") return p.a_win ?? 0;
  if (pick === "b") return p.b_win ?? 0;
  return p.draw ?? 0;
}

export function pickLabel(r: AnalysisResult, pick: Pick): string {
  if (pick === "a") return `Wygrana: ${r.competitor_a}`;
  if (pick === "b") return `Wygrana: ${r.competitor_b}`;
  return "Remis";
}

export function bestPick(r: AnalysisResult, hasDraw: boolean): Pick {
  const p = r.probabilities;
  const opts: [Pick, number][] = [
    ["a", p.a_win ?? 0],
    ["b", p.b_win ?? 0],
  ];
  if (hasDraw && typeof p.draw === "number") opts.push(["draw", p.draw]);
  opts.sort((x, y) => y[1] - x[1]);
  return opts[0][0];
}

// Prawdopodobieństwo trafienia WSZYSTKICH typów na kuponie (iloczyn).
export function combinedProb(probs: number[]): number {
  if (probs.length === 0) return 0;
  return probs.reduce((acc, x) => acc * (x / 100), 1) * 100;
}

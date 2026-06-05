import type { Pick } from "./types";

export interface ParsedLeg {
  a: string;
  b: string;
  pick: Pick; // który z zawodników (A/B) był zaznaczony na wklejonym kuponie
}

// Marker rynku w formacie kuponu (np. z Fortuny/STS). Tylko "zwycięzca meczu".
const MARKET = "zwycięzca meczu";
const TIME_RE = /^\d{1,2}:\d{2}$/;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Parsuje surowy, wklejony kupon. Każdy mecz to blok:
//   <Twój typ>
//   Zwycięzca meczu
//   <Zawodnik A>
//   [Dziś w nocy / Jutro ...]   (opcjonalna data)
//   <godzina HH:MM>
//   <Zawodnik B>
// Twój typ (linia przed markerem) jest równy A albo B — stąd odzyskujemy pick.
export function parseCoupon(raw: string): ParsedLeg[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const legs: ParsedLeg[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (norm(lines[i]) !== MARKET) continue;

    const pick = lines[i - 1];
    const a = lines[i + 1];
    if (!pick || !a) continue;

    // Po A pomiń ewentualne linie-daty aż do godziny; B jest tuż po godzinie.
    let t = i + 2;
    while (t < lines.length && !TIME_RE.test(lines[t]) && norm(lines[t]) !== MARKET) {
      t++;
    }
    const b = lines[t + 1];
    if (!b || TIME_RE.test(b) || norm(b) === MARKET) continue;

    const pk: Pick = norm(pick) === norm(b) ? "b" : "a";
    legs.push({ a, b, pick: pk });
  }
  return legs;
}

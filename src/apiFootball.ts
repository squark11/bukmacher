// Klient API-Football (api-sports.io) — wolany bezpiecznie z przeglądarki (CORS *).
// Klucz uzytkownika (z dashboard.api-football.com), trzymany lokalnie.
// Buduje zwiezle podsumowanie zweryfikowanych danych do wzbogacenia analizy AI.

const BASE = "https://v3.football.api-sports.io";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function af(path: string, key: string): Promise<any[]> {
  const res = await fetch(BASE + path, { headers: { "x-apisports-key": key } });
  const json: any = await res.json().catch(() => ({}));
  const errs = json?.errors;
  const hasErr = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (!res.ok || hasErr) {
    throw new Error(typeof errs === "object" ? JSON.stringify(errs) : `HTTP ${res.status}`);
  }
  return Array.isArray(json?.response) ? json.response : [];
}

async function searchTeam(name: string, key: string): Promise<{ id: number; name: string } | null> {
  const r = await af(`/teams?search=${encodeURIComponent(name)}`, key);
  const first = r[0];
  if (!first?.team?.id) return null;
  return { id: first.team.id, name: first.team.name };
}

function fmtDate(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

function outcomeFor(teamId: number, fx: any): "W" | "D" | "L" | "?" {
  const hg = fx?.goals?.home;
  const ag = fx?.goals?.away;
  if (hg == null || ag == null) return "?";
  const isHome = fx?.teams?.home?.id === teamId;
  const mine = isHome ? hg : ag;
  const opp = isHome ? ag : hg;
  if (mine > opp) return "W";
  if (mine < opp) return "L";
  return "D";
}

function fixtureLine(fx: any, teamId?: number): string {
  const d = fmtDate(fx?.fixture?.date);
  const h = fx?.teams?.home?.name ?? "?";
  const a = fx?.teams?.away?.name ?? "?";
  const hg = fx?.goals?.home ?? "-";
  const ag = fx?.goals?.away ?? "-";
  const res = teamId ? ` [${outcomeFor(teamId, fx)}]` : "";
  return `${d}: ${h} ${hg}:${ag} ${a}${res}`;
}

function sumCards(bucket: any): number {
  if (!bucket) return 0;
  return Object.values(bucket).reduce(
    (s: number, v: any) => s + (typeof v?.total === "number" ? v.total : 0),
    0
  );
}

// /teams/statistics zwraca obiekt, nie tablice — osobny helper.
async function rawStats(path: string, key: string): Promise<any> {
  const res = await fetch(BASE + path, { headers: { "x-apisports-key": key } });
  const json: any = await res.json().catch(() => ({}));
  return json?.response ?? null;
}

export interface FootballEnrichment {
  text: string;
  teamA: string;
  teamB: string;
}

export async function buildFootballEnrichment(
  aName: string,
  bName: string,
  key: string
): Promise<FootballEnrichment | null> {
  const [ta, tb] = await Promise.all([
    searchTeam(aName, key).catch(() => null),
    searchTeam(bName, key).catch(() => null),
  ]);
  if (!ta || !tb) return null;

  const [h2h, lastA, lastB] = await Promise.all([
    af(`/fixtures/headtohead?h2h=${ta.id}-${tb.id}&last=8`, key).catch(() => []),
    af(`/fixtures?team=${ta.id}&last=8`, key).catch(() => []),
    af(`/fixtures?team=${tb.id}&last=8`, key).catch(() => []),
  ]);

  const [statsA, statsB] = await Promise.all([
    statsLine(ta.id, lastA, key),
    statsLine(tb.id, lastB, key),
  ]);

  const lines: string[] = [];
  lines.push(`Drużyna A: ${ta.name}`);
  if (lastA.length) {
    lines.push("  Ostatnie mecze:");
    lastA.forEach((fx) => lines.push(`   - ${fixtureLine(fx, ta.id)}`));
  }
  if (statsA) lines.push(statsA);

  lines.push(`Drużyna B: ${tb.name}`);
  if (lastB.length) {
    lines.push("  Ostatnie mecze:");
    lastB.forEach((fx) => lines.push(`   - ${fixtureLine(fx, tb.id)}`));
  }
  if (statsB) lines.push(statsB);

  if (h2h.length) {
    lines.push("Bezpośrednie pojedynki (H2H):");
    h2h.forEach((fx) => lines.push(`   - ${fixtureLine(fx)}`));
  }

  return { text: lines.join("\n"), teamA: ta.name, teamB: tb.name };
}

async function statsLine(teamId: number, fixtures: any[], key: string): Promise<string> {
  const recent = fixtures[0];
  const leagueId = recent?.league?.id;
  const season = recent?.league?.season;
  if (!leagueId || !season) return "";
  const data = await rawStats(
    `/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
    key
  ).catch(() => null);
  if (!data) return "";
  const form = data?.form ? String(data.form).slice(-8) : null;
  const yellow = sumCards(data?.cards?.yellow);
  const red = sumCards(data?.cards?.red);
  const gFor = data?.goals?.for?.average?.total;
  const gAgainst = data?.goals?.against?.average?.total;
  const parts: string[] = [];
  if (form) parts.push(`forma ${form}`);
  if (yellow || red) parts.push(`kartki w sezonie: ${yellow} żółtych / ${red} czerwonych`);
  if (gFor) parts.push(`śr. gole strzelone ${gFor}`);
  if (gAgainst) parts.push(`śr. stracone ${gAgainst}`);
  return parts.length
    ? `  Statystyki sezonu (${data?.league?.name ?? leagueId} ${season}): ${parts.join(", ")}`
    : "";
}

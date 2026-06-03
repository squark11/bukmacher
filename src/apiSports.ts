// Klient API-Sports (api-sports.io) — wołany bezpiecznie z przeglądarki (CORS *).
// Jeden klucz użytkownika obsługuje wszystkie dyscypliny. Trzymany lokalnie.
// Buduje zwięzłe podsumowanie zweryfikowanych danych do wzbogacenia analizy AI.
// Każdy adapter jest opakowany w try/catch — przy błędzie zwraca null i analiza
// opiera się wtedy wyłącznie na web search (bez zmyślania).

/* eslint-disable @typescript-eslint/no-explicit-any */

// Hosty per dyscyplina. Brak wpisu = brak danych z API (tylko web search).
const HOSTS: Record<string, string> = {
  football: "https://v3.football.api-sports.io",
  basketball: "https://v1.basketball.api-sports.io",
  volleyball: "https://v1.volleyball.api-sports.io",
  handball: "https://v1.handball.api-sports.io",
  hockey: "https://v1.hockey.api-sports.io",
  baseball: "https://v1.baseball.api-sports.io",
  rugby: "https://v1.rugby.api-sports.io",
  afl: "https://v1.afl.api-sports.io",
  nfl: "https://v1.american-football.api-sports.io",
  mma: "https://v1.mma.api-sports.io",
};

async function call(host: string, path: string, key: string): Promise<any[]> {
  const res = await fetch(host + path, { headers: { "x-apisports-key": key } });
  const json: any = await res.json().catch(() => ({}));
  const errs = json?.errors;
  const hasErr = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
  if (!res.ok || hasErr) {
    throw new Error(typeof errs === "object" ? JSON.stringify(errs) : `HTTP ${res.status}`);
  }
  return Array.isArray(json?.response) ? json.response : [];
}

async function callRaw(host: string, path: string, key: string): Promise<any> {
  const res = await fetch(host + path, { headers: { "x-apisports-key": key } });
  const json: any = await res.json().catch(() => ({}));
  return json?.response ?? null;
}

function fmtDate(iso?: string): string {
  return iso ? String(iso).slice(0, 10) : "";
}

export interface Enrichment {
  text: string;
}

// Wejście: dyscyplina decyduje o adapterze.
export async function buildEnrichment(
  sportKey: string,
  aName: string,
  bName: string,
  key: string
): Promise<Enrichment | null> {
  const host = HOSTS[sportKey];
  if (!host) return null;
  try {
    if (sportKey === "football") return await footballEnrichment(host, aName, bName, key);
    if (sportKey === "mma") return await mmaEnrichment(host, aName, bName, key);
    return await teamSportEnrichment(host, aName, bName, key);
  } catch {
    return null;
  }
}

/* ---------- Piłka nożna (v3 — najbogatsze dane) ---------- */

async function footballSearchTeam(
  host: string,
  name: string,
  key: string
): Promise<{ id: number; name: string } | null> {
  const r = await call(host, `/teams?search=${encodeURIComponent(name)}`, key);
  const first = r[0];
  if (!first?.team?.id) return null;
  return { id: first.team.id, name: first.team.name };
}

function footballOutcome(teamId: number, fx: any): "W" | "D" | "L" | "?" {
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

function footballLine(fx: any, teamId?: number): string {
  const d = fmtDate(fx?.fixture?.date);
  const h = fx?.teams?.home?.name ?? "?";
  const a = fx?.teams?.away?.name ?? "?";
  const hg = fx?.goals?.home ?? "-";
  const ag = fx?.goals?.away ?? "-";
  const res = teamId ? ` [${footballOutcome(teamId, fx)}]` : "";
  return `${d}: ${h} ${hg}:${ag} ${a}${res}`;
}

function sumCards(bucket: any): number {
  if (!bucket) return 0;
  return Object.values(bucket).reduce(
    (s: number, v: any) => s + (typeof v?.total === "number" ? v.total : 0),
    0
  );
}

async function footballStatsLine(
  host: string,
  teamId: number,
  fixtures: any[],
  key: string
): Promise<string> {
  const recent = fixtures[0];
  const leagueId = recent?.league?.id;
  const season = recent?.league?.season;
  if (!leagueId || !season) return "";
  const data = await callRaw(
    host,
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

async function footballEnrichment(
  host: string,
  aName: string,
  bName: string,
  key: string
): Promise<Enrichment | null> {
  const [ta, tb] = await Promise.all([
    footballSearchTeam(host, aName, key).catch(() => null),
    footballSearchTeam(host, bName, key).catch(() => null),
  ]);
  if (!ta || !tb) return null;

  const [h2h, lastA, lastB] = await Promise.all([
    call(host, `/fixtures/headtohead?h2h=${ta.id}-${tb.id}&last=8`, key).catch(() => []),
    call(host, `/fixtures?team=${ta.id}&last=8`, key).catch(() => []),
    call(host, `/fixtures?team=${tb.id}&last=8`, key).catch(() => []),
  ]);

  const [statsA, statsB] = await Promise.all([
    footballStatsLine(host, ta.id, lastA, key),
    footballStatsLine(host, tb.id, lastB, key),
  ]);

  const lines: string[] = [];
  lines.push(`Drużyna A: ${ta.name}`);
  if (lastA.length) {
    lines.push("  Ostatnie mecze:");
    lastA.forEach((fx) => lines.push(`   - ${footballLine(fx, ta.id)}`));
  }
  if (statsA) lines.push(statsA);

  lines.push(`Drużyna B: ${tb.name}`);
  if (lastB.length) {
    lines.push("  Ostatnie mecze:");
    lastB.forEach((fx) => lines.push(`   - ${footballLine(fx, tb.id)}`));
  }
  if (statsB) lines.push(statsB);

  if (h2h.length) {
    lines.push("Bezpośrednie pojedynki (H2H):");
    h2h.forEach((fx) => lines.push(`   - ${footballLine(fx)}`));
  }

  return { text: lines.join("\n") };
}

/* ---------- Generyczne dyscypliny drużynowe (v1) ---------- */

function genericSearchTeam(
  host: string,
  name: string,
  key: string
): Promise<{ id: number; name: string } | null> {
  return call(host, `/teams?search=${encodeURIComponent(name)}`, key).then((r) => {
    const first = r[0];
    // v1 zwraca płaski obiekt {id,name}; bywa też zagnieżdżony {team:{...}}.
    const id = first?.id ?? first?.team?.id;
    const nm = first?.name ?? first?.team?.name;
    if (id == null) return null;
    return { id, name: nm ?? name };
  });
}

function gameDate(g: any): string {
  return fmtDate(g?.date ?? g?.game?.date ?? g?.fixture?.date ?? g?.time);
}

// Defensywne wyciąganie wyniku — kształt scores różni się per dyscyplina.
function sideScore(scores: any, side: "home" | "away"): number | null {
  const s = scores?.[side];
  if (s == null) return null;
  if (typeof s === "number") return s;
  const v = s.total ?? s.points ?? s.score;
  return typeof v === "number" ? v : null;
}

function genericTeams(g: any): { home: { id?: number; name?: string }; away: { id?: number; name?: string } } {
  const t = g?.teams ?? {};
  return { home: t.home ?? {}, away: t.away ?? {} };
}

function isFinished(g: any): boolean {
  const home = sideScore(g?.scores, "home");
  const away = sideScore(g?.scores, "away");
  return home != null && away != null;
}

function genericLine(g: any, teamId?: number): string {
  const d = gameDate(g);
  const { home, away } = genericTeams(g);
  const hs = sideScore(g?.scores, "home");
  const as = sideScore(g?.scores, "away");
  let res = "";
  if (teamId != null && hs != null && as != null) {
    const isHome = home.id === teamId;
    const mine = isHome ? hs : as;
    const opp = isHome ? as : hs;
    res = mine > opp ? " [W]" : mine < opp ? " [L]" : " [D]";
  }
  return `${d}: ${home.name ?? "?"} ${hs ?? "-"}:${as ?? "-"} ${away.name ?? "?"}${res}`;
}

function seasonCandidates(): string[] {
  const y = new Date().getFullYear();
  return [String(y), String(y - 1), `${y - 1}-${y}`, `${y}-${y + 1}`];
}

async function genericLastGames(
  host: string,
  teamId: number,
  key: string
): Promise<any[]> {
  for (const season of seasonCandidates()) {
    const games = await call(host, `/games?team=${teamId}&season=${season}`, key).catch(() => []);
    const done = games.filter(isFinished);
    if (done.length) {
      done.sort((a, b) => gameDate(b).localeCompare(gameDate(a)));
      return done.slice(0, 8);
    }
  }
  return [];
}

async function teamSportEnrichment(
  host: string,
  aName: string,
  bName: string,
  key: string
): Promise<Enrichment | null> {
  const [ta, tb] = await Promise.all([
    genericSearchTeam(host, aName, key).catch(() => null),
    genericSearchTeam(host, bName, key).catch(() => null),
  ]);
  if (!ta || !tb) return null;

  const [lastA, lastB, h2h] = await Promise.all([
    genericLastGames(host, ta.id, key),
    genericLastGames(host, tb.id, key),
    call(host, `/games?h2h=${ta.id}-${tb.id}`, key)
      .catch(() => [])
      .then((g) => g.filter(isFinished).slice(0, 8)),
  ]);

  if (!lastA.length && !lastB.length && !h2h.length) return null;

  const lines: string[] = [];
  lines.push(`Drużyna A: ${ta.name}`);
  if (lastA.length) {
    lines.push("  Ostatnie mecze:");
    lastA.forEach((g) => lines.push(`   - ${genericLine(g, ta.id)}`));
  }
  lines.push(`Drużyna B: ${tb.name}`);
  if (lastB.length) {
    lines.push("  Ostatnie mecze:");
    lastB.forEach((g) => lines.push(`   - ${genericLine(g, tb.id)}`));
  }
  if (h2h.length) {
    lines.push("Bezpośrednie pojedynki (H2H):");
    h2h.forEach((g) => lines.push(`   - ${genericLine(g)}`));
  }

  return { text: lines.join("\n") };
}

/* ---------- MMA / Boks (v1 — zawodnicy) ---------- */

async function mmaSearchFighter(
  host: string,
  name: string,
  key: string
): Promise<{ id: number; name: string } | null> {
  const r = await call(host, `/fighters?search=${encodeURIComponent(name)}`, key);
  const first = r[0];
  const id = first?.id;
  if (id == null) return null;
  return { id, name: first?.name ?? name };
}

function mmaFightLine(fight: any, fighterName: string): string {
  const d = gameDate(fight);
  const fighters = fight?.fighters ?? {};
  const first = fighters?.first ?? {};
  const second = fighters?.second ?? {};
  const fn = first?.name ?? first?.fighter?.name ?? "?";
  const sn = second?.name ?? second?.fighter?.name ?? "?";
  const winner = first?.winner ? fn : second?.winner ? sn : null;
  const res = winner ? (winner === fighterName ? " [W]" : " [L]") : "";
  return `${d}: ${fn} vs ${sn}${res}`;
}

async function mmaEnrichment(
  host: string,
  aName: string,
  bName: string,
  key: string
): Promise<Enrichment | null> {
  const [fa, fb] = await Promise.all([
    mmaSearchFighter(host, aName, key).catch(() => null),
    mmaSearchFighter(host, bName, key).catch(() => null),
  ]);
  if (!fa || !fb) return null;

  const [lastA, lastB] = await Promise.all([
    call(host, `/fights?fighter=${fa.id}`, key).catch(() => []),
    call(host, `/fights?fighter=${fb.id}`, key).catch(() => []),
  ]);
  const doneA = lastA.slice(0, 6);
  const doneB = lastB.slice(0, 6);
  if (!doneA.length && !doneB.length) return null;

  const lines: string[] = [];
  lines.push(`Zawodnik A: ${fa.name}`);
  if (doneA.length) {
    lines.push("  Ostatnie walki:");
    doneA.forEach((f) => lines.push(`   - ${mmaFightLine(f, fa.name)}`));
  }
  lines.push(`Zawodnik B: ${fb.name}`);
  if (doneB.length) {
    lines.push("  Ostatnie walki:");
    doneB.forEach((f) => lines.push(`   - ${mmaFightLine(f, fb.name)}`));
  }
  return { text: lines.join("\n") };
}

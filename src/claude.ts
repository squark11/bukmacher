import type { AnalysisResult, SportDef } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface AnalyzeParams {
  apiKey: string;
  model: string;
  sport: SportDef;
  competitorA: string;
  competitorB: string;
  context?: string;
  enrichment?: string;
  webSearch?: boolean; // domyślnie true; false = tryb taniego kuponu bez wyszukiwania
  maxTokens?: number; // domyślnie 4096; w kuponie obniżane, by ograniczyć koszt
}

export interface AnalyzeOutcome {
  result: AnalysisResult;
  costUsd: number; // realny koszt tego zapytania policzony z pola usage
}

function buildSystemPrompt(sport: SportDef, webSearch: boolean): string {
  const drawNote = sport.hasDraw
    ? 'W tej dyscyplinie remis JEST możliwy — pole "draw" musi być liczbą.'
    : 'W tej dyscyplinie remis NIE jest możliwy — pole "draw" musi być null.';

  const rules = webSearch
    ? `1. ZAWSZE używaj narzędzia web_search, aby znaleźć NAJNOWSZE i NAJPEWNIEJSZE dane. Wykonaj kilka wyszukiwań (forma w ostatnich meczach, bezpośrednie pojedynki "head to head", kontuzje/zawieszenia, miejsce rozgrywania, ranking/tabela, najnowsze wiadomości).
2. CELUJ przede wszystkim w Sofascore i Flashscore (np. wyszukuj "sofascore <drużyna A> <drużyna B>", "flashscore <zawodnik>"), a dodatkowo oficjalne ligi, ESPN, Transfermarkt, BBC Sport, oficjalne strony klubów/zawodników. Ignoruj niewiarygodne źródła i typy "pewniaków".
3. Tam, gdzie to możliwe, wyciągaj też statystyki szczegółowe: kartki (żółte/czerwone), faule, strzały, posiadanie piłki, gole w poszczególnych połowach, serie zwycięstw/porażek. Uwaga: serwisy typu Sofascore/Flashscore renderują liczby dynamicznie i mogą być niedostępne w treści strony — jeśli nie uda się ich potwierdzić, NIE zmyślaj. Oprzyj się wtedy na relacjach/podsumowaniach meczów i wyraźnie zaznacz brak w polu key_factors lub obniż "confidence".
4. Oprzyj prognozę na faktach, nie zgadywaniu. Jeśli danych jest mało, obniż pewność ("confidence").
5. Prawdopodobieństwa muszą sumować się do 100. ${drawNote}
6. Bądź obiektywny i ostrożny — to aplikacja rozrywkowa, nie narzędzie do hazardu.`
    : `1. NIE masz dostępu do internetu w tej analizie. Oprzyj się WYŁĄCZNIE na dostarczonych ZWERYFIKOWANYCH DANYCH (API-Sports, jeśli są) oraz na swojej wiedzy o zawodnikach/drużynach.
2. Jeśli danych jest mało lub mogą być nieaktualne, WYRAŹNIE obniż "confidence" (zwykle "niska") i zaznacz braki w "key_factors". NIE zmyślaj statystyk, wyników ani kontuzji.
3. Oprzyj prognozę na faktach, nie zgadywaniu.
4. Prawdopodobieństwa muszą sumować się do 100. ${drawNote}
5. Bądź obiektywny i ostrożny — to aplikacja rozrywkowa, nie narzędzie do hazardu.
6. Pisz zwięźle — krótkie zdania, bez rozwlekłych opisów.`;

  const sourcesField = webSearch
    ? '"sources": [ { "title": string, "url": string } ]'
    : '"sources": []                    // analiza bez wyszukiwania — zostaw pustą tablicę';

  return `Jesteś doświadczonym analitykiem sportowym. Twoim zadaniem jest oszacowanie szans na wynik pojedynku w dyscyplinie: ${sport.label}.

ZASADY ANALIZY:
${rules}

FORMAT ODPOWIEDZI:
Po zakończeniu analizy zwróć WYŁĄCZNIE jeden obiekt JSON w bloku \`\`\`json ... \`\`\`. Bez dodatkowego tekstu po bloku. Schemat:
{
  "sport": string,
  "competitor_a": string,
  "competitor_b": string,
  "probabilities": { "a_win": number, "draw": number|null, "b_win": number },
  "recommended_bet": string,        // np. "Wygrana A", "Remis", "Wygrana B" + krótkie uzasadnienie
  "confidence": "niska"|"średnia"|"wysoka",
  "predicted_score": string|null,   // np. "2:1" lub null
  "key_factors": string[],          // 3-6 najważniejszych czynników
  "recent_form": { "a": string, "b": string },
  "head_to_head": string,
  "disclaimer": string,             // krótkie przypomnienie, że to rozrywka, nie hazard
  ${sourcesField}
}
Wszystkie wartości tekstowe po polsku.`;
}

// Cennik za milion tokenów (USD). Web search liczony osobno za zapytanie.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};
const FALLBACK_PRICING = { in: 3, out: 15 };
const WEB_SEARCH_USD = 0.01;

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
}

// Liczy koszt zachowawczo (input liczony pełną stawką, bez rabatu za cache) —
// dzięki temu strażnik budżetu raczej przeszacuje niż przekroczy limit.
function estimateCostUsd(model: string, usage?: AnthropicUsage): number {
  if (!usage) return 0;
  const p = PRICING[model] ?? FALLBACK_PRICING;
  const inTok =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
  const outTok = usage.output_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out + searches * WEB_SEARCH_USD;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  error?: { type: string; message: string };
  usage?: AnthropicUsage;
}

function extractText(data: AnthropicResponse): string {
  if (!data.content) return "";
  return data.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

function parseResult(text: string): AnalysisResult {
  let jsonStr = "";
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    jsonStr = fence[1].trim();
  } else {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) jsonStr = text.slice(start, end + 1);
  }
  if (!jsonStr) {
    throw new Error("Model nie zwrócił danych w oczekiwanym formacie.");
  }
  const parsed = JSON.parse(jsonStr) as AnalysisResult;
  if (!parsed.probabilities) {
    throw new Error("Brak danych o prawdopodobieństwach w odpowiedzi.");
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Wylicza opóźnienie przed ponowieniem: najpierw respektuje nagłówek
// `retry-after` (sekundy), w przeciwnym razie wykładniczy backoff z jitterem.
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 30_000);
  }
  const base = Math.min(1000 * 2 ** (attempt - 1), 16_000);
  return base + Math.floor(Math.random() * 500);
}

export async function analyzeMatch(params: AnalyzeParams): Promise<AnalyzeOutcome> {
  const { apiKey, model, sport, competitorA, competitorB, context, enrichment } = params;
  const webSearch = params.webSearch ?? true;
  const maxTokens = params.maxTokens ?? 4096;

  const closing = webSearch
    ? `Znajdź aktualne dane w internecie i oszacuj szanse na wynik.`
    : `Oszacuj szanse na wynik na podstawie powyższych danych i swojej wiedzy.`;
  const enrichmentNote = webSearch
    ? "potraktuj je jako fakty o najwyższym priorytecie; uzupełnij web searchem o kontuzje, newsy i kontekst"
    : "potraktuj je jako fakty o najwyższym priorytecie";

  const userMsg =
    `Przeanalizuj pojedynek (${sport.label}):\n` +
    `A: ${competitorA}\n` +
    `B: ${competitorB}\n` +
    (context ? `Dodatkowy kontekst: ${context}\n` : "") +
    (enrichment
      ? `\nZWERYFIKOWANE DANE z API-Sports (${enrichmentNote}):\n${enrichment}\n`
      : "") +
    closing;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: buildSystemPrompt(sport, webSearch),
    messages: [{ role: "user", content: userMsg }],
  };
  if (webSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];
  }

  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(
        "Brak połączenia z API Anthropic. Sprawdź internet i czy klucz API jest poprawny."
      );
    }

    // Limit zapytań (429) lub przeciążenie (529/500-502) — ponów z backoffem.
    if (res.status === 429 || res.status === 529 || (res.status >= 500 && res.status <= 502)) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(res, attempt));
        continue;
      }
      throw new Error("Przekroczono limit zapytań. Spróbuj ponownie za chwilę.");
    }

    const data: AnthropicResponse = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const msg = data.error?.message || `Błąd API (${res.status}).`;
      if (res.status === 401) {
        throw new Error("Nieprawidłowy klucz API. Sprawdź token w ustawieniach.");
      }
      throw new Error(msg);
    }

    const text = extractText(data);
    return { result: parseResult(text), costUsd: estimateCostUsd(model, data.usage) };
  }

  // Nieosiągalne — pętla zawsze zwraca lub rzuca wyżej.
  throw new Error("Przekroczono limit zapytań. Spróbuj ponownie za chwilę.");
}

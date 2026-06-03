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
}

function buildSystemPrompt(sport: SportDef): string {
  const drawNote = sport.hasDraw
    ? 'W tej dyscyplinie remis JEST możliwy — pole "draw" musi być liczbą.'
    : 'W tej dyscyplinie remis NIE jest możliwy — pole "draw" musi być null.';

  return `Jesteś doświadczonym analitykiem sportowym. Twoim zadaniem jest oszacowanie szans na wynik pojedynku w dyscyplinie: ${sport.label}.

ZASADY ANALIZY:
1. ZAWSZE używaj narzędzia web_search, aby znaleźć NAJNOWSZE i NAJPEWNIEJSZE dane. Wykonaj kilka wyszukiwań (forma w ostatnich meczach, bezpośrednie pojedynki "head to head", kontuzje/zawieszenia, miejsce rozgrywania, ranking/tabela, najnowsze wiadomości).
2. CELUJ przede wszystkim w Sofascore i Flashscore (np. wyszukuj "sofascore <drużyna A> <drużyna B>", "flashscore <zawodnik>"), a dodatkowo oficjalne ligi, ESPN, Transfermarkt, BBC Sport, oficjalne strony klubów/zawodników. Ignoruj niewiarygodne źródła i typy "pewniaków".
3. Tam, gdzie to możliwe, wyciągaj też statystyki szczegółowe: kartki (żółte/czerwone), faule, strzały, posiadanie piłki, gole w poszczególnych połowach, serie zwycięstw/porażek. Uwaga: serwisy typu Sofascore/Flashscore renderują liczby dynamicznie i mogą być niedostępne w treści strony — jeśli nie uda się ich potwierdzić, NIE zmyślaj. Oprzyj się wtedy na relacjach/podsumowaniach meczów i wyraźnie zaznacz brak w polu key_factors lub obniż "confidence".
4. Oprzyj prognozę na faktach, nie zgadywaniu. Jeśli danych jest mało, obniż pewność ("confidence").
5. Prawdopodobieństwa muszą sumować się do 100. ${drawNote}
6. Bądź obiektywny i ostrożny — to aplikacja rozrywkowa, nie narzędzie do hazardu.

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
  "sources": [ { "title": string, "url": string } ]
}
Wszystkie wartości tekstowe po polsku.`;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  error?: { type: string; message: string };
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

export async function analyzeMatch(params: AnalyzeParams): Promise<AnalysisResult> {
  const { apiKey, model, sport, competitorA, competitorB, context, enrichment } = params;

  const userMsg =
    `Przeanalizuj pojedynek (${sport.label}):\n` +
    `A: ${competitorA}\n` +
    `B: ${competitorB}\n` +
    (context ? `Dodatkowy kontekst: ${context}\n` : "") +
    (enrichment
      ? `\nZWERYFIKOWANE DANE z API-Sports (potraktuj je jako fakty o najwyższym priorytecie; uzupełnij web searchem o kontuzje, newsy i kontekst):\n${enrichment}\n`
      : "") +
    `Znajdź aktualne dane w internecie i oszacuj szanse na wynik.`;

  const body = {
    model,
    max_tokens: 4096,
    system: buildSystemPrompt(sport),
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
    messages: [{ role: "user", content: userMsg }],
  };

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

  const data: AnthropicResponse = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    const msg = data.error?.message || `Błąd API (${res.status}).`;
    if (res.status === 401) {
      throw new Error("Nieprawidłowy klucz API. Sprawdź token w ustawieniach.");
    }
    if (res.status === 429) {
      throw new Error("Przekroczono limit zapytań. Spróbuj ponownie za chwilę.");
    }
    throw new Error(msg);
  }

  const text = extractText(data);
  return parseResult(text);
}

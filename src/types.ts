export type SportKey =
  | "football"
  | "basketball"
  | "tennis"
  | "volleyball"
  | "handball"
  | "hockey"
  | "mma"
  | "esport"
  | "other";

export interface SportDef {
  key: SportKey;
  label: string;
  hasDraw: boolean;
  competitorKind: "team" | "person";
}

export interface AnalysisResult {
  sport: string;
  competitor_a: string;
  competitor_b: string;
  probabilities: {
    a_win: number; // 0-100
    draw: number | null; // 0-100 lub null jeśli remis niemożliwy
    b_win: number; // 0-100
  };
  recommended_bet: string;
  confidence: "niska" | "średnia" | "wysoka";
  predicted_score: string | null;
  key_factors: string[];
  recent_form: { a: string; b: string };
  head_to_head: string;
  disclaimer: string;
  sources: { title: string; url: string }[];
}

export interface Settings {
  apiKey: string;
  model: string;
}

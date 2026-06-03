export type SportKey =
  | "football"
  | "basketball"
  | "tennis"
  | "volleyball"
  | "handball"
  | "hockey"
  | "baseball"
  | "nfl"
  | "rugby"
  | "afl"
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
  apiSportsKey: string;
}

export type Pick = "a" | "draw" | "b";

export interface KuponLeg {
  id: string;
  sportKey: string;
  a: string;
  b: string;
  context: string;
  result?: AnalysisResult;
  pick?: Pick;
  loading?: boolean;
  error?: string;
}

export interface HistoryEntrySingle {
  id: string;
  ts: number;
  type: "single";
  sportKey: string;
  result: AnalysisResult;
}

export interface SavedKuponLeg {
  sportKey: string;
  result: AnalysisResult;
  pick: Pick;
}

export interface HistoryEntryKupon {
  id: string;
  ts: number;
  type: "kupon";
  combined: number; // 0-100
  legs: SavedKuponLeg[];
}

export type HistoryEntry = HistoryEntrySingle | HistoryEntryKupon;

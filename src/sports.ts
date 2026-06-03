import type { SportDef } from "./types";

export const SPORTS: SportDef[] = [
  { key: "football", label: "Piłka nożna", hasDraw: true, competitorKind: "team" },
  { key: "basketball", label: "Koszykówka", hasDraw: false, competitorKind: "team" },
  { key: "tennis", label: "Tenis", hasDraw: false, competitorKind: "person" },
  { key: "volleyball", label: "Siatkówka", hasDraw: false, competitorKind: "team" },
  { key: "handball", label: "Piłka ręczna", hasDraw: true, competitorKind: "team" },
  { key: "hockey", label: "Hokej", hasDraw: true, competitorKind: "team" },
  { key: "mma", label: "MMA / Boks", hasDraw: false, competitorKind: "person" },
  { key: "esport", label: "E-sport", hasDraw: false, competitorKind: "team" },
  { key: "other", label: "Inne", hasDraw: false, competitorKind: "team" },
];

export function getSport(key: string): SportDef {
  return SPORTS.find((s) => s.key === key) ?? SPORTS[0];
}

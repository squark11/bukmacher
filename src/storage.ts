import type { Settings } from "./types";

const KEY = "bukmacher.settings.v1";

const DEFAULTS: Settings = {
  apiKey: "",
  model: "claude-sonnet-4-6",
  footballApiKey: "",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (szybki, zalecany)" },
  { id: "claude-opus-4-7", label: "Opus 4.7 (najdokładniejszy, droższy)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (najtańszy)" },
];

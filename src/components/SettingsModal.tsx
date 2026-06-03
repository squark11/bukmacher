import { useState } from "react";
import type { Settings } from "../types";
import { AVAILABLE_MODELS } from "../storage";

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [show, setShow] = useState(false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Konfiguracja</h2>

        <label className="field">
          <span>Klucz API Anthropic (Claude)</span>
          <div className="key-row">
            <input
              type={show ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              autoComplete="off"
            />
            <button className="icon-btn" onClick={() => setShow((v) => !v)}>
              {show ? "🙈" : "👁️"}
            </button>
          </div>
          <small>
            Token pobierzesz z console.anthropic.com → Settings → API Keys. Jest
            zapisywany tylko na tym telefonie.
          </small>
        </label>

        <label className="field">
          <span>Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            Anuluj
          </button>
          <button
            className="primary"
            onClick={() => onSave({ apiKey: apiKey.trim(), model })}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

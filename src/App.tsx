import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { loadSettings, saveSettings } from "./storage";
import type { Settings } from "./types";
import { SettingsModal } from "./components/SettingsModal";
import { SingleView } from "./components/SingleView";
import { KuponView } from "./components/KuponView";
import { HistoryView } from "./components/HistoryView";
import { TabBar, type Tab } from "./components/TabBar";

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>("single");

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!settings.apiKey) setShowSettings(true);
  }, []);

  function persist(s: Settings) {
    setSettings(s);
    saveSettings(s);
  }

  const openSettings = () => setShowSettings(true);

  return (
    <div className="app">
      {needRefresh && (
        <div className="update-bar" onClick={() => updateServiceWorker(true)}>
          Dostępna nowa wersja — dotknij, aby zaktualizować.
        </div>
      )}

      <header className="header">
        <div className="brand">
          <span className="logo">⚽</span>
          <h1>Bukmacher AI</h1>
        </div>
        <button className="icon-btn" aria-label="Ustawienia" onClick={openSettings}>
          ⚙️
        </button>
      </header>

      <main className="main">
        {tab === "single" && <SingleView settings={settings} openSettings={openSettings} />}
        {tab === "kupon" && <KuponView settings={settings} openSettings={openSettings} />}
        {tab === "historia" && <HistoryView />}
      </main>

      <TabBar tab={tab} setTab={setTab} />

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            persist(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

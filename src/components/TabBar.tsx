export type Tab = "single" | "kupon" | "historia";

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "single", label: "Pojedynczy", icon: "🎯" },
  { key: "kupon", label: "Kupon", icon: "🧾" },
  { key: "historia", label: "Historia", icon: "🕘" },
];

export function TabBar({ tab, setTab }: Props) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`tab ${tab === t.key ? "active" : ""}`}
          onClick={() => setTab(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

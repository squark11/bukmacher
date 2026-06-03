import { useState } from "react";
import { getSport } from "../sports";
import { pickProb } from "../picks";
import { clearHistory, loadHistory, removeHistory } from "../history";
import type { HistoryEntry } from "../types";
import { ResultView } from "./ResultView";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());
  const [openId, setOpenId] = useState<string | null>(null);

  function remove(id: string) {
    setEntries(removeHistory(id));
    if (openId === id) setOpenId(null);
  }

  function clearAll() {
    clearHistory();
    setEntries([]);
    setOpenId(null);
  }

  if (entries.length === 0) {
    return (
      <div className="empty">
        <p>Brak zapisanych analiz.</p>
        <small>Każda analiza pojedynczego meczu zapisuje się tu automatycznie. Kupony zapisujesz przyciskiem.</small>
      </div>
    );
  }

  return (
    <>
      <div className="history-head">
        <span>{entries.length} zapisanych</span>
        <button className="ghost small" onClick={clearAll}>
          Wyczyść wszystko
        </button>
      </div>

      {entries.map((e) => {
        const open = openId === e.id;
        return (
          <section className="card hist-item" key={e.id}>
            <div className="hist-row" onClick={() => setOpenId(open ? null : e.id)}>
              <div className="hist-info">
                <span className="hist-date">{fmtDate(e.ts)}</span>
                {e.type === "single" ? (
                  <strong>
                    {e.result.competitor_a} – {e.result.competitor_b}
                  </strong>
                ) : (
                  <strong>
                    Kupon ({e.legs.length} mecze) · {e.combined.toFixed(1)}%
                  </strong>
                )}
              </div>
              <button
                className="icon-btn small"
                onClick={(ev) => {
                  ev.stopPropagation();
                  remove(e.id);
                }}
              >
                🗑️
              </button>
            </div>

            {open && e.type === "single" && (
              <ResultView result={e.result} sport={getSport(e.sportKey)} />
            )}

            {open && e.type === "kupon" && (
              <div className="hist-kupon">
                {e.legs.map((l, i) => {
                  const label =
                    l.pick === "a"
                      ? l.result.competitor_a
                      : l.pick === "b"
                      ? l.result.competitor_b
                      : "Remis";
                  return (
                    <div className="hist-leg" key={i}>
                      <span>
                        {i + 1}. {l.result.competitor_a} – {l.result.competitor_b}
                      </span>
                      <strong>
                        {label} · {Math.round(pickProb(l.result, l.pick))}%
                      </strong>
                    </div>
                  );
                })}
                <div className="hist-combined">
                  Łączna szansa: <strong>{e.combined.toFixed(1)}%</strong>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { upsertCell, upsertRemarks } from "@/lib/actions/schedule-entries";
import type { ScheduleConfig } from "@/lib/actions/schedule-config";
import type { ScheduleEntry } from "@/lib/actions/schedule-entries";

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  { label: "Keine", value: null },
  { label: "Blau", value: "#dbeafe" },
  { label: "Grün", value: "#dcfce7" },
  { label: "Gelb", value: "#fef9c3" },
  { label: "Orange", value: "#ffedd5" },
  { label: "Rot", value: "#fee2e2" },
  { label: "Lila", value: "#f3e8ff" },
  { label: "Grau", value: "#f1f5f9" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type CellData = { content: string; bgColor: string | null };
type Grid = Map<string, CellData>;

function key(s: number, r: number, c: number) {
  return `${s}:${r}:${c}`;
}

function buildGrid(
  config: Pick<ScheduleConfig, "shift_names" | "day_names" | "row_counts">,
  entries: ScheduleEntry[]
): Grid {
  const g: Grid = new Map();

  config.shift_names.forEach((_, sIdx) => {
    const rows = config.row_counts[sIdx] ?? 7;
    // col 0 = Zeit/Nr, cols 1..n = days
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= config.day_names.length; c++) {
        g.set(key(sIdx, r, c), { content: "", bgColor: null });
      }
    }
  });

  for (const entry of entries) {
    const k = key(entry.shift_index, entry.row_index, entry.col_index);
    if (g.has(k)) {
      g.set(k, { content: entry.content, bgColor: entry.bg_color });
    }
  }

  return g;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── Save-status indicator ─────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved";

// ── Main component ────────────────────────────────────────────────────────────

export function ScheduleGrid({
  config,
  entries,
  configId,
}: {
  config: ScheduleConfig & { remarks?: string | null };
  entries: ScheduleEntry[];
  configId: string;
}) {
  const [grid, setGrid] = useState<Grid>(() => buildGrid(config, entries));
  const [remarks, setRemarks] = useState(config.remarks ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [colorPicker, setColorPicker] = useState<string | null>(null); // active cell key

  // Debounce refs: one timer per cell key
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Input refs for keyboard navigation
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Close color picker when clicking outside
  useEffect(() => {
    if (!colorPicker) return;
    function onDown(e: MouseEvent) {
      const el = e.target as Element;
      if (!el.closest("[data-color-picker]")) setColorPicker(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colorPicker]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function cell(k: string): CellData {
    return grid.get(k) ?? { content: "", bgColor: null };
  }

  function setCell(k: string, patch: Partial<CellData>) {
    setGrid((prev) => {
      const next = new Map(prev);
      const cur = prev.get(k) ?? { content: "", bgColor: null };
      next.set(k, { ...cur, ...patch });
      return next;
    });
  }

  function triggerSaveStatus() {
    setSaveStatus("saving");
  }

  function markSaved() {
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleContent = useCallback(
    (s: number, r: number, c: number, content: string) => {
      const k = key(s, r, c);
      setCell(k, { content });
      triggerSaveStatus();

      const old = timers.current.get(k);
      if (old) clearTimeout(old);

      timers.current.set(
        k,
        setTimeout(async () => {
          const cur = grid.get(k);
          await upsertCell(configId, s, r, c, content, cur?.bgColor ?? null);
          markSaved();
        }, 600)
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configId, grid]
  );

  const handleColor = useCallback(
    async (s: number, r: number, c: number, bgColor: string | null) => {
      const k = key(s, r, c);
      const cur = cell(k);
      setCell(k, { bgColor });
      setColorPicker(null);
      setSaveStatus("saving");
      await upsertCell(configId, s, r, c, cur.content, bgColor);
      markSaved();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configId, grid]
  );

  const handleRemarksBlur = useCallback(async () => {
    setSaveStatus("saving");
    await upsertRemarks(configId, remarks);
    markSaved();
  }, [configId, remarks]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (
      e: KeyboardEvent<HTMLInputElement>,
      s: number,
      r: number,
      c: number
    ) => {
      const maxC = config.day_names.length;
      const maxR = (config.row_counts[s] ?? 7) - 1;
      const maxS = config.shift_names.length - 1;

      let ns = s,
        nr = r,
        nc = c;

      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        if (c < maxC) { nc = c + 1; }
        else if (r < maxR) { nc = 0; nr = r + 1; }
        else if (s < maxS) { ns = s + 1; nr = 0; nc = 0; }
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        if (c > 0) { nc = c - 1; }
        else if (r > 0) { nc = maxC; nr = r - 1; }
        else if (s > 0) {
          ns = s - 1;
          nr = (config.row_counts[s - 1] ?? 7) - 1;
          nc = maxC;
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (r < maxR) nr = r + 1;
        else if (s < maxS) { ns = s + 1; nr = 0; }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (r < maxR) nr = r + 1;
        else if (s < maxS) { ns = s + 1; nr = 0; }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (r > 0) nr = r - 1;
        else if (s > 0) { ns = s - 1; nr = (config.row_counts[s - 1] ?? 7) - 1; }
      } else {
        return;
      }

      const target = inputRefs.current.get(key(ns, nr, nc));
      target?.focus();
      target?.select();
    },
    [config]
  );

  function print() {
    window.print();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasDates = config.start_date && config.end_date;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dienstplan</h1>
          {hasDates && (
            <p className="mt-1 text-sm text-gray-500">
              {formatDate(config.start_date!)} – {formatDate(config.end_date!)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-400 animate-pulse">
              Speichern…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-emerald-600 font-medium">
              ✓ Gespeichert
            </span>
          )}
          <button
            onClick={print}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors print:hidden"
          >
            Drucken
          </button>
        </div>
      </div>

      {/* ── Shift sections ───────────────────────────────────────────── */}
      {config.shift_names.map((shiftName, sIdx) => {
        const rowCount = config.row_counts[sIdx] ?? 7;

        return (
          <section key={sIdx} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* Section header */}
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold text-gray-800">
                {shiftName}
              </h2>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-r border-gray-100 bg-gray-50/40 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[80px]">
                      Zeit / Nr.
                    </th>
                    {config.day_names.map((day) => (
                      <th
                        key={day}
                        className="border-b border-r border-gray-100 bg-gray-50/40 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 last:border-r-0"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rowCount }, (_, rIdx) => (
                    <tr key={rIdx} className="group/row">
                      {Array.from(
                        { length: config.day_names.length + 1 },
                        (_, cIdx) => {
                          const k = key(sIdx, rIdx, cIdx);
                          const data = cell(k);
                          const isFirst = cIdx === 0;

                          return (
                            <td
                              key={cIdx}
                              className="relative border-b border-r border-gray-100 last:border-r-0 group/cell"
                              style={{
                                backgroundColor: data.bgColor ?? undefined,
                              }}
                            >
                              {/* Color picker trigger dot */}
                              <button
                                data-color-picker
                                className={`absolute top-1 right-1 z-10 h-3 w-3 rounded-full border transition-opacity
                                  opacity-0 group-hover/cell:opacity-100 print:hidden
                                  ${data.bgColor ? "border-white/60" : "border-gray-300"}`}
                                style={{
                                  backgroundColor: data.bgColor ?? "#e5e7eb",
                                }}
                                title="Farbe wählen"
                                onClick={() =>
                                  setColorPicker(
                                    colorPicker === k ? null : k
                                  )
                                }
                              />

                              {/* Color picker popup */}
                              {colorPicker === k && (
                                <div
                                  data-color-picker
                                  className="absolute right-0 top-5 z-20 flex gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-xl print:hidden"
                                >
                                  {PALETTE.map((c) => (
                                    <button
                                      key={c.label}
                                      title={c.label}
                                      className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 ${
                                        data.bgColor === c.value
                                          ? "border-blue-500 ring-1 ring-blue-300"
                                          : "border-gray-200"
                                      }`}
                                      style={{
                                        backgroundColor: c.value ?? "#f9fafb",
                                      }}
                                      onClick={() =>
                                        handleColor(sIdx, rIdx, cIdx, c.value)
                                      }
                                    />
                                  ))}
                                </div>
                              )}

                              {/* Editable cell */}
                              <input
                                ref={(el) => {
                                  if (el) inputRefs.current.set(k, el);
                                  else inputRefs.current.delete(k);
                                }}
                                type="text"
                                value={data.content}
                                placeholder=""
                                onChange={(e) =>
                                  handleContent(
                                    sIdx,
                                    rIdx,
                                    cIdx,
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) =>
                                  handleKeyDown(e, sIdx, rIdx, cIdx)
                                }
                                className={`w-full bg-transparent px-3 py-2 text-sm text-gray-800 outline-none
                                  focus:bg-blue-50/60 focus:ring-0
                                  ${isFirst ? "font-medium text-gray-500" : ""}
                                  min-w-[80px]`}
                              />
                            </td>
                          );
                        }
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* ── Remarks ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Bemerkungen
        </h2>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={handleRemarksBlur}
          rows={3}
          placeholder="Notizen, Hinweise oder Besonderheiten…"
          className="w-full resize-none bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-300"
        />
      </section>

      {/* ── Print styles ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          nav, aside, [data-color-picker], button { display: none !important; }
          .shadow-sm { box-shadow: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}

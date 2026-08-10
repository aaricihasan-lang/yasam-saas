"use client";

import { useState, type ReactNode } from "react";

export type TabDef = { key: string; label: string; render: () => ReactNode };

/** Sade sekme başlığı (mobilde yatay scroll) + tembel gövde. */
export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div>
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1.5 border-b border-slate-200">
          {tabs.map((t) => {
            const on = t.key === current?.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                  on ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>{current?.render()}</div>
    </div>
  );
}

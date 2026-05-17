"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export type BiyoenerjiSectionId =
  | "seanslar"
  | "enerji-bedenleri"
  | "bilincalti"
  | "imajinasyon"
  | "sembol"
  | "cakralar";

export type BiyoenerjiNavItem = {
  id: BiyoenerjiSectionId;
  label: string;
  icon: string;
};

type BiyoenerjiLayoutProps = {
  items: BiyoenerjiNavItem[];
  activeId: BiyoenerjiSectionId;
  onSelect: (id: BiyoenerjiSectionId) => void;
  children: ReactNode;
};

function NavButtons({
  items,
  activeId,
  onSelect,
  onPick,
  className = "",
}: {
  items: BiyoenerjiNavItem[];
  activeId: BiyoenerjiSectionId;
  onSelect: (id: BiyoenerjiSectionId) => void;
  onPick?: () => void;
  className?: string;
}) {
  return (
    <nav className={className} aria-label="Biyoenerji bölümleri">
      <ul className="space-y-4">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onPick?.();
                }}
                className={`flex h-[72px] w-full items-center justify-start gap-4 rounded-[22px] px-6 text-left text-base font-black shadow-sm transition-all duration-300 hover:scale-[1.02] hover:translate-x-2 xl:text-lg ${
                  active
                    ? "scale-[1.03] bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_10px_30px_rgba(139,92,246,0.30)]"
                    : "border-2 border-violet-100 bg-white/90 text-slate-700 hover:bg-violet-50"
                }`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-xl"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function BiyoenerjiLayout({
  items,
  activeId,
  onSelect,
  children,
}: BiyoenerjiLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeLabel = useMemo(
    () => items.find((i) => i.id === activeId)?.label ?? "Bölüm",
    [items, activeId]
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (mq.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
      {/* Mobil: üst tetikleyici + drawer */}
      <div className="shrink-0 lg:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-white/65 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_6px_28px_-10px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/45 backdrop-blur-lg">
          <span className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-violet-100 via-fuchsia-50 to-cyan-50 px-3 py-1 text-[9px] font-black tracking-[0.18em] text-violet-800 ring-1 ring-violet-200/40 shadow-inner">
            BİYOENERJİ
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-black text-slate-800">{activeLabel}</p>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200/60 bg-violet-50/90 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-violet-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-100/90 active:scale-[0.98]"
            aria-expanded={drawerOpen}
            aria-controls="biyoenerji-drawer"
          >
            <span className="flex flex-col gap-0.5" aria-hidden>
              <span className="h-0.5 w-4 rounded-full bg-violet-700/80" />
              <span className="h-0.5 w-4 rounded-full bg-violet-700/80" />
              <span className="h-0.5 w-3 rounded-full bg-violet-700/60" />
            </span>
            Menü
          </button>
        </div>

        <div
          id="biyoenerji-drawer"
          className={`fixed inset-x-0 top-0 z-50 lg:hidden ${drawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!drawerOpen}
        >
          <div
            className={`absolute inset-0 bg-slate-900/25 backdrop-blur-[2px] transition-opacity duration-300 ${
              drawerOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className={`relative mx-auto max-h-[min(88vh,640px)] w-full max-w-lg overflow-y-auto rounded-b-[1.35rem] border-b border-violet-100/80 border-l border-r border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,243,255,0.96)_40%,rgba(236,254,255,0.92)_100%)] px-4 pb-5 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_24px_48px_-12px_rgba(15,23,42,0.18)] ring-1 ring-violet-100/40 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              drawerOpen ? "translate-y-0" : "-translate-y-[108%]"
            }`}
          >
            <div className="mx-auto mb-4 flex w-full max-w-md items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-100 via-fuchsia-50 to-cyan-50 px-3 py-1 text-[9px] font-black tracking-[0.18em] text-violet-800 ring-1 ring-violet-200/40 shadow-inner">
                BİYOENERJİ
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                Kapat
              </button>
            </div>
            <NavButtons
              items={items}
              activeId={activeId}
              onSelect={onSelect}
              onPick={() => setDrawerOpen(false)}
              className="mx-auto w-full max-w-md pb-2"
            />
          </div>
        </div>
      </div>

      {/* Desktop: sabit premium sidebar */}
      <aside className="hidden w-[320px] shrink-0 xl:block">
        <div className="sticky top-4 min-h-[720px] w-[320px] rounded-[34px] border-[3px] border-violet-300/40 bg-gradient-to-b from-white/85 via-violet-50/70 to-cyan-50/70 p-6 shadow-[0_0_45px_rgba(139,92,246,0.14)] backdrop-blur-xl">
          <div className="mb-6 flex flex-col gap-2">
            <span className="inline-flex w-fit items-center rounded-full bg-gradient-to-r from-violet-100 via-fuchsia-50 to-cyan-50 px-3 py-1.5 text-[9px] font-black tracking-[0.2em] text-violet-800 ring-1 ring-violet-200/45 shadow-inner">
              BİYOENERJİ
            </span>
            <p className="text-sm font-black tracking-[0.20em] text-violet-700">ÇALIŞMA ALANI</p>
          </div>
          <NavButtons items={items} activeId={activeId} onSelect={onSelect} className="pb-1" />
        </div>
      </aside>

      <div className="min-h-0 min-w-0 w-full pb-1 sm:pb-0">{children}</div>
    </div>
  );
}

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
      <ul className="space-y-1">
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
                className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-[13px] font-bold transition-all duration-200 ease-out will-change-transform ${
                  active
                    ? "border-violet-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(237,233,254,0.85)_45%,rgba(224,242,254,0.55)_100%)] text-violet-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(167,139,250,0.12),0_10px_28px_-6px_rgba(109,40,217,0.22)] ring-1 ring-violet-200/50"
                    : "border-transparent bg-transparent text-slate-600 hover:-translate-y-px hover:border-violet-100/80 hover:bg-white/75 hover:text-slate-900 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_8px_22px_-10px_rgba(15,23,42,0.12)]"
                } `}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[16px] transition-all duration-200 ${
                    active
                      ? "bg-white/90 text-violet-700 shadow-inner shadow-violet-100/80 ring-1 ring-violet-100/90"
                      : "bg-white/50 text-slate-500 shadow-inner shadow-white/60 ring-1 ring-white/80 group-hover:scale-[1.04] group-hover:text-violet-600 group-hover:ring-violet-100/70"
                  }`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                {active ? (
                  <span
                    className="flex h-2 w-2 shrink-0 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(109,40,217,0.55)]"
                    aria-hidden
                  />
                ) : (
                  <span
                    className="text-[10px] font-black text-slate-300 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                    aria-hidden
                  >
                    →
                  </span>
                )}
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:gap-8 xl:gap-10">
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
      <aside className="hidden w-[min(100%,288px)] shrink-0 lg:block xl:w-[300px]">
        <div className="sticky top-4 rounded-2xl border border-white/70 bg-[linear-gradient(165deg,rgba(255,255,255,0.92)_0%,rgba(245,243,255,0.88)_38%,rgba(236,253,245,0.55)_72%,rgba(224,242,254,0.42)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_44px_-14px_rgba(15,23,42,0.1)] ring-1 ring-violet-100/55 backdrop-blur-md">
          <div className="mb-4 flex flex-col gap-3">
            <span className="inline-flex w-fit items-center rounded-full bg-gradient-to-r from-violet-100 via-fuchsia-50 to-cyan-50 px-3 py-1.5 text-[9px] font-black tracking-[0.2em] text-violet-800 ring-1 ring-violet-200/45 shadow-inner">
              BİYOENERJİ
            </span>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-500/80">Çalışma alanı</p>
          </div>
          <NavButtons items={items} activeId={activeId} onSelect={onSelect} className="pb-1" />
        </div>
      </aside>

      {/* Sağ içerik — daha ferah */}
      <div className="min-h-0 min-w-0 flex-1 pb-1 sm:pb-0 lg:py-0.5 xl:pr-1">{children}</div>
    </div>
  );
}

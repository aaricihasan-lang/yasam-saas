"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BIOENERJI_SECTIONS_IN_ORDER,
  findBiyoenerjiSection,
  getBiyoenerjiGroups,
  type BiyoenerjiSectionKey,
} from "../biyoenerjiFolderConfig";

/**
 * FAZ 2 — Bölümler arası hızlı geçiş (hibrit nav).
 * Masaüstü: yatay pill şeridi (IA sırasıyla; ilgili bölümler yan yana).
 * Mobil/WebView: tek kolon; sabit rail gizli; "Bölümler" drawer'ı.
 *
 * Route tabanlı (Link + activeSection). Ölü BiyoenerjiLayout'a bağımlılık YOK;
 * mevcut tasarım diliyle uyumlu minimal yeni shell.
 */
export default function BiyoenerjiSectionNav({
  activeSection,
}: {
  activeSection: BiyoenerjiSectionKey;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = findBiyoenerjiSection(activeSection);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Masaüstüne geçince drawer'ı kapat.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (mq.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  const pillBase =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold shadow-sm transition";
  const pillActive =
    "border-transparent bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_6px_18px_rgba(139,92,246,0.28)]";
  const pillIdle =
    "border-violet-100 bg-white/85 text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800";

  return (
    <div className="min-w-0">
      {/* Masaüstü: yatay bölüm şeridi */}
      <nav
        aria-label="Biyoenerji bölümleri"
        className="hidden flex-wrap items-center gap-1.5 lg:flex"
      >
        {BIOENERJI_SECTIONS_IN_ORDER.map((card) => {
          const { Icon } = card;
          const isActive = card.key === activeSection;
          return (
            <Link
              key={card.key}
              href={card.href}
              aria-current={isActive ? "page" : undefined}
              className={`${pillBase} ${isActive ? pillActive : pillIdle}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="truncate">{card.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobil/WebView: geçerli bölüm + Bölümler drawer tetikleyici */}
      <div className="flex items-center gap-2 lg:hidden">
        <span className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-violet-100 bg-white/85 px-3 py-2 text-[13px] font-black text-slate-800 shadow-sm">
          {active ? (
            <>
              <active.card.Icon
                className="h-4 w-4 shrink-0 text-violet-600"
                strokeWidth={2}
                aria-hidden
              />
              <span className="truncate">{active.card.title}</span>
            </>
          ) : (
            <span className="truncate">Bölüm</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-violet-200/70 bg-violet-50/90 px-3 py-2 text-[12px] font-black uppercase tracking-wide text-violet-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-100/90 active:scale-[0.98]"
          aria-expanded={drawerOpen}
          aria-controls="biyoenerji-section-drawer"
        >
          <span className="flex flex-col gap-0.5" aria-hidden>
            <span className="h-0.5 w-4 rounded-full bg-violet-700/80" />
            <span className="h-0.5 w-4 rounded-full bg-violet-700/80" />
            <span className="h-0.5 w-3 rounded-full bg-violet-700/60" />
          </span>
          Bölümler
        </button>
      </div>

      {/* Mobil drawer — gruplu bölüm listesi */}
      <div
        id="biyoenerji-section-drawer"
        className={`fixed inset-x-0 top-0 z-50 lg:hidden ${
          drawerOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-slate-900/25 backdrop-blur-[2px] transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`relative mx-auto max-h-[min(88vh,640px)] w-full max-w-lg overflow-y-auto rounded-b-[1.35rem] border-b border-l border-r border-violet-100/80 border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,243,255,0.96)_40%,rgba(236,254,255,0.92)_100%)] px-4 pb-5 pt-4 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            drawerOpen ? "translate-y-0" : "-translate-y-[108%]"
          }`}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-100 via-fuchsia-50 to-cyan-50 px-3 py-1 text-[9px] font-black tracking-[0.18em] text-violet-800 shadow-inner">
              BİYOENERJİ
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200/80 bg-white/90 px-3 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              Kapat
            </button>
          </div>

          <div className="space-y-4">
            {getBiyoenerjiGroups().map((group) => (
              <div key={group.id}>
                <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700/80">
                  {group.title}
                </p>
                <ul className="space-y-1.5">
                  {group.cards.map((card) => {
                    const { Icon } = card;
                    const isActive = card.key === activeSection;
                    return (
                      <li key={card.key}>
                        <Link
                          href={card.href}
                          onClick={() => setDrawerOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-bold transition ${
                            isActive
                              ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-sm"
                              : "border border-violet-100 bg-white/85 text-slate-700 hover:bg-violet-50"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              isActive ? "bg-white/20 text-white" : "bg-violet-50 text-violet-600"
                            }`}
                            aria-hidden
                          >
                            <Icon className="h-4 w-4" strokeWidth={2} />
                          </span>
                          <span className="min-w-0 truncate">{card.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

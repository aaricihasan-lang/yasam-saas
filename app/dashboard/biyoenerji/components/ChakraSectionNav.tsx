"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";

/**
 * FAZ 3.1 — Çakra detay ikinci-seviye section navigasyonu (controlled).
 * Tek-section workspace: seçim EKRANDA yalnız ilgili section'ı gösterir
 * (anchor-scroll DEĞİL). Masaüstü: sade yatay underline nav (büyük pill YOK).
 * Mobil: kompakt "Bölüm ▾" selector (dar yatay tab dizisi YOK). 44px hedefler.
 */
export default function ChakraSectionNav({
  sections,
  activeHash,
  onSelect,
}: {
  sections: { hash: string; title: string }[];
  activeHash: string;
  onSelect: (hash: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  if (sections.length === 0) return null;

  const active = sections.find((s) => s.hash === activeHash) ?? sections[0]!;

  const pickMobile = (hash: string) => {
    onSelect(hash);
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <>
      {/* Mobil: kompakt bölüm seçici */}
      <details ref={detailsRef} className="relative lg:hidden">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white/85 px-3 shadow-sm">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700/80">Bölüm</span>
            <span className="truncate text-[13px] font-black text-slate-800">{active.title}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </summary>
        <ul className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {sections.map((s) => (
            <li key={s.hash}>
              <button
                type="button"
                onClick={() => pickMobile(s.hash)}
                className={`flex min-h-[44px] w-full items-center px-3 text-left text-[13px] font-semibold transition ${
                  s.hash === active.hash
                    ? "bg-violet-50 text-violet-800"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </details>

      {/* Masaüstü: premium editorial ikinci-seviye nav (sakin underline + hafif
          violet tint active). Büyük SaaS pill / gradient / ağır shadow YOK. */}
      <nav aria-label="Çakra bölümleri" className="hidden border-b border-slate-200/80 lg:block">
        <ul className="flex flex-wrap gap-x-0.5">
          {sections.map((s) => {
            const isActive = s.hash === active.hash;
            return (
              <li key={s.hash}>
                <button
                  type="button"
                  onClick={() => onSelect(s.hash)}
                  aria-current={isActive ? "true" : undefined}
                  className={`-mb-px inline-flex min-h-[44px] items-center rounded-t-lg border-b-2 px-3.5 text-[13px] font-bold tracking-tight transition ${
                    isActive
                      ? "border-violet-500 bg-violet-50/60 text-violet-900"
                      : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-violet-700"
                  }`}
                >
                  {s.title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

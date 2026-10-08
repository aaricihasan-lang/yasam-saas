"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authHeaders, bioFetch } from "@/lib/biyoenerji/secureApi";
import { BIO_GLOBAL_SEARCH_MIN, type BioGlobalHit } from "@/lib/biyoenerji/globalSearch";
import { normalizeTr } from "@/lib/text/turkishSearch";
import { useDemoGuard } from "@/hooks/useDemoGuard";

type SectionResult = { key: string; label: string; total: number; hits: BioGlobalHit[] };
type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; query: string; total: number; sections: SectionResult[] };

const DEBOUNCE_MS = 350;

/**
 * Biyoenerji ana ekranı — modül-içi GENEL arama (WT5). Tüm alt bölümlerdeki (Çakralar, Enerji
 * Bedenleri, Bilinçaltı Sebepleri, Seanslar, İmajinasyonlar, Sembol Dili) KENDİ kayıtlarınızda
 * arar; sonuçta kayıt adı + geldiği bölüm görünür, dokununca kayda (veya bölüme) gider.
 * Sunucu: GET /api/biyoenerji/search (tenant session'dan).
 */
export default function BiyoenerjiGlobalSearch() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const reqSeq = useRef(0);
  const { isDemo } = useDemoGuard();

  useEffect(() => {
    const term = q.trim();
    const seq = ++reqSeq.current;
    if (normalizeTr(term).length < BIO_GLOBAL_SEARCH_MIN) {
      queueMicrotask(() => {
        if (seq === reqSeq.current) setState({ kind: "idle" });
      });
      return;
    }
    const timer = window.setTimeout(async () => {
      setState({ kind: "loading" });
      const res = await bioFetch(`/api/biyoenerji/search?q=${encodeURIComponent(term)}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; query?: string; total?: number; sections?: SectionResult[];
      };
      if (seq !== reqSeq.current) return; // eski yanıt yeni aramayı ezmez
      if (!res.ok || json.ok !== true) {
        setState({ kind: "error", message: json.error ?? "Arama yapılamadı. Lütfen tekrar deneyin." });
        return;
      }
      setState({ kind: "done", query: term, total: json.total ?? 0, sections: json.sections ?? [] });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  return (
    <section
      aria-label="Biyoenerji içinde ara"
      className="mb-4 rounded-2xl border border-white/80 bg-white/85 p-3 shadow-md sm:p-4"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400" aria-hidden />
        <input
          type="search"
          data-testid="bio-global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Biyoenerji içinde ara… (ör. mide, kalp, korku)"
          aria-label="Biyoenerji içinde ara"
          className="min-h-[46px] w-full rounded-xl border border-violet-200/80 bg-white pl-9 pr-10 text-[14px] font-semibold text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Aramayı temizle"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-slate-500">
        Çakralar, Enerji Bedenleri, Bilinçaltı Sebepleri, Seanslar, İmajinasyonlar ve Sembol Dili kayıtlarınızda arar.
      </p>

      <div aria-live="polite" className="mt-2">
        {state.kind === "loading" ? (
          <p className="text-[12px] font-semibold text-slate-500">Aranıyor…</p>
        ) : state.kind === "error" ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700 ring-1 ring-rose-100">{state.message}</p>
        ) : state.kind === "done" ? (
          state.total === 0 ? (
            <p data-testid="bio-global-empty" className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] font-semibold text-slate-600 ring-1 ring-slate-100">
              “{state.query}” için Biyoenerji kayıtlarında sonuç bulunamadı.
            </p>
          ) : (
            <div data-testid="bio-global-results" className="space-y-3">
              <p className="text-[12px] font-bold text-slate-600">
                “{state.query}” · {state.total} sonuç · {state.sections.length} bölüm
              </p>
              {state.sections.map((s) => (
                <div key={s.key}>
                  <h3 className="mb-1.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-violet-700">
                    {s.label}
                    <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-800">{s.total}</span>
                    {s.total > s.hits.length ? (
                      <span className="text-[10px] font-semibold normal-case tracking-normal text-slate-400">ilk {s.hits.length} gösteriliyor</span>
                    ) : null}
                  </h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {s.hits.map((h) => (
                      <li key={`${h.section}:${h.id}`}>
                        <Link
                          href={h.href}
                          data-testid="bio-global-hit"
                          className="block rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/40"
                        >
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="min-w-0 truncate text-[13.5px] font-black text-slate-900">{h.title}</span>
                            <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-800 ring-1 ring-cyan-100">{h.sectionLabel}</span>
                          </span>
                          {h.snippet && !isDemo ? (
                            <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
                              <span className="font-bold text-slate-400">{h.matchedFieldLabel}: </span>
                              {h.snippet}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}

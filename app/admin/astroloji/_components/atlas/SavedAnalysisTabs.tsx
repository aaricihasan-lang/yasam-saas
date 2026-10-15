"use client";

/**
 * Kayıtlı analiz sekmeleri (2026-10-15 satış öncesi UAT): danışan dosyasından açılan kayıtlı analizin üstünde AYNI
 * danışanın (aynı profil) diğer kayıtlı analizleri sekme olarak durur → arşive dönmeden KP Transit, Natal, Vedik D1…
 * arasında geçilir.
 *
 * • Liste yalnız bu profilin kayıtlı analiz listesinden gelir (sunucu tenant + profil sahipliğini denetler; başka
 *   danışan / uzman kaydı karışmaz). Sekmeye basmak yalnız o analizin DEĞİŞMEZ snapshot'ını açar: sağlayıcı (Roxy)
 *   isteği YOK, yeniden hesap YOK, kayıt ve uzman notları değişmez.
 * • Çok sekmede yatay kaydırma + ‹ › ok düğmeleri + fare tekerleği (ScrollStrip); klavyede ← → / Home / End.
 * • Liste sırası danışan dosyasındaki "Kayıtlı analizler" listesiyle aynıdır (sunucu sırası).
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { astroFetch } from "../../_lib/api";
import { describeOptions, techniqueLabel } from "../../_lib/techniques";
import ScrollStrip from "./ScrollStrip";

type Item = { id: string; title: string; technique: string; params: Record<string, unknown>; partnerLabel: string | null; analysisAt: string };
type Page = { analyses: Item[]; hasMore: boolean; total: number };

/** Sunucu sayfa üst sınırı 100; çok kayıtlı danışanda güvenlik sınırı (sekme şeridi için yeterli). */
const PAGE = 100;
const MAX_PAGES = 5;

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const dot = (t: string) => (t.startsWith("vedic.") ? "bg-[#d9a65a]" : t.startsWith("kp.") ? "bg-[#46b3a3]" : "bg-[#9c86e8]");

export default function SavedAnalysisTabs({
  profileId,
  activeId,
  reloadKey,
  onSelect,
}: {
  profileId: string;
  activeId: string;
  reloadKey: number;
  onSelect: (id: string) => void;
}) {
  const key = `${profileId}|${reloadKey}`;
  const [state, setState] = useState<{ key: string; items: Item[]; total: number; error: string | null } | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const items: Item[] = [];
      let total = 0;
      for (let p = 0; p < MAX_PAGES; p++) {
        const sp = new URLSearchParams({ profileId, offset: String(items.length), limit: String(PAGE) });
        const r = await astroFetch<Page>(`/api/admin/astroloji/analyses?${sp.toString()}`);
        if (!alive) return;
        if (!r.ok) {
          setState({ key, items, total, error: r.error });
          return;
        }
        total = r.data.total;
        for (const a of r.data.analyses) if (!items.some((x) => x.id === a.id)) items.push(a);
        if (!r.data.hasMore || r.data.analyses.length === 0) break;
      }
      if (alive) setState({ key, items, total, error: null });
    })();
    return () => {
      alive = false;
    };
  }, [key, profileId]);

  const cur = state && state.key === key ? state : null;
  if (!cur || cur.error || cur.items.length < 2) return null; // tek kayıt: geçilecek başka analiz yok

  const items = cur.items;
  const focusAt = (i: number) => {
    const t = items[(i + items.length) % items.length];
    onSelect(t.id);
    refs.current[t.id]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const map: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    focusAt(map[e.key]);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" data-testid="astro-saved-tabs">
      {/* Telefon: başlık üst satırda, şerit TAM genişlik (yan yana iken şeride tek sekme bile sığmıyordu). */}
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex shrink-0 items-baseline gap-2 pl-1">
          <span className="text-[10.5px] font-semibold tracking-[0.16em] text-slate-500">KAYITLI ANALİZLER</span>
          <span className="text-[11px] tabular-nums text-slate-400" data-testid="astro-saved-tabs-count">
            {items.findIndex((x) => x.id === activeId) + 1 || "–"}/{cur.total}
          </span>
        </div>
        <ScrollStrip ariaLabel="Bu danışanın kayıtlı analizleri" activeKey={activeId} className="w-full sm:w-auto sm:flex-1" testId="astro-saved-tabs-strip">
          {items.map((a, i) => {
            const on = a.id === activeId;
            const opts = describeOptions(a.technique, a.params, () => a.partnerLabel);
            const full = `${techniqueLabel(a.technique)}${opts ? ` · ${opts}` : ""} · kayıt ${day(a.analysisAt)}`;
            return (
              <button
                key={a.id}
                ref={(el) => {
                  refs.current[a.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                title={full}
                aria-label={full}
                onClick={() => !on && onSelect(a.id)}
                onKeyDown={(e) => onKey(e, i)}
                data-strip-key={a.id}
                data-saved-tab={a.id}
                className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1 text-left text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] sm:min-h-[36px] ${
                  on ? "border-[#0B1430] bg-[#0B1430] text-white shadow-sm" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot(a.technique)}`} aria-hidden="true" />
                <span className="max-w-[150px] truncate font-medium sm:max-w-[200px]">{techniqueLabel(a.technique)}</span>
                <span className={`shrink-0 text-[11px] tabular-nums ${on ? "text-white/70" : "text-slate-400"}`}>{day(a.analysisAt)}</span>
              </button>
            );
          })}
        </ScrollStrip>
      </div>
    </div>
  );
}

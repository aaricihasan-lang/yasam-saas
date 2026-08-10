"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EmptyState, LoadingBlock } from "./components/ui";
import { claimCard, conceptCard, sourceCard, traditionCard } from "./components/cards";
import { usePreview } from "./components/preview";
import {
  listClaims,
  listConcepts,
  listSources,
  listTraditions,
  type ClaimDTO,
  type ConceptDTO,
  type SourceDTO,
  type TraditionDTO,
} from "./yebsShowcaseApi";

const AREAS: { key: string; label: string; emoji: string; href: string }[] = [
  { key: "traditions", label: "Gelenekler", emoji: "🏛️", href: "/yebs/traditions" },
  { key: "concepts", label: "Kavramlar", emoji: "🧩", href: "/yebs/concepts" },
  { key: "sources", label: "Kaynaklar", emoji: "📚", href: "/yebs/sources" },
  { key: "claims", label: "Kaynaklı Bilgiler", emoji: "📝", href: "/yebs/claims" },
  { key: "relations", label: "İlişkiler", emoji: "🔗", href: "/yebs/relations" },
];

type SearchResults = {
  traditions: TraditionDTO[];
  concepts: ConceptDTO[];
  sources: SourceDTO[];
  claims: ClaimDTO[];
};

export default function YebsHomePage() {
  const { preview, withPreview } = usePreview();
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alan sayaçları (yalnız güvenilir count).
  useEffect(() => {
    const ctrl = new AbortController();
    void Promise.all([
      listTraditions({ preview, signal: ctrl.signal }),
      listConcepts({ preview, signal: ctrl.signal }),
      listSources({ preview, signal: ctrl.signal }),
      listClaims({ preview, signal: ctrl.signal }),
    ]).then(([t, c, s, cl]) => {
      if (ctrl.signal.aborted) return;
      setCounts({
        traditions: t.ok ? t.data.count : null,
        concepts: c.ok ? c.data.count : null,
        sources: s.ok ? s.data.count : null,
        claims: cl.ok ? cl.data.count : null,
        relations: null,
      });
    });
    return () => ctrl.abort();
  }, [preview]);

  // Debounced paralel çoklu arama (relations metin araması desteklemez → hariç).
  useEffect(() => {
    const term = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term) {
      // Arama temizlenince sonuçları sıfırla (deterministik reset).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void Promise.all([
        listTraditions({ q: term, preview, signal: ctrl.signal }),
        listConcepts({ q: term, preview, signal: ctrl.signal }),
        listSources({ q: term, preview, signal: ctrl.signal }),
        listClaims({ q: term, preview, signal: ctrl.signal }),
      ]).then(([t, c, s, cl]) => {
        if (ctrl.signal.aborted) return;
        setResults({
          traditions: t.ok ? t.data.rows : [],
          concepts: c.ok ? c.data.rows : [],
          sources: s.ok ? s.data.rows : [],
          claims: cl.ok ? cl.data.rows : [],
        });
        setSearching(false);
      });
    }, 280);
    return () => {
      ctrl.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, preview]);

  const totalResults = results
    ? results.traditions.length + results.concepts.length + results.sources.length + results.claims.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Ana arama */}
      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kavram, gelenek veya kaynak ara…"
          className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base text-slate-800 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {query.trim() ? (
        searching && results === null ? (
          <LoadingBlock label="Aranıyor…" />
        ) : totalResults === 0 ? (
          <EmptyState title="Eşleşen kayıt bulunamadı." hint={preview ? undefined : "Önizleme Modu’nu açarak yayınlanmamış kayıtlarda da arayabilirsiniz."} />
        ) : (
          <div className="space-y-6">
            <ResultGroup title="Gelenekler" count={results!.traditions.length}>
              {results!.traditions.map((t) => (
                <div key={t.id}>{traditionCard(t, withPreview)}</div>
              ))}
            </ResultGroup>
            <ResultGroup title="Kavramlar" count={results!.concepts.length}>
              {results!.concepts.map((c) => (
                <div key={c.id}>{conceptCard(c, withPreview)}</div>
              ))}
            </ResultGroup>
            <ResultGroup title="Kaynaklar" count={results!.sources.length}>
              {results!.sources.map((s) => (
                <div key={s.id}>{sourceCard(s, withPreview)}</div>
              ))}
            </ResultGroup>
            <ResultGroup title="Kaynaklı Bilgiler" count={results!.claims.length}>
              {results!.claims.map((cl) => (
                <div key={cl.id}>{claimCard(cl, withPreview)}</div>
              ))}
            </ResultGroup>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => {
            const c = counts[a.key];
            return (
              <Link key={a.key} href={withPreview(a.href)} className="block text-inherit no-underline">
                <div className="group flex items-center gap-4 rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 via-white to-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="text-3xl leading-none" aria-hidden>{a.emoji}</span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{a.label}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {c === undefined ? "Yükleniyor…" : c === null ? "İncele" : c === 0 ? "Henüz kayıt yok" : `${c} kayıt`}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">
        {title} <span className="text-slate-400">({count})</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

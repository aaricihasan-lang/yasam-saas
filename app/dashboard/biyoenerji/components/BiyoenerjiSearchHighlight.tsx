"use client";

import { useRouter } from "next/navigation";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useSearchHighlight } from "@/lib/search/useSearchHighlight";
import { BIO_GLOBAL_SEARCH_MAX } from "@/lib/biyoenerji/globalSearch";
import { readBioUrlParam } from "@/lib/biyoenerji/searchSession";

const noopSubscribe = () => () => {};

/**
 * Detay URL'indeki arama terimi (varsayılan `?q=`; liste bölümlerinde `?hq=`). Yalnız istemci;
 * SSR/ilk render'da "". Uzunluk sınırlı, yalnız görüntüleme.
 */
function useUrlSearchQuery(param: string): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => readBioUrlParam(window.location.search, param, BIO_GLOBAL_SEARCH_MAX),
    () => "",
  );
}

/**
 * WT8 — Biyoenerji genel aramadan açılan kayıt detayı: arama terimi (`?q=`) kaydın içindeki TÜM
 * geçişlerde sarı vurgulanır, ilk eşleşmeye bir kez kaydırılır, "Arama sonuçlarına dön" sunulur.
 *
 * FINAL-A2: Detay rotası olmayan liste bölümleri (Enerji Bedenleri, Seanslar) `termParam="hq"` ile
 * yalnız seçili kayıt panelini sarar (`?q=` orada liste süzgecidir, vurgu terimi değildir).
 *
 * Güvenlik: `q` yalnız istemcide metin vurgusu için okunur; hiçbir sorguya/isteğe girmez → kayıt
 * erişimi ve tenant izolasyonu (detay API'si, session tenant) DEĞİŞMEZ.
 */
export default function BiyoenerjiSearchHighlight({
  recordKey,
  children,
  termParam = "q",
  className = "min-w-0",
}: {
  recordKey: string;
  children: ReactNode;
  /** Terimin okunacağı URL parametresi (detay: "q", liste bölümü: "hq"). */
  termParam?: string;
  className?: string;
}) {
  const router = useRouter();
  const query = useUrlSearchQuery(termParam);
  const ref = useRef<HTMLDivElement | null>(null);
  const count = useSearchHighlight(ref, [query], { enabled: Boolean(query), resetKey: recordKey });

  return (
    <div ref={ref} className={className}>
      {query ? (
        <div
          data-no-search-highlight
          data-testid="bio-search-context"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 text-[12px] font-bold text-violet-900 shadow-sm"
        >
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-[12px] font-black text-violet-700 shadow-sm transition hover:bg-violet-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Arama sonuçlarına dön
          </button>
          <span>🔍 “{query}”</span>
          {count > 0 ? (
            <span data-testid="bio-search-match-count" className="rounded-full bg-yellow-200 px-2 py-0.5 text-[11px] font-black text-slate-900">
              {count} eşleşme sarı ile işaretlendi
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

"use client";

// "HUMAN DESIGN ANALİZLERİM" — TEK ana liste (eski üç liste yerine).
//   • Satır = bir HD profili (grup kimliği sunucuda: HD profil kimliği). Aynı ad-soyad farklı
//     profiller ayrı satırdır; profilsiz eski analiz kendi satırıdır.
//   • Arama + sayfalama SUNUCUDA (/api/hd/analyses) → 1500+ danışanda tüm kayıtlar aranır, tarayıcıya
//     yalnız gösterilen sayfa gelir. Okuma hatası kısmi liste olarak gösterilmez.
//   • Word işlemleri BURADA YOK — danışan detayında ("Human Design Danışan Raporu").
//   • Yeşil "Danışan Yolculuğu'na bağlı" yalnız doğrulanmış kayıt bağına dayanır.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchHdAnalysisGroups, formatIsoDateTr, type HdAnalysisGroupOption } from "@/lib/human-design/api/journeyClient";
import { HD_CHART_SAVED_EVENT, HD_PROFILE_DELETED_EVENT } from "@/lib/human-design/api/chartsClient";
import { toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { HdComputedChartModal } from "../../kayitli-haritalar/components/HdComputedChartModal";

const PAGE = 20;

function summaryOf(r: HdAnalysisGroupOption): string {
  const c = toAppChartCodes({ type_code: r.typeCode, profile_code: r.profileCode });
  const type = c.type_code ? hdTypeLabelFromCode(c.type_code) : r.typeCode ?? "";
  const profile = c.profile_code ? hdProfileLabelFromCode(c.profile_code).split(" — ")[0] : r.profileCode ?? "";
  return [type, profile].filter(Boolean).join(" · ");
}

export function HdAnalysisGroupList() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HdAnalysisGroupOption[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openChart, setOpenChart] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (q: string, offset: number) => {
    const my = ++seq.current;
    setLoading(true);
    const r = await fetchHdAnalysisGroups(q, offset, PAGE);
    if (my !== seq.current) return;
    setLoading(false);
    if (r.error) {
      setError(r.error);
      if (offset === 0) setRows([]);
      return;
    }
    setError(null);
    setTotal(r.total);
    setRows((prev) => (offset === 0 || !prev ? r.rows : [...prev, ...r.rows]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(query.trim(), 0), query.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  // Yeni hesap kaydı / profil silme → liste sunucudan yenilenir.
  useEffect(() => {
    const refresh = () => void load(query.trim(), 0);
    window.addEventListener(HD_CHART_SAVED_EVENT, refresh);
    window.addEventListener(HD_PROFILE_DELETED_EVENT, refresh);
    return () => {
      window.removeEventListener(HD_CHART_SAVED_EVENT, refresh);
      window.removeEventListener(HD_PROFILE_DELETED_EVENT, refresh);
    };
  }, [load, query]);

  const shown = rows?.length ?? 0;

  return (
    <section className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-sm ring-1 ring-indigo-100/60 sm:p-5" data-hd-analysis-groups>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Danışan adı veya soyadı ara..."
        aria-label="Danışan adı veya soyadı ara"
        className="h-11 w-full rounded-xl border border-indigo-200/90 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50"
        data-hd-analysis-search
      />
      <div className="mt-3">
        {rows === null ? (
          <p className="py-8 text-center text-sm text-slate-500">Yükleniyor...</p>
        ) : error && shown === 0 ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>
        ) : shown === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {query.trim() ? "Aramanızla eşleşen Human Design analizi bulunamadı." : "Henüz Human Design analizi yok. “Yeni Human Design Analizi” ile başlayın."}
          </p>
        ) : (
          <>
            <p className="m-0 mb-2 text-[11px] font-semibold text-slate-500" data-hd-analysis-total={total}>
              {query.trim() ? `${total} danışan bulundu` : `${total} danışan`}
            </p>
            <ul className="m-0 list-none divide-y divide-indigo-50 overflow-hidden rounded-xl border border-indigo-100 bg-white p-0">
              {rows!.map((r) => {
                const summary = summaryOf(r);
                return (
                  <li key={r.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-hd-group={r.key}>
                    <div className="min-w-0">
                      <p className="m-0 break-words text-[15px] font-bold text-slate-900">{r.name}</p>
                      <p className="m-0 mt-0.5 break-words text-xs text-slate-600">
                        {[r.birthDate ? `Doğum: ${formatIsoDateTr(r.birthDate)}` : null, summary || null].filter(Boolean).join(" · ")}
                      </p>
                      <p className="m-0 mt-0.5 text-xs text-slate-500">
                        Son analiz: {formatIsoDateTr(r.lastAnalysisAt)} · <span data-hd-group-count={r.analysisCount}>{r.analysisCount} analiz</span>
                        {r.linkedToJourney ? (
                          <>
                            {" · "}
                            <span className="font-semibold text-emerald-700" data-hd-group-linked>Danışan Yolculuğu&apos;na bağlı</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {r.hdClientId ? (
                        <Link
                          href={`/human-design/danisanlar/${r.hdClientId}`}
                          className="inline-flex h-9 items-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 no-underline hover:bg-indigo-100"
                          data-hd-group-open={r.hdClientId}
                        >
                          Detayı Aç
                        </Link>
                      ) : r.latestKind === "manual" ? (
                        <Link
                          href={`/human-design/kayitli-haritalar/${r.latestChartId}`}
                          className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50"
                        >
                          Analizi Aç
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenChart(r.latestChartId)}
                          className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100"
                        >
                          Analizi Aç
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
            {shown < total ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load(query.trim(), shown)}
                  className="h-9 rounded-xl border border-indigo-200 bg-white px-5 text-sm font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  data-hd-analysis-more
                >
                  {loading ? "Yükleniyor..." : `Daha fazla göster (${shown} / ${total})`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {openChart ? (
        <HdComputedChartModal id={openChart} onClose={() => setOpenChart(null)} onDeleted={() => { setOpenChart(null); void load(query.trim(), 0); }} />
      ) : null}
    </section>
  );
}

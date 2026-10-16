"use client";

// "HUMAN DESIGN ANALİZLERİM" — Human Design'daki TEK danışan listesi (tek arama, tek seçim).
//   • Satır = bir danışan: analizli HD profili / henüz analizi olmayan HD profili / (aramada) Human Design
//     kaydı olmayan Danışan Yolculuğu danışanı. Aynı ad-soyad farklı profiller ayrı satırdır.
//   • Arama + sayfalama SUNUCUDA (/api/hd/analyses) → 1500+ danışanda tüm kayıtlar aranır, tarayıcıya
//     yalnız gösterilen sayfa gelir. Okuma hatası kısmi liste olarak gösterilmez.
//   • "Detayı Aç": KAYITLI son profesyonel harita DOĞRUDAN açılır (ara ekran yok, yeni hesap / Roxy YOK);
//     danışanın diğer analizleri, "Analizi Sil" ve "Human Design Kaydını Tamamen Sil" aynı pencerede.
//   • Yeni analiz ayrı ve bilinçli eylemdir ("Yeni analiz" / "Analiz Yap" → danışan çalışma sayfası).
//   • İlk analiz tarihi: sunucunun en eski analiz kaydı; uzman göster/gizle tercihini kendi cihazında saklar.
//   • Word işlemleri BURADA YOK — analiz penceresinde ("Human Design Danışan Raporu").

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchHdAnalysisGroups, formatIsoDateTr, type HdAnalysisGroupOption } from "@/lib/human-design/api/journeyClient";
import { HD_CHART_SAVED_EVENT, HD_PROFILE_DELETED_EVENT } from "@/lib/human-design/api/chartsClient";
import { toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { safeLocalStorageSetItem } from "@/lib/safeStorage";
import { HdComputedChartModal } from "../../kayitli-haritalar/components/HdComputedChartModal";
import { retryHdImageCleanup } from "../helpers/hdClients";
import { HdJourneyProfileStart } from "./HdJourneyProfileStart";

const PAGE = 20;

function summaryOf(r: HdAnalysisGroupOption): string {
  const c = toAppChartCodes({ type_code: r.typeCode, profile_code: r.profileCode });
  const type = c.type_code ? hdTypeLabelFromCode(c.type_code) : r.typeCode ?? "";
  const profile = c.profile_code ? hdProfileLabelFromCode(c.profile_code).split(" — ")[0] : r.profileCode ?? "";
  return [type, profile].filter(Boolean).join(" · ");
}

/** "İlk analiz tarihini göster" tercihi — uzmana (kullanıcı kimliğine) özel; veritabanı tarihini DEĞİŞTİRMEZ. */
export function hdFirstAnalysisPrefKey(userId: string | null | undefined): string {
  return `yasam:hd:show-first-analysis:${userId ?? "anon"}`;
}
function readFirstAnalysisPref(): boolean {
  try {
    return window.localStorage.getItem(hdFirstAnalysisPrefKey(readYasamUser()?.id)) !== "0";
  } catch {
    return true;
  }
}

type Open = { chartId: string; row: HdAnalysisGroupOption };

export function HdAnalysisGroupList() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HdAnalysisGroupOption[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [startFor, setStartFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; cleanup: boolean } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [showFirst, setShowFirst] = useState(true);
  const seq = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tarayıcı tercihi (SSR'da okunamaz)
    setShowFirst(readFirstAnalysisPref());
  }, []);

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

  // Yeni hesap kaydı / HD kaydı silme → liste sunucudan yenilenir.
  useEffect(() => {
    const refresh = () => void load(query.trim(), 0);
    window.addEventListener(HD_CHART_SAVED_EVENT, refresh);
    window.addEventListener(HD_PROFILE_DELETED_EVENT, refresh);
    return () => {
      window.removeEventListener(HD_CHART_SAVED_EVENT, refresh);
      window.removeEventListener(HD_PROFILE_DELETED_EVENT, refresh);
    };
  }, [load, query]);

  function toggleFirst(v: boolean) {
    setShowFirst(v);
    safeLocalStorageSetItem(hdFirstAnalysisPrefKey(readYasamUser()?.id), v ? "1" : "0");
  }

  async function runCleanup() {
    setCleaning(true);
    const r = await retryHdImageCleanup();
    setCleaning(false);
    setNotice(r.ok ? { text: `Kalan görseller temizlendi (${r.removed}).`, cleanup: false } : { text: `Görseller temizlenemedi: ${r.error ?? ""}`.trim(), cleanup: true });
  }

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
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" checked={showFirst} onChange={(e) => toggleFirst(e.target.checked)} className="h-4 w-4 accent-indigo-600" data-hd-first-analysis-toggle />
        İlk analiz tarihini göster
      </label>
      {notice ? (
        <div role="status" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" data-hd-list-notice>
          <span className="min-w-0">{notice.text}</span>
          {notice.cleanup ? (
            <button type="button" onClick={() => void runCleanup()} disabled={cleaning} className="h-8 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-60">
              {cleaning ? "Temizleniyor…" : "Kalan görselleri temizle"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3">
        {rows === null ? (
          <p className="py-8 text-center text-sm text-slate-500">Yükleniyor...</p>
        ) : error && shown === 0 ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>
        ) : shown === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {query.trim() ? "Aramanızla eşleşen danışan bulunamadı." : "Henüz Human Design danışanı yok. “Yeni Danışan” ile başlayın veya danışan adını arayın."}
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
                  <li key={r.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" data-hd-group={r.key} data-hd-group-kind={r.kind}>
                    <div className="min-w-0">
                      <p className="m-0 break-words text-[15px] font-bold text-slate-900 [overflow-wrap:anywhere]">{r.name}</p>
                      <p className="m-0 mt-0.5 break-words text-xs text-slate-600">
                        {[r.birthDate ? `Doğum: ${formatIsoDateTr(r.birthDate)}` : null, summary || null].filter(Boolean).join(" · ")}
                      </p>
                      <p className="m-0 mt-0.5 text-xs text-slate-500">
                        {r.analysisCount > 0 ? (
                          <>
                            Son analiz: {formatIsoDateTr(r.lastAnalysisAt)} · <span data-hd-group-count={r.analysisCount}>{r.analysisCount} analiz</span>
                            {showFirst && r.firstAnalysisAt ? <span data-hd-group-first> · İlk analiz: {formatIsoDateTr(r.firstAnalysisAt)}</span> : null}
                          </>
                        ) : r.kind === "journey" ? (
                          <span data-hd-group-status="none">Human Design kaydı yok</span>
                        ) : (
                          <span data-hd-group-status="empty">Human Design profili var · henüz analiz yok</span>
                        )}
                        {r.linkedToJourney ? (
                          <>
                            {" · "}
                            <span className="font-semibold text-emerald-700" data-hd-group-linked>Danışan Yolculuğu&apos;na bağlı</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {r.kind === "hd" && r.analysisCount > 0 && r.latestChartId && r.hdClientId ? (
                        <>
                          {r.latestKind === "computed" ? (
                            <button
                              type="button"
                              onClick={() => setOpen({ chartId: r.latestChartId!, row: r })}
                              className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100"
                              data-hd-group-open={r.hdClientId}
                            >
                              Detayı Aç
                            </button>
                          ) : (
                            <Link
                              href={`/human-design/kayitli-haritalar/${r.latestChartId}`}
                              className="inline-flex h-9 items-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 no-underline hover:bg-indigo-100"
                              data-hd-group-open={r.hdClientId}
                            >
                              Detayı Aç
                            </Link>
                          )}
                          <Link href={`/human-design/danisanlar/${r.hdClientId}`} className="text-xs font-bold text-indigo-600 hover:underline" data-hd-group-new={r.hdClientId}>
                            Yeni analiz
                          </Link>
                        </>
                      ) : r.kind === "hd" && r.hdClientId ? (
                        <Link
                          href={`/human-design/danisanlar/${r.hdClientId}`}
                          className="inline-flex h-9 items-center rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-800 no-underline hover:bg-indigo-50"
                          data-hd-group-new={r.hdClientId}
                        >
                          Analiz Yap
                        </Link>
                      ) : r.kind === "orphan" && r.latestChartId ? (
                        r.latestKind === "manual" ? (
                          <Link href={`/human-design/kayitli-haritalar/${r.latestChartId}`} className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50">
                            Analizi Aç
                          </Link>
                        ) : (
                          <button type="button" onClick={() => setOpen({ chartId: r.latestChartId!, row: r })} className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                            Analizi Aç
                          </button>
                        )
                      ) : r.kind === "journey" && r.journeyClientId ? (
                        <button
                          type="button"
                          onClick={() => setStartFor((v) => (v === r.journeyClientId ? null : r.journeyClientId))}
                          className="h-9 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-50"
                          data-hd-group-start={r.journeyClientId}
                        >
                          Human Design Başlat
                        </button>
                      ) : null}
                    </div>
                    {r.kind === "journey" && r.journeyClientId && startFor === r.journeyClientId ? (
                      <HdJourneyProfileStart journeyClientId={r.journeyClientId} name={r.name} birthDate={r.birthDate} onCancel={() => setStartFor(null)} />
                    ) : null}
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
      {open ? (
        <HdComputedChartModal
          id={open.chartId}
          profile={
            open.row.hdClientId
              ? { hdClientId: open.row.hdClientId, name: open.row.name, firstAnalysisAt: open.row.firstAnalysisAt, showFirstAnalysis: showFirst }
              : undefined
          }
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            setNotice({ text: "Analiz silindi. Danışanın diğer analizleri ve Human Design profili korundu.", cleanup: false });
            void load(query.trim(), 0);
          }}
          onProfileDeleted={(res) => {
            setOpen(null);
            setNotice({
              text: `Human Design kaydı tamamen silindi: ${res.deletedAnalyses} analiz ve ${res.deletedReports} Word raporu kaldırıldı. Danışan Yolculuğu kaydı korundu.${res.storageWarning ? " Bazı görsel dosyaları temizlenemedi." : ""}`,
              cleanup: res.storageWarning,
            });
            void load(query.trim(), 0);
          }}
        />
      ) : null}
    </section>
  );
}

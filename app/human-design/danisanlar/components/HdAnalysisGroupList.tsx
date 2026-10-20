"use client";

// "HUMAN DESIGN ANALİZLERİM" — Human Design'daki TEK danışan listesi (tek arama, tek seçim).
//   • Satır = bir danışan: analizli HD profili / henüz analizi olmayan HD profili / (aramada) Human Design
//     kaydı olmayan Danışan Yolculuğu danışanı. Aynı ad-soyad farklı profiller ayrı satırdır.
//   • Arama + sayfalama SUNUCUDA (/api/hd/analyses) → 1500+ danışanda tüm kayıtlar aranır, tarayıcıya
//     yalnız gösterilen sayfa gelir. Okuma hatası kısmi liste olarak gösterilmez.
//   • Sıra: Türkçe alfabetik ad-soyad (sunucu tüm sonuç kümesini sıralar, sonra sayfalar).
//   • "Detayı Aç": KAYITLI son profesyonel harita DOĞRUDAN açılır (ara ekran yok, yeni hesap / Roxy YOK);
//     danışanın diğer analizleri ve TEK "Sil" (iki onay, tüm HD kayıtları) aynı pencerede.
//   • Yeni analiz ayrı ve bilinçli eylemdir ("Yeni Analiz" / "Analiz Yap" → danışan çalışma sayfası).
//   • İlk analiz / son analiz tarihi ve analiz sayısı kayıt varsa HER ZAMAN gösterilir (göster/gizle yok).
//   • Word işlemleri BURADA YOK — analiz penceresinde ("Human Design Danışan Raporu").

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Search, User } from "lucide-react";
import s from "@/app/_premium/human-design/calismaAlani.module.css";
import Link from "next/link";
import { fetchHdAnalysisGroups, formatIsoDateTr, type HdAnalysisGroupOption } from "@/lib/human-design/api/journeyClient";
import { HD_CHART_SAVED_EVENT, HD_PROFILE_DELETED_EVENT } from "@/lib/human-design/api/chartsClient";
import { toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { readYasamUser } from "@/lib/auth/yasamUser";
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

/** Kaldırılan "İlk analiz tarihini göster" tercihinin (2026-10-16) eski tarayıcı anahtarı — yalnız temizlik için. */
function clearLegacyFirstAnalysisPref(): void {
  try {
    window.localStorage.removeItem(`yasam:hd:show-first-analysis:${readYasamUser()?.id ?? "anon"}`);
  } catch {
    /* depolama kapalı — önemsiz */
  }
}

type Open = { chartId: string; row: HdAnalysisGroupOption };

/** head/full: yalnız sunum (2026-10-20 premium çalışma alanı başlığı ve tam genişlik liste görünümü). */
export function HdAnalysisGroupList({ head, full = false }: { head?: ReactNode; full?: boolean } = {}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HdAnalysisGroupOption[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [startFor, setStartFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; cleanup: boolean } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    clearLegacyFirstAnalysisPref();
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

  async function runCleanup() {
    setCleaning(true);
    const r = await retryHdImageCleanup();
    setCleaning(false);
    setNotice(r.ok ? { text: `Kalan görseller temizlendi (${r.removed}).`, cleanup: false } : { text: `Görseller temizlenemedi: ${r.error ?? ""}`.trim(), cleanup: true });
  }

  const shown = rows?.length ?? 0;

  return (
    <section className={`${s.panel} ${full ? s.full : ""}`} aria-label="Danışan Listesi" data-hd-analysis-groups>
      {head}
      <label className={s.search}>
      <Search className={s.sIcon} strokeWidth={2} aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Danışan adı veya soyadı ara..."
        aria-label="Danışan adı veya soyadı ara"
        data-hd-analysis-search
      />
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
      <div className="mt-1">
        {rows === null ? (
          <p className={s.empty}>Yükleniyor...</p>
        ) : error && shown === 0 ? (
          <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>
        ) : shown === 0 ? (
          <p className={s.empty}>
            {query.trim() ? "Aramanızla eşleşen danışan bulunamadı." : "Henüz Human Design danışanı yok. “Yeni Hesaplama” ile başlayın veya danışan adını arayın."}
          </p>
        ) : (
          <>
            <ul className={s.cList}>
              {rows!.map((r) => {
                const summary = summaryOf(r);
                return (
                  <li key={r.key} className={s.cRow} data-hd-group={r.key} data-hd-group-kind={r.kind}>
                    <span className={s.cAv} aria-hidden>
                      <User className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <div className={s.cBody}>
                      <p className={`${s.cName} [overflow-wrap:anywhere]`}>{r.name}</p>
                      <p className={s.cMeta}>
                        {[r.birthDate ? `Doğum: ${formatIsoDateTr(r.birthDate)}` : null, summary || null].filter(Boolean).join(" · ")}
                      </p>
                      <p className={s.cMeta2}>
                        {r.analysisCount > 0 ? (
                          <>
                            {r.firstAnalysisAt ? <span data-hd-group-first>İlk analiz: {formatIsoDateTr(r.firstAnalysisAt)} · </span> : null}
                            <span data-hd-group-last>Son analiz: {formatIsoDateTr(r.lastAnalysisAt)}</span> · <span data-hd-group-count={r.analysisCount}>{r.analysisCount} analiz</span>
                          </>
                        ) : r.kind === "journey" ? (
                          <span data-hd-group-status="none">Human Design kaydı yok</span>
                        ) : (
                          <span data-hd-group-status="empty">Human Design profili var · henüz analiz yok</span>
                        )}
                        {r.linkedToJourney ? (
                          <>
                            {" · "}
                            <span className={s.linked} data-hd-group-linked>Danışan Yolculuğu&apos;na bağlı</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className={s.cAct}>
                      {r.kind === "hd" && r.analysisCount > 0 && r.latestChartId && r.hdClientId ? (
                        <>
                          {r.latestKind === "computed" ? (
                            <button
                              type="button"
                              onClick={() => setOpen({ chartId: r.latestChartId!, row: r })}
                              className={`${s.b} ${s.bGhost}`}
                              data-hd-group-open={r.hdClientId}
                            >
                              Detayı Aç
                            </button>
                          ) : (
                            <Link
                              href={`/human-design/kayitli-haritalar/${r.latestChartId}`}
                              className={`${s.b} ${s.bGhost}`}
                              data-hd-group-open={r.hdClientId}
                            >
                              Detayı Aç
                            </Link>
                          )}
                          <Link href={`/human-design/danisanlar/${r.hdClientId}`} className={`${s.b} ${s.bPri}`} data-hd-group-new={r.hdClientId}>
                            Yeni Analiz
                          </Link>
                        </>
                      ) : r.kind === "hd" && r.hdClientId ? (
                        <Link
                          href={`/human-design/danisanlar/${r.hdClientId}`}
                          className={`${s.b} ${s.bPri}`}
                          data-hd-group-new={r.hdClientId}
                        >
                          Analiz Yap
                        </Link>
                      ) : r.kind === "orphan" && r.latestChartId ? (
                        r.latestKind === "manual" ? (
                          <Link href={`/human-design/kayitli-haritalar/${r.latestChartId}`} className={`${s.b} ${s.bGhost}`}>
                            Analizi Aç
                          </Link>
                        ) : (
                          <button type="button" onClick={() => setOpen({ chartId: r.latestChartId!, row: r })} className={`${s.b} ${s.bGhost}`}>
                            Analizi Aç
                          </button>
                        )
                      ) : r.kind === "journey" && r.journeyClientId ? (
                        <button
                          type="button"
                          onClick={() => setStartFor((v) => (v === r.journeyClientId ? null : r.journeyClientId))}
                          className={`${s.b} ${s.bPri}`}
                          data-hd-group-start={r.journeyClientId}
                        >
                          Human Design Başlat
                        </button>
                      ) : null}
                    </div>
                    {r.kind === "journey" && r.journeyClientId && startFor === r.journeyClientId ? (
                      <div className={s.cExtra}>
                      <HdJourneyProfileStart
                        journeyClientId={r.journeyClientId}
                        name={r.name}
                        birthDate={r.birthDate}
                        onCancel={() => setStartFor(null)}
                        onAnalyzed={({ chartId, hdClientId }) => {
                          setStartFor(null);
                          setOpen({ chartId, row: { ...r, kind: "hd", hdClientId, latestChartId: chartId, latestKind: "computed", analysisCount: 1 } });
                          void load(query.trim(), 0);
                        }}
                      />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
            {shown < total ? (
              <div className={s.more}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load(query.trim(), shown)}
                  className={`${s.b} ${s.bGhost} disabled:opacity-60`}
                  data-hd-analysis-more
                >
                  {loading ? "Yükleniyor..." : `Daha fazla göster (${shown} / ${total})`}
                </button>
              </div>
            ) : null}
            <p className={s.count} data-hd-analysis-total={total}>
              {query.trim() ? `${total} danışan bulundu` : `${total} danışan`}
            </p>
          </>
        )}
      </div>
      {open ? (
        <HdComputedChartModal
          id={open.chartId}
          profile={
            open.row.hdClientId
              ? { hdClientId: open.row.hdClientId, name: open.row.name, firstAnalysisAt: open.row.firstAnalysisAt }
              : undefined
          }
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            setNotice({ text: "Analiz silindi.", cleanup: false });
            void load(query.trim(), 0);
          }}
          onProfileDeleted={(res) => {
            setOpen(null);
            setNotice({
              text: `Human Design kayıtları silindi: ${res.deletedAnalyses} analiz ve ${res.deletedReports} Word raporu kaldırıldı. Danışan Yolculuğu ana kaydı korundu.${res.storageWarning ? " Bazı görsel dosyaları temizlenemedi." : ""}`,
              cleanup: res.storageWarning,
            });
            void load(query.trim(), 0);
          }}
        />
      ) : null}
    </section>
  );
}

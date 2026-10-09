"use client";

// AŞAMA 3C — "Geçmiş Human Design Analizleri" (eski Kayıtlı Haritalar / Kayıtlı Raporlar ana kartlarının
// yerine). Mevcut liste yardımcıları ve mevcut profesyonel harita penceresi YENİDEN kullanılır:
//   • Otomatik (Roxy) + eski motor analizleri  → listComputedCharts  → HdComputedChartModal
//   • Manuel (eski, salt-okunur) kayıtlar      → listChartsWithClients → /kayitli-haritalar/[id]
//   • Kayıtlı raporlar (donmuş Profesyonel Word dahil) → listReportsWithClients → /kayitli-raporlar
// Yeni liste sistemi / yeni renderer YOK. Seçili profil varsa yalnız onun analizleri.
//
// Satış öncesi sadeleştirme: "Kayıtlı Human Design Analizleri" — hesaplanan her analiz OTOMATİK
// kaydedilir; burada açılır ve Word olarak indirilir (ayrı rapor sayfasında arama gerekmez).
//   • "Word İndir": analizin hazır Word v2 raporu varsa AYNISI indirilir; yoksa analiz açılır ve
//     Word akışı (PR #359 Word v2) bir kez başlar. Roxy çağrısı YOK. Android'de gizli (kural).
//   • Aynı sayfada yeni hesap kaydedilince (HD_CHART_SAVED_EVENT) liste anında yenilenir ve yeni
//     kayıt "Kaydedildi" ile işaretlenir.
//   • Kısmi yükleme hatası (ör. otomatik analizler okunamadı) sessizce yutulmaz.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  HD_CHART_SAVED_EVENT,
  listComputedCharts,
  type ComputedChartListRow,
  type HdChartSavedDetail,
} from "@/lib/human-design/api/chartsClient";
import { listChartsWithClients, type HdChartWithClient } from "../../kayitli-haritalar/helpers/hdKayitliHaritalar";
import { listReportBriefs } from "../../kayitli-raporlar/helpers/hdKayitliRaporlar";
import { latestWordReportId, type WordReportBrief } from "@/lib/human-design/reporting/wordReportPick";
import { downloadProfessionalReport, HD_REPORT_REDACTED_MESSAGE } from "../../kayitli-raporlar/helpers/hdProfessionalReport";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { HdComputedChartModal } from "../../kayitli-haritalar/components/HdComputedChartModal";
import { toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { hdProfileLabelFromCode, hdTypeLabelFromCode } from "@/lib/human-design/codeHelpers";
import { formatIsoDateTr } from "@/lib/human-design/api/journeyClient";
import { runInEffect } from "@/lib/runInEffect";

type Item = {
  id: string;
  kind: "roxy" | "engine" | "manual";
  clientId: string | null;
  clientName: string;
  birthDate: string | null;
  /** Aynı tarihli farklı saatli analizler ayırt edilsin (HH:MM). */
  birthTime: string | null;
  createdAt: string;
  summary: string;
};

const PAGE = 10;

function hhmm(t: string | null | undefined): string | null {
  return typeof t === "string" && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null;
}

function summaryOf(row: { type_code?: unknown; authority_code?: unknown; profile_code?: unknown; definition_code?: unknown }): string {
  const c = toAppChartCodes(row);
  const type = c.type_code ? hdTypeLabelFromCode(c.type_code) : typeof row.type_code === "string" ? row.type_code : "";
  const profile = c.profile_code ? hdProfileLabelFromCode(c.profile_code).split(" — ")[0] : typeof row.profile_code === "string" ? row.profile_code : "";
  return [type, profile].filter(Boolean).join(" · ");
}

const KIND_LABEL: Record<Item["kind"], string> = { roxy: "Otomatik", engine: "Eski motor", manual: "Manuel (eski)" };
const KIND_CLS: Record<Item["kind"], string> = {
  roxy: "bg-indigo-100 text-indigo-800",
  engine: "bg-slate-100 text-slate-700",
  manual: "bg-amber-100 text-amber-800",
};

export function HdAnalysisHistory({
  clientId,
  initialChartId = null,
  refreshKey = 0,
}: {
  /** HD profil kimliği; verilirse yalnız o profilin analizleri. */
  clientId?: string | null;
  /** ?chart= ile gelindiyse açılacak hesaplanmış harita. */
  initialChartId?: string | null;
  /** Değişince liste yeniden yüklenir (ör. yeni hesap sonrası). */
  refreshKey?: number;
}) {
  const isAndroid = useIsAndroid();
  const [items, setItems] = useState<Item[] | null>(null);
  const [reports, setReports] = useState<WordReportBrief[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialChartId);
  const [autoWord, setAutoWord] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [wordBusy, setWordBusy] = useState<string | null>(null);
  const [wordMsg, setWordMsg] = useState<{ id: string; text: string; tone: "ok" | "err" } | null>(null);

  const load = useCallback(async () => {
    const [computed, manual, reps] = await Promise.all([
      listComputedCharts(clientId ? { clientId } : {}),
      listChartsWithClients(),
      listReportBriefs(),
    ]);
    if (computed.error && manual.error) {
      setError(computed.error);
      setItems([]);
      return;
    }
    // Bir kaynak okunamadıysa liste eksik olabilir → kullanıcıya açıkça söylenir.
    setPartialError(
      computed.error
        ? "Otomatik hesaplanan analizler şu anda yüklenemedi; liste eksik olabilir. Sayfayı yenileyin."
        : manual.error
          ? "Eski manuel kayıtlar şu anda yüklenemedi; liste eksik olabilir."
          : null,
    );
    const out: Item[] = [];
    for (const r of computed.rows as ComputedChartListRow[]) {
      out.push({
        id: r.id,
        kind: String(r.engine_version ?? "").startsWith("roxyapi") ? "roxy" : "engine",
        clientId: r.client_id,
        clientName: r.client_name ?? "—",
        birthDate: r.birth_date,
        birthTime: hhmm(r.birth_time),
        createdAt: r.created_at,
        summary: summaryOf(r),
      });
    }
    for (const m of manual.rows as HdChartWithClient[]) {
      if (clientId && m.client_id !== clientId) continue;
      out.push({
        id: m.id,
        kind: "manual",
        clientId: m.client_id ?? null,
        clientName: m.client?.name ?? "—",
        birthDate: m.client?.birth_date ?? null,
        birthTime: hhmm(m.client?.birth_time),
        createdAt: m.created_at,
        summary: summaryOf(m),
      });
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    setError(null);
    setReports(reps.rows);
    setItems(out);
  }, [clientId]);

  useEffect(() => {
    runInEffect(() => {
      void load().catch(() => setError("Kayıtlı analizler yüklenemedi."));
    });
  }, [load, refreshKey]);

  // Aynı sayfada (ör. danışan çalışma sayfası) yeni analiz kaydedildi → liste anında yenilenir.
  useEffect(() => {
    function onSaved(e: Event) {
      const d = (e as CustomEvent<HdChartSavedDetail>).detail;
      if (!d || (clientId && d.clientId !== clientId)) return;
      setSavedId(d.id);
      void load().catch(() => setError("Kayıtlı analizler yüklenemedi."));
    }
    window.addEventListener(HD_CHART_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(HD_CHART_SAVED_EVENT, onSaved);
  }, [clientId, load]);

  async function wordDownload(it: Item) {
    if (wordBusy) return;
    const ready = latestWordReportId(reports, it.id);
    setWordMsg(null);
    if (!ready) {
      // Hazır Word yok → analiz açılır ve Word v2 akışı (BodyGraph + yorum seçimi) bir kez başlar.
      setAutoWord(true);
      setOpenId(it.id);
      return;
    }
    setWordBusy(it.id);
    const dl = await downloadProfessionalReport(ready);
    setWordBusy(null);
    setWordMsg(
      dl.ok
        ? { id: it.id, tone: "ok", text: dl.systemReadingRedacted ? `Word indirildi. ${HD_REPORT_REDACTED_MESSAGE}` : "Word indirildi (kayıtlı rapor; yeni hesaplama yapılmadı)." }
        : { id: it.id, tone: "err", text: `Word indirilemedi: ${dl.error}` },
    );
  }

  const visible = useMemo(() => (items ? (showAll ? items : items.slice(0, PAGE)) : []), [items, showAll]);

  return (
    <section className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60" data-hd-analysis-history>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-xs font-black uppercase tracking-widest text-indigo-700">Kayıtlı Human Design Analizleri</h2>
          <p className="m-0 mt-1 text-[11px] leading-relaxed text-slate-500">
            Hesaplanan her analiz otomatik kaydedilir. Buradan açabilir ve Word olarak indirebilirsiniz.
          </p>
        </div>
        <Link href="/human-design/kayitli-raporlar" className="text-xs font-bold text-indigo-600 hover:underline">
          Tüm Word raporları →
        </Link>
      </div>
      {partialError ? (
        <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{partialError}</p>
      ) : null}
      {items === null ? (
        <p className="py-6 text-center text-sm text-slate-500">Yükleniyor...</p>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Henüz kayıtlı Human Design analizi yok.</p>
      ) : (
        <>
          <ul className="m-0 list-none space-y-2 p-0">
            {visible.map((it) => {
              const hasWord = it.kind !== "manual" && !!latestWordReportId(reports, it.id);
              const justSaved = savedId === it.id;
              return (
                <li
                  key={`${it.kind}:${it.id}`}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 ${justSaved ? "border-emerald-300 ring-2 ring-emerald-100" : "border-indigo-100"}`}
                  data-hd-history-item={`${it.kind}:${it.id}`}
                >
                  <div className="min-w-0">
                    <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                      {!clientId ? <span className="break-words">{it.clientName}</span> : null}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CLS[it.kind]}`}>{KIND_LABEL[it.kind]}</span>
                      {justSaved ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800" data-hd-history-saved>
                          ✓ Kaydedildi
                        </span>
                      ) : null}
                      {hasWord ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Word hazır</span> : null}
                    </p>
                    <p className="m-0 mt-0.5 break-words text-xs text-slate-600">
                      {[`${formatIsoDateTr(it.birthDate)}${it.birthTime ? ` ${it.birthTime}` : ""} verileriyle`, it.summary, `Analiz: ${formatIsoDateTr(it.createdAt)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {it.kind !== "manual" && !isAndroid ? (
                      <button
                        type="button"
                        onClick={() => void wordDownload(it)}
                        disabled={wordBusy !== null}
                        aria-busy={wordBusy === it.id}
                        data-hd-history-word={it.id}
                        className="h-9 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {wordBusy === it.id ? "İndiriliyor…" : "Word İndir"}
                      </button>
                    ) : null}
                    {it.kind === "manual" ? (
                      <Link href={`/human-design/kayitli-haritalar/${it.id}`} className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50">
                        Kaydı Aç
                      </Link>
                    ) : (
                      <button type="button" onClick={() => { setAutoWord(false); setOpenId(it.id); }} className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                        Analizi Aç
                      </button>
                    )}
                  </div>
                  {wordMsg && wordMsg.id === it.id ? (
                    <p role="status" className={`m-0 w-full text-xs font-semibold ${wordMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
                      {wordMsg.text}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {items.length > PAGE ? (
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-bold text-indigo-600 hover:underline">
                {showAll ? "Daha az göster" : `Tümünü göster (${items.length})`}
              </button>
            </div>
          ) : null}
        </>
      )}
      {openId ? (
        <HdComputedChartModal
          id={openId}
          autoWord={autoWord}
          onClose={() => {
            setOpenId(null);
            setAutoWord(false);
            void load(); // pencerede oluşturulan Word raporu "Word hazır" olarak görünsün
          }}
          onDeleted={() => {
            setOpenId(null);
            setAutoWord(false);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

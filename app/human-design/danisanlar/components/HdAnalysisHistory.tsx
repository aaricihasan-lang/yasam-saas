"use client";

// AŞAMA 3C — "Geçmiş Human Design Analizleri" (eski Kayıtlı Haritalar / Kayıtlı Raporlar ana kartlarının
// yerine). Mevcut liste yardımcıları ve mevcut profesyonel harita penceresi YENİDEN kullanılır:
//   • Otomatik (Roxy) + eski motor analizleri  → listComputedCharts  → HdComputedChartModal
//   • Manuel (eski, salt-okunur) kayıtlar      → listChartsWithClients → /kayitli-haritalar/[id]
//   • Kayıtlı raporlar (donmuş Profesyonel Word dahil) → listReportsWithClients → /kayitli-raporlar
// Yeni liste sistemi / yeni renderer YOK. Seçili profil varsa yalnız onun analizleri.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listComputedCharts, type ComputedChartListRow } from "@/lib/human-design/api/chartsClient";
import { listChartsWithClients, type HdChartWithClient } from "../../kayitli-haritalar/helpers/hdKayitliHaritalar";
import { listReportsWithClients, type HdReportWithClient } from "../../kayitli-raporlar/helpers/hdKayitliRaporlar";
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
  createdAt: string;
  summary: string;
};

const PAGE = 10;

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
  const [items, setItems] = useState<Item[] | null>(null);
  const [reportsByChart, setReportsByChart] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialChartId);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const [computed, manual, reports] = await Promise.all([
      listComputedCharts(clientId ? { clientId } : {}),
      listChartsWithClients(),
      listReportsWithClients(),
    ]);
    if (computed.error && manual.error) {
      setError(computed.error);
      setItems([]);
      return;
    }
    const out: Item[] = [];
    for (const r of computed.rows as ComputedChartListRow[]) {
      out.push({
        id: r.id,
        kind: String(r.engine_version ?? "").startsWith("roxyapi") ? "roxy" : "engine",
        clientId: r.client_id,
        clientName: r.client_name ?? "—",
        birthDate: r.birth_date,
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
        createdAt: m.created_at,
        summary: summaryOf(m),
      });
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const byChart = new Map<string, number>();
    for (const rep of (reports.rows ?? []) as HdReportWithClient[]) {
      if (rep.chart_id) byChart.set(rep.chart_id, (byChart.get(rep.chart_id) ?? 0) + 1);
    }
    setError(null);
    setReportsByChart(byChart);
    setItems(out);
  }, [clientId]);

  useEffect(() => {
    runInEffect(() => {
      void load().catch(() => setError("Geçmiş analizler yüklenemedi."));
    });
  }, [load, refreshKey]);

  const visible = useMemo(() => (items ? (showAll ? items : items.slice(0, PAGE)) : []), [items, showAll]);

  return (
    <section className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60" data-hd-analysis-history>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-black uppercase tracking-widest text-indigo-700">Geçmiş Human Design Analizleri</h2>
        <Link href="/human-design/kayitli-raporlar" className="text-xs font-bold text-indigo-600 hover:underline">
          Kayıtlı Raporlar →
        </Link>
      </div>
      {items === null ? (
        <p className="py-6 text-center text-sm text-slate-500">Yükleniyor...</p>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Henüz Human Design analizi yok.</p>
      ) : (
        <>
          <ul className="m-0 list-none space-y-2 p-0">
            {visible.map((it) => {
              const reports = reportsByChart.get(it.id) ?? 0;
              return (
                <li key={`${it.kind}:${it.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3" data-hd-history-item={`${it.kind}:${it.id}`}>
                  <div className="min-w-0">
                    <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                      {!clientId ? <span className="break-words">{it.clientName}</span> : null}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CLS[it.kind]}`}>{KIND_LABEL[it.kind]}</span>
                    </p>
                    <p className="m-0 mt-0.5 break-words text-xs text-slate-600">
                      {[`${formatIsoDateTr(it.birthDate)} verileriyle`, it.summary, `Analiz: ${formatIsoDateTr(it.createdAt)}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {reports > 0 ? (
                      <Link href="/human-design/kayitli-raporlar" className="inline-flex h-9 items-center rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 text-xs font-bold text-fuchsia-800 no-underline hover:bg-fuchsia-100">
                        Kayıtlı Rapor ({reports})
                      </Link>
                    ) : null}
                    {it.kind === "manual" ? (
                      <Link href={`/human-design/kayitli-haritalar/${it.id}`} className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 no-underline hover:bg-slate-50">
                        Kaydı Aç
                      </Link>
                    ) : (
                      <button type="button" onClick={() => setOpenId(it.id)} className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                        Analizi Aç
                      </button>
                    )}
                  </div>
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
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            setOpenId(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

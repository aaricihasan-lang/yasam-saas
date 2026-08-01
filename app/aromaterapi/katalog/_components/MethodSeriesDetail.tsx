"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AromaterapiDetailSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";
import { AromaterapiEmptyState } from "@/app/aromaterapi/_components/AromaterapiEmptyState";
import {
  DetailField,
  DetailSection,
  MetaChip,
  ReadError,
} from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { MethodStatusActions } from "@/app/aromaterapi/katalog/_components/MethodStatusActions";
import { fetchMethodRevision, fetchMethodSeries } from "@/lib/aromaterapi/methodData";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import {
  MATERIAL_STATE_TR,
  METHOD_KIND_TR,
  METHOD_STATUS_TR,
  tr,
} from "@/lib/aromaterapi/readLabels";
import type { MethodRevisionDetail, MethodSeriesDetail } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Üretim yöntemi serisi detayı: kimlik + en güncel revizyon içeriği +
 * durum geçiş aksiyonları + revizyon geçmişi. Seri kimliği immutable olduğundan
 * "düzenle" YOKTUR; içerik değişimi "Yeni Revizyon" ile yapılır.
 */

type Tone = "emerald" | "amber" | "slate";
function statusTone(status: string): Tone {
  if (status === "verified") return "emerald";
  if (status === "draft") return "amber";
  return "slate";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("tr-TR");
}

export function MethodSeriesDetail({
  preparationId,
  seriesId,
  isDemo,
}: {
  preparationId: string;
  seriesId: string;
  isDemo: boolean;
}) {
  // loading TÜRETİLİR (effect içinde senkron setState YOK → cascading render yok).
  const [state, setState] = useState<{
    series: MethodSeriesDetail | null;
    latest: MethodRevisionDetail | null;
    notFound: boolean;
    errorCode: string | null;
    fetchedKey: string;
  }>({ series: null, latest: null, notFound: false, errorCode: null, fetchedKey: "" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const currentKey = `${seriesId}#${tick}`;
  const loading = Boolean(seriesId) && state.fetchedKey !== currentKey;

  useEffect(() => {
    if (!seriesId) return;
    const controller = new AbortController();
    fetchMethodSeries(seriesId, controller.signal)
      .then(async (r) => {
        if (controller.signal.aborted) return;
        if (r.notFound) {
          setState({ series: null, latest: null, notFound: true, errorCode: null, fetchedKey: currentKey });
          return;
        }
        if (!r.ok || !r.data) {
          if (r.errorCode === null) return; // abort
          setState({ series: null, latest: null, notFound: false, errorCode: r.errorCode, fetchedKey: currentKey });
          return;
        }
        const rev = await fetchMethodRevision(seriesId, r.data.latest_revision_id, controller.signal);
        if (controller.signal.aborted) return;
        setState({
          series: r.data,
          latest: rev.ok ? rev.data : null,
          notFound: false,
          errorCode: null,
          fetchedKey: currentKey,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ series: null, latest: null, notFound: false, errorCode: "AROMA_READ_FAILED", fetchedKey: currentKey });
        }
      });
    return () => controller.abort();
  }, [seriesId, currentKey]);

  const { series, latest, notFound, errorCode } = state;

  if (loading) return <AromaterapiDetailSkeleton />;
  if (notFound) {
    return (
      <AromaterapiEmptyState
        variant="empty"
        icon="🔎"
        title="Yöntem bulunamadı"
        message="Bu üretim yöntemi bulunamadı veya bu hesabın kütüphanesinde değil."
        action={
          <Link
            href={`/aromaterapi/katalog/preparatlar/${preparationId}`}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800"
          >
            Preparata dön
          </Link>
        }
      />
    );
  }
  if (errorCode) return <ReadError message={messageForCode(errorCode)} onRetry={reload} />;
  if (!series) return null;

  return (
    <div className="space-y-4">
      <DetailSection title="Yöntem Kimliği" hint="Bu bilgiler seri oluşturulduktan sonra değiştirilemez.">
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <DetailField label="Yöntem Türü" value={tr.label(METHOD_KIND_TR, series.method_kind)} />
          <DetailField label="Yöntem Dili" value={series.method_lang} />
          {series.source_id ? (
            <DetailField label="Kaynak" value={series.source_title ?? "—"} />
          ) : null}
          {series.passage_id ? (
            <DetailField label="Pasaj" value={series.passage_locator ?? "—"} />
          ) : null}
          <DetailField label="Revizyon Sayısı" value={series.revision_count.toLocaleString("tr-TR")} />
          <DetailField
            label="Doğrulanmış Revizyon"
            value={
              series.verified_revision !== null ? (
                <MetaChip tone="emerald">{series.verified_revision}. revizyon</MetaChip>
              ) : (
                <span className="text-slate-400">Yok</span>
              )
            }
          />
        </dl>
      </DetailSection>

      <DetailSection
        title={`Güncel İçerik — ${series.latest_revision}. Revizyon`}
        hint="İçeriği değiştirmek için yeni bir revizyon oluşturun; mevcut revizyonlar değişmez."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MetaChip tone={statusTone(series.latest_status)}>
            {tr.label(METHOD_STATUS_TR, series.latest_status)}
          </MetaChip>
          <span className="text-[11.5px] font-semibold text-slate-400">
            Güncelleme: {fmtDate(series.latest_updated_at)}
          </span>
        </div>

        {latest ? (
          <div className="space-y-3">
            <RevField label="Ana Yöntem Metni" value={latest.method_text} pre />
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {latest.plant_part_used ? <DetailField label="Kullanılan Bitki Kısmı" value={latest.plant_part_used} /> : null}
              {latest.material_state ? <DetailField label="Malzemenin Durumu" value={tr.label(MATERIAL_STATE_TR, latest.material_state)} /> : null}
              {latest.equipment ? <DetailField label="Ekipman" value={latest.equipment} /> : null}
              {latest.amount_ratio ? <DetailField label="Miktar / Oran" value={latest.amount_ratio} /> : null}
              {latest.solvent_carrier ? <DetailField label="Çözücü / Taşıyıcı" value={latest.solvent_carrier} /> : null}
              {latest.duration_text ? <DetailField label="Süre" value={latest.duration_text} /> : null}
              {latest.temperature_text ? <DetailField label="Sıcaklık" value={latest.temperature_text} /> : null}
              {latest.filtration ? <DetailField label="Filtrasyon" value={latest.filtration} /> : null}
              {latest.resting ? <DetailField label="Dinlendirme" value={latest.resting} /> : null}
              {latest.storage ? <DetailField label="Saklama" value={latest.storage} /> : null}
            </dl>
            {latest.steps && latest.steps.length > 0 ? (
              <div>
                <h4 className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">Sıralı Adımlar</h4>
                <ol className="space-y-1.5">
                  {latest.steps.map((s) => (
                    <li key={s.order} className="flex gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-[14px] font-medium text-slate-800">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-black text-emerald-800">{s.order}</span>
                      <span className="whitespace-pre-wrap break-words">{s.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {latest.quality_notes ? <RevField label="Kalite Kontrol Notları" value={latest.quality_notes} pre /> : null}
            {latest.safety_notes ? <RevField label="Güvenlik Notları" value={latest.safety_notes} pre /> : null}
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-slate-400">Revizyon içeriği yüklenemedi.</p>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-amber-100/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <MethodStatusActions
            seriesId={seriesId}
            revisionId={series.latest_revision_id}
            currentStatus={series.latest_status}
            expectedUpdatedAt={series.latest_updated_at}
            isDemo={isDemo}
            onDone={reload}
          />
          {!isDemo ? (
            <Link
              href={`/aromaterapi/katalog/preparatlar/${preparationId}/yontemler/${seriesId}/yeni-revizyon`}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
            >
              <span aria-hidden>＋</span> Yeni Revizyon
            </Link>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title="Revizyon Geçmişi" hint="En yeni revizyon en üstte.">
        <ul className="space-y-2">
          {series.revisions.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${
                r.id === series.latest_revision_id ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100 bg-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-black text-slate-800">{r.revision}. revizyon</span>
                <MetaChip tone={statusTone(r.status)}>{tr.label(METHOD_STATUS_TR, r.status)}</MetaChip>
              </span>
              <span className="text-[11.5px] font-semibold text-slate-400">{fmtDate(r.updated_at)}</span>
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  );
}

function RevField({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div className="py-1">
      <h4 className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</h4>
      <p className={`text-[14px] font-medium text-slate-800 ${pre ? "whitespace-pre-wrap break-words" : ""}`}>{value}</p>
    </div>
  );
}

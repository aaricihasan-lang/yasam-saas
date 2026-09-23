"use client";

import { CircleHelp, Minus, TriangleAlert } from "lucide-react";
import type { MetricValue, MetricUnit } from "@/lib/admin/stats/contract";
import { metricDisplayKind, metricPlaceholder, formatBytes, formatDateTimeTr } from "@/lib/admin/stats/uiFormat";

/**
 * MERKEZÎ metrik gösterimi — MetricValue sözleşmesini tek yerde işler. Durumlar (measured/
 * derived/approximate/unavailable/null) DAİMA ayrı; renk TEK BAŞINA anlam taşımaz (ikon+metin).
 * 0 asla unavailable'a; null asla 0'a dönüşmez. measurementStartDate/measuredAt/note tooltip'te.
 */
function formatByUnit(value: unknown, unit: MetricUnit): string {
  if (value == null) return "—";
  if (unit === "byte") return formatBytes(Number(value));
  if (unit === "timestamp") return formatDateTimeTr(String(value));
  if (typeof value === "number") return new Intl.NumberFormat("tr-TR").format(value);
  return String(value);
}

export function MetricValueView<T>({
  metric,
  emptyLabel,
  className = "",
}: {
  metric: MetricValue<T> | null | undefined;
  /** null/empty durumunda gösterilecek bağlamsal etiket (ör. "Sonuç yok"). */
  emptyLabel?: string;
  className?: string;
}) {
  const kind = metricDisplayKind(metric);
  const unit = metric?.unit ?? "count";
  const tip = [
    metric?.note,
    metric?.measurementStartDate ? `Ölçüm başlangıcı: ${formatDateTimeTr(metric.measurementStartDate)}` : null,
    metric?.measuredAt ? `Ölçüldü: ${formatDateTimeTr(metric.measuredAt)}` : null,
  ].filter(Boolean).join(" · ");

  let content: React.ReactNode;
  let tone = "text-slate-900";
  if (kind === "unavailable") {
    content = (<span className="inline-flex items-center gap-1"><Minus className="h-3.5 w-3.5" aria-hidden /> {metricPlaceholder("unavailable")}</span>);
    tone = "text-slate-400";
  } else if (kind === "empty") {
    content = (<span className="text-slate-400">{emptyLabel ?? metricPlaceholder("empty")}</span>);
    tone = "text-slate-400";
  } else if (kind === "approximate") {
    content = (
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>~</span>{formatByUnit(metric!.value, unit)}
        <TriangleAlert className="h-3.5 w-3.5 text-amber-500" aria-hidden />
        <span className="sr-only">(yaklaşık)</span>
      </span>
    );
    tone = "text-amber-700";
  } else if (kind === "zero") {
    content = <span>{formatByUnit(0, unit)}</span>;
    tone = "text-slate-700";
  } else {
    content = <span>{formatByUnit(metric!.value, unit)}</span>;
    tone = "text-slate-900";
  }

  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${tone} ${className}`}>
      {content}
      {tip ? (
        <span className="text-slate-300" title={tip} aria-label={tip}>
          <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

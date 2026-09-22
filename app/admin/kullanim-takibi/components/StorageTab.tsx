"use client";

import { useCallback, useEffect, useState } from "react";
import { statsApi } from "@/lib/admin/stats/statsClient";
import type { StorageOverviewData, StorageGrowthData } from "@/lib/admin/stats/apiTypes";
import { formatBytes, formatDateTimeTr } from "@/lib/admin/stats/uiFormat";
import type { Period } from "./ui";
import { SectionCard, StatTile, LoadingBlock, ErrorBlock, EmptyBlock } from "./ui";
import { MetricValueView } from "./MetricValueView";

function GrowthChart({ data }: { data: StorageGrowthData }) {
  if (!data.measurementStarted) {
    // "aralıkta yok" ile "sistemde hiç başlamadı" AYRI (note API'den gelir).
    return <EmptyBlock title={data.everMeasured ? "Bu aralıkta ölçüm noktası yok" : "Günlük depolama ölçümü henüz başlamadı"} hint={data.note} />;
  }
  if (!data.comparable) {
    // ≥1 nokta var ama karşılaştırılabilir DEĞİL (tek nokta / farklı tenant kapsamı / kısmi ölçüm)
    // → çizgi ÇİZİLMEZ; noktalar dürüst tablo + açıklama ile gösterilir.
    return (
      <div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th scope="col" className="py-1.5 pr-3">Gün</th>
                <th scope="col" className="py-1.5 pr-3">Toplam boyut</th>
                <th scope="col" className="py-1.5 pr-3">Çalışma alanı</th>
                <th scope="col" className="py-1.5">Kısmi</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <tr key={p.snapshotDate} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3">{p.snapshotDate}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{formatBytes(p.totalBytes)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{p.tenantCount}</td>
                  <td className="py-1.5">{p.partialCount > 0 ? <span className="text-amber-600">evet ({p.partialCount})</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-amber-600">{data.note}</p>
      </div>
    );
  }
  const pts = data.points;
  const max = Math.max(...pts.map((p) => p.totalBytes), 1);
  const w = 560, h = 120, pad = 8;
  const xs = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, pts.length - 1);
  const ys = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.totalBytes).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Günlük toplam depolama (byte) eğrisi">
        <path d={path} fill="none" stroke="#a21caf" strokeWidth="2" />
        {pts.map((p, i) => <circle key={p.snapshotDate} cx={xs(i)} cy={ys(p.totalBytes)} r="2.5" fill="#a21caf" />)}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{pts[0].snapshotDate}</span>
        <span>en yüksek: {formatBytes(max)}</span>
        <span>{pts[pts.length - 1].snapshotDate}</span>
      </div>
      {pts.some((p) => p.partialCount > 0) ? <p className="mt-1 text-xs text-amber-600">Bazı günler kısmi ölçüm içerir (partial).</p> : null}
    </div>
  );
}

export function StorageTab({ period, refreshKey }: { period: Period; refreshKey: number }) {
  const [ov, setOv] = useState<StorageOverviewData | null>(null);
  const [growth, setGrowth] = useState<StorageGrowthData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(0);

  const load = useCallback((signal: AbortSignal) => {
    queueMicrotask(() => { if (!signal.aborted) setState("loading"); });
    Promise.all([
      statsApi.storageOverview(signal),
      statsApi.storageGrowth({ from: period.from, to: period.to }, signal),
    ]).then(([o, g]) => {
      if (signal.aborted) return;
      if (!o.ok) { setErr(o.error); setState("error"); return; }
      setOv(o.data);
      setGrowth(g.ok ? g.data : null);
      setState("ok");
    }).catch((x) => { if ((x as { name?: string })?.name !== "AbortError") { setErr("Depolama alınamadı."); setState("error"); } });
  }, [period.from, period.to]);

  useEffect(() => { const ac = new AbortController(); load(ac.signal); return () => ac.abort(); }, [load, refreshKey, retry]);

  if (state === "loading") return <LoadingBlock />;
  if (state === "error") return <ErrorBlock message={err || "Depolama yüklenemedi."} onRetry={() => setRetry((r) => r + 1)} />;
  if (!ov) return <ErrorBlock message="Depolama verisi yok." />;

  const buckets = Object.entries(ov.byBucket).sort((a, b) => b[1].totalBytes - a[1].totalBytes);
  const maxBucket = Math.max(...buckets.map(([, v]) => v.totalBytes), 1);

  return (
    <div className="space-y-5">
      <SectionCard title="Sistem geneli depolama" subtitle={ov.coverageNote}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Atfedilebilir obje" tone="slate" value={<MetricValueView metric={ov.attributedObjectCount} />} />
          <StatTile label="Atfedilebilir boyut" tone="slate" value={<MetricValueView metric={ov.attributedBytes} />} />
          <StatTile label="Atfedilemeyen obje" tone="amber" value={<MetricValueView metric={ov.unattributedObjectCount} />} hint="bir uzmana yüklenmez" />
          <StatTile label="Atfedilemeyen boyut" tone="amber" value={<MetricValueView metric={ov.unattributedBytes} />} />
          <StatTile label="Boyutu bilinmeyen obje" tone="slate" value={<MetricValueView metric={ov.missingSizeCount} />} hint="byte toplamına dahil değil" />
          <StatTile label="Depolamalı çalışma alanı" tone="slate" value={<MetricValueView metric={ov.tenantCount} />} />
        </div>
      </SectionCard>

      <SectionCard title="Bucket dağılımı">
        {buckets.length === 0 ? <EmptyBlock title="Bucket verisi yok" /> : (
          <ul className="space-y-2">
            {buckets.map(([name, v]) => (
              <li key={name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{name}</span>
                  <span className="tabular-nums text-slate-600">{formatBytes(v.totalBytes)} · {v.objectCount} obje</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded bg-fuchsia-400" style={{ width: `${Math.round((v.totalBytes / maxBucket) * 100)}%` }} aria-hidden />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Günlük büyüme (sistem geneli)" subtitle={growth?.note}>
        {!growth ? <EmptyBlock title="Büyüme verisi alınamadı" /> : <GrowthChart data={growth} />}
        {growth?.measurementStarted ? <p className="mt-2 text-xs text-slate-400">Son ölçüm: {formatDateTimeTr(growth.points[growth.points.length - 1]?.snapshotDate + "T00:00:00+03:00")}</p> : null}
      </SectionCard>
    </div>
  );
}

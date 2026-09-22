"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { statsApi } from "@/lib/admin/stats/statsClient";
import type { OverviewData, ExpertsData, StorageOverviewData } from "@/lib/admin/stats/apiTypes";
import { formatRelativeTr } from "@/lib/admin/stats/uiFormat";
import type { Period } from "./ui";
import { SectionCard, StatTile, LoadingBlock, ErrorBlock, EmptyBlock } from "./ui";
import { MetricValueView } from "./MetricValueView";

export function OverviewTab({ period, refreshKey, nowMs, onOpenExpert, onSeeAll }: {
  period: Period;
  refreshKey: number;
  nowMs: number;
  onOpenExpert: (id: string) => void;
  onSeeAll: () => void;
}) {
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [recent, setRecent] = useState<ExpertsData | null>(null);
  const [storage, setStorage] = useState<StorageOverviewData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [err, setErr] = useState("");

  const days = period.days ?? 30;

  const load = useCallback((signal: AbortSignal) => {
    queueMicrotask(() => { if (!signal.aborted) setState("loading"); });
    Promise.all([
      statsApi.overview({ from: period.from, to: period.to, activeSinceDays: days }, signal),
      statsApi.experts({ sort: "last_login", pageSize: 5, status: "all" }, signal),
      statsApi.storageOverview(signal),
    ]).then(([o, e, s]) => {
      if (signal.aborted) return;
      if (!o.ok) { setErr(o.error); setState("error"); return; }
      setOv(o.data);
      setRecent(e.ok ? e.data : null);
      setStorage(s.ok ? s.data : null);
      setState("ok");
    }).catch((x) => { if ((x as { name?: string })?.name !== "AbortError") { setErr("Veri alınamadı."); setState("error"); } });
  }, [period.from, period.to, days]);

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load, refreshKey]);

  if (state === "loading") return <LoadingBlock />;
  if (state === "error") return <ErrorBlock message={err || "Genel bakış yüklenemedi."} />;
  if (!ov) return <ErrorBlock message="Genel bakış verisi yok." />;

  const recentRows = (recent?.rows ?? []).filter((r) => r.lastLoginAt);

  return (
    <div className="space-y-5">
      <SectionCard title="Uzmanlar (kullanıcı/hesap)" subtitle="Arşiv, PASİF hesapların bir alt kümesidir (toplama ayrı EKLENMEZ). Onay bekleyen de bağımsız bir ek grup değildir; toplam üzerine eklenmemelidir.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Toplam Uzman" tone="violet" value={<MetricValueView metric={ov.totalExperts} />} hint="demo hariç (role=expert)" />
          <StatTile label="Aktif Hesap" tone="emerald" value={<MetricValueView metric={ov.activeExperts} />} hint="statü (kullanım değil)" />
          <StatTile label="Pasif" tone="slate" value={<MetricValueView metric={ov.passiveExperts} />} hint="active=false" />
          <StatTile label="Arşiv" tone="slate" value={<MetricValueView metric={ov.archivedExperts} />} hint="pasifin alt kümesi (approved+pasif)" />
          <StatTile label="Onay Bekleyen" tone="amber" value={<MetricValueView metric={ov.pendingExperts} />} />
          <StatTile label={`Son ${days}g Yeni Uzman`} tone="cyan" value={<MetricValueView metric={ov.newExperts} />} />
        </div>
        <div className="mt-3">
          <StatTile
            label={`Son ${days} günde görülme sinyali alınan uzman`}
            tone="cyan"
            value={<MetricValueView metric={ov.activeUsedExperts} />}
            hint="~ yaklaşık: heartbeat (son görülme) tabanlı. 'Modül kullanan / işlem yapan' DEĞİL; 'aktif hesap' statüsünden AYRI."
          />
        </div>
      </SectionCard>

      <SectionCard title="Son giriş yapanlar" right={<button type="button" onClick={onSeeAll} className="text-sm font-semibold text-fuchsia-700 hover:underline">Tüm uzmanlar →</button>}>
        {recentRows.length === 0 ? (
          <EmptyBlock title="Giriş kaydı yok" hint="Henüz doğrulanabilir giriş kaydı bulunmuyor." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentRows.map((r) => (
              <li key={r.userId}>
                <button type="button" onClick={() => onOpenExpert(r.userId)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">{r.fullName || r.email || r.userId}</span>
                    <span className="block text-xs text-slate-500">son giriş {formatRelativeTr(r.lastLoginAt, nowMs)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Depolama (sistem geneli)" subtitle={storage?.coverageNote}>
        {!storage ? (
          <EmptyBlock title="Depolama özeti alınamadı" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Atfedilebilir obje" tone="slate" value={<MetricValueView metric={storage.attributedObjectCount} />} />
            <StatTile label="Atfedilebilir boyut" tone="slate" value={<MetricValueView metric={storage.attributedBytes} />} />
            <StatTile label="Atfedilemeyen obje" tone="amber" value={<MetricValueView metric={storage.unattributedObjectCount} />} hint="bir uzmana yüklenmez" />
            <StatTile label="Çalışma alanı (depolamalı)" tone="slate" value={<MetricValueView metric={storage.tenantCount} />} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

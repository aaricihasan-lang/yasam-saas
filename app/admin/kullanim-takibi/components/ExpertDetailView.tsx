"use client";

import { useCallback, useEffect, useState } from "react";
import { statsApi } from "@/lib/admin/stats/statsClient";
import type { ActivityData, ModulesData, StorageData } from "@/lib/admin/stats/apiTypes";
import { formatBytes } from "@/lib/admin/stats/uiFormat";
import type { Period } from "./ui";
import { SectionCard, StatTile, LoadingBlock, ErrorBlock, EmptyBlock } from "./ui";
import { MetricValueView } from "./MetricValueView";

function Breakdown({ map }: { map: Record<string, number> | null }) {
  const entries = Object.entries(map ?? {});
  if (entries.length === 0) return <span className="text-slate-400">Veri yok</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {k === "unrecorded" ? "kayıt öncesi" : k}: <b className="tabular-nums">{v}</b>
        </span>
      ))}
    </div>
  );
}

function usedLabel(used: boolean | null): { text: string; cls: string } {
  if (used === true) return { text: "kullanım kanıtı mevcut", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" };
  if (used === false) return { text: "kullanılmadı", cls: "bg-slate-200 text-slate-700 ring-slate-300" };
  return { text: "sonuç yok", cls: "bg-slate-100 text-slate-500 ring-slate-200" };
}

export function ExpertDetailView({ userId, period, refreshKey }: { userId: string; period: Period; refreshKey: number }) {
  const [act, setAct] = useState<ActivityData | null>(null);
  const [mods, setMods] = useState<ModulesData | null>(null);
  const [stor, setStor] = useState<StorageData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "notfound">("loading");
  const [err, setErr] = useState("");

  const load = useCallback((signal: AbortSignal) => {
    queueMicrotask(() => { if (!signal.aborted) setState("loading"); });
    Promise.all([
      statsApi.activity({ userId, from: period.from, to: period.to }, signal),
      statsApi.modules({ userId, from: period.from, to: period.to }, signal),
      statsApi.storage({ userId }, signal),
    ]).then(([a, m, s]) => {
      if (signal.aborted) return;
      if (!a.ok) {
        if (a.status === 404) { setState("notfound"); return; }
        setErr(a.error); setState("error"); return;
      }
      setAct(a.data);
      setMods(m.ok ? m.data : null);
      setStor(s.ok ? s.data : null);
      setState("ok");
    }).catch((x) => { if ((x as { name?: string })?.name !== "AbortError") { setErr("Detay alınamadı."); setState("error"); } });
  }, [userId, period.from, period.to]);

  useEffect(() => { const ac = new AbortController(); load(ac.signal); return () => ac.abort(); }, [load, refreshKey]);

  if (state === "loading") return <LoadingBlock />;
  if (state === "notfound") return <EmptyBlock title="Uzman bulunamadı" hint="Bu ID ile bir kullanıcı yok." />;
  if (state === "error") return <ErrorBlock message={err || "Detay yüklenemedi."} />;
  if (!act) return <ErrorBlock message="Etkinlik verisi yok." />;

  return (
    <div className="space-y-5">
      <SectionCard title="A · Kişisel giriş ve etkinlik (kullanıcı hesabı)" subtitle="Son görülme ve aktif gün heartbeat tabanlı (~yaklaşık); son giriş ile karıştırılmaz.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="Kayıt tarihi" value={<MetricValueView metric={act.accountCreatedAt} />} />
          <StatTile label="Son giriş" value={<MetricValueView metric={act.lastLoginAt} />} />
          <StatTile label="Son görülme ~" value={<MetricValueView metric={act.lastSeenAt} />} />
          <StatTile label="Dönemde giriş" tone="emerald" value={<MetricValueView metric={act.loginCount} />} />
          <StatTile label="Oturum (toplam)" value={<MetricValueView metric={act.sessionCount} />} hint="genel toplam" />
          <StatTile label="Aktif gün ~" tone="amber" value={<MetricValueView metric={act.activeDays} />} hint="heartbeat, TR günü" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><p className="mb-1 text-xs font-semibold uppercase text-slate-500">Kanal dağılımı</p><Breakdown map={act.channelBreakdown.value} /></div>
          <div><p className="mb-1 text-xs font-semibold uppercase text-slate-500">Platform dağılımı (türetilmiş)</p><Breakdown map={act.platformBreakdown.value} /></div>
        </div>
      </SectionCard>

      <SectionCard title="B · Modül izinleri ve ölçülen işlemler (çalışma alanı)" subtitle="Mevcut kayıt = işlem sayısı DEĞİL. Yalnız 4 modülde belirli create'ler ölçülür; hiçbiri tam kapsamlı değildir.">
        {!mods ? <EmptyBlock title="Modül verisi alınamadı" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Modül</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">İzin</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Mevcut kayıt</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Ölçülen işlem</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Son ölçülen işlem</th>
                  <th scope="col" className="py-2 font-semibold">Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {mods.modules.map((m) => {
                  const u = usedLabel(m.used);
                  return (
                    <tr key={m.key} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{m.label}</td>
                      <td className="py-2 pr-3">{m.allowed ? <span className="text-emerald-700">✔ izinli</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="py-2 pr-3"><MetricValueView metric={m.existingRecordCount} /></td>
                      <td className="py-2 pr-3"><MetricValueView metric={m.usageEventCount} /></td>
                      <td className="py-2 pr-3"><MetricValueView metric={m.lastUsageAt} /></td>
                      <td className="py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${u.cls}`}>{u.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="C · Çalışma alanı depolaması" subtitle="Bu değerler kişisel kullanıcının değil, ÇALIŞMA ALANININ (tenant) toplamıdır.">
        {!stor ? <EmptyBlock title="Depolama verisi alınamadı" /> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Fiziksel obje" value={<MetricValueView metric={stor.objectCount} />} />
              <StatTile label="Toplam boyut" value={<MetricValueView metric={stor.totalBytes} />} />
              <StatTile label="Boyutu bilinmeyen" value={<MetricValueView metric={stor.missingSizeCount} />} hint="byte'a dahil değil" />
              {stor.isLegacyTenant ? <StatTile label="Uyarı" tone="amber" value="Legacy" hint="pre-multitenant çalışma alanı" /> : null}
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Bucket dağılımı</p>
              {Object.keys(stor.byBucket).length === 0 ? <span className="text-slate-400">Veri yok</span> : (
                <ul className="text-sm text-slate-700">
                  {Object.entries(stor.byBucket).map(([b, v]) => (
                    <li key={b} className="flex justify-between border-b border-slate-100 py-1">
                      <span>{b}</span><span className="tabular-nums">{formatBytes(v.totalBytes)} · {v.objectCount} obje</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-400">Sistem geneli atfedilemeyen objeler bu uzmana dahil DEĞİLDİR.</p>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

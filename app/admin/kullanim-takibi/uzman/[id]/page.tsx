"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Shield } from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { Expert360View } from "../../components/Expert360View";
import {
  customUsage360Period, presetUsage360Period, trDayOf, DETAIL_MAX_DAYS,
  type Usage360Period, type Usage360Preset,
} from "@/lib/admin/stats/usage360Period";

const PRESETS: { k: Exclude<Usage360Preset, "custom">; l: string; hint: string }[] = [
  { k: "today", l: "Bugün", hint: "Türkiye takvim günü" },
  { k: "yesterday", l: "Dün", hint: "Türkiye takvim günü" },
  { k: "7", l: "7 Gün", hint: "bugün dahil son 7 takvim günü" },
  { k: "30", l: "30 Gün", hint: "bugün dahil son 30 takvim günü" },
  { k: "90", l: "90 Gün", hint: "bugün dahil son 90 takvim günü" },
];

function Usage360PeriodControl({ period, customFrom, customTo, maxDay, onPreset, onCustom }: {
  period: Usage360Period; customFrom: string; customTo: string; maxDay: string;
  onPreset: (p: Exclude<Usage360Preset, "custom">) => void; onCustom: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Dönem">
      <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5">
        {PRESETS.map((p) => (
          <button key={p.k} type="button" title={p.hint} aria-pressed={period.preset === p.k} onClick={() => onPreset(p.k)}
            className={`rounded-md px-2.5 py-1.5 text-sm font-semibold ${period.preset === p.k ? "bg-fuchsia-100 text-fuchsia-800" : "text-slate-600 hover:bg-slate-50"}`}>
            {p.l}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-500">Özel
        <input type="date" value={customFrom} max={maxDay} onChange={(e) => onCustom(e.target.value, customTo)} aria-label="Başlangıç (TR günü)" className="rounded-md border border-slate-200 px-1.5 py-1 text-sm" />
        –
        <input type="date" value={customTo} max={maxDay} onChange={(e) => onCustom(customFrom, e.target.value)} aria-label="Bitiş (TR günü)" className="rounded-md border border-slate-200 px-1.5 py-1 text-sm" />
      </label>
      {period.preset === "custom" && period.invalid ? <span className="text-xs text-rose-700">Geçersiz aralık (en fazla {DETAIL_MAX_DAYS} gün)</span> : null}
    </div>
  );
}

export default function ExpertDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [preset, setPreset] = useState<Usage360Preset>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // setState'ler mikro-görev'e ertelenir (effect içinde senkron setState kuralı).
    queueMicrotask(() => {
      setAllowed(isAdminUser(readYasamUser()));
      setChecked(true);
      setNowMs(Date.now());
    });
  }, []);

  const period: Usage360Period = useMemo(() => {
    if (preset === "custom") return customUsage360Period(customFrom, customTo);
    return presetUsage360Period(preset, nowMs);
  }, [preset, customFrom, customTo, nowMs]);

  const back = useCallback(() => {
    // Uzman listesine dön (geçmiş varsa geri, yoksa sekmeye).
    if (window.history.length > 1) router.back();
    else router.push("/admin/kullanim-takibi?tab=experts");
  }, [router]);

  if (!checked) {
    return <main className="flex min-h-screen w-full items-center justify-center bg-slate-50 text-slate-600"><p className="text-lg font-semibold">Yükleniyor…</p></main>;
  }
  if (!allowed) {
    return (
      <main className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-fuchsia-50 to-pink-50 px-6 py-12">
        <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" aria-hidden />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-2 text-base text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-fuchsia-50/70 to-pink-50/50 text-slate-900 antialiased">
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={back} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Uzmanlar
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-fuchsia-600">Uzman Detayı</p>
              <h1 className="text-xl font-bold text-slate-900">Uzman 360 · kullanım istatistiği</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Usage360PeriodControl period={period} customFrom={customFrom} customTo={customTo} maxDay={trDayOf(nowMs)}
              onPreset={(p) => setPreset(p)}
              onCustom={(f, t) => { setCustomFrom(f); setCustomTo(t); setPreset("custom"); }} />
            <button type="button" onClick={() => { setNowMs(Date.now()); setRefreshKey((k) => k + 1); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" aria-hidden /> Yenile
            </button>
          </div>
        </div>

        {!userId ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">Geçersiz uzman kimliği.</p>
        ) : (
          <Expert360View userId={userId} period={period} refreshKey={refreshKey} nowMs={nowMs} />
        )}
      </div>
    </main>
  );
}

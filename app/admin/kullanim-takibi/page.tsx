"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, RefreshCw, Shield } from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { formatDateTimeTr } from "@/lib/admin/stats/uiFormat";
import {
  Tabs, PeriodControl, presetPeriod, customPeriod, type Period,
} from "./components/ui";
import { OverviewTab } from "./components/OverviewTab";
import { ExpertsTab } from "./components/ExpertsTab";
import { StorageTab } from "./components/StorageTab";
import { MethodologyTab } from "./components/MethodologyTab";

const TABS = [
  { key: "overview", label: "Genel Bakış" },
  { key: "experts", label: "Uzmanlar" },
  { key: "storage", label: "Depolama" },
  { key: "methodology", label: "Ölçüm Açıklamaları" },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

export default function KullanimTakibiPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [tab, setTab] = useState("overview");
  const [preset, setPreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  // Mount: admin gate + now + URL'den sekme (deep-link + geri/ileri).
  // setState'ler mikro-görev'e ertelenir (effect içinde SENKRON setState → cascading render kuralı).
  useEffect(() => {
    const applyFromUrl = () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      setTab(t && TAB_KEYS.has(t) ? t : "overview");
    };
    queueMicrotask(() => {
      setAllowed(isAdminUser(readYasamUser()));
      setChecked(true);
      setNowMs(Date.now());
      setRefreshedAt(new Date().toISOString());
      applyFromUrl();
    });
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, []);

  const changeTab = useCallback((k: string) => {
    setTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k);
    window.history.pushState(null, "", url.toString());
  }, []);

  const period: Period = useMemo(() => {
    if (preset === "custom") return customPeriod(customFrom, customTo);
    return presetPeriod(preset, nowMs);
  }, [preset, customFrom, customTo, nowMs]);

  const openExpert = useCallback((id: string) => {
    router.push(`/admin/kullanim-takibi/uzman/${encodeURIComponent(id)}`);
  }, [router]);

  const refresh = useCallback(() => {
    setNowMs(Date.now());
    setRefreshedAt(new Date().toISOString());
    setRefreshKey((k) => k + 1);
  }, []);

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
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-col gap-4 rounded-2xl border border-white/20 bg-gradient-to-r from-slate-900 via-fuchsia-900 to-pink-800 px-5 py-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Database className="h-6 w-6" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-fuchsia-200/90">Admin · İzleme</p>
              <h1 className="mt-0.5 text-3xl font-semibold tracking-tight sm:text-4xl">Kullanım Takibi</h1>
              <p className="mt-1 text-sm font-medium text-white/85">Uzman hesapları, modül erişimi ve depolama — ölçüm durumlarıyla</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button type="button" onClick={refresh} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <RefreshCw className="h-4 w-4" aria-hidden /> Yenile
            </button>
            {refreshedAt ? <span className="text-[11px] text-white/70">Son güncelleme: {formatDateTimeTr(refreshedAt)}</span> : null}
          </div>
        </header>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs tabs={TABS} active={tab} onChange={changeTab} />
          {tab !== "methodology" && tab !== "experts" ? (
            <PeriodControl period={period} customFrom={customFrom} customTo={customTo}
              onPreset={(p) => setPreset(p)}
              onCustom={(f, t) => { setCustomFrom(f); setCustomTo(t); setPreset("custom"); }} />
          ) : null}
        </div>

        <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
          {tab === "overview" && <OverviewTab period={period} refreshKey={refreshKey} nowMs={nowMs} onOpenExpert={openExpert} onSeeAll={() => changeTab("experts")} />}
          {tab === "experts" && <ExpertsTab refreshKey={refreshKey} nowMs={nowMs} onOpenExpert={openExpert} />}
          {tab === "storage" && <StorageTab period={period} refreshKey={refreshKey} />}
          {tab === "methodology" && <MethodologyTab />}
        </div>
      </div>
    </main>
  );
}

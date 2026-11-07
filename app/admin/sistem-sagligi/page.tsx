"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Shield } from "lucide-react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { parseMemberCounts } from "@/lib/admin/memberListQuery";
import { loadTenantMetricSummary, sistemSagligiAdminHeaders } from "./detail-shared";

const demoCardThemes = [
  {
    cardBg: "from-blue-50/95 via-white to-sky-50/90",
    border: "border-blue-200/80",
    valueText: "text-indigo-950",
  },
  {
    cardBg: "from-violet-50/95 via-white to-fuchsia-50/90",
    border: "border-violet-200/80",
    valueText: "text-violet-950",
  },
  {
    cardBg: "from-emerald-50/95 via-white to-teal-50/90",
    border: "border-emerald-200/80",
    valueText: "text-emerald-950",
  },
  {
    cardBg: "from-amber-50/95 via-white to-orange-50/90",
    border: "border-amber-200/80",
    valueText: "text-amber-950",
  },
  {
    cardBg: "from-rose-50/95 via-white to-red-50/90",
    border: "border-rose-200/80",
    valueText: "text-rose-950",
  },
  {
    cardBg: "from-cyan-50/95 via-white to-teal-50/90",
    border: "border-cyan-200/80",
    valueText: "text-cyan-950",
  },
] as const;

type MetricKey =
  | "users"
  | "activeExperts"
  | "passivePending"
  | "clients"
  | "numerology"
  | "stones"
  | "archives"
  | "errors"
  | "backups"
  | "status";

/**
 * Kart değeri — yalnız gerçek kaynaktan gelir. Kaynak yoksa "unlinked", istek başarısızsa
 * "error" gösterilir; hiçbir durumda sahte sıfır veya tahmini sayı üretilmez.
 */
type MetricValue =
  | { state: "loading" }
  | { state: "ok"; value: string; detail?: string }
  | { state: "error" }
  | { state: "unlinked"; detail: string };

type Metrics = Record<MetricKey, MetricValue>;

const metricCards: { key: MetricKey; title: string; href: string }[] = [
  { key: "users", title: "Toplam Kullanıcı", href: "/admin/sistem-sagligi/kullanicilar" },
  { key: "activeExperts", title: "Aktif Uzman", href: "/admin/sistem-sagligi/uzmanlar" },
  { key: "passivePending", title: "Pasif / Bekleyen Kullanıcı", href: "/admin/sistem-sagligi/bekleyenler" },
  { key: "clients", title: "Toplam Danışan", href: "/admin/sistem-sagligi/danisanlar" },
  { key: "numerology", title: "Toplam Numeroloji Analizi", href: "/admin/sistem-sagligi/numeroloji" },
  { key: "stones", title: "Toplam Doğaltaş Kaydı", href: "/admin/sistem-sagligi/dogaltas" },
  { key: "archives", title: "Kişisel Arşiv Kayıtları", href: "/admin/sistem-sagligi/arsiv" },
  { key: "errors", title: "Son Hata Kaydı", href: "/admin/sistem-sagligi/hatalar" },
  { key: "backups", title: "Son Yedek Tarihi", href: "/admin/sistem-sagligi/yedekler" },
  { key: "status", title: "Sistem Durumu", href: "/admin/sistem-sagligi/durum" },
];

/** Uygulama içinde doğrulanabilir kaynağı olmayan kartlar (sabit bilgi; veri uydurulmaz). */
const ERRORS_UNLINKED: MetricValue = { state: "unlinked", detail: "Uygulama içi hata günlüğü bağlı değil." };
const BACKUPS_UNLINKED: MetricValue = {
  state: "unlinked",
  detail: "Uygulama içinde doğrulanabilir yedek kaydı yok.",
};

function initialMetrics(): Metrics {
  return {
    users: { state: "loading" },
    activeExperts: { state: "loading" },
    passivePending: { state: "loading" },
    clients: { state: "loading" },
    numerology: { state: "loading" },
    stones: { state: "loading" },
    archives: { state: "loading" },
    errors: ERRORS_UNLINKED,
    backups: BACKUPS_UNLINKED,
    status: { state: "loading" },
  };
}

const fmt = (n: number) => n.toLocaleString("tr-TR");

async function fetchAdminJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: sistemSagligiAdminHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as unknown;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Üye sayaçları: /api/admin/users GLOBAL `counts` (admin_list_users) — sayfa boyutundan bağımsız. */
async function loadMemberMetrics(): Promise<Pick<Metrics, "users" | "activeExperts" | "passivePending">> {
  const json = await fetchAdminJson("/api/admin/users?pageSize=10");
  if (!json || !json.counts || typeof json.counts !== "object") {
    return { users: { state: "error" }, activeExperts: { state: "error" }, passivePending: { state: "error" } };
  }
  const c = parseMemberCounts(json.counts);
  return {
    users: {
      state: "ok",
      value: fmt(c.experts_total + c.admins),
      detail: `${fmt(c.experts_total)} uzman · ${fmt(c.admins)} yönetici`,
    },
    activeExperts: { state: "ok", value: fmt(c.approved_active), detail: "Onaylı ve aktif uzman" },
    passivePending: {
      state: "ok",
      value: fmt(c.pending + c.archived),
      detail: `${fmt(c.pending)} onay bekleyen · ${fmt(c.archived)} pasif`,
    },
  };
}

async function loadTableMetric(metric: "clients" | "stones" | "personal_archives"): Promise<MetricValue> {
  const result = await loadTenantMetricSummary(metric);
  if (result.error) return { state: "error" };
  return { state: "ok", value: fmt(result.total), detail: `${fmt(result.distinctTenants)} çalışma alanı` };
}

async function loadNumerologyMetric(): Promise<MetricValue> {
  const json = await fetchAdminJson("/api/admin/numeroloji/tenant-metrics");
  if (!json || json.ok !== true || typeof json.total !== "number") return { state: "error" };
  return { state: "ok", value: fmt(json.total), detail: "Kayıtlı numeroloji analizi" };
}

async function loadStatusMetric(): Promise<MetricValue> {
  try {
    const res = await fetch("/api/admin/health/db-ping", {
      headers: sistemSagligiAdminHeaders(),
      cache: "no-store",
    });
    return res.ok
      ? { state: "ok", value: "Sağlıklı", detail: "Veritabanı erişimi başarılı" }
      : { state: "ok", value: "Kontrol gerekli", detail: "Veritabanı erişimi doğrulanamadı" };
  } catch {
    return { state: "error" };
  }
}

async function loadAllMetrics(): Promise<Metrics> {
  const [members, clients, numerology, stones, archives, status] = await Promise.all([
    loadMemberMetrics(),
    loadTableMetric("clients"),
    loadNumerologyMetric(),
    loadTableMetric("stones"),
    loadTableMetric("personal_archives"),
    loadStatusMetric(),
  ]);
  return {
    ...members,
    clients,
    numerology,
    stones,
    archives,
    errors: ERRORS_UNLINKED,
    backups: BACKUPS_UNLINKED,
    status,
  };
}

const stateChip = {
  ok: { label: "Canlı", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  error: { label: "Alınamadı", cls: "border-rose-200 bg-rose-50 text-rose-800" },
  unlinked: { label: "Bağlı değil", cls: "border-slate-200 bg-white/80 text-slate-600" },
} as const;

function metricText(metric: MetricValue): { value: string; detail: string | null } {
  switch (metric.state) {
    case "loading":
      return { value: "Yükleniyor…", detail: null };
    case "ok":
      return { value: metric.value, detail: metric.detail ?? null };
    case "error":
      return { value: "—", detail: "Veri alınamadı. Yenilemeyi deneyin." };
    case "unlinked":
      return { value: "—", detail: metric.detail };
  }
}

export default function SistemSagligiPage() {
  useBfcacheRefresh();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setChecked(true);
  }, []);

  const [reloadKey, setReloadKey] = useState(0);

  // Durum yalnız istekler bittikten sonra yazılır; yükleniyor durumu başlangıç değeri / Yenile ile kurulur.
  useEffect(() => {
    if (!checked || !allowed) return;
    let cancelled = false;
    void loadAllMetrics().then((next) => {
      if (cancelled) return;
      setMetrics(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [checked, allowed, reloadKey]);

  const reloadMetrics = useCallback(() => {
    setLoading(true);
    setMetrics(initialMetrics());
    setReloadKey((k) => k + 1);
  }, []);

  if (!checked) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen w-full bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] px-6 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-2 text-base text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-rose-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(16,185,129,0.18)] sm:px-8 sm:py-7">
          <div className="relative flex flex-wrap items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg ring-1 ring-white/25"
            >
              <Activity className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-200/90">
                Admin · İzleme
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Sistem Sağlığı
              </h1>
              <p className="mt-1 text-sm font-medium text-white/70">
                Bağlantı, kullanım, performans ve güvenlik özeti
              </p>
            </div>
          </div>
        </header>

        <section aria-label="Sistem metrikleri">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Sistem metrikleri</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Canlı veri
            </span>
            <button
              type="button"
              onClick={reloadMetrics}
              disabled={loading}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Yenile
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Platform genelinde kullanım ve durum göstergeleri
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {metricCards.map((card, index) => {
              const theme = demoCardThemes[index % demoCardThemes.length];
              const metric = metrics[card.key];
              const text = metricText(metric);
              const chip = metric.state === "loading" ? null : stateChip[metric.state];
              return (
                <Link
                  key={card.key}
                  href={card.href}
                  className="block h-full no-underline"
                >
                  <article
                    data-metric={card.key}
                    data-state={metric.state}
                    aria-busy={metric.state === "loading"}
                    className={`flex h-full min-h-[120px] cursor-pointer flex-col rounded-2xl border bg-gradient-to-br p-5 shadow-md transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg ${theme.cardBg} ${theme.border}`}
                  >
                    {chip ? (
                      <span className={`w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${chip.cls}`}>
                        {chip.label}
                      </span>
                    ) : null}
                    <h3 className={`text-base font-bold text-slate-900 ${chip ? "mt-3" : ""}`}>{card.title}</h3>
                    <p className={`mt-2 text-2xl font-black tabular-nums ${theme.valueText}`}>
                      {text.value}
                    </p>
                    {text.detail ? (
                      <p className="mt-1 flex-1 text-xs font-semibold leading-relaxed text-slate-600">
                        {text.detail}
                      </p>
                    ) : (
                      <span className="flex-1" />
                    )}
                    <p className="mt-3 text-xs font-semibold text-slate-500">Detayları gör →</p>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200/60 pt-6">
          <p className="text-xs font-medium text-slate-600">
            Sistem Sağlığı · sayılar yalnız yönetici API&apos;lerinden canlı okunur; kaynağı olmayan alan gösterilmez.
          </p>
        </footer>
      </div>
    </main>
  );
}

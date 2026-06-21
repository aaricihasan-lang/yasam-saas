"use client";

import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Database, Loader2, Shield } from "lucide-react";
import { normalizeApprovalStatus, normalizeRole } from "@/lib/auth/yasamUser";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const LEGACY_TENANT_ID = "11111111-1111-1111-1111-111111111111";

const INSIGHT_PLACEHOLDER = "Veri hazırlanıyor";

type StatTone = "indigo" | "violet" | "emerald" | "amber" | "slate" | "rose" | "cyan" | "fuchsia";

const statToneClass: Record<StatTone, string> = {
  indigo:
    "border-indigo-200/90 bg-gradient-to-br from-indigo-50/95 via-white to-blue-50/90 text-indigo-950",
  violet:
    "border-violet-200/90 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/90 text-violet-950",
  emerald:
    "border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/90 text-emerald-950",
  amber:
    "border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/90 text-amber-950",
  slate:
    "border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-slate-100/90 text-slate-950",
  rose: "border-rose-200/90 bg-gradient-to-br from-rose-50/95 via-white to-red-50/90 text-rose-950",
  cyan: "border-cyan-200/90 bg-gradient-to-br from-cyan-50/95 via-white to-teal-50/90 text-cyan-950",
  fuchsia:
    "border-fuchsia-200/90 bg-gradient-to-br from-fuchsia-50/95 via-white to-pink-50/90 text-fuchsia-950",
};

type TenantIdCount = {
  id: string;
  count: number;
  isLegacy: boolean;
};

type UserRow = {
  role: string;
  active: boolean;
  approvalStatus: string;
  tenantId: string | null;
  createdAt: string | null;
};

type InsightMetrics = {
  supabaseConnected: boolean;
  newMembersThisMonth: number | null;
  newClientsThisMonth: number | null;
};

type ModuleMetrics = {
  total: number;
  tenantRows: TenantIdCount[];
  distinctTenants: number;
};

type UsageSnapshot = {
  users: UserRow[];
  clients: ModuleMetrics;
  numerology: ModuleMetrics;
  stones: ModuleMetrics;
  archives: ModuleMetrics;
  insight: InsightMetrics;
};

const metricCardBase =
  "flex h-full min-h-[170px] flex-col rounded-2xl border p-5 shadow-sm sm:p-6";

function MetricCard({
  label,
  value,
  tone,
  sublabel,
  interactive = false,
}: {
  label: string;
  value: number | string;
  tone: StatTone;
  sublabel?: string;
  interactive?: boolean;
}) {
  return (
    <article
      className={`${metricCardBase} ${statToneClass[tone]} ${
        interactive
          ? "transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-md"
          : ""
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <div className="flex flex-1 items-center py-2">
        <p className="text-3xl font-semibold leading-tight tabular-nums tracking-tight sm:text-4xl">
          {value}
        </p>
      </div>
      <p className="text-sm font-medium leading-snug opacity-75">
        {sublabel ?? "\u00a0"}
      </p>
    </article>
  );
}

function CategorySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 w-full">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {children}
      </div>
    </section>
  );
}

function ModuleDistributionCard({
  label,
  total,
  sharePercent,
  tone,
  tenantCount,
}: {
  label: string;
  total: number;
  sharePercent: number;
  tone: StatTone;
  tenantCount: number;
}) {
  const barWidth = Math.max(4, Math.min(100, sharePercent));

  return (
    <article
      className={`${metricCardBase} ${statToneClass[tone]} transition-all duration-300 hover:scale-[1.01] hover:shadow-md`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <div className="flex flex-1 flex-col justify-center py-2">
        <p className="text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{total}</p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-current opacity-50 transition-all duration-500"
            style={{ width: `${barWidth}%` }}
            aria-hidden
          />
        </div>
      </div>
      <p className="text-sm font-medium opacity-75">
        %{sharePercent.toFixed(0)} pay · {tenantCount} tenant
      </p>
    </article>
  );
}

function getMonthStartIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.toISOString();
}

function isOnOrAfterMonthStart(iso: string | null | undefined, monthStartIso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= new Date(monthStartIso).getTime();
}

async function fetchCountSince(
  table: string,
  sinceIso: string,
): Promise<{ count: number | null; error: string | null }> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso);

  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

async function checkSupabaseConnection(): Promise<boolean> {
  const urlOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const keyOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());
  if (!urlOk || !keyOk) return false;

  const { error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true });
  return !error;
}

function shortTenantId(id: string): string {
  if (id.length <= 22) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function buildTenantCounts(ids: (string | null)[]): TenantIdCount[] {
  const map = new Map<string, number>();
  for (const raw of ids) {
    if (raw == null || String(raw).trim() === "") continue;
    const id = String(raw).trim();
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([id, count]) => ({
      id,
      count,
      isLegacy: id === LEGACY_TENANT_ID,
    }))
    .sort((a, b) => b.count - a.count);
}

async function fetchTableTotalCount(table: string): Promise<{
  total: number;
  error: string | null;
}> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return { total: 0, error: error.message };
  return { total: count ?? 0, error: null };
}

async function fetchAllTenantIds(table: string): Promise<{
  ids: (string | null)[];
  error: string | null;
}> {
  const ids: (string | null)[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("tenant_id")
      .range(from, from + pageSize - 1);

    if (error) return { ids: [], error: error.message };
    if (!data?.length) break;

    ids.push(...data.map((row) => (row as { tenant_id: string | null }).tenant_id));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { ids, error: null };
}

async function loadModuleMetrics(table: string): Promise<ModuleMetrics> {
  const [{ total, error: countError }, { ids, error: idsError }] = await Promise.all([
    fetchTableTotalCount(table),
    fetchAllTenantIds(table),
  ]);

  const tenantRows = buildTenantCounts(ids);
  return {
    total: countError ? 0 : total,
    tenantRows: idsError ? [] : tenantRows,
    distinctTenants: tenantRows.length,
  };
}

function mapUserRow(row: Record<string, unknown>): UserRow {
  const approval = normalizeApprovalStatus(row.approval_status);
  return {
    role: normalizeRole(row.role) || "expert",
    active: row.active === true,
    approvalStatus: approval ?? "pending",
    tenantId:
      row.tenant_id != null && String(row.tenant_id).trim() !== ""
        ? String(row.tenant_id).trim()
        : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  };
}

function computeUserStats(users: UserRow[]) {
  const total = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const expertCount = users.filter((u) => u.role === "expert").length;
  const activeCount = users.filter(
    (u) => u.active && u.approvalStatus === "approved",
  ).length;
  const passiveCount = users.filter(
    (u) => !u.active || u.approvalStatus === "rejected",
  ).length;
  const pendingCount = users.filter((u) => u.approvalStatus === "pending").length;

  const usersByTenant = new Map<string, number>();
  for (const user of users) {
    if (!user.tenantId) continue;
    usersByTenant.set(user.tenantId, (usersByTenant.get(user.tenantId) ?? 0) + 1);
  }

  return {
    total,
    adminCount,
    expertCount,
    activeCount,
    passiveCount,
    pendingCount,
    usersByTenant,
  };
}

type TenantUsageRow = {
  tenantId: string;
  isLegacy: boolean;
  users: number;
  clients: number;
  numerology: number;
  stones: number;
  archives: number;
  moduleTotal: number;
};

function rowsToCountMap(rows: TenantIdCount[]): Map<string, number> {
  return new Map(rows.map((r) => [r.id, r.count]));
}

function buildTenantUsageTable(
  usersByTenant: Map<string, number>,
  clients: ModuleMetrics,
  numerology: ModuleMetrics,
  stones: ModuleMetrics,
  archives: ModuleMetrics,
): TenantUsageRow[] {
  const tenantIds = new Set<string>();
  usersByTenant.forEach((_, id) => tenantIds.add(id));
  clients.tenantRows.forEach((r) => tenantIds.add(r.id));
  numerology.tenantRows.forEach((r) => tenantIds.add(r.id));
  stones.tenantRows.forEach((r) => tenantIds.add(r.id));
  archives.tenantRows.forEach((r) => tenantIds.add(r.id));

  const clientMap = rowsToCountMap(clients.tenantRows);
  const numerologyMap = rowsToCountMap(numerology.tenantRows);
  const stonesMap = rowsToCountMap(stones.tenantRows);
  const archivesMap = rowsToCountMap(archives.tenantRows);

  return Array.from(tenantIds)
    .map((tenantId) => {
      const u = usersByTenant.get(tenantId) ?? 0;
      const c = clientMap.get(tenantId) ?? 0;
      const n = numerologyMap.get(tenantId) ?? 0;
      const s = stonesMap.get(tenantId) ?? 0;
      const a = archivesMap.get(tenantId) ?? 0;
      return {
        tenantId,
        isLegacy: tenantId === LEGACY_TENANT_ID,
        users: u,
        clients: c,
        numerology: n,
        stones: s,
        archives: a,
        moduleTotal: c + n + s + a,
      };
    })
    .sort((a, b) => b.moduleTotal + b.users - (a.moduleTotal + a.users));
}

const MODULE_CARDS = [
  { key: "clients" as const, label: "Danışan", tone: "indigo" as const },
  { key: "numerology" as const, label: "Numeroloji", tone: "violet" as const },
  { key: "stones" as const, label: "Taş", tone: "cyan" as const },
  { key: "archives" as const, label: "Arşiv", tone: "amber" as const },
];

export default function KullanimTakibiPage() {
  useBfcacheRefresh();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const monthStart = getMonthStartIso();

    const [usersRes, clients, numerology, stones, archives, supabaseConnected, clientsMonth] =
      await Promise.all([
        supabase.from("users").select("role, active, approval_status, tenant_id, created_at"),
        loadModuleMetrics("clients"),
        loadModuleMetrics("numerology_analyses"),
        loadModuleMetrics("stones"),
        loadModuleMetrics("personal_archives"),
        checkSupabaseConnection(),
        fetchCountSince("clients", monthStart),
      ]);

    const errors: string[] = [];
    if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);

    const users = (usersRes.data ?? []).map((row) =>
      mapUserRow(row as Record<string, unknown>),
    );

    const newMembersThisMonth = usersRes.error
      ? null
      : users.filter((u) => isOnOrAfterMonthStart(u.createdAt, monthStart)).length;

    const newClientsThisMonth =
      clientsMonth.error != null ? null : clientsMonth.count;

    if (errors.length > 0) {
      setLoadError(errors.join(" · "));
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setSnapshot({
      users,
      clients,
      numerology,
      stones,
      archives,
      insight: {
        supabaseConnected,
        newMembersThisMonth,
        newClientsThisMonth,
      },
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadMetrics();
  }, [checked, allowed, loadMetrics]);

  const userStats = useMemo(
    () => (snapshot ? computeUserStats(snapshot.users) : null),
    [snapshot],
  );

  const tenantUsageRows = useMemo(() => {
    if (!snapshot || !userStats) return [];
    return buildTenantUsageTable(
      userStats.usersByTenant,
      snapshot.clients,
      snapshot.numerology,
      snapshot.stones,
      snapshot.archives,
    );
  }, [snapshot, userStats]);

  const totalModuleRecords = useMemo(() => {
    if (!snapshot) return 0;
    return (
      snapshot.clients.total +
      snapshot.numerology.total +
      snapshot.stones.total +
      snapshot.archives.total
    );
  }, [snapshot]);

  const systemStatusLabel = useMemo(() => {
    if (!snapshot) return INSIGHT_PLACEHOLDER;
    return snapshot.insight.supabaseConnected ? "🟢 Sağlıklı" : "🔴 Kontrol gerekli";
  }, [snapshot]);

  const supabaseStatusLabel = useMemo(() => {
    if (!snapshot) return INSIGHT_PLACEHOLDER;
    return snapshot.insight.supabaseConnected ? "🟢 Bağlı" : "🔴 Kopuk";
  }, [snapshot]);

  const moduleSharePercents = useMemo(() => {
    if (!snapshot || totalModuleRecords <= 0) {
      return { clients: 0, numerology: 0, stones: 0, archives: 0 };
    }
    const pct = (n: number) => (n / totalModuleRecords) * 100;
    return {
      clients: pct(snapshot.clients.total),
      numerology: pct(snapshot.numerology.total),
      stones: pct(snapshot.stones.total),
      archives: pct(snapshot.archives.total),
    };
  }, [snapshot, totalModuleRecords]);

  if (!checked) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-fuchsia-50 to-pink-50 text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen w-full bg-gradient-to-br from-slate-50 via-fuchsia-50 to-pink-50 px-8 py-12">
        <div className="mx-auto max-w-lg rounded-[32px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black text-slate-900">Erişim reddedildi</h1>
          <p className="mt-2 text-base text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-fuchsia-50/80 to-pink-50/60 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-fuchsia-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-pink-200/20 blur-[120px]" />

      <div className="relative z-10 w-full min-h-screen px-6 py-6 xl:px-8">
        <header className="relative mb-6 max-h-[220px] overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-r from-slate-900 via-fuchsia-900 to-pink-800 px-6 py-8 text-white shadow-lg">
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Database className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-200/90">
                Admin · İzleme
              </p>
              <h1 className="mt-1 text-5xl font-semibold tracking-tight">Kullanım Takibi</h1>
              <p className="mt-2 text-lg font-medium text-white/85">
                Platform genelinde kullanıcı, modül ve kayıt yoğunluğu
              </p>
            </div>
          </div>
        </header>

        {loading ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-white/80 bg-white/90 py-20 shadow-xl"
            role="status"
          >
            <Loader2 className="h-12 w-12 animate-spin text-fuchsia-600" aria-hidden />
            <p className="text-lg font-bold text-slate-600">Kullanım metrikleri yükleniyor…</p>
          </div>
        ) : loadError ? (
          <section className="rounded-[28px] border-2 border-rose-200/90 bg-gradient-to-r from-rose-50/95 via-white to-orange-50/90 p-8 shadow-xl">
            <p className="text-xl font-black text-rose-950">Veri yüklenemedi</p>
            <p className="mt-3 text-base font-medium text-rose-900/90">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadMetrics()}
              className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl border-2 border-rose-300 bg-white px-8 text-base font-bold text-rose-950 transition hover:scale-[1.02]"
            >
              Tekrar dene
            </button>
          </section>
        ) : snapshot && userStats ? (
          <>
            <CategorySection title="Sistem">
              <MetricCard
                label="Sistem durumu"
                value={systemStatusLabel}
                tone="emerald"
                sublabel="Platform erişilebilirliği"
              />
              <MetricCard
                label="Supabase"
                value={supabaseStatusLabel}
                tone="slate"
                sublabel="Head sorgusu kontrolü"
              />
              <MetricCard
                label="Son deploy"
                value={INSIGHT_PLACEHOLDER}
                tone="amber"
                sublabel="Deploy kaydı henüz bağlanmadı"
              />
              <MetricCard
                label="Son yedek"
                value={INSIGHT_PLACEHOLDER}
                tone="rose"
                sublabel="Yedekleme altyapısı henüz bağlanmadı"
              />
            </CategorySection>

            <CategorySection title="Kullanıcı">
              <MetricCard
                label="Toplam kullanıcı"
                value={userStats.total}
                tone="indigo"
                sublabel="Tüm kayıtlı hesaplar"
              />
              <MetricCard label="Admin" value={userStats.adminCount} tone="violet" sublabel="Yönetici rolü" />
              <MetricCard label="Uzman" value={userStats.expertCount} tone="fuchsia" sublabel="Uzman rolü" />
              <MetricCard
                label="Aktif"
                value={userStats.activeCount}
                tone="emerald"
                sublabel="Onaylı ve aktif"
              />
              <MetricCard
                label="Pasif"
                value={userStats.passiveCount}
                tone="slate"
                sublabel="Pasif veya reddedilmiş"
              />
              <MetricCard
                label="Bekleyen"
                value={userStats.pendingCount}
                tone="amber"
                sublabel="Onay bekliyor"
              />
            </CategorySection>

            <CategorySection title="İçerik">
              {MODULE_CARDS.map(({ key, label, tone }) => {
                const mod = snapshot[key];
                return (
                  <ModuleDistributionCard
                    key={key}
                    label={label}
                    total={mod.total}
                    sharePercent={moduleSharePercents[key]}
                    tone={tone}
                    tenantCount={mod.distinctTenants}
                  />
                );
              })}
            </CategorySection>

            <section className="w-full" aria-label="Tenant bazlı kullanım özeti">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">
                    Tenant Bazlı Kullanım Özeti
                  </h2>
                  <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">
                    Kullanıcı ve modül kayıtlarının tenant dağılımı — yalnızca sayılar
                  </p>
                </div>
                <p className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-4 py-1.5 text-sm font-bold text-fuchsia-900">
                  {tenantUsageRows.length} tenant
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg">
                <div className="max-h-[min(70vh,640px)] overflow-auto">
                  <table className="w-full min-w-[920px] border-collapse text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-200/90 bg-white/95 backdrop-blur-sm shadow-sm">
                        {[
                          "Tenant ID",
                          "Kullanıcı",
                          "Danışan",
                          "Numeroloji",
                          "Doğaltaş",
                          "Arşiv",
                          "Modül toplamı",
                        ].map((col) => (
                          <th
                            key={col}
                            className="px-4 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-5 sm:text-base"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tenantUsageRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-6 py-16 text-center text-lg font-semibold text-slate-500"
                          >
                            Tenant bazlı kayıt bulunamadı.
                          </td>
                        </tr>
                      ) : (
                        tenantUsageRows.map((row) => (
                          <tr
                            key={row.tenantId}
                            className="border-b border-slate-100/90 transition-colors hover:bg-white/60"
                          >
                            <td className="px-4 py-4 sm:px-5">
                              <p className="font-mono text-sm font-bold text-slate-800 sm:text-base">
                                {shortTenantId(row.tenantId)}
                              </p>
                              {row.isLegacy ? (
                                <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-950">
                                  Legacy
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 text-base font-black tabular-nums sm:px-5 sm:text-lg">
                              {row.users}
                            </td>
                            <td className="px-4 py-4 text-base font-black tabular-nums sm:px-5 sm:text-lg">
                              {row.clients}
                            </td>
                            <td className="px-4 py-4 text-base font-black tabular-nums sm:px-5 sm:text-lg">
                              {row.numerology}
                            </td>
                            <td className="px-4 py-4 text-base font-black tabular-nums sm:px-5 sm:text-lg">
                              {row.stones}
                            </td>
                            <td className="px-4 py-4 text-base font-black tabular-nums sm:px-5 sm:text-lg">
                              {row.archives}
                            </td>
                            <td className="px-4 py-4 text-base font-black tabular-nums text-fuchsia-950 sm:px-5 sm:text-lg">
                              {row.moduleTotal}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

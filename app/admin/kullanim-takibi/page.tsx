"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, Home, Loader2, Shield } from "lucide-react";
import { normalizeApprovalStatus, normalizeRole } from "@/lib/auth/yasamUser";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const LEGACY_TENANT_ID = "11111111-1111-1111-1111-111111111111";

const navLinkClass =
  "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-bold shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg md:h-16 md:w-auto md:px-8 md:text-lg";

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
};

function SummaryStatCard({
  label,
  value,
  tone,
  sublabel,
}: {
  label: string;
  value: number | string;
  tone: StatTone;
  sublabel?: string;
}) {
  return (
    <article
      className={`rounded-[28px] border-2 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-7 ${statToneClass[tone]}`}
    >
      <p className="text-sm font-black uppercase tracking-wide opacity-80 sm:text-base">{label}</p>
      <p className="mt-3 text-4xl font-black tabular-nums sm:text-5xl">{value}</p>
      {sublabel ? (
        <p className="mt-2 text-sm font-semibold opacity-75 sm:text-base">{sublabel}</p>
      ) : null}
    </article>
  );
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
  { key: "stones" as const, label: "Doğaltaş", tone: "cyan" as const },
  { key: "archives" as const, label: "Kişisel Arşiv", tone: "amber" as const },
];

export default function KullanimTakibiPage() {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [usersRes, clients, numerology, stones, archives] = await Promise.all([
      supabase.from("users").select("role, active, approval_status, tenant_id"),
      loadModuleMetrics("clients"),
      loadModuleMetrics("numerology_analyses"),
      loadModuleMetrics("stones"),
      loadModuleMetrics("personal_archives"),
    ]);

    const errors: string[] = [];
    if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);

    const users = (usersRes.data ?? []).map((row) =>
      mapUserRow(row as Record<string, unknown>),
    );

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

      <div className="relative z-10 w-full min-h-screen px-4 py-6 sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
        <nav
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          aria-label="Üst navigasyon"
        >
          <Link
            href="/admin"
            className={`${navLinkClass} border-violet-300/80 bg-gradient-to-r from-violet-100 to-indigo-100 text-violet-950 hover:border-violet-400 no-underline`}
          >
            <ArrowLeft className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
            Admin Paneline Dön
          </Link>
          <Link
            href="/"
            className={`${navLinkClass} border-emerald-300/80 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-950 hover:border-emerald-400 no-underline`}
          >
            <Home className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
            Ana Panele Dön
          </Link>
        </nav>

        <header className="relative mb-8 overflow-hidden rounded-[32px] border-2 border-white/80 bg-gradient-to-r from-slate-900 via-fuchsia-900 to-pink-800 px-6 py-8 text-white shadow-[0_28px_80px_rgba(192,38,211,0.2)] sm:px-10 sm:py-10">
          <div className="relative flex flex-wrap items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-lg ring-1 ring-white/25">
              <Database className="h-8 w-8 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black uppercase tracking-[0.35em] text-fuchsia-200/90">
                Admin · İzleme
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Kullanım Takibi
              </h1>
              <p className="mt-3 max-w-4xl text-base font-medium text-white/90 sm:text-lg">
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
            <section
              aria-label="Kullanıcı ve kayıt özeti"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              <SummaryStatCard label="Toplam kullanıcı" value={userStats.total} tone="indigo" />
              <SummaryStatCard label="Admin" value={userStats.adminCount} tone="violet" />
              <SummaryStatCard label="Uzman" value={userStats.expertCount} tone="fuchsia" />
              <SummaryStatCard label="Aktif kullanıcı" value={userStats.activeCount} tone="emerald" />
              <SummaryStatCard label="Pasif kullanıcı" value={userStats.passiveCount} tone="slate" />
              <SummaryStatCard label="Bekleyen kullanıcı" value={userStats.pendingCount} tone="amber" />
              <SummaryStatCard
                label="Toplam danışan"
                value={snapshot.clients.total}
                tone="cyan"
                sublabel={`${snapshot.clients.distinctTenants} tenant`}
              />
              <SummaryStatCard
                label="Toplam modül kaydı"
                value={totalModuleRecords}
                tone="rose"
                sublabel="Danışan + analiz + taş + arşiv"
              />
            </section>

            <section className="mt-10 w-full" aria-label="Tenant bazlı kullanım özeti">
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

              <div className="overflow-hidden rounded-[28px] border-2 border-white/90 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] border-collapse text-left">
                    <thead>
                      <tr className="border-b-2 border-slate-200/90 bg-gradient-to-r from-slate-50 via-fuchsia-50/80 to-pink-50/80">
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
                            className="border-b border-slate-100/90 hover:bg-fuchsia-50/30"
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

            <section className="mt-10" aria-label="Modül bazlı kayıt dağılımı">
              <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">
                Modül Bazlı Kayıt Dağılımı
              </h2>
              <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">
                Her modül için toplam kayıt ve tenant sayısı
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {MODULE_CARDS.map(({ key, label, tone }) => {
                  const mod = snapshot[key];
                  return (
                    <article
                      key={key}
                      className={`rounded-[28px] border-2 p-6 shadow-lg sm:p-7 ${statToneClass[tone]}`}
                    >
                      <p className="text-lg font-black sm:text-xl">{label}</p>
                      <p className="mt-4 text-4xl font-black tabular-nums sm:text-5xl">
                        {mod.total}
                      </p>
                      <p className="mt-3 text-sm font-bold opacity-80 sm:text-base">
                        {mod.distinctTenants} tenant · sayısal özet
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

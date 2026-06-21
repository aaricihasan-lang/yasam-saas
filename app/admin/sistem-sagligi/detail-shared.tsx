"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Shield } from "lucide-react";
import {
  formatCreatedAt,
  mapDbUser,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

export { formatCreatedAt };

export function formatUserStatus(user: ManagedUser): string {
  if (user.approvalStatus === "pending") return "Onay bekliyor";
  if (user.approvalStatus === "rejected") return "Reddedildi";
  if (!user.active) return "Pasif";
  return "Aktif";
}

export function statusBadgeClass(user: ManagedUser): string {
  if (user.approvalStatus === "pending") {
    return "bg-amber-100 text-amber-950 ring-amber-200";
  }
  if (user.approvalStatus === "rejected") {
    return "bg-rose-100 text-rose-950 ring-rose-200";
  }
  if (!user.active) {
    return "bg-slate-200 text-slate-800 ring-slate-300";
  }
  return "bg-emerald-100 text-emerald-950 ring-emerald-200";
}

export function mapUsersFromRows(rows: unknown[]): ManagedUser[] {
  return rows.map((row) => mapDbUser(row as Record<string, unknown>));
}

export function pickRecentUsers(users: ManagedUser[], limit = 10): ManagedUser[] {
  return [...users]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);
}

export const LEGACY_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export const navLinkClass =
  "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-bold shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg md:h-16 md:w-auto md:px-8 md:text-lg";

export type StatTone = "indigo" | "violet" | "emerald" | "amber" | "slate" | "rose" | "cyan";

export const statToneClass: Record<StatTone, string> = {
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
};

export type TenantIdCount = {
  id: string;
  count: number;
  isLegacy: boolean;
};

export function SummaryStatCard({
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

export function shortTenantId(id: string): string {
  if (id.length <= 22) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function buildTenantCounts(ids: (string | null)[]): TenantIdCount[] {
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

export async function fetchTableTotalCount(table: string): Promise<{
  total: number;
  error: string | null;
}> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    return { total: 0, error: error.message };
  }
  return { total: count ?? 0, error: null };
}

export async function fetchAllTenantIds(table: string): Promise<{
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

    if (error) {
      return { ids: [], error: error.message };
    }
    if (!data?.length) break;

    ids.push(...data.map((row) => (row as { tenant_id: string | null }).tenant_id));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { ids, error: null };
}

export async function loadTenantMetricSummary(table: string): Promise<{
  total: number;
  tenantRows: TenantIdCount[];
  distinctTenants: number;
  error: string | null;
}> {
  const [{ total, error: countError }, { ids, error: idsError }] = await Promise.all([
    fetchTableTotalCount(table),
    fetchAllTenantIds(table),
  ]);

  const error = countError ?? idsError;
  const tenantRows = buildTenantCounts(ids);

  return {
    total,
    tenantRows,
    distinctTenants: tenantRows.length,
    error,
  };
}

export async function probeSupabaseTable(table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return !error;
}

export function useSistemSagligiAdminGate() {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setChecked(true);
  }, []);

  return { checked, allowed };
}

export function AccessDeniedScreen() {
  return (
    <main className="relative min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 px-8 py-12">
      <div className="mx-auto max-w-lg rounded-[32px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl backdrop-blur-xl">
        <Shield className="mx-auto h-10 w-10 text-rose-600" />
        <h1 className="mt-4 text-2xl font-black text-slate-900">Erişim reddedildi</h1>
        <p className="mt-2 text-base text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    </main>
  );
}

export function LoadingScreen({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-600">
      <p className="text-lg font-semibold">{label}</p>
    </main>
  );
}

export function DetailLoadingPanel({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-white/80 bg-white/90 py-20 shadow-xl"
      role="status"
    >
      <Loader2 className="h-12 w-12 animate-spin text-emerald-600" aria-hidden />
      <p className="text-lg font-bold text-slate-600">{label}</p>
    </div>
  );
}

export function DetailErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <section className="rounded-[28px] border-2 border-rose-200/90 bg-gradient-to-r from-rose-50/95 via-white to-orange-50/90 p-8 shadow-xl">
      <p className="text-xl font-black text-rose-950">Veri yüklenemedi</p>
      <p className="mt-3 text-base font-medium text-rose-900/90">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl border-2 border-rose-300 bg-white px-8 text-base font-bold text-rose-950 transition hover:scale-[1.02]"
        >
          Tekrar dene
        </button>
      ) : null}
    </section>
  );
}

export function PremiumPlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[28px] border-2 border-violet-200/80 bg-gradient-to-r from-violet-50/95 via-white to-indigo-50/90 p-8 shadow-xl sm:p-10">
      <p className="text-xl font-black text-violet-950 sm:text-2xl">{title}</p>
      <p className="mt-3 text-base font-medium leading-relaxed text-violet-900/90 sm:text-lg">
        {description}
      </p>
    </section>
  );
}

export function DetailNav() {
  return null;
}

export function DetailHeader({
  title,
  description,
  gradient = "from-slate-900 via-emerald-900 to-teal-800",
}: {
  title: string;
  description: string;
  gradient?: string;
}) {
  return (
    <header
      className={`relative mb-8 overflow-hidden rounded-[32px] border-2 border-white/80 bg-gradient-to-r px-6 py-8 text-white shadow-[0_28px_80px_rgba(16,185,129,0.18)] sm:px-10 sm:py-10 ${gradient}`}
    >
      <p className="text-sm font-black uppercase tracking-[0.35em] text-emerald-200/90">
        Sistem Sağlığı · Detay
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
      <p className="mt-3 max-w-4xl text-base font-medium text-white/90 sm:text-lg">{description}</p>
    </header>
  );
}

export function SistemSagligiDetailShell({
  title,
  description,
  headerGradient,
  loading,
  loadingLabel,
  error,
  onRetry,
  tableBadge,
  children,
}: {
  title: string;
  description: string;
  headerGradient?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  tableBadge?: string;
  children?: ReactNode;
}) {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-cyan-200/15 blur-[120px]" />

      <div className="relative z-10 w-full min-h-screen px-4 py-6 sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
        <DetailNav />
        <DetailHeader title={title} description={description} gradient={headerGradient} />

        {tableBadge ? (
          <p className="-mt-4 mb-6 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-900">
            {tableBadge}
          </p>
        ) : null}

        {loading ? (
          <DetailLoadingPanel label={loadingLabel ?? "Veriler yükleniyor…"} />
        ) : error ? (
          <DetailErrorPanel message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </main>
  );
}

export function TenantBreakdownSection({
  title,
  subtitle,
  total,
  rows,
  emptyLabel = "Tenant kaydı yok.",
}: {
  title: string;
  subtitle: string;
  total: number;
  rows: TenantIdCount[];
  emptyLabel?: string;
}) {
  return (
    <section className="mt-8 w-full" aria-label={title}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">{title}</h2>
          <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">{subtitle}</p>
        </div>
        <p className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-bold text-indigo-900">
          {rows.length} tenant · {total} kayıt
        </p>
      </div>

      <div className="overflow-hidden rounded-[28px] border-2 border-white/90 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-slate-200/90 bg-gradient-to-r from-slate-50 via-indigo-50/80 to-violet-50/80">
                <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                  Tenant ID
                </th>
                <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                  Kayıt sayısı
                </th>
                <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                  Not
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-16 text-center text-lg font-semibold text-slate-500">
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100/90 transition-colors hover:bg-indigo-50/40"
                  >
                    <td className="px-5 py-5 font-mono text-base font-bold text-slate-800 sm:px-6 sm:text-lg">
                      {shortTenantId(row.id)}
                    </td>
                    <td className="px-5 py-5 text-base font-black tabular-nums text-slate-900 sm:px-6 sm:text-lg">
                      {row.count}
                    </td>
                    <td className="px-5 py-5 sm:px-6">
                      {row.isLegacy ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-950 ring-1 ring-amber-200">
                          Legacy tenant
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-950 ring-1 ring-emerald-200">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

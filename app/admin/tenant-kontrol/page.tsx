"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertOctagon,
  Home,
  Loader2,
  LogOut,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  readSessionToken,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const LEGACY_TENANT_ID = "11111111-1111-1111-1111-111111111111";

const AUDIT_TABLES = [
  "clients",
  "appointments",
  "numerology_analyses",
  "stones",
  "personal_archives",
] as const;

const LEGACY_CHECK_TABLES = [...AUDIT_TABLES, "users"] as const;

type AuditTableName = (typeof AUDIT_TABLES)[number];
type RiskStatus = "Güvenli" | "Kontrol Gerekli" | "Veri Karışma Riski";

type TenantIdCount = {
  id: string;
  count: number;
  isLegacy: boolean;
};

type TableAudit = {
  table: AuditTableName;
  total: number;
  hasTenantField: boolean;
  distinctTenants: number;
  nullTenantRows: number;
  legacyTenantRows: number;
  tenantList: TenantIdCount[];
  risk: RiskStatus;
  error?: string;
};

type LegacyTableUsage = {
  table: string;
  count: number;
};

type TenantSummary = {
  tenantId: string;
  tenantName: string | null;
  userCount: number;
  clientCount: number;
  analysisCount: number;
  isLegacy: boolean;
};

type AuditSnapshot = {
  audits: TableAudit[];
  legacyUsages: LegacyTableUsage[];
  tenantSummaries: TenantSummary[];
};

const panelClass =
  "rounded-2xl border border-white/80 bg-white/70 p-5 shadow-md backdrop-blur-sm sm:p-6";

const navBtn =
  "inline-flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border-2 px-4 sm:px-5 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

function shortTenantId(id: string): string {
  if (id.length <= 20) return id;
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

function computeTableRisk(
  total: number,
  hasTenantField: boolean,
  nullTenantRows: number,
  legacyTenantRows: number,
  error?: string,
): RiskStatus {
  if (error || !hasTenantField) return "Kontrol Gerekli";
  if (legacyTenantRows > 0) return "Veri Karışma Riski";
  if (total > 0 && nullTenantRows > 0) return "Kontrol Gerekli";
  return "Güvenli";
}

/** users.tenant_id listesi — güvenli admin API (tarayıcıdan publishable users okuması YOK) */
async function fetchUsersTenantIds(): Promise<{ ids: (string | null)[]; error: string | null }> {
  const adminId = readYasamUser()?.id;
  try {
    const res = await fetch("/api/admin/users-tenant-ids", { headers: adminHeaders(adminId) });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ids: [], error: j.error ?? `HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { ids?: (string | null)[] };
    return { ids: json.ids ?? [], error: null };
  } catch (err) {
    return { ids: [], error: err instanceof Error ? err.message : "users tenant_id alınamadı" };
  }
}

async function fetchAllTenantIds(
  table: string,
): Promise<{ ids: (string | null)[]; error: string | null }> {
  // users tablosu tarayıcıdan publishable ile okunmaz — güvenli admin API'ye yönlendir.
  if (table === "users") return fetchUsersTenantIds();

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

async function auditTable(table: AuditTableName): Promise<TableAudit> {
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (countError) {
    return {
      table,
      total: 0,
      hasTenantField: false,
      distinctTenants: 0,
      nullTenantRows: 0,
      legacyTenantRows: 0,
      tenantList: [],
      risk: "Kontrol Gerekli",
      error: countError.message,
    };
  }

  const total = count ?? 0;
  const { ids, error: tenantError } = await fetchAllTenantIds(table);

  if (tenantError) {
    return {
      table,
      total,
      hasTenantField: false,
      distinctTenants: 0,
      nullTenantRows: 0,
      legacyTenantRows: 0,
      tenantList: [],
      risk: "Kontrol Gerekli",
      error: tenantError,
    };
  }

  const tenantList = buildTenantCounts(ids);
  const nullTenantRows = ids.filter((id) => id == null || String(id).trim() === "").length;
  const legacyTenantRows =
    tenantList.find((t) => t.id === LEGACY_TENANT_ID)?.count ?? 0;

  return {
    table,
    total,
    hasTenantField: true,
    distinctTenants: tenantList.length,
    nullTenantRows,
    legacyTenantRows,
    tenantList,
    risk: computeTableRisk(total, true, nullTenantRows, legacyTenantRows),
  };
}

async function scanLegacyUsage(): Promise<LegacyTableUsage[]> {
  const usages: LegacyTableUsage[] = [];

  for (const table of LEGACY_CHECK_TABLES) {
    const { ids, error } = await fetchAllTenantIds(table);
    if (error) continue;
    const legacyCount = ids.filter((id) => String(id ?? "").trim() === LEGACY_TENANT_ID).length;
    if (legacyCount > 0) {
      usages.push({ table, count: legacyCount });
    }
  }

  return usages;
}

function aggregateCountsByTenant(
  ids: (string | null)[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const raw of ids) {
    if (raw == null || String(raw).trim() === "") continue;
    const id = String(raw).trim();
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

/** tenants id/name listesini admin service_role API'den çeker; supabase select ile aynı {data,error} şekli */
async function fetchTenantNames(): Promise<{
  data: { id: string; name: string | null }[] | null;
  error: { message: string } | null;
}> {
  try {
    const adminId = readYasamUser()?.id;
    const res = await fetch("/api/admin/tenants", {
      headers: adminHeaders(adminId),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { data: null, error: { message: j.error ?? `HTTP ${res.status}` } };
    }
    const json = (await res.json().catch(() => ({}))) as {
      tenants?: { id: string; name: string | null }[];
    };
    return { data: json.tenants ?? [], error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "tenants alınamadı" } };
  }
}

async function loadTenantSummaries(): Promise<TenantSummary[]> {
  const [usersRes, clientsRes, analysesRes, tenantsRes] = await Promise.all([
    fetchAllTenantIds("users"),
    fetchAllTenantIds("clients"),
    fetchAllTenantIds("numerology_analyses"),
    // tenants artık publishable key ile okunmaz — admin service_role API üzerinden gelir.
    fetchTenantNames(),
  ]);

  const tenantNames = new Map<string, string>();
  const allIds = new Set<string>();

  if (!tenantsRes.error && tenantsRes.data) {
    for (const row of tenantsRes.data) {
      const id = String((row as { id: string }).id).trim();
      const name = (row as { name?: string | null }).name;
      if (id) {
        tenantNames.set(id, name ? String(name) : "");
        allIds.add(id);
      }
    }
  }

  const usersMap = aggregateCountsByTenant(usersRes.ids);
  const clientsMap = aggregateCountsByTenant(clientsRes.ids);
  const analysesMap = aggregateCountsByTenant(analysesRes.ids);

  for (const id of usersMap.keys()) allIds.add(id);
  for (const id of clientsMap.keys()) allIds.add(id);
  for (const id of analysesMap.keys()) allIds.add(id);

  return Array.from(allIds)
    .map((tenantId) => ({
      tenantId,
      tenantName: tenantNames.get(tenantId) || null,
      userCount: usersMap.get(tenantId) ?? 0,
      clientCount: clientsMap.get(tenantId) ?? 0,
      analysisCount: analysesMap.get(tenantId) ?? 0,
      isLegacy: tenantId === LEGACY_TENANT_ID,
    }))
    .sort((a, b) => {
      if (a.isLegacy !== b.isLegacy) return a.isLegacy ? -1 : 1;
      const totalA = a.userCount + a.clientCount + a.analysisCount;
      const totalB = b.userCount + b.clientCount + b.analysisCount;
      return totalB - totalA;
    });
}

async function runFullAudit(): Promise<AuditSnapshot> {
  const [audits, legacyUsages, tenantSummaries] = await Promise.all([
    Promise.all(AUDIT_TABLES.map((table) => auditTable(table))),
    scanLegacyUsage(),
    loadTenantSummaries(),
  ]);

  return { audits, legacyUsages, tenantSummaries };
}

function TenantTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav className="sticky top-0 z-50 mb-6 grid gap-2 sm:grid-cols-2 sm:gap-3" aria-label="Üst navigasyon">
      <Link
        href="/"
        className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline`}
      >
        <Home className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
        Ana Panele Dön
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100`}
      >
        <LogOut className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
        Çıkış Yap
      </button>
    </nav>
  );
}

const riskStyles: Record<
  RiskStatus,
  { badge: string; icon: typeof ShieldCheck }
> = {
  Güvenli: {
    badge: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    icon: ShieldCheck,
  },
  "Kontrol Gerekli": {
    badge: "bg-amber-100 text-amber-950 ring-1 ring-amber-200",
    icon: ShieldAlert,
  },
  "Veri Karışma Riski": {
    badge: "bg-rose-100 text-rose-950 ring-1 ring-rose-200",
    icon: AlertOctagon,
  },
};

function RiskBadge({ risk }: { risk: RiskStatus }) {
  const { badge, icon: Icon } = riskStyles[risk];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${badge}`}
    >
      <Icon className="h-4 w-4" />
      {risk}
    </span>
  );
}

function RiskStatCards({
  safeCount,
  reviewCount,
  riskCount,
}: {
  safeCount: number;
  reviewCount: number;
  riskCount: number;
}) {
  const items = [
    {
      count: safeCount,
      label: "Güvenli kontrol",
      card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80",
      number: "text-emerald-950",
      text: "text-emerald-800",
    },
    {
      count: reviewCount,
      label: "Kontrol gerekli",
      card: "border-amber-200/80 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/80",
      number: "text-amber-950",
      text: "text-amber-900",
    },
    {
      count: riskCount,
      label: "Veri karışma riski",
      card: "border-rose-200/80 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/80",
      number: "text-rose-950",
      text: "text-rose-900",
    },
  ] as const;

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex flex-col justify-center rounded-2xl border p-4 shadow-md sm:p-5 ${item.card}`}
        >
          <p className={`text-3xl font-black ${item.number}`}>{item.count}</p>
          <p className={`mt-1.5 text-sm font-semibold ${item.text}`}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function RiskLegend() {
  return (
    <section
      className={`${panelClass} mb-4 border-slate-200/80 bg-white/70`}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Risk durumları
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <RiskBadge risk="Güvenli" />
        <RiskBadge risk="Kontrol Gerekli" />
        <RiskBadge risk="Veri Karışma Riski" />
      </div>
    </section>
  );
}

function LegacyBanner({ usages }: { usages: LegacyTableUsage[] }) {
  const inUse = usages.length > 0;
  return (
    <section
      className={`${panelClass} mb-4 ${
        inUse
          ? "border-rose-300/80 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/80"
          : "border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
            Eski sabit tenant
          </p>
          <p className="mt-2 font-mono text-base font-bold text-slate-800">{LEGACY_TENANT_ID}</p>
        </div>
        <RiskBadge risk={inUse ? "Veri Karışma Riski" : "Güvenli"} />
      </div>

      {inUse ? (
        <div className="mt-4">
          <p className="text-base font-bold text-rose-900">
            Bu eski demo tenant hâlâ kullanılıyor. Veriler karışık olabilir.
          </p>
          <ul className="mt-4 space-y-3">
            {usages.map((u) => (
              <li
                key={u.table}
                className="flex items-center justify-between rounded-2xl border border-rose-200/80 bg-white/80 px-4 py-3 text-base"
              >
                <span className="font-mono font-bold text-slate-800">{u.table}</span>
                <span className="font-black text-rose-800">{u.count} kayıt</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-base font-semibold text-emerald-800">
          Kontrol edilen tablolarda eski sabit tenant kullanılmıyor.
        </p>
      )}
    </section>
  );
}

function TenantSummaryCard({ summary }: { summary: TenantSummary }) {
  return (
    <article
      className={`rounded-2xl border bg-white/70 p-5 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-gradient-to-br sm:p-6 ${
        summary.isLegacy
          ? "border-rose-300/80 from-rose-50/90 via-white to-orange-50/70"
          : "border-violet-200/80 from-violet-50/90 via-white to-indigo-50/70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Tenant
          </p>
          <p className="mt-2 truncate font-mono text-base font-bold text-slate-900" title={summary.tenantId}>
            {shortTenantId(summary.tenantId)}
          </p>
          {summary.tenantName ? (
            <p className="mt-2 text-base font-semibold text-violet-800">{summary.tenantName}</p>
          ) : null}
        </div>
        {summary.isLegacy ? (
          <span className="shrink-0 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-md">
            Eski
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-2 py-3 text-center">
          <p className="text-2xl font-black text-indigo-950">{summary.userCount}</p>
          <p className="mt-0.5 text-xs font-bold uppercase text-indigo-700">Kullanıcı</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-2 py-3 text-center">
          <p className="text-2xl font-black text-blue-950">{summary.clientCount}</p>
          <p className="mt-0.5 text-xs font-bold uppercase text-blue-700">Danışan</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-2 py-3 text-center">
          <p className="text-2xl font-black text-amber-950">{summary.analysisCount}</p>
          <p className="mt-0.5 text-xs font-bold uppercase text-amber-700">Analiz</p>
        </div>
      </div>
    </article>
  );
}

function AuditCard({ audit }: { audit: TableAudit }) {
  const themes: Record<AuditTableName, { border: string; bg: string; icon: string }> = {
    clients: {
      border: "border-blue-200/80",
      bg: "from-blue-50/95 via-white to-sky-50/80",
      icon: "from-indigo-500 to-blue-600",
    },
    appointments: {
      border: "border-violet-200/80",
      bg: "from-violet-50/95 via-white to-fuchsia-50/80",
      icon: "from-violet-500 to-purple-600",
    },
    numerology_analyses: {
      border: "border-amber-200/80",
      bg: "from-amber-50/95 via-white to-orange-50/80",
      icon: "from-amber-500 to-orange-500",
    },
    stones: {
      border: "border-cyan-200/80",
      bg: "from-cyan-50/95 via-white to-teal-50/80",
      icon: "from-cyan-500 to-teal-500",
    },
    personal_archives: {
      border: "border-rose-200/80",
      bg: "from-rose-50/95 via-white to-pink-50/80",
      icon: "from-rose-500 to-fuchsia-600",
    },
  };

  const theme = themes[audit.table];

  return (
    <article
      className={`${panelClass} flex flex-col border bg-gradient-to-br ${theme.border} ${theme.bg}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${theme.icon}`}
        >
          <Shield className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <RiskBadge risk={audit.risk} />
      </div>

      <h3 className="mt-4 font-mono text-xl font-bold text-slate-900">{audit.table}</h3>

      <dl className="mt-4 flex-1 space-y-0 text-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 py-3.5">
          <dt className="font-semibold text-slate-600">Toplam kayıt</dt>
          <dd className="font-black text-slate-900">{audit.total.toLocaleString("tr-TR")}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 py-3.5">
          <dt className="font-semibold text-slate-600">tenant_id alanı</dt>
          <dd className="font-black text-slate-900">
            {audit.hasTenantField ? "Var" : "Yok / okunamadı"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 py-3.5">
          <dt className="font-semibold text-slate-600">Farklı tenant</dt>
          <dd className="font-black text-slate-900">{audit.distinctTenants}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 py-3.5">
          <dt className="font-semibold text-slate-600">Eski tenant kayıt</dt>
          <dd
            className={`font-black ${audit.legacyTenantRows > 0 ? "text-rose-700" : "text-emerald-700"}`}
          >
            {audit.legacyTenantRows}
          </dd>
        </div>
        {audit.total > 0 ? (
          <div className="flex items-center justify-between gap-4 py-3.5">
            <dt className="font-semibold text-slate-600">Boş tenant_id</dt>
            <dd
              className={`font-black ${audit.nullTenantRows > 0 ? "text-amber-700" : "text-emerald-700"}`}
            >
              {audit.nullTenantRows}
            </dd>
          </div>
        ) : null}
      </dl>

      {audit.tenantList.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Tenant listesi
          </p>
          <ul className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {audit.tenantList.map((t) => (
              <li
                key={t.id}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-md ring-1 ${
                  t.isLegacy
                    ? "bg-gradient-to-r from-rose-100 to-orange-100 text-rose-900 ring-rose-200/80"
                    : "bg-gradient-to-r from-violet-100 to-indigo-100 text-violet-900 ring-violet-200/80"
                }`}
                title={t.id}
              >
                <span className="max-w-[140px] truncate font-mono">
                  {shortTenantId(t.id)}
                  {t.isLegacy ? " · eski" : ""}
                </span>
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-sm font-black text-slate-800 shadow-sm">
                  {t.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {audit.error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {audit.error}
        </p>
      ) : null}
    </article>
  );
}

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-2) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function TenantKontrolPage() {
  useBfcacheRefresh();
  const router = useRouter();
  const { showToast } = useToast();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<AuditSnapshot | null>(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runFullAudit();
      setSnapshot(result);

      const red = result.audits.filter((r) => r.risk === "Veri Karışma Riski").length;
      const yellow = result.audits.filter((r) => r.risk === "Kontrol Gerekli").length;

      if (red > 0 || result.legacyUsages.length > 0) {
        showToast({
          title: "Kontrol tamamlandı",
          message: `${red} tabloda veri karışma riski tespit edildi.`,
          type: "error",
        });
      } else if (yellow > 0) {
        showToast({
          title: "Kontrol tamamlandı",
          message: `${yellow} tabloda inceleme gerekli.`,
          type: "warning",
        });
      }
    } catch (err) {
      console.error(err);
      showToast({
        title: "İşlem başarısız",
        message: "Denetim çalıştırılamadı.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void runAudit();
  }, [sessionChecked, allowed, runAudit]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  const audits = snapshot?.audits ?? [];
  const safeCount = audits.filter((a) => a.risk === "Güvenli").length;
  const reviewCount = audits.filter((a) => a.risk === "Kontrol Gerekli").length;
  const riskCount = audits.filter((a) => a.risk === "Veri Karışma Riski").length;

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black">Erişim reddedildi</h1>
          <p className="mt-2 text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
          <Link href="/" className="mt-6 inline-block font-black text-violet-700 no-underline">
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-rose-200/20 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <TenantTopNav onLogout={handleLogout} />

        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-teal-900 to-slate-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(15,23,42,0.18)] sm:px-8 sm:py-7">
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-white/90" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-teal-200/80">
                  Admin · Güvenlik
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                  Tenant Güvenlik Kontrolü
                </h1>
                <p className="mt-1 text-sm font-medium text-white/70">
                  Tenant ayrımı, eski demo tenant kullanımı ve kayıt dağılımı
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runAudit()}
              disabled={loading}
              className="self-start shrink-0 inline-flex h-9 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white/90 transition hover:bg-white/20 disabled:opacity-50 sm:self-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Yenile
            </button>
          </div>
        </header>

        {loading ? (
          <div className={`${panelClass} border-slate-200/80`}>
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
              <p className="text-base font-bold text-slate-600">Tablolar taranıyor…</p>
            </div>
          </div>
        ) : snapshot ? (
          <>
            {!loading && audits.length > 0 ? (
              <RiskStatCards
                safeCount={safeCount}
                reviewCount={reviewCount}
                riskCount={riskCount}
              />
            ) : null}

            <RiskLegend />

            <LegacyBanner usages={snapshot.legacyUsages} />

            {snapshot.tenantSummaries.length > 0 ? (
              <section className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">Tenant özeti</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Kullanıcı, danışan ve numeroloji analiz sayıları tenant bazında
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {snapshot.tenantSummaries.map((summary) => (
                    <TenantSummaryCard key={summary.tenantId} summary={summary} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="text-lg font-bold text-slate-900">Tablo denetimi</h2>
              <p className="mt-1 text-sm text-slate-600">
                Tablo bazında tenant dağılımı ve risk durumu
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {audits.map((audit) => (
                  <AuditCard key={audit.table} audit={audit} />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

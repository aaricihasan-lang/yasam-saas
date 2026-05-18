"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertOctagon,
  Loader2,
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
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px]";

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

async function fetchAllTenantIds(
  table: string,
): Promise<{ ids: (string | null)[]; error: string | null }> {
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

async function loadTenantSummaries(): Promise<TenantSummary[]> {
  const [usersRes, clientsRes, analysesRes, tenantsRes] = await Promise.all([
    fetchAllTenantIds("users"),
    fetchAllTenantIds("clients"),
    fetchAllTenantIds("numerology_analyses"),
    supabase.from("tenants").select("id, name"),
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
    <nav className="sticky top-0 z-50 mb-8 grid gap-3 sm:grid-cols-2" aria-label="Üst navigasyon">
      <Link
        href="/"
        className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline`}
      >
        <span className="text-xl" aria-hidden>
          🏠
        </span>
        Ana Panele Dön
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100`}
      >
        <span className="text-xl" aria-hidden>
          🚪
        </span>
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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${badge}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {risk}
    </span>
  );
}

function RiskLegend() {
  return (
    <div
      className={`${panelClass} mb-6 border-slate-200/80 bg-gradient-to-r from-white/95 via-violet-50/40 to-white/95 py-4`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        Risk durumları
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <RiskBadge risk="Güvenli" />
        <RiskBadge risk="Kontrol Gerekli" />
        <RiskBadge risk="Veri Karışma Riski" />
      </div>
    </div>
  );
}

function LegacyBanner({ usages }: { usages: LegacyTableUsage[] }) {
  const inUse = usages.length > 0;
  return (
    <section
      className={`${panelClass} mb-6 ${
        inUse
          ? "border-rose-300/80 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/80"
          : "border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-600">
            Eski sabit tenant
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-800">{LEGACY_TENANT_ID}</p>
        </div>
        <RiskBadge risk={inUse ? "Veri Karışma Riski" : "Güvenli"} />
      </div>

      {inUse ? (
        <div className="mt-4">
          <p className="text-sm font-bold text-rose-900">
            Bu eski demo tenant hâlâ kullanılıyor. Veriler karışık olabilir.
          </p>
          <ul className="mt-3 space-y-2">
            {usages.map((u) => (
              <li
                key={u.table}
                className="flex items-center justify-between rounded-xl border border-rose-200/80 bg-white/80 px-3 py-2 text-sm"
              >
                <span className="font-mono font-bold text-slate-800">{u.table}</span>
                <span className="font-black text-rose-800">{u.count} kayıt</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-emerald-800">
          Kontrol edilen tablolarda eski sabit tenant kullanılmıyor.
        </p>
      )}
    </section>
  );
}

function TenantSummaryCard({ summary }: { summary: TenantSummary }) {
  return (
    <article
      className={`${panelClass} border bg-gradient-to-br ${
        summary.isLegacy
          ? "border-rose-300/80 from-rose-50/90 via-white to-orange-50/70"
          : "border-violet-200/80 from-violet-50/90 via-white to-indigo-50/70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Tenant
          </p>
          <p className="mt-1 truncate font-mono text-sm font-bold text-slate-900" title={summary.tenantId}>
            {shortTenantId(summary.tenantId)}
          </p>
          {summary.tenantName ? (
            <p className="mt-1 text-sm font-semibold text-violet-800">{summary.tenantName}</p>
          ) : null}
        </div>
        {summary.isLegacy ? (
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 ring-1 ring-rose-200">
            Eski
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-2 py-3 text-center">
          <p className="text-lg font-black text-indigo-950">{summary.userCount}</p>
          <p className="text-[10px] font-bold uppercase text-indigo-700">Kullanıcı</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-2 py-3 text-center">
          <p className="text-lg font-black text-blue-950">{summary.clientCount}</p>
          <p className="text-[10px] font-bold uppercase text-blue-700">Danışan</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-2 py-3 text-center">
          <p className="text-lg font-black text-amber-950">{summary.analysisCount}</p>
          <p className="text-[10px] font-bold uppercase text-amber-700">Analiz</p>
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
      className={`${panelClass} border bg-gradient-to-br ${theme.border} ${theme.bg}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${theme.icon}`}
        >
          <Shield className="h-6 w-6" strokeWidth={2.25} />
        </div>
        <RiskBadge risk={audit.risk} />
      </div>

      <h3 className="mt-4 font-mono text-lg font-black text-slate-900">{audit.table}</h3>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="font-semibold text-slate-600">Toplam kayıt</dt>
          <dd className="font-black text-slate-900">{audit.total.toLocaleString("tr-TR")}</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="font-semibold text-slate-600">tenant_id alanı</dt>
          <dd className="font-black text-slate-900">
            {audit.hasTenantField ? "Var" : "Yok / okunamadı"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="font-semibold text-slate-600">Farklı tenant</dt>
          <dd className="font-black text-slate-900">{audit.distinctTenants}</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="font-semibold text-slate-600">Eski tenant kayıt</dt>
          <dd
            className={`font-black ${audit.legacyTenantRows > 0 ? "text-rose-700" : "text-emerald-700"}`}
          >
            {audit.legacyTenantRows}
          </dd>
        </div>
        {audit.total > 0 ? (
          <div className="flex justify-between gap-3">
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
        <div className="mt-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Tenant listesi
          </p>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white/70 p-2">
            {audit.tenantList.map((t) => (
              <li
                key={t.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${
                  t.isLegacy ? "bg-rose-50 ring-1 ring-rose-100" : "bg-slate-50"
                }`}
              >
                <span className="min-w-0 truncate font-mono font-semibold text-slate-800" title={t.id}>
                  {shortTenantId(t.id)}
                  {t.isLegacy ? " (eski)" : ""}
                </span>
                <span className="shrink-0 font-black text-slate-700">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {audit.error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {audit.error}
        </p>
      ) : null}
    </article>
  );
}

export default function TenantKontrolPage() {
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
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
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
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-teal-200/15 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <TenantTopNav onLogout={handleLogout} />

        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-700">
            Admin · Güvenlik
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Tenant Güvenlik Kontrolü
          </h1>
          <p className="mt-2 text-base font-medium text-slate-600 sm:text-lg">
            Tenant ayrımı, eski demo tenant kullanımı ve kayıt dağılımı
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="text-sm font-black text-violet-700 no-underline hover:text-violet-900"
            >
              ← Admin Yönetim Merkezi
            </Link>
            <button
              type="button"
              onClick={() => void runAudit()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-900 transition hover:bg-violet-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Yenile
            </button>
          </div>
        </header>

        {loading ? (
          <div className={`${panelClass} border-slate-200/80`}>
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
              <p className="text-sm font-bold text-slate-600">Tablolar taranıyor…</p>
            </div>
          </div>
        ) : snapshot ? (
          <>
            {!loading && audits.length > 0 ? (
              <div className="mb-6 flex flex-wrap gap-3">
                <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-black text-emerald-900 ring-1 ring-emerald-200">
                  Güvenli: {safeCount}
                </span>
                <span className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-black text-amber-950 ring-1 ring-amber-200">
                  Kontrol gerekli: {reviewCount}
                </span>
                <span className="rounded-full bg-rose-100 px-4 py-1.5 text-sm font-black text-rose-950 ring-1 ring-rose-200">
                  Veri karışma: {riskCount}
                </span>
              </div>
            ) : null}

            <RiskLegend />

            <LegacyBanner usages={snapshot.legacyUsages} />

            {snapshot.tenantSummaries.length > 0 ? (
              <section className="mb-8">
                <h2 className="text-lg font-black text-slate-900">Tenant özeti</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Kullanıcı, danışan ve numeroloji analiz sayıları tenant bazında
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {snapshot.tenantSummaries.map((summary) => (
                    <TenantSummaryCard key={summary.tenantId} summary={summary} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="mb-4 text-lg font-black text-slate-900">Tablo denetimi</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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

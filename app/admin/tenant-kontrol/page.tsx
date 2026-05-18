"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const AUDIT_TABLES = [
  "clients",
  "appointments",
  "numerology_analyses",
  "stones",
  "personal_archives",
] as const;

type AuditTableName = (typeof AUDIT_TABLES)[number];
type RiskStatus = "Güvenli" | "Kontrol Gerekli";

type TableAudit = {
  table: AuditTableName;
  total: number;
  hasTenantField: boolean;
  distinctTenants: number;
  nullTenantRows: number;
  risk: RiskStatus;
  error?: string;
};

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px]";

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
      risk: "Kontrol Gerekli",
      error: tenantError,
    };
  }

  const nullTenantRows = ids.filter((id) => id == null || String(id).trim() === "").length;
  const distinctTenants = new Set(
    ids
      .filter((id) => id != null && String(id).trim() !== "")
      .map((id) => String(id).trim()),
  ).size;

  const hasTenantField = true;
  const risk: RiskStatus =
    total > 0 && nullTenantRows > 0 ? "Kontrol Gerekli" : "Güvenli";

  return {
    table,
    total,
    hasTenantField,
    distinctTenants,
    nullTenantRows,
    risk,
  };
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

function RiskBadge({ risk }: { risk: RiskStatus }) {
  const safe = risk === "Güvenli";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
        safe
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
          : "bg-amber-100 text-amber-950 ring-1 ring-amber-200"
      }`}
    >
      {safe ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
      {risk}
    </span>
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
          <dt className="font-semibold text-slate-600">Farklı tenant sayısı</dt>
          <dd className="font-black text-slate-900">{audit.distinctTenants}</dd>
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
  const [audits, setAudits] = useState<TableAudit[]>([]);

  const runAudit = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(AUDIT_TABLES.map((table) => auditTable(table)));
    setAudits(results);
    setLoading(false);

    const issues = results.filter((r) => r.risk === "Kontrol Gerekli").length;
    if (issues > 0) {
      showToast({
        title: "Kontrol tamamlandı",
        message: `${issues} tabloda inceleme gerekli.`,
        type: "warning",
      });
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

  const safeCount = audits.filter((a) => a.risk === "Güvenli").length;
  const reviewCount = audits.filter((a) => a.risk === "Kontrol Gerekli").length;

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

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <TenantTopNav onLogout={handleLogout} />

        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-700">
            Admin · Güvenlik
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Tenant Güvenlik Kontrolü
          </h1>
          <p className="mt-2 text-base font-medium text-slate-600 sm:text-lg">
            Modül tablolarında tenant_id ayrımı ve kayıt dağılımı özeti
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

        {!loading && audits.length > 0 ? (
          <div className="mb-6 flex flex-wrap gap-3">
            <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-black text-emerald-900 ring-1 ring-emerald-200">
              Güvenli: {safeCount}
            </span>
            <span className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-black text-amber-950 ring-1 ring-amber-200">
              Kontrol gerekli: {reviewCount}
            </span>
          </div>
        ) : null}

        {loading ? (
          <div className={`${panelClass} border-slate-200/80`}>
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
              <p className="text-sm font-bold text-slate-600">Tablolar taranıyor…</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {audits.map((audit) => (
              <AuditCard key={audit.table} audit={audit} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

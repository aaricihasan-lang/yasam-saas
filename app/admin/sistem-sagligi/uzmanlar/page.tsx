"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  AccessDeniedScreen,
  formatCreatedAt,
  formatUserStatus,
  listCoverageLabel,
  LoadingScreen,
  loadNewestMembers,
  SistemSagligiDetailShell,
  statusBadgeClass,
  SummaryStatCard,
  useSistemSagligiAdminGate,
} from "../detail-shared";
import type { ManagedUser } from "@/lib/admin/userManagement";
import type { MemberCounts } from "@/lib/admin/memberListQuery";

/** GLOBAL sayaçlardan (liste uzunluğundan DEĞİL) ayrık ve tam uzman sınıfları. */
function computeExpertStats(c: MemberCounts) {
  return {
    total: c.experts_total,
    active: c.approved_active,
    pending: c.pending,
    archived: c.archived,
    rejected: c.rejected,
  };
}

export default function SistemSagligiUzmanlarPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentExperts, setRecentExperts] = useState<ManagedUser[]>([]);
  const [expertTotal, setExpertTotal] = useState(0);
  const [counts, setCounts] = useState<MemberCounts | null>(null);

  const loadExperts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Uzman rolü; üyeler + arşiv görünümleri birlikte → tüm uzmanlar içinden en yeni 10 kayıt.
    const result = await loadNewestMembers({ role: "expert" }, ["members", "archive"], 10);
    if (!result.ok) {
      setLoadError(result.error);
      setRecentExperts([]);
      setCounts(null);
      setLoading(false);
      return;
    }
    setRecentExperts(result.users);
    setExpertTotal(result.total);
    setCounts(result.counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadExperts();
  }, [checked, allowed, loadExperts]);

  const stats = useMemo(() => (counts ? computeExpertStats(counts) : null), [counts]);

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <SistemSagligiDetailShell
      title="Aktif Uzman"
      description="Uzman rolündeki hesapların yönetimsel özeti — yalnızca users tablosu alanları."
      headerGradient="from-slate-900 via-sky-900 to-indigo-800"
      loading={loading}
      loadingLabel="Uzman verileri yükleniyor…"
      error={loadError ?? (stats ? null : "Üye verileri alınamadı. Lütfen tekrar deneyin.")}
      onRetry={() => void loadExperts()}
      tableBadge={stats ? `${stats.total} uzman · users tablosu` : undefined}
    >
      {stats ? (
        <section
          aria-label="Uzman özeti"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          <SummaryStatCard label="Toplam uzman" value={stats.total} tone="indigo" />
          <SummaryStatCard label="Aktif uzman" value={stats.active} tone="emerald" />
          <SummaryStatCard label="Onay bekleyen uzman" value={stats.pending} tone="amber" />
          <SummaryStatCard label="Pasif + Arşiv uzman" value={stats.archived} tone="slate" />
          <SummaryStatCard label="Reddedilen uzman" value={stats.rejected} tone="rose" />
        </section>
      ) : null}

      <section className="mt-8 w-full" aria-label="Son uzman kayıtları">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">Son 10 uzman</h2>
            <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">
              En son oluşturulan uzman hesapları
            </p>
          </div>
          <p
            data-list-coverage
            className="rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5 text-sm font-bold text-sky-900"
          >
            {listCoverageLabel(recentExperts.length, expertTotal)}
          </p>
        </div>

        <div className="overflow-hidden rounded-[28px] border-2 border-white/90 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-slate-200/90 bg-gradient-to-r from-slate-50 via-sky-50/80 to-indigo-50/80">
                  {["Ad / İsim", "E-posta", "Paket", "Durum", "Oluşturulma"].map((col) => (
                    <th
                      key={col}
                      className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentExperts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center text-lg font-semibold text-slate-500"
                    >
                      Uzman kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  recentExperts.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-100/90 hover:bg-sky-50/40"
                    >
                      <td className="px-5 py-5 sm:px-6">
                        <p className="text-base font-black text-slate-900 sm:text-lg">
                          {user.fullName}
                        </p>
                      </td>
                      <td className="px-5 py-5 text-base font-medium text-slate-700 sm:px-6 sm:text-lg">
                        {user.email || "—"}
                      </td>
                      <td className="px-5 py-5 sm:px-6">
                        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-950 ring-1 ring-amber-200">
                          {user.membershipDisplay.packageLabel}
                        </span>
                      </td>
                      <td className="px-5 py-5 sm:px-6">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-sm font-black ring-1 ${statusBadgeClass(user)}`}
                        >
                          {formatUserStatus(user)}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-base font-semibold text-slate-700 sm:px-6 sm:text-lg">
                        {formatCreatedAt(user.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </SistemSagligiDetailShell>
  );
}

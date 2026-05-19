"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessDeniedScreen,
  formatCreatedAt,
  formatUserStatus,
  LoadingScreen,
  mapUsersFromRows,
  pickRecentUsers,
  SistemSagligiDetailShell,
  statusBadgeClass,
  SummaryStatCard,
  useSistemSagligiAdminGate,
} from "../detail-shared";
import type { ManagedUser } from "@/lib/admin/userManagement";
import { supabase } from "@/lib/supabase";

function computeExpertStats(experts: ManagedUser[]) {
  const total = experts.length;
  const active = experts.filter(
    (u) => u.active && u.approvalStatus === "approved",
  ).length;
  const pending = experts.filter((u) => u.approvalStatus === "pending").length;
  const passive = experts.filter(
    (u) => !u.active || u.approvalStatus === "rejected",
  ).length;
  return { total, active, pending, passive };
}

export default function SistemSagligiUzmanlarPage() {
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [experts, setExperts] = useState<ManagedUser[]>([]);

  const loadExperts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "expert")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Sistem sağlığı uzman listesi:", error);
      setLoadError(error.message);
      setExperts([]);
      setLoading(false);
      return;
    }

    setExperts(mapUsersFromRows(data ?? []));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadExperts();
  }, [checked, allowed, loadExperts]);

  const stats = useMemo(() => computeExpertStats(experts), [experts]);
  const recentExperts = useMemo(() => pickRecentUsers(experts, 10), [experts]);

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <SistemSagligiDetailShell
      title="Aktif Uzman"
      description="Uzman rolündeki hesapların yönetimsel özeti — yalnızca users tablosu alanları."
      headerGradient="from-slate-900 via-sky-900 to-indigo-800"
      loading={loading}
      loadingLabel="Uzman verileri yükleniyor…"
      error={loadError}
      onRetry={() => void loadExperts()}
      tableBadge={`${experts.length} uzman · users tablosu`}
    >
      <section
        aria-label="Uzman özeti"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryStatCard label="Toplam uzman" value={stats.total} tone="indigo" />
        <SummaryStatCard label="Aktif uzman" value={stats.active} tone="emerald" />
        <SummaryStatCard label="Bekleyen uzman" value={stats.pending} tone="amber" />
        <SummaryStatCard label="Pasif uzman" value={stats.passive} tone="slate" />
      </section>

      <section className="mt-8 w-full" aria-label="Son uzman kayıtları">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">Son 10 uzman</h2>
          <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">
            En son oluşturulan uzman hesapları
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

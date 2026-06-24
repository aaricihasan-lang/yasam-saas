"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
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
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-2) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function SistemSagligiBekleyenlerPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingUsers, setPendingUsers] = useState<ManagedUser[]>([]);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const adminId = readYasamUser()?.id;
    const res = await fetch("/api/admin/users", {
      headers: adminHeaders(adminId),
    });

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      console.error("Sistem sağlığı bekleyen kullanıcılar:", j.error);
      setLoadError(j.error ?? `HTTP ${res.status}`);
      setPendingUsers([]);
      setLoading(false);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as { users?: Record<string, unknown>[] };
    const rows = (json.users ?? []).filter(
      (u) => (u as { approval_status?: string }).approval_status === "pending",
    );
    const mapped = mapUsersFromRows(rows);
    setPendingUsers(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadPending();
  }, [checked, allowed, loadPending]);

  const expertPending = useMemo(
    () => pendingUsers.filter((u) => u.role === "expert").length,
    [pendingUsers],
  );
  const recentPending = useMemo(() => pickRecentUsers(pendingUsers, 10), [pendingUsers]);

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <SistemSagligiDetailShell
      title="Pasif / Bekleyen Kullanıcı"
      description="Onay bekleyen hesaplar — yalnızca users tablosundaki yönetimsel bilgiler."
      headerGradient="from-slate-900 via-amber-900 to-orange-800"
      loading={loading}
      loadingLabel="Bekleyen kullanıcılar yükleniyor…"
      error={loadError}
      onRetry={() => void loadPending()}
      tableBadge={`${pendingUsers.length} bekleyen · approval_status=pending`}
    >
      <section
        aria-label="Bekleyen özet"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <SummaryStatCard label="Toplam bekleyen" value={pendingUsers.length} tone="amber" />
        <SummaryStatCard label="Bekleyen uzman" value={expertPending} tone="violet" />
        <SummaryStatCard
          label="Bekleyen diğer roller"
          value={pendingUsers.length - expertPending}
          tone="slate"
        />
      </section>

      <section className="mt-8 w-full" aria-label="Bekleyen kullanıcı listesi">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">
            Son 10 bekleyen kayıt
          </h2>
          <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">
            Onay bekleyen hesaplar — özel içerik gösterilmez
          </p>
        </div>

        <div className="overflow-hidden rounded-[28px] border-2 border-white/90 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-slate-200/90 bg-gradient-to-r from-slate-50 via-amber-50/80 to-orange-50/80">
                  {["Ad / İsim", "E-posta", "Rol", "Paket", "Durum", "Oluşturulma"].map((col) => (
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
                {recentPending.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-16 text-center text-lg font-semibold text-slate-500"
                    >
                      Bekleyen kullanıcı yok.
                    </td>
                  </tr>
                ) : (
                  recentPending.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-100/90 hover:bg-amber-50/40"
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
                        <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-sm font-black text-violet-950 ring-1 ring-violet-200">
                          {user.role === "admin" ? "Admin" : "Uzman"}
                        </span>
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

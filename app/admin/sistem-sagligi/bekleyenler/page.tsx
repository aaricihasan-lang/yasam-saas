"use client";

import Link from "next/link";
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

type MemberList = { users: ManagedUser[]; total: number };

function MemberTable({
  title,
  subtitle,
  list,
  emptyLabel,
  fullListHref,
  dataList,
}: {
  title: string;
  subtitle: string;
  list: MemberList;
  emptyLabel: string;
  fullListHref: string;
  dataList: string;
}) {
  return (
    <section className="mt-8 w-full" aria-label={title} data-member-list={dataList}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">{title}</h2>
          <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p
            data-list-coverage
            className="rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-bold text-amber-900"
          >
            {listCoverageLabel(list.users.length, list.total)}
          </p>
          {list.total > list.users.length ? (
            <Link
              href={fullListHref}
              className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-bold text-slate-700 no-underline shadow-sm hover:bg-slate-50"
            >
              Tümünü Üye Yönetimi&apos;nde gör →
            </Link>
          ) : null}
        </div>
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
              {list.users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-lg font-semibold text-slate-500"
                  >
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                list.users.map((user) => (
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
  );
}

export default function SistemSagligiBekleyenlerPage() {
  useBfcacheRefresh();
  const { checked, allowed } = useSistemSagligiAdminGate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<MemberList>({ users: [], total: 0 });
  const [archived, setArchived] = useState<MemberList>({ users: [], total: 0 });
  const [counts, setCounts] = useState<MemberCounts | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Onay bekleyenler arşivde olamaz (arşiv = onaylı + pasif) → yalnız "members" görünümü.
    const [pendingResult, archiveResult] = await Promise.all([
      loadNewestMembers({ approval: "pending" }, ["members"], 10),
      loadNewestMembers({}, ["archive"], 10),
    ]);
    if (!pendingResult.ok || !archiveResult.ok) {
      setLoadError(pendingResult.ok ? (archiveResult.ok ? null : archiveResult.error) : pendingResult.error);
      setPending({ users: [], total: 0 });
      setArchived({ users: [], total: 0 });
      setCounts(null);
      setLoading(false);
      return;
    }
    setPending({ users: pendingResult.users, total: pendingResult.total });
    setArchived({ users: archiveResult.users, total: archiveResult.total });
    setCounts(pendingResult.counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadPending();
  }, [checked, allowed, loadPending]);

  /** GLOBAL sayaçlar — ana Sistem Sağlığı kartıyla aynı tanım (onay bekleyen + arşiv). */
  const stats = useMemo(
    () =>
      counts
        ? { combined: counts.pending + counts.archived, pending: counts.pending, archived: counts.archived }
        : null,
    [counts],
  );

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <SistemSagligiDetailShell
      title="Pasif / Bekleyen Kullanıcı"
      description="Onay bekleyen, pasif ve arşivdeki hesaplar — yalnızca users tablosundaki yönetimsel bilgiler."
      headerGradient="from-slate-900 via-amber-900 to-orange-800"
      loading={loading}
      loadingLabel="Bekleyen kullanıcılar yükleniyor…"
      error={loadError ?? (stats ? null : "Üye verileri alınamadı. Lütfen tekrar deneyin.")}
      onRetry={() => void loadPending()}
    >
      {stats ? (
        <section
          aria-label="Bekleyen özet"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <SummaryStatCard label="Pasif + bekleyen uzman" value={stats.combined} tone="amber" />
          <SummaryStatCard label="Onay bekleyen uzman" value={stats.pending} tone="violet" />
          <SummaryStatCard label="Pasif + Arşiv uzman" value={stats.archived} tone="slate" />
        </section>
      ) : null}

      <MemberTable
        title="Son 10 onay bekleyen kayıt"
        subtitle="Onay bekleyen hesaplar — özel içerik gösterilmez"
        list={pending}
        emptyLabel="Bekleyen kullanıcı yok."
        fullListHref="/admin/users?approval=pending"
        dataList="pending"
      />
      <MemberTable
        title="Son 10 pasif + arşiv kayıt"
        subtitle="Onaylı ancak girişi kapalı (pasif veya arşivdeki) uzman hesapları"
        list={archived}
        emptyLabel="Pasif veya arşivdeki kullanıcı yok."
        fullListHref="/admin/users?view=archive"
        dataList="archived"
      />
    </SistemSagligiDetailShell>
  );
}

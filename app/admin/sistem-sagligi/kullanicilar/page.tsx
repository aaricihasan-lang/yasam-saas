"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, Loader2, Shield } from "lucide-react";
import {
  formatCreatedAt,
  mapDbUser,
  type ManagedUser,
  type ManagedUserRole,
} from "@/lib/admin/userManagement";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const navLinkClass =
  "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-bold shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg md:h-16 md:w-auto md:px-8 md:text-lg";

type StatTone = "indigo" | "violet" | "emerald" | "amber" | "slate" | "rose";

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
};

function SummaryStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: StatTone;
}) {
  return (
    <article
      className={`rounded-[28px] border-2 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:p-7 ${statToneClass[tone]}`}
    >
      <p className="text-sm font-black uppercase tracking-wide opacity-80 sm:text-base">{label}</p>
      <p className="mt-3 text-4xl font-black tabular-nums sm:text-5xl">{value}</p>
    </article>
  );
}

function roleLabel(role: ManagedUserRole): string {
  return role === "admin" ? "Admin" : "Uzman";
}

function formatUserStatus(user: ManagedUser): string {
  if (user.approvalStatus === "pending") return "Onay bekliyor";
  if (user.approvalStatus === "rejected") return "Reddedildi";
  if (!user.active) return "Pasif";
  return "Aktif";
}

function statusBadgeClass(user: ManagedUser): string {
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

function roleBadgeClass(role: ManagedUserRole): string {
  return role === "admin"
    ? "bg-violet-100 text-violet-950 ring-violet-200"
    : "bg-sky-100 text-sky-950 ring-sky-200";
}

function computeStats(users: ManagedUser[]) {
  const total = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const activeExpertCount = users.filter(
    (u) => u.role === "expert" && u.active && u.approvalStatus === "approved",
  ).length;
  const pendingCount = users.filter((u) => u.approvalStatus === "pending").length;
  const passiveCount = users.filter(
    (u) => !u.active || u.approvalStatus === "rejected",
  ).length;

  return { total, adminCount, activeExpertCount, pendingCount, passiveCount };
}

function pickLastUsers(users: ManagedUser[], limit = 10): ManagedUser[] {
  return [...users]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);
}

export default function SistemSagligiKullanicilarPage() {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Sistem sağlığı kullanıcı listesi:", error);
      setLoadError(error.message);
      setUsers([]);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((row) =>
      mapDbUser(row as Record<string, unknown>),
    );
    setUsers(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!checked || !allowed) return;
    void loadUsers();
  }, [checked, allowed, loadUsers]);

  const stats = useMemo(() => computeStats(users), [users]);
  const lastUsers = useMemo(() => pickLastUsers(users, 10), [users]);

  if (!checked) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-600">
        <p className="text-lg font-semibold">Yükleniyor…</p>
      </main>
    );
  }

  if (!allowed) {
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

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-cyan-200/15 blur-[120px]" />

      <div className="relative z-10 w-full min-h-screen px-4 py-6 sm:px-6 sm:py-8 xl:px-10 2xl:px-14">
        <nav
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          aria-label="Detay navigasyonu"
        >
          <Link
            href="/admin"
            className={`${navLinkClass} border-violet-300/80 bg-gradient-to-r from-violet-100 to-indigo-100 text-violet-950 hover:border-violet-400 no-underline`}
          >
            <ArrowLeft className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
            Admin Paneline Dön
          </Link>
          <Link
            href="/admin/sistem-sagligi"
            className={`${navLinkClass} border-emerald-300/80 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-950 hover:border-emerald-400 no-underline`}
          >
            <Activity className="h-5 w-5 shrink-0 md:h-6 md:w-6" strokeWidth={2.25} aria-hidden />
            Sistem Sağlığına Dön
          </Link>
        </nav>

        <header className="relative mb-8 overflow-hidden rounded-[32px] border-2 border-white/80 bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 px-6 py-8 text-white shadow-[0_28px_80px_rgba(16,185,129,0.18)] sm:px-10 sm:py-10">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-emerald-200/90">
            Sistem Sağlığı · Detay
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Toplam Kullanıcı
          </h1>
          <p className="mt-3 max-w-4xl text-base font-medium text-white/90 sm:text-lg">
            Platformdaki kayıtlı kullanıcıların yönetimsel özeti — yalnızca hesap bilgileri
            listelenir.
          </p>
        </header>

        {loading ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-white/80 bg-white/90 py-20 shadow-xl"
            role="status"
          >
            <Loader2 className="h-12 w-12 animate-spin text-emerald-600" aria-hidden />
            <p className="text-lg font-bold text-slate-600">Kullanıcı verileri yükleniyor…</p>
          </div>
        ) : loadError ? (
          <section className="rounded-[28px] border-2 border-rose-200/90 bg-gradient-to-r from-rose-50/95 via-white to-orange-50/90 p-8 shadow-xl">
            <p className="text-xl font-black text-rose-950">Veri yüklenemedi</p>
            <p className="mt-3 text-base font-medium text-rose-900/90">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="mt-6 inline-flex h-14 items-center justify-center rounded-2xl border-2 border-rose-300 bg-white px-8 text-base font-bold text-rose-950 transition hover:scale-[1.02]"
            >
              Tekrar dene
            </button>
          </section>
        ) : (
          <>
            <section
              aria-label="Kullanıcı özeti"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
            >
              <SummaryStatCard label="Toplam kullanıcı" value={stats.total} tone="indigo" />
              <SummaryStatCard label="Admin sayısı" value={stats.adminCount} tone="violet" />
              <SummaryStatCard
                label="Aktif uzman"
                value={stats.activeExpertCount}
                tone="emerald"
              />
              <SummaryStatCard
                label="Bekleyen kullanıcı"
                value={stats.pendingCount}
                tone="amber"
              />
              <SummaryStatCard label="Pasif kullanıcı" value={stats.passiveCount} tone="slate" />
            </section>

            <section className="mt-8 w-full" aria-label="Son 10 kullanıcı">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 sm:text-3xl">
                    Son 10 kullanıcı
                  </h2>
                  <p className="mt-1 text-base font-medium text-slate-600 sm:text-lg">
                    En son oluşturulan hesaplar — yönetimsel alanlar
                  </p>
                </div>
                <p className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-900">
                  {users.length} kayıt · users tablosu
                </p>
              </div>

              <div className="overflow-hidden rounded-[28px] border-2 border-white/90 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-left">
                    <thead>
                      <tr className="border-b-2 border-slate-200/90 bg-gradient-to-r from-slate-50 via-indigo-50/80 to-violet-50/80">
                        <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                          Ad / İsim
                        </th>
                        <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                          E-posta
                        </th>
                        <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                          Rol
                        </th>
                        <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                          Paket
                        </th>
                        <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                          Durum
                        </th>
                        <th className="px-5 py-4 text-sm font-black uppercase tracking-wide text-slate-700 sm:px-6 sm:text-base">
                          Oluşturulma
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastUsers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-16 text-center text-lg font-semibold text-slate-500"
                          >
                            Henüz kullanıcı kaydı yok.
                          </td>
                        </tr>
                      ) : (
                        lastUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-slate-100/90 transition-colors hover:bg-indigo-50/40"
                          >
                            <td className="px-5 py-5 sm:px-6">
                              <p className="text-base font-black text-slate-900 sm:text-lg">
                                {user.fullName}
                              </p>
                            </td>
                            <td className="px-5 py-5 sm:px-6">
                              <p className="text-base font-medium text-slate-700 sm:text-lg">
                                {user.email || "—"}
                              </p>
                            </td>
                            <td className="px-5 py-5 sm:px-6">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-black ring-1 ${roleBadgeClass(user.role)}`}
                              >
                                {roleLabel(user.role)}
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
                            <td className="px-5 py-5 sm:px-6">
                              <p className="text-base font-semibold text-slate-700 sm:text-lg">
                                {formatCreatedAt(user.createdAt)}
                              </p>
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
        )}
      </div>
    </main>
  );
}

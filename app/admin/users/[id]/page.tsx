"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Eye, Home, Loader2, Shield, Users } from "lucide-react";
import {
  clearYasamUser,
  isAdminUser,
  normalizeApprovalStatus,
  normalizeRole,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const ADMIN_MODULE_UI_KEYS = [
  "clients",
  "appointments",
  "numerology",
  "stones",
  "reflexology",
  "energy_body",
  "aromatherapy",
  "personal_archive",
] as const;

type AdminModuleUiKey = (typeof ADMIN_MODULE_UI_KEYS)[number];

const ADMIN_MODULE_UI_LABELS: Record<AdminModuleUiKey, string> = {
  clients: "Danışan Yönetimi",
  appointments: "Ajanda",
  numerology: "Numeroloji",
  stones: "Doğaltaş",
  reflexology: "Refleksoloji",
  energy_body: "Biyoenerji",
  aromatherapy: "Aromaterapi",
  personal_archive: "Kişisel Arşiv",
};

type ProfileUser = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "expert";
  active: boolean;
  approvalStatus: "pending" | "approved" | "rejected";
  createdAt?: string;
  modulePermissions: Record<AdminModuleUiKey, boolean>;
};

function parseAdminModulePermissions(raw: unknown): Record<AdminModuleUiKey, boolean> {
  const perms = Object.fromEntries(
    ADMIN_MODULE_UI_KEYS.map((k) => [k, false]),
  ) as Record<AdminModuleUiKey, boolean>;
  if (!raw || typeof raw !== "object") return perms;
  const row = raw as Record<string, unknown>;
  for (const key of ADMIN_MODULE_UI_KEYS) {
    if (typeof row[key] === "boolean") perms[key] = row[key];
  }
  return perms;
}

function mapProfileUser(row: Record<string, unknown>): ProfileUser {
  const role = normalizeRole(row.role) === "admin" ? "admin" : "expert";
  const approval = normalizeApprovalStatus(row.approval_status);
  const approvalStatus =
    approval === "approved" || approval === "rejected" ? approval : "pending";

  return {
    id: row.id != null ? String(row.id).trim() : "",
    fullName: String(row.full_name ?? row.name ?? "").trim() || "İsimsiz kullanıcı",
    email: String(row.email ?? "").trim(),
    role,
    active: row.active === true,
    approvalStatus,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
    modulePermissions: parseAdminModulePermissions(row.module_permissions),
  };
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px]";

function approvalLabel(status: ProfileUser["approvalStatus"]): string {
  if (status === "approved") return "Onaylı";
  if (status === "rejected") return "Reddedildi";
  return "Onay Bekliyor";
}

function ProfileField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/90 bg-white/80 px-5 py-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      {children ?? (
        <p className="mt-2 text-lg font-black text-slate-900 md:text-xl">{value}</p>
      )}
    </div>
  );
}

function ModulePermissionCard({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      className={`flex min-h-[88px] flex-col justify-between rounded-2xl border-2 px-5 py-4 ${
        enabled
          ? "border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/80"
          : "border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-slate-100/80"
      }`}
    >
      <p className="text-base font-black text-slate-900 md:text-lg">{label}</p>
      <span
        className={`mt-3 inline-flex w-fit rounded-full px-4 py-1.5 text-sm font-black ${
          enabled
            ? "bg-emerald-500 text-white shadow-sm"
            : "bg-slate-300 text-slate-800"
        }`}
      >
        {enabled ? "Açık" : "Kapalı"}
      </span>
    </div>
  );
}

export default function AdminUserProfileViewPage() {
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profil yükleme hatası:", error);
      setProfile(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    if (!data) {
      setProfile(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    setProfile(mapProfileUser(data as Record<string, unknown>));
    setNotFound(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setAllowed(isAdminUser(readYasamUser()));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    loadProfile();
  }, [sessionChecked, allowed, loadProfile]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

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
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-cyan-200/15 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-6 py-6 md:px-10 md:py-8 xl:px-16">
        <nav
          className="sticky top-0 z-50 mb-8 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-rose-100/90 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-4">
            <Link
              href="/admin/users"
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 hover:border-violet-400 hover:from-violet-100 hover:to-indigo-100 no-underline`}
            >
              <Users className="h-5 w-5 shrink-0" aria-hidden />
              Admin Kullanıcı Yönetimine Dön
            </Link>
            <Link
              href="/"
              className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline`}
            >
              <Home className="h-5 w-5 shrink-0" aria-hidden />
              Ana Panele Dön
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100`}
            >
              Çıkış Yap
            </button>
          </div>
        </nav>

        <header
          className={`${panelClass} mb-6 border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/70`}
        >
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg">
              <Eye className="h-7 w-7" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
                Salt okunur · Admin izleme
              </p>
              <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
                Üye Profil İzleme
              </h1>
              <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-slate-600 md:text-lg">
                Bu ekran yalnızca görüntüleme amaçlıdır. Admin, üyenin verilerini
                buradan değiştiremez.
              </p>
            </div>
          </div>
        </header>

        <div
          className={`${panelClass} mb-8 border-amber-300/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/90`}
          role="note"
        >
          <p className="text-base font-bold leading-relaxed text-amber-950 md:text-lg">
            Bu sayfa sadece izleme ekranıdır. Üyenin danışan, analiz, taş,
            refleksoloji veya diğer kayıtları burada düzenlenemez.
          </p>
        </div>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center justify-center py-20`}>
            <Loader2 className="h-12 w-12 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 text-base font-bold text-slate-600">Profil yükleniyor…</p>
          </div>
        ) : notFound || !profile ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-xl font-black text-slate-900">Üye bulunamadı</p>
            <p className="mt-2 text-base text-slate-600">
              Kayıt silinmiş veya geçersiz bir bağlantı kullanılmış olabilir.
            </p>
            <Link
              href="/admin/users"
              className={`${navBtn} mt-6 inline-flex max-w-md border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 no-underline`}
            >
              <Users className="h-5 w-5 shrink-0" aria-hidden />
              Admin Kullanıcı Yönetimine Dön
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <section
              className={`${panelClass} border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-violet-50/40`}
              aria-labelledby="profile-summary-heading"
            >
              <h2
                id="profile-summary-heading"
                className="text-2xl font-black text-slate-950 md:text-3xl"
              >
                Profil Özeti
              </h2>
              <p className="mt-1 text-base font-medium text-slate-600">
                {profile.fullName} · {profile.email}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ProfileField label="Ad Soyad" value={profile.fullName} />
                <ProfileField label="E-posta" value={profile.email} />
                <ProfileField
                  label="Rol"
                  value={profile.role === "admin" ? "Admin" : "Uzman"}
                />
                <ProfileField label="Onay Durumu">
                  <span
                    className={`mt-2 inline-flex rounded-full px-4 py-1.5 text-sm font-black ${
                      profile.approvalStatus === "approved"
                        ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                        : profile.approvalStatus === "rejected"
                          ? "bg-rose-100 text-rose-900 ring-1 ring-rose-200"
                          : "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                    }`}
                  >
                    {approvalLabel(profile.approvalStatus)}
                  </span>
                </ProfileField>
                <ProfileField label="Aktif / Pasif">
                  <span
                    className={`mt-2 inline-flex rounded-full px-4 py-1.5 text-sm font-black ${
                      profile.active
                        ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                        : "bg-slate-200 text-slate-800 ring-1 ring-slate-300"
                    }`}
                  >
                    {profile.active ? "Aktif" : "Pasif"}
                  </span>
                </ProfileField>
                <ProfileField
                  label="Kayıt Tarihi"
                  value={formatCreatedAt(profile.createdAt)}
                />
              </div>
            </section>

            <section
              className={`${panelClass} border-indigo-200/80 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/50`}
              aria-labelledby="module-permissions-heading"
            >
              <h2
                id="module-permissions-heading"
                className="text-2xl font-black text-slate-950 md:text-3xl"
              >
                Modül İzinleri
              </h2>
              <p className="mt-2 text-base font-medium text-slate-600 md:text-lg">
                Üyenin ana panelinde görebileceği modüller (salt okunur).
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {ADMIN_MODULE_UI_KEYS.map((key) => (
                  <ModulePermissionCard
                    key={key}
                    label={ADMIN_MODULE_UI_LABELS[key]}
                    enabled={profile.modulePermissions[key]}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

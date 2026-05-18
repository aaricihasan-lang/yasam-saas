"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
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

  const openModules = ADMIN_MODULE_UI_KEYS.filter(
    (key) => profile?.modulePermissions[key],
  ).map((key) => ADMIN_MODULE_UI_LABELS[key]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-cyan-200/15 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-6 py-6 md:px-10 md:py-8 xl:px-16">
        <nav
          className="sticky top-0 z-50 mb-8 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-4">
            <Link
              href="/admin/users"
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 hover:border-violet-400 no-underline`}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
              Üye Yönetimine Dön
            </Link>
            <Link
              href="/admin"
              className={`${navBtn} border-sky-300/80 bg-gradient-to-r from-sky-50 to-cyan-50 text-sky-950 hover:border-sky-400 no-underline`}
            >
              Admin Merkezi
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400`}
            >
              Çıkış Yap
            </button>
          </div>
        </nav>

        <header className={`${panelClass} mb-8 border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-violet-50/70`}>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-800">
            Salt okunur · Admin izleme
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
            Üye Profil İzleme
          </h1>
          <p className="mt-2 text-base font-medium text-slate-600">
            {profile?.fullName ?? "Üye profili"}
          </p>
        </header>

        <div className={`${panelClass} mb-8 border-amber-200/80 bg-amber-50/70`}>
          <p className="text-sm font-bold leading-relaxed text-amber-950">
            Bu ekran yalnızca admin görüntüleme alanıdır. Üyenin danışan, analiz,
            taş, refleksoloji veya diğer modül kayıtları burada düzenlenemez.
          </p>
        </div>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center justify-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 text-sm font-bold text-slate-600">Profil yükleniyor…</p>
          </div>
        ) : notFound || !profile ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-lg font-black text-slate-900">Üye bulunamadı</p>
            <Link
              href="/admin/users"
              className="mt-4 inline-block font-black text-violet-700 no-underline"
            >
              Listeye dön
            </Link>
          </div>
        ) : (
          <div className={`${panelClass} border-slate-200/80`}>
            <dl className="grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Ad Soyad
                </dt>
                <dd className="mt-1 text-lg font-black text-slate-900">{profile.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                  E-posta
                </dt>
                <dd className="mt-1 text-lg font-semibold text-slate-800">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Rol</dt>
                <dd className="mt-1 text-lg font-black capitalize text-slate-900">
                  {profile.role}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Onay Durumu
                </dt>
                <dd className="mt-1 text-lg font-black text-slate-900">
                  {profile.approvalStatus === "approved"
                    ? "Onaylı"
                    : profile.approvalStatus === "rejected"
                      ? "Reddedildi"
                      : "Onay Bekliyor"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Aktif / Pasif
                </dt>
                <dd className="mt-1 text-lg font-black text-slate-900">
                  {profile.active ? "Aktif" : "Pasif"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Kayıt Tarihi
                </dt>
                <dd className="mt-1 text-lg font-semibold text-slate-800">
                  {formatCreatedAt(profile.createdAt)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Açık Modüller
                </dt>
                <dd className="mt-2">
                  {openModules.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-600">
                      Henüz açık modül yok.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {openModules.map((label) => (
                        <li
                          key={label}
                          className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-900 ring-1 ring-emerald-200"
                        >
                          {label}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}

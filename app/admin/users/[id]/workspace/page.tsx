"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  CalendarDays,
  Flower2,
  Footprints,
  Gem,
  Home,
  Loader2,
  Lock,
  Sparkles,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ADMIN_MODULE_UI_LABELS,
  isUserPremiumPackage,
  mapDbUser,
  type AdminModuleUiKey,
  type ManagedUser,
} from "@/lib/admin/userManagement";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px] no-underline";

const pageContainerClass =
  "relative z-10 mx-auto w-full max-w-[1700px] px-6 py-6 md:px-10 md:py-8 xl:px-16 2xl:px-20";

type WorkspaceModuleMeta = {
  key: AdminModuleUiKey;
  description: string;
  Icon: LucideIcon;
  enabledRing: string;
  enabledBg: string;
  iconWrap: string;
};

const WORKSPACE_MODULES: WorkspaceModuleMeta[] = [
  {
    key: "clients",
    description: "Danışan kayıtları ve profil özeti",
    Icon: UsersRound,
    enabledRing: "ring-violet-200",
    enabledBg: "from-violet-50 via-white to-indigo-50/80",
    iconWrap: "bg-violet-600",
  },
  {
    key: "appointments",
    description: "Randevu ve ajanda görünümü",
    Icon: CalendarDays,
    enabledRing: "ring-sky-200",
    enabledBg: "from-sky-50 via-white to-cyan-50/80",
    iconWrap: "bg-sky-600",
  },
  {
    key: "numerology",
    description: "Numeroloji analizleri",
    Icon: Sparkles,
    enabledRing: "ring-fuchsia-200",
    enabledBg: "from-fuchsia-50 via-white to-pink-50/80",
    iconWrap: "bg-fuchsia-600",
  },
  {
    key: "stones",
    description: "Doğal taş envanteri ve kombinasyonlar",
    Icon: Gem,
    enabledRing: "ring-amber-200",
    enabledBg: "from-amber-50 via-white to-orange-50/80",
    iconWrap: "bg-amber-600",
  },
  {
    key: "reflexology",
    description: "Refleksoloji protokol ve atlas kayıtları",
    Icon: Footprints,
    enabledRing: "ring-teal-200",
    enabledBg: "from-teal-50 via-white to-emerald-50/80",
    iconWrap: "bg-teal-600",
  },
  {
    key: "energy_body",
    description: "Biyoenerji çalışma alanı",
    Icon: Zap,
    enabledRing: "ring-emerald-200",
    enabledBg: "from-emerald-50 via-white to-lime-50/80",
    iconWrap: "bg-emerald-600",
  },
  {
    key: "aromatherapy",
    description: "Aromaterapi modülü",
    Icon: Flower2,
    enabledRing: "ring-rose-200",
    enabledBg: "from-rose-50 via-white to-pink-50/80",
    iconWrap: "bg-rose-600",
  },
  {
    key: "personal_archive",
    description: "Kişisel arşiv ve notlar",
    Icon: Archive,
    enabledRing: "ring-slate-200",
    enabledBg: "from-slate-50 via-white to-zinc-50/80",
    iconWrap: "bg-slate-600",
  },
];

function isExpertModuleEnabled(user: ManagedUser, key: AdminModuleUiKey): boolean {
  if (user.role !== "expert") return false;
  if (isUserPremiumPackage(user)) return true;
  return Boolean(user.modulePermissions[key]);
}

export default function AdminUserWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const { showToast } = useToast();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<ManagedUser | null>(null);

  const loadUser = useCallback(async () => {
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

    if (error || !data) {
      console.error("Uzman çalışma alanı yükleme hatası:", error);
      setUser(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    setUser(mapDbUser(data as Record<string, unknown>));
    setNotFound(false);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const session = readYasamUser();
    setAllowed(isAdminUser(session));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadUser();
  }, [sessionChecked, allowed, loadUser]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  function handleModuleCardClick(key: AdminModuleUiKey, enabled: boolean) {
    if (!enabled) {
      showToast({
        title: "Modül kapalı",
        message: `${ADMIN_MODULE_UI_LABELS[key]} bu uzman için aktif değil.`,
        type: "info",
      });
      return;
    }

    showToast({
      title: "Yakında",
      message: "Salt okunur görüntüleme hazırlanıyor.",
      type: "info",
    });
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
          <p className="text-xl font-black text-rose-950">Erişim reddedildi</p>
          <p className="mt-3 text-sm font-medium text-slate-600">
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </p>
          <Link href="/" className={`${navBtn} mt-6 border-violet-300 bg-violet-50 text-violet-950`}>
            Ana Panele Dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className={pageContainerClass}>
        <nav
          className="sticky top-0 z-50 mb-6 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-violet-100/90 via-indigo-100/85 to-rose-100/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4">
            <Link
              href={`/admin/users/${userId}`}
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950`}
            >
              Kullanıcı Detayına Dön
            </Link>
            <Link
              href="/admin/users"
              className={`${navBtn} border-indigo-300/80 bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-950`}
            >
              <Users className="h-5 w-5 shrink-0" aria-hidden />
              Admin Kullanıcı Yönetimine Dön
            </Link>
            <Link
              href="/"
              className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950`}
            >
              <Home className="h-5 w-5 shrink-0" aria-hidden />
              Ana Panele Dön
            </Link>
          </div>
        </nav>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 px-5 text-sm font-black text-rose-950 shadow-md transition hover:-translate-y-0.5"
          >
            Çıkış Yap
          </button>
        </div>

        {loading ? (
          <div className={`${panelClass} flex flex-col items-center py-16`}>
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
            <p className="mt-4 font-bold text-slate-600">Yükleniyor…</p>
          </div>
        ) : notFound || !user ? (
          <div className={`${panelClass} text-center`}>
            <p className="text-xl font-black">Üye bulunamadı</p>
            <Link
              href="/admin/users"
              className={`${navBtn} mt-6 inline-flex max-w-md`}
            >
              Kullanıcı yönetimine dön
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <header
              className={`${panelClass} border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/70`}
            >
              <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
                Salt okunur izleme
              </p>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Uzman Çalışma Alanı İzleme
              </h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 md:text-base">
                Bu ekran yalnızca görüntüleme içindir. Admin bu alanda kayıt
                ekleyemez, düzenleyemez veya silemez.
              </p>
              <div className="mt-5 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-indigo-800">
                  İzlenen üye
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">{user.fullName}</p>
                <p className="text-sm font-medium text-slate-600">{user.email}</p>
              </div>
            </header>

            <section
              className={`${panelClass} border-amber-300/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/90`}
              role="note"
            >
              <p className="text-sm font-bold leading-relaxed text-amber-950 md:text-base">
                Modül kartlarına tıklayarak ileride salt okunur detay ekranlarına
                geçilecektir. Şu an yalnızca modül durumu görüntülenir; kayıt
                işlemi yapılamaz.
              </p>
            </section>

            <section className={`${panelClass} border-slate-200/80`}>
              <h2 className="text-xl font-black text-slate-950">Modüller</h2>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Yeşil kartlar uzman için açık modülleri; gri kartlar kapalı
                modülleri gösterir.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {WORKSPACE_MODULES.map(
                  ({ key, description, Icon, enabledRing, enabledBg, iconWrap }) => {
                    const enabled = isExpertModuleEnabled(user, key);
                    const label = ADMIN_MODULE_UI_LABELS[key];

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleModuleCardClick(key, enabled)}
                        className={`flex min-h-[168px] flex-col rounded-2xl border-2 p-4 text-left transition ${
                          enabled
                            ? `border-emerald-200/90 bg-gradient-to-br ${enabledBg} shadow-md ring-2 ${enabledRing} hover:-translate-y-0.5 hover:shadow-lg`
                            : "border-slate-200/90 bg-slate-100/80 opacity-75 grayscale hover:opacity-90"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${
                              enabled ? iconWrap : "bg-slate-400"
                            }`}
                          >
                            <Icon className="h-5 w-5" aria-hidden />
                          </div>
                          {!enabled ? (
                            <Lock
                              className="h-4 w-4 shrink-0 text-slate-500"
                              aria-hidden
                            />
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-black text-slate-900">{label}</p>
                        <p className="mt-1 flex-1 text-xs font-medium leading-snug text-slate-600">
                          {description}
                        </p>
                        <span
                          className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${
                            enabled
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-300 text-slate-700"
                          }`}
                        >
                          {enabled ? "Açık" : "Kapalı"}
                        </span>
                        <p className="mt-2 text-[11px] font-bold text-violet-800/80">
                          {enabled
                            ? "Salt okunur görüntüleme hazırlanıyor"
                            : "Modül kapalı"}
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

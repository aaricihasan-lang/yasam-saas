"use client";

import { runInEffect } from "@/lib/runInEffect";
import {
  canLoginYasamUser,
  clearYasamUser,
  enrichYasamUserProfile,
  getYasamUserDisplayName,
  hasFullPanelAccess,
  isAdminUser,
  LOCKED_SUBSCRIPTION_TOAST,
  parseLoginUserRecord,
  readYasamUser,
  saveYasamUser,
  type YasamUser,
} from "@/lib/auth/yasamUser";
import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import {
  getModuleLockReason,
  hasModulePermission,
  isPremiumExpertUser,
  LOCKED_PERMISSION_TOAST,
  PREMIUM_HOME_MODULE_KEYS,
  type ModuleLockReason,
  type ModulePermissionKey,
} from "@/lib/auth/modulePermissions";
import { useToast } from "@/components/ui/ToastProvider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ChartColumn,
  FolderArchive,
  Gem,
  Leaf,
  Loader2,
  Package,
  Shield,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ModuleTheme = {
  iconWrap: string;
  cardBg: string;
  border: string;
};

type ModuleCard = {
  title: string;
  desc: string;
  count: string;
  badge: string;
  href: string;
  permissionKey: ModulePermissionKey;
  Icon: LucideIcon;
  theme: ModuleTheme;
};

type LandingModule = {
  title: string;
  desc: string;
  icon: string;
};

type FeatureItem = {
  title: string;
  desc: string;
  icon: string;
};

const landingModules: LandingModule[] = [
  {
    title: "Numeroloji",
    desc: "Profesyonel numeroloji analizleri ve danışan kayıt sistemi.",
    icon: "🔢",
  },
  {
    title: "Doğaltaş",
    desc: "Taş, mineral, kombinasyon ve enerji eşleştirme altyapısı.",
    icon: "💎",
  },
  {
    title: "Biyoenerji",
    desc: "Enerji bedenleri, çakra ve analiz süreç yönetimi.",
    icon: "✨",
  },
  {
    title: "Refleksoloji",
    desc: "Refleksoloji kayıtları ve profesyonel seans sistemi.",
    icon: "🦶",
  },
  {
    title: "Aromaterapi",
    desc: "Uçucu yağ, sabit yağ ve karışım yönetim sistemi.",
    icon: "🌿",
  },
  {
    title: "Danışan Yönetimi",
    desc: "Danışan kayıtları, notlar, analizler ve randevu sistemi.",
    icon: "👥",
  },
];

const featureItems: FeatureItem[] = [
  {
    title: "Güvenli Veri Yapısı",
    desc: "Verileriniz kontrollü ve güvenli kullanım yapısında korunur.",
    icon: "🔒",
  },
  {
    title: "Analiz & Raporlama",
    desc: "Detaylı analiz, raporlama ve profesyonel çıktı alanları.",
    icon: "📈",
  },
  {
    title: "Web & Mobil Uyum",
    desc: "Telefon, tablet ve bilgisayardan kesintisiz erişim.",
    icon: "📱",
  },
  {
    title: "Yedekleme",
    desc: "Düzenli takip ve veri güvenliği odaklı altyapı.",
    icon: "☁️",
  },
  {
    title: "Modüler Yapı",
    desc: "İhtiyaca göre genişleyen çalışma alanları ve modüller.",
    icon: "🧩",
  },
];

const dashboardModules: ModuleCard[] = [
  {
    title: "Danışan Yolculuğu",
    desc: "Danışan kayıtları, randevu ve seans takibi tek merkezde",
    count: "Aktif",
    badge: "Ana Modül",
    href: "/danisan-yolculugu",
    permissionKey: "clients",
    Icon: UsersRound,
    theme: {
      iconWrap: "from-indigo-500 to-blue-600",
      cardBg: "from-blue-100/90 via-sky-50/95 to-white",
      border: "border-blue-200/70",
    },
  },
  {
    title: "Doğaltaş",
    desc: "Taş, mineral ve danışan eşleştirmeleri",
    count: "Aktif",
    badge: "Modül",
    href: "/dogaltas",
    permissionKey: "stones",
    Icon: Gem,
    theme: {
      iconWrap: "from-cyan-500 to-teal-500",
      cardBg: "from-cyan-100/90 via-teal-50/95 to-white",
      border: "border-teal-200/70",
    },
  },
  {
    title: "Ürün & Stok Merkezi",
    desc: "Tüm ürünler, stok, satış ve fiyatlandırma merkezi",
    count: "Aktif",
    badge: "Modül",
    href: "/urun-stok",
    permissionKey: "stock",
    Icon: Package,
    theme: {
      iconWrap: "from-amber-500 to-orange-500",
      cardBg: "from-amber-100/90 via-orange-50/95 to-white",
      border: "border-amber-200/70",
    },
  },
  {
    title: "Şifa Rehberi",
    desc: "Rahatsızlık bazlı bütünsel destek rehberi",
    count: "Aktif",
    badge: "Modül",
    href: "/sifa-rehberi",
    permissionKey: "healing",
    Icon: Leaf,
    theme: {
      iconWrap: "from-green-500 to-emerald-500",
      cardBg: "from-emerald-100/90 via-green-50/95 to-white",
      border: "border-emerald-200/70",
    },
  },
  {
    title: "Enerji & Beden",
    desc: "Biyoenerji, Refleksoloji ve Aromaterapi çalışma alanları",
    count: "Aktif",
    badge: "Modül",
    href: "/enerji-beden",
    permissionKey: "energy_body",
    Icon: Sparkles,
    theme: {
      iconWrap: "from-fuchsia-500 to-violet-600",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge ve kişisel kayıt sistemi",
    count: "Aktif",
    badge: "YENİ",
    href: "/dashboard/kisisel-arsiv",
    permissionKey: "personal_archive",
    Icon: FolderArchive,
    theme: {
      iconWrap: "from-orange-500 to-amber-500",
      cardBg: "from-orange-100/90 via-amber-50/95 to-white",
      border: "border-orange-200/70",
    },
  },
  {
    title: "Numeroloji",
    desc: "Analiz, rapor ve kişisel yorum alanı",
    count: "Aktif",
    badge: "Plan",
    href: "/numeroloji",
    permissionKey: "numerology",
    Icon: ChartColumn,
    theme: {
      iconWrap: "from-violet-500 to-indigo-600",
      cardBg: "from-indigo-100/90 via-violet-50/95 to-white",
      border: "border-indigo-200/70",
    },
  },
];

/** Admin paneldeki Türkçe/ek anahtarlar → ana panel kartı */
const EXPERT_PERMISSION_ALIAS_KEYS: Record<ModulePermissionKey, string[]> = {
  clients: ["danisan_yonetimi"],
  appointments: ["ajanda"],
  numerology: ["numeroloji"],
  stones: ["dogaltas"],
  stock: [],
  healing: [],
  energy_body: [
    "biyoenerji",
    "reflexology",
    "refleksoloji",
    "aromatherapy",
    "aromaterapi",
  ],
  personal_archive: ["kisisel_arsiv"],
};

function getRawPermissionRow(user: YasamUser): Record<string, unknown> | null {
  const raw = user.module_permissions;
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function permissionFlagIsTrue(
  row: Record<string, unknown> | null,
  key: string,
): boolean {
  if (!row) return false;
  return row[key] === true;
}

function isExpertDashboardModuleVisible(
  user: YasamUser,
  item: ModuleCard,
): boolean {
  if (!hasExpertMembershipAccess(user)) return false;

  const key = item.permissionKey;

  if (isPremiumExpertUser(user)) {
    return PREMIUM_HOME_MODULE_KEYS.includes(key);
  }

  if (hasModulePermission(user, key)) return true;

  const row = getRawPermissionRow(user);
  for (const alias of EXPERT_PERMISSION_ALIAS_KEYS[key]) {
    if (permissionFlagIsTrue(row, alias)) return true;
  }

  if (key === "clients") {
    if (hasModulePermission(user, "appointments")) return true;
    if (permissionFlagIsTrue(row, "ajanda")) return true;
  }

  return false;
}

function isExpertMembershipExpired(user: YasamUser): boolean {
  if (isAdminUser(user)) return false;
  return !hasExpertMembershipAccess(user);
}

function expertHasAnyGrantedModule(user: YasamUser): boolean {
  return dashboardModules.some((item) =>
    isExpertDashboardModuleVisible(user, item),
  );
}

function getVisibleDashboardModules(user: YasamUser): ModuleCard[] {
  if (isAdminUser(user)) return dashboardModules;
  return dashboardModules.filter((item) =>
    isExpertDashboardModuleVisible(user, item),
  );
}

function AuthBootScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-violet-300/25 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[380px] w-[380px] rounded-full bg-cyan-200/20 blur-[110px]" />
      <div
        className="relative z-10 flex flex-col items-center gap-5 rounded-[28px] border-2 border-white/80 bg-white/85 px-10 py-12 shadow-[0_24px_60px_rgba(15,23,42,0.1)] backdrop-blur-xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-violet-200/90" />
          <Loader2
            className="relative h-8 w-8 animate-spin text-violet-600"
            aria-hidden
          />
        </div>
        <p className="text-lg font-black text-slate-900">Yaşam Sistemi hazırlanıyor...</p>
        <p className="text-sm font-medium text-slate-600">Oturum bilgileri kontrol ediliyor</p>
      </div>
    </main>
  );
}

export default function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<YasamUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const loginBackdropPressed = useRef(false);

  const closeLoginModal = () => {
    setLoginModalOpen(false);
  };

  const handleLoginBackdropMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target === event.currentTarget) {
      loginBackdropPressed.current = true;
    }
  };

  const handleLoginBackdropMouseUp = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (
      loginBackdropPressed.current &&
      event.target === event.currentTarget
    ) {
      closeLoginModal();
    }
    loginBackdropPressed.current = false;
  };

  const handleLoginBackdropMouseLeave = () => {
    loginBackdropPressed.current = false;
  };

  const handleLoginModalPointerEvent = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.stopPropagation();
    loginBackdropPressed.current = false;
  };

  useEffect(() => {
    runInEffect(async () => {
      try {
        const stored = readYasamUser();
        if (!stored) {
          setUser(null);
          return;
        }
        const fresh = await enrichYasamUserProfile(stored);
        if (!fresh) {
          clearYasamUser();
          setUser(null);
          return;
        }
        saveYasamUser(fresh);
        setUser(fresh);
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (authLoading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "1") {
      setLoginModalOpen(true);
      setMessage("");
      window.history.replaceState({}, "", "/");
    }
  }, [authLoading]);

  useEffect(() => {
    if (!loginModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLoginModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loginModalOpen]);

  const handleLogin = async () => {
    if (!email || !password) {
      setMessage("Email ve şifre giriniz.");
      return;
    }

    setLoading(true);
    setMessage("Giriş yapılıyor...");

    const { data, error } = await supabase.rpc("login_user", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.log(error);
      setMessage("Sistem hatası oluştu.");
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("Email veya şifre hatalı.");
      setLoading(false);
      return;
    }

    let loggedUser = parseLoginUserRecord(data[0]);

    if (!loggedUser) {
      setMessage(
        "Giriş başarısız: hesabınızda geçerli bir rol (admin / expert) tanımlı değil. Supabase users kaydını kontrol edin.",
      );
      setLoading(false);
      return;
    }

    const freshUser = await enrichYasamUserProfile(loggedUser);
    if (!freshUser) {
      setMessage("Kullanıcı kaydı doğrulanamadı. Lütfen tekrar deneyin.");
      setLoading(false);
      return;
    }
    loggedUser = freshUser;

    const loginCheck = canLoginYasamUser(loggedUser);
    if (!loginCheck.allowed) {
      setMessage(loginCheck.message);
      setLoading(false);
      return;
    }

    saveYasamUser(loggedUser);
    setUser(loggedUser);
    setLoginModalOpen(false);
    setEmail("");
    setPassword("");
    setMessage("");
    setLoading(false);

    if (isAdminUser(loggedUser)) {
      router.push("/admin");
    }
  };

  const logout = () => {
    clearYasamUser();
    setUser(null);
    setEmail("");
    setPassword("");
    setMessage("");
  };

  if (authLoading) {
    return <AuthBootScreen />;
  }

  if (user) {
    const displayName = getYasamUserDisplayName(user);
    const avatarInitial = displayName.charAt(0).toLocaleUpperCase("tr-TR") || "U";
    const panelAccess = hasFullPanelAccess(user);
    const visibleDashboardModules = getVisibleDashboardModules(user);
    const membershipExpired = isExpertMembershipExpired(user);
    const expertModulesEmpty =
      !isAdminUser(user) &&
      !membershipExpired &&
      !expertHasAnyGrantedModule(user);

    function handleLockedModuleClick(reason: ModuleLockReason) {
      showToast({
        message:
          reason === "permission"
            ? LOCKED_PERMISSION_TOAST
            : LOCKED_SUBSCRIPTION_TOAST,
        type: "warning",
      });
    }

    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
        <div
          className="pointer-events-none absolute -left-[300px] bottom-[-250px] h-[900px] w-[900px] rounded-full bg-blue-400/20 blur-[180px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-[250px] top-[20%] h-[800px] w-[800px] rounded-full bg-fuchsia-300/18 blur-[180px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-[40%] top-[30%] h-[600px] w-[600px] rounded-full bg-violet-300/10 blur-[170px]"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute left-8 top-10 h-24 w-24 rounded-full bg-white/30 backdrop-blur-sm"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-24 top-28 h-16 w-16 rounded-full bg-white/30 backdrop-blur-sm"
          aria-hidden
        />
        <svg
          className="pointer-events-none absolute bottom-0 left-0 h-[42%] w-[38%] opacity-[0.06] text-indigo-400"
          viewBox="0 0 420 320"
          fill="none"
          aria-hidden
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={i * 64}
              x2="420"
              y2={i * 64}
              stroke="currentColor"
              strokeWidth="0.75"
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <line
              key={`v-${i}`}
              x1={i * 70}
              y1="0"
              x2={i * 70}
              y2="320"
              stroke="currentColor"
              strokeWidth="0.75"
            />
          ))}
          {[
            [40, 48],
            [110, 120],
            [180, 72],
            [250, 160],
            [320, 88],
            [70, 200],
            [200, 240],
            [350, 200],
          ].map(([cx, cy], i) => (
            <circle key={`dot-${i}`} cx={cx} cy={cy} r="2.5" fill="currentColor" />
          ))}
        </svg>

        <svg
          className="pointer-events-none absolute bottom-8 right-0 h-[38%] w-[42%] opacity-[0.07] text-violet-400"
          viewBox="0 0 480 300"
          fill="none"
          aria-hidden
        >
          <line x1="60" y1="220" x2="180" y2="140" stroke="currentColor" strokeWidth="0.8" />
          <line x1="180" y1="140" x2="320" y2="180" stroke="currentColor" strokeWidth="0.8" />
          <line x1="320" y1="180" x2="420" y2="80" stroke="currentColor" strokeWidth="0.8" />
          <line x1="180" y1="140" x2="240" y2="260" stroke="currentColor" strokeWidth="0.8" />
          <line x1="240" y1="260" x2="380" y2="240" stroke="currentColor" strokeWidth="0.8" />
          <line x1="120" y1="60" x2="180" y2="140" stroke="currentColor" strokeWidth="0.8" />
          {[
            [60, 220],
            [180, 140],
            [320, 180],
            [420, 80],
            [240, 260],
            [380, 240],
            [120, 60],
          ].map(([cx, cy], i) => (
            <circle key={`node-${i}`} cx={cx} cy={cy} r="3" fill="currentColor" />
          ))}
        </svg>

        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.12]"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d="M0 95 C 240 40, 480 110, 720 70 C 960 30, 1200 90, 1440 55 L 1440 120 L 0 120 Z"
            fill="url(#home-bottom-glow)"
          />
          <defs>
            <linearGradient id="home-bottom-glow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(99,102,241,0)" />
              <stop offset="35%" stopColor="rgba(129,140,248,0.35)" />
              <stop offset="65%" stopColor="rgba(217,70,239,0.3)" />
              <stop offset="100%" stopColor="rgba(56,189,248,0)" />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative z-10 mx-auto flex h-screen w-full max-w-[1800px] flex-col px-6 pt-3 pb-4 lg:px-10 lg:pt-4 xl:px-14">
          <div
            className="relative w-full shrink-0 overflow-hidden rounded-[32px] border border-white/30 bg-gradient-to-r from-indigo-950 via-violet-700 to-fuchsia-500 px-6 py-8 text-white shadow-[0_30px_90px_rgba(79,70,229,0.22)] sm:px-8 sm:py-9 lg:py-10"
            aria-label="Uzman ve kurum profili"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 animate-pulse rounded-full bg-white/15 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 left-1/4 h-28 w-56 animate-pulse rounded-full bg-fuchsia-300/20 blur-2xl [animation-delay:700ms]"
              aria-hidden
            />

            <button
              type="button"
              onClick={logout}
              className="absolute right-4 top-4 z-10 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-base font-bold text-white backdrop-blur-md transition hover:bg-white/20 sm:right-6 sm:top-5"
            >
              Çıkış Yap
            </button>

            <div className="relative flex flex-col gap-6 pr-20 sm:flex-row sm:items-center sm:gap-8 sm:pr-28">
                <div
                  className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-[5px] border-yellow-300/85 bg-slate-950/85 text-7xl font-light text-yellow-200 shadow-[0_16px_40px_rgba(0,0,0,0.35)] ring-2 ring-yellow-200/25 sm:h-36 sm:w-36 sm:text-8xl"
                  aria-hidden
                >
                  {avatarInitial}
                </div>

                <div className="min-w-0">
                  <h1 className="text-2xl font-black leading-tight sm:text-3xl lg:text-[2.35rem] lg:leading-tight">
                    Bütüncül Yaşam Analiz Platformu
                  </h1>

                  <p className="mt-2 text-3xl font-black tracking-tight text-yellow-300 sm:text-4xl lg:text-[2.75rem]">
                    {displayName}
                  </p>

                  <p className="mt-2 text-sm font-medium text-white/90 sm:text-base">
                    Doğaltaş • Enerji • Akademi
                  </p>
                </div>
            </div>
          </div>

          <section className="mt-3 flex min-h-0 flex-1 flex-col">
            {isAdminUser(user) ? (
              <Link
                href="/admin"
                className="mb-3 block shrink-0 text-inherit no-underline"
              >
                <div className="group flex items-center gap-4 rounded-[24px] border border-rose-200/70 bg-gradient-to-r from-rose-50/95 via-violet-50/90 to-slate-50/95 px-5 py-4 shadow-[0_16px_40px_rgba(136,19,55,0.08)] transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-rose-700 text-white shadow-md">
                    <Shield className="h-6 w-6" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-700">
                      Sistem Sahibi
                    </p>
                    <p className="text-lg font-black text-slate-900">Admin Paneli</p>
                    <p className="text-xs font-medium text-slate-600">
                      Toplu aktarım, kullanıcı ve sistem yönetimi
                    </p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition group-hover:scale-105">
                    <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                </div>
              </Link>
            ) : null}

            <div className="mb-2 shrink-0">
              <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Modüller
              </h2>
              <p className="text-base font-medium text-slate-600 md:text-lg">
                Yaşam Sistemi içindeki ana çalışma alanları.
              </p>
            </div>

            {membershipExpired ? (
              <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-rose-200/90 bg-rose-50/70 px-6 py-10 text-center shadow-sm">
                <p className="text-lg font-black text-rose-950">
                  Üyelik süreniz doldu
                </p>
                <p className="mt-2 max-w-md text-sm font-medium text-rose-900/90">
                  Deneme veya üyelik süreniz sona erdi. Modüllere erişim için
                  yönetici ile iletişime geçin.
                </p>
              </div>
            ) : expertModulesEmpty ? (
              <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-violet-200/90 bg-white/70 px-6 py-10 text-center shadow-sm">
                <p className="text-lg font-black text-slate-900">
                  Henüz modül izniniz tanımlanmamış
                </p>
                <p className="mt-2 max-w-md text-sm font-medium text-slate-600">
                  Hesabınıza atanmış bir modül bulunmuyor. Erişim için yönetici ile
                  iletişime geçin.
                </p>
              </div>
            ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-4">
              {visibleDashboardModules.map((item) => {
                const hasHref = item.href !== "#";
                const lockReason = getModuleLockReason(
                  user,
                  item.permissionKey,
                  hasHref,
                  panelAccess,
                );
                const isLocked = lockReason !== null;
                const isOpen = hasHref && !isLocked;
                const { Icon, theme } = item;

                const card = (
                  <div
                    className={`group relative flex min-h-[170px] flex-col rounded-[28px] border bg-gradient-to-br p-6 shadow-[0_22px_55px_rgba(15,23,42,0.10)] transition-all duration-300 ${theme.cardBg} ${theme.border} ${
                      isOpen
                        ? "cursor-pointer hover:-translate-y-1 hover:shadow-2xl"
                        : isLocked
                          ? "cursor-not-allowed"
                          : "cursor-default opacity-90"
                    }`}
                  >
                    {isLocked ? (
                      <span className="absolute left-4 top-4 z-10 rounded-full border border-red-200/90 bg-red-50 px-2.5 py-1 text-sm font-bold text-red-700 shadow-sm ring-1 ring-red-100">
                        {lockReason === "permission"
                          ? "🔒 Yetki yok"
                          : "🔒 Üyelik gerekli"}
                      </span>
                    ) : null}

                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-all duration-300 group-hover:scale-110 ${theme.iconWrap}`}
                      >
                        <Icon className="h-8 w-8" strokeWidth={2.25} />
                      </div>

                      <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="mt-3 text-2xl font-black text-slate-900 md:text-3xl">
                      {item.title}
                    </h3>

                    <p className="mt-1 line-clamp-2 flex-1 text-base leading-relaxed text-slate-700 md:text-lg">
                      {item.desc}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                          isLocked
                            ? "bg-rose-100 text-rose-800 ring-rose-200/80"
                            : "bg-emerald-100 text-emerald-800 ring-emerald-200/80"
                        }`}
                      >
                        {isLocked
                          ? lockReason === "permission"
                            ? "Yetki yok"
                            : "Pasif Üyelik"
                          : item.count}
                      </span>

                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition group-hover:scale-105 ${
                          isOpen ? "" : "opacity-50"
                        }`}
                        aria-hidden
                      >
                        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    </div>
                  </div>
                );

                if (isOpen) {
                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="block h-full text-inherit no-underline"
                    >
                      {card}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.title}
                    className="h-full"
                    role={isLocked ? "button" : undefined}
                    tabIndex={isLocked ? 0 : undefined}
                    onClick={
                      isLocked && lockReason
                        ? () => handleLockedModuleClick(lockReason)
                        : undefined
                    }
                    onKeyDown={
                      isLocked && lockReason
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleLockedModuleClick(lockReason);
                            }
                          }
                        : undefined
                    }
                  >
                    {card}
                  </div>
                );
              })}
            </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(155deg,#f3eeff_0%,#e8f4ff_40%,#fff9f0_75%,#fff5f8_100%)] text-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-20 top-0 h-[520px] w-[520px] rounded-full bg-violet-400/22 blur-[120px]" />
        <div className="absolute right-0 top-[12%] h-[480px] w-[480px] rounded-full bg-sky-300/28 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 h-[420px] w-[420px] -translate-x-1/4 rounded-full bg-rose-200/18 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-none px-6 py-6 md:px-10 xl:px-16 2xl:px-20">
        <header className="sticky top-4 z-50 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/80 bg-white/75 px-6 py-7 shadow-[0_20px_60px_rgba(49,46,129,0.12)] backdrop-blur-2xl sm:px-8">
          <div className="flex min-w-[min(100%,420px)] shrink-0 items-center gap-4 sm:min-w-[420px]">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-2xl text-white shadow-lg shadow-violet-300/50">
              ✨
            </div>
            <div>
              <p className="text-2xl font-black tracking-wide text-slate-950">
                YAŞAM SİSTEMİ
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-600 opacity-80">
                Profesyonel bütünsel yönetim platformu
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="hidden rounded-2xl border border-cyan-200/80 bg-cyan-50/95 px-4 py-2.5 text-base font-bold text-cyan-900 lg:inline-flex">
              ☁️ Web & Mobil Destek
            </span>
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setLoginModalOpen(true);
              }}
              className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-violet-300/90 bg-white px-7 text-base font-bold text-violet-950 shadow-[0_8px_24px_rgba(91,33,182,0.12)] ring-1 ring-violet-100 transition hover:border-violet-400 hover:bg-violet-50/80 md:h-14 md:px-8"
            >
              Giriş Yap
            </button>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-8 text-base font-bold text-white shadow-[0_12px_36px_rgba(109,40,217,0.45)] no-underline ring-2 ring-violet-300/40 transition hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgba(109,40,217,0.5)] md:h-14 md:px-10 md:text-lg"
            >
              Kayıt Ol
            </Link>
          </div>
        </header>

        <section className="mt-10 grid w-full max-w-none grid-cols-1 items-start gap-16 xl:grid-cols-[1.7fr_1fr] xl:mt-14 xl:gap-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50/95 px-5 py-2.5 text-sm font-bold text-violet-800 shadow-sm">
              ✨ Profesyonel danışmanlık yönetim sistemi
            </div>

            <h2 className="mt-7 max-w-none text-4xl font-black leading-snug tracking-tight text-slate-950 md:text-5xl xl:text-6xl">
              Profesyonel danışmanlar için{" "}
              <span className="bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 bg-clip-text text-transparent">
                bütünsel yönetim ve analiz
              </span>{" "}
              platformu
            </h2>

            <p className="mt-6 max-w-none text-lg leading-8 text-slate-600">
              Numeroloji, doğaltaş, biyoenerji, refleksoloji, aromaterapi,
              danışan yönetimi, seans takibi ve analiz sistemleri tek merkezde birleşir.
            </p>

            <ul className="mt-8 flex flex-wrap gap-3 text-base font-bold text-slate-700 md:text-lg">
              <li className="rounded-2xl border border-white/90 bg-white/75 px-5 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                🔒 Güvenli veri yapısı
              </li>
              <li className="rounded-2xl border border-white/90 bg-white/75 px-5 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                ☁️ Web & mobil erişim
              </li>
              <li className="rounded-2xl border border-white/90 bg-white/75 px-5 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                💻 Offline çalışma desteği
              </li>
            </ul>
          </div>

          <div className="relative w-full">
            <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-violet-500/20 via-fuchsia-400/16 to-cyan-400/20 blur-3xl" />

            <div className="relative flex flex-col rounded-[32px] border border-white/90 bg-white/80 p-7 shadow-[0_32px_90px_rgba(49,46,129,0.14)] ring-1 ring-violet-100/60 backdrop-blur-2xl sm:p-9">
              <div className="inline-flex w-fit rounded-full bg-violet-100 px-4 py-1.5 text-sm font-black uppercase tracking-wide text-violet-800">
                Çalışma Seçenekleri
              </div>

              <h3 className="mt-5 text-xl font-black leading-tight text-slate-950">
                Size uygun kullanım modeli
              </h3>

              <p className="mt-4 max-w-none text-base leading-7 text-slate-600 md:text-lg md:leading-8">
                Masaüstü ya da web/mobil çalışma modelini seçebilirsiniz. Her iki
                yapı da profesyonel danışman akışına uyumludur.
              </p>

              <div className="mt-auto grid gap-5 pt-8 sm:grid-cols-2">
                <div className="rounded-[24px] border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50/90 p-6 shadow-[0_12px_40px_rgba(16,185,129,0.08)]">
                  <div className="text-xl font-black text-emerald-800">
                    💻 Offline Masaüstü
                  </div>
                  <p className="mt-3 text-base font-medium leading-7 text-emerald-800/90 md:text-lg">
                    İnternetsiz kullanım, lokal veri, gizlilik odaklı çalışma.
                  </p>
                </div>

                <div className="rounded-[24px] border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-sky-50/90 p-6 shadow-[0_12px_40px_rgba(14,165,233,0.08)]">
                  <div className="text-xl font-black text-cyan-800">
                    ☁️ Web & Mobil
                  </div>
                  <p className="mt-3 text-base font-medium leading-7 text-cyan-800/90 md:text-lg">
                    Telefon, tablet ve bilgisayardan erişilebilir çalışma alanı.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        <section className="mt-16 w-full max-w-none xl:mt-20">
          <div className="mb-8">
            <p className="text-base font-black uppercase tracking-[0.18em] text-violet-700">
              Modüller
            </p>
            <h3 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
              Tüm çalışma alanları tek platformda
            </h3>
          </div>
          <div className="grid w-full grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {landingModules.map((item) => (
            <div
              key={item.title}
              className="group relative flex min-h-[220px] flex-col rounded-[28px] border border-slate-200/80 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-white/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-violet-200/80 hover:shadow-xl"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-3xl text-white shadow-lg shadow-violet-300/40 transition group-hover:scale-105">
                {item.icon}
              </div>

              <h3 className="mt-6 text-lg font-black leading-snug text-slate-950 md:text-xl">
                {item.title}
              </h3>

              <p className="mt-3 flex-1 text-base leading-7 text-slate-600 md:text-lg">
                {item.desc}
              </p>

              <span className="mt-5 inline-flex items-center gap-1.5 text-base font-bold uppercase tracking-wider text-violet-700/80 transition group-hover:gap-2.5 group-hover:text-violet-800">
                Keşfet
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          ))}
          </div>
        </section>

        <section className="mt-14 w-full max-w-none rounded-[32px] border border-indigo-900/25 bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 shadow-[0_28px_80px_rgba(30,27,75,0.4)] xl:mt-16">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {featureItems.map((item, index) => (
            <div
              key={item.title}
              className={`flex flex-col gap-4 p-7 sm:p-8 ${
                index !== featureItems.length - 1
                  ? "xl:border-r xl:border-white/10"
                  : ""
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl ring-1 ring-white/25">
                {item.icon}
              </div>

              <div>
                <h4 className="text-lg font-black text-white md:text-xl">{item.title}</h4>
                <p className="mt-2.5 text-base leading-7 text-indigo-100/95 md:text-lg">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-slate-200/60 py-10 text-center text-base font-semibold text-slate-500">
          © 2026 Yaşam Sistemi. Tüm hakları saklıdır.
        </footer>
      </div>

      {loginModalOpen && (
        <div className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
            aria-hidden
            onMouseDown={handleLoginBackdropMouseDown}
            onMouseUp={handleLoginBackdropMouseUp}
            onMouseLeave={handleLoginBackdropMouseLeave}
          />
          <div
            className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-[30px] border border-white/80 bg-white/92 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl md:max-w-[560px] md:p-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            onClick={handleLoginModalPointerEvent}
            onMouseDown={handleLoginModalPointerEvent}
            onMouseUp={handleLoginModalPointerEvent}
          >
            <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-[180px] w-[180px] rounded-full bg-violet-200/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-80px] left-[-80px] h-[180px] w-[180px] rounded-full bg-cyan-200/50 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                  Uzman Paneli
                </div>

                <h3
                  id="login-modal-title"
                  className="mt-4 text-3xl font-black text-slate-950 md:text-4xl"
                >
                  Giriş Yap
                </h3>

                <p className="mt-2 text-base leading-7 text-slate-500 md:text-lg">
                  Yetkili hesabınızla giriş yaparak çalışma panelinize ulaşabilirsiniz.
                </p>
              </div>

              <button
                type="button"
                onClick={closeLoginModal}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-black text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            <div className="relative z-10 mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  E-Posta
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="uzman@test.com"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Şifre
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleLogin();
                    }
                  }}
                />

                <div className="mt-2.5 flex items-center justify-between gap-4">
                  <Link
                    href="/register"
                    onClick={() => setLoginModalOpen(false)}
                    className="text-[12px] font-semibold tracking-wide text-violet-700/90 no-underline underline-offset-2 transition hover:text-violet-900 hover:underline"
                  >
                    Kayıt Ol
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setMessage("Şifre sıfırlama özelliği yakında eklenecek.")
                    }
                    className="bg-transparent p-0 text-[12px] font-semibold tracking-wide text-violet-600/85 underline-offset-2 transition hover:text-violet-900 hover:underline"
                  >
                    Şifremi Unuttum
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="relative z-10 mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-base font-bold text-white shadow-xl shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Giriş Yapılıyor..." : "Uzman Paneline Gir →"}
            </button>

            {message && (
              <div className="relative z-10 mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { loginWithCredentials } from "@/lib/auth/loginUser";
import {
  canLoginYasamUser,
  clearYasamUser,
  syncYasamUserFromDb,
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
  BookOpen,
  ChartColumn,
  Check,
  ClipboardList,
  FolderArchive,
  Gem,
  Leaf,
  Loader2,
  Lock,
  Package,
  Shield,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
} from "lucide-react";

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

const trustPrinciples: string[] = [
  "Özel notlarınız yalnızca size aittir",
  "Özel notlarınız, analizleriniz ve tüm çalışma içerikleriniz yalnızca size aittir",
  "Sistem sahibi dahil hiçbir yönetici özel çalışma verilerinize erişemez veya içeriklerinizi inceleyemez",
  "Admin paneli yalnızca üyelik, ödeme, modül ve sistem yönetimi içindir",
  "Verileriniz güvenli altyapıda korunur",
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
    permissionKey: "stok",
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
    permissionKey: "sifa_rehberi",
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
  {
    title: "Video → Türkçe Word/PDF",
    desc: "Videolardan Türkçe transkript, çeviri ve eğitim dokümanı üretme merkezi.",
    count: "Aktif",
    badge: "YENİ",
    href: "/video-ceviri",
    permissionKey: "video_ceviri",
    Icon: Video,
    theme: {
      iconWrap: "from-rose-500 to-pink-600",
      cardBg: "from-rose-100/90 via-pink-50/95 to-white",
      border: "border-rose-200/70",
    },
  },
  {
    title: "Belge Çeviri Merkezi",
    desc: "PDF ve Word belgelerini dönüştür, çevir ve yönet.",
    count: "Aktif",
    badge: "YENİ",
    href: "/belge-ceviri",
    permissionKey: "belge_ceviri",
    Icon: BookOpen,
    theme: {
      iconWrap: "from-sky-500 to-cyan-600",
      cardBg: "from-sky-100/90 via-cyan-50/95 to-white",
      border: "border-sky-200/70",
    },
  },
  {
    title: "Ders Notu Merkezi",
    desc: "Ham transkripti temizle, ders notuna dönüştür. Human Design uyumlu.",
    count: "Aktif",
    badge: "YENİ",
    href: "/ders-notu",
    permissionKey: "ders_notu",
    Icon: ClipboardList,
    theme: {
      iconWrap: "from-teal-600 to-emerald-700",
      cardBg: "from-teal-50/90 via-emerald-50/95 to-white",
      border: "border-teal-200/70",
    },
  },
];

/** Admin paneldeki Türkçe/ek anahtarlar → ana panel kartı */
const EXPERT_PERMISSION_ALIAS_KEYS: Record<ModulePermissionKey, string[]> = {
  clients: ["danisan_yonetimi"],
  appointments: ["ajanda"],
  numerology: ["numeroloji"],
  stones: ["dogaltas"],
  stok: ["stock"],
  sifa_rehberi: ["healing"],
  energy_body: [
    "biyoenerji",
    "reflexology",
    "refleksoloji",
    "aromatherapy",
    "aromaterapi",
  ],
  personal_archive: ["kisisel_arsiv"],
  video_ceviri: [],
  belge_ceviri: [],
  ders_notu: [],
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
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl" />
      <div
        className="relative z-10 flex flex-col items-center gap-5 rounded-[28px] border-2 border-white/80 bg-white/90 px-10 py-12 shadow-lg"
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
    const stored = readYasamUser();
    if (stored) {
      setUser(stored);
      setAuthLoading(false);
      void syncYasamUserFromDb(stored).then((fresh) => {
        if (!fresh) {
          clearYasamUser();
          setUser(null);
          return;
        }
        setUser(fresh);
      });
      return;
    }
    setUser(null);
    setAuthLoading(false);
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
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setMessage("Email ve şifre giriniz.");
      return;
    }

    setLoading(true);
    setMessage("Giriş yapılıyor...");

    const attempt = await loginWithCredentials(trimmedEmail, trimmedPassword);

    if (attempt.rpcError) {
      setMessage("Sistem hatası oluştu.");
      setLoading(false);
      return;
    }

    if (attempt.rows.length === 0) {
      setMessage("Email veya şifre hatalı.");
      setLoading(false);
      return;
    }

    let loggedUser = parseLoginUserRecord(attempt.rows[0]);

    if (!loggedUser) {
      setMessage(
        "Giriş başarısız: hesabınızda geçerli bir rol (admin / expert) tanımlı değil. Supabase users kaydını kontrol edin.",
      );
      setLoading(false);
      return;
    }

    const freshUser = await syncYasamUserFromDb(loggedUser, { force: true });
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
      <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
        <div
          className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-32 top-[15%] h-80 w-80 rounded-full bg-fuchsia-300/12 blur-3xl"
          aria-hidden
        />

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 pt-3 pb-16 lg:px-8 lg:pt-3 lg:pb-16 xl:px-10">
          {/* — Profile banner — */}
          <div
            className="relative w-full shrink-0 overflow-hidden rounded-[24px] border border-white/30 bg-gradient-to-r from-indigo-950 via-violet-700 to-fuchsia-500 px-5 py-3 text-white shadow-xl sm:px-6 sm:py-3"
            aria-label="Uzman ve kurum profili"
          >
            <button
              type="button"
              onClick={logout}
              className="absolute right-3 top-3 z-10 min-h-[36px] rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition duration-200 hover:bg-white/20 sm:right-4 sm:top-3 sm:px-4 sm:py-2 sm:text-sm"
            >
              Çıkış Yap
            </button>

            <div className="relative flex flex-col gap-3 pr-14 sm:flex-row sm:items-center sm:gap-4 sm:pr-20">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-yellow-300/85 bg-slate-950/85 text-3xl font-light text-yellow-200 shadow-[0_8px_24px_rgba(0,0,0,0.30)] ring-1 ring-yellow-200/25 sm:h-20 sm:w-20 sm:text-4xl"
                aria-hidden
              >
                {avatarInitial}
              </div>

              <div className="min-w-0">
                <h1 className="text-sm font-black leading-tight text-white/80 sm:text-base lg:text-lg">
                  Bütüncül Yaşam Analiz Platformu
                </h1>

                <p className="mt-0.5 break-words text-xl font-black tracking-tight text-yellow-300 sm:text-2xl lg:text-2xl">
                  {displayName}
                </p>

                <p className="mt-0.5 text-xs font-medium text-white/80">
                  Doğaltaş • Enerji • Akademi
                </p>
              </div>
            </div>
          </div>

          {/* — Module section — */}
          <section className="mt-3 flex w-full flex-col">
            {isAdminUser(user) ? (
              <Link
                href="/admin"
                className="mb-2.5 block shrink-0 text-inherit no-underline"
              >
                <div className="group flex items-center gap-3 rounded-[18px] border border-rose-200/70 bg-gradient-to-r from-rose-50/95 via-violet-50/90 to-slate-50/95 px-4 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-rose-700 text-white shadow-sm">
                    <Shield className="h-4 w-4" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-700">
                      Sistem Sahibi
                    </p>
                    <p className="text-sm font-black text-slate-900">Admin Paneli</p>
                    <p className="text-[11px] font-medium text-slate-600">
                      Toplu aktarım, kullanıcı ve sistem yönetimi
                    </p>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105">
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                </div>
              </Link>
            ) : null}

            <div className="mb-2 shrink-0">
              <h2 className="text-lg font-black tracking-tight text-slate-900 md:text-xl">
                Modüller
              </h2>
              <p className="text-sm font-medium text-slate-600">
                Yaşam Sistemi içindeki ana çalışma alanları.
              </p>
            </div>

            {membershipExpired ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-rose-200/90 bg-rose-50/70 px-6 py-8 text-center shadow-sm">
                <p className="text-base font-black text-rose-950">
                  Üyelik süreniz doldu
                </p>
                <p className="mt-2 max-w-md text-sm font-medium text-rose-900/90">
                  Deneme veya üyelik süreniz sona erdi. Modüllere erişim için
                  yönetici ile iletişime geçin.
                </p>
              </div>
            ) : expertModulesEmpty ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-violet-200/90 bg-white/70 px-6 py-8 text-center shadow-sm">
                <p className="text-base font-black text-slate-900">
                  Henüz modül izniniz tanımlanmamış
                </p>
                <p className="mt-2 max-w-md text-sm font-medium text-slate-600">
                  Hesabınıza atanmış bir modül bulunmuyor. Erişim için yönetici ile
                  iletişime geçin.
                </p>
              </div>
            ) : (
            <div className="grid w-full grid-cols-1 gap-2.5 pb-4 sm:grid-cols-2 xl:grid-cols-3 2xl:gap-3">
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
                    className={`group relative flex flex-col rounded-[18px] border bg-gradient-to-br p-4 shadow-sm transition-all duration-200 ${theme.cardBg} ${theme.border} ${
                      isOpen
                        ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
                        : isLocked
                          ? "cursor-not-allowed"
                          : "cursor-default opacity-90"
                    }`}
                  >
                    {isLocked ? (
                      <span className="absolute left-3 top-3 z-10 rounded-full border border-red-200/90 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 shadow-sm ring-1 ring-red-100">
                        {lockReason === "permission"
                          ? "🔒 Yetki yok"
                          : "🔒 Üyelik gerekli"}
                      </span>
                    ) : null}

                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-all duration-200 group-hover:scale-105 ${theme.iconWrap}`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.25} />
                      </div>

                      <span className="rounded-full border border-white/80 bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="mt-2 text-sm font-black text-slate-900 sm:text-base">
                      {item.title}
                    </h3>

                    <p className="mt-0.5 line-clamp-2 flex-1 text-xs leading-5 text-slate-600">
                      {item.desc}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
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
                        className={`flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105 ${
                          isOpen ? "" : "opacity-50"
                        }`}
                        aria-hidden
                      >
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
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
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(160deg,#f0ebff_0%,#e9f2ff_38%,#fafbff_68%,#fef9ff_100%)] text-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-8 h-[520px] w-[520px] rounded-full bg-violet-400/[0.13] blur-[100px]" />
        <div className="absolute right-0 top-[8%] h-80 w-80 rounded-full bg-sky-300/[0.17] blur-3xl" />
        <div className="absolute left-1/2 top-[8%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet-300/[0.07] blur-[90px]" />
      </div>

      <div className="relative z-10 w-full max-w-none px-4 py-4 md:px-8 xl:px-14 2xl:px-18">
        {/* — Nav — */}
        <header className="sticky top-3 z-50 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/70 bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-base text-white shadow-sm shadow-violet-300/30">
              ✨
            </div>
            <p className="text-sm font-black tracking-wide text-slate-950">
              YAŞAM SİSTEMİ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setLoginModalOpen(true);
              }}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-900"
            >
              Giriş Yap
            </button>
            <Link
              href="/register"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-4 text-xs font-bold text-white no-underline shadow-[0_4px_14px_rgba(109,40,217,0.35)] transition hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(109,40,217,0.42)]"
            >
              Kayıt Ol
            </Link>
          </div>
        </header>

        {/* — Hero — */}
        <section className="mx-auto mt-10 flex w-full max-w-2xl flex-col items-center text-center xl:mt-12">
          {/* Headline */}
          <h2 className="text-[2.25rem] font-black leading-[1.1] tracking-[-0.02em] text-slate-950 sm:text-5xl md:text-[3.25rem] xl:text-[3.75rem]">
            Profesyonel danışmanlar için{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
              bütünsel yönetim
            </span>{" "}
            platformu
          </h2>

          {/* Subtitle */}
          <p className="mt-5 max-w-[420px] text-[0.9375rem] leading-[1.75] text-slate-500">
            Numeroloji, doğaltaş, biyoenerji, refleksoloji ve danışan yönetimi —
            tek platformda, profesyonel akışa uygun.
          </p>

          {/* CTAs */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setLoginModalOpen(true);
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-300/70 hover:text-violet-900"
            >
              Giriş Yap
            </button>
            <Link
              href="/register"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-7 text-sm font-bold text-white no-underline shadow-[0_6px_22px_rgba(109,40,217,0.38)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(109,40,217,0.48)]"
            >
              Keşfet →
            </Link>
          </div>
        </section>

        {/* — Platform Avantajları — */}
        <div className="mx-auto mt-6 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70">
          <div className="border-b border-slate-100 px-5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Platform avantajları
            </p>
          </div>
          <div className="grid grid-cols-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Web & Mobil Erişim",
              "Güvenli Veri Altyapısı",
              "Modüler Yapı",
              "Profesyonel Analiz Sistemleri",
              "Offline Masaüstü Desteği",
              "Danışan & Seans Yönetimi",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5 rounded-lg px-3 py-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                  aria-hidden
                >
                  <Check className="h-3 w-3" strokeWidth={2.75} />
                </span>
                <span className="text-sm font-medium text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* — Modules grid — */}
        <section className="mt-5 w-full max-w-none xl:mt-6">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950 sm:text-xl">
                Çalışma Alanları
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Platform içindeki ana modüller
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {landingModules.map((item) => (
            <div
              key={item.title}
              className="group relative flex flex-col rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm ring-1 ring-white/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200/80 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-xl text-white shadow-md shadow-violet-300/30 transition group-hover:scale-105">
                {item.icon}
              </div>

              <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                {item.title}
              </h3>

              <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                {item.desc}
              </p>

              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-violet-700/80 transition group-hover:gap-2 group-hover:text-violet-800">
                Keşfet
                <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </span>
            </div>
          ))}
          </div>
        </section>

        {/* — Features dark band — */}
        <section className="mt-8 w-full max-w-none rounded-[24px] border border-indigo-900/25 bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 shadow-[0_16px_56px_rgba(30,27,75,0.35)] xl:mt-9">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {featureItems.map((item, index) => (
            <div
              key={item.title}
              className={`flex flex-col gap-3 p-5 ${
                index !== featureItems.length - 1
                  ? "xl:border-r xl:border-white/10"
                  : ""
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl ring-1 ring-white/25">
                {item.icon}
              </div>

              <div>
                <h4 className="text-sm font-black text-white">{item.title}</h4>
                <p className="mt-1.5 text-xs leading-5 text-indigo-100/90">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
          </div>
        </section>

        {/* — Trust section — */}
        <section
          className="relative mt-8 w-full max-w-none overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-violet-100/90 via-indigo-50/95 to-emerald-50/90 p-5 shadow-md ring-1 ring-violet-200/50 sm:p-7 xl:mt-9"
          aria-labelledby="trust-principles-heading"
        >
          <div className="relative z-10 grid grid-cols-1 items-center gap-7 lg:grid-cols-[1.35fr_1fr] lg:gap-10 xl:gap-12">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-800/90">
                🔒 Güven İlkemiz
              </p>
              <h3
                id="trust-principles-heading"
                className="mt-2 text-xl font-black leading-snug text-slate-950 sm:text-2xl xl:text-[1.75rem]"
              >
                Yaşam Sistemi yalnızca bir yazılım değil, uzmanların yıllarca
                oluşturduğu emek ve bilgi birikimini koruyan güvenli bir çalışma
                alanıdır.
              </h3>

              <ul className="mt-4 space-y-2">
                {trustPrinciples.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-[18px] border border-white/80 bg-white/80 px-4 py-2.5 shadow-sm transition duration-200 hover:border-violet-200/80 hover:bg-white/95"
                  >
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-emerald-600 text-white shadow-sm"
                      aria-hidden
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </span>
                    <span className="text-sm font-bold leading-5 text-slate-800">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-violet-200/60 pt-4 text-xs font-semibold italic text-slate-600">
                &ldquo;Güven bizim için özellik değil, sistemin temelidir.&rdquo;
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="relative flex aspect-square max-h-[320px] flex-col items-center justify-center rounded-[24px] border border-white/80 bg-gradient-to-br from-white/85 via-violet-50/80 to-cyan-50/70 p-6 shadow-md sm:max-h-none sm:min-h-[260px] lg:min-h-[280px]">
                <div className="relative flex h-32 w-32 items-center justify-center">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-700 via-violet-700 to-emerald-600 text-white shadow-md ring-4 ring-white/50">
                    <ShieldCheck className="h-10 w-10" strokeWidth={1.75} />
                  </div>
                  <div className="absolute -left-1 top-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/90 bg-white/90 text-violet-700 shadow-md backdrop-blur-sm">
                    <Lock className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="absolute -right-1 bottom-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/90 bg-white/90 text-emerald-700 shadow-md backdrop-blur-sm">
                    <Shield className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                </div>
                <p className="mt-5 text-center text-xs font-black uppercase tracking-[0.2em] text-violet-800/90">
                  Gizlilik · Güven · Saygı
                </p>
                <p className="mt-1.5 max-w-[220px] text-center text-sm font-semibold leading-5 text-slate-600">
                  Uzman emeğiniz ve danışan mahremiyetiniz önceliğimizdir.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-6 border-t border-slate-200/60 py-5 text-center text-sm font-semibold text-slate-500">
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
            className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[26px] border border-white/80 bg-white/92 p-5 shadow-[0_24px_72px_rgba(15,23,42,0.26)] backdrop-blur-2xl sm:p-7 md:max-w-[520px] md:p-8"
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
                  className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl"
                >
                  Giriş Yap
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-slate-500">
                  Yetkili hesabınızla giriş yaparak çalışma panelinize ulaşabilirsiniz.
                </p>
              </div>

              <button
                type="button"
                onClick={closeLoginModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-black text-slate-500 shadow-sm transition hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            <div className="relative z-10 mt-5 space-y-3.5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  E-Posta
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="uzman@test.com"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Şifre
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleLogin();
                    }
                  }}
                />

                <div className="mt-2 flex items-center justify-between gap-4">
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
              className="relative z-10 mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Giriş Yapılıyor..." : "Uzman Paneline Gir →"}
            </button>

            {message && (
              <div className="relative z-10 mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

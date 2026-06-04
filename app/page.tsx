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

const numerologiFeatures = [
  { icon: "📊", title: "Detaylı Hesaplamalar", desc: "Doğum tarihinden kişisel sayılarınızı çıkarın ve anlamlandırın." },
  { icon: "🧘", title: "Çakra Analizi", desc: "Çakra omurgası ve enerji dengesini görüntüleyin." },
  { icon: "💎", title: "Taş Önerileri", desc: "Size özel doğaltaş önerilerini keşfedin." },
  { icon: "📋", title: "Görsel Rapor", desc: "Premium raporunuzu indirin ve paylaşın." },
  { icon: "📚", title: "Bilgi Bankası", desc: "Numeroloji yorumları ve açıklamalara tek merkezden ulaşın." },
  { icon: "💾", title: "Kayıtlı Analizler", desc: "Tüm analizlerinizi kaydedin, zamanla karşılaştırın." },
  { icon: "📄", title: "PDF & PNG Çıktı", desc: "Raporlarınızı PDF ve PNG olarak dışa aktarın." },
  { icon: "🔒", title: "Güvenli Altyapı", desc: "Verileriniz güvenle saklanır, sadece size özeldir." },
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
  const [scrolled, setScrolled] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
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

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxIdx(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = document.querySelectorAll<HTMLElement>("[data-fade]");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "none";
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
    );
    els.forEach((el) => {
      if (el.getBoundingClientRect().top >= window.innerHeight - 80) {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      }
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

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
        <header className={`sticky top-3 z-50 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border px-4 py-2.5 sm:px-6 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${scrolled ? "border-slate-200/50 bg-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.08)] backdrop-blur-xl" : "border-white/70 bg-white/85 shadow-sm backdrop-blur-md"}`}>
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

        {/* — Product Mockup — */}
        <div data-fade className="mt-8 w-full">
          <div className="mb-4">
            <h3 className="text-xl font-black leading-snug tracking-tight text-slate-950 sm:text-2xl">
              Yaşam Sistemi İçinde Bir Danışan
            </h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Bir danışanın tüm çalışma geçmişi tek ekranda görüntülenebilir.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.07)]">

            {/* Window chrome */}
            <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-400/75" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-400/75" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/75" />
              </div>
              <p className="ml-2 text-xs text-slate-400">Danışan Yolculuğu — Ahmet Yılmaz</p>
            </div>

            {/* App layout */}
            <div className="flex flex-col sm:flex-row">

              {/* Left sidebar */}
              <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 sm:w-56 sm:border-b-0 sm:border-r">

                {/* Client card */}
                <div className="border-b border-slate-100 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
                      AY
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900">Ahmet Yılmaz</p>
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Aktif Danışan
                      </span>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1.5">
                    {[
                      { label: "Son görüşme", value: "04.06.2026" },
                      { label: "Kayıtlı çalışma", value: "5 kayıt" },
                      { label: "Yaklaşan randevu", value: "2 randevu" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <dt className="text-[11px] text-slate-400">{row.label}</dt>
                        <dd className="text-[11px] font-semibold text-slate-600">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Nav tabs */}
                <nav className="flex gap-0.5 overflow-x-auto p-2 sm:flex-col" aria-label="Danışan sekmeleri">
                  {[
                    { label: "Genel Bilgiler", active: true },
                    { label: "Numeroloji" },
                    { label: "Refleksoloji" },
                    { label: "Doğaltaş" },
                    { label: "Notlar" },
                    { label: "Randevular" },
                    { label: "Dosyalar" },
                  ].map((tab) => (
                    <div
                      key={tab.label}
                      className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${
                        tab.active
                          ? "bg-violet-600 text-white"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {tab.label}
                    </div>
                  ))}
                </nav>
              </div>

              {/* Right content */}
              <div className="min-w-0 flex-1">

                {/* Danışan Özeti */}
                <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                  {[
                    { value: "5", label: "Analiz" },
                    { value: "8", label: "Seans" },
                    { value: "3", label: "Dosya" },
                    { value: "4", label: "Not" },
                  ].map((stat) => (
                    <div key={stat.label} className="flex flex-col items-center gap-0.5 py-3">
                      <span className="text-base font-black tabular-nums text-slate-900">{stat.value}</span>
                      <span className="text-[10px] font-medium text-slate-400">{stat.label}</span>
                    </div>
                  ))}
                </div>

                {/* Son Çalışmalar */}
                <div className="p-4">
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Son Çalışmalar
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { text: "Numeroloji Analizi Tamamlandı", detail: "Kişisel yıl & yaşam yolu hesabı", date: "2 gün önce", dot: "bg-violet-400" },
                      { text: "Refleksoloji Protokolü Eklendi", detail: "Ayak haritası · 3 bölge", date: "4 gün önce", dot: "bg-fuchsia-400" },
                      { text: "Doğaltaş Önerisi Kaydedildi", detail: "Ametist, Labradorit kombinasyonu", date: "1 hafta önce", dot: "bg-teal-400" },
                      { text: "Seans Notu Eklendi", detail: "45 dk · 3. seans", date: "1 hafta önce", dot: "bg-sky-400" },
                      { text: "Yeni Randevu Oluşturuldu", detail: "12 Haziran 2026, 14:00", date: "2 hafta önce", dot: "bg-emerald-400" },
                    ].map((item) => (
                      <div
                        key={item.text}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-slate-800">{item.text}</p>
                            <p className="truncate text-[11px] text-slate-400">{item.detail}</p>
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">{item.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── NUMEROLOJİ MODÜLÜ VİTRİNİ ──────────────────────────── */}
        <section data-fade className="mt-12 w-full">

          {/* Section header */}
          <div className="mb-8 text-center">
            <span className="inline-flex items-center rounded-full border border-violet-200/70 bg-violet-50 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
              Numeroloji Modülü
            </span>
            <h3 className="mt-4 text-2xl font-black leading-snug tracking-tight text-slate-950 sm:text-3xl">
              Numeroloji Analizi ile{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                Yaşam Haritanızı Keşfedin
              </span>
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Doğum bilgilerinden kişisel sayılarınızı, çakra omurganızı, element dengenizi,
              taş önerilerinizi ve görsel raporunuzu oluşturun.
            </p>
          </div>

          {/* Screen grid sub-header */}
          <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200/60 bg-white/60 px-5 py-3.5">
            <p className="text-sm font-black text-slate-900">Numeroloji Analizi — Gerçek Ürün Ekranları</p>
            <p className="mt-0.5 text-xs text-slate-500">Doğum tarihinizden yaşam haritanızı çıkarın, detaylı analizleri gözlemleyin.</p>
          </div>

          {/* 2×2 screen mockup grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                title: "Analiz Hesaplama",
                node: (
                  <div className="flex min-h-[220px] flex-col rounded-xl border border-slate-200/70 bg-white">
                    {/* app nav */}
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                      <span className="text-[10px] font-semibold text-violet-600">← Modül seçimi</span>
                      <div className="text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">YAŞAM SİSTEMİ · NUMEROLOJİ</p>
                      </div>
                      <span className="text-[10px] font-semibold text-violet-600">Kayıtlı analizler</span>
                    </div>
                    {/* form */}
                    <div className="flex flex-1 flex-col px-4 py-3">
                      <p className="text-center text-sm font-black text-slate-900">Numeroloji Analizi</p>
                      <p className="mt-0.5 text-center text-[10px] leading-4 text-slate-500">Yaşam haritanızı hesaplayın, görsel raporunuzu oluşturun.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-[10px] text-slate-500">Ad</p>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">Ali</div>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] text-slate-500">Soyad</p>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">AL</div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="mb-1 text-[10px] text-slate-500">Doğum Tarihi</p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">05/06/1986</div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <div className="flex-1 rounded-lg bg-violet-600 py-1.5 text-center text-[11px] font-bold text-white">HESAPLA</div>
                        <div className="flex-1 rounded-lg border border-slate-200 py-1.5 text-center text-[11px] font-bold text-slate-600">KAYDET</div>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                title: "Sonuç Özeti",
                node: (
                  <div className="flex min-h-[220px] flex-col rounded-xl border border-slate-200/70 bg-white">
                    {/* tabs */}
                    <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2">
                      {["SONUÇ ÖZETİ", "ANALİZ", "TAŞ AÇIKL.", "GÖRSEL RAPOR"].map((t, i) => (
                        <div key={t} className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold ${i === 0 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>{t}</div>
                      ))}
                    </div>
                    <div className="flex flex-1 flex-col px-3 py-3">
                      <div className="mb-2.5 rounded-lg border border-violet-100/80 bg-violet-50/60 px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-wider text-violet-600">NUMEROLOJİK SONUÇ ÖZETİ</p>
                        <p className="mt-0.5 text-sm font-black text-slate-900">Ali AL</p>
                        <p className="text-[9px] text-slate-500">Doğum: 05/06/1986</p>
                      </div>
                      <div className="grid grid-cols-4 divide-x divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                        {[
                          { v: "2", l: "ANA KULVAR" },
                          { v: "6", l: "YAN KULVAR" },
                          { v: "8", l: "İFADE" },
                          { v: "35/8", l: "HAYAT YOLU" },
                        ].map((s) => (
                          <div key={s.l} className="flex flex-col items-center py-2">
                            <span className="text-sm font-black tabular-nums text-violet-700">{s.v}</span>
                            <span className="text-[7px] font-medium text-slate-400">{s.l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                title: "Harflerin Yankılanışı & Elementler",
                node: (
                  <div className="flex min-h-[220px] flex-col rounded-xl border border-slate-200/70 bg-white px-3 py-3">
                    <p className="mb-2 text-[10px] font-black text-slate-800">Harflerin Yankılanışı</p>
                    <div className="mb-3 flex gap-0 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
                      {[
                        { l: "A", n: "1", y: "0 yaş" },
                        { l: "L", n: "3", y: "1–3" },
                        { l: "I", n: "9", y: "6–12" },
                        { l: "A", n: "1", y: "13 yaş" },
                        { l: "L", n: "3", y: "14–16" },
                        { l: "A", n: "1", y: "17 yaş" },
                        { l: "L", n: "3", y: "18–29" },
                        { l: "A", n: "1", y: "30 yaş" },
                        { l: "L", n: "3", y: "35–37" },
                        { l: "A", n: "1", y: "38 yaş" },
                        { l: "L", n: "3", y: "35–37" },
                        { l: "I", n: "9", y: "39–48", akif: true },
                      ].map((item, idx) => (
                        <div key={idx} className={`flex shrink-0 flex-col items-center border-r border-slate-100 px-1.5 py-1 last:border-r-0 ${item.akif ? "bg-violet-50" : ""}`}>
                          {item.akif && <span className="mb-0.5 rounded bg-violet-600 px-1 text-[6px] font-bold text-white">AKİF</span>}
                          <span className="text-[10px] font-black text-slate-800">{item.l}</span>
                          <span className="text-[8px] font-semibold text-violet-600">{item.n}</span>
                          <span className="text-[7px] text-slate-400">{item.y}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mb-1.5 text-[10px] font-black text-slate-800">Elementler</p>
                    <div className="space-y-1.5">
                      {[
                        { el: "Hava", val: 2, color: "bg-sky-400", w: "40%" },
                        { el: "Su", val: 1, color: "bg-blue-500", w: "20%" },
                        { el: "Ateş", val: 3, color: "bg-orange-500", w: "60%" },
                        { el: "Toprak", val: 2, color: "bg-amber-600", w: "40%" },
                      ].map((e) => (
                        <div key={e.el} className="flex items-center gap-2">
                          <span className="w-9 text-[9px] font-medium text-slate-500">{e.el}</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-1.5 rounded-full ${e.color}`} style={{ width: e.w }} />
                          </div>
                          <span className="w-3 text-right text-[9px] font-bold text-slate-600">{e.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
              {
                title: "Çakra Sütunu & Çakra Omurgası",
                node: (
                  <div className="flex min-h-[220px] flex-col rounded-xl border border-slate-200/70 bg-white px-3 py-3">
                    <p className="mb-3 text-[10px] font-black text-slate-800">Çakra Sütunu & Çakra Omurgası</p>
                    <div className="space-y-1.5">
                      {[
                        { no: "10. Çakra", dots: [] },
                        { no: "9. Çakra", dots: ["bg-violet-400"] },
                        { no: "8. Çakra", dots: [] },
                        { no: "7. Çakra", dots: [] },
                        { no: "6. Çakra", dots: ["bg-indigo-400", "bg-indigo-300"] },
                        { no: "5. Çakra", dots: [] },
                        { no: "4. Çakra", dots: [] },
                        { no: "3. Çakra", dots: ["bg-amber-400", "bg-amber-400"] },
                        { no: "2. Çakra", dots: [] },
                        { no: "1. Çakra", dots: ["bg-rose-400", "bg-rose-400"] },
                      ].map((c) => (
                        <div key={c.no} className="flex items-center gap-2">
                          <span className="w-16 text-right text-[9px] text-slate-500">{c.no}</span>
                          <div className="flex items-center gap-1">
                            {c.dots.length === 0 ? (
                              <div className="h-px w-12 bg-slate-200" />
                            ) : (
                              <>
                                <div className="h-px w-6 bg-slate-200" />
                                {c.dots.map((dot, di) => (
                                  <div key={di} className={`h-3 w-3 rounded-full ${dot}`} />
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
            ].map((screen, i) => (
              <div
                key={i}
                className="group cursor-zoom-in"
                onClick={() => setLightboxIdx(i)}
                role="button"
                aria-label={`${screen.title} ekranını büyüt`}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLightboxIdx(i); } }}
              >
                <div className="overflow-hidden rounded-xl ring-1 ring-slate-200/70 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:ring-2 group-hover:ring-violet-300/60 group-hover:shadow-[0_6px_18px_rgba(109,40,217,0.09)]">
                  {screen.node}
                </div>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] font-black text-slate-700">{i + 1}</span>
                  {screen.title}
                </p>
              </div>
            ))}
          </div>

          {/* Features grid */}
          <div className="mt-10">
            <div className="mb-6 text-center">
              <h4 className="text-lg font-black text-slate-950 sm:text-xl">
                Numeroloji Modülü ile{" "}
                <span className="text-violet-700">Neler Yapabilirsiniz?</span>
              </h4>
              <div className="mx-auto mt-2 h-0.5 w-10 rounded-full bg-violet-400/60" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {numerologiFeatures.map((f) => (
                <div key={f.title} className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white/70 px-4 py-3.5">
                  <span className="mt-0.5 shrink-0 text-lg leading-none">{f.icon}</span>
                  <div>
                    <p className="text-sm font-black text-slate-900">{f.title}</p>
                    <p className="mt-0.5 text-xs leading-4 text-slate-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Banner */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-violet-200/60 bg-violet-50/80 px-5 py-5 sm:px-7">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-lg text-white shadow-sm">
                  ✨
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">Kendi yaşam haritanızı keşfetmeye hazır mısınız?</p>
                  <p className="mt-0.5 text-xs text-slate-500">Yaşam Sistemi ile numerolojinizi çözün, potansiyelinizi keşfedin ve yolculuğunuzu bilinçle yönetin.</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => { setMessage(""); setLoginModalOpen(true); }}
                  className="inline-flex h-9 items-center rounded-xl border border-violet-300/70 bg-white px-5 text-sm font-bold text-violet-900 transition hover:bg-violet-50"
                >
                  Giriş Yap
                </button>
                <Link
                  href="/register"
                  className="inline-flex h-9 items-center rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-5 text-sm font-bold text-white no-underline shadow-[0_4px_14px_rgba(109,40,217,0.35)] transition hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(109,40,217,0.42)]"
                >
                  Hemen Keşfet →
                </Link>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {["⚙️ Profesyonel Analiz", "🛡️ Güvenli & Gizli", "⏰ 7/24 Erişim", "🔄 Sürekli Güncellenen Altyapı"].map((item, i, arr) => (
              <span key={item} className="flex items-center gap-4 text-[11px] font-medium text-slate-400">
                {item}
                {i < arr.length - 1 && <span className="hidden h-3 w-px bg-slate-200 sm:block" aria-hidden />}
              </span>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────── */}

        {/* — Problem Section — */}
        <div data-fade className="mt-10 w-full">
          <div className="mb-5">
            <h3 className="text-xl font-black leading-snug tracking-tight text-slate-950 sm:text-2xl">
              Bilgileriniz farklı dosyalarda mı dağınık duruyor?
            </h3>
            <p className="mt-2.5 max-w-2xl text-sm leading-[1.7] text-slate-500">
              Birçok uzman yıllar boyunca oluşturduğu Word dosyalarını, PDF arşivlerini, danışan
              notlarını ve çalışma kayıtlarını farklı klasörlerde saklıyor. Zamanla bilgiye ulaşmak
              zorlaşıyor ve aynı araştırmalar tekrar tekrar yapılıyor.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: "📂", text: "Yüzlerce Word ve PDF dosyası arasında bilgi aramak" },
              { icon: "🔍", text: "Aynı konuyu tekrar tekrar araştırmak zorunda kalmak" },
              { icon: "📝", text: "Danışan notlarının farklı klasörlerde bulunması" },
              { icon: "📅", text: "Randevu, seans ve kayıtların dağınık olması" },
              {
                icon: "💎",
                text: "Doğaltaş, numeroloji ve çalışma notlarının ayrı yerlerde tutulması",
              },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-white/70 px-4 py-3.5"
              >
                <span className="mt-0.5 shrink-0 text-base leading-none">{item.icon}</span>
                <p className="text-sm leading-5 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll line */}
        <div className="mx-auto mt-4 flex justify-center" aria-hidden>
          <div className="h-6 w-px bg-gradient-to-b from-slate-300/55 to-transparent" />
        </div>

        {/* — Modules grid — */}
        <section data-fade className="mt-3 w-full max-w-none xl:mt-4">
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
              className="group relative flex flex-col rounded-[22px] border border-slate-200/70 bg-white/90 p-4 shadow-sm ring-1 ring-white/50 transition-all duration-200 hover:-translate-y-1 hover:border-violet-200/60 hover:shadow-[0_8px_20px_rgba(109,40,217,0.08)] hover:ring-violet-100/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-xl text-white shadow-md shadow-violet-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                {item.icon}
              </div>

              <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                {item.title}
              </h3>

              <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                {item.desc}
              </p>

              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-violet-700/75 transition-all duration-200 group-hover:gap-2 group-hover:text-violet-800">
                Keşfet
                <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </span>
            </div>
          ))}
          </div>
        </section>

        {/* — Features dark band — */}
        <section data-fade className="mt-8 w-full max-w-none rounded-[24px] border border-indigo-900/25 bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 shadow-[0_16px_56px_rgba(30,27,75,0.35)] xl:mt-9">
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
          data-fade
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

      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setLightboxIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Ekran önizlemesi"
        >
          <div
            className="relative w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxIdx(null)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>
            {[
              {
                title: "Analiz Hesaplama",
                node: (
                  <div className="flex flex-col rounded-xl border border-slate-200/70 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                      <span className="text-xs font-semibold text-violet-600">← Modül seçimi</span>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">YAŞAM SİSTEMİ · NUMEROLOJİ</p>
                      <span className="text-xs font-semibold text-violet-600">Kayıtlı analizler</span>
                    </div>
                    <div className="flex flex-col px-6 py-5">
                      <p className="text-center text-lg font-black text-slate-900">Numeroloji Analizi</p>
                      <p className="mt-1 text-center text-sm text-slate-500">Yaşam haritanızı hesaplayın, görsel raporunuzu oluşturun.</p>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div>
                          <p className="mb-1.5 text-xs text-slate-500">Ad</p>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">Ali</div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs text-slate-500">Soyad</p>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">AL</div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs text-slate-500">Doğum Tarihi</p>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">05/06/1986</div>
                      </div>
                      <div className="mt-5 flex gap-3">
                        <div className="flex-1 rounded-xl bg-violet-600 py-2.5 text-center text-sm font-bold text-white">HESAPLA</div>
                        <div className="flex-1 rounded-xl border border-slate-200 py-2.5 text-center text-sm font-bold text-slate-600">KAYDET</div>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                title: "Sonuç Özeti",
                node: (
                  <div className="flex flex-col rounded-xl border border-slate-200/70 bg-white">
                    <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2.5">
                      {["SONUÇ ÖZETİ", "ANALİZ (ÖZETSIZ)", "ANALİZ (ÖZETLİ)", "TAŞ AÇIKLAMALARI", "GÖRSEL RAPOR"].map((t, i) => (
                        <div key={t} className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold ${i === 0 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>{t}</div>
                      ))}
                    </div>
                    <div className="flex flex-col px-5 py-4">
                      <div className="mb-4 rounded-xl border border-violet-100/80 bg-violet-50/60 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">NUMEROLOJİK SONUÇ ÖZETİ</p>
                        <p className="mt-1 text-base font-black text-slate-900">Ali AL</p>
                        <p className="text-xs text-slate-500">Doğum: 05/06/1986</p>
                      </div>
                      <div className="grid grid-cols-4 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        {[{ v: "2", l: "ANA KULVAR" }, { v: "6", l: "YAN KULVAR" }, { v: "8", l: "İFADE SAYISI" }, { v: "35/8", l: "HAYAT YOLU/DM" }].map((s) => (
                          <div key={s.l} className="flex flex-col items-center py-3.5">
                            <span className="text-xl font-black tabular-nums text-violet-700">{s.v}</span>
                            <span className="mt-0.5 text-[9px] font-medium text-slate-400">{s.l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                title: "Harflerin Yankılanışı & Elementler",
                node: (
                  <div className="flex flex-col rounded-xl border border-slate-200/70 bg-white px-5 py-4">
                    <p className="mb-3 text-sm font-black text-slate-800">Harflerin Yankılanışı</p>
                    <div className="mb-5 flex gap-0 overflow-x-auto rounded-xl border border-slate-100 bg-slate-50">
                      {[{ l: "A", n: "1", y: "0 yaş" }, { l: "L", n: "3", y: "1–3" }, { l: "I", n: "9", y: "6–12" }, { l: "A", n: "1", y: "13 yaş" }, { l: "L", n: "3", y: "14–16" }, { l: "A", n: "1", y: "17 yaş" }, { l: "L", n: "3", y: "18–29" }, { l: "A", n: "1", y: "30 yaş" }, { l: "L", n: "3", y: "35–37" }, { l: "A", n: "1", y: "38 yaş" }, { l: "L", n: "3", y: "35–37" }, { l: "I", n: "9", y: "39–48", akif: true }].map((item, idx) => (
                        <div key={idx} className={`flex shrink-0 flex-col items-center border-r border-slate-100 px-2.5 py-2 last:border-r-0 ${item.akif ? "bg-violet-50" : ""}`}>
                          {item.akif && <span className="mb-0.5 rounded bg-violet-600 px-1.5 text-[7px] font-bold text-white">AKİF</span>}
                          <span className="text-sm font-black text-slate-800">{item.l}</span>
                          <span className="text-xs font-semibold text-violet-600">{item.n}</span>
                          <span className="text-[9px] text-slate-400">{item.y}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mb-2 text-sm font-black text-slate-800">Elementler</p>
                    <div className="space-y-2.5">
                      {[{ el: "Hava", val: 2, color: "bg-sky-400", w: "40%" }, { el: "Su", val: 1, color: "bg-blue-500", w: "20%" }, { el: "Ateş", val: 3, color: "bg-orange-500", w: "60%" }, { el: "Toprak", val: 2, color: "bg-amber-600", w: "40%" }].map((e) => (
                        <div key={e.el} className="flex items-center gap-3">
                          <span className="w-12 text-xs font-medium text-slate-500">{e.el}</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-2 rounded-full ${e.color}`} style={{ width: e.w }} />
                          </div>
                          <span className="w-4 text-right text-xs font-bold text-slate-600">{e.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
              {
                title: "Çakra Sütunu & Çakra Omurgası",
                node: (
                  <div className="flex flex-col rounded-xl border border-slate-200/70 bg-white px-5 py-4">
                    <p className="mb-4 text-sm font-black text-slate-800">Çakra Sütunu & Çakra Omurgası</p>
                    <div className="space-y-2.5">
                      {[{ no: "10. Çakra", dots: [] }, { no: "9. Çakra", dots: ["bg-violet-400"] }, { no: "8. Çakra", dots: [] }, { no: "7. Çakra", dots: [] }, { no: "6. Çakra", dots: ["bg-indigo-400", "bg-indigo-300"] }, { no: "5. Çakra", dots: [] }, { no: "4. Çakra", dots: [] }, { no: "3. Çakra", dots: ["bg-amber-400", "bg-amber-400"] }, { no: "2. Çakra", dots: [] }, { no: "1. Çakra", dots: ["bg-rose-400", "bg-rose-400"] }].map((c) => (
                        <div key={c.no} className="flex items-center gap-3">
                          <span className="w-20 text-right text-xs text-slate-500">{c.no}</span>
                          <div className="flex items-center gap-1.5">
                            {c.dots.length === 0 ? <div className="h-px w-16 bg-slate-200" /> : (<><div className="h-px w-8 bg-slate-200" />{c.dots.map((d, di) => <div key={di} className={`h-4 w-4 rounded-full ${d}`} />)}</>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
            ][lightboxIdx]?.node}
          </div>
        </div>
      )}

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

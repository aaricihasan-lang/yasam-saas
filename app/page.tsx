"use client";

import { loginWithCredentials } from "@/lib/auth/loginUser";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
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
  COMING_SOON_MODULE_KEYS,
  type ModuleLockReason,
  type ModulePermissionKey,
} from "@/lib/auth/modulePermissions";
import { supabase } from "@/lib/supabase";
import { getPlanetaryHour } from "@/lib/cosmic/planetary-hours";
import { getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getSunSignInfo } from "@/lib/cosmic/planets";
import { useToast } from "@/components/ui/ToastProvider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  Gem,
  Layers,
  Loader2,
  Lock,
  Package,
  Shield,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

type ModuleTheme = {
  iconWrap: string;
  cardBg: string;
  border: string;
};

type RecentItem = {
  icon: string;
  label: string;
  rawDate: string;
  relDate: string;
};

type ModuleCard = {
  title: string;
  desc: string;
  count: string;
  badge: string;
  href: string;
  permissionKey: ModulePermissionKey;
  emoji: string;
  featured?: boolean;
  statFormat?: (n: number) => string;
  Icon: LucideIcon;
  theme: ModuleTheme;
};

const MODULE_STAT_TABLES: Partial<Record<ModulePermissionKey, string>> = {
  clients: "clients",
  stones: "stones",
  stok: "dogaltas_inventory",
  sifa_rehberi: "healing_guides",
  digital_content: "personal_archives",
  numerology: "numerology_analyses",
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
    title: "Danışan Yönetimi",
    desc: "Danışan kayıtları, notlar, analizler ve randevu sistemi.",
    icon: "👥",
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
    icon: "🌸",
  },
  {
    title: "Şifa Rehberi",
    desc: "Rahatsızlık kayıtları, belirtiler, uygulamalar ve destekleyici öneriler.",
    icon: "🌿",
  },
  {
    title: "Numeroloji",
    desc: "Profesyonel numeroloji analizleri ve danışan kayıt sistemi.",
    icon: "🔢",
  },
  {
    title: "Video Çeviri",
    desc: "Video ve ses dosyalarını metne çevirip Türkçeye aktaran yapay zekâ destekli modül.",
    icon: "🎬",
  },
  {
    title: "Belge Çeviri",
    desc: "PDF, Word ve görselleri yapay zekâ destekli şekilde dönüştürüp Türkçeye çeviren belge merkezi.",
    icon: "📄",
  },
  {
    title: "Kişisel Arşiv",
    desc: "Ses, video, belge, resim ve kişisel notlarınızı tek merkezde güvenle saklayın.",
    icon: "🗂️",
  },
  {
    title: "Human Design",
    desc: "Bilgi bankasına yüklediğiniz Human Design içeriklerini kullanarak kişiye özel raporlar oluşturun.",
    icon: "🔮",
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

const danisanYonetimiGallerySlides = [
  { label: "Danışan Yolculuğu",       src: "/assets/danisan-yolculugu.png",    cover: true },
  { label: "Yeni Danışan Kaydı",      src: "/assets/danisan-yeni-kayit.png",   cover: false },
  { label: "Danışan Listesi",         src: "/assets/danisan-listesi.png",      cover: false },
  { label: "Ajanda & Randevu",        src: "/assets/danisan-ajanda.png",       cover: false },
  { label: "Yeni Randevu Oluştur",    src: "/assets/danisan-yeni-randevu.png", cover: false },
];

const sifaRehberiGallerySlides = [
  { label: "Şifa Rehberi Tanıtım",     src: "/assets/sifa-rehberi-tanitim.png" },
  { label: "Ana Menü",                 src: "/assets/sifa-rehberi-ana-menu.png" },
  { label: "Yeni Rahatsızlık Kaydı",   src: "/assets/sifa-rehberi-yeni-kayit.png" },
  { label: "Destekleyici Öneriler",    src: "/assets/sifa-rehberi-destekleyici.png" },
  { label: "Kayıtlı Rehber Listesi",   src: "/assets/sifa-rehberi-liste.png" },
  { label: "Detay Görünümü",           src: "/assets/sifa-rehberi-detay.png" },
];

const refleksolojiGallerySlides = [
  { label: "Kolaj Görünüm",           src: "/assets/refleksoloji-tanitim.png" },
  { label: "Ana Menü",                src: "/assets/refleksoloji-anamenu.png" },
  { label: "Bölge Haritası",          src: "/assets/refleksoloji-bolge-haritasi.png" },
  { label: "Kayıtlı Atlas",           src: "/assets/refleksoloji-kayitli-atlas.png" },
  { label: "Protokol Haritası",       src: "/assets/refleksoloji-protokol-haritasi.png" },
  { label: "Kayıtlı Protokoller",     src: "/assets/refleksoloji-kayitli-protokoller.png" },
  { label: "Klinik Notlar",           src: "/assets/refleksoloji-klinik-notlar.png" },
];

const biyoenerjiGallerySlides = [
  { label: "Biyoenerji Tanıtım",        src: "/assets/biyoenerji-tanitim.png" },
  { label: "Biyoenerji Ana Sayfa",      src: "/assets/biyoenerji-anasayfa.png" },
  { label: "Biyoenerji Seansları",      src: "/assets/biyoenerji-seanslar.png" },
  { label: "Enerji Bedenleri",          src: "/assets/biyoenerji-enerji-bedenleri.png" },
  { label: "Bilinçaltı Sebepleri",      src: "/assets/biyoenerji-bilincoltu.png" },
  { label: "İmajinasyon Kütüphanesi",   src: "/assets/biyoenerji-imajinasyon.png" },
  { label: "Sembol Dili Kütüphanesi",   src: "/assets/biyoenerji-sembol.png" },
  { label: "Çakra Kütüphanesi",         src: "/assets/biyoenerji-cakra.png" },
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
    emoji: "👥",
    featured: true,
    statFormat: (n) => `${n} danışan kaydı`,
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
    emoji: "💎",
    featured: true,
    statFormat: (n) => `${n} taş kayıtlı`,
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
    emoji: "📦",
    statFormat: (n) => `${n} ürün`,
    Icon: Package,
    theme: {
      iconWrap: "from-amber-500 to-orange-500",
      cardBg: "from-amber-100/90 via-orange-50/95 to-white",
      border: "border-amber-200/70",
    },
  },
  {
    title: "Enerji & Beden",
    desc: "Biyoenerji, Refleksoloji, Aromaterapi ve Şifa Rehberi çalışma alanları",
    count: "Aktif",
    badge: "Modül",
    href: "/enerji-beden",
    permissionKey: "energy_body",
    emoji: "✨",
    Icon: Sparkles,
    theme: {
      iconWrap: "from-fuchsia-500 to-violet-600",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Dijital İçerik Merkezi",
    desc: "Belgeler, videolar, ders notları ve kişisel arşiv yönetimi",
    count: "Aktif",
    badge: "Merkez",
    href: "/digital-content",
    permissionKey: "digital_content",
    emoji: "📚",
    statFormat: (n) => `${n} içerik`,
    Icon: Layers,
    theme: {
      iconWrap: "from-indigo-600 to-sky-600",
      cardBg: "from-indigo-50/90 via-sky-50/95 to-white",
      border: "border-indigo-200/70",
    },
  },
  {
    title: "Yaşam Analiz Merkezi",
    desc: "Numeroloji ve Human Design analiz araçları",
    count: "Aktif",
    badge: "Merkez",
    href: "/life-analysis",
    permissionKey: "numerology",
    emoji: "🧠",
    statFormat: (n) => `${n} analiz`,
    Icon: Brain,
    theme: {
      iconWrap: "from-violet-600 to-purple-700",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
    title: "Yaşam Takvimi / Kozmik Ajanda",
    desc: "Hicri takvim, hacamat günleri ve günlük kozmik akış",
    count: "Aktif",
    badge: "Merkez",
    href: "/cosmic-calendar",
    permissionKey: "cosmic_calendar",
    emoji: "🌙",
    Icon: CalendarDays,
    theme: {
      iconWrap: "from-indigo-400 to-violet-600",
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
  human_design: [],
  digital_content: ["personal_archive", "video_ceviri", "belge_ceviri", "ders_notu", "kisisel_arsiv"],
  cosmic_calendar: [],
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
  return dashboardModules.filter(
    (item) =>
      isExpertDashboardModuleVisible(user, item) ||
      COMING_SOON_MODULE_KEYS.has(item.permissionKey),
  );
}

// ─── Cosmic helpers ────────────────────────────────────────────────────────────

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`
    .split("").map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}


const WEEKDAY_STONES = ["Kehribar","Aytaşı","Karneol","Amazont","Lapis Lazuli","Gül Kuvars","Obsidyen"] as const;
const WEEKDAY_CHAKRAS = [
  { name: "Güneş Sinir Ağı", emoji: "🟡" },
  { name: "Taç Çakra", emoji: "🔮" },
  { name: "Kök Çakra", emoji: "🔴" },
  { name: "Kalp Çakrası", emoji: "💚" },
  { name: "Üçüncü Göz", emoji: "🔵" },
  { name: "Sakral Çakra", emoji: "🟠" },
  { name: "Kök Çakra", emoji: "🔴" },
] as const;
const WEEKDAY_COLORS = [
  { name: "Altın", hex: "#F59E0B" },
  { name: "Gümüş", hex: "#94A3B8" },
  { name: "Kırmızı", hex: "#EF4444" },
  { name: "Yeşil", hex: "#22C55E" },
  { name: "Mavi", hex: "#3B82F6" },
  { name: "Pembe", hex: "#EC4899" },
  { name: "Koyu Mor", hex: "#6D28D9" },
] as const;
const NUMEROLOGY_DESC: Record<number, string> = {
  1: "Yeni başlangıçlar · Liderlik",
  2: "Denge · İşbirliği",
  3: "Yaratıcılık · Neşe",
  4: "Düzen · Kararlılık",
  5: "Değişim · Özgürlük",
  6: "Aşk · Uyum",
  7: "Spiritüel derinlik",
  8: "Güç · Bolluk",
  9: "Tamamlanma · Bilgelik",
  11: "Sezgi · Aydınlanma",
  22: "Büyük inşaacı",
  33: "Evrensel öğretmen",
};

function fmtRelDate(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function getDayGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "İyi Geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi Günler";
  return "İyi Akşamlar";
}

// ─── Dashboard components ──────────────────────────────────────────────────────

function StarField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => {
        const left = ((i * 137.508) % 100).toFixed(2);
        const top = ((i * 89.213 + i * i * 0.17) % 100).toFixed(2);
        const opacity = (0.1 + (i % 5) * 0.06).toFixed(2);
        const size = i % 7 === 0 ? 2.5 : i % 3 === 0 ? 1.5 : 1;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, opacity: Number(opacity) }}
          />
        );
      })}
    </div>
  );
}

function LivePanel({ date }: { date: Date | null }) {
  date = date ?? new Date();
  const phase = getMoonPhase(date);
  const sun = getSunSignInfo(date);
  const moon = getMoonSign(date);
  const planetary = getPlanetaryHour(date);
  const numDay = numerologicalDay(date);
  const numDesc = NUMEROLOGY_DESC[numDay] ?? "";

  function fmtTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const rows = [
    { label: "Güneş Burcu",    value: `${sun.emoji} ${sun.name}` },
    { label: "Ay Burcu",       value: `${moon.emoji} ${moon.name}` },
    { label: "Ay Fazı",        value: `${phase.emoji} ${phase.name}` },
    { label: "Numeroloji",     value: `🔢 ${numDay} · ${numDesc}` },
    {
      label: "Gezegen Saati",
      value: `${planetary.aktifGezegen.symbol} ${planetary.aktifGezegen.name}`,
      sub: `${fmtTime(planetary.hourStart)}–${fmtTime(planetary.hourEnd)} · ${planetary.kalanDakika} dk kaldı`,
    },
  ];

  return (
    <div className="rounded-2xl border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur-md">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
        Bugünün Enerjisi
      </p>

      <div className="space-y-0.5">
        {rows.map(({ label, value, sub }, i) => (
          <div
            key={label}
            className={`flex items-start justify-between gap-3 rounded-lg px-2.5 py-1.5 ${
              i % 2 === 0 ? "bg-slate-50/70" : "bg-transparent"
            }`}
          >
            <span className="shrink-0 text-[11px] font-medium text-slate-400">{label}</span>
            <div className="min-w-0 text-right">
              <span className="text-[11px] font-black text-slate-800">{value}</span>
              {sub ? (
                <p className="text-[10px] tabular-nums text-slate-400">{sub}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
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
  const [now, setNow] = useState<Date | null>(null);
  const [moduleStats, setModuleStats] = useState<Partial<Record<ModulePermissionKey, number | null>>>({});
  const [recentActivity, setRecentActivity] = useState<RecentItem[] | null>(null);
  const [numerologiPreviewOpen, setNumerologiPreviewOpen] = useState(false);
  const [dogaltasPreviewOpen, setDogaltasPreviewOpen] = useState(false);
  const [biyoenerjiPreviewOpen, setBiyoenerjiPreviewOpen] = useState(false);
  const [biyoenerjiSlide, setBiyoenerjiSlide] = useState(0);
  const [refleksolojiPreviewOpen, setRefleksolojiPreviewOpen] = useState(false);
  const [refleksolojiSlide, setRefleksolojiSlide] = useState(0);
  const [sifaRehberiPreviewOpen, setSifaRehberiPreviewOpen] = useState(false);
  const [sifaRehberiSlide, setSifaRehberiSlide] = useState(0);
  const [danisanYonetimiPreviewOpen, setDanisanYonetimiPreviewOpen] = useState(false);
  const [danisanYonetimiSlide, setDanisanYonetimiSlide] = useState(0);
  const [kisiselArsivPreviewOpen, setKisiselArsivPreviewOpen] = useState(false);
  const [belgeCeviriPreviewOpen, setBelgeCeviriPreviewOpen] = useState(false);
  const [videoCeviriPreviewOpen, setVideoCeviriPreviewOpen] = useState(false);
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
    if (!numerologiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNumerologiPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numerologiPreviewOpen]);

  useEffect(() => {
    if (!dogaltasPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDogaltasPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dogaltasPreviewOpen]);

  useEffect(() => {
    if (!biyoenerjiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBiyoenerjiPreviewOpen(false);
      if (e.key === "ArrowLeft") setBiyoenerjiSlide(s => (s - 1 + biyoenerjiGallerySlides.length) % biyoenerjiGallerySlides.length);
      if (e.key === "ArrowRight") setBiyoenerjiSlide(s => (s + 1) % biyoenerjiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [biyoenerjiPreviewOpen]);

  useEffect(() => {
    if (!refleksolojiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRefleksolojiPreviewOpen(false);
      if (e.key === "ArrowLeft") setRefleksolojiSlide(s => (s - 1 + refleksolojiGallerySlides.length) % refleksolojiGallerySlides.length);
      if (e.key === "ArrowRight") setRefleksolojiSlide(s => (s + 1) % refleksolojiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refleksolojiPreviewOpen]);

  useEffect(() => {
    if (!sifaRehberiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSifaRehberiPreviewOpen(false);
      if (e.key === "ArrowLeft") setSifaRehberiSlide(s => (s - 1 + sifaRehberiGallerySlides.length) % sifaRehberiGallerySlides.length);
      if (e.key === "ArrowRight") setSifaRehberiSlide(s => (s + 1) % sifaRehberiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sifaRehberiPreviewOpen]);

  useEffect(() => {
    if (!danisanYonetimiPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDanisanYonetimiPreviewOpen(false);
      if (e.key === "ArrowLeft") setDanisanYonetimiSlide(s => (s - 1 + danisanYonetimiGallerySlides.length) % danisanYonetimiGallerySlides.length);
      if (e.key === "ArrowRight") setDanisanYonetimiSlide(s => (s + 1) % danisanYonetimiGallerySlides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [danisanYonetimiPreviewOpen]);

  useEffect(() => {
    if (!kisiselArsivPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setKisiselArsivPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kisiselArsivPreviewOpen]);

  useEffect(() => {
    if (!belgeCeviriPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBelgeCeviriPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [belgeCeviriPreviewOpen]);

  useEffect(() => {
    if (!videoCeviriPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVideoCeviriPreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoCeviriPreviewOpen]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) {
      setModuleStats({});
      return;
    }
    const tenantId = user.tenant_id;
    if (!tenantId) return;

    let cancelled = false;
    const entries = Object.entries(MODULE_STAT_TABLES) as Array<[ModulePermissionKey, string]>;

    void Promise.allSettled(
      entries.map(async ([key, table]) => {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        return { key, count: error ? null : (count ?? null) };
      }),
    ).then((results) => {
      if (cancelled) return;
      const stats: Partial<Record<ModulePermissionKey, number | null>> = {};
      results.forEach((r) => {
        if (r.status === "fulfilled") stats[r.value.key] = r.value.count;
      });
      setModuleStats(stats);
    });

    return () => { cancelled = true; };
  }, [user?.id, user?.tenant_id]);

  useEffect(() => {
    if (!user) { setRecentActivity(null); return; }
    const tenantId = user.tenant_id;
    if (!tenantId) { setRecentActivity([]); return; }

    let cancelled = false;
    type RawItem = { icon: string; label: string; rawDate: string };
    const sources: { table: string; icon: string; col: string }[] = [
      { table: "clients",             icon: "👥", col: "full_name" },
      { table: "stones",              icon: "💎", col: "name" },
      { table: "personal_archives",   icon: "📚", col: "title" },
      { table: "numerology_analyses", icon: "🧠", col: "full_name" },
    ];

    void Promise.allSettled(
      sources.map(async ({ table, icon, col }) => {
        const { data } = await supabase
          .from(table)
          .select(`${col}, created_at`)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(3);
        return (data ?? []).map((row) => {
          const r = row as unknown as Record<string, unknown>;
          return {
            icon,
            label: String(r[col] ?? "Yeni kayıt").trim() || "Yeni kayıt",
            rawDate: String(r["created_at"] ?? ""),
          } satisfies RawItem;
        });
      }),
    ).then((results) => {
      if (cancelled) return;
      const all: RawItem[] = results
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => (r as PromiseFulfilledResult<RawItem[]>).value);
      all.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
      setRecentActivity(
        all.slice(0, 5).map((item) => ({ ...item, relDate: fmtRelDate(item.rawDate) })),
      );
    });

    return () => { cancelled = true; };
  }, [user?.id, user?.tenant_id]);

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
    const ICON_TO_PERM: Record<string, string> = {
      "👥": "clients", "💎": "stones", "📚": "digital_content", "🧠": "numerology",
    };
    const lastDateByKey: Record<string, string> = {};
    if (recentActivity) {
      for (const act of recentActivity) {
        const k = ICON_TO_PERM[act.icon];
        if (k && !lastDateByKey[k]) lastDateByKey[k] = act.relDate;
      }
    }
    const firstName = displayName ? displayName.split(" ")[0] : "";
    const panelAccess = hasFullPanelAccess(user);
    const visibleDashboardModules = getVisibleDashboardModules(user);
    const membershipExpired = isExpertMembershipExpired(user);
    const expertModulesEmpty =
      !isAdminUser(user) &&
      !membershipExpired &&
      !expertHasAnyGrantedModule(user);

    function handleLockedModuleClick(reason: ModuleLockReason) {
      if (reason === "coming_soon") return;
      showToast({
        message:
          reason === "permission"
            ? LOCKED_PERMISSION_TOAST
            : LOCKED_SUBSCRIPTION_TOAST,
        type: "warning",
      });
    }

    const effectiveNow = now ?? new Date();

    return (
      <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(180deg,#eef5ff_0%,#f6f3ff_48%,#fff8fb_100%)] text-slate-950 antialiased">

        <div className="relative mx-auto w-full max-w-[1800px] px-4 pt-4 pb-16 lg:px-8 xl:px-10">

          {/* ═══════════════════════════════════════════
               HERO
          ═══════════════════════════════════════════ */}
          {(() => {
            const d = effectiveNow;
            const heroDate = `Bugün ${d.getDate()} ${d.toLocaleDateString("tr-TR", { month: "long" })} ${d.getFullYear()} ${d.toLocaleDateString("tr-TR", { weekday: "long" })}`;
            return (
              <>
              <section className="relative mb-0 overflow-hidden rounded-[22px] border border-white/90 bg-gradient-to-br from-violet-200 via-sky-100 to-pink-200 px-5 py-5 shadow-[0_20px_60px_rgba(124,58,237,0.18),0_8px_24px_rgba(236,72,153,0.10)] backdrop-blur-xl sm:px-7 sm:py-6">

                {/* Dev blur ışıklar — nefes alan derinlik */}
                <div className="pointer-events-none absolute -left-16 -top-16 h-[400px] w-[400px] rounded-full bg-violet-400/25 blur-[120px]" aria-hidden />
                <div className="pointer-events-none absolute -right-16 -top-16 h-[400px] w-[400px] rounded-full bg-pink-400/25 blur-[120px]" aria-hidden />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/20 blur-[120px]" aria-hidden />

                {/* İçerik */}
                <div className="relative">

                  {/* Üst satır: selamlama + çıkış */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="leading-tight tracking-tight">
                        {firstName ? (
                          <>
                            <span className="block bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
                              {firstName}
                            </span>
                            <span className="block text-2xl font-black text-slate-900 sm:text-3xl">hoş geldiniz ✨</span>
                          </>
                        ) : (
                          <span className="block text-3xl font-black text-slate-900 sm:text-4xl">Hoş geldiniz ✨</span>
                        )}
                      </h1>
                      <p className="mt-2 text-sm font-medium text-slate-600">{heroDate}</p>
                    </div>
                    <button
                      type="button"
                      onClick={logout}
                      className="mt-1 shrink-0 rounded-xl border border-white/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-violet-700"
                    >
                      Çıkış Yap
                    </button>
                  </div>

                  {/* Hızlı İşlemler */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {([
                      { label: "Danışan Ekle",   href: "/danisan-yolculugu/kayit",  icon: "👥" },
                      { label: "Taş Ekle",        href: "/dogaltas/dogaltas-kayit", icon: "💎" },
                      { label: "Analiz Oluştur",  href: "/numeroloji/analiz",       icon: "🧠" },
                      { label: "İçerik Ekle",     href: "/digital-content",         icon: "📚" },
                    ] as const).map(({ label, href, icon }) => (
                      <Link
                        key={label}
                        href={href}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-slate-700 no-underline shadow-[0_8px_20px_rgba(124,58,237,0.12)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:text-violet-700"
                      >
                        <span aria-hidden>{icon}</span>
                        {label}
                      </Link>
                    ))}
                  </div>

                  {/* Admin linki */}
                  {isAdminUser(user) ? (
                    <Link
                      href="/admin"
                      className="mt-3 flex items-center gap-3 rounded-xl border border-white/60 bg-white/55 px-3 py-2 no-underline backdrop-blur-sm transition hover:bg-white/75"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm">
                        <Shield className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">Sistem Sahibi</p>
                        <p className="text-xs font-black text-slate-800">Admin Paneli</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2.5} />
                    </Link>
                  ) : null}
                </div>
              </section>

              {/* Renkli ayırıcı */}
              <div className="mb-5 mt-0 h-[4px] rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 opacity-70" />
              </>
            );
          })()}

          {/* ═══════════════════════════════════════════
               TWO-COLUMN: MODULES + LIVE PANEL
          ═══════════════════════════════════════════ */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px]">

            {/* ── Left: Module Grid ── */}
            <div>
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Ana Merkezler
              </p>

              {membershipExpired ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center">
                  <p className="text-base font-black text-rose-700">Üyelik süreniz doldu</p>
                  <p className="mt-2 max-w-md text-sm text-rose-500">
                    Modüllere erişim için yönetici ile iletişime geçin.
                  </p>
                </div>
              ) : expertModulesEmpty ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-slate-200 bg-white/60 px-6 py-8 text-center backdrop-blur-sm">
                  <p className="text-base font-black text-slate-700">Henüz modül izniniz tanımlanmamış</p>
                  <p className="mt-2 max-w-md text-sm text-slate-400">
                    Erişim için yönetici ile iletişime geçin.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                  {visibleDashboardModules.map((item) => {
                    const hasHref = item.href !== "#";
                    const lockReason = getModuleLockReason(user, item.permissionKey, hasHref, panelAccess);
                    const isLocked = lockReason !== null;
                    const isOpen = hasHref && !isLocked;
                    const { Icon, theme } = item;
                    const isComingSoon = lockReason === "coming_soon";

                    const isFeatured = item.featured === true;
                    const card = (
                      <div
                        className={`group relative flex flex-col rounded-[18px] border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200 ${theme.cardBg} ${theme.border} ${
                          isFeatured
                            ? "shadow-[0_4px_18px_rgba(0,0,0,0.11)]"
                            : "shadow-[0_2px_10px_rgba(0,0,0,0.07)]"
                        } ${
                          isOpen
                            ? "cursor-pointer hover:-translate-y-1 hover:shadow-lg"
                            : isComingSoon
                              ? "cursor-default opacity-75"
                              : "cursor-not-allowed opacity-70"
                        }`}
                      >
                        {isLocked && !isComingSoon ? (
                          <span className="absolute right-2.5 top-2.5 z-10 rounded-full border border-red-200/90 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            {lockReason === "permission" ? "🔒 Yetki yok" : "🔒 Üyelik"}
                          </span>
                        ) : null}

                        <span className="text-3xl leading-none" aria-hidden>
                          {item.emoji}
                        </span>

                        <h3 className="mt-2.5 text-base font-black text-slate-900">{item.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {item.desc}
                        </p>
                        <p className="mt-1.5 text-xs text-slate-400 transition-colors group-hover:text-slate-600">
                          {item.statFormat
                            ? moduleStats[item.permissionKey] === undefined
                              ? "Yükleniyor"
                              : moduleStats[item.permissionKey] === null
                                ? "İçerik hazır"
                                : item.statFormat(moduleStats[item.permissionKey] as number)
                            : "İçerik hazır"}
                        </p>
                        {lastDateByKey[item.permissionKey] ? (
                          <p className="mt-0.5 text-[10px] text-slate-400 transition-colors group-hover:text-slate-500">
                            📅 Son: {lastDateByKey[item.permissionKey]}
                          </p>
                        ) : null}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                            isComingSoon
                              ? "bg-violet-100 text-violet-700 ring-violet-200/80"
                              : isLocked
                                ? "bg-rose-100 text-rose-800 ring-rose-200/80"
                                : "bg-emerald-100 text-emerald-800 ring-emerald-200/80"
                          }`}>
                            {isComingSoon ? "Yakında" : isLocked ? (lockReason === "permission" ? "Yetki yok" : "Pasif") : item.count}
                          </span>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition-opacity ${isOpen ? "" : "opacity-40"}`} aria-hidden>
                            <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>
                    );

                    if (isOpen) {
                      return (
                        <Link key={item.title} href={item.href} className="block text-inherit no-underline">
                          {card}
                        </Link>
                      );
                    }
                    return (
                      <div
                        key={item.title}
                        role={isLocked ? "button" : undefined}
                        tabIndex={isLocked ? 0 : undefined}
                        onClick={isLocked && lockReason ? () => handleLockedModuleClick(lockReason) : undefined}
                        onKeyDown={isLocked && lockReason ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleLockedModuleClick(lockReason); } } : undefined}
                      >
                        {card}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Right: Son Aktiviteler + Canlı Yaşam Paneli ── */}
            <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">

              {/* Son Aktiviteler — sadece veri varsa göster */}
              {recentActivity !== null && recentActivity.length > 0 ? (
                <div>
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Son Aktiviteler
                  </p>
                  <div className="rounded-2xl border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur-md">
                    <div className="space-y-0.5">
                      {recentActivity.map((act, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5"
                        >
                          <span className="text-sm leading-none">{act.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold text-slate-800">{act.label}</p>
                            <p className="text-[10px] text-slate-400">{act.relDate}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Canlı Yaşam Paneli */}
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  Canlı Yaşam Paneli
                </p>
                <LivePanel date={effectiveNow} />
              </div>
            </aside>
          </div>

        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(160deg,#f0ebff_0%,#e9f2ff_38%,#fafbff_68%,#fef9ff_100%)] text-slate-950">
      <BfcacheRefreshHandler />
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
        <section className="mx-auto mt-10 flex w-full max-w-5xl flex-col items-center text-center xl:mt-12">
          <div className="relative flex w-full items-center justify-center">
            {/* Dekoratif sol kartlar */}
            <div className="pointer-events-none absolute left-0 hidden flex-col gap-2.5 lg:flex" aria-hidden>
              {[
                { label: "10+ Modül", icon: "🧩", sub: "Tek Panel" },
                { label: "Tek Panel", icon: "🖥️", sub: "Her yerden erişim" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 shadow-sm backdrop-blur-sm"
                >
                  <span className="text-lg">{c.icon}</span>
                  <div>
                    <p className="text-xs font-black text-slate-800">{c.label}</p>
                    <p className="text-[10px] text-slate-400">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Center text */}
            <div className="flex max-w-2xl flex-col items-center">
              <h2 className="text-[2.25rem] font-black leading-[1.1] tracking-[-0.02em] text-slate-950 sm:text-5xl md:text-[3.25rem] xl:text-[3.75rem]">
                Danışan, analiz ve seans süreçlerinizi{" "}
                <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                  tek merkezden
                </span>{" "}
                yönetin
              </h2>

              <p className="mt-5 max-w-[500px] text-[0.9375rem] leading-[1.75] text-slate-500">
                Numeroloji, doğaltaş, biyoenerji, refleksoloji, şifa rehberi, belge çeviri ve danışan yönetimi modülleriyle profesyonel çalışma akışınızı düzenleyin.
              </p>

              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("calisma-alanlari")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-8 text-sm font-bold text-white shadow-[0_6px_22px_rgba(109,40,217,0.38)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(109,40,217,0.48)]"
                >
                  Modülleri Keşfet ↓
                </button>
              </div>
            </div>

            {/* Dekoratif sağ kartlar */}
            <div className="pointer-events-none absolute right-0 hidden flex-col gap-2.5 lg:flex" aria-hidden>
              {[
                { label: "Güvenli Kayıt", icon: "🔒", sub: "Verileriniz korumalı" },
                { label: "AI Destekli", icon: "✨", sub: "Akıllı analiz" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 shadow-sm backdrop-blur-sm"
                >
                  <span className="text-lg">{c.icon}</span>
                  <div>
                    <p className="text-xs font-black text-slate-800">{c.label}</p>
                    <p className="text-[10px] text-slate-400">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>
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
        <section id="calisma-alanlari" data-fade className="mt-3 w-full max-w-none xl:mt-4">
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
          {landingModules.map((item) =>
            item.title === "Numeroloji" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-blue-50/60 p-4 shadow-md ring-1 ring-violet-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(109,40,217,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-violet-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Analiz Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-xl text-white shadow-md shadow-violet-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {item.title}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  Ali AL örneğiyle analiz ekranlarını inceleyin.
                </p>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setNumerologiPreviewOpen(true); }}
                  className="mt-3 w-full rounded-xl bg-violet-600 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:bg-violet-700"
                >
                  Örnek Analizi Gör
                </button>

                <Link
                  href="/numeroloji"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-violet-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Doğaltaş" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-teal-200/70 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/60 p-4 shadow-md ring-1 ring-teal-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(20,184,166,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-teal-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl text-white shadow-md shadow-teal-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {item.title}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  Doğaltaş kayıtları, mineral bilgileri, kombinasyonlar ve stok yönetimi tek merkezde.
                </p>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDogaltasPreviewOpen(true); }}
                  className="mt-3 w-full rounded-xl bg-teal-600 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:bg-teal-700"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/dogaltas"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-teal-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Biyoenerji" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-cyan-200/70 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60 p-4 shadow-md ring-1 ring-cyan-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-cyan-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-xl text-white shadow-md shadow-cyan-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Biyoenerji
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Enerji analizleri, bilinçaltı çalışmaları, sembol dili, çakra kütüphanesi ve seans yönetimini tek merkezden yönetin.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Biyoenerji Seansları",
                    "Enerji Bedenleri",
                    "Bilinçaltı Sebepleri",
                    "İmajinasyon Kütüphanesi",
                    "Sembol Dili",
                    "Çakra Kütüphanesi",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-cyan-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setBiyoenerjiSlide(0); setBiyoenerjiPreviewOpen(true); }}
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:from-sky-400 hover:to-cyan-500 hover:shadow-md"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/enerji-beden"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-cyan-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Kişisel Arşiv" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-yellow-200/70 bg-gradient-to-br from-yellow-50/90 via-white to-amber-50/60 p-4 shadow-md ring-1 ring-yellow-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(234,179,8,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-yellow-500 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 text-xl text-white shadow-md shadow-yellow-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Kişisel Arşiv
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Ses, video, belge, resim ve kişisel notlarınızı tek merkezde güvenle saklayın.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Ses & Video",
                    "Belge & Resim",
                    "Kişisel Notlar",
                    "Arama Sistemi",
                    "Dosya Takibi",
                    "Güvenli Arşiv",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-amber-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => setKisiselArsivPreviewOpen(true)}
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:from-yellow-400 hover:to-amber-400 hover:shadow-md"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/dashboard/kisisel-arsiv"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-amber-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Belge Çeviri" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-blue-200/70 bg-gradient-to-br from-blue-50/90 via-white to-cyan-50/60 p-4 shadow-md ring-1 ring-blue-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(59,130,246,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-blue-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-xl text-white shadow-md shadow-blue-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Belge Çeviri
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  PDF, Word ve görselleri yapay zekâ destekli şekilde dönüştürüp Türkçeye çeviren belge merkezi.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "PDF → Word",
                    "PDF → Türkçe Word",
                    "Görsel OCR",
                    "Çoklu Dil Desteği",
                    "Format Koruma",
                    "Güvenli İşlem",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-sky-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => setBelgeCeviriPreviewOpen(true)}
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:from-blue-500 hover:to-cyan-500 hover:shadow-md"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/belge-ceviri"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-sky-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Video Çeviri" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-white to-amber-50/60 p-4 shadow-md ring-1 ring-orange-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(249,115,22,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-amber-500 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Yakında
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-xl text-white shadow-md shadow-orange-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Video Çeviri
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Video ve ses dosyalarını metne çevirip Türkçeye aktararak Word/PDF çıktısı hazırlayan yapay zekâ destekli modül.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Video → Metin",
                    "Otomatik Dil Algılama",
                    "Türkçeye Çeviri",
                    "Word/PDF Çıktı",
                    "Eğitim İçeriği Hazırlama",
                    "Gizlilik Odaklı İşlem",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-orange-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3.5 w-full cursor-not-allowed rounded-xl border border-orange-200/60 bg-orange-100/50 py-2 text-center text-xs font-bold text-orange-400">
                  Yakında Kullanıma Açılacak
                </div>

                <button
                  type="button"
                  onClick={() => setVideoCeviriPreviewOpen(true)}
                  className="mt-2 inline-flex cursor-pointer items-center justify-center gap-1 text-[11px] font-semibold text-orange-600 transition hover:text-orange-800 hover:underline"
                >
                  Ekrana Göz At
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </button>
              </div>
            ) : item.title === "Danışan Yönetimi" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/60 p-4 shadow-md ring-1 ring-violet-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(124,58,237,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-violet-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-xl text-white shadow-md shadow-violet-300/30 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Danışan Yönetimi
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Danışan kayıtları, detay sayfaları ve randevu yönetimini tek merkezden yönetin.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Danışan Kayıtları",
                    "Danışan Detayları",
                    "Randevu Takibi",
                    "Ajanda Yönetimi",
                    "Görüşme Geçmişi",
                    "Takip Süreci",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-violet-600" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDanisanYonetimiSlide(0); setDanisanYonetimiPreviewOpen(true); }}
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-violet-700 to-indigo-700 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:from-violet-600 hover:to-indigo-600 hover:shadow-md"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/danisan-yolculugu"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-indigo-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Şifa Rehberi" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-green-200/70 bg-gradient-to-br from-green-50/90 via-white to-mint-50/60 p-4 shadow-md ring-1 ring-green-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(34,197,94,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-green-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 text-xl text-white shadow-md shadow-green-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Şifa Rehberi
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Rahatsızlık kayıtları, belirtiler, uygulamalar, doğaltaş, aromaterapi ve destekleyici önerileri tek merkezden yönetin.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Yeni Rahatsızlık Kaydı",
                    "Kayıtlı Şifa Rehberi",
                    "Belirtiler / Sebepler",
                    "Uygulamalar / Yöntemler",
                    "Doğaltaş & Mineral",
                    "Aromaterapi",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-green-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSifaRehberiSlide(0); setSifaRehberiPreviewOpen(true); }}
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:from-green-500 hover:to-emerald-400 hover:shadow-md"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/sifa-rehberi"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-green-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Refleksoloji" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-pink-200/70 bg-gradient-to-br from-pink-50/90 via-white to-purple-50/60 p-4 shadow-md ring-1 ring-pink-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(236,72,153,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-pink-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  Örnek Ekranlar Var
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-xl text-white shadow-md shadow-pink-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Refleksoloji
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Ayak refleksoloji atlası, protokoller, kayıtlı atlaslar, klinik notlar ve seans çalışma alanı.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Bölge Haritası",
                    "Kayıtlı Atlas",
                    "Protokol Haritası",
                    "Kayıtlı Protokoller",
                    "Klinik Notlar",
                    "Seans Takibi",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-pink-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRefleksolojiSlide(0); setRefleksolojiPreviewOpen(true); }}
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:from-pink-500 hover:to-purple-500 hover:shadow-md"
                >
                  Örnek Ekranları Gör
                </button>

                <Link
                  href="/refleksoloji"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-400 no-underline transition hover:text-pink-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  Modüle Git
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.title === "Aromaterapi" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50/90 via-white to-purple-50/60 p-4 shadow-md ring-1 ring-fuchsia-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(217,70,239,0.12)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-xl text-white shadow-md shadow-fuchsia-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {item.title}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  {item.desc}
                </p>

                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-fuchsia-700/75 transition-all duration-200 group-hover:gap-2 group-hover:text-fuchsia-800">
                  Keşfet
                  <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                </span>
              </div>
            ) : item.title === "Human Design" ? (
              <div
                key={item.title}
                className="group relative flex flex-col rounded-[22px] border border-purple-200/70 bg-gradient-to-br from-purple-50/90 via-white to-indigo-50/60 p-4 shadow-md ring-1 ring-purple-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(147,51,234,0.12)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-indigo-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  YAKINDA
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-xl text-white shadow-md shadow-purple-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  Human Design
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  Bilgi bankasına yüklediğiniz Human Design içeriklerini kullanarak danışanlarınıza kişiye özel profesyonel raporlar ve yorumlar oluşturun.
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {[
                    "Bilgi Bankası Yönetimi",
                    "Kapı ve Kanal Yorumları",
                    "Merkez Analizleri",
                    "Tip ve Profil Açıklamaları",
                    "Otomatik Rapor Oluşturma",
                    "Kişiye Özel Raporlar",
                  ].map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-indigo-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3.5 w-full cursor-not-allowed rounded-xl border border-purple-200/60 bg-purple-100/50 py-2 text-center text-xs font-bold text-purple-500">
                  Yakında Kullanıma Açılacak
                </div>
              </div>
            ) : (
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
            )
          )}
          </div>
        </section>

        {/* — Mobile App Section — */}
        <section data-fade className="mt-8 w-full max-w-none">
          <div className="overflow-hidden rounded-[28px] border border-emerald-200/60 bg-gradient-to-br from-emerald-50/90 via-teal-50/80 to-cyan-50/70 shadow-md ring-1 ring-emerald-100/50">
            <div className="grid grid-cols-1 items-center lg:grid-cols-[1fr_auto]">

              {/* Sol: Metin */}
              <div className="p-7 sm:p-9 lg:py-10 lg:pl-10 lg:pr-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-100/80 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                  Android Uygulaması Yayında
                </div>

                <h3 className="mt-4 text-2xl font-black leading-snug tracking-tight text-slate-950 sm:text-3xl">
                  Mobil Uygulama ile<br className="hidden sm:block" /> Her Yerden Erişim
                </h3>

                <p className="mt-3 max-w-md text-sm leading-[1.75] text-slate-600">
                  Yaşam Sistemi Android uygulamasıyla danışan kayıtlarınıza, modüllerinize ve çalışma alanlarınıza mobil cihazınızdan kolayca ulaşabilirsiniz.
                </p>

                <ul className="mt-5 space-y-2.5">
                  {[
                    "Danışan kayıtları ve randevu yönetimi",
                    "Tüm modüllere mobil erişim",
                    "Hızlı ve güvenli kullanım",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href="https://play.google.com/store/apps/details?id=com.yasamsistemi.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 text-sm font-bold text-white no-underline shadow-[0_4px_14px_rgba(5,150,105,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(5,150,105,0.45)]"
                  >
                    Android Uygulamasını Aç
                    <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                  </a>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm">
                    Google Play üzerinden erişilebilir
                  </span>
                </div>
              </div>

              {/* Sağ: Telefon mockup */}
              <div className="flex items-end justify-center px-7 pb-8 lg:items-center lg:justify-end lg:py-8 lg:pr-10">
                <div className="relative">
                  <div className="relative h-[370px] w-[195px] overflow-hidden rounded-[38px] border-[6px] border-slate-800 bg-slate-800 shadow-[0_28px_64px_rgba(15,23,42,0.30)]">
                    <div className="flex h-full w-full flex-col overflow-hidden rounded-[32px] bg-white">

                      {/* Status bar */}
                      <div className="flex shrink-0 items-center justify-between bg-white px-4 pt-2 pb-1">
                        <span className="text-[9px] font-bold text-slate-700">9:41</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-[3px] w-3.5 rounded-sm bg-slate-600" />
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        </div>
                      </div>

                      {/* Screen content */}
                      <div className="flex-1 overflow-hidden bg-white px-3 pb-3">

                        {/* App header */}
                        <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 p-2.5">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-[13px] font-black text-white shadow-sm">
                            YS
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-black text-slate-900">Yaşam Sistemi</p>
                            <p className="text-[9px] font-semibold text-emerald-600">Yaşam Sistemi</p>
                            <p className="mt-0.5 text-[10px] font-bold leading-none text-amber-400">★★★★★</p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-2 flex gap-1.5">
                          <div className="flex-1 rounded-full border border-slate-200 bg-white py-1.5 text-center text-[10px] font-bold text-slate-600">
                            Kaldır
                          </div>
                          <div className="flex-1 rounded-full bg-emerald-600 py-1.5 text-center text-[10px] font-bold text-white">
                            Aç
                          </div>
                        </div>

                        {/* Status */}
                        <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                          <p className="text-[9px] font-black text-emerald-700">Android uygulaması yayında</p>
                        </div>

                        {/* Updates */}
                        <div className="mt-2.5 px-0.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black text-slate-800">Yenilikler</p>
                            <span className="text-[8px] text-slate-400">Haz 2026</span>
                          </div>
                          <p className="mt-0.5 text-[8px] leading-4 text-slate-500">Güvenlik güncellemeleri yapıldı</p>
                        </div>

                        {/* Device tags */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {["Telefon", "Tablet"].map((tag) => (
                            <span key={tag} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-semibold text-slate-600">
                              <Check className="h-1.5 w-1.5 text-emerald-500" strokeWidth={3} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Home indicator */}
                    <div className="absolute bottom-1.5 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-slate-600/80" aria-hidden />
                  </div>

                  {/* Glow */}
                  <div className="absolute -bottom-3 left-1/2 h-10 w-32 -translate-x-1/2 rounded-full bg-emerald-300/50 blur-xl" aria-hidden />
                </div>
              </div>

            </div>
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

      {numerologiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setNumerologiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Numeroloji modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setNumerologiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>
            {/* Modal header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-violet-200/70 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                Numeroloji Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Numeroloji Analizi — Ürün Ön İzlemesi
              </h4>
              <p className="mt-1 text-sm text-slate-400">Doğum tarihinizden yaşam haritanızı çıkarın, detaylı analizleri gözlemleyin.</p>
            </div>
            <div className="overflow-hidden rounded-xl">
              <img
                src="/assets/numeroloji-preview.png"
                alt="Numeroloji Modülü — Ön İzleme"
                className="w-full rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

      {dogaltasPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setDogaltasPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Doğaltaş modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDogaltasPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">
                Doğaltaş Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Doğaltaş Modülü — Gerçek Ürün Ekranları
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Kayıt, arama, filtreleme, kombinasyon ve bilgi yönetimini tek merkezden yönetin.
              </p>
            </div>

            {/* Preview image */}
            <div className="overflow-hidden rounded-xl">
              <img
                src="/assets/dogaltas-preview.png"
                alt="Doğaltaş Modülü — Ön İzleme"
                className="w-full rounded-xl"
              />
            </div>

            {/* Description + feature badges */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Doğaltaş Modülü ile Tüm Taş Verilerinizi Tek Merkezden Yönetin
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Doğaltaş Modülü; taş kayıtları, mineral bankası, kombinasyon yönetimi, gelişmiş
                arama ve filtreleme araçlarıyla tüm verilerinizi tek merkezde toplar. Yüzlerce
                kayıt arasında saniyeler içinde arama yapabilir, kategorilere göre filtreleme
                uygulayabilir ve detaylı taş bilgilerine kolayca erişebilirsiniz.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  "Taş Kayıt Yönetimi",
                  "Mineral Bankası",
                  "Kombinasyon Yönetimi",
                  "Akıllı Arama",
                  "Kategori Filtreleme",
                  "Detay Sayfaları",
                  "İstatistikler",
                  "Görsel Arşivi",
                ].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {kisiselArsivPreviewOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setKisiselArsivPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Kişisel Arşiv modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setKisiselArsivPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                Kişisel Arşiv Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Kişisel Arşiv — Gerçek Ürün Ekranı
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Ses, video, belge, resim ve notlarınızı tek merkezde güvenle saklayın.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/kisisel-arsiv-preview.png"
                alt="Kişisel Arşiv Önizleme"
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Kişisel Arşiv ile Güvenli Kayıt Sistemi
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Her türlü kişisel dosyayı kategorilere göre saklayın, arayın ve takip edin.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["Ses & Video", "Belge & Resim", "Kişisel Notlar", "Arama Sistemi", "Dosya Takibi", "Güvenli Arşiv"].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-amber-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {belgeCeviriPreviewOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setBelgeCeviriPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Belge Çeviri modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setBelgeCeviriPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">
                Belge Çeviri Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Belge Çeviri — Gerçek Ürün Ekranı
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                PDF, Word ve görselleri yapay zekâ ile dönüştürün, Türkçeye çevirin.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/belge-ceviri-preview.png"
                alt="Belge Çeviri Önizleme"
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Belge Çeviri ile Hızlı Dönüşüm
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                PDF belgelerini Word'e dönüştürün, Türkçeye çevirin; taranmış görsellerden metin okuyun.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["PDF → Word", "PDF → Türkçe Word", "Görsel OCR", "Çoklu Dil Desteği", "Format Koruma", "Güvenli İşlem"].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-sky-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {videoCeviriPreviewOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setVideoCeviriPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Video Çeviri modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setVideoCeviriPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                Yakında — Geliştirme Aşamasında
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Video Çeviri — Modül Ön İzlemesi
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Video yükleyin; konuşma otomatik metne çevrilir, Türkçeye aktarılır ve Word ile PDF olarak indirilebilir hale gelir.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/video-ceviri-preview.png"
                alt="Video Çeviri Önizleme"
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-base">
                  ⚠️
                </span>
                <div>
                  <p className="text-sm font-black text-white">Geliştirme Aşamasında</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Bu modül aktif kullanıma açılmadan önce altyapı ve üyelik planları tamamlanacaktır.
                    Dosya limitleri altyapı paketine göre artırılacaktır.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["Video → Metin", "Otomatik Dil Algılama", "Türkçeye Çeviri", "Word/PDF Çıktı", "Eğitim İçeriği Hazırlama", "Gizlilik Odaklı İşlem"].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-violet-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {danisanYonetimiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setDanisanYonetimiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Danışan Yönetimi modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDanisanYonetimiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-300">
                Danışan Yönetimi Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Danışan Yönetimi — Gerçek Ürün Ekranları
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Danışan kayıtları, randevu ve ajanda yönetimini tek merkezden yönetin.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-indigo-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-indigo-300">
                  {danisanYonetimiGallerySlides[danisanYonetimiSlide].label}
                </span>
                <span className="text-[10px] text-slate-500">
                  {danisanYonetimiSlide + 1} / {danisanYonetimiGallerySlides.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setDanisanYonetimiSlide((s) => (s - 1 + danisanYonetimiGallerySlides.length) % danisanYonetimiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-indigo-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label="Önceki ekran"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setDanisanYonetimiSlide((s) => (s + 1) % danisanYonetimiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-indigo-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label="Sonraki ekran"
              >
                ›
              </button>

              <div className="relative">
                <img
                  key={danisanYonetimiGallerySlides[danisanYonetimiSlide].src}
                  src={danisanYonetimiGallerySlides[danisanYonetimiSlide].src}
                  alt={"Danışan Yönetimi — " + danisanYonetimiGallerySlides[danisanYonetimiSlide].label}
                  className="w-full"
                />
                {danisanYonetimiGallerySlides[danisanYonetimiSlide].cover && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent px-5 py-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">
                      Danışan Yönetimi
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-white">
                      Danışan Yolculuğu — Genel Bakış
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              {danisanYonetimiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setDanisanYonetimiSlide(idx)}
                  className={"rounded-full transition-all duration-200 " + (idx === danisanYonetimiSlide ? "h-1.5 w-5 bg-indigo-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400")}
                  aria-label={slide.label}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Danışan Yönetimi ile Profesyonel Takip Sistemi
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Danışan kayıtları, detay sayfaları, randevu ve ajanda yönetimini tek merkezden yönetin.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["Danışan Kayıtları", "Danışan Detayları", "Randevu Takibi", "Ajanda Yönetimi", "Görüşme Geçmişi", "Takip Süreci"].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-indigo-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {sifaRehberiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setSifaRehberiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Şifa Rehberi modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSifaRehberiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
                Şifa Rehberi Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Şifa Rehberi — Gerçek Ürün Ekranları
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Rahatsızlık kayıtları, belirtiler, uygulamalar ve destekleyici önerileri tek merkezden yönetin.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-emerald-300">
                  {sifaRehberiGallerySlides[sifaRehberiSlide].label}
                </span>
                <span className="text-[10px] text-slate-500">
                  {sifaRehberiSlide + 1} / {sifaRehberiGallerySlides.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSifaRehberiSlide((s) => (s - 1 + sifaRehberiGallerySlides.length) % sifaRehberiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label="Önceki ekran"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setSifaRehberiSlide((s) => (s + 1) % sifaRehberiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label="Sonraki ekran"
              >
                ›
              </button>

              <img
                key={sifaRehberiGallerySlides[sifaRehberiSlide].src}
                src={sifaRehberiGallerySlides[sifaRehberiSlide].src}
                alt={"Şifa Rehberi — " + sifaRehberiGallerySlides[sifaRehberiSlide].label}
                className="w-full"
              />
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5">
              {sifaRehberiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setSifaRehberiSlide(idx)}
                  className={"rounded-full transition-all duration-200 " + (idx === sifaRehberiSlide ? "h-1.5 w-5 bg-emerald-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400")}
                  aria-label={slide.label}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Şifa Rehberi ile Kapsamlı Destek Yönetimi
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Rahatsızlık kayıtları, belirtiler, sebepler, uygulamalar, doğaltaş ve aromaterapi
                önerilerini tek merkezden yönetin.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["Yeni Rahatsızlık Kaydı", "Kayıtlı Şifa Rehberi", "Belirtiler / Sebepler", "Uygulamalar / Yöntemler", "Doğaltaş & Mineral", "Aromaterapi"].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {refleksolojiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setRefleksolojiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Refleksoloji modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kapat */}
            <button
              type="button"
              onClick={() => setRefleksolojiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">
                Refleksoloji Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Refleksoloji — Gerçek Ürün Ekranları
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Atlas, protokol, klinik notlar ve bölge haritasından oluşan profesyonel seans sistemi.
              </p>
            </div>

            {/* Galeri */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              {/* Slide etiketi */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-violet-300">
                  {refleksolojiGallerySlides[refleksolojiSlide].label}
                </span>
                <span className="text-[10px] text-slate-500">
                  {refleksolojiSlide + 1} / {refleksolojiGallerySlides.length}
                </span>
              </div>

              {/* Önceki */}
              <button
                type="button"
                onClick={() => setRefleksolojiSlide((s) => (s - 1 + refleksolojiGallerySlides.length) % refleksolojiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-violet-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label="Önceki ekran"
              >
                ‹
              </button>

              {/* Sonraki */}
              <button
                type="button"
                onClick={() => setRefleksolojiSlide((s) => (s + 1) % refleksolojiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-violet-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label="Sonraki ekran"
              >
                ›
              </button>

              {/* Görsel */}
              <img
                key={refleksolojiGallerySlides[refleksolojiSlide].src}
                src={refleksolojiGallerySlides[refleksolojiSlide].src}
                alt={"Refleksoloji — " + refleksolojiGallerySlides[refleksolojiSlide].label}
                className="w-full"
              />
            </div>

            {/* Nokta göstergeler */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {refleksolojiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setRefleksolojiSlide(idx)}
                  className={"rounded-full transition-all duration-200 " + (idx === refleksolojiSlide ? "h-1.5 w-5 bg-violet-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400")}
                  aria-label={slide.label}
                />
              ))}
            </div>

            {/* Özellik paneli */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Refleksoloji Modülü ile Profesyonel Seans Sistemi
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Bölge haritası, kayıtlı atlas, protokol yönetimi, klinik notlar ve seans takibiyle
                eksiksiz bir refleksoloji çalışma ortamı sunar.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["Bölge Haritası", "Kayıtlı Atlas", "Protokol Haritası", "Kayıtlı Protokoller", "Klinik Notlar", "Seans Takibi"].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-violet-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {biyoenerjiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/82 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setBiyoenerjiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Biyoenerji modülü ön izlemesi"
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setBiyoenerjiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label="Kapat"
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                Biyoenerji Modülü
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                Biyoenerji — Gerçek Ürün Ekranları
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Seans yönetimi, enerji bedenleri, bilinçaltı, semboller ve çakralardan oluşan kapsamlı çalışma sistemi.
              </p>
            </div>

            {/* Gallery */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              {/* Slide label + counter */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-cyan-300">
                  {biyoenerjiGallerySlides[biyoenerjiSlide].label}
                </span>
                <span className="text-[10px] text-slate-500">
                  {biyoenerjiSlide + 1}&thinsp;/&thinsp;{biyoenerjiGallerySlides.length}
                </span>
              </div>

              {/* Prev */}
              <button
                type="button"
                onClick={() => setBiyoenerjiSlide(s => (s - 1 + biyoenerjiGallerySlides.length) % biyoenerjiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white hover:bg-slate-800/80"
                aria-label="Önceki ekran"
              >
                ‹
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={() => setBiyoenerjiSlide(s => (s + 1) % biyoenerjiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white hover:bg-slate-800/80"
                aria-label="Sonraki ekran"
              >
                ›
              </button>

              <img
                key={biyoenerjiGallerySlides[biyoenerjiSlide].src}
                src={biyoenerjiGallerySlides[biyoenerjiSlide].src}
                alt={`Biyoenerji Modülü — ${biyoenerjiGallerySlides[biyoenerjiSlide].label}`}
                className="w-full"
              />
            </div>

            {/* Dot indicators */}
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {biyoenerjiGallerySlides.map((slide, idx) => (
                <button
                  key={slide.label}
                  type="button"
                  onClick={() => setBiyoenerjiSlide(idx)}
                  className={`rounded-full transition-all duration-200 ${idx === biyoenerjiSlide ? "h-1.5 w-5 bg-cyan-400" : "h-1.5 w-1.5 bg-slate-600 hover:bg-slate-400"}`}
                  aria-label={slide.label}
                  aria-current={idx === biyoenerjiSlide ? "true" : undefined}
                />
              ))}
            </div>

            {/* Feature panel */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                Biyoenerji Modülü ile Kapsamlı Enerji Çalışması
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Biyoenerji Modülü; seans yönetimi, enerji bedenleri analizi, bilinçaltı sebepleri kütüphanesi,
                imajinasyon rehberleri, sembol dili ve çakra kütüphanesiyle bütünsel bir çalışma sistemi sunar.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  "Biyoenerji Seansları",
                  "Enerji Bedenleri",
                  "Bilinçaltı Sebepleri",
                  "İmajinasyon Kütüphanesi",
                  "Sembol Dili",
                  "Çakra Kütüphanesi",
                ].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-700/30 px-3 py-2 text-xs font-medium text-slate-300"
                  >
                    <Check className="h-3 w-3 shrink-0 text-cyan-400" strokeWidth={2.5} />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
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

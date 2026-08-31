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
  normalizeApprovalStatus,
  parseLoginUserRecord,
  readYasamUser,
  readSessionToken,
  saveYasamUser,
  saveSessionToken,
  type YasamUser,
} from "@/lib/auth/yasamUser";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import {
  getModuleLockReason,
  hasAnyModulePermissionFlag,
  hasModulePermission,
  LOCKED_PERMISSION_TOAST,
  COMING_SOON_MODULE_KEYS,
  type ModuleLockReason,
  type ModulePermissionKey,
} from "@/lib/auth/modulePermissions";
import { supabase } from "@/lib/supabase";
import { getPlanetaryHour } from "@/lib/cosmic/planetary-hours";
import { getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getSunSignInfo } from "@/lib/cosmic/planets";
import { useToast } from "@/components/ui/ToastProvider";
import { useTranslations, useLocale, useMessages } from "next-intl";
import { localeTag } from "@/lib/i18n/format";
import type { ActiveLocale } from "@/lib/i18n/locales";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkBeslenmeAccess } from "@/lib/beslenme/beslenmeClient";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  Gem,
  Layers,
  Leaf,
  Loader2,
  Lock,
  Package,
  Salad,
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

// Görünen başlık/açıklama/sayaç i18n'den `home.modules.<permissionKey>.*` ile gelir.
// permissionKey canonical'dır (izin/kilit mantığı buna bağlı) → DEĞİŞMEZ.
type ModuleCard = {
  href: string;
  permissionKey: ModulePermissionKey;
  /**
   * Çok-modüllü hub kartı için AÇIK OR izin listesi. Verildiğinde kartın görünürlüğü
   * ve kilit kararı bu anahtarlardan HERHANGİ biriyle (hasAnyModulePermissionFlag)
   * belirlenir; permissionKey yalnız tip/stat/tarih araması için placeholder kalır.
   * Global permission alias semantiği DEĞİŞTİRİLMEZ (aroma izni ≠ şifa izni).
   */
  anyPermissionKeys?: string[];
  emoji: string;
  featured?: boolean;
  /** Bu modülün i18n `.stat` sayaç metni var mı (n interpolasyonlu). */
  hasStat?: boolean;
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

// slug = branch/dallanma anahtarı (canonical; render koşulları buna bağlı).
// titleKey/descKey = i18n anahtarları (görünen metin).
type LandingModule = {
  slug: string;
  titleKey: string;
  descKey: string;
  icon: string;
};

type FeatureItem = {
  slug: string;
  titleKey: string;
  descKey: string;
  icon: string;
};

const landingModules: LandingModule[] = [
  { slug: "danisanYonetimi", titleKey: "landing.danisanYonetimi.title", descKey: "landing.danisanYonetimi.desc", icon: "👥" },
  { slug: "dogaltas",        titleKey: "landing.dogaltas.title",        descKey: "landing.dogaltas.desc",        icon: "💎" },
  { slug: "biyoenerji",      titleKey: "landing.biyoenerji.title",      descKey: "landing.biyoenerji.desc",      icon: "✨" },
  { slug: "refleksoloji",    titleKey: "landing.refleksoloji.title",    descKey: "landing.refleksoloji.desc",    icon: "🦶" },
  { slug: "aromaterapi",     titleKey: "landing.aromaterapi.title",     descKey: "landing.aromaterapi.desc",     icon: "🌸" },
  { slug: "sifaRehberi",     titleKey: "landing.sifaRehberi.title",     descKey: "landing.sifaRehberi.desc",     icon: "🌿" },
  { slug: "numeroloji",      titleKey: "landing.numeroloji.title",      descKey: "landing.numeroloji.desc",      icon: "🔢" },
  { slug: "videoCeviri",     titleKey: "landing.videoCeviri.title",     descKey: "landing.videoCeviri.desc",     icon: "🎬" },
  { slug: "belgeCeviri",     titleKey: "landing.belgeCeviri.title",     descKey: "landing.belgeCeviri.desc",     icon: "📄" },
  { slug: "kisiselArsiv",    titleKey: "landing.kisiselArsiv.title",    descKey: "landing.kisiselArsiv.desc",    icon: "🗂️" },
  { slug: "humanDesign",     titleKey: "landing.humanDesign.title",     descKey: "landing.humanDesign.desc",     icon: "🔮" },
];

// i18n anahtarları (görünen metin t ile çözülür).
const trustPrincipleKeys: string[] = [
  "trust.principle1",
  "trust.principle2",
  "trust.principle3",
  "trust.principle4",
];

const featureItems: FeatureItem[] = [
  { slug: "guvenli",   titleKey: "featureItems.guvenli.title",   descKey: "featureItems.guvenli.desc",   icon: "🔒" },
  { slug: "analiz",    titleKey: "featureItems.analiz.title",    descKey: "featureItems.analiz.desc",    icon: "📈" },
  { slug: "webMobil",  titleKey: "featureItems.webMobil.title",  descKey: "featureItems.webMobil.desc",  icon: "📱" },
  { slug: "yedekleme", titleKey: "featureItems.yedekleme.title", descKey: "featureItems.yedekleme.desc", icon: "☁️" },
  { slug: "moduler",   titleKey: "featureItems.moduler.title",   descKey: "featureItems.moduler.desc",   icon: "🧩" },
];

// label = görünen etiketin i18n anahtarı (home.gallery.<mod>.<n> dizisine index).
// src/cover DEĞİŞMEZ (asset yolu / kapak bayrağı).
const danisanYonetimiGallerySlides = [
  { label: "gallery.danisanYonetimi.0", src: "/assets/danisan-yolculugu.png",    cover: true },
  { label: "gallery.danisanYonetimi.1", src: "/assets/danisan-yeni-kayit.png",   cover: false },
  { label: "gallery.danisanYonetimi.2", src: "/assets/danisan-listesi.png",      cover: false },
  { label: "gallery.danisanYonetimi.3", src: "/assets/danisan-ajanda.png",       cover: false },
  { label: "gallery.danisanYonetimi.4", src: "/assets/danisan-yeni-randevu.png", cover: false },
];

const sifaRehberiGallerySlides = [
  { label: "gallery.sifaRehberi.0", src: "/assets/sifa-rehberi-tanitim.png" },
  { label: "gallery.sifaRehberi.1", src: "/assets/sifa-rehberi-ana-menu.png" },
  { label: "gallery.sifaRehberi.2", src: "/assets/sifa-rehberi-yeni-kayit.png" },
  { label: "gallery.sifaRehberi.3", src: "/assets/sifa-rehberi-destekleyici.png" },
  { label: "gallery.sifaRehberi.4", src: "/assets/sifa-rehberi-liste.png" },
  { label: "gallery.sifaRehberi.5", src: "/assets/sifa-rehberi-detay.png" },
];

const refleksolojiGallerySlides = [
  { label: "gallery.refleksoloji.0", src: "/assets/refleksoloji-tanitim.png" },
  { label: "gallery.refleksoloji.1", src: "/assets/refleksoloji-anamenu.png" },
  { label: "gallery.refleksoloji.2", src: "/assets/refleksoloji-bolge-haritasi.png" },
  { label: "gallery.refleksoloji.3", src: "/assets/refleksoloji-kayitli-atlas.png" },
  { label: "gallery.refleksoloji.4", src: "/assets/refleksoloji-protokol-haritasi.png" },
  { label: "gallery.refleksoloji.5", src: "/assets/refleksoloji-kayitli-protokoller.png" },
  { label: "gallery.refleksoloji.6", src: "/assets/refleksoloji-klinik-notlar.png" },
];

const biyoenerjiGallerySlides = [
  { label: "gallery.biyoenerji.0", src: "/assets/biyoenerji-tanitim.png" },
  { label: "gallery.biyoenerji.1", src: "/assets/biyoenerji-anasayfa.png" },
  { label: "gallery.biyoenerji.2", src: "/assets/biyoenerji-seanslar.png" },
  { label: "gallery.biyoenerji.3", src: "/assets/biyoenerji-enerji-bedenleri.png" },
  { label: "gallery.biyoenerji.4", src: "/assets/biyoenerji-bilincoltu.png" },
  { label: "gallery.biyoenerji.5", src: "/assets/biyoenerji-imajinasyon.png" },
  { label: "gallery.biyoenerji.6", src: "/assets/biyoenerji-sembol.png" },
  { label: "gallery.biyoenerji.7", src: "/assets/biyoenerji-cakra.png" },
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
    href: "/danisan-yolculugu",
    permissionKey: "clients",
    emoji: "👥",
    featured: true,
    hasStat: true,
    Icon: UsersRound,
    theme: {
      iconWrap: "from-indigo-500 to-blue-600",
      cardBg: "from-blue-100/90 via-sky-50/95 to-white",
      border: "border-blue-200/70",
    },
  },
  {
    href: "/yasam-hafizasi",
    permissionKey: "yasam_hafizasi",
    emoji: "🧠",
    Icon: Brain,
    theme: {
      iconWrap: "from-violet-500 to-emerald-600",
      cardBg: "from-violet-100/90 via-indigo-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
    href: "/dogaltas",
    permissionKey: "stones",
    emoji: "💎",
    featured: true,
    hasStat: true,
    Icon: Gem,
    theme: {
      iconWrap: "from-cyan-500 to-teal-500",
      cardBg: "from-cyan-100/90 via-teal-50/95 to-white",
      border: "border-teal-200/70",
    },
  },
  {
    href: "/urun-stok",
    permissionKey: "stok",
    emoji: "📦",
    hasStat: true,
    Icon: Package,
    theme: {
      iconWrap: "from-amber-500 to-orange-500",
      cardBg: "from-amber-100/90 via-orange-50/95 to-white",
      border: "border-amber-200/70",
    },
  },
  {
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
    href: "/dogal-destek",
    // Görünürlük AÇIK OR ile: Aromaterapi VEYA Şifa Rehberi izni yeterli. permissionKey
    // yalnız tip placeholder'ı (stat/tarih yok); gerçek karar anyPermissionKeys üzerinden.
    // Görünen başlık/açıklama i18n'den `home.modules.sifa_rehberi.*` ile gelir.
    permissionKey: "sifa_rehberi",
    anyPermissionKeys: ["aromatherapy", "aromaterapi", "sifa_rehberi", "healing"],
    emoji: "🌿",
    Icon: Leaf,
    theme: {
      iconWrap: "from-emerald-500 to-teal-600",
      cardBg: "from-emerald-100/90 via-teal-50/95 to-white",
      border: "border-emerald-200/70",
    },
  },
  {
    href: "/digital-content",
    permissionKey: "digital_content",
    emoji: "📚",
    hasStat: true,
    Icon: Layers,
    theme: {
      iconWrap: "from-indigo-600 to-sky-600",
      cardBg: "from-indigo-50/90 via-sky-50/95 to-white",
      border: "border-indigo-200/70",
    },
  },
  {
    href: "/life-analysis",
    permissionKey: "numerology",
    emoji: "🧠",
    hasStat: true,
    Icon: Brain,
    theme: {
      iconWrap: "from-violet-600 to-purple-700",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  {
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
  // Enerji & Beden umbrella'sı artık Aromaterapi'yi KAPSAMAZ (Doğal Destek'e taşındı).
  // aromatherapy/aromaterapi alias'ları kaldırıldı; Biyoenerji + Refleksoloji kalır.
  energy_body: [
    "biyoenerji",
    "reflexology",
    "refleksoloji",
  ],
  personal_archive: ["kisisel_arsiv"],
  video_ceviri: [],
  belge_ceviri: [],
  ders_notu: [],
  human_design: [],
  digital_content: ["personal_archive", "video_ceviri", "belge_ceviri", "ders_notu", "kisisel_arsiv"],
  cosmic_calendar: [],
  yasam_hafizasi: [],
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

  // Çok-modüllü hub kartı (ör. Doğal Destek & Rehber): AÇIK OR — anahtarlardan
  // herhangi biri yeterli. Global alias semantiği değişmeden merkezî yardımcı reuse.
  if (item.anyPermissionKeys) {
    return hasAnyModulePermissionFlag(user, item.anyPermissionKeys);
  }

  const key = item.permissionKey;

  // P3: Premium otomatik-tüm-modül bypass'ı KALDIRILDI — kişiye özel izinlere dayanır
  // (mevcut Premium izinleri migration 20260919 ile backfill edildi). Server ayrıca zorlar.
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

/**
 * Çok-modüllü hub kartı için kilit kararı — getModuleLockReason'ın OR karşılığı.
 * Anahtarlardan herhangi biri açıksa kilit yok; hiçbiri yoksa "permission".
 * coming_soon burada geçersiz (hub kartı yakında-modül değil).
 */
function getAnyPermissionLockReason(
  user: YasamUser | null | undefined,
  keys: string[],
  hasHref: boolean,
  subscriptionOpen: boolean,
): ModuleLockReason {
  if (!hasHref) return null;
  if (!subscriptionOpen) return "subscription";
  if (!hasAnyModulePermissionFlag(user, keys)) return "permission";
  return null;
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



// i18n translator tipi — modül-seviyesi saf fonksiyonlara/bileşenlere t geçirmek için.
type T = ReturnType<typeof useTranslations>;

function fmtRelDate(iso: string, t: T, bcp47: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return t("rel.justNow");
  if (mins < 60) return t("rel.minsAgo", { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("rel.hrsAgo", { hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t("rel.daysAgo", { days });
  // >30 gün: locale-aware kısa tarih (ay adı locale'e göre; TR "24 Ağu", EN "24 Aug").
  return new Date(iso).toLocaleDateString(bcp47, { day: "numeric", month: "short" });
}

function getDayGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "İyi Geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi Günler";
  return "İyi Akşamlar";
}

// ─── Dashboard components ──────────────────────────────────────────────────────

function LivePanel({ date }: { date: Date | null }) {
  const t = useTranslations("home");
  const messages = useMessages() as {
    home?: { livePanel?: { display?: Record<string, Record<string, string>> } };
  };
  // Canonical (persisted/computed) TR adlar → locale'e uygun görüntü etiketi.
  // Harita yalnız DISPLAY katmanıdır; motor/canonical değerler DEĞİŞMEZ.
  // Eksik/bilinmeyen ad → ham canonical'a düşer (güvenli fallback).
  const displayMaps = messages?.home?.livePanel?.display ?? {};
  const dispName = (kind: "zodiac" | "moonPhase" | "planet", name: string): string =>
    displayMaps?.[kind]?.[name] ?? name;
  date = date ?? new Date();
  const phase = getMoonPhase(date);
  const sun = getSunSignInfo(date);
  const moon = getMoonSign(date);
  const planetary = getPlanetaryHour(date);
  const numDay = numerologicalDay(date);
  const numDesc = t(`numDesc.${numDay}`);

  function fmtTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const rows = [
    { label: t("livePanel.sunSign"),    value: `${sun.emoji} ${dispName("zodiac", sun.name)}` },
    { label: t("livePanel.moonSign"),   value: `${moon.emoji} ${dispName("zodiac", moon.name)}` },
    { label: t("livePanel.moonPhase"),  value: `${phase.emoji} ${dispName("moonPhase", phase.name)}` },
    { label: t("livePanel.numerology"), value: `🔢 ${numDay} · ${numDesc}` },
    {
      label: t("livePanel.planetaryHour"),
      value: `${planetary.aktifGezegen.symbol} ${dispName("planet", planetary.aktifGezegen.name)}`,
      sub: t("livePanel.planetarySub", { start: fmtTime(planetary.hourStart), end: fmtTime(planetary.hourEnd), mins: planetary.kalanDakika }),
    },
  ];

  return (
    <div className="rounded-2xl border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur-md">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
        {t("livePanel.title")}
      </p>

      <div className="space-y-0.5">
        {rows.map(({ label, value, sub }, i) => (
          <div
            key={label}
            className={`flex items-start justify-between gap-3 rounded-lg px-2.5 py-1.5 ${
              i % 2 === 0 ? "bg-slate-50/70" : "bg-transparent"
            }`}
          >
            <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
            <div className="min-w-0 text-right">
              <span className="text-[11px] font-black text-slate-800">{value}</span>
              {sub ? (
                <p className="text-xs tabular-nums text-slate-500">{sub}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthBootScreen() {
  const t = useTranslations("home");
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
        <p className="text-lg font-black text-slate-900">{t("boot.preparing")}</p>
        <p className="text-sm font-medium text-slate-600">{t("boot.checkingSession")}</p>
      </div>
    </main>
  );
}

export default function Home() {
  const t = useTranslations("home");
  const locale = useLocale() as ActiveLocale;
  const bcp47 = localeTag(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<YasamUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Modül izinleri (package_type / module_permissions) login_user RPC'de DÖNMEZ;
  // yalnızca token'lı /api/auth/profile sync'inden gelir. profileSynced true olana
  // kadar modül kartları render EDİLMEZ (skeleton gösterilir) — aksi halde eksik
  // veri ile yanlışlıkla yalnızca 2 kart basılır. profileError sync başarısızsa true.
  const [profileSynced, setProfileSynced] = useState(false);
  const [profileError, setProfileError] = useState(false);
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
  const [adminNavLoading, setAdminNavLoading] = useState(false);
  // Beslenme OWNER-ONLY (super-admin) kart görünürlüğü. isAdminUser TEK BAŞINA yetmez;
  // gerçek owner (users.is_super_admin) server probe'u (/api/beslenme/access) ile doğrulanır.
  // Default hidden → owner doğrulanırsa render (normal admin/expert asla görmez; fail-closed).
  const [beslenmeOwner, setBeslenmeOwner] = useState(false);
  const loginBackdropPressed = useRef(false);
  const loginModalRef = useRef<HTMLDivElement>(null);
  const adminCookiePromiseRef = useRef<Promise<void> | null>(null);

  useSessionGuard({
    user,
    onSessionInvalid: () => {
      clearYasamUser();
      setUser(null);
      setLoginModalOpen(true);
      setMessage(t("auth.sessionInvalid"));
    },
  });

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

  // Beslenme owner-only kart: yalnız admin için server owner-probe (super-admin). Fail-closed.
  useEffect(() => {
    if (!user || !isAdminUser(user)) {
      setBeslenmeOwner(false);
      return;
    }
    let alive = true;
    void checkBeslenmeAccess().then((ok) => {
      if (alive) setBeslenmeOwner(ok === true);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    const stored = readYasamUser();
    if (!stored) {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    setUser(stored);
    setAuthLoading(false);

    // ── ADMIN ── gating'e tabi değil; hızlı render + arka planda tazele.
    if (isAdminUser(stored)) {
      setProfileSynced(true);
      // Cookie refresh DB sync'ten önce (paralel) başlatılıyor.
      adminCookiePromiseRef.current = fetch("/api/auth/admin-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: stored.id }),
      }).then(() => {}).catch(() => {});
      void syncYasamUserFromDb(stored).then((fresh) => {
        if (fresh) setUser(fresh);
      });
      return;
    }

    // ── EXPERT ── Erişim kararı yalnızca geçerli oturum token'ıyla
    // /api/auth/profile üzerinden alınmış GÜNCEL profile dayanmalı.
    // Bayat localStorage kaydı tek başına "doğrulanmış" sayılmaz:
    // profileSynced yalnız gerçek fetch başarılıysa true olur.
    const token = readSessionToken();
    if (!token) {
      // Token yok → eski kullanıcı verisi doğrulanmış kabul edilemez.
      // Erişim reddi (eski membership snapshot'ı) ÜRETME; güvenli
      // "yeniden dene" ekranını göster. Logout/yönlendirme döngüsü yok.
      setProfileError(true);
      return;
    }
    void syncYasamUserFromDb(stored, { force: true }).then((fresh) => {
      if (fresh) {
        setUser(fresh);
        setProfileSynced(true);
      } else {
        // Profil doğrulanamadı (fetch başarısız / oturum geçersiz).
        // Eski veriyle erişim kararı verme; güvenli hata/yeniden-dene ekranı.
        setProfileError(true);
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

    const FOCUSABLE =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLoginModal();
        return;
      }
      if (event.key === "Tab" && loginModalRef.current) {
        const els = Array.from(
          loginModalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
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
    // clients RLS-korumalı; anon HEAD count 401 verir → güvenli /api/clients hattından say.
    const token = readSessionToken();
    const authHeaders: Record<string, string> = {
      "x-user-id": user.id ?? "",
      ...(token ? { "x-session-token": token } : {}),
    };

    void Promise.allSettled(
      entries.map(async ([key, table]) => {
        if (table === "clients") {
          const res = await fetch("/api/clients", { headers: authHeaders });
          if (!res.ok) return { key, count: null };
          const json = (await res.json()) as { clients?: unknown[] };
          return { key, count: json.clients?.length ?? null };
        }
        // numerology_analyses anon ile sayılmaz → güvenli sunucu kapısı.
        if (table === "numerology_analyses") {
          const res = await fetch("/api/numeroloji/analyses?count=1", { headers: authHeaders });
          if (!res.ok) return { key, count: null };
          const json = (await res.json()) as { count?: number };
          return { key, count: typeof json.count === "number" ? json.count : null };
        }
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
    // clients RLS-korumalı + isim ad/soyad kolonlarında → güvenli /api/clients hattı.
    // Diğerleri anon-okunabilir; stones'ta isim kolonu `stone_name`.
    const token = readSessionToken();
    const authHeaders: Record<string, string> = {
      "x-user-id": user.id ?? "",
      ...(token ? { "x-session-token": token } : {}),
    };
    const directSources: { table: string; icon: string; col: string }[] = [
      { table: "stones",              icon: "💎", col: "stone_name" },
      { table: "personal_archives",   icon: "📚", col: "title" },
    ];

    const clientsSource = (async (): Promise<RawItem[]> => {
      const res = await fetch("/api/clients", { headers: authHeaders });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        clients?: { ad?: string | null; soyad?: string | null; created_at?: string | null }[];
      };
      return (json.clients ?? []).slice(0, 3).map((c) => ({
        icon: "👥",
        label: `${c.ad ?? ""} ${c.soyad ?? ""}`.trim() || t("dashboard.newRecord"),
        rawDate: String(c.created_at ?? ""),
      }));
    })();

    // numerology_analyses anon ile okunmaz → güvenli sunucu kapısı.
    const numerologySource = (async (): Promise<RawItem[]> => {
      const res = await fetch("/api/numeroloji/analyses?recent=3", { headers: authHeaders });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        rows?: { full_name?: string | null; created_at?: string | null }[];
      };
      return (json.rows ?? []).map((r) => ({
        icon: "🧠",
        label: String(r.full_name ?? t("dashboard.newRecord")).trim() || t("dashboard.newRecord"),
        rawDate: String(r.created_at ?? ""),
      }));
    })();

    void Promise.allSettled([
      clientsSource,
      numerologySource,
      ...directSources.map(async ({ table, icon, col }): Promise<RawItem[]> => {
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
            label: String(r[col] ?? t("dashboard.newRecord")).trim() || t("dashboard.newRecord"),
            rawDate: String(r["created_at"] ?? ""),
          } satisfies RawItem;
        });
      }),
    ]).then((results) => {
      if (cancelled) return;
      const all: RawItem[] = results
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => (r as PromiseFulfilledResult<RawItem[]>).value);
      all.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
      setRecentActivity(
        all.slice(0, 5).map((item) => ({ ...item, relDate: fmtRelDate(item.rawDate, t, bcp47) })),
      );
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.tenant_id, t]);

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
      setMessage(t("auth.emailPasswordRequired"));
      return;
    }

    setLoading(true);
    setMessage(t("auth.loggingIn"));

    const attempt = await loginWithCredentials(trimmedEmail, trimmedPassword);

    if (attempt.rpcError) {
      setMessage(t("auth.systemError"));
      setLoading(false);
      return;
    }

    if (attempt.rows.length === 0) {
      setMessage(t("auth.emailPasswordWrong"));
      setLoading(false);
      return;
    }

    let loggedUser = parseLoginUserRecord(attempt.rows[0]);

    if (!loggedUser) {
      setMessage(t("auth.noValidRole"));
      setLoading(false);
      return;
    }

    const freshUser = await syncYasamUserFromDb(loggedUser, { force: true });
    if (!freshUser) {
      setMessage(t("auth.userVerifyFailed"));
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

    // Oturum kaydı oluştur (güvenlik kontrolü + P3 cihaz/oturum limiti)
    let isSuspiciousLogin = false;
    try {
      const sessionRes = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: loggedUser.id }),
      });
      // P3 reject-new: limit aşımında server 403 döner ve token vermez → giriş DURDURULUR.
      if (sessionRes.status === 403) {
        const errJson = (await sessionRes.json().catch(() => ({}))) as { error?: string };
        setMessage(errJson.error ?? t("auth.sessionLimit"));
        setLoading(false);
        return;
      }
      if (sessionRes.ok) {
        const sessionJson = (await sessionRes.json()) as {
          sessionToken?: string;
          suspiciousLogin?: boolean;
          highRisk?: boolean;
        };
        if (typeof sessionJson.sessionToken === "string") {
          saveSessionToken(sessionJson.sessionToken);
        }
        isSuspiciousLogin = !!(sessionJson.suspiciousLogin || sessionJson.highRisk);
      }
    } catch {
      // Ağ/500 hatası giriş akışını durdurmamalı (limit reddi 403 ayrı ele alınır)
    }

    setUser(loggedUser);
    setLoginModalOpen(false);
    setEmail("");
    setPassword("");
    setMessage("");
    setLoading(false);

    // Modül izinleri login_user RPC'de gelmez; token artık kaydedildiği için
    // /api/auth/profile sync'ini şimdi çalıştır. Bitene kadar modül grid'i
    // skeleton kalır (profileSynced=false) — eksik 2 kart asla render edilmez.
    // Admin modül gating'e tabi değil; ayrıca /admin'e yönlendirilir.
    if (!isAdminUser(loggedUser)) {
      setProfileSynced(false);
      setProfileError(false);
      void syncYasamUserFromDb(loggedUser, { force: true }).then((fresh) => {
        if (fresh) {
          setUser(fresh);
          setProfileSynced(true);
        } else {
          setProfileError(true);
        }
      });
    }

    if (isSuspiciousLogin) {
      showToast({
        title: t("auth.securityWarningTitle"),
        message: t("auth.securityWarningMsg"),
        type: "warning",
      });
    }

    if (isAdminUser(loggedUser)) {
      // Admin httpOnly session cookie set et (server-side doğrulama ile)
      const cookieRes = await fetch("/api/auth/admin-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: loggedUser.id }),
      });
      if (!cookieRes.ok) {
        setMessage(t("auth.adminSessionFailed"));
        setLoading(false);
        return;
      }
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
    // Modül kartları + erişim kararı yalnızca token'lı /api/auth/profile sync'i
    // (profileSynced) sonrası deterministik. localStorage package_type'ına GÜVENİLMEZ
    // — bayat kayıt yanlış erişim kararı üretmesin. Admin gating'e tabi değil.
    const permissionsReady = isAdminUser(user) || profileSynced;
    const visibleDashboardModules = getVisibleDashboardModules(user);
    const membershipExpired = isExpertMembershipExpired(user);
    // Erişim yoksa doğru sebep: onay bekliyor mu, yoksa (genel) aktif değil mi?
    const membershipDenyReason: "pending" | "inactive" =
      !isAdminUser(user) &&
      normalizeApprovalStatus(user.approval_status) === "pending"
        ? "pending"
        : "inactive";
    const expertModulesEmpty =
      !isAdminUser(user) &&
      !membershipExpired &&
      !expertHasAnyGrantedModule(user);

    async function handleAdminNav() {
      if (adminNavLoading) return;
      setAdminNavLoading(true);
      if (adminCookiePromiseRef.current) {
        // Sayfa yüklenirken başlatılan refresh'i bekle.
        // Promise zaten resolved ise await = bir microtask tick (~0 ms).
        await adminCookiePromiseRef.current;
      } else {
        // Nadir fallback: sayfa yüklenirken başlatılmamışsa şimdi yap.
        try {
          await fetch("/api/auth/admin-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user!.id }),
          });
        } catch {}
      }
      router.push("/admin");
    }

    async function retryProfileSync() {
      if (!user) return;
      setProfileError(false);
      // Token yoksa canlı doğrulama yapılamaz — bayat kaydı "synced" sayma.
      if (!readSessionToken()) {
        setProfileError(true);
        return;
      }
      const fresh = await syncYasamUserFromDb(user, { force: true });
      if (fresh) {
        setUser(fresh);
        setProfileSynced(true);
      } else {
        setProfileError(true);
      }
    }

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

        <div className="relative mx-auto w-full max-w-[1800px] px-4 pt-4 pb-16 lg:px-8 xl:px-10" style={{ paddingBottom: "max(4rem, env(safe-area-inset-bottom, 0px))" }}>

          {/* Demo Hesap Banneri */}
          {user.is_demo_account ? (
            <div
              role="alert"
              className="mb-5 rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 to-yellow-50/80 px-5 py-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>⚠️</span>
                <div className="min-w-0 space-y-2.5">
                  {/* Başlık + açıklama tek satır */}
                  <p className="text-sm font-black leading-snug text-amber-900">
                    {t("demo.titleBadge")}{" "}
                    <span className="font-medium text-amber-800">
                      {t("demo.subtitle")}
                    </span>
                  </p>

                  {/* Madde listesi */}
                  <ul className="space-y-0.5">
                    {[
                      t("demo.item1"),
                      t("demo.item2"),
                      t("demo.item3"),
                      t("demo.item4"),
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
                        <span className="mt-px shrink-0 text-amber-500" aria-hidden>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Uyarı */}
                  <p className="text-xs font-medium leading-relaxed text-amber-700">
                    {t("demo.warning")}
                  </p>

                  {/* Çağrı */}
                  <p className="pt-0.5 text-xs font-black text-amber-900">
                    {t("demo.cta")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* ═══════════════════════════════════════════
               HERO
          ═══════════════════════════════════════════ */}
          {(() => {
            const d = effectiveNow;
            const heroDate = t("dashboard.heroDate", {
              day: d.getDate(),
              month: d.toLocaleDateString(bcp47, { month: "long" }),
              year: d.getFullYear(),
              weekday: d.toLocaleDateString(bcp47, { weekday: "long" }),
            });
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
                            <span className="block text-2xl font-black text-slate-900 sm:text-3xl">{t("dashboard.welcomePrefix")}</span>
                            <span className="block bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
                              {firstName} ✨
                            </span>
                          </>
                        ) : (
                          <span className="block text-3xl font-black text-slate-900 sm:text-4xl">{t("dashboard.welcomePlain")}</span>
                        )}
                      </h1>
                      <p className="mt-2 text-sm font-medium text-slate-600">{heroDate}</p>
                    </div>
                    <div className="mt-1 flex shrink-0 items-center gap-1.5">
                      <LanguageSelector className="!min-h-0 !px-2 !py-1 text-[11px]" />
                      <button
                        type="button"
                        onClick={logout}
                        className="rounded-xl border border-white/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-violet-700"
                      >
                        {t("dashboard.logout")}
                      </button>
                    </div>
                  </div>

                  {/* Admin linki */}
                  {isAdminUser(user) ? (
                    <button
                      type="button"
                      onClick={() => { void handleAdminNav(); }}
                      disabled={adminNavLoading}
                      className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/60 bg-white/55 px-3 py-2 text-left backdrop-blur-sm transition hover:bg-white/75 active:scale-[0.98] disabled:opacity-70"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm">
                        <Shield className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">{t("dashboard.systemOwner")}</p>
                        <p className="text-xs font-black text-slate-800">{t("dashboard.adminPanel")}</p>
                      </div>
                      {adminNavLoading ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" strokeWidth={2.5} />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2.5} />
                      )}
                    </button>
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
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                {t("dashboard.centersLabel")}
              </p>

              {!permissionsReady ? (
                profileError ? (
                  <div role="alert" className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center">
                    <p className="text-base font-black text-rose-700">{t("dashboard.profileErrorTitle")}</p>
                    <p className="mt-2 max-w-md text-sm text-rose-500">
                      {t("dashboard.profileErrorDesc")}
                    </p>
                    <button
                      type="button"
                      onClick={retryProfileSync}
                      className="mt-4 rounded-full border border-rose-300 bg-white px-4 py-1.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      {t("dashboard.retry")}
                    </button>
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3"
                    aria-busy="true"
                    aria-label={t("dashboard.modulesBusy")}
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex min-h-[150px] flex-col rounded-[18px] border border-slate-200/70 bg-white/60 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                      >
                        <div className="h-8 w-8 animate-pulse rounded-xl bg-slate-200/80" />
                        <div className="mt-3 h-4 w-3/5 animate-pulse rounded bg-slate-200/80" />
                        <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                        <div className="mt-auto flex items-center justify-between pt-4">
                          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200/80" />
                          <div className="h-6 w-6 animate-pulse rounded-full bg-slate-200/80" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : membershipExpired ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center">
                  {membershipDenyReason === "pending" ? (
                    <p className="text-base font-black text-rose-700">
                      {t("dashboard.membershipPending")}
                    </p>
                  ) : (
                    <>
                      <p className="text-base font-black text-rose-700">
                        {t("dashboard.membershipInactiveTitle")}
                      </p>
                      <p className="mt-2 max-w-md text-sm text-rose-500">
                        {t("dashboard.membershipInactiveDesc")}
                      </p>
                    </>
                  )}
                </div>
              ) : expertModulesEmpty ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-slate-200 bg-white/60 px-6 py-8 text-center backdrop-blur-sm">
                  <p className="text-base font-black text-slate-700">{t("dashboard.noModulesTitle")}</p>
                  <p className="mt-2 max-w-md text-sm text-slate-400">
                    {t("dashboard.noModulesDesc")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                  {visibleDashboardModules.map((item) => {
                    const hasHref = item.href !== "#";
                    const lockReason = item.anyPermissionKeys
                      ? getAnyPermissionLockReason(user, item.anyPermissionKeys, hasHref, panelAccess)
                      : getModuleLockReason(user, item.permissionKey, hasHref, panelAccess);
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
                            {lockReason === "permission" ? t("moduleCard.lockNoPermission") : t("moduleCard.lockMembership")}
                          </span>
                        ) : null}

                        <span className="text-3xl leading-none" aria-hidden>
                          {item.emoji}
                        </span>

                        <h3 className="mt-2.5 text-base font-black text-slate-900">{t(`modules.${item.permissionKey}.title`)}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {t(`modules.${item.permissionKey}.desc`)}
                        </p>
                        <p className="mt-1.5 text-xs text-slate-500 transition-colors group-hover:text-slate-600">
                          {item.hasStat
                            ? moduleStats[item.permissionKey] === undefined
                              ? t("moduleCard.loading")
                              : moduleStats[item.permissionKey] === null
                                ? "—"
                                : moduleStats[item.permissionKey] === 0
                                  ? t("moduleCard.noRecords")
                                  : t(`modules.${item.permissionKey}.stat`, { n: moduleStats[item.permissionKey] as number })
                            : t("common.contentReady")}
                        </p>
                        {lastDateByKey[item.permissionKey] ? (
                          <p className="mt-0.5 text-xs text-slate-500 transition-colors group-hover:text-slate-600">
                            {t("moduleCard.lastPrefix", { date: lastDateByKey[item.permissionKey] })}
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
                            {isComingSoon ? t("common.comingSoon") : isLocked ? (lockReason === "permission" ? t("moduleCard.badgeNoPermission") : t("moduleCard.badgeInactive")) : t("common.active")}
                          </span>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition-opacity ${isOpen ? "" : "opacity-40"}`} aria-hidden>
                            <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>
                    );

                    if (isOpen) {
                      return (
                        <Link key={item.permissionKey} href={item.href} className="block text-inherit no-underline">
                          {card}
                        </Link>
                      );
                    }
                    return (
                      <div
                        key={item.permissionKey}
                        role={isLocked ? "button" : undefined}
                        tabIndex={isLocked ? 0 : undefined}
                        onClick={isLocked && lockReason ? () => handleLockedModuleClick(lockReason) : undefined}
                        onKeyDown={isLocked && lockReason ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleLockedModuleClick(lockReason); } } : undefined}
                      >
                        {card}
                      </div>
                    );
                  })}

                  {/* Ayarlar & Güvenlik — her zaman görünür, grid içinde */}
                  <Link href="/settings" className="block text-inherit no-underline">
                    <div className="group relative flex flex-col rounded-[18px] border bg-gradient-to-br from-slate-100/90 via-white to-slate-50/80 border-slate-200/70 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.07)] backdrop-blur-sm transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
                        <Shield className="h-4 w-4" strokeWidth={2.25} />
                      </div>
                      <h3 className="mt-2.5 text-base font-black text-slate-900">{t("settingsCard.title")}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {t("settingsCard.desc")}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-500">{t("common.contentReady")}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 bg-emerald-100 text-emerald-800 ring-emerald-200/80">
                          {t("common.active")}
                        </span>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm" aria-hidden>
                          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Doğal Pazar public vitrin kartı — PRIVATE OWNER PREVIEW LOCK sırasında
                      GİZLİ. Public açılış ileride ayrı release ile geri getirilecek. Sahip
                      önizlemesi /admin/magaza/onizleme üzerinden yapılır. */}

                  {/* YEBS — YALNIZ yönetici hesabında görünür admin-only kart.
                      Gerçek güvenlik server-side verifyAdminRequest'tedir; bu kart
                      isAdminUser ile gizlenir (defense-in-depth). Diğer modül
                      kartlarının görünürlük mantığına DOKUNMAZ (ayrı, koşullu blok). */}
                  {isAdminUser(user) ? (
                    <Link href="/yebs" data-yebs-admin-card data-admin-only="true" className="block text-inherit no-underline">
                      <div className="group relative flex flex-col rounded-[18px] border bg-gradient-to-br from-emerald-100/90 via-teal-50/95 to-white border-emerald-200/70 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.07)] backdrop-blur-sm transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg">
                        <span className="absolute right-2.5 top-2.5 z-10 rounded-full border border-emerald-200/90 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {t("yebsCard.adminBadge")}
                        </span>
                        <span className="text-3xl leading-none" aria-hidden>
                          🌿
                        </span>
                        <h3 className="mt-2.5 text-base font-black text-slate-900">{t("yebsCard.title")}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {t("yebsCard.desc")}
                        </p>
                        <p className="mt-1.5 text-xs text-slate-500">{t("common.contentReady")}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 bg-emerald-100 text-emerald-800 ring-emerald-200/80">
                            YEBS
                          </span>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm" aria-hidden>
                            <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ) : null}

                  {/* Beslenme — OWNER-ONLY (super-admin) kart. isAdminUser + server owner
                      probe (beslenmeOwner) birlikte gerekli; normal admin/expert görmez.
                      Asıl güvenlik server-side requireMainAdmin'dedir (defense-in-depth). */}
                  {beslenmeOwner ? (
                    <Link href="/beslenme" data-beslenme-owner-card data-admin-only="true" className="block text-inherit no-underline">
                      <div className="group relative flex flex-col rounded-[18px] border bg-gradient-to-br from-lime-100/90 via-emerald-50/95 to-white border-lime-200/70 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.07)] backdrop-blur-sm transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg">
                        <span className="absolute right-2.5 top-2.5 z-10 rounded-full border border-lime-200/90 bg-lime-50 px-2 py-0.5 text-[10px] font-bold text-lime-700">
                          Sahip
                        </span>
                        <span className="text-3xl leading-none" aria-hidden>
                          <Salad className="h-8 w-8 text-emerald-600" strokeWidth={1.75} />
                        </span>
                        <h3 className="mt-2.5 text-base font-black text-slate-900">Beslenme</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          Besinler, beslenme yaklaşımları ve profesyonel beslenme bilgileri
                        </p>
                        <p className="mt-1.5 text-xs text-slate-500">Geliştirme (yalnız sahip)</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 bg-emerald-100 text-emerald-800 ring-emerald-200/80">
                            Beslenme
                          </span>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm" aria-hidden>
                            <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>
                    </Link>
                  ) : null}
                </div>
              )}

            </div>

            {/* ── Right: Son Aktiviteler + Canlı Yaşam Paneli ── */}
            <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">

              {/* Son Aktiviteler — sadece veri varsa göster */}
              {recentActivity !== null && recentActivity.length > 0 ? (
                <div>
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                    {t("dashboard.recentActivity")}
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
                            <p className="text-xs text-slate-500">{act.relDate}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Canlı Yaşam Paneli */}
              <div>
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                  {t("dashboard.livePanelLabel")}
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
              {t("brand")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setLoginModalOpen(true);
              }}
              className="inline-flex h-10 min-w-[80px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-900"
            >
              {t("nav.login")}
            </button>
            <Link
              href="/register"
              className="inline-flex h-10 min-w-[80px] items-center justify-center rounded-lg bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-4 text-xs font-bold text-white no-underline shadow-[0_4px_14px_rgba(109,40,217,0.35)] transition hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(109,40,217,0.42)]"
            >
              {t("nav.register")}
            </Link>
          </div>
        </header>

        {/* — Hero — */}
        <section className="mx-auto mt-10 flex w-full max-w-5xl flex-col items-center text-center xl:mt-12">
          <div className="relative flex w-full items-center justify-center">
            {/* Dekoratif sol kartlar */}
            <div className="pointer-events-none absolute left-0 hidden flex-col gap-2.5 lg:flex" aria-hidden>
              {[
                { label: t("hero.cardModules"), icon: "🧩", sub: t("hero.cardSinglePanel") },
                { label: t("hero.cardSinglePanel"), icon: "🖥️", sub: t("hero.cardSinglePanelSub") },
              ].map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 shadow-sm backdrop-blur-sm"
                >
                  <span className="text-lg">{c.icon}</span>
                  <div>
                    <p className="text-xs font-black text-slate-800">{c.label}</p>
                    <p className="text-[10px] text-slate-500">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Center text */}
            <div className="flex max-w-2xl flex-col items-center">
              <h1 className="text-[2.25rem] font-black leading-[1.1] tracking-[-0.02em] text-slate-950 sm:text-5xl md:text-[3.25rem] xl:text-[3.75rem]">
                {t("hero.titlePart1")}{" "}
                <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                  {t("hero.titleHighlight")}
                </span>{" "}
                {t("hero.titlePart2")}
              </h1>

              <p className="mt-5 max-w-[500px] text-[0.9375rem] leading-[1.75] text-slate-500">
                {t("hero.subtitle")}
              </p>

              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("calisma-alanlari")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-8 text-sm font-bold text-white shadow-[0_6px_22px_rgba(109,40,217,0.38)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(109,40,217,0.48)]"
                >
                  {t("hero.discoverModules")}
                </button>
              </div>
            </div>

            {/* Dekoratif sağ kartlar */}
            <div className="pointer-events-none absolute right-0 hidden flex-col gap-2.5 lg:flex" aria-hidden>
              {[
                { label: t("hero.cardSecure"), icon: "🔒", sub: t("hero.cardSecureSub") },
                { label: t("hero.cardAi"), icon: "✨", sub: t("hero.cardAiSub") },
              ].map((c) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 shadow-sm backdrop-blur-sm"
                >
                  <span className="text-lg">{c.icon}</span>
                  <div>
                    <p className="text-xs font-black text-slate-800">{c.label}</p>
                    <p className="text-[10px] text-slate-500">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* — Product Mockup — */}
        <div data-fade className="mt-8 w-full">
          <div className="mb-4">
            <h2 className="text-xl font-black leading-snug tracking-tight text-slate-950 sm:text-2xl">
              {t("mockup.heading")}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {t("mockup.subtitle")}
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
              <p className="ml-2 text-xs text-slate-500">{t("mockup.windowTitle")}</p>
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
                      <p className="text-sm font-black text-slate-900">{t("mockup.clientName")}</p>
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {t("mockup.activeClient")}
                      </span>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1.5">
                    {[
                      { label: t("mockup.rowLastMeeting"), value: "04.06.2026" },
                      { label: t("mockup.rowSavedWork"), value: t("mockup.savedWorkValue") },
                      { label: t("mockup.rowUpcoming"), value: t("mockup.upcomingValue") },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <dt className="text-xs text-slate-500">{row.label}</dt>
                        <dd className="text-[11px] font-semibold text-slate-600">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Nav tabs */}
                <nav className="flex gap-0.5 overflow-x-auto p-2 sm:flex-col" aria-label={t("mockup.tabsAria")}>
                  {[
                    { label: t("mockup.tabGenel"), active: true },
                    { label: t("mockup.tabNumeroloji") },
                    { label: t("mockup.tabRefleksoloji") },
                    { label: t("mockup.tabDogaltas") },
                    { label: t("mockup.tabNotlar") },
                    { label: t("mockup.tabRandevular") },
                    { label: t("mockup.tabDosyalar") },
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
                    { value: "5", label: t("mockup.statAnaliz") },
                    { value: "8", label: t("mockup.statSeans") },
                    { value: "3", label: t("mockup.statDosya") },
                    { value: "4", label: t("mockup.statNot") },
                  ].map((stat) => (
                    <div key={stat.label} className="flex flex-col items-center gap-0.5 py-3">
                      <span className="text-base font-black tabular-nums text-slate-900">{stat.value}</span>
                      <span className="text-xs text-slate-500">{stat.label}</span>
                    </div>
                  ))}
                </div>

                {/* Son Çalışmalar */}
                <div className="p-4">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {t("mockup.recentWorks")}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {[
                      { text: t("mockup.work1"), detail: t("mockup.work1detail"), date: t("mockup.work1date"), dot: "bg-violet-400" },
                      { text: t("mockup.work2"), detail: t("mockup.work2detail"), date: t("mockup.work2date"), dot: "bg-fuchsia-400" },
                      { text: t("mockup.work3"), detail: t("mockup.work3detail"), date: t("mockup.work3date"), dot: "bg-teal-400" },
                      { text: t("mockup.work4"), detail: t("mockup.work4detail"), date: t("mockup.work4date"), dot: "bg-sky-400" },
                      { text: t("mockup.work5"), detail: t("mockup.work5detail"), date: t("mockup.work5date"), dot: "bg-emerald-400" },
                    ].map((item) => (
                      <div
                        key={item.text}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-slate-800">{item.text}</p>
                            <p className="truncate text-xs text-slate-500">{item.detail}</p>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500">{item.date}</span>
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
            <h2 className="text-xl font-black leading-snug tracking-tight text-slate-950 sm:text-2xl">
              {t("problem.heading")}
            </h2>
            <p className="mt-2.5 max-w-2xl text-sm leading-[1.7] text-slate-500">
              {t("problem.desc")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: "📂", text: t("problem.item1") },
              { icon: "🔍", text: t("problem.item2") },
              { icon: "📝", text: t("problem.item3") },
              { icon: "📅", text: t("problem.item4") },
              { icon: "💎", text: t("problem.item5") },
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
              <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                {t("workspaces.heading")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("workspaces.subtitle")}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {landingModules.map((item) =>
            item.slug === "numeroloji" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-blue-50/60 p-4 shadow-md ring-1 ring-violet-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(109,40,217,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-violet-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("landing.sampleAnalysisBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-xl text-white shadow-md shadow-violet-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.numeroloji.title")}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  {t("landing.numeroloji.desc")}
                </p>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setNumerologiPreviewOpen(true); }}
                  className="mt-3 w-full rounded-xl bg-violet-600 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:bg-violet-700"
                >
                  {t("landing.seeSampleAnalysis")}
                </button>

                <Link
                  href="/numeroloji"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-violet-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "dogaltas" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-teal-200/70 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/60 p-4 shadow-md ring-1 ring-teal-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(20,184,166,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-teal-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl text-white shadow-md shadow-teal-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.dogaltas.title")}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  {t("landing.dogaltas.desc")}
                </p>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDogaltasPreviewOpen(true); }}
                  className="mt-3 w-full rounded-xl bg-teal-700 py-2 text-xs font-bold text-white shadow-sm transition duration-200 hover:bg-teal-800"
                >
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/dogaltas"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-teal-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "biyoenerji" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-cyan-200/70 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60 p-4 shadow-md ring-1 ring-cyan-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(6,182,212,0.16)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-cyan-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-xl text-white shadow-md shadow-cyan-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.biyoenerji.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.biyoenerji.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.biyoenerji") as string[]).map((feat) => (
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
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/enerji-beden"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-cyan-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "kisiselArsiv" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-yellow-200/70 bg-gradient-to-br from-yellow-50/90 via-white to-amber-50/60 p-4 shadow-md ring-1 ring-yellow-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(234,179,8,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-yellow-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 text-xl text-white shadow-md shadow-yellow-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.kisiselArsiv.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.kisiselArsiv.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.kisiselArsiv") as string[]).map((feat) => (
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
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/dashboard/kisisel-arsiv"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-amber-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "belgeCeviri" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-blue-200/70 bg-gradient-to-br from-blue-50/90 via-white to-cyan-50/60 p-4 shadow-md ring-1 ring-blue-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(59,130,246,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-blue-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-xl text-white shadow-md shadow-blue-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.belgeCeviri.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.belgeCeviri.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.belgeCeviri") as string[]).map((feat) => (
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
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/belge-ceviri"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-sky-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "videoCeviri" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-orange-200/70 bg-gradient-to-br from-orange-50/90 via-white to-amber-50/60 p-4 shadow-md ring-1 ring-orange-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(249,115,22,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-amber-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("landing.previewBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 text-xl text-white shadow-md shadow-orange-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.videoCeviri.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.videoCeviri.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.videoCeviri") as string[]).map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-orange-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3.5 w-full cursor-not-allowed rounded-xl border border-orange-200/60 bg-orange-100/50 py-2 text-center text-xs font-bold text-orange-400">
                  {t("landing.inDevelopment")}
                </div>

                <button
                  type="button"
                  onClick={() => setVideoCeviriPreviewOpen(true)}
                  className="mt-2 inline-flex cursor-pointer items-center justify-center gap-1 text-[11px] font-semibold text-orange-600 transition hover:text-orange-800 hover:underline"
                >
                  {t("landing.peekScreen")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </button>
              </div>
            ) : item.slug === "danisanYonetimi" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/60 p-4 shadow-md ring-1 ring-violet-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(124,58,237,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-violet-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-xl text-white shadow-md shadow-violet-300/30 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.danisanYonetimi.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.danisanYonetimi.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.danisanYonetimi") as string[]).map((feat) => (
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
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/danisan-yolculugu"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-indigo-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "sifaRehberi" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-green-200/70 bg-gradient-to-br from-green-50/90 via-white to-mint-50/60 p-4 shadow-md ring-1 ring-green-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(34,197,94,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-green-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 text-xl text-white shadow-md shadow-green-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.sifaRehberi.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.sifaRehberi.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.sifaRehberi") as string[]).map((feat) => (
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
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/sifa-rehberi"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-green-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "refleksoloji" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-pink-200/70 bg-gradient-to-br from-pink-50/90 via-white to-purple-50/60 p-4 shadow-md ring-1 ring-pink-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(236,72,153,0.14)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-pink-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("common.sampleScreensBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-xl text-white shadow-md shadow-pink-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.refleksoloji.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.refleksoloji.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.refleksoloji") as string[]).map((feat) => (
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
                  {t("common.seeSampleScreens")}
                </button>

                <Link
                  href="/refleksoloji"
                  className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 no-underline transition hover:text-pink-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                  <ArrowRight className="h-2.5 w-2.5" strokeWidth={2.5} />
                </Link>
              </div>
            ) : item.slug === "aromaterapi" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-fuchsia-200/70 bg-gradient-to-br from-fuchsia-50/90 via-white to-purple-50/60 p-4 shadow-md ring-1 ring-fuchsia-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(217,70,239,0.12)]"
              >
                <span className="absolute -right-1 -top-1.5 z-10 rounded-full bg-fuchsia-700 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
                  {t("landing.activeModuleBadge")}
                </span>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-xl text-white shadow-md shadow-fuchsia-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t(item.titleKey)}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  {t(item.descKey)}
                </p>

                <Link
                  href="/aromaterapi"
                  className="mt-3 w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 py-2 text-center text-xs font-bold text-white no-underline shadow-sm transition duration-200 hover:from-fuchsia-500 hover:to-purple-500 hover:shadow-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                </Link>
              </div>
            ) : item.slug === "humanDesign" ? (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-purple-200/70 bg-gradient-to-br from-purple-50/90 via-white to-indigo-50/60 p-4 shadow-md ring-1 ring-purple-100/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(147,51,234,0.12)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-xl text-white shadow-md shadow-purple-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t("landing.humanDesign.title")}
                </h3>

                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  {t("landing.humanDesign.desc")}
                </p>

                <ul className="mt-2.5 flex flex-col gap-0.5">
                  {(t.raw("feats.humanDesign") as string[]).map((feat) => (
                    <li key={feat} className="flex items-center gap-1.5">
                      <Check className="h-2.5 w-2.5 shrink-0 text-indigo-500" strokeWidth={2.75} />
                      <span className="text-[10px] font-medium text-slate-700">{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/human-design"
                  className="mt-3.5 w-full rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 py-2 text-center text-xs font-bold text-white no-underline shadow-sm transition duration-200 hover:from-purple-500 hover:to-indigo-600 hover:shadow-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("common.moduleGo")}
                </Link>
              </div>
            ) : (
              <div
                key={item.slug}
                className="group relative flex flex-col rounded-[22px] border border-slate-200/70 bg-white/90 p-4 shadow-sm ring-1 ring-white/50 transition-all duration-200 hover:-translate-y-1 hover:border-violet-200/60 hover:shadow-[0_8px_20px_rgba(109,40,217,0.08)] hover:ring-violet-100/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-xl text-white shadow-md shadow-violet-300/25 transition-transform duration-200 group-hover:scale-[1.08]">
                  {item.icon}
                </div>

                <h3 className="mt-3 text-sm font-black leading-snug text-slate-950">
                  {t(item.titleKey)}
                </h3>

                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-600">
                  {t(item.descKey)}
                </p>

                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-violet-700/75 transition-all duration-200 group-hover:gap-2 group-hover:text-violet-800">
                  {t("landing.discover")}
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
                  {t("mobile.badge")}
                </div>

                <h2 className="mt-4 text-2xl font-black leading-snug tracking-tight text-slate-950 sm:text-3xl">
                  {t("mobile.heading1")}<br className="hidden sm:block" /> {t("mobile.heading2")}
                </h2>

                <p className="mt-3 max-w-md text-sm leading-[1.75] text-slate-600">
                  {t("mobile.desc")}
                </p>

                <ul className="mt-5 space-y-2.5">
                  {[
                    t("mobile.item1"),
                    t("mobile.item2"),
                    t("mobile.item3"),
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
                    {t("mobile.openApp")}
                    <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                  </a>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm">
                    {t("mobile.googlePlay")}
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
                            <p className="text-[11px] font-black text-slate-900">{t("mobile.phoneAppName")}</p>
                            <p className="text-[9px] font-semibold text-emerald-700">{t("mobile.phoneAppName")}</p>
                            <p className="mt-0.5 text-[10px] font-bold leading-none text-amber-700">★★★★★</p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-2 flex gap-1.5">
                          <div className="flex-1 rounded-full border border-slate-200 bg-white py-1.5 text-center text-[10px] font-bold text-slate-600">
                            {t("mobile.phoneRemove")}
                          </div>
                          <div className="flex-1 rounded-full bg-emerald-700 py-1.5 text-center text-[10px] font-bold text-white">
                            {t("mobile.phoneOpen")}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                          <p className="text-[9px] font-black text-emerald-700">{t("mobile.phoneStatus")}</p>
                        </div>

                        {/* Updates */}
                        <div className="mt-2.5 px-0.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black text-slate-800">{t("mobile.phoneNews")}</p>
                            <span className="text-[8px] text-slate-600">{t("mobile.phoneNewsDate")}</span>
                          </div>
                          <p className="mt-0.5 text-[8px] leading-4 text-slate-500">{t("mobile.phoneNewsDetail")}</p>
                        </div>

                        {/* Device tags */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[t("mobile.phoneTagPhone"), t("mobile.phoneTagTablet")].map((tag) => (
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
              key={item.slug}
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
                <h3 className="text-sm font-black text-white">{t(item.titleKey)}</h3>
                <p className="mt-1.5 text-xs leading-5 text-indigo-100/90">
                  {t(item.descKey)}
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
                {t("trust.badge")}
              </p>
              <h2
                id="trust-principles-heading"
                className="mt-2 text-xl font-black leading-snug text-slate-950 sm:text-2xl xl:text-[1.75rem]"
              >
                {t("trust.heading")}
              </h2>

              <ul className="mt-4 space-y-2">
                {trustPrincipleKeys.map((key) => (
                  <li
                    key={key}
                    className="flex items-start gap-3 rounded-[18px] border border-white/80 bg-white/80 px-4 py-2.5 shadow-sm transition duration-200 hover:border-violet-200/80 hover:bg-white/95"
                  >
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-emerald-600 text-white shadow-sm"
                      aria-hidden
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </span>
                    <span className="text-sm font-bold leading-5 text-slate-800">
                      {t(key)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-violet-200/60 pt-4 text-xs font-semibold italic text-slate-600">
                {t("trust.quote")}
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
                  {t("trust.shieldLabel")}
                </p>
                <p className="mt-1.5 max-w-[220px] text-center text-sm font-semibold leading-5 text-slate-600">
                  {t("trust.shieldSub")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-6 border-t border-slate-200/60 py-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm font-semibold text-slate-500">
              {t("footer.copyright")}
            </p>
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1" aria-label={t("footer.nav")}>
              <Link
                href="/gizlilik-politikasi"
                className="text-xs font-semibold text-slate-500 no-underline transition hover:text-slate-700"
              >
                {t("footer.privacy")}
              </Link>
              <Link
                href="/kullanim-sartlari"
                className="text-xs font-semibold text-slate-500 no-underline transition hover:text-slate-700"
              >
                {t("footer.terms")}
              </Link>
              <Link
                href="/iletisim"
                className="text-xs font-semibold text-slate-500 no-underline transition hover:text-slate-700"
              >
                {t("footer.contact")}
              </Link>
            </nav>
          </div>
        </footer>
      </div>

      {numerologiPreviewOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 pb-10 backdrop-blur-sm"
          onClick={() => setNumerologiPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.numeroloji.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setNumerologiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>
            {/* Modal header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-violet-200/70 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                {t("preview.numeroloji.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.numeroloji.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">{t("preview.numeroloji.subtitle")}</p>
            </div>
            <div className="overflow-hidden rounded-xl">
              <img
                src="/assets/numeroloji-preview.png"
                alt={t("preview.numeroloji.alt")}
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
          aria-label={t("preview.dogaltas.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDogaltasPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">
                {t("preview.dogaltas.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.dogaltas.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.dogaltas.subtitle")}
              </p>
            </div>

            {/* Preview image */}
            <div className="overflow-hidden rounded-xl">
              <img
                src="/assets/dogaltas-preview.png"
                alt={t("preview.dogaltas.alt")}
                className="w-full rounded-xl"
              />
            </div>

            {/* Description + feature badges */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.dogaltas.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.dogaltas.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(t.raw("feats.dogaltas") as string[]).map((feat) => (
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
          aria-label={t("preview.kisiselArsiv.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setKisiselArsivPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                {t("preview.kisiselArsiv.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.kisiselArsiv.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.kisiselArsiv.subtitle")}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/kisisel-arsiv-preview.png"
                alt={t("preview.kisiselArsiv.alt")}
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.kisiselArsiv.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.kisiselArsiv.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.kisiselArsiv") as string[]).map((feat) => (
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
          aria-label={t("preview.belgeCeviri.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setBelgeCeviriPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">
                {t("preview.belgeCeviri.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.belgeCeviri.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.belgeCeviri.subtitle")}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/belge-ceviri-preview.png"
                alt={t("preview.belgeCeviri.alt")}
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.belgeCeviri.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.belgeCeviri.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.belgeCeviri") as string[]).map((feat) => (
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
          aria-label={t("preview.videoCeviri.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setVideoCeviriPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                {t("preview.videoCeviri.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.videoCeviri.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.videoCeviri.subtitle")}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900">
              <img
                src="/assets/video-ceviri-preview.png"
                alt={t("preview.videoCeviri.alt")}
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-base">
                  ⚠️
                </span>
                <div>
                  <p className="text-sm font-black text-white">{t("preview.videoCeviri.devTitle")}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {t("preview.videoCeviri.devDesc")}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.videoCeviri") as string[]).map((feat) => (
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
          aria-label={t("preview.danisanYonetimi.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDanisanYonetimiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-300">
                {t("preview.danisanYonetimi.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.danisanYonetimi.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.danisanYonetimi.subtitle")}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-indigo-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-indigo-300">
                  {t(danisanYonetimiGallerySlides[danisanYonetimiSlide].label)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {danisanYonetimiSlide + 1} / {danisanYonetimiGallerySlides.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setDanisanYonetimiSlide((s) => (s - 1 + danisanYonetimiGallerySlides.length) % danisanYonetimiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-indigo-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setDanisanYonetimiSlide((s) => (s + 1) % danisanYonetimiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-indigo-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              <div className="relative">
                <img
                  key={danisanYonetimiGallerySlides[danisanYonetimiSlide].src}
                  src={danisanYonetimiGallerySlides[danisanYonetimiSlide].src}
                  alt={t("preview.danisanYonetimi.altPrefix") + t(danisanYonetimiGallerySlides[danisanYonetimiSlide].label)}
                  className="w-full"
                />
                {danisanYonetimiGallerySlides[danisanYonetimiSlide].cover && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent px-5 py-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">
                      {t("preview.danisanYonetimi.coverBadge")}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-white">
                      {t("preview.danisanYonetimi.coverTitle")}
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
                  aria-label={t(slide.label)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.danisanYonetimi.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.danisanYonetimi.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.danisanYonetimi") as string[]).map((feat) => (
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
          aria-label={t("preview.sifaRehberi.aria")}
        >
          <div
            className="relative mt-6 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSifaRehberiPreviewOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-500 shadow-md transition hover:bg-slate-50"
              aria-label={t("common.close")}
            >
              ×
            </button>

            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
                {t("preview.sifaRehberi.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.sifaRehberi.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.sifaRehberi.subtitle")}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-emerald-300">
                  {t(sifaRehberiGallerySlides[sifaRehberiSlide].label)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {sifaRehberiSlide + 1} / {sifaRehberiGallerySlides.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSifaRehberiSlide((s) => (s - 1 + sifaRehberiGallerySlides.length) % sifaRehberiGallerySlides.length)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setSifaRehberiSlide((s) => (s + 1) % sifaRehberiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              <img
                key={sifaRehberiGallerySlides[sifaRehberiSlide].src}
                src={sifaRehberiGallerySlides[sifaRehberiSlide].src}
                alt={t("preview.sifaRehberi.altPrefix") + t(sifaRehberiGallerySlides[sifaRehberiSlide].label)}
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
                  aria-label={t(slide.label)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.sifaRehberi.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.sifaRehberi.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.sifaRehberi") as string[]).map((feat) => (
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
          aria-label={t("preview.refleksoloji.aria")}
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
              aria-label={t("common.close")}
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">
                {t("preview.refleksoloji.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.refleksoloji.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.refleksoloji.subtitle")}
              </p>
            </div>

            {/* Galeri */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              {/* Slide etiketi */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-violet-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-violet-300">
                  {t(refleksolojiGallerySlides[refleksolojiSlide].label)}
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
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>

              {/* Sonraki */}
              <button
                type="button"
                onClick={() => setRefleksolojiSlide((s) => (s + 1) % refleksolojiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-violet-400/40 hover:bg-slate-800/80 hover:text-white"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              {/* Görsel */}
              <img
                key={refleksolojiGallerySlides[refleksolojiSlide].src}
                src={refleksolojiGallerySlides[refleksolojiSlide].src}
                alt={t("preview.refleksoloji.altPrefix") + t(refleksolojiGallerySlides[refleksolojiSlide].label)}
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
                  aria-label={t(slide.label)}
                />
              ))}
            </div>

            {/* Özellik paneli */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.refleksoloji.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.refleksoloji.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.refleksoloji") as string[]).map((feat) => (
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
          aria-label={t("preview.biyoenerji.aria")}
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
              aria-label={t("common.close")}
            >
              ×
            </button>

            {/* Header */}
            <div className="mb-4 text-center">
              <span className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-900/60 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
                {t("preview.biyoenerji.badge")}
              </span>
              <h4 className="mt-2 text-lg font-black text-white sm:text-xl">
                {t("preview.biyoenerji.title")}
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                {t("preview.biyoenerji.subtitle")}
              </p>
            </div>

            {/* Gallery */}
            <div className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900">
              {/* Slide label + counter */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-slate-900/85 px-3 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-cyan-300">
                  {t(biyoenerjiGallerySlides[biyoenerjiSlide].label)}
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
                aria-label={t("common.prevScreen")}
              >
                ‹
              </button>

              {/* Next */}
              <button
                type="button"
                onClick={() => setBiyoenerjiSlide(s => (s + 1) % biyoenerjiGallerySlides.length)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/80 text-xl font-light text-slate-300 backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-white hover:bg-slate-800/80"
                aria-label={t("common.nextScreen")}
              >
                ›
              </button>

              <img
                key={biyoenerjiGallerySlides[biyoenerjiSlide].src}
                src={biyoenerjiGallerySlides[biyoenerjiSlide].src}
                alt={t("preview.biyoenerji.altPrefix") + t(biyoenerjiGallerySlides[biyoenerjiSlide].label)}
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
                  aria-label={t(slide.label)}
                  aria-current={idx === biyoenerjiSlide ? "true" : undefined}
                />
              ))}
            </div>

            {/* Feature panel */}
            <div className="mt-4 rounded-xl border border-slate-700/40 bg-slate-800/60 p-5">
              <h5 className="text-base font-black text-white">
                {t("preview.biyoenerji.panelTitle")}
              </h5>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("preview.biyoenerji.panelDesc")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(t.raw("feats.biyoenerji") as string[]).map((feat) => (
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
            ref={loginModalRef}
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
                  {t("login.badge")}
                </div>

                <h3
                  id="login-modal-title"
                  className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl"
                >
                  {t("login.title")}
                </h3>

                <p className="mt-1.5 text-sm leading-6 text-slate-500">
                  {t("login.subtitle")}
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
                  {t("login.emailLabel")}
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  {t("login.passwordLabel")}
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
                    {t("login.register")}
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      setMessage(t("login.forgotMsg"))
                    }
                    className="bg-transparent p-0 text-[12px] font-semibold tracking-wide text-violet-600/85 underline-offset-2 transition hover:text-violet-900 hover:underline"
                  >
                    {t("login.forgot")}
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
              {loading ? t("login.submitting") : t("login.submit")}
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

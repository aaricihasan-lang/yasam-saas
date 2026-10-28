/**
 * Ana sayfa merkez kartları — ERİŞİM KARARININ TEK KAYNAĞI (2026-10-24, Hızlı Erişim Menüsü entegrasyonu).
 *
 * Bu dosyadaki tanımlar app/page.tsx'ten DEĞİŞTİRİLMEDEN taşındı (yalnız `export` eklendi); ana sayfa kartları ve
 * merkezi Hızlı Erişim Menüsü (components/layout/quick-nav) aynı görünürlük + kilit kararını buradan kullanır.
 * Yeni yetki kuralı YOKTUR. Sayfalar ModuleRouteGuard ile, API'ler requireModuleAccess ile ayrıca korunur.
 */
import type { LucideIcon } from "lucide-react";
import { Brain, Layers, Leaf, Package, Sparkles, UsersRound } from "lucide-react";
import { isAdminUser, type YasamUser } from "@/lib/auth/yasamUser";
import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import {
  getModuleLockReason,
  hasAnyModulePermissionFlag,
  hasModulePermission,
  COMING_SOON_MODULE_KEYS,
  type ModuleLockReason,
  type ModulePermissionKey,
} from "@/lib/auth/modulePermissions";
import { DIGITAL_CONTENT_HUB_KEYS, ENERGY_BODY_HUB_KEYS } from "@/lib/auth/hubVisibility";

export type ModuleTheme = {
  iconWrap: string;
  cardBg: string;
  border: string;
};

// Görünen başlık/açıklama/sayaç i18n'den `home.modules.<permissionKey>.*` ile gelir.
// permissionKey canonical'dır (izin/kilit mantığı buna bağlı) → DEĞİŞMEZ.
export type ModuleCard = {
  href: string;
  permissionKey: ModulePermissionKey;
  /**
   * Çok-modüllü hub kartı için AÇIK OR izin listesi. Verildiğinde kartın görünürlüğü
   * ve kilit kararı bu anahtarlardan HERHANGİ biriyle (hasAnyModulePermissionFlag)
   * belirlenir; permissionKey yalnız tip/stat/tarih araması için placeholder kalır.
   * Global permission alias semantiği DEĞİŞTİRİLMEZ (aroma izni ≠ şifa izni).
   */
  anyPermissionKeys?: string[];
  /**
   * 2026-10-15: kartın İÇİNDE barındırdığı ek modüller (ör. Yaşam Analiz Merkezi → Gökyüzü Atlası). permissionKey
   * davranışı AYNEN korunur; bu anahtarlardan biri (hasModulePermission) açık olan uzman da kartı görür ve kilitsiz açar.
   * Alt modülün kendisi kendi sayfasında / API'sinde ayrıca korunur (yalnız kart görünürlüğüdür).
   */
  extraPermissionKeys?: ModulePermissionKey[];
  emoji: string;
  featured?: boolean;
  /** Bu modülün i18n `.stat` sayaç metni var mı (n interpolasyonlu). */
  hasStat?: boolean;
  Icon: LucideIcon;
  theme: ModuleTheme;
};

export const dashboardModules: ModuleCard[] = [
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
  // 2026-10-17 (owner kararı): Doğaltaş artık "Doğal Destek & Rehber" merkezinin içinde (ana panelde ayrı kart yok).
  // /dogaltas adresi, verisi ve yetki kapısı (stones/dogaltas) aynen korunur.
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
    // Hub: Biyoenerji / Refleksoloji / Kupa'dan herhangi biri (lib/auth/hubVisibility) → görünür + açık.
    permissionKey: "energy_body",
    anyPermissionKeys: [...ENERGY_BODY_HUB_KEYS],
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
    // Görünürlük AÇIK OR ile: Aromaterapi VEYA Şifa Rehberi VEYA Beslenme (tam modül) VEYA Doğaltaş yeterli.
    // Beslenme girişi bu hub altındadır; ana dashboard'da bağımsız Beslenme/Besinlerim kartı YOK.
    // `clients` ve (kaldırılan) `beslenme_manual_food` bu hub'ı TEK BAŞINA AÇMAZ.
    // permissionKey yalnız tip placeholder'ı; gerçek karar anyPermissionKeys üzerinden.
    permissionKey: "sifa_rehberi",
    anyPermissionKeys: ["aromatherapy", "aromaterapi", "sifa_rehberi", "healing", "beslenme", "stones", "dogaltas"],
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
    // Hub: yalnız uzmana AÇIK alt modüllerden biri (lib/auth/hubVisibility) varsa görünür.
    permissionKey: "digital_content",
    anyPermissionKeys: [...DIGITAL_CONTENT_HUB_KEYS],
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
    // 2026-10-15 (owner kararı): Gökyüzü Atlası artık Yaşam Analiz Merkezi'nin içinde (ana panelde ayrı kart yok).
    // 2026-10-17 (owner kararı): Yaşam Takvimi / Kozmik Ajanda da merkezin içinde (/cosmic-calendar adresi aynen).
    // Human Design merkezin içindedir → yalnız human_design yetkili uzman da merkeze ulaşır.
    extraPermissionKeys: ["astrology", "cosmic_calendar", "human_design"],
    emoji: "🧠",
    hasStat: true,
    Icon: Brain,
    theme: {
      iconWrap: "from-violet-600 to-purple-700",
      cardBg: "from-violet-100/90 via-purple-50/95 to-white",
      border: "border-violet-200/70",
    },
  },
  // Astroloji (Gökyüzü Atlası): 2026-10-15'ten beri ana panelde ayrı kart YOK — Yaşam Analiz Merkezi içinde
  // (app/life-analysis; yalnız Astroloji erişimi doğrulanan kullanıcıya görünür). /astroloji adresi aynen çalışır;
  // erişim route kuralı + API'de requireAstrologyAccess ile korunur.
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
  // Alt-yetki (kart açmaz): Human Design — Sistem Yorumu.
  hd_system_reading: [],
  // Alt-yetki (kart açmaz): Numeroloji — Gelecek Yılları Göster.
  numerology_future_years: [],
  astrology: [],
  // Alt-yetki (kart açmaz): Astroloji — Roxy Otomatik Yorum.
  astrology_provider_interp: [],
  // Admin-only AI alt modülleri (video_ceviri/ders_notu) hub'ı uzmana AÇMAZ → alias DEĞİL.
  digital_content: ["personal_archive", "belge_ceviri", "kisisel_arsiv"],
  cosmic_calendar: [],
  cupping: ["kupa", "hacamat_terapi"],
  beslenme: [],
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

  // Kartın içindeki ek modül (ör. Analiz Merkezi → Gökyüzü Atlası) yetkisi kartı da görünür kılar.
  if (item.extraPermissionKeys?.some((k) => hasModulePermission(user, k))) return true;

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

export function isExpertMembershipExpired(user: YasamUser): boolean {
  if (isAdminUser(user)) return false;
  return !hasExpertMembershipAccess(user);
}

/**
 * Çok-modüllü hub kartı için kilit kararı — getModuleLockReason'ın OR karşılığı.
 * Anahtarlardan herhangi biri açıksa kilit yok; hiçbiri yoksa "permission".
 * coming_soon burada geçersiz (hub kartı yakında-modül değil).
 */
export function getAnyPermissionLockReason(
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

export function expertHasAnyGrantedModule(user: YasamUser): boolean {
  return dashboardModules.some((item) =>
    isExpertDashboardModuleVisible(user, item),
  );
}

export function getVisibleDashboardModules(user: YasamUser): ModuleCard[] {
  if (isAdminUser(user)) return dashboardModules;
  return dashboardModules.filter(
    (item) =>
      isExpertDashboardModuleVisible(user, item) ||
      COMING_SOON_MODULE_KEYS.has(item.permissionKey),
  );
}

/**
 * Kart kilit kararı — app/page.tsx'teki `cardLock` gövdesi DEĞİŞTİRİLMEDEN buraya alındı (getAnyPermissionLockReason /
 * getModuleLockReason + ek anahtarlar). `subscriptionOpen` = hasFullPanelAccess(user).
 */
export function getCenterLock(user: YasamUser, item: ModuleCard, panelAccess: boolean): ModuleLockReason | null {
  const hasHref = item.href !== "#";
  const baseLock = item.anyPermissionKeys
    ? getAnyPermissionLockReason(user, item.anyPermissionKeys, hasHref, panelAccess)
    : getModuleLockReason(user, item.permissionKey, hasHref, panelAccess);
  // Ek modül yetkisi (ör. yalnız Gökyüzü Atlası) kartın izin kilidini kaldırır; abonelik kilidi aynen.
  return baseLock === "permission" && item.extraPermissionKeys?.some((k) => hasModulePermission(user, k)) ? null : baseLock;
}

/** Menüye giden merkez girdisi (homeModuleNav.buildModuleNavGroups ile aynı şekil). */
export type CenterNavHub = { permissionKey: ModulePermissionKey; href: string; open: boolean; label: string };

/**
 * Sol menü merkezleri — ana sayfa kartlarıyla AYNI sıra (2026-10-18: Ürün & Stok en sonda) ve AYNI kilit kararı
 * (getVisibleDashboardModules + getCenterLock). Ana sayfa "Tüm Modüller" listesi ve merkezi Hızlı Erişim Menüsü
 * bu tek fonksiyonu kullanır; ikinci bir kural yazılmaz.
 */
export function buildCenterNavHubs(
  user: YasamUser,
  panelAccess: boolean,
  label: (permissionKey: ModulePermissionKey) => string,
): CenterNavHub[] {
  const visible = getVisibleDashboardModules(user);
  const ordered = [...visible.filter((m) => m.permissionKey !== "stok"), ...visible.filter((m) => m.permissionKey === "stok")];
  return ordered.map((m) => ({
    permissionKey: m.permissionKey,
    href: m.href,
    open: m.href !== "#" && getCenterLock(user, m, panelAccess) === null,
    label: label(m.permissionKey),
  }));
}

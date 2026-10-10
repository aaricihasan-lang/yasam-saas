/**
 * Danışan detay sayfası (app/dashboard/clients/[id]) SEKME KAYDI — TEK KAYNAK (SAF).
 *
 * Sekme çubuğu (page.tsx), URL `?tab=` allowlist'i ve izin-bağımlı görünürlük BURADAN türetilir.
 * Böylece yeni bir sekme gerçek uzman ekranına eklendiğinde allowlist/derin bağlantı ile arasında
 * fark oluşamaz (DEMO-07: `ucretlendirme` sekmesi vardı ama allowlist'te yoktu) ve demo vitrin
 * hesabı da AYNI sayfayı/sekme setini kullandığı için yeni sekme vitrinde otomatik görünür.
 *
 * Yaşam Hafızası araması sonucundan gelen deep-link (/dashboard/clients/{id}?tab=<sekme>)
 * doğru sekmeyi açar. `?tab=` değeri bu kayıtla normalize edilir; bilinmeyen/boş/null değer ve
 * kullanıcının GÖREMEDİĞİ (izinsiz) sekme güvenli şekilde varsayılan sekmeye (Genel) düşer.
 *
 * Not: sekme id'leri clientSources.CLIENT_MODULE_DETAIL_TAB değerleriyle hizalı olmalıdır
 * (harness cross-check ile zorlanır).
 */
import { hasModulePermission, type ModulePermissionKey } from "@/lib/auth/modulePermissions";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import type { YasamUser } from "@/lib/auth/yasamUser";

/**
 * Sekme kapısı anahtarı: temel izin anahtarları + sunucu modül kapısı olarak var olan ama
 * temel izin listesinde (ModulePermissionKey) bulunmayan modüller. "reflexology" kararı
 * sayfada sunucu guard'ı ile AYNI saf resolver'la (moduleAccessCore.resolveModuleAccess) verilir.
 */
export type ClientDetailTabGateKey = ModulePermissionKey | "reflexology";

export type ClientDetailTabDef = {
  readonly id: string;
  /** i18n anahtarı: clients.detail.tab.<labelKey> */
  readonly labelKey: string;
  readonly color: string;
  /**
   * Sekmeyi görmek için gereken EK modül izni (Danışan Yolculuğu = `clients` izni sayfa
   * route'unda zaten zorunlu). Yoksa sekme her yetkili kullanıcıya görünür.
   */
  readonly requiresModule?: ClientDetailTabGateKey;
};

export const CLIENT_DETAIL_TAB_DEFS = [
  { id: "genel", labelKey: "genel", color: "#2563eb" },
  { id: "anamnez", labelKey: "anamnez", color: "#0f766e" },
  { id: "notlar", labelKey: "notlar", color: "#7c3aed" },
  { id: "taslar", labelKey: "taslar", color: "#0891b2" },
  { id: "seanslar", labelKey: "seanslar", color: "#16a34a" },
  { id: "ucretlendirme", labelKey: "ucretlendirme", color: "#0d9488" },
  { id: "odevler", labelKey: "odevler", color: "#dc2626" },
  { id: "analizler", labelKey: "analizler", color: "#9333ea" },
  { id: "yolculuk", labelKey: "yolculuk", color: "#4f46e5" },
  // DEMO-03: Yaşam Hafızası sekmesi yalnız `yasam_hafizasi` izni olan kullanıcıya görünür
  // (merkezî hasModulePermission; admin geçer). İzinsiz uzman sekmeyi görmez → 403 ekranı yok.
  { id: "hafiza", labelKey: "hafiza", color: "#7c3aed", requiresModule: "yasam_hafizasi" },
  { id: "beslenme", labelKey: "beslenme", color: "#059669" },
  // AŞAMA 3C: danışana bağlı Human Design analiz geçmişi (özet + "Analizi Aç"). Yalnız human_design
  // izni olan kullanıcıya görünür; veri HD'de kalır (kopyalanmaz).
  { id: "humandesign", labelKey: "humandesign", color: "#4338ca", requiresModule: "human_design" },
  // Refleksoloji Danışan Haritası: bu danışanın işaret seansları (özet + "Haritayı Aç"). Yalnız
  // reflexology izniyle görünür; veri Refleksoloji'de kalır, harita orada açılır (danışan seçtirmeden).
  { id: "refleksoloji", labelKey: "refleksoloji", color: "#7e22ce", requiresModule: "reflexology" },
  // Owner kararı 2026-10-07: uzman önce değerlendirir (analiz/seans/ödev/taş/beslenme), randevuyu SONRA
  // planlar → Randevular Beslenme'den sonra. Yalnız SIRA değişti; id/?tab=/içerik aynı.
  { id: "randevular", labelKey: "randevular", color: "#db2777" },
] as const satisfies readonly ClientDetailTabDef[];

export type ClientDetailTab = (typeof CLIENT_DETAIL_TAB_DEFS)[number]["id"];

/** Geriye uyumlu: tüm sekme id'leri (kayıt sırası). */
export const CLIENT_DETAIL_TABS: readonly ClientDetailTab[] = CLIENT_DETAIL_TAB_DEFS.map((t) => t.id);

export const DEFAULT_CLIENT_DETAIL_TAB: ClientDetailTab = "genel";

const VALID_CLIENT_DETAIL_TABS = new Set<string>(CLIENT_DETAIL_TABS);

/** ?tab= değeri geçerli bir sekme mi? */
export function isClientDetailTab(value: unknown): value is ClientDetailTab {
  return typeof value === "string" && VALID_CLIENT_DETAIL_TABS.has(value);
}

/**
 * Kullanıcının görebildiği sekmeler (kayıt sırası korunur). `canUseModule` merkezî izin kararıdır
 * (page: hasModulePermission(user, key)). İzin bilgisi henüz yoksa (null) izin-bağımlı sekmeler
 * fail-closed GİZLİ kalır.
 */
export function visibleClientDetailTabs(
  canUseModule: ((key: ClientDetailTabGateKey) => boolean) | null,
): ClientDetailTabDef[] {
  return CLIENT_DETAIL_TAB_DEFS.filter((t) => {
    const req = (t as ClientDetailTabDef).requiresModule;
    if (!req) return true;
    return canUseModule ? canUseModule(req) : false;
  });
}

/**
 * Sayfa + harness ORTAK sekme kapısı (tek karar): temel izinler `hasModulePermission`;
 * "reflexology" sunucu requireModuleAccess("reflexology") ile AYNI saf resolver.
 */
export function clientTabGateFor(
  user: Pick<YasamUser, "role" | "module_permissions" | "is_demo_account"> | null | undefined,
): ((key: ClientDetailTabGateKey) => boolean) | null {
  if (!user) return null;
  return (key) =>
    key === "reflexology"
      ? resolveModuleAccess(user.role, user.module_permissions ?? null, "reflexology", {
          isDemo: user.is_demo_account === true,
        })
      : hasModulePermission(user as YasamUser, key);
}

/**
 * URL ?tab= değerini güvenli sekmeye normalize eder.
 *   - Geçerli sekme → o sekme.
 *   - null / undefined / boş / bilinmeyen ("foobar") → DEFAULT (genel).
 *   - `visible` verildiyse ve sekme kullanıcıya görünmüyorsa → DEFAULT (genel).
 */
export function resolveClientDetailTab(
  raw: string | null | undefined,
  visible?: readonly { id: string }[],
): ClientDetailTab {
  if (!isClientDetailTab(raw)) return DEFAULT_CLIENT_DETAIL_TAB;
  if (visible && !visible.some((t) => t.id === raw)) return DEFAULT_CLIENT_DETAIL_TAB;
  return raw;
}

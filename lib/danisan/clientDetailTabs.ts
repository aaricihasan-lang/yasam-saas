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
import type { ModulePermissionKey } from "@/lib/auth/modulePermissions";

export type ClientDetailTabDef = {
  readonly id: string;
  /** i18n anahtarı: clients.detail.tab.<labelKey> */
  readonly labelKey: string;
  readonly color: string;
  /**
   * Sekmeyi görmek için gereken EK modül izni (Danışan Yolculuğu = `clients` izni sayfa
   * route'unda zaten zorunlu). Yoksa sekme her yetkili kullanıcıya görünür.
   */
  readonly requiresModule?: ModulePermissionKey;
};

export const CLIENT_DETAIL_TAB_DEFS = [
  // Owner kesin sırası (2026-10-17): Genel → Anamnez → Notlar → Seanslar → Ödevler → Çakra Analizleri →
  // Human Design → Doğaltaş Önerileri → Beslenme → Yaşam Hafızası → Randevular → Danışan Yolculuğu →
  // Ücretlendirme (→ Word Raporu butonu en sonda). Yalnız SIRA; id / ?tab= / renk / izin / içerik AYNI.
  { id: "genel", labelKey: "genel", color: "#2563eb" },
  { id: "anamnez", labelKey: "anamnez", color: "#0f766e" },
  { id: "notlar", labelKey: "notlar", color: "#7c3aed" },
  { id: "seanslar", labelKey: "seanslar", color: "#16a34a" },
  { id: "odevler", labelKey: "odevler", color: "#dc2626" },
  // Görünen ad "Çakra Analizleri" (Human Design ile karışmasın); id/?tab=analizler aynı.
  { id: "analizler", labelKey: "analizler", color: "#9333ea" },
  // AŞAMA 3C: danışana bağlı Human Design analiz geçmişi. Yalnız human_design izni olana görünür.
  { id: "humandesign", labelKey: "humandesign", color: "#4338ca", requiresModule: "human_design" },
  { id: "taslar", labelKey: "taslar", color: "#0891b2" },
  { id: "beslenme", labelKey: "beslenme", color: "#059669" },
  // DEMO-03: Yaşam Hafızası sekmesi yalnız `yasam_hafizasi` izni olan kullanıcıya görünür
  // (merkezî hasModulePermission; admin geçer). İzinsiz uzman sekmeyi görmez → 403 ekranı yok.
  { id: "hafiza", labelKey: "hafiza", color: "#7c3aed", requiresModule: "yasam_hafizasi" },
  { id: "randevular", labelKey: "randevular", color: "#db2777" },
  { id: "yolculuk", labelKey: "yolculuk", color: "#4f46e5" },
  { id: "ucretlendirme", labelKey: "ucretlendirme", color: "#0d9488" },
] as const satisfies readonly ClientDetailTabDef[];

export type ClientDetailTab = (typeof CLIENT_DETAIL_TAB_DEFS)[number]["id"];

/**
 * Manuel test Madde 20: GÖRSEL olarak da yan yana kalması gereken sekme çiftleri. Sekme çubuğu
 * `flex-wrap`'tir; satır sonu bir çiftin arasına düşerse (ör. "… Beslenme" / alt satır "Randevular")
 * DOM sırası doğru olsa da owner'ın kabul kriteri bozulur. Çift tek kırılmaz grup olarak render edilir
 * → gerekirse BİRLİKTE alt satıra geçer. Diğer sekmelerin sarma davranışı değişmez.
 */
export const CLIENT_DETAIL_TAB_KEEP_TOGETHER: readonly (readonly [ClientDetailTab, ClientDetailTab])[] = [
  // Owner kesin sırası (2026-10-17) Beslenme ile Randevular'ı ayırdı (arada Yaşam Hafızası) → Madde 20
  // çifti kaldırıldı; sekmeler doğal sarılır, görsel sıra = kayıt sırası.
];

/**
 * Görünür sekmeleri render gruplarına böler (sıra korunur). Bir KEEP_TOGETHER çifti görünür listede
 * ARDIŞIKSA tek grup olur; aksi halde her sekme kendi grubudur.
 */
export function groupClientDetailTabs<T extends { readonly id: string }>(tabs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < tabs.length; i++) {
    const cur = tabs[i]!;
    const next = tabs[i + 1];
    if (next && CLIENT_DETAIL_TAB_KEEP_TOGETHER.some(([a, b]) => a === cur.id && b === next.id)) {
      out.push([cur, next]);
      i++;
    } else {
      out.push([cur]);
    }
  }
  return out;
}

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
  canUseModule: ((key: ModulePermissionKey) => boolean) | null,
): ClientDetailTabDef[] {
  return CLIENT_DETAIL_TAB_DEFS.filter((t) => {
    const req = (t as ClientDetailTabDef).requiresModule;
    if (!req) return true;
    return canUseModule ? canUseModule(req) : false;
  });
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

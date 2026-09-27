/**
 * SAF (server-bağımsız) modül erişim çekirdeği.
 *
 * `resolveModuleAccess` ve alias/anahtar mantığı burada; next/server veya Supabase
 * importu YOKTUR → hem server (userGuard/moduleAccess) hem CLIENT (refleksoloji page
 * guard, REF-010) aynı SAF kararı kullanır (kural duplikasyonu olmadan).
 *
 * moduleAccess.ts bu modülü import edip yeniden export eder → mevcut server
 * import yolları (`@/lib/auth/moduleAccess`) DEĞİŞMEDEN çalışır.
 */

/** Route gate anahtarları (kanonik). */
export type ModuleGateKey =
  | "clients"
  | "appointments"
  | "numerology"
  | "stones"
  | "stok"
  | "sifa_rehberi"
  | "energy_body"
  | "reflexology"
  | "aromatherapy"
  | "personal_archive"
  | "video_ceviri"
  | "belge_ceviri"
  | "belge_ceviri_ai"
  | "ders_notu"
  | "human_design"
  | "digital_content"
  | "cosmic_calendar"
  | "cupping"
  | "beslenme";

/** Kanonik anahtar → kabul edilen alias'lar (DB'de her iki biçim de saklanabilir). */
export const MODULE_ALIASES: Record<string, string[]> = {
  clients: ["danisan_yonetimi"],
  appointments: ["ajanda"],
  numerology: ["numeroloji"],
  stones: ["dogaltas"],
  stok: ["stock"],
  sifa_rehberi: ["healing"],
  energy_body: ["biyoenerji"],
  personal_archive: ["kisisel_arsiv"],
  reflexology: ["refleksoloji"],
  aromatherapy: ["aromaterapi"],
  cupping: ["kupa", "hacamat_terapi"],
  video_ceviri: [],
  belge_ceviri: [],
  belge_ceviri_ai: [],
  ders_notu: [],
  human_design: [],
  digital_content: [],
  cosmic_calendar: [],
  beslenme: [],
};

/**
 * FAZ1 FINAL HARDENING (AUTH/FA — AI admin-only): OpenAI maliyeti doğuran AI yüzeyleri
 * YALNIZ yöneticiye açıktır. `module_permissions` içindeki bayraklardan BAĞIMSIZ olarak
 * admin olmayan her kullanıcı için `resolveModuleAccess` false döner.
 *   - video_ceviri     : Video → Türkçe (transcribe/translate/summarize/headings + iş kayıtları)
 *   - ders_notu        : Ders notu temizleme (+ Word dönüşümü)
 *   - belge_ceviri_ai  : SANAL anahtar — belge çeviri modülünün AI uçları (OCR, PDF→Türkçe Word,
 *                        OCR→Word). AI OLMAYAN `belge_ceviri` (pdf-to-word, geçmiş, iş durumu)
 *                        uzmanda modül izniyle KALIR.
 * İstemci (`lib/auth/modulePermissions.ts` hasModulePermission) aynı seti kullanır.
 */
export const ADMIN_ONLY_MODULE_KEYS: ReadonlySet<string> = new Set([
  "video_ceviri",
  "ders_notu",
  "belge_ceviri_ai",
]);

export function isAdminOnlyModuleKey(moduleKey: string): boolean {
  return ADMIN_ONLY_MODULE_KEYS.has(moduleKey);
}

function toFlags(raw: unknown): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") flags[k] = v;
    }
  }
  return flags;
}

function hasFlag(flags: Record<string, boolean>, key: string): boolean {
  if (flags[key] === true) return true;
  for (const alias of MODULE_ALIASES[key] ?? []) {
    if (flags[alias] === true) return true;
  }
  return false;
}

/**
 * SAF karar: bu kullanıcı (role + module_permissions) bu modüle erişebilir mi?
 * Premium bypass YOKTUR. admin → tüm modüller; human_design/cosmic_calendar artık NORMAL
 * modül (module_permissions.<key> === true ise geçer).
 *
 * KAJ-P1-04: cosmic_calendar önceki "herkese açık (always-on)" kısayolu KALDIRILDI (owner
 * kararı "Gerçek kapı"). Artık kişiye-özel module_permissions.cosmic_calendar esastır;
 * admin geçer, izinsiz uzman reddedilir (API 403 / route guard deny). Premium provisioning
 * payload'ı cosmic_calendar=true ürettiği için izinli premium uzmanlar erişimini korur.
 */
export function resolveModuleAccess(
  role: unknown,
  modulePermissions: unknown,
  moduleKey: string,
): boolean {
  if (String(role ?? "").trim().toLowerCase() === "admin") return true;
  // MERGE (KAJ-P1-04 × main): İki eski özel-durum KISAYOLU DA KALDIRILDI →
  //   • cosmic_calendar always-on YOK (owner "Gerçek kapı") → module_permissions.cosmic_calendar,
  //   • beslenme owner-only `return false` YOK (main: beslenme artık NORMAL modül) → module_permissions.beslenme.
  // İkisi de aşağıdaki hasFlag(flags, moduleKey) akışına düşer; admin üstte short-circuit ile
  // zaten geçer; veri erişimi her zaman server-side tenant-scoped kalır.

  // AI admin-only: admin yukarıda short-circuit ile geçti; diğer herkes için kapalı.
  if (isAdminOnlyModuleKey(moduleKey)) return false;

  const flags = toFlags(modulePermissions);
  if (moduleKey === "digital_content") {
    // Hub yalnız uzmana AÇIK kalan alt modüllerden açılır (video/ders notu artık admin-only).
    return hasFlag(flags, "personal_archive") || hasFlag(flags, "belge_ceviri");
  }
  return hasFlag(flags, moduleKey);
}

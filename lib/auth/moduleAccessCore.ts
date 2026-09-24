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
  ders_notu: [],
  human_design: [],
  digital_content: [],
  cosmic_calendar: [],
  beslenme: [],
};

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
 * Premium bypass YOKTUR. admin/cosmic_calendar → true; human_design artık normal modül
 * (module_permissions.human_design === true ise geçer).
 */
export function resolveModuleAccess(
  role: unknown,
  modulePermissions: unknown,
  moduleKey: string,
): boolean {
  if (String(role ?? "").trim().toLowerCase() === "admin") return true;
  if (moduleKey === "cosmic_calendar") return true;
  // Beslenme: OWNER-ONLY (super-admin) faz. Admin (üstte short-circuit) API'de ayrıca
  // requireMainAdmin ile owner'a daraltılır; uzman/anon buradan reddedilir (defense-in-depth).
  if (moduleKey === "beslenme") return false;

  const flags = toFlags(modulePermissions);
  if (moduleKey === "digital_content") {
    return (
      hasFlag(flags, "personal_archive") ||
      hasFlag(flags, "video_ceviri") ||
      hasFlag(flags, "belge_ceviri") ||
      hasFlag(flags, "ders_notu")
    );
  }
  return hasFlag(flags, moduleKey);
}

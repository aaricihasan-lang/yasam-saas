/**
 * Faz 1 / P3 (Commit 2) — Server-side MODÜL ERİŞİM KAPISI.
 *
 * Bağlayıcı: modül izinleri KİŞİYE ÖZELDİR ve SERVER'da zorlanır. Premium paketi
 * artık otomatik tüm modülleri AÇMAZ (runtime bypass kaldırıldı; mevcut Premium
 * erişimler migration 20260919 ile module_permissions'a backfill edildi). İstisnalar:
 *   - admin (role='admin') → tüm modüller (yönetim; modül-gate dışı)
 *   - cosmic_calendar → herkese açık (always-on)
 *   - human_design → "yakında" (admin hariç herkese kapalı)
 *   - digital_content → hub: alt modüllerden (personal_archive/video_ceviri/
 *     belge_ceviri/ders_notu) herhangi biri açıksa erişilebilir
 *
 * Bu dosya SAF resolver + userId-bazlı DB kapısı içerir. Header-token route'ları
 * `requireModuleAccess` (lib/auth/userGuard) kullanır; body/query-userId veya
 * requireDigitalContentUser route'ları `assertUserModuleAccess` kullanır.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  | "cosmic_calendar";

/** Kanonik anahtar → kabul edilen alias'lar (DB'de her iki biçim de saklanabilir). */
const MODULE_ALIASES: Record<string, string[]> = {
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
  video_ceviri: [],
  belge_ceviri: [],
  ders_notu: [],
  human_design: [],
  digital_content: [],
  cosmic_calendar: [],
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
 * Premium bypass YOKTUR. admin/cosmic_calendar → true; human_design → false (yakında).
 */
export function resolveModuleAccess(
  role: unknown,
  modulePermissions: unknown,
  moduleKey: string,
): boolean {
  if (String(role ?? "").trim().toLowerCase() === "admin") return true;
  if (moduleKey === "cosmic_calendar") return true;
  if (moduleKey === "human_design") return false;

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

export type ModuleGateResult = { ok: true } | { ok: false; response: NextResponse };

const MODULE_DENIED = () =>
  NextResponse.json(
    { error: "Bu modül hesabınız için aktif değil. Yöneticinizle iletişime geçin." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );

/**
 * userId-bazlı server kapısı (body/query'den doğrulanmış userId olan route'lar için).
 * Kullanıcının role + module_permissions'ını çeker ve resolveModuleAccess uygular.
 * NOT: çağıran, userId'nin gerçek sahibini (IDOR/token) ZATEN doğrulamış olmalıdır;
 * bu kapı yalnız modül iznini kontrol eder.
 */
export async function assertUserModuleAccess(
  db: SupabaseClient,
  userId: string,
  moduleKey: ModuleGateKey,
): Promise<ModuleGateResult> {
  const { data, error } = await db
    .from("users")
    .select("role, module_permissions")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, response: MODULE_DENIED() };
  }
  if (!resolveModuleAccess(data.role, data.module_permissions, moduleKey)) {
    return { ok: false, response: MODULE_DENIED() };
  }
  return { ok: true };
}

export function moduleDeniedResponse(): NextResponse {
  return MODULE_DENIED();
}

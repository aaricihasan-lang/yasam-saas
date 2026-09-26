/**
 * Faz 1 / P3 (Commit 2) — Server-side MODÜL ERİŞİM KAPISI.
 *
 * Bağlayıcı: modül izinleri KİŞİYE ÖZELDİR ve SERVER'da zorlanır. Premium paketi
 * artık otomatik tüm modülleri AÇMAZ (runtime bypass kaldırıldı; mevcut Premium
 * erişimler migration 20260919 ile module_permissions'a backfill edildi). İstisnalar:
 *   - admin (role='admin') → tüm modüller (yönetim; modül-gate dışı)
 *   - cosmic_calendar → NORMAL modül (KAJ-P1-04): module_permissions.cosmic_calendar === true
 *     ise geçer (önceki "always-on" kısayolu owner "Gerçek kapı" kararıyla kaldırıldı)
 *   - human_design → normal modül: module_permissions.human_design === true ise geçer
 *     (Premium payload'ına dahil + mevcut Premium'lar migration ile backfill)
 *   - digital_content → hub: alt modüllerden (personal_archive/video_ceviri/
 *     belge_ceviri/ders_notu) herhangi biri açıksa erişilebilir
 *
 * Bu dosya SAF resolver + userId-bazlı DB kapısı içerir. Header-token route'ları
 * `requireModuleAccess` (lib/auth/userGuard) kullanır; body/query-userId veya
 * requireDigitalContentUser route'ları `assertUserModuleAccess` kullanır.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
// SAF resolver + tipler artık server-bağımsız çekirdekte (client de kullanabilsin — REF-010).
// Mevcut import yolları korunsun diye buradan YENİDEN EXPORT edilir (davranış aynı).
import { resolveModuleAccess } from "./moduleAccessCore";
import type { ModuleGateKey } from "./moduleAccessCore";
export { resolveModuleAccess };
export type { ModuleGateKey };

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

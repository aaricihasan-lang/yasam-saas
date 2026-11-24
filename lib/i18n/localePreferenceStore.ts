/**
 * Kalıcı dil tercihi — veritabanı katmanı (YALNIZ SUNUCU; I18N-F1).
 * Tablo: public.user_locale_prefs (migration 20280126000000_user_locale_prefs.sql). Uzman başına tek satır.
 * Sahiplik her sorguda tenant_id + user_id ile uygulanır (service_role RLS'yi aştığı için).
 *
 * Migration henüz uygulanmamış bir ortamda (ör. production — uygulama ayrı Owner onayı ister) tablo
 * yoktur: okuma/yazma "unavailable" döner, hiçbir ekran bozulmaz; dil seçimi yalnız cihaz çereziyle sürer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { isActiveLocale, type ActiveLocale } from "./locales";
import type { AccountPreference } from "./localePreference";

assertServerOnly("lib/i18n/localePreferenceStore");

export const LOCALE_PREFS_TABLE = "user_locale_prefs";

export type LocaleOwner = { tenantId: string; userId: string };

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /user_locale_prefs/.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "");
}

export async function readLocalePreference(db: SupabaseClient, owner: LocaleOwner): Promise<AccountPreference> {
  const { data, error } = await db
    .from(LOCALE_PREFS_TABLE)
    .select("preferred_locale")
    .eq("tenant_id", owner.tenantId)
    .eq("user_id", owner.userId)
    .maybeSingle();
  if (error) return { status: "unavailable", reason: isMissingTable(error) ? "not_migrated" : "read_failed" };
  const locale = (data as { preferred_locale?: unknown } | null)?.preferred_locale;
  if (isActiveLocale(locale)) return { status: "set", locale };
  return { status: "unset" };
}

export type WriteResult = { ok: true } | { ok: false; reason: "not_migrated" | "write_failed" };

/**
 * Güncelle → satır yoksa ekle → eşzamanlı ekleme yarışında (23505) yeniden güncelle. Upsert yerine bu sıra:
 * yalnız (preferred_locale, updated_at) UPDATE yetkisiyle çalışır ve kimlik kolonlarına hiç yazmaz.
 */
export async function writeLocalePreference(db: SupabaseClient, owner: LocaleOwner, locale: ActiveLocale): Promise<WriteResult> {
  const fail = (error: { code?: string; message?: string }): WriteResult => ({ ok: false, reason: isMissingTable(error) ? "not_migrated" : "write_failed" });
  const update = () =>
    db.from(LOCALE_PREFS_TABLE).update({ preferred_locale: locale }).eq("tenant_id", owner.tenantId).eq("user_id", owner.userId).select("id");
  const first = await update();
  if (first.error) return fail(first.error);
  if ((first.data ?? []).length > 0) return { ok: true };
  const ins = await db.from(LOCALE_PREFS_TABLE).insert({ tenant_id: owner.tenantId, user_id: owner.userId, preferred_locale: locale });
  if (!ins.error) return { ok: true };
  if (ins.error.code !== "23505") return fail(ins.error);
  const retry = await update();
  if (retry.error) return fail(retry.error);
  return (retry.data ?? []).length > 0 ? { ok: true } : { ok: false, reason: "write_failed" };
}

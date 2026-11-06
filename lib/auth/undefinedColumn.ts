/**
 * PostgREST / PostgreSQL "kolon yok" hatası (42703). Yalnız şema geçiş penceresinde beklenir
 * (TRIAL7: kod, deneme kolonlarını ekleyen migration'dan önce yayımlanırsa) → çağıran eski kolon
 * listesiyle yeniden okur; mevcut üyeler etkilenmez. Saf; IO yok.
 */
export function isUndefinedColumnError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return !!e && (e.code === "42703" || /column .* does not exist/i.test(String(e.message ?? "")));
}

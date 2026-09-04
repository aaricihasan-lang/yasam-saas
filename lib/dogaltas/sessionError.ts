/**
 * Stones-scoped, locale-independent sentinel: oturum/çalışma alanı (tenant)
 * bağlamı yüklenemediğinde kullanılan HATA KODU (kullanıcıya gösterilen metin
 * DEĞİL). Stones UI sınırında `stones.common.workspaceUnavailable` ile localize
 * edilir; böylece TR olmayan kullanıcılara paylaşımlı Türkçe
 * `MISSING_SESSION_TENANT_MESSAGE` sabiti sızmaz.
 *
 * Bu kod bilerek `lib/auth/sessionTenant.ts` içindeki paylaşımlı sabitten
 * AYRIDIR: paylaşımlı sabit (~26 consumer) global olarak değişmez.
 */
export const STONES_WORKSPACE_UNAVAILABLE = "STONES_WORKSPACE_UNAVAILABLE";

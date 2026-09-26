// HD API — merkezî GÜVENLİ HATA SINIRI (server-only).
//
// Amaç (HD-P2-F1): ham DB/Supabase/Postgres hata mesajı, şema/tablo/constraint bilgisi
// ve stack trace İSTEMCİYE SIZMASIN. Gerçek teknik hata YALNIZ server log'una yazılır.
//
// Kurallar:
//   • İstemciye yalnız sade, operasyonel, güvenli genel mesaj döner.
//   • Server log'a Postgres/Supabase code + message yazılır (bağlam etiketiyle).
//   • PII/secret loglanmaz: yalnız hata code+message; satır verisi/gövde LOGLANMAZ.
//   • Beklenen kullanıcı hataları (400/401/403/404) için ayrı, niyetli SAFE mesajlar
//     zaten persistence/route katmanında kullanılır — bu yardımcı YALNIZ ham DB
//     hatalarını (500 sınıfı) maskelemek içindir. HTTP semantiği KORUNUR.

const GENERIC = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";

/** İstemciye gösterilebilir, hiçbir iç detay içermeyen genel mesaj. */
export const HD_GENERIC_ERROR = GENERIC;

/**
 * Ham hatayı server'a logla (PII yok — yalnız Postgres code + message + bağlam).
 * İstemciye HİÇBİR ŞEY göndermez; çağıran ayrı güvenli mesaj döndürür.
 */
export function logHdError(context: string, error: unknown): void {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : undefined;
  const message = typeof e?.message === "string" ? e.message : String(error);
  // YALNIZ server konsolu — istemciye asla ulaşmaz.
  console.error(`[hd] ${context}${code ? ` [${code}]` : ""}: ${message}`);
}

/**
 * Ham DB hatasını server'a logla; İSTEMCİYE güvenli genel mesaj döndür.
 * Persistence/route sınırında `error.message` YERİNE kullanılır.
 */
export function hdSafeDbError(context: string, error: unknown): string {
  logHdError(context, error);
  return GENERIC;
}

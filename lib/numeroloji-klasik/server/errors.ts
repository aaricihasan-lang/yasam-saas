/**
 * Klasik Numeroloji — uzmana dönen hata kodları ve TÜRKÇE mesajlar.
 * Hiçbir mesaj sağlayıcı adı, iç uç adı, anahtar veya ham hata metni içermez.
 */
export const CLASSIC_ERRORS = Object.freeze({
  NOT_FOUND: { status: 404, error: "Bulunamadı." },
  DEMO_READONLY: { status: 403, error: "Demo hesapta yeni analiz hesaplanamaz ve kayıt değiştirilemez." },
  CLIENTS_PERMISSION: { status: 403, error: "Danışana bağlamak için Danışan Yönetimi izniniz olmalı." },
  CLIENT_NOT_FOUND: { status: 404, error: "Danışan bulunamadı." },
  PROVIDER_CALLS_DISABLED: { status: 503, error: "Yeni hesaplama şu an kapalı. Kayıtlı analizlerinizi açabilirsiniz." },
  NOT_CONFIGURED: { status: 503, error: "Hesaplama servisi henüz yapılandırılmadı. Kayıtlı analizlerinizi açabilirsiniz." },
  QUOTA_PROTECTED: { status: 503, error: "Hesaplama kapasitesi geçici olarak korumaya alındı. Lütfen daha sonra tekrar deneyin." },
  RATE_LIMITED: { status: 429, error: "Kısa sürede çok fazla hesaplama yapıldı. Lütfen biraz sonra tekrar deneyin." },
  IN_PROGRESS: { status: 409, error: "Aynı hesaplama şu an sürüyor. Birkaç saniye sonra tekrar deneyin." },
  PROVIDER_TIMEOUT: { status: 504, error: "Hesaplama servisi zamanında yanıt vermedi. Tekrar deneyebilirsiniz." },
  PROVIDER_ERROR: { status: 502, error: "Hesaplama şu an tamamlanamadı. Lütfen daha sonra tekrar deneyin." },
  SAVE_FAILED: { status: 500, error: "Analiz hesaplandı ancak kaydedilemedi. Tekrar denediğinizde ek hesap yapılmaz." },
  DB_ERROR: { status: 500, error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." },
  CONFLICT: { status: 409, error: "Kayıt başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin." },
  INVALID_ID: { status: 404, error: "Bulunamadı." },
  METHOD_NOT_ALLOWED: { status: 405, error: "Bu işlem desteklenmiyor." },
} as const);

export type ClassicErrorCode = keyof typeof CLASSIC_ERRORS;

export type ClassicServiceResponse<T = Record<string, unknown>> =
  | { status: number; body: { ok: true } & T }
  | { status: number; body: { ok: false; code: string; error: string; field?: string; retryAfterSec?: number } };

export function classicFail(code: ClassicErrorCode, extra: { retryAfterSec?: number } = {}): ClassicServiceResponse<never> {
  const e = CLASSIC_ERRORS[code];
  return { status: e.status, body: { ok: false, code, error: e.error, ...extra } };
}

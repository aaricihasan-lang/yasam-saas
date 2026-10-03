// HD — iyimser eşzamanlılık (optimistic concurrency) yardımcıları (server-only).
//
// P2-9: İki sekmede/cihazda aynı kayıt düzenlendiğinde sonra kaydeden, öncekinin
// değişikliğini SESSİZCE eziyordu (son-yazan-kazanır). Mevcut `updated_at` kolonu sürüm
// olarak kullanılır (şema değişikliği gerekmez):
//   • İstemci yüklediği satırın `updated_at`'ini `expected_updated_at` olarak gönderir.
//   • Sunucu UPDATE'i `.eq("updated_at", expected)` ile KOŞULLU yapar (tek ifade, atomik).
//   • 0 satır güncellendiyse ve kayıt hâlâ varsa → 409 CONFLICT (üzerine yazılmadı).
// `expected_updated_at` gönderilmezse (eski istemci/doğrudan API) eski davranış korunur.

export const HD_CONFLICT_CODE = "CONFLICT";
export const HD_CONFLICT_MESSAGE =
  "Bu kayıt başka bir oturumda değiştirildi. Değişiklikleriniz kaydedilmedi; sayfayı yenileyip son hâli üzerinde tekrar deneyin.";

/**
 * Gövdeden beklenen sürümü oku.
 *   undefined → istemci sürüm göndermedi (kontrol yok, geriye uyum)
 *   string    → beklenen updated_at
 */
export function readExpectedVersion(body: Record<string, unknown>): string | undefined {
  if (!("expected_updated_at" in body)) return undefined;
  const v = body.expected_updated_at;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

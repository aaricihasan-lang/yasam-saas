/**
 * lib/sifa-rehberi/ids.ts — Şifa Rehberi route kimlik (UUID) doğrulaması (tek kaynak).
 *
 * NEDEN: Dinamik route parametreleri (`[id]`) ve body `guideId` değerleri doğrudan
 * `uuid` kolonlarına (`.eq("id", …)` / `.in("id", …)`) gidiyordu. Geçersiz (non-UUID)
 * bir değer Postgres `22P02 invalid input syntax for type uuid` hatası üretiyor ve route
 * bunu sanitize edilmiş 500'e çeviriyordu. Kullanıcı/istemci girdisi kaynaklı bu durum
 * 500 DEĞİL, temiz bir 404/400 olmalıdır. Bu helper, DB'ye gitmeden önce biçim guard'ı
 * sağlar (ham 22P02 asla yüzeye çıkmaz).
 *
 * Tek kaynak: `guides/route.ts` içindeki yerel `UUID_RE` (create `request_id` guard'ı) da
 * buradan içe aktarılır → kopya-yapıştır borcu oluşmaz.
 */

/** RFC-4122 biçim guard'ı (versiyon/variant'a bakmaz; Postgres `uuid` cast'ini korur). */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Değer geçerli bir UUID string'i mi? (trim uygulanır) */
export function isSifaUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

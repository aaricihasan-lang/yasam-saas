/**
 * Refleksoloji API rotaları için UUID doğrulaması.
 *
 * `/api/refleksoloji/protocols/[id]` param'ı doğrudan `uuid` kolonuna eşlenen
 * bir Supabase sorgusuna gidiyordu; `abc` gibi bozuk bir değer ham Postgres
 * `22P02` hatası → 500 üretiyordu. Geçersiz UUID artık istek DB'ye ulaşmadan
 * 400 ile reddedilir. Geçerli ama var olmayan UUID → mevcut 404 semantiği korunur.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

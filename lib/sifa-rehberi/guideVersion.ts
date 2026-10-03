/**
 * Şifa Rehberi — iyimser kilit (optimistic concurrency) sürüm belirteci (SIFA-1).
 *
 * KÖK NEDEN (SIFA-1): İki sekme aynı rehberi düzenlerken bayat sekmenin Kaydet'i
 * (PATCH guides/[id] + PUT sections → RPC tüm bölümleri silip gönderileni yazar) diğer
 * sekmenin kaydettiği değişikliği SESSİZCE geri alıyordu (lost update).
 *
 * SÖZLEŞME (Aromaterapi ARO-008 deseni):
 *   - İstemci, yüklediği kaydın `updated_at` değerini AYNEN `expected_updated_at` olarak yollar.
 *   - Sunucu güncellemeyi `.eq("updated_at", expected)` ile KOŞULLU yapar (tek cümle CAS).
 *     0 satır + kayıt var → 409 `{ ok:false, stale:true }`; başarı → yeni `updated_at` döner.
 *   - `expected_updated_at: null` YALNIZ `updated_at` kolonu NULL olan eski (legacy/import)
 *     kayıtlar içindir → sunucu `.is("updated_at", null)` ile eşler. Anahtar HİÇ yoksa → 400.
 *
 * Saf modül (sunucu + istemci ortak): Next/Supabase importu YOK.
 */

/** 409 sürüm çakışmasında kullanıcıya gösterilen mesaj (UI + API ortak). */
export const SIFA_STALE_MESSAGE =
  "Kayıt siz düzenlerken başka bir yerde güncellendi. Son değişiklikleri yükleyip tekrar deneyin.";

export const SIFA_MISSING_VERSION_MESSAGE =
  "Kayıt sürüm bilgisi eksik. Sayfayı yenileyip tekrar deneyin.";

export const SIFA_INVALID_VERSION_MESSAGE =
  "Kayıt sürüm bilgisi geçersiz. Sayfayı yenileyip tekrar deneyin.";

export type SifaVersionErrorCode = "SIFA_MISSING_VERSION" | "SIFA_INVALID_VERSION";

export type ParsedExpectedVersion =
  | { ok: true; value: string | null }
  | { ok: false; code: SifaVersionErrorCode; error: string };

/** timestamptz metni: PostgREST ("2026-10-03T10:11:12.123456+00:00") / ISO ("…Z") / pg ("… +00"). */
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Belirteç biçim doğrulaması (string + ayrıştırılabilir zaman damgası). */
export function isValidVersionToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 40) return false;
  if (!TIMESTAMP_RE.test(v)) return false;
  return Number.isFinite(Date.parse(v));
}

/**
 * İstek gövdesinden `expected_updated_at` okur.
 *   - anahtar yok / undefined → SIFA_MISSING_VERSION (400)
 *   - null → legacy NULL-updated_at kaydı (geçerli)
 *   - string + geçerli zaman damgası → geçerli (trim'li)
 *   - diğer her şey → SIFA_INVALID_VERSION (400)
 */
export function parseExpectedUpdatedAt(body: Record<string, unknown>): ParsedExpectedVersion {
  if (!("expected_updated_at" in body) || body.expected_updated_at === undefined) {
    return { ok: false, code: "SIFA_MISSING_VERSION", error: SIFA_MISSING_VERSION_MESSAGE };
  }
  const raw = body.expected_updated_at;
  if (raw === null) return { ok: true, value: null };
  if (!isValidVersionToken(raw)) {
    return { ok: false, code: "SIFA_INVALID_VERSION", error: SIFA_INVALID_VERSION_MESSAGE };
  }
  return { ok: true, value: raw.trim() };
}

/**
 * Yeni sürüm damgası: şimdi; ancak beklenen sürümden KESİNLİKLE ileri (aynı milisaniyede
 * iki yazım veya saat kayması olsa bile yeni değer eskisine EŞİT olamaz → CAS anlamı korunur).
 */
export function nextVersionStamp(expected: string | null, now: Date = new Date()): string {
  let ms = now.getTime();
  if (expected) {
    const prev = Date.parse(expected);
    if (Number.isFinite(prev) && ms <= prev) ms = Math.floor(prev) + 1;
  }
  return new Date(ms).toISOString();
}

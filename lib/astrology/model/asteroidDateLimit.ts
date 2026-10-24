// Asteroit efemeris tarih sınırı (2026-10-24, owner kararı madde 3).
// Gerçek çağrılarla ölçüldü (QA 43-asteroit-sinir + 52-asteroit-sinir defterleri; sentetik İstanbul/Apia kişileri):
//   üst: 2500-12-29T23:15Z KABUL (son doğrulanan) · 23:59Z ve sonrası HTTP 400
//   alt: 1599-12-30T10:04:08Z KABUL (ilk doğrulanan) · 1575-06-15 ve 1550-01-01 (ürün profil tabanı) HTTP 400
// 400 yanıtı ücretlenir ama sonuç vermez → istek GÖNDERİLMEZ. Ölçülmemiş aralık (1575-06 … 1599-12-30) güvenli tarafta kalır.
// Karar sağlayıcıya GİDECEK gövdenin anından verilir (yerel tarih/saat − ofset): saat bilinmiyorsa gövde yerel 12:00 taşır,
// LMT ofseti dakikaya yuvarlanmış hâliyle gönderilir — sağlayıcının gördüğü an budur. Yalnız asteroit bölümü atlanır.

/** Asteroit isteği kabul edilen İLK doğrulanmış an (UTC). Öncesi 400 ya da ölçülmemiş → istek gönderilmez. */
export const ASTEROID_FIRST_VERIFIED_UTC_MS = Date.parse("1599-12-30T10:04:08Z");
/** Asteroit isteği kabul edilen SON doğrulanmış an (UTC). Sonrası sınır belirsiz ya da 400 → istek gönderilmez. */
export const ASTEROID_LAST_VERIFIED_UTC_MS = Date.parse("2500-12-29T23:15:00Z");

export const ASTEROID_DATE_SKIP_REASON =
  "Asteroit konumları yalnız 30 Aralık 1599 – 29 Aralık 2500 arasında doğrulanmış hesaplama kapsamında verilir; bu doğum anı kapsam dışında olduğundan asteroit bölümü hesaplanmaz (istek gönderilmez). Lot ve Lilith bölümleri etkilenmez.";

/** Ekran/rapor: asteroit bölümü seçili ama kayıtta yoksa gösterilen açıklama (kayıtta doğum anı taşınmadığı için olası nedenler). */
export const ASTEROID_MISSING_NOTE =
  "Asteroitler bu kayıtta yok: doğum anı asteroit hesaplama kapsamının (30 Aralık 1599 – 29 Aralık 2500) dışında olabilir ya da seçilen ev sistemi bu enlemde tanımsızdır.";

/** Sağlayıcı gövdesindeki yerel tarih/saat + saat ofseti (saat) → UTC ms. Geçersizse null. */
export function bodyInstantUtcMs(body: Record<string, unknown>): number | null {
  const { date, time, timezone } = body;
  if (typeof date !== "string" || typeof time !== "string" || typeof timezone !== "number" || !Number.isFinite(timezone)) return null;
  const ms = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  return Number.isFinite(ms) ? ms - Math.round(timezone * 3600) * 1000 : null;
}

/** Bu gövdeyle asteroit isteği doğrulanmış kapsamın dışında mı? Çözülemeyen gövde → dışında (fail-closed: istek gönderilmez). */
export function asteroidBodyOutOfRange(body: Record<string, unknown>): boolean {
  const t = bodyInstantUtcMs(body);
  return t === null || t < ASTEROID_FIRST_VERIFIED_UTC_MS || t > ASTEROID_LAST_VERIFIED_UTC_MS;
}

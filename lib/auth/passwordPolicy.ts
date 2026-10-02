/**
 * Parola politikası — TEK KAYNAK (client + server + harness; DOM/Node API'si YOK).
 *
 * OWNER KARARI (2026-10, satış öncesi kapanış delta):
 *   - Kullanıcıya görünen terim "Parola" (PIN DEĞİL).
 *   - Minimum 6 karakter. Büyük/küçük harf, özel karakter, harf+rakam ZORUNLU DEĞİL →
 *     yalnız rakamlardan oluşan 6 karakter (ör. 482731) GEÇERLİ.
 *   - Bariz/çok yaygın parolalar (123456, 000000, 111111, 654321 …) YENİ parola belirlenirken
 *     reddedilir: tek karakter tekrarı, ardışık artan/azalan rakam dizisi ve küçük bir yaygın
 *     parola listesi. Karmaşıklık kuralı GETİRİLMEZ.
 *   - Politika YALNIZ yeni parola belirlemede uygulanır (kayıt, admin oluşturma, admin sıfırlama,
 *     parola değiştirme). Girişte uzunluk/politika kontrolü YOKTUR → mevcut parolalar etkilenmez.
 * Saklama güvenliği ayrıdır: bcrypt cost 10 (hash_password), düz metin saklama yok.
 */

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyCode = "password_too_short" | "password_too_long" | "password_too_common" | "password_equals_email";

export const PASSWORD_POLICY_MESSAGES: Record<PasswordPolicyCode, string> = {
  password_too_short: `Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`,
  password_too_long: `Parola en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`,
  password_too_common: "Bu parola çok kolay tahmin edilir. Lütfen farklı bir parola seçin.",
  password_equals_email: "Parola e-posta adresinizle aynı olamaz.",
};

/** Kullanıcıya gösterilen kısa kural metni (formlarda ipucu olarak). */
export const PASSWORD_HINT = `En az ${PASSWORD_MIN_LENGTH} karakter. Rakam, harf veya ikisi birlikte kullanılabilir.`;

/**
 * Çok yaygın parolalar (küçük harfe çevrilmiş). Kısa ve bilinçli tutulur: amaç bariz
 * değerleri durdurmak; kullanım kolaylığını bozacak geniş bir sözlük DEĞİL.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "123123", "112233", "121212", "123321", "321321", "102030", "101010", "111222", "112211",
  "696969", "131313", "202020", "212121", "232323", "123654", "147258", "159753", "147852",
  "1234567", "12345678", "123456789", "1234567890", "0123456789", "11223344", "123123123",
  "qwerty", "qwerty1", "qwerty123", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "azerty",
  "abcdef", "abc123", "abcd1234", "password", "password1", "passw0rd", "parola", "parola1",
  "sifre", "şifre", "sifre123", "şifre123", "123qwe", "1q2w3e", "1q2w3e4r", "iloveyou",
  "yasam", "yasam123", "yasamsistemi", "admin", "admin1", "admin123", "galatasaray",
  "fenerbahce", "besiktas", "trabzonspor", "türkiye", "turkiye",
]);

const DIGITS_ASC = "0123456789";
const DIGITS_DESC = "9876543210";

/** Tüm karakterler aynı mı? (000000, 111111, aaaaaa) */
function isSingleCharRepeat(p: string): boolean {
  return p.length > 0 && [...p].every((ch) => ch === p[0]);
}

/** Tamamı ardışık rakam dizisi mi? (123456, 234567, 654321, 987654 — döngüsel 890123 dahil) */
function isSequentialDigits(p: string): boolean {
  if (!/^\d+$/.test(p) || p.length < 4) return false;
  const asc = DIGITS_ASC + DIGITS_ASC;
  const desc = DIGITS_DESC + DIGITS_DESC;
  return asc.includes(p) || desc.includes(p);
}

/** Bariz/yaygın parola mı? (yalnız yeni parola belirlemede kullanılır) */
export function isObviousPassword(password: string): boolean {
  const p = password.trim().toLocaleLowerCase("tr-TR");
  if (!p) return false;
  return isSingleCharRepeat(p) || isSequentialDigits(p) || COMMON_PASSWORDS.has(p);
}

/**
 * Yeni parola politikası. Girdi KIRPILMIŞ parola olmalı (kayıt/giriş/değiştirme hepsi trim eder).
 * Döner: ihlal kodu veya null (geçerli).
 */
export function newPasswordPolicyCode(password: string, email = ""): PasswordPolicyCode | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "password_too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "password_too_long";
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return "password_equals_email";
  if (isObviousPassword(password)) return "password_too_common";
  return null;
}

/** İhlal varsa kullanıcıya gösterilecek Türkçe mesaj, yoksa null. */
export function newPasswordPolicyMessage(password: string, email = ""): string | null {
  const code = newPasswordPolicyCode(password, email);
  return code ? PASSWORD_POLICY_MESSAGES[code] : null;
}

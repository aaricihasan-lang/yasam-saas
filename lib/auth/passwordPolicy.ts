/**
 * Parola politikası — TEK KAYNAK (client + server + harness; DOM/Node API'si YOK).
 *
 * OWNER NİHAİ KARARI (2026-10-03, satış öncesi kapanış):
 *   - Kullanıcıya görünen terim "Parola" (PIN DEĞİL).
 *   - Yeni parola için TEK zorunluluk: EN AZ 6 KARAKTER.
 *     Kabul: 123456, 000000, abcdef, Ayse12, yalnız rakam, yalnız harf, karma.
 *     Zorunlu DEĞİL: büyük/küçük harf, rakam, özel karakter, harf+rakam kombinasyonu.
 *     Yaygın parola listesi (blocklist) YOK; "e-posta ile aynı olamaz" vb. ek kural YOK.
 *     (Üst sınır 128 yalnız teknik/DoS sınırıdır; bir bileşim kuralı değildir.)
 *   - Politika YALNIZ yeni parola belirlemede uygulanır (kayıt, admin oluşturma, admin sıfırlama,
 *     parola değiştirme). GİRİŞTE uzunluk/bileşim kontrolü YOKTUR → mevcut parolalar etkilenmez.
 * Güvenlik ayrıdır ve KORUNUR: bcrypt cost 10 (hash_password), düz metin saklama yok, giriş
 * kısıtlama/kilit (auth_login_guarded), sunucu tarafı oturum güvenliği.
 */

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyCode = "password_too_short" | "password_too_long";

/** Desteklenen mesaj dilleri (arayüzde aktif olmayan diller de hazır tutulur). */
export const PASSWORD_POLICY_LOCALES = ["tr", "en", "de", "fr", "nl", "es"] as const;
export type PasswordPolicyLocale = (typeof PASSWORD_POLICY_LOCALES)[number];

/**
 * Kural metinleri — tüm dillerde anlam yalnız "en az 6 karakter". Özel karakter / büyük harf
 * vb. zorunluluk ifadesi YOKTUR (yabancı kullanıcılar Türkçe karakter gerektiren bir kurala takılmaz).
 */
export const PASSWORD_POLICY_I18N: Record<
  PasswordPolicyLocale,
  { hint: string; tooShort: string; tooLong: string }
> = {
  tr: {
    hint: `En az ${PASSWORD_MIN_LENGTH} karakter.`,
    tooShort: `Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`,
    tooLong: `Parola en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`,
  },
  en: {
    hint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
    tooShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    tooLong: `Password can be at most ${PASSWORD_MAX_LENGTH} characters.`,
  },
  de: {
    hint: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`,
    tooShort: `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`,
    tooLong: `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
  },
  fr: {
    hint: `Au moins ${PASSWORD_MIN_LENGTH} caractères.`,
    tooShort: `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`,
    tooLong: `Le mot de passe peut contenir au maximum ${PASSWORD_MAX_LENGTH} caractères.`,
  },
  nl: {
    hint: `Minimaal ${PASSWORD_MIN_LENGTH} tekens.`,
    tooShort: `Het wachtwoord moet minimaal ${PASSWORD_MIN_LENGTH} tekens bevatten.`,
    tooLong: `Het wachtwoord mag maximaal ${PASSWORD_MAX_LENGTH} tekens bevatten.`,
  },
  es: {
    hint: `Al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    tooShort: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    tooLong: `La contraseña puede tener como máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  },
};

function resolvePolicyLocale(locale: string | null | undefined): PasswordPolicyLocale {
  const l = String(locale ?? "").trim().toLowerCase().slice(0, 2);
  return (PASSWORD_POLICY_LOCALES as readonly string[]).includes(l) ? (l as PasswordPolicyLocale) : "tr";
}

/** Varsayılan (TR) mesajlar — mevcut sunucu yanıtlarıyla uyumlu. */
export const PASSWORD_POLICY_MESSAGES: Record<PasswordPolicyCode, string> = {
  password_too_short: PASSWORD_POLICY_I18N.tr.tooShort,
  password_too_long: PASSWORD_POLICY_I18N.tr.tooLong,
};

/** Kullanıcıya gösterilen kısa kural metni (TR; formlarda ipucu olarak). */
export const PASSWORD_HINT = PASSWORD_POLICY_I18N.tr.hint;

/** Dile göre kural ipucu ("en az 6 karakter"). Bilinmeyen dil → TR. */
export function passwordHintFor(locale: string | null | undefined): string {
  return PASSWORD_POLICY_I18N[resolvePolicyLocale(locale)].hint;
}

/**
 * Yeni parola politikası. Girdi KIRPILMIŞ parola olmalı (kayıt/giriş/değiştirme hepsi trim eder).
 * `email` parametresi geriye uyumluluk için kabul edilir; owner kararıyla KULLANILMAZ.
 * Döner: ihlal kodu veya null (geçerli).
 */
export function newPasswordPolicyCode(password: string, email = ""): PasswordPolicyCode | null {
  void email;
  if (password.length < PASSWORD_MIN_LENGTH) return "password_too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "password_too_long";
  return null;
}

/** İhlal varsa kullanıcıya gösterilecek mesaj (varsayılan TR), yoksa null. */
export function newPasswordPolicyMessage(password: string, email = "", locale?: string | null): string | null {
  const code = newPasswordPolicyCode(password, email);
  if (!code) return null;
  const m = PASSWORD_POLICY_I18N[resolvePolicyLocale(locale)];
  return code === "password_too_short" ? m.tooShort : m.tooLong;
}

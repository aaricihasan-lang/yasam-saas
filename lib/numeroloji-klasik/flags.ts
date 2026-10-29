/**
 * Klasik Numeroloji — sunucu bayrakları (SAF; env yalnız parametre olarak okunur).
 *
 *   • NUMEROLOGY_CLASSIC_ENABLED        tam olarak "true" değilse modül YOKTUR (API 404, sayfa notFound()).
 *   • NUMEROLOGY_CLASSIC_PROVIDER_CALLS tam olarak "true" değilse yeni hesap (ücretli çağrı) yapılmaz;
 *                                        kayıtlı analizler okunmaya devam eder.
 *
 * "1", "TRUE", " true", boş, tanımsız → KAPALI. NEXT_PUBLIC_ DEĞİLDİR → istemci paketine girmez.
 */
type Env = Record<string, string | undefined>;

export function isClassicEnabled(env: Env = process.env): boolean {
  return env.NUMEROLOGY_CLASSIC_ENABLED === "true";
}

export function isClassicProviderCallsEnabled(env: Env = process.env): boolean {
  return env.NUMEROLOGY_CLASSIC_PROVIDER_CALLS === "true";
}

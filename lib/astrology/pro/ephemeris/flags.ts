// Gökyüzü Atlası — PROFESYONEL EFEMERİS bayrakları (yalnız SUNUCU env'i; istemci paketine girmez, derleme anında sabitlenmez).
//
//   ATLAS_PRO_EPHEMERIS_ENABLED=1   → ekran + API açılır. Tanımsız/başka değer → sayfa notFound(), API tek tip 404 (VARSAYILAN KAPALI).
//   ATLAS_PRO_EPHEMERIS_PROVIDER=1  → (ek olarak) sunucu sağlayıcı kaynağı (00:00 UT, gün başına 1 ücretli çağrı). Varsayılan KAPALI.
// Menü / gezinme bağlantısı YOKTUR; sayfa yalnız doğrudan adresle açılır.

export const isProEphemerisEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ATLAS_PRO_EPHEMERIS_ENABLED === "1";
export const isProEphemerisProviderEnabled = (env: NodeJS.ProcessEnv = process.env) => isProEphemerisEnabled(env) && env.ATLAS_PRO_EPHEMERIS_PROVIDER === "1";

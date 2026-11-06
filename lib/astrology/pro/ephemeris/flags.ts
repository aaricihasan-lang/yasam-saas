// Gökyüzü Atlası — PROFESYONEL EFEMERİS bayrakları (yalnız SUNUCU env'i; istemci paketine girmez, derleme anında sabitlenmez).
//
//   02.11.2026 owner kararı: güvenlik ve yetki kontrolleri tamamlandı → Gökyüzü Araçları (Efemeris · Ay Evreleri ve Tutulmalar ·
//   Derece Geçişleri) VARSAYILAN AÇIK; Atlas menüsü bağlantısı da açılır.
//   ATLAS_PRO_EPHEMERIS_ENABLED=0   → ACİL KAPATMA: sayfa notFound(), API tek tip 404, menü bağlantısı gizlenir. Tanımsız/başka değer → açık.
//   ATLAS_PRO_EPHEMERIS_PROVIDER=1  → (ek olarak) sunucu sağlayıcı kaynağı (00:00 UT, gün başına 1 ücretli çağrı). Varsayılan KAPALI.
//   ATLAS_PRO_EPHEMERIS_ENGINE      → yerel KONUM kaynağı (03.11.2026 owner kararı): tanımsız/başka değer = "de440" (JPL DE440,
//                                     varsayılan); "legacy" = eski astronomy-engine 2.1.19 (KONTROLLÜ GERİ DÖNÜŞ; sonuçlarda açıkça
//                                     "düşük hassasiyetli yedek motor" yazılır). DE440 dosyası yoksa eski motora SESSİZ düşüş YOK.

export const isProEphemerisEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ATLAS_PRO_EPHEMERIS_ENABLED !== "0";
export const isProEphemerisProviderEnabled = (env: NodeJS.ProcessEnv = process.env) => isProEphemerisEnabled(env) && env.ATLAS_PRO_EPHEMERIS_PROVIDER === "1";

export type PositionEngine = "de440" | "legacy";
export const proEphemerisEngine = (env: NodeJS.ProcessEnv = process.env): PositionEngine => (env.ATLAS_PRO_EPHEMERIS_ENGINE === "legacy" ? "legacy" : "de440");

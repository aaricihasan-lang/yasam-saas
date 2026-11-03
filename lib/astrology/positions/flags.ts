// Gökyüzü Atlası — ORTAK KONUM KAYNAĞI bayrakları (yalnız SUNUCU env'i). `lib/astrology/pro/**` dışındaki motorlar (transit) da
// buradan okur (Z19: pro dışı kod pro/** içe aktaramaz). Değerler süreç ortamından HER ÇAĞRIDA okunur (test ve acil geri dönüş).
//
//   ATLAS_PRO_EPHEMERIS_ENGINE → Profesyonel Efemeris + Derece Geçişleri konum kaynağı (03.11.2026 AŞAMA 1).
//   ATLAS_TRANSIT_ENGINE       → Gelişmiş Transit Taraması konum kaynağı (03.11.2026 AŞAMA 2). Ayrı bayrak: transit sonuçları
//                                KAYDEDİLİR, efemeris sonuçları kaydedilmez → ikisi bağımsız geri alınabilmeli.
// İkisinde de tanımsız/başka değer = "de440" (NASA/JPL DE440); "legacy" = astronomy-engine 2.1.19 (KONTROLLÜ GERİ DÖNÜŞ).
// DE440 dosyası yoksa eski motora SESSİZ düşüş YOK (çağıran açık hata döner).

export type PositionEngine = "de440" | "legacy";
export const proEphemerisEngine = (env: NodeJS.ProcessEnv = process.env): PositionEngine => (env.ATLAS_PRO_EPHEMERIS_ENGINE === "legacy" ? "legacy" : "de440");
export const transitPositionEngine = (env: NodeJS.ProcessEnv = process.env): PositionEngine => (env.ATLAS_TRANSIT_ENGINE === "legacy" ? "legacy" : "de440");

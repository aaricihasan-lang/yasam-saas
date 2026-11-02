// Gökyüzü Atlası — GÖKYÜZÜ ARAÇLARI görünürlüğü (Efemeris · Ay Evreleri ve Tutulmalar · Derece Geçişleri).
// Kural `lib/astrology/pro/ephemeris/flags.ts` isProEphemerisEnabled ile BİREBİR aynıdır (aynı sunucu env'i). Ürün kodu pro/**
// içe aktaramadığı için (Z19) erişim yoklaması menü bağlantısının görünürlüğünü buradan okur; sayfa, API ve proxy kapısı pro
// bayrağını kullanmaya devam eder. Yalnız SUNUCU env'i; istemci paketine girmez.
// 02.11.2026: varsayılan AÇIK; ATLAS_PRO_EPHEMERIS_ENABLED=0 acil kapatma (pro bayrağıyla aynı kural).
export const isSkyToolsEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ATLAS_PRO_EPHEMERIS_ENABLED !== "0";

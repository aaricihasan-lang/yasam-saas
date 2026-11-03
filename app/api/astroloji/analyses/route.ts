// Astroloji UZMAN yüzeyi (Aşama 7C). Handler'lar admin kabuğuyla AYNI (tek iş mantığı kaynağı);
// yetki kapısı requireAstrologyAccess isteğin yolu /api/astroloji olduğu için UZMAN kuralını uygular:
// requireModuleAccess("astrology") + owner kuralı + module_permissions + uzman sahipliği.
export { GET, POST } from "@/app/api/admin/astroloji/analyses/route";
export const runtime = "nodejs";
// 03.11.2026 DE440 AŞAMA 2: transit taraması bu uçta YEREL hesaplanır (sağlayıcı çağrısı yok; ≤ birkaç sn) ve DE440 verisini okur.
// maxDuration 60 → Vercel bu rotayı DE440'ı zaten taşıyan 60 sn fonksiyon grubuna koyar (aksi hâlde ~120 MB dosya varsayılan
// gruba, yani yüzlerce ilgisiz rotanın paketine eklenirdi). Ayrıntı: docs/astrology/pro/de440-konum-motoru.md §9.
export const maxDuration = 60;

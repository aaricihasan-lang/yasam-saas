// Astroloji UZMAN yüzeyi (Aşama 7C). Handler'lar admin kabuğuyla AYNI (tek iş mantığı kaynağı);
// yetki kapısı requireAstrologyAccess isteğin yolu /api/astroloji olduğu için UZMAN kuralını uygular:
// requireModuleAccess("astrology") + owner kuralı + module_permissions + uzman sahipliği.
export { POST } from "@/app/api/admin/astroloji/engine/view/route";
export const runtime = "nodejs";

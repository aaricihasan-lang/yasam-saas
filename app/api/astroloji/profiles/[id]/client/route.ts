// Astroloji UZMAN yüzeyi (Aşama 7C). Handler'lar admin kabuğuyla AYNI (tek iş mantığı kaynağı);
// yetki kapısı requireAstrologyAccess isteğin yolu /api/astroloji olduğu için UZMAN kuralını uygular:
// requireModuleAccess("astrology") + owner kuralı + module_permissions + uzman sahipliği.
export { PUT, DELETE } from "@/app/api/admin/astroloji/profiles/[id]/client/route";
export const runtime = "nodejs";

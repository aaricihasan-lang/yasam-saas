// Astroloji UZMAN yüzeyi — /api/astroloji/engine/run. Handler admin yüzeyiyle (app/api/admin/astroloji/engine/run) AYNI;
// yetki kapısı requireAstrologyAccess isteğin yolu /api/astroloji olduğu için UZMAN kuralını uygular:
// requireModuleAccess("astrology") + owner kuralı + module_permissions + uzman sahipliği.
// TRIAL7: deneme uzmanının GERÇEK Roxy istekleri günlük ortak krediden düşer (admin yüzeyi sarılmaz).
import { POST as enginePost } from "@/app/api/admin/astroloji/engine/run/route";
import { withTrialRoxyMeter } from "@/lib/trial/roxyMeter";

export const POST = withTrialRoxyMeter("astrology", "astroloji/engine/run", enginePost);
export const runtime = "nodejs";
export const maxDuration = 300;

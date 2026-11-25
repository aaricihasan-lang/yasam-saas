// Astroloji UZMAN yüzeyi: handler admin kabuğuyla AYNI; requireAstrologyAccess yol /api/astroloji olduğu için UZMAN kuralını uygular.
// TRIAL7: deneme uzmanının GERÇEK sağlayıcı isteği (yeni ay; önbellek ıskası) günlük ortak krediden düşer (önbellek isabeti düşmez).
import { POST as monthlyPost } from "@/app/api/admin/astroloji/efemeris/aylik/route";
import { withTrialRoxyMeter } from "@/lib/trial/roxyMeter";

export const POST = withTrialRoxyMeter("astrology", "astroloji/efemeris/aylik", monthlyPost);
export const runtime = "nodejs";
export const maxDuration = 60;

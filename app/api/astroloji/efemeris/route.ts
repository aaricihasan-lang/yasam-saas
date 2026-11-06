// Astroloji UZMAN yüzeyi: handler admin kabuğuyla AYNI; requireAstrologyAccess yol /api/astroloji olduğu için UZMAN kuralını uygular.
// TRIAL7: deneme uzmanının GERÇEK Roxy istekleri (source: "provider") günlük ortak krediden düşer (admin yüzeyi sarılmaz).
import { POST as efemerisPost } from "@/app/api/admin/astroloji/efemeris/route";
import { withTrialRoxyMeter } from "@/lib/trial/roxyMeter";

export const POST = withTrialRoxyMeter("astrology", "astroloji/efemeris", efemerisPost);
export const runtime = "nodejs";
export const maxDuration = 60;

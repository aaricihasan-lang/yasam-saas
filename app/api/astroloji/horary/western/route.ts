// Astroloji UZMAN yüzeyi: handler admin kabuğuyla AYNI; requireAstrologyAccess yol /api/astroloji olduğu için UZMAN kuralını uygular.
export { POST } from "@/app/api/admin/astroloji/horary/western/route";
export const runtime = "nodejs";
export const maxDuration = 60;

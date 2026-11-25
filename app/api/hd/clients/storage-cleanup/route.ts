import { hdApiText } from "../../_lib/hdApiText";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { cleanupOrphanHdImages } from "@/lib/human-design/api/hdStorage";

export const runtime = "nodejs";

/**
 * POST /api/hd/clients/storage-cleanup — profil silme sonrası kalmış YETİM Human Design
 * görsellerini yeniden temizler (storage hatasının telafisi; profil artık olmasa da).
 *
 *   - requireModuleAccess("human_design"); demo hesap → 403. tenantId YALNIZ guard'dan;
 *     istemciden yol / kimlik ALINMAZ → başka tenant'ın dosyasına erişilemez.
 *   - Silinecekler ilişkilerden yeniden türetilir (lib/human-design/api/hdStorage
 *     cleanupOrphanHdImages): kullanılan / yeni / başka tenant dosyasına dokunulmaz; idempotent.
 *   - Kullanıcı başına saatte 10 çalıştırma (storage listeleme maliyeti).
 *   - Yanıt yalnız sayılar içerir (yol yok).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ ok: false, code: "DEMO_READONLY", error: hdApiText(req, "demoNoOperation") }, { status: 403, headers: NO_STORE });
  }
  const rl = await hitDbRateLimit(guard.db, rateLimitBucket("hd-orphan-cleanup", guard.userId), 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", error: hdApiText(req, "rateLimitedCleanup") },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 60) } },
    );
  }
  const r = await cleanupOrphanHdImages(guard.db, guard.tenantId);
  if (!r.ok && r.candidates === 0) {
    return NextResponse.json({ ok: false, error: hdApiText(req, "imagesCheckFailed") }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: r.ok, removed: r.removed, failed: r.failed }, { status: 200, headers: NO_STORE });
}

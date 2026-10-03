import { NextRequest, NextResponse } from "next/server";
import { trackUsage, usageErrorClassForStatus } from "@/lib/usage/trackUsage";
import { beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmePlanAccess } from "@/lib/beslenme/clientPlanGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { buildPlanDocxBuffer } from "@/lib/beslenme/word/planDocx";
import { rateLimit } from "@/lib/rateLimit";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: plan → profesyonel Word (DOCX) çıktısı.
 *
 * Güvenlik/politika:
 *  - Kimlik yalnız sunucudan (requireBeslenmePlanAccess: owner ya da bound-plan uzmanı). Body güven kaynağı DEĞİL.
 *  - Plan tenant-scoped okunur (IDOR: yabancı plan → NOT_FOUND, sızıntı yok).
 *  - Arşiv (archived) planlar da export EDİLEBİLİR — bu bir okuma işlemidir.
 *  - Demo hesap: export REDDEDİLİR (canonical app politikası: mevcut Word export route'ları —
 *    ör. sifa-rehberi — demo'yu 403 ile keser; DOCX üretimi kaynak-yoğun). §33: existing policy follow.
 *  - Rate limit: kullanıcı başına dakikada 10 export (DOCX üretimi pahalı; burst abuse'u keser).
 *    In-memory / instance-başına best-effort (bkz. lib/rateLimit.ts).
 *  - Uzak görsel/fetch YOK (SSRF-güvenli): planDocx yalnız snapshot verisinden metin/tablo üretir.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireBeslenmePlanAccess(req, (await ctx.params).id);
  if (!guard.ok) return guard.response;
  // DEMO VİTRİN: plan Word'ü salt-okunur çıktı (snapshot okuması; DB yazımı/uzak fetch/ücretli
  // servis yok; kullanıcı başına rate-limit aşağıda) → demo hesapta açık.
  const { db, tenantId, userId } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  // Maliyet-abuse koruması: kullanıcı başına dakikada 10 DOCX.
  const rl = rateLimit(`beslenme-word:${userId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let result;
  try {
    result = await buildPlanDocxBuffer(db, tenantId, id, { expertName: expertDisplayName(guard.profile) });
  } catch {
    await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "report_generated", subEntity: "plan", errorClass: "server" });
    return beslenmeJson({ ok: false, code: "WORD_FAILED" }, 500);
  }

  if (!result.ok) {
    const errorClass = usageErrorClassForStatus(result.error.status);
    if (errorClass) {
      await trackUsage(guard, req, { module: "beslenme", action: "action_failed", failedAction: "report_generated", subEntity: "plan", errorClass });
    }
    return beslenmeJson({ ok: false, code: result.error.code }, result.error.status);
  }

  // Usage360: DOCX tampon BAŞARIYLA üretildi → report_generated(plan) (60 sn kova dedup).
  await trackUsage(guard, req, { module: "beslenme", action: "report_generated", subEntity: "plan", resourceId: id });

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
    },
  });
}

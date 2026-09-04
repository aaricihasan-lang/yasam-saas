import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isUuid } from "@/lib/beslenme/planContracts";
import { buildPlanDocxBuffer } from "@/lib/beslenme/word/planDocx";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST: plan → profesyonel Word (DOCX) çıktısı.
 *
 * Güvenlik/politika:
 *  - Kimlik yalnız sunucudan (requireBeslenmeOwner: header-token + owner gate). Body güven kaynağı DEĞİL.
 *  - Plan tenant-scoped okunur (IDOR: yabancı plan → NOT_FOUND, sızıntı yok).
 *  - Arşiv (archived) planlar da export EDİLEBİLİR — bu bir okuma işlemidir.
 *  - Demo hesap: export REDDEDİLİR (canonical app politikası: mevcut Word export route'ları —
 *    ör. sifa-rehberi — demo'yu 403 ile keser; DOCX üretimi kaynak-yoğun). §33: existing policy follow.
 *  - Rate limit: kullanıcı başına dakikada 10 export (DOCX üretimi pahalı; burst abuse'u keser).
 *    In-memory / instance-başına best-effort (bkz. lib/rateLimit.ts).
 *  - Uzak görsel/fetch YOK (SSRF-güvenli): planDocx yalnız snapshot verisinden metin/tablo üretir.
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
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
    result = await buildPlanDocxBuffer(db, tenantId, id);
  } catch {
    return beslenmeJson({ ok: false, code: "WORD_FAILED" }, 500);
  }

  if (!result.ok) {
    return beslenmeJson({ ok: false, code: result.error.code }, result.error.status);
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
    },
  });
}

import { NextRequest } from "next/server";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/me/devices/[id] — GİRİŞ GÜVENLİĞİ F2-C: kendi güvenilir cihazımı iptal (telefon kaybı).
 * İptal yalnız yetki AZALTIR: cihaz bir daha kabul edilmez; o cihazın onayladığı oturumlar kapanır.
 * Body (isteğe bağlı): { reason }
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  const { id } = await ctx.params;
  if (!isMfaChallengeId(id)) return jsonNoStore({ error: "Geçersiz cihaz." }, 400);
  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
  const { data, error } = await guard.db.rpc("auth_device_revoke", {
    p_actor_token: guard.token,
    p_device_id: id,
    p_reason: typeof body?.reason === "string" ? body.reason.slice(0, 300) : "Kullanıcı iptali",
  });
  if (error) return jsonNoStore({ error: "Cihaz iptal edilemedi." }, 500);
  const r = (data ?? {}) as { ok?: unknown; sessions_closed?: unknown };
  if (r.ok !== true) return jsonNoStore({ error: "Cihaz bulunamadı." }, 404);
  return jsonNoStore({ ok: true, sessionsClosed: Number(r.sessions_closed) || 0 }, 200);
}

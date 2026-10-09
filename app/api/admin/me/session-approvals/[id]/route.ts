import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit } from "@/lib/admin/adminAudit";
import { resolveActorIsMainAdmin } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import { ADMIN_WEB_SESSION_CAP } from "@/lib/auth/sessionSecurity";
import { jsonNoStore } from "@/lib/auth/sessionModel";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/me/session-approvals/[id] — body { decision: "approve" | "deny" }.
 * OTURUM MODELİ v2: aynı admin hesabının AKTİF oturumu (web veya resmi Android), kendi bekleyen
 * web girişini onaylar ("Evet, bilgim var") veya reddeder ("Bu giriş bana ait değil").
 * Karar atomik RPC'de (admin_decide_pending_session; kilit + 2-web üst sınırı yeniden kontrol).
 * Audit: admin_web_login_approved / admin_web_login_denied (token/IP/parola YOK).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonNoStore({ ok: false, error: "Geçersiz istek." }, 400);

  const body = (await req.json().catch(() => null)) as { decision?: unknown } | null;
  const decision = body?.decision === "approve" ? "approve" : body?.decision === "deny" ? "deny" : null;
  if (!decision) return jsonNoStore({ ok: false, error: "Geçersiz karar." }, 400);

  // HTTPONLY H1–H4: guard'ın doğruladığı token (off modda = x-session-token, bugünkü gibi).
  const actorToken = guard.sessionToken ?? req.headers.get("x-session-token")?.trim() ?? "";
  const { data, error } = await db.rpc("admin_decide_pending_session", {
    p_actor_token: actorToken,
    p_pending_id: id,
    p_decision: decision,
    p_admin_web_cap: ADMIN_WEB_SESSION_CAP,
  });
  if (error) return jsonNoStore({ ok: false, error: "Karar kaydedilemedi." }, 500);
  const res = (data ?? {}) as { ok?: boolean; code?: string; user_id?: string };
  if (res.user_id && res.user_id !== adminId) return jsonNoStore({ ok: false, error: "Yetki yok." }, 403);
  if (!res.ok) {
    const map: Record<string, [number, string]> = {
      not_found: [404, "Bekleyen giriş bulunamadı."],
      expired: [410, "Onay süresi doldu."],
      cap: [409, "Eşzamanlı web oturumu üst sınırına ulaşıldı. Önce bir web oturumunu kapatın."],
      forbidden: [403, "Yetki yok."],
    };
    const [status, msg] = map[String(res.code)] ?? [400, "Karar uygulanamadı."];
    return jsonNoStore({ ok: false, code: res.code ?? "error", error: msg }, status);
  }

  try {
    const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: decision === "approve" ? "admin_web_login_approved" : "admin_web_login_denied",
      targetUserId: adminId,
      actorIsMainAdmin,
      context: { decision },
    });
    if (decision === "deny") {
      await db.from("security_events").insert({
        user_id: adminId,
        event_type: "admin_web_login_denied",
        severity: "high",
        message: "Yönetici, kendisine ait olmadığını belirttiği bir web girişini reddetti.",
        metadata: { decision },
      });
    }
  } catch {
    return jsonNoStore({ ok: false, error: "Karar uygulandı ancak denetim kaydı yazılamadı." }, 500);
  }
  return jsonNoStore({ ok: true, decision });
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { formatRecoveryCode, generateRecoveryCode, hashRecoveryCode } from "@/lib/auth/recoveryCodes";
import { reconfirmPassword } from "@/lib/auth/stepUp";
import { sendSecurityNotice } from "@/lib/auth/securityNotice";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GİRİŞ GÜVENLİĞİ F2-E — tek kurtarma talebi üzerinde Owner işlemi.
 * POST { action: "cancel" | "reject", reason }
 * POST { action: "execute", identityReconfirmed: true, password } → en erken 72 saat sonra; Owner parolası
 *      yeniden doğrulanır; TEK işlemde cihazlar/oturumlar/eski kodlar iptal edilir ve 24 saatlik tek
 *      kullanımlık kurtarma bileti üretilir. Bilet YALNIZ bu yanıtta döner (Owner kullanıcıya yüz yüze /
 *      telefonla iletir; e-postayla GÖNDERİLMEZ). Kullanıcı girişte parola + bileti kullanır.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return json({ error: "Geçersiz talep." }, 400);
  const body = (await req.json().catch(() => null)) as { action?: unknown; reason?: unknown; identityReconfirmed?: unknown; password?: unknown } | null;

  if (body?.action === "cancel" || body?.action === "reject") {
    const { data, error } = await guard.db.rpc("auth_recovery_case_close", {
      p_actor_token: guard.sessionToken, p_case_id: id, p_action: body.action,
      p_reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
    });
    if (error) return json({ error: "İşlem yapılamadı." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown };
    if (r.ok !== true) return json({ code: String(r.code ?? "error").toUpperCase(), error: r.code === "not_waiting" ? "Talep artık beklemede değil." : "İşlem yapılamadı." }, r.code === "forbidden" ? 403 : 409);
    return json({ ok: true }, 200);
  }

  if (body?.action === "execute") {
    if (body.identityReconfirmed !== true) return json({ code: "VERIFICATION_REQUIRED", error: "Kullanıcının kimliğini yeniden teyit ettiğinizi onaylayın." }, 400);
    const step = await reconfirmPassword(guard.db, req, guard.adminId, body.password);
    if (!step.ok) return json(step.body, step.status);
    // Bilet özeti hedef kullanıcıya bağlıdır → talebin kullanıcısı Owner listesinden okunur (tablo service_role'e kapalı).
    const { data: list, error: listErr } = await guard.db.rpc("auth_recovery_case_list", { p_actor_token: guard.sessionToken });
    const lr = (list ?? {}) as { ok?: unknown; cases?: unknown };
    if (listErr || lr.ok !== true || !Array.isArray(lr.cases)) return json({ error: "Talep okunamadı." }, 403);
    const c = (lr.cases as { id?: unknown; user_id?: unknown; email?: unknown; name?: unknown }[]).find((x) => x.id === id);
    if (!c || typeof c.user_id !== "string") return json({ error: "Talep bulunamadı." }, 404);
    const ticket = generateRecoveryCode();
    const { data, error } = await guard.db.rpc("auth_recovery_case_execute", {
      p_actor_token: guard.sessionToken, p_case_id: id, p_ticket_hash: hashRecoveryCode(c.user_id, ticket), p_identity_reconfirmed: true,
    });
    if (error) return json({ error: "Kurtarma yürütülemedi." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; not_before?: unknown; ticket_expires_at?: unknown; devices_revoked?: unknown; sessions_closed?: unknown };
    if (r.ok !== true) {
      const map: Record<string, [number, string]> = {
        too_early: [409, "72 saatlik bekleme süresi dolmadı."],
        expired: [409, "Talebin süresi doldu; gerekiyorsa yeni talep açın."],
        user_active_since_open: [409, "Kullanıcı talep açıldıktan sonra ikinci doğrulamayla giriş yapmış; hesaba hâlâ erişimi var. Kurtarma yürütülmedi."],
        not_waiting: [409, "Talep artık beklemede değil."],
        verification_required: [400, "Kullanıcının kimliğini yeniden teyit ettiğinizi onaylayın."],
        forbidden: [403, "Hesap kurtarma yalnız Owner'ın ikinci doğrulamayla açılmış oturumunda yönetilir."],
      step_up_required: [403, "Kurtarmayı yürütmek için telefonunuzdan (QR) veya e-postanıza gelen kodla ek doğrulama gerekiyor."],
      fresh_mfa_required: [403, "Güvenliğiniz için bu işlemden önce çıkış yapıp yeniden giriş yapın (son 30 dakika içinde ikinci doğrulamayla açılmış oturum gerekir)."],
      };
      const [status, msg] = map[String(r.code)] ?? [400, "Kurtarma yürütülemedi."];
      return json({ code: String(r.code ?? "error").toUpperCase(), error: msg, ...(r.not_before ? { notBefore: r.not_before } : {}) }, status);
    }
    await sendSecurityNotice(guard.db, {
      userId: c.user_id,
      to: typeof c.email === "string" ? c.email : null,
      name: typeof c.name === "string" ? c.name : null,
      kind: "recovery_case_executed",
    });
    return json({
      ok: true,
      ticket: formatRecoveryCode(ticket),
      ticketExpiresAt: r.ticket_expires_at ?? null,
      devicesRevoked: Number(r.devices_revoked) || 0,
      sessionsClosed: Number(r.sessions_closed) || 0,
    }, 200);
  }

  return json({ error: "Geçersiz işlem." }, 400);
}

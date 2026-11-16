import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { sendSecurityNotice } from "@/lib/auth/securityNotice";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GİRİŞ GÜVENLİĞİ F2-E — Owner aracılı hesap kurtarma talepleri (bütün giriş yöntemlerini kaybeden kullanıcı).
 * Yetki DB'de: yalnız is_super_admin Owner + MFA'lı Owner oturumu. 72 saat bekleme DB CHECK'iyle zorunlu.
 *
 * GET → { cases: [...], now }
 * POST { email, verificationMethod: "telefon"|"yuz_yuze"|"kimlik_belgesi", note } → talep açar;
 *      kullanıcının kayıtlı adresine kod içermeyen bildirim gider.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const { data, error } = await guard.db.rpc("auth_recovery_case_list", { p_actor_token: guard.sessionToken });
  if (error) return json({ error: "Liste alınamadı." }, 500);
  const r = (data ?? {}) as { ok?: unknown; cases?: unknown; now?: unknown };
  if (r.ok !== true) return json({ code: "FORBIDDEN_OR_MFA", error: "Hesap kurtarma yalnız Owner'ın ikinci doğrulamayla açılmış oturumunda yönetilir." }, 403);
  return json({ cases: Array.isArray(r.cases) ? r.cases : [], now: r.now ?? null }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const body = (await req.json().catch(() => null)) as { email?: unknown; userId?: unknown; verificationMethod?: unknown; note?: unknown } | null;
  let userId = typeof body?.userId === "string" && UUID_RE.test(body.userId.trim()) ? body.userId.trim() : "";
  if (!userId) {
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return json({ error: "Kullanıcının e-posta adresini girin." }, 400);
    const { data: rows } = await guard.db.from("users").select("id").ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(2);
    const list = (rows ?? []) as { id?: unknown }[];
    if (list.length !== 1 || typeof list[0].id !== "string") return json({ error: "Bu e-posta adresiyle tek bir kullanıcı bulunamadı." }, 404);
    userId = list[0].id;
  }
  const { data, error } = await guard.db.rpc("auth_recovery_case_open", {
    p_actor_token: guard.sessionToken,
    p_user_id: userId,
    p_verification_method: typeof body?.verificationMethod === "string" ? body.verificationMethod : "",
    p_note: typeof body?.note === "string" ? body.note.slice(0, 500) : "",
  });
  if (error) return json({ error: "Talep açılamadı." }, 500);
  const r = (data ?? {}) as { ok?: unknown; code?: unknown; case_id?: unknown; not_before?: unknown };
  if (r.ok !== true) {
    const map: Record<string, [number, string]> = {
      forbidden: [403, "Hesap kurtarma yalnız Owner'ın ikinci doğrulamayla açılmış oturumunda yönetilir."],
      self_forbidden: [400, "Kendi hesabınız için talep açamazsınız (Owner kurtarması çevrimdışı kit ile yapılır)."],
      owner_target_forbidden: [400, "Owner hesabı bu yolla kurtarılamaz; çevrimdışı kurtarma kitini kullanın."],
      verification_required: [400, "Kimlik doğrulama yöntemini seçin."],
      note_required: [400, "Kimliği nasıl doğruladığınızı en az 10 karakterle açıklayın."],
      not_found: [404, "Kullanıcı bulunamadı veya aktif değil."],
      mfa_not_required: [400, "Bu hesapta ikinci doğrulama zorunlu değil; normal parola sıfırlama yeterlidir."],
      case_exists: [409, "Bu kullanıcı için zaten bekleyen bir kurtarma talebi var."],
    };
    const [status, msg] = map[String(r.code)] ?? [400, "Talep açılamadı."];
    return json({ code: String(r.code ?? "error").toUpperCase(), error: msg }, status);
  }
  const { data: u } = await guard.db.from("users").select("email, name, full_name").eq("id", userId).maybeSingle();
  const user = (u ?? {}) as { email?: unknown; name?: unknown; full_name?: unknown };
  await sendSecurityNotice(guard.db, {
    userId,
    to: typeof user.email === "string" ? user.email : null,
    name: (typeof user.full_name === "string" && user.full_name) || (typeof user.name === "string" ? user.name : null),
    kind: "recovery_case_opened",
  });
  return json({ ok: true, caseId: r.case_id, notBefore: r.not_before }, 200);
}

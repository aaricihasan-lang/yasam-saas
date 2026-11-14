import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import { archivedTargetResponse } from "@/lib/admin/archivedGuard";
import { TRIAL_CREDIT_MODULES } from "@/lib/trial/trialCore";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const STATE_ACTIONS = new Set(["review", "clear_review", "suspend", "resume"]);

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

function rpcFailure(error: unknown, fallback: string) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "TR404") return bad("Bu hesap bir deneme üyesi değil.", 404);
  if (code === "TR409") return bad("Bu işlem üyenin mevcut durumunda yapılamaz (sayfayı yenileyin).", 409);
  if (code === "TR400") return bad("Geçersiz değer.", 400);
  if (code === "TR401") return bad("Yetki yok.", 403);
  return bad(fallback, 500);
}

/**
 * PATCH /api/admin/trials/[id] — deneme üyesi yönetimi (tek uç, sade işlem seti):
 *   { action: "limits", dailyLimit: 0..1000, moduleLimits: { astrology?, human_design?, numerology? } }
 *       Kişiye özel günlük ORTAK Roxy kredi limiti + isteğe bağlı modül limitleri (modül limiti ortak
 *       limiti aşamaz — DB doğrular).
 *   { action: "review" | "clear_review" | "suspend" | "resume", reason? }
 *       Şüpheli hesabı incelemeye al / incelemeyi kaldır / deneme erişimini durdur / sürdür.
 *       Süre UZATMA YOKTUR: bitiş zamanına hiçbir işlem dokunmaz.
 *   { action: "dismiss_pro_request" } — açık Pro talebini kapat (ödeme gelmedi vb.).
 * Tüm işlemler deneme yönetim kaydına (trial_admin_events) yazılır.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");
  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;
  const action = body.action;

  if (action === "limits" || (typeof action === "string" && STATE_ACTIONS.has(action))) {
    // AŞAMA 4a: arşivdeki hesapta değişiklik yok (erken yanıt; atomik güvence DB tetikleyicisinde, UY005).
    const archived = await archivedTargetResponse(guard.db, id);
    if (archived) return archived;
  }

  if (action === "limits") {
    for (const k of Object.keys(body)) if (!["action", "dailyLimit", "moduleLimits"].includes(k)) return bad("Beklenmeyen alan.");
    const daily = body.dailyLimit;
    if (typeof daily !== "number" || !Number.isInteger(daily) || daily < 0 || daily > 1000) {
      return bad("Günlük kredi limiti 0–1000 arasında tam sayı olmalıdır.");
    }
    const rawMods = body.moduleLimits ?? {};
    if (typeof rawMods !== "object" || rawMods === null || Array.isArray(rawMods)) return bad("Modül limitleri geçersiz.");
    const mods: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawMods as Record<string, unknown>)) {
      if (!(TRIAL_CREDIT_MODULES as readonly string[]).includes(k)) return bad("Bilinmeyen modül.");
      if (v === null || v === "") continue;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return bad("Modül limiti 0 veya pozitif tam sayı olmalıdır.");
      if (v > daily) return bad("Modül limiti günlük ortak limiti aşamaz.");
      mods[k] = v;
    }
    const { data, error } = await guard.db.rpc("admin_trial_set_limits", {
      p_actor: guard.adminId,
      p_user_id: id,
      p_daily_limit: daily,
      p_module_limits: mods,
    });
    if (error) return rpcFailure(error, "Limitler kaydedilemedi.");
    return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE });
  }

  if (typeof action === "string" && STATE_ACTIONS.has(action)) {
    for (const k of Object.keys(body)) if (!["action", "reason"].includes(k)) return bad("Beklenmeyen alan.");
    const reason = body.reason;
    if (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > 300)) {
      return bad("Açıklama en fazla 300 karakter olabilir.");
    }
    const { data, error } = await guard.db.rpc("admin_trial_set_state", {
      p_actor: guard.adminId,
      p_user_id: id,
      p_action: action,
      p_reason: typeof reason === "string" ? reason : null,
    });
    if (error) return rpcFailure(error, "Durum güncellenemedi.");
    return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE });
  }

  if (action === "dismiss_pro_request") {
    const { data, error } = await guard.db.rpc("admin_pro_request_close", { p_actor: guard.adminId, p_user_id: id });
    if (error) return rpcFailure(error, "Talep kapatılamadı.");
    return NextResponse.json({ ok: true, result: data }, { headers: NO_STORE });
  }

  return bad("Geçersiz işlem.");
}

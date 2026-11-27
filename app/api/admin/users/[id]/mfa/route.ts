import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { loadMfaAdminStatus, MFA_REASON_TEXT } from "@/lib/auth/mfaAdminStatus";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
type RouteContext = { params: Promise<{ id: string }> };
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

const OWNER_ONLY = "İki aşamalı giriş yönetimi yalnız sistem sahibine (Owner) açıktır.";

/** auth_mfa_set_required (F2-B çekirdek + F2-G sarmalayıcı) sonuç kodları → HTTP + sade Türkçe. */
const SET_ERRORS: Record<string, [number, string]> = {
  forbidden: [403, OWNER_ONLY],
  no_method: [409, MFA_REASON_TEXT.no_usable_method],
  reason_required: [400, "Gerekçe yazın (en az 3 karakter)."],
  self_disable_forbidden: [403, "Kendi ikinci doğrulama zorunluluğunuzu bu ekrandan kaldıramazsınız."],
  not_found: [404, "Üye bulunamadı."],
  bad_request: [400, "Geçersiz istek."],
  fresh_mfa_required: [403, "Bu işlem için çıkış yapıp ikinci doğrulamayla yeniden giriş yapın (son 30 dakika içinde açılmış oturum gerekir)."],
  step_up_required: [403, "Bu işlem için telefonunuzdan (QR) veya e-postanıza gelen kodla ek doğrulama gerekiyor."],
};

/** Owner kararı YALNIZ DB işaretinden (auth_is_owner_admin); sorgu hatası → reddedilir (fail-closed). */
async function requireOwner(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return { ok: false as const, response: guard.response };
  if (!guard.sessionToken) return { ok: false as const, response: json({ error: "Oturum doğrulanamadı." }, 401) };
  const owner = await guard.db.rpc("auth_is_owner_admin", { p_user_id: guard.adminId });
  if (owner.error || owner.data !== true) return { ok: false as const, response: json({ code: "OWNER_ONLY", error: OWNER_ONLY }, 403) };
  return { ok: true as const, guard: { ...guard, sessionToken: guard.sessionToken } };
}

function withReasonText(status: Awaited<ReturnType<typeof loadMfaAdminStatus>>) {
  if (!status.ok) return null;
  const s = status.status;
  const text = (codes: string[]) => codes.map((c) => MFA_REASON_TEXT[c] ?? c);
  return {
    ...s,
    methods: {
      email_otp: { ...s.methods.email_otp, reasonText: text(s.methods.email_otp.reasons) },
      qr_device: { ...s.methods.qr_device, reasonText: text(s.methods.qr_device.reasons) },
    },
    readyReasonText: text(s.readyReasons),
    configIssueText: text(s.configIssues),
  };
}

/**
 * GET /api/admin/users/[id]/mfa — Owner: üyenin iki aşamalı giriş hazırlık durumu (gizli değer DÖNMEZ).
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const o = await requireOwner(req);
  if (!o.ok) return o.response;
  const { id } = await ctx.params;
  if (!isMfaChallengeId(id)) return json({ error: "Geçersiz üye." }, 400);
  try {
    const isSelf = id === o.guard.adminId;
    const st = await loadMfaAdminStatus(o.guard.db, id, process.env, { actorToken: o.guard.sessionToken, isSelf });
    if (!st.ok) return st.code === "not_found" ? json({ error: "Üye bulunamadı." }, 404) : json({ code: "UNAVAILABLE", error: MFA_REASON_TEXT.db_unavailable }, 503);
    return json({ ok: true, isSelf, status: withReasonText(st) }, 200);
  } catch {
    return json({ code: "UNAVAILABLE", error: MFA_REASON_TEXT.db_unavailable }, 503);
  }
}

/**
 * POST /api/admin/users/[id]/mfa — Owner: zorunluluğu aç / kaldır.
 * Body: { action: "enable" | "disable", reason: string, confirm: true }
 *   enable  → giriş akışıyla AYNI yöntem hesabı (ortam + kapsam + sağlayıcı + rol + DB) en az bir ASIL yöntem
 *             göstermiyorsa REDDEDİLİR (409); MFA ortam ayarında biçim hatası varsa REDDEDİLİR (409 CONFIG_INVALID);
 *             Owner KENDİ zorunluluğunu açıyorsa en az OWNER_SELF_ENABLE_MIN_KIT kullanılmamış çevrimdışı kit kodu
 *             şarttır, okunamazsa da REDDEDİLİR (409 OWNER_RECOVERY_REQUIRED); sonra DB: Owner + gerekçe +
 *             auth_mfa_user_has_method + satır kilidi; aynı işlemde MFA'sız açık oturumlar kapanır (F2-I tetikleyicisi).
 *             NOT: bu denetimler API katmanındadır; SQL konsolundan doğrudan auth_mfa_set_required çağrısı bunları atlar.
 *   disable → DB (F2-G): başkası için son 30 dk MFA'lı Owner oturumu + işleme / hedefe bağlı tek kullanımlık
 *             `mfa_disable` kanıtı (aynı işlemde tüketilir); Owner kendi zorunluluğunu kaldıramaz. API bu
 *             adımları ATLAYAMAZ — yalnız DB sonucunu iletir.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const o = await requireOwner(req);
  if (!o.ok) return o.response;
  const { id } = await ctx.params;
  if (!isMfaChallengeId(id)) return json({ error: "Geçersiz üye." }, 400);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (action !== "enable" && action !== "disable") return json({ error: "Geçersiz işlem." }, 400);
  if (body?.confirm !== true) return json({ code: "CONFIRM_REQUIRED", error: "İşlemi açıkça onaylamanız gerekiyor." }, 400);
  if (reason.length < 3 || reason.length > 500) return json({ code: "reason_required", error: SET_ERRORS.reason_required[1] }, 400);
  const isSelf = id === o.guard.adminId;
  if (action === "disable" && isSelf) return json({ code: "self_disable_forbidden", error: SET_ERRORS.self_disable_forbidden[1] }, 403);
  try {
    if (action === "enable") {
      const st = await loadMfaAdminStatus(o.guard.db, id, process.env, { actorToken: o.guard.sessionToken, isSelf });
      if (!st.ok) return st.code === "not_found" ? json({ error: "Üye bulunamadı." }, 404) : json({ code: "UNAVAILABLE", error: MFA_REASON_TEXT.db_unavailable }, 503);
      if (!st.status.mfaRequired) {
        if (st.status.configIssues.length) {
          return json({ code: "CONFIG_INVALID", error: MFA_REASON_TEXT[st.status.configIssues[0]], status: withReasonText(st) }, 409);
        }
        if (!st.status.ready) {
          return json({ code: "NO_USABLE_METHOD", error: MFA_REASON_TEXT.no_usable_method, status: withReasonText(st) }, 409);
        }
        // F4 (Risk A): Owner DIŞI hesapta kullanılmamış kurtarma kodu yoksa açılmaz (e-posta / telefon erişimi kaybolursa kilitlenme).
        if (!st.status.isOwnerAccount && st.status.memberRecoveryReady !== true) {
          return json({ code: "RECOVERY_REQUIRED", error: MFA_REASON_TEXT.recovery_codes_missing, status: withReasonText(st) }, 409);
        }
        // Owner hesabı (yalnız kendisi olabilir): kurtarma kiti yoksa / okunamazsa açılmaz.
        if (st.status.isOwnerAccount && st.status.ownerSelfRecoveryReady !== true) {
          const reason = isSelf && st.status.ownerOfflineKitLeft !== null ? "owner_kit_missing" : "owner_recovery_unreadable";
          return json({ code: "OWNER_RECOVERY_REQUIRED", error: MFA_REASON_TEXT[reason], status: withReasonText(st) }, 409);
        }
      }
    }
    const { data, error } = await o.guard.db.rpc("auth_mfa_set_required", {
      p_actor_token: o.guard.sessionToken,
      p_user_id: id,
      p_required: action === "enable",
      p_reason: reason,
    });
    // F2-N (001300): API denetimi bir yarışta / atlanmış yolda geçilse bile DB Owner'ın kitsiz zorunluluğunu reddeder (YF401).
    if (error && (error as { code?: string }).code === "YF401") {
      return json({ code: "OWNER_RECOVERY_REQUIRED", error: MFA_REASON_TEXT.owner_kit_missing }, 409);
    }
    if (error) return json({ error: "İşlem kaydedilemedi." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; changed?: unknown };
    if (r.ok !== true) {
      const code = String(r.code ?? "error");
      const e = SET_ERRORS[code] ?? [500, "İşlem kaydedilemedi."];
      return json({ code: code === "step_up_required" ? "STEP_UP_REQUIRED" : code, error: e[1], ...(code === "step_up_required" ? { action: "mfa_disable", targetId: id } : {}) }, e[0]);
    }
    // Kendi zorunluluğunu açan Owner'ın MFA'sız oturumu aynı işlemde kapanmış olabilir → durum okunamazsa da sonuç kesindir.
    const after = await loadMfaAdminStatus(o.guard.db, id, process.env, { actorToken: o.guard.sessionToken, isSelf }).catch(() => null);
    return json({
      ok: true,
      changed: r.changed === true,
      required: action === "enable",
      reloginRequired: isSelf && action === "enable" && r.changed === true,
      status: after ? withReasonText(after) : null,
    }, 200);
  } catch {
    return json({ error: "İşlem tamamlanamadı." }, 500);
  }
}

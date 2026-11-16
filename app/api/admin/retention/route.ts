import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLES = ["auth_device_decisions", "auth_recovery_events", "security_events"] as const;

const MESSAGES: Record<string, [number, string]> = {
  forbidden: [403, "Bu işlem yalnız Owner'ın son 30 dakikada ikinci doğrulamayla açılmış oturumunda yapılabilir."],
  step_up_required: [403, "Bu işlem için telefonunuzdan (QR) veya e-postanıza gelen kodla ek doğrulama gerekiyor."],
  bad_request: [400, "Süre 30–36500 gün, hukuki gerekçe en az 10 karakter olmalı."],
  bad_table: [400, "Geçersiz tablo."],
  method_not_allowed: [400, "Güvenlik olayları yalnız silinebilir (kullanıcı bağlantısı nedeniyle anonimleştirme gerçek anonimlik sağlamaz)."],
  policy_undecided: [409, "Bu tablo için saklama kararı (süre + hukuki gerekçe + yöntem) girilmeden önizleme / imha yapılamaz."],
  preview_exists: [409, "Bu tablo için açık bir önizleme var; önce onu yürütün veya iptal edin."],
  not_previewed: [409, "Çalıştırma artık beklemede değil (yürütüldü, iptal edildi veya süresi doldu)."],
  expired: [409, "Önizlemenin süresi doldu (1 saat). Yeni önizleme alın."],
  confirm_mismatch: [400, "Onay metni önizlemedeki metinle birebir aynı olmalı."],
  failed: [409, "İşlem güvenlik kontrolünden geçmedi; HİÇBİR kayıt değişmedi."],
  not_found: [404, "Kayıt bulunamadı."],
};

/**
 * GİRİŞ GÜVENLİĞİ F2-H — denetim kayıtları saklama / kontrollü imha (Owner).
 * Bütün yetki ve güvenlik kapıları DB'de (auth_retention_*): taze MFA'lı Owner oturumu; politika ve imha için
 * işleme özel kanıt; imha için ayrıca birebir onay metni. Otomatik zamanlayıcı YOK; yanıtlarda kayıt içeriği YOK.
 *
 * GET → { policies, open_runs, recent_runs, holds }
 * POST { op: "policy_set", table, retentionDays, legalBasis, method, note? }
 * POST { op: "preview", table } · { op: "execute", runId, confirm } · { op: "cancel", runId }
 * POST { op: "hold_set", holdType, subjectId, reason } · { op: "hold_release", holdId }
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const { data, error } = await guard.db.rpc("auth_retention_overview", { p_actor_token: guard.sessionToken });
  if (error) return json({ error: "Bilgi alınamadı." }, 500);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return json({ code: "FORBIDDEN", error: MESSAGES.forbidden[1] }, 403);
  return json({ policies: r.policies ?? [], openRuns: r.open_runs ?? [], recentRuns: r.recent_runs ?? [], holds: r.holds ?? [] }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const table = TABLES.find((t) => t === b?.table);
  const runId = typeof b?.runId === "string" && UUID_RE.test(b.runId) ? b.runId : null;
  const tok = guard.sessionToken;
  let call: { fn: string; args: Record<string, unknown> } | null = null;
  switch (b?.op) {
    case "policy_set":
      if (!table) return json({ error: MESSAGES.bad_table[1] }, 400);
      call = { fn: "auth_retention_policy_set", args: { p_actor_token: tok, p_table: table, p_retention_days: Number(b.retentionDays),
        p_legal_basis: typeof b.legalBasis === "string" ? b.legalBasis : null, p_disposal_method: b.method === "anonimlestirme" ? "anonimlestirme" : b.method === "silme" ? "silme" : "",
        p_note: typeof b.note === "string" ? b.note : null } };
      break;
    case "preview":
      if (!table) return json({ error: MESSAGES.bad_table[1] }, 400);
      call = { fn: "auth_retention_preview", args: { p_actor_token: tok, p_table: table } };
      break;
    case "execute":
      if (!runId) return json({ error: "Geçersiz çalıştırma." }, 400);
      call = { fn: "auth_retention_execute", args: { p_actor_token: tok, p_run_id: runId, p_confirm: typeof b?.confirm === "string" ? b.confirm.trim() : "" } };
      break;
    case "cancel":
      if (!runId) return json({ error: "Geçersiz çalıştırma." }, 400);
      call = { fn: "auth_retention_cancel", args: { p_actor_token: tok, p_run_id: runId } };
      break;
    case "hold_set": {
      const subjectId = typeof b?.subjectId === "string" && UUID_RE.test(b.subjectId) ? b.subjectId : null;
      if (!subjectId || (b?.holdType !== "subject_user" && b?.holdType !== "device")) return json({ error: "Geçersiz saklama isteği." }, 400);
      call = { fn: "auth_retention_hold_set", args: { p_actor_token: tok, p_hold_type: b.holdType, p_subject_id: subjectId, p_reason: typeof b.reason === "string" ? b.reason : null } };
      break;
    }
    case "hold_release": {
      const holdId = Number(b?.holdId);
      if (!Number.isSafeInteger(holdId) || holdId <= 0) return json({ error: "Geçersiz saklama kaydı." }, 400);
      call = { fn: "auth_retention_hold_release", args: { p_actor_token: tok, p_hold_id: holdId } };
      break;
    }
    default:
      return json({ error: "Geçersiz işlem." }, 400);
  }
  const { data, error } = await guard.db.rpc(call.fn, call.args);
  if (error) return json({ error: "İşlem yapılamadı." }, 500);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === true) return json(r, 200);
  const code = String(r.code ?? "error");
  const [status, msg] = MESSAGES[code] ?? [400, "İşlem yapılamadı."];
  return json({ code: code.toUpperCase(), error: msg, ...(r.action ? { action: r.action, target: r.target } : {}), ...(r.error ? { reason: r.error } : {}) }, status);
}

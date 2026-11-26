import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import { hashLoginIp, LOGIN_INVALID_MESSAGE, loginLockedMessage } from "@/lib/auth/loginThrottle";
import { isExpertReady, normalizeRole, resolveApprovalStatus } from "@/lib/auth/approvalGate";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import {
  enrollMessage,
  enrollMessageV2,
  hashBootstrapCode,
  isFreshTimestamp,
  parseDevicePublicKey,
  verifyDeviceSignature,
} from "@/lib/auth/deviceSignature";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ENROLL_IP_LIMIT = 10;
const ENROLL_IP_WINDOW_SEC = 15 * 60;

function json(body: Record<string, unknown>, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...(extra ?? {}) } });
}

/**
 * POST /api/devices/enroll — GİRİŞ GÜVENLİĞİ F2-C: güvenilir Android cihazı eşleştirme isteği.
 *
 * Telefon (resmî uygulama, native ekran) parola + Keystore açık anahtarı + anahtara sahiplik imzası
 * (`YS-ENROLL-V1`) gönderir. Parola login ile AYNI kısıtlamalı yoldan (auth_login_guarded) doğrulanır.
 * Sonuç cihaz kaydı `pending_owner` (Owner Bildirim Zili'ne düşer) — OTURUM AÇILMAZ, cihaz güvenilir
 * DEĞİLDİR. Owner ilk cihazı: SQL konsolu kodu (`bootstrapCode`) → `owner_approved`; aktivasyon yine
 * cihaz imzasıyla (/api/devices/activate). Protokol: docs/giris-guvenligi/f2c-qr-protokol.md
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const key = parseDevicePublicKey(body?.publicKey);
    const ts = body?.ts;
    if (!email || !password.trim() || !key) return json({ code: "BAD_REQUEST", error: "Eksik veya geçersiz eşleştirme isteği." }, 400);
    if (!isFreshTimestamp(ts)) return json({ code: "BAD_TIMESTAMP", error: "Telefonunuzun saati hatalı görünüyor." }, 400);
    // Protokol v1.1: varlık anahtarı (isteğe bağlı) — asıl anahtardan FARKLI olmalı; iki anahtar da v2 mesajını imzalar.
    const presence = body?.presencePublicKey == null ? null : parseDevicePublicKey(body.presencePublicKey);
    if (body?.presencePublicKey != null && (!presence || presence.fingerprintHex === key.fingerprintHex)) {
      return json({ code: "BAD_REQUEST", error: "Geçersiz cihaz varlık anahtarı." }, 400);
    }
    const signedOk = presence
      ? verifyDeviceSignature(key.key, enrollMessageV2(email, key.displayCode, presence.displayCode, ts), body?.signature)
        && verifyDeviceSignature(presence.key, enrollMessageV2(email, key.displayCode, presence.displayCode, ts), body?.presenceSignature)
      : verifyDeviceSignature(key.key, enrollMessage(email, key.displayCode, ts), body?.signature);
    if (!signedOk) {
      return json({ code: "BAD_SIGNATURE", error: "Cihaz imzası doğrulanamadı." }, 400);
    }
    const bootstrapRaw = typeof body?.bootstrapCode === "string" && body.bootstrapCode.trim() ? body.bootstrapCode : null;
    const bootstrapHash = bootstrapRaw ? hashBootstrapCode(bootstrapRaw) : null;
    if (bootstrapRaw && !bootstrapHash) return json({ code: "BOOTSTRAP_INVALID", error: "Yönetici ilk cihaz kodu geçersiz." }, 400);

    const db = getServerDb();
    const clientIp = extractClientIp(req.headers);
    const ipHit = await hitDbRateLimit(db, rateLimitBucket("device-enroll-ip", clientIp), ENROLL_IP_LIMIT, ENROLL_IP_WINDOW_SEC);
    if (!ipHit.allowed) {
      const retryAfter = Math.max(1, ipHit.retryAfterSec);
      return json({ code: "RATE_LIMITED", error: loginLockedMessage(retryAfter), retryAfter }, 429, { "Retry-After": String(retryAfter) });
    }

    const ipHash = hashLoginIp(clientIp);
    const verified = await verifyLoginCredentialsGuarded(db, email, password, ipHash);
    if (verified.status === "locked") {
      return json({ code: "LOCKED", error: loginLockedMessage(verified.retryAfterSeconds), retryAfter: verified.retryAfterSeconds }, 429,
        { "Retry-After": String(verified.retryAfterSeconds) });
    }
    if (verified.status === "invalid") return json({ code: "INVALID_CREDENTIALS", error: LOGIN_INVALID_MESSAGE }, 401);
    if (verified.status !== "ok") return json({ code: "ERROR", error: "Eşleştirme şu anda yapılamıyor." }, 500);

    const row = verified.row;
    const role = normalizeRole(row.role);
    if (row.active !== true) return json({ code: "INACTIVE", error: "Hesabınızın sisteme girişi kapalı." }, 403);
    if (role !== "admin" && role !== "expert") return json({ code: "NO_ROLE", error: "Hesabınız için geçerli bir rol tanımlı değil." }, 403);
    if (role === "expert" && !isExpertReady({ active: row.active, approval: resolveApprovalStatus(row as Record<string, unknown>) })) {
      return json({ code: "PENDING", error: "Hesabınız yönetici onayı bekliyor." }, 403);
    }
    const { data: demo } = await db.from("users").select("is_demo_account").eq("id", row.id).maybeSingle();
    if ((demo as { is_demo_account?: unknown } | null)?.is_demo_account === true) {
      return json({ code: "DEMO", error: "Demo hesabına cihaz eşleştirilemez." }, 403);
    }

    const model = typeof body?.model === "string" ? body.model.slice(0, 80) : null;
    const api = Number.isInteger(body?.androidApi) ? Number(body?.androidApi) : null;
    const appVersion = typeof body?.appVersion === "string" ? body.appVersion.slice(0, 32) : null;
    const { data, error } = await db.rpc("auth_device_enroll_begin", {
      p_user_id: row.id,
      p_public_key_spki: key.spkiB64,
      p_key_fingerprint: key.fingerprintHex,
      p_display_code: key.displayCode,
      p_device_model: model,
      p_android_api: api !== null && api >= 21 && api <= 99 ? api : null,
      p_app_version: appVersion,
      p_ip_hash: ipHash,
      p_bootstrap_hash: bootstrapHash,
      p_presence_key_spki: presence ? presence.spkiB64 : null,
    });
    if (error) return json({ code: "ERROR", error: "Eşleştirme şu anda yapılamıyor." }, 500);
    const r = (data ?? {}) as { ok?: unknown; device_id?: unknown; state?: unknown; reason?: unknown };
    if (r.ok !== true) {
      const reason = String(r.reason ?? "");
      const map: Record<string, [string, number, string]> = {
        pending_exists: ["PENDING_EXISTS", 409, "Bekleyen bir cihaz eşleştirmeniz zaten var. Yöneticinizin onayını bekleyin; 15 dakika içinde onaylanmazsa kapanır ve yeniden deneyebilirsiniz."],
        key_in_use: ["KEY_IN_USE", 409, "Bu cihaz anahtarı zaten kayıtlı."],
        device_limit: ["DEVICE_LIMIT", 409, "En fazla 2 güvenilir cihaz eşleştirilebilir. Önce eski cihazı kaldırın."],
        bootstrap_invalid: ["BOOTSTRAP_INVALID", 400, "Yönetici ilk cihaz kodu geçersiz veya süresi dolmuş."],
        inactive: ["INACTIVE", 403, "Hesabınızın sisteme girişi kapalı."],
      };
      const m = map[reason];
      return m ? json({ code: m[0], error: m[2] }, m[1]) : json({ code: "ERROR", error: "Eşleştirme şu anda yapılamıyor." }, 500);
    }
    return json({ deviceId: String(r.device_id), state: String(r.state), fingerprint: key.displayCode }, 200);
  } catch {
    return json({ code: "ERROR", error: "Eşleştirme şu anda yapılamıyor." }, 500);
  }
}

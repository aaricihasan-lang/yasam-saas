/**
 * USAGE360 — BEACON İŞLEYİCİSİ (route'tan ayrık; harness doğrudan test eder).
 *
 * Sıra: bayrak → boyut → katı şema → kimlik (verifyUserRequest; x-user-id + x-session-token
 * binding) → admin/demo/modül-izni no-op → SECURITY DEFINER RPC.
 * Kullanıcı / tenant / auth oturumu İSTEMCİDEN ALINMAZ: guard + token'dan sunucuda çözülür.
 * Başarılı / no-op / kısıtlanmış tüm sonuçlar gövdesiz 204 döner (bilgi sızmaz).
 */
import { NextResponse } from "next/server";
import type { UserGuardResult } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { isUsage360Enabled } from "@/lib/usage/usageFlag";
import { BEACON_MAX_BYTES, parseBeaconBody } from "@/lib/usage/beaconContract";
import { resolveUsageClientContext } from "@/lib/usage/clientContext";
import { buildUsageIdemHash, resolveUsageHashSecret } from "@/lib/usage/trackUsage";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function beaconNoContent(): Response {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

function beaconError(status: 400 | 413, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status, headers: NO_STORE });
}

export type BeaconRequest = {
  headers: Headers;
  text: () => Promise<string>;
};

export async function handleUsageBeacon<R extends BeaconRequest>(
  req: R,
  verify: (req: R) => Promise<UserGuardResult>,
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  // Bayrak kapalı: gövde okunmaz, kimlik sorgusu yapılmaz, DB'ye dokunulmaz.
  if (!isUsage360Enabled(env)) return beaconNoContent();

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BEACON_MAX_BYTES) return beaconError(413, "too_large");

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return beaconError(400, "invalid_body");
  }
  const parsed = parseBeaconBody(raw);
  if (!parsed.ok) return beaconError(parsed.status, parsed.code);
  const payload = parsed.value;

  const guard = await verify(req);
  if (!guard.ok) return guard.response;

  const role = String(guard.profile?.role ?? "").trim().toLowerCase();
  if (guard.is_demo_account || role === "admin") return beaconNoContent();

  // İzni olmayan modülün açılışı kayda geçmez (sayfa zaten "yetkiniz yok" gösterir).
  if (payload.module && !resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, payload.module)) {
    return beaconNoContent();
  }

  const token = req.headers.get("x-session-token")?.trim() || null;
  const ctx = resolveUsageClientContext(req.headers);
  const ctxArgs = {
    p_channel: ctx.channel,
    p_os_family: ctx.osFamily,
    p_browser_family: ctx.browserFamily,
    p_app_version: ctx.appVersion,
    p_country: ctx.country,
    p_city: ctx.city,
  };

  try {
    if (payload.kind === "ping") {
      const { error } = await guard.db.rpc("usage360_ping", {
        p_user_id: guard.userId,
        p_tenant_id: guard.tenantId,
        p_session_token: token,
        p_module_key: payload.module,
        ...ctxArgs,
      });
      if (error) console.error("[usage360] ping failed", { code: (error as { code?: string }).code ?? null });
      return beaconNoContent();
    }

    const nonce = payload.kind === "module_opened" ? null : payload.nonce;
    const idem = nonce
      ? buildUsageIdemHash(
          { userId: guard.userId, module: payload.module, action: payload.kind, resourceId: `client-nonce:${nonce}` },
          resolveUsageHashSecret(env),
        )
      : null;
    const { error } = await guard.db.rpc("usage360_track", {
      p_user_id: guard.userId,
      p_tenant_id: guard.tenantId,
      p_session_token: token,
      p_module_key: payload.module,
      p_action: payload.kind,
      p_sub_entity: null,
      p_failed_action: payload.kind === "action_failed" ? payload.failedAction : null,
      p_error_class: payload.kind === "action_failed" ? payload.errorClass : null,
      p_item_count_bucket: null,
      p_source: "client",
      p_idempotency_key: idem,
      p_legacy_event_type: null,
      ...ctxArgs,
    });
    if (error) {
      console.error("[usage360] beacon track failed", { kind: payload.kind, code: (error as { code?: string }).code ?? null });
    }
  } catch (e) {
    console.error("[usage360] beacon unexpected error", { kind: payload.kind, name: e instanceof Error ? e.name : "unknown" });
  }
  return beaconNoContent();
}

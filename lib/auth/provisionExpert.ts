/**
 * BF-11F-B — Provision Expert (atomik tenant+user oluşturma) app-layer wrapper.
 * ============================================================================
 *
 * `public.provision_expert(jsonb)` RPC'sine dar, fail-closed, runtime-doğrulamalı
 * erişim. Tenant/user/audit/event yazımı DB tarafında TEK TRANSACTION'dadır; bu
 * wrapper yalnız payload'ı kurar ve dönüşü güvenle çözer. Ham PostgreSQL hata
 * mesajı DIŞARI TAŞINMAZ; raw email/name/hash LOGLANMAZ/DÖNDÜRÜLMEZ.
 *
 * Route'lar tenant INSERT / users INSERT / rollback-delete YAPMAZ; yalnız bunu çağırır.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProvisionMode = "public" | "admin";

export interface ProvisionExpertInput {
  readonly mode: ProvisionMode;
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly tenantName: string;
  readonly tenantSlugBase: string;
  readonly requestId?: string;
  /** Yalnız expert için (jsonb object). */
  readonly modulePermissions?: unknown;
  // ── admin mode ──
  readonly role?: "admin" | "expert";
  readonly active?: boolean;
  readonly actorAdminId?: string;
}

export type ProvisionExpertResult =
  | { readonly ok: true; readonly outcome: "provisioned"; readonly userId: string; readonly tenantId: string; readonly requestId: string; readonly idempotentReplay: boolean }
  | { readonly ok: false; readonly outcome: "already_exists"; readonly userId: string | null; readonly requestId: string }
  | { readonly ok: false; readonly outcome: "idempotency_key_conflict"; readonly requestId: string }
  | { readonly ok: false; readonly outcome: "error"; readonly code: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Atomik provisioning RPC'sini çağırır. Fail-closed: RPC transport/DB hatası veya
 * beklenmeyen dönüş → `{ ok:false, outcome:"error" }` (ham mesaj taşınmaz).
 */
export async function provisionExpert(
  db: SupabaseClient,
  input: ProvisionExpertInput,
): Promise<ProvisionExpertResult> {
  const payload: Record<string, unknown> = {
    mode: input.mode,
    email: input.email,
    password_hash: input.passwordHash,
    full_name: input.fullName,
    tenant_name: input.tenantName,
    tenant_slug_base: input.tenantSlugBase,
  };
  if (input.requestId) payload.request_id = input.requestId;
  if (input.modulePermissions !== undefined) payload.module_permissions = input.modulePermissions;
  if (input.mode === "admin") {
    payload.role = input.role;
    payload.active = input.active;
    payload.actor_admin_id = input.actorAdminId;
  }

  let data: unknown;
  let error: { readonly message: string } | null;
  try {
    const res = await db.rpc("provision_expert", { p_payload: payload });
    data = res.data;
    error = res.error === null ? null : { message: res.error.message };
  } catch {
    return { ok: false, outcome: "error", code: "rpc-transport-failed" };
  }
  // RPC beklenen durumları (already_exists) `data` içinde döndürür; `error` gerçek
  // fail-closed (validation raise / constraint) → ham mesaj taşınmaz.
  if (error !== null) return { ok: false, outcome: "error", code: "provision-failed" };

  if (!isRecord(data)) return { ok: false, outcome: "error", code: "invalid-result" };
  const outcome = data.outcome;
  const requestId = typeof data.request_id === "string" ? data.request_id : "";

  if (outcome === "provisioned" && data.ok === true) {
    if (!isUuid(data.user_id) || !isUuid(data.tenant_id)) {
      return { ok: false, outcome: "error", code: "invalid-result" };
    }
    return { ok: true, outcome: "provisioned", userId: data.user_id, tenantId: data.tenant_id, requestId, idempotentReplay: data.idempotent_replay === true };
  }
  if (outcome === "already_exists") {
    return { ok: false, outcome: "already_exists", userId: isUuid(data.user_id) ? data.user_id : null, requestId };
  }
  if (outcome === "idempotency_key_conflict") {
    // Aynı request_id farklı kanonik payload ile → RPC mutasyon yapmadı; deterministik conflict.
    return { ok: false, outcome: "idempotency_key_conflict", requestId };
  }
  return { ok: false, outcome: "error", code: "unexpected-outcome" };
}

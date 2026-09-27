/**
 * Danışan oluşturma — idempotency (çift kayıt koruması), SAF modül.
 *
 * DY-A: Kayıt sayfası her form denemesi için bir `request_id` (uuid) üretir; ağ
 * tekrarı/çift tık aynı id'yi gönderir. Sunucu bunu `clients.create_request_id`
 * kolonuna yazar; `(tenant_id, create_request_id)` kısmi UNIQUE index'i
 * (migration 20270129000300) ikinci insert'i 23505 ile reddeder → mevcut kayıt
 * `idempotent_replay: true` ile döner.
 *
 * `create_request_id` istemci tarafından doğrudan yazılamaz: payload'dan her zaman
 * çıkarılır ve yalnız geçerli uuid biçimindeki `request_id`'den sunucu set eder.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** İstemcinin ASLA doğrudan yazamayacağı kolonlar. */
export const CLIENT_PROTECTED_KEYS = new Set(["tenant_id", "id", "created_at", "create_request_id", "request_id"]);

/** Body'den korunan alanları çıkarır (tenant_id/id/created_at/create_request_id/request_id). */
export function sanitizeClientPayload(body: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!CLIENT_PROTECTED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/** Geçerli uuid ise normalize edilmiş request_id, değilse null (idempotency yok). */
export function resolveCreateRequestId(body: Record<string, unknown> | null | undefined): string | null {
  const raw = body?.request_id;
  return isUuid(raw) ? raw.trim().toLowerCase() : null;
}

export type CreateClientResult =
  | { kind: "created"; client: Record<string, unknown> }
  | { kind: "replay"; client: Record<string, unknown> }
  | { kind: "error"; cause: unknown };

function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  // PostgREST şema önbelleği: kolon yok (migration henüz uygulanmadı) → geriye uyum.
  return e.code === "PGRST204" || (typeof e.message === "string" && e.message.includes("create_request_id"));
}

/**
 * Insert + 23505 replay. Migration henüz uygulanmamışsa (kolon yok) idempotency
 * olmadan eski davranışla insert edilir (rollout güvenliği).
 */
export async function createClientIdempotent(
  db: SupabaseClient,
  tenantId: string,
  fields: Record<string, unknown>,
  requestId: string | null,
): Promise<CreateClientResult> {
  const row: Record<string, unknown> = { ...fields, tenant_id: tenantId };
  if (requestId) row.create_request_id = requestId;

  const first = await db.from("clients").insert(row).select().single();
  if (!first.error) return { kind: "created", client: first.data as Record<string, unknown> };

  const code = (first.error as { code?: string }).code;
  if (requestId && code === "23505") {
    const { data: existing, error: readErr } = await db
      .from("clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("create_request_id", requestId)
      .maybeSingle();
    if (!readErr && existing) return { kind: "replay", client: existing as Record<string, unknown> };
    return { kind: "error", cause: readErr ?? first.error };
  }

  if (requestId && isMissingColumnError(first.error)) {
    const { create_request_id: _drop, ...legacyRow } = row;
    void _drop;
    const retry = await db.from("clients").insert(legacyRow).select().single();
    if (!retry.error) return { kind: "created", client: retry.data as Record<string, unknown> };
    return { kind: "error", cause: retry.error };
  }

  return { kind: "error", cause: first.error };
}

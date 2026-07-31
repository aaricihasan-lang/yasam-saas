/**
 * HD FAZ-2 — Merkezî İçerik Admin hattı · HD-özel APPEND-ONLY Audit (Seçenek B)
 * ============================================================================
 *
 * public.hd_content_audit_events'e güvenli, FAIL-CLOSED audit yazımı. Paylaşılan
 * lib/admin/adminAudit.ts / public.admin_audit_log KULLANILMAZ / import edilmez.
 *
 * Kurallar:
 *   - Yalnız service-role DB client (verifyAdminRequest sonucundan).
 *   - actorAdminId verifyAdminRequest'ten gelir (client body'den DEĞİL).
 *   - action/resource_kind allowlist doğrulanır.
 *   - context'e TAM METİN (original_text/translation_text/report_text/
 *     general_description/passage tam metni) KOPYALANAMAZ → yasak anahtar → throw.
 *   - Audit insert hatası sessizce yutulmaz → HdAuditError (fail-closed).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HdContentAuditInsert } from "./centralContentTypes";
import { isHdAuditAction, isHdAuditResourceKind, isUuid } from "./centralContentValidation";

export type HdAuditErrorCode =
  | "invalid_action"
  | "invalid_resource_kind"
  | "invalid_actor"
  | "invalid_resource_id"
  | "forbidden_context_field"
  | "db_error"
  | "insert_unverified";

export class HdContentAuditError extends Error {
  code: HdAuditErrorCode;
  constructor(code: HdAuditErrorCode, message: string) {
    super(message);
    this.name = "HdContentAuditError";
    this.code = code;
  }
}

/** context'e ASLA kopyalanamayacak tam-metin/hassas anahtarlar. */
export const FORBIDDEN_AUDIT_CONTEXT_KEYS: readonly string[] = [
  "original_text",
  "translation_text",
  "report_text",
  "general_description",
  "passage_text",
  "full_channel_text",
  "translation",
  "content",
];

function assertContextSafe(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (context == null) return {};
  if (typeof context !== "object" || Array.isArray(context)) {
    throw new HdContentAuditError("forbidden_context_field", "audit context nesne olmalı.");
  }
  for (const key of Object.keys(context)) {
    if (FORBIDDEN_AUDIT_CONTEXT_KEYS.includes(key)) {
      throw new HdContentAuditError(
        "forbidden_context_field",
        `audit context'e tam-metin/hassas alan kopyalanamaz: ${key}`,
      );
    }
    // Uzun serbest metin de reddedilir (yanlışlıkla içerik sızıntısı önlenir).
    const v = context[key];
    if (typeof v === "string" && v.length > 512) {
      throw new HdContentAuditError(
        "forbidden_context_field",
        `audit context alanı çok uzun (tam-metin şüphesi): ${key}`,
      );
    }
  }
  return context;
}

/**
 * HD içerik mutation'ı için audit kaydı yazar. FAIL-CLOSED: geçersiz girdi veya
 * DB hatasında HdContentAuditError FIRLATIR (çağıran bilinçli ele almalı).
 */
export async function writeHdContentAudit(
  db: SupabaseClient,
  params: HdContentAuditInsert,
): Promise<{ id: string }> {
  if (!isHdAuditAction(params.action)) {
    throw new HdContentAuditError("invalid_action", `Geçersiz audit action: ${String(params.action)}`);
  }
  if (!isHdAuditResourceKind(params.resource_kind)) {
    throw new HdContentAuditError("invalid_resource_kind", `Geçersiz resource_kind: ${String(params.resource_kind)}`);
  }
  if (!isUuid(params.actor_admin_id)) {
    throw new HdContentAuditError("invalid_actor", "actor_admin_id geçerli uuid olmalı (verifyAdminRequest sonucu).");
  }
  if (!isUuid(params.resource_id)) {
    throw new HdContentAuditError("invalid_resource_id", "resource_id geçerli uuid olmalı.");
  }
  if (params.canonical_entity_id != null && !isUuid(params.canonical_entity_id)) {
    throw new HdContentAuditError("invalid_resource_id", "canonical_entity_id geçerli uuid olmalı.");
  }

  const changed = Array.isArray(params.changed_fields)
    ? params.changed_fields.filter((f): f is string => typeof f === "string")
    : [];
  const context = assertContextSafe(params.context);

  const payload = {
    actor_admin_id: params.actor_admin_id,
    action: params.action,
    resource_kind: params.resource_kind,
    resource_id: params.resource_id,
    canonical_entity_id: params.canonical_entity_id ?? null,
    canonical_key: params.canonical_key ?? null,
    changed_fields: changed,
    context,
  };

  const { data, error } = await db
    .from("hd_content_audit_events")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new HdContentAuditError("db_error", `hd audit insert başarısız: ${error.message}`);
  }
  const insertedId = (data as { id?: unknown } | null)?.id;
  if (insertedId == null) {
    throw new HdContentAuditError("insert_unverified", "hd audit insert doğrulanamadı (id dönmedi).");
  }
  return { id: String(insertedId) };
}

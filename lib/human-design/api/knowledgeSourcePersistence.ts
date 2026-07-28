// Human Design — knowledge kaydına bağlı dinamik KAYNAK satırları (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • record_id için IDOR guard: kaynak, YALNIZ aynı tenant'a ait bir knowledge kaydına bağlanabilir.
//   • Tüm sorgu/insert/update/delete tenant-scoped.
// HD engine/compute/BodyGraph + rapor içerik üretimine DOKUNMAZ — saf kaynak CRUD.
// Kaynaklar varsayılan rapora akmaz; yalnız uzman ekranında görünür.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HumanDesignKnowledgeSource } from "@/lib/human-design/types";

const TABLE = "human_design_knowledge_sources";
const RECORDS = "human_design_knowledge_records";

// client'tan kabul edilen alanlar (tenant_id/user_id/id/record_id/zaman override edilemez).
const EDITABLE_KEYS: (keyof HumanDesignKnowledgeSource)[] = [
  "source_name",
  "source_type",
  "author_or_organization",
  "title",
  "page_or_section",
  "source_url",
  "accessed_on",
  "original_language_tag",
  "original_text",
  "faithful_translation_tr",
  "source_specific_note",
  "rights_status",
  "permission_reference",
  "private_use_allowed",
  "client_report_allowed",
  "expert_distribution_allowed",
  "commercial_use_allowed",
  "sort_order",
];

function pick(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) if (k in input) out[k] = input[k];
  return out;
}

// Kısıtlı / izin-bekleyen / belirsiz telif = private-only (UI isDistributionLocked ile
// AYNI sözleşme). rights_status allowlist'i migration'la birebir; yeni durum uydurulmaz.
export const LOCKED_RIGHTS = new Set(["restricted", "permission_pending", "unknown"]);

export function isDistributionLocked(rights: unknown): boolean {
  return typeof rights === "string" && LOCKED_RIGHTS.has(rights);
}

// Nihai rights_status private-only ise dağıtım bayraklarını SERVER'da false'a normalize et.
// İstemci true gönderse bile sunucu false yazar; DB CHECK ile de güvence altındadır.
// private_use_allowed bu normalizasyondan ETKİLENMEZ (ürün kararı korunur).
export function enforceLockedDistribution(
  fields: Record<string, unknown>,
  effectiveRights: unknown,
): Record<string, unknown> {
  if (isDistributionLocked(effectiveRights)) {
    fields.client_report_allowed = false;
    fields.expert_distribution_allowed = false;
    fields.commercial_use_allowed = false;
  }
  return fields;
}

async function recordInTenant(
  db: SupabaseClient,
  recordId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from(RECORDS)
    .select("id")
    .eq("id", recordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function listSourcesForRecord(
  db: SupabaseClient,
  tenantId: string,
  recordId: string,
): Promise<{ rows: HumanDesignKnowledgeSource[]; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("record_id", recordId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HumanDesignKnowledgeSource[], error: null };
}

export async function insertSource(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  recordId: string,
  input: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  if (!recordId) return { id: null, error: "record_id gerekli." };
  if (!(await recordInTenant(db, recordId, tenantId))) {
    return { id: null, error: "Bilgi kaydı bu hesaba ait değil." };
  }
  const picked = pick(input);
  // Nihai telif durumu (verilmezse DB default'u 'unknown' → private-only → bayraklar false).
  const effectiveRights = (picked.rights_status as string | undefined) ?? "unknown";
  const payload = enforceLockedDistribution(
    {
      ...picked,
      // source_name zorunlu; boşsa güvenli varsayılan (UI de zorunlu tutar).
      source_name: String((input.source_name ?? "") || "Yeni Kaynak"),
      tenant_id: tenantId,
      user_id: userId,
      record_id: recordId,
      updated_at: new Date().toISOString(),
    },
    effectiveRights,
  );
  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error || !data) return { id: null, error: error?.message ?? "Kaynak oluşturulamadı." };
  return { id: (data as { id: string }).id, error: null };
}

export async function updateSource(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  // Kısmi payload'da nihai durumu değerlendirmek için mevcut rights_status okunur.
  // (Örn. yalnız rights_status=permission_pending gelirse, DB'deki eski true dağıtım
  //  bayrakları AYNI update içinde false'a çekilir — kalıcı true kalmaz.)
  const { data: existing, error: readErr } = await db
    .from(TABLE)
    .select("rights_status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!existing) {
    return { ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." };
  }

  const picked = pick(input);
  const effectiveRights =
    (picked.rights_status as string | undefined) ??
    (existing as { rights_status: string }).rights_status;
  const fields = enforceLockedDistribution(
    { ...picked, updated_at: new Date().toISOString() },
    effectiveRights,
  );
  const { data, error } = await db
    .from(TABLE)
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." };
  }
  return { ok: true, error: null };
}

export async function deleteSource(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return { ok: !error, error: error?.message ?? null };
}

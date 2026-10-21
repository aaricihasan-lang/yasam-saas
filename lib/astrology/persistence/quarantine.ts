// Astroloji — GA-P2-05 SAĞLAYICI HAM YANIT KARANTİNASI (YALNIZ SUNUCU; service_role).
//
// Ne zaman yazılır (yalnız hata yolu, en iyi çaba):
//   • invalid_response   — ücretli yanıt adaptör şemasına uymadı (PROVIDER_INVALID_RESPONSE) → ham yanıt + bağlam saklanır.
//   • write_failed       — sonuç kaydı DETERMİNİSTİK hatayla yazılamadı (ör. 23514 ham yanıt sınırı) → ham yanıt + bağlam.
//   • interp_write_failed— sonuç yazıldı, yorum kalıcı yazılamadı → YALNIZ bağlam (raw_response = {}; ham yanıt zaten
//                          astro_provider_results'ta, kişisel veri ikinci kez kopyalanmaz) → scripts/astrology/interp-backfill.ts.
// Geçici hatalar (sağlayıcı 5xx/zaman aşımı, DB bağlantı) karantinaya GİRMEZ.
//
// Kurallar:
//   • Her sorgu tenant + uzman (owner_user_id) filtreli (assertOwner fail-closed); DB'de bileşik FK aynı kuralı zorlar.
//   • OKUMA sorgusu raw_response'u ASLA seçmez (QUARANTINE_LOOKUP_COLUMNS). Ham yanıt yalnız INSERT edilir; onarım
//     yalnız owner betiğiyle (scripts/astrology/quarantine-recover.ts) yapılır. İstemciye giden hiçbir yol bu tabloyu okumaz.
//   • Tablo yoksa (migration uygulanmamış: 42P01 / PGRST205) sessizce eski davranış (kod migration'dan önce deploy edilebilir).
//   • Loglara yalnız hata KODU yazılır; ham yanıt, gövde, doğum verisi LOGLANMAZ.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { isSchemaMissing, isUniqueViolation, isUuid, logAstroDbError, type DbErr } from "./repo";

assertServerOnly("lib/astrology/persistence/quarantine");

export const QUARANTINE_TABLE = "astro_provider_quarantine";
/** Migration varsayılanıyla aynı saklama süresi (CHECK ≤ 90 gün). */
export const QUARANTINE_TTL_DAYS = 30;
export type QuarantineReason = "invalid_response" | "write_failed" | "interp_write_failed";
/** Negatif önbelleği tetikleyen nedenler (interp_write_failed'da sonuç zaten kayıtlı → önbellekten gelir). */
export const QUARANTINE_BLOCKING_REASONS: readonly QuarantineReason[] = ["invalid_response", "write_failed"];

/** raw_response BİLİNÇLİ OLARAK YOK. */
const QUARANTINE_LOOKUP_COLUMNS = "id, reason, expires_at";

/** Onarım için gerekli projeksiyon bağlamı (birim = istek kimliği + beklenen değerler; seçim seçenekleri). */
export type QuarantineContext = {
  selectionTechnique: string;
  options: Record<string, unknown>;
  unit: Record<string, unknown>;
};

export type NewQuarantine = {
  profileId: string;
  profileRevision: number;
  partnerProfileId: string | null;
  partnerProfileRevision: number | null;
  technique: string;
  provider: string;
  endpoint: string;
  adapterVersion: string;
  inputHash: string;
  reason: QuarantineReason;
  errorCodes: string[];
  raw: unknown;
  context: QuarantineContext;
};

export type QuarantineInsertStatus = "stored" | "exists" | "no_table" | "failed";

const HASH_RE = /^[0-9a-f]{64}$/;

function owner(tenantId: string, ownerUserId: string, ctx: string): void {
  if (!isUuid(tenantId) || !isUuid(ownerUserId)) throw new Error(`[astro] karantina invariant ihlali (${ctx})`);
}

/** Hata kodları/iletileri — DB CHECK'i (≤ 20 öğe, ≤ 8 KB) ile uyumlu kısaltma. */
export function quarantineErrorCodes(errors: string[]): string[] {
  return errors.slice(0, 20).map((e) => String(e).slice(0, 200));
}

/**
 * Negatif önbellek: aynı (tenant, uzman, input_hash, adapter_version) için SÜRESİ DOLMAMIŞ engelleyici karantina satırı var mı?
 * Süresi dolmuş eşleşme bulunursa (aynı anahtar) silinir. `missing` = tablo yok (eski davranış).
 */
export async function findActiveQuarantine(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  inputHash: string,
  adapterVersion: string,
  now: Date = new Date(),
): Promise<{ active: boolean; missing: boolean; error: DbErr }> {
  owner(tenantId, ownerUserId, "findActiveQuarantine");
  if (!HASH_RE.test(inputHash)) return { active: false, missing: false, error: null };
  let data: unknown;
  let error: DbErr;
  try {
    ({ data, error } = await db
      .from(QUARANTINE_TABLE)
      .select(QUARANTINE_LOOKUP_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("owner_user_id", ownerUserId)
      .eq("input_hash", inputHash)
      .eq("adapter_version", adapterVersion)
      .in("reason", [...QUARANTINE_BLOCKING_REASONS])
      .limit(5));
  } catch {
    return { active: false, missing: false, error: { code: "", message: "quarantine lookup threw" } };
  }
  if (error) return isSchemaMissing(error) ? { active: false, missing: true, error: null } : { active: false, missing: false, error };
  const rows = (data as { id: string; expires_at: string }[] | null) ?? [];
  const nowMs = now.getTime();
  const expired = rows.filter((r) => !(Date.parse(r.expires_at) > nowMs)).map((r) => r.id);
  if (expired.length > 0) {
    try {
      await db.from(QUARANTINE_TABLE).delete().eq("tenant_id", tenantId).eq("owner_user_id", ownerUserId).in("id", expired);
    } catch {
      /* temizlik en iyi çaba */
    }
  }
  return { active: rows.some((r) => Date.parse(r.expires_at) > nowMs), missing: false, error: null };
}

/**
 * Karantina INSERT (en iyi çaba; hata ASLA fırlatılmaz, kullanıcı hatasını değiştirmez). Önce aynı tenant + uzmanın süresi
 * dolmuş satırları silinir (fırsatçı temizlik; yeni altyapı yok). 23505 = aynı anahtar zaten karantinada.
 */
export async function insertQuarantine(
  db: SupabaseClient,
  tenantId: string,
  ownerUserId: string,
  q: NewQuarantine,
  now: Date = new Date(),
): Promise<{ status: QuarantineInsertStatus; code?: string }> {
  owner(tenantId, ownerUserId, "insertQuarantine");
  if (!HASH_RE.test(q.inputHash)) return { status: "failed", code: "invalid_hash" };
  const raw = q.raw !== null && typeof q.raw === "object" && !Array.isArray(q.raw) ? q.raw : null;
  if (raw === null) return { status: "failed", code: "raw_not_object" };
  try {
    const cleanup = await db.from(QUARANTINE_TABLE).delete().eq("tenant_id", tenantId).eq("owner_user_id", ownerUserId).lt("expires_at", now.toISOString());
    if (cleanup.error && isSchemaMissing(cleanup.error)) return { status: "no_table" };
    const { error } = await db
      .from(QUARANTINE_TABLE)
      .insert({
        tenant_id: tenantId,
        owner_user_id: ownerUserId,
        profile_id: q.profileId,
        profile_revision: q.profileRevision,
        partner_profile_id: q.partnerProfileId,
        partner_profile_revision: q.partnerProfileRevision,
        technique: q.technique,
        provider: q.provider,
        endpoint: q.endpoint,
        adapter_version: q.adapterVersion,
        input_hash: q.inputHash,
        reason: q.reason,
        error_codes: quarantineErrorCodes(q.errorCodes),
        raw_response: raw,
        context: q.context,
        expires_at: new Date(now.getTime() + QUARANTINE_TTL_DAYS * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (!error) return { status: "stored" };
    if (isUniqueViolation(error)) return { status: "exists" };
    if (isSchemaMissing(error)) return { status: "no_table" };
    logAstroDbError("quarantine.insert", error);
    return { status: "failed", code: error.code ?? "unknown" };
  } catch {
    return { status: "failed", code: "threw" };
  }
}

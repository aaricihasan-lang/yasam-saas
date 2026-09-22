/**
 * FAZ 1 / İP-2C — ANLAMLI İŞLEM OLAYI kaydı (sunucu-kaynaklı).
 *
 * "Modül kartı açma" veya salt kayıt-sayısı DEĞİL; yalnız SUNUCUDA başarıyla tamamlanan
 * anlamlı işlem (analiz/kayıt/protokol/rapor) bir olay üretir. Olay, çağıran route'un
 * ZATEN doğruladığı guard'tan (verifyUserRequest/requireModuleAccess) gelen SUNUCU-TARAFI
 * tenantId/userId ile yazılır — istemciden gelen tenant/user/olay-türüne GÜVENİLMEZ.
 *
 * DAYANIKLILIK: Olay yazımı ana işlemin BAŞARISINDAN SONRA çağrılır; kontrollü + awaited
 * hata yönetimi ile (kör fire-and-forget DEĞİL). Hata olursa PII'siz loglar ve
 * { ok:false } döner ama ASLA throw ETMEZ → analitik hatası ana uzman işlemini bozmaz.
 * İDEMPOTENCY: idempotencyKey verilirse UNIQUE index çift-yazımı reddeder (23505) →
 * retry/eşzamanlılık çift-saymaz; bu durum { deduped:true } olarak döner (başarı sayılır).
 *
 * PII/SECRET YASAK: Bu fonksiyon yalnız {tenant_id, user_id, module_key, event_type,
 * idempotency_key} yazar. Danışan/analiz/dosya/serbest-metin/token/IP ASLA geçmez
 * (imza da buna izin vermez — yapısal engel).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";

/** Sabit olay sözlüğü — migration expert_usage_event_type_chk ile birebir. */
export const USAGE_EVENT_TYPES = [
  "analysis_created",
  "record_created",
  "record_updated",
  "protocol_created",
  "report_generated",
  "guide_created",
  "translation_completed",
] as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export type RecordUsageEventInput = {
  /** SUNUCUDA doğrulanmış çalışma alanı (guard.tenantId). */
  tenantId: string;
  /** SUNUCUDA doğrulanmış kullanıcı (guard.userId). */
  userId: string;
  /** Kanonik modül anahtarı (ModuleGateKey). */
  moduleKey: ModuleGateKey;
  /** Sabit sözlükten olay türü. */
  eventType: UsageEventType;
  /**
   * Retry/eşzamanlılık dedup anahtarı. Create/update olaylarında kaynak-satır id'sinden
   * türetilmelidir (bkz. buildUsageIdempotencyKey). Verilmezse dedup edilmez.
   */
  idempotencyKey?: string | null;
};

export type RecordUsageEventResult =
  | { ok: true; deduped: boolean }
  | { ok: false; deduped: false };

/**
 * Create/update olayları için deterministik idempotency anahtarı:
 *   "<module>:<event>:<resourceId>"
 * Aynı kaynak için retry aynı anahtarı üretir → tek satır.
 */
export function buildUsageIdempotencyKey(
  moduleKey: ModuleGateKey,
  eventType: UsageEventType,
  resourceId: string,
): string {
  return `${moduleKey}:${eventType}:${resourceId}`;
}

function isValidUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Olayı yazar. Çağıran, ana işlemin başarısından SONRA `await recordUsageEvent(...)`
 * biçiminde çağırmalı ve dönüşü kontrol akışını DEĞİŞTİRMEK için KULLANMAMALIDIR
 * (ana işlem zaten başarılı). Fonksiyon throw etmez.
 *
 * @param db service_role Supabase client (guard.db)
 */
export async function recordUsageEvent(
  db: SupabaseClient,
  input: RecordUsageEventInput,
): Promise<RecordUsageEventResult> {
  try {
    // Sunucu-tarafı doğrulanmış olması BEKLENEN alanlar için son savunma kontrolü.
    if (!isValidUuidLike(String(input.tenantId)) || !isValidUuidLike(String(input.userId))) {
      // PII'siz uyarı; ana işlemi bozma.
      console.warn("[usage-event] skipped: invalid tenant/user id", {
        module_key: input.moduleKey,
        event_type: input.eventType,
      });
      return { ok: false, deduped: false };
    }
    if (!(USAGE_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
      console.warn("[usage-event] skipped: unknown event_type", { event_type: input.eventType });
      return { ok: false, deduped: false };
    }

    const payload: Record<string, unknown> = {
      tenant_id: input.tenantId,
      user_id: input.userId,
      module_key: input.moduleKey,
      event_type: input.eventType,
    };
    if (input.idempotencyKey) payload.idempotency_key = input.idempotencyKey;

    const { error } = await db.from("expert_usage_events").insert(payload);
    if (error) {
      // 23505 = unique_violation → idempotency dedup (retry/eşzamanlılık). Başarı sayılır.
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, deduped: true };
      }
      // Diğer hatalar: PII'siz görünürlük; ana işlem korunur.
      console.error("[usage-event] insert failed", {
        module_key: input.moduleKey,
        event_type: input.eventType,
        code: (error as { code?: string }).code ?? null,
      });
      return { ok: false, deduped: false };
    }
    return { ok: true, deduped: false };
  } catch (e) {
    console.error("[usage-event] unexpected error", {
      module_key: input.moduleKey,
      event_type: input.eventType,
      name: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, deduped: false };
  }
}

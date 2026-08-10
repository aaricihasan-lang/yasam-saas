import "server-only";

/**
 * YAŞAM HAFIZASI™ — BF-11E RUNTIME ACTIVATION GATE (SERVER-ONLY WIRING).
 * =========================================================================
 *
 * BF-11E control-plane sözleşmesinin (activationMatrix + activationState) RUNTIME
 * processing zincirine bağlandığı TEK server-only nokta. Amaç: bir CONTROLLED dormant
 * kaynak kod registry'sinde enabled:true olsa dahi, `public.yh_source_activation`
 * DB durumunda is_active=true OLMADAN hiçbir index write üretmemesi.
 *
 *   INV: CODE MERGED ≠ TRIGGER INSTALLED ≠ SOURCE ACTIVATED
 *        → outbox worker (event processing) bu kapıyı geçmeden index yazamaz.
 *
 * BAĞLAYICI:
 *   - İkinci paralel activation sistemi YOK: karar YALNIZ evaluateProcessingGate
 *     (activationState) + YH_ACTIVATION_MATRIX (activationMatrix) ile verilir.
 *   - KEEP_LIVE / ROW_GATED_READY (grandfathered; requiresRuntimeActivation=false)
 *     kaynaklar DB'ye HİÇ BAKMADAN mevcut davranışını sürdürür (17 canlı kaynak
 *     bozulmaz; yeni activation-row zorunluluğu YARATILMAZ).
 *   - CONTROLLED sınıflar (requiresRuntimeActivation=true) YALNIZ registryEnabled=true
 *     VE DB is_active=true iken aktiftir; aksi FAIL-CLOSED inactive.
 *   - Bilinmeyen/mataris-dışı sourceKey → FAIL-CLOSED inactive.
 *   - Ham PII/source text OKUNMAZ/loglanmaz; yalnız is_active/backfill_allowed bayrağı.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerDb } from "@/lib/supabase-server";
import {
  ACTIVATION_CLASS_POLICY,
  isActivationClass,
  type SourceActivationRuntime,
} from "./activationState";
import {
  activationEntryOf,
  resolveProcessingActive,
  type ActivationMatrixEntry,
} from "./activationMatrix";

/** DB `yh_source_activation` tablosu (kontrol düzlemi; server-only). */
const ACTIVATION_TABLE = "yh_source_activation";

/**
 * Bir kaynağın grandfathered CANLI (requiresRuntimeActivation=false) olup olmadığı.
 * Böyle kaynaklar DB'ye bakılmadan mevcut davranışını sürdürür.
 */
function requiresRuntimeActivation(entry: ActivationMatrixEntry): boolean {
  if (!isActivationClass(entry.activationClass)) return true; // fail-closed
  return ACTIVATION_CLASS_POLICY[entry.activationClass].requiresRuntimeActivation;
}

/**
 * DB `yh_source_activation` satırını okur (server-only). Satır yoksa → null
 * (apply-safe default: aktivasyon satırı yok = inactive). Bozuk/eksik değer → fail-closed.
 */
export async function readSourceActivation(
  sourceKey: string,
  db?: SupabaseClient,
): Promise<SourceActivationRuntime | null> {
  if (!sourceKey) return null;
  const client = db ?? getServerDb();
  const { data, error } = await client
    .from(ACTIVATION_TABLE)
    .select("is_active, backfill_allowed")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { is_active?: unknown; backfill_allowed?: unknown };
  return {
    isActive: row.is_active === true,
    backfillAllowed: row.backfill_allowed === true,
  };
}

/**
 * RUNTIME processing gate (server-only). Bir kaynağın olay işlemesinin (index write)
 * aktif olup olmadığını FAIL-CLOSED değerlendirir.
 *
 *   - Grandfathered CANLI (KEEP_LIVE / ROW_GATED_READY): DB'ye BAKILMAZ → mevcut davranış
 *     (registryEnabled=true iken aktif). 17 canlı kaynak yeni activation-row gerektirmez.
 *   - CONTROLLED (dormant sınıflar): registryEnabled=true VE DB is_active=true iken aktif.
 *   - Bilinmeyen key → false.
 *
 * DB hatası çağırana YUKARI FIRLAR (worker geçici hata olarak ele alır); sessiz "aktif"
 * varsayımı YAPILMAZ (fail-closed).
 */
export async function isSourceProcessingActive(
  sourceKey: string,
  db?: SupabaseClient,
): Promise<boolean> {
  const entry = activationEntryOf(sourceKey);
  if (entry === undefined) return false; // matris-dışı → fail-closed

  // Grandfathered CANLI kaynak: DB'ye bakmadan pure karar (mevcut davranış korunur).
  if (!requiresRuntimeActivation(entry)) {
    return resolveProcessingActive(sourceKey, null);
  }

  // CONTROLLED kaynak: DB aktivasyon durumu ZORUNLU.
  const runtime = await readSourceActivation(sourceKey, db);
  return resolveProcessingActive(sourceKey, runtime);
}

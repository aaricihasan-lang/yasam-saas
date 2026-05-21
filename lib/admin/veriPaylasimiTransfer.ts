import { supabase } from "@/lib/supabase";

export const ADMIN_SOURCE_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export const TRANSFER_BATCH_SIZE = 100;

/** stones JSON satırları büyük olabilir */
const STONES_BATCH_SIZE = 25;

/** UI seçim anahtarı → gerçek Supabase tablo adı */
export type TransferGroupKey =
  | "stones"
  | "minerals"
  | "combinations"
  | "bioenergy_symbols"
  | "bioenergy_imaginations"
  | "bioenergy_chakras"
  | "bioenergy_energy_bodies"
  | "bioenergy_subconscious_causes"
  | "reflexology_protocols"
  | "numerology_knowledge_records"
  | "numerology_stone_assignments";

export type TransferTableName = TransferGroupKey;

export type TransferResultCounts = Record<TransferGroupKey, number>;

export function emptyTransferCounts(): TransferResultCounts {
  return {
    stones: 0,
    minerals: 0,
    combinations: 0,
    bioenergy_symbols: 0,
    bioenergy_imaginations: 0,
    bioenergy_chakras: 0,
    bioenergy_energy_bodies: 0,
    bioenergy_subconscious_causes: 0,
    reflexology_protocols: 0,
    numerology_knowledge_records: 0,
    numerology_stone_assignments: 0,
  };
}

const STRIP_ON_COPY = new Set(["id", "created_at", "updated_at"]);

/** stones tablosunda bilinen insert alanları — select(*) fazlalıkları gönderilmez */
const STONES_INSERT_FIELDS = [
  "stone_name",
  "short_description",
  "source_note",
  "general_info",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "warning_text",
  "warning_tags",
  "feng_shui",
  "meditation",
  "care",
  "application",
  "chakras",
  "assignments",
  "images",
  "image_upload_failed",
] as const;

function prepareRowForInsert(
  row: Record<string, unknown>,
  targetTenantId: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (STRIP_ON_COPY.has(key)) continue;
    copy[key] = value;
  }
  copy.tenant_id = targetTenantId;
  return copy;
}

/**
 * Doğaltaş: yalnızca tabloda kullanılan alanlar + hedef tenant_id.
 * id / created_at / updated_at ve bilinmeyen kolonlar gönderilmez.
 */
function prepareStoneRowForInsert(
  row: Record<string, unknown>,
  targetTenantId: string,
  options?: { omitImageUploadFailed?: boolean },
): Record<string, unknown> | null {
  const stoneName = String(row.stone_name ?? row.name ?? "").trim();
  if (!stoneName) return null;

  const copy: Record<string, unknown> = {
    tenant_id: targetTenantId,
    stone_name: stoneName,
  };

  for (const key of STONES_INSERT_FIELDS) {
    if (key === "stone_name") continue;
    if (options?.omitImageUploadFailed && key === "image_upload_failed") continue;
    if (!(key in row)) continue;
    const value = row[key];
    if (value === undefined) continue;
    copy[key] = value;
  }

  return copy;
}

async function insertRowsBatched(
  table: TransferTableName,
  rows: Record<string, unknown>[],
  batchSize: number = TRANSFER_BATCH_SIZE,
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 };

  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const { error } = await supabase.from(table).insert(batch);

    if (!error) {
      inserted += batch.length;
      continue;
    }

    for (const row of batch) {
      const { error: singleError } = await supabase.from(table).insert(row);
      if (singleError) {
        return {
          inserted,
          error: singleError.message,
        };
      }
      inserted += 1;
    }
  }

  return { inserted };
}

function formatStonesTransferError(
  readCount: number,
  inserted: number,
  message: string,
): string {
  return `Doğaltaş: okunan ${readCount}, eklenen ${inserted}. ${message}`;
}

async function copyStonesTableToTenant(
  sourceTenantId: string,
  targetTenantId: string,
): Promise<{ count: number; readCount: number; error?: string }> {
  const { data, error } = await supabase
    .from("stones")
    .select("*")
    .eq("tenant_id", sourceTenantId);

  if (error) {
    console.error("[veri-paylasimi] stones okuma:", error.message);
    return { count: 0, readCount: 0, error: error.message };
  }

  const sourceRows = (data ?? []) as Record<string, unknown>[];
  const readCount = sourceRows.length;

  if (readCount === 0) {
    console.log("[veri-paylasimi] stones okunan: 0 / eklenen: 0");
    return { count: 0, readCount: 0 };
  }

  let payloads = sourceRows
    .map((row) => prepareStoneRowForInsert(row, targetTenantId))
    .filter((row): row is Record<string, unknown> => row !== null);

  if (payloads.length === 0) {
    const msg = "Kaynakta geçerli taş adı (stone_name) bulunamadı.";
    console.error("[veri-paylasimi] stones:", msg);
    return {
      count: 0,
      readCount,
      error: formatStonesTransferError(readCount, 0, msg),
    };
  }

  let { inserted, error: insertError } = await insertRowsBatched(
    "stones",
    payloads,
    STONES_BATCH_SIZE,
  );

  if (insertError && /image_upload_failed/i.test(insertError)) {
    console.warn(
      "[veri-paylasimi] stones: image_upload_failed alanı atlanarak yeniden deneniyor",
    );
    payloads = sourceRows
      .map((row) =>
        prepareStoneRowForInsert(row, targetTenantId, {
          omitImageUploadFailed: true,
        }),
      )
      .filter((row): row is Record<string, unknown> => row !== null);

    const retry = await insertRowsBatched("stones", payloads, STONES_BATCH_SIZE);
    inserted = retry.inserted;
    insertError = retry.error;
  }

  console.log(
    `[veri-paylasimi] stones okunan: ${readCount} / eklenen: ${inserted}`,
  );

  if (insertError) {
    console.error("[veri-paylasimi] stones insert:", insertError);
    return {
      count: inserted,
      readCount,
      error: formatStonesTransferError(readCount, inserted, insertError),
    };
  }

  return { count: inserted, readCount };
}

export async function copyLibraryTableToTenant(
  table: TransferTableName,
  sourceTenantId: string,
  targetTenantId: string,
): Promise<{ count: number; error?: string }> {
  if (table === "stones") {
    const stonesResult = await copyStonesTableToTenant(
      sourceTenantId,
      targetTenantId,
    );
    return {
      count: stonesResult.count,
      error: stonesResult.error,
    };
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("tenant_id", sourceTenantId);

  if (error) {
    return { count: 0, error: error.message };
  }

  const sourceRows = (data ?? []) as Record<string, unknown>[];
  if (sourceRows.length === 0) {
    return { count: 0 };
  }

  const payloads = sourceRows.map((row) =>
    prepareRowForInsert(row, targetTenantId),
  );

  const { inserted, error: insertError } = await insertRowsBatched(table, payloads);
  return { count: inserted, error: insertError };
}

export async function runLibraryTransfer(
  groups: TransferGroupKey[],
  targetTenantId: string,
  sourceTenantId: string = ADMIN_SOURCE_TENANT_ID,
): Promise<{ counts: TransferResultCounts; error?: string }> {
  const target = targetTenantId.trim();
  const source = sourceTenantId.trim();

  if (!target) {
    return {
      counts: emptyTransferCounts(),
      error: "Hedef kullanıcı tenant_id geçersiz.",
    };
  }

  if (target === source) {
    return {
      counts: emptyTransferCounts(),
      error: "Kaynak ve hedef tenant aynı; aktarım yalnızca seçili üyeye yapılmalı.",
    };
  }

  const counts = emptyTransferCounts();
  const uniqueGroups = [...new Set(groups)];

  for (const group of uniqueGroups) {
    const { count, error } = await copyLibraryTableToTenant(group, source, target);
    counts[group] = count;
    if (error) {
      return { counts, error };
    }
  }

  return { counts };
}

export function sumBioenergyCounts(counts: TransferResultCounts): number {
  return (
    counts.bioenergy_symbols +
    counts.bioenergy_imaginations +
    counts.bioenergy_chakras +
    counts.bioenergy_energy_bodies +
    counts.bioenergy_subconscious_causes
  );
}

export function sumReflexologyCounts(counts: TransferResultCounts): number {
  return counts.reflexology_protocols;
}

export function sumNumerologyCounts(counts: TransferResultCounts): number {
  return counts.numerology_knowledge_records + counts.numerology_stone_assignments;
}

export function formatTransferResultLines(counts: TransferResultCounts): string[] {
  const lines: string[] = [];
  if (counts.stones > 0) lines.push(`${counts.stones} Doğaltaş`);
  if (counts.combinations > 0) lines.push(`${counts.combinations} Kombinasyon`);
  if (counts.minerals > 0) lines.push(`${counts.minerals} Mineral`);

  const bio = sumBioenergyCounts(counts);
  if (bio > 0) lines.push(`${bio} Biyoenerji`);

  const ref = sumReflexologyCounts(counts);
  if (ref > 0) lines.push(`${ref} Refleksoloji`);

  const num = sumNumerologyCounts(counts);
  if (num > 0) lines.push(`${num} Numeroloji`);

  return lines;
}

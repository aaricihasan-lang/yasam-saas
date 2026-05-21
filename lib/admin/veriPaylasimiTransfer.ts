import { supabase } from "@/lib/supabase";

export const ADMIN_SOURCE_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export const TRANSFER_BATCH_SIZE = 100;

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

/** Doğaltaş: kaynak satırından güvenli insert objesi */
function buildCleanStoneRow(
  row: Record<string, unknown>,
  targetTenantId: string,
): Record<string, unknown> {
  const cleanRow: Record<string, unknown> = {
    ...row,
    tenant_id: targetTenantId,
  };

  delete cleanRow.id;
  delete cleanRow.created_at;
  delete cleanRow.updated_at;

  if (!Object.prototype.hasOwnProperty.call(row, "image_upload_failed")) {
    delete cleanRow.image_upload_failed;
  }

  if (cleanRow.images == null) cleanRow.images = [];
  if (cleanRow.assignments == null) cleanRow.assignments = {};
  if (cleanRow.warning_tags == null) cleanRow.warning_tags = [];

  return cleanRow;
}

function formatStonesTransferSummary(
  readCount: number,
  successCount: number,
  failCount: number,
): string {
  return `Doğaltaş: okunan ${readCount}, başarılı ${successCount}, başarısız ${failCount}`;
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

/**
 * Doğaltaş listesi — admin tenant kaynağı, hedef üye tenant_id.
 * Tek tek insert; mineral/kombinasyon akışından bağımsız.
 */
async function copyStonesTableToTenant(
  sourceTenantId: string,
  targetTenantId: string,
): Promise<{ count: number; readCount: number; error?: string }> {
  const sourceId = sourceTenantId.trim() || ADMIN_SOURCE_TENANT_ID;

  const { data: sourceRows, error: readError } = await supabase
    .from("stones")
    .select("*")
    .eq("tenant_id", sourceId);

  if (readError) {
    console.error("[veri-paylasimi] stones okuma:", readError.message);
    return { count: 0, readCount: 0, error: readError.message };
  }

  const rows = (sourceRows ?? []) as Record<string, unknown>[];
  const readCount = rows.length;

  if (readCount === 0) {
    const summary = formatStonesTransferSummary(0, 0, 0);
    console.log("[veri-paylasimi]", summary);
    return { count: 0, readCount: 0 };
  }

  let successCount = 0;
  let failCount = 0;
  let lastInsertError = "";

  for (const row of rows) {
    const cleanRow = buildCleanStoneRow(row, targetTenantId);
    const { error: insertError } = await supabase.from("stones").insert(cleanRow);

    if (insertError) {
      failCount += 1;
      lastInsertError = insertError.message;
      console.log(
        "STONE INSERT HATA:",
        insertError.message,
        cleanRow.stone_name,
      );
      continue;
    }

    successCount += 1;
  }

  const summary = formatStonesTransferSummary(readCount, successCount, failCount);
  console.log("[veri-paylasimi]", summary);

  if (successCount === 0) {
    const detail = lastInsertError ? ` ${lastInsertError}` : "";
    return {
      count: 0,
      readCount,
      error: `${summary}.${detail}`,
    };
  }

  if (failCount > 0) {
    return {
      count: successCount,
      readCount,
      error: summary,
    };
  }

  return { count: successCount, readCount };
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

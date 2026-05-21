import {
  isAdminUser,
  readYasamUser,
  syncYasamUserFromDb,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

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

export type LibraryTransferResult = {
  counts: TransferResultCounts;
  error?: string;
  /** Başarı toast metni — sayfa `successMessage ?? formatTransferResultLines(...)` kullanabilir */
  successMessage?: string;
};

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

const STONES_EMPTY_SOURCE_MESSAGE =
  "Admin kütüphanesinde aktarılacak Doğaltaş kaydı bulunamadı";

/** Giriş yapan adminin güncel tenant_id (localStorage → users senkron) */
export async function resolveSourceAdminTenantId(): Promise<{
  tenantId: string | null;
  error?: string;
}> {
  const session = readYasamUser();
  if (!session) {
    return { tenantId: null, error: "Admin oturumu bulunamadı. Lütfen tekrar giriş yapın." };
  }

  const user = (await syncYasamUserFromDb(session)) ?? session;

  if (!isAdminUser(user)) {
    return { tenantId: null, error: "Kaynak tenant yalnızca admin oturumundan alınır." };
  }

  const tenantId = user.tenant_id?.trim() || null;
  if (!tenantId) {
    return {
      tenantId: null,
      error: "Admin kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.",
    };
  }

  return { tenantId };
}

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

function sumSelectedCounts(
  counts: TransferResultCounts,
  groups: TransferGroupKey[],
): number {
  return groups.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

function buildTransferSuccessMessage(
  counts: TransferResultCounts,
  groups: TransferGroupKey[],
  targetEmail?: string,
): string | null {
  const account = targetEmail?.trim() || "hedef hesap";
  const lines: string[] = [];

  if (groups.includes("stones") && counts.stones > 0) {
    lines.push(`${counts.stones} Doğaltaş kaydı ${account} hesabına eklendi`);
  }
  if (groups.includes("combinations") && counts.combinations > 0) {
    lines.push(`${counts.combinations} Kombinasyon kaydı ${account} hesabına eklendi`);
  }
  if (groups.includes("minerals") && counts.minerals > 0) {
    lines.push(`${counts.minerals} Mineral kaydı ${account} hesabına eklendi`);
  }

  const bio =
    (groups.includes("bioenergy_symbols") ? counts.bioenergy_symbols : 0) +
    (groups.includes("bioenergy_imaginations") ? counts.bioenergy_imaginations : 0) +
    (groups.includes("bioenergy_chakras") ? counts.bioenergy_chakras : 0) +
    (groups.includes("bioenergy_energy_bodies") ? counts.bioenergy_energy_bodies : 0) +
    (groups.includes("bioenergy_subconscious_causes")
      ? counts.bioenergy_subconscious_causes
      : 0);
  if (bio > 0) lines.push(`${bio} Biyoenerji kaydı ${account} hesabına eklendi`);

  if (groups.includes("reflexology_protocols") && counts.reflexology_protocols > 0) {
    lines.push(
      `${counts.reflexology_protocols} Refleksoloji kaydı ${account} hesabına eklendi`,
    );
  }

  const num =
    (groups.includes("numerology_knowledge_records")
      ? counts.numerology_knowledge_records
      : 0) +
    (groups.includes("numerology_stone_assignments")
      ? counts.numerology_stone_assignments
      : 0);
  if (num > 0) lines.push(`${num} Numeroloji kaydı ${account} hesabına eklendi`);

  if (lines.length === 0) return null;
  return lines.join("\n");
}

async function insertRowsBatched(
  table: TransferTableName,
  rows: Record<string, unknown>[],
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 };

  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += TRANSFER_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + TRANSFER_BATCH_SIZE);
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
 * Doğaltaş listesi — admin oturum tenant kaynağı, hedef üye tenant_id.
 * Tek tek insert; mineral/kombinasyon akışından bağımsız.
 */
async function copyStonesTableToTenant(
  sourceAdminTenantId: string,
  targetTenantId: string,
): Promise<{ count: number; readCount: number; error?: string }> {
  const { data: sourceRows, error: readError } = await supabase
    .from("stones")
    .select("*")
    .eq("tenant_id", sourceAdminTenantId);

  if (readError) {
    console.error("[veri-paylasimi] stones okuma:", readError.message);
    return { count: 0, readCount: 0, error: readError.message };
  }

  const rows = (sourceRows ?? []) as Record<string, unknown>[];
  const readCount = rows.length;

  console.log(
    `[veri-paylasimi] stones kaynak tenant=${sourceAdminTenantId} okunan=${readCount}`,
  );

  if (readCount === 0) {
    return { count: 0, readCount: 0, error: STONES_EMPTY_SOURCE_MESSAGE };
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

  console.log(
    `[veri-paylasimi] stones okunan=${readCount} başarılı=${successCount} başarısız=${failCount}`,
  );

  if (successCount === 0) {
    const detail = lastInsertError ? ` ${lastInsertError}` : "";
    return {
      count: 0,
      readCount,
      error: `Doğaltaş aktarımı başarısız (okunan ${readCount}, eklenen 0).${detail}`,
    };
  }

  if (failCount > 0) {
    return {
      count: successCount,
      readCount,
      error: `Doğaltaş: okunan ${readCount}, başarılı ${successCount}, başarısız ${failCount}`,
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
  targetExpertEmail?: string,
): Promise<LibraryTransferResult> {
  const target = targetTenantId.trim();
  const uniqueGroups = [...new Set(groups)];

  if (!target) {
    return {
      counts: emptyTransferCounts(),
      error: "Hedef kullanıcı tenant_id geçersiz.",
    };
  }

  const sourceResolved = await resolveSourceAdminTenantId();
  if (!sourceResolved.tenantId) {
    return {
      counts: emptyTransferCounts(),
      error: sourceResolved.error ?? "Admin kaynak tenant_id alınamadı.",
    };
  }

  const source = sourceResolved.tenantId;

  if (target === source) {
    return {
      counts: emptyTransferCounts(),
      error: "Kaynak ve hedef tenant aynı; aktarım yalnızca seçili üyeye yapılmalı.",
    };
  }

  const counts = emptyTransferCounts();

  for (const group of uniqueGroups) {
    const { count, error } = await copyLibraryTableToTenant(group, source, target);
    counts[group] = count;
    if (error) {
      return { counts, error };
    }
  }

  const totalInserted = sumSelectedCounts(counts, uniqueGroups);

  if (totalInserted === 0) {
    const onlyStones =
      uniqueGroups.length === 1 && uniqueGroups[0] === "stones";
    const includesStones = uniqueGroups.includes("stones");

    return {
      counts,
      error: onlyStones || includesStones
        ? STONES_EMPTY_SOURCE_MESSAGE
        : "Aktarılacak kayıt bulunamadı veya hiçbir kayıt eklenemedi.",
    };
  }

  const successMessage = buildTransferSuccessMessage(
    counts,
    uniqueGroups,
    targetExpertEmail,
  );

  return {
    counts,
    successMessage: successMessage ?? undefined,
  };
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

export function formatTransferResultLines(
  counts: TransferResultCounts,
  targetEmail?: string | null,
): string[] {
  const account = targetEmail?.trim();
  const lines: string[] = [];

  if (counts.stones > 0) {
    lines.push(
      account
        ? `${counts.stones} Doğaltaş kaydı ${account} hesabına eklendi`
        : `${counts.stones} Doğaltaş`,
    );
  }
  if (counts.combinations > 0) {
    lines.push(
      account
        ? `${counts.combinations} Kombinasyon kaydı ${account} hesabına eklendi`
        : `${counts.combinations} Kombinasyon`,
    );
  }
  if (counts.minerals > 0) {
    lines.push(
      account
        ? `${counts.minerals} Mineral kaydı ${account} hesabına eklendi`
        : `${counts.minerals} Mineral`,
    );
  }

  const bio = sumBioenergyCounts(counts);
  if (bio > 0) {
    lines.push(
      account ? `${bio} Biyoenerji kaydı ${account} hesabına eklendi` : `${bio} Biyoenerji`,
    );
  }

  const ref = sumReflexologyCounts(counts);
  if (ref > 0) {
    lines.push(
      account
        ? `${ref} Refleksoloji kaydı ${account} hesabına eklendi`
        : `${ref} Refleksoloji`,
    );
  }

  const num = sumNumerologyCounts(counts);
  if (num > 0) {
    lines.push(
      account ? `${num} Numeroloji kaydı ${account} hesabına eklendi` : `${num} Numeroloji`,
    );
  }

  return lines;
}

import {
  EMPTY_SOURCE_ADMIN_MESSAGE,
  resolveSourceAdminTenantId,
} from "@/lib/admin/adminSourceTenant";
import { supabase } from "@/lib/supabase";

export { resolveSourceAdminTenantId } from "@/lib/admin/adminSourceTenant";

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

export { EMPTY_SOURCE_ADMIN_MESSAGE } from "@/lib/admin/adminSourceTenant";

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

/** Doğaltaş insert — yalnızca tablo alanları (minerals/combinations ile aynı strip mantığı) */
const STONE_COPY_FIELDS = [
  "short_description",
  "general_info",
  "source_note",
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

function prepareStoneRowForInsert(
  row: Record<string, unknown>,
  targetTenantId: string,
): Record<string, unknown> | null {
  const stoneName = String(row.stone_name ?? row.name ?? "").trim();
  if (!stoneName) {
    console.warn(
      "[veri-paylasimi] stones atlandı: stone_name/name yok",
      row.id ?? "(id yok)",
    );
    return null;
  }

  const copy: Record<string, unknown> = {
    tenant_id: targetTenantId,
    stone_name: stoneName,
  };

  for (const key of STONE_COPY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      copy[key] = row[key];
    }
  }

  if (copy.images == null) copy.images = [];
  if (copy.assignments == null) copy.assignments = {};
  if (copy.warning_tags == null) copy.warning_tags = [];

  return copy;
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

/** Yalnızca INSERT — batch, replace/update yok */
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
 * Doğaltaş — minerals/combinations ile aynı akış: SELECT → prepare → batch INSERT.
 * Tablo adı: public.stones
 */
async function copyStonesTableToTenant(
  sourceAdminTenantId: string,
  targetUserTenantId: string,
): Promise<{ count: number; readCount: number; error?: string }> {
  const { data: sourceRows, error: readError } = await supabase
    .from("stones")
    .select("*")
    .eq("tenant_id", sourceAdminTenantId);

  if (readError) {
    console.error("[veri-paylasimi] tablo=stones okuma hata:", readError.message);
    return { count: 0, readCount: 0, error: readError.message };
  }

  const rows = (sourceRows ?? []) as Record<string, unknown>[];
  const readCount = rows.length;

  console.log(
    `[veri-paylasimi] tablo=stones kaynak=${sourceAdminTenantId} hedef=${targetUserTenantId} okunan=${readCount}`,
  );

  if (readCount === 0) {
    return { count: 0, readCount: 0 };
  }

  const payloads = rows
    .map((row) => prepareStoneRowForInsert(row, targetUserTenantId))
    .filter((row): row is Record<string, unknown> => row !== null);

  console.log(
    `[veri-paylasimi] tablo=stones insert öncesi data.length=${payloads.length} okunan=${readCount}`,
    payloads[0]
      ? {
          stone_name: payloads[0].stone_name,
          tenant_id: payloads[0].tenant_id,
          alanlar: Object.keys(payloads[0]),
        }
      : null,
  );

  if (payloads.length === 0) {
    return {
      count: 0,
      readCount,
      error:
        "Doğaltaş: kaynakta kayıt var ancak stone_name/name dolu satır bulunamadı.",
    };
  }

  const { inserted, error: insertError } = await insertRowsBatched("stones", payloads);

  console.log(
    `[veri-paylasimi] tablo=stones hedef=${targetUserTenantId} insert sonrası eklenen=${inserted} okunan=${readCount} payloads=${payloads.length}${
      insertError ? ` hata=${insertError}` : ""
    }`,
  );

  if (inserted === 0) {
    const detail = insertError ? ` ${insertError}` : "";
    return {
      count: 0,
      readCount,
      error: `Doğaltaş aktarımı başarısız (okunan ${readCount}, eklenen 0).${detail}`,
    };
  }

  if (inserted < payloads.length) {
    return {
      count: inserted,
      readCount,
      error: `Doğaltaş: ${payloads.length} hazır, ${inserted} eklendi.`,
    };
  }

  return { count: inserted, readCount };
}

export async function copyLibraryTableToTenant(
  table: TransferTableName,
  sourceAdminTenantId: string,
  targetUserTenantId: string,
): Promise<{ count: number; error?: string }> {
  console.log(
    `[veri-paylasimi] tablo=${table} kaynak=${sourceAdminTenantId} hedef=${targetUserTenantId} işlem=SELECT+INSERT`,
  );

  if (table === "stones") {
    const stonesResult = await copyStonesTableToTenant(
      sourceAdminTenantId,
      targetUserTenantId,
    );
    return {
      count: stonesResult.count,
      error: stonesResult.error,
    };
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("tenant_id", sourceAdminTenantId);

  if (error) {
    console.error(
      `[veri-paylasimi] tablo=${table} okuma hata:`,
      error.message,
    );
    return { count: 0, error: error.message };
  }

  const sourceRows = (data ?? []) as Record<string, unknown>[];
  const readCount = sourceRows.length;

  console.log(
    `[veri-paylasimi] tablo=${table} kaynak=${sourceAdminTenantId} okunan=${readCount}`,
  );

  if (readCount === 0) {
    return { count: 0 };
  }

  const payloads = sourceRows.map((row) =>
    prepareRowForInsert(row, targetUserTenantId),
  );

  const { inserted, error: insertError } = await insertRowsBatched(table, payloads);

  console.log(
    `[veri-paylasimi] tablo=${table} hedef=${targetUserTenantId} okunan=${readCount} eklenen=${inserted}${
      insertError ? ` hata=${insertError}` : ""
    }`,
  );

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

  const sourceAdminTenantId = sourceResolved.tenantId;
  const targetUserTenantId = target;

  console.log("[veri-paylasimi] AKTARIM BAŞLANGIÇ", {
    kaynakTenant: sourceAdminTenantId,
    hedefTenant: targetUserTenantId,
    gruplar: uniqueGroups,
  });

  if (targetUserTenantId === sourceAdminTenantId) {
    console.warn(
      "[veri-paylasimi] AKTARIM İPTAL: kaynak ve hedef tenant aynı",
      sourceAdminTenantId,
    );
    return {
      counts: emptyTransferCounts(),
      error: "Kaynak ve hedef tenant aynı; aktarım yalnızca seçili üyeye yapılmalı.",
    };
  }

  const counts = emptyTransferCounts();

  for (const group of uniqueGroups) {
    const { count, error } = await copyLibraryTableToTenant(
      group,
      sourceAdminTenantId,
      targetUserTenantId,
    );
    counts[group] = count;
    if (error) {
      console.error("[veri-paylasimi] AKTARIM HATA", {
        tablo: group,
        kaynakTenant: sourceAdminTenantId,
        hedefTenant: targetUserTenantId,
        eklenen: count,
        hata: error,
      });
      return { counts, error };
    }
  }

  const totalInserted = sumSelectedCounts(counts, uniqueGroups);

  console.log("[veri-paylasimi] AKTARIM BİTİŞ", {
    kaynakTenant: sourceAdminTenantId,
    hedefTenant: targetUserTenantId,
    sayimlar: counts,
    toplamEklenen: totalInserted,
  });

  if (totalInserted === 0) {
    return {
      counts,
      error: EMPTY_SOURCE_ADMIN_MESSAGE,
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

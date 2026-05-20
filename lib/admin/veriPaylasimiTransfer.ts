import { supabase } from "@/lib/supabase";

export const ADMIN_SOURCE_TENANT_ID = "11111111-1111-1111-1111-111111111111";

export const TRANSFER_BATCH_SIZE = 100;

export type TransferTableName = "stones" | "minerals" | "combinations";

export type TransferGroupKey = "stones" | "minerals" | "combinations";

export type TransferResultCounts = {
  stones: number;
  minerals: number;
  combinations: number;
};

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

export async function copyLibraryTableToTenant(
  table: TransferTableName,
  sourceTenantId: string,
  targetTenantId: string,
): Promise<{ count: number; error?: string }> {
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
  const counts: TransferResultCounts = {
    stones: 0,
    minerals: 0,
    combinations: 0,
  };

  for (const group of groups) {
    const table: TransferTableName = group;
    const { count, error } = await copyLibraryTableToTenant(
      table,
      sourceTenantId,
      targetTenantId,
    );
    counts[group] = count;
    if (error) {
      return { counts, error };
    }
  }

  return { counts };
}

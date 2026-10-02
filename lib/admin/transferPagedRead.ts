/**
 * BIO-01 — Veri Aktarım Merkezi: relational child satırlarını EKSİKSİZ okur.
 *
 * Önceden child'lar tek limitsiz `.in(childFk, parentIds)` sorgusuyla okunuyordu;
 * PostgREST max-rows (1000) aşılınca SESSİZCE kesiliyor ve aktarım "başarılı" diyordu
 * (ör. 1.192 çakra bloğundan ~1000'i kopyalanıyordu). Şimdi parent id'ler URL-güvenli
 * parçalara bölünür, her parça deterministik sıralı + sayfalı + sayım-doğrulamalı okunur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllPaged, chunkIds } from "@/lib/db/readAllPaged";

export type ChildReadResult =
  | { ok: true; childrenByParent: Map<string, Record<string, unknown>[]>; missingTable: boolean }
  | { ok: false; error: unknown };

export async function readChildrenGrouped(
  db: SupabaseClient,
  childTable: string,
  childFk: string,
  parentIds: readonly string[],
  isMissingTableError: (err: unknown) => boolean,
  pageSize?: number,
): Promise<ChildReadResult> {
  const childrenByParent = new Map<string, Record<string, unknown>[]>();
  for (const part of chunkIds(parentIds, 100)) {
    const cr = await readAllPaged<Record<string, unknown>>(
      (from, to) =>
        db
          .from(childTable)
          .select("*", { count: "exact" })
          .in(childFk, part)
          .order(childFk, { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize },
    );
    if (cr.error) {
      if (isMissingTableError(cr.error)) return { ok: true, childrenByParent: new Map(), missingTable: true };
      return { ok: false, error: cr.error };
    }
    for (const c of cr.rows) {
      const pid = String(c[childFk] ?? "");
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(c);
      childrenByParent.set(pid, arr);
    }
  }
  return { ok: true, childrenByParent, missingTable: false };
}

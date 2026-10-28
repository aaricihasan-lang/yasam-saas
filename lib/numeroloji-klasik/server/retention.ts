/**
 * Klasik Numeroloji — kişisel veri SAKLAMA temizliği (YALNIZ SUNUCU, service-role; TÜM tenant'lar).
 *
 * purgeClassicPersonalData(db, { now, softDeletedGraceDays = 30 }):
 *   1) numerology_classic_response_cache: süresi geçmiş satırlar (expires_at ≤ now; expires_at'sız eski satırda
 *      created_at + TTL ≤ now) KALICI silinir.
 *   2) numerology_comparative_notes: grace günden ÖNCE yumuşak silinmiş notlar KALICI silinir.
 *   3) numerology_classic_analyses: grace günden ÖNCE yumuşak silinmiş analizler KALICI silinir. Önce bu analizlere
 *      bağlı (silinmemiş) notların anlık görüntüsünden klasik taraf çıkarılır (classicDeleted işareti); FK
 *      ON DELETE SET NULL ardından classic_analysis_id'yi boşaltır. Not gövdesi + mevcut (legacy) taraf korunur.
 *
 * ZAMANLAMA YOK: cron / Inngest bağlantısı owner kararıdır (docs/numeroloji-klasik/SAKLAMA.md).
 * Hata → { ok:false, step } (kısmi ilerleme sayıları korunur; tekrar çalıştırmak güvenlidir — idempotent).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIC_CACHE_TTL_MAX_DAYS, CLASSIC_CACHE_TTL_MIN_DAYS, readCacheTtlDays } from "./cache";
import { stripClassicFromSnapshot } from "./compareService";

assertServerOnly("lib/numeroloji-klasik/server/retention");

const CACHE = "numerology_classic_response_cache";
const ANALYSES = "numerology_classic_analyses";
const NOTES = "numerology_comparative_notes";
const DAY_MS = 24 * 60 * 60 * 1000;
const ID_BATCH = 200;

export const CLASSIC_SOFT_DELETE_GRACE_DEFAULT_DAYS = 30;

export type PurgeCounts = { cacheDeleted: number; notesDeleted: number; notesScrubbed: number; analysesDeleted: number };
export type PurgeResult = ({ ok: true } & PurgeCounts) | ({ ok: false; step: string } & PurgeCounts);

export async function purgeClassicPersonalData(
  db: SupabaseClient,
  opts: { now: Date; softDeletedGraceDays?: number; cacheTtlDays?: number },
): Promise<PurgeResult> {
  const counts: PurgeCounts = { cacheDeleted: 0, notesDeleted: 0, notesScrubbed: 0, analysesDeleted: 0 };
  const grace = opts.softDeletedGraceDays ?? CLASSIC_SOFT_DELETE_GRACE_DEFAULT_DAYS;
  if (!Number.isInteger(grace) || grace < 0 || grace > 3650) return { ok: false, step: "invalid_grace", ...counts };
  const ttl = opts.cacheTtlDays ?? readCacheTtlDays();
  if (!Number.isInteger(ttl) || ttl < CLASSIC_CACHE_TTL_MIN_DAYS || ttl > CLASSIC_CACHE_TTL_MAX_DAYS) return { ok: false, step: "invalid_ttl", ...counts };
  const nowIso = opts.now.toISOString();
  const cutoffIso = new Date(opts.now.getTime() - grace * DAY_MS).toISOString();
  const legacyCacheCutoffIso = new Date(opts.now.getTime() - ttl * DAY_MS).toISOString();

  // 1) Önbellek
  {
    const { data, error } = await db.from(CACHE).delete().lte("expires_at", nowIso).select("cache_key");
    if (error) return { ok: false, step: "cache_expired", ...counts };
    counts.cacheDeleted += Array.isArray(data) ? data.length : 0;
    const old = await db.from(CACHE).delete().is("expires_at", null).lte("created_at", legacyCacheCutoffIso).select("cache_key");
    if (old.error) return { ok: false, step: "cache_legacy", ...counts };
    counts.cacheDeleted += Array.isArray(old.data) ? old.data.length : 0;
  }

  // 2) Yumuşak silinmiş notlar (grace geçmiş)
  {
    const { data, error } = await db.from(NOTES).delete().lte("deleted_at", cutoffIso).select("id");
    if (error) return { ok: false, step: "notes", ...counts };
    counts.notesDeleted += Array.isArray(data) ? data.length : 0;
  }

  // 3) Yumuşak silinmiş analizler (grace geçmiş): önce bağlı notlardan klasik tarafı çıkar, sonra kalıcı sil.
  {
    const { data, error } = await db.from(ANALYSES).select("id").lte("deleted_at", cutoffIso);
    if (error || !Array.isArray(data)) return { ok: false, step: "analyses_select", ...counts };
    const ids = (data as { id: unknown }[]).map((r) => String(r.id));
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const batch = ids.slice(i, i + ID_BATCH);
      const notes = await db.from(NOTES).select("id, tenant_id, snapshot").in("classic_analysis_id", batch);
      if (notes.error || !Array.isArray(notes.data)) return { ok: false, step: "notes_scrub_select", ...counts };
      for (const n of notes.data as { id: string; tenant_id: string; snapshot: unknown }[]) {
        const up = await db.from(NOTES).update({ snapshot: stripClassicFromSnapshot(n.snapshot) }).eq("tenant_id", n.tenant_id).eq("id", n.id);
        if (up.error) return { ok: false, step: "notes_scrub", ...counts };
        counts.notesScrubbed++;
      }
      const del = await db.from(ANALYSES).delete().in("id", batch).lte("deleted_at", cutoffIso).select("id");
      if (del.error) return { ok: false, step: "analyses_delete", ...counts };
      counts.analysesDeleted += Array.isArray(del.data) ? del.data.length : 0;
    }
  }
  return { ok: true, ...counts };
}

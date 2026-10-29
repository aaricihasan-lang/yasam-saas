/**
 * Klasik Numeroloji — kişisel veri SAKLAMA temizliği (YALNIZ SUNUCU, service-role).
 *
 * purgeClassicPersonalData(db, { now, softDeletedGraceDays = 30, cacheTtlDays?, dryRun?, tenantId?, actor? }):
 *   1) numerology_classic_response_cache: süresi geçmiş satırlar (expires_at ≤ now; expires_at'sız eski satırda
 *      created_at + TTL ≤ now) KALICI silinir. (Önbellek türetilmiş veridir; kullanıcı kaydı DEĞİLDİR.)
 *   2) numerology_comparative_notes: grace günden ÖNCE yumuşak silinmiş notlar KALICI silinir.
 *   3) numerology_classic_analyses: grace günden ÖNCE yumuşak silinmiş analizler KALICI silinir. Önce bu analizlere
 *      bağlı (silinmemiş) notların anlık görüntüsünden klasik taraf çıkarılır (classicDeleted işareti); FK
 *      ON DELETE SET NULL ardından classic_analysis_id'yi boşaltır. Not gövdesi + mevcut (legacy) taraf korunur.
 *
 * KORUNANLAR (NK-R5): uzmanın kaydettiği AKTİF (deleted_at IS NULL) analiz ve notlar YAŞINA BAKILMAKSIZIN asla
 * silinmez — süre dolması yalnız önbellek içindir. Sağlayıcı çağrı defteri (provider_calls) bu fonksiyonda
 * DEĞİŞMEZ (saklama süresi owner kararı; docs/numeroloji-klasik/SAKLAMA.md).
 *
 * GERİ İZLENEBİLİRLİK: her çalıştırma (kuru çalıştırma dahil) silmeden ÖNCE `numerology_classic_purge_log`'a yazılır;
 * kayıt yazılamazsa HİÇBİR ŞEY SİLİNMEZ (fail-closed). Bitişte sayılar, tenant bazında sayılar ve silinen satır
 * kimlikleri (kişisel veri değil) aynı kayda işlenir.
 * dryRun=true → yalnız aday sayıları/kimlikleri raporlanır, hiçbir satır silinmez/değişmez.
 * tenantId → yalnız o tenant'ın satırları (diğer tenant'lar hiç okunmaz/silinmez).
 *
 * ZAMANLAMA YOK: cron / Inngest bağlantısı owner kararıdır. Hata → { ok:false, step } (idempotent; tekrar güvenli).
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
const LOG = "numerology_classic_purge_log";
const DAY_MS = 24 * 60 * 60 * 1000;
const ID_BATCH = 200;
/** Denetim kaydına yazılan kimlik listesi üst sınırı (tablo başına). */
const LOG_ID_CAP = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_RE = /^[a-z0-9_:.-]{1,80}$/;

export const CLASSIC_SOFT_DELETE_GRACE_DEFAULT_DAYS = 30;

export type PurgeCounts = { cacheDeleted: number; notesDeleted: number; notesScrubbed: number; analysesDeleted: number };
export type PurgeOptions = {
  now: Date;
  softDeletedGraceDays?: number;
  cacheTtlDays?: number;
  /** true → yalnız rapor (silme/değiştirme YOK). */
  dryRun?: boolean;
  /** Verilirse yalnız bu tenant. */
  tenantId?: string;
  /** Denetim kaydındaki çalıştıran (ör. "owner:manual", "test"); varsayılan "system". */
  actor?: string;
};
type Extra = { logId: string | null; dryRun: boolean; byTenant: Record<string, PurgeCounts> };
export type PurgeResult = ({ ok: true } & PurgeCounts & Extra) | ({ ok: false; step: string } & PurgeCounts & Extra);

const zero = (): PurgeCounts => ({ cacheDeleted: 0, notesDeleted: 0, notesScrubbed: 0, analysesDeleted: 0 });

export async function purgeClassicPersonalData(db: SupabaseClient, opts: PurgeOptions): Promise<PurgeResult> {
  const counts = zero();
  const byTenant: Record<string, PurgeCounts> = {};
  const dryRun = opts.dryRun === true;
  const extra = (logId: string | null): Extra => ({ logId, dryRun, byTenant });
  const bump = (tenant: unknown, k: keyof PurgeCounts, n = 1) => {
    counts[k] += n;
    const t = typeof tenant === "string" ? tenant : "?";
    (byTenant[t] ??= zero())[k] += n;
  };

  const grace = opts.softDeletedGraceDays ?? CLASSIC_SOFT_DELETE_GRACE_DEFAULT_DAYS;
  if (!Number.isInteger(grace) || grace < 0 || grace > 3650) return { ok: false, step: "invalid_grace", ...counts, ...extra(null) };
  const ttl = opts.cacheTtlDays ?? readCacheTtlDays();
  if (!Number.isInteger(ttl) || ttl < CLASSIC_CACHE_TTL_MIN_DAYS || ttl > CLASSIC_CACHE_TTL_MAX_DAYS) return { ok: false, step: "invalid_ttl", ...counts, ...extra(null) };
  if (opts.tenantId !== undefined && !UUID_RE.test(opts.tenantId)) return { ok: false, step: "invalid_tenant", ...counts, ...extra(null) };
  const actor = opts.actor ?? "system";
  if (!ACTOR_RE.test(actor)) return { ok: false, step: "invalid_actor", ...counts, ...extra(null) };
  const tenant = opts.tenantId?.toLowerCase() ?? null;

  const nowIso = opts.now.toISOString();
  const cutoffIso = new Date(opts.now.getTime() - grace * DAY_MS).toISOString();
  const legacyCacheCutoffIso = new Date(opts.now.getTime() - ttl * DAY_MS).toISOString();

  // 0) Denetim kaydı — silmeden ÖNCE; yazılamazsa hiçbir şey silinmez.
  const started = await db
    .from(LOG)
    .insert({ actor, dry_run: dryRun, tenant_scope: tenant, params: { graceDays: grace, cacheTtlDays: ttl, now: nowIso }, step: "started" })
    .select("id")
    .single();
  if (started.error || !started.data) return { ok: false, step: "audit_log", ...counts, ...extra(null) };
  const logId = String((started.data as { id: unknown }).id);
  const ids = { cache: [] as string[], notes: [] as string[], analyses: [] as string[] };
  const keep = (arr: string[], v: unknown) => {
    if (arr.length < LOG_ID_CAP) arr.push(String(v));
  };
  // Tenant kapsamı (verildiyse) — her sorguya tenant_id eşitliği eklenir.
  const scoped = <Q,>(q: Q): Q => (tenant ? (q as unknown as { eq: (c: string, v: string) => Q }).eq("tenant_id", tenant) : q);

  const finish = async (ok: boolean, step: string): Promise<PurgeResult> => {
    const upd = await db
      .from(LOG)
      .update({ finished_at: new Date().toISOString(), ok, step, counts, by_tenant: byTenant, deleted_ids: dryRun ? { candidates: ids } : ids })
      .eq("id", logId);
    if (ok && upd.error) return { ok: false, step: "audit_log_finish", ...counts, ...extra(logId) };
    return ok ? { ok: true, ...counts, ...extra(logId) } : { ok: false, step, ...counts, ...extra(logId) };
  };

  // 1) Önbellek (süresi geçmiş)
  for (const [col, cmp, val] of [["expires_at", "lte", nowIso], ["created_at", "lte_null_exp", legacyCacheCutoffIso]] as const) {
    if (dryRun) {
      let q = db.from(CACHE).select("cache_key, tenant_id");
      q = cmp === "lte" ? q.lte(col, val) : q.is("expires_at", null).lte(col, val);
      const { data, error } = await scoped(q);
      if (error) return finish(false, "cache_select");
      for (const r of (data ?? []) as { cache_key: string; tenant_id: string }[]) { bump(r.tenant_id, "cacheDeleted"); keep(ids.cache, r.cache_key); }
    } else {
      let q = db.from(CACHE).delete();
      q = cmp === "lte" ? q.lte(col, val) : q.is("expires_at", null).lte(col, val);
      const { data, error } = await scoped(q).select("cache_key, tenant_id");
      if (error) return finish(false, cmp === "lte" ? "cache_expired" : "cache_legacy");
      for (const r of (data ?? []) as { cache_key: string; tenant_id: string }[]) { bump(r.tenant_id, "cacheDeleted"); keep(ids.cache, r.cache_key); }
    }
  }

  // 2) Yumuşak silinmiş notlar (grace geçmiş)
  {
    const { data, error } = dryRun
      ? await scoped(db.from(NOTES).select("id, tenant_id").lte("deleted_at", cutoffIso))
      : await scoped(db.from(NOTES).delete().lte("deleted_at", cutoffIso)).select("id, tenant_id");
    if (error) return finish(false, "notes");
    for (const r of (data ?? []) as { id: string; tenant_id: string }[]) { bump(r.tenant_id, "notesDeleted"); keep(ids.notes, r.id); }
  }

  // 3) Yumuşak silinmiş analizler (grace geçmiş): önce bağlı notlardan klasik tarafı çıkar, sonra kalıcı sil.
  {
    const { data, error } = await scoped(db.from(ANALYSES).select("id, tenant_id").lte("deleted_at", cutoffIso));
    if (error || !Array.isArray(data)) return finish(false, "analyses_select");
    const rows = data as { id: string; tenant_id: string }[];
    for (let i = 0; i < rows.length; i += ID_BATCH) {
      const batch = rows.slice(i, i + ID_BATCH);
      const batchIds = batch.map((r) => r.id);
      const notes = await scoped(db.from(NOTES).select("id, tenant_id, snapshot").in("classic_analysis_id", batchIds));
      if (notes.error || !Array.isArray(notes.data)) return finish(false, "notes_scrub_select");
      for (const n of notes.data as { id: string; tenant_id: string; snapshot: unknown }[]) {
        if (!dryRun) {
          const up = await db.from(NOTES).update({ snapshot: stripClassicFromSnapshot(n.snapshot) }).eq("tenant_id", n.tenant_id).eq("id", n.id);
          if (up.error) return finish(false, "notes_scrub");
        }
        bump(n.tenant_id, "notesScrubbed");
      }
      if (dryRun) {
        for (const r of batch) { bump(r.tenant_id, "analysesDeleted"); keep(ids.analyses, r.id); }
        continue;
      }
      const del = await scoped(db.from(ANALYSES).delete().in("id", batchIds).lte("deleted_at", cutoffIso)).select("id, tenant_id");
      if (del.error) return finish(false, "analyses_delete");
      for (const r of (del.data ?? []) as { id: string; tenant_id: string }[]) { bump(r.tenant_id, "analysesDeleted"); keep(ids.analyses, r.id); }
    }
  }
  return finish(true, dryRun ? "dry_run_done" : "done");
}

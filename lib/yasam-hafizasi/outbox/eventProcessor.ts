/**
 * Yaşam Hafızası™ — Outbox Event Processor (BF-11B, saf-yakın; DI).
 * ====================================================================
 *
 * Tek bir claimed outbox olayını doğrular, kaynak registry'sini çözer, v1 kapsam
 * kapılarını fail-closed uygular ve upsert/delete akışını yürütür. Çıktı yalnız bir
 * DIREKTIF'tir: worker bunu BF-11A complete/fail RPC'sine çevirir.
 *
 * SINIR — bu dosyada BULUNMAZ:
 *   Inngest / getServerDb / Supabase singleton / process.env / fetch / IO / HTTP.
 *   Kaynak okuma, index write ve deindex ENJEKTE edilir (`EventProcessorDeps`).
 *
 * KANONİK KURALLAR:
 *   - Retry/backoff/dead HESAPLANMAZ. Processor yalnız `permanent | transient`
 *     sınıfını verir; attempts/backoff/dead BF-11A RPC'lerinindir.
 *   - Kalıcı hata → worker fail(maxAttempts=1); geçici hata → worker fail(maxAttempts=8).
 *   - Ham source row / içerik / DB mesajı ÜRETİLMEZ (yalnız güvenli sabit kod).
 *   - `ExactWriteStatus` ve `DeindexStatus` üzerinde exhaustive switch + `never`.
 *   - v1 kapsamı (BF-11A tenant-scoped): column-mode + non-shared + record + safe-non-pii + enabled.
 */

import { OUTBOX_OPERATIONS } from "./outboxState";
import type { ClaimedOutboxEvent } from "./outboxRpcClient";
import { isIndexableSource } from "../indexer/sourceGuard";
import type { SourceConfig } from "../indexer/sources";
import type { ExactWriteStatus, IndexSourcePageResult } from "../indexer/indexSourcePage";
import type { DeindexInput, DeindexResult } from "../indexer/supabaseIndexAdapters";

// ─── UUID doğrulaması (coercion YOK) ──────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ─── Direktif (worker bunu complete/fail RPC'sine çevirir) ───────────────────
export type RetryClass = "permanent" | "transient";
export type ProcessDirective =
  | { readonly action: "complete"; readonly note: string }
  | { readonly action: "fail"; readonly retryClass: RetryClass; readonly code: string };

const complete = (note: string): ProcessDirective => ({ action: "complete", note });
const permanent = (code: string): ProcessDirective => ({ action: "fail", retryClass: "permanent", code });
const transient = (code: string): ProcessDirective => ({ action: "fail", retryClass: "transient", code });

// ─── Enjekte bağımlılıklar (test edilebilirlik) ──────────────────────────────
export interface RunExactUpsertInput {
  readonly config: SourceConfig;
  readonly exactSourceId: string;
  readonly expectedTenantId: string;
}
export interface EventProcessorDeps {
  /** Statik registry çözümü (resolveYhSourceConfig). */
  readonly resolveConfig: (sourceKey: string) => SourceConfig | null;
  /** Mevcut exact-record index write zinciri (indexSourcePage exact-mode, write). */
  readonly runExactUpsert: (input: RunExactUpsertInput) => Promise<IndexSourcePageResult>;
  /** Tenant-scoped fiziksel deindex. */
  readonly deindex: (input: DeindexInput) => Promise<DeindexResult>;
  /**
   * BF-11E RUNTIME ACTIVATION GATE (server enjekte eder). Bir sourceKey'in olay işlemesinin
   * aktif olup olmadığını döndürür (activationRuntimeGate.isSourceProcessingActive). CONTROLLED
   * kaynak registry enabled:true olsa dahi DB is_active=true değilse false döner; grandfathered
   * CANLI kaynaklar için true. Enjekte EDİLMEZSE (harness/geriye-uyum) gate atlanır (mevcut
   * davranış). Production worker DAİMA enjekte eder.
   */
  readonly isSourceProcessingActive?: (sourceKey: string) => Promise<boolean>;
}

// ─── Ana işleyici ─────────────────────────────────────────────────────────────
export async function processOutboxEvent(
  event: ClaimedOutboxEvent,
  deps: EventProcessorDeps,
): Promise<ProcessDirective> {
  // Kapı 1: operation geçerli mi? (DI/harness bozuk değer geçebilir → defense)
  if (!(OUTBOX_OPERATIONS as readonly string[]).includes(event.operation)) {
    return permanent("invalid-operation");
  }
  // Kapı 2: source_key registry'de mi?
  const config = deps.resolveConfig(event.sourceKey);
  if (config === null) return permanent("unknown-source");
  // Kapı 3: event.source_table === registry config.tableName?
  if (event.sourceTable !== config.tableName) return permanent("source-table-mismatch");
  // Kapı 4: safe-non-pii + enabled?
  if (!isIndexableSource(config)) return permanent("source-not-indexable");
  // Kapı 4b (BF-11E RUNTIME ACTIVATION GATE): CONTROLLED kaynak enabled:true olsa dahi DB
  // is_active=true değilse index YAZILMAZ (CODE MERGED ≠ SOURCE ACTIVATED). Grandfathered CANLI
  // kaynaklar için gate true (davranış değişmez). Dep enjekte edilmemişse (harness) atlanır.
  if (deps.isSourceProcessingActive !== undefined) {
    let active: boolean;
    try {
      active = await deps.isSourceProcessingActive(event.sourceKey);
    } catch {
      // Activation durumu okunamadı → GEÇİCİ (DB backoff); sessiz "aktif" varsayımı YOK (fail-closed).
      return transient("activation-check-error");
    }
    if (!active) {
      // CONTROLLED inactive / kill-switch: index YAZILMAZ, deindex YAPILMAZ (index korunur),
      // olay kuyruktan düşürülür (dead-letter biriktirilmez).
      return complete("inactive-source-noop");
    }
  }
  // Kapı 5: tenant modeli column VEYA join mı? (BF-11E Belge/Video join+row desteği;
  //   global-canonical HENÜZ desteklenmez → fail-closed).
  if (config.tenant.mode !== "column" && config.tenant.mode !== "join") {
    return permanent("tenant-model-unsupported");
  }
  // Kapı 6: shared (allowSharedNull) davranışı kapalı mı? (shared kaynak fail-closed)
  if (config.tenant.allowSharedNull === true) return permanent("shared-source-unsupported");
  // Kapı 7: unit record VEYA row mı? (section HENÜZ desteklenmez → fail-closed)
  if (config.unit !== "record" && config.unit !== "row") {
    return permanent("non-record-unit-unsupported");
  }
  // Kapı 8: tenant_id + source_id geçerli UUID mi?
  if (!isUuid(event.tenantId) || !isUuid(event.sourceId)) {
    return permanent("invalid-event-contract");
  }

  if (event.operation === "delete") {
    return handleDelete(event, config, deps);
  }
  return handleUpsert(event, config, deps);
}

// ─── UPSERT akışı ─────────────────────────────────────────────────────────────
async function handleUpsert(
  event: ClaimedOutboxEvent,
  config: SourceConfig,
  deps: EventProcessorDeps,
): Promise<ProcessDirective> {
  let result: IndexSourcePageResult;
  try {
    result = await deps.runExactUpsert({
      config,
      exactSourceId: event.sourceId,
      expectedTenantId: event.tenantId,
    });
  } catch {
    // Kaynak okuma / index IO fatal propagate → geçici (DB backoff).
    return transient("index-io-error");
  }

  if (result.exactStatus === null) {
    // Exact mod bekleniyordu; null yalnız broad modda olur → sözleşme ihlali.
    return permanent("exact-mode-missing");
  }

  const status: ExactWriteStatus = result.exactStatus;
  switch (status) {
    case "ok": {
      // Writer çağrıldı; chunk hataları yazma sonucunda taşınır → geçici.
      if (result.write !== null && result.write.errors.length > 0) {
        return transient("index-write-error");
      }
      return complete("upsert-ok");
    }
    // Kaynak yok / indekslenebilir içerik yok / demo / sentetik / BF-11E row-gate ineligible →
    // DEFENSIVE DEINDEX + COMPLETE (dead-letter'ı doldurma; index'i tutarlı bırak). "row-ineligible"
    // = classification safe→unsafe/unclassified/missing veya content edit sonrası stale hash →
    // eski index STALE ise tombstone (var olan güvensiz kaydı bırakmaz).
    case "not-found":
    case "skipped-build":
    case "excluded-demo":
    case "excluded-synthetic":
    case "row-ineligible":
      return defensiveDeindex(event, config, deps, status);
    // v1 gate column+non-shared garanti eder; shared burada imkânsız → fail-closed.
    case "excluded-shared":
      return permanent("unexpected-shared");
    case "source-id-mismatch":
      return permanent("source-id-mismatch");
    case "tenant-mismatch":
      return permanent("tenant-mismatch");
    case "multiple-rows":
      return permanent("multiple-rows");
    case "tenant-model-unsupported":
      return permanent("tenant-model-unsupported");
    default: {
      const _exhaustive: never = status;
      return permanent(`unknown-exact-status:${String(_exhaustive)}`);
    }
  }
}

// ─── Defensive deindex → complete (upsert not-found/skipped/excluded) ─────────
async function defensiveDeindex(
  event: ClaimedOutboxEvent,
  config: SourceConfig,
  deps: EventProcessorDeps,
  reason: string,
): Promise<ProcessDirective> {
  let d: DeindexResult;
  try {
    d = await deps.deindex({ config, sourceId: event.sourceId, tenantId: event.tenantId });
  } catch {
    return transient("deindex-io-error");
  }
  switch (d.status) {
    case "ok":
    case "no-op":
      return complete(`defensive-deindex:${reason}`);
    case "multi-row-anomaly":
      return permanent("deindex-multi-row");
    case "delete-failed":
      return transient("deindex-db-error");
    case "tenant-model-unsupported":
      return permanent("deindex-tenant-model");
    default: {
      const _exhaustive: never = d.status;
      return permanent(`deindex-unknown:${String(_exhaustive)}`);
    }
  }
}

// ─── DELETE akışı ─────────────────────────────────────────────────────────────
async function handleDelete(
  event: ClaimedOutboxEvent,
  config: SourceConfig,
  deps: EventProcessorDeps,
): Promise<ProcessDirective> {
  let d: DeindexResult;
  try {
    d = await deps.deindex({ config, sourceId: event.sourceId, tenantId: event.tenantId });
  } catch {
    return transient("deindex-io-error");
  }
  switch (d.status) {
    case "ok":
      return complete("delete-one");
    case "no-op":
      return complete("delete-none");
    case "multi-row-anomaly":
      return permanent("deindex-multi-row");
    case "delete-failed":
      return transient("deindex-db-error");
    case "tenant-model-unsupported":
      return permanent("deindex-tenant-model");
    default: {
      const _exhaustive: never = d.status;
      return permanent(`deindex-unknown:${String(_exhaustive)}`);
    }
  }
}

// ─── Batch orkestratörü (saf; server-only DEĞİL → harness ile test edilebilir) ─
//
// Server-only worker transport'u yalnız gerçek RPC/DB geri çağrılarını (sweep/claim/
// complete/fail) ve `EventProcessorDeps`'i enjekte eder; retry/dead haritalaması
// (permanent → maxAttempts=1, transient → transientMaxAttempts) BURADA yapılır ki
// SQL retry otoritesi tek kalır ve akış deterministik biçimde doğrulanabilir.
//
// KURALLAR:
//   - SWEEP önce, CLAIM sonra; boş claim → loop atlanır (erken no-op).
//   - SERİ işleme; bir olayın complete/fail transport hatası SONRAKİ olayı DURDURMAZ
//     (olay processing'de kalır → lease sweep kurtarır).
//   - `requeued_newer_event` normal concurrency sonucudur (ayrı sayılır).

export type CompleteRpcResult = "succeeded" | "requeued_newer_event";
export type FailRpcResult = "retry_scheduled" | "dead" | "requeued_newer_event";

export interface OutboxBatchDeps extends EventProcessorDeps {
  readonly worker: string;
  readonly claimBatch: number;
  readonly leaseSeconds: number;
  readonly permanentMaxAttempts: number;
  readonly transientMaxAttempts: number;
  readonly baseDelaySeconds: number;
  readonly maxDelaySeconds: number;
  readonly sweep: (leaseSeconds: number, batch: number) => Promise<ReadonlyArray<unknown>>;
  readonly claim: (worker: string, batch: number) => Promise<readonly ClaimedOutboxEvent[]>;
  readonly complete: (id: string, worker: string, version: number) => Promise<CompleteRpcResult>;
  readonly fail: (
    id: string,
    worker: string,
    version: number,
    code: string,
    maxAttempts: number,
    baseDelay: number,
    maxDelay: number,
  ) => Promise<FailRpcResult>;
}

export interface OutboxBatchSummary {
  readonly swept: number;
  readonly claimed: number;
  readonly completed: number;
  readonly requeued: number;
  readonly failedPermanent: number;
  readonly failedTransient: number;
  readonly transportErrors: number;
}

export async function runOutboxBatch(deps: OutboxBatchDeps): Promise<OutboxBatchSummary> {
  const swept = await deps.sweep(deps.leaseSeconds, deps.claimBatch);
  const claimed = await deps.claim(deps.worker, deps.claimBatch);

  let completed = 0;
  let requeued = 0;
  let failedPermanent = 0;
  let failedTransient = 0;
  let transportErrors = 0;

  for (const ev of claimed) {
    // SERİ. İki AYRI hata sınırı (BF-11B-FIX1):
    //   (1) processor exception → GÜVENLİ transient fail directive (DB fail RPC yolu),
    //   (2) YALNIZ complete/fail RPC transport hatası → olay processing'de kalır → sweep.
    let directive: ProcessDirective;
    try {
      directive = await processOutboxEvent(ev, deps);
    } catch {
      // Beklenmeyen processor exception → dead-letter döngüsü YOK; normal transient
      // fail RPC yolundan geçir (attempts/backoff/dead kararını DB verir). Ham mesaj YOK.
      directive = { action: "fail", retryClass: "transient", code: "unexpected-processor-error" };
    }

    try {
      if (directive.action === "complete") {
        const r = await deps.complete(ev.id, deps.worker, ev.eventVersion);
        if (r === "requeued_newer_event") requeued += 1;
        else completed += 1;
      } else {
        const maxAttempts =
          directive.retryClass === "permanent"
            ? deps.permanentMaxAttempts
            : deps.transientMaxAttempts;
        const r = await deps.fail(
          ev.id,
          deps.worker,
          ev.eventVersion,
          directive.code,
          maxAttempts,
          deps.baseDelaySeconds,
          deps.maxDelaySeconds,
        );
        if (r === "requeued_newer_event") requeued += 1;
        else if (directive.retryClass === "permanent") failedPermanent += 1;
        else failedTransient += 1;
      }
    } catch {
      // YALNIZ complete/fail RPC transport hatası → olay processing'de kalır (lease
      // sweep kurtarır). İkinci bir fail denemesi YAPILMAZ. Sonraki olaya DEVAM. Ham hata YOK.
      transportErrors += 1;
    }
  }

  return {
    swept: swept.length,
    claimed: claimed.length,
    completed,
    requeued,
    failedPermanent,
    failedTransient,
    transportErrors,
  };
}

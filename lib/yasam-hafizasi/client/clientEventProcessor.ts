/**
 * PRIVATE MEMORY — Client Outbox Event Processor + Batch (saf-yakın; DI).
 * ====================================================================
 *
 * Tek bir claimed CLIENT outbox olayını doğrular, client kaynak registry'sini çözer,
 * fail-closed authorization/ownership kapılarını uygular ve upsert/deindex akışını
 * yürütür. Çıktı yalnız bir DIREKTIF'tir (professional eventProcessor ile AYNI
 * ProcessDirective türü + retry mapping): worker bunu client complete/fail RPC'sine çevirir.
 *
 * BAĞLAYICI (rule 14 / "professional worker davranışını bozma"):
 *   - Professional eventProcessor/index DEĞİŞMEZ; bu AYRI client yol.
 *   - Reliability modeli BF-11B ile birebir: pending/processing/succeeded/dead,
 *     lease/backoff/coalescing/requeue RPC'de; permanent→maxAttempts=1, transient→N.
 *   - ÇİFT KAPI: registry kapısı AÇIK (6 client kaynağı enabled:true) ama runtime yine de
 *     fail-closed çift kapılıdır — CURRENTLY ACTIVE (isSourceProcessingActive; DB
 *     yh_source_activation.is_active) VE worker env (YH_CLIENT_OUTBOX_WORKER_ENABLED). Kapı
 *     inactive dönerse index YAZILMAZ ve deindex YAPILMAZ; olay COMPLETE no-op ile kuyruktan
 *     düşürülür (dead-letter YOK). DB activation olmadan merge tek başına HİÇBİR şey indexlemez.
 *   - EVENT-TIME BOUNDARY (race hardening): index için İKİ kapı BİRLİKTE gerekir —
 *     CURRENTLY ACTIVE (isSourceProcessingActive) VE ENQUEUED WHILE ACTIVE
 *     (event.enqueuedActive; enqueue anındaki yh_source_activation.is_active damgası,
 *     migration 20261220000000). Aktivasyondan ÖNCE enqueue edilmiş olay worker sonradan
 *     işlese bile index üretmez: pre-activation UPSERT → no-op (deindex YOK), pre-activation
 *     DELETE → defensive deindex (ghost-free).
 *
 * PRIVATE MEMORY authorization (Politika Kilidi):
 *   - tenant_id + client_id ZORUNLU (UUID); demo tenant indexlenmez. Sentetik tenant da
 *     indexlenmez — TEK DAR istisna: ADMIN_LIBRARY kendi private-client memory'si (aşağıdaki
 *     isPrivateClientMemoryAllowedTenant; professional/shared/global yasağı gevşemez).
 *   - fetchSourceRow tenant+client ile SCOPED okur → kaynak artık tenant+client'a ait
 *     değilse (silinmiş/taşınmış) null → DEFENSIVE DEINDEX (ghost recreate YOK).
 *   - Builder yalnız allowlisted alanları kullanır (clientIndexUnit); doğrudan kimlik
 *     kolonları fetch edilmez → index'e SIZAMAZ. client name index'e yazılmaz.
 *   - UPDATE → aynı source identity upsert (onConflict source_table,source_id,section_ref)
 *     → duplicate 0. DELETE → tenant+client scoped deindex.
 */
import { OUTBOX_OPERATIONS } from "../outbox/outboxState";
import type { ProcessDirective } from "../outbox/eventProcessor";
import type { ClaimedClientOutboxEvent } from "../outbox/clientOutboxRpcClient";
import { isSyntheticTenantId, ADMIN_LIBRARY_TENANT_ID } from "../../tenancy/syntheticTenants";
import { buildClientIndexUnit, toClientIndexDbRow } from "./clientIndexUnit";
import type { ClientSourceConfig } from "./clientSources";

/** Demo tenant (client index'e ASLA girmez; RPC read tarafıyla hizalı). */
export const YH_CLIENT_DEMO_TENANT = "40f842a0-e3e8-448c-8971-9a938e1faccb";

/**
 * PRIVATE CLIENT MEMORY — DAR sentetik istisna (Politika Kilidi / Admin private-client fix).
 * ────────────────────────────────────────────────────────────────────────────
 * ÜRÜN KARARI: Admin (ADMIN_LIBRARY tenant) kendi danışan geçmişini Danışan Hafızası'nda
 * arayabilmelidir → yalnız PRIVATE CLIENT MEMORY yolunda, YALNIZ bu tenant için sentetik
 * yasağı gevşetilir. Bu istisna FİZİKSEL olarak client processor katmanına hapsedilmiştir:
 *   - `isSyntheticTenantId` DAVRANIŞI ve `SYNTHETIC_TENANT_IDS` listesi DEĞİŞMEZ.
 *   - Professional/main indexer (createSupabaseIndexWriter) sentetik yasağı AYNEN sürer
 *     (bu helper oraya import EDİLMEZ) → ADMIN_LIBRARY professional/shared/global index'e
 *     ASLA giremez.
 *   - Global/shared/canonical havuz YOKTUR; istisna yalnız client-scoped gerçek kaynak
 *     satırları (tenant+client ownership fetchSourceRow ile korunur) içindir.
 *   - DİĞER sentetik tenant'lar (listeye ileride eklenirse) exact-match olmadığı için
 *     BURADA da fail-closed dışlanır (future-safe).
 */
export const YH_CLIENT_PRIVATE_MEMORY_ALLOWED_SYNTHETIC_TENANT = ADMIN_LIBRARY_TENANT_ID;

/** Sentetik tenant PRIVATE CLIENT MEMORY index'ine alınabilir mi? (TEK istisna: ADMIN_LIBRARY, exact-match). */
export function isPrivateClientMemoryAllowedTenant(tenantId: string): boolean {
  return tenantId === YH_CLIENT_PRIVATE_MEMORY_ALLOWED_SYNTHETIC_TENANT;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

const complete = (note: string): ProcessDirective => ({ action: "complete", note });
const permanent = (code: string): ProcessDirective => ({ action: "fail", retryClass: "permanent", code });
const transient = (code: string): ProcessDirective => ({ action: "fail", retryClass: "transient", code });

// ─── Client deindex sonucu (supabaseIndexAdapters DeindexStatus alt kümesi) ───
export type ClientDeindexStatus = "ok" | "no-op" | "multi-row-anomaly" | "delete-failed";
export interface ClientDeindexResult {
  readonly status: ClientDeindexStatus;
}

// ─── Enjekte bağımlılıklar (test edilebilirlik) ──────────────────────────────
export interface ClientOwnershipKey {
  readonly config: ClientSourceConfig;
  readonly sourceId: string;
  readonly tenantId: string;
  readonly clientId: string;
}
export interface ClientEventProcessorDeps {
  /** Client registry çözümü (sourceKey → ClientSourceConfig | null). */
  readonly resolveConfig: (sourceKey: string) => ClientSourceConfig | null;
  /** tenant+client SCOPED kaynak satırı (yoksa null; IO hatası throw). Yalnız allowlist kolonları. */
  readonly fetchSourceRow: (key: ClientOwnershipKey) => Promise<Record<string, unknown> | null>;
  /** Client index upsert (onConflict source_table,source_id,section_ref → identity refresh). */
  readonly upsertUnit: (dbRow: Record<string, unknown>) => Promise<{ ok: boolean }>;
  /** tenant+client scoped fiziksel deindex. */
  readonly deindex: (key: ClientOwnershipKey) => Promise<ClientDeindexResult>;
  /** BF-11E RUNTIME ACTIVATION GATE (server enjekte eder). Enjekte edilmezse (harness) atlanır. */
  readonly isSourceProcessingActive?: (sourceKey: string) => Promise<boolean>;
}

// ─── Ana işleyici ─────────────────────────────────────────────────────────────
export async function processClientOutboxEvent(
  event: ClaimedClientOutboxEvent,
  deps: ClientEventProcessorDeps,
): Promise<ProcessDirective> {
  // Kapı 1: operation geçerli mi?
  if (!(OUTBOX_OPERATIONS as readonly string[]).includes(event.operation)) {
    return permanent("invalid-operation");
  }
  // Kapı 2: source_key client registry'de mi?
  const config = deps.resolveConfig(event.sourceKey);
  if (config === null) return permanent("unknown-source");
  // Kapı 3: event.source_table === config.tableName?
  if (event.sourceTable !== config.tableName) return permanent("source-table-mismatch");
  // Kapı 4: tenant_id + client_id + source_id geçerli UUID mi? (client bağlamı: client_id ZORUNLU)
  if (!isUuid(event.tenantId) || !isUuid(event.clientId) || !isUuid(event.sourceId)) {
    return permanent("invalid-event-contract");
  }
  // Kapı 5 (BF-11E RUNTIME ACTIVATION GATE — "CURRENTLY ACTIVE"): inactive → COMPLETE no-op
  //   (dormant drain; index YAZILMAZ, deindex YAPILMAZ). Kill-switch/deactivate bu kapıda durur.
  if (deps.isSourceProcessingActive !== undefined) {
    let active: boolean;
    try {
      active = await deps.isSourceProcessingActive(event.sourceKey);
    } catch {
      return transient("activation-check-error"); // fail-closed; sessiz aktif YOK
    }
    if (!active) return complete("inactive-source-noop");
  }
  // Kapı 5.5 (BF-11E EVENT-TIME BOUNDARY GATE — "ENQUEUED WHILE ACTIVE"): olay aktivasyon
  //   effective-time'ından ÖNCE enqueue/coalesce edildiyse (enqueued_active=false), worker
  //   sonradan (kaynak artık aktifken) işlese bile index üretilmez (FUTURE_ONLY_READY /
  //   production race hardening). İki kapı BİRLİKTE gerekir: CURRENTLY ACTIVE (Kapı 5) VE
  //   ENQUEUED WHILE ACTIVE (bu kapı). Coalescing-safe: aynı satır üzerine gelen post-activation
  //   GERÇEK event enqueued_active'i true'ya flip'ler → burada geçer.
  if (event.enqueuedActive !== true) {
    if (event.operation === "delete") {
      // Pre-activation DELETE: defensive deindex (ghost-free); ardından terminal succeeded.
      return defensiveDeindex(event, config, deps, "pre-activation-delete");
    }
    // Pre-activation UPSERT: index YAZMA, deindex YAPMA (eski/bayat upsert'in daha yeni ve
    //   geçerli bir index'i yanlışlıkla silmesini önle) → terminal no-op complete.
    return complete("pre-activation-upsert-noop");
  }
  // Kapı 6: demo tenant → ASLA indexlenmez (defensive deindex + complete).
  if (event.tenantId === YH_CLIENT_DEMO_TENANT) {
    return defensiveDeindex(event, config, deps, "excluded-demo");
  }
  // Kapı 6.5: sentetik tenant → ASLA indexlenmez — TEK DAR istisna: ADMIN_LIBRARY private-client
  //   memory (isPrivateClientMemoryAllowedTenant). Admin kendi danışan-scoped gerçek kaynaklarını
  //   normal tenant gibi indexler; ownership (tenant+client fetchSourceRow) AYNEN korunur.
  //   Diğer TÜM sentetik tenant'lar fail-closed dışlanır (professional/shared/global yasağı bu
  //   katmanda gevşetilmez; helper professional writer'a import edilmez).
  if (isSyntheticTenantId(event.tenantId) && !isPrivateClientMemoryAllowedTenant(event.tenantId)) {
    return defensiveDeindex(event, config, deps, "excluded-synthetic");
  }

  if (event.operation === "delete") {
    return handleDelete(event, config, deps);
  }
  return handleUpsert(event, config, deps);
}

async function handleUpsert(
  event: ClaimedClientOutboxEvent,
  config: ClientSourceConfig,
  deps: ClientEventProcessorDeps,
): Promise<ProcessDirective> {
  const key: ClientOwnershipKey = {
    config,
    sourceId: event.sourceId,
    tenantId: event.tenantId,
    clientId: event.clientId,
  };

  let row: Record<string, unknown> | null;
  try {
    row = await deps.fetchSourceRow(key);
  } catch {
    return transient("index-io-error");
  }
  // Kaynak artık tenant+client'a ait değil/silinmiş → GHOST recreate YOK; defensive deindex.
  if (row === null) return defensiveDeindex(event, config, deps, "not-found");

  const unit = buildClientIndexUnit(config, row, { tenantId: event.tenantId, clientId: event.clientId });
  // İndekslenebilir içerik yok (evidence gate) → defensive deindex (tutarlı index).
  if (unit === null) return defensiveDeindex(event, config, deps, "skipped-build");

  const dbRow = toClientIndexDbRow(unit);
  let res: { ok: boolean };
  try {
    res = await deps.upsertUnit(dbRow);
  } catch {
    return transient("index-io-error");
  }
  if (!res.ok) return transient("index-write-error");
  return complete("upsert-ok");
}

async function handleDelete(
  event: ClaimedClientOutboxEvent,
  config: ClientSourceConfig,
  deps: ClientEventProcessorDeps,
): Promise<ProcessDirective> {
  let d: ClientDeindexResult;
  try {
    d = await deps.deindex({ config, sourceId: event.sourceId, tenantId: event.tenantId, clientId: event.clientId });
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
    default: {
      const _exhaustive: never = d.status;
      return permanent(`deindex-unknown:${String(_exhaustive)}`);
    }
  }
}

async function defensiveDeindex(
  event: ClaimedClientOutboxEvent,
  config: ClientSourceConfig,
  deps: ClientEventProcessorDeps,
  reason: string,
): Promise<ProcessDirective> {
  let d: ClientDeindexResult;
  try {
    d = await deps.deindex({ config, sourceId: event.sourceId, tenantId: event.tenantId, clientId: event.clientId });
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
    default: {
      const _exhaustive: never = d.status;
      return permanent(`deindex-unknown:${String(_exhaustive)}`);
    }
  }
}

// ─── Batch orkestratörü (saf; professional runOutboxBatch ile AYNI şekil) ──────
export type ClientCompleteRpcResult = "succeeded" | "requeued_newer_event";
export type ClientFailRpcResult = "retry_scheduled" | "dead" | "requeued_newer_event";

export interface ClientOutboxBatchDeps extends ClientEventProcessorDeps {
  readonly worker: string;
  readonly claimBatch: number;
  readonly leaseSeconds: number;
  readonly permanentMaxAttempts: number;
  readonly transientMaxAttempts: number;
  readonly baseDelaySeconds: number;
  readonly maxDelaySeconds: number;
  readonly sweep: (leaseSeconds: number, batch: number) => Promise<ReadonlyArray<unknown>>;
  readonly claim: (worker: string, batch: number) => Promise<readonly ClaimedClientOutboxEvent[]>;
  readonly complete: (id: string, worker: string, version: number) => Promise<ClientCompleteRpcResult>;
  readonly fail: (
    id: string,
    worker: string,
    version: number,
    code: string,
    maxAttempts: number,
    baseDelay: number,
    maxDelay: number,
  ) => Promise<ClientFailRpcResult>;
}

export interface ClientOutboxBatchSummary {
  readonly swept: number;
  readonly claimed: number;
  readonly completed: number;
  readonly requeued: number;
  readonly failedPermanent: number;
  readonly failedTransient: number;
  readonly transportErrors: number;
}

export async function runClientOutboxBatch(deps: ClientOutboxBatchDeps): Promise<ClientOutboxBatchSummary> {
  const swept = await deps.sweep(deps.leaseSeconds, deps.claimBatch);
  const claimed = await deps.claim(deps.worker, deps.claimBatch);

  let completed = 0;
  let requeued = 0;
  let failedPermanent = 0;
  let failedTransient = 0;
  let transportErrors = 0;

  for (const ev of claimed) {
    let directive: ProcessDirective;
    try {
      directive = await processClientOutboxEvent(ev, deps);
    } catch {
      directive = { action: "fail", retryClass: "transient", code: "unexpected-processor-error" };
    }

    try {
      if (directive.action === "complete") {
        const r = await deps.complete(ev.id, deps.worker, ev.eventVersion);
        if (r === "requeued_newer_event") requeued += 1;
        else completed += 1;
      } else {
        const maxAttempts =
          directive.retryClass === "permanent" ? deps.permanentMaxAttempts : deps.transientMaxAttempts;
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
      transportErrors += 1; // olay processing'de kalır → sweep kurtarır
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

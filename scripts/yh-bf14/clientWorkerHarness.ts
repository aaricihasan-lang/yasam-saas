/**
 * PRIVATE MEMORY — Client Outbox → Client Index Worker harness (PASS/BLOCKED).
 *
 * Saf processor + batch + RPC-mapper davranışı + rota/worker/migration statik denetimi.
 * Production/DB YOK.  npm run yh:bf14:client-worker:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  YH_CLIENT_INDEX_SOURCES,
  type ClientSourceConfig,
} from "@/lib/yasam-hafizasi/client/clientSources";
import {
  processClientOutboxEvent,
  runClientOutboxBatch,
  YH_CLIENT_DEMO_TENANT,
  isPrivateClientMemoryAllowedTenant,
  type ClientEventProcessorDeps,
  type ClientOutboxBatchDeps,
} from "@/lib/yasam-hafizasi/client/clientEventProcessor";
import {
  claimClientEvents,
  type ClaimedClientOutboxEvent,
} from "@/lib/yasam-hafizasi/outbox/clientOutboxRpcClient";
import type { OutboxRpcDb } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import { ADMIN_LIBRARY_TENANT_ID, isSyntheticTenantId } from "@/lib/tenancy/syntheticTenants";

const TENANT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const TENANT2 = "ffffffff-ffff-4fff-ffff-ffffffffffff";
const CLIENT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CLIENT2 = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const SID = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const EVID = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
const SESSIONS_KEY = "danisan:sessions";
const SESSIONS_TABLE = "client_sessions";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

/** ProcessDirective union'ından güvenli not/etiket (complete→note, fail→code). Detail/koşul için. */
type Directive = Awaited<ReturnType<typeof processClientOutboxEvent>>;
const noteOf = (d: Directive): string => (d.action === "complete" ? d.note : d.code);

const cfgByKey = new Map<string, ClientSourceConfig>(YH_CLIENT_INDEX_SOURCES.map((s) => [s.sourceKey, s]));

function ev(partial: Partial<ClaimedClientOutboxEvent>): ClaimedClientOutboxEvent {
  return {
    id: EVID,
    sourceKey: SESSIONS_KEY,
    sourceTable: SESSIONS_TABLE,
    sourceId: SID,
    tenantId: TENANT,
    clientId: CLIENT,
    operation: "upsert",
    attempts: 1,
    eventVersion: 1,
    // Mevcut testler için default true → post-activation event (regression-free);
    // event-time boundary testleri (RACE-*) enqueuedActive:false ile override eder.
    enqueuedActive: true,
    ...partial,
  };
}

function rowKey(table: string, sid: string, tenant: string, client: string): string {
  return `${table}|${sid}|${tenant}|${client}`;
}

function sessionRow(note: string, tenant = TENANT, client = CLIENT): Record<string, unknown> {
  return { id: SID, tenant_id: tenant, client_id: client, session_type: "Refleksoloji", session_note: note, session_date: "2026-01-01" };
}

interface Harn {
  deps: ClientEventProcessorDeps;
  index: Map<string, Record<string, unknown>>;
  source: Map<string, Record<string, unknown>>;
  calls: { fetch: number; upsert: number; deindex: number };
}
function makeDeps(over: Partial<ClientEventProcessorDeps> = {}): Harn {
  const index = new Map<string, Record<string, unknown>>();
  const source = new Map<string, Record<string, unknown>>();
  const calls = { fetch: 0, upsert: 0, deindex: 0 };
  const deps: ClientEventProcessorDeps = {
    resolveConfig: (k) => cfgByKey.get(k) ?? null,
    fetchSourceRow: async ({ config, sourceId, tenantId, clientId }) => {
      calls.fetch += 1;
      return source.get(rowKey(config.tableName, sourceId, tenantId, clientId)) ?? null;
    },
    upsertUnit: async (dbRow) => {
      calls.upsert += 1;
      const k = `${String(dbRow.source_table)}|${String(dbRow.source_id)}|${dbRow.section_ref ?? ""}`;
      index.set(k, dbRow);
      return { ok: true };
    },
    deindex: async ({ config, sourceId }) => {
      calls.deindex += 1;
      const k = `${config.tableName}|${sourceId}|`;
      const existed = index.delete(k);
      return { status: existed ? "ok" : "no-op" };
    },
    isSourceProcessingActive: async () => true,
    ...over,
  };
  return { deps, index, source, calls };
}

async function run(): Promise<void> {
  // ── 1) INSERT → upsert; klinik metin aranabilir ──
  {
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("bas agrisi klinik"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert" }), h.deps);
    add("insert-upsert-complete", d.action === "complete" && d.note === "upsert-ok", d.action);
    add("insert-index-written", h.index.size === 1 && h.calls.upsert === 1, String(h.index.size));
    add("insert-clinical-searchable", JSON.stringify([...h.index.values()][0]).includes("bas agrisi klinik"), "");
    const row0 = [...h.index.values()][0];
    add("insert-no-client-name-copied", !("ad" in row0) && !("soyad" in row0) && !("client_name" in row0), "");

    // ── 2) UPDATE → SAME identity refresh; duplicate 0 ──
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("bas agrisi V2 refresh"));
    const d2 = await processClientOutboxEvent(ev({ operation: "upsert", eventVersion: 2 }), h.deps);
    add("update-complete", d2.action === "complete", d2.action);
    add("update-same-identity-duplicate-0", h.index.size === 1, String(h.index.size));
    add("update-refreshed-content", JSON.stringify([...h.index.values()][0]).includes("V2 refresh"), "");

    // ── 3) DELETE → deindex ──
    const d3 = await processClientOutboxEvent(ev({ operation: "delete", eventVersion: 3 }), h.deps);
    add("delete-deindex", d3.action === "complete" && d3.note === "delete-one" && h.index.size === 0, d3.action);
  }

  // ── 4) missing/deleted client (stale upsert) → GHOST recreate YOK ──
  {
    const h = makeDeps(); // source boş → fetch null
    const d = await processClientOutboxEvent(ev({ operation: "upsert" }), h.deps);
    add(
      "ghost-stale-upsert-no-recreate",
      d.action === "complete" && d.note.startsWith("defensive-deindex") && h.index.size === 0 && h.calls.upsert === 0,
      `${d.action}/${h.index.size}`,
    );
  }

  // ── 5) cross-tenant / cross-client mismatch → index yaratılmaz ──
  {
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("owned"));
    const dt = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: TENANT2 }), h.deps);
    add("cross-tenant-no-index", h.index.size === 0 && h.calls.upsert === 0 && dt.action === "complete", "");
    const dc = await processClientOutboxEvent(ev({ operation: "upsert", clientId: CLIENT2 }), h.deps);
    add("cross-client-no-index", h.index.size === 0 && h.calls.upsert === 0 && dc.action === "complete", "");
  }

  // ── 6) demo tenant → index yaratılmaz (fetch bile edilmez) ──
  {
    const h = makeDeps();
    // Kaynak var olsa DAHİ demo indexlenmez.
    h.source.set(rowKey(SESSIONS_TABLE, SID, YH_CLIENT_DEMO_TENANT, CLIENT), sessionRow("demo"));
    const dd = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: YH_CLIENT_DEMO_TENANT }), h.deps);
    add("demo-no-index", h.index.size === 0 && h.calls.upsert === 0 && h.calls.fetch === 0 && dd.action === "complete" && dd.note === "defensive-deindex:excluded-demo", dd.action);
    // Demo DELETE de defensive deindex (asla index üretmez).
    const ddDel = await processClientOutboxEvent(ev({ operation: "delete", tenantId: YH_CLIENT_DEMO_TENANT }), h.deps);
    add("demo-delete-defensive-deindex", ddDel.action === "complete" && ddDel.note === "defensive-deindex:excluded-demo" && h.calls.upsert === 0, noteOf(ddDel));
  }

  // ── 6b) ADMIN PRIVATE CLIENT MEMORY — DAR sentetik istisna: admin kendi danışan geçmişini indexler ──
  {
    // ADMIN-1: ADMIN_LIBRARY tenant + active + enqueuedActive=true + valid client UPSERT → upsert-ok.
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, ADMIN_LIBRARY_TENANT_ID, CLIENT), sessionRow("admin danisan klinik", ADMIN_LIBRARY_TENANT_ID, CLIENT));
    const da = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: ADMIN_LIBRARY_TENANT_ID, enqueuedActive: true }), h.deps);
    add(
      "ADMIN-1-private-client-upsert-ok",
      da.action === "complete" && da.note === "upsert-ok" && h.index.size === 1 && h.calls.upsert === 1 && h.calls.fetch === 1,
      `${da.action}/${noteOf(da)}/idx${h.index.size}`,
    );
    add("ADMIN-1-no-defensive-deindex", h.calls.deindex === 0, String(h.calls.deindex));
    add("ADMIN-1-clinical-searchable", h.index.size === 1 && JSON.stringify([...h.index.values()][0]).includes("admin danisan klinik"), "");
    const adminRow = [...h.index.values()][0];
    add("ADMIN-1-tenant-stamped", adminRow !== undefined && adminRow.tenant_id === ADMIN_LIBRARY_TENANT_ID && adminRow.client_id === CLIENT, "");

    // ADMIN-2: ADMIN_LIBRARY DELETE → normal tenant+client scoped deindex (excluded-synthetic DEĞİL).
    const dDel = await processClientOutboxEvent(ev({ operation: "delete", tenantId: ADMIN_LIBRARY_TENANT_ID, enqueuedActive: true, eventVersion: 2 }), h.deps);
    add("ADMIN-2-delete-tenant-scoped", dDel.action === "complete" && dDel.note === "delete-one" && h.index.size === 0, `${noteOf(dDel)}/idx${h.index.size}`);
  }

  // ── 6c) ADMIN private-client: ownership & çift-kapı davranışı korunur ──
  {
    // ADMIN-3: enqueuedActive=false (pre-activation) → hâlâ pre-activation-upsert-noop (istisna kapı 5.5'i atlamaz).
    const h1 = makeDeps();
    h1.source.set(rowKey(SESSIONS_TABLE, SID, ADMIN_LIBRARY_TENANT_ID, CLIENT), sessionRow("x", ADMIN_LIBRARY_TENANT_ID, CLIENT));
    const d1 = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: ADMIN_LIBRARY_TENANT_ID, enqueuedActive: false }), h1.deps);
    add("ADMIN-3-preactivation-noop-preserved", d1.action === "complete" && d1.note === "pre-activation-upsert-noop" && h1.index.size === 0 && h1.calls.upsert === 0, noteOf(d1));

    // ADMIN-4: inactive source (kill-switch) → inactive-source-noop (istisna kapı 5'i atlamaz).
    const h2 = makeDeps({ isSourceProcessingActive: async () => false });
    h2.source.set(rowKey(SESSIONS_TABLE, SID, ADMIN_LIBRARY_TENANT_ID, CLIENT), sessionRow("x", ADMIN_LIBRARY_TENANT_ID, CLIENT));
    const d2 = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: ADMIN_LIBRARY_TENANT_ID }), h2.deps);
    add("ADMIN-4-inactive-source-noop-preserved", d2.action === "complete" && d2.note === "inactive-source-noop" && h2.index.size === 0 && h2.calls.upsert === 0, noteOf(d2));

    // ADMIN-5: admin tenant + YANLIŞ client (ownership fetch null) → GHOST recreate YOK; defensive deindex.
    const h3 = makeDeps();
    h3.source.set(rowKey(SESSIONS_TABLE, SID, ADMIN_LIBRARY_TENANT_ID, CLIENT), sessionRow("owned", ADMIN_LIBRARY_TENANT_ID, CLIENT));
    const d3 = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: ADMIN_LIBRARY_TENANT_ID, clientId: CLIENT2 }), h3.deps);
    add("ADMIN-5-cross-client-no-index", h3.index.size === 0 && h3.calls.upsert === 0 && d3.action === "complete" && d3.note.startsWith("defensive-deindex"), `${noteOf(d3)}/idx${h3.index.size}`);
  }

  // ── 6d) POLİTİKA: dar istisna future-safe + isSyntheticTenantId DEĞİŞMEDİ ──
  {
    const REAL_TENANT = "11111111-1111-4111-1111-111111111111";
    const OTHER_SYNTHETIC = "22222222-2222-4222-2222-222222222222"; // listeye ileride eklenirse
    // Allow-predicate YALNIZ admin exact-match (demo/gerçek/diğer sentetik → false).
    add("policy-allow-admin-only", isPrivateClientMemoryAllowedTenant(ADMIN_LIBRARY_TENANT_ID) === true, "");
    add("policy-allow-real-false", isPrivateClientMemoryAllowedTenant(REAL_TENANT) === false, "");
    add("policy-allow-demo-false", isPrivateClientMemoryAllowedTenant(YH_CLIENT_DEMO_TENANT) === false, "");
    add("policy-allow-other-synthetic-false", isPrivateClientMemoryAllowedTenant(OTHER_SYNTHETIC) === false, "");
    // isSyntheticTenantId global davranışı KORUNUR (admin hâlâ sentetik; gerçek değil).
    add("policy-synthetic-admin-still-true", isSyntheticTenantId(ADMIN_LIBRARY_TENANT_ID) === true, "");
    add("policy-synthetic-real-false", isSyntheticTenantId(REAL_TENANT) === false, "");
    // GERÇEK uzman tenant davranışı değişmez (normal index).
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("real expert"));
    const dr = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: TENANT }), h.deps);
    add("policy-real-expert-normal-index", dr.action === "complete" && dr.note === "upsert-ok" && h.index.size === 1, noteOf(dr));
  }

  // ── 7) disabled source (activation inactive) → complete no-op; index/deindex YOK ──
  {
    const h = makeDeps({ isSourceProcessingActive: async () => false });
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("x"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert" }), h.deps);
    add("disabled-source-noop", d.action === "complete" && d.note === "inactive-source-noop" && h.index.size === 0 && h.calls.upsert === 0 && h.calls.deindex === 0, d.action);
  }

  // ── 8) activation gate error → transient (fail-closed) ──
  {
    const h = makeDeps({ isSourceProcessingActive: async () => { throw new Error("db-down"); } });
    const d = await processClientOutboxEvent(ev({ operation: "upsert" }), h.deps);
    add("activation-error-transient", d.action === "fail" && d.retryClass === "transient" && d.code === "activation-check-error", "");
  }

  // ── 9) gate enjekte edilmemiş (harness/geriye-uyum) → işlenir ──
  {
    const h = makeDeps({ isSourceProcessingActive: undefined });
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("nogate"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert" }), h.deps);
    add("no-gate-processes-upsert", d.action === "complete" && d.note === "upsert-ok", d.action);
  }

  // ── 10) fail-closed sözleşme kapıları ──
  {
    const h = makeDeps();
    const uk = await processClientOutboxEvent(ev({ sourceKey: "nope:x" }), h.deps);
    add("unknown-source-permanent", uk.action === "fail" && uk.retryClass === "permanent" && uk.code === "unknown-source", "");
    const tm = await processClientOutboxEvent(ev({ sourceTable: "wrong_table" }), h.deps);
    add("table-mismatch-permanent", tm.action === "fail" && tm.code === "source-table-mismatch", "");
    const badOp = await processClientOutboxEvent(ev({ operation: "weird" as unknown as ClaimedClientOutboxEvent["operation"] }), h.deps);
    add("invalid-operation-permanent", badOp.action === "fail" && badOp.code === "invalid-operation", "");
    const badT = await processClientOutboxEvent(ev({ tenantId: "not-a-uuid" }), h.deps);
    add("invalid-tenant-permanent", badT.action === "fail" && badT.code === "invalid-event-contract", "");
    const badC = await processClientOutboxEvent(ev({ clientId: "not-a-uuid" }), h.deps);
    add("invalid-client-permanent", badC.action === "fail" && badC.code === "invalid-event-contract", "");
  }

  // ── 11) batch orkestrasyonu (retry mapping: permanent→maxAttempts=1) ──
  {
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("batch"));
    const okBatch: ClientOutboxBatchDeps = {
      ...h.deps,
      worker: "w",
      claimBatch: 10,
      leaseSeconds: 300,
      permanentMaxAttempts: 1,
      transientMaxAttempts: 8,
      baseDelaySeconds: 2,
      maxDelaySeconds: 60,
      sweep: async () => [],
      claim: async () => [ev({ operation: "upsert" })],
      complete: async () => "succeeded",
      fail: async () => "retry_scheduled",
    };
    const s1 = await runClientOutboxBatch(okBatch);
    add("batch-upsert-completed", s1.claimed === 1 && s1.completed === 1 && h.index.size === 1, JSON.stringify(s1));

    let failMax = -1;
    let failCode = "";
    const permBatch: ClientOutboxBatchDeps = {
      ...makeDeps().deps,
      worker: "w",
      claimBatch: 10,
      leaseSeconds: 300,
      permanentMaxAttempts: 1,
      transientMaxAttempts: 8,
      baseDelaySeconds: 2,
      maxDelaySeconds: 60,
      sweep: async () => [],
      claim: async () => [ev({ sourceKey: "nope:x" })],
      complete: async () => "succeeded",
      fail: async (_id, _w, _v, code, maxAttempts) => {
        failCode = code;
        failMax = maxAttempts;
        return "dead";
      },
    };
    const s2 = await runClientOutboxBatch(permBatch);
    add("batch-permanent-maxattempts-1", failMax === 1 && failCode === "unknown-source" && s2.failedPermanent === 1, `${failMax}/${failCode}`);
  }

  // ── 12) RPC client mapping (claim client_id + enqueued_active; invalid → invariant) ──
  {
    const okDb: OutboxRpcDb = {
      rpc: async () => ({
        data: [{ id: EVID, source_key: SESSIONS_KEY, source_table: SESSIONS_TABLE, source_id: SID, tenant_id: TENANT, client_id: CLIENT, operation: "upsert", attempts: 1, event_version: 1, enqueued_active: true }],
        error: null,
      }),
    };
    const rows = await claimClientEvents(okDb, "w", 10);
    add("rpc-claim-maps-client-id", rows.length === 1 && rows[0]!.clientId === CLIENT && rows[0]!.tenantId === TENANT, "");
    add("rpc-claim-maps-enqueued-active", rows.length === 1 && rows[0]!.enqueuedActive === true, "");

    // enqueued_active=false GEÇERLİ (map edilir; boolean koruma false'u reddetmez).
    const falseDb: OutboxRpcDb = {
      rpc: async () => ({
        data: [{ id: EVID, source_key: SESSIONS_KEY, source_table: SESSIONS_TABLE, source_id: SID, tenant_id: TENANT, client_id: CLIENT, operation: "upsert", attempts: 1, event_version: 1, enqueued_active: false }],
        error: null,
      }),
    };
    const falseRows = await claimClientEvents(falseDb, "w", 10);
    add("rpc-claim-enqueued-active-false-valid", falseRows.length === 1 && falseRows[0]!.enqueuedActive === false, "");

    const badDb: OutboxRpcDb = {
      rpc: async () => ({
        data: [{ id: EVID, source_key: SESSIONS_KEY, source_table: SESSIONS_TABLE, source_id: SID, tenant_id: TENANT, client_id: "bad", operation: "upsert", attempts: 1, event_version: 1, enqueued_active: true }],
        error: null,
      }),
    };
    let threw = false;
    try {
      await claimClientEvents(badDb, "w", 10);
    } catch {
      threw = true;
    }
    add("rpc-claim-invalid-client-throws", threw, "");

    // STRICT: enqueued_active missing/null → invariant error (V2 migration-first sözleşmesi).
    const missingDb: OutboxRpcDb = {
      rpc: async () => ({
        data: [{ id: EVID, source_key: SESSIONS_KEY, source_table: SESSIONS_TABLE, source_id: SID, tenant_id: TENANT, client_id: CLIENT, operation: "upsert", attempts: 1, event_version: 1 }],
        error: null,
      }),
    };
    let threwMissing = false;
    try {
      await claimClientEvents(missingDb, "w", 10);
    } catch {
      threwMissing = true;
    }
    add("rpc-claim-missing-enqueued-active-throws", threwMissing, "");
  }

  // ═══ EVENT-TIME BOUNDARY (ACTIVATION RACE HARDENING) — RACE-1..RACE-10 ═══════════
  //
  // İki kapı BİRLİKTE gerekir: CURRENTLY ACTIVE (isSourceProcessingActive) VE
  // ENQUEUED WHILE ACTIVE (event.enqueuedActive). Pre-activation olaylar (enqueuedActive=false)
  // worker sonradan işlese bile index üretmez.

  // RACE-1: active gate=true, enqueuedActive=false, upsert → index 0, no deindex, terminal.
  {
    const h = makeDeps(); // isSourceProcessingActive default true
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("pre-activation"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: false }), h.deps);
    add(
      "RACE-1-preactivation-upsert-noop",
      d.action === "complete" && d.note === "pre-activation-upsert-noop" &&
        h.index.size === 0 && h.calls.upsert === 0 && h.calls.deindex === 0 && h.calls.fetch === 0,
      `${d.action}/${noteOf(d)}/idx${h.index.size}`,
    );
  }

  // RACE-2: active=true, enqueuedActive=true, upsert, source var → normal index.
  {
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("post-activation"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: true }), h.deps);
    add("RACE-2-postactivation-upsert-index", d.action === "complete" && d.note === "upsert-ok" && h.index.size === 1, `${noteOf(d)}/idx${h.index.size}`);
  }

  // RACE-3: source aktivasyon ÖNCESİNDEN var (eski created_at); aktivasyon sonrası UPDATE'in
  //   coalesced/latest event'i enqueuedActive=true → normal index. source.created_at KULLANILMAZ.
  {
    const h = makeDeps();
    const oldSource = { ...sessionRow("aktivasyon-oncesi-kaynak"), created_at: "2020-01-01T00:00:00Z" };
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), oldSource);
    const d = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: true, eventVersion: 7 }), h.deps);
    add(
      "RACE-3-preexisting-source-postactivation-update-index",
      d.action === "complete" && d.note === "upsert-ok" && h.index.size === 1,
      `${noteOf(d)}/idx${h.index.size}`,
    );
  }

  // RACE-4: pre-activation upsert (false), source processing anında artık YOK → ghost 0, no-op.
  {
    const h = makeDeps(); // source boş
    const d = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: false }), h.deps);
    add(
      "RACE-4-preactivation-upsert-missing-source-no-ghost",
      d.action === "complete" && d.note === "pre-activation-upsert-noop" &&
        h.index.size === 0 && h.calls.upsert === 0 && h.calls.deindex === 0,
      `${noteOf(d)}/idx${h.index.size}`,
    );
  }

  // RACE-5: pre-activation DELETE (false) → defensive deindex → terminal succeeded; ghost 0.
  {
    const h = makeDeps();
    // Savunma: varsa mevcut index satırını temizlediğini kanıtla (ghost bırakma).
    h.index.set(`${SESSIONS_TABLE}|${SID}|`, { source_table: SESSIONS_TABLE, source_id: SID });
    const d = await processClientOutboxEvent(ev({ operation: "delete", enqueuedActive: false }), h.deps);
    add(
      "RACE-5-preactivation-delete-defensive-deindex",
      d.action === "complete" && d.note === "defensive-deindex:pre-activation-delete" &&
        h.index.size === 0 && h.calls.deindex === 1 && h.calls.upsert === 0,
      `${d.action}/${noteOf(d)}/idx${h.index.size}`,
    );
  }

  // RACE-6: aynı source identity — event A (false)=no-op, sonraki gerçek event B (true)=index.
  {
    const h = makeDeps();
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("event-B-post-activation"));
    const a = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: false, eventVersion: 1 }), h.deps);
    add("RACE-6-eventA-false-noop", noteOf(a) === "pre-activation-upsert-noop" && h.index.size === 0, `${noteOf(a)}/idx${h.index.size}`);
    const b = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: true, eventVersion: 2 }), h.deps);
    add("RACE-6-eventB-true-index", noteOf(b) === "upsert-ok" && h.index.size === 1, `${noteOf(b)}/idx${h.index.size}`);
  }

  // RACE-8: 6 client source enqueuedActive=true ile normal indexler (boundary regresyonu YOK).
  {
    let allIndexed = true;
    const detail: string[] = [];
    for (const cfg of YH_CLIENT_INDEX_SOURCES) {
      const h = makeDeps();
      const srcRow: Record<string, unknown> = { id: SID, tenant_id: TENANT, client_id: CLIENT };
      const primaryText = cfg.searchTextColumns[0] ?? cfg.titleColumns[0];
      if (primaryText) srcRow[primaryText] = "klinik serbest metin";
      if (cfg.titleColumns[0]) srcRow[cfg.titleColumns[0]] = "baslik";
      h.source.set(rowKey(cfg.tableName, SID, TENANT, CLIENT), srcRow);
      const d = await processClientOutboxEvent(
        ev({ sourceKey: cfg.sourceKey, sourceTable: cfg.tableName, operation: "upsert", enqueuedActive: true }),
        h.deps,
      );
      const ok = d.action === "complete" && d.note === "upsert-ok" && h.index.size === 1;
      if (!ok) { allIndexed = false; detail.push(`${cfg.sourceKey}:${noteOf(d)}/idx${h.index.size}`); }
    }
    add("RACE-8-all-6-sources-normal-index", allIndexed, detail.join(" "));
  }

  // RACE-9: CURRENT PROCESSING KILL-SWITCH — enqueuedActive=true ama processing anında inactive
  //   → Kapı 5 (currently-active) hâlâ bloklar (inactive-source-noop); index 0.
  {
    const h = makeDeps({ isSourceProcessingActive: async () => false });
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("kill-switch"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: true }), h.deps);
    add(
      "RACE-9-killswitch-current-inactive-blocks",
      d.action === "complete" && d.note === "inactive-source-noop" && h.index.size === 0 && h.calls.upsert === 0,
      `${noteOf(d)}/idx${h.index.size}`,
    );
  }

  // RACE-10: INACTIVE ENQUEUE / LATER REACTIVATION — production'da gözlenen race'in birebir
  //   deterministik regresyonu: enqueuedActive=false, processing anında active=true → index 0.
  {
    const h = makeDeps({ isSourceProcessingActive: async () => true });
    h.source.set(rowKey(SESSIONS_TABLE, SID, TENANT, CLIENT), sessionRow("randevu-10:06:52-pre-activation"));
    const d = await processClientOutboxEvent(ev({ operation: "upsert", enqueuedActive: false }), h.deps);
    add(
      "RACE-10-inactive-enqueue-later-reactivation-no-index",
      d.action === "complete" && d.note === "pre-activation-upsert-noop" && h.index.size === 0 && h.calls.upsert === 0,
      `${noteOf(d)}/idx${h.index.size}`,
    );
  }

  // ── 13) STATIK: fiziksel ayrım + çift dormant + professional regresyon YOK ──
  {
    const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");
    const route = read("app/api/inngest/route.ts");
    add("route-registers-both-workers", route.includes("yhClientOutboxWorkerFunction") && route.includes("yhOutboxWorkerFunction"), "");

    const worker = read("lib/inngest/functions/yhClientOutboxWorker.ts");
    add("worker-server-only", /^import "server-only";/m.test(worker), "");
    add("worker-env-gate-off-default", worker.includes("YH_CLIENT_OUTBOX_WORKER_ENABLED") && /=== "true"/.test(worker), "");
    add("worker-activation-gate-wired", /isSourceProcessingActive:\s*\(sourceKey\)\s*=>\s*isSourceProcessingActive\(sourceKey, serverDb\)/.test(worker), "");
    add("worker-no-backfill", !/backfill|reconcile|full.?scan/i.test(worker), "");

    // Professional worker + eventProcessor client-memory referansı içermez (fiziksel ayrım).
    const proWorker = read("lib/inngest/functions/yhOutboxWorker.ts");
    add("professional-worker-no-client-ref", !/yhClientOutbox|clientEventProcessor|clientOutboxRpcClient|yasam_hafizasi_client/.test(proWorker), "");
    const proEp = read("lib/yasam-hafizasi/outbox/eventProcessor.ts");
    add("professional-eventprocessor-no-client-ref", !/clientEventProcessor|ClientSourceConfig|yasam_hafizasi_client/.test(proEp), "");

    // Client processor YALNIZ client index yazar (professional index'e DOKUNMAZ).
    const cep = read("lib/yasam-hafizasi/client/clientEventProcessor.ts");
    add("client-processor-no-professional-index", !/yasam_hafizasi_index\b/.test(cep), "");

    // ── ADMIN PRIVATE-CLIENT İSTİSNASI: dar + fiziksel izolasyon (professional yasağı gevşemez) ──
    // Narrow gate wired: excluded-synthetic yalnız allow-predicate NEGATİFken çalışır.
    add(
      "admin-exception-narrow-gate-wired",
      /isSyntheticTenantId\(event\.tenantId\)\s*&&\s*!isPrivateClientMemoryAllowedTenant\(event\.tenantId\)/.test(cep) &&
        /excluded-synthetic/.test(cep),
      "",
    );
    // Allow-helper professional writer/indexer'a SIZMADI (professional sentetik yasağı korunur).
    const proWriter = read("lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts");
    add("professional-writer-still-bans-synthetic", /isSyntheticTenantId\(u\.tenantId\)/.test(proWriter) && /synthetic-tenant-unit/.test(proWriter), "");
    add("allow-helper-not-in-professional-writer", !/isPrivateClientMemoryAllowedTenant/.test(proWriter), "");
    add("allow-helper-not-in-professional-eventprocessor", !/isPrivateClientMemoryAllowedTenant/.test(proEp), "");
    // syntheticTenants global davranışı DEĞİŞMEDİ (liste tek eleman + import yok + helper eklenmedi).
    const tenancy = read("lib/tenancy/syntheticTenants.ts");
    add("synthetic-list-single-element", /SYNTHETIC_TENANT_IDS:\s*readonly string\[\]\s*=\s*\[ADMIN_LIBRARY_TENANT_ID\]/.test(tenancy), "");
    add("synthetic-module-still-import-free", !/^\s*import\s/m.test(tenancy), "");
    // Pure module allow-helper'ı TANIMLAMAZ/uygulamaz (yorumda kontrat referansı serbest);
    // istisna mantığı yalnız client processor katmanında yaşar.
    const tenancyNoComments = tenancy.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    add("allow-helper-not-defined-in-tenancy-module", !/isPrivateClientMemoryAllowedTenant/.test(tenancyNoComments), "");
    // isSyntheticTenantId gövdesi DEĞİŞMEDİ (yalnız liste üyeliği; istisna sızıntısı yok).
    add("synthetic-predicate-body-unchanged", /return SYNTHETIC_TENANT_IDS\.includes\(tenantId\);/.test(tenancyNoComments), "");

    // ── UI: Danışan Hafızası soğuk başlangıç copy'si mesleki copy'den AYRI ──
    const states = read("app/yasam-hafizasi/components/WorkspaceStates.tsx");
    add("ui-client-cold-start-variant-exists", /"client-cold-start":/.test(states), "");
    add("ui-client-cold-start-copy", /Danışan geçmişinizde seans, not, ödev, taş, kombinasyon veya randevu içeriği arayın\./.test(states), "");
    add("ui-professional-cold-start-copy-preserved", /mesleki bilgi havuzunuzda arayalım/.test(states), "");
    const clientPanel = read("app/yasam-hafizasi/components/ClientMemoryPanel.tsx");
    add("ui-client-panel-uses-client-cold-start", /variant="client-cold-start"/.test(clientPanel), "");
    const proWorkspace = read("app/yasam-hafizasi/components/YasamHafizasiWorkspace.tsx");
    add("ui-professional-workspace-uses-cold-start", /variant="cold-start"/.test(proWorkspace) && !/client-cold-start/.test(proWorkspace), "");

    // Client state-machine migration: client_id döner + DEFINER + service_role + professional untouched.
    const mig = read("supabase/migrations/20261218000300_yh_client_outbox_state_machine.sql");
    add("client-rpc-claim-returns-client-id", /RETURNS TABLE[\s\S]*client_id\s+uuid/.test(mig), "");
    add("client-rpc-definer-service-role", /SECURITY DEFINER/.test(mig) && /GRANT EXECUTE ON FUNCTION public\.yh_client_outbox_claim[\s\S]*TO service_role/.test(mig), "");
    add(
      "client-rpc-professional-untouched",
      !/CREATE OR REPLACE FUNCTION public\.yh_outbox_/.test(mig) && !/(ALTER|DROP|CREATE)\s+TABLE[^\n;]*public\.yasam_hafizasi_outbox\b/i.test(mig),
      "",
    );

    // GHOST guarantee: composite FK CASCADE (client sil → index 0) 20260923'te KORUNUR.
    const core = read("supabase/migrations/20260923000000_yasam_hafizasi_client_memory_core.sql");
    add("ghost-composite-fk-cascade", /FOREIGN KEY \(tenant_id, client_id\)[\s\S]*REFERENCES public\.clients \(tenant_id, id\) ON DELETE CASCADE/.test(core), "");

    // ── 14) STATIK: EVENT-TIME BOUNDARY migration (20261220000000) sözleşmesi ──
    const bnd = read("supabase/migrations/20261220000000_yh_client_outbox_activation_boundary.sql");
    // NEGATİF assert'ler için SQL yorumlarını (-- ...) çıkar (dokümantasyon mention'ları false-fail etmesin).
    const bndSql = bnd.replace(/--[^\n]*/g, "");
    // Kolon + NOT NULL DEFAULT false (fail-closed; historical backfill YOK).
    add(
      "boundary-column-not-null-default-false",
      /ADD COLUMN IF NOT EXISTS\s+enqueued_active\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(bndSql),
      "",
    );
    // Enqueue INSERT enqueued_active damgalar + yh_source_activation okur (IS TRUE fail-closed).
    add("boundary-enqueue-reads-activation", /FROM public\.yh_source_activation[\s\S]*v_enqueued_active\s*:=\s*\(v_active IS TRUE\)/.test(bndSql), "");
    add("boundary-enqueue-insert-stamps", /INSERT INTO public\.yasam_hafizasi_client_outbox[\s\S]*enqueued_active\)/.test(bndSql), "");
    // ON CONFLICT (coalesce) HER YENİ EVENTTE EXCLUDED'dan enqueued_active yeniden yazar.
    add("boundary-onconflict-overwrites", /ON CONFLICT[\s\S]*enqueued_active\s*=\s*EXCLUDED\.enqueued_active/.test(bndSql), "");
    // event_version / coalescing semantiği KORUNUR (event_version nextval); created_at yazılmaz.
    add("boundary-eventversion-preserved", /event_version\s*=\s*nextval\('public\.yasam_hafizasi_client_outbox_event_version_seq'\)/.test(bndSql), "");
    add("boundary-createdat-not-assigned", !/\bcreated_at\s*=/.test(bndSql), "");
    // V1 claim KORUNUR (drop/replace YOK) + V2 EKLENDİ + V2 enqueued_active döner.
    add("boundary-v1-claim-not-dropped", !/DROP FUNCTION[\s\S]*yh_client_outbox_claim\b/.test(bndSql) && !/CREATE OR REPLACE FUNCTION public\.yh_client_outbox_claim\s*\(/.test(bndSql), "");
    add("boundary-v2-claim-exists", /CREATE OR REPLACE FUNCTION public\.yh_client_outbox_claim_v2\s*\(/.test(bndSql), "");
    add("boundary-v2-returns-enqueued-active", /RETURNS TABLE[\s\S]*enqueued_active\s+boolean/.test(bndSql), "");
    add("boundary-v2-definer-service-role", /yh_client_outbox_claim_v2[\s\S]*SECURITY DEFINER/.test(bndSql) && /GRANT EXECUTE ON FUNCTION public\.yh_client_outbox_claim_v2\(text, integer\) TO service_role/.test(bndSql), "");
    // complete/fail/sweep enqueued_active'e DOKUNMAZ (bu migration onları hiç değiştirmez).
    add("boundary-lifecycle-untouched", !/yh_client_outbox_(complete|fail|sweep_expired)/.test(bndSql), "");
    // Professional outbox/function DDL'ine DOKUNULMAZ (fiziksel ayrım; yorumlarda mention serbest).
    add(
      "boundary-professional-untouched",
      !/(CREATE OR REPLACE|DROP)\s+FUNCTION\s+public\.(yh_outbox_|yh_cdc_enqueue)/i.test(bndSql) &&
        !/(ALTER|DROP|CREATE)\s+TABLE[^\n;]*public\.yasam_hafizasi_outbox\b/i.test(bndSql),
      "",
    );
    // RACE-7: backfill_allowed=false sözleşmesi DEĞİŞMEDİ — migration backfill/reconcile/activation açmaz.
    add(
      "RACE-7-no-backfill-no-activation-in-migration",
      !/reconcile/i.test(bndSql) &&
        !/INSERT[\s\S]*SELECT[\s\S]*FROM\s+public\.(client_|appointments)/i.test(bndSql) &&
        !/yh_source_activation_set|is_active\s*=\s*true|backfill_allowed\s*=\s*true/i.test(bndSql),
      "",
    );

    // RPC client V2 kullanır + strict enqueued_active koruması.
    const rpcClient = read("lib/yasam-hafizasi/outbox/clientOutboxRpcClient.ts");
    add("rpcclient-uses-claim-v2", /yh_client_outbox_claim_v2/.test(rpcClient) && !/["']yh_client_outbox_claim["']/.test(rpcClient), "");
    add("rpcclient-strict-enqueued-active", /client-claim-invalid-enqueued-active/.test(rpcClient), "");
    // Processor event-time boundary kapısı wired.
    add("processor-boundary-gate-wired", /event\.enqueuedActive !== true/.test(cep) && /pre-activation-upsert-noop/.test(cep) && /pre-activation-delete/.test(cep), "");
  }
}

async function main(): Promise<void> {
  await run();
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nPRIVATE MEMORY CLIENT WORKER HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();

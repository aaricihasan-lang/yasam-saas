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
  type ClientEventProcessorDeps,
  type ClientOutboxBatchDeps,
} from "@/lib/yasam-hafizasi/client/clientEventProcessor";
import {
  claimClientEvents,
  type ClaimedClientOutboxEvent,
} from "@/lib/yasam-hafizasi/outbox/clientOutboxRpcClient";
import type { OutboxRpcDb } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/tenancy/syntheticTenants";

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

  // ── 6) demo / synthetic tenant → index yaratılmaz ──
  {
    const h = makeDeps();
    // Kaynak var olsa DAHİ demo/synthetic indexlenmez (fetch bile edilmez).
    h.source.set(rowKey(SESSIONS_TABLE, SID, YH_CLIENT_DEMO_TENANT, CLIENT), sessionRow("demo"));
    const dd = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: YH_CLIENT_DEMO_TENANT }), h.deps);
    add("demo-no-index", h.index.size === 0 && h.calls.upsert === 0 && h.calls.fetch === 0 && dd.action === "complete" && dd.note === "defensive-deindex:excluded-demo", dd.action);
    const ds = await processClientOutboxEvent(ev({ operation: "upsert", tenantId: ADMIN_LIBRARY_TENANT_ID }), h.deps);
    add("synthetic-no-index", h.calls.upsert === 0 && ds.action === "complete" && ds.note === "defensive-deindex:excluded-synthetic", ds.action);
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

  // ── 12) RPC client mapping (claim client_id; invalid client → invariant) ──
  {
    const okDb: OutboxRpcDb = {
      rpc: async () => ({
        data: [{ id: EVID, source_key: SESSIONS_KEY, source_table: SESSIONS_TABLE, source_id: SID, tenant_id: TENANT, client_id: CLIENT, operation: "upsert", attempts: 1, event_version: 1 }],
        error: null,
      }),
    };
    const rows = await claimClientEvents(okDb, "w", 10);
    add("rpc-claim-maps-client-id", rows.length === 1 && rows[0]!.clientId === CLIENT && rows[0]!.tenantId === TENANT, "");
    const badDb: OutboxRpcDb = {
      rpc: async () => ({
        data: [{ id: EVID, source_key: SESSIONS_KEY, source_table: SESSIONS_TABLE, source_id: SID, tenant_id: TENANT, client_id: "bad", operation: "upsert", attempts: 1, event_version: 1 }],
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

    // Client state-machine migration: client_id döner + DEFINER + service_role + professional untouched.
    const mig = read("supabase/migrations/20261217000300_yh_client_outbox_state_machine.sql");
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

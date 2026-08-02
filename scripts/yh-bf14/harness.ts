/**
 * BF-14 Paket 1 — Client Memory Core tek kapsamlı harness (PASS/BLOCKED).
 * Yalnız SAF birimler + fixture + migration statik denetimi; production/DB YOK.
 *   npm run yh:bf14:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  YH_CLIENT_INDEX_SOURCES,
  assertNoDenylistedIndexColumns,
  validateAllClientSources,
  clientModuleLabel,
  clientSourceLinkFor,
  isClientSourceModule,
  type ClientSourceConfig,
} from "@/lib/yasam-hafizasi/client/clientSources";
import { buildClientIndexUnit, toClientIndexDbRow } from "@/lib/yasam-hafizasi/client/clientIndexUnit";
import { parseClientSearchRequest, withinDateWindow } from "@/lib/yasam-hafizasi/client/clientSearchRequest";
import {
  computeClientFacets,
  filterClientByModules,
  toClientSearchResult,
  type ClientRpcRow,
} from "@/lib/yasam-hafizasi/client/clientSearchResult";
import { runClientRetrieval, type ClientRpcDb } from "@/lib/yasam-hafizasi/client/clientRetrieval";
import { buildReportSnapshot } from "@/lib/yasam-hafizasi/client/snapshotBuilder";

const TENANT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const CLIENT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const SEL = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
const PII = "SESSION_PII_SENTINEL_9x";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

// ── clientSources + PII denylist ──
add("sources-all-dormant", YH_CLIENT_INDEX_SOURCES.every((s) => s.enabled === false), "");
add("sources-count-6", YH_CLIENT_INDEX_SOURCES.length === 6, String(YH_CLIENT_INDEX_SOURCES.length));
{
  let ok = true;
  try {
    validateAllClientSources();
  } catch {
    ok = false;
  }
  add("sources-no-denylist-in-index", ok, "");
}
{
  const bad: ClientSourceConfig = { ...YH_CLIENT_INDEX_SOURCES[2], searchTextColumns: ["session_note"], piiDenylist: ["session_note"] };
  let threw = false;
  try {
    assertNoDenylistedIndexColumns(bad);
  } catch {
    threw = true;
  }
  add("sources-denylist-violation-throws", threw, "");
}

// ── clientIndexUnit (PII-safe by construction) ──
{
  const cfg = YH_CLIENT_INDEX_SOURCES.find((s) => s.sourceKey === "danisan:sessions") as ClientSourceConfig;
  const row = {
    id: SID,
    client_id: CLIENT,
    tenant_id: TENANT,
    session_type: "Refleksoloji Seansı",
    session_date: "2026-01-15",
    session_note: PII,
    suggestions: PII,
    fee: 500,
  };
  const unit = buildClientIndexUnit(cfg, row, { tenantId: TENANT, clientId: CLIENT });
  add("unit-built", unit !== null, "");
  add("unit-scope", unit?.tenantId === TENANT && unit?.clientId === CLIENT, "");
  add("unit-title-safe", unit?.title === "Refleksoloji Seansı", unit?.title ?? "");
  add("unit-occurred", unit?.occurredAt === "2026-01-15", unit?.occurredAt ?? "");
  add("unit-no-pii-leak", unit !== null && !JSON.stringify(unit).includes(PII), "PII sızıntısı!");
  const dbrow = unit ? toClientIndexDbRow(unit) : {};
  add("dbrow-is_client_pii-false", (dbrow as Record<string, unknown>).is_client_pii === false, "");
  add("dbrow-no-pii-leak", !JSON.stringify(dbrow).includes(PII), "");
  // determinism
  const unit2 = buildClientIndexUnit(cfg, row, { tenantId: TENANT, clientId: CLIENT });
  add("unit-hash-deterministic", unit?.contentHash === unit2?.contentHash, "");
  // Evidence Gate: no indexable content → null
  const empty = buildClientIndexUnit(cfg, { id: SID, session_note: PII }, { tenantId: TENANT, clientId: CLIENT });
  add("unit-evidence-gate-null", empty === null, "");
  // bad uuid → null
  add("unit-bad-uuid-null", buildClientIndexUnit(cfg, { id: "nope", session_type: "x" }, { tenantId: TENANT, clientId: CLIENT }) === null, "");
}

// ── request parse (tenant/client body ignored) ──
{
  const p = parseClientSearchRequest({ q: " ametist ", tenantId: "EVIL", clientId: "EVIL", client_id: "EVIL" });
  add("parse-ok+scope-ignored", p.ok && p.value.q === "ametist" && !("tenantId" in (p.value as unknown as Record<string, unknown>)) && !("clientId" in (p.value as unknown as Record<string, unknown>)), "");
  add("parse-invalid-q", !parseClientSearchRequest({ q: 5 }).ok, "");
  add("parse-q-too-long", !parseClientSearchRequest({ q: "x".repeat(201) }).ok, "");
  add("parse-invalid-module", !parseClientSearchRequest({ q: "a", modules: ["danisan_tas", "hack"] }).ok, "");
  add("parse-valid-module", (() => { const r = parseClientSearchRequest({ q: "a", modules: ["danisan_tas"] }); return r.ok && r.value.modules?.length === 1; })(), "");
  add("parse-invalid-date", !parseClientSearchRequest({ q: "a", dateFrom: "notadate" }).ok, "");
  add("parse-valid-date", parseClientSearchRequest({ q: "a", dateFrom: "2026-01-01", dateTo: "2026-02-01" }).ok, "");
  add("parse-limit-bad", !parseClientSearchRequest({ q: "a", limit: 0 }).ok && !parseClientSearchRequest({ q: "a", limit: 999 }).ok, "");
  add("date-window", withinDateWindow("2026-01-15", "2026-01-01", "2026-01-31") && !withinDateWindow("2026-03-01", "2026-01-01", "2026-01-31") && !withinDateWindow(null, "2026-01-01", undefined), "");
}

// ── result DTO (no tenant/pii; module allowlist) ──
{
  const rpcRow: ClientRpcRow = {
    id: SID, source_module: "danisan_tas", source_table: "client_stones", source_id: SID,
    unit_type: "record", title: "Ametist", snippet: "mor", evidence_fields: [{ kind: "title", text: "ametist" }],
    topic_tags: ["kuvars"], expert_relations: [], occurred_at: "2026-01-10", source_updated_at: null,
  };
  const dto = toClientSearchResult(rpcRow);
  add("dto-mapped", dto !== null && dto.module === "danisan_tas" && dto.isClientScoped === true, "");
  add("dto-no-tenant-field", dto !== null && !("tenant_id" in (dto as unknown as Record<string, unknown>)) && !("client_id" in (dto as unknown as Record<string, unknown>)), "");
  add("dto-sourcelink-allowlist", dto?.sourceLink === "/dogaltas", dto?.sourceLink ?? "null");
  const unknownMod = toClientSearchResult({ ...rpcRow, source_module: "EVIL" });
  add("dto-unknown-module-null", unknownMod === null, "");
  const results = [dto!, { ...dto!, id: "x", module: "danisan_seans" as const, moduleLabel: "Seans" }];
  add("facets", computeClientFacets(results).length === 2, "");
  add("filter", filterClientByModules(results, ["danisan_seans"]).length === 1, "");
  add("moduleLabel+isModule", clientModuleLabel("randevu") === "Randevu" && isClientSourceModule("human_design") && !isClientSourceModule("x") && clientSourceLinkFor("zzz") === null, "");
}

// ── retrieval adapter (unavailable/error/rows + client scope passed) ──
async function retrievalChecks(): Promise<void> {
  const mkDb = (behavior: "unavail" | "err" | "rows"): { db: ClientRpcDb; seen: Record<string, unknown> } => {
    const seen: Record<string, unknown> = {};
    const db: ClientRpcDb = {
      async rpc(fn, args) {
        seen.fn = fn;
        seen.args = args;
        if (behavior === "unavail") return { data: null, error: { code: "42883", message: "undefined function" } };
        if (behavior === "err") return { data: null, error: { code: "XX000", message: "boom" } };
        return { data: [], error: null };
      },
    };
    return { db, seen };
  };
  const un = mkDb("unavail");
  add("retrieval-unavailable", (await runClientRetrieval(un.db, { rawQuery: "ametist", sessionTenantId: TENANT, clientId: CLIENT, limit: 50 })).kind === "unavailable", "");
  const er = mkDb("err");
  add("retrieval-error", (await runClientRetrieval(er.db, { rawQuery: "ametist", sessionTenantId: TENANT, clientId: CLIENT, limit: 50 })).kind === "error", "");
  const rw = mkDb("rows");
  const rowsOut = await runClientRetrieval(rw.db, { rawQuery: "ametist", sessionTenantId: TENANT, clientId: CLIENT, limit: 50 });
  const args = rw.seen.args as Record<string, unknown>;
  add("retrieval-rows", rowsOut.kind === "rows", "");
  add("retrieval-scope-from-input", args?.p_session_tenant === TENANT && args?.p_client_id === CLIENT, "");
  add("retrieval-noop-empty-query", (await runClientRetrieval(rw.db, { rawQuery: "   ", sessionTenantId: TENANT, clientId: CLIENT, limit: 50 })).kind === "noop", "");
}

// ── snapshot builder (server-derived, immutable contract, limits) ──
function snapshotChecks(): void {
  const cand = { sourceModule: "danisan_tas", sourceTable: "client_stones", sourceId: SID, title: "Ametist", selectedText: "mor kuvars", evidence: [{ kind: "title", text: "ametist" }] };
  const ctx = { tenantId: TENANT, clientId: CLIENT, targetKind: "report" as const, selectionGroup: SEL, selectedBy: ACTOR };
  const r = buildReportSnapshot(cand, ctx);
  add("snap-ok", r.ok, r.ok ? "" : r.code);
  add("snap-hash", r.ok && typeof r.row.content_hash === "string" && (r.row.content_hash as string).length === 64, "");
  add("snap-immutable-fields", r.ok && r.row.tenant_id === TENANT && r.row.client_id === CLIENT && r.row.selected_by === ACTOR, "");
  add("snap-bad-scope", !buildReportSnapshot(cand, { ...ctx, tenantId: "bad" }).ok, "");
  add("snap-bad-target", !buildReportSnapshot(cand, { ...ctx, targetKind: "x" as unknown as "report" }).ok, "");
  add("snap-text-too-long", !buildReportSnapshot({ ...cand, selectedText: "x".repeat(8001) }, ctx).ok, "");
  const r2 = buildReportSnapshot(cand, ctx);
  add("snap-hash-deterministic", r.ok && r2.ok && r.row.content_hash === r2.row.content_hash, "");
}

// ── migration statik denetimi (DDL-only, dormant, professional dokunulmadı) ──
function migrationChecks(): void {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260923000000_yasam_hafizasi_client_memory_core.sql"), "utf8");
  const has = (re: RegExp): boolean => re.test(sql);
  add("mig-client-index", has(/CREATE TABLE IF NOT EXISTS public\.yasam_hafizasi_client_index/), "");
  add("mig-client-rpc-invoker", has(/FUNCTION public\.yh_search_client_candidates/) && has(/SECURITY INVOKER/) && has(/SET search_path = public, pg_catalog/), "");
  add("mig-rpc-revoke-grant", has(/REVOKE ALL ON FUNCTION public\.yh_search_client_candidates[\s\S]*FROM PUBLIC, anon, authenticated/) && has(/GRANT EXECUTE ON FUNCTION public\.yh_search_client_candidates[\s\S]*TO service_role/), "");
  add("mig-pii-check", has(/CHECK \(is_client_pii = false\)/), "");
  add("mig-composite-fk", has(/FOREIGN KEY \(tenant_id, client_id\)/) && has(/REFERENCES public\.clients \(tenant_id, id\)/), "");
  add("mig-clients-unique", has(/clients_tenant_id_id_key UNIQUE \(tenant_id, id\)/), "");
  add("mig-snapshot-immutable", has(/BEFORE UPDATE ON public\.yasam_hafizasi_report_snapshots/) && has(/RAISE EXCEPTION 'yasam_hafizasi_report_snapshots immutable/), "");
  // Professional index/RPC MUTASYONU yok (yalnız yorumda adı geçebilir / trigger fn reuse serbest).
  add(
    "mig-professional-untouched",
    !has(/CREATE OR REPLACE FUNCTION public\.yh_search_candidates\b/) &&
      !has(/(?:CREATE|ALTER|DROP)\s+TABLE[^\n;]*public\.yasam_hafizasi_index\b/i) &&
      !has(/CREATE[\s\S]{0,60}TRIGGER[\s\S]{0,120}ON public\.yasam_hafizasi_index\b/i),
    "",
  );
  // NO CDC trigger on any source table:
  const sourceTables = ["client_combinations", "client_stones", "client_sessions", "client_homeworks", "appointments", "human_design_charts"];
  const noSourceTrigger = sourceTables.every((t) => !new RegExp(`CREATE TRIGGER[\\s\\S]*ON public\\.${t}\\b`).test(sql));
  add("mig-no-source-cdc-trigger", noSourceTrigger, "");
  // NO data DML / bulk backfill:
  add("mig-no-data-dml", !/\bINSERT\s+INTO\b/i.test(sql) && !/\bDELETE\s+FROM\b/i.test(sql) && !/\bUPDATE\s+public\./i.test(sql) && !/\bSELECT[\s\S]*FROM public\.client_/i.test(sql), "");
}

async function main(): Promise<void> {
  await retrievalChecks();
  snapshotChecks();
  migrationChecks();

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-14 P1 HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();

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
  clientDetailDeepLink,
  clientResultDisplayTitle,
  CLIENT_MODULE_DETAIL_TAB,
  isClientSourceModule,
  type ClientSourceConfig,
} from "@/lib/yasam-hafizasi/client/clientSources";
import { buildClientIndexUnit, toClientIndexDbRow } from "@/lib/yasam-hafizasi/client/clientIndexUnit";
import { parseClientSearchRequest, withinDateWindow } from "@/lib/yasam-hafizasi/client/clientSearchRequest";
import {
  computeClientFacets,
  filterClientByModules,
  toClientSearchResult,
  humanizeClientText,
  type ClientRpcRow,
} from "@/lib/yasam-hafizasi/client/clientSearchResult";
import { toTenantClientSearchResult, type TenantClientRpcRow } from "@/lib/yasam-hafizasi/client/tenantClientSearchResult";
import { runClientRetrieval, type ClientRpcDb } from "@/lib/yasam-hafizasi/client/clientRetrieval";
import { buildReportSnapshot } from "@/lib/yasam-hafizasi/client/snapshotBuilder";

const TENANT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const CLIENT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const SEL = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

// ── clientSources + PII denylist ──
add("sources-code-gate-open", YH_CLIENT_INDEX_SOURCES.every((s) => s.enabled === true), "");
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

// ── clientIndexUnit (Private Memory: klinik metin ARANABİLİR; kimlik index DIŞI) ──
{
  const cfg = YH_CLIENT_INDEX_SOURCES.find((s) => s.sourceKey === "danisan:sessions") as ClientSourceConfig;
  const CLINICAL = "bas_agrisi_klinik_sentinel";
  const row = {
    id: SID,
    client_id: CLIENT,
    tenant_id: TENANT,
    session_type: "Refleksoloji Seansı",
    session_date: "2026-01-15",
    session_note: CLINICAL,
    suggestions: "oneri_" + CLINICAL,
    fee: 500,
    duration_minutes: 45,
  };
  const unit = buildClientIndexUnit(cfg, row, { tenantId: TENANT, clientId: CLIENT });
  add("unit-built", unit !== null, "");
  add("unit-scope", unit?.tenantId === TENANT && unit?.clientId === CLIENT, "");
  add("unit-title-safe", unit?.title === "Refleksoloji Seansı", unit?.title ?? "");
  add("unit-occurred", unit?.occurredAt === "2026-01-15", unit?.occurredAt ?? "");
  // md.1: klinik serbest metin (seans notu) searchText'te ARANABİLİR.
  add("unit-clinical-indexed", unit !== null && (unit.searchText ?? "").includes(CLINICAL), "klinik metin indexlenmeli");
  const dbrow = unit ? toClientIndexDbRow(unit) : {};
  add("dbrow-is_client_pii-false", (dbrow as Record<string, unknown>).is_client_pii === false, "");
  // determinism
  const unit2 = buildClientIndexUnit(cfg, row, { tenantId: TENANT, clientId: CLIENT });
  add("unit-hash-deterministic", unit?.contentHash === unit2?.contentHash, "");
  // Evidence Gate: indexlenebilir içerik yok (yalnız denylist fee) → null
  const empty = buildClientIndexUnit(cfg, { id: SID, fee: 500 }, { tenantId: TENANT, clientId: CLIENT });
  add("unit-evidence-gate-null", empty === null, "");
  // bad uuid → null
  add("unit-bad-uuid-null", buildClientIndexUnit(cfg, { id: "nope", session_type: "x" }, { tenantId: TENANT, clientId: CLIENT }) === null, "");
}

// ── notes: klinik metin ARANABİLİR; adres (doğrudan kimlik, md.3) index DIŞI ──
{
  const notesCfg = YH_CLIENT_INDEX_SOURCES.find((s) => s.sourceKey === "danisan:notes") as ClientSourceConfig;
  const CLIN = "bas_agrisi_saglik_notu";
  const IDN = "MAH_SOKAK_NO5_ADRES_SENTINEL";
  const nrow = { id: SID, client_id: CLIENT, tenant_id: TENANT, saglik_notu: CLIN, adres: IDN, oneriler: "duzenli_su", notlar: "" };
  const nunit = buildClientIndexUnit(notesCfg, nrow, { tenantId: TENANT, clientId: CLIENT });
  add("notes-built", nunit !== null, "");
  add("notes-module", nunit?.sourceModule === "danisan_not", nunit?.sourceModule ?? "");
  add("notes-clinical-indexed", nunit !== null && (nunit.searchText ?? "").includes(CLIN), "sağlık notu indexlenmeli");
  add("notes-identity-denylist-unit", nunit !== null && !JSON.stringify(nunit).includes(IDN), "adres index'e SIZAMAZ");
  const ndb = nunit ? toClientIndexDbRow(nunit) : {};
  add("notes-identity-denylist-dbrow", !JSON.stringify(ndb).includes(IDN), "");
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

// ── UX POLISH: legacy JSON normalization + fallback title + client deep-link ──
{
  const CLIENT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const LEGACY = '[{"id":"legacy","content":"kulak çınlaması, tansiyon ve daha önce tedavi süreci tamamlanmış vertigo.","createdAt":"","updatedAt":"2026-08-24T08:54:08.249Z"}]';

  // 1) legacy JSON → yalnız content görünür (ham JSON/teknik metadata YOK).
  const h = humanizeClientText(LEGACY);
  add("humanize-legacy-content-only", h === "kulak çınlaması, tansiyon ve daha önce tedavi süreci tamamlanmış vertigo.", h);
  add("humanize-no-json-syntax", !h.includes("{") && !h.includes("[") && !h.includes("\":\""), h);
  add("humanize-no-internal-metadata", !h.includes("legacy") && !h.includes("createdAt") && !h.includes("updatedAt") && !h.includes("2026-08-24T08:54:08"), h);

  // 2) plain-text → değişmeden korunur.
  add("humanize-plaintext-unchanged", humanizeClientText("kulak çınlaması ve tansiyon") === "kulak çınlaması ve tansiyon", "");
  // JSON-benzeri olmayan köşeli-parantez içeren düz metin bozulmaz (parse edilmez).
  add("humanize-bracketish-plaintext", humanizeClientText("[önemli] tansiyon takibi") === "[önemli] tansiyon takibi", "");

  // 3) malformed JSON → crash yok, düz metin fallback.
  add("humanize-malformed-fallback", humanizeClientText('[{"content": "yarim') === '[{"content": "yarim', "");
  // valid JSON ama content yok → ham JSON dump YOK (boş).
  add("humanize-no-content-no-dump", humanizeClientText('[{"id":"x","note":"gizli"}]') === "", "");
  // string dizisi → birleşик.
  add("humanize-string-array", humanizeClientText('["a","b"]') === "a\nb", "");
  // empty/whitespace korunur (fallback null katmanı UI'da).
  add("humanize-empty", humanizeClientText("") === "", "");

  // 4) DTO: legacy JSON evidence/snippet/title humanize edilir; internal metadata sızmaz.
  const legacyRow: ClientRpcRow = {
    id: SID, source_module: "danisan_not", source_table: "client_notes", source_id: SID,
    unit_type: "record", title: null, snippet: LEGACY,
    evidence_fields: [{ kind: "paragraph", text: LEGACY }, { kind: "paragraph", text: "düz sağlık notu" }],
    topic_tags: [], expert_relations: [], occurred_at: null, source_updated_at: null,
  };
  const legacyDto = toClientSearchResult(legacyRow);
  add("dto-legacy-evidence-humanized", legacyDto !== null && legacyDto.evidence.some((e) => e.text.includes("vertigo")) && !JSON.stringify(legacyDto.evidence).includes("createdAt"), "");
  add("dto-legacy-snippet-humanized", legacyDto?.snippet === "kulak çınlaması, tansiyon ve daha önce tedavi süreci tamamlanmış vertigo.", legacyDto?.snippet ?? "null");
  // Ham JSON sözdizimi + iç metadata DEĞERLERİ sızmamalı (DTO'nun kendi updatedAt ALANI meşru; onu arama).
  add("dto-legacy-no-raw-json-anywhere", legacyDto !== null && !JSON.stringify(legacyDto).includes("\\\"id\\\":\\\"legacy\\\"") && !JSON.stringify(legacyDto).includes("2026-08-24T08:54:08"), "");
  add("dto-legacy-plain-evidence-kept", legacyDto !== null && legacyDto.evidence.some((e) => e.text === "düz sağlık notu"), "");

  // 5+6) fallback title contract (gerçek title KORUNUR; yoksa modül-tipi fallback).
  add("title-fallback-not", clientResultDisplayTitle("danisan_not", null) === "Danışan Notu", "");
  add("title-fallback-seans", clientResultDisplayTitle("danisan_seans", null) === "Danışan Seansı", "");
  add("title-fallback-odev", clientResultDisplayTitle("danisan_odev", null) === "Danışan Ödevi", "");
  add("title-fallback-randevu", clientResultDisplayTitle("randevu", null) === "Randevu", "");
  add("title-fallback-tas", clientResultDisplayTitle("danisan_tas", null) === "Danışan Taşı", "");
  add("title-fallback-kombinasyon", clientResultDisplayTitle("danisan_kombinasyon", null) === "Taş Kombinasyonu", "");
  add("title-real-preserved", clientResultDisplayTitle("danisan_not", "Gerçek Başlık") === "Gerçek Başlık", "");
  add("title-empty-uses-fallback", clientResultDisplayTitle("danisan_not", "   ") === "Danışan Notu", "");
  add("title-unknown-module-generic", clientResultDisplayTitle("zzz", null) === "Danışan Kaydı", "");

  // 7+8+9) deep-link: ilgili DANIŞAN + modül sekmesi (generic modül ana sayfası DEĞİL).
  add("deeplink-not-tab", clientDetailDeepLink(CLIENT_ID, "danisan_not") === `/dashboard/clients/${CLIENT_ID}?tab=notlar`, "");
  add("deeplink-seans-tab", clientDetailDeepLink(CLIENT_ID, "danisan_seans") === `/dashboard/clients/${CLIENT_ID}?tab=seanslar`, "");
  add("deeplink-odev-tab", clientDetailDeepLink(CLIENT_ID, "danisan_odev") === `/dashboard/clients/${CLIENT_ID}?tab=odevler`, "");
  add("deeplink-randevu-tab", clientDetailDeepLink(CLIENT_ID, "randevu") === `/dashboard/clients/${CLIENT_ID}?tab=randevular`, "");
  add("deeplink-tas-tab", clientDetailDeepLink(CLIENT_ID, "danisan_tas") === `/dashboard/clients/${CLIENT_ID}?tab=taslar`, "");
  add("deeplink-kombinasyon-tab", clientDetailDeepLink(CLIENT_ID, "danisan_kombinasyon") === `/dashboard/clients/${CLIENT_ID}?tab=taslar`, "");
  // Tüm modüller geçerli sekmeye map olur (VALID_TABS ile hizalı — page.tsx allowlist).
  add("deeplink-all-modules-valid-tab", Object.values(CLIENT_MODULE_DETAIL_TAB).every((t) => ["notlar","seanslar","odevler","randevular","taslar","hafiza"].includes(t)), "");
  add("deeplink-not-generic-module-home", clientDetailDeepLink(CLIENT_ID, "danisan_not") !== "/danisan-yolculugu", "");

  // 10) foreign/invalid client id → null (fail-closed; generic route'a DÜŞMEZ).
  add("deeplink-bad-uuid-null", clientDetailDeepLink("not-a-uuid", "danisan_not") === null, "");
  add("deeplink-empty-uuid-null", clientDetailDeepLink("", "danisan_not") === null, "");

  // tenant-wide DTO: clientDeepLink alanı doğru danışana bağlanır + humanize korunur.
  const tRow: TenantClientRpcRow = { ...legacyRow, client_id: CLIENT_ID };
  const tDto = toTenantClientSearchResult(tRow, new Map([[CLIENT_ID, "hasan arıcı"]]));
  add("tenant-dto-deeplink", tDto?.clientDeepLink === `/dashboard/clients/${CLIENT_ID}?tab=notlar`, tDto?.clientDeepLink ?? "null");
  add("tenant-dto-name-resolved", tDto?.clientName === "hasan arıcı", tDto?.clientName ?? "null");
  add("tenant-dto-humanized-evidence", tDto !== null && tDto.evidence.some((e) => e.text.includes("vertigo")) && !JSON.stringify(tDto).includes("createdAt"), "");
  // bad client_id satırı DTO'dan elenir (fail-closed).
  add("tenant-dto-bad-client-null", toTenantClientSearchResult({ ...legacyRow, client_id: "bad" }, new Map()) === null, "");

  // page.tsx URL-addressable tab desteği wired (statik).
  const page = readFileSync(join(process.cwd(), "app/dashboard/clients/[id]/page.tsx"), "utf8");
  add("page-valid-tabs-allowlist", /const VALID_TABS = new Set\(/.test(page) && /"notlar"/.test(page) && /"seanslar"/.test(page), "");
  add("page-reads-tab-param", /new URLSearchParams\(window\.location\.search\)\.get\("tab"\)/.test(page) && /VALID_TABS\.has\(t\)/.test(page), "");
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

// ── Private Memory yeni migration'ları (Delta A/C/E) statik denetimi ──
function privateMemoryMigrationChecks(): void {
  const read = (f: string): string => readFileSync(join(process.cwd(), "supabase/migrations/" + f), "utf8");

  // Delta A — private reclassify + per-client RPC (is_client_pii filtresi kalkar)
  const a = read("20261218000000_yh_client_index_private_reclassify.sql");
  // SQL yorumlarını at (yalnız gerçek predicate'i denetle; açıklama yorumları yanıltmasın).
  const aSql = a.replace(/--[^\n]*/g, "");
  add("A-drop-pii-check", /DROP CONSTRAINT IF EXISTS yhci_no_pii_chk/.test(a), "");
  add("A-rpc-replace", /CREATE OR REPLACE FUNCTION public\.yh_search_client_candidates/.test(a), "");
  add("A-rpc-no-pii-filter", !/is_client_pii = false/.test(aSql), "PII filtresi (gerçek predicate) kaldırılmalı");
  add("A-rpc-invoker", /SECURITY INVOKER/.test(a) && /SET search_path = public, pg_catalog/.test(a), "");
  add(
    "A-rpc-service-role-only",
    /REVOKE ALL ON FUNCTION public\.yh_search_client_candidates[\s\S]*FROM PUBLIC, anon, authenticated/.test(a) &&
      /GRANT EXECUTE ON FUNCTION public\.yh_search_client_candidates[\s\S]*TO service_role/.test(a),
    "",
  );
  add(
    "A-professional-untouched",
    !/CREATE OR REPLACE FUNCTION public\.yh_search_candidates\b/.test(a) &&
      !/(ALTER|DROP|CREATE)\s+(TABLE|TRIGGER)[^\n;]*public\.yasam_hafizasi_index\b/i.test(a),
    "",
  );
  add("A-no-data-dml", !/\bINSERT\s+INTO\b/i.test(a) && !/\bDELETE\s+FROM\b/i.test(a), "");

  // Delta C — tenant-wide RPC (client_id filtresi YOK; client_id döner)
  const c = read("20261218000100_yh_search_tenant_client_candidates.sql");
  add("C-rpc-create", /CREATE OR REPLACE FUNCTION public\.yh_search_tenant_client_candidates/.test(c), "");
  add("C-rpc-returns-client-id", /RETURNS TABLE[\s\S]*client_id\s+uuid/.test(c), "");
  add("C-rpc-no-client-filter", !/i\.client_id = /.test(c), "tenant-wide: client filtresi olmamalı");
  add("C-rpc-tenant-required", /p_session_tenant IS NULL/.test(c) && /i\.tenant_id = p_session_tenant/.test(c), "");
  add("C-rpc-demo-excluded", /IS DISTINCT FROM c_demo_tenant/.test(c), "");
  add(
    "C-rpc-invoker-service-role",
    /SECURITY INVOKER/.test(c) &&
      /GRANT EXECUTE ON FUNCTION public\.yh_search_tenant_client_candidates[\s\S]*TO service_role/.test(c),
    "",
  );
  add(
    "C-professional-untouched",
    !/CREATE OR REPLACE FUNCTION public\.yh_search_candidates\b/.test(c) &&
      !/(ALTER|DROP|CREATE)\s+(TABLE|TRIGGER)[^\n;]*public\.yasam_hafizasi_index\b/i.test(c),
    "",
  );

  // Delta E — client CDC outbox + 6 trigger (client_id yakalar; coalescing; kilitli)
  const e = read("20261218000200_yh_client_cdc_outbox.sql");
  add("E-outbox-table", /CREATE TABLE IF NOT EXISTS public\.yasam_hafizasi_client_outbox/.test(e), "");
  add("E-outbox-has-client-id", /client_id\s+uuid\s+NOT NULL/.test(e), "");
  add(
    "E-enqueue-fn-definer",
    /CREATE OR REPLACE FUNCTION public\.yh_client_outbox_enqueue/.test(e) &&
      /SECURITY DEFINER/.test(e) &&
      /SET search_path = public, pg_catalog/.test(e),
    "",
  );
  add("E-enqueue-captures-client", /v_client_id := NEW\.client_id/.test(e) && /v_client_id := OLD\.client_id/.test(e), "");
  add("E-enqueue-fail-closed-client", /client_id null/.test(e), "");
  add("E-coalescing", /ON CONFLICT \(source_key, source_id\) DO UPDATE/.test(e), "");
  const cohort = ["client_combinations", "client_stones", "client_sessions", "client_homeworks", "appointments", "client_notes"];
  add("E-6-triggers", cohort.every((t) => new RegExp(`CREATE TRIGGER[\\s\\S]*ON public\\.${t}\\b`).test(e)), cohort.filter((t) => !new RegExp(`CREATE TRIGGER[\\s\\S]*ON public\\.${t}\\b`).test(e)).join(","));
  add(
    "E-outbox-anon-locked",
    /REVOKE ALL PRIVILEGES ON TABLE public\.yasam_hafizasi_client_outbox FROM anon, authenticated/.test(e) &&
      /ENABLE ROW LEVEL SECURITY/.test(e),
    "",
  );
  add("E-enqueue-execute-locked", /REVOKE ALL ON FUNCTION public\.yh_client_outbox_enqueue\(\) FROM PUBLIC, anon, authenticated/.test(e), "");
  // NO backfill (kaynak client_ tablolarından INSERT..SELECT tarama YOK):
  add("E-no-backfill", !/INSERT[\s\S]{0,40}SELECT[\s\S]{0,120}FROM public\.client_/i.test(e), "");
  // Professional outbox MUTASYONU yok (yalnız yorumda adı geçebilir).
  add(
    "E-professional-outbox-untouched",
    !/(ALTER|DROP|CREATE)\s+(TABLE|TRIGGER)[^\n;]*public\.yasam_hafizasi_outbox\b/i.test(e) &&
      !/ON public\.yasam_hafizasi_outbox\b/i.test(e),
    "",
  );
}

async function main(): Promise<void> {
  await retrievalChecks();
  snapshotChecks();
  migrationChecks();
  privateMemoryMigrationChecks();

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-14 P1 HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();

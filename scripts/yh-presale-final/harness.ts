// Yaşam Hafızası™ — SATIŞ ÖNCESİ NİHAİ harness (saf; AĞ/DB YOK).
// Owner tenant ayrıştırması · outbox sonuç kodları · NULL/PII olayları · webhook replay atlaması ·
// replay isteği + SQL allowlist eşitliği · drain bütçesi · SQL modül filtresi · Beslenme composer ·
// başlık zenginleştirme · Doğaltaş demo okuma kuralı · arşiv izni · aktivasyon hata yayılımı.
// Çalıştırma: npx tsx scripts/yh-presale-final/harness.ts

import { readFileSync } from "node:fs";
import * as path from "node:path";

import { OWNER_TENANT_ID, SYNTHETIC_TENANT_IDS, isSyntheticTenantId } from "../../lib/tenancy/syntheticTenants";
import {
  outcomeOfNote,
  processOutboxEvent,
  runOutboxBatch,
  YH_OUTBOX_OUTCOMES,
  type EventProcessorDeps,
  type OutboxBatchDeps,
} from "../../lib/yasam-hafizasi/outbox/eventProcessor";
import { clientOutcomeOfNote } from "../../lib/yasam-hafizasi/client/clientEventProcessor";
import { decideWebhookAction } from "../../lib/yasam-hafizasi/outbox/webhookBridge";
import {
  validateReplayRequest,
  YH_REPLAY_SOURCE_KEYS,
  toCoverageRows,
} from "../../lib/yasam-hafizasi/replay/replayRequest";
import { yhSqlModuleFilter, resolveYhModuleScope } from "../../lib/yasam-hafizasi/moduleScope";
import { YH_SOURCE_MODULES } from "../../lib/yasam-hafizasi/config";
import { YH_INDEX_SOURCES, type SourceConfig } from "../../lib/yasam-hafizasi/indexer/sources";
import {
  composeBeslenmeFoodRow,
  composeBeslenmeTemplateRow,
  composeBeslenmeTopicRow,
  isBeslenmeParentIndexable,
  BESLENME_SYSTEM_TENANT_ID,
  BESLENME_TOPIC_TEXT_CAP,
} from "../../lib/yasam-hafizasi/indexer/beslenmeSource";
import { runIndexUnit } from "../../lib/yasam-hafizasi/indexer/runIndexUnit";
import { evaluateRowEligibility } from "../../lib/yasam-hafizasi/indexer/rowEligibility";
import {
  enrichSourceRows,
  firstMeaningfulCell,
  sourceSelectColumns,
  type IndexDbClient,
} from "../../lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { runOutboxDrain } from "../../lib/yasam-hafizasi/outbox/outboxDrain";
import { stoneReadTenantIds } from "../../lib/dogaltas/stoneTenantScope";
import type { ClaimedOutboxEvent } from "../../lib/yasam-hafizasi/outbox/outboxRpcClient";

const root = path.join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function add(name: string, ok: boolean, detail = ""): void {
  results.push({ name, ok, detail });
}
const cfg = (k: string) => (YH_INDEX_SOURCES as readonly SourceConfig[]).find((s) => s.sourceKey === k)!;

const TENANT_A = "a0000000-0000-4000-8000-00000000000a";
const SRC = "c0000000-0000-4000-8000-00000000000c";

function ev(sourceKey: string, tenantId: string | null, operation: "upsert" | "delete" = "upsert"): ClaimedOutboxEvent {
  return {
    id: "e0000000-0000-4000-8000-00000000000e",
    sourceKey,
    sourceTable: cfg(sourceKey)?.tableName ?? "x",
    sourceId: SRC,
    tenantId,
    operation,
    attempts: 1,
    eventVersion: 7,
  } as unknown as ClaimedOutboxEvent;
}
function baseDeps(over: Partial<EventProcessorDeps> = {}): EventProcessorDeps {
  return {
    resolveConfig: (k) => cfg(k) ?? null,
    runExactUpsert: async () => ({ exactStatus: "ok", write: { errors: [] } }) as never,
    deindex: async () => ({ status: "ok" }) as never,
    isSourceProcessingActive: async () => true,
    ...over,
  };
}

async function run(): Promise<void> {
  // ═══ A) Owner tenant ayrıştırması ═══
  add("A-owner-not-synthetic", isSyntheticTenantId(OWNER_TENANT_ID) === false);
  add("A-synthetic-list-empty", SYNTHETIC_TENANT_IDS.length === 0);
  const gateSrc = read("lib/yasam-hafizasi/indexer/tenantScopeGate.ts");
  add("A-scope-gate-uses-list", /isSyntheticTenantId\(tenantId\)/.test(gateSrc) && !/ADMIN_LIBRARY_TENANT_ID/.test(gateSrc));
  add("A-no-literal-owner-in-yh-lib", !/aa8b960b/.test(read("lib/yasam-hafizasi/indexer/tenantScopeGate.ts") + read("scripts/yh-exact-record-write-driver.ts")));

  // ═══ B) Outbox sonuç kodları ═══
  const notes = ["upsert-ok", "delete-one", "delete-none", "inactive-source-noop", "shared-excluded", "pii-excluded",
    "defensive-deindex:not-found", "defensive-deindex:skipped-build", "defensive-deindex:excluded-demo",
    "defensive-deindex:excluded-synthetic", "defensive-deindex:row-ineligible"];
  add("B-all-notes-mapped", notes.every((n) => outcomeOfNote(n) !== null), notes.filter((n) => outcomeOfNote(n) === null).join(","));
  add("B-outcomes-vocab", notes.every((n) => (YH_OUTBOX_OUTCOMES as readonly string[]).includes(String(outcomeOfNote(n)))));
  add("B-upsert-indexed", outcomeOfNote("upsert-ok") === "indexed" && outcomeOfNote("defensive-deindex:not-found") === "source-not-found");
  add("B-unknown-note-null", outcomeOfNote("garbage") === null);
  add("B-client-preactivation", clientOutcomeOfNote("pre-activation-upsert-noop") === "inactive-source" && clientOutcomeOfNote("upsert-ok") === "indexed");
  add("B-outcome-sql-safe", (YH_OUTBOX_OUTCOMES as readonly string[]).every((o) => /^[a-z][a-z-]*$/.test(o) && o.length <= 64));

  // runOutboxBatch complete'e sonucu geçirir + dağılımı sayar.
  const completes: Array<string | null> = [];
  const batchDeps: OutboxBatchDeps = {
    ...baseDeps({
      runExactUpsert: async () => ({ exactStatus: "not-found", write: null }) as never,
      deindex: async () => ({ status: "no-op" }) as never,
    }),
    worker: "w", claimBatch: 10, leaseSeconds: 300, permanentMaxAttempts: 1, transientMaxAttempts: 8,
    baseDelaySeconds: 30, maxDelaySeconds: 3600,
    sweep: async () => [],
    claim: async () => [ev("kupa_hacamat:points", TENANT_A), ev("kupa_hacamat:points", null)],
    complete: async (_id, _w, _v, outcome) => { completes.push(outcome); return "succeeded"; },
    fail: async () => "dead",
  };
  const sum = await runOutboxBatch(batchDeps);
  add("B-batch-passes-outcome", JSON.stringify(completes) === JSON.stringify(["source-not-found", "shared-excluded"]), JSON.stringify(completes));
  add("B-batch-outcome-counts", sum.outcomes["source-not-found"] === 1 && sum.outcomes["shared-excluded"] === 1, JSON.stringify(sum.outcomes));

  // ═══ C) NULL tenant / PII olayları ═══
  for (const k of ["dogaltas:knowledge", "aromaterapi:oils", "aromaterapi:reference-sheets", "aromaterapi:reference-rows", "biyoenerji:symbols"]) {
    let wrote = false;
    const d = await processOutboxEvent(ev(k, null), baseDeps({ runExactUpsert: async () => { wrote = true; return { exactStatus: "ok", write: { errors: [] } } as never; } }));
    add(`C-null-tenant-excluded:${k}`, d.action === "complete" && (d as { note: string }).note === "shared-excluded" && !wrote, JSON.stringify(d));
  }
  const pii = await processOutboxEvent(ev("refleksoloji:notes", TENANT_A), baseDeps());
  add("C-pii-source-excluded", pii.action === "complete" && (pii as { note: string }).note === "pii-excluded", JSON.stringify(pii));
  const disabled = await processOutboxEvent(ev("numeroloji:sources", TENANT_A), baseDeps());
  add("C-disabled-source-permanent", disabled.action === "fail", JSON.stringify(disabled));
  add("C-no-shared-sources", (YH_INDEX_SOURCES as readonly SourceConfig[]).every((s) =>
    (s.tenant as { allowSharedNull?: boolean }).allowSharedNull !== true || s.tenant.mode === "global-canonical"));
  // Aktivasyon okuma hatası → transient (olay düşmez).
  const actErr = await processOutboxEvent(ev("kupa_hacamat:points", TENANT_A), baseDeps({ isSourceProcessingActive: async () => { throw new Error("x"); } }));
  add("C-activation-error-transient", actErr.action === "fail" && (actErr as { retryClass?: string }).retryClass === "transient", JSON.stringify(actErr));
  const gateRt = read("lib/yasam-hafizasi/activation/activationRuntimeGate.ts");
  add("C-activation-read-throws", /if \(error\) throw new Error\("activation-read-failed"\)/.test(gateRt) && !/if \(error \|\| !data\) return null/.test(gateRt));

  // ═══ D) Webhook: replay satırı Inngest tetiklemez ═══
  const tbl = "yasam_hafizasi_outbox";
  add("D-replay-insert-noop", decideWebhookAction({ type: "INSERT", table: tbl, record: { replay: true, event_version: 1 } }).kind === "noop");
  add("D-replay-bump-noop", decideWebhookAction({ type: "UPDATE", table: tbl, record: { replay: true, event_version: 3 }, old_record: { replay: true, event_version: 2 } }).kind === "noop");
  add("D-cdc-insert-send", decideWebhookAction({ type: "INSERT", table: tbl, record: { replay: false, event_version: 1 } }).kind === "send");
  add("D-legacy-no-flag-send", decideWebhookAction({ type: "INSERT", table: tbl, record: { event_version: 1 } }).kind === "send");
  add("D-cdc-bump-send", decideWebhookAction({ type: "UPDATE", table: tbl, record: { replay: false, event_version: 3 }, old_record: { replay: true, event_version: 2 } }).kind === "send");

  // ═══ E) Replay isteği doğrulama + SQL allowlist eşitliği ═══
  const m1 = read("supabase/migrations/20271004000000_yh_presale_final_infra.sql");
  const specBlock = m1.slice(m1.indexOf("FUNCTION public.yh_replay_source_spec"), m1.indexOf("AS v(source_key"));
  const sqlKeys = [...specBlock.matchAll(/\(\s*'([a-z_]+:[a-z-]+)'\s*,/g)].map((m) => m[1]).sort();
  add("E-allowlist-equals-sql", JSON.stringify(sqlKeys) === JSON.stringify([...YH_REPLAY_SOURCE_KEYS].sort()), `${sqlKeys.length} vs ${YH_REPLAY_SOURCE_KEYS.length}`);
  add("E-out-of-scope-absent", !YH_REPLAY_SOURCE_KEYS.some((k) => /^(numeroloji|human_design|yebs|danisan|kozmik)/.test(k)));
  const m3 = read("supabase/migrations/20271004000200_yh_presale_final_activation.sql");
  const m3Keys = [...m3.matchAll(/'([a-z_]+:[a-z-]+)'/g)].map((m) => m[1]).filter((k, i, a) => a.indexOf(k) === i).sort();
  add("E-m3-equals-replay-minus-keeplive", JSON.stringify(m3Keys) === JSON.stringify(YH_REPLAY_SOURCE_KEYS.filter((k) => k !== "dogaltas:stones").sort()), m3Keys.join(","));
  add("E-valid-enqueue", validateReplayRequest({ action: "enqueue", sourceKey: "kupa_hacamat:points", tenantId: OWNER_TENANT_ID, mode: "all" }).ok === true);
  add("E-reject-demo", (validateReplayRequest({ action: "enqueue", sourceKey: "kupa_hacamat:points", tenantId: "40f842a0-e3e8-448c-8971-9a938e1faccb", mode: "missing" }) as { code?: string }).code === "forbidden-tenant");
  add("E-reject-userless", (validateReplayRequest({ action: "enqueue", sourceKey: "kupa_hacamat:points", tenantId: "11111111-1111-1111-1111-111111111111", mode: "missing" }) as { code?: string }).code === "forbidden-tenant");
  add("E-reject-unknown-source", (validateReplayRequest({ action: "enqueue", sourceKey: "numeroloji:sources", tenantId: TENANT_A, mode: "missing" }) as { code?: string }).code === "invalid-source");
  add("E-reject-mode", (validateReplayRequest({ action: "enqueue", sourceKey: "kupa_hacamat:points", tenantId: TENANT_A, mode: "everything" }) as { code?: string }).code === "invalid-mode");
  add("E-reject-limit", (validateReplayRequest({ action: "enqueue", sourceKey: "kupa_hacamat:points", tenantId: TENANT_A, mode: "missing", limit: 9999 }) as { code?: string }).code === "invalid-limit");
  add("E-reject-cursor", (validateReplayRequest({ action: "enqueue", sourceKey: "kupa_hacamat:points", tenantId: TENANT_A, mode: "missing", afterId: "x'; drop" }) as { code?: string }).code === "invalid-cursor");
  add("E-reject-action", validateReplayRequest({ action: "delete-all" }).ok === false);
  add("E-coverage-rows-safe", JSON.stringify(toCoverageRows([{ tenant_id: TENANT_A, source_rows: "3", eligible: 2, indexed: 1, missing: 1, stale: 0, extra: "x" }]))
    === JSON.stringify([{ tenantId: TENANT_A, sourceRows: 3, eligible: 2, indexed: 1, missing: 1, stale: 0 }]));
  add("E-sql-no-direct-index-insert", !/INSERT INTO public\.yasam_hafizasi_index/.test(m1));
  add("E-sql-service-role-only", /GRANT EXECUTE ON FUNCTION public\.yh_outbox_replay_enqueue\(text, uuid, text, integer, uuid\) TO service_role;/.test(m1)
    && /REVOKE ALL ON FUNCTION public\.yh_outbox_replay_enqueue\(text, uuid, text, integer, uuid\) FROM PUBLIC, anon, authenticated;/.test(m1));
  const route = read("app/api/admin/yasam-hafizasi/replay/route.ts");
  add("E-route-main-admin-audit", /requireMainAdmin/.test(route) && /writeAdminAudit/.test(route) && route.indexOf("await writeAdminAudit(") > 0
    && route.indexOf("await writeAdminAudit(") < route.indexOf('db.rpc("yh_outbox_replay_enqueue"'));

  // ═══ F) Drain: bütçe / tavan / boş ═══
  {
    let calls = 0;
    const r = await runOutboxDrain(async () => { calls += 1; return { swept: 0, claimed: calls <= 2 ? 25 : 0, completed: 25, requeued: 0, failedPermanent: 0, failedTransient: 0, transportErrors: 0, outcomes: { indexed: 25 } }; },
      { claimBatch: 25, maxEvents: 1000, timeBudgetMs: 60_000 });
    add("F-drain-until-empty", r.stoppedBy === "empty" && r.hasMore === false && r.claimed === 50 && r.outcomes.indexed === 75, JSON.stringify(r));
  }
  {
    const r = await runOutboxDrain(async () => ({ swept: 0, claimed: 25, completed: 25, requeued: 0, failedPermanent: 0, failedTransient: 0, transportErrors: 0, outcomes: {} }),
      { claimBatch: 25, maxEvents: 60, timeBudgetMs: 60_000 });
    add("F-drain-max-events", r.stoppedBy === "max-events" && r.hasMore === true && r.claimed >= 60 && r.claimed <= 75, JSON.stringify(r));
  }
  {
    let t = 0;
    const r = await runOutboxDrain(async () => { t += 50_000; return { swept: 0, claimed: 10, completed: 10, requeued: 0, failedPermanent: 0, failedTransient: 0, transportErrors: 0, outcomes: {} }; },
      { claimBatch: 10, maxEvents: 500, timeBudgetMs: 80_000 }, () => t);
    add("F-drain-time-budget", r.stoppedBy === "time-budget" && r.hasMore === true && r.batches === 2, JSON.stringify(r));
  }

  // ═══ G) SQL modül filtresi (LIMIT'ten önce) ═══
  const expert = resolveYhModuleScope("expert", { yasam_hafizasi: true, energy_body: true, stones: false });
  const admin = resolveYhModuleScope("admin", {});
  const universe = YH_SOURCE_MODULES as readonly string[];
  add("G-admin-no-filter", yhSqlModuleFilter(admin, universe, null) === null);
  add("G-admin-requested", JSON.stringify(yhSqlModuleFilter(admin, universe, ["biyoenerji"])) === JSON.stringify(["biyoenerji"]));
  add("G-expert-only-active", JSON.stringify(yhSqlModuleFilter(expert, universe, null)) === JSON.stringify(["biyoenerji"]));
  add("G-expert-closed-requested-empty", JSON.stringify(yhSqlModuleFilter(expert, universe, ["dogaltas"])) === "[]");
  add("G-beslenme-module-gated", yhSqlModuleFilter(resolveYhModuleScope("expert", { beslenme: true }), universe, null)?.includes("beslenme") === true
    && yhSqlModuleFilter(expert, universe, null)?.includes("beslenme") === false);

  // ═══ H) Beslenme composer ═══
  const food = { id: SRC, tenant_id: TENANT_A, name_tr: "Elma", name_en: "Apple", aliases: ["amasya elması"], prep_state: "raw", description: "Lifli meyve", notes: "Kabuğuyla", is_active: true, updated_at: "2026-10-01T00:00:00Z", origin_food_id: "f0000000-0000-4000-8000-00000000000f" };
  const foodRow = composeBeslenmeFoodRow({
    food, groupName: "Meyveler", portions: [{ label_tr: "1 orta boy (150 g)", sort_order: 1 }],
    traditional: { thermal_quality: "cold", moisture_quality: "wet", notes: "Serinletici", framework_id: null }, frameworkName: "Mizaç",
    foodSources: [{ source_id: "s1", locator: "s.12", note: null, sort_order: 0 }],
    sourcesById: new Map([["s1", { id: "s1", title: "Besin Rehberi", authors: "Yazar", is_active: true }]]),
  });
  add("H-food-fork-tag", foodRow["fork_tag"] === "Kişisel kopya");
  add("H-food-no-nutrient-keys", !Object.keys(foodRow).some((k) => /nutrient|gram|energy|kcal/i.test(k)), Object.keys(foodRow).join(","));
  const foodUnit = runIndexUnit({ config: cfg("beslenme:foods"), row: foodRow });
  add("H-food-unit-built", foodUnit.status === "unit" && foodUnit.unit.title === "Elma" && foodUnit.unit.sourceModule === "beslenme", JSON.stringify(foodUnit.status));
  add("H-system-not-indexable", isBeslenmeParentIndexable({ tenant_id: BESLENME_SYSTEM_TENANT_ID, is_active: true }) === false
    && isBeslenmeParentIndexable({ tenant_id: TENANT_A, is_active: false }) === false && isBeslenmeParentIndexable({ tenant_id: TENANT_A, is_active: true }) === true);
  const tpl = composeBeslenmeTemplateRow({
    template: { id: SRC, tenant_id: TENANT_A, title: "Kahvaltı şablonu", template_type: "meal", note: "Genel öneri", is_active: true },
    meals: [{ meal_type: "breakfast", label: "Kahvaltı", note: "Ayşe Hanım kan şekeri yüksek", sort_order: 0 }],
    items: [{ food_name_snapshot: "Yulaf", portion_label_snapshot: "1 kase", note: "danışana özel", sort_order: 0 }],
  });
  add("H-template-excludes-copied-notes", !JSON.stringify(tpl).includes("Ayşe") && !JSON.stringify(tpl).includes("danışana özel") && tpl["note"] === "Genel öneri");
  const big = "x".repeat(BESLENME_TOPIC_TEXT_CAP + 5000);
  const topic = composeBeslenmeTopicRow({ topic: { id: SRC, tenant_id: TENANT_A, title: "Kalp", topic_type: "condition" }, sections: [{ heading: "H", content: big, sort_order: 0 }],
    topicFoods: [{ food_id: "f1", relation_type: "avoid", rationale: "Tuzlu", sort_order: 0 }], foodNamesById: new Map([["f1", "Turşu"]]) });
  add("H-topic-cap", String(topic["sections_text"]).length <= BESLENME_TOPIC_TEXT_CAP);
  add("H-topic-relation-label", JSON.stringify(topic["food_relations"]) === JSON.stringify(["Turşu (Kaçın)"]));
  add("H-beslenme-select-real-cols", JSON.stringify(sourceSelectColumns(cfg("beslenme:foods"))) === JSON.stringify(["id", "tenant_id"]));

  // ═══ I) Başlık zenginleştirme ═══
  add("I-first-cell-object", firstMeaningfulCell({ "1": "  ", "0": "Linalool", "2": "x" }) === "Linalool");
  add("I-first-cell-array", firstMeaningfulCell(["", "Terpen"]) === "Terpen");
  add("I-first-cell-none", firstMeaningfulCell({}) === null);
  const fakeDb = (tables: Record<string, Array<Record<string, unknown>>>): IndexDbClient => ({
    from: (t: string) => ({
      select: () => ({ in: async () => ({ data: tables[t] ?? [], error: null }) }),
    }),
  }) as unknown as IndexDbClient;
  const blocks = await enrichSourceRows(fakeDb({ bioenergy_chakras: [{ id: "ch1", tenant_id: TENANT_A, name: "Kök Çakra" }, { id: "ch2", tenant_id: "other", name: "Yabancı" }] }),
    cfg("biyoenerji:chakra-blocks"), [
      { id: "b1", tenant_id: TENANT_A, chakra_id: "ch1", section_key: "uygulamalar", block_title: null },
      { id: "b2", tenant_id: TENANT_A, chakra_id: "ch2", section_key: "genel-bakis", block_title: null },
    ]);
  add("I-chakra-title-fallback", blocks[0]["title_fallback"] === "Kök Çakra · Uygulamalar", String(blocks[0]["title_fallback"]));
  add("I-chakra-other-tenant-name-not-used", blocks[1]["title_fallback"] === "Genel Bakış", String(blocks[1]["title_fallback"]));
  const rows = await enrichSourceRows(fakeDb({ aromatherapy_reference_sheets: [{ id: "sh", tenant_id: TENANT_A, display_title: "Kimyasal Bileşenler" }] }),
    cfg("aromaterapi:reference-rows"), [
      { id: "r1", sheet_id: "sh", cells: { "0": "Linalool", "1": "Sakinleştirici" }, is_header: false },
      { id: "r2", sheet_id: "sh", cells: { "0": "Bileşen" }, is_header: true },
    ]);
  add("I-row-title", rows[0]["row_title"] === "Kimyasal Bileşenler · Linalool", String(rows[0]["row_title"]));
  add("I-header-row-ineligible", evaluateRowEligibility(cfg("aromaterapi:reference-rows"), rows[1]).eligible === false
    && evaluateRowEligibility(cfg("aromaterapi:reference-rows"), rows[0]).eligible === true);
  add("I-derived-not-selected", !sourceSelectColumns(cfg("biyoenerji:chakra-blocks")).includes("title_fallback")
    && sourceSelectColumns(cfg("biyoenerji:chakra-blocks")).includes("chakra_id")
    && !sourceSelectColumns(cfg("aromaterapi:reference-rows")).includes("row_kind"));
  add("I-symbols-title-fallback", JSON.stringify(cfg("biyoenerji:symbols").titleColumns) === JSON.stringify(["title", "symbol"]));

  // ═══ J) Doğaltaş demo/owner + arşiv izni ═══
  add("J-demo-reads-own-only", JSON.stringify(stoneReadTenantIds("40f842a0-e3e8-448c-8971-9a938e1faccb", true)) === JSON.stringify(["40f842a0-e3e8-448c-8971-9a938e1faccb"]));
  add("J-owner-reads-own", JSON.stringify(stoneReadTenantIds(OWNER_TENANT_ID, false)) === JSON.stringify([OWNER_TENANT_ID]));
  add("J-minerals-no-union", !/ADMIN_LIBRARY_TENANT_ID/.test(read("app/api/dogaltas/minerals/route.ts")));
  add("J-owner-stone-not-library-ui", /stone\.tenant_id !== sessionTenant/.test(read("app/dogaltas/dogaltas-listesi/page.tsx"))
    && /safeStone\.tenant_id !== sessionTenant/.test(read("app/dogaltas/dogaltas-listesi/[id]/page.tsx")));
  const arcRoute = read("app/api/yasam-hafizasi/archive-classification/route.ts");
  add("J-archive-permission-post-get", (arcRoute.match(/hasModulePermissionForProfile\(profile, "personal_archive"\)/g) ?? []).length === 2);
  add("J-archive-ui-wired", /ArchiveMemoryToggle/.test(read("app/dashboard/kisisel-arsiv/page.tsx")));

  // ── Sonuç ──
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  → ${r.detail}`}`);
  console.log(`\nYH PRESALE FINAL HARNESS: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length > 0) process.exitCode = 1;
}

void run();

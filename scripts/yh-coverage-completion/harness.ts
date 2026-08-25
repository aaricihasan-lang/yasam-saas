/**
 * YAŞAM HAFIZASI™ — PROFESSIONAL COVERAGE COMPLETION harness (PASS/BLOCKED).
 *
 * Kapsam: Kupa & Hacamat (5 professional source) + Biyoenerji V4 chakra-blocks (1) +
 * dogaltas:minerals organ_etkileri extraction sağlamlaştırması. SAF birim + fixture +
 * migration statik denetimi; production/DB YOK.  npm run yh:coverage-completion:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  YH_INDEX_SOURCES,
  hasWorkerCapability,
  type SourceConfig,
} from "@/lib/yasam-hafizasi/indexer/sources";
import { extractFields } from "@/lib/yasam-hafizasi/indexer/extractFields";
import { buildIndexUnit } from "@/lib/yasam-hafizasi/indexer/buildCandidate";
import { makeSearchText } from "@/lib/yasam-hafizasi/indexer/indexWritePlan";
import { evaluateRowEligibility } from "@/lib/yasam-hafizasi/indexer/rowEligibility";
import {
  YH_ACTIVATION_MATRIX,
  activationEntryOf,
  toDesired,
  validateActivationMatrix,
} from "@/lib/yasam-hafizasi/activation/activationMatrix";
import {
  evaluateProcessingGate,
  evaluateBackfillGate,
} from "@/lib/yasam-hafizasi/activation/activationState";
import { moduleLabel, sourceLinkFor } from "@/lib/yasam-hafizasi/ui/moduleLabels";
import { YH_SOURCE_MODULES } from "@/lib/yasam-hafizasi/config";
import { validateModuleSourceMatrix } from "@/lib/yasam-hafizasi/moduleSourceMatrix";

const TENANT = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SID = "dddddddd-dddd-4ddd-dddd-dddddddddddd";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const cfgByKey = new Map<string, SourceConfig>(YH_INDEX_SOURCES.map((s) => [s.sourceKey, s]));
const cfg = (k: string): SourceConfig => {
  const c = cfgByKey.get(k);
  if (!c) throw new Error(`kaynak yok: ${k}`);
  return c;
};

/** row → search_text (extractFields → buildIndexUnit → makeSearchText); null = index dışı. */
function searchTextFor(config: SourceConfig, row: Record<string, unknown>, tenantId = TENANT): string | null {
  const extracted = extractFields(config, row);
  const unit = buildIndexUnit(config, row, { ok: true, tenantId } as unknown as Parameters<typeof buildIndexUnit>[2], extracted);
  return unit ? makeSearchText(unit) : null;
}

const KUPA_KEYS = [
  "kupa_hacamat:knowledge", "kupa_hacamat:points", "kupa_hacamat:topics",
  "kupa_hacamat:techniques", "kupa_hacamat:safety-notes",
];
const NEW_KEYS = [...KUPA_KEYS, "biyoenerji:chakra-blocks"];

function run(): void {
  // ═══ 1) REGISTRY ═══════════════════════════════════════════════════════════
  for (const k of NEW_KEYS) {
    const c = cfgByKey.get(k);
    add(`registry-${k}`, c !== undefined && c.enabled === true && c.classification === "safe-non-pii" && c.unit === "record" && c.tenant.mode === "column", c ? `${c.classification}/${c.unit}` : "YOK");
  }
  add("kupa-family-count-5", KUPA_KEYS.filter((k) => cfgByKey.get(k)?.sourceFamily === "kupa_hacamat").length === 5, "");
  add("kupa-tables-exact",
    cfg("kupa_hacamat:knowledge").tableName === "cupping_knowledge_records" &&
    cfg("kupa_hacamat:points").tableName === "cupping_points" &&
    cfg("kupa_hacamat:topics").tableName === "cupping_topics" &&
    cfg("kupa_hacamat:techniques").tableName === "cupping_techniques" &&
    cfg("kupa_hacamat:safety-notes").tableName === "cupping_safety_notes", "");
  add("chakra-blocks-table-exact", cfg("biyoenerji:chakra-blocks").tableName === "bioenergy_chakra_blocks" && cfg("biyoenerji:chakra-blocks").sourceFamily === "biyoenerji", "");
  add("kupa-no-workercap", KUPA_KEYS.every((k) => !hasWorkerCapability(cfg(k), "shared-optional-professional") && !hasWorkerCapability(cfg(k), "section-unit") && !hasWorkerCapability(cfg(k), "parent-derived-scope")), "worker-v1 kapsamı");
  add("chakra-no-workercap", !Array.isArray(cfg("biyoenerji:chakra-blocks").workerCapabilities) || (cfg("biyoenerji:chakra-blocks").workerCapabilities ?? []).length === 0, "");

  // family / label / route
  add("family-includes-kupa_hacamat", (YH_SOURCE_MODULES as readonly string[]).includes("kupa_hacamat"), "");
  add("label-kupa", moduleLabel("kupa_hacamat") === "Kupa & Hacamat", moduleLabel("kupa_hacamat"));
  add("route-kupa", sourceLinkFor("kupa_hacamat") === "/kupa", String(sourceLinkFor("kupa_hacamat")));
  add("chakra-label-biyoenerji", moduleLabel("biyoenerji") === "Biyoenerji" && sourceLinkFor("biyoenerji") !== null, "");

  // registry ↔ matris ↔ modül matris drift (fırlatırsa fail)
  { let ok = true; try { validateActivationMatrix(); validateModuleSourceMatrix(); } catch { ok = false; } add("no-registry-drift", ok, ""); }

  // ═══ 2) BİLİNÇLİ DIŞLAMA (geometri/junction/bibliyografik source YOK) ════════
  const allTables = new Set<string>(YH_INDEX_SOURCES.map((s) => s.tableName));
  for (const t of ["cupping_point_placements", "cupping_point_topics", "cupping_sources", "cupping_point_sources", "cupping_knowledge_sources"]) {
    add(`excluded-${t}`, !allTables.has(t), "");
  }

  // ═══ 3) FIELD COVERAGE — searchable (mide/güvenlik/organ; raw metadata YOK) ══
  // kupa:knowledge — content aranabilir
  {
    const st = searchTextFor(cfg("kupa_hacamat:knowledge"), { id: SID, tenant_id: TENANT, title: "Hacamat Bilgisi", content: "mide ve sindirim için hacamat", notes: "not", tags: ["sindirim"], is_active: true });
    add("kupa-knowledge-mide-searchable", (st ?? "").includes("mide ve sindirim") && (st ?? "").includes("Hacamat Bilgisi"), st ?? "null");
  }
  // kupa:points — traditional_use "mide"; koordinat asla yok (config'de cx/cy yok)
  {
    const st = searchTextFor(cfg("kupa_hacamat:points"), { id: SID, tenant_id: TENANT, name: "Sırt Noktası", traditional_use: "mide rahatsızlıkları", application_info: "kuru kupa", safety_note: "hamilelikte dikkat", is_active: true });
    add("kupa-points-mide-searchable", (st ?? "").includes("mide rahatsızlıkları") && (st ?? "").includes("Sırt Noktası"), st ?? "null");
    const pc = cfg("kupa_hacamat:points");
    const indexedCols = [...pc.titleColumns, ...pc.searchTextColumns, ...pc.snippetColumns, ...pc.topicTagsColumns, ...pc.relationColumns];
    add("kupa-points-no-geometry", !indexedCols.some((c) => ["cx", "cy", "rx", "ry", "angle", "shape", "map_key", "placement_no"].includes(c)), indexedCols.join(","));
  }
  // kupa:safety — content aranabilir; severity tag
  {
    const st = searchTextFor(cfg("kupa_hacamat:safety-notes"), { id: SID, tenant_id: TENANT, title: "Kontrendikasyon", content: "kanama bozukluğunda uygulanmaz", severity: "contraindication", scope_tags: ["kanama"], is_active: true });
    add("kupa-safety-searchable", (st ?? "").includes("kanama bozukluğunda"), st ?? "null");
  }
  // chakra visible block — editorial/expert/excerpt aranabilir; iç id/provenance search_text'te YOK
  {
    const row = {
      id: "11111111-1111-4111-1111-111111111111", tenant_id: TENANT, chakra_id: "22222222-2222-4222-2222-222222222222",
      section_key: "beden-sistem", block_type: "text", block_title: "Beden Sistemi",
      source_excerpt: "kök çakra mide ve sindirim", source_translation: "kok cakra mide çeviri",
      editorial_explanation: "editoryal açıklama mide", editorial_interpretation: "yorum", expert_note: "uzman notu",
      source_title: "Enerji Tıbbı", source_author: "Yazar", source_ref: "s.42", source_url: "http://x",
      tradition_frame: "academic", origin_type: "expert_created", origin_source_id: "33333333-3333-4333-3333-333333333333", updated_at: "2026-01-01",
    };
    const st = searchTextFor(cfg("biyoenerji:chakra-blocks"), row);
    add("chakra-editorial-searchable", (st ?? "").includes("editoryal açıklama mide") && (st ?? "").includes("kök çakra mide"), st ?? "null");
    add("chakra-expert-note-searchable", (st ?? "").includes("uzman notu") && (st ?? "").includes("Enerji Tıbbı"), "");
    add("chakra-no-internal-ids", !(st ?? "").includes("11111111") && !(st ?? "").includes("22222222") && !(st ?? "").includes("33333333") && !(st ?? "").includes("expert_created") && !(st ?? "").includes("http://x"), st ?? "");
  }

  // ═══ 4) CHAKRA GÖRÜNÜRLÜK (source-evidence dışlama = UI ile birebir) ═════════
  const chakra = cfg("biyoenerji:chakra-blocks");
  const chakraRow = (over: Record<string, unknown>) => ({ id: SID, tenant_id: TENANT, chakra_id: "22222222-2222-4222-2222-222222222222", section_key: "notlar-kaynaklar", block_title: "x", editorial_explanation: "içerik", ...over });
  add("chakra-visible-eligible", evaluateRowEligibility(chakra, chakraRow({ block_type: "text" })).eligible === true, "");
  add("chakra-visible-null-type-eligible", evaluateRowEligibility(chakra, chakraRow({ block_type: null })).eligible === true, "null block_type görünür");
  {
    const r = evaluateRowEligibility(chakra, chakraRow({ block_type: "source-evidence" }));
    add("chakra-source-evidence-excluded", r.eligible === false && r.reason === "status-excluded", JSON.stringify(r));
  }
  // görünür→source-evidence UPDATE → not-eligible → deindex yolu (worker defensive deindex)
  add("chakra-source-evidence-no-index", searchTextForEligible(chakra, chakraRow({ block_type: "source-evidence" })) === null, "");
  // içeriksiz görünür blok → evidence gate → index dışı (deindex)
  add("chakra-empty-content-no-index", searchTextFor(chakra, { id: SID, tenant_id: TENANT, chakra_id: "22222222-2222-4222-2222-222222222222", section_key: "notlar-kaynaklar", block_type: "text" }) === null, "");

  // ═══ 5) organ_etkileri EXTRACTION (string/array/newline/obje/JSON/malformed) ═
  const minerals = cfg("dogaltas:minerals");
  const organST = (organ_etkileri: unknown): string => {
    const ex = extractFields(minerals, { id: SID, tenant_id: TENANT, name: "Magnezyum", organ_etkileri });
    return ex.expertRelations.map((r) => r.targetLabel).join(" | ");
  };
  add("organ-string-array", organST(["Mide", "Bağırsak"]).includes("Mide") && organST(["Mide", "Bağırsak"]).includes("Bağırsak"), organST(["Mide", "Bağırsak"]));
  add("organ-newline-string", organST("Mide\nBağırsak\nKaraciğer").includes("Mide") && organST("Mide\nBağırsak\nKaraciğer").includes("Karaciğer"), organST("Mide\nBağırsak\nKaraciğer"));
  add("organ-object-array", organST([{ organ: "Mide", etki: "reflü" }]).includes("Mide") && organST([{ organ: "Mide", etki: "reflü" }]).includes("reflü"), organST([{ organ: "Mide", etki: "reflü" }]));
  add("organ-object-drops-ids", (() => { const s = organST([{ id: "44444444-4444-4444-4444-444444444444", organ: "Mide", sort_order: 3 }]); return s.includes("Mide") && !s.includes("44444444") && !s.includes("3"); })(), organST([{ id: "44444444-4444-4444-4444-444444444444", organ: "Mide", sort_order: 3 }]));
  add("organ-json-string", organST('["Mide","Karaciğer"]').includes("Mide") && organST('["Mide","Karaciğer"]').includes("Karaciğer"), organST('["Mide","Karaciğer"]'));
  add("organ-malformed-no-crash", (() => { try { const s = organST('[{"organ":"Mid'); return typeof s === "string"; } catch { return false; } })(), "");
  add("organ-plain-string", organST("Mide").includes("Mide"), organST("Mide"));
  add("organ-unknown-safe", (() => { try { return organST(42) === "" && organST(null) === "" && organST(undefined) === ""; } catch { return false; } })(), "");
  add("organ-no-raw-json", !organST([{ organ: "Mide" }]).includes("{") && !organST([{ organ: "Mide" }]).includes("["), organST([{ organ: "Mide" }]));
  // end-to-end: minerals search_text "mide" içerir
  add("minerals-organ-mide-in-searchtext", (searchTextFor(minerals, { id: SID, tenant_id: TENANT, name: "Magnezyum", aciklama: "açıklama", organ_etkileri: ["Mide", "Bağırsak"] }) ?? "").toLowerCase().includes("mide"), "");
  // REGRESSION: diğer relation kaynağı (dogaltas:stones assignments) etkilenmez
  {
    const stones = cfg("dogaltas:stones");
    const ex = extractFields(stones, { id: SID, tenant_id: TENANT, stone_name: "Ametist", assignments: { Mineraller: [["Demir", "%2"]] } });
    add("regression-stones-assignments", ex.expertRelations.some((r) => r.targetLabel === "Demir"), JSON.stringify(ex.expertRelations));
  }

  // ═══ 6) ACTIVATION MATRIX (FUTURE_ONLY_READY, default OFF, backfill false) ═══
  for (const k of NEW_KEYS) {
    const e = activationEntryOf(k);
    add(`matrix-${k}`, e !== undefined && e.activationClass === "FUTURE_ONLY_READY" && e.scope === "professional" && e.registryEnabled === true && e.backfillEligibility === "not-applicable", e ? e.activationClass : "YOK");
  }
  for (const k of NEW_KEYS) {
    const d = toDesired(activationEntryOf(k)!);
    // default OFF: runtime yok → inactive
    add(`gate-off-${k}`, evaluateProcessingGate(d, null).active === false, "");
    // DB is_active=true → active
    add(`gate-on-${k}`, evaluateProcessingGate(d, { isActive: true, backfillAllowed: false }).active === true, "");
    // backfill: FUTURE_ONLY_READY backfill-eligible DEĞİL → allowed false (backfillAllowed true olsa bile)
    add(`no-backfill-${k}`, evaluateBackfillGate(d, { isActive: true, backfillAllowed: true }).allowed === false, "");
  }
  add("matrix-total-42", YH_ACTIVATION_MATRIX.length === 42, String(YH_ACTIVATION_MATRIX.length));

  // ═══ 7) MIGRATION STATİK ════════════════════════════════════════════════════
  const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");
  const kupaMig = read("supabase/migrations/20261222000000_yh_kupa_hacamat_cdc_triggers.sql");
  add("mig-kupa-5-triggers", (kupaMig.match(/CREATE TRIGGER yh_cdc_cupping_\w+_trg/g) ?? []).length === 5, String((kupaMig.match(/CREATE TRIGGER yh_cdc_cupping_\w+_trg/g) ?? []).length));
  add("mig-kupa-generic-cdc", (kupaMig.match(/EXECUTE FUNCTION public\.yh_cdc_enqueue\(/g) ?? []).length === 5, "");
  add("mig-kupa-no-placement-trigger", !/CREATE TRIGGER[^\n]*cupping_point_placements/.test(kupaMig) && !/cupping_point_topics|_sources/.test(kupaMig.replace(/--[^\n]*/g, "")), "");
  add("mig-kupa-no-activation", !/is_active\s*=\s*true|yh_source_activation_set|INSERT INTO public\.yasam_hafizasi_(index|outbox)/.test(kupaMig.replace(/--[^\n]*/g, "")), "");

  const chakraMig = read("supabase/migrations/20261222000100_yh_bioenergy_chakra_blocks_cdc_trigger.sql");
  add("mig-chakra-1-trigger", (chakraMig.match(/CREATE TRIGGER yh_cdc_bioenergy_chakra_blocks_trg/g) ?? []).length === 1, "");
  add("mig-chakra-generic-cdc", /EXECUTE FUNCTION public\.yh_cdc_enqueue\('biyoenerji:chakra-blocks', 'bioenergy_chakra_blocks'\)/.test(chakraMig), "");
  add("mig-chakra-no-activation", !/is_active\s*=\s*true|yh_source_activation_set/.test(chakraMig.replace(/--[^\n]*/g, "")), "");

  const actMig = read("supabase/migrations/20261222000200_yh_coverage_completion_activation.POSTDEPLOY.sql");
  add("mig-activation-postdeploy-marked", /POST-DEPLOY \/ MANUAL APPROVAL REQUIRED/.test(actMig) && /BU TUR PRODUCTION'A UYGULANMAZ/.test(actMig), "");
  add("mig-activation-6-sets", (actMig.match(/SELECT public\.yh_source_activation_set\(/g) ?? []).length === 6, String((actMig.match(/SELECT public\.yh_source_activation_set\(/g) ?? []).length));
  add("mig-activation-backfill-false", !/,\s*true,\s*true,/.test(actMig) && /FUTURE_ONLY_READY/.test(actMig), "backfill=false");

  // ═══ 8) GÜVENLİK — PII yok; synthetic writer ban korunur (statik) ════════════
  const PII_COLS = ["client_id", "ad", "soyad", "telefon", "adres", "email", "e_posta", "dogum", "birth"];
  for (const k of NEW_KEYS) {
    const c = cfg(k);
    const idx = [...c.titleColumns, ...c.searchTextColumns, ...c.snippetColumns, ...c.topicTagsColumns, ...c.relationColumns];
    add(`no-pii-${k}`, !idx.some((col) => PII_COLS.includes(col)), idx.join(","));
  }
  const writer = read("lib/yasam-hafizasi/indexer/supabaseIndexAdapters.ts");
  add("professional-writer-synthetic-ban", /isSyntheticTenantId\(u\.tenantId\)/.test(writer) && /synthetic-tenant-unit/.test(writer), "");
  // Numeroloji/YEBS OFF korunur (bu paket dokunmadı)
  add("numeroloji-still-disabled", cfg("numeroloji:sources").enabled === false && cfg("numeroloji:knowledge-entries").enabled === false, "");
  add("yebs-still-disabled", YH_INDEX_SOURCES.filter((s) => s.sourceFamily === "yebs").every((s) => s.enabled === false), "");
}

/** Görünürlük kapısı DAHİL search_text (eligible değilse null → worker deindex eder). */
function searchTextForEligible(config: SourceConfig, row: Record<string, unknown>): string | null {
  if (!evaluateRowEligibility(config, row).eligible) return null;
  return searchTextFor(config, row);
}

function main(): void {
  run();
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nYH COVERAGE COMPLETION HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

main();

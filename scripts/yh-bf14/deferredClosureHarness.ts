/**
 * BF-14 Ertelenmiş Kaynaklar Mimari Kapanışı — tek kapsamlı harness (PASS/BLOCKED).
 *
 * Migration statik doğrulama + closure kararları + dört alan foundation/fail-closed kapıları.
 * Production/DB YOK.  npm run yh:bf14:closure:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  YH_DEFERRED_SOURCE_CLOSURE,
  validateDeferredClosure,
  expectedFoundationTables,
  wiredDormantRegistryKeys,
} from "@/lib/yasam-hafizasi/deferredSourceClosure";
import { resolveTenant } from "@/lib/yasam-hafizasi/indexer/tenantResolve";
import { evaluateRowEligibility } from "@/lib/yasam-hafizasi/indexer/rowEligibility";
import { evaluateSourceGuard } from "@/lib/yasam-hafizasi/indexer/sourceGuard";
import { parsePromoteRequest } from "@/lib/yasam-hafizasi/documents/promoteRequest";
import { chunkText, contentHash } from "@/lib/yasam-hafizasi/documents/chunkText";
import {
  parseArchiveClassification,
  isArchiveRowIndexable,
} from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";
import {
  isYebsPublishedEligible,
  yebsGlobalTenantId,
  YEBS_VISIBILITY,
  YEBS_SOURCE_TABLES,
} from "@/lib/yasam-hafizasi/yebs/yebsVisibility";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";

const U1 = "11111111-1111-4111-1111-111111111111";
const HASH = "a".repeat(64);

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };
const dom = (k: string) => YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === k);

const MIG = readFileSync(join(process.cwd(), "supabase/migrations/20260925000000_yh_deferred_sources_foundation.sql"), "utf8");
const has = (re: RegExp): boolean => re.test(MIG);

// ── 1) Migration statik: additive DDL-only, DORMANT ──
add("mig-doc-sources-table", has(/CREATE TABLE IF NOT EXISTS public\.yh_document_sources/));
add("mig-doc-passages-table", has(/CREATE TABLE IF NOT EXISTS public\.yh_document_passages/));
add("mig-archive-class-table", has(/CREATE TABLE IF NOT EXISTS public\.yh_archive_classifications/));
add("mig-default-unclassified", (MIG.match(/DEFAULT 'unclassified'/g) ?? []).length >= 3, String((MIG.match(/DEFAULT 'unclassified'/g) ?? []).length));
add("mig-classification-check", has(/classification IN \('unclassified', 'safe-non-pii', 'pii', 'restricted'\)/));
add("mig-passages-composite-fk", has(/FOREIGN KEY \(tenant_id, document_id\)[\s\S]*REFERENCES public\.yh_document_sources \(tenant_id, id\)/));
add("mig-archive-identity-unique", has(/yhac_identity_unique\s+UNIQUE \(tenant_id, archive_id\)/));
add("mig-rls-enable", (MIG.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length >= 1 && has(/ENABLE ROW LEVEL SECURITY/));
add("mig-revoke-anon-auth", has(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM anon, authenticated, PUBLIC/));
add("mig-grant-service-role", has(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*TO service_role/));
add("mig-service-role-policy", has(/CREATE POLICY[\s\S]*FOR ALL TO service_role USING \(true\) WITH CHECK \(true\)/));
// DORMANT guarantee: no data DML, no trigger, no backfill, no enable:true.
add("mig-no-data-dml", !/\bINSERT\s+INTO\b/i.test(MIG) && !/\bUPDATE\s+public\./i.test(MIG) && !/\bDELETE\s+FROM\b/i.test(MIG));
add("mig-no-trigger", !/CREATE\s+TRIGGER/i.test(MIG));
add("mig-no-backfill-select", !/\bSELECT[\s\S]*FROM public\.(personal_archives|belge_ceviri_jobs|video_)/i.test(MIG));
// No ALTER of existing/untracked tables (only new tables).
add("mig-no-alter-existing", !/ALTER TABLE public\.(personal_archives|numerology_|belge_ceviri_jobs|video_|yebs_)/i.test(MIG));
// Numeroloji client_id NOT added (gerçek DDL; açıklama yorumu hariç).
add("mig-no-numerology-client-id", !/ADD COLUMN[^\n;]*client_id/i.test(MIG) && !/ALTER TABLE[^\n;]*numerology/i.test(MIG));
// Single transaction.
add("mig-single-transaction", has(/^BEGIN;/m) && has(/^COMMIT;/m));

// ── 2) Closure karar matrisi bütünlüğü ──
{
  let ok = true, detail = "";
  try { validateDeferredClosure(); } catch (e) { ok = false; detail = (e as Error).message; }
  add("closure-validate-passes", ok, detail);
}
add("closure-four-domains", YH_DEFERRED_SOURCE_CLOSURE.length === 4, String(YH_DEFERRED_SOURCE_CLOSURE.length));
add("closure-no-vague-result", YH_DEFERRED_SOURCE_CLOSURE.every((d) => d.result !== undefined && d.result.length > 0));
// foundationTables migration ile çapraz doğrulanır.
add("closure-foundation-tables-in-migration", expectedFoundationTables().every((t) => new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`).test(MIG)), expectedFoundationTables().join(","));

// ── 3) YEBS: global-canonical + published-only eligibility ──
add("yebs-visibility-global-canonical", YEBS_VISIBILITY === "GLOBAL_CANONICAL");
add("yebs-eligible-published-only", isYebsPublishedEligible("published") && !isYebsPublishedEligible("draft") && !isYebsPublishedEligible("verified") && !isYebsPublishedEligible("approved") && !isYebsPublishedEligible("") && !isYebsPublishedEligible(null));
add("yebs-global-tenant-null", yebsGlobalTenantId() === null);
add("yebs-tables-tenantless-set", YEBS_SOURCE_TABLES.length === 6);
add("yebs-domain-wired-dormant", dom("yebs_global_canonical")?.result === "WIRED_DORMANT" && (dom("yebs_global_canonical")?.registrySourceKeys.length ?? 0) === 6);
add("yebs-no-client", (dom("yebs_global_canonical")?.deny ?? []).some((d) => d.includes("client memory")));

// ── 4) Numeroloji: DEFERRED_HARD_BLOCKER + exact kanıt ──
add("numeroloji-hard-blocker", dom("numeroloji_client_id")?.result === "DEFERRED_HARD_BLOCKER");
add("numeroloji-evidence-client-id", (dom("numeroloji_client_id")?.hardBlockerEvidence ?? []).some((e) => e.includes("client_id kolonu YOK")));
add("numeroloji-evidence-untracked", (dom("numeroloji_client_id")?.hardBlockerEvidence ?? []).some((e) => e.includes("tracked migration") && e.includes("numerology_records")));
add("numeroloji-deny-name-dob", (dom("numeroloji_client_id")?.deny ?? []).some((d) => d === "doğum tarihi") && (dom("numeroloji_client_id")?.deny ?? []).some((d) => d === "ad"));

// ── 5) Belge/Video: promotion validation + deterministic chunking + server-derived ──
{
  const good = parsePromoteRequest({ jobKind: "video", jobId: U1, sourceAuthor: "X" });
  add("promote-ok", good.ok && good.value.jobKind === "video");
  add("promote-bad-kind", !parsePromoteRequest({ jobKind: "hack", jobId: U1 }).ok);
  add("promote-bad-jobid", !parsePromoteRequest({ jobKind: "video", jobId: "nope" }).ok);
  add("promote-unsafe-url", !parsePromoteRequest({ jobKind: "video", jobId: U1, sourceUrl: "javascript:alert(1)" }).ok);
  add("promote-safe-url", parsePromoteRequest({ jobKind: "video", jobId: U1, sourceUrl: "https://ok.example/x" }).ok);
  // içerik/text alanları GÖRMEZDEN GELİNİR (server-derived; arbitrary client text yok).
  const injected = parsePromoteRequest({ jobKind: "video", jobId: U1, passages: [{ text: "HACK" }], title: "HACK" });
  add("promote-ignores-client-text", injected.ok && !JSON.stringify(injected.value).includes("HACK"));

  const chunks = chunkText("Para bir.\n\nPara iki.\n\n   \n\nPara üç.");
  add("chunk-deterministic-count", chunks.length === 3 && chunks[0]!.ordinal === 0 && chunks[2]!.ordinal === 2);
  add("chunk-stable", JSON.stringify(chunkText("a\n\nb")) === JSON.stringify(chunkText("a\n\nb")));
  add("chunk-empty-safe", chunkText("").length === 0 && chunkText("   ").length === 0);
  add("chunk-hash-64", chunks[0]!.textHash.length === 64 && contentHash("x").length === 64);
  const big = chunkText("x".repeat(9000));
  add("chunk-bounded", big.every((c) => c.text.length <= 4000) && big.length >= 2);
  // belge_video ÜRÜN KARARIYLA emekliye ayrıldı (NON_SOURCE): closure NOT_APPLICABLE, registry key 0.
  // Foundation tabloları (cleanup-candidate) kayıtlı kalır; promotion API + chunkText (yukarıda) korunur.
  add("belge-domain-not-applicable", dom("belge_video_ingestion")?.result === "NOT_APPLICABLE" && (dom("belge_video_ingestion")?.foundationTables.length ?? 0) === 2 && (dom("belge_video_ingestion")?.registrySourceKeys.length ?? 1) === 0);
}

// ── 6) Kişisel Arşiv: classification validation + row-level fail-closed ──
{
  add("arc-ok", parseArchiveClassification({ archiveId: U1, classification: "pii" }).ok);
  add("arc-bad-class", !parseArchiveClassification({ archiveId: U1, classification: "safe" }).ok);
  // BF-11E: reviewed hash CLIENT'tan alınmaz (server türetir) → safe-non-pii yalnız reason ister.
  add("arc-safe-no-client-hash-needed", parseArchiveClassification({ archiveId: U1, classification: "safe-non-pii", reason: "ok" }).ok);
  add("arc-safe-needs-reason", !parseArchiveClassification({ archiveId: U1, classification: "safe-non-pii" }).ok);
  add("arc-safe-client-hash-ignored", parseArchiveClassification({ archiveId: U1, classification: "safe-non-pii", reason: "incelendi", reviewedContentHash: HASH }).ok);
  // Row-level index eligibility fail-closed:
  add("arc-index-safe-hash-match", isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH }, HASH) === true);
  add("arc-index-unclassified-no", isArchiveRowIndexable({ classification: "unclassified", reviewedContentHash: HASH }, HASH) === false);
  add("arc-index-pii-no", isArchiveRowIndexable({ classification: "pii", reviewedContentHash: HASH }, HASH) === false);
  add("arc-index-stale-hash-no", isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH }, "b".repeat(64)) === false);
  add("arc-index-no-hash-no", isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: null }, HASH) === false);
  add("archive-domain-foundation-ready", dom("kisisel_arsiv_classification")?.result === "FOUNDATION_READY");
}

// ── 7) Registry wiring: YEBS + Belge/Video DORMANT bağlı; mevcut/live değişmedi ──
{
  const byKey = new Map<string, SourceConfig>(YH_INDEX_SOURCES.map((s) => [s.sourceKey, s]));
  // BF-11E: kisisel_arsiv:archives ROW-GATED CONTROLLED (safe-non-pii + requiresRowEligibilityGate; duplicate yok).
  add("existing-archive-source-row-gated", byKey.get("kisisel_arsiv:archives")?.classification === "safe-non-pii" && byKey.get("kisisel_arsiv:archives")?.requiresRowEligibilityGate === true, byKey.get("kisisel_arsiv:archives")?.classification ?? "missing");
  // Cohort A: 19 canlı + 8 dormant (2 numeroloji + 6 yebs) = 27 kaynak.
  add("registry-count-27", YH_INDEX_SOURCES.length === 27, String(YH_INDEX_SOURCES.length));
  add("live-count-19", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 19);
  // WIRED_DORMANT closure key'leri GERÇEKTEN registry'de ve HEPSİ enabled:false.
  const wired = wiredDormantRegistryKeys();
  add("closure-wired-keys-in-registry", wired.length === 6 && wired.every((k) => byKey.has(k)), wired.join(","));
  add("closure-wired-keys-all-dormant", wired.every((k) => byKey.get(k)?.enabled === false));
  // YEBS: 6 global-canonical + published-only.
  const yebs = YH_INDEX_SOURCES.filter((s) => s.sourceKey.startsWith("yebs:")) as SourceConfig[];
  add("yebs-6-global-canonical", yebs.length === 6 && yebs.every((s) => s.tenant.mode === "global-canonical" && s.enabled === false));
  add("yebs-published-only", yebs.every((s) => s.statusColumn === "status" && JSON.stringify(s.eligibleStatuses) === JSON.stringify(["published"])));
  add("yebs-safe-non-pii", yebs.every((s) => s.classification === "safe-non-pii"));
  // Belge/Video ÜRÜN KARARIYLA emekliye ayrıldı (NON_SOURCE): registry'de YOK.
  add("belge-passages-retired-not-in-registry", byKey.get("belge_video:passages") === undefined && !YH_INDEX_SOURCES.some((s) => (s.tableName as string) === "yh_document_passages"));
  // Guard: her wired dormant source enabled:false → source-guard 'disabled' (event/reconcile no-op).
  add("new-dormant-guard-disabled", wired.every((k) => { const s = byKey.get(k)!; return s.enabled === false; }));
}

// ── 8) Fonksiyonel indexer wiring: global-canonical resolve + row-eligibility + guard ──
{
  const byKey = new Map<string, SourceConfig>(YH_INDEX_SOURCES.map((s) => [s.sourceKey, s]));
  const yebsTrad = byKey.get("yebs:traditions")!;

  // global-canonical → tenant DAİMA shared (null); synthetic tenant yok.
  const gt = resolveTenant(yebsTrad, { id: U1, status: "published" });
  add("fn-global-canonical-shared", gt.ok === true && gt.tenantId === null && gt.isShared === true);

  // YEBS row-eligibility: yalnız published geçer; draft/verified/pending fail-closed.
  add("fn-yebs-published-eligible", evaluateRowEligibility(yebsTrad, { status: "published" }).eligible === true);
  add("fn-yebs-draft-skip", evaluateRowEligibility(yebsTrad, { status: "draft" }).eligible === false);
  add("fn-yebs-approved-skip", evaluateRowEligibility(yebsTrad, { status: "approved" }).eligible === false);
  add("fn-yebs-missing-status-skip", evaluateRowEligibility(yebsTrad, {}).eligible === false);

  // Belge/Video ÜRÜN KARARIYLA emekliye ayrıldı: registry'de rowClassificationColumn taşıyan kaynak YOK.
  add("fn-no-row-classification-source", !YH_INDEX_SOURCES.some((s) => { const rcc = (s as SourceConfig).rowClassificationColumn; return typeof rcc === "string" && rcc.length > 0; }));

  // Mevcut kaynaklar (no eligibility gate) → daima eligible (davranış değişmez).
  const live = YH_INDEX_SOURCES.find((s) => s.sourceKey === "refleksoloji:protocols")!;
  add("fn-live-source-no-gate", evaluateRowEligibility(live, {}).eligible === true);

  // Guard: yeni dormant kaynaklar 'disabled' → event/reconcile no-op (index write yok).
  add("fn-yebs-guard-disabled", evaluateSourceGuard(yebsTrad).indexable === false);
  // Mevcut canlı kaynak hâlâ indexable (regresyon yok).
  add("fn-live-guard-indexable", evaluateSourceGuard(live).indexable === true);
}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-14 DEFERRED SOURCES CLOSURE HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

main();

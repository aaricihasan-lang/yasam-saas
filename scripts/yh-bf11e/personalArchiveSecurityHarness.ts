/**
 * BF-11E — KİŞİSEL ARŞİV CONTROLLED SOURCE GÜVENLİK HARNESS (PASS/FAIL).
 *
 * Row-gated controlled source implementasyonunun uçtan-uca güvenlik sözleşmesini doğrular:
 * server-türetimli hash, satır eligibility, transitions/tombstone, delete, activation gate,
 * backfill-deny, archive/classification CDC (migration statik), tenant FK, outbox minimal payload,
 * future-only, kaynak graduation, KEEP_LIVE/Belge-Video/diğer durumlar. Production/DB YOK.
 *   npm run yh:bf11e:archive:security:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { runIndexUnit } from "@/lib/yasam-hafizasi/indexer/runIndexUnit";
import { supportsTenantScopedPage } from "@/lib/yasam-hafizasi/indexer/tenantScopeGate";
import { evaluateSourceGuard } from "@/lib/yasam-hafizasi/indexer/sourceGuard";
import {
  decideArchiveEligibility,
  type ArchiveEligibilityLookup,
} from "@/lib/yasam-hafizasi/indexer/archiveEligibility";
import { parseArchiveClassification } from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";
import { processOutboxEvent, type EventProcessorDeps } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import type { ClaimedOutboxEvent } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import type { IndexSourcePageResult } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { DeindexResult } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { resolveProcessingActive, activationEntryOf } from "@/lib/yasam-hafizasi/activation/activationMatrix";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => { checks.push({ name, ok, detail }); };

const KEY = "kisisel_arsiv:archives";
const ARCHIVE = YH_INDEX_SOURCES.find((s) => s.sourceKey === KEY) as SourceConfig;
const T1 = "11111111-1111-4111-8111-111111111111";
const A1 = "33333333-3333-4333-8333-333333333333";

const MIG_NAME = "20261002000000_yh_personal_archive_controlled_source.sql";
const MIG = readFileSync(join(process.cwd(), "supabase/migrations", MIG_NAME), "utf8");
const has = (re: RegExp): boolean => re.test(MIG);
// Yalnız ÇALIŞTIRILABILIR satırlar (yorumlar hariç): comment içindeki NEW.id/reason vb. yanıltmasın.
const EXEC = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const execHas = (re: RegExp): boolean => re.test(EXEC);

// ═══ A) SERVER-TÜRETİMLİ HASH ═════════════════════════════════════════════════
{
  const row = (over: Record<string, unknown> = {}) =>
    ({ id: A1, tenant_id: T1, title: "Not Başlığı", note: "gövde metni", category: "Sağlık", tags: "a,b", ...over });
  const hashOf = (r: Record<string, unknown>): string => {
    const u = runIndexUnit({ config: ARCHIVE, row: r });
    return u.status === "unit" ? u.unit.contentHash : "NO_UNIT";
  };
  const h1 = hashOf(row());
  add("A-server-hash-deterministic", h1 === hashOf(row()) && /^[0-9a-f]{64}$/.test(h1));
  // İndex'lenen alan değişince (note) hash DEĞİŞİR → stale.
  add("A-indexed-field-changes-hash", hashOf(row({ note: "farklı gövde" })) !== h1);
  add("A-title-changes-hash", hashOf(row({ title: "Farklı Başlık" })) !== h1);
  // İndex'lenmeyen metadata (created_at) değişince hash DEĞİŞMEZ (yanlış-stale yok).
  add("A-nonindexed-metadata-stable-hash", hashOf(row({ created_at: "2030-01-01T00:00:00Z" })) === h1);
  // Client hash request'ten KALDIRILDI: gönderilse dahi parse authoritative kullanmaz (reason yeter).
  add("A-client-hash-ignored", parseArchiveClassification({ archiveId: A1, classification: "safe-non-pii", reason: "incelendi", reviewedContentHash: "deadbeef" }).ok === true);
  add("A-safe-requires-reason", parseArchiveClassification({ archiveId: A1, classification: "safe-non-pii" }).ok === false);
}

// ═══ B/C) ELIGIBILITY (safe+current → index; aksi → ineligible) ══════════════
{
  const H = "a".repeat(64);
  const found = (c: string, h: string | null): ArchiveEligibilityLookup => ({ status: "found", record: { classification: c, reviewedContentHash: h } });
  add("B-safe-current-eligible", decideArchiveEligibility(found("safe-non-pii", H), H) === true);
  add("C-missing-classification-ineligible", decideArchiveEligibility({ status: "missing" }, H) === false);
  add("C-unclassified-ineligible", decideArchiveEligibility(found("unclassified", H), H) === false);
  add("C-pii-ineligible", decideArchiveEligibility(found("pii", H), H) === false);
  add("C-restricted-ineligible", decideArchiveEligibility(found("restricted", H), H) === false);
  add("C-null-hash-ineligible", decideArchiveEligibility(found("safe-non-pii", null), H) === false);
  add("C-stale-hash-ineligible", decideArchiveEligibility(found("safe-non-pii", H), "b".repeat(64)) === false);
}

// ═══ event processor yardımcıları ─────────────────────────────────────────────
const ev = (operation: string): ClaimedOutboxEvent => ({
  id: "ev-1", sourceKey: KEY, sourceTable: "personal_archives", sourceId: A1, tenantId: T1,
  operation, eventVersion: 1,
} as unknown as ClaimedOutboxEvent);

const exactResult = (exactStatus: string): IndexSourcePageResult => ({
  sourceKey: KEY, mode: "write", fetched: 1, eligibleUnits: 0, excludedDemo: 0, excludedSynthetic: 0,
  summary: { units: 0, skipped: 0, byReason: {} }, nextCursor: null, hasMore: false,
  parentStats: { requested: 0, found: 0, missing: 0 }, write: null, exactMode: true,
  exactStatus: exactStatus as IndexSourcePageResult["exactStatus"],
} as IndexSourcePageResult);

const dz = (status: DeindexResult["status"]): DeindexResult => ({ status, deleted: status === "ok" ? 1 : 0 });

// Sayaçlı deindex/upsert fake üreticileri (boolean literal-narrowing'den kaçınmak için sayaç).
const baseDeps = (counters: { de: number; up: number }, over: Partial<EventProcessorDeps> = {}): EventProcessorDeps => ({
  resolveConfig: (k) => (k === KEY ? ARCHIVE : null),
  runExactUpsert: async () => { counters.up += 1; return exactResult("ok"); },
  deindex: async (): Promise<DeindexResult> => { counters.de += 1; return dz("no-op"); },
  isSourceProcessingActive: async () => true,
  ...over,
});

// ═══ B/E/F/D) EVENT PROCESSOR DAVRANIŞI ══════════════════════════════════════
{
  // E) row-ineligible (safe→unsafe / stale hash / missing) → defensiveDeindex tombstone.
  const runE = async () => {
    const c = { de: 0, up: 0 };
    const d = await processOutboxEvent(ev("upsert"), baseDeps(c, {
      runExactUpsert: async () => { c.up += 1; return exactResult("row-ineligible"); },
      deindex: async () => { c.de += 1; return dz("ok"); },
    }));
    add("E-row-ineligible-tombstone", d.action === "complete" && c.de === 1, JSON.stringify(d));
  };
  // B) eligible upsert (ok) → complete; deindex ÇAĞRILMAZ.
  const runB = async () => {
    const c = { de: 0, up: 0 };
    const d = await processOutboxEvent(ev("upsert"), baseDeps(c));
    add("B-eligible-upsert-complete", d.action === "complete" && c.de === 0 && c.up === 1, JSON.stringify(d));
  };
  // F) active archive DELETE → deindex.
  const runF = async () => {
    const c = { de: 0, up: 0 };
    const d = await processOutboxEvent(ev("delete"), baseDeps(c, { deindex: async () => { c.de += 1; return dz("ok"); } }));
    add("F-active-delete-deindex", d.action === "complete" && c.de === 1, JSON.stringify(d));
  };
  // F/G) inactive source → NO-OP: index korunur (deindex + upsert ÇAĞRILMAZ).
  const runInactive = async () => {
    const c = { de: 0, up: 0 };
    const d = await processOutboxEvent(ev("delete"), baseDeps(c, { isSourceProcessingActive: async () => false }));
    add("F-inactive-delete-noop-preserve", d.action === "complete" && c.de === 0 && c.up === 0, JSON.stringify(d));
  };
  // D) activation read error → transient (yazma/silme YOK).
  const runActErr = async () => {
    const c = { de: 0, up: 0 };
    const d = await processOutboxEvent(ev("upsert"), baseDeps(c, { isSourceProcessingActive: async () => { throw new Error("db down"); } }));
    add("D-activation-read-error-transient", d.action === "fail" && d.retryClass === "transient" && c.de === 0, JSON.stringify(d));
  };
  // D) gate missing / IO error → transient (iyi veri tombstone EDİLMEZ).
  const runGateErr = async () => {
    const c = { de: 0, up: 0 };
    const d = await processOutboxEvent(ev("upsert"), baseDeps(c, { runExactUpsert: async () => { throw new Error("gate-missing"); } }));
    add("D-gate-io-error-transient-no-tombstone", d.action === "fail" && d.retryClass === "transient" && c.de === 0, JSON.stringify(d));
  };
  void Promise.all([runE(), runB(), runF(), runInactive(), runActErr(), runGateErr()]).then(finish);
}

// ═══ G) ACTIVATION GATE (controlled; default OFF) ═════════════════════════════
{
  add("G-activation-absent-inactive", resolveProcessingActive(KEY, null) === false);
  add("G-activation-false-inactive", resolveProcessingActive(KEY, { isActive: false, backfillAllowed: false }) === false);
  add("G-activation-true-active", resolveProcessingActive(KEY, { isActive: true, backfillAllowed: false }) === true);
}

// ═══ H) BACKFILL DENY ═════════════════════════════════════════════════════════
{
  add("H-backfill-denied", supportsTenantScopedPage(ARCHIVE) === false);
  add("H-source-guard-indexable", evaluateSourceGuard(ARCHIVE).indexable === true);
  add("H-requires-gate", ARCHIVE.requiresRowEligibilityGate === true);
}

// ═══ I) ARCHIVE CDC (migration statik) ════════════════════════════════════════
{
  add("I-archive-trigger", has(/CREATE TRIGGER yh_cdc_personal_archives_trg[\s\S]*ON public\.personal_archives/));
  add("I-archive-generic-enqueue", has(/EXECUTE FUNCTION public\.yh_cdc_enqueue\('kisisel_arsiv:archives', 'personal_archives'\)/));
  add("I-archive-events", has(/AFTER INSERT OR UPDATE OR DELETE ON public\.personal_archives/));
}

// ═══ J) CLASSIFICATION CDC (source-özel; archive_id eşlemesi) ═════════════════
{
  add("J-classification-fn", has(/CREATE OR REPLACE FUNCTION public\.yh_cdc_enqueue_archive_classification\(\)/));
  add("J-maps-archive-id", has(/v_source_id := NEW\.archive_id/) && has(/v_source_id := OLD\.archive_id/));
  add("J-not-classification-row-id", !execHas(/NEW\.id\b/) && !execHas(/OLD\.id\b/));
  add("J-classification-trigger", has(/CREATE TRIGGER yh_cdc_yh_archive_classifications_trg[\s\S]*ON public\.yh_archive_classifications/));
  add("J-reevaluate-upsert", has(/'upsert'/));
  add("J-activation-gated", has(/is_active INTO v_active/) && has(/v_active IS DISTINCT FROM true/));
  add("J-security-definer", has(/SECURITY DEFINER/) && has(/REVOKE ALL ON FUNCTION public\.yh_cdc_enqueue_archive_classification\(\) FROM PUBLIC, anon, authenticated/));
}

// ═══ K) TENANT FK / COMPOSITE UNIQUE (migration statik) ══════════════════════
{
  add("K-composite-unique", has(/ADD CONSTRAINT personal_archives_tenant_id_id_key UNIQUE \(tenant_id, id\)/));
  add("K-composite-fk", has(/FOREIGN KEY \(tenant_id, archive_id\)[\s\S]*REFERENCES public\.personal_archives \(tenant_id, id\)/));
  add("K-fk-cascade", has(/ON DELETE CASCADE/));
  add("K-fk-not-valid", has(/NOT VALID/));
  add("K-preconditions", has(/RAISE EXCEPTION 'BF-11E BLOCKER/));
}

// ═══ M) SOURCE GRADUATION + BELGE/VIDEO NON_SOURCE + KEEP_LIVE ════════════════
{
  add("M-archive-graduated", activationEntryOf(KEY)?.activationClass === "ROW_GATED_CONTROLLED");
  add("M-live-professional-22-enabled", YH_INDEX_SOURCES.filter((s) => s.enabled === true).length === 22);
  add("M-belge-not-a-source", !YH_INDEX_SOURCES.some((s) => (s.sourceKey as string) === "belge_video:passages"));
  // Yalnız Kişisel Arşiv row-gated (başka kaynak requiresRowEligibilityGate taşımaz).
  add("M-only-archive-row-gated", (YH_INDEX_SOURCES as readonly SourceConfig[]).filter((s) => s.requiresRowEligibilityGate === true).length === 1);
}

// ═══ N) FUTURE-ONLY / NO TEST DATA (migration statik) ════════════════════════
{
  add("N-no-activation-seed", !/is_active\s*=\s*true|yh_source_activation_set\s*\(/i.test(MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")));
  add("N-no-data-dml", !/\b(INSERT INTO public\.(personal_archives|yh_archive_classifications|yasam_hafizasi_index)|UPDATE public\.|TRUNCATE|DROP TABLE)\b/i.test(MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")));
  add("N-no-backfill-select", !/SELECT[\s\S]*FROM public\.personal_archives/i.test(MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")));
  add("N-outbox-minimal-payload", has(/\(source_key, source_table, source_id, tenant_id, operation\)/) && !execHas(/reviewed_content_hash|passage_text|\.note|\.title|\.category|\.tags/i));
  add("N-single-transaction", has(/^BEGIN;/m) && has(/^COMMIT;/m));
}

function finish(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nBF-11E PERSONAL ARCHIVE SECURITY HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: FAIL\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

/**
 * Yaşam Hafızası™ — Reconciliation Saf Sınıflandırıcı (BF-11D1).
 * ============================================================================
 *
 * SAF (pure) + DETERMİNİSTİK + FAIL-CLOSED. IO / DB / write / fetch / env / zaman
 * YOKTUR. İki yön için tek-kayıt kararı verir:
 *   - decideSourceToIndex : source→index (healthy/missing/stale/excluded/skipped/
 *                           deindex_required/tenant_mismatch)
 *   - decideIndexToSource : index→source (orphan/invariant/duplicate/tenant_mismatch;
 *                           kaynak-tarafı kapsadıysa `null`=covered)
 *
 * REUSE (kopyalanmaz): resolveTenant · runIndexUnit (→resolveTenant/extractFields/
 * buildIndexUnit + content_hash) · evaluateSourceGuard/isIndexableSource ·
 * isSyntheticTenantId · YH_DEMO_TENANT_ID. Tenant exclusion merdiveni, source
 * classification ve content_hash üretimi YENİDEN YAZILMAZ.
 *
 * SIRA (kullanıcı §6 source→index sözleşmesi):
 *   1) pilot/config → 2) indexable/policy → 3) tenant resolve → 4) demo →
 *   5) synthetic → 6) shared/null → 7) build eligibility → 8) content_hash →
 *   9) index karşılaştırma. (Exact-record sözleşmesiyle KAPI PARİTESİ; sıra farkı
 *   bilinçlidir: reconcile tenant'ı satırdan çözer, demo/synthetic'i build'DEN ÖNCE
 *   dışlar — parite `runExactRecord` ile harness'te ayrıca kanıtlanır.)
 *
 * Content hash STALE kararında TEK OTORİTEDİR; `source_updated_at` yalnız diagnostic.
 */

import { YH_DEMO_TENANT_ID } from "../config";
import { isSyntheticTenantId } from "../../tenancy/syntheticTenants";
import { evaluateSourceGuard } from "../indexer/sourceGuard";
import { resolveTenant } from "../indexer/tenantResolve";
import { runIndexUnit } from "../indexer/runIndexUnit";
import type { SourceConfig } from "../indexer/sources";
import {
  RECON_PILOT_SOURCE_KEY,
  RECON_PILOT_SOURCE_TABLE,
  type ReconRecordResult,
  type ReconReason,
} from "./types";

// ─── Salt-okunur index satır görünümü (teknik projeksiyon; içerik/PII YOK) ────
export interface IndexRowView {
  /** Index tablosunun kendi PK'sı — YALNIZ keyset cursor için (sınıflandırmada kullanılmaz). */
  readonly id: string;
  readonly tenantId: string | null;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly unitType: string;
  readonly sectionRef: string | null;
  readonly groupKey: string | null;
  readonly contentHash: string | null;
  readonly sourceUpdatedAt: string | null;
}

/** Index→source pass için kaynak varlık görünümü. */
export interface SourceLookupView {
  readonly present: boolean;
  readonly tenantId: string | null;
}

// ─── Pilot allowlist kontrolü (fail-closed) ───────────────────────────────────
export function isPilotStoneConfig(config: SourceConfig): boolean {
  return (
    config.sourceKey === RECON_PILOT_SOURCE_KEY &&
    config.tableName === RECON_PILOT_SOURCE_TABLE
  );
}

// ─── Kaynak eligibility iç verdict'i (saf) ────────────────────────────────────
type SourceVerdict =
  | { readonly kind: "eligible"; readonly tenantId: string; readonly contentHash: string }
  | { readonly kind: "excluded"; readonly reason: ReconReason; readonly tenantId: string | null }
  | { readonly kind: "skipped"; readonly tenantId: string | null }
  | { readonly kind: "unreadable" }
  | { readonly kind: "unsupported" };

/** Guard reason → recon reason (evaluateSourceGuard sonucu). */
function guardReason(config: SourceConfig): ReconReason {
  const g = evaluateSourceGuard(config);
  if (g.indexable) return "none";
  switch (g.reason) {
    case "pii":
      return "pii";
    case "unclassified":
      return "unclassified";
    case "deferred":
      return "policy_rejected";
    case "disabled":
      return "source_disabled";
    default:
      return "policy_rejected";
  }
}

/**
 * Kullanıcı §6 sırasıyla kaynak satırının eligibility verdict'ini üretir.
 * Build ÖNCESİ demo/synthetic/shared dışlanır (reconcile sözleşmesi).
 */
function evaluateSourceVerdict(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
): SourceVerdict {
  // 1) Pilot/config allowlist (fail-closed).
  if (!isPilotStoneConfig(config)) return { kind: "unsupported" };

  // 2) Source indexable/policy (safe-non-pii + enabled). Pilot stones daima geçer;
  //    aksi kaynak (harness) policy dışlaması üretir.
  const guard = evaluateSourceGuard(config);
  if (!guard.indexable) {
    return { kind: "excluded", reason: guardReason(config), tenantId: null };
  }

  // 3) Tenant resolve (satırdan; fail-closed).
  const tenant = resolveTenant(config, row);
  if (!tenant.ok) {
    // shared-not-allowed → bilinçli dışlama; diğer fail → kontrollü okuma hatası.
    if (tenant.reason === "shared-not-allowed") {
      return { kind: "excluded", reason: "shared_not_allowed", tenantId: null };
    }
    return { kind: "unreadable" };
  }
  const tid = tenant.tenantId;

  // 6-önce: shared/null (allowSharedNull config'te ok:true + null verebilir).
  if (tid === null) {
    return { kind: "excluded", reason: "shared_not_allowed", tenantId: null };
  }
  // 4) demo → 5) synthetic (build'DEN ÖNCE).
  if (tid === YH_DEMO_TENANT_ID) return { kind: "excluded", reason: "demo", tenantId: tid };
  if (isSyntheticTenantId(tid)) return { kind: "excluded", reason: "synthetic", tenantId: tid };

  // 7) Build eligibility (INV-1/build sözleşmesi runIndexUnit içinde).
  const run = runIndexUnit({ config, row });
  if (run.status !== "unit") {
    // tenant zaten çözüldü → build-null beklenir; tenant stage'i defansif okuma hatası.
    if (run.skip.stage === "build") return { kind: "skipped", tenantId: tid };
    return { kind: "unreadable" };
  }

  // 8) content_hash (candidate'tan; source_updated_at OTORİTE DEĞİL).
  return { kind: "eligible", tenantId: run.unit.tenantId ?? tid, contentHash: run.unit.contentHash };
}

// ─── Pass A: source → index ───────────────────────────────────────────────────
/**
 * Bir kaynak satırının reconcile sınıfını verir (Pass A). DISJOINT SET GARANTİSİ:
 * bu pass tenant_mismatch / duplicate_index / index_invariant_violation ÜRETMEZ —
 * o index-integrity anomalileri YALNIZ Pass B'ye aittir (combined çift-sayım olmaz).
 * İndex eşleşmesi YALNIZ AYNI TENANT canonical satırıyla yapılır; farklı tenant'taki
 * satır Pass A için "index yok" gibidir (kaynağın kendi tenant'ı indexlenmemiştir →
 * missing/stale/excluded), stray satırı Pass B tenant_mismatch olarak raporlar.
 *
 * @param canonicalIndex Bu source_id için TEK canonical index satırı (varsa) veya null.
 *   (Index tekillik anahtarı (source_table, source_id, section_ref) tenant içermez.)
 */
export function decideSourceToIndex(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
  canonicalIndex: IndexRowView | null,
): ReconRecordResult {
  const verdict = evaluateSourceVerdict(config, row);
  const sourceId = readId(row, config.primaryKey);

  const make = (
    classification: ReconRecordResult["classification"],
    reason: ReconReason,
    futureAction: ReconRecordResult["futureAction"],
    tenantId: string | null,
  ): ReconRecordResult => ({
    pass: "source",
    classification,
    reason,
    futureAction,
    sourceId,
    tenantId,
  });

  // Yalnız kaynağın KENDİ tenant'ına ait canonical index eşleşme sayılır.
  const ownTenant = verdict.kind === "excluded" || verdict.kind === "skipped" || verdict.kind === "eligible"
    ? verdict.tenantId
    : null;
  const sameTenantIndex =
    canonicalIndex !== null && canonicalIndex.tenantId === ownTenant ? canonicalIndex : null;
  const hasOwnIndex = sameTenantIndex !== null;

  switch (verdict.kind) {
    case "unsupported":
      return make("unsupported_source", "not_pilot_source", "none", null);

    case "unreadable":
      return make("source_read_error", "tenant_unresolved", "none", null);

    case "excluded":
      // Kaynak var, indexlenmemeli. Kendi-tenant index VARSA temizlik adayı
      // (deindex_required), yoksa bilinçli dışlama (intentionally_excluded). Missing DEĞİLDİR.
      return hasOwnIndex
        ? make("deindex_required", verdict.reason, "delete", verdict.tenantId)
        : make("intentionally_excluded", verdict.reason, "none", verdict.tenantId);

    case "skipped":
      // Kapıları geçti ama INV-1/build unit üretemedi. Kendi-tenant index varsa deindex, yoksa skipped.
      return hasOwnIndex
        ? make("deindex_required", "build_null", "delete", verdict.tenantId)
        : make("skipped_build", "build_null", "none", verdict.tenantId);

    case "eligible": {
      if (!hasOwnIndex) {
        return make("missing_index", "none", "upsert", verdict.tenantId);
      }
      // Content hash TEK OTORİTE (source_updated_at değil).
      if ((sameTenantIndex as IndexRowView).contentHash === verdict.contentHash) {
        return make("healthy", "hash_match", "none", verdict.tenantId);
      }
      return make("stale_index", "hash_mismatch", "upsert", verdict.tenantId);
    }

    default: {
      const _exhaustive: never = verdict;
      void _exhaustive;
      return make("source_read_error", "none", "none", null);
    }
  }
}

// ─── Pass B: index → source ───────────────────────────────────────────────────
/**
 * Bir index satırının reconcile sınıfını verir (index-centric).
 *   - unit_type≠record / section_ref≠null / yanlış source_table → index_invariant_violation
 *   - aynı source_id için >1 canonical satır → duplicate_index
 *   - kaynak YOK → orphan_index (delete)
 *   - kaynak VAR & tenant farklı → tenant_mismatch
 *   - kaynak VAR & tenant aynı → null (covered: source pass zaten değerlendirir)
 * @param duplicateCanonicalCount Bu source_id için görülen canonical satır sayısı (>1 → duplicate).
 */
export function decideIndexToSource(
  ix: IndexRowView,
  source: SourceLookupView,
  duplicateCanonicalCount: number,
): ReconRecordResult | null {
  const make = (
    classification: ReconRecordResult["classification"],
    reason: ReconReason,
    futureAction: ReconRecordResult["futureAction"],
  ): ReconRecordResult => ({
    pass: "index",
    classification,
    reason,
    futureAction,
    sourceId: ix.sourceId,
    tenantId: ix.tenantId,
  });

  // Invariant (kaynaktan bağımsız): yanlış tablo / unit_type / section_ref.
  if (ix.sourceTable !== RECON_PILOT_SOURCE_TABLE) {
    return make("index_invariant_violation", "source_table_invalid", "none");
  }
  if (ix.unitType !== "record") {
    return make("index_invariant_violation", "unit_type_invalid", "none");
  }
  if (ix.sectionRef !== null) {
    return make("index_invariant_violation", "section_ref_present", "none");
  }
  // Duplicate (canonical record için source_id başına tek satır beklenir).
  if (duplicateCanonicalCount > 1) {
    return make("duplicate_index", "duplicate_key", "none");
  }
  // Orphan: kaynak gerçekten yok.
  if (!source.present) {
    return make("orphan_index", "no_source_row", "delete");
  }
  // Kaynak var ama tenant farklı → fail-closed anomaly (cross-tenant düzeltme YOK).
  if (source.tenantId !== ix.tenantId) {
    return make("tenant_mismatch", "tenant_divergence", "none");
  }
  // Aynı tenant → source pass authoritative (healthy/stale burada üretilmez).
  return null;
}

// ─── Yardımcı: primary key okuma (coercion YOK) ───────────────────────────────
function readId(row: Readonly<Record<string, unknown>>, pk: string): string | null {
  const v = row[pk];
  return typeof v === "string" && v.length > 0 ? v : null;
}

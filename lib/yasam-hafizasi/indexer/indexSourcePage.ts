/**
 * Yaşam Hafızası™ — Tek-Sayfa İndeksleme Orkestrasyonu (Sprint 2 / S2.10, ince IO).
 *
 * Gerçek adapter'ları kurar, `runSource()` çağırır, demo tenant unit'lerini writer
 * ÖNCESİNDE zorunlu düşürür ve (write modunda) `IndexWriter`'a verir. Tek kaynak,
 * tek sayfa. Çok-sayfalı runner / admin route / cron BU DOSYADA YOKTUR (S2.11+).
 *
 * KANONİK KURALLAR (S2.10):
 *   - Demo tenant (`YH_DEMO_TENANT_ID`, config'ten import; config DEĞİŞMEZ) unit'leri
 *     writer'a ULAŞMAZ; write planına girmez (K-L). Reader seviyesinde filtrelenmez
 *     (join child'da tenant_id yok → aynı garanti verilemez); orkestrasyonda düşülür.
 *   - BF-1B-FIX GLOBAL İNVARYANT: sentetik tenant (`isSyntheticTenantId`, tek kaynak
 *     `lib/tenancy/syntheticTenants`) unit'leri kaynak/modül fark etmeksizin writer'a
 *     ULAŞMAZ, eligible OLAMAZ, shared/null'a ÇEVRİLMEZ; `excludedSynthetic` ile
 *     demo'dan AYRI sayılır (bir unit iki sayaca girmez). Dry-run ve write aynı filtreyi
 *     paylaşır. NULL/shared ve gerçek tenant davranışı DEĞİŞMEZ.
 *   - Sonuç yalnız GÜVENLİ sayı/özet taşır; ham `units` / demo içeriği DIŞARI SIZMAZ.
 *   - Dry-run modunda writer çağrılmaz.
 *   - Kaynak/parent okuma hatası fatal propagate; write hatası kontrollü sonuç.
 *   - `getServerDb()` yalnız gerçek kullanımda ve fonksiyon İÇİNDE çağrılır (modül
 *     import side-effect'i yok); test için `db` enjekte edilebilir.
 */

import { getServerDb } from "../../supabase-server";
import { isSyntheticTenantId } from "../../tenancy/syntheticTenants";
import { YH_DEMO_TENANT_ID } from "../config";
import type { BuiltIndexUnit } from "./buildCandidate";
import {
  createSupabaseIndexWriter,
  createSupabaseParentTenantReader,
  createSupabaseSourceReader,
  type IndexDbClient,
  type WriteIndexUnitsResult,
} from "./supabaseIndexAdapters";
import type { ParentPreloadStats, RunSourceResult } from "./runSource";
import { runSource, TenantFilterMismatchError } from "./runSource";
import { runIndexUnit, summarizeRunResults, type RunSummary } from "./runIndexUnit";
import { makeParentTenantLookup } from "./parentTenantLookup";
import type { ParentTenantLookup } from "./tenantResolve";
import type { SourceConfig } from "./sources";
import { isIndexableSource } from "./sourceGuard";
import {
  decideArchiveEligibility,
  type ArchiveEligibilityPort,
} from "./archiveEligibility";
import {
  isValidatedTenantScope,
  supportsTenantScopedPage,
  type ValidatedTenantScope,
} from "./tenantScopeGate";

export type IndexSourcePageMode = "dry-run" | "write";

/**
 * BF-2B exact-write gate durum kodu (kapalı union; ham içerik taşımaz). Yalnız
 * exact modda (`exactSourceId` verildiğinde) doldurulur. `ok` DIŞINDAKİ her değer
 * writer'ın ÇAĞRILMADIĞI (fail-closed) anlamına gelir.
 */
export type ExactWriteStatus =
  | "ok"
  | "tenant-model-unsupported" // join veya shared (allowSharedNull) kaynak → exact pilot dışı
  | "not-found" // PK eşitliğiyle 0 satır
  | "multiple-rows" // >1 satır (PK sözleşme ihlali; fail-closed)
  | "skipped-build" // runIndexUnit unit üretemedi (tenant/kanıt/sourceId)
  | "excluded-demo" // demo tenant
  | "excluded-synthetic" // sentetik (ADMIN_LIBRARY) tenant
  | "excluded-shared" // tenant_id NULL (shared) → exact pilotta reddedilir
  | "source-id-mismatch" // üretilen unit.sourceId ≠ exactSourceId
  | "tenant-mismatch" // üretilen unit.tenantId ≠ expectedTenantId
  | "row-ineligible"; // BF-11E row-gate: safe-non-pii + current-hash geçmeyen kayıt (tombstone yolu)

/**
 * BF-0 son savunma hatası (INV-PII): route dışından doğrudan çağrılıp `safe-non-pii`
 * OLMAYAN veya disabled kaynak verilirse, reader/writer'dan ÖNCE fırlatılır. Route/handler
 * katmanı bunu güvenli `source-not-indexable` (403) yanıtına çevirir. Ham detay taşımaz.
 */
export class SourceNotIndexableError extends Error {
  constructor() {
    super("source-not-indexable");
    this.name = "SourceNotIndexableError";
  }
}

/**
 * BF-4B ÇEKİRDEK GENİŞ-WRITE SAVUNMASI (§12): geniş (exact/tenant-scoped OLMAYAN) WRITE
 * indexSourcePage'e ULAŞAMAZ. Kanıtsız ya da geçersiz-kanıtlı bir write, reader/writer/
 * cursor'a DOKUNMADAN önce fırlatılır (route-bypass savunması; doğrudan çağrıda bile fail-closed).
 * Handler bunu güvenli `broad-write-disabled` (403) yanıtına çevirir. Ham detay taşımaz.
 */
export class BroadWriteDisabledError extends Error {
  constructor() {
    super("broad-write-disabled");
    this.name = "BroadWriteDisabledError";
  }
}

/**
 * BF-4B: tenant-scoped kanıt verildi ama kaynak (join/shared/pii/disabled) tenant-scoped
 * backfill'e uygun DEĞİL → okuma yapılmadan fırlatılır. Handler `source-tenant-scope-unsupported`
 * (422) yanıtına çevirir. Ham detay taşımaz.
 */
export class SourceTenantScopeUnsupportedError extends Error {
  constructor() {
    super("source-tenant-scope-unsupported");
    this.name = "SourceTenantScopeUnsupportedError";
  }
}

/**
 * BF-11E ROW-GATE FAIL-CLOSED: `requiresRowEligibilityGate` kaynak için eligibility portu
 * ENJEKTE EDİLMEMİŞSE (yanlış-wiring), yazma öncesi fırlatılır. Bilinen "ineligible" DEĞİLDİR
 * (iyi veriyi tombstone ETMEZ); worker bunu GEÇİCİ hata olarak ele alır (yazma/silme YOK).
 * Production worker + admin route DAİMA portu enjekte eder.
 */
export class ArchiveEligibilityGateMissingError extends Error {
  constructor() {
    super("archive-eligibility-gate-missing");
    this.name = "ArchiveEligibilityGateMissingError";
  }
}

/**
 * Girdi. `config` statik allowlist'ten (`YH_INDEX_SOURCES`) gelmelidir; mevcut
 * `sources.ts` sourceKey→config registry export etmediğinden ve o dosya korunan
 * olduğundan, config caller tarafından statik olarak verilir (registry uydurulmaz).
 * `db` yalnız test için enjekte edilir; verilmezse `getServerDb()` kullanılır.
 */
export interface IndexSourcePageInput {
  readonly config: SourceConfig;
  readonly afterId?: string | null;
  readonly limit?: number;
  readonly mode: IndexSourcePageMode;
  readonly db?: IndexDbClient;
  /**
   * BF-2B exact-write gate. Verildiğinde geniş sayfa akışı yerine TEK kaydı primary
   * key EŞİTLİĞİYLE hedefler (opsiyonel; verilmezse mevcut sayfa davranışı korunur).
   * `exactSourceId` verilirse `expectedTenantId` de zorunludur (çağıran/validate katmanı
   * garanti eder). Reader PK eşitliğiyle okur; eligible tam 1 olmadıkça writer çağrılmaz.
   */
  readonly exactSourceId?: string | null;
  readonly expectedTenantId?: string | null;
  /**
   * BF-4B tenant-scoped backfill (Model C). Verildiğinde geniş sayfa akışı yerine
   * TEK tenant'a daraltılmış (column-mode) sayfa işlenir. Kanıt YALNIZ
   * `evaluateTenantScope` (tenantScopeGate) tarafından üretilir; taklit/ham UUID
   * `isValidatedTenantScope` ile reddedilir. Exact ile birlikte kullanılamaz
   * (çağıran/validate katmanı garanti eder).
   */
  readonly validatedTenantScope?: ValidatedTenantScope;
  /**
   * BF-11E ROW-GATE (Kişisel Arşiv): `config.requiresRowEligibilityGate === true` kaynaklarda
   * ZORUNLU. exact-record yazma öncesi built unit'in server-türetimli contentHash'i ile ayrı
   * classification tablosundaki (safe-non-pii + reviewed_content_hash) karşılaştırılır. Enjekte
   * EDİLMEZSE ilgili kaynakta yazma fail-closed durur (ArchiveEligibilityGateMissingError).
   */
  readonly archiveEligibility?: ArchiveEligibilityPort;
}

/** Sonuç — yalnız güvenli sayılar/özet; ham unit veya demo içeriği taşımaz. */
export interface IndexSourcePageResult {
  readonly sourceKey: string;
  readonly mode: IndexSourcePageMode;
  readonly fetched: number;
  readonly eligibleUnits: number; // demo + sentetik düşüldükten sonra writer'a giden
  readonly excludedDemo: number;
  readonly excludedSynthetic: number; // BF-1B-FIX: sentetik tenant unit'leri (demo'dan ayrı)
  readonly summary: RunSummary;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly parentStats: ParentPreloadStats;
  readonly write: WriteIndexUnitsResult | null; // dry-run → null
  readonly exactMode: boolean; // BF-2B: exact-record write gate aktif mi
  readonly exactStatus: ExactWriteStatus | null; // yalnız exactMode'da doldurulur
}

export async function indexSourcePage(
  input: IndexSourcePageInput,
): Promise<IndexSourcePageResult> {
  const { config, mode } = input;

  // BF-0 SON SAVUNMA (INV-PII): yalnız safe-non-pii + enabled kaynak indekslenebilir.
  // Reader çağrılmadan, kaynak satırları belleğe alınmadan, writer'a ulaşmadan reddet.
  // (Route yolunda validateAdminIndexRequest zaten engeller; bu doğrudan çağrıya karşı.)
  if (!isIndexableSource(config)) {
    throw new SourceNotIndexableError();
  }

  const db: IndexDbClient = input.db ?? (getServerDb() as unknown as IndexDbClient);

  // BF-2B EXACT-WRITE GATE: exactSourceId verildiğinde geniş sayfa akışı yerine
  // TEK-kayıt PK-eşitliği kapısı çalışır (mevcut sayfa davranışı DEĞİŞMEZ).
  if (input.exactSourceId != null) {
    return runExactRecord(input, db);
  }

  // BF-4B ÇEKİRDEK GENİŞ-WRITE SAVUNMASI (§12; route-bypass): exact OLMAYAN bir WRITE
  // yalnız GEÇERLİ tenant-scoped kanıtıyla ilerleyebilir. Kanıt yoksa veya geçersizse
  // reader/writer/cursor'a DOKUNMADAN fail-closed fırlat (doğrudan çağrıda bile geçerli).
  if (
    mode === "write" &&
    (input.validatedTenantScope === undefined || !isValidatedTenantScope(input.validatedTenantScope))
  ) {
    throw new BroadWriteDisabledError();
  }

  // BF-4B TENANT-SCOPED BACKFILL (Model C): kanıt verildiğinde TEK tenant'a daraltılmış
  // sayfa akışı çalışır (geniş sayfa davranışı DEĞİŞMEZ).
  if (input.validatedTenantScope !== undefined) {
    return runTenantScopedPage(input, db, input.validatedTenantScope);
  }

  const reader = createSupabaseSourceReader(db);
  const parentReader =
    config.tenant.mode === "join" ? createSupabaseParentTenantReader(db) : undefined;

  // Kaynak/parent okuma hatası fatal propagate (IO sınırı çağırandadır).
  const page = await runSource({
    config,
    reader,
    parentReader,
    afterId: input.afterId ?? null,
    limit: input.limit,
  });

  // Demo + sentetik tenant unit'lerini writer ÖNCESİ zorunlu düş (mode-agnostik;
  // ham içerik sızmaz). Sınıflandırma tek ve açık: önce demo, sonra sentetik, kalan
  // eligible — bir unit YALNIZ bir sayaca girer; sentetik shared/null'a ÇEVRİLMEZ.
  const eligible: BuiltIndexUnit[] = [];
  let excludedDemo = 0;
  let excludedSynthetic = 0;
  for (const u of page.units) {
    if (u.tenantId === YH_DEMO_TENANT_ID) {
      excludedDemo += 1;
    } else if (isSyntheticTenantId(u.tenantId)) {
      excludedSynthetic += 1;
    } else {
      eligible.push(u);
    }
  }

  let write: WriteIndexUnitsResult | null = null;
  if (mode === "write") {
    const writer = createSupabaseIndexWriter(db);
    write = await writer.write({ config, units: eligible });
  }

  return {
    sourceKey: page.sourceKey,
    mode,
    fetched: page.fetched,
    eligibleUnits: eligible.length,
    excludedDemo,
    excludedSynthetic,
    summary: page.summary,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    parentStats: page.parentStats,
    write,
    exactMode: false,
    exactStatus: null,
  };
}

// ─── BF-4B TENANT-SCOPED BACKFILL (Model C; tek tenant; column-mode; fail-closed) ─
//
// `validatedTenantScope` (taşınamaz kanıt) ile TEK tenant'ın sayfasını işler. Reader
// sorgusu `.eq(tenant.column, scope.tenantId)` ile daraltılır VE runSource ham satır
// invaryantını uygular. Fail-closed sinyaller TİPLİ THROW ile taşınır (scopeStatus YOK):
//   - geçersiz kanıt → BroadWriteDisabledError (kanıtsız scope tenant-scoped OKUYAMAZ)
//   - kaynak uygun değil → SourceTenantScopeUnsupportedError (okuma yok)
//   - yabancı tenant satırı → TenantFilterMismatchError (runSource + ikincil invaryant)
// Her throw'da writer ÇAĞRILMAZ.
async function runTenantScopedPage(
  input: IndexSourcePageInput,
  db: IndexDbClient,
  scopeInput: ValidatedTenantScope,
): Promise<IndexSourcePageResult> {
  const { config, mode } = input;

  // (1) Kanıt geçerli değilse HİÇ okuma yapılmaz. dry-run dahil: kanıtsız scope tenant-scoped
  // OKUYAMAZ → broad-write-disabled (write yolunda çekirdek savunma zaten önce fırlatır).
  if (!isValidatedTenantScope(scopeInput)) {
    throw new BroadWriteDisabledError();
  }
  // (2) Kaynak tenant-scoped backfill'e uygun değilse (join/shared/pii/disabled) okuma yok.
  if (!supportsTenantScopedPage(config)) {
    throw new SourceTenantScopeUnsupportedError();
  }
  const scope = scopeInput;

  const reader = createSupabaseSourceReader(db);

  // Scoped sayfa oku. runSource ham satır invaryantında TenantFilterMismatchError fırlatır;
  // okuma hatası dahil tüm hatalar propagate (writer'a ulaşılmaz).
  const page: RunSourceResult = await runSource({
    config,
    reader,
    afterId: input.afterId ?? null,
    limit: input.limit,
    scopedTenantId: scope.tenantId,
  });

  // İkincil invaryant: üretilen unit tenant'ı scope ile birebir eşleşmeli (writer öncesi).
  for (const u of page.units) {
    if (u.tenantId !== scope.tenantId) {
      throw new TenantFilterMismatchError();
    }
  }

  // Demo/sentetik düş (mevcut sınıflandırma; scope gerçek tenant olduğundan normalde 0).
  const eligible: BuiltIndexUnit[] = [];
  let excludedDemo = 0;
  let excludedSynthetic = 0;
  for (const u of page.units) {
    if (u.tenantId === YH_DEMO_TENANT_ID) {
      excludedDemo += 1;
    } else if (isSyntheticTenantId(u.tenantId)) {
      excludedSynthetic += 1;
    } else {
      eligible.push(u);
    }
  }

  let write: WriteIndexUnitsResult | null = null;
  if (mode === "write") {
    const writer = createSupabaseIndexWriter(db);
    write = await writer.write({ config, units: eligible });
  }

  return {
    sourceKey: page.sourceKey,
    mode,
    fetched: page.fetched,
    eligibleUnits: eligible.length,
    excludedDemo,
    excludedSynthetic,
    summary: page.summary,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    parentStats: page.parentStats,
    write,
    exactMode: false,
    exactStatus: null,
  };
}

// ─── BF-2B EXACT-WRITE GATE (tek kayıt; PK eşitliği; fail-closed) ──────────────
//
// `exactSourceId` + `expectedTenantId` ile TAM BİR kaydı hedefler. Geniş sayfa
// write davranışını KULLANMAZ (cursor/limit genişletme yok). Writer YALNIZ tüm
// exact guard'lar geçtiğinde (eligible tam 1, sourceId + tenant birebir eşleşir,
// demo/sentetik/shared değil) çağrılır. Aksi her durumda writer'a ulaşılmaz.
async function runExactRecord(
  input: IndexSourcePageInput,
  db: IndexDbClient,
): Promise<IndexSourcePageResult> {
  const { config, mode } = input;
  const exactSourceId = input.exactSourceId as string; // dispatch garantisi: != null
  const expectedTenantId = input.expectedTenantId ?? null;

  const ZERO_SUMMARY: RunSummary = { units: 0, skipped: 0, byReason: {} };
  const ZERO_PARENT: ParentPreloadStats = { requested: 0, found: 0, missing: 0 };

  const reject = (
    status: ExactWriteStatus,
    fetched: number,
    summary: RunSummary,
    excludedDemo: number,
    excludedSynthetic: number,
  ): IndexSourcePageResult => ({
    sourceKey: config.sourceKey,
    mode,
    fetched,
    eligibleUnits: 0,
    excludedDemo,
    excludedSynthetic,
    summary,
    nextCursor: null,
    hasMore: false,
    parentStats: ZERO_PARENT,
    write: null, // fail-closed: writer çağrılmadı
    exactMode: true,
    exactStatus: status,
  });

  // Exact write: column-mode VEYA join-mode (non-shared). global-canonical + shared fail-closed.
  // BF-11E Belge/Video: join+row kaynak desteği (parent üzerinden server-side tenant resolve).
  if (config.tenant.mode === "global-canonical" || config.tenant.allowSharedNull === true) {
    return reject("tenant-model-unsupported", 0, ZERO_SUMMARY, 0, 0);
  }

  const reader = createSupabaseSourceReader(db);
  if (typeof reader.readExactRecord !== "function") {
    // Reader exact desteklemiyor → fail-closed (writer'a ulaşılmaz).
    return reject("tenant-model-unsupported", 0, ZERO_SUMMARY, 0, 0);
  }

  // PK eşitliğiyle oku (okuma hatası fatal propagate; IO sınırı çağırandadır).
  const page = await reader.readExactRecord({ config, sourceId: exactSourceId });
  const fetched = page.rows.length;
  if (fetched === 0) return reject("not-found", 0, ZERO_SUMMARY, 0, 0);
  if (fetched > 1) return reject("multiple-rows", fetched, ZERO_SUMMARY, 0, 0);

  // Join-mode: parent (yh_document_sources) üzerinden tenant sahipliğini SERVER-SIDE çöz
  //   (composite ownership; body/input tenant'a güvenilmez). Column-mode: parentLookup gerekmez.
  //   FK eksik/parent yok → resolveTenant fail-closed → skipped-build → defensiveDeindex (stale temizlenir).
  let parentLookup: ParentTenantLookup | undefined;
  if (config.tenant.mode === "join") {
    const fkRaw = page.rows[0][config.tenant.fkColumn];
    const parentIds = typeof fkRaw === "string" && fkRaw.length > 0 ? [fkRaw] : [];
    const parentReader = createSupabaseParentTenantReader(db);
    const map = await parentReader.readParentTenants({
      parentTable: config.tenant.parentTable,
      parentTenantColumn: config.tenant.parentTenantColumn,
      parentIds,
    });
    parentLookup = makeParentTenantLookup(map);
  }

  // Tek satır → saf çekirdek (S2.08). Row-unit + join tenant (varsa) burada değerlendirilir.
  const runRes = runIndexUnit({ config, row: page.rows[0], parentLookup });
  const summary = summarizeRunResults([runRes]);
  if (runRes.status !== "unit") {
    return reject("skipped-build", fetched, summary, 0, 0);
  }
  const unit = runRes.unit;

  // Dışlama + exact eşleşme (fail-closed sıra: demo → sentetik → shared → id → tenant).
  if (unit.tenantId === YH_DEMO_TENANT_ID) return reject("excluded-demo", fetched, summary, 1, 0);
  if (isSyntheticTenantId(unit.tenantId)) return reject("excluded-synthetic", fetched, summary, 0, 1);
  if (unit.tenantId === null) return reject("excluded-shared", fetched, summary, 0, 0);
  if (unit.sourceId !== exactSourceId) return reject("source-id-mismatch", fetched, summary, 0, 0);
  if (expectedTenantId === null || unit.tenantId !== expectedTenantId) {
    return reject("tenant-mismatch", fetched, summary, 0, 0);
  }

  // BF-11E ROW-GATE (Kişisel Arşiv; requiresRowEligibilityGate): source-level guard'ları geçen
  // kayıt YALNIZ ayrı classification tablosunda safe-non-pii + server-türetimli current content
  // hash (unit.contentHash) eşleşiyorsa yazılır. Bu chokepoint TÜM exact yolları (event + reconcile
  // apply, aynı worker) kapsar; bypass yolu YOKTUR.
  //   - port yok (yanlış-wiring)         → THROW (fail-closed transient; yazma/silme YOK)
  //   - port GERÇEK DB hatası            → THROW (transient; iyi veri tombstone EDİLMEZ)
  //   - lookup missing / unsafe / stale  → "row-ineligible" → defensiveDeindex (stale tombstone)
  if (config.requiresRowEligibilityGate === true) {
    if (input.archiveEligibility === undefined) {
      throw new ArchiveEligibilityGateMissingError();
    }
    // unit.tenantId burada expectedTenantId ile birebir (üstteki guard); unit.sourceId === exactSourceId.
    const lookup = await input.archiveEligibility({
      tenantId: unit.tenantId,
      archiveId: unit.sourceId,
    });
    if (!decideArchiveEligibility(lookup, unit.contentHash)) {
      return reject("row-ineligible", fetched, summary, 0, 0);
    }
  }

  // Tüm exact guard'lar PASS → tam 1 eligible unit. Yalnız write modunda writer çağrılır.
  let write: WriteIndexUnitsResult | null = null;
  if (mode === "write") {
    const writer = createSupabaseIndexWriter(db);
    write = await writer.write({ config, units: [unit] });
  }

  return {
    sourceKey: config.sourceKey,
    mode,
    fetched,
    eligibleUnits: 1,
    excludedDemo: 0,
    excludedSynthetic: 0,
    summary,
    nextCursor: null,
    hasMore: false,
    parentStats: ZERO_PARENT,
    write,
    exactMode: true,
    exactStatus: "ok",
  };
}

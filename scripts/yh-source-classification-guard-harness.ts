// Yaşam Hafızası™ — S2.19-BF/BF-0 Kaynak PII Sınıflandırma Guard harness (saf/mock; gerçek API/DB YOK).
//
// sourceGuard + sources.ts classification + adminIndexRequest guard + indexSourcePage son-savunma
// PUBLIC sözleşmesini GERÇEK import ile doğrular. Gerçek Supabase/route çağrılmaz.
// Çalıştırma:  npx tsx scripts/yh-source-classification-guard-harness.ts

import {
  evaluateSourceGuard,
  isIndexableSource,
  type GuardableSource,
} from "../lib/yasam-hafizasi/indexer/sourceGuard";
import { YH_INDEX_SOURCES, type SourceClassification } from "../lib/yasam-hafizasi/indexer/sources";
import {
  validateAdminIndexRequest,
  handleAdminIndexRequest,
  resolveYhSourceConfig,
  type AdminIndexHandlerDeps,
  type ValidatedAdminIndexRequest,
} from "../lib/yasam-hafizasi/indexer/adminIndexRequest";
import {
  indexSourcePage,
  SourceNotIndexableError,
  BroadWriteDisabledError,
  type IndexSourcePageResult,
} from "../lib/yasam-hafizasi/indexer/indexSourcePage";
import { supportsTenantScopedPage } from "../lib/yasam-hafizasi/indexer/tenantScopeGate";
import type {
  IndexDbClient,
  DbSelectBuilder,
  DbTableBuilder,
  DbQueryResult,
} from "../lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

const src = (classification: SourceClassification, enabled: boolean): GuardableSource => ({
  classification,
  enabled,
});

/** from() çağrılarını kaydeden boş-sonuç mock IndexDbClient (reader/writer tripwire). */
function makeMockDb(): { db: IndexDbClient; fromCalls: string[] } {
  const fromCalls: string[] = [];
  const result: DbQueryResult = { data: [], error: null };
  const selectBuilder: DbSelectBuilder = {
    eq: () => selectBuilder,
    gt: () => selectBuilder,
    in: () => selectBuilder,
    order: () => selectBuilder,
    limit: () => selectBuilder,
    then: (onf, onr) => Promise.resolve(result).then(onf, onr),
  };
  const tableBuilder: DbTableBuilder = {
    select: () => selectBuilder,
    upsert: () => Promise.resolve({ error: null }),
  };
  const db: IndexDbClient = {
    from: (table: string) => {
      fromCalls.push(table);
      return tableBuilder;
    },
  };
  return { db, fromCalls };
}

async function main(): Promise<void> {
  // ═══ 1. Saf guard birim testleri ══════════════════════════════════════════
  {
    const r = evaluateSourceGuard(src("safe-non-pii", true));
    check("1 safe-non-pii + enabled → indexable", r.indexable === true);
    check("2 safe-non-pii + disabled → reason disabled", (() => {
      const d = evaluateSourceGuard(src("safe-non-pii", false));
      return d.indexable === false && d.reason === "disabled";
    })());
    check("3 pii + enabled → reason pii (red)", (() => {
      const d = evaluateSourceGuard(src("pii", true));
      return d.indexable === false && d.reason === "pii";
    })());
    check("4 pii + disabled → reason pii (classification-first)", (() => {
      const d = evaluateSourceGuard(src("pii", false));
      return d.indexable === false && d.reason === "pii";
    })());
    check("5 unclassified + enabled → red", (() => {
      const d = evaluateSourceGuard(src("unclassified", true));
      return d.indexable === false && d.reason === "unclassified";
    })());
    check("6 deferred + enabled → red", (() => {
      const d = evaluateSourceGuard(src("deferred", true));
      return d.indexable === false && d.reason === "deferred";
    })());
    check(
      "7 isIndexableSource yalnız safe-non-pii+enabled true",
      isIndexableSource(src("safe-non-pii", true)) === true &&
        isIndexableSource(src("safe-non-pii", false)) === false &&
        isIndexableSource(src("pii", true)) === false &&
        isIndexableSource(src("unclassified", true)) === false &&
        isIndexableSource(src("deferred", true)) === false,
    );
    check("8 tanınmayan classification → fail-closed unclassified", (() => {
      const d = evaluateSourceGuard({ classification: "hacked" as SourceClassification, enabled: true });
      return d.indexable === false && d.reason === "unclassified";
    })());
    check("9 null/bozuk kaynak → fail-closed unclassified", (() => {
      const d = evaluateSourceGuard(null as unknown as GuardableSource);
      return d.indexable === false && d.reason === "unclassified";
    })());
  }

  // ═══ 2. Registry sınıflandırma envanteri ══════════════════════════════════
  {
    // Professional Cohort: 24 canlı (19 + 3 aroma + 2 numeroloji kod-enabled) + 6 dormant (yebs) = 30 kaynak.
    check("10 registry tam 30 kaynak (24 canlı + 6 dormant; +3 aroma katalog/method)", YH_INDEX_SOURCES.length === 30);
    const VALID: readonly SourceClassification[] = ["safe-non-pii", "pii", "unclassified", "deferred"];
    check(
      "11 her kaynak geçerli classification taşır",
      YH_INDEX_SOURCES.every((s) => VALID.includes(s.classification)),
    );
    const count = (c: SourceClassification) =>
      YH_INDEX_SOURCES.filter((s) => s.classification === c).length;
    check("12 safe-non-pii sayısı 29 (26 + 3 aroma Professional Cohort katalog/method; 30 kaynak − 1 pii)", count("safe-non-pii") === 29);
    check("13 pii sayısı 1", count("pii") === 1);
    check("14 unclassified sayısı 0 (kisisel_arsiv ROW-GATED CONTROLLED'a graduate)", count("unclassified") === 0);
    check("15 deferred sayısı 0", count("deferred") === 0);
    const cls = (key: string) => YH_INDEX_SOURCES.find((s) => s.sourceKey === key)?.classification;
    check("16 refleksoloji:notes = pii", cls("refleksoloji:notes") === "pii");
    check("17 kisisel_arsiv:archives = safe-non-pii (row-gated; requiresRowEligibilityGate)", cls("kisisel_arsiv:archives") === "safe-non-pii");
    check("18 refleksoloji:protocols = safe-non-pii", cls("refleksoloji:protocols") === "safe-non-pii");
    check("19 aromaterapi:blends = safe-non-pii", cls("aromaterapi:blends") === "safe-non-pii");
    const oils = resolveYhSourceConfig("aromaterapi:oils");
    check("20 pilot aromaterapi:oils indexable", oils !== null && isIndexableSource(oils));
  }

  // ═══ 3. Request validation entegrasyonu ═══════════════════════════════════
  {
    const unk = validateAdminIndexRequest({ sourceKey: "yok:tablo", mode: "dry-run" });
    check("21 unknown sourceKey → unknown-source (400)", !unk.ok && unk.code === "unknown-source" && unk.status === 400);

    const piiDry = validateAdminIndexRequest({ sourceKey: "refleksoloji:notes", mode: "dry-run" });
    check("22 pii dry-run → source-not-indexable (403)", !piiDry.ok && piiDry.code === "source-not-indexable" && piiDry.status === 403);

    const piiWrite = validateAdminIndexRequest({ sourceKey: "refleksoloji:notes", mode: "write" });
    check("23 pii write → source-not-indexable (403)", !piiWrite.ok && piiWrite.code === "source-not-indexable" && piiWrite.status === 403);

    // BF-11E: kisisel_arsiv:archives artık ROW-GATED CONTROLLED (safe-non-pii) → source-level guard
    // GEÇER (satır güvenliği row-gate'te). Ama kör tenant-scoped backfill FAIL-CLOSED.
    const arcDry = validateAdminIndexRequest({ sourceKey: "kisisel_arsiv:archives", mode: "dry-run" });
    check("24 archive row-gated dry-run → source-level ok (row-gate downstream)", arcDry.ok === true);

    const arcCfg = resolveYhSourceConfig("kisisel_arsiv:archives")!;
    check("25 archive kör tenant-scoped backfill FAIL-CLOSED (supportsTenantScopedPage=false)", supportsTenantScopedPage(arcCfg) === false);

    const safe = validateAdminIndexRequest({ sourceKey: "aromaterapi:oils", mode: "dry-run" });
    check("26 safe source dry-run → ok", safe.ok === true);
  }

  // ═══ 4. indexSourcePage son savunma (doğrudan çağrı) ══════════════════════
  {
    const oils = resolveYhSourceConfig("aromaterapi:oils")!;
    const notes = resolveYhSourceConfig("refleksoloji:notes")!;
    const archives = resolveYhSourceConfig("kisisel_arsiv:archives")!;

    // pii → throw, reader/writer'a ulaşılmaz (db.from çağrılmaz)
    const m1 = makeMockDb();
    let threwPii = false;
    try {
      await indexSourcePage({ config: notes, mode: "dry-run", db: m1.db });
    } catch (e) {
      threwPii = e instanceof SourceNotIndexableError;
    }
    check("27 indexSourcePage pii → SourceNotIndexableError", threwPii);
    check("28 pii non-indexable'da reader/writer çağrılmaz (db.from=0)", m1.fromCalls.length === 0);

    // BF-11E row-gated archive: source-level guard geçer ama kör (scope'suz) broad WRITE FAIL-CLOSED
    // → BroadWriteDisabledError (writer'a ulaşılmaz). Kör bulk indexleme yolu kapalı.
    const m2 = makeMockDb();
    let threwArcBroad = false;
    try {
      await indexSourcePage({ config: archives, mode: "write", db: m2.db });
    } catch (e) {
      threwArcBroad = e instanceof BroadWriteDisabledError;
    }
    check("29 indexSourcePage archive broad write → broad-write-disabled + writer çağrılmaz", threwArcBroad && m2.fromCalls.length === 0);

    // disabled safe → throw (classification safe olsa da enabled=false)
    const m3 = makeMockDb();
    let threwDisabled = false;
    try {
      await indexSourcePage({ config: { ...oils, enabled: false }, mode: "dry-run", db: m3.db });
    } catch (e) {
      threwDisabled = e instanceof SourceNotIndexableError;
    }
    check("30 indexSourcePage safe ama disabled → throw", threwDisabled && m3.fromCalls.length === 0);

    // safe + enabled → throw YOK, reader çağrılır (db.from ≥ 1), dry-run write=null
    const m4 = makeMockDb();
    let safeResult: IndexSourcePageResult | null = null;
    let safeThrew = false;
    try {
      safeResult = await indexSourcePage({ config: oils, mode: "dry-run", db: m4.db });
    } catch {
      safeThrew = true;
    }
    check("31 safe source → throw YOK + reader çağrılır (db.from≥1)", !safeThrew && m4.fromCalls.length >= 1);
    check("32 safe dry-run mevcut sonuç korunur (write=null)", safeResult !== null && safeResult.write === null);
  }

  // ═══ 5. handleAdminIndexRequest — demo regresyonu + sızıntı + safe yol ════
  {
    let indexCalls = 0;
    const runIndexSourcePage = (v: ValidatedAdminIndexRequest): Promise<IndexSourcePageResult> => {
      indexCalls++;
      return Promise.resolve({
        sourceKey: v.sourceKey,
        mode: v.mode,
        fetched: 0,
        eligibleUnits: 0,
        excludedDemo: 0,
        summary: { units: 0, skipped: 0 },
        nextCursor: null,
        hasMore: false,
        parentStats: { requested: 0, resolved: 0, chunks: 0 },
        write: null,
      } as unknown as IndexSourcePageResult);
    };
    const deps = (isDemo: boolean): AdminIndexHandlerDeps => ({
      adminId: "admin-1",
      checkAdminDemoStatus: () => Promise.resolve({ ok: true, isDemo }),
      runIndexSourcePage,
    });

    // pii write → source-not-indexable; indexSourcePage ÇAĞRILMAZ
    indexCalls = 0;
    const piiRes = await handleAdminIndexRequest({ sourceKey: "refleksoloji:notes", mode: "write" }, deps(false));
    check("33 handle pii write → 403 source-not-indexable", piiRes.status === 403 && piiRes.body.ok === false && "error" in piiRes.body && piiRes.body.error.code === "source-not-indexable");
    check("34 pii write → runIndexSourcePage çağrılmaz", indexCalls === 0);

    // demo guard regresyonu: safe source + demo admin write → demo-write-forbidden (403)
    indexCalls = 0;
    const demoRes = await handleAdminIndexRequest({ sourceKey: "aromaterapi:oils", mode: "write" }, deps(true));
    check("35 demo guard korunur (safe+demo write → demo-write-forbidden)", demoRes.status === 403 && !demoRes.body.ok && "error" in demoRes.body && demoRes.body.error.code === "demo-write-forbidden");
    check("36 demo write → runIndexSourcePage çağrılmaz", indexCalls === 0);

    // safe dry-run → ok:true, response'ta classification YOK
    indexCalls = 0;
    const okRes = await handleAdminIndexRequest({ sourceKey: "aromaterapi:oils", mode: "dry-run" }, deps(false));
    check("37 safe dry-run → ok:true (mevcut yol korunur)", okRes.status === 200 && okRes.body.ok === true);
    check("38 safe dry-run → indexSourcePage çağrıldı", indexCalls === 1);
    const blob = JSON.stringify(okRes.body).toLowerCase();
    check("39 classification response'a sızmaz", !blob.includes("classification") && !blob.includes("safe-non-pii") && !blob.includes("unclassified"));
  }

  console.log("");
  console.log("S2.19-BF/BF-0 source classification guard harness — saf/mock; gerçek API/DB YOK.");
  console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
  console.log("- guard: yalnız safe-non-pii+enabled kabul; pii/unclassified/deferred/disabled fail-closed");
  console.log("- registry 27 kaynak (26 safe / 1 pii / 0 unclassified / 0 deferred; kisisel_arsiv ROW-GATED CONTROLLED; +2 biyoenerji cohort-A; +2 numeroloji +6 yebs DORMANT; belge_video retired); her kaynak classification taşır");
  console.log("- validate + indexSourcePage son savunma: pii/unclassified/disabled reddedilir, reader/writer'a ulaşılmaz");
  console.log("- demo guard regresyonu korunur; classification HTTP yanıtına sızmaz");
  if (failed > 0) process.exitCode = 1;
}

void main();

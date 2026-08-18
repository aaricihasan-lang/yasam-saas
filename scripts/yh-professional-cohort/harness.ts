/**
 * YAŞAM HAFIZASI™ — PROFESSIONAL COHORT HARNESS (Aromaterapi Canonical V2 + Numeroloji).
 * =========================================================================
 *
 * GERÇEK processOutboxEvent + GERÇEK indexSourcePage (exact) + GERÇEK deindexer, in-memory
 * mutable index store üzerinde. Kapsam (kullanıcı TUR 2 §9):
 *   A) AROMA PLANT-TAXA / PREPARATIONS: draft (ineligible)→no-index/deindex; verified/approved
 *      INSERT→index; UPDATE→same-identity refresh; publishable→draft→deindex; DELETE→deindex;
 *      duplicate=0; ghost=0; tenant correct.
 *   B) AROMA METHOD (SEÇENEK B): draft-only→no-index; verified promotion→series-identity index;
 *      replacement verified→old content disappears / new appears (aynı series_id); no-verified→deindex;
 *      coalesce (revizyon status geçişi → series-keyed; worker current verified'ı çözer); tenant correct.
 *   C) NUMEROLOGY: wiring; activation OFF→no processing; own tenant_id preserved; INSERT/UPDATE/DELETE;
 *      child (entries) delete→deindex; PII/client tablo YOK.
 *   D) REGISTRY/MATRIX INVARYANTLARI + MIGRATION STATIC CONTRACT (security/activation-gate/no-DML).
 *
 * SAF harness: DB YOK (in-memory fake IndexDbClient/IndexDeleteClient). getServerDb ÇAĞRILMAZ (db enjekte).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { processOutboxEvent, type EventProcessorDeps } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import type { ClaimedOutboxEvent } from "@/lib/yasam-hafizasi/outbox/outboxRpcClient";
import { indexSourcePage } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import {
  createSupabaseIndexDeindexer,
  type IndexDbClient,
  type IndexDeleteClient,
  type IndexDeleteQuery,
} from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { validateActivationMatrix } from "@/lib/yasam-hafizasi/activation/activationMatrix";
import { validateModuleSourceMatrix } from "@/lib/yasam-hafizasi/moduleSourceMatrix";
import { YH_TABLES } from "@/lib/yasam-hafizasi/config";

type Row = Record<string, unknown>;
type ProcessDirective = Awaited<ReturnType<typeof processOutboxEvent>>;

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

// ── Sabit kimlikler (deterministik uuid'ler) ──────────────────────────────────
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TAXON_ID = "10000000-0000-4000-8000-000000000001";
const PREP_ID = "20000000-0000-4000-8000-000000000002";
const SERIES_ID = "30000000-0000-4000-8000-000000000003";
const REV1_ID = "40000000-0000-4000-8000-000000000004";
const REV2_ID = "40000000-0000-4000-8000-000000000005";
const CATALOG_ID = "50000000-0000-4000-8000-000000000006";
const NUM_SRC_ID = "60000000-0000-4000-8000-000000000007";
const NUM_ENTRY_ID = "70000000-0000-4000-8000-000000000008";
const EV_ID = "80000000-0000-4000-8000-000000000009";

const cfg = (key: string): SourceConfig => {
  const c = YH_INDEX_SOURCES.find((s) => s.sourceKey === key);
  if (!c) throw new Error(`registry kaynağı yok: ${key}`);
  return c as SourceConfig;
};

const note = (d: ProcessDirective): string => String((d as { note?: string }).note);

// ── In-memory ortam: source tabloları + mutable yasam_hafizasi_index ──────────
interface Env {
  readonly db: IndexDbClient;
  readonly deleteClient: IndexDeleteClient;
  readonly index: Row[];
  setRows(table: string, rows: readonly Row[]): void;
}

function makeEnv(): Env {
  const index: Row[] = [];
  const sources: Record<string, Row[]> = {};

  const selectBuilder = (getRows: () => Row[]) => {
    let rows = getRows().map((r) => ({ ...r }));
    const sb = {
      eq(c: string, v: unknown) {
        rows = rows.filter((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
        return sb;
      },
      gt(c: string, v: unknown) { rows = rows.filter((r) => (r[c] as number) > (v as number)); return sb; },
      in(c: string, vs: readonly unknown[]) { rows = rows.filter((r) => vs.includes(r[c])); return sb; },
      order() { return sb; },
      limit(n: number) { rows = rows.slice(0, n); return sb; },
      then(res: (x: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return sb;
  };

  const indexConflictKey = (r: Row): string =>
    `${String(r["source_table"])}|${String(r["source_id"])}|${r["section_ref"] == null ? "" : String(r["section_ref"])}`;

  const db = {
    from(table: string) {
      if (table === YH_TABLES.index) {
        return {
          select() { return selectBuilder(() => index); },
          upsert(rows: readonly Row[]) {
            for (const raw of rows) {
              const r = { ...raw };
              const key = indexConflictKey(r);
              const i = index.findIndex((e) => indexConflictKey(e) === key);
              if (i >= 0) index[i] = r;
              else index.push(r);
            }
            return Promise.resolve({ error: null });
          },
        };
      }
      return {
        select() { return selectBuilder(() => sources[table] ?? []); },
        upsert() { return Promise.resolve({ error: null }); },
      };
    },
  } as unknown as IndexDbClient;

  const deleteClient: IndexDeleteClient = {
    deleteRows: async (q: IndexDeleteQuery) => {
      if (q.table !== YH_TABLES.index) return { error: false, count: 0 };
      const before = index.length;
      const survivors = index.filter((r) =>
        !q.filters.every(([c, v]) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)),
      );
      const removed = before - survivors.length;
      index.length = 0;
      index.push(...survivors);
      return { error: false, count: removed };
    },
  };

  return {
    db,
    deleteClient,
    index,
    setRows: (table, rows) => { sources[table] = rows.map((r) => ({ ...r })); },
  };
}

const ev = (
  sourceKey: string,
  sourceTable: string,
  sourceId: string,
  tenantId: string | null,
  operation: "upsert" | "delete",
): ClaimedOutboxEvent =>
  ({
    id: EV_ID, sourceKey, sourceTable, sourceId, tenantId, operation, attempts: 1, eventVersion: 1,
  } as ClaimedOutboxEvent);

const deps = (env: Env, active: boolean): EventProcessorDeps => ({
  resolveConfig: (k) => YH_INDEX_SOURCES.find((s) => s.sourceKey === k) ?? null,
  runExactUpsert: async (input) =>
    indexSourcePage({
      config: input.config,
      exactSourceId: input.exactSourceId,
      expectedTenantId: input.expectedTenantId,
      mode: "write",
      db: env.db,
    }),
  deindex: async (input) => createSupabaseIndexDeindexer(env.deleteClient).deindex(input),
  isSourceProcessingActive: async () => active,
});

// ── Catalog satır fabrikaları ─────────────────────────────────────────────────
const taxonRow = (status: string, tenant = TENANT_A): Row => ({
  id: CATALOG_ID, tenant_id: tenant, canonical_name: "Lavandula angustifolia",
  primary_common_name_tr: "Gerçek lavanta", genus: "Lavandula", species: "angustifolia",
  family: "Lamiaceae", author_citation: "Mill.", taxon_rank: "species", status,
  updated_at: "2026-01-01T00:00:00Z",
});
const prepRow = (status: string): Row => ({
  id: CATALOG_ID, tenant_id: TENANT_A, taxon_id: TAXON_ID, preparation_type: "essential_oil",
  plant_part: "flower", chemotype: null, status, updated_at: "2026-01-01T00:00:00Z",
});

// ── Method fixture: series + preparat + takson + revizyonlar ──────────────────
function seedMethodBase(env: Env): void {
  env.setRows("aromatherapy_preparation_method_series", [
    { id: SERIES_ID, tenant_id: TENANT_A, preparation_id: PREP_ID, method_kind: "faithful_source", method_lang: "tr" },
  ]);
  env.setRows("aromatherapy_preparations", [
    { id: PREP_ID, tenant_id: TENANT_A, taxon_id: TAXON_ID, preparation_type: "essential_oil", plant_part: "flower", chemotype: null },
  ]);
  env.setRows("aromatherapy_plant_taxa", [
    { id: TAXON_ID, tenant_id: TENANT_A, canonical_name: "Lavandula angustifolia", primary_common_name_tr: "Gerçek lavanta", family: "Lamiaceae" },
  ]);
}
const revRow = (id: string, revision: number, status: string, methodText: string): Row => ({
  id, tenant_id: TENANT_A, series_id: SERIES_ID, revision, status,
  updated_at: `2026-0${revision}-01T00:00:00Z`, method_text: methodText,
  plant_part_used: "çiçek", material_state: "fresh", equipment: null, amount_ratio: null,
  solvent_carrier: null, duration_text: null, temperature_text: null,
  steps: [{ order: 1, text: "Distilasyon adımı" }], filtration: null, resting: null,
  storage: null, quality_notes: null, safety_notes: null,
});

async function drive(
  env: Env, key: string, table: string, sourceId: string, tenantId: string | null,
  op: "upsert" | "delete", active = true,
): Promise<ProcessDirective> {
  return processOutboxEvent(ev(key, table, sourceId, tenantId, op), deps(env, active));
}

async function run(): Promise<void> {
// ═══ A) AROMA CATALOG (plant-taxa + preparations) ════════════════════════════
{
  const PLANT = "aromaterapi:plant-taxa";
  const T_PLANT = "aromatherapy_plant_taxa";

  // A1: draft INSERT → ineligible → skipped-build → defensiveDeindex; index BOŞ (ghost yok).
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("draft")]);
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    add("A1-draft-not-indexed", d.action === "complete" && note(d).startsWith("defensive-deindex:") && env.index.length === 0, `${note(d)} idx=${env.index.length}`);
  }
  // A2: verified INSERT → index (1 satır; tenant doğru; source_table = tablo).
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("verified")]);
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    add("A2-verified-indexed", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1, `${note(d)} idx=${env.index.length}`);
    add("A2-index-scope-correct", env.index[0]?.["tenant_id"] === TENANT_A && env.index[0]?.["source_id"] === CATALOG_ID && env.index[0]?.["source_table"] === T_PLANT);
  }
  // A3: approved da eligible (verified_content = {verified, approved}).
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("approved")]);
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    add("A3-approved-indexed", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1, `${note(d)} idx=${env.index.length}`);
  }
  // A4: verified→UPDATE (içerik değişir) → aynı identity refresh (duplicate=0; hash değişir).
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("verified")]);
    await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    const hash1 = env.index[0]?.["content_hash"];
    env.setRows(T_PLANT, [{ ...taxonRow("verified"), primary_common_name_tr: "Tıbbi lavanta (revize)" }]);
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    add("A4-update-same-identity-refresh", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1 && env.index[0]?.["content_hash"] !== hash1, `idx=${env.index.length}`);
  }
  // A5: verified→draft (publishable→non-publishable; savunma yol) → deindex (ghost=0).
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("verified")]);
    await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    add("A5a-pre-indexed", env.index.length === 1);
    env.setRows(T_PLANT, [taxonRow("draft")]);
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    add("A5-downgrade-deindexed", d.action === "complete" && note(d).startsWith("defensive-deindex:") && env.index.length === 0, `${note(d)} idx=${env.index.length}`);
  }
  // A6: DELETE (savunma; uygulamada ulaşılamaz) → deindex.
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("verified")]);
    await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "upsert");
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_A, "delete");
    add("A6-delete-deindexed", d.action === "complete" && env.index.length === 0, `${note(d)} idx=${env.index.length}`);
  }
  // A7: preparations verified → index (ayrı katalog kaynağı).
  {
    const env = makeEnv();
    env.setRows("aromatherapy_preparations", [prepRow("verified")]);
    const d = await drive(env, "aromaterapi:preparations", "aromatherapy_preparations", CATALOG_ID, TENANT_A, "upsert");
    add("A7-preparations-verified-indexed", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1, `${note(d)} idx=${env.index.length}`);
  }
  // A8: tenant mismatch → fail (tenant sızmaz).
  {
    const env = makeEnv();
    env.setRows(T_PLANT, [taxonRow("verified", TENANT_A)]);
    const d = await drive(env, PLANT, T_PLANT, CATALOG_ID, TENANT_B, "upsert");
    add("A8-tenant-mismatch-fail", d.action === "fail" && env.index.length === 0, `${JSON.stringify(d)} idx=${env.index.length}`);
  }
}

// ═══ B) AROMA METHOD (SEÇENEK B: seri identity + verified revizyon) ══════════
{
  const METHOD = "aromaterapi:method";
  const T_SERIES = "aromatherapy_preparation_method_series";

  // B1: yalnız draft revizyon → verified yok → not-found → deindex (index BOŞ).
  {
    const env = makeEnv();
    seedMethodBase(env);
    env.setRows("aromatherapy_preparation_method_revisions", [revRow(REV1_ID, 1, "draft", "Taslak yöntem")]);
    const d = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    add("B1-draft-only-not-indexed", d.action === "complete" && note(d).startsWith("defensive-deindex:") && env.index.length === 0, `${note(d)} idx=${env.index.length}`);
  }
  // B2: verified promotion → series identity (source_id=series) altında index.
  {
    const env = makeEnv();
    seedMethodBase(env);
    env.setRows("aromatherapy_preparation_method_revisions", [revRow(REV1_ID, 1, "verified", "Distilasyon yöntemi A")]);
    const d = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    add("B2-verified-series-indexed", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1, `${note(d)} idx=${env.index.length}`);
    add("B2-source-id-is-series", env.index[0]?.["source_id"] === SERIES_ID && env.index[0]?.["source_table"] === T_SERIES && env.index[0]?.["tenant_id"] === TENANT_A, JSON.stringify({ sid: env.index[0]?.["source_id"], st: env.index[0]?.["source_table"] }));
    // title takson + preparat + method_kind'den türetildi.
    add("B2-title-derived", typeof env.index[0]?.["title"] === "string" && String(env.index[0]?.["title"]).includes("Lavandula angustifolia"), String(env.index[0]?.["title"]));
  }
  // B3: REPLACEMENT — eski verified→archived + yeni verified (rev2) → aynı series_id refresh;
  //     eski içerik KAYBOLUR, yeni içerik GÖRÜNÜR, duplicate=0 (tek satır, content_hash değişir).
  {
    const env = makeEnv();
    seedMethodBase(env);
    env.setRows("aromatherapy_preparation_method_revisions", [revRow(REV1_ID, 1, "verified", "Distilasyon yöntemi A")]);
    await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    const hashA = env.index[0]?.["content_hash"];
    const snippetA = env.index[0]?.["snippet"];
    // promotion transaction sonucu DB state: rev1 archived, rev2 verified (current).
    env.setRows("aromatherapy_preparation_method_revisions", [
      revRow(REV1_ID, 1, "archived", "Distilasyon yöntemi A"),
      revRow(REV2_ID, 2, "verified", "Distilasyon yöntemi B (revize)"),
    ]);
    const d = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    add("B3-replacement-same-identity", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1 && env.index[0]?.["source_id"] === SERIES_ID, `idx=${env.index.length}`);
    add("B3-old-disappears-new-appears", env.index[0]?.["content_hash"] !== hashA && env.index[0]?.["snippet"] !== snippetA && String(env.index[0]?.["snippet"]).includes("revize"), `snip=${String(env.index[0]?.["snippet"])}`);
    add("B3-no-duplicate", env.index.filter((r) => r["source_id"] === SERIES_ID).length === 1);
  }
  // B4: NO-VERIFIED (verified→archived, replacement'sız) → deindex (ghost yok).
  {
    const env = makeEnv();
    seedMethodBase(env);
    env.setRows("aromatherapy_preparation_method_revisions", [revRow(REV1_ID, 1, "verified", "Yöntem")]);
    await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    add("B4a-pre-indexed", env.index.length === 1);
    env.setRows("aromatherapy_preparation_method_revisions", [revRow(REV1_ID, 1, "archived", "Yöntem")]);
    const d = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    add("B4-no-verified-deindexed", d.action === "complete" && note(d).startsWith("defensive-deindex:") && env.index.length === 0, `${note(d)} idx=${env.index.length}`);
  }
  // B5: COALESCE — aynı transaction'da 2 revizyon UPDATE'i tek series_id olayına iner; worker
  //     current verified'ı (rev2) çözer. İki ardışık drive (aynı env) idempotent → tek satır.
  {
    const env = makeEnv();
    seedMethodBase(env);
    env.setRows("aromatherapy_preparation_method_revisions", [
      revRow(REV1_ID, 1, "archived", "A"),
      revRow(REV2_ID, 2, "verified", "B current"),
    ]);
    const d1 = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert"); // eski verified→archived olayı (coalesce)
    const d2 = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert"); // yeni draft→verified olayı (coalesce)
    add("B5-coalesce-idempotent-single", d1.action === "complete" && d2.action === "complete" && env.index.length === 1 && env.index[0]?.["source_id"] === SERIES_ID, `idx=${env.index.length}`);
    add("B5-current-verified-resolved", String(env.index[0]?.["snippet"]).includes("current"), String(env.index[0]?.["snippet"]));
  }
  // B6: DELETE-of-revision event (op=upsert capture; savunma) → current verified yoksa deindex.
  //     (Method capture DELETE'i 'upsert' olarak enqueue eder; burada revizyon yok → deindex.)
  {
    const env = makeEnv();
    seedMethodBase(env);
    env.setRows("aromatherapy_preparation_method_revisions", []);
    const d = await drive(env, METHOD, T_SERIES, SERIES_ID, TENANT_A, "upsert");
    add("B6-no-revision-deindex", d.action === "complete" && note(d).startsWith("defensive-deindex:") && env.index.length === 0, `${note(d)} idx=${env.index.length}`);
  }
}

// ═══ C) NUMEROLOGY (wiring + OFF + tenant + I/U/D) ═══════════════════════════
{
  const NUM_SRC = "numeroloji:sources";
  const T_NUM_SRC = "numerology_sources";
  const NUM_ENTRY = "numeroloji:knowledge-entries";
  const T_NUM_ENTRY = "numerology_knowledge_source_entries";
  const numSrcRow = (tenant = TENANT_A): Row => ({
    id: NUM_SRC_ID, tenant_id: tenant, display_label: "Kaynak K1", title: "Numeroloji Temelleri",
    authors: "Yazar A", organization: "Kurum", source_type: "book", language: "tr", notes: "not",
    updated_at: "2026-01-01T00:00:00Z",
  });
  const numEntryRow = (): Row => ({
    id: NUM_ENTRY_ID, tenant_id: TENANT_A, knowledge_record_id: "90000000-0000-4000-8000-000000000010",
    source_id: NUM_SRC_ID, body: "Uzman bilgi notu gövdesi", display_order: 0, include_in_analysis: false,
    updated_at: "2026-01-01T00:00:00Z",
  });

  // Hypothetical post-clean-reset deps: enabledKey için registry config'i enabled:true'ya YÜKSELTİR
  // (GERÇEK registry enabled:false KORUNUR — bu yalnız clean-reset SONRASI wiring hazırlığını kanıtlar).
  const hypDeps = (env: Env, enabledKey: string): EventProcessorDeps => ({
    resolveConfig: (k) => {
      const c = YH_INDEX_SOURCES.find((s) => s.sourceKey === k) ?? null;
      if (!c) return null;
      return k === enabledKey ? ({ ...(c as SourceConfig), enabled: true }) : (c as SourceConfig);
    },
    runExactUpsert: async (input) =>
      indexSourcePage({ config: input.config, exactSourceId: input.exactSourceId, expectedTenantId: input.expectedTenantId, mode: "write", db: env.db }),
    deindex: async (input) => createSupabaseIndexDeindexer(env.deleteClient).deindex(input),
    isSourceProcessingActive: async () => true,
  });
  const driveHyp = (env: Env, key: string, table: string, sourceId: string, op: "upsert" | "delete"): Promise<ProcessDirective> =>
    processOutboxEvent(ev(key, table, sourceId, TENANT_A, op), hypDeps(env, key));

  // C1: registry DORMANT (enabled:false KORUNDU); PII/status kolonu yok; tenant column.
  add("C1-numeroloji-enabled-false", cfg(NUM_SRC).enabled === false && cfg(NUM_ENTRY).enabled === false);
  add("C1-numeroloji-tenant-column", cfg(NUM_SRC).tenant.mode === "column" && cfg(NUM_ENTRY).tenant.mode === "column");
  add("C1-no-status-gate", cfg(NUM_SRC).statusColumn == null && cfg(NUM_ENTRY).statusColumn == null);

  // C2: ÇİFT KAPI — registry enabled:false → DB is_active=true (yanlış flip) OLSA DAHİ Kapı 4
  //     'source-not-indexable' (aktivasyon kapısından ÖNCE) → index YAZILMAZ (test verisi girmez).
  {
    const env = makeEnv();
    env.setRows(T_NUM_SRC, [numSrcRow()]);
    const d = await drive(env, NUM_SRC, T_NUM_SRC, NUM_SRC_ID, TENANT_A, "upsert", /*active*/ true);
    add("C2-double-gate-db-flip-blocked", d.action === "fail" && (d as { code?: string }).code === "source-not-indexable" && env.index.length === 0, `${JSON.stringify(d)} idx=${env.index.length}`);
  }
  // C3: ÇİFT KAPI — is_active=false iken de bloklu (enabled:false birincil kapı).
  {
    const env = makeEnv();
    env.setRows(T_NUM_SRC, [numSrcRow()]);
    const d = await drive(env, NUM_SRC, T_NUM_SRC, NUM_SRC_ID, TENANT_A, "upsert", /*active*/ false);
    add("C3-registry-disabled-blocked", d.action === "fail" && (d as { code?: string }).code === "source-not-indexable" && env.index.length === 0, `${JSON.stringify(d)} idx=${env.index.length}`);
  }
  // C4: WIRING READINESS (HYPOTHETICAL post-clean-reset enabled:true) — INSERT → index; own tenant_id preserved.
  {
    const env = makeEnv();
    env.setRows(T_NUM_SRC, [numSrcRow()]);
    const d = await driveHyp(env, NUM_SRC, T_NUM_SRC, NUM_SRC_ID, "upsert");
    add("C4-hyp-insert-indexed", d.action === "complete" && note(d) === "upsert-ok" && env.index.length === 1 && env.index[0]?.["tenant_id"] === TENANT_A, `${note(d)} idx=${env.index.length}`);
  }
  // C5: HYPOTHETICAL — UPDATE → same-identity refresh (duplicate=0); DELETE → deindex (ghost yok).
  {
    const env = makeEnv();
    env.setRows(T_NUM_SRC, [numSrcRow()]);
    await driveHyp(env, NUM_SRC, T_NUM_SRC, NUM_SRC_ID, "upsert");
    env.setRows(T_NUM_SRC, [{ ...numSrcRow(), notes: "güncellenmiş not" }]);
    const upd = await driveHyp(env, NUM_SRC, T_NUM_SRC, NUM_SRC_ID, "upsert");
    add("C5-hyp-update-refresh-single", upd.action === "complete" && note(upd) === "upsert-ok" && env.index.length === 1);
    const del = await driveHyp(env, NUM_SRC, T_NUM_SRC, NUM_SRC_ID, "delete");
    add("C5-hyp-delete-deindexed", del.action === "complete" && env.index.length === 0, `${note(del)} idx=${env.index.length}`);
  }
  // C6: HYPOTHETICAL entries (child) — kendi tenant_id'sini taşır → cascade DELETE'te bile generic deindex.
  {
    const env = makeEnv();
    env.setRows(T_NUM_ENTRY, [numEntryRow()]);
    const up = await driveHyp(env, NUM_ENTRY, T_NUM_ENTRY, NUM_ENTRY_ID, "upsert");
    add("C6-hyp-entry-insert-indexed", up.action === "complete" && note(up) === "upsert-ok" && env.index.length === 1);
    const del = await driveHyp(env, NUM_ENTRY, T_NUM_ENTRY, NUM_ENTRY_ID, "delete");
    add("C6-hyp-entry-cascade-delete-deindexed", del.action === "complete" && env.index.length === 0, `${note(del)} idx=${env.index.length}`);
  }
  // C7: numeroloji registry'de client/PII tablo YOK (yalnız 2 professional kaynak).
  {
    const numKeys = YH_INDEX_SOURCES.filter((s) => s.sourceFamily === "numeroloji").map((s) => s.sourceKey).sort();
    add("C7-only-two-professional-sources", JSON.stringify(numKeys) === JSON.stringify(["numeroloji:knowledge-entries", "numeroloji:sources"]), numKeys.join(","));
    const numTables = YH_INDEX_SOURCES.filter((s) => s.sourceFamily === "numeroloji").map((s) => s.tableName);
    add("C7-no-client-result-table", !numTables.some((t) => /records|analyses|clients|pin/i.test(t)), numTables.join(","));
  }
}

// ═══ D) REGISTRY/MATRIX INVARYANTLARI + MIGRATION STATIC CONTRACT ═════════════
{
  // Registry + matris import-time invaryantları (throw ederse fail).
  let matrixOk = true, matrixErr = "";
  try { validateActivationMatrix(); validateModuleSourceMatrix(); } catch (e) { matrixOk = false; matrixErr = String(e); }
  add("D-matrix-invariants-pass", matrixOk, matrixErr);

  // Cohort 5 kaynak: hepsi safe-non-pii + column tenant + record. AROMA 3 → enabled:true (aktive edilebilir);
  // NUMEROLOJİ 2 → enabled:false KORUNUR (çift fail-closed kapı; runtime processing OFF; wiring hazır).
  const cohortAroma = ["aromaterapi:plant-taxa", "aromaterapi:preparations", "aromaterapi:method"];
  const cohortNumeroloji = ["numeroloji:sources", "numeroloji:knowledge-entries"];
  const cohort = [...cohortAroma, ...cohortNumeroloji];
  add("D-cohort-sources-present", cohort.every((k) => YH_INDEX_SOURCES.some((s) => s.sourceKey === k)));
  add("D-cohort-all-safe-column-record", cohort.every((k) => { const c = cfg(k); return c.classification === "safe-non-pii" && c.tenant.mode === "column" && c.unit === "record"; }));
  add("D-aroma-enabled-true", cohortAroma.every((k) => cfg(k).enabled === true));
  add("D-numeroloji-enabled-false", cohortNumeroloji.every((k) => cfg(k).enabled === false));
  add("D-catalog-status-gate", cfg("aromaterapi:plant-taxa").statusColumn === "status" && JSON.stringify(cfg("aromaterapi:plant-taxa").eligibleStatuses) === JSON.stringify(["verified", "approved"]) && JSON.stringify(cfg("aromaterapi:preparations").eligibleStatuses) === JSON.stringify(["verified", "approved"]));
  add("D-method-verified-gate", cfg("aromaterapi:method").statusColumn === "status" && JSON.stringify(cfg("aromaterapi:method").eligibleStatuses) === JSON.stringify(["verified"]));
  // Method + catalog: shared/global YOK, capability GEREKMEZ (worker-v1 kapsamı).
  add("D-cohort-no-worker-capability", cohort.every((k) => !Array.isArray(cfg(k).workerCapabilities) || (cfg(k).workerCapabilities ?? []).length === 0));
  add("D-no-shared-null", cohort.every((k) => cfg(k).tenant.mode === "column" && (cfg(k).tenant as { allowSharedNull?: boolean }).allowSharedNull !== true));

  // Migration statik sözleşme.
  const MIG_NAME = "20261213000000_yh_professional_cohort_aroma_numeroloji_cdc.sql";
  const MIG = readFileSync(join(process.cwd(), "supabase/migrations", MIG_NAME), "utf8");
  const EXEC = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const has = (re: RegExp): boolean => re.test(EXEC);

  add("D-mig-security-definer", has(/SECURITY DEFINER/));
  add("D-mig-fixed-search-path", has(/SET search_path = public, pg_catalog/));
  add("D-mig-execute-revoked", has(/REVOKE ALL ON FUNCTION public\.yh_cdc_enqueue_method_series_v2\(\) FROM PUBLIC, anon, authenticated/));
  add("D-mig-activation-gate", has(/SELECT a\.is_active INTO v_active[\s\S]*FROM public\.yh_source_activation/) && has(/IF v_active IS DISTINCT FROM true THEN/));
  // Method capture SERİ-keyed: source_id = series_id; source_table = SERİ tablosu; operation daima upsert.
  add("D-mig-method-series-keyed", has(/v_source_id := NEW\.series_id/) && has(/v_source_id := OLD\.series_id/));
  add("D-mig-method-source-table-series", has(/EXECUTE FUNCTION public\.yh_cdc_enqueue_method_series_v2\('aromaterapi:method', 'aromatherapy_preparation_method_series'\)/));
  add("D-mig-method-on-revisions", has(/AFTER INSERT OR UPDATE OR DELETE ON public\.aromatherapy_preparation_method_revisions/));
  add("D-mig-method-always-upsert", has(/VALUES\s*\n?\s*\(v_source_key, v_series_table, v_source_id, v_tenant_id, 'upsert'\)/));
  add("D-mig-coalesce-on-conflict", has(/ON CONFLICT \(source_key, source_id\) DO UPDATE/));
  add("D-mig-event-version-bump", has(/event_version = nextval\('public\.yasam_hafizasi_outbox_event_version_seq'\)/));
  // 4 generic trigger + 1 method capture trigger = 5.
  add("D-mig-5-triggers", (EXEC.match(/CREATE TRIGGER/g) ?? []).length === 5, String((EXEC.match(/CREATE TRIGGER/g) ?? []).length));
  add("D-mig-4-generic-cdc", (EXEC.match(/EXECUTE FUNCTION public\.yh_cdc_enqueue\(/g) ?? []).length === 4, String((EXEC.match(/EXECUTE FUNCTION public\.yh_cdc_enqueue\(/g) ?? []).length));
  // APPLY-SAFE: hiçbir DATA DML / activation row / backfill / reconcile.
  add("D-mig-no-data-dml", !/INSERT INTO public\.(aromatherapy_|numerology_)/i.test(EXEC) && !/UPDATE public\.(aromatherapy_|numerology_)/i.test(EXEC) && !/DELETE FROM public\.(aromatherapy_|numerology_)/i.test(EXEC));
  add("D-mig-no-activation-row", !/INSERT INTO public\.yh_source_activation/i.test(EXEC) && !/yh_source_activation_set/i.test(EXEC));
  add("D-mig-no-index-dml", !/INSERT INTO public\.yasam_hafizasi_index/i.test(EXEC) && !/DELETE FROM public\.yasam_hafizasi_index/i.test(EXEC));
  add("D-mig-no-alter-table", !/ALTER TABLE/i.test(EXEC));
  add("D-mig-no-raw-pii", !/payload_snapshot|method_text|body|birth_date|\bemail\b|\bphone\b/i.test(EXEC));
  add("D-mig-single-transaction", /^BEGIN;/m.test(EXEC) && /COMMIT;/m.test(EXEC));
  add("D-mig-preconditions", has(/to_regprocedure\('public\.yh_cdc_enqueue\(\)'\)/) && has(/RAISE EXCEPTION 'Professional Cohort BLOCKER/));
  // Claims + HD bu migration'da YOK (cohort dışı).
  add("D-mig-no-claims-no-hd", !/aromatherapy_claims|hd_canonical|hd_consultation/i.test(EXEC));
}

}

function main(): void {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nYH PROFESSIONAL COHORT HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

run().then(main).catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });

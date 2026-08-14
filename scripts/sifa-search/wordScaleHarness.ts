/**
 * Şifa Rehberi — Word "filtreli" export ÖLÇEK harness'ı (PGLite = gerçek Postgres 16).
 *
 * Kanıtlar: resolver → sabit-batch fetch → deterministik sıra ile birleştirme yolu,
 * TEK dev `.in()` OLMADAN, tüm eşleşen kayıtları eksiksiz döndürür.
 *
 * Match counts: 0, 1, 50, 100, 137, 500, 1000, 5000.
 * Her biri: resolver count == fetched count · dup 0 · missing 0 · tenant leak 0 ·
 *           batch count deterministik (ceil/100) · her batch ≤ 100 · order deterministik.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { chunkIds, orderRowsByIds, expectedBatchCount, GUIDE_FETCH_BATCH } from "../../lib/sifa-rehberi/idBatch";
import { foldTr } from "../../lib/sifa-rehberi/normalizeTr";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(__dirname, "../../supabase/migrations/20261211000000_sifa_rehberi_search.sql");
const TENANT_A = "0000000a-0000-4000-8000-00000000000a";
const TENANT_B = "0000000b-0000-4000-8000-00000000000b";

const LEGACY = [
  "general_summary","medical_causes","subconscious_causes","temperament_causes","other_causes",
  "iridology_match","hand_analysis_match","cupping_leech","reflexology","diet_recommendations",
  "herbal_methods","stone_recommendations","aromatherapy","meditation","breathwork","bioenergy",
  "massage","daily_routine","sleep_routine","supportive_alternative_methods","islamic_recommendations",
];

let pass = 0, fail = 0;
const failures: string[] = [];
function check(cond: boolean, label: string) {
  if (cond) pass++; else { fail++; failures.push(label); console.log("  ✗ " + label); }
}

// Çakışmasız token'lar (substring örtüşmesi yok — sonda 'z' + harf ayracı).
const BUCKETS: { token: string; count: number }[] = [
  { token: "wqbz", count: 1 },
  { token: "wqcz", count: 50 },
  { token: "wqdz", count: 100 },
  { token: "wqez", count: 137 },
  { token: "wqfz", count: 500 },
  { token: "wqgz", count: 1000 },
  { token: "wqhz", count: 5000 },
];
const NOMATCH_TOKEN = "wqzzz"; // 0 eşleşme

let idc = 1;
function uid(): string {
  const h = (idc++).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
}

async function main() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await db.exec(`
    CREATE TABLE public.healing_guides (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text NOT NULL,
      category text, symptoms text, related_stones jsonb, related_reflexology jsonb, images jsonb,
      ${LEGACY.map((k) => `${k} text`).join(", ")},
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz);
    CREATE TABLE public.healing_guide_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      guide_id uuid NOT NULL REFERENCES public.healing_guides(id) ON DELETE CASCADE,
      section_type text NOT NULL, mode text, title text, note text, source text,
      source_kind text, expert_note text, attention text, images jsonb NOT NULL DEFAULT '[]'::jsonb,
      sort_order integer, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX healing_guide_sections_guide_id_idx ON public.healing_guide_sections (guide_id);
  `);

  // Bulk insert (transaction + çok-satırlı). tenant A: her bucket için `count` kayıt.
  await db.transaction(async (tx) => {
    for (const { token, count } of BUCKETS) {
      let batchVals: string[] = [];
      let params: unknown[] = [];
      let p = 0;
      const flush = async () => {
        if (!batchVals.length) return;
        await tx.query(`INSERT INTO public.healing_guides (id,tenant_id,name) VALUES ${batchVals.join(",")}`, params);
        batchVals = []; params = []; p = 0;
      };
      for (let i = 0; i < count; i++) {
        batchVals.push(`($${p + 1},$${p + 2},$${p + 3})`);
        params.push(uid(), TENANT_A, `${token} kayit ${i}`);
        p += 3;
        if (batchVals.length >= 500) await flush();
      }
      await flush();
    }
    // cross-tenant B: 137-token'ı B'ye de koy → A resolve'unda GÖRÜNMEMELİ.
    for (let i = 0; i < 10; i++) {
      await tx.query("INSERT INTO public.healing_guides (id,tenant_id,name) VALUES ($1,$2,$3)",
        [uid(), TENANT_B, `wqez kayit B ${i}`]);
    }
  });

  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec("ANALYZE public.healing_guides;");

  const bIds = new Set(
    ((await db.query<{ id: string }>("SELECT id FROM public.healing_guides WHERE tenant_id=$1", [TENANT_B])).rows).map((r) => r.id),
  );

  async function resolveIds(token: string): Promise<{ id: string; name: string }[]> {
    // resolver id verir; sırayı ayrıca doğrulamak için name'i de RPC sonrası çekeriz.
    const r = await db.query<{ id: string }>(
      "SELECT id FROM public.resolve_healing_guide_ids($1,$2,$3)", [TENANT_A, token, null]);
    const ids = r.rows.map((x) => x.id);
    // name'leri koru (deterministik sıra kontrolü için)
    const rows: { id: string; name: string }[] = [];
    for (const batch of chunkIds(ids)) {
      const rr = await db.query<{ id: string; name: string }>(
        "SELECT id, name FROM public.healing_guides WHERE tenant_id=$1 AND id = ANY($2)", [TENANT_A, batch]);
      const byId = new Map(rr.rows.map((x) => [x.id, x.name]));
      for (const id of batch) rows.push({ id, name: byId.get(id) ?? "" });
    }
    return rows;
  }

  // Route'un batch fetch'ini birebir taklit: chunkIds → per-batch fetch → orderRowsByIds.
  async function batchFetch(orderedIds: string[]): Promise<{ id: string; name: string }[]> {
    const collected: { id: string; name: string }[] = [];
    const batches = chunkIds(orderedIds);
    for (const batch of batches) {
      check(batch.length <= GUIDE_FETCH_BATCH, `batch size ≤ ${GUIDE_FETCH_BATCH} (got ${batch.length})`);
      const rr = await db.query<{ id: string; name: string }>(
        "SELECT id, name FROM public.healing_guides WHERE tenant_id=$1 AND id = ANY($2)", [TENANT_A, batch]);
      collected.push(...rr.rows);
    }
    check(batches.length === expectedBatchCount(orderedIds.length),
      `batch count deterministic = ceil(${orderedIds.length}/${GUIDE_FETCH_BATCH}) = ${expectedBatchCount(orderedIds.length)}`);
    return orderRowsByIds(collected, orderedIds);
  }

  // N=0
  {
    const r = await db.query<{ id: string }>(
      "SELECT id FROM public.resolve_healing_guide_ids($1,$2,$3)", [TENANT_A, NOMATCH_TOKEN, null]);
    check(r.rows.length === 0, "N=0 resolver empty");
    const assembled = await batchFetch(r.rows.map((x) => x.id));
    check(assembled.length === 0, "N=0 fetched empty (no error, no batch)");
  }

  // N ∈ {1,50,100,137,500,1000,5000}
  for (const { token, count } of BUCKETS) {
    const resolved = await resolveIds(token);
    const ids = resolved.map((r) => r.id);
    check(ids.length === count, `N=${count} resolver count == ${count} (got ${ids.length})`);
    check(new Set(ids).size === ids.length, `N=${count} resolver no duplicates`);
    check(ids.every((id) => !bIds.has(id)), `N=${count} tenant leak 0 (no B ids)`);

    // deterministik sıra: fold(name), id
    const expectedOrder = [...resolved].sort((a, b) => {
      const fa = foldTr(a.name), fb = foldTr(b.name);
      return fa < fb ? -1 : fa > fb ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }).map((r) => r.id);
    check(JSON.stringify(ids) === JSON.stringify(expectedOrder), `N=${count} resolver order deterministic (fold(name),id)`);

    const assembled = await batchFetch(ids);
    check(assembled.length === count, `N=${count} fetched count == resolver count (${assembled.length})`);
    check(new Set(assembled.map((r) => r.id)).size === assembled.length, `N=${count} fetched no duplicates`);
    // missing 0: her resolver id assembled'da
    const aset = new Set(assembled.map((r) => r.id));
    check(ids.every((id) => aset.has(id)), `N=${count} missing 0`);
    // order preserved == resolver order
    check(JSON.stringify(assembled.map((r) => r.id)) === JSON.stringify(ids), `N=${count} assembled order == resolver order`);
    // tenant leak 0 in assembled
    check(assembled.every((r) => !bIds.has(r.id)), `N=${count} assembled tenant leak 0`);
  }

  await db.close();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`WORD SCALE HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL WORD-SCALE GATES PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });

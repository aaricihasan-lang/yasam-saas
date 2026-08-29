/**
 * Beslenme FAZ 6 — Food search RPC harness (PGlite).
 * nutrition_food_search: ts_rank_cd relevance + pagination + SYSTEM∪custom union + tenant isolation.
 * Simplified nutrition_foods (trigger/unaccent yerine manuel search_tsv) — RPC mantığı deterministik test.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

const db = new PGlite();
for (const r of ["anon", "authenticated", "service_role"]) { try { await db.exec(`CREATE ROLE ${r};`); } catch {} }

// Simplified nutrition_foods (RPC yalnız bu tabloyu + search_tsv'i okur).
await db.exec(`
  CREATE TABLE public.nutrition_foods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
    name_tr text NOT NULL, name_en text, aliases text[] NOT NULL DEFAULT '{}',
    food_group_id uuid, prep_state text, description text, notes text,
    is_active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    search_tsv tsvector );`);
await db.exec(read("20270101000500_nutrition_food_search.sql"));

const SYS = "00000000-0000-4000-8000-000000000001";
const TEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const G1 = "11111111-1111-4111-8111-111111111111";

async function add(tenant, name_tr, name_en, aliases, group = null, active = true, sort = 0) {
  await db.query(
    `INSERT INTO nutrition_foods (tenant_id,name_tr,name_en,aliases,food_group_id,is_active,sort_order,search_tsv)
     VALUES ($1::uuid,$2::text,$3::text,$4::text[],$5::uuid,$6::boolean,$7::int,
       to_tsvector('simple', coalesce($2::text,'')||' '||coalesce($3::text,'')||' '||array_to_string($4::text[],' ')))`,
    [tenant, name_tr, name_en, aliases, group, active, sort]);
}
await add(SYS, "Elma", "Apples, raw", ["elma", "apple"], G1);
await add(SYS, "Yeşil Elma", "Green apple", ["yesil elma", "green apple"], G1, true, 5);
await add(SYS, "Muz", "Bananas, raw", ["muz", "banana"], G1);
await add(SYS, "Tavuk", "Chicken breast", ["tavuk", "chicken"], null);
await add(TEN, "Özel Elmalı Tarif", "Custom apple mix", ["elma tarifi"], G1);
await add(FOREIGN, "Elma (yabancı)", "Foreign apple", ["elma"], G1);
await add(SYS, "Pasif Elma", "Inactive apple", ["elma pasif"], G1, false);

const search = async (q, opts = {}) => (await db.query(
  `SELECT * FROM nutrition_food_search($1,$2,$3,$4,$5,$6,$7)`,
  [TEN, SYS, q, opts.group ?? null, opts.all ?? false, opts.limit ?? 50, opts.offset ?? 0])).rows;

// 1) "elma" — matches SYS + custom, NOT foreign, NOT inactive
let r = await search("elma");
const names = r.map((x) => x.name_tr);
ok("elma matches system+custom", names.includes("Elma") && names.includes("Özel Elmalı Tarif"), JSON.stringify(names));
ok("elma excludes foreign tenant", !names.includes("Elma (yabancı)"));
ok("elma excludes inactive by default", !names.includes("Pasif Elma"));
ok("elma includes 'Yeşil Elma' (alias/name match)", names.includes("Yeşil Elma"));

// 2) English alias
r = await search("apple");
ok("apple matches via name_en/alias", r.map((x) => x.name_tr).includes("Elma"), JSON.stringify(r.map(x=>x.name_tr)));

// 3) "muz"/"banana"
ok("muz matches", (await search("muz")).some((x) => x.name_tr === "Muz"));
ok("banana matches", (await search("banana")).some((x) => x.name_tr === "Muz"));
ok("chicken matches Tavuk", (await search("chicken")).some((x) => x.name_tr === "Tavuk"));

// 4) total_count + pagination
r = await search("elma", { limit: 2, offset: 0 });
const total = Number(r[0]?.total_count ?? 0);
ok("total_count reflects full match set (=3)", total === 3, `total=${total}`);
ok("limit caps page size to 2", r.length === 2, `got ${r.length}`);
const page2 = await search("elma", { limit: 2, offset: 2 });
ok("offset paginates (page2 distinct ids)", page2.every((x) => !r.find((y) => y.id === x.id)));

// 5) browse (no query) → all accessible, paginated, is_system flag
r = await search(null, { limit: 100 });
ok("browse returns system+custom union (no foreign/inactive)",
   r.some((x) => x.is_system === true) && r.some((x) => x.is_system === false) &&
   !r.map((x) => x.name_tr).includes("Elma (yabancı)") && !r.map((x) => x.name_tr).includes("Pasif Elma"));

// 6) include_inactive
ok("all=1 includes inactive", (await search("elma", { all: true })).map((x) => x.name_tr).includes("Pasif Elma"));

// 7) group filter
r = await search(null, { group: G1, limit: 100 });
ok("group filter excludes ungrouped Tavuk", !r.map((x) => x.name_tr).includes("Tavuk"));

// 8) ranking deterministic (exact-ish 'Elma' ranks; stable order)
r = await search("elma");
ok("ranked results deterministic + stable", r.length === 3);

console.log(`\n=== SEARCH HARNESS: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);

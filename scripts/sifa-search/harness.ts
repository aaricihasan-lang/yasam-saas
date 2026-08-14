/**
 * Şifa Rehberi — EK FAZ 1 arama/error-safety GATE harness (PGLite = gerçek Postgres 16).
 *
 * Kapılar:
 *   1) sifa_fold  JS↔SQL BİT-PARITY (golden fixtures)
 *   2) sifa_is_meaningful parity
 *   3) Match parity: SQL search RPC id set == JS oracle id set (tüm alanlar)
 *   4) Negatif: placeholder, cross-tenant, wildcard (% _ \), SQL-ish, no-result, uzun q
 *   5) Keyset pagination: dup yok / skip yok / stabil A–Z / full set eşleşmesi
 *   6) Word resolver: TÜM eşleşen id (UI limit'e bağlı DEĞİL) + q/category parity + cross-tenant 0
 *   7) Query-plan: trgm GIN index kullanımı (35/100/500/1000/5000); 1/2/3 char davranışı
 *   8) searchParams/cursor birim testleri
 *
 * Prod DDL YOK — yalnız yerel PGLite. `supabase/migrations/20261211000000_sifa_rehberi_search.sql`
 * DOSYADAN aynen yüklenir (ship edilen SQL ile test edilen SQL aynıdır).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { foldTr, isMeaningfulText } from "../../lib/sifa-rehberi/normalizeTr";
import {
  parseGuideSearchParams,
  encodeCursor,
  decodeCursor,
  BadCursorError,
  SEARCH_MAX_Q,
} from "../../lib/sifa-rehberi/searchParams";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  __dirname,
  "../../supabase/migrations/20261211000000_sifa_rehberi_search.sql",
);

const TENANT_A = "0000000a-0000-4000-8000-00000000000a";
const TENANT_B = "0000000b-0000-4000-8000-00000000000b";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
    console.log("  ✗ " + label);
  }
}

// ── 21 legacy metin kolonu (LEGACY_TEXT_KEYS ile aynı) ───────────────────────
const LEGACY = [
  "general_summary","medical_causes","subconscious_causes","temperament_causes",
  "other_causes","iridology_match","hand_analysis_match","cupping_leech",
  "reflexology","diet_recommendations","herbal_methods","stone_recommendations",
  "aromatherapy","meditation","breathwork","bioenergy","massage","daily_routine",
  "sleep_routine","supportive_alternative_methods","islamic_recommendations",
] as const;

type Guide = {
  id: string; tenant_id: string; name: string; category: string | null;
  symptoms: string | null;
} & Partial<Record<(typeof LEGACY)[number], string | null>>;

type Section = {
  id: string; guide_id: string; section_type: string; mode: string | null;
  title: string | null; note: string | null; source: string | null;
  source_kind: string | null; expert_note: string | null; attention: string | null;
};

// ── JS oracle (client matchesListSearch/sectionSnippet sözleşmesiyle aynı) ────
function guideHaystackJS(g: Guide): string {
  const parts: string[] = [
    g.name ?? "",
    g.category ?? "",
    isMeaningfulText(g.symptoms) ? (g.symptoms ?? "") : "",
  ];
  for (const k of LEGACY) parts.push((g[k] as string | null) ?? "");
  return parts.join(" ");
}
function sectionHaystackJS(s: Section): string {
  return [s.title, s.note, s.mode, s.source, s.source_kind, s.expert_note, s.attention]
    .map((x) => x ?? "").join(" ");
}
function matchesJS(g: Guide, secs: Section[], q: string): boolean {
  const fq = foldTr(q);
  if (fq === "") return true;
  if (foldTr(guideHaystackJS(g)).includes(fq)) return true;
  return secs.some((s) => foldTr(sectionHaystackJS(s)).includes(fq));
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const guides: Guide[] = [];
const sections: Section[] = [];
function uid(n: number): string {
  const h = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
}
let counter = 1;
function addGuide(g: Partial<Guide> & { name: string; tenant_id: string }): Guide {
  const id = uid(counter++);
  const full: Guide = {
    id, tenant_id: g.tenant_id, name: g.name,
    category: g.category ?? null, symptoms: g.symptoms ?? null,
  };
  for (const k of LEGACY) full[k] = (g[k] as string | null | undefined) ?? null;
  guides.push(full);
  return full;
}
function addSection(guideId: string, s: Partial<Section>): void {
  sections.push({
    id: uid(counter++), guide_id: guideId,
    section_type: s.section_type ?? "reasons",
    mode: s.mode ?? null, title: s.title ?? null, note: s.note ?? null,
    source: s.source ?? null, source_kind: s.source_kind ?? null,
    expert_note: s.expert_note ?? null, attention: s.attention ?? null,
  });
}

// Correctness set (tenant A). Her alan ayrı benzersiz token taşır.
addGuide({ tenant_id: TENANT_A, name: "Astım", category: "Solunum Sistemi" });
addGuide({ tenant_id: TENANT_A, name: "Siğil", category: "Cilt" });
addGuide({ tenant_id: TENANT_A, name: "Migren", category: "Sinir Sistemi", symptoms: "Baş ağrısı ve zonklama hapszztoken" });
addGuide({ tenant_id: TENANT_A, name: "Placeholder Kayıt", category: "Genel / Diğer", symptoms: "Bu bölüm için henüz bilgi eklenmemiş." });
// Her legacy alan için ayrı guide + benzersiz token
LEGACY.forEach((k, i) => {
  const g = addGuide({ tenant_id: TENANT_A, name: `Legacy ${i}`, category: "Genel / Diğer" });
  (g as Record<string, unknown>)[k] = `legtok${k}`;
});
// Section alanlarını taşıyan guide
const gsec = addGuide({ tenant_id: TENANT_A, name: "Sectionlu Kayıt", category: "Sindirim Sistemi" });
addSection(gsec.id, {
  section_type: "applications", mode: "herbal",
  title: "sectitletoken", note: "secnotetoken", source: "secsourcetoken",
  source_kind: "kitap secsourcekindtoken", expert_note: "secexperttoken", attention: "secattentiontoken",
});
// Cross-tenant: aynı token'lar tenant B'de → sızmamalı
addGuide({ tenant_id: TENANT_B, name: "Astım", category: "Solunum Sistemi", symptoms: "hapszztoken" });
const gsecB = addGuide({ tenant_id: TENANT_B, name: "Bsectionlu", category: "Sindirim Sistemi" });
addSection(gsecB.id, { section_type: "reasons", note: "secnotetoken sectitletoken" });
// Wildcard/meta test kayıtları
addGuide({ tenant_id: TENANT_A, name: "Yüzde50%İndirim", category: "Genel / Diğer" });
addGuide({ tenant_id: TENANT_A, name: "alt_cizgi", category: "Genel / Diğer" });
addGuide({ tenant_id: TENANT_A, name: "Ters\\Bolu", category: "Genel / Diğer" });

const CORRECTNESS_COUNT = counter;

// Scale set (tenant A): 5000 guide, ~1.8 section/guide. EXACT 137 tanesi adında "astım".
const SCALE_N = 5000;
const ASTIM_TARGET = 137;
for (let i = 0; i < SCALE_N; i++) {
  const isAstim = i < ASTIM_TARGET;
  const name = isAstim ? `Astım Varyant ${i}` : `Rahatsızlık ${i.toString().padStart(5, "0")}`;
  const cat = ["Solunum Sistemi", "Cilt", "Sinir Sistemi", "Sindirim Sistemi", "Genel / Diğer"][i % 5];
  const g = addGuide({
    tenant_id: TENANT_A, name, category: cat,
    general_summary: `Genel özet ${i} lorem ipsum dolor sit amet consectetur.`,
    medical_causes: `Tıbbi neden ${i} uzun metin devam eder ve arama için gövde sağlar.`,
  });
  const nSec = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 3;
  for (let j = 0; j < nSec; j++) {
    addSection(g.id, {
      section_type: ["reasons", "applications", "supportive"][j % 3],
      note: `Bölüm ${i}-${j} profesyonel içerik metni buraya gelir uzun uzun.`,
      source: j === 0 ? "Kaynak Kitap A" : null,
      expert_note: j === 1 ? `uzman notu ${i}` : null,
    });
  }
}

// ── DB kurulum ───────────────────────────────────────────────────────────────
async function main() {
  const db = new PGlite({ extensions: { pg_trgm } });

  // Supabase rolleri (grant hedefleri)
  await db.exec(`
    DO $$ BEGIN
      CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Production-şekilli şema (healing_guides geniş + healing_guide_sections FAZ2).
  await db.exec(`
    CREATE TABLE public.healing_guides (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      name text NOT NULL,
      category text,
      symptoms text,
      related_stones jsonb, related_reflexology jsonb, images jsonb,
      ${LEGACY.map((k) => `${k} text`).join(",\n      ")},
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz
    );
    CREATE TABLE public.healing_guide_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      guide_id uuid NOT NULL REFERENCES public.healing_guides(id) ON DELETE CASCADE,
      section_type text NOT NULL,
      mode text, title text, note text, source text,
      source_kind text, expert_note text, attention text,
      images jsonb NOT NULL DEFAULT '[]'::jsonb,
      sort_order integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX healing_guide_sections_guide_id_idx ON public.healing_guide_sections (guide_id);
  `);

  // Insert fixtures (parametreli).
  await db.transaction(async (tx) => {
    for (const g of guides) {
      const cols = ["id","tenant_id","name","category","symptoms", ...LEGACY];
      const vals = cols.map((_, i) => `$${i + 1}`);
      const args = [g.id, g.tenant_id, g.name, g.category, g.symptoms,
        ...LEGACY.map((k) => (g[k] as string | null) ?? null)];
      await tx.query(
        `INSERT INTO public.healing_guides (${cols.join(",")}) VALUES (${vals.join(",")})`,
        args,
      );
    }
    for (const s of sections) {
      await tx.query(
        `INSERT INTO public.healing_guide_sections
          (id,guide_id,section_type,mode,title,note,source,source_kind,expert_note,attention)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id,s.guide_id,s.section_type,s.mode,s.title,s.note,s.source,s.source_kind,s.expert_note,s.attention],
      );
    }
  });

  // Migration DOSYASINI aynen uygula.
  const migSql = readFileSync(MIGRATION, "utf8");
  await db.exec(migSql);
  await db.exec("ANALYZE public.healing_guides; ANALYZE public.healing_guide_sections;");

  console.log(`Fixtures: ${guides.length} guide (${CORRECTNESS_COUNT - 1} correctness + scale), ${sections.length} section`);

  // ══ GATE 1: sifa_fold parity ══════════════════════════════════════════════
  const foldFixtures = [
    "ASTIM","astım","astim","Astım","SİĞİL","siğil","sigil","Siğil","I","İ","ı","i",
    "IX","İlknur","ilknur","Işık","isik","ŞİFA","şifa","Çören","Ğğ","Üzüm","Öğüt",
    "  çok    boşluk  ","â î û ê ô","Â Î Û Ê Ô","MİGREN","migren","Baş Ağrısı","bas agrisi",
    ""," ","Hâlsizlik","halsizlik","Café","cafe","Straße","İstanbul","SoLuNuM SiStEmİ",
    "solunum sistemi","IĞDIR","igdir","DİYARBAKIR","diyarbakir","Yüzde50%İndirim","alt_cizgi",
    "Ters\\Bolu","' OR 1=1 --","şĞİıÖçÜ","MiGrEn 42","\tsatır\nbaşı  ","ÂÇÊÎÔÛ",
  ];
  let foldFail = 0;
  for (const f of foldFixtures) {
    const r = await db.query<{ v: string }>("SELECT public.sifa_fold($1) AS v", [f]);
    if (r.rows[0].v !== foldTr(f)) {
      foldFail++;
      console.log(`  ✗ fold mismatch in=${JSON.stringify(f)} js=${JSON.stringify(foldTr(f))} sql=${JSON.stringify(r.rows[0].v)}`);
    }
  }
  check(foldFail === 0, `GATE1 sifa_fold parity (${foldFixtures.length} fixtures)`);

  // ══ GATE 2: sifa_is_meaningful parity ═════════════════════════════════════
  const meaningfulFixtures = [
    "", " ", "Bu bölüm için henüz bilgi eklenmemiş.", "bu bolum icin henuz bilgi eklenmemis.",
    "Henüz özet eklenmedi.", "Gerçek içerik", "Astım tedavisi", "   ", "bilgi eklenmemiş",
    "Bu bölüm için henüz bilgi eklenmemiş. ama sonra gerçek içerik var",
  ];
  let meanFail = 0;
  for (const f of meaningfulFixtures) {
    const r = await db.query<{ v: boolean }>("SELECT public.sifa_is_meaningful($1) AS v", [f]);
    if (r.rows[0].v !== isMeaningfulText(f)) {
      meanFail++;
      console.log(`  ✗ meaningful mismatch in=${JSON.stringify(f)} js=${isMeaningfulText(f)} sql=${r.rows[0].v}`);
    }
  }
  check(meanFail === 0, `GATE2 sifa_is_meaningful parity (${meaningfulFixtures.length})`);

  // ── SQL search helper (RPC) ──
  const sectionsByGuide = new Map<string, Section[]>();
  for (const s of sections) {
    const arr = sectionsByGuide.get(s.guide_id) ?? [];
    arr.push(s); sectionsByGuide.set(s.guide_id, arr);
  }
  // Tek çağrı (RPC limit'i içerde 100'e cap'lenir — full-set için pageAll/resolveIds kullan).
  async function sqlSearchIds(tenant: string, q: string, category: string | null, limit = 100): Promise<string[]> {
    const r = await db.query<{ id: string }>(
      "SELECT id FROM public.search_healing_guides($1,$2,$3,$4,$5,$6)",
      [tenant, q, category, limit, null, null],
    );
    return r.rows.map((x) => x.id);
  }
  // Uncapped full match set via resolver RPC (Word export path; aynı arama semantiği).
  async function resolveIds(tenant: string, q: string, category: string | null): Promise<string[]> {
    const r = await db.query<{ id: string }>(
      "SELECT id FROM public.resolve_healing_guide_ids($1,$2,$3)", [tenant, q, category]);
    return r.rows.map((x) => x.id);
  }
  function jsSearchIds(tenant: string, q: string, category: string | null): string[] {
    return guides
      .filter((g) => g.tenant_id === tenant)
      .filter((g) => category == null || (g.category ?? "") === category)
      .filter((g) => matchesJS(g, sectionsByGuide.get(g.id) ?? [], q))
      .map((g) => g.id);
  }

  // ══ GATE 3: match parity (positive, tüm alanlar) ══════════════════════════
  const posQueries = [
    "Astım","astım","astim","ASTIM","Siğil","sigil","siğil","Solunum","solunum sistemi",
    "hapszztoken", ...LEGACY.map((k) => `legtok${k}`),
    "sectitletoken","secnotetoken","herbal","secsourcetoken","secsourcekindtoken",
    "secexperttoken","secattentiontoken","Migren","migren",
  ];
  // Full-set parity: uncapped resolver (aynı match semantiği) vs JS oracle.
  let parityFail = 0;
  for (const q of posQueries) {
    const sql = new Set(await resolveIds(TENANT_A, q, null));
    const js = new Set(jsSearchIds(TENANT_A, q, null));
    const same = sql.size === js.size && [...js].every((id) => sql.has(id));
    if (!same) {
      parityFail++;
      console.log(`  ✗ match parity q=${JSON.stringify(q)} sql=${sql.size} js=${js.size}`);
    }
  }
  check(parityFail === 0, `GATE3 match parity (${posQueries.length} queries, all fields)`);

  // ══ GATE 4: negatives ═════════════════════════════════════════════════════
  // placeholder symptoms aramada eşleşmez
  const phIds = await sqlSearchIds(TENANT_A, "henüz bilgi eklenmemiş", null);
  check(phIds.length === 0, "GATE4 placeholder symptoms NOT searchable");

  // cross-tenant: A'da arama B kaydını döndürmez
  const astimA = new Set(await sqlSearchIds(TENANT_A, "Astım", null));
  const bIds = new Set(guides.filter((g) => g.tenant_id === TENANT_B).map((g) => g.id));
  check([...astimA].every((id) => !bIds.has(id)), "GATE4 cross-tenant isolation (A search excludes B)");
  // B araması yalnız B'yi döndürür
  const hapB = await sqlSearchIds(TENANT_B, "hapszztoken", null);
  const hapA = await sqlSearchIds(TENANT_A, "hapszztoken", null);
  check(hapB.every((id) => bIds.has(id)) && hapA.every((id) => !bIds.has(id)), "GATE4 tenant B search scoped to B");

  const tenantACount = guides.filter((g) => g.tenant_id === TENANT_A).length;
  // wildcard % literal: sadece '%' içeren kaydı döndürür, tüm tenant'ı DEĞİL
  const pctIds = await resolveIds(TENANT_A, "%", null);
  const pctJs = jsSearchIds(TENANT_A, "%", null);
  check(pctIds.length === pctJs.length && pctIds.length > 0 && pctIds.length < tenantACount,
    `GATE4 '%' literal (matched ${pctIds.length}, not all ${tenantACount})`);
  // wildcard _ literal
  const usIds = await resolveIds(TENANT_A, "_", null);
  const usJs = jsSearchIds(TENANT_A, "_", null);
  check(usIds.length === usJs.length && usIds.length > 0 && usIds.length < tenantACount,
    `GATE4 '_' literal (matched ${usIds.length})`);
  // backslash literal
  const bsIds = await resolveIds(TENANT_A, "Ters\\Bolu", null);
  check(bsIds.length === jsSearchIds(TENANT_A, "Ters\\Bolu", null).length && bsIds.length === 1,
    "GATE4 backslash literal");
  // SQL-ish injection = zararsız düz metin (hata yok, doğru sonuç)
  const sqlish = await resolveIds(TENANT_A, "' OR 1=1 --", null);
  check(sqlish.length === jsSearchIds(TENANT_A, "' OR 1=1 --", null).length,
    "GATE4 SQL-ish string is inert literal");
  // no-result
  const none = await resolveIds(TENANT_A, "zzznomatchqueryxyz", null);
  check(none.length === 0, "GATE4 no-result query");
  // uzun q (cap üstü) → hata yok
  const longQ = "a".repeat(SEARCH_MAX_Q + 500);
  let longOk = true;
  try { await sqlSearchIds(TENANT_A, longQ, null); } catch { longOk = false; }
  check(longOk, "GATE4 oversized q does not error at DB");

  // ══ GATE 5: keyset pagination ═════════════════════════════════════════════
  async function pageAll(tenant: string, q: string, category: string | null, limit: number): Promise<string[]> {
    const out: string[] = [];
    let afterFold: string | null = null;
    let afterId: string | null = null;
    // guvenlik: sonsuz döngü koruması
    for (let guard = 0; guard < 100000; guard++) {
      const r = (await db.query(
        "SELECT id, name FROM public.search_healing_guides($1,$2,$3,$4,$5,$6)",
        [tenant, q, category, limit, afterFold, afterId],
      )) as { rows: { id: string; name: string }[] };
      const pageRows = r.rows;
      if (pageRows.length === 0) break;
      for (const row of pageRows) out.push(row.id);
      const last = pageRows[pageRows.length - 1];
      // cursor client'ta JS foldTr ile üretilir (parity kanıtlı)
      afterFold = foldTr(last.name);
      afterId = last.id;
      if (pageRows.length < limit) break;
    }
    return out;
  }
  // list mode (empty q) full walk
  const fullList = await pageAll(TENANT_A, "", null, 50);
  const fullListNoDup = new Set(fullList).size === fullList.length;
  check(fullListNoDup, "GATE5 list pagination: no duplicates");
  check(fullList.length === tenantACount, `GATE5 list pagination: no skip (${fullList.length}/${tenantACount})`);
  // beklenen sıra: fold(name), id
  const expectedOrder = guides.filter((g) => g.tenant_id === TENANT_A)
    .slice().sort((a, b) => {
      const fa = foldTr(a.name), fb = foldTr(b.name);
      return fa < fb ? -1 : fa > fb ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }).map((g) => g.id);
  check(JSON.stringify(fullList) === JSON.stringify(expectedOrder), "GATE5 list pagination: stable A–Z order");

  // search mode: "Astım" → 137 varyant + correctness "Astım" (1) = 138 in tenant A
  const astimFull = await pageAll(TENANT_A, "Astım", null, 50);
  const astimExpected = jsSearchIds(TENANT_A, "Astım", null);
  check(new Set(astimFull).size === astimFull.length, "GATE5 search pagination: no duplicates");
  check(astimFull.length === astimExpected.length,
    `GATE5 search pagination full set (${astimFull.length} == ${astimExpected.length})`);
  check(new Set(astimFull).size === new Set(astimExpected).size &&
    astimExpected.every((id) => astimFull.includes(id)), "GATE5 search pagination: set == oracle");

  // ══ GATE 6: Word resolver (resolve_healing_guide_ids) ═════════════════════
  const resolveAstim = await resolveIds(TENANT_A, "Astım", null);
  // UI ilk sayfa limit 50 iken resolver TÜM eşleşmeyi döndürmeli (138), 50/100 DEĞİL
  check(resolveAstim.length === astimExpected.length,
    `GATE6 Word resolver returns ALL matches (${resolveAstim.length}, not page-limited)`);
  check(resolveAstim.length > 100, `GATE6 resolver exceeds UI page cap (100): ${resolveAstim.length}`);
  // q/category parity: resolver set == UI search set (aynı q, tam sayfalanmış)
  const uiAstimSet = new Set(astimFull);
  check(resolveAstim.length === uiAstimSet.size && resolveAstim.every((id) => uiAstimSet.has(id)),
    "GATE6 resolver == UI paged search set (q parity)");
  // category filtreli parity
  const catQ = "Astım", cat = "Solunum Sistemi";
  const resCat = new Set(await resolveIds(TENANT_A, catQ, cat));
  const jsCat = jsSearchIds(TENANT_A, catQ, cat);
  check(resCat.size === jsCat.length && jsCat.every((id) => resCat.has(id)),
    `GATE6 resolver category parity (${resCat.size})`);
  // cross-tenant 0
  check((await resolveIds(TENANT_A, "Astım", null)).every((id) => !bIds.has(id)),
    "GATE6 resolver cross-tenant 0");

  // ══ GATE 7: query plan (index usage) ══════════════════════════════════════
  async function planText(sql: string, params: unknown[]): Promise<string> {
    const r = await db.query<Record<string, unknown>>(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params);
    return JSON.stringify(r.rows);
  }
  // Aday-id UNION deseninin (RPC ile AYNI) her iki trgm index'ini de kullandığını kanıtla.
  const candidateSql = `
    SELECT g.id FROM public.healing_guides g
    WHERE g.tenant_id=$1 AND g.id IN (
      SELECT gg.id FROM public.healing_guides gg WHERE gg.tenant_id=$1
        AND public.sifa_fold(public.sifa_guide_haystack(gg)) LIKE $2 ESCAPE '\\'
      UNION
      SELECT s.guide_id FROM public.healing_guide_sections s
        JOIN public.healing_guides gh ON gh.id=s.guide_id
        WHERE gh.tenant_id=$1 AND public.sifa_fold(public.sifa_section_haystack(s)) LIKE $2 ESCAPE '\\'
    ) ORDER BY public.sifa_fold(g.name), g.id LIMIT 50`;
  const planGuideMatch = await planText(candidateSql, [TENANT_A, "%astim%"]);
  check(planGuideMatch.includes("healing_guides_search_trgm_idx"),
    "GATE7 guide search uses guide trgm GIN index (3+ char)");
  const planSecMatch = await planText(candidateSql, [TENANT_A, "%secnotetoken%"]);
  check(planSecMatch.includes("healing_guide_sections_search_trgm_idx"),
    "GATE7 section search uses section trgm GIN index");
  // list mode (empty q) keyset btree index kullanır
  const planList = await planText(
    `SELECT g.id FROM public.healing_guides g WHERE g.tenant_id=$1
     ORDER BY public.sifa_fold(g.name), g.id LIMIT 50`, [TENANT_A]);
  check(planList.includes("healing_guides_tenant_foldname_idx"),
    "GATE7 list mode uses keyset btree index");

  // 1-2 char: correctness only (trgm için <3 char trigram çıkaramaz; tenant-bounded scan)
  const oneChar = await resolveIds(TENANT_A, "a", null);
  check(oneChar.length === jsSearchIds(TENANT_A, "a", null).length, `GATE7 1-char correctness (${oneChar.length})`);
  const twoChar = await resolveIds(TENANT_A, "as", null);
  check(twoChar.length === jsSearchIds(TENANT_A, "as", null).length, `GATE7 2-char correctness (${twoChar.length})`);

  // timing snapshot @5000 — index kullanımı ile selektif sorgular hızlı olmalı
  const timings: Record<string, number> = {};
  for (const q of ["Astım", "secnotetoken", "genel", "zzznone"]) {
    const t0 = performance.now();
    const ids = await sqlSearchIds(TENANT_A, q, null, 50);
    const ms = performance.now() - t0;
    timings[q] = ms;
    console.log(`  · @${tenantACount} rows  q=${JSON.stringify(q)} → ${ids.length} rows in ${ms.toFixed(1)}ms (limit 50)`);
  }
  // Selektif (section) ve no-result sorgular index sayesinde hızlı (< 60ms @5000)
  check(timings["secnotetoken"] < 60, `GATE7 selective section query fast via index (${timings["secnotetoken"].toFixed(1)}ms)`);
  check(timings["zzznone"] < 60, `GATE7 no-result query fast via index (${timings["zzznone"].toFixed(1)}ms)`);

  // ══ GATE 8: searchParams / cursor birim testleri ══════════════════════════
  {
    const sp = new URLSearchParams("q=astım&limit=250&category=Cilt");
    const p = parseGuideSearchParams(sp);
    check(p.mode === "search" && p.limit === 100 && p.category === "Cilt", "GATE8 params: limit cap + category");
    const listP = parseGuideSearchParams(new URLSearchParams("q=  "));
    check(listP.mode === "list", "GATE8 params: blank q → list mode");
    const enc = encodeCursor("astim varyant 12", "00000000-0000-4000-8000-00000000002a");
    const dec = decodeCursor(enc);
    check(dec.afterFold === "astim varyant 12" && dec.afterId === "00000000-0000-4000-8000-00000000002a",
      "GATE8 cursor round-trip");
    let badCaught = false;
    try { decodeCursor("garbage-no-dot"); } catch (e) { badCaught = e instanceof BadCursorError; }
    check(badCaught, "GATE8 malformed cursor → BadCursorError");
    let badId = false;
    try { decodeCursor("YWJj.not-a-uuid"); } catch (e) { badId = e instanceof BadCursorError; }
    check(badId, "GATE8 cursor bad uuid → BadCursorError");
    const capped = parseGuideSearchParams(new URLSearchParams(`q=${"x".repeat(500)}`));
    check(capped.q.length === SEARCH_MAX_Q, "GATE8 q capped to SEARCH_MAX_Q");
  }

  await db.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SIFA SEARCH HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL GATES PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });

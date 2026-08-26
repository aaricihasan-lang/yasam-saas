// ============================================================
// Beslenme Class A System Reference — STATİK DDL SÖZLEŞME HARNESS'İ
//
// Deterministik, env-siz. Migration .sql metnini okuyup FAZ 2/AŞAMA 1 canonical contract'ını
// doğrular. DB'ye BAĞLANMAZ (bu turun birincil gate'i budur). FAIL → exit 1.
//
// Çalıştır:  node scripts/beslenme-class-a/ddlHarness.mjs
//        or  npm run beslenme:class-a:harness
// ============================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIG = resolve(ROOT, "supabase", "migrations");

let pass = 0, fail = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

// ── Canonical dosya seti ─────────────────────────────────────────────────────
const FILES = {
  units:      "20261228000000_nutrition_units.sql",
  nutrients:  "20261228000100_nutrition_nutrients.sql",
  allergens:  "20261228000200_nutrition_allergens.sql",
  foodGroups: "20261228000300_nutrition_food_groups.sql",
  frameworks: "20261228000400_nutrition_traditional_frameworks.sql",
  formulas:   "20261228000500_nutrition_formulas.sql",
  seed:       "20261228000600_nutrition_class_a_seed.sql",
};
const TABLES = {
  units:      "nutrition_units",
  nutrients:  "nutrition_nutrients",
  allergens:  "nutrition_allergens",
  foodGroups: "nutrition_food_groups",
  frameworks: "nutrition_traditional_frameworks",
  formulas:   "nutrition_formulas",
};

const SRC = {};
console.log("\n[0] Dosya varlığı + okunabilirlik");
for (const [k, f] of Object.entries(FILES)) {
  const p = resolve(MIG, f);
  if (existsSync(p)) { SRC[k] = readFileSync(p, "utf8"); ok(`dosya var: ${f}`); }
  else { bad(`dosya YOK: ${f}`); SRC[k] = ""; }
}
const ALL_DDL = [SRC.units, SRC.nutrients, SRC.allergens, SRC.foodGroups, SRC.frameworks, SRC.formulas].join("\n");
const ALL = ALL_DDL + "\n" + SRC.seed;

// Negatif/absence kontrolleri için `--` yorum satırlarını çıkar (yorum metni false-positive üretmesin).
const stripSql = (s) => s.replace(/--[^\n]*/g, "");
const SRC_S = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, stripSql(v)]));
const ALL_DDL_S = stripSql(ALL_DDL);
const ALL_S = stripSql(ALL);

// ── A/B) 6 tablo + exact canonical isim ──────────────────────────────────────
console.log("\n[A/B] 6 tablo CREATE + exact canonical isim");
for (const [k, t] of Object.entries(TABLES)) {
  check(`CREATE TABLE public.${t}`, new RegExp(`CREATE TABLE public\\.${t}\\b`).test(SRC[k]), "tablo bulunamadı");
}

// ── C) Zorunlu kolonlar (tablo başına) ───────────────────────────────────────
console.log("\n[C] Zorunlu kolonlar");
const COMMON = ["id", "code", "created_at", "updated_at", "is_active", "sort_order"];
const COLS = {
  units:      [...COMMON, "symbol", "name_tr", "name_en", "unit_type", "base_unit_code", "factor_to_base"],
  nutrients:  [...COMMON, "name_tr", "name_en", "aliases", "category", "default_unit_id", "description"],
  allergens:  [...COMMON, "name_tr", "name_en", "aliases", "description", "is_major"],
  foodGroups: [...COMMON, "name_tr", "name_en", "parent_id", "description"],
  frameworks: [...COMMON, "name_tr", "name_en", "description"],
  formulas:   [...COMMON, "name_tr", "name_en", "version", "purpose", "population_scope", "required_inputs", "equation_display", "config", "source_reference", "limitations"],
};
for (const [k, cols] of Object.entries(COLS)) {
  const body = SRC[k];
  for (const c of cols) check(`${TABLES[k]}.${c}`, new RegExp(`\\b${c}\\b`).test(body), "kolon yok");
}

// ── D) tenant_id YOK (Class A tenant-siz) ────────────────────────────────────
console.log("\n[D] tenant_id ABSENT (Class A tenant-siz)");
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} tenant_id YOK`, !/\btenant_id\b/.test(SRC_S[k]), "tenant_id bulundu — Class A tenant-siz olmalı");
}

// ── E) PK ────────────────────────────────────────────────────────────────────
console.log("\n[E] PRIMARY KEY");
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} id PRIMARY KEY`, /id\s+uuid\s+PRIMARY KEY\s+DEFAULT gen_random_uuid\(\)/.test(SRC[k]), "PK yok");
}

// ── F) FK ────────────────────────────────────────────────────────────────────
console.log("\n[F] FOREIGN KEY");
check("units self-FK base_unit_code → units(code)",
  /FOREIGN KEY \(base_unit_code\)\s*\n?\s*REFERENCES public\.nutrition_units \(code\)\s*\n?\s*ON DELETE RESTRICT/.test(SRC.units));
check("nutrients default_unit_id → units(id) ON DELETE RESTRICT",
  /FOREIGN KEY \(default_unit_id\)\s*\n?\s*REFERENCES public\.nutrition_units \(id\)\s*\n?\s*ON DELETE RESTRICT/.test(SRC.nutrients));
check("food_groups self-FK parent_id → food_groups(id) ON DELETE RESTRICT",
  /FOREIGN KEY \(parent_id\)\s*\n?\s*REFERENCES public\.nutrition_food_groups \(id\)\s*\n?\s*ON DELETE RESTRICT/.test(SRC.foodGroups));

// ── G) UNIQUE code ───────────────────────────────────────────────────────────
console.log("\n[G] UNIQUE code");
for (const k of ["units", "nutrients", "allergens", "foodGroups", "frameworks"]) {
  check(`${TABLES[k]} UNIQUE (code)`, new RegExp(`UNIQUE \\(code\\)`).test(SRC[k]), "UNIQUE(code) yok");
}
check("formulas UNIQUE (code, version)", /UNIQUE \(code, version\)/.test(SRC.formulas));

// ── H/I) CHECK + lowercase code regex ────────────────────────────────────────
console.log("\n[H/I] CHECK + lowercase stable code regex");
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} code regex CHECK`,
    /code = btrim\(code\)\s*\n?\s*AND code ~ '\^\[a-z\]\[a-z0-9\]\*\(_\[a-z0-9\]\+\)\*\$'/.test(SRC[k]),
    "lowercase snake_case code CHECK yok");
}
check("units unit_type CHECK (6 değer)", /unit_type IN \('mass', 'volume', 'energy', 'count', 'household', 'other'\)/.test(SRC.units));
check("nutrients category CHECK (6 değer)", /category IN \('energy', 'macronutrient', 'vitamin', 'mineral', 'fatty_acid', 'other'\)/.test(SRC.nutrients));
check("formulas purpose CHECK (7 değer)", /purpose IN \('bmi', 'bmr', 'tdee', 'body_fat', 'ideal_weight', 'ratio', 'other'\)/.test(SRC.formulas));
check("nutrients aliases no-NULL CHECK", /array_position\(aliases, NULL\) IS NULL/.test(SRC.nutrients));
check("allergens aliases no-NULL CHECK", /array_position\(aliases, NULL\) IS NULL/.test(SRC.allergens));

// ── J) RLS ENABLED ───────────────────────────────────────────────────────────
console.log("\n[J] RLS ENABLED");
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} ENABLE ROW LEVEL SECURITY`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(SRC[k]));
}

// ── K/L/M) GRANT/REVOKE ──────────────────────────────────────────────────────
console.log("\n[K/L/M] GRANT / REVOKE matrix");
for (const [k, t] of Object.entries(TABLES)) {
  const s = SRC[k];
  check(`${t} REVOKE anon/authenticated/PUBLIC`,
    new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM anon, authenticated, PUBLIC`).test(s));
  check(`${t} REVOKE service_role (sonra dar GRANT)`,
    new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM service_role`).test(s));
  check(`${t} GRANT S/I/U/D service_role`,
    new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\\.${t} TO service_role`).test(s));
  check(`${t} GRANT ALL YOK`, !new RegExp(`GRANT ALL[^;]*ON TABLE public\\.${t}`).test(s), "GRANT ALL bulundu");
  check(`${t} authenticated'a doğrudan GRANT YOK`,
    !new RegExp(`GRANT[^;]*TO[^;]*\\bauthenticated\\b`).test(s), "authenticated'a grant bulundu");
  check(`${t} anon'a doğrudan GRANT YOK`,
    !new RegExp(`GRANT[^;]*TO[^;]*\\banon\\b`).test(s), "anon'a grant bulundu");
}

// ── N) is_active lifecycle ───────────────────────────────────────────────────
console.log("\n[N] is_active lifecycle");
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} is_active boolean NOT NULL DEFAULT true`, /is_active\s+boolean\s+NOT NULL DEFAULT true/.test(SRC[k]));
}

// ── O) updated_at trigger (set_updated_at REUSE, redefine YOK) ────────────────
console.log("\n[O] updated_at trigger — set_updated_at REUSE");
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} updated_at trigger EXECUTE public.set_updated_at()`,
    new RegExp(`BEFORE UPDATE ON public\\.${t}[\\s\\S]*?EXECUTE FUNCTION public\\.set_updated_at\\(\\)`).test(SRC[k]));
}
check("set_updated_at YENİDEN TANIMLANMIYOR (reuse-only)",
  !/CREATE (OR REPLACE )?FUNCTION public\.set_updated_at\b/.test(ALL), "set_updated_at yeniden tanımlanmış");
// identity guard trigger tüm tablolarda
for (const [k, t] of Object.entries(TABLES)) {
  check(`${t} identity guard trigger`, new RegExp(`${t}_identity_guard`).test(SRC[k]));
}

// ── P) units dönüşüm guard ───────────────────────────────────────────────────
console.log("\n[P] units dimension/conversion guard");
check("units conversion pairing CHECK",
  /\(base_unit_code IS NULL AND factor_to_base IS NULL\)\s*\n?\s*OR \(base_unit_code IS NOT NULL AND factor_to_base IS NOT NULL AND factor_to_base > 0\)/.test(SRC.units));

// ── Q) nutrients default unit FK (F ile örtüşür; ayrı doğrulama) ─────────────
console.log("\n[Q] nutrients default_unit_id nullable FK");
check("nutrients default_unit_id nullable (NOT NULL yok)", /default_unit_id\s+uuid,/.test(SRC.nutrients));

// ── R) food_groups self-FK + self-loop guard ────────────────────────────────
console.log("\n[R] food_groups self-loop guard");
check("food_groups no-self-parent CHECK", /parent_id IS NULL OR parent_id <> id/.test(SRC.foodGroups));

// ── S) formulas versiyon tekilliği (G ile örtüşür; ayrı) ─────────────────────
console.log("\n[S] formulas (code, version) uniqueness");
check("formulas version NOT NULL DEFAULT 1 + CHECK >= 1", /version\s+integer\s+NOT NULL DEFAULT 1/.test(SRC.formulas) && /version >= 1/.test(SRC.formulas));
check("formulas identity guard version dahil", /NEW\.version\s+IS DISTINCT FROM OLD\.version/.test(SRC.formulas));

// ── T) no eval / dynamic execution ───────────────────────────────────────────
console.log("\n[T] arbitrary-code-execution absence");
check("JS eval( YOK", !/\beval\s*\(/.test(ALL_S));
check("new Function( YOK", !/new\s+Function\s*\(/.test(ALL_S));
check("dinamik SQL EXECUTE-string YOK (EXECUTE 'sql' / format / (expr))",
  !/EXECUTE\s+(format|'|"|\$|\()/i.test(ALL_S), "dinamik EXECUTE bulundu");
// plpgsql fonksiyon gövdeleri: yalnız kimlik karşılaştırması + RAISE + RETURN NEW (dinamik yok, DML yok).
const plpgsqlBodies = ALL_S.match(/LANGUAGE plpgsql AS \$\$[\s\S]*?\$\$/g) || [];
check("equation_display hiçbir plpgsql gövdesinde kullanılmıyor",
  plpgsqlBodies.every((b) => !/equation_display/.test(b)));
check("plpgsql gövdeleri EXECUTE (dinamik) içermiyor",
  plpgsqlBodies.every((b) => !/\bEXECUTE\b/.test(b)));
check("plpgsql gövdeleri yalnız kimlik guard (RETURN NEW + IS DISTINCT FROM OLD.)",
  plpgsqlBodies.length === 6 && plpgsqlBodies.every((b) => /RETURN NEW/.test(b) && /IS DISTINCT FROM OLD\./.test(b)));
check("plpgsql gövdelerinde DML (INSERT INTO / UPDATE public / DELETE FROM / SELECT..FROM) YOK",
  plpgsqlBodies.every((b) => !/\bINSERT\s+INTO\b/i.test(b) && !/\bUPDATE\s+public\b/i.test(b) && !/\bDELETE\s+FROM\b/i.test(b) && !/\bSELECT\b[\s\S]*\bFROM\b/i.test(b)));

// ── U) evidence-core tablo YOK ───────────────────────────────────────────────
console.log("\n[U] evidence-core tablo YOK");
for (const w of ["nutrition_claim", "nutrition_passage", "nutrition_verification", "claim_sources", "faithful_translation", "evidence_assessment"]) {
  check(`'${w}' üretilmemiş`, !new RegExp(`\\b${w}\\b`).test(ALL_S), "evidence-core artefaktı bulundu");
}

// ── V) sources tablosu bu scope'ta YOK ───────────────────────────────────────
console.log("\n[V] sources tablosu bu scope'ta YOK");
check("nutrition_sources CREATE YOK", !/CREATE TABLE public\.nutrition_sources\b/.test(ALL_S));
check("nutrition_source_links CREATE YOK", !/CREATE TABLE public\.nutrition_source_links\b/.test(ALL_S));

// ── W) YH entegrasyonu YOK ───────────────────────────────────────────────────
console.log("\n[W] Yaşam Hafızası negative contract");
check("yh_cdc / outbox / activation referansı YOK",
  !/yh_cdc_enqueue|yasam_hafizasi_outbox|yh_source_activation|yh_outbox/.test(ALL_S), "YH entegrasyonu bulundu");
check("CREATE TRIGGER yalnız identity_guard + updated_at (CDC trigger yok)",
  (ALL_S.match(/CREATE TRIGGER/g) || []).length === 12
  && (ALL_S.match(/EXECUTE FUNCTION public\.(nutrition_\w+_identity_guard|set_updated_at)\(\)/g) || []).length === 12,
  "beklenmeyen trigger (6 identity + 6 updated_at = 12)");

// ── X) client-private kolon YOK ──────────────────────────────────────────────
console.log("\n[X] client-private kolon YOK");
check("client_id / danışan kolonu YOK", !/\bclient_id\b|\bdanisan|\bpatient_id\b/.test(ALL_DDL_S));

// ── Y) seed framework kodları ────────────────────────────────────────────────
console.log("\n[Y] seed canonical framework kodları");
for (const fw of ["mizac", "blood_type", "ayurveda", "tcm", "unani", "other"]) {
  check(`seed framework '${fw}'`, new RegExp(`\\('${fw}',`).test(SRC.seed));
}
check("seed profil kaydı YOK (yalnız framework, profil değil)",
  !/\b(vata|pitta|kapha)\b/i.test(SRC_S.seed) && !/\b(vata|pitta|kapha)\b/i.test(SRC_S.frameworks));

// ── Z) seed deterministik / duplicate-safe ───────────────────────────────────
console.log("\n[Z] seed deterministik / duplicate-safe");
check("seed 'ON CONFLICT DO UPDATE' YOK (tehlikeli overwrite yok)", !/ON CONFLICT[\s\S]*?DO UPDATE/i.test(SRC_S.seed));
check("seed 'ON CONFLICT' hiç YOK (taze tablo, düz INSERT)", !/ON CONFLICT/i.test(SRC_S.seed));
check("seed yalnız INSERT (UPDATE/DELETE/DROP/ALTER yok)",
  /INSERT INTO public\.nutrition_/.test(SRC_S.seed) && !/\b(UPDATE|DELETE|DROP|ALTER)\b/i.test(SRC_S.seed));

// ── Beklenmeyen ek nutrition tablosu var mı? (scope disiplini) ───────────────
console.log("\n[scope] beklenmeyen ek nutrition migration/tablo YOK");
const allMig = readdirSync(MIG).filter((f) => f.endsWith(".sql"));
const nutritionMig = allMig.filter((f) => /nutrition/.test(f));
check("yalnız 7 nutrition migration", nutritionMig.length === 7, `bulundu: ${nutritionMig.length} → ${nutritionMig.join(", ")}`);
const createdTables = [...ALL_DDL.matchAll(/CREATE TABLE public\.(nutrition_\w+)/g)].map((m) => m[1]);
check("yalnız 6 canonical tablo CREATE", createdTables.length === 6 && createdTables.every((t) => Object.values(TABLES).includes(t)),
  `bulundu: ${createdTables.join(", ")}`);

// ── ÖZET ─────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${failures.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Class A static DDL contract: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));

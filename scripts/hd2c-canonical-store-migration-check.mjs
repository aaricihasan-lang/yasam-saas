/**
 * HD-2C statik migration harness — Admin Canonical Store
 * ======================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Gerçek migration dosyasını okur ve gerçek
 * HD-2B TypeScript constants/sözleşmelerini (Node yerel type-stripping + resolve
 * hook) OLDUĞU GİBİ import eder — constants'ın manuel kopyası TAŞINMAZ. Seed/CHECK
 * kümeleri constants ile küme-eşitliği ve HD-2B builder çıktısıyla birebir kıyaslanır.
 *
 * Çalıştır (repo kökünden): node scripts/hd2c-canonical-store-migration-check.mjs
 */
import { register } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ── Resolve hook: extensionless relative import → `.ts` (data: URL modülü) ─────
const HOOK = `
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && extname(spec) === '') {
    try {
      const b = ctx.parentURL ? new URL(spec, ctx.parentURL) : null;
      if (b) { const p = fileURLToPath(b) + '.ts';
        if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true }; }
    } catch {}
  }
  return next(spec, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(HOOK));

const ROOT = process.cwd();
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}
const eqSet = (a, b) => {
  const A = new Set(a), B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

// ── Gerçek kaynaklar ──────────────────────────────────────────────────────────
const C = await import(pathToFileURL(`${ROOT}/lib/human-design/constants.ts`).href);
const K = await import(pathToFileURL(`${ROOT}/lib/human-design/knowledge-system/canonicalKeys.ts`).href);

const TYPE_CODES = C.HUMAN_DESIGN_TYPES.map((t) => t.code);
const TYPE_LABELS = new Map(C.HUMAN_DESIGN_TYPES.map((t) => [t.code, t.label]));
const AUTH_CODES = C.HUMAN_DESIGN_AUTHORITIES.map((a) => a.code);
const AUTH_LABELS = new Map(C.HUMAN_DESIGN_AUTHORITIES.map((a) => [a.code, a.label]));
const CHAN_CODES = C.HUMAN_DESIGN_CHANNELS.map((c) => c.code);
const CHAN_LABELS = new Map(C.HUMAN_DESIGN_CHANNELS.map((c) => [c.code, c.label]));
const CENTER_CODES = C.HUMAN_DESIGN_CENTERS.map((c) => c.code);

// ── Migration dosyasını bul (tek HD-2C dosyası) ───────────────────────────────
const MIG_DIR = `${ROOT}/supabase/migrations`;
const hdFiles = readdirSync(MIG_DIR).filter((f) => /_hd_canonical_store\.sql$/.test(f));
check(`A1. Tam bir HD-2C migration dosyası bulundu (${hdFiles.length})`, hdFiles.length === 1);
const MIG_NAME = hdFiles[0] ?? "";
const MIG = MIG_NAME ? readFileSync(`${MIG_DIR}/${MIG_NAME}`, "utf8") : "";

// Timestamp collision-free: tüm migration timestamp'leri; HD-2C en yüksek + tekil.
const allTs = readdirSync(MIG_DIR).map((f) => f.match(/^(\d{14})_/)?.[1]).filter(Boolean);
const hdTs = MIG_NAME.match(/^(\d{14})_/)?.[1] ?? "";
const tsCount = allTs.filter((t) => t === hdTs).length;
check(`A2. Migration timestamp tekil (collision yok): ${hdTs} (×${tsCount})`, tsCount === 1);
// A3: HD-2C migration KİMLİK sabitliği. "Global maksimum timestamp" varsayımı KALDIRILDI —
// daha sonra eklenen meşru migration'lar (ör. HD-2D 20260811000000_hd_source_foundation.sql)
// HD-2C'yi en-yeni olmaktan çıkarır; bu normaldir ve A3'ü FAIL ETTİRMEMELİDİR. Migration
// sıralaması/global-max HD-2C harness'in sorumluluğu değildir. A3 yalnız HD-2C'nin KENDİ
// kimliğini + collision'ını doğrular: tek dosya, sabit ad, 14-hane timestamp, sabit
// 20260808000000, aynı timestamp-prefix'ini kullanan ikinci migration yok.
const HD2C_EXPECTED_NAME = "20260808000000_hd_canonical_store.sql";
const hd2cPrefixCount = readdirSync(MIG_DIR).filter((f) => f.startsWith("20260808000000_")).length;
check(`A3. HD-2C migration kimliği sabit + tekil (daha yeni migration'lar geçerli)`,
  hdFiles.length === 1 &&
  MIG_NAME === HD2C_EXPECTED_NAME &&
  /^\d{14}$/.test(hdTs) &&
  hdTs === "20260808000000" &&
  hd2cPrefixCount === 1);

// Yorumları soy (mevcut tablo adları YALNIZ yorumda geçer → gövdeye karışmasın).
const BODY = MIG.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
// Şema-yalnız görünüm: string literal'ler (COMMENT metni / CHECK açıklamaları) boşaltılır.
// Kolon/identifier düzeyi kontroller (ör. 'line' kolonu var mı) prose'a takılmamalı.
const SCHEMA = BODY.replace(/'(?:[^']|'')*'/g, "''");

// ═════════════════════════════════════════════════════════════════════════════
// GRUP A — Migration kapsamı
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP A: Migration kapsamı ──");
const createdTables = [...BODY.matchAll(/CREATE TABLE\s+public\.(\w+)/g)].map((m) => m[1]);
const EXPECTED_TABLES = [
  "hd_canonical_entities", "hd_canonical_types", "hd_canonical_authorities",
  "hd_canonical_gates", "hd_canonical_channels",
];
check("A4. Tam beş beklenen tablo oluşturuluyor (fazla/eksik yok)",
  eqSet(createdTables, EXPECTED_TABLES) && createdTables.length === 5);
check("A5. IF NOT EXISTS yok", !/IF\s+NOT\s+EXISTS/i.test(BODY));
check("A6. ON CONFLICT yok", !/ON\s+CONFLICT/i.test(BODY));
check("A7. Destructive DOWN yok (DROP TABLE / DROP SCHEMA yok)",
  !/DROP\s+TABLE/i.test(BODY) && !/DROP\s+SCHEMA/i.test(BODY));
check("A8. DO/EXCEPTION bloğu yok (sessiz hata yutma yok)",
  !/\bDO\s+\$\$/i.test(BODY) && !/EXCEPTION\s+WHEN/i.test(BODY));
check("A9. ENUM tipi oluşturulmuyor (CREATE TYPE yok)", !/CREATE\s+TYPE/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP B — Registry şeması
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP B: Registry şeması ──");
const REG = BODY.slice(
  BODY.indexOf("CREATE TABLE public.hd_canonical_entities"),
  BODY.indexOf("CREATE TABLE public.hd_canonical_types"),
);
for (const col of ["entity_kind", "canonical_key", "name_tr", "name_original", "status", "version", "created_at", "updated_at"]) {
  check(`B.reg kolon '${col}' var`, new RegExp(`\\b${col}\\b`).test(REG));
}
check("B1. Registry'de tenant_id / user_id YOK",
  !/\btenant_id\b/.test(REG) && !/\buser_id\b/.test(REG));
check("B2. Registry'de içerik/sourceRefs/editoryal/created_by kolonu YOK",
  !/\b(content|source_refs|sourcerefs|general_description|report_text|strategy_text|faithful_translation|editorial_explanation|editorial_interpretation|is_ai_generated|human_approved_at|created_by|updated_by|archived_at|deleted_at|line|line_number)\b/i.test(REG));
check("B3. canonical_key UNIQUE", /hd_canonical_entities_canonical_key_key\s+UNIQUE\s*\(canonical_key\)/.test(REG));
check("B4. entity_kind CHECK yalnız tip/otorite/kapi/kanal",
  /entity_kind IN \('tip',\s*'otorite',\s*'kapi',\s*'kanal'\)/.test(REG));
check("B5. status CHECK yalnız draft/published",
  /status IN \('draft',\s*'published'\)/.test(REG));
check("B6. version CHECK > 0", /version > 0/.test(REG));
check("B7. name_tr boşluk kontrolü (btrim<>'')", /btrim\(name_tr\)\s*<>\s*''/.test(REG));
check("B8. composite UNIQUE(id, entity_kind, canonical_key)",
  /UNIQUE\s*\(id,\s*entity_kind,\s*canonical_key\)/.test(REG));
check("B9. updated_at trigger mevcut public.set_updated_at() kullanıyor",
  /CREATE TRIGGER trg_hd_canonical_entities_updated_at[\s\S]*?EXECUTE FUNCTION public\.set_updated_at\(\)/.test(BODY));
check("B10. Yeni set_updated_at fonksiyonu TANIMLANMIYOR",
  !/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.set_updated_at/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP C — Typed extension şeması
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP C: Typed extension şeması ──");
const EXT = {
  hd_canonical_types: { kind: "tip", key: "'tip_' \\|\\| type_code" },
  hd_canonical_authorities: { kind: "otorite", key: "'otorite_' \\|\\| authority_code" },
  hd_canonical_gates: { kind: "kapi", key: "'kapi_' \\|\\| gate_number::text" },
  hd_canonical_channels: { kind: "kanal", key: "'kanal_' \\|\\| replace\\(channel_code, '-', '_'\\)" },
};
for (const [tbl, { kind, key }] of Object.entries(EXT)) {
  const start = BODY.indexOf(`CREATE TABLE public.${tbl}`);
  const end = BODY.indexOf("CREATE TABLE public.", start + 10);
  const blk = BODY.slice(start, end === -1 ? BODY.indexOf("-- 6)", start) : end);
  check(`C.${tbl}: entity_id PRIMARY KEY`, /entity_id\s+uuid\s+PRIMARY KEY/.test(blk));
  check(`C.${tbl}: entity_kind GENERATED ALWAYS AS ('${kind}') STORED`,
    new RegExp(`entity_kind\\s+text\\s+GENERATED ALWAYS AS \\('${kind}'\\) STORED`).test(blk));
  check(`C.${tbl}: canonical_key GENERATED ALWAYS AS (${key.replace(/\\/g, "")}) STORED`,
    new RegExp(`canonical_key\\s+text\\s+GENERATED ALWAYS AS \\(${key}\\) STORED`).test(blk));
  check(`C.${tbl}: composite FK → registry ON DELETE RESTRICT`,
    /FOREIGN KEY \(entity_id, entity_kind, canonical_key\)\s*REFERENCES public\.hd_canonical_entities \(id, entity_kind, canonical_key\)\s*ON DELETE RESTRICT/.test(blk));
  check(`C.${tbl}: canonical_key UNIQUE`, /UNIQUE\s*\(canonical_key\)/.test(blk));
  check(`C.${tbl}: tenant_id YOK`, !/\btenant_id\b/.test(blk));
}

// ── Seed blok ayıklayıcılar ───────────────────────────────────────────────────
function block(afterMarker, tableInsert) {
  const s = BODY.indexOf(afterMarker);
  const e = BODY.indexOf(tableInsert, s);
  return BODY.slice(s, e);
}
// Tip seed: ('code', 'label')
const typeSeed = [...block("WITH t (type_code, name_tr) AS (", "INSERT INTO public.hd_canonical_types")
  .matchAll(/\('([a-z_]+)',\s*'((?:[^']|'')*)'\)/g)].map((m) => ({ code: m[1], label: m[2].replace(/''/g, "'") }));
// Otorite seed
const authSeed = [...block("WITH a (authority_code, name_tr) AS (", "INSERT INTO public.hd_canonical_authorities")
  .matchAll(/\('([a-z_]+)',\s*'((?:[^']|'')*)'\)/g)].map((m) => ({ code: m[1], label: m[2].replace(/''/g, "'") }));
// Kanal seed: ('code', a, b, 'label')
const chanSeed = [...block("WITH ch (channel_code, gate_a, gate_b, name_tr) AS (", "INSERT INTO public.hd_canonical_channels")
  .matchAll(/\('([\d-]+)',\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\)/g)]
  .map((m) => ({ code: m[1], a: +m[2], b: +m[3], label: m[4].replace(/''/g, "'") }));

// CHECK IN-list ayıklayıcılar
function checkInList(anchor) {
  const s = BODY.indexOf(anchor);
  const seg = BODY.slice(s, s + 700);
  const inm = seg.match(/IN \(([\s\S]*?)\)/);
  return inm ? [...inm[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}
const typeCheckSet = checkInList("type_code IN (");
const authCheckSet = checkInList("authority_code IN (");
const chanCheckSet = checkInList("channel_code IN (");
const centerGateCheckSet = checkInList("center_key IN (");
const centerAcheckSet = checkInList("center_a IN (");

// ═════════════════════════════════════════════════════════════════════════════
// GRUP D — Tip domain
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP D: Tip domain ──");
check("D1. constants Tip sayısı tam 5", TYPE_CODES.length === 5);
check("D2. CHECK kümesi constants ile birebir", eqSet(typeCheckSet, TYPE_CODES));
check("D3. Seed Tip sayısı tam 5", typeSeed.length === 5);
check("D4. Seed type_code kümesi constants ile birebir", eqSet(typeSeed.map((t) => t.code), TYPE_CODES));
check("D5. Seed name_tr = constants label", typeSeed.every((t) => TYPE_LABELS.get(t.code) === t.label));
check("D6. Seed canonical_key HD-2B builder ile birebir (registry INSERT 'tip_'||code)",
  typeSeed.every((t) => `tip_${t.code}` === K.buildHdTypeCanonicalKey(t.code)));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP E — Otorite domain
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP E: Otorite domain ──");
check("E1. constants Otorite sayısı tam 7", AUTH_CODES.length === 7);
check("E2. CHECK kümesi birebir", eqSet(authCheckSet, AUTH_CODES));
check("E3. Seed Otorite sayısı tam 7", authSeed.length === 7);
check("E4. Seed authority_code kümesi birebir", eqSet(authSeed.map((a) => a.code), AUTH_CODES));
check("E5. Seed name_tr = constants label", authSeed.every((a) => AUTH_LABELS.get(a.code) === a.label));
check("E6. Seed canonical_key builder ile birebir",
  authSeed.every((a) => `otorite_${a.code}` === K.buildHdAuthorityCanonicalKey(a.code)));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP F — Kapı domain
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP F: Kapı domain ──");
check("F1. Kapı seed generate_series(1, 64)", /generate_series\(1,\s*64\)/.test(BODY));
check("F2. gate_number CHECK 1..64", /gate_number BETWEEN 1 AND 64/.test(BODY));
check("F3. gate_number 0/65 doğrudan seed yok (generate_series ile sınırlı)",
  !/gate_number.*\b(0|65)\b/.test(block("WITH g AS (", "INSERT INTO public.hd_canonical_gates")));
check("F4. Kapı adı 'Kapı ' || N (deterministik; I Ching adı yok)",
  /'Kapı ' \|\| g\.gate_number::text/.test(BODY));
check("F5. line/çizgi kolonu veya seed'i YOK (gate bloğu, string-strip)",
  !/\bline\b/i.test(SCHEMA.slice(SCHEMA.indexOf("CREATE TABLE public.hd_canonical_gates"),
    SCHEMA.indexOf("CREATE TABLE public.hd_canonical_channels"))));
check("F6. center/opposite/circuit tahminî seed YOK (yalnız NULL bırakılmış)",
  !/INSERT INTO public\.hd_canonical_gates \(entity_id, gate_number, center_key/.test(BODY) &&
  /INSERT INTO public\.hd_canonical_gates \(entity_id, gate_number\)/.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP G — Kanal domain
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP G: Kanal domain ──");
check("G1. constants resmî Kanal sayısı tam 36", CHAN_CODES.length === 36);
check("G2. CHECK kümesi constants ile birebir (36)", eqSet(chanCheckSet, CHAN_CODES) && chanCheckSet.length === 36);
check("G3. Seed Kanal sayısı tam 36", chanSeed.length === 36);
check("G4. Seed channel_code kümesi constants ile birebir", eqSet(chanSeed.map((c) => c.code), CHAN_CODES));
check("G5. Seed gate_a/gate_b resmî channel_code ile birebir",
  chanSeed.every((c) => { const [a, b] = c.code.split("-").map(Number); return c.a === a && c.b === b; }));
check("G6. Seed name_tr = constants label", chanSeed.every((c) => CHAN_LABELS.get(c.code) === c.label));
check("G7. Seed canonical_key HD-2B builder ile birebir",
  chanSeed.every((c) => `kanal_${c.code.replace(/-/g, "_")}` === K.buildHdChannelCanonicalKeyFromCode(c.code)));
check("G8. Ters yön / gerçek olmayan / baştaki-sıfır kanal CHECK kümesinde YOK",
  !chanCheckSet.includes("57-34") && !chanCheckSet.includes("1-2") &&
  !chanCheckSet.includes("01-08") && !chanCheckSet.some((x) => /^0\d/.test(x)));
check("G9. Seed'de duplicate channel_code yok", new Set(chanSeed.map((c) => c.code)).size === chanSeed.length);

// ═════════════════════════════════════════════════════════════════════════════
// GRUP H — Registry seed toplamları
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP H: Registry seed ──");
check("H1. Beklenen registry toplamı 112 (5+7+64+36)",
  typeSeed.length + authSeed.length + 64 + chanSeed.length === 112);
check("H2. Kind dağılımı 5/7/64/36",
  typeSeed.length === 5 && authSeed.length === 7 && chanSeed.length === 36);
check("H3. Tüm seed registry INSERT'leri status='draft', version=1",
  (BODY.match(/'draft', 1 FROM/g) ?? []).length === 4);
check("H4. Kanonik anahtar toplamı 112 unique (builder ile üretilen küme)",
  new Set([
    ...typeSeed.map((t) => K.buildHdTypeCanonicalKey(t.code)),
    ...authSeed.map((a) => K.buildHdAuthorityCanonicalKey(a.code)),
    ...Array.from({ length: 64 }, (_, i) => K.buildHdGateCanonicalKey(i + 1)),
    ...chanSeed.map((c) => K.buildHdChannelCanonicalKeyFromCode(c.code)),
  ]).size === 112);

// ═════════════════════════════════════════════════════════════════════════════
// GRUP I — Registry-extension uyumu (join = canonical_key)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP I: Registry-extension uyumu ──");
check("I1. Tip extension INSERT registry canonical_key join'i ('tip_'||code)",
  /INSERT INTO public\.hd_canonical_types \(entity_id, type_code\)[\s\S]*?JOIN reg ON reg\.canonical_key = 'tip_' \|\| t\.type_code/.test(BODY));
check("I2. Otorite extension INSERT registry join'i",
  /INSERT INTO public\.hd_canonical_authorities \(entity_id, authority_code\)[\s\S]*?JOIN reg ON reg\.canonical_key = 'otorite_' \|\| a\.authority_code/.test(BODY));
check("I3. Kapı extension INSERT registry join'i",
  /INSERT INTO public\.hd_canonical_gates \(entity_id, gate_number\)[\s\S]*?JOIN reg ON reg\.canonical_key = 'kapi_' \|\| g\.gate_number::text/.test(BODY));
check("I4. Kanal extension INSERT registry join'i",
  /INSERT INTO public\.hd_canonical_channels \(entity_id, channel_code, gate_a, gate_b\)[\s\S]*?JOIN reg ON reg\.canonical_key = 'kanal_' \|\| replace\(ch\.channel_code, '-', '_'\)/.test(BODY));
check("I5. Her extension registry'ye RETURNING üzerinden bağlı (orphan/hardcoded id yok)",
  (BODY.match(/RETURNING id, canonical_key/g) ?? []).length === 4 &&
  !/INSERT INTO public\.hd_canonical_(types|authorities|gates|channels)[\s\S]{0,120}VALUES\s*\(\s*'[0-9a-f]{8}-/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP J — RLS ve grant (5 tablo)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP J: RLS ve grant ──");
for (const tbl of EXPECTED_TABLES) {
  check(`J.${tbl}: ENABLE ROW LEVEL SECURITY`,
    new RegExp(`ALTER TABLE public\\.${tbl} ENABLE ROW LEVEL SECURITY`).test(BODY));
  check(`J.${tbl}: PUBLIC/anon/authenticated REVOKE ALL`,
    new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM PUBLIC`).test(BODY) &&
    new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM anon`).test(BODY) &&
    new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM authenticated`).test(BODY));
  check(`J.${tbl}: service_role yalnız SELECT/INSERT/UPDATE`,
    new RegExp(`GRANT SELECT, INSERT, UPDATE ON TABLE public\\.${tbl} TO service_role`).test(BODY));
}
check("J-glob1. FORCE ROW LEVEL SECURITY YOK", !/FORCE ROW LEVEL SECURITY/i.test(BODY));
check("J-glob2. CREATE POLICY YOK (policy 0)", !/CREATE POLICY/i.test(BODY));
check("J-glob3. DELETE grant YOK", !/GRANT[^;]*\bDELETE\b/i.test(BODY));
check("J-glob4. GRANT ALL YOK", !/GRANT ALL/i.test(BODY));
check("J-glob5. anon/authenticated'a hiç GRANT yok (SELECT dahil)",
  !/GRANT[^;]*TO\s+anon/i.test(BODY) && !/GRANT[^;]*TO\s+authenticated/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP K — Kapsam dışı yapılar
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP K: Kapsam dışı yapılar ──");
check("K1. strategy/center/line/source/audit/translation/overlay/entitlement/package tablosu YOK",
  !/CREATE TABLE public\.(hd_)?(strategy|strateji|center|merkez|line|cizgi|source|kaynak|translation|ceviri|audit|overlay|entitlement|package|paket)/i.test(BODY));
check("K2. Gövdede tenant_id / sourceRefs JSONB YOK",
  !/\btenant_id\b/.test(BODY) && !/source_refs|sourcerefs/i.test(BODY) && !/jsonb/i.test(BODY));
check("K3. Mevcut HD tablolarına yazma YOK (gövdede human_design_* referansı yok)",
  !/human_design_/.test(BODY));
check("K4. Mevcut tablo ALTER/DROP/RENAME/TRUNCATE/INSERT/DELETE hedefi YOK",
  !/ALTER TABLE public\.human_design/i.test(BODY) &&
  !/(INSERT INTO|DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE)[^;]*human_design/i.test(BODY));
check("K5. buildCodesFromChart / uygulama dosyası değişikliği bu migration'da yok (SQL-only)",
  !/buildCodesFromChart/.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP L — Atomiklik
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP L: Atomiklik ──");
const beginCount = (MIG.match(/^BEGIN;/gm) ?? []).length;
const commitCount = (MIG.match(/^COMMIT;/gm) ?? []).length;
check("L1. Tek BEGIN; ve tek COMMIT; (all-or-nothing)", beginCount === 1 && commitCount === 1);
check("L2. BEGIN COMMIT'ten önce gelir", MIG.indexOf("BEGIN;") < MIG.indexOf("COMMIT;"));
check("L3. ROLLBACK ifadesi yok (destructive DOWN yok)", !/^ROLLBACK;/m.test(MIG));
check("L4. Fail-fast: sessiz hata yutma yok (ON CONFLICT/DO EXCEPTION/IF NOT EXISTS yok)",
  !/ON CONFLICT/i.test(BODY) && !/EXCEPTION WHEN/i.test(BODY) && !/IF NOT EXISTS/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP M — HD-2B uyumu
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP M: HD-2B uyumu ──");
check("M1. Canonical entity kind'ları birebir (tip/otorite/kapi/kanal)",
  eqSet(K.HD_CANONICAL_ENTITY_KINDS, ["tip", "otorite", "kapi", "kanal"]));
check("M2. 5 Tip / 7 Otorite / 64 Kapı / 36 Kanal",
  TYPE_CODES.length === 5 && AUTH_CODES.length === 7 && CHAN_CODES.length === 36);
check("M3. Strateji ayrı entity/tablo değil (strategy tablo/seed/kolon yok)",
  !/hd_canonical_strateg/i.test(BODY) && !/strategy_text/i.test(BODY) && !K.HD_CANONICAL_ENTITY_KINDS.includes("strateji"));
check("M4. line kapsam dışı (hiç line kolonu/tablosu yok, string-strip)",
  !/\bline_number\b/i.test(SCHEMA) && !/\bline\b/i.test(SCHEMA));
check("M5. center CHECK kümeleri dokuz HdCenterCode ile birebir",
  eqSet(centerGateCheckSet, CENTER_CODES) && eqSet(centerAcheckSet, CENTER_CODES));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP N — Statik negatif-constraint kanıtı (DB'siz)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP N: Statik negatif constraint kanıtı ──");
check("N1. type_code bilinmeyen değeri reddeden CHECK var", /type_code IN \(/.test(BODY));
check("N2. authority_code bilinmeyen değeri reddeden CHECK var", /authority_code IN \(/.test(BODY));
check("N3. gate_number 0/65 reddi (BETWEEN 1 AND 64)", /gate_number BETWEEN 1 AND 64/.test(BODY));
check("N4. version 0 reddi (version > 0)", /version > 0/.test(BODY));
check("N5. status 'archived' reddi (yalnız draft/published)", /status IN \('draft', 'published'\)/.test(BODY));
check("N6. channel_code '1-2' reddi (IN 36 resmî küme)", chanCheckSet.length === 36 && !chanCheckSet.includes("1-2"));
check("N7. channel_code '57-34' reddi (ters yön kümede yok)", !chanCheckSet.includes("57-34"));
check("N8. channel_code '01-08' reddi (baştaki sıfır kümede yok)", !chanCheckSet.includes("01-08"));
check("N9. gate_a = gate_b reddi (gate_pair CHECK)", /gate_a <> gate_b/.test(BODY));
check("N10. channel_code ↔ gate_a/gate_b uyumu CHECK",
  /channel_code = gate_a::text \|\| '-' \|\| gate_b::text/.test(BODY));
check("N11. extension kind/key ↔ registry uyumu composite FK ile (4 FK)",
  (BODY.match(/FOREIGN KEY \(entity_id, entity_kind, canonical_key\)/g) ?? []).length === 4);

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }

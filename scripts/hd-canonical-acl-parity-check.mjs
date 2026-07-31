/**
 * HD-2C Canonical ACL Parity — statik migration harness
 * =====================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Yalnız ileri yönlü parity migration'ını
 * (20260909000000_hd_canonical_service_role_acl_fix.sql) denetler.
 *
 * Amaç: production'da manuel uygulanan service_role ACL düzeltmesinin repository
 * karşılığının, beş canonical tabloda "önce REVOKE ALL PRIVILEGES FROM service_role,
 * sonra yalnız SELECT/INSERT/UPDATE" sözleşmesini birebir taşıdığını statik olarak
 * güvenceye almak. Yeni/temiz ortamda zincir tam uygulandığında effective
 * service_role yetkileri yalnız S/I/U olmalıdır.
 *
 * Çalıştır (repo kökünden): node scripts/hd-canonical-acl-parity-check.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}

const EXPECTED_NAME = "20260909000000_hd_canonical_service_role_acl_fix.sql";
const TABLES = [
  "hd_canonical_entities",
  "hd_canonical_types",
  "hd_canonical_authorities",
  "hd_canonical_gates",
  "hd_canonical_channels",
];

// ── Migration dosyasını bul ───────────────────────────────────────────────────
const MIG_DIR = `${ROOT}/supabase/migrations`;
const files = readdirSync(MIG_DIR).filter((f) => /_hd_canonical_service_role_acl_fix\.sql$/.test(f));

console.log("── GRUP A: Dosya ve transaction ──");
check(`A1. Tam bir parity migration dosyası bulundu (${files.length})`, files.length === 1);
const NAME = files[0] ?? "";
check(`A2. Beklenen dosya adı (${EXPECTED_NAME})`, NAME === EXPECTED_NAME);

const RAW = NAME ? readFileSync(`${MIG_DIR}/${NAME}`, "utf8") : "";
// Aktif SQL: blok + satır yorumlarını soy; ardından string literal'leri boşalt.
const BODY = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const SQL = BODY.replace(/'(?:[^']|'')*'/g, "''");

const beginCount = (BODY.match(/\bBEGIN\s*;/g) ?? []).length;
const commitCount = (BODY.match(/\bCOMMIT\s*;/g) ?? []).length;
check("A3. Tek BEGIN;", beginCount === 1);
check("A4. Tek COMMIT;", commitCount === 1);
check("A5. BEGIN, COMMIT'ten önce gelir",
  beginCount === 1 && commitCount === 1 && BODY.indexOf("BEGIN") < BODY.indexOf("COMMIT"));
// Transaction dışı aktif SQL yok: BEGIN öncesi ve COMMIT sonrası aktif ifade (;) olmamalı.
{
  const bi = BODY.indexOf("BEGIN");
  const ci = BODY.lastIndexOf("COMMIT");
  const before = bi >= 0 ? BODY.slice(0, bi) : BODY;
  const after = ci >= 0 ? BODY.slice(ci + "COMMIT".length).replace(/^\s*;/, "") : "";
  check("A6. Transaction dışında aktif SQL yok (BEGIN öncesi / COMMIT sonrası)",
    !/;/.test(before) && !/\b(REVOKE|GRANT|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(after));
}

// ── İfade ayrıştırma (aktif SQL) ──────────────────────────────────────────────
const statements = SQL.split(";").map((s) => s.trim()).filter(Boolean);
const revokes = statements.filter((s) => /^REVOKE\b/i.test(s));
const grants = statements.filter((s) => /^GRANT\b/i.test(s));

console.log("── GRUP B: Exact tablo kapsamı ──");
// Aktif SQL'de geçen tüm public.<tablo> adları yalnız beş canonical tablo olmalı.
const referenced = [...SQL.matchAll(/public\.(\w+)/g)].map((m) => m[1]);
const unexpected = [...new Set(referenced)].filter((t) => !TABLES.includes(t));
check("B1. Yalnız beş canonical tablo referans ediliyor (fazla tablo yok)",
  unexpected.length === 0);
check("B2. Beş canonical tablonun tamamı referans ediliyor",
  TABLES.every((t) => referenced.includes(t)));
check("B3. tenant/source/report/content tablosu referansı YOK",
  !/public\.(human_design_|hd_sources|hd_source_passages|hd_original_texts|hd_faithful|hd_canonical_content|hd_content_evidence)/i.test(SQL));

console.log("── GRUP C: Exact REVOKE sözleşmesi ──");
check(`C1. Toplam REVOKE ifadesi tam 5 (${revokes.length})`, revokes.length === 5);
for (const t of TABLES) {
  const re = new RegExp(`^REVOKE\\s+ALL\\s+PRIVILEGES\\s+ON\\s+TABLE\\s+public\\.${t}\\s+FROM\\s+service_role$`, "i");
  check(`C.${t}: REVOKE ALL PRIVILEGES ... FROM service_role`,
    revokes.some((s) => re.test(s.replace(/\s+/g, " ").trim())));
}

console.log("── GRUP D: Exact GRANT sözleşmesi ──");
check(`D1. Toplam GRANT ifadesi tam 5 (${grants.length})`, grants.length === 5);
for (const t of TABLES) {
  const re = new RegExp(`^GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE\\s+ON\\s+TABLE\\s+public\\.${t}\\s+TO\\s+service_role$`, "i");
  check(`D.${t}: GRANT SELECT, INSERT, UPDATE ... TO service_role`,
    grants.some((s) => re.test(s.replace(/\s+/g, " ").trim())));
}

console.log("── GRUP E: Tablo bazında REVOKE-before-GRANT sırası ──");
for (const t of TABLES) {
  const rIdx = SQL.search(new RegExp(`REVOKE\\s+ALL\\s+PRIVILEGES\\s+ON\\s+TABLE\\s+public\\.${t}\\s+FROM\\s+service_role`, "i"));
  const gIdx = SQL.search(new RegExp(`GRANT\\s+SELECT,\\s*INSERT,\\s*UPDATE\\s+ON\\s+TABLE\\s+public\\.${t}\\s+TO\\s+service_role`, "i"));
  check(`E.${t}: REVOKE konumu < GRANT konumu`, rIdx >= 0 && gIdx >= 0 && rIdx < gIdx);
}

console.log("── GRUP F: Yasak izinler ──");
// Yalnız GRANT ifadeleri üzerinde çalış (privilege bağlamı).
const grantsJoined = grants.join(" ; ");
check("F1. GRANT ALL YOK", !/GRANT\s+ALL\b/i.test(grantsJoined));
check("F2. GRANT'ta DELETE YOK", !/\bDELETE\b/i.test(grantsJoined));
check("F3. GRANT'ta TRUNCATE YOK", !/\bTRUNCATE\b/i.test(grantsJoined));
check("F4. GRANT'ta REFERENCES YOK", !/\bREFERENCES\b/i.test(grantsJoined));
check("F5. GRANT'ta TRIGGER YOK", !/\bTRIGGER\b/i.test(grantsJoined));
check("F6. GRANT'ta EXECUTE YOK", !/\bEXECUTE\b/i.test(grantsJoined));
check("F7. GRANT'ta USAGE YOK", !/\bUSAGE\b/i.test(grantsJoined));
check("F8. GRANT'ta CREATE YOK", !/\bCREATE\b/i.test(grantsJoined));
check("F9. GRANT'ta TEMPORARY YOK", !/\bTEMPORARY\b/i.test(grantsJoined));
// Hedef rol yalnız service_role; PUBLIC/anon/authenticated'a GRANT yok.
check("F10. GRANT hedefi yalnız service_role (PUBLIC/anon/authenticated YOK)",
  grants.every((s) => /\bTO\s+service_role$/i.test(s.replace(/\s+/g, " ").trim())) &&
  !/\bTO\s+(PUBLIC|anon|authenticated)\b/i.test(grantsJoined));
// REVOKE hedefi de yalnız service_role (anon/authenticated/PUBLIC'e dokunulmaz).
check("F11. REVOKE hedefi yalnız service_role (anon/authenticated/PUBLIC'e dokunulmuyor)",
  revokes.every((s) => /\bFROM\s+service_role$/i.test(s.replace(/\s+/g, " ").trim())));

console.log("── GRUP G: Yasak SQL (veri/DDL) ──");
// privilege UPDATE (GRANT ... UPDATE ON) ile veri UPDATE <table> SET ayrımı.
check("G1. Veri INSERT INTO YOK", !/\bINSERT\s+INTO\b/i.test(SQL));
check("G2. Veri DELETE FROM YOK", !/\bDELETE\s+FROM\b/i.test(SQL));
check("G3. Veri UPDATE <tablo> SET YOK", !/\bUPDATE\s+[\w."]+\s+SET\b/i.test(SQL));
check("G4. UPSERT / MERGE YOK", !/\bUPSERT\b/i.test(SQL) && !/\bMERGE\b/i.test(SQL));
check("G5. CREATE (TABLE/INDEX/FUNCTION/TRIGGER/POLICY/TYPE/SCHEMA) YOK",
  !/\bCREATE\s+(TABLE|INDEX|UNIQUE|OR\s+REPLACE|FUNCTION|PROCEDURE|TRIGGER|POLICY|TYPE|SCHEMA|SEQUENCE)\b/i.test(SQL));
check("G6. ALTER TABLE YOK", !/\bALTER\s+TABLE\b/i.test(SQL));
check("G7. DROP YOK", !/\bDROP\b/i.test(SQL));
check("G8. TRUNCATE (ifade) YOK", !/\bTRUNCATE\b/i.test(SQL));
check("G9. CASCADE YOK", !/\bCASCADE\b/i.test(SQL));
check("G10. DO / dynamic SQL YOK", !/\bDO\s+\$\$/i.test(SQL) && !/\bEXECUTE\s+format\b/i.test(SQL));
check("G11. FUNCTION/PROCEDURE/POLICY tanımı YOK",
  !/\bFUNCTION\b/i.test(SQL) && !/\bPROCEDURE\b/i.test(SQL) && !/\bPOLICY\b/i.test(SQL));
check("G12. RLS ENABLE/FORCE/DISABLE YOK (bu migration RLS'e dokunmaz)",
  !/ROW LEVEL SECURITY/i.test(SQL));

console.log("── GRUP H: Sözleşme bütünlüğü ──");
check("H1. Aktif ifadeler yalnız REVOKE + GRANT (başka aktif ifade yok)",
  statements.filter((s) => !/^(BEGIN|COMMIT)$/i.test(s)).every((s) => /^(REVOKE|GRANT)\b/i.test(s)));
check("H2. IF EXISTS / CREATE OR REPLACE YOK", !/IF\s+EXISTS/i.test(SQL) && !/CREATE\s+OR\s+REPLACE/i.test(SQL));
check("H3. tenant_id / PII / gerçek içerik YOK",
  !/\btenant_id\b/i.test(SQL) && !/\breport_text\b/i.test(SQL) && !/\bfaithful_translation\b/i.test(SQL));

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }

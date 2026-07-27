/**
 * HD-2D1 service_role ACL FIX — statik migration harness
 * =====================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, dependency'siz (yalnız Node built-in).
 * 20260820000000_hd_source_foundation_service_role_acl_fix.sql migration'ını
 * dinamik keşfeder (/_hd_source_foundation_service_role_acl_fix\.sql$/), SQL'i
 * yorumlardan ayırıp parse eder ve Model A ACL-fix sözleşmesini exact-set /
 * exact-count karşılaştırmalarıyla doğrular. Yorum içindeki SQL kelimeleri
 * executable statement sayılmaz. Sentetik negatif fixture'lar in-memory'dir;
 * repo/worktree'ye dosya yazılmaz. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır (repo kökünden): node scripts/hd2d1-source-foundation-service-role-acl-fix-check.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const ROOT = process.cwd();
const MIG_DIR = `${ROOT}/supabase/migrations`;
const ALLOWED_TABLES = ["hd_sources", "hd_source_passages", "hd_original_texts"];
const ALLOWED_ROLE = "service_role";
const ALLOWED_GRANT_PRIVS = ["INSERT", "SELECT", "UPDATE"]; // sorted set

const eqSet = (a, b) => {
  const A = new Set(a), B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

// ── Saf sözleşme değerlendirici (filesystem'den bağımsız; yalnız SQL string) ──
// Yorumları soyar, executable ifadeleri ayıklar, Model A ACL-fix invariant'larını
// döndürür. Hem gerçek dosya hem sentetik negatif fixture'lar bunu kullanır.
function evaluate(sql) {
  const body = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  const stmts = body.split(";").map((s) => s.trim()).filter(Boolean);

  const beginCount = stmts.filter((s) => /^BEGIN$/i.test(s)).length;
  const commitCount = stmts.filter((s) => /^COMMIT$/i.test(s)).length;

  const revokes = stmts.filter((s) => /^REVOKE\b/i.test(s));
  const grants = stmts.filter((s) => /^GRANT\b/i.test(s));
  const aclStmts = [...revokes, ...grants];

  // ACL statement'lerin hedef tablo & rolleri
  const parseTable = (s) => (s.match(/ON\s+TABLE\s+public\.(\w+)/i)?.[1]) ?? null;
  const parseRevokeRole = (s) => (s.match(/\bFROM\s+([A-Za-z0-9_]+)/i)?.[1]) ?? null;
  const parseGrantRole = (s) => (s.match(/\bTO\s+([A-Za-z0-9_]+)/i)?.[1]) ?? null;

  const revokeTables = revokes.map(parseTable);
  const grantTables = grants.map(parseTable);
  const revokeRoles = revokes.map(parseRevokeRole);
  const grantRoles = grants.map(parseGrantRole);

  // GRANT privilege listesi (GRANT ... ON arasındaki bölüm)
  const grantPrivSets = grants.map((s) => {
    const m = s.match(/^GRANT\s+([\s\S]*?)\s+ON\b/i);
    if (!m) return [];
    return m[1].split(",").map((p) => p.trim().toUpperCase());
  });
  // REVOKE privilege bölümü (REVOKE ... ON arasında) — "ALL PRIVILEGES" olmalı
  const revokePrivParts = revokes.map((s) => (s.match(/^REVOKE\s+([\s\S]*?)\s+ON\b/i)?.[1] ?? "").trim().toUpperCase());

  // Her tablo tam bir REVOKE ve tam bir GRANT almış mı
  const tableRevokeCounts = Object.fromEntries(ALLOWED_TABLES.map((t) => [t, revokeTables.filter((x) => x === t).length]));
  const tableGrantCounts = Object.fromEntries(ALLOWED_TABLES.map((t) => [t, grantTables.filter((x) => x === t).length]));

  const allAclTables = [...revokeTables, ...grantTables].filter(Boolean);
  const allAclRoles = [...revokeRoles, ...grantRoles].filter(Boolean);

  // Statement-leading DML verb'leri (GRANT privilege listesindeki INSERT/UPDATE'i saymaz)
  const dmlStmts = stmts.filter((s) => /^(INSERT|UPDATE|DELETE|SELECT|MERGE)\b/i.test(s));
  const truncateStmts = stmts.filter((s) => /^TRUNCATE\b/i.test(s));

  const c = {}; // named invariants
  c.begin_present = beginCount === 1;
  c.commit_present = commitCount === 1;
  c.acl_stmt_count_6 = aclStmts.length === 6;
  c.revoke_count_3 = revokes.length === 3;
  c.grant_count_3 = grants.length === 3;
  c.only_allowed_tables = allAclTables.length > 0 && allAclTables.every((t) => ALLOWED_TABLES.includes(t));
  c.all_three_tables_covered = eqSet(new Set(allAclTables), ALLOWED_TABLES);
  c.only_service_role = allAclRoles.length > 0 && allAclRoles.every((r) => r === ALLOWED_ROLE);
  c.each_table_one_revoke = ALLOWED_TABLES.every((t) => tableRevokeCounts[t] === 1);
  c.each_table_one_grant = ALLOWED_TABLES.every((t) => tableGrantCounts[t] === 1);
  c.revoke_all_privileges = revokes.length === 3 && revokePrivParts.every((p) => /^ALL PRIVILEGES$/.test(p));
  c.grant_exact_privs = grants.length === 3 && grantPrivSets.every((set) => eqSet(set, ALLOWED_GRANT_PRIVS));

  // Yasak desenler (executable body üzerinde)
  c.no_alter_default_priv = !/ALTER\s+DEFAULT\s+PRIVILEGES/i.test(body);
  c.no_grant_all = !/\bGRANT\s+ALL\b/i.test(body);
  c.no_grant_delete = !grantPrivSets.some((set) => set.includes("DELETE"));
  c.no_grant_truncate = !grantPrivSets.some((set) => set.includes("TRUNCATE"));
  c.no_grant_references = !grantPrivSets.some((set) => set.includes("REFERENCES"));
  c.no_grant_trigger = !grantPrivSets.some((set) => set.includes("TRIGGER"));
  c.no_grant_maintain = !grantPrivSets.some((set) => set.includes("MAINTAIN"));
  c.no_create_table = !/CREATE\s+TABLE/i.test(body);
  c.no_alter_table_struct = !/ALTER\s+TABLE\s+\S+\s+(ADD|DROP|ALTER|RENAME|OWNER|ENABLE|DISABLE|FORCE)/i.test(body);
  c.no_drop = !/\bDROP\b/i.test(body);
  c.no_cascade = !/\bCASCADE\b/i.test(body);
  c.no_dml = dmlStmts.length === 0;
  c.no_truncate = truncateStmts.length === 0 && !/TRUNCATE\s+TABLE/i.test(body);
  c.no_do_block = !/\bDO\s+\$\$/i.test(body) && !/\bDO\s+\$[A-Za-z]/i.test(body);
  c.no_execute = !/\bEXECUTE\b/i.test(body);
  c.no_security_definer = !/SECURITY\s+DEFINER/i.test(body);
  c.no_create_function = !/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(body);
  c.no_create_trigger = !/CREATE\s+TRIGGER/i.test(body);
  c.no_create_index = !/CREATE\s+(UNIQUE\s+)?INDEX/i.test(body);
  c.no_rls_policy = !/ROW\s+LEVEL\s+SECURITY/i.test(body) && !/CREATE\s+POLICY/i.test(body) && !/ALTER\s+POLICY/i.test(body);
  c.no_owner_change = !/OWNER\s+TO/i.test(body);
  c.no_schema_wide_acl = !/ON\s+ALL\s+TABLES\s+IN\s+SCHEMA/i.test(body) && !/ON\s+SCHEMA\b/i.test(body);
  // Her ACL statement açıkça "ON TABLE public.<t>" içermeli (wildcard/kolon-ACL değil)
  c.acl_all_on_table = aclStmts.length > 0 && aclStmts.every((s) => /ON\s+TABLE\s+public\.\w+/i.test(s));

  const valid = Object.values(c).every(Boolean);
  return { checks: c, valid, aclStmts, revokes, grants, allAclTables, allAclRoles };
}

// ═════════════════════════════════════════════════════════════════════════════
// HARNESS
// ═════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}

// ── Migration dosyasını dinamik bul ──────────────────────────────────────────
const all = readdirSync(MIG_DIR);
const aclFiles = all.filter((f) => /_hd_source_foundation_service_role_acl_fix\.sql$/.test(f));

console.log("── GRUP A: Dosya, timestamp, kapsam ──");
check(`A1. Tam bir ACL-fix migration dosyası bulundu (${aclFiles.length})`, aclFiles.length === 1);
const MIG_NAME = aclFiles[0] ?? "";
const MIG = MIG_NAME ? readFileSync(`${MIG_DIR}/${MIG_NAME}`, "utf8") : "";
check("A2. Dosya boş değil", MIG.length > 0);

const ts = MIG_NAME.match(/^(\d{14})_/)?.[1] ?? "";
check(`A3. Timestamp 14 haneli biçim geçerli: ${ts}`, /^\d{14}$/.test(ts));
const sameTs = all.map((f) => f.match(/^(\d{14})_/)?.[1]).filter(Boolean).filter((t) => t === ts);
check(`A4. Timestamp migrations dizininde benzersiz (${sameTs.length})`, sameTs.length === 1);
const EXPECTED_NAME = "20260820000000_hd_source_foundation_service_role_acl_fix.sql";
check(`A5. Dosya adı beklenen ile birebir: ${MIG_NAME}`, MIG_NAME === EXPECTED_NAME);

// ── Gerçek migration'ı değerlendir ──
const R = evaluate(MIG);

console.log("── GRUP B: Model A ACL-fix sözleşmesi (pozitif) ──");
check("B1. Açık BEGIN mevcut (tam 1)", R.checks.begin_present);
check("B2. Açık COMMIT mevcut (tam 1)", R.checks.commit_present);
check(`B3. Executable ACL statement sayısı tam 6 (${R.aclStmts.length})`, R.checks.acl_stmt_count_6);
check(`B4. REVOKE statement sayısı tam 3 (${R.revokes.length})`, R.checks.revoke_count_3);
check(`B5. GRANT statement sayısı tam 3 (${R.grants.length})`, R.checks.grant_count_3);
check("B6. Yalnız üç izinli tablo hedefleniyor", R.checks.only_allowed_tables);
check("B7. Üç tablonun tamamı kapsanıyor", R.checks.all_three_tables_covered);
check("B8. Yalnız service_role hedef rolü", R.checks.only_service_role);
check("B9. Her tablo tam bir kez REVOKE ediliyor", R.checks.each_table_one_revoke);
check("B10. Her tablo tam bir kez GRANT ediliyor", R.checks.each_table_one_grant);
check("B11. Her REVOKE = ALL PRIVILEGES", R.checks.revoke_all_privileges);
check("B12. Her GRANT = tam {SELECT, INSERT, UPDATE}", R.checks.grant_exact_privs);
check("B13. Her ACL statement 'ON TABLE public.<t>' (wildcard/kolon-ACL değil)", R.checks.acl_all_on_table);

console.log("── GRUP C: Yasak desenler (negatif; body üzerinde) ──");
check("C1. ALTER DEFAULT PRIVILEGES yok", R.checks.no_alter_default_priv);
check("C2. GRANT ALL yok", R.checks.no_grant_all);
check("C3. GRANT DELETE yok", R.checks.no_grant_delete);
check("C4. GRANT TRUNCATE yok", R.checks.no_grant_truncate);
check("C5. GRANT REFERENCES yok", R.checks.no_grant_references);
check("C6. GRANT TRIGGER yok", R.checks.no_grant_trigger);
check("C7. GRANT MAINTAIN yok", R.checks.no_grant_maintain);
check("C8. CREATE TABLE yok", R.checks.no_create_table);
check("C9. Yapısal ALTER TABLE yok", R.checks.no_alter_table_struct);
check("C10. DROP yok", R.checks.no_drop);
check("C11. CASCADE yok", R.checks.no_cascade);
check("C12. DML (INSERT/UPDATE/DELETE/SELECT statement) yok", R.checks.no_dml);
check("C13. TRUNCATE yok", R.checks.no_truncate);
check("C14. DO/dynamic block yok", R.checks.no_do_block);
check("C15. EXECUTE yok", R.checks.no_execute);
check("C16. SECURITY DEFINER yok", R.checks.no_security_definer);
check("C17. CREATE FUNCTION yok", R.checks.no_create_function);
check("C18. CREATE TRIGGER yok", R.checks.no_create_trigger);
check("C19. CREATE INDEX yok", R.checks.no_create_index);
check("C20. RLS/policy değişikliği yok", R.checks.no_rls_policy);
check("C21. OWNER değişikliği yok", R.checks.no_owner_change);
check("C22. Schema-wide/wildcard ACL yok", R.checks.no_schema_wide_acl);

console.log("── GRUP D: Genel sözleşme geçerliliği ──");
check("D1. Gerçek migration TÜM invariant'ları geçiyor (evaluate.valid)", R.valid === true);

// ── GRUP N: Sentetik negatif fixture'lar (in-memory; dosya yazılmaz) ──
console.log("── GRUP N: Sentetik negatif senaryolar (beklenen FAIL) ──");
const BASE = MIG;
function expectInvalid(desc, mutated) {
  check(desc, evaluate(mutated).valid === false);
}
// N1. service_role'a DELETE grant
expectInvalid("N1. service_role'a DELETE grant → geçersiz",
  BASE.replace("GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;",
               "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_sources TO service_role;"));
// N2. ALTER DEFAULT PRIVILEGES
expectInvalid("N2. ALTER DEFAULT PRIVILEGES eklenirse → geçersiz",
  BASE.replace("COMMIT;", "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO service_role;\nCOMMIT;"));
// N3. dördüncü tablo
expectInvalid("N3. dördüncü tablo eklenirse → geçersiz",
  BASE.replace("COMMIT;", "REVOKE ALL PRIVILEGES ON TABLE public.hd_rogue FROM service_role;\nGRANT SELECT, INSERT, UPDATE ON TABLE public.hd_rogue TO service_role;\nCOMMIT;"));
// N4. başka rol
expectInvalid("N4. başka rol (authenticated) eklenirse → geçersiz",
  BASE.replace("GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;",
               "GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO authenticated;"));
// N5. bir tablonun REVOKE'u eksik
expectInvalid("N5. hd_source_passages REVOKE eksikse → geçersiz",
  BASE.replace("REVOKE ALL PRIVILEGES ON TABLE public.hd_source_passages FROM service_role;\n", ""));
// N6. bir tablonun GRANT'ı eksik
expectInvalid("N6. hd_original_texts GRANT eksikse → geçersiz",
  BASE.replace("GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_original_texts TO service_role;\n", ""));
// N7. aynı tablo iki kez GRANT
expectInvalid("N7. hd_sources iki kez GRANT alırsa → geçersiz",
  BASE.replace("GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;",
               "GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;\nGRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;"));
// N8. GRANT ALL
expectInvalid("N8. GRANT ALL kullanılırsa → geçersiz",
  BASE.replace("GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_sources TO service_role;",
               "GRANT ALL ON TABLE public.hd_sources TO service_role;"));
// N9. BEGIN eksik
expectInvalid("N9. BEGIN eksikse → geçersiz", BASE.replace(/^BEGIN;/m, ""));
// N9b. COMMIT eksik
expectInvalid("N9b. COMMIT eksikse → geçersiz", BASE.replace(/^COMMIT;/m, ""));
// N10. ACL statement sayısı 6'dan farklı (fazladan REVOKE)
expectInvalid("N10. ACL statement sayısı 6'dan farklıysa → geçersiz",
  BASE.replace("COMMIT;", "REVOKE ALL PRIVILEGES ON TABLE public.hd_sources FROM service_role;\nCOMMIT;"));
// N11. CASCADE / DROP
expectInvalid("N11. CASCADE eklenirse → geçersiz",
  BASE.replace("REVOKE ALL PRIVILEGES ON TABLE public.hd_sources FROM service_role;",
               "REVOKE ALL PRIVILEGES ON TABLE public.hd_sources FROM service_role CASCADE;"));
// N12. DML eklenirse
expectInvalid("N12. DML (DELETE) eklenirse → geçersiz",
  BASE.replace("COMMIT;", "DELETE FROM public.hd_sources;\nCOMMIT;"));

// ── SONUÇ ──
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }

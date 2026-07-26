/**
 * Merkezî Migration Timestamp Guard — cross-module duplicate-version denetimi
 * ==========================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, dependency'siz (yalnız Node built-in).
 * YALNIZ dosya adları (basename) üzerinden çalışır; migration SQL içeriğini
 * OKUMAZ. Amaç: yeni cross-module timestamp collision'larını (version çakışması)
 * commit/PR öncesinde yakalamak; mevcut dört tarihî legacy duplicate grubunu ise
 * statik, kapalı bir allowlist ile ÜST-SINIR/subset semantiğiyle kabul etmek.
 *
 * KAPSAM DIŞI: semantic duplicate (aynı suffix farklı timestamp), takvim
 * geçerliliği, global-maksimum zorunluluğu. Guard HİÇBİR koşulda migration'ın
 * global-max olmasını istemez; daha yeni tekil timestamp'ler meşrudur.
 *
 * Çalıştır: node scripts/migration-timestamp-guard-check.mjs
 *   → sentetik in-memory testler + gerçek repo taraması. Herhangi bir FAIL → exit 1.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Migration filename sözleşmesi ────────────────────────────────────────────
const MIGRATION_RE = /^([0-9]{14})_([a-z0-9_]+)\.sql$/;

// ── Hata sınıfları ───────────────────────────────────────────────────────────
const KIND = {
  MALFORMED: "malformed_migration_filename",
  UNAPPROVED_DUPLICATE: "unapproved_duplicate_timestamp",
  UNAPPROVED_MEMBER: "unapproved_member_in_legacy_timestamp",
  ALLOWLIST_CONTRACT: "internal_allowlist_contract_error",
};

// ── Statik legacy allowlist (ÜST SINIR — dinamik üretilmez) ──────────────────
// timestamp → izin verilen tam basename kümesi (maksimum üyelik tavanı).
const LEGACY_ALLOWLIST = {
  "20260625160000": [
    "20260625160000_client_combinations.sql",
    "20260625160000_harden_users_column_grants.sql",
  ],
  "20260705120000": [
    "20260705120000_aromatherapy_oils_reference_lock.sql",
    "20260705120000_reflexology_notes_atlas.sql",
  ],
  "20260724000000": [
    "20260724000000_aromatherapy_source_passages.sql",
    "20260724000000_yh_search_candidates_rpc.sql",
  ],
  "20260803000000": [
    "20260803000000_aromatherapy_claim_passages.sql",
    "20260803000000_numerology_content_sections_and_sources.sql",
  ],
};

// ── Allowlist'in kendi sözleşmesi (self-contract) ────────────────────────────
function validateAllowlist(allowlist) {
  const errors = [];
  for (const [ts, files] of Object.entries(allowlist)) {
    if (!/^[0-9]{14}$/.test(ts)) {
      errors.push({ kind: KIND.ALLOWLIST_CONTRACT, timestamp: ts, message: `allowlist timestamp 14 rakam değil: ${ts}` });
    }
    if (!Array.isArray(files) || files.length < 2) {
      errors.push({ kind: KIND.ALLOWLIST_CONTRACT, timestamp: ts, message: `legacy grup en az iki dosya içermeli: ${ts}` });
      continue;
    }
    const seen = new Set();
    for (const name of files) {
      const m = MIGRATION_RE.exec(name);
      if (!m) {
        errors.push({ kind: KIND.ALLOWLIST_CONTRACT, timestamp: ts, message: `allowlist basename regex'e uymuyor: ${name}` });
        continue;
      }
      if (m[1] !== ts) {
        errors.push({ kind: KIND.ALLOWLIST_CONTRACT, timestamp: ts, message: `basename timestamp anahtarla uyuşmuyor: ${name}` });
      }
      if (seen.has(name)) {
        errors.push({ kind: KIND.ALLOWLIST_CONTRACT, timestamp: ts, message: `allowlist grubunda tekrar eden basename: ${name}` });
      }
      seen.add(name);
    }
  }
  return errors;
}

// ── Saf analiz fonksiyonu (filesystem'den bağımsız; yalnız basename dizisi) ──
function analyzeMigrations(basenames, allowlist) {
  const errors = [];
  const sorted = [...basenames].sort();

  // 1) Filename biçimi + timestamp gruplaması.
  const byTs = new Map();
  for (const name of sorted) {
    const m = MIGRATION_RE.exec(name);
    if (!m) {
      errors.push({ kind: KIND.MALFORMED, files: [name], message: `geçersiz migration dosya adı: ${name}` });
      continue;
    }
    const ts = m[1];
    if (!byTs.has(ts)) byTs.set(ts, []);
    byTs.get(ts).push(name);
  }

  // 2) Duplicate timestamp denetimi (deterministik timestamp sırasıyla).
  for (const ts of [...byTs.keys()].sort()) {
    const members = byTs.get(ts).slice().sort();
    if (members.length < 2) continue; // tekil timestamp → duplicate değil → PASS

    const allowed = allowlist[ts];
    if (!allowed) {
      errors.push({
        kind: KIND.UNAPPROVED_DUPLICATE,
        timestamp: ts,
        files: members,
        message: `allowlist dışı duplicate timestamp: ${ts} (${members.join(", ")})`,
      });
      continue;
    }
    const allowedSet = new Set(allowed);
    const unauthorized = members.filter((name) => !allowedSet.has(name));
    if (unauthorized.length > 0) {
      errors.push({
        kind: KIND.UNAPPROVED_MEMBER,
        timestamp: ts,
        files: members,
        allowed: [...allowed].sort(),
        unauthorized: unauthorized.sort(),
        message: `legacy timestamp ${ts} altında yetkisiz üye: ${unauthorized.join(", ")}`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Gerçek repo taraması (basename'ler; içerik okunmaz) ──────────────────────
function scanRealMigrationBasenames() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const migDir = join(scriptDir, "..", "supabase", "migrations");
  return readdirSync(migDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".sql"))
    .map((d) => d.name);
}

export { analyzeMigrations, validateAllowlist, scanRealMigrationBasenames, LEGACY_ALLOWLIST, MIGRATION_RE, KIND };

// ═════════════════════════════════════════════════════════════════════════════
// Harness: sentetik in-memory testler + gerçek repo taraması
// (yalnız doğrudan `node scripts/...` ile çalıştırılınca; import edilince değil)
// ═════════════════════════════════════════════════════════════════════════════
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runHarness();
}

function runHarness() {
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}
function expectPass(desc, basenames) {
  check(desc, analyzeMigrations(basenames, LEGACY_ALLOWLIST).ok === true);
}
function expectFail(desc, basenames, kind) {
  const r = analyzeMigrations(basenames, LEGACY_ALLOWLIST);
  check(desc, r.ok === false && r.errors.some((e) => e.kind === kind));
}

const AL = LEGACY_ALLOWLIST;
const G1 = AL["20260625160000"];

console.log("── GRUP S: Allowlist self-contract ──");
check("S1. allowlist self-contract 0 hata", validateAllowlist(LEGACY_ALLOWLIST).length === 0);

console.log("── GRUP P: Pozitif senaryolar ──");
expectPass("P1. tekil farklı timestamp'ler", ["20260101000000_a.sql", "20260102000000_b.sql"]);
expectPass("P2. daha YENİ tekil timestamp (global-max şartı YOK)", ["20260812000000_x.sql", "20260901000000_new_feature.sql"]);
expectPass("P4. allowlist grubunun tam izinli çifti", [...G1]);
expectPass("P5. allowlist timestamp'inde yalnız bir izinli dosya (subset)", [G1[0]]);
expectPass("P6. legacy üye ileride kaldırılmış (yalnız 1 kalan)", [G1[1]]);

console.log("── GRUP N: Negatif senaryolar (hata sınıfı doğrulamalı) ──");
expectFail("N3. allowlist dışı iki dosyalı duplicate", ["20260901000000_a.sql", "20260901000000_b.sql"], KIND.UNAPPROVED_DUPLICATE);
expectFail("N6. allowlist çiftine yetkisiz üçüncü dosya", [...G1, "20260625160000_rogue_extra.sql"], KIND.UNAPPROVED_MEMBER);
expectFail("N7. legacy timestamp: bir izinli + bir yetkisiz (replacement)", [G1[0], "20260625160000_rogue_replacement.sql"], KIND.UNAPPROVED_MEMBER);
expectFail("N8. regex'e uymayan .sql filename", ["not_a_migration.sql"], KIND.MALFORMED);
expectFail("N9. 13 haneli timestamp", ["2026010100000_a.sql"], KIND.MALFORMED);
expectFail("N10. büyük harf içeren filename", ["20260101000000_Bad.sql"], KIND.MALFORMED);
expectFail("N11. allowlist dışı üçlü duplicate grup", ["20260901000000_a.sql", "20260901000000_b.sql", "20260901000000_c.sql"], KIND.UNAPPROVED_DUPLICATE);

console.log("── GRUP D: Determinizm ──");
{
  const base = ["20260901000000_a.sql", "20260101000000_z.sql", G1[1], G1[0], "20260102000000_m.sql"];
  const shuffled = [base[3], base[0], base[4], base[1], base[2]];
  const r1 = JSON.stringify(analyzeMigrations(base, LEGACY_ALLOWLIST).errors);
  const r2 = JSON.stringify(analyzeMigrations(shuffled, LEGACY_ALLOWLIST).errors);
  check("D12. girdi sırası değişse de aynı deterministik sonuç", r1 === r2);
}

console.log("── GRUP R: Gerçek repo taraması ──");
{
  const real = scanRealMigrationBasenames();
  const r = analyzeMigrations(real, LEGACY_ALLOWLIST);
  check(`R13. gerçek repo taraması PASS (${real.length} .sql)`, r.ok === true);
  if (!r.ok) for (const e of r.errors) console.log(`        ↳ ${e.kind}: ${e.message}`);
}

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
}

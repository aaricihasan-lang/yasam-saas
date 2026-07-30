// ============================================================
// Aromaterapi C3D-A-FIX — Tombstone index adı forward-fix sözleşme harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz, SQL çalıştırmaz. Yalnız ALTER INDEX
// RENAME TO içeren forward-fix migration'ını ve orijinal migration'ın
// değişmediğini + kapsam sınırlarını doğrular. FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function read(rel) { const p = resolve(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }

// Bağlayıcı sabitler
const PG_LIMIT = 63;
const OLD_REQUESTED = "aromatherapy_content_delete_tombstones_tenant_entity_occurred_idx"; // 65
const PROD_ACTUAL   = "aromatherapy_content_delete_tombstones_tenant_entity_occurred_i";   // 63
const NEW_NAME      = "aromatherapy_content_tombstones_tenant_entity_occurred_idx";        // 58
const ORIG_MIG = "supabase/migrations/20260830000000_aromatherapy_content_audit_foundation.sql";
const ORIG_SHA256 = "30e9a7229c2dbc1d96ea6d13ee88ae95eef61b50d9cf1b610a45df241ae17978";
const ORIG_BLOB = "1201b97b4e74defee0807cca03e35b12001566f3";
// Orijinal migration'ın DEĞİŞMEDİĞİNİ satır-sonu-bağımsız doğrula: git blob OID +
// blob içeriğinin (LF) SHA-256'sı. Working-tree kopyası Windows'ta CRLF olabilir.
function gitBlobOid(rel) {
  try { return execSync(`git rev-parse HEAD:${rel}`, { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return ""; }
}
function gitBlobSha256(rel) {
  try {
    const buf = execSync(`git show HEAD:${rel}`, { cwd: ROOT, encoding: "buffer" });
    return createHash("sha256").update(buf).digest("hex");
  } catch { return ""; }
}

// Forward-fix migration dosyasını bul (tek).
const MIG_DIR = "supabase/migrations";
const fixFiles = existsSync(resolve(ROOT, MIG_DIR))
  ? readdirSync(resolve(ROOT, MIG_DIR)).filter((f) => /tombstone_index_name_fix\.sql$/.test(f))
  : [];
const FIX_REL = fixFiles.length ? `${MIG_DIR}/${fixFiles[0]}` : "";
const FIX = FIX_REL ? read(FIX_REL) : "";
// Yorumları çıkarılmış SQL (yalnız gerçek DDL denetimi için).
const FIX_SQL = FIX.replace(/^\s*--[^\n]*$/gm, "");

// ============================================================
console.log("\n[FIX-1] Kaynak migration kanıtı");
// ============================================================
const ORIG = read(ORIG_MIG);
check("S01 orijinal C3D-A migration mevcut", ORIG !== "");
check("S02 orijinal migration blob OID değişmedi (satır-sonu bağımsız)",
  gitBlobOid(ORIG_MIG) === ORIG_BLOB, gitBlobOid(ORIG_MIG));
check("S02b orijinal migration blob SHA-256 değişmedi",
  gitBlobSha256(ORIG_MIG) === ORIG_SHA256, gitBlobSha256(ORIG_MIG));
check("S03 orijinal migration requested index adını içerir", ORIG.includes(OLD_REQUESTED));
check("S04 requested ad uzunluğu 65", OLD_REQUESTED.length === 65, String(OLD_REQUESTED.length));
check("S05 PostgreSQL limit varsayımı 63", PG_LIMIT === 63);
check("S06 requested adın ilk 63 karakteri = production actual",
  OLD_REQUESTED.slice(0, PG_LIMIT) === PROD_ACTUAL, OLD_REQUESTED.slice(0, PG_LIMIT));
check("S07 production actual ad uzunluğu 63", PROD_ACTUAL.length === 63, String(PROD_ACTUAL.length));

// ============================================================
console.log("\n[FIX-2] Forward-fix migration");
// ============================================================
check("F00 tek forward-fix migration", fixFiles.length === 1, `bulunan: ${fixFiles.length}`);
check("F01 BEGIN + COMMIT var", /^BEGIN;/m.test(FIX) && /^COMMIT;/m.test(FIX));
check("F02 exact tek ALTER INDEX", (FIX_SQL.match(/ALTER INDEX/g) || []).length === 1);
check("F03 source index schema-qualified + exact",
  new RegExp(`ALTER INDEX\\s+public\\.${PROD_ACTUAL.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`).test(FIX_SQL));
check("F04 RENAME TO target exact",
  new RegExp(`RENAME TO\\s+${NEW_NAME.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*;`).test(FIX_SQL));
check("F05 target ad uzunluğu 58", NEW_NAME.length === 58, String(NEW_NAME.length));
check("F06 target ad <= 63", NEW_NAME.length <= PG_LIMIT);
check("F07 source != target", PROD_ACTUAL !== NEW_NAME);
check("F08 DROP INDEX yok", !/DROP\s+INDEX/i.test(FIX_SQL));
check("F09 CREATE INDEX yok", !/CREATE\s+(UNIQUE\s+)?INDEX/i.test(FIX_SQL));
check("F10 REINDEX yok", !/REINDEX/i.test(FIX_SQL));
check("F11 ALTER TABLE yok", !/ALTER\s+TABLE/i.test(FIX_SQL));
check("F12 veri DML yok (INSERT/UPDATE/DELETE)", !/\b(INSERT|UPDATE|DELETE)\b/i.test(FIX_SQL));
check("F13 privilege/RLS değişikliği yok", !/\b(GRANT|REVOKE|ROW LEVEL SECURITY|POLICY)\b/i.test(FIX_SQL));
check("F14 DO/CALL yok", !/^\s*(DO|CALL)\b/im.test(FIX_SQL));
check("F15 IF EXISTS / IF NOT EXISTS yok", !/IF\s+(NOT\s+)?EXISTS/i.test(FIX_SQL));
check("F16 CREATE OR REPLACE yok", !/CREATE\s+OR\s+REPLACE/i.test(FIX_SQL));
check("F17 migration ledger dokunuşu yok", !/schema_migrations/i.test(FIX_SQL));
check("F18 başka CREATE/DROP nesnesi yok",
  !/\b(CREATE|DROP)\s+(TABLE|FUNCTION|TRIGGER|SCHEMA|VIEW|SEQUENCE|TYPE|EXTENSION)\b/i.test(FIX_SQL));

// ============================================================
console.log("\n[FIX-3] Semantik koruma");
// ============================================================
check("C01 yalnız metadata rename (definition/kolon/validity dokunulmaz)",
  /ALTER INDEX/.test(FIX_SQL) && !/DROP|CREATE|REINDEX|USING|WHERE|ON\s+public/i.test(FIX_SQL));
check("C02 migration source adı = production gözlemlenen ad", FIX.includes(PROD_ACTUAL));
check("C03 hedef ad kararlı sözleşme (58, <=63, açık)", NEW_NAME.length === 58 && NEW_NAME.endsWith("_idx"));
check("C04 orijinal migration bu fazda değiştirilmedi (git)",
  (() => {
    try {
      const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
      return !out.split("\n").some((l) => l.includes("20260830000000_aromatherapy_content_audit_foundation.sql"));
    } catch { return false; }
  })());

// ============================================================
console.log("\n[FIX-4] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  changed = out.split("\n").map((l) => l.slice(3).trim()).filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l))
    .map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) { bad("SC00 git status alınamadı", String(e)); }

const migChanges = changed.filter((f) => f.startsWith("supabase/migrations/"));
const scriptChanges = changed.filter((f) => f.startsWith("scripts/"));
const appLib = changed.filter((f) => f.startsWith("app/") || f.startsWith("lib/"));
const pkg = changed.filter((f) => /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(f));
const oldMig = changed.filter((f) => f.includes("20260830000000_aromatherapy_content_audit_foundation.sql"));
const allowed = (f) =>
  /^supabase\/migrations\/[0-9]+_aromatherapy_tombstone_index_name_fix\.sql$/.test(f) ||
  f === "scripts/aromaterapi-c3d-a-index-name-fix-harness.mjs";
const outside = changed.filter((f) => !allowed(f));

check("SC01 tek forward-fix migration değişikliği", migChanges.length === 1, migChanges.join(","));
check("SC02 tek harness değişikliği", scriptChanges.length === 1 && scriptChanges[0].includes("index-name-fix"), scriptChanges.join(","));
check("SC03 exact 2 dosya", changed.length === 2, `${changed.length}: ${changed.join(",")}`);
check("SC04 app/lib kod değişikliği = 0", appLib.length === 0, appLib.join(","));
check("SC05 package/lockfile = 0", pkg.length === 0, pkg.join(","));
check("SC06 orijinal 20260830000000 migration değişmedi", oldMig.length === 0, oldMig.join(","));
check("SC07 Aromaterapi dışı / kapsam dışı dosya = 0", outside.length === 0, outside.join(","));

// ============================================================
console.log(`\n──────────── C3D-A-FIX HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("Başarısızlar:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
console.log("Tüm C3D-A-FIX sözleşme kontrolleri geçti.\n");

// ============================================================
// Aromaterapi FAZ 1 migration idempotency — ARO-004 fotosensitivite backfill.
//   npx tsx --tsconfig scripts/tsconfig.aromaterapi-tests.json \
//     scripts/aromaterapi-photo-migration.test.ts
//
// PURE / DB-free: 20270111000000_*.sql backfill yükleminin JS modeli.
//   SQL: SET photosensitivity_status='yes'
//        WHERE is_photosensitive = true AND photosensitivity_status <> 'yes'
//   ADD COLUMN ... NOT NULL DEFAULT 'unknown'  (mevcut satırlar → 'unknown')
// Idempotency + kasıtlı 'no' korunumu + patolojik {true,'no'} flip'i modellenir.
// Gerçek PG apply → NOT RUN (rapor). Ayrıca migration metni statik doğrulanır.
// FAIL → process.exit(1).
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(n: string, c: boolean, d?: string) {
  if (c) {
    pass++;
    console.log(`  PASS  ${n}`);
  } else {
    fail++;
    failures.push(n);
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
  }
}

type Status = "yes" | "no" | "unknown";
type Row = { is_photosensitive: boolean; photosensitivity_status?: Status };

// ADD COLUMN ... NOT NULL DEFAULT 'unknown' → statusu olmayan mevcut satır 'unknown'.
function applyColumnDefault(row: Row): Row {
  return { ...row, photosensitivity_status: row.photosensitivity_status ?? "unknown" };
}

// SQL backfill yükleminin BİREBİR modeli.
function applyBackfill(row: Row): Row {
  const r = { ...row };
  if (r.is_photosensitive === true && r.photosensitivity_status !== "yes") {
    r.photosensitivity_status = "yes";
  }
  return r;
}

console.log("Aromaterapi — fotosensitivite migration idempotency\n");

// ── First apply: boolean-only tablo (kolon henüz yok) ──
console.log("[first apply] ADD COLUMN default + backfill");
const fresh: Row[] = [{ is_photosensitive: true }, { is_photosensitive: false }];
const firstPass = fresh.map(applyColumnDefault).map(applyBackfill);
check("true → 'yes'", firstPass[0].photosensitivity_status === "yes");
check("false → 'unknown' (bilinçli 'no' DEĞİL)", firstPass[1].photosensitivity_status === "unknown");

// ── Re-apply idempotent: birinci geçiş sonucuna tekrar backfill ──
console.log("\n[re-apply] idempotent — deliberate 'no' + 'yes' + 'unknown' korunur");
const postState: Row[] = [
  { is_photosensitive: true, photosensitivity_status: "yes" },
  { is_photosensitive: false, photosensitivity_status: "no" }, // uzmanın bilinçli 'no'
  { is_photosensitive: false, photosensitivity_status: "unknown" },
];
const reapplied = postState.map(applyBackfill);
check("re-apply keeps 'yes' (predicate false: zaten 'yes')", reapplied[0].photosensitivity_status === "yes");
check("re-apply keeps deliberate 'no' (predicate false: is_photosensitive=false)", reapplied[1].photosensitivity_status === "no");
check("re-apply keeps 'unknown'", reapplied[2].photosensitivity_status === "unknown");
check("re-apply is a no-op (deep equal)", JSON.stringify(reapplied) === JSON.stringify(postState));

// double re-apply still stable
const reapplied2 = reapplied.map(applyBackfill);
check("double re-apply still stable", JSON.stringify(reapplied2) === JSON.stringify(postState));

// ── Pathological {true,'no'}: predicate TRUE → flips to 'yes' ──
console.log("\n[pathological] {is_photosensitive:true, status:'no'} → flips to 'yes'");
const patho: Row = { is_photosensitive: true, photosensitivity_status: "no" };
const pathoOut = applyBackfill(patho);
check(
  "predicate matches (true AND 'no' <> 'yes') → 'yes' (models SQL faithfully)",
  pathoOut.photosensitivity_status === "yes",
);
// NOTE: This row violates the app invariant is_photosensitive === (status === 'yes').
// Normal write paths never produce {true,'no'} (sanitizeItems/derivePhotosensitivity keep
// the two in sync), so the flip is benign — and arguably corrective. Documented, not a bug.
check(
  "invariant note: normal rows satisfy is_photosensitive === (status==='yes')",
  firstPass.every((r) => r.is_photosensitive === (r.photosensitivity_status === "yes")) &&
    reapplied.slice(0, 1).every((r) => r.is_photosensitive === (r.photosensitivity_status === "yes")),
);

// ── Static: migration text ──
console.log("\n[static] migration SQL text");
const MIG = readFileSync(
  resolve(ROOT, "supabase/migrations/20270111000000_aromatherapy_oils_photosensitivity_status.sql"),
  "utf8",
);
check("contains guard `photosensitivity_status <> 'yes'`", /photosensitivity_status\s*<>\s*'yes'/.test(MIG));
check("backfill sets true → 'yes'", /SET\s+photosensitivity_status\s*=\s*'yes'[\s\S]*?is_photosensitive\s*=\s*true/i.test(MIG));
check("NO blanket false → 'no' backfill", !/SET\s+photosensitivity_status\s*=\s*'no'/i.test(MIG));
check("column DEFAULT 'unknown'", /DEFAULT\s+'unknown'/.test(MIG));
check("CHECK constraint limits to (yes,no,unknown)", /CHECK\s*\(\s*photosensitivity_status\s+IN\s*\(\s*'yes'\s*,\s*'no'\s*,\s*'unknown'\s*\)/i.test(MIG));

console.log(`\n──────────── ARO PHOTO-MIGRATION TEST: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");

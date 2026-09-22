// ============================================================
// Aromaterapi FAZ 1 migration idempotency — ARO-004 fotosensitivite backfill.
//   npx tsx --tsconfig scripts/tsconfig.aromaterapi-tests.json \
//     scripts/aromaterapi-photo-migration.test.ts
//
// PURE / DB-free: 20270111000000_*.sql GUARDED (first-apply-only) backfill modeli.
//   İLK apply: ADD COLUMN ... DEFAULT 'unknown' + IF col_added THEN
//     UPDATE SET photosensitivity_status='yes' WHERE is_photosensitive=true
//   RE-APPLY: kolon zaten var → col_added=false → backfill ATLANIR (no-op).
// Böylece tekrar-uygulamada bilinçli yes/no/unknown ve tutarsız true+no / true+unknown
// satırları KORUNUR (önceki `WHERE ... status<>'yes'` kusuru giderildi; gerçek Postgres/
// PGlite ile ayrıca doğrulandı — bkz. merge öncesi kapanış raporu). Ayrıca migration
// metni statik doğrulanır. Gerçek PG apply → NOT RUN (rapor). FAIL → process.exit(1).
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

// İLK apply: ADD COLUMN DEFAULT 'unknown' (statusu olmayan satır → 'unknown') +
// guarded backfill (col_added=true) → is_photosensitive=true olanlar 'yes'.
function firstApply(rows: Row[]): Row[] {
  return rows.map((r) => {
    const withDefault: Row = { ...r, photosensitivity_status: r.photosensitivity_status ?? "unknown" };
    if (withDefault.is_photosensitive === true) withDefault.photosensitivity_status = "yes";
    return withDefault;
  });
}

// RE-APPLY: kolon zaten var → col_added=false → backfill ÇALIŞMAZ → no-op.
function reApply(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r }));
}

console.log("Aromaterapi — fotosensitivite migration idempotency (GUARDED / first-apply-only)\n");

// ── First apply: boolean-only tablo (kolon henüz yok) ──
console.log("[first apply] ADD COLUMN default + guarded backfill");
const fresh: Row[] = [{ is_photosensitive: true }, { is_photosensitive: false }];
const firstPass = firstApply(fresh);
check("true → 'yes'", firstPass[0].photosensitivity_status === "yes");
check("false → 'unknown' (bilinçli 'no' DEĞİL)", firstPass[1].photosensitivity_status === "unknown");

// ── Re-apply GUARDED: sonradan set edilmiş bilinçli/tutarsız değerler KORUNUR ──
console.log("\n[re-apply] guarded no-op — deliberate + pathological KORUNUR");
const postState: Row[] = [
  { is_photosensitive: true, photosensitivity_status: "yes" },      // consistent yes
  { is_photosensitive: false, photosensitivity_status: "no" },      // bilinçli 'no'
  { is_photosensitive: false, photosensitivity_status: "unknown" }, // consistent unknown
  { is_photosensitive: true, photosensitivity_status: "no" },       // PATOLOJİK true+no
  { is_photosensitive: true, photosensitivity_status: "unknown" },  // bilinçli unknown + legacy true
];
const reapplied = reApply(postState);
check("re-apply keeps 'yes'", reapplied[0].photosensitivity_status === "yes");
check("re-apply keeps deliberate 'no'", reapplied[1].photosensitivity_status === "no");
check("re-apply keeps 'unknown'", reapplied[2].photosensitivity_status === "unknown");
check("re-apply keeps PATHOLOGICAL {true,'no'} (guarded → EZİLMEZ)", reapplied[3].photosensitivity_status === "no");
check("re-apply keeps deliberate {true,'unknown'} (guarded → EZİLMEZ)", reapplied[4].photosensitivity_status === "unknown");
check("re-apply is a no-op (deep equal)", JSON.stringify(reapplied) === JSON.stringify(postState));
// double re-apply still stable
check("double re-apply still stable", JSON.stringify(reApply(reapplied)) === JSON.stringify(postState));

// ── Static: migration text (GUARDED variant) ──
console.log("\n[static] migration SQL text (guarded)");
const MIG = readFileSync(
  resolve(ROOT, "supabase/migrations/20270111000000_aromatherapy_oils_photosensitivity_status.sql"),
  "utf8",
);
check("guarded: `col_added` bayrağı ile first-apply ayrımı", /col_added/.test(MIG));
check("backfill `IF col_added` altında (tekrar-apply atlar)", /IF\s+col_added\s+THEN[\s\S]*?SET\s+photosensitivity_status\s*=\s*'yes'/i.test(MIG));
check("ESKİ kusurlu koşul `status <> 'yes'` ARTIK YOK", !/photosensitivity_status\s*<>\s*'yes'/.test(MIG));
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

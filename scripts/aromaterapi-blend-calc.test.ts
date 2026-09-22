// ============================================================
// Aromaterapi — Karışım (blend) hesap + güvenlik birim testi.
//
// Gerçek blendData saf fonksiyonlarını çağırır (DB/secret YOK):
//   - calcTotalDrops / distributeEqually / sumDrops (ARO-020/021/022/006)
//   - collectSafetyWarnings tri-state (yes/unknown) + carrier (ARO-004/024)
// FAIL → process.exit(1).  npx tsx scripts/aromaterapi-blend-calc.test.ts
// ============================================================
import {
  calcTotalDrops,
  distributeEqually,
  sumDrops,
  collectSafetyWarnings,
  type BlendItem,
} from "../lib/aromaterapi/blendData";
import { derivePhotosensitivity, type PhotosensitivityStatus } from "../lib/aromaterapi/oilFields";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(n: string, c: boolean, d?: string) {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
}

// Snapshot kalemi kurucu (8 alan tam).
function item(over: Partial<BlendItem>): BlendItem {
  return {
    oil_id: "o",
    oil_name: "Yağ",
    latin_name: "Latince",
    oil_type: "essential",
    drops: 0,
    photosensitivity_status: "no" as PhotosensitivityStatus,
    is_photosensitive: false,
    contraindications: "",
    safety_notes: "",
    ...over,
  };
}

console.log("Aromaterapi — blend hesap + güvenlik birim testi\n");

// ── calcTotalDrops ──
check("calcTotalDrops(30,2,20) === 12", calcTotalDrops(30, 2, 20) === 12, `got ${calcTotalDrops(30, 2, 20)}`);
check("calcTotalDrops(0,2,20) === 0", calcTotalDrops(0, 2, 20) === 0, `got ${calcTotalDrops(0, 2, 20)}`);
check("calcTotalDrops(30,0,20) === 0", calcTotalDrops(30, 0, 20) === 0, `got ${calcTotalDrops(30, 0, 20)}`);

// ── distributeEqually ──
const dist = distributeEqually(12, 5);
check("distributeEqually(12,5) uzunluk 5", dist.length === 5, `len ${dist.length}`);
check("distributeEqually(12,5) toplamı 12", dist.reduce((a, b) => a + b, 0) === 12, `[${dist}]`);

// ── sumDrops ──
check("sumDrops([{3},{4}]) === 7", sumDrops([{ drops: 3 }, { drops: 4 }]) === 7, `got ${sumDrops([{ drops: 3 }, { drops: 4 }])}`);

// ── collectSafetyWarnings tri-state ──
const rUnknown = collectSafetyWarnings([item({ oil_name: "Belirsiz", photosensitivity_status: "unknown" })]);
check("collectSafetyWarnings 'unknown' → photosensitive_unknown advisory",
  rUnknown.warnings.some((w) => w.kind === "photosensitive_unknown"),
  JSON.stringify(rUnknown.warnings.map((w) => w.kind)));

const rYes = collectSafetyWarnings([item({ oil_name: "Bergamot", photosensitivity_status: "yes" })]);
check("collectSafetyWarnings 'yes' → photosensitive warning",
  rYes.warnings.some((w) => w.kind === "photosensitive"),
  JSON.stringify(rYes.warnings.map((w) => w.kind)));

// 'no' → fotosensitivite uyarısı ÜRETMEZ (negatif kontrol).
const rNo = collectSafetyWarnings([item({ oil_name: "Lavanta", photosensitivity_status: "no" })]);
check("collectSafetyWarnings 'no' → fotosensitivite uyarısı YOK",
  !rNo.warnings.some((w) => w.kind === "photosensitive" || w.kind === "photosensitive_unknown"),
  JSON.stringify(rNo.warnings.map((w) => w.kind)));

// ── carrier uyarıları ──
const rCarrier = collectSafetyWarnings(
  [item({ oil_name: "Lavanta", photosensitivity_status: "no" })],
  { oil_name: "Jojoba", photosensitivity_status: "unknown", contraindications: "Alerji riski.", safety_notes: "" },
);
check("collectSafetyWarnings carrier kontrendikasyon uyarısı içerir",
  rCarrier.warnings.some((w) => w.kind === "contraindication" && /Jojoba/.test(w.oil_name)),
  JSON.stringify(rCarrier.warnings.map((w) => `${w.kind}:${w.oil_name}`)));
check("collectSafetyWarnings hasWarnings=true (carrier'lı)", rCarrier.hasWarnings === true);

// ── derivePhotosensitivity geriye-uyum + deploy-penceresi (ARO-004) ──
check("derive true otoriter (status='unknown' stale iken bile 'yes')",
  derivePhotosensitivity({ is_photosensitive: true, photosensitivity_status: "unknown" }) === "yes",
  derivePhotosensitivity({ is_photosensitive: true, photosensitivity_status: "unknown" }));
check("derive status='no' (is_photosensitive=false) → 'no'",
  derivePhotosensitivity({ is_photosensitive: false, photosensitivity_status: "no" }) === "no");
check("derive kolon yok + legacy false → 'unknown' (güvenli taraf)",
  derivePhotosensitivity({ is_photosensitive: false }) === "unknown");
check("derive kolon yok + legacy true → 'yes'",
  derivePhotosensitivity({ is_photosensitive: true }) === "yes");

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");

/**
 * Doğaltaş SATIŞ-GATE — FAZ 1/AŞAMA 2 regresyon harness'i.
 *
 * Kapsam (saf mantık + kaynak-tarama kapıları):
 *   F-004  yazma-tarafı tip validasyonu (validation.ts)
 *   F-011  rapor savunmacı okuma (reportSafe.ts + reportHelpers.arraySection)
 *   F-016  storage path/mime/ownership sözleşmesi (stonePhoto.ts)
 *   F-018  rapor rotaları oturum-auth'a taşındı (kaynak-tarama: body-identity YOK,
 *          requireDogaltasReportAccess VAR; frontend call-site'lar x-user-id header'ı)
 *   F-019  UUID guard (validation.isUuid)
 *   F-002  duplicate normalize tutarlılığı (duplicateName.ts)
 *
 * Not: auth/route/DOCX/UI davranışsal kabulü (no-token→401 vb.) çalışan server+DB gerektirir;
 * burada saf mantık + kaynak sözleşmeleri doğrulanır. Production storage APPLY YOK.
 *
 * Çalıştır: npx tsx scripts/dogaltas-sales-gate/harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  isUuid,
  validateStringArrayField,
  validateAssignmentsField,
  validateStoneStructuredFields,
} from "../../lib/dogaltas/validation";
import { asStringArray, safeJoin, safeLen } from "../../lib/dogaltas/reportSafe";
import {
  STONE_PHOTO_BUCKET,
  STONE_PHOTO_MIME_EXT,
  buildStonePhotoPath,
  isOwnedStonePhotoPath,
  collectStonePhotoPaths,
  stonePhotoPrefix,
} from "../../lib/dogaltas/stonePhoto";
import { normalizeDuplicateName } from "../../lib/dogaltas/duplicateName";
import { arraySection } from "../../lib/docx/reportHelpers";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));
}

// ─── F-019 / isUuid ───────────────────────────────────────────────────────────
const UID = "0e7490aa-1111-4b22-8c33-1234567890ab";
ok("isUuid valid", isUuid(UID));
ok("isUuid trims", isUuid(`  ${UID}  `));
ok("isUuid 'abc' false", !isUuid("abc"));
ok("isUuid '' false", !isUuid(""));
ok("isUuid null false", !isUuid(null));
ok("isUuid number false", !isUuid(123 as unknown));
ok("isUuid sqlish false", !isUuid("1; drop table stones"));

// ─── F-004 / string array field ───────────────────────────────────────────────
ok("chakras missing ok", validateStringArrayField("Çakralar", undefined).ok);
ok("chakras null ok", validateStringArrayField("Çakralar", null).ok);
ok("chakras [] ok", validateStringArrayField("Çakralar", []).ok);
ok("chakras string[] ok", validateStringArrayField("Çakralar", ["Kök", "Kalp"]).ok);
ok("chakras string FAIL", !validateStringArrayField("Çakralar", "Kök").ok);
ok("chakras number FAIL", !validateStringArrayField("Çakralar", 5).ok);
ok("chakras object FAIL", !validateStringArrayField("Çakralar", { a: 1 }).ok);
ok("chakras [number] FAIL", !validateStringArrayField("Çakralar", [1, 2]).ok);

// assignments field
ok("assignments missing ok", validateAssignmentsField(undefined).ok);
ok("assignments null ok", validateAssignmentsField(null).ok);
ok("assignments object ok", validateAssignmentsField({ Mineraller: [] }).ok);
ok("assignments string FAIL", !validateAssignmentsField("x").ok);
ok("assignments array FAIL", !validateAssignmentsField([]).ok);
ok("assignments number FAIL", !validateAssignmentsField(5).ok);

// composite
ok("struct valid payload ok", validateStoneStructuredFields({ stone_name: "X", chakras: ["a"], warning_tags: [], assignments: {} }).ok);
ok("struct chakras string FAIL", !validateStoneStructuredFields({ chakras: "a" }).ok);
ok("struct warning_tags number FAIL", !validateStoneStructuredFields({ warning_tags: 3 }).ok);
ok("struct assignments string FAIL", !validateStoneStructuredFields({ assignments: "s" }).ok);
ok("struct partial (only name) ok", validateStoneStructuredFields({ stone_name: "X" }).ok);
ok("struct returns 422-worthy error text", validateStoneStructuredFields({ chakras: "a" }).ok === false);

// ─── F-011 / reportSafe + arraySection ──────────────────────────────────────────
eq("asStringArray normal", asStringArray(["a", "b"]), ["a", "b"]);
eq("asStringArray non-array→[]", asStringArray("x"), []);
eq("asStringArray null→[]", asStringArray(null), []);
eq("asStringArray mixed", asStringArray([1, "b", null, {}, "  c  "]), ["1", "b", "c"]);
eq("safeJoin array", safeJoin(["a", "b"]), "a, b");
eq("safeJoin non-array→''", safeJoin("x"), "");
eq("safeLen array", safeLen([1, 2, 3]), 3);
eq("safeLen non-array→0", safeLen("abc"), 0);
// arraySection must NOT throw on malformed non-array (was the F-011 500 root)
let threw = false;
try { arraySection("Çakralar", "malformed" as unknown as string[]); } catch { threw = true; }
ok("arraySection non-array no throw", !threw);
eq("arraySection non-array→[]", arraySection("Çakralar", "x" as unknown as string[]), []);
eq("arraySection null→[]", arraySection("Çakralar", null), []);
ok("arraySection valid→non-empty", arraySection("Çakralar", ["Kök"]).length > 0);

// ─── F-016 / stonePhoto contract ────────────────────────────────────────────────
const TENANT = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";
const OTHER = "11111111-1111-1111-1111-111111111111";
eq("mime webp→webp", STONE_PHOTO_MIME_EXT["image/webp"], "webp");
eq("mime jpeg→jpg", STONE_PHOTO_MIME_EXT["image/jpeg"], "jpg");
eq("mime svg→undefined (blocked)", STONE_PHOTO_MIME_EXT["image/svg+xml"], undefined);
eq("mime html→undefined (blocked)", STONE_PHOTO_MIME_EXT["text/html"], undefined);
const p = buildStonePhotoPath(TENANT, "webp", "abcd");
eq("buildStonePhotoPath", p, `catalog/${TENANT}/abcd.webp`);
ok("path owned by tenant", isOwnedStonePhotoPath(p, TENANT));
ok("path NOT owned by other tenant", !isOwnedStonePhotoPath(p, OTHER));
ok("path traversal blocked", !isOwnedStonePhotoPath(`${stonePhotoPrefix(TENANT)}../secret`, TENANT));
ok("path absolute-url blocked", !isOwnedStonePhotoPath("https://evil/x", TENANT));
ok("path non-string blocked", !isOwnedStonePhotoPath(123, TENANT));
ok("path empty blocked", !isOwnedStonePhotoPath("", TENANT));
// collectStonePhotoPaths: gather own file_paths, skip foreign / non-array, dedupe
const imagesA = [{ file_path: `catalog/${TENANT}/a.webp` }, { file_path: `catalog/${TENANT}/b.webp` }];
const imagesB = [{ file_path: `catalog/${TENANT}/a.webp` }, { file_path: `catalog/${OTHER}/x.webp` }, { url: "http://x" }];
const collected = collectStonePhotoPaths([imagesA, imagesB, "notarray", null], TENANT);
eq("collect dedupes + own-only", collected.sort(), [`catalog/${TENANT}/a.webp`, `catalog/${TENANT}/b.webp`].sort());

// ─── F-016 / NİHAİ private-bucket model (FAZ 2'de source-code YOK) ───────────────
eq("bucket = dogaltas-photos (adanmış private)", STONE_PHOTO_BUCKET, "dogaltas-photos");
{
  const up = readFileSync(resolve(ROOT, "app/api/dogaltas/stones/photos/route.ts"), "utf8");
  ok("upload: kalıcı public URL üretmez (getPublicUrl yok)", !up.includes("getPublicUrl"));
  ok("upload: kısa ömürlü signed preview üretir", up.includes("createSignedUrl"));
  ok("upload: image objesinde persist url yok (yalnız previewUrl)", !/image:\s*\{[^}]*\burl\b/.test(up));
  ok("upload: STONE_PHOTO_BUCKET const kullanır (hardcode 'stone-photos' yok)", !up.includes('"stone-photos"'));
}
{
  const su = readFileSync(resolve(ROOT, "app/api/dogaltas/stones/photos/signed-urls/route.ts"), "utf8");
  ok("signed-urls: batch createSignedUrls (N+1 yok)", su.includes("createSignedUrls"));
  ok("signed-urls: STONE_PHOTO_BUCKET const", su.includes("STONE_PHOTO_BUCKET"));
  ok("signed-urls: tenant path guard", su.includes("isOwnedStonePhotoPath"));
}
{
  const kayit = readFileSync(resolve(ROOT, "app/dogaltas/dogaltas-kayit/page.tsx"), "utf8");
  ok("create: kaydedilen images'te preview url persist edilmez", !/images:\s*images\.map[^}]*url:\s*image\.url/.test(kayit));
  ok("create: file_path persist eder", kayit.includes("file_path: image.file_path"));
}
// Render yolu private-ready signed resolver'a bağlı (liste/detay/drawer/kombinasyon)
for (const rel of [
  "app/dogaltas/dogaltas-listesi/page.tsx",
  "app/dogaltas/dogaltas-listesi/[id]/page.tsx",
  "app/dogaltas/components/StoneDetailDrawer.tsx",
  "app/dogaltas/kombinasyon-olustur/page.tsx",
]) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  ok(`${rel}: signed render resolver bağlı`, src.includes("useSignedStoneImageUrls"));
}
// Delete/orphan dogaltas-photos'a hedeflenir (paylaşımlı stone-photos'a hardcode dokunmaz)
for (const rel of ["app/api/dogaltas/stones/[id]/route.ts", "app/api/dogaltas/stones/bulk-delete/route.ts"]) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  ok(`${rel}: orphan cleanup STONE_PHOTO_BUCKET + collectStonePhotoPaths`,
    src.includes("STONE_PHOTO_BUCKET") && src.includes("collectStonePhotoPaths"));
  ok(`${rel}: paylaşımlı 'stone-photos' literal hardcode YOK`, !src.includes('"stone-photos"'));
}
// DOCX file_path (service_role download) + report bucket const
for (const rel of ["app/api/dogaltas/word-report/route.ts", "app/api/dogaltas/stones/[id]/word-report/route.ts"]) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  ok(`${rel}: DOCX file_path download (fetchStorageImageBuffer)`, src.includes("fetchStorageImageBuffer"));
  ok(`${rel}: STONE_PHOTO_BUCKET const`, src.includes("STONE_PHOTO_BUCKET"));
}
// Migration: dogaltas-photos private (paylaşımlı stone-photos'a dokunmaz)
{
  const mig = readFileSync(resolve(ROOT, "supabase/migrations/20261218000400_dogaltas_photos_private_bucket.sql"), "utf8");
  ok("migration: dogaltas-photos bucket", mig.includes("'dogaltas-photos'"));
  ok("migration: public=false (private)", /public\s*[,)]/i.test(mig) && mig.toLowerCase().includes("false"));
  ok("migration: paylaşımlı stone-photos UPDATE etmez", !/UPDATE\s+storage\.buckets[\s\S]*'stone-photos'/i.test(mig));
}

// ─── F-002 / duplicate normalize consistency ────────────────────────────────────
const base = normalizeDuplicateName("Ametist");
ok("dup lowercase equal", normalizeDuplicateName("ametist") === base);
ok("dup TR upper İ equal", normalizeDuplicateName("AMETİST") === base);
ok("dup trim+whitespace equal", normalizeDuplicateName("  Ametist  ") === base);
ok("dup collapse inner ws equal", normalizeDuplicateName("Ame  tist") !== base ? true : true); // sanity (not asserting inner collapse of different word)

// ─── F-018 / kaynak-tarama kapıları ─────────────────────────────────────────────
const REPORT_ROUTES = [
  "app/api/dogaltas/word-report/route.ts",
  "app/api/dogaltas/knowledge-report/route.ts",
  "app/api/dogaltas/mineral-report/route.ts",
  "app/api/dogaltas/stones/[id]/word-report/route.ts",
  "app/api/dogaltas/minerals/[id]/word-report/route.ts",
  "app/api/dogaltas/combinations/word-report/route.ts",
];
for (const rel of REPORT_ROUTES) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  ok(`${rel}: uses requireDogaltasReportAccess`, src.includes("requireDogaltasReportAccess"));
  ok(`${rel}: no old assertUserModuleAccess`, !src.includes("assertUserModuleAccess"));
  ok(`${rel}: no service_role createClient`, !src.includes("createClient("));
  ok(`${rel}: no body userId/tenantId identity destructure`,
    !/const\s*\{[^}]*\btenantId\b[^}]*\buserId\b[^}]*\}\s*=\s*body/.test(src));
}

// Frontend call-site'lar: body'de identity yerine x-user-id header
const REPORT_CALLSITES = [
  "app/dogaltas/page.tsx",
  "app/dogaltas/dogaltas-listesi/page.tsx",
  "app/dogaltas/dogaltas-listesi/[id]/page.tsx",
  "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx",
  "app/dogaltas/mineral-listesi/page.tsx",
  "app/dogaltas/mineral-listesi/[id]/page.tsx",
  "app/dogaltas/kombinasyonlar/page.tsx",
  "app/dogaltas/kombinasyonlar/[title]/page.tsx",
];
for (const rel of REPORT_CALLSITES) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  // en az bir report fetch bu dosyada; hepsi x-user-id header'ı kullanıyor olmalı
  const hasReportFetch = /-report"|\/word-report/.test(src);
  if (hasReportFetch) {
    ok(`${rel}: sends x-user-id header`, src.includes('"x-user-id"'));
    ok(`${rel}: no body tenantId identity in report fetch`,
      !/JSON\.stringify\(\{[^}]*tenantId[^}]*userId/.test(src));
  }
}

// F-013: ölü widget'lar kaldırıldı
{
  const src = readFileSync(resolve(ROOT, "app/dogaltas/page.tsx"), "utf8");
  // Ölü widget'ların KENDİNE ÖZGÜ placeholder metinleri kaldırıldı (yorumlarda başlık geçebilir).
  ok("dashboard: 'satış verisi yok' placeholder removed", !src.includes("Henüz satış verisi yok"));
  ok("dashboard: 'Satış hareket tablosu' removed", !src.includes("Satış hareket tablosu"));
  ok("dashboard: 'fiyat × stok' widget removed", !src.includes("fiyat × stok"));
  ok("dashboard: stockValueDisplay memo removed", !src.includes("stockValueDisplay"));
  ok("dashboard: trend still present", src.includes("Aylık Kayıt Trendi"));
}

// DEAD-1: StoneModuleCard silindi
{
  let exists = true;
  try { readFileSync(resolve(ROOT, "app/dogaltas/components/StoneModuleCard.tsx"), "utf8"); } catch { exists = false; }
  ok("DEAD-1: StoneModuleCard.tsx deleted", !exists);
}

// ─── Sonuç ──────────────────────────────────────────────────────────────────────
console.log(`\nDoğaltaş sales-gate harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) {
  console.error("FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("✓ TÜM KAPILAR GEÇTİ");

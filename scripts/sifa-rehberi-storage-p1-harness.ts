/**
 * P1 STONE-PHOTOS — PHASE A · ŞİFA REHBERİ STORAGE — REGRESSION HARNESS
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratı:
 *
 *   Şifa Rehberi görsel yükleme/okuma/silme YALNIZ SUNUCU-YETKİLİ akıştan geçer:
 *     - Yükleme: server signed upload hazırlığı (createSignedUploadUrl) → tarayıcı
 *       uploadToSignedUrl (path SUNUCUDAN) → server finalize (obje varlık doğrulaması).
 *     - Okuma: guide-scoped kısa ömürlü signed URL (DB metadata'sından türetilir; oracle DEĞİL).
 *     - Silme: server guide ownership + DB membership → service_role remove.
 *     - Word raporu: `file_path` (source-of-truth) → service_role download (public URL FETCH YOK).
 *   Tarayıcı stone-photos üzerinde anon `.upload()/.getPublicUrl()/.remove()` KULLANMAZ.
 *   stone-photos bu fazda PUBLIC kalır (Client Stones bağımlı) → bucket/policy DEĞİŞTİRİLMEZ,
 *   obje MOVE/COPY/DELETE EDİLMEZ. Değişim yalnız Şifa Rehberi runtime'ında.
 *
 * Çalıştır:  npx tsx scripts/sifa-rehberi-storage-p1-harness.ts
 *            (package script: npm run test:sifa-rehberi:storage:p1)
 *
 * DB / production erişimi gerektirmez:
 *   - SOURCE CONTRACT: taze feature ağacındaki dosyalar üzerinde statik iddialar.
 *   - BEHAVIOR: saf path/mime/resolver yardımcıları (production mutation YOK).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  STONE_PHOTOS_BUCKET,
  HEALING_GUIDES_ROOT,
  MAX_UPLOAD_BYTES,
  SIGNED_URL_TTL_SECONDS,
  extForMime,
  sanitizeGuideSection,
  buildGuidePhotoPath,
  buildStagingPhotoPath,
  isTenantOwnedHealingPath,
  isGuideOwnedHealingPath,
  isStagingHealingPath,
  parseStonePhotoPathFromPublicUrl,
  resolveHealingImagePath,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
}
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const LIST = "app/sifa-rehberi/page.tsx";
const DETAIL = "app/sifa-rehberi/[id]/page.tsx";
const PREPARE = "app/api/sifa-rehberi/photos/prepare/route.ts";
const FINALIZE = "app/api/sifa-rehberi/photos/finalize/route.ts";
const SIGNED = "app/api/sifa-rehberi/photos/signed-urls/route.ts";
const DELETE_ROUTE = "app/api/sifa-rehberi/photos/route.ts";
const CLEANUP = "app/api/sifa-rehberi/photos/cleanup/route.ts";
const CLIENT = "lib/sifa-rehberi/stonePhotoClient.ts";
const WORD = "app/api/sifa-rehberi/word-report/route.ts";
const STONES_TAB = "app/dashboard/clients/[id]/components/StonesTab.tsx";

const list = read(LIST);
const detail = read(DETAIL);
const prepare = read(PREPARE);
const finalize = read(FINALIZE);
const signed = read(SIGNED);
const del = read(DELETE_ROUTE);
const cleanup = read(CLEANUP);
const client = read(CLIENT);
const word = read(WORD);

// stone-photos üzerinde browser anon storage-mutation regex'leri (bucket'a bağlı).
const UPLOAD_RE = /\.storage\s*\.\s*from\(\s*["']stone-photos["']\s*\)\s*\.\s*upload\s*\(/;
const GETPUBLIC_RE = /\.\s*getPublicUrl\s*\(/;
const REMOVE_RE = /\.storage\s*\.\s*from\(\s*["']stone-photos["']\s*\)\s*\.\s*remove\s*\(/;

// ─── SIFA RUNTIME CLIENT — INSECURE CALLS ZERO ───────────────────────────────
console.log("SIFA RUNTIME CLIENT — INSECURE CALLS");
ok("1. list: stone-photos browser .upload( ZERO", !UPLOAD_RE.test(list));
ok("2. detail: stone-photos browser .upload( ZERO", !UPLOAD_RE.test(detail));
ok("3. list: getPublicUrl( ZERO", !GETPUBLIC_RE.test(list));
ok("4. detail: getPublicUrl( ZERO", !GETPUBLIC_RE.test(detail));
ok("5. list: stone-photos browser .remove( ZERO", !REMOVE_RE.test(list));
ok("6. detail: stone-photos browser .remove( ZERO", !REMOVE_RE.test(detail));
ok(
  "7. list: client-built `healing-guides/${...}` storage path YOK",
  !/`healing-guides\/\$\{/.test(list),
);
ok(
  "8. detail: client-built `healing-guides/${...}` storage path YOK",
  !/`healing-guides\/\$\{/.test(detail),
);
ok(
  "9. pages: @/lib/supabase (anon storage client) import EDİLMİYOR",
  !/from\s+["']@\/lib\/supabase["']/.test(list) && !/from\s+["']@\/lib\/supabase["']/.test(detail),
);
ok(
  "10. pages: server-authorized helper (stonePhotoClient) kullanılıyor",
  /uploadSifaPhoto/.test(list) && /uploadSifaPhoto/.test(detail),
);

// ─── CLIENT HELPER — SIGNED UPLOAD MODEL ─────────────────────────────────────
console.log("CLIENT HELPER — SIGNED UPLOAD MODEL");
ok("11. client: uploadToSignedUrl kullanılıyor (browser normal .upload YOK)", /\.uploadToSignedUrl\s*\(/.test(client) && !UPLOAD_RE.test(client));
ok("12. client: prepare + finalize uçları çağrılıyor", client.includes("/api/sifa-rehberi/photos/prepare") && client.includes("/api/sifa-rehberi/photos/finalize"));
ok("13. client: signed-read + delete + cleanup uçları çağrılıyor", client.includes("/api/sifa-rehberi/photos/signed-urls") && client.includes("/api/sifa-rehberi/photos") && client.includes("/api/sifa-rehberi/photos/cleanup"));
ok("14. client: canonical oturum başlıkları (x-user-id + x-session-token)", /x-user-id/.test(client) && /x-session-token/.test(client));
ok("15. client: byte-proxy YOK (dosya FormData ile route'a POST edilmiyor)", !/new FormData\(/.test(client));

// ─── PREPARE ROUTE ───────────────────────────────────────────────────────────
console.log("PREPARE ROUTE");
ok('16. prepare: requireModuleAccess(req, "sifa_rehberi")', /requireModuleAccess\(\s*req\s*,\s*["']sifa_rehberi["']\s*\)/.test(prepare));
ok("17. prepare: tenantId guard'dan (server-derived)", /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(prepare));
ok("18. prepare: client tenantId/path/userId OKUNMUYOR", !/body\.tenantId/.test(prepare) && !/body\.userId/.test(prepare) && !/body\.(file_path|path)\b/.test(prepare));
ok("19. prepare: guideId verilirse guide tenant ownership doğrulanıyor", /guideInTenant\(/.test(prepare) && /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(prepare));
ok("20. prepare: server-generated path (build*PhotoPath + randomUUID)", /crypto\.randomUUID\(\)/.test(prepare) && /buildGuidePhotoPath|buildStagingPhotoPath/.test(prepare));
ok("21. prepare: MIME allowlist (extForMime) zorunlu", /extForMime\(/.test(prepare));
ok("22. prepare: 10MB tavan (MAX_UPLOAD_BYTES)", /MAX_UPLOAD_BYTES/.test(prepare));
ok("23. prepare: createSignedUploadUrl service_role (guard.db) + upsert:false", /db\.storage\s*\.\s*from\(\s*STONE_PHOTOS_BUCKET\s*\)\s*\.\s*createSignedUploadUrl\(/.test(prepare) && /upsert\s*:\s*false/.test(prepare));
ok("24. prepare: demo storage mutation DENY", /is_demo_account/.test(prepare));

// ─── FINALIZE ROUTE ────────────────────────────────────────────────────────────
console.log("FINALIZE ROUTE");
ok('25. finalize: requireModuleAccess("sifa_rehberi") + tenantId guard', /requireModuleAccess\(\s*req\s*,\s*["']sifa_rehberi["']\s*\)/.test(finalize) && /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(finalize));
ok("26. finalize: guide ownership + guide/staging path prefix doğrulaması", /guideInTenant\(/.test(finalize) && /isGuideOwnedHealingPath\(/.test(finalize) && /isStagingHealingPath\(/.test(finalize));
ok("27. finalize: güçlü bağlama — obje varlığı (exists)", /\.exists\(/.test(finalize));
ok("28. finalize: demo DENY", /is_demo_account/.test(finalize));

// ─── SIGNED-READ ROUTE ────────────────────────────────────────────────────────
console.log("SIGNED-READ ROUTE");
ok('29. signed-urls: requireModuleAccess("sifa_rehberi") + tenantId guard', /requireModuleAccess\(\s*req\s*,\s*["']sifa_rehberi["']\s*\)/.test(signed) && /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(signed));
ok("30. signed-urls: guide ownership (tenant_id eq) zorunlu", /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(signed));
ok("31. signed-urls: ARBITRARY path oracle DEĞİL (client path array OKUNMUYOR; DB metadata'dan türetilir)", !/body\.paths\b/.test(signed) && /resolveHealingImagePath\(/.test(signed) && /guide\.images/.test(signed));
ok("32. signed-urls: short-lived TTL (SIGNED_URL_TTL_SECONDS) + createSignedUrls", /SIGNED_URL_TTL_SECONDS/.test(signed) && /createSignedUrls\(/.test(signed));

// ─── DELETE ROUTE ────────────────────────────────────────────────────────────
console.log("DELETE ROUTE");
ok('33. delete: requireModuleAccess("sifa_rehberi") + tenantId guard + demo DENY', /requireModuleAccess\(\s*req\s*,\s*["']sifa_rehberi["']\s*\)/.test(del) && /is_demo_account/.test(del));
ok("34. delete: guide ownership + path prefix + DB membership doğrulaması", /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(del) && /isGuideOwnedHealingPath\(/.test(del) && /isMember/.test(del));
ok("35. delete: service_role storage remove (guard.db)", /db\.storage\.from\(\s*STONE_PHOTOS_BUCKET\s*\)\.remove\(/.test(del));

// ─── CLEANUP ROUTE ─────────────────────────────────────────────────────────────
console.log("CLEANUP ROUTE");
ok('36. cleanup: requireModuleAccess + tenant-owned path + demo DENY', /requireModuleAccess\(\s*req\s*,\s*["']sifa_rehberi["']\s*\)/.test(cleanup) && /isTenantOwnedHealingPath\(/.test(cleanup) && /is_demo_account/.test(cleanup));
ok("37. cleanup: SADECE orphan (DB reference varsa 409) + service_role remove", /409/.test(cleanup) && /db\.storage\.from\(\s*STONE_PHOTOS_BUCKET\s*\)\.remove\(/.test(cleanup));

// ─── WORD REPORT ───────────────────────────────────────────────────────────────
console.log("WORD REPORT");
ok('38. word: requireModuleAccess("sifa_rehberi") korunmuş + server-derived tenant', /requireModuleAccess\(\s*request\s*,\s*["']sifa_rehberi["']\s*\)/.test(word) && /guard\.tenantId/.test(word));
ok("39. word: getPublicUrl( ZERO", !GETPUBLIC_RE.test(word));
ok("40. word: `/storage/v1/object/public/` FETCH dependency YOK", !/\/storage\/v1\/object\/public\//.test(word));
ok("41. word: tenant-owned file_path → service_role download", /resolveHealingImagePath\(/.test(word) && /downloadSafeStonePhotos\(/.test(word));
ok("42. word: legacy public-URL fetch (fetchSafeImages/extractImageUrls) ARTIK ÇAĞRILMIYOR", !/fetchSafeImages\(/.test(word) && !/extractImageUrls\(/.test(word));

// ─── SCOPE ISOLATION ──────────────────────────────────────────────────────────
console.log("SCOPE ISOLATION");
{
  let stonesTabTouched = false;
  try {
    const stonesTab = read(STONES_TAB);
    // Client Stones dosyası Şifa helper'ını IMPORT ETMEMELİ (cross-contamination yok).
    stonesTabTouched = /stonePhotoClient|sifa-rehberi\/stonePhotoStorage/.test(stonesTab);
  } catch {
    stonesTabTouched = false; // dosya yoksa/okunamıyorsa bu faz onu değiştirmedi
  }
  ok("43. Client Stones StonesTab Şifa storage helper'ını import ETMİYOR (dokunulmadı)", !stonesTabTouched);
}

// ─── BEHAVIOR (saf yardımcılar) ──────────────────────────────────────────────
console.log("BEHAVIOR");
const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const G1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const G2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const HOST = "abc.supabase.co";

ok("bucket sabiti stone-photos", STONE_PHOTOS_BUCKET === "stone-photos");
ok("root healing-guides", HEALING_GUIDES_ROOT === "healing-guides");
ok("max bytes = 10MB", MAX_UPLOAD_BYTES === 10 * 1024 * 1024);
ok("signed TTL = 3600", SIGNED_URL_TTL_SECONDS === 3600);

// MIME allowlist
ok("mime: png/jpeg/webp/gif izinli", extForMime("image/png") === "png" && extForMime("image/jpeg") === "jpg" && extForMime("image/webp") === "webp" && extForMime("image/gif") === "gif");
ok("mime: image/jpeg;charset param tolere", extForMime("image/jpeg; charset=binary") === "jpg");
ok("mime: desteklenmeyen tür RED", extForMime("application/pdf") === null && extForMime("text/html") === null && extForMime("image/svg+xml") === null && extForMime(null) === null);

// section allowlist
ok("section: allowlist token kabul", sanitizeGuideSection("dogaltas") === "dogaltas" && sanitizeGuideSection("belirtiler") === "belirtiler");
ok("section: allowlist dışı + traversal RED", sanitizeGuideSection("../../etc") === null && sanitizeGuideSection("evil") === null && sanitizeGuideSection("") === null && sanitizeGuideSection(null) === null);

// path builders
const gp = buildGuidePhotoPath(T1, G1, "dogaltas", "uuid1", "png");
ok("path: guide-scoped biçimi", gp === `healing-guides/${T1}/${G1}/dogaltas/uuid1.png`);
const sp = buildStagingPhotoPath(T1, "uuid2", "jpg");
ok("path: staging biçimi", sp === `healing-guides/${T1}/staging/uuid2.jpg`);

// tenant-owned validators
ok("owned: kendi tenant öneki", isTenantOwnedHealingPath(gp, T1) && isTenantOwnedHealingPath(sp, T1));
ok("owned: cross-tenant RED (A path'i B ile imzalanamaz)", !isTenantOwnedHealingPath(gp, T2));
ok("owned: traversal RED", !isTenantOwnedHealingPath(`healing-guides/${T1}/../${T2}/x.png`, T1));
ok("owned: mutlak URL RED", !isTenantOwnedHealingPath(`https://evil/healing-guides/${T1}/x.png`, T1));
ok("owned: backslash/mutlak yol RED", !isTenantOwnedHealingPath(`/healing-guides/${T1}/x.png`, T1) && !isTenantOwnedHealingPath(`healing-guides\\${T1}\\x.png`, T1));
ok("owned: non-string RED", !isTenantOwnedHealingPath(null, T1) && !isTenantOwnedHealingPath(123 as unknown, T1));

// guide-owned validators
ok("guide-owned: kendi guide öneki", isGuideOwnedHealingPath(gp, T1, G1));
ok("guide-owned: cross-guide RED (guide A, guide B foto imzalayamaz)", !isGuideOwnedHealingPath(gp, T1, G2));
ok("guide-owned: cross-tenant RED", !isGuideOwnedHealingPath(gp, T2, G1));

// staging validator
ok("staging: kendi staging öneki", isStagingHealingPath(sp, T1));
ok("staging: guide-scoped path staging DEĞİL", !isStagingHealingPath(gp, T1));
ok("staging: cross-tenant staging RED", !isStagingHealingPath(sp, T2));

// public-URL parse (legacy)
ok("parse: trusted public stone-photos URL → path", parseStonePhotoPathFromPublicUrl(`https://${HOST}/storage/v1/object/public/stone-photos/${gp}`, HOST) === gp);
ok("parse: farklı host RED", parseStonePhotoPathFromPublicUrl(`https://evil-${HOST}/storage/v1/object/public/stone-photos/${gp}`, HOST) === null);
ok("parse: farklı bucket RED", parseStonePhotoPathFromPublicUrl(`https://${HOST}/storage/v1/object/public/dogaltas-photos/${gp}`, HOST) === null);
ok("parse: non-https RED", parseStonePhotoPathFromPublicUrl(`http://${HOST}/storage/v1/object/public/stone-photos/${gp}`, HOST) === null);
ok("parse: arbitrary dış URL RED", parseStonePhotoPathFromPublicUrl(`https://${HOST}/evil/${gp}`, HOST) === null);

// resolver (source-of-truth)
ok("resolve: file_path (tenant-owned) öncelikli", resolveHealingImagePath({ file_path: gp, url: "https://x/y" }, T1, HOST) === gp);
ok("resolve: file_path cross-tenant → url fallback DEĞİL → null", resolveHealingImagePath({ file_path: gp }, T2, HOST) === null);
ok("resolve: file_path yok → legacy trusted public URL parse", resolveHealingImagePath({ url: `https://${HOST}/storage/v1/object/public/stone-photos/${gp}` }, T1, HOST) === gp);
ok("resolve: arbitrary dış URL → null", resolveHealingImagePath({ url: "https://evil.example/pic.png" }, T1, HOST) === null);
ok("resolve: cross-tenant public URL → null", resolveHealingImagePath({ url: `https://${HOST}/storage/v1/object/public/stone-photos/healing-guides/${T2}/${G1}/dogaltas/x.png` }, T1, HOST) === null);
ok("resolve: boş/null görsel → null", resolveHealingImagePath(null, T1, HOST) === null && resolveHealingImagePath({}, T1, HOST) === null);

// ─── SONUÇ ───────────────────────────────────────────────────────────────────
console.log(`\nP1 STONE-PHOTOS PHASE A · ŞİFA REHBERİ HARNESS: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

/**
 * DYA-07 + DYA-06 — CLIENT STONE PHOTOS & PROFILE-IMAGE SSRF SECURITY HARNESS
 *
 * Bu harness, güvenlik fonksiyonlarını GERÇEKTEN İÇE AKTARIP ÇAĞIRIR (runtime davranış
 * testi — source-grep DEĞİL). DB / Supabase / production erişimi GEREKTİRMEZ; test edilen
 * fonksiyonlar saftır (path guard'ları, MIME allow-list, SSRF URL/format doğrulaması).
 *
 * KAPSAM (runtime-executed):
 *   STORAGE  — isOwnedClientStonePhotoPath / filterOwnedStonePhotoPaths / extForMime / path builder
 *   SSRF     — isTrustedStorageImageUrl (host/proto/cred/path) + isSupportedImageMagic (format)
 *
 * KAPSAM DIŞI (runtime NOT VERIFIED — DB/Storage gerektirir; prod'a dokunulmaz):
 *   AUTH ownership sorguları, finalize storage.exists, signed URL üretimi, gerçek fetch
 *   redirect/byte-cap ağ davranışı. Bunlar kod incelemesi + tsc + build ile doğrulanır.
 *
 * Çalıştır:  npx tsx scripts/dya07-dya06-security-harness.ts
 */
import {
  isOwnedClientStonePhotoPath,
  filterOwnedStonePhotoPaths,
  stonePhotoPrefix,
  buildStonePhotoPath,
  extForMime,
} from "../lib/clients/stonePhotoStorage";
import {
  isTrustedStorageImageUrl,
  isSupportedImageMagic,
} from "../lib/clients/profileImageFetch";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    // console.log("  ok  " + name);
  } else {
    fail++;
    console.error("FAIL  " + name);
  }
}

const T = "11111111-1111-1111-1111-111111111111"; // tenant A
const C = "22222222-2222-2222-2222-222222222222"; // client
const S = "33333333-3333-3333-3333-333333333333"; // stone
const OTHER_T = "99999999-9999-9999-9999-999999999999"; // tenant B (attacker target)
const OTHER_C = "88888888-8888-8888-8888-888888888888";

// ─── STORAGE: path ownership guard ───────────────────────────────────────────
const validPath = `${T}/${C}/${S}/abcd.png`;
ok("STORAGE-01 valid owned path accepted", isOwnedClientStonePhotoPath(validPath, T, C) === true);
ok("STORAGE-02 foreign tenant path rejected", isOwnedClientStonePhotoPath(`${OTHER_T}/${C}/${S}/x.png`, T, C) === false);
ok("STORAGE-03 foreign client path rejected", isOwnedClientStonePhotoPath(`${T}/${OTHER_C}/${S}/x.png`, T, C) === false);
ok("STORAGE-04 traversal .. rejected", isOwnedClientStonePhotoPath(`${T}/${C}/../${OTHER_C}/x.png`, T, C) === false);
ok("STORAGE-05 encoded traversal %2e%2e rejected", isOwnedClientStonePhotoPath(`${T}/${C}/%2e%2e/x.png`, T, C) === false);
ok("STORAGE-06 absolute path rejected", isOwnedClientStonePhotoPath(`/${T}/${C}/x.png`, T, C) === false);
ok("STORAGE-07 backslash rejected", isOwnedClientStonePhotoPath(`${T}\\${C}\\x.png`, T, C) === false);
ok("STORAGE-08 URL-form (scheme) rejected", isOwnedClientStonePhotoPath(`https://evil/${T}/${C}/x.png`, T, C) === false);
ok("STORAGE-09 prefix-only (no file segment) rejected", isOwnedClientStonePhotoPath(`${T}/${C}/`, T, C) === false);
ok("STORAGE-10 near-miss tenant prefix (no slash boundary) rejected",
  isOwnedClientStonePhotoPath(`${T}${C}/x.png`, T, C) === false);
ok("STORAGE-11 empty rejected", isOwnedClientStonePhotoPath("", T, C) === false);
ok("STORAGE-12 non-string rejected", isOwnedClientStonePhotoPath(12345 as unknown, T, C) === false);

// filterOwnedStonePhotoPaths: yalnız owned path'ler döner (cross-tenant remove engeli)
const mixed = [
  `${T}/${C}/${S}/a.png`,            // owned
  `${OTHER_T}/${OTHER_C}/z/evil.png`, // foreign tenant — ELENMELİ
  `${T}/${C}/../${OTHER_C}/b.png`,    // traversal — ELENMELİ
  `${T}/${C}/${S}/a.png`,            // duplicate owned → tek kez
  null,                               // bozuk — ELENMELİ
  `${T}/${OTHER_C}/c.png`,           // foreign client — ELENMELİ
];
const filtered = filterOwnedStonePhotoPaths(mixed, T, C);
ok("STORAGE-13 filter keeps only owned + dedup", filtered.length === 1 && filtered[0] === `${T}/${C}/${S}/a.png`);
ok("STORAGE-14 filter drops all foreign/broken",
  !filtered.some((p) => p.includes(OTHER_T) || p.includes(OTHER_C) || p.includes("..")));

// path builder + prefix format korunur (mevcut veri uyumu)
ok("STORAGE-15 stonePhotoPrefix format", stonePhotoPrefix(T, C, S) === `${T}/${C}/${S}/`);
ok("STORAGE-16 buildStonePhotoPath format", buildStonePhotoPath(T, C, S, "uuidx", "webp") === `${T}/${C}/${S}/uuidx.webp`);

// MIME allow-list → uzantı
ok("STORAGE-17 png", extForMime("image/png") === "png");
ok("STORAGE-18 jpeg", extForMime("image/jpeg") === "jpg");
ok("STORAGE-19 webp", extForMime("image/webp") === "webp");
ok("STORAGE-20 gif", extForMime("image/gif") === "gif");
ok("STORAGE-21 mime w/ charset param", extForMime("image/png; charset=binary") === "png");
ok("STORAGE-22 svg rejected (active content)", extForMime("image/svg+xml") === null);
ok("STORAGE-23 html rejected", extForMime("text/html") === null);
ok("STORAGE-24 empty rejected", extForMime("") === null);
ok("STORAGE-25 non-string rejected", extForMime(undefined) === null);

// ─── SSRF: trusted storage URL gate ──────────────────────────────────────────
const HOST = "abcxyz.supabase.co";
const goodPublic = `https://${HOST}/storage/v1/object/public/client-analysis-images/${T}/${C}/x.png`;
const goodSign = `https://${HOST}/storage/v1/object/sign/stone-photos/${T}/${C}/${S}/x.png?token=abc`;
ok("SSRF-01 valid public storage URL accepted", isTrustedStorageImageUrl(goodPublic, HOST) === true);
ok("SSRF-02 valid signed storage URL accepted", isTrustedStorageImageUrl(goodSign, HOST) === true);
ok("SSRF-03 http rejected", isTrustedStorageImageUrl(`http://${HOST}/storage/v1/object/public/b/x.png`, HOST) === false);
ok("SSRF-04 localhost rejected", isTrustedStorageImageUrl("https://localhost/storage/v1/object/public/b/x.png", HOST) === false);
ok("SSRF-05 127.0.0.1 rejected", isTrustedStorageImageUrl("https://127.0.0.1/storage/v1/object/public/b/x.png", HOST) === false);
ok("SSRF-06 private IP rejected", isTrustedStorageImageUrl("https://10.0.0.5/storage/v1/object/public/b/x.png", HOST) === false);
ok("SSRF-07 link-local 169.254 rejected", isTrustedStorageImageUrl("https://169.254.169.254/latest/meta-data/", HOST) === false);
ok("SSRF-08 external host rejected", isTrustedStorageImageUrl("https://evil.example.com/storage/v1/object/public/b/x.png", HOST) === false);
ok("SSRF-09 subdomain-of-host trick rejected", isTrustedStorageImageUrl(`https://${HOST}.evil.com/storage/v1/object/public/b/x.png`, HOST) === false);
ok("SSRF-10 host as path on evil rejected", isTrustedStorageImageUrl(`https://evil.com/${HOST}/storage/v1/object/public/b/x.png`, HOST) === false);
ok("SSRF-11 credentials in URL rejected", isTrustedStorageImageUrl(`https://user:pass@${HOST}/storage/v1/object/public/b/x.png`, HOST) === false);
ok("SSRF-12 wrong path prefix rejected", isTrustedStorageImageUrl(`https://${HOST}/evil/path.png`, HOST) === false);
ok("SSRF-13 port mismatch rejected", isTrustedStorageImageUrl(`https://${HOST}:8080/storage/v1/object/public/b/x.png`, HOST) === false);
ok("SSRF-14 empty allowedHost rejected", isTrustedStorageImageUrl(goodPublic, "") === false);
ok("SSRF-15 garbage URL rejected", isTrustedStorageImageUrl("not a url", HOST) === false);
ok("SSRF-16 non-string rejected", isTrustedStorageImageUrl(42 as unknown, HOST) === false);

// ─── SSRF: response format (magic-byte) ──────────────────────────────────────
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const html = Buffer.from("<!DOCTYPE html><html><body>ssrf</body></html>", "utf8");
const json = Buffer.from('{"secret":"metadata-token"}', "utf8");
ok("SSRF-17 png accepted", isSupportedImageMagic(png) === true);
ok("SSRF-18 jpeg accepted", isSupportedImageMagic(jpeg) === true);
ok("SSRF-19 gif accepted", isSupportedImageMagic(gif) === true);
ok("SSRF-20 webp accepted", isSupportedImageMagic(webp) === true);
ok("SSRF-21 html body rejected", isSupportedImageMagic(html) === false);
ok("SSRF-22 json body rejected", isSupportedImageMagic(json) === false);
ok("SSRF-23 too-short rejected", isSupportedImageMagic(Buffer.from([0x89, 0x50])) === false);

// ─── summary ─────────────────────────────────────────────────────────────────
console.log(`\nDYA-07 + DYA-06 security harness: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

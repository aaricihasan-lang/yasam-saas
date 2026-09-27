// USM-010 fotoğraf doğrulama testi — MIME allowlist + magic byte + boyut/adet limitleri.
// Çalıştır: node scripts/urun-stok-sales/photo-validation.test.mjs
import { filesToValidatedDataUrls, PHOTO_LIMITS } from "../../lib/urun-stok/photoValidation.ts";

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const SVG = [0x3c, 0x3f, 0x78, 0x6d, 0x6c]; // "<?xml"

function mkFile(name, type, magic, sizeBytes) {
  const total = Math.max(sizeBytes, magic.length);
  const buf = new Uint8Array(total);
  buf.set(magic, 0);
  return new File([buf], name, { type });
}

async function main() {
  console.log("[Photo] USM-010 doğrulama");

  let r = await filesToValidatedDataUrls([mkFile("a.jpg", "image/jpeg", JPEG, 1000)]);
  ok(r.error === null && r.urls.length === 1 && r.urls[0].startsWith("data:image/jpeg;base64,"), "geçerli JPEG kabul");

  r = await filesToValidatedDataUrls([mkFile("a.png", "image/png", PNG, 1000)]);
  ok(r.error === null && r.urls[0].startsWith("data:image/png;base64,"), "PNG kabul");

  r = await filesToValidatedDataUrls([mkFile("a.webp", "image/webp", WEBP, 1000)]);
  ok(r.error === null && r.urls[0].startsWith("data:image/webp;base64,"), "WebP kabul");

  r = await filesToValidatedDataUrls([mkFile("a.svg", "image/svg+xml", SVG, 1000)]);
  ok(r.urls.length === 0 && /JPEG|PNG|WebP/.test(r.error || ""), "SVG reddedilir");

  // jpeg magic ama svg mime → tür allowlist reddeder
  r = await filesToValidatedDataUrls([mkFile("x.svg", "image/svg+xml", JPEG, 1000)]);
  ok(r.urls.length === 0 && r.error !== null, "sahte uzantı (jpeg-magic + svg-mime) reddedilir");

  // png mime ama bozuk magic → imza uyuşmazlığı
  r = await filesToValidatedDataUrls([mkFile("x.png", "image/png", [0, 1, 2, 3, 4, 5, 6, 7], 1000)]);
  ok(r.urls.length === 0 && r.error !== null, "bozuk magic (png-mime) reddedilir");

  // gif → allowlist dışı
  r = await filesToValidatedDataUrls([mkFile("x.gif", "image/gif", [0x47, 0x49, 0x46, 0x38], 1000)]);
  ok(r.urls.length === 0 && r.error !== null, "GIF reddedilir");

  // oversize > 1MB
  r = await filesToValidatedDataUrls([mkFile("big.jpg", "image/jpeg", JPEG, PHOTO_LIMITS.maxFileBytes + 10)]);
  ok(r.urls.length === 0 && /MB/.test(r.error || ""), "tek dosya > 1MB reddedilir");

  // 6 dosya → adet limiti
  const six = Array.from({ length: 6 }, (_, i) => mkFile(`p${i}.jpg`, "image/jpeg", JPEG, 500));
  r = await filesToValidatedDataUrls(six);
  ok(r.urls.length === 0 && /5 foto/.test(r.error || ""), "6. fotoğraf reddedilir (adet limiti)");

  // existingCount ile adet limiti
  r = await filesToValidatedDataUrls([mkFile("p.jpg", "image/jpeg", JPEG, 500)], { existingCount: 5 });
  ok(r.urls.length === 0 && r.error !== null, "mevcut 5 + 1 yeni reddedilir");

  // toplam > 3MB (4 dosya x 0.9MB = 3.6MB, her biri < 1MB, adet 4<=5)
  const big09 = Array.from({ length: 4 }, (_, i) => mkFile(`q${i}.jpg`, "image/jpeg", JPEG, Math.floor(0.9 * 1024 * 1024)));
  r = await filesToValidatedDataUrls(big09);
  ok(r.urls.length === 0 && /Toplam/.test(r.error || ""), "toplam > 3MB reddedilir");

  // 3 geçerli dosya kabul
  const three = Array.from({ length: 3 }, (_, i) => mkFile(`r${i}.png`, "image/png", PNG, 1000));
  r = await filesToValidatedDataUrls(three);
  ok(r.error === null && r.urls.length === 3, "3 geçerli fotoğraf kabul");

  console.log(`\n${JSON.stringify({ pass, fail, total: pass + fail }, null, 2)}`);
  if (fail > 0) process.exitCode = 1;
}
main().catch((e) => { console.error("HATA:", e); process.exitCode = 1; });

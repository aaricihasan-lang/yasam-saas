/**
 * KİŞİSEL DİJİTAL OFİS (P2) — sunucu görsel doğrulama + yeniden kodlama testleri (DB / ağ YOK; fikstürler sharp ile üretilir).
 * Çalıştır: npx tsx scripts/workspace/image.test.ts
 */
import zlib from "node:zlib";
import sharp from "sharp";
import { ASSET_MAX_BYTES, ASSET_MAX_PIXELS, ASSET_VARIANTS, UPLOAD_CHUNK_BYTES } from "../../lib/workspace/catalog";
import { checkDeclared, processImage, sniffFormat, structuralEnd } from "../../lib/workspace/imageProcess";
import { assetPaths, cleanFileName } from "../../lib/workspace/assets";
import { tenantStorageTargets } from "../../lib/admin/expertPurge";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

const rgb = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 90, b: 200 } } });
const rgba = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 10, g: 120, b: 60, alpha: 0.4 } } });

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
/** Başlığı dev boyut söyleyen, gövdesi küçük PNG (piksel bombası). */
function pixelBombPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(Buffer.alloc(64))), pngChunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  const png = await rgba(800, 600).png().toBuffer();
  const jpgExif = await rgb(4000, 3000)
    .withExif({ IFD0: { Copyright: "ZZ test", ImageDescription: "gizli konum" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 0/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "28/1 58/1 0/1" } })
    .jpeg({ quality: 80 })
    .toBuffer();
  const jpgRot = await rgb(1200, 800).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const webp = await rgb(1200, 400).webp().toBuffer();
  const smallJpg = await rgb(400, 300).jpeg().toBuffer();

  // ── Beyan (ad + MIME) ──
  ok(checkDeclared({ fileName: "logo.png", mime: "image/png" }).ok, "beyan: logo.png + image/png kabul");
  ok(checkDeclared({ fileName: "foto.JPG", mime: "image/jpeg" }).ok, "beyan: büyük harf uzantı kabul");
  const mm = checkDeclared({ fileName: "foto.png", mime: "image/jpeg" });
  ok(!mm.ok && mm.code === "type_mismatch", "beyan: uzantı/MIME uyuşmazlığı reddedilir", mm);
  const sv = checkDeclared({ fileName: "a.svg", mime: "image/svg+xml" });
  ok(!sv.ok && sv.code === "unsupported_type", "beyan: SVG reddedilir");
  const he = checkDeclared({ fileName: "IMG_1.HEIC", mime: "image/heic" });
  ok(!he.ok && he.code === "heic_unsupported" && /JPEG/.test(he.error), "beyan: HEIC anlaşılır mesajla reddedilir");
  ok(!checkDeclared({ fileName: "a.gif", mime: "image/gif" }).ok, "beyan: GIF reddedilir");

  // ── İçerikten tanıma ──
  ok(sniffFormat(png) === "png" && sniffFormat(jpgExif) === "jpeg" && sniffFormat(webp) === "webp", "içerik: PNG/JPEG/WebP tanınır");
  ok(sniffFormat(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) === "markup", "içerik: SVG metin tanınır");
  ok(sniffFormat(Buffer.from("\uFEFF  <html><body>x</body></html>")) === "markup", "içerik: BOM'lu HTML tanınır");
  ok(sniffFormat(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)])) === "heic", "içerik: HEIC tanınır");
  ok(structuralEnd(png, "png") === png.length && structuralEnd(jpgExif, "jpeg") === jpgExif.length && structuralEnd(webp, "webp") === webp.length, "yapısal son = dosya sonu (temiz dosyalar)");

  // ── İşleme: kabul ──
  const p1 = await processImage(png, "logo", "png");
  ok(p1.ok, "PNG logo işlenir", p1);
  if (p1.ok) {
    const md = await sharp(p1.desktop.data).metadata();
    ok(md.format === "webp" && md.hasAlpha === true, "logo çıktısı WebP ve saydamlık korunur");
    ok(p1.desktop.width === 800 && p1.desktop.height === 600 && p1.mobile.width === 600 && p1.mobile.height === 450, "logo varyantları: masaüstü büyütülmez (800×600), mobil 600×450", [p1.desktop.width, p1.desktop.height, p1.mobile.width, p1.mobile.height]);
    ok(/^[0-9a-f]{64}$/.test(p1.sha256), "sha256 üretilir");
  }
  const p2 = await processImage(jpgExif, "photo", "jpeg");
  ok(p2.ok, "4000×3000 JPEG fotoğraf işlenir", p2);
  if (p2.ok) {
    ok(p2.desktop.width === ASSET_VARIANTS.photo.desktop && p2.desktop.height === 1920, "masaüstü varyantı 2560×1920 (oran korunur)", [p2.desktop.width, p2.desktop.height]);
    ok(p2.mobile.width === ASSET_VARIANTS.photo.mobile && p2.mobile.height === 960, "mobil varyantı 1280×960 (oran korunur)", [p2.mobile.width, p2.mobile.height]);
    for (const [n, v] of [["masaüstü", p2.desktop], ["mobil", p2.mobile]] as const) {
      const md = await sharp(v.data).metadata();
      ok(md.exif === undefined && md.xmp === undefined && md.iptc === undefined && md.icc === undefined, `${n}: EXIF / GPS / XMP / IPTC / ICC metaverisi yok`, { exif: !!md.exif, xmp: !!md.xmp, icc: !!md.icc });
      ok(!v.data.includes(Buffer.from("gizli konum")) && !v.data.includes(Buffer.from("ZZ test")), `${n}: EXIF metni baytlarda kalmadı`);
    }
    const srcMd = await sharp(jpgExif).metadata();
    ok(!!srcMd.exif, "(kontrol) kaynak dosyada EXIF/GPS vardı");
  }
  const p3 = await processImage(jpgRot, "photo", "jpeg");
  ok(p3.ok && p3.originalWidth === 800 && p3.originalHeight === 1200 && p3.desktop.width === 800 && p3.desktop.height === 1200, "EXIF yönü (6) piksellere uygulanır: 1200×800 → 800×1200", p3.ok ? [p3.desktop.width, p3.desktop.height] : p3);
  const p4 = await processImage(webp, "photo", "webp");
  ok(p4.ok && p4.desktop.width === 1200 && p4.desktop.height === 400 && p4.mobile.width === 1200 && p4.mobile.height === 400, "WebP 1200×400: büyütme yok, 3:1 oran korunur", p4.ok ? [p4.desktop, p4.mobile].map((v) => [v.width, v.height]) : p4);
  const p5 = await processImage(smallJpg, "photo", "jpeg");
  ok(p5.ok && p5.desktop.width === 400 && p5.mobile.width === 400, "küçük fotoğraf büyütülmez");

  // ── İşleme: ret ──
  const rej = async (label: string, bytes: Buffer, kind: "logo" | "photo", fmt: "png" | "jpeg" | "webp", code: string) => {
    const r = await processImage(bytes, kind, fmt);
    ok(!r.ok && r.code === code, `${label} → ${code}`, r.ok ? "kabul edildi" : r);
  };
  await rej("SVG (PNG beyanıyla)", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'), "logo", "png", "unsupported_type");
  await rej("HTML .png kılığında", Buffer.from("<html><script>fetch('/x')</script></html>"), "logo", "png", "unsupported_type");
  await rej("GIF", await rgb(32, 32).gif().toBuffer(), "logo", "png", "unsupported_type");
  await rej("HEIC içerik", Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]), "photo", "jpeg", "heic_unsupported");
  await rej("içerik JPEG, beyan PNG", jpgExif, "photo", "png", "type_mismatch");
  await rej("polyglot: JPEG + ZIP", Buffer.concat([smallJpg, Buffer.from("PK\u0003\u0004"), Buffer.alloc(200, 1)]), "photo", "jpeg", "trailing_data");
  await rej("polyglot: PNG + HTML betik", Buffer.concat([png, Buffer.from("<html><script>alert(1)</script></html>")]), "logo", "png", "trailing_data");
  await rej("WebP + ek veri (RIFF boyutu uyuşmaz)", Buffer.concat([webp, Buffer.from("EXTRA-DATA")]), "photo", "webp", "trailing_data");
  await rej("hareketli fotoğraf kabı içinde betik", Buffer.concat([smallJpg, Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.from("<script>alert(1)</script>")]), "photo", "jpeg", "trailing_data");
  await rej("kesik JPEG", smallJpg.subarray(0, Math.floor(smallJpg.length / 2)), "photo", "jpeg", "corrupt");
  await rej("kesik PNG", png.subarray(0, png.length - 20), "logo", "png", "corrupt");
  const garbled = Buffer.from(smallJpg);
  for (let i = 200; i < garbled.length - 10; i += 7) garbled[i] = 0xff;
  const g = await processImage(garbled, "photo", "jpeg");
  ok(!g.ok && (g.code === "corrupt" || g.code === "trailing_data"), "bozulmuş JPEG içeriği reddedilir", g.ok ? "kabul" : g.code);
  await rej("piksel bombası 20000×20000 (başlıktan, çözümlemeden önce)", pixelBombPng(20000, 20000), "photo", "png", "too_large_pixels");
  await rej(`piksel bombası 9000×5000 (> ${ASSET_MAX_PIXELS / 1e6} MP)`, pixelBombPng(9000, 5000), "photo", "png", "too_large_pixels");
  await rej("en uzun kenar 13000 px", pixelBombPng(13000, 100), "photo", "png", "too_large_pixels");
  await rej("8×8 çok küçük", await rgb(8, 8).png().toBuffer(), "logo", "png", "too_small");
  let animated: Buffer | null = null;
  try {
    animated = await sharp([await rgb(64, 64).png().toBuffer(), await rgba(64, 64).png().toBuffer()], { join: { animated: true } }).webp().toBuffer();
  } catch { animated = null; }
  if (animated) await rej("animasyonlu WebP", animated, "photo", "webp", "animated");
  else ok(false, "animasyonlu WebP fikstürü üretilemedi (sharp join.animated)");

  // Hareketli fotoğraf (telefon): JPEG + MP4 kabı → kabul, MP4 atılır.
  const motion = Buffer.concat([smallJpg, Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(400, 7)]);
  const mp = await processImage(motion, "photo", "jpeg");
  ok(mp.ok && !mp.desktop.data.includes(Buffer.from("ftypmp42")), "hareketli fotoğraf JPEG'i kabul edilir, video kabı çıktıya taşınmaz", mp.ok ? "" : mp);

  // ── Sınırlar, yol ve purge uyumu ──
  ok(ASSET_MAX_BYTES.logo === 2 * 1024 * 1024 && ASSET_MAX_BYTES.photo === 10 * 1024 * 1024, "sınırlar: logo 2 MB, fotoğraf 10 MB");
  ok(UPLOAD_CHUNK_BYTES <= 3 * 1024 * 1024, "parça ≤ 3 MB (Vercel 4,5 MB gövde sınırı altında)");
  ok(cleanFileName("../../etc/passwd") === "passwd" && cleanFileName("C:\\x\\y.png") === "y.png" && cleanFileName("a\u202Egnp.exe") === "agnp.exe" && cleanFileName("") === null, "dosya adı: dizin ve yön işaretleri atılır (yol olarak kullanılmaz)");
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const U = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ap = assetPaths({ tenantId: T, userId: U }, A);
  ok(ap.desktop === `${T}/${U}/${A}/desktop.webp` && ap.mobile === `${T}/${U}/${A}/mobile.webp`, "Storage yolu sunucuda tenant/kullanıcı/asset önekiyle üretilir");
  const tg = tenantStorageTargets(T);
  ok(tg.some((x) => x.bucket === "expert-workspace" && x.prefix === `${T}/` && ap.desktop.startsWith(x.prefix)), "hesap kalıcı silme (purge) expert-workspace tenant önekini kapsar");

  console.log(`\nworkspace image test: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

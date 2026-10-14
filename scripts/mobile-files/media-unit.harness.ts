/**
 * MOBİL DOSYA İŞLEVLERİ — saf birim harness (DOM yok, ağ yok, production yok).
 *
 * Kapsam:
 *   A. Gerçek biçim tespiti (baş baytlar): JPEG / PNG / APNG / WebP (statik + animasyonlu) / GIF / HEIC / bilinmeyen
 *   B. Optimizasyon kararı: animasyon + PNG + bilinmeyen biçim ORİJİNAL kalır; sınır aşımı/fotoğraf yeniden kodlanır
 *   C. Kalite merdiveni: kalite ve çözünürlük tabanının altına inmez; oran korunur
 *   D. Kamera görünürlüğü: masaüstü gizli · mobil tarayıcı görünür · Android uygulaması yalnız
 *      YasamCamera/1 işaretiyle görünür
 *   E. Ürün & Stok: Node'da optimizasyon devre dışı (mevcut doğrulama aynen) + dataUrlsByteSize
 *
 * Çalıştır: npx tsx scripts/mobile-files/media-unit.harness.ts
 */
import {
  fitWithin,
  planImageOptimization,
  qualityLadder,
  sniffImageBytes,
  type ImageSniff,
} from "../../lib/media/imageFormat";
import { CAMERA_CAPABILITY_UA_TOKEN, cameraCaptureSupported } from "../../lib/media/cameraCapture";
import { dataUrlsByteSize, filesToValidatedDataUrls } from "../../lib/urun-stok/photoValidation";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); }
}
const section = (t: string) => console.log(`\n[${t}]`);

const bytes = (...parts: Array<number[] | string>) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  return new Uint8Array(out);
};
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pngChunk = (type: string, len: number) => [...u32(len), ...Array.from(type).map((c) => c.charCodeAt(0)), ...new Array(len).fill(0), 0, 0, 0, 0];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// ── A ────────────────────────────────────────────────────────────────────────
section("A. Gerçek biçim tespiti");
const jpeg = sniffImageBytes(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"));
ok(jpeg.format === "jpeg" && !jpeg.animated, "JPEG → jpeg, tek kare", jpeg);
const png = sniffImageBytes(new Uint8Array([...PNG_SIG, ...pngChunk("IHDR", 13), ...pngChunk("IDAT", 4)]));
ok(png.format === "png" && !png.animated && png.certain, "PNG (IHDR→IDAT) → statik", png);
const apng = sniffImageBytes(new Uint8Array([...PNG_SIG, ...pngChunk("IHDR", 13), ...pngChunk("acTL", 8), ...pngChunk("IDAT", 4)]));
ok(apng.format === "png" && apng.animated && apng.certain, "APNG (acTL, IDAT'tan önce) → animasyonlu", apng);
const pngBigIcc = sniffImageBytes(new Uint8Array([...PNG_SIG, ...pngChunk("IHDR", 13), ...pngChunk("iCCP", 3000), ...pngChunk("IDAT", 4)]));
ok(pngBigIcc.format === "png" && !pngBigIcc.animated, "PNG büyük iCCP sonrası IDAT → statik", pngBigIcc);
const pngTrunc = sniffImageBytes(new Uint8Array([...PNG_SIG, ...u32(900000), ..."iCCP".split("").map((c) => c.charCodeAt(0))]));
ok(pngTrunc.format === "png" && pngTrunc.animated && !pngTrunc.certain, "PNG IDAT'a ulaşılamadı → güvenli taraf (animasyon say)", pngTrunc);
const webpLossy = sniffImageBytes(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 "));
ok(webpLossy.format === "webp" && !webpLossy.animated, "WebP VP8 → statik", webpLossy);
const webpAnim = sniffImageBytes(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [0, 0, 0, 0, 0x02, 0, 0, 0]));
ok(webpAnim.format === "webp" && webpAnim.animated, "WebP VP8X + ANIM biti → animasyonlu", webpAnim);
const webpX = sniffImageBytes(bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [0, 0, 0, 0, 0x10, 0, 0, 0]));
ok(webpX.format === "webp" && !webpX.animated, "WebP VP8X (yalnız alfa) → statik", webpX);
const gif = sniffImageBytes(bytes("GIF89a", [1, 0, 1, 0]));
ok(gif.format === "gif" && gif.animated, "GIF → asla yeniden kodlanmaz (animasyon olabilir)", gif);
const heic = sniffImageBytes(bytes([0, 0, 0, 24], "ftyp", "heic", [0, 0, 0, 0]));
ok(heic.format === "heic" && !heic.animated, "HEIC ftyp heic → heic", heic);
const heicSeq = sniffImageBytes(bytes([0, 0, 0, 24], "ftyp", "msf1", [0, 0, 0, 0]));
ok(heicSeq.format === "heic" && heicSeq.animated, "HEIF dizisi (msf1) → animasyonlu", heicSeq);
const pdf = sniffImageBytes(bytes("%PDF-1.7"));
ok(pdf.format === "unknown", "PDF baytları → bilinmeyen (görsel işlemi yok)", pdf);

// ── B ────────────────────────────────────────────────────────────────────────
section("B. Optimizasyon kararı");
const plan = (sniff: ImageSniff, b: number, profile: "photo" | "preserve" = "photo", maxBytes?: number) =>
  planImageOptimization({ sniff, bytes: b, profile, maxBytes, skipBelowBytes: 400 * 1024 });
ok(plan(gif, 9e6, "photo", 1e6).action === "keep", "GIF sınır aşsa bile ORİJİNAL (tek kareye düşmez)");
ok(plan(apng, 9e6, "photo", 1e6).action === "keep", "APNG ORİJİNAL");
ok(plan(webpAnim, 9e6, "photo", 1e6).action === "keep", "animasyonlu WebP ORİJİNAL");
ok(plan(pdf, 9e6).action === "keep", "bilinmeyen biçim ORİJİNAL (zorla dönüştürme yok)");
ok(plan(png, 2e6, "photo", 10e6).action === "keep", "PNG (yazı/çizgi/şeffaflık olası) sınır içinde ORİJİNAL");
ok(plan(png, 12e6, "photo", 10e6).action === "reencode", "PNG yalnız sınır aşılırsa yeniden kodlanır");
ok(plan(jpeg, 200 * 1024).action === "keep", "küçük JPEG (≤400 KB) ORİJİNAL");
ok(plan(jpeg, 3e6).action === "reencode", "büyük telefon fotoğrafı → yüksek kaliteli yeniden kodlama");
ok(plan(jpeg, 3e6, "preserve", 10e6).action === "keep", "preserve profili sınır içinde ORİJİNAL");
ok(plan(heic, 2e6).action === "reencode", "HEIC → dönüştürme denenir (çözülemezse çağıran açık hata verir)");

// ── C ────────────────────────────────────────────────────────────────────────
section("C. Kalite merdiveni + oran");
const ladder = qualityLadder({ quality: 0.9, minQuality: 0.8, maxDimension: 2560, minDimension: 1600 });
ok(ladder[0].quality === 0.9 && ladder[0].maxDimension === 2560, "ilk adım: q0.90 @ 2560", ladder[0]);
ok(ladder.every((s) => s.quality >= 0.8 - 1e-9), "kalite asla 0.80 altına inmez");
ok(ladder.every((s) => s.maxDimension >= 1600), "çözünürlük asla 1600 px altına inmez");
ok(ladder[ladder.length - 1].maxDimension === 1600, "son adım tam taban (1600)");
const f1 = fitWithin(4000, 3000, 2560);
ok(f1.width === 2560 && f1.height === 1920, "4000×3000 → 2560×1920 (oran korunur)", f1);
const f2 = fitWithin(1200, 800, 2560);
ok(f2.width === 1200 && f2.height === 800, "küçük görsel büyütülmez", f2);
const f3 = fitWithin(3000, 4000, 2048);
ok(f3.width === 1536 && f3.height === 2048, "dikey 3000×4000 → 1536×2048", f3);

// ── D ────────────────────────────────────────────────────────────────────────
section("D. Kamera görünürlüğü");
const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  app: "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130 Mobile Safari/537.36",
  ipadDesktopUa: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};
ok(!cameraCaptureSupported({ userAgent: UA.desktop, coarsePointer: false }), "masaüstü → Fotoğraf Çek GİZLİ (yalnız dosya seçici açılırdı)");
ok(cameraCaptureSupported({ userAgent: UA.androidChrome, coarsePointer: true }), "Android Chrome → GÖRÜNÜR");
ok(cameraCaptureSupported({ userAgent: UA.iphone, coarsePointer: true }), "iPhone Safari → GÖRÜNÜR");
ok(!cameraCaptureSupported({ userAgent: UA.app, coarsePointer: true }), "Android uygulaması (1.9.x, native kamera yok) → GİZLİ");
ok(cameraCaptureSupported({ userAgent: `${UA.app} YasamSistemiAndroid/1.10.0 ${CAMERA_CAPABILITY_UA_TOKEN}`, coarsePointer: true }), "Android uygulaması + YasamCamera/1 → GÖRÜNÜR (native hazır olunca otomatik)");
ok(!cameraCaptureSupported({ userAgent: `${UA.app} YasamSistemiAndroid/1.10.0`, coarsePointer: true }), "uygulama soneki tek başına yetmez (kamera işareti şart)");
ok(cameraCaptureSupported({ userAgent: UA.ipadDesktopUa, coarsePointer: true }), "iPadOS (masaüstü UA + dokunmatik) → GÖRÜNÜR");
ok(!cameraCaptureSupported({ userAgent: UA.ipadDesktopUa, coarsePointer: false }), "Mac (dokunmatik yok) → GİZLİ");

// ── E ────────────────────────────────────────────────────────────────────────
section("E. Ürün & Stok doğrulaması (Node: optimizasyon devre dışı)");
async function sectionE() {
  const jpg = new Uint8Array(2000); jpg[0] = 0xff; jpg[1] = 0xd8; jpg[2] = 0xff;
  const r = await filesToValidatedDataUrls([new File([jpg], "a.jpg", { type: "image/jpeg" })]);
  ok(r.error === null && r.urls.length === 1 && r.urls[0].startsWith("data:image/jpeg;base64,"), "geçerli JPEG kabul (mevcut davranış)", r.error);
  const big = new Uint8Array(1.5 * 1024 * 1024); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  const r2 = await filesToValidatedDataUrls([new File([big], "b.jpg", { type: "image/jpeg" })]);
  ok(r2.urls.length === 0 && /1 MB sınırına sığdırılamadı/.test(r2.error ?? ""), "sınır aşan dosya: AÇIK hata (sessiz değil)", r2.error);
  const r3 = await filesToValidatedDataUrls([new File([jpg], "c.jpg", { type: "image/jpeg" })], { existingCount: 1, existingBytes: 3 * 1024 * 1024 - 1000 });
  ok(r3.urls.length === 0 && /Toplam fotoğraf boyutu/.test(r3.error ?? ""), "ekleme senaryosu: mevcut baytlar toplam sınıra sayılır", r3.error);
  const r4 = await filesToValidatedDataUrls([new File([jpg], "d.jpg", { type: "image/jpeg" })], { existingCount: 5 });
  ok(r4.urls.length === 0 && /En fazla 5/.test(r4.error ?? ""), "ekleme senaryosu: adet sınırı korunur", r4.error);
  ok(dataUrlsByteSize(["data:image/jpeg;base64,AAAA", "data:image/png;base64,AAAAAAAA"]) === 9, "dataUrlsByteSize base64 → ham bayt");
}

void (async () => {
  await sectionE();
  console.log(`\nmedia-unit harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAIL:", fails); process.exit(1); }
})();

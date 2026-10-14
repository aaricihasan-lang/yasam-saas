/**
 * GÖRSEL OPTİMİZASYON — GERÇEK TARAYICI (Chromium/Playwright) harness. Ağ yok, production yok.
 *
 * lib/media/imageOptimize.ts esbuild ile paketlenip boş bir sayfada çalıştırılır; girdiler sharp ile
 * üretilir, çıktılar sharp ile ölçülür:
 *   1. Büyük telefon fotoğrafı (4000×3000, EXIF yön=6): boyut küçülür, YÖN doğru (dikey + işaret
 *      doğru köşede), oran korunur, kalite PSNR ≥ 32 dB (yazılı bölge dahil)
 *   2. Ürün & Stok hedefi (≤1 MB, ≤2048 px): sınıra sığar, uzun kenar ≥ 1280, PSNR ≥ 30 dB
 *   3. Yazı/çizgi içeren PNG (sınır içinde): bayt bayt ORİJİNAL
 *   4. Şeffaf PNG (sınırı aşan): yeniden kodlanır, şeffaflık KORUNUR
 *   5. Animasyonlu GIF: bayt bayt ORİJİNAL (sınır aşsa bile; tek kareye düşmez) + tooLarge bildirimi
 *   6. Animasyonlu WebP: ORİJİNAL, kare sayısı korunur
 *   7. HEIC (bu tarayıcıda çözülemez): orijinal + "heic-undecodable" (çağıran açık hata gösterir)
 *   8. Bozuk JPEG: orijinal (decode-failed), hata atılmaz
 *   9. PDF: dokunulmaz (not-image)
 *  10. Boş MIME'lı JPEG (Android seçicisi): tür gerçek baytlardan doldurulur
 *  11. Küçük JPEG: bayt bayt ORİJİNAL
 *  12. Sığmayan dosya (çok küçük hedef): tooLarge=true (sessiz yükleme yok)
 *
 * Çalıştır: npx tsx scripts/mobile-files/image-optimize.browser.harness.ts
 */
import path from "node:path";
import { build } from "esbuild";
import sharp from "sharp";
import { chromium } from "playwright";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); }
}

const ROOT = process.cwd();
type Out = { optimized: boolean; reason: string; tooLarge: boolean; type: string; name: string; size: number; b64: string; originalBytes: number };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function photoFixture(w: number, h: number): Promise<Buffer> {
  // Fotoğraf benzeri: yumuşak gradyanlar + şekiller + yazı + 3 px çizgiler + hafif doku.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b8f71"/><stop offset="0.5" stop-color="#d9c5a0"/><stop offset="1" stop-color="#3b5b7a"/></linearGradient>
    <radialGradient id="r"><stop offset="0" stop-color="#ffffff" stop-opacity="0.8"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 397) % w}" cy="${(i * 211) % h}" r="${60 + (i * 37) % 260}" fill="url(#r)"/>`).join("")}
    <rect x="0" y="0" width="400" height="300" fill="#ff0000"/>
    ${Array.from({ length: 30 }, (_, i) => `<rect x="${800 + i * 90}" y="400" width="3" height="900" fill="#111"/>`).join("")}
    <text x="800" y="1800" font-family="Arial" font-size="160" font-weight="bold" fill="#101010">YAŞAM SİSTEMİ 2026</text>
    <text x="800" y="2000" font-family="Arial" font-size="72" fill="#101010">Ametist · Kuvars · Sitrin — 12,5 g</text>
  </svg>`;
  const base = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  const r = rng(7);
  const data = base.data;
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + Math.round((r() - 0.5) * 18)));
  return sharp(data, { raw: base.info }).jpeg({ quality: 93 }).toBuffer();
}

/** Referans (EXIF uygulanmış, hedef boyuta indirilmiş) ile çıktının PSNR'ı (dB). */
async function psnr(reference: Buffer, output: Buffer, region?: { left: number; top: number; width: number; height: number }): Promise<number> {
  const meta = await sharp(output).metadata();
  const w = meta.width!, h = meta.height!;
  let ref = sharp(reference).rotate().resize(w, h, { fit: "fill" }).removeAlpha();
  let out = sharp(output).removeAlpha();
  if (region) { ref = ref.extract(region); out = out.extract(region); }
  const a = await ref.raw().toBuffer();
  const b = await out.raw().toBuffer();
  let se = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; se += d * d; }
  const mse = se / a.length;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

function gif2Frames(): Buffer {
  // 1×1, 2 kare (NETSCAPE döngü) animasyonlu GIF.
  // Kareler FARKLI renk (aynı kareler kodlayıcıda tek kareye birleşebilir): 0 = kırmızı, 1 = mavi.
  const frame = (lzw: number) => [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, lzw, 0x01, 0x00];
  return Buffer.from([
    ...Buffer.from("GIF89a"), 1, 0, 1, 0, 0x80, 0, 0, 255, 0, 0, 0, 0, 255,
    0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00,
    ...frame(0x44), ...frame(0x4c), 0x3b,
  ]);
}

async function main() {
  const bundle = await build({
    entryPoints: [path.join(ROOT, "lib/media/imageOptimize.ts")],
    bundle: true, write: false, format: "iife", globalName: "__opt", platform: "browser",
    alias: { "@": ROOT }, target: "es2020", logLevel: "silent",
  });
  const script = bundle.outputFiles[0].text;

  const photo = await photoFixture(4000, 3000);
  const photoExif6 = await sharp(photo).withMetadata({ orientation: 6 }).jpeg({ quality: 93 }).toBuffer();
  const textPng = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="100%" height="100%" fill="#fff"/>${Array.from({ length: 50 }, (_, i) => `<line x1="0" y1="${i * 20}" x2="1600" y2="${i * 20}" stroke="#000" stroke-width="1"/>`).join("")}<text x="40" y="500" font-size="28" font-family="Arial">Tablo · Şema · ince çizgi 1px — okunabilir kalmalı</text></svg>`)).png().toBuffer();
  const alphaRaw = Buffer.alloc(1800 * 1800 * 4);
  { const r = rng(3); for (let i = 0; i < 1800 * 1800; i++) { const x = i % 1800, y = Math.floor(i / 1800); const inside = x > 200 && y > 200; alphaRaw[i * 4] = Math.floor(r() * 255); alphaRaw[i * 4 + 1] = Math.floor(r() * 255); alphaRaw[i * 4 + 2] = Math.floor(r() * 255); alphaRaw[i * 4 + 3] = inside ? 255 : 0; } }
  const alphaPng = await sharp(alphaRaw, { raw: { width: 1800, height: 1800, channels: 4 } }).png().toBuffer();
  const gif = gif2Frames();
  const animWebp = await sharp(gif, { animated: true }).webp().toBuffer();
  const fakeHeic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(4), Buffer.alloc(600 * 1024, 7)]);
  const corruptJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(700 * 1024, 0x55)]);
  const pdf = Buffer.from("%PDF-1.4\n%zz\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const smallJpeg = await sharp(await photoFixture(900, 600)).jpeg({ quality: 70 }).toBuffer();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: script });

  async function run(buf: Buffer, name: string, type: string, opts: Record<string, unknown>): Promise<Out> {
    return page.evaluate(async ({ b64, name, type, opts }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bin], name, { type });
      // @ts-expect-error — esbuild global
      const r = await window.__opt.optimizeImageFile(file, opts);
      const ab = new Uint8Array(await r.file.arrayBuffer());
      let s = ""; for (let i = 0; i < ab.length; i += 0x8000) s += String.fromCharCode(...ab.subarray(i, i + 0x8000));
      return { optimized: r.optimized, reason: r.reason, tooLarge: r.tooLarge, type: r.file.type, name: r.file.name, size: r.file.size, b64: btoa(s), originalBytes: r.originalBytes };
    }, { b64: buf.toString("base64"), name, type, opts });
  }
  const buf = (o: Out) => Buffer.from(o.b64, "base64");

  console.log(`\n[1] Büyük telefon fotoğrafı + EXIF yön=6 (${(photoExif6.length / 1048576).toFixed(2)} MB, 4000×3000 saklı)`);
  {
    const o = await run(photoExif6, "IMG_0001.JPG", "image/jpeg", { profile: "photo", maxBytes: 10 * 1024 * 1024 });
    const m = await sharp(buf(o)).metadata();
    ok(o.optimized && o.type === "image/webp" && o.name === "IMG_0001.webp", "yüksek kaliteli WebP'ye dönüştü", { reason: o.reason, type: o.type, name: o.name });
    ok(o.size < photoExif6.length * 0.6, `boyut belirgin azaldı (${(photoExif6.length / 1048576).toFixed(2)} → ${(o.size / 1048576).toFixed(2)} MB)`);
    ok(m.width === 1920 && m.height === 2560, `YÖN doğru: dikey 1920×2560 (EXIF uygulandı, oran korundu) → ${m.width}×${m.height}`);
    ok(!m.orientation || m.orientation === 1, "çıktı EXIF yönüne ihtiyaç duymaz", m.orientation);
    const px = await sharp(buf(o)).extract({ left: m.width! - 40, top: 10, width: 20, height: 20 }).raw().toBuffer();
    ok(px[0] > 200 && px[1] < 60 && px[2] < 60, "kırmızı işaret beklenen köşede (sağ üst) → döndürme yönü doğru", [px[0], px[1], px[2]]);
    const p = await psnr(photoExif6, buf(o));
    ok(p >= 32, `genel kalite PSNR ${p.toFixed(1)} dB ≥ 32`);
    // Yazı bölgesi (EXIF sonrası koordinatlar): saklı (800..3400, 1600..2050) → dikeyde x≈ (3000-2050..3000-1600)·0.64
    const pt = await psnr(photoExif6, buf(o), { left: Math.round((3000 - 2060) * 0.64), top: Math.round(780 * 0.64), width: Math.round(470 * 0.64), height: Math.round(2600 * 0.64) });
    ok(pt >= 30, `yazı/çizgi bölgesi PSNR ${pt.toFixed(1)} dB ≥ 30 (okunabilirlik korunur)`);
  }

  console.log("\n[2] Ürün & Stok hedefi (≤1 MB, ≤2048 px)");
  {
    const o = await run(photo, "urun.jpg", "image/jpeg", { profile: "photo", maxBytes: 1024 * 1024, maxDimension: 2048, minDimension: 1280 });
    const m = await sharp(buf(o)).metadata();
    ok(!o.tooLarge && o.size <= 1024 * 1024, `1 MB sınırına sığdı (${(o.size / 1024).toFixed(0)} KB)`);
    ok(Math.max(m.width!, m.height!) >= 1280 && Math.max(m.width!, m.height!) <= 2048, `uzun kenar ${Math.max(m.width!, m.height!)} px ∈ [1280, 2048]`);
    ok(Math.abs(m.width! / m.height! - 4 / 3) < 0.01, "oran korundu (4:3)");
    const p = await psnr(photo, buf(o));
    ok(p >= 30, `kalite PSNR ${p.toFixed(1)} dB ≥ 30`);
  }

  console.log("\n[3] Yazı/çizgi PNG (sınır içinde)");
  {
    const o = await run(textPng, "tablo.png", "image/png", { profile: "photo", maxBytes: 10 * 1024 * 1024 });
    ok(!o.optimized && o.reason === "png-preserve" && buf(o).equals(textPng), "bayt bayt ORİJİNAL (ince çizgi/yazı kaybı yok)", o.reason);
  }

  console.log("\n[4] Şeffaf PNG (sınırı aşan)");
  {
    const o = await run(alphaPng, "seffaf.png", "image/png", { profile: "photo", maxBytes: 2 * 1024 * 1024 });
    const m = await sharp(buf(o)).metadata();
    ok(o.optimized && o.reason === "over-limit" && o.type === "image/webp", "sınır aşınca yeniden kodlandı (WebP)", { reason: o.reason, size: o.size });
    ok(m.hasAlpha === true, "çıktıda alfa kanalı VAR");
    const corner = await sharp(buf(o)).ensureAlpha().extract({ left: 5, top: 5, width: 10, height: 10 }).raw().toBuffer();
    ok(corner[3] < 10, "şeffaf köşe şeffaf kaldı", corner[3]);
  }

  console.log("\n[5] Animasyonlu GIF");
  {
    const o = await run(gif, "anim.gif", "image/gif", { profile: "photo", maxBytes: 10 });
    ok(!o.optimized && o.reason === "animated" && buf(o).equals(gif), "bayt bayt ORİJİNAL (tek kareye düşmedi)", o.reason);
    ok(o.tooLarge === true, "sınırı aşıyorsa tooLarge bildirilir (sessiz yükleme yok)");
  }

  console.log("\n[6] Animasyonlu WebP");
  {
    const o = await run(animWebp, "anim.webp", "image/webp", { profile: "photo", maxBytes: 10 });
    const m = await sharp(buf(o), { animated: true }).metadata();
    ok(!o.optimized && o.reason === "animated" && buf(o).equals(animWebp), "ORİJİNAL", o.reason);
    ok((m.pages ?? 1) === 2, `kare sayısı korundu (${m.pages})`);
  }

  console.log("\n[7] HEIC (Chromium çözemez)");
  {
    const o = await run(fakeHeic, "IMG_1234.HEIC", "image/heic", { profile: "photo", maxBytes: 10 * 1024 * 1024 });
    ok(!o.optimized && o.reason === "heic-undecodable" && buf(o).equals(fakeHeic), "orijinal + heic-undecodable (çağıran açık hata gösterir)", o.reason);
  }

  console.log("\n[8] Bozuk JPEG");
  {
    const o = await run(corruptJpeg, "bozuk.jpg", "image/jpeg", { profile: "photo", maxBytes: 10 * 1024 * 1024 });
    ok(!o.optimized && o.reason === "decode-failed" && buf(o).equals(corruptJpeg), "orijinal korunur, hata atılmaz", o.reason);
  }

  console.log("\n[9] PDF");
  {
    const o = await run(pdf, "belge.pdf", "application/pdf", { profile: "photo", maxBytes: 10 });
    ok(!o.optimized && o.reason === "not-image" && buf(o).equals(pdf) && o.type === "application/pdf", "belgeye dokunulmaz", o.reason);
  }

  console.log("\n[10] Boş MIME'lı JPEG (Android seçicisi)");
  {
    const o = await run(smallJpeg, "foto.jpg", "", { profile: "photo", maxBytes: 10 * 1024 * 1024 });
    ok(o.type === "image/jpeg", "tür gerçek baytlardan dolduruldu (image/jpeg)", o.type);
    ok(buf(o).equals(smallJpeg), "içerik değişmedi");
  }

  console.log("\n[11] Küçük JPEG");
  {
    const o = await run(smallJpeg, "kucuk.jpg", "image/jpeg", { profile: "photo", maxBytes: 10 * 1024 * 1024 });
    ok(!o.optimized && buf(o).equals(smallJpeg), `bayt bayt ORİJİNAL (${(smallJpeg.length / 1024).toFixed(0)} KB, gereksiz kayıp yok)`, o.reason);
  }

  console.log("\n[12] Sığmayan dosya");
  {
    const o = await run(photo, "dev.jpg", "image/jpeg", { profile: "photo", maxBytes: 20 * 1024, maxDimension: 2048, minDimension: 1280 });
    ok(o.tooLarge === true && !o.optimized, "kalite tabanında sığmıyor → tooLarge (kalite aşırı düşürülmez)", { reason: o.reason });
  }

  await browser.close();
  console.log(`\nimage-optimize browser harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAIL:", fails); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });

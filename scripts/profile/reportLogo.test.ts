/**
 * UZMAN PROFİLİ (F2) — rapor logosu dönüşüm testleri (WebP varyantı → rapor PNG'si). DB / ağ YOK; fikstürler sharp ile üretilir.
 * Çalıştır: npx tsx scripts/profile/reportLogo.test.ts
 */
import crypto from "node:crypto";
import sharp, { type Sharp } from "sharp";
import {
  REPORT_LOGO_INPUT_MAX_BYTES, REPORT_LOGO_MAX_BYTES, REPORT_LOGO_MAX_EDGE, pngSize, webpToReportPng,
} from "../../lib/profile/reportLogoPng";
import { parseLogoSelection } from "../../lib/profile/logoSchema";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

/** Depodaki gibi: kaynak → (Kişisel Dijital Ofis logo kodlaması) WebP. */
const toWebp = (img: Sharp) => img.webp({ quality: 90, alphaQuality: 100, effort: 4 }).toBuffer();
const solid = (w: number, h: number, alpha = 1) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 20, g: 110, b: 90, alpha } } });

/** Ortada opak daire, köşeler tam şeffaf (gerçek "şeffaf PNG logo"). */
async function transparentLogoPng(w: number, h: number): Promise<Buffer> {
  const r = Math.floor(Math.min(w, h) / 2.4);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#127a5a"/></svg>`);
  return sharp(svg).png().toBuffer();
}

async function main() {
  section("Oran + boyut (büyütme yok)");
  for (const [w, h, ew, eh, label] of [
    [1200, 300, 600, 150, "yatay 4:1"],
    [300, 1200, 150, 600, "dikey 1:4"],
    [1200, 1200, 600, 600, "kare"],
    [1200, 800, 600, 400, "yatay 3:2"],
    [240, 90, 240, 90, "küçük logo (büyütülmez)"],
    [600, 600, 600, 600, "tam sınırda"],
  ] as [number, number, number, number, string][]) {
    const r = await webpToReportPng(await toWebp(solid(w, h)));
    ok(r.ok && r.logo.width === ew && r.logo.height === eh, `${label}: ${w}×${h} → ${ew}×${eh}`, r.ok ? { w: r.logo.width, h: r.logo.height } : r);
    if (r.ok) {
      const meta = await sharp(r.logo.data).metadata();
      ok(meta.format === "png" && meta.width === r.logo.width && meta.height === r.logo.height, `${label}: çıktı gerçek PNG, IHDR boyutu = bildirilen`);
      const sz = pngSize(r.logo.data);
      ok(!!sz && sz.width === ew && sz.height === eh, `${label}: pngSize (F3 readPngSize ile aynı okuma)`);
    }
  }

  section("Şeffaflık (şeffaf PNG kaynaklı WebP)");
  const tWebp = await toWebp(sharp(await transparentLogoPng(1000, 400)));
  const t = await webpToReportPng(tWebp);
  ok(t.ok, "şeffaf logo dönüştürüldü", t);
  if (t.ok) {
    const meta = await sharp(t.logo.data).metadata();
    ok(meta.hasAlpha === true, "çıktıda alfa kanalı korunur", meta);
    const { data, info } = await sharp(t.logo.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    ok(alphaAt(0, 0) === 0 && alphaAt(info.width - 1, info.height - 1) === 0, "köşe pikselleri tam şeffaf", { a0: alphaAt(0, 0) });
    ok(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2)) === 255, "merkez opak");
    ok(t.logo.width === 600 && t.logo.height === 240, "şeffaf 1000×400 → 600×240", t.logo);
  }
  const half = await webpToReportPng(await toWebp(solid(800, 200, 0.5)));
  ok(half.ok && (await sharp(half.logo.data).metadata()).hasAlpha === true, "yarı saydam zemin korunur");

  section("Boyut tavanı (≤ 1 MB) — gürültülü logo");
  const noise = Buffer.alloc(1200 * 1200 * 4);
  crypto.randomFillSync(noise);
  const noisyWebp = await sharp(noise, { raw: { width: 1200, height: 1200, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  const n = await webpToReportPng(noisyWebp);
  ok(n.ok && n.logo.data.length <= REPORT_LOGO_MAX_BYTES, "rastgele gürültü (en kötü durum) ≤ 1 MB'a sığdırılır", n.ok ? { bytes: n.logo.data.length, palette: n.palette, w: n.logo.width } : n);
  ok(n.ok && n.palette === true, "tam renkli PNG sığmayınca paletli PNG'ye düşer");
  const simple = await webpToReportPng(await toWebp(solid(1200, 400)));
  ok(simple.ok && simple.palette === false && simple.logo.data.length < 50_000, "sade logo: tam renkli PNG, küçük dosya", simple.ok ? simple.logo.data.length : simple);

  section("Metaveri taşınmaz");
  const exifWebp = await sharp({ create: { width: 900, height: 300, channels: 3, background: "#224466" } })
    .withExif({ IFD0: { ImageDescription: "ZZ-GIZLI-KONUM", Artist: "Ayşe Yılmaz" } })
    .webp({ quality: 90 }).keepExif().toBuffer();
  ok((await sharp(exifWebp).metadata()).exif !== undefined, "fikstür: kaynak WebP gerçekten EXIF içeriyor");
  const ex = await webpToReportPng(exifWebp);
  ok(ex.ok && (await sharp(ex.logo.data).metadata()).exif === undefined && !ex.logo.data.includes(Buffer.from("ZZ-GIZLI")), "çıktıda EXIF / metin yok", ex.ok ? undefined : ex);

  section("Reddedilen girdiler (hepsi { ok:false }, istisna yok)");
  const reason = async (b: Uint8Array | null | undefined) => { const r = await webpToReportPng(b); return r.ok ? "OK" : r.reason; };
  ok((await reason(Buffer.alloc(0))) === "empty", "boş buffer → empty");
  ok((await reason(null)) === "empty" && (await reason(undefined)) === "empty", "null / undefined → empty");
  ok((await reason(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'))) === "not_webp", "SVG metin baytları → not_webp");
  ok((await reason(Buffer.from("Bu bir metin dosyasıdır, görsel değil. Ayşe Yılmaz"))) === "not_webp", "düz metin → not_webp");
  ok((await reason(await sharp(await transparentLogoPng(200, 100)).png().toBuffer())) === "not_webp", "PNG girdi (depoda olmaz) → not_webp");
  ok((await reason(await solid(200, 100).jpeg().toBuffer())) === "not_webp", "JPEG girdi → not_webp");
  const good = await toWebp(solid(400, 200));
  const truncated = Buffer.from(good.subarray(0, Math.floor(good.length / 2)));
  ok((await reason(truncated)) === "not_webp", "kesik WebP (RIFF uzunluğu tutmuyor) → not_webp");
  const garbage = Buffer.from(good);
  crypto.randomFillSync(garbage, 20); // kap başlığı geçerli, VP8 verisi çöp
  ok(["corrupt", "encode_failed"].includes(await reason(garbage)), "geçerli RIFF kabı + bozuk görüntü verisi → corrupt", await reason(garbage));
  const fakeRiff = Buffer.concat([Buffer.from("RIFF"), Buffer.from([12, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(4)]);
  ok((await reason(fakeRiff)) === "corrupt", "boş VP8 parçası → corrupt");
  ok((await reason(Buffer.alloc(REPORT_LOGO_INPUT_MAX_BYTES + 1))) === "too_large_bytes", "4 MB üstü girdi → too_large_bytes");

  section("Piksel bombası / beklenmeyen boyut");
  const big = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "#ffffff" } }).webp({ quality: 50 }).toBuffer();
  ok((await reason(big)) === "too_large_pixels", "5000×5000 (25 MP) → too_large_pixels (çözümlenmeden, başlıktan)");
  const tall = await sharp({ create: { width: 20, height: 4200, channels: 3, background: "#ffffff" } }).webp().toBuffer();
  ok((await reason(tall)) === "too_large_pixels", "kenar 4200 px → too_large_pixels");

  section("Hareketli WebP");
  const f1 = await solid(60, 60).png().toBuffer();
  const f2 = await sharp({ create: { width: 60, height: 60, channels: 4, background: "#0000ff" } }).png().toBuffer();
  const anim = await sharp([f1, f2], { join: { animated: true } }).webp().toBuffer();
  ok((await sharp(anim).metadata()).pages === 2, "fikstür: 2 kareli WebP");
  ok((await reason(anim)) === "animated", "hareketli WebP → animated");

  section("Süre");
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) await webpToReportPng(await toWebp(solid(1200, 400)));
  ok(Date.now() - t0 < 5000, "5 dönüşüm < 5 sn", Date.now() - t0);
  ok(REPORT_LOGO_MAX_EDGE === 600, "en uzun kenar sınırı 600 px");

  section("Logo seçimi şeması (saf)");
  const U = "5b0f7a3c-1d2e-4f50-8a6b-7c8d9e0f1a2b";
  const okSel = parseLogoSelection({ source: "custom", assetId: U, expectedVersion: 3 });
  ok(okSel.ok && okSel.value.assetId === U && okSel.expectedVersion === 3, "custom + uuid kabul");
  ok(parseLogoSelection({ source: "none", expectedVersion: 0 }).ok && parseLogoSelection({ source: "workspace", assetId: null, expectedVersion: 1 }).ok, "none / workspace (assetId yok / null) kabul");
  const bad: [unknown, string][] = [
    [{ source: "custom", expectedVersion: 0 }, "assetId"],
    [{ source: "custom", assetId: "../../etc/passwd", expectedVersion: 0 }, "assetId"],
    [{ source: "custom", assetId: U.toUpperCase(), expectedVersion: 0 }, "assetId"],
    [{ source: "none", assetId: U, expectedVersion: 0 }, "assetId"],
    [{ source: "workspace", assetId: U, expectedVersion: 0 }, "assetId"],
    [{ source: "url", expectedVersion: 0 }, "source"],
    [{ source: "custom", assetId: U }, "expectedVersion"],
    [{ source: "none", expectedVersion: -1 }, "expectedVersion"],
    [{ source: "none", expectedVersion: 1.5 }, "expectedVersion"],
    [{ source: "none", expectedVersion: 0, tenantId: U }, "tenantId"],
    [{ source: "none", expectedVersion: 0, logo_source: "custom" }, "logo_source"],
    [[], ""],
    [null, ""],
  ];
  for (const [b, path] of bad) {
    const r = parseLogoSelection(b);
    ok(!r.ok && r.path === path, `red: ${JSON.stringify(b)} → ${path || "gövde"}`, r);
  }

  console.log(`\nreport logo test: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

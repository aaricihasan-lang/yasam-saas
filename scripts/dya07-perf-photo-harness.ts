/**
 * DYA-07 PERF (B1/B3) — PURE HARNESS
 *
 * Danışan Yolculuğu taş fotoğrafı performans paketinin saf (test edilebilir) çekirdeğini
 * GERÇEKTEN import edip çağırır (source-grep DEĞİL):
 *   (1) shouldRefreshSignedUrls — signed URL yeniden imzalama eşiği (B3): pencereye/sekmeye
 *       dönüşte gereksiz yeniden imzalama/yeniden indirme YAPILMAMASI; yalnız TTL eşiği
 *       aşıldığında yenileme; hiç imzalanmadıysa yenile; saat geri-sıçramasında yenileme yok.
 *   (2) applySignedPhotoUrls (thumbById) — B1: kart için ayrı thumb_url doldurulması;
 *       thumbById verilmezse geriye uyumluluk (thumb_url'e dokunulmaz); eksik URL → boş.
 *
 * DB/prod erişimi YOK. Çalıştır: npx tsx scripts/dya07-perf-photo-harness.ts
 */
import {
  shouldRefreshSignedUrls,
  applySignedPhotoUrls,
  STONE_PHOTO_SIGNED_TTL_SECONDS,
} from "../lib/clients/stonePhotoStorage";

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("FAIL  " + name);
  }
}

// ─── (1) shouldRefreshSignedUrls ────────────────────────────────────────────────
const NOW = 1_700_000_000_000; // sabit referans (Date.now() kullanılmaz → deterministik)
const TTL = STONE_PHOTO_SIGNED_TTL_SECONDS; // 3600 sn
const thresholdMs = TTL * 1000 * 0.8; // 2_880_000 = 48 dk

ok("REFRESH-01 null lastSigned → true (hiç imzalanmadı)", shouldRefreshSignedUrls(null, NOW) === true);
ok("REFRESH-02 az önce imzalandı (age 0) → false", shouldRefreshSignedUrls(NOW, NOW) === false);
ok(
  "REFRESH-03 age 47dk (< eşik 48dk) → false (gereksiz yeniden indirme yok)",
  shouldRefreshSignedUrls(NOW - 47 * 60 * 1000, NOW) === false,
);
ok(
  "REFRESH-04 age 49dk (> eşik) → true (TTL dolmadan yenile)",
  shouldRefreshSignedUrls(NOW - 49 * 60 * 1000, NOW) === true,
);
ok(
  "REFRESH-05 tam eşikte (48dk) → true",
  shouldRefreshSignedUrls(NOW - thresholdMs, NOW) === true,
);
ok(
  "REFRESH-06 saat geri sıçraması (age<0) → false",
  shouldRefreshSignedUrls(NOW + 5 * 60 * 1000, NOW) === false,
);
ok(
  "REFRESH-07 özel ttl/ratio (100sn, %50) → 60sn geçince true",
  shouldRefreshSignedUrls(NOW - 60 * 1000, NOW, 100, 0.5) === true,
);
ok(
  "REFRESH-08 özel ttl/ratio (100sn, %50) → 40sn'de false",
  shouldRefreshSignedUrls(NOW - 40 * 1000, NOW, 100, 0.5) === false,
);

// ─── (2) applySignedPhotoUrls (thumbById) ───────────────────────────────────────
type P = { id: string; image_url: string; thumb_url?: string; extra?: string };
const photos: P[] = [
  { id: "p1", image_url: "eski-public-veya-bos", extra: "korunmali" },
  { id: "p2", image_url: "x" },
];

// thumbById verildi: full + thumb dolar; eksik anahtar → boş.
const withThumbs = applySignedPhotoUrls(photos, { p1: "FULL1" }, { p1: "THUMB1" });
ok("THUMB-01 full URL uygulandı", withThumbs[0].image_url === "FULL1");
ok("THUMB-02 thumb URL uygulandı", withThumbs[0].thumb_url === "THUMB1");
ok("THUMB-03 diğer alanlar korunur", withThumbs[0].extra === "korunmali");
ok("THUMB-04 full yoksa image_url boş (stale URL değil)", withThumbs[1].image_url === "");
ok("THUMB-05 thumb yoksa thumb_url boş", withThumbs[1].thumb_url === "");

// thumbById verilmedi (geriye uyumlu): thumb_url'e DOKUNULMAZ, full doldurulur.
const noThumbs = applySignedPhotoUrls(photos, { p1: "FULL1" });
ok("THUMB-06 thumbById yoksa thumb_url set edilmez (undefined)", noThumbs[0].thumb_url === undefined);
ok("THUMB-07 thumbById yoksa da full doldurulur", noThumbs[0].image_url === "FULL1");

// Girdi mutasyona uğramaz (pure).
ok("THUMB-08 girdi dizisi mutasyona uğramadı", photos[0].image_url === "eski-public-veya-bos");

console.log(`\nPERF-PHOTO HARNESS: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

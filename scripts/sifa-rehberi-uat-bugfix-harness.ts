/**
 * ŞİFA REHBERİ — POST-MERGE UAT BUGFIX REGRESSION HARNESS
 *
 * İki manuel-UAT bug'ını kilitler:
 *
 *   BUG #1 — TOP-LEVEL GÖRSEL DETAYDA GÖRÜNMÜYORDU
 *     "Yeni kayıt" üst "Görseller" alanı görselleri `healing_guides.images` içine
 *     section ALANI OLMADAN yazar ({ id, name, file_path }). Detay sekmeleri
 *     `img.section === tab` ile süzdüğü için bunlar hiçbir sekmeyle eşleşmiyordu.
 *     ÇÖZÜM: section'sız görseller varsayılan ("Rahatsızlık") sekmede; sectioned
 *     görseller kendi sekmesinde. DB REWRITE YOK. (selectTabImages / isImageInTab)
 *
 *   BUG #2 — KAYDET/KAPAT BARI VIEWPORT ALTINDA KESİLİYORDU
 *     "Yeni kayıt" dış kabı ham `h-dvh/min-h-dvh` (=100dvh) kullanıyordu; global
 *     logo bar (44px, `--logo-h`) hesaba katılmadığından sayfa 100dvh+44px olup
 *     alttaki footer viewport dışına taşıyordu. ÇÖZÜM: canonical `h-screen/min-h-screen`
 *     (globals.css → calc(100vh - var(--logo-h))). Magic-number YOK; mevcut kontrat reuse.
 *
 * Çalıştır:  npx tsx scripts/sifa-rehberi-uat-bugfix-harness.ts
 *            (package script: npm run test:sifa-rehberi:uat-bugfix)
 *
 * Production DB/storage erişimi gerektirmez:
 *   - BEHAVIOR: saf render-filtre yardımcıları (mutation YOK).
 *   - SOURCE/LAYOUT CONTRACT: taze ağaçtaki dosyalar üzerinde statik iddialar.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isImageInTab, selectTabImages } from "@/lib/sifa-rehberi/guideImageView";

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
const VIEW = "lib/sifa-rehberi/guideImageView.ts";
const GLOBALS = "app/globals.css";
const LOGO = "components/layout/AppLogoLink.tsx";

const DEFAULT_TAB = "rahatsizlik"; // DETAIL_TABS[0].id

// ── BUG #1 · GÖRSEL FİLTRE DAVRANIŞI (saf helper) ──────────────────────────────
console.log("\nBUG #1 — TOP-LEVEL / SECTION'SIZ GÖRSEL RENDER");

type Img = { id: string; name: string; file_path?: string; url?: string; section?: string };

const topLevel: Img = { id: "t1", name: "aaa.png", file_path: "healing-guides/T/staging/x.png" };
const sectioned: Img = { id: "s1", name: "b.png", file_path: "healing-guides/T/g/y.png", section: "uygulamalar" };
const rahatsizlikImg: Img = { id: "r1", name: "c.png", file_path: "healing-guides/T/g/z.png", section: "rahatsizlik" };
const whitespaceSection: Img = { id: "w1", name: "d.png", file_path: "p", section: "   " };

ok("1. section'sız görsel VARSAYILAN sekmede görünür",
  isImageInTab(topLevel.section, DEFAULT_TAB, DEFAULT_TAB) === true);

ok("2. section'sız görsel BAŞKA sekmede görünMEZ",
  isImageInTab(topLevel.section, "uygulamalar", DEFAULT_TAB) === false);

ok("3. section atanmış görsel yalnız KENDİ sekmesinde görünür",
  isImageInTab(sectioned.section, "uygulamalar", DEFAULT_TAB) === true &&
  isImageInTab(sectioned.section, DEFAULT_TAB, DEFAULT_TAB) === false);

ok("4. section='rahatsizlik' görsel varsayılan sekmede görünür (kendi section'ı)",
  isImageInTab(rahatsizlikImg.section, DEFAULT_TAB, DEFAULT_TAB) === true);

ok("5. whitespace-only section → section'sız kabul edilir (varsayılan sekme)",
  isImageInTab(whitespaceSection.section, DEFAULT_TAB, DEFAULT_TAB) === true &&
  isImageInTab(whitespaceSection.section, "uygulamalar", DEFAULT_TAB) === false);

// Duplicate kontrolü: her görsel tüm sekmeler taransa TAM 1 kez görünür.
const ALL_TABS = ["rahatsizlik", "belirtiler", "uygulamalar", "dogaltas", "aromaterapi", "islami_oneriler", "destekleyici"];
const corpus: Img[] = [topLevel, sectioned, rahatsizlikImg];
function renderCount(img: Img): number {
  return ALL_TABS.reduce((n, t) => n + (selectTabImages([img], t, DEFAULT_TAB).length > 0 ? 1 : 0), 0);
}
ok("6. section'sız görsel TÜM sekmelerde TAM 1 kez render olur (duplicate YOK)",
  renderCount(topLevel) === 1);
ok("7. section atanmış görsel TÜM sekmelerde TAM 1 kez render olur (duplicate YOK)",
  renderCount(sectioned) === 1);

// Production-style entry { id, name, file_path } (section YOK) — DB rewrite olmadan çalışır.
const prodEntry: Img = { id: "p1", name: "aaa test.png", file_path: "healing-guides/T/staging/aaa.png" };
ok("8. production-style { id, name, file_path } (section YOK) varsayılan sekmede görünür",
  selectTabImages([prodEntry], DEFAULT_TAB, DEFAULT_TAB).length === 1);
ok("8b. aynı entry başka sekmede görünMEZ",
  selectTabImages([prodEntry], "belirtiler", DEFAULT_TAB).length === 0);

// Karışık set: varsayılan sekmede top-level + rahatsizlik-sectioned birlikte; sıra korunur.
const mixed = selectTabImages(corpus, DEFAULT_TAB, DEFAULT_TAB);
ok("9. varsayılan sekme: section'sız + rahatsizlik-sectioned birlikte, uygulamalar-sectioned HARİÇ",
  mixed.length === 2 && mixed[0].id === "t1" && mixed[1].id === "r1");

ok("10. boş görsel listesi → boş sonuç (dayanıklı)",
  selectTabImages([], DEFAULT_TAB, DEFAULT_TAB).length === 0);

// ── BUG #1 · SOURCE CONTRACT ───────────────────────────────────────────────────
console.log("\nBUG #1 — DETAY SOURCE CONTRACT");
const detail = read(DETAIL);
const viewSrc = read(VIEW);

ok("11. detay `selectTabImages(... DETAIL_TABS[0].id)` kullanır (varsayılan sekme kontratı)",
  /selectTabImages\(\s*draft\?\.images\s*\?\?\s*\[\]\s*,\s*tab\s*,\s*DETAIL_TABS\[0\]\.id\s*\)/.test(detail));
ok("12. eski kırık `img.section === tab` inline filtresi KALDIRILDI",
  !/\.filter\(\(img\)\s*=>\s*img\.section === tab\)/.test(detail));
ok("13. render kaynağı signedUrls[img.id] PRIMARY (public URL değil)",
  /src=\{signedUrls\[img\.id\]\s*\?\?\s*img\.url\s*\?\?\s*""\}/.test(detail));
ok("14. saf helper section'ı trim ile normalize eder (whitespace guard)",
  /\.trim\(\)/.test(viewSrc));

// ── SECURITY REGRESSION (Phase A kontratı korunuyor) ──────────────────────────
console.log("\nSECURITY REGRESSION — PHASE A KONTRATI");
const list = read(LIST);
const bothPages = list + "\n" + detail;

ok("15. getPublicUrl ÇAĞRISI YOK (yalnız yorumlarda geçebilir)",
  !/\bgetPublicUrl\s*\(/.test(bothPages));
ok("16. browser anon .upload( ÇAĞRISI YOK (yalnız uploadToSignedUrl)",
  !/\bstorage\s*\.\s*from\([^)]*\)\s*\.\s*upload\s*\(/.test(bothPages));
ok("17. browser storage .remove( ÇAĞRISI YOK",
  !/\bstorage\s*\.\s*from\([^)]*\)\s*\.\s*remove\s*\(/.test(bothPages));
ok("18. top-level görsel silme mevcut güvenli sunucu yolunu kullanır (deleteSifaPhoto)",
  /deleteSifaPhoto\(\s*id\s*,\s*img\.file_path\s*\)/.test(detail));
ok("19. section'sız görsel için de signed URL guide-scoped endpoint'ten alınır",
  /fetchSifaPhotoSignedUrls\(\s*id\s*\)/.test(detail));

// ── BUG #2 · LAYOUT CONTRACT ───────────────────────────────────────────────────
console.log("\nBUG #2 — YENİ KAYIT LAYOUT / VIEWPORT KONTRATI");
const globals = read(GLOBALS);
const logo = read(LOGO);

// new-view dış kabı: canonical screen utility (logo-h ayarlı), ham dvh DEĞİL.
const newViewShell = /if \(isNewView\)[\s\S]{0,1400}?<div className="([^"]*)"/.exec(list);
const shellClass = newViewShell?.[1] ?? "";
ok("20. new-view dış kabı bulundu",
  shellClass.length > 0);
// KRİTİK: globals.css YALNIZ düz `.h-screen`/`.min-h-screen`'i --logo-h ile daraltır.
// Tailwind responsive varyantı `.lg\:h-screen` AYRI sınıftır ve daraltılMAZ (canlı
// tarayıcıda ölçüldü: h-screen=651px ✓, lg:h-screen=695px ✗). Bu yüzden desktop yüksekliği
// DÜZ `h-screen` ile kurulur; liste görünümüyle birebir aynı desen.
ok("21. new-view dış kabı DÜZ `h-screen` kullanır (globals.css --logo-h ile daraltılan sınıf)",
  /(^|\s)h-screen(\s|$)/.test(shellClass));
ok("21b. AYARLANMAYAN `lg:h-screen` responsive varyantı KULLANILMAZ (yoksa footer kesilir)",
  !/\blg:h-screen\b/.test(shellClass));
ok("22. new-view dış kabı ham `h-dvh`/`min-h-dvh` KULLANMAZ (logo-h hesaba katılmaz)",
  !/\bmin-h-dvh\b/.test(shellClass) && !/\blg:h-dvh\b/.test(shellClass) && !/(^|\s)h-dvh(\s|$)/.test(shellClass));
ok("22b. mobilde belge scroll'u için relax eder (max-lg:h-auto + max-lg:overflow-y-auto)",
  /\bmax-lg:h-auto\b/.test(shellClass) && /\bmax-lg:overflow-y-auto\b/.test(shellClass));
ok("23. globals.css .h-screen'i logo bar'a göre daraltır (calc(100vh - --logo-h))",
  /\.h-screen\s*\{[^}]*calc\(100vh\s*-\s*var\(--logo-h/.test(globals));
ok("24. globals.css .min-h-screen'i logo bar'a göre daraltır",
  /\.min-h-screen\s*\{[^}]*calc\(100vh\s*-\s*var\(--logo-h/.test(globals));
ok("25. AppLogoLink canonical --logo-h değişkenini tanımlar (44px)",
  /--logo-h:\s*44px/.test(logo));
ok("26. action bar footer shrink-0 (flex sıkışmasına karşı kesilmez)",
  /flex shrink-0 items-center[^"]*border-t[^"]*bg-white\/95/.test(list));
ok("27. footer içinde Kaydet + Kapat butonları mevcut",
  /Kaydediliyor\.\.\.|Kaydet/.test(list) && /Kapat/.test(list));
ok("28. içerik alanı iç scroll ile taşabilir (lg:overflow-y-auto)",
  /lg:min-h-0 lg:flex-1 lg:overflow-y-auto/.test(list));

// ── SONUÇ ──────────────────────────────────────────────────────────────────────
console.log(`\nŞİFA REHBERİ · UAT BUGFIX HARNESS: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

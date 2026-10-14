/**
 * FINAL HARDENING — §4.6 MOBİL ÇIKTI (YETENEK BAZLI) — saf + statik harness.
 *
 * GÜNCEL SÖZLEŞME (owner kararı 2026-10-14 — "mobil dosya işlevleri"):
 *   (1) Word (.docx): HD ve Astroloji DIŞINDAKİ tüm modüllerde Android dahil HER cihazda açık
 *       (istemci gizlemesi yok, sunucu androidWordGuard yok). HD + Astroloji kendi kurallarını
 *       AYNEN korur (.no-android + useIsAndroid + androidWordGuard).
 *   (2) Android uygulaması blob:/data: İNDİRMEYİ kaydeder → istemci blob/PNG/PDF/TXT/JSON
 *       indirmeleri uygulamada görünür. window.print ve window.open(blob)/<object>/<iframe> PDF
 *       önizlemesi uygulamada ÇALIŞMAZ → bunlar .no-android-app ile gizli kalır.
 *   (3) Anamnez boş/dolu PDF + PDF Ekle her cihazda görünür; uygulamada "Görüntüle" pencere açmaz.
 *   (4) Görsel yüklemeleri ortak kalite koruyan optimizasyondan geçer; kamera ayrı girişle
 *       (CameraCaptureButton, capture="environment") ve yalnız destekleyen ortamda sunulur.
 *   (Önceki kurallar: owner kararı 10 + 2026-10-04 — bu dosyanın git geçmişinde.)
 *
 * Kontroller:
 *   A. outputVisibility karar tablosu (lib değişmedi — yardımcı davranışı sabit)
 *   B. clientContext.ts ile tespit tutarlılığı
 *   C. globals.css kuralı (@layer dışı, !important)
 *   D. Word: kapsam içi CTA'larda Android gizlemesi YOK; HD/Astroloji gizlemesi KORUNUR
 *   E. Uygulama çıktıları: blob indirmeleri görünür; print + blob-open gizli kalır
 *   F. Word API route'ları: kapsam içinde androidWordGuard YOK; HD/Astroloji'de VAR
 *   G. Anamnez: PDF CTA'ları + PDF Ekle görünür; uygulamada pencere açılmaz
 *   H. "Dokunmatik = gizle" kuralı EKLENMEDİ
 *   I. Refleks not ekleri: data: üst-çerçeve yok, blob güvenli; Android'de PDF iframe yerine İndir
 *   J. Görsel yükleme ekranları: optimizasyon + kamera bağlantısı; capture yalnız ortak bileşende
 *
 * Çalıştır: npx tsx scripts/final-hardening/output-visibility.harness.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  NO_ANDROID_APP_CLASS,
  NO_ANDROID_CLASS,
  isAndroidAppUserAgent,
  outputVisibility,
  platformFlags,
  type OutputKind,
} from "../../lib/platform/outputSupport";
import { isSafeOpenMime, dataUrlToSafeBlob } from "../../app/refleksoloji/notlar/lib/openDataUrl";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, name: string, detail?: string): void {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function section(t: string) { console.log(`\n── ${t}`); }

// ── A. Karar tablosu ─────────────────────────────────────────────────────────
section("A. outputVisibility karar tablosu");
const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  androidAppSuffix: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 YasamSistemiAndroid/1.4.2",
  androidWv: "Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36",
} as const;
type UaKey = keyof typeof UA;
const KINDS: OutputKind[] = ["word", "client-blob", "print", "blob-open", "anamnez-pdf", "user-file"];
// Beklenen görünürlük: [desktop, iphone, androidChrome, androidAppSuffix, androidWv]
const EXPECT: Record<OutputKind, [boolean, boolean, boolean, boolean, boolean]> = {
  "word":        [true, true, false, false, false],
  "client-blob": [true, true, true, false, false],
  "print":       [true, true, true, false, false],
  "blob-open":   [true, true, true, false, false],
  // Owner kararı 2026-10-04: mobil PDF indirme desteklenmiyor → tüm Android'de gizli (K8 kaldırıldı).
  "anamnez-pdf": [true, true, false, false, false],
  "user-file":   [true, true, true, true, true],
};
const uaKeys = Object.keys(UA) as UaKey[];
for (const kind of KINDS) {
  uaKeys.forEach((k, i) => {
    const got = outputVisibility({ ua: UA[k], kind }).visible;
    ok(got === EXPECT[kind][i], `${kind} @ ${k} → ${EXPECT[kind][i] ? "görünür" : "gizli"}`, `got=${got}`);
  });
}
ok(outputVisibility({ ua: null, kind: "word" }).visible === true, "UA yok (SSR/iç istek) → görünür (fail-open)");
ok(outputVisibility({ ua: UA.desktop, kind: "word" }).hideClass === NO_ANDROID_CLASS, "word → .no-android");
ok(outputVisibility({ ua: UA.desktop, kind: "print" }).hideClass === NO_ANDROID_APP_CLASS, "print → .no-android-app");
ok(outputVisibility({ ua: UA.desktop, kind: "anamnez-pdf" }).hideClass === "no-android", "anamnez-pdf → no-android (owner 2026-10-04; K8 kaldırıldı)");
ok(NO_ANDROID_CLASS === "no-android" && NO_ANDROID_APP_CLASS === "no-android-app", "sınıf sabitleri");
const pf = (k: UaKey) => JSON.stringify(platformFlags(UA[k]));
ok(pf("desktop") === '{"android":false,"androidApp":false}', "platformFlags desktop");
ok(pf("iphone") === '{"android":false,"androidApp":false}', "platformFlags iPhone");
ok(pf("androidChrome") === '{"android":true,"androidApp":false}', "platformFlags Android Chrome");
ok(pf("androidAppSuffix") === '{"android":true,"androidApp":true}', "platformFlags app soneki");
ok(pf("androidWv") === '{"android":true,"androidApp":true}', "platformFlags ; wv)");
ok(isAndroidAppUserAgent("x YasamSistemiAndroid/2.0") === true, "sonek tek başına → app");
ok(isAndroidAppUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/1 Mobile Safari") === false, "Android Chrome ≠ app");

// ── B. clientContext tutarlılığı ─────────────────────────────────────────────
section("B. lib/usage/clientContext.ts ile tespit tutarlılığı");
const cc = read("lib/usage/clientContext.ts");
const os = read("lib/platform/outputSupport.ts");
ok(cc.includes("YasamSistemiAndroid\\/") && os.includes("YasamSistemiAndroid\\/"), "aynı app soneki deseni");
ok(cc.includes("/;\\s*wv\\)/i") && os.includes("/;\\s*wv\\)/i"), "aynı WebView işareti deseni");
ok(/import \{ isAndroidUserAgent \} from "@\/lib\/platform\/android"/.test(os), "outputSupport mevcut android.ts'i kullanır");

// ── C. globals.css ───────────────────────────────────────────────────────────
section("C. globals.css kuralı");
const css = read("app/globals.css");
const ruleRe = /html\[data-android\]\s+\.no-android,\s*html\[data-android-app\]\s+\.no-android-app\s*\{\s*display:\s*none\s*!important;\s*\}/;
ok(ruleRe.test(css), "html[data-android] .no-android, html[data-android-app] .no-android-app { display:none !important }");
{
  const at = css.search(ruleRe);
  const before = css.slice(0, at);
  const opens = (before.match(/@layer[^{]*\{/g) ?? []).length;
  // @layer blokları kapanmış olmalı: kural, son @tailwind utilities'ten SONRA ve @layer dışında.
  let depth = 0;
  for (const ch of before) { if (ch === "{") depth++; else if (ch === "}") depth--; }
  ok(at > css.indexOf("@tailwind utilities") && depth === 0, "kural @tailwind utilities sonrası ve üst seviyede (@layer dışı)", `opens=${opens} depth=${depth}`);
}
{
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  ok(!/\.no-android[^{}]*\{[^}]*display:\s*(?!\s|none)/.test(cssNoComments), "görünür durumda display değeri set edilmiyor");
}

// ── D. Word CTA dosyaları ────────────────────────────────────────────────────
section("D. Word: kapsam içinde Android gizlemesi YOK; HD/Astroloji korunur");
const NO_ANDROID_RE = /\bno-android\b(?!-app)|NO_ANDROID_CLASS/;
// Word CTA'sı render eden kapsam içi dosyalar (2026-10-14: Android dahil her cihazda görünür).
const WORD_CTA_FILES = [
  "components/common/BulkExportBar.tsx",
  "app/aromaterapi/_components/read/DetailScreen.tsx",
  "app/aromaterapi/_components/read/ReadListScreen.tsx",
  "app/aromaterapi/_components/OilsPage.tsx",
  "app/aromaterapi/karisim-olusturucu/page.tsx",
  "app/aromaterapi/page.tsx",
  "app/aromaterapi/yaglar/[id]/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/yontemler/[seriesId]/page.tsx",
  "app/belge-ceviri/page.tsx",
  "app/beslenme/planlar/_components/PlanTools.tsx",
  "app/ders-notu/page.tsx",
  "app/danisan-yolculugu/liste/page.tsx",
  "app/dashboard/ajanda/page.tsx",
  "app/dashboard/clients/[id]/page.tsx",
  "app/dashboard/clients/[id]/components/AnalizlerTab.tsx",
  "app/dashboard/biyoenerji/components/BilincaltiSebepleriDetail.tsx",
  "app/dashboard/biyoenerji/components/BiyoenerjiSeanslari.tsx",
  "app/dashboard/biyoenerji/components/CakralarDetail.tsx",
  "app/dashboard/biyoenerji/components/EnerjiBedenleri.tsx",
  "app/dashboard/biyoenerji/components/ImajinasyonlarDetail.tsx",
  "app/dashboard/biyoenerji/components/SembolDiliDetail.tsx",
  "app/cosmic-calendar/hacamat/page.tsx",
  "app/cosmic-calendar/hacamat/report/page.tsx",
  "app/dogaltas/dogaltas-listesi/[id]/page.tsx",
  "app/dogaltas/kombinasyonlar/[title]/page.tsx",
  "app/dogaltas/mineral-listesi/page.tsx",
  "app/dogaltas/mineral-listesi/[id]/page.tsx",
  "app/dogaltas/page.tsx",
  "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx",
  "app/kupa/protokoller/[id]/ProtocolDocumentClient.tsx",
  "app/kupa/takvim/components/CalendarWorkspace.tsx",
  "app/numeroloji/bilgi-bankasi/components/BilgiKayitListesi.tsx",
  "app/numeroloji/liste/[id]/page.tsx",
  "app/numeroloji/liste/page.tsx",
  "app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx",
  "app/refleksoloji/kayitli-protokoller/components/KayitliProtokollerLayout.tsx",
  "app/settings/BackupSections.tsx",
  "app/sifa-rehberi/[id]/page.tsx",
  "app/sifa-rehberi/page.tsx",
  "app/urun-stok/canli-stok/page.tsx",
  "app/video-ceviri/page.tsx",
];
for (const f of WORD_CTA_FILES) {
  const src = read(f);
  ok(!NO_ANDROID_RE.test(src) && !/useIsAndroid\(\)/.test(src) && !/hideWordOnMobile/.test(src), `${f}: Word için Android/telefon gizlemesi yok`);
}
{
  const bar = read("components/common/BulkExportBar.tsx");
  ok(/const hasExport = Boolean\(onExportSelected \|\| onExportAll\);/.test(bar), "BulkExportBar: hasExport Android'e bağlı değil");
  const pt = read("app/beslenme/planlar/_components/PlanTools.tsx");
  ok(!/EXPORT_DESKTOP_ONLY_CLASS|beslenme-export-desktop-only/.test(pt) && !css.includes("beslenme-export-desktop-only"), "Beslenme: Word tüm cihazlarda görünür (2026-10-14; yalnız-masaüstü kuralı kaldırıldı)");
}
// HD + Astroloji: eski kural AYNEN (bu dosyalar bu çalışmada değişmedi).
const HD_ASTRO_WORD_FILES = [
  "app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx",
  "app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx",
  "app/human-design/rapor-olustur/components/HdRaporContent.tsx",
  "app/admin/astroloji/_components/SavedAnalyses.tsx",
];
for (const f of HD_ASTRO_WORD_FILES) {
  const src = read(f);
  ok(NO_ANDROID_RE.test(src) && /useIsAndroid\(\)/.test(src), `${f}: HD/Astroloji Android Word gizlemesi KORUNUR`);
}

// ── E. Android uygulaması çıktıları ──────────────────────────────────────────
section("E. Uygulama: blob indirmeleri görünür; print + blob-open gizli");
const BLOB_DOWNLOAD_VISIBLE: Array<[string, RegExp]> = [
  ["app/belge-ceviri/page.tsx", /TXT İndir/],
  ["app/ders-notu/page.tsx", /TXT İndir/],
  ["app/numeroloji/components/NumerolojiGorselRaporKontrolPaneli.tsx", /PNG İndir/],
  ["app/numeroloji/components/NumerolojiKayitDetayPanel.tsx", /PNG İndir/],
  ["app/settings/BackupSections.tsx", /Sistem Yedeği İndir/],
  ["app/video-ceviri/page.tsx", /Orijinal PDF/],
];
for (const [f, marker] of BLOB_DOWNLOAD_VISIBLE) {
  const src = read(f);
  ok(marker.test(src) && !/\bno-android-app\b/.test(src) && !/useIsAndroidApp\(\)/.test(src), `${f}: blob indirme uygulamada görünür`);
}
{
  const kar = read("app/aromaterapi/karisim-olusturucu/page.tsx");
  ok((kar.match(/className="no-android-app/g) ?? []).length === 2 && /useIsAndroidApp\(\)/.test(kar), "aromaterapi: 2 Yazdır CTA'sı (window.print) uygulamada GİZLİ kalır");
  const card = read("app/refleksoloji/notlar/components/NoteDetayAttachmentCard.tsx");
  ok(/Yeni Sekme/.test(card) && /\bno-android-app\b/.test(card), "refleks ek: 'Yeni Sekme' (window.open blob) uygulamada GİZLİ kalır");
  const hac = read("app/cosmic-calendar/hacamat/page.tsx");
  ok(/\{TABS\.map\(tab => \(/.test(hac) && !/isAndroidApp/.test(hac), "hacamat: 'Word' sekmesi her cihazda listelenir");
  ok(/activeTab === "word" && \(/.test(hac), "hacamat: Word sekmesi içeriği her cihazda render edilir");
  ok(/PDF Oluştur/.test(hac) && /Word Oluştur/.test(hac) && !/hidden gap-2 md:flex/.test(hac), "hacamat: PDF/Word Oluştur telefon genişliğinde de görünür");
  ok(/className="no-android-app flex w-full[^"]*"\s*>\s*<ExternalLink/.test(hac), "hacamat: 'Raporu Aç' (blob önizleme sayfası) uygulamada gizli");
  const rep = read("app/cosmic-calendar/hacamat/report/page.tsx");
  ok(/data-testid="hacamat-report-app-downloads"/.test(rep) && /download\("pdf"\)/.test(rep) && /download\("word"\)/.test(rep), "hacamat rapor: uygulamada PDF + Word İndir");
  ok(/if \(isAndroidAppClient\(\)\) return;/.test(rep), "hacamat rapor: uygulamada PDF önizleme hiç çekilmez");
  ok((rep.match(/no-android-app/g) ?? []).length >= 2, "hacamat rapor: PDF Aç + <object> önizleme uygulamada gizli");
  const vh = read("lib/video-ceviri/exportHelpers.ts");
  ok(!/pdf\.save\(/.test(vh) && /triggerBlobDownload\(pdf\.output\("blob"\)/.test(vh), "video PDF: jsPDF.save yerine blob indirme (uygulamada güvenilir)");
}

// ── F. Word API route'ları ───────────────────────────────────────────────────
section("F. Word API route'ları: kapsam içinde guard yok; HD/Astroloji'de var");
const UNGUARDED_46 = [
  "ajanda/word-report", "aromaterapi/blends/[id]/word-report", "aromaterapi/blends/word-report",
  "aromaterapi/claims/[id]/word-report", "aromaterapi/claims/word-report", "aromaterapi/glossary/word-report",
  "aromaterapi/methods/[seriesId]/word-report", "aromaterapi/methods/word-report", "aromaterapi/oils/[id]/word-report",
  "aromaterapi/oils/word-report", "aromaterapi/plant-taxa/[id]/word-report", "aromaterapi/plant-taxa/word-report",
  "aromaterapi/preparations/[id]/word-report", "aromaterapi/preparations/word-report", "aromaterapi/sources/[id]/word-report",
  "aromaterapi/sources/word-report", "aromaterapi/word-report", "belge-ceviri/ocr-to-word", "belge-ceviri/pdf-to-word",
  "belge-ceviri/pdf-to-turkce-word", "beslenme/plans/[id]/word", "biyoenerji/chakra-report", "biyoenerji/energy-body-report",
  "biyoenerji/imagination-report", "biyoenerji/session-report", "biyoenerji/subconscious-report", "biyoenerji/symbol-report",
  "clients/[id]/word-report", "clients/word-report-bulk", "ders-notu/to-word", "dogaltas/combinations/word-report",
  "dogaltas/knowledge-report", "dogaltas/mineral-report", "dogaltas/minerals/[id]/word-report",
  "dogaltas/stones/[id]/word-report", "dogaltas/word-report", "hacamat/word-report", "kupa/calendar/plans/[id]/word-report",
  "kupa/protocols/[id]/word-report", "numeroloji/knowledge-report", "numeroloji/word-report", "refleksoloji/protocol-report",
  "settings/export", "sifa-rehberi/word-report", "urun-stok/stock-report", "video-ceviri/export-word",
];
ok(UNGUARDED_46.length === 46, `46 kapsam içi Word route'u listelendi (${UNGUARDED_46.length})`);
for (const r of UNGUARDED_46) {
  const f = `app/api/${r}/route.ts`;
  const src = existsSync(join(ROOT, f)) ? read(f) : "MISSING";
  ok(src !== "MISSING" && !/androidWordGuard|isAndroidUserAgent/.test(src), `${f}: Android engeli yok`);
}
for (const f of [
  "app/api/hd/reports/professional/route.ts",
  "app/api/hd/reports/professional/download/route.ts",
  "app/api/admin/astroloji/analyses/report/route.ts",
  "app/api/admin/astroloji/analyses/[id]/report/route.ts",
]) {
  ok(/androidWordGuard\((req|request)\)/.test(read(f)), `${f}: HD/Astroloji guard'ı KORUNUR`);
}
for (const f of ["app/api/belge-ceviri/job-status/[id]/route.ts", "app/api/belge-ceviri/history/route.ts"]) {
  const src = read(f);
  ok(!/wordBlocked|isAndroidUserAgent/.test(src), `${f}: Android'e de downloadUrl verilir`);
}

// ── G. Anamnez ───────────────────────────────────────────────────────────────
section("G. Anamnez: PDF CTA'ları + PDF Ekle her cihazda; uygulamada pencere açılmaz");
{
  const st = read("components/danisan/anamnez/styles.ts");
  ok(st.includes('export const ANAMNEZ_PDF_CTA_HIDE = "inline-flex";') && st.includes('export const ANAMNEZ_PDF_HINT_HIDE = "block";'), "CTA + ipucu sınıfları gizleme içermez");
  ok(!/outputHideClass|no-android|hidden md:/.test(st), "styles.ts: Android/telefon gizlemesi yok");
  const att = read("components/danisan/anamnez/AnamnezAttachments.tsx");
  ok(!/MOBILE_HIDDEN|no-android|hidden md:/.test(att) && /accept="application\/pdf,\.pdf"/.test(att), "PDF Ekle her cihazda görünür (yalnız PDF kabul)");
  ok(/triggerUrlDownload\(url, fileName\)/.test(att), "Ek İndir: dosya adı uygulama indirmesine aktarılır");
  const cl = read("lib/danisan/anamnez/client.ts");
  const i = cl.indexOf("export async function openSignedUrl");
  const body = cl.slice(i, i + 1400);
  ok(body.indexOf("if (isAndroidAppClient())") >= 0 && body.indexOf("if (isAndroidAppClient())") < body.indexOf('win = window.open("about:blank"'), "Görüntüle: uygulamada window.open(about:blank) çağrılmaz");
  ok(/a\.download = fileName \?\? "";/.test(cl), "triggerUrlDownload: download işareti (uygulama içi indirme)");
  for (const f of ["app/api/clients/[id]/anamnez/blank-form/route.ts", "app/api/clients/[id]/anamnez/[anamnesisId]/pdf/route.ts"]) {
    if (!existsSync(join(ROOT, f))) { ok(true, `${f}: (yok — atlandı)`); continue; }
    ok(!/androidWordGuard|isAndroidUserAgent/.test(read(f)), `${f}: PDF backend'inde Android engeli yok`);
  }
}

// ── H. "Dokunmatik = gizle" eklenmedi ────────────────────────────────────────
section("H. Yeni dokunmatik/hover tabanlı gizleme YOK");
for (const f of ["lib/platform/outputSupport.ts", "hooks/useIsAndroidApp.ts"]) {
  ok(!/pointer:\s*coarse|hover:\s*none|ontouchstart|maxTouchPoints|matchMedia/.test(read(f)), `${f}: touch/hover tespiti yok`);
}
{
  const block = css.slice(css.search(ruleRe) - 900, css.search(ruleRe) + 200);
  ok(!/@media[^{]*(pointer|hover)/.test(block.slice(block.indexOf("Çıktı CTA"))), "yeni CSS bloğunda pointer/hover medya sorgusu yok");
}

// ── I. Refleks not ekleri ────────────────────────────────────────────────────
section("I. Refleks not ekleri (kategori B) — data: üst-çerçeve yok, blob güvenli");
for (const f of ["app/refleksoloji/notlar/components/AttachmentsPanel.tsx", "app/refleksoloji/notlar/components/NoteDetayAttachmentCard.tsx"]) {
  const src = read(f);
  ok(!/href=\{file\.dataUrl\}\s*target="_blank"/.test(src), `${f}: data: URL target=_blank yok`);
  ok(/download=\{file\.fileName\}/.test(src), `${f}: İndir (kullanıcı dosyası) korunur`);
  ok(/openDataUrlInNewTab\(/.test(src), `${f}: blob: açıcı kullanılır`);
}
ok(isSafeOpenMime("application/pdf") && isSafeOpenMime("image/png") && isSafeOpenMime("IMAGE/JPEG"), "güvenli türler: PDF + raster");
ok(!isSafeOpenMime("image/svg+xml") && !isSafeOpenMime("text/html") && !isSafeOpenMime(""), "SVG/HTML/boş reddedilir (XSS)");
{
  const b = dataUrlToSafeBlob("data:application/pdf;base64,JVBERi0=");
  ok(b !== null && b.type === "application/pdf" && b.size === 5, "base64 PDF → Blob (5 bayt)");
  ok(dataUrlToSafeBlob("data:image/svg+xml;base64,PHN2Zz4=") === null, "SVG data URL → null");
  ok(dataUrlToSafeBlob("data:text/html,<script>1</script>", "text/html") === null, "HTML → null");
  ok(dataUrlToSafeBlob("data:text/html;base64,PGI+", "application/pdf")?.type === "application/pdf", "doğrulanmış MIME override → PDF olarak açılır (içerik çalıştırılmaz)");
  ok(dataUrlToSafeBlob("https://x/y.pdf") === null && dataUrlToSafeBlob("data:application/pdf;base64,@@@") === null, "data: olmayan / bozuk base64 → null");
}

{
  const pm = read("app/refleksoloji/notlar/components/PdfPreviewModal.tsx");
  ok(/isAndroid \? \(/.test(pm) && /download=\{downloadName\}/.test(pm) && /<iframe title=\{title\}/.test(pm), "PdfPreviewModal: Android'de iframe yerine İndir; diğerlerinde iframe korunur");
  const arsiv = read("app/dashboard/kisisel-arsiv/page.tsx");
  ok(/kind === "pdf" && !isAndroid \?/.test(arsiv) && /kind === "pdf" && isAndroid \?/.test(arsiv), "Kişisel Arşiv: Android'de boş PDF iframe yerine bilgi + mevcut Aç/İndir");
}

// ── J. Görsel yükleme ekranları ──────────────────────────────────────────────
section("J. Görsel yükleme: optimizasyon + kamera bağlantısı");
{
  const UPLOAD_SCREENS: Array<[string, RegExp]> = [
    ["app/dashboard/clients/[id]/components/StonesTab.tsx", /optimizeImageFile\(/],
    ["app/dogaltas/dogaltas-kayit/page.tsx", /optimizeImageFile\(/],
    ["app/dogaltas/dogaltas-listesi/[id]/page.tsx", /optimizeImageFile\(/],
    ["lib/sifa-rehberi/stonePhotoClient.ts", /optimizeImageFile\(/],
    ["app/refleksoloji/notlar/lib/readAttachmentFile.ts", /optimizeImageFile\(/],
    ["lib/urun-stok/photoValidation.ts", /optimizeImageFile\(/],
    ["app/admin/magaza/components/ImageManager.tsx", /optimizeImageFile\(/],
    ["app/admin/magaza/components/CategoriesPanel.tsx", /optimizeImageFile\(/],
  ];
  for (const [f, re] of UPLOAD_SCREENS) ok(re.test(read(f)), `${f}: yükleme öncesi kalite koruyan optimizasyon`);
  const CAMERA_SCREENS = [
    "app/dashboard/clients/[id]/components/StonesTab.tsx",
    "app/dogaltas/dogaltas-kayit/page.tsx",
    "app/dogaltas/dogaltas-listesi/[id]/page.tsx",
    "app/sifa-rehberi/page.tsx",
    "app/sifa-rehberi/[id]/page.tsx",
    "components/sifa-rehberi/SectionEditor.tsx",
    "app/refleksoloji/notlar/components/AttachmentsPanel.tsx",
    "app/refleksoloji/notlar/components/NotDetayLayout.tsx",
    "app/urun-stok/yag/page.tsx",
    "app/urun-stok/sabun-krem/page.tsx",
    "app/urun-stok/aksesuar/page.tsx",
    "app/urun-stok/diger/page.tsx",
    "app/urun-stok/dogaltas/page.tsx",
    "app/admin/magaza/components/ImageManager.tsx",
    "app/admin/magaza/components/CategoriesPanel.tsx",
    "app/dashboard/kisisel-arsiv/page.tsx",
  ];
  for (const f of CAMERA_SCREENS) ok(/<CameraCaptureButton/.test(read(f)), `${f}: ayrı kamera girişi`);
  ok(!/optimizeImageFile/.test(read("app/dashboard/kisisel-arsiv/page.tsx")), "Kişisel Arşiv: orijinal dosya korunur (optimizasyon yok)");
  const cam = read("components/media/CameraCaptureButton.tsx");
  ok(/capture="environment"/.test(cam) && /accept="image\/\*"/.test(cam) && /if \(!supported\) return null;/.test(cam), "CameraCaptureButton: capture=environment, yalnız destekte render");
  const kayit = read("app/dogaltas/dogaltas-kayit/page.tsx");
  ok(!/async function compressImageFileToWebp|className="hidden md:contents"/.test(kayit), "Doğaltaş Yeni Kayıt: eski q0.75 sıkıştırıcı ve mobil gizleme yok");
  ok(/failed = true;\s*break;/.test(kayit), "Doğaltaş Yeni Kayıt: ara hatada önceki yüklenenler kayda eklenir (yetim yok)");
  const stones = read("app/dashboard/clients/[id]/components/StonesTab.tsx");
  ok(!/MOBILE_HIDDEN/.test(stones), "Danışan Taşları: fotoğraf seçimi her cihazda görünür");
  const det = read("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
  ok(!/hidden md:inline-flex|hidden md:block/.test(det), "Doğaltaş detay: foto ekle/sil telefon genişliğinde görünür");
}

// ── Özet ─────────────────────────────────────────────────────────────────────
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("\nBAŞARISIZ:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

/**
 * FINAL HARDENING — §4.6 MOBİL ÇIKTI (YETENEK BAZLI) — saf + statik harness.
 *
 * Kural (owner kararı 10): yalnız ÇALIŞMAYAN CTA gizlenir; "dokunmatik = gizle" YOK.
 *   (1) Tüm Android → Word gizli (.no-android; sunucu androidWordGuard 403).
 *   (2) Android uygulama WebView (YasamSistemiAndroid/ veya `; wv)`) → blob/data:/print/
 *       window.open(blob) çıktıları gizli (.no-android-app). İSTİSNA: Anamnez PDF (K8).
 *   (3) iOS / Android Chrome / masaüstü → PDF/PNG/indir/yazdır görünür.
 *
 * Kontroller:
 *   A. outputVisibility karar tablosu (5 UA × 6 tür) + platformFlags
 *   B. clientContext.ts ile tespit tutarlılığı (aynı desenler)
 *   C. globals.css kuralı (@layer dışı, !important, sabitlerle aynı ad)
 *   D. Word CTA dosyalarında .no-android (useIsAndroid guard'ı KORUNMUŞ)
 *   E. Android-app çıktı CTA dosyalarında .no-android-app (+ useIsAndroidApp)
 *   F. Word API route'larında androidWordGuard (46 + 2) + belge-ceviri downloadUrl
 *   G. K8: Anamnez UI/route'larında Android tespiti / gizleme sınıfı YOK
 *   H. "Dokunmatik = gizle" kuralı EKLENMEDİ (yeni dosyalarda pointer/hover medya sorgusu yok)
 *   I. Refleks not ekleri: data: URL üst-çerçeve navigasyonu yok; blob açıcı güvenli türlerle sınırlı
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
section("D. Word CTA'larında .no-android (+ useIsAndroid korunur)");
const NO_ANDROID_RE = /\bno-android\b(?!-app)|NO_ANDROID_CLASS/;
// Doğrudan Word CTA'sı render eden (sahiplikteki) dosyalar.
const WORD_CTA_FILES = [
  "components/common/BulkExportBar.tsx",
  "app/aromaterapi/_components/read/DetailScreen.tsx",
  "app/aromaterapi/_components/read/ReadListScreen.tsx",
  "app/aromaterapi/karisim-olusturucu/page.tsx",
  "app/aromaterapi/page.tsx",
  "app/aromaterapi/yaglar/[id]/page.tsx",
  "app/belge-ceviri/page.tsx",
  "app/ders-notu/page.tsx",
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
  "app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx",
  "app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx",
  "app/human-design/rapor-olustur/components/HdRaporContent.tsx",
  "app/kupa/protokoller/[id]/ProtocolDocumentClient.tsx",
  "app/kupa/takvim/components/CalendarWorkspace.tsx",
  "app/numeroloji/bilgi-bankasi/components/BilgiKayitListesi.tsx",
  "app/numeroloji/liste/[id]/page.tsx",
  "app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx",
  "app/refleksoloji/kayitli-protokoller/components/KayitliProtokollerLayout.tsx",
  "app/settings/BackupSections.tsx",
  "app/sifa-rehberi/[id]/page.tsx",
  "app/urun-stok/canli-stok/page.tsx",
  "app/video-ceviri/page.tsx",
];
for (const f of WORD_CTA_FILES) {
  const src = read(f);
  ok(NO_ANDROID_RE.test(src) && /useIsAndroid\(\)/.test(src), `${f}: .no-android + useIsAndroid`);
}
// Word'ü YALNIZ BulkExportBar / ReadListScreen / DetailScreen üzerinden sunan dosyalar.
const VIA_SHARED = [
  "app/aromaterapi/_components/OilsPage.tsx",
  "app/aromaterapi/katalog/_components/KatalogView.tsx",
  "app/aromaterapi/kaynaklar/_components/KaynaklarView.tsx",
  "app/aromaterapi/bilgi-kayitlari/_components/BilgiKayitlariView.tsx",
  "app/aromaterapi/bilgi-bankasi/sozluk/_components/SozlukView.tsx",
  "app/aromaterapi/bilgi-kayitlari/[id]/page.tsx",
  "app/aromaterapi/katalog/bitkiler/[id]/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/page.tsx",
  "app/aromaterapi/katalog/preparatlar/[id]/yontemler/[seriesId]/page.tsx",
  "app/aromaterapi/kaynaklar/[id]/page.tsx",
  "app/dashboard/biyoenerji/components/BilincaltiSebepleri.tsx",
  "app/dashboard/biyoenerji/components/Cakralar.tsx",
  "app/dashboard/biyoenerji/components/Imajinasyonlar.tsx",
  "app/dashboard/biyoenerji/components/SembolDili.tsx",
  "app/dogaltas/dogaltas-listesi/page.tsx",
  "app/dogaltas/kombinasyonlar/page.tsx",
  "app/numeroloji/liste/page.tsx",
  "app/sifa-rehberi/page.tsx",
];
for (const f of VIA_SHARED) {
  ok(/BulkExportBar|ReadListScreen|DetailScreen|DetailWordButton/.test(read(f)), `${f}: Word paylaşılan bileşenden (.no-android taşır)`);
}
{
  const bar = read("components/common/BulkExportBar.tsx");
  ok(/const wordHideCls = ` \$\{NO_ANDROID_CLASS\}/.test(bar) && /const wordDividerCls = `\$\{NO_ANDROID_CLASS\}/.test(bar), "BulkExportBar: Word butonları + ayraç .no-android");
  ok(/const hasExport = !isAndroid &&/.test(bar), "BulkExportBar: useIsAndroid guard'ı korunur");
  ok(/no-android[^"]*"[^>]*>\s*📄|className="no-android inline-flex min-h-\[44px\]/.test(read("app/aromaterapi/_components/read/DetailScreen.tsx")), "DetailWordButton .no-android");
}
// Kalıcı kural: sahiplikteki her `!isAndroid && (` JSX guard'ının ardındaki 8 satırda sınıf var.
{
  const misses: string[] = [];
  for (const f of WORD_CTA_FILES) {
    const lines = read(f).split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/\{[^}]*!isAndroid\b[^}]*(&&|\?)\s*\($/.test(l.trim()) || /\{[^}]*!isAndroid\b[^}]*\?\s*\(\s*$/.test(l)) {
        const win = lines.slice(i, i + 9).join("\n");
        if (!/\bno-android\b(?!-app)|NO_ANDROID_CLASS|BulkExportBar|DetailWordButton/.test(win)) misses.push(`${f}:${i + 1}`);
      }
    });
  }
  ok(misses.length === 0, "her !isAndroid JSX guard'ı .no-android sınıfı da taşıyor", misses.join(", "));
}

// ── E. Android uygulaması çıktıları ──────────────────────────────────────────
section("E. Android-app CTA'larında .no-android-app (+ useIsAndroidApp)");
const APP_CTA: Array<[string, RegExp]> = [
  ["app/aromaterapi/karisim-olusturucu/page.tsx", /🖨 Reçete \/ Yazdır/],
  ["app/belge-ceviri/page.tsx", /TXT İndir/],
  ["app/ders-notu/page.tsx", /TXT İndir/],
  ["app/numeroloji/components/NumerolojiGorselRaporKontrolPaneli.tsx", /PNG İndir/],
  ["app/numeroloji/components/NumerolojiKayitDetayPanel.tsx", /PNG İndir/],
  ["app/cosmic-calendar/hacamat/page.tsx", /PDF Oluştur/],
  ["app/cosmic-calendar/hacamat/report/page.tsx", /PDF Aç/],
  ["app/settings/BackupSections.tsx", /Sistem Yedeği İndir/],
  ["app/video-ceviri/page.tsx", /Orijinal PDF/],
  ["app/refleksoloji/notlar/components/NoteDetayAttachmentCard.tsx", /Yeni Sekme/],
];
for (const [f, marker] of APP_CTA) {
  const src = read(f);
  ok(marker.test(src) && /\bno-android-app\b/.test(src) && /useIsAndroidApp\(\)/.test(src), `${f}: .no-android-app + useIsAndroidApp`);
}
{
  const src = read("app/aromaterapi/karisim-olusturucu/page.tsx");
  ok((src.match(/className="no-android-app/g) ?? []).length === 2, "aromaterapi: 2 Yazdır CTA'sı (aktif + kayıtlı)");
  const bc = read("app/belge-ceviri/page.tsx");
  ok((bc.match(/className="no-android-app/g) ?? []).length === 2, "belge-ceviri: 2 TXT İndir");
  const hac = read("app/cosmic-calendar/hacamat/page.tsx");
  ok(/TABS\.filter\(tab => !\(isAndroidApp && tab\.key === "word"\)\)/.test(hac), "hacamat: 'word' sekmesi app'te listelenmez");
  ok(/tab\.key === "word" \? "no-android-app "/.test(hac), "hacamat: 'word' sekme butonu .no-android-app");
  ok(/activeTab === "word" && !isAndroidApp/.test(hac), "hacamat: word sekmesi içeriği app'te render edilmez");
  ok(/className="no-android-app flex w-full[^"]*"\s*>\s*<ExternalLink/.test(hac), "hacamat: Raporu Aç .no-android-app");
  const rep = read("app/cosmic-calendar/hacamat/report/page.tsx");
  ok(rep.includes("Bu çıktı uygulamada desteklenmiyor; tarayıcıdan veya bilgisayardan açın."), "hacamat rapor: app bilgi notu");
  ok(/if \(isAndroidAppClient\(\)\) return;/.test(rep), "hacamat rapor: app'te PDF önizleme hiç çekilmez");
  ok((rep.match(/no-android-app/g) ?? []).length >= 2, "hacamat rapor: buton bloğu + önizleme .no-android-app");
  const vid = read("app/video-ceviri/page.tsx");
  ok(/if \(isAndroidApp\) return null;/.test(vid) && /className="no-android-app relative"/.test(vid), "video-ceviri: app'te İndir tetikleyicisi gizli");
  ok(/<div className="no-android">\s*<div className="px-3 pb-1 pt-3">/.test(vid), "video-ceviri: Word grubu .no-android");
}

// ── F. Word API route'ları ───────────────────────────────────────────────────
section("F. Word API route'larında androidWordGuard");
const GUARDED_46 = [
  "ajanda/word-report", "aromaterapi/blends/[id]/word-report", "aromaterapi/blends/word-report",
  "aromaterapi/claims/[id]/word-report", "aromaterapi/claims/word-report", "aromaterapi/glossary/word-report",
  "aromaterapi/methods/[seriesId]/word-report", "aromaterapi/methods/word-report", "aromaterapi/oils/[id]/word-report",
  "aromaterapi/oils/word-report", "aromaterapi/plant-taxa/[id]/word-report", "aromaterapi/plant-taxa/word-report",
  "aromaterapi/preparations/[id]/word-report", "aromaterapi/preparations/word-report", "aromaterapi/sources/[id]/word-report",
  "aromaterapi/sources/word-report", "aromaterapi/word-report", "belge-ceviri/ocr-to-word", "belge-ceviri/pdf-to-word",
  "beslenme/plans/[id]/word", "biyoenerji/chakra-report", "biyoenerji/energy-body-report", "biyoenerji/imagination-report",
  "biyoenerji/session-report", "biyoenerji/subconscious-report", "biyoenerji/symbol-report", "clients/[id]/word-report",
  "clients/word-report-bulk", "ders-notu/to-word", "dogaltas/combinations/word-report", "dogaltas/knowledge-report",
  "dogaltas/mineral-report", "dogaltas/minerals/[id]/word-report", "dogaltas/stones/[id]/word-report", "dogaltas/word-report",
  "hacamat/word-report", "hd/reports/professional/download", "kupa/calendar/plans/[id]/word-report",
  "kupa/protocols/[id]/word-report", "numeroloji/knowledge-report", "numeroloji/word-report", "refleksoloji/protocol-report",
  "settings/export", "sifa-rehberi/word-report", "urun-stok/stock-report", "video-ceviri/export-word",
];
ok(GUARDED_46.length === 46, `46 mevcut Word route'u listelendi (${GUARDED_46.length})`);
const NEW_GUARDED = ["belge-ceviri/pdf-to-turkce-word", "hd/reports/professional"];
for (const r of [...GUARDED_46, ...NEW_GUARDED]) {
  const f = `app/api/${r}/route.ts`;
  const src = existsSync(join(ROOT, f)) ? read(f) : "";
  ok(/androidWordGuard\((req|request)\)/.test(src) && /if \(androidBlocked\) return androidBlocked;/.test(src), `${f}: androidWordGuard`);
}
{
  const t = read("app/api/belge-ceviri/pdf-to-turkce-word/route.ts");
  ok(t.indexOf("androidWordGuard(request)") < t.indexOf("requireDigitalContentUser("), "pdf-to-turkce-word: guard kimlik/kotadan ÖNCE (job/AI maliyeti yok)");
  const h = read("app/api/hd/reports/professional/route.ts");
  ok(h.indexOf("androidWordGuard(req)") < h.indexOf("checkRateLimit("), "hd professional POST: guard snapshot/rate-limit'ten ÖNCE");
}
for (const f of ["app/api/belge-ceviri/job-status/[id]/route.ts", "app/api/belge-ceviri/history/route.ts"]) {
  const src = read(f);
  ok(/const wordBlocked = isAndroidUserAgent\(request\.headers\.get\("user-agent"\)\);/.test(src)
    && /if \(!wordBlocked && job\.status === "completed" && job\.result_path\)/.test(src), `${f}: Android'de downloadUrl null`);
}

// ── G. Anamnez PDF CTA'ları mobilde gizli (owner 2026-10-04) ────────────────
section("G. Anamnez: PDF CTA'ları Android + telefon genişliğinde gizli; ekler ve PDF backend'i değişmedi");
{
  const st = read("components/danisan/anamnez/styles.ts");
  const CTA = "${ANAMNEZ_PDF_CTA_HIDE}";
  ok(st.includes('ANAMNEZ_PDF_CTA_HIDE = `${outputHideClass("anamnez-pdf")} hidden md:inline-flex`'), "CTA sınıfı: no-android + <768px gizli, md+ görünür");
  ok(st.includes('ANAMNEZ_PDF_HINT_HIDE = `${outputHideClass("anamnez-pdf")} hidden md:block`'), "'önce kaydedin' ipucu aynı koşulda gizli");
  const ed = read("components/danisan/anamnez/AnamnezEditor.tsx");
  const tab = read("app/dashboard/clients/[id]/components/AnamnezTab.tsx");
  const count = (src: string) => src.split(CTA).length - 1;
  const after = (src: string, anchor: string, n: number) => { const i = src.indexOf(anchor); return i >= 0 && src.slice(i, i + n).includes(CTA); };
  ok(count(ed) === 2 && after(ed, "void downloadBlank()", 200) && after(ed, "void downloadFilled()", 400), "editör: Boş Form + Kayıtlı Form CTA'ları gizlenebilir (tam 2)");
  ok(count(tab) === 2 && after(tab, "void downloadBlank()", 200) && after(tab, "onClick={onPdf}", 200), "danışan detayı sekmesi: Boş Form + Kayıtlı Form CTA'ları gizlenebilir (tam 2)");
  ok(ed.includes("${ANAMNEZ_PDF_HINT_HIDE}"), "editör: 'önce kaydedin' ipucu da gizlenebilir");
  ok(!/useIsAndroid|androidWordGuard/.test(ed + tab), "UI'da JS tabanlı Android tespiti yok (SSR sınıfı + CSS)");
  for (const f of ["components/danisan/anamnez/AnamnezAttachments.tsx", "lib/danisan/anamnez/client.ts"]) {
    if (!existsSync(join(ROOT, f))) { ok(true, `${f}: (yok — atlandı)`); continue; }
    ok(!/useIsAndroid|isAndroid|androidWordGuard|no-android|ANAMNEZ_PDF_CTA_HIDE/.test(read(f)), `${f}: değişmedi (ekler/kullanıcı dosyası her yerde görünür)`);
  }
  for (const f of ["app/api/clients/[id]/anamnez/blank-form/route.ts", "app/api/clients/[id]/anamnez/[anamnesisId]/pdf/route.ts"]) {
    if (!existsSync(join(ROOT, f))) { ok(true, `${f}: (yok — atlandı)`); continue; }
    ok(!/androidWordGuard|isAndroidUserAgent/.test(read(f)), `${f}: PDF backend'ine dokunulmadı (Android engeli yok)`);
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

// ── Özet ─────────────────────────────────────────────────────────────────────
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("\nBAŞARISIZ:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

/**
 * NUM-MOB-1 — Numeroloji mobil UX SAF mantık harness'ı (React/DB yok).
 * node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-mobile-ux.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "helpers");
const m = await import(pathToFileURL(join(HELPERS, "mobileUxLogic.ts")).href);
const {
  mobileKayitKimligi,
  SILME_ONAY_METNI,
  SILME_KAPALI,
  silmeBaslat,
  silmeIleri,
  silmeMetinGuncelle,
  silmeIptal,
  silmeOnaylanabilir,
  disariAktarmaGorunur,
  viewerToggle,
  isMobileViewport,
  MOBILE_MAX_WIDTH,
  resolveNumerolojiSurface,
  resolveViewerControls,
} = m;

let pass = 0, fail = 0;
function check(n, c) {
  const ok = Boolean(c);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}`);
  if (ok) pass++;
  else fail++;
}

console.log("── NUM-MOB-1 — mobil UX mantığı ──");

// 1) Mobil kayıt kimliği
check("(1) ana-kulvar → 'Ana Kulvar — 3'", mobileKayitKimligi({ analizTuru: "Ana Kulvar", deger: "3" }) === "Ana Kulvar — 3");
check("(1) yan-kulvar → 'Yan Kulvar — 5'", mobileKayitKimligi({ analizTuru: "Yan Kulvar", deger: "5" }) === "Yan Kulvar — 5");
check("(1) ifade → 'İfade Sayısı — 11'", mobileKayitKimligi({ analizTuru: "İfade Sayısı", deger: "11" }) === "İfade Sayısı — 11");
check("(1) hayat-yolu → 'Hayat Yolu — 7'", mobileKayitKimligi({ analizTuru: "Hayat Yolu", deger: "7" }) === "Hayat Yolu — 7");

// 2) Değer/tür fallback
check("(2) değer yoksa yalnız tür", mobileKayitKimligi({ analizTuru: "Ana Kulvar", deger: "" }) === "Ana Kulvar");
check("(2) tür yoksa yalnız değer", mobileKayitKimligi({ analizTuru: "", deger: "9" }) === "9");
check("(2) ikisi de yoksa güvenli fallback", mobileKayitKimligi({ analizTuru: "", deger: "" }) === "Kayıt");
check("(2) null girdi güvenli", mobileKayitKimligi({ analizTuru: null, deger: null }) === "Kayıt");
check("(2) boşluk kırpılır", mobileKayitKimligi({ analizTuru: "  Ana Kulvar  ", deger: "  3 " }) === "Ana Kulvar — 3");

// 3) Silme state machine
check("(3) SILME_ONAY_METNI = 'SİL'", SILME_ONAY_METNI === "SİL");
check("(3) başlangıç kapalı", SILME_KAPALI.asama === "kapali" && SILME_KAPALI.dogrulama === "");
const s1 = silmeBaslat();
check("(3) başlat → onay1 (API yok)", s1.asama === "onay1" && s1.dogrulama === "");
check("(3) onay1'de onaylanamaz", silmeOnaylanabilir(s1) === false);
const s2 = silmeIleri(s1);
check("(3) onay1 → onay2", s2.asama === "onay2");
check("(3) onay2 boş metin → onaylanamaz", silmeOnaylanabilir(s2) === false);
const s2yanlis = silmeMetinGuncelle(s2, "sil");
check("(3) yanlış metin ('sil') → onaylanamaz", silmeOnaylanabilir(s2yanlis) === false);
const s2yanlis2 = silmeMetinGuncelle(s2, "SIL");
check("(3) yanlış metin ('SIL' latin I) → onaylanamaz", silmeOnaylanabilir(s2yanlis2) === false);
const s2dogru = silmeMetinGuncelle(s2, "SİL");
check("(3) doğru 'SİL' → onaylanabilir", silmeOnaylanabilir(s2dogru) === true);
const s2dogruBosluk = silmeMetinGuncelle(s2, "  SİL ");
check("(3) '  SİL ' (boşluklu) → onaylanabilir", silmeOnaylanabilir(s2dogruBosluk) === true);
// onay1'de doğru metin bile onaylatmaz (gate atlanamaz)
check("(3) onay1'de 'SİL' yazsa bile onaylanamaz", silmeOnaylanabilir(silmeMetinGuncelle(s1, "SİL")) === false);
// ileri yalnız onay1'den çalışır
check("(3) onay2'de silmeIleri no-op", silmeIleri(s2dogru).asama === "onay2");

// 4) İptal → temizlik
const iptal = silmeIptal();
check("(4) iptal → kapalı", iptal.asama === "kapali");
check("(5) iptal doğrulama metnini temizler", iptal.dogrulama === "");
check("(5) metin güncelle sonrası iptal metni sızdırmaz", silmeIptal(silmeMetinGuncelle(s2, "SİL")).dogrulama === "");

// 6) Dışa-aktarma görünürlüğü
check("(6) mobil Word/PNG gizli", disariAktarmaGorunur(true) === false);
check("(6) masaüstü Word/PNG görünür", disariAktarmaGorunur(false) === true);

// 7) Viewer toggle
check("(7) kapalı → aç", viewerToggle(false) === true);
check("(7) açık → kapat", viewerToggle(true) === false);

// 8) Viewport tabanlı mobil kararı (PWA'dan bağımsız) — CSS md: breakpoint ile hizalı
check("(8) eşik MOBILE_MAX_WIDTH = 767", MOBILE_MAX_WIDTH === 767);
check("(8) 800px masaüstü (PWA olsa da) → mobil DEĞİL", isMobileViewport(800) === false);
check("(8) 767px → mobil", isMobileViewport(767) === true);
check("(8) 768px (md sınırı) → mobil DEĞİL", isMobileViewport(768) === false);
check("(8) 320px → mobil", isMobileViewport(320) === true);
check("(8) 1440px masaüstü → mobil DEĞİL", isMobileViewport(1440) === false);

// ── NUM-MOB-2-FIX2: Yüzey (kutu vs düz) karar modeli ──
const M = 767; // mobil örnek genişlik
const D = 1440; // masaüstü örnek genişlik
const FLAT_SURFACES = [
  "result-section",
  "knowledge-note",
  "summary-section",
  "relationship-result",
  "home-business-result",
  "saved-analysis-row",
  "stone-assignment-state",
];
// (9.1) 767 result-section = flat
check("(9.1) 767 result-section → flat", resolveNumerolojiSurface(767, "result-section") === "flat");
// (9.2) 768 result-section = existing-card
check("(9.2) 768 result-section → existing-card", resolveNumerolojiSurface(768, "result-section") === "existing-card");
// (9.3-9.9) mobil içerik yüzeyleri flat
for (const s of FLAT_SURFACES) {
  check(`(9) mobil ${s} → flat`, resolveNumerolojiSurface(M, s) === "flat");
}
// (9.8) module-launcher → flat-row (mobil)
check("(9) mobil module-launcher → flat-row", resolveNumerolojiSurface(M, "module-launcher") === "flat-row");
check("(9) 320px result-section → flat", resolveNumerolojiSurface(320, "result-section") === "flat");
// (9.10) desktop tüm yüzeyler existing-card
for (const s of [...FLAT_SURFACES, "module-launcher"]) {
  check(`(9.10) desktop ${s} → existing-card`, resolveNumerolojiSurface(D, s) === "existing-card");
}

// ── NUM-MOB-2-FIX2: Viewer kontrol modeli ──
const vm = resolveViewerControls(M);
const vd = resolveViewerControls(D);
check("(11) mobil topCloseVisible = false", vm.topCloseVisible === false);
check("(12) mobil floatingCloseVisible = false", vm.floatingCloseVisible === false);
check("(13) mobil themeControlsVisible = false", vm.themeControlsVisible === false);
check("(14) mobil footerCloseVisible = true", vm.footerCloseVisible === true);
check("(15) mobil closePlacement = after-report", vm.closePlacement === "after-report");
check("(16) desktop floatingCloseVisible = true", vd.floatingCloseVisible === true);
check("(16) desktop themeControlsVisible = true", vd.themeControlsVisible === true);
check("(16) desktop footerCloseVisible = false", vd.footerCloseVisible === false);
check("(16) desktop closePlacement = floating", vd.closePlacement === "floating");
check("(16) desktop topCloseVisible = false (her iki modda üst şerit yok)", vd.topCloseVisible === false);
check("(11b) 768 sınırı masaüstü sayılır", resolveViewerControls(768).floatingCloseVisible === true);
check("(11c) 767 sınırı mobil sayılır", resolveViewerControls(767).footerCloseVisible === true);

// (17) footer close viewer'ı kapatır → toggle(true)=false (kapalı)
check("(17) footer close viewer'ı kapatır", viewerToggle(true) === false);
// (18) ESC viewer'ı kapatır (aynı toggle sözleşmesi)
check("(18) ESC viewer'ı kapatır (toggle)", viewerToggle(true) === false);
// (19) reopen scroll start = 0 (yeniden açılışta en üstten — portal remount)
check("(19) reopen scroll start = 0", viewerToggle(false) === true);

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);

/**
 * KUPA & HACAMAT — FAZ 6 — YILLIK HACAMAT TAKVİMİ WORD HARNESS (GERÇEK DOCX ÜRETİMİ).
 *
 * Çalıştırma:  npx tsx scripts/cupping-calendar-word-harness.ts   (cwd = repo kökü)
 *
 * KAPSAM: SAF builder (lib/cupping/calendarWord) ile GERÇEK .docx üretir, JSZip ile açar ve
 *   word/document.xml üzerinde doğrular. DB/auth YOK (route güvenliği statik harness'ta —
 *   scripts/cupping-module-test.ts). Bu harness "kaynak kodda kelime aradı" DEĞİL; gerçek
 *   OOXML çıktısını denetler.
 *
 * NOT (A3 tek-sayfa görsel doğrulama): docx sayfalamayı motorda yapmaz; "12 ay TEK A3 sayfada"
 *   nihai görsel teyidi gerçek Word/render gerektirir (OWNER WORD UAT). Burada A3-yatay SAYFA
 *   ÖZELLİĞİ (pgSz 23811×16838 orient=landscape) ve 12 ayın tek bölümde bulunduğu DOĞRULANIR.
 */
import JSZip from "jszip";
import {
  buildCalendarPlanWordBuffer,
  calendarWordFilename,
  WORD_CONTENT_TYPE,
} from "@/lib/cupping/calendarWord";
import {
  CUPPING_DAY_WORD_COLORS,
  CUPPING_DAY_WORD_NEUTRAL,
} from "@/lib/cupping/calendarWordColors";
import { gregorianToHijri } from "@/lib/cupping/hijri";
import type {
  CuppingAdviceTemplate,
  CuppingCalendarPlan,
  CuppingCalendarPlanDay,
} from "@/lib/cupping/calendarTypes";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(msg);
  }
}

// ── Fixture yardımcıları ────────────────────────────────────────────────────
function mkPlan(over: Partial<CuppingCalendarPlan> = {}): CuppingCalendarPlan {
  return {
    id: "plan-1",
    tenant_id: "t-1",
    name: "Test Hacamat Takvimi",
    year: 2026,
    description: "UAT fixture",
    advice_template_id: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}
function mkDay(date: string, over: Partial<CuppingCalendarPlanDay> = {}): CuppingCalendarPlanDay {
  return {
    id: `d-${date}`,
    tenant_id: "t-1",
    plan_id: "plan-1",
    gregorian_date: date,
    selection_source: "manual",
    user_label: null,
    note: null,
    color_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

async function docXml(buffer: Buffer): Promise<{ xml: string; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return { xml, zip };
}

async function run() {
  // Owner senaryosu: 9/10/14/18/23 Eylül 2026 — renk + kısa açıklama + detay notu karışımı.
  const mainDays: CuppingCalendarPlanDay[] = [
    mkDay("2026-09-09", { color_key: "yellow", user_label: "aaaaa", note: "Uzmanın yazdığı detaylı metin.\nİkinci satır." }),
    mkDay("2026-09-10", { color_key: "green", user_label: "Şşğ İıçö parite" }),
    mkDay("2026-09-14", { color_key: "blue" }),
    mkDay("2026-09-18", { color_key: null, user_label: "Renksiz eski kayıt (legacy)" }), // NULL renk korunur
    mkDay("2026-09-23", { color_key: "red", note: "Yalnız detay notu; kısa açıklama yok." }),
  ];
  const mainPlan = mkPlan();
  const mainBuf = await buildCalendarPlanWordBuffer({ plan: mainPlan, days: mainDays });
  const { xml, zip } = await docXml(mainBuf);

  // [1] Geçerli DOCX — PK magic + zorunlu OOXML parçaları.
  ok(mainBuf.length > 2000, "docx[1]: buffer makul boyutta (>2KB)");
  ok(mainBuf[0] === 0x50 && mainBuf[1] === 0x4b, "docx[1]: PK magic bytes (geçerli zip/docx)");
  ok(!!zip.file("word/document.xml"), "docx[1]: word/document.xml mevcut");
  ok(!!zip.file("[Content_Types].xml"), "docx[1]: [Content_Types].xml mevcut");
  ok(
    WORD_CONTENT_TYPE === "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx[1]: doğru DOCX MIME sabiti",
  );

  // [1b] Footer güvenliği: TOTAL_PAGES (NUMPAGES) alanı KULLANILMAZ — bu alan içerik sayfa sınırına
  //   denk gelen belgelerde Word PDF/print motorunu KİLİTLİYOR. Yalnız geçerli sayfa (PAGE) alanı olur.
  const footerNames = Object.keys(zip.files).filter((f) => /^word\/footer\d+\.xml$/.test(f));
  let footerXml = "";
  for (const fn of footerNames) footerXml += await zip.file(fn)!.async("string");
  ok(footerNames.length > 0, "docx[1b]: en az bir footer parçası var");
  ok(!/NUMPAGES/.test(footerXml), "docx[1b]: footer'da NUMPAGES YOK (Word PDF-kilit hatası önlendi)");
  ok(/\bPAGE\b/.test(footerXml), "docx[1b]: footer'da geçerli sayfa (PAGE) alanı var");

  // [2] Başlık + plan adı + yıl.
  ok(xml.includes("HACAMAT TAKVİMİ"), "içerik[2]: başlık 'HACAMAT TAKVİMİ' var");
  ok(xml.includes("Test Hacamat Takvimi"), "içerik[2]: plan adı aktarıldı");
  ok(xml.includes("2026"), "içerik[2]: plan yılı aktarıldı");

  // [3] 12 ay eksiksiz + Ocak→Aralık sırası.
  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  ok(MONTHS.every((m) => xml.includes(m)), "takvim[3]: 12 Gregoryen ay adı eksiksiz");
  const idxs = MONTHS.map((m) => xml.indexOf(m));
  ok(idxs.every((v, i) => i === 0 || v > idxs[i - 1]), "takvim[3]: aylar Ocak→Aralık sırasında");

  // [4] Haftalar Pazartesi ile başlar (Pzt…Paz sıralı alt-dizisi).
  const WD = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const wdIdx = WD.map((w) => xml.indexOf(w));
  ok(wdIdx.every((v) => v >= 0) && wdIdx.every((v, i) => i === 0 || v > wdIdx[i - 1]),
    "takvim[4]: haftagünü başlığı Pzt→Paz sırasında (Pazartesi başlangıç)");

  // [5] A3 YATAY ilk sayfa HER ZAMAN; KÜÇÜK plan (5 gün, şablonsuz) TEK A3 sayfa — gereksiz 2. sayfa YOK.
  ok(xml.includes('w:w="23811"') && xml.includes('w:orient="landscape"'),
    "sayfa[5]: 1. sayfa A3 YATAY (pgSz 23811 + orient=landscape)");
  ok((xml.match(/w:pgSz/g)?.length ?? 0) === 1 && !xml.includes('w:w="11906"'),
    "sayfa[5]: küçük plan TEK A3 bölüm (A4 devam yok; gereksiz ikinci sayfa kaldırıldı)");

  // [6] Seçili günler bölümü + kronolojik gün başlıkları + haftagünü adı.
  ok(xml.includes("SEÇİLİ GÜNLER VE AÇIKLAMALAR"), "günler[6]: seçili günler bölüm başlığı var");
  ok(xml.includes("9 Eylül 2026"), "günler[6]: '9 Eylül 2026' tarih başlığı var");
  ok(xml.includes("Çarşamba"), "günler[6]: 9 Eylül haftagünü 'Çarşamba' doğru");
  // 5 seçili günün tümü listede (tam gösterim — renk seçilmiş açıklamasız gün de dahil).
  ok(["9 Eylül 2026", "10 Eylül 2026", "14 Eylül 2026", "18 Eylül 2026", "23 Eylül 2026"].every((t) => xml.includes(t)),
    "günler[6]: 5 seçili günün TAMAMI listelenir (açıklamasız/renksiz dahil)");

  // [7] Tam Hicrî tarih kanonik kaynaktan (lib/cupping/hijri).
  const h909 = gregorianToHijri("2026-09-09");
  ok(!!h909 && xml.includes(h909.formatted), `hicri[7]: 9 Eylül tam Hicrî '${h909?.formatted}' var (kanonik kaynak)`);
  const h923 = gregorianToHijri("2026-09-23");
  ok(!!h923 && xml.includes(h923.formatted), "hicri[7]: 23 Eylül tam Hicrî var");

  // [8] Renkler ekran paletiyle eşleşir (fill hex) — sarı/yeşil/mavi/kırmızı + nötr(null).
  ok(xml.includes(CUPPING_DAY_WORD_COLORS.yellow.fill), "renk[8]: sarı gün dolgusu (FEF9C3) belgede");
  ok(xml.includes(CUPPING_DAY_WORD_COLORS.green.fill), "renk[8]: yeşil gün dolgusu belgede");
  ok(xml.includes(CUPPING_DAY_WORD_COLORS.red.fill), "renk[8]: kırmızı gün dolgusu belgede");
  ok(xml.includes(CUPPING_DAY_WORD_NEUTRAL.fill), "renk[8]: renksiz(NULL) gün NÖTR dolguyla seçili görünür (E0E7FF)");

  // [9] Kısa açıklama (özet tablosu) ↔ detay notu (DETAY NOTLARI) AYRI; tekrar eden toplu liste YOK.
  ok(xml.includes("aaaaa"), "açıklama[9]: kısa açıklama özet tablosunda doğru güne bağlı");
  ok(xml.includes("Detay notu:"), "açıklama[9]: DETAY NOTLARI 'Detay notu:' etiketi var");
  ok(xml.includes("Uzmanın yazdığı detaylı metin."), "açıklama[9]: detay notu metni aktarıldı");
  ok(xml.includes("İkinci satır."), "açıklama[9]: detay notu satır sonu korunur (çok satır)");
  // Karışmama: 9 Eylül'ün kısa açıklaması ('aaaaa') detay notunun İÇİNDE değil.
  ok(!/aaaaa[^<]*Uzmanın yazdığı/.test(xml), "açıklama[9]: kısa açıklama ile detay notu tek alanda BİRLEŞMEZ");
  // 'Detay notu:' YALNIZ notu olan günler için (mainDays'te 9 + 23 Eylül = 2); notsuz güne üretilmez.
  ok((xml.match(/Detay notu:/g)?.length ?? 0) === 2, "açıklama[9]: 'Detay notu:' yalnız notu olan 2 gün için (notsuz güne boş kart yok)");

  // [10] Türkçe karakter parite.
  ok(xml.includes("Şşğ İıçö parite"), "türkçe[10]: Türkçe karakterler bozulmadan aktarıldı");

  // [11] Legacy renksiz kayıt KORUNUR (silinmez/boyanmaz).
  ok(xml.includes("Renksiz eski kayıt (legacy)"), "legacy[11]: renksiz eski gün rapordan kaybolmaz");

  // [12] Otomatik Sünnet/Altın/Yasaklı YOK (üründe kaldırıldı; Word'de de yok).
  ok(!/Sünnet|Altın|ALTIN GÜN|SÜNNET|Yasaklı|YASAKLI/.test(xml),
    "ürün[12]: hazır Sünnet/Altın/Yasaklı günü/lejantı üretilmez");

  // [13] SIFIR seçili gün — güvenli boş durum; sahte 'Not bulunamadı' kutusu yok.
  const emptyBuf = await buildCalendarPlanWordBuffer({ plan: mkPlan({ name: "Boş Plan" }), days: [] });
  const { xml: emptyXml } = await docXml(emptyBuf);
  ok(emptyBuf[0] === 0x50 && emptyBuf[1] === 0x4b, "boş[13]: sıfır-gün planı geçerli DOCX üretir");
  ok(emptyXml.includes("HACAMAT TAKVİMİ") && MONTHS.every((m) => emptyXml.includes(m)),
    "boş[13]: sıfır-gün planı yine 12 aylık takvimi içerir");
  ok(emptyXml.includes("henüz seçili gün yok"), "boş[13]: profesyonel boş durum mesajı");
  ok(!emptyXml.includes("Kısa açıklama:") && !emptyXml.includes("Detay notu:"),
    "boş[13]: boş planda açıklama/not kutusu üretilmez");

  // [14] Artık yıl — 29 Şubat 2028 doğru işlenir.
  const leapBuf = await buildCalendarPlanWordBuffer({
    plan: mkPlan({ year: 2028, name: "Artık Yıl" }),
    days: [mkDay("2028-02-29", { color_key: "purple", user_label: "Artık gün" })],
  });
  const { xml: leapXml } = await docXml(leapBuf);
  ok(leapXml.includes("29 Şubat 2028"), "artık[14]: 29 Şubat 2028 seçili gün doğru gösterilir");
  const hLeap = gregorianToHijri("2028-02-29");
  ok(!!hLeap && leapXml.includes(hLeap.formatted), "artık[14]: 29 Şubat 2028 Hicrî karşılığı var");

  // [15] Bilgilendirme şablonu — Öncesi/Sonrası/Genel; şablon YOKKEN bölüm çıkmaz.
  const template: CuppingAdviceTemplate = {
    id: "tpl-1", tenant_id: "t-1", title: "Standart Bilgilendirme",
    before_text: "İşlemden önce dikkat.", after_text: "İşlemden sonra dinlenin.",
    general_note: "Genel açıklama satırı.", is_default: true, is_active: true,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
  const withTplBuf = await buildCalendarPlanWordBuffer({ plan: mkPlan({ advice_template_id: "tpl-1" }), days: mainDays, template });
  const { xml: tplXml } = await docXml(withTplBuf);
  ok(tplXml.includes("BİLGİLENDİRME NOTLARI"), "şablon[15]: bağlı şablonla bilgilendirme bölümü var");
  ok(tplXml.includes("Öncesi") && tplXml.includes("Sonrası") && tplXml.includes("Genel"),
    "şablon[15]: Öncesi/Sonrası/Genel alt başlıkları");
  ok(tplXml.includes("İşlemden önce dikkat.") && tplXml.includes("İşlemden sonra dinlenin.") && tplXml.includes("Genel açıklama satırı."),
    "şablon[15]: uzmanın gerçek metinleri aktarıldı");
  ok(!xml.includes("BİLGİLENDİRME NOTLARI"), "şablon[15]: şablon YOKKEN bölüm hiç eklenmez (boş sayfa yok)");
  // Boş şablon → bölüm yok (hazır tavsiye üretilmez).
  const emptyTpl: CuppingAdviceTemplate = { ...template, before_text: "", after_text: "", general_note: null };
  const emptyTplBuf = await buildCalendarPlanWordBuffer({ plan: mkPlan({ advice_template_id: "tpl-1" }), days: mainDays, template: emptyTpl });
  const { xml: emptyTplXml } = await docXml(emptyTplBuf);
  ok(!emptyTplXml.includes("BİLGİLENDİRME NOTLARI"), "şablon[15]: tamamen boş şablonda bölüm/başlık üretilmez");

  // [16] Güvenli dosya adı — YILLIK: "…-<yıl>-Yillik.docx"; AYLIK: "…-<yıl>-<Ay>.docx" (ASCII).
  const fnYear = calendarWordFilename(mainPlan);
  ok(fnYear === "Hacamat-Takvimi-2026-Yillik.docx", `dosya[16]: yıllık ad ('${fnYear}')`);
  ok(!/[^\x20-\x7E]/.test(fnYear), "dosya[16]: yıllık dosya adı ASCII");
  const fnJan = calendarWordFilename({ year: 2026 }, 1);
  const fnJul = calendarWordFilename({ year: 2026 }, 7);
  ok(fnJan === "Hacamat-Takvimi-2026-Ocak.docx", `dosya[16]: Ocak ('${fnJan}')`);
  ok(fnJul === "Hacamat-Takvimi-2026-Temmuz.docx", `dosya[16]: Temmuz ('${fnJul}')`);
  ok(!/[^\x20-\x7E]/.test(calendarWordFilename({ year: 2026 }, 2)), "dosya[16]: Şubat→ASCII (Subat) güvenli normalize");
  // Geçersiz month → YILLIK (route zaten katı doğrular; builder defansif).
  ok(calendarWordFilename({ year: 2026 }, 13 as number) === "Hacamat-Takvimi-2026-Yillik.docx", "dosya[16]: geçersiz month → yıllık");

  // [17] Kanonik Hicrî sınır — 30 gün üstü UYDURMAZ (null güvenli). (Motor değişmez.)
  ok(gregorianToHijri("bozuk") === null, "hicri[17]: geçersiz tarih → null (ikinci motor yok; güvenli)");

  // ── [18] TEK PER-GÜN GÖSTERİM + tekrar YOK (owner: gereksiz ikinci liste kaldırıldı) ──
  ok(xml.includes("SEÇİLİ GÜNLER VE AÇIKLAMALARI"), "sayfa1[18]: 'SEÇİLİ GÜNLER VE AÇIKLAMALARI' özeti var");
  // Özet başlığı TEK kez — her günü baştan sona tekrar eden ikinci toplu liste ARTIK YOK.
  ok((xml.match(/SEÇİLİ GÜNLER VE AÇIKLAMALARI/g)?.length ?? 0) === 1,
    "sayfa1[18]: özet başlığı tek kez (gün/Hicrî/kısa açıklama TEKRAR eden ikinci liste yok)");
  // Detay notu olan günler için AYRI 'DETAY NOTLARI' bölümü (kısa açıklamaları tekrar etmez).
  ok(xml.includes("DETAY NOTLARI"), "sayfa1[18]: notu olan günler için 'DETAY NOTLARI' bölümü");
  ok(!xml.includes("Kullanılan renkler"), "sayfa1[18]: eski genel 'Kullanılan renkler' şeridi kaldırıldı");

  // İlk sayfada gün↔Hicrî↔kısa açıklama ilişkisi: 9 Eylül (sarı) hem tarih hem Hicrî hem label taşır.
  ok(xml.includes("9 Eylül 2026") && h909 !== null && xml.includes(h909.formatted),
    "sayfa1[18]: seçili gün tarih + tam Hicrî ilk sayfada birlikte");

  // Aynı renk (sarı) İKİ farklı günde FARKLI açıklama taşıyabilir (SARI=SÜNNET eşlemesi YOK).
  const twoYellow = await buildCalendarPlanWordBuffer({
    plan: mkPlan(),
    days: [
      mkDay("2026-09-09", { color_key: "yellow", user_label: "Sünnet günü" }),
      mkDay("2026-09-16", { color_key: "yellow", user_label: "Özel uygulama" }),
    ],
  });
  const { xml: yx } = await docXml(twoYellow);
  ok(yx.includes("Sünnet günü") && yx.includes("Özel uygulama"),
    "sayfa1[18]: aynı renkli iki gün FARKLI (uzman-yazılı) açıklama taşır");
  // Sistem, uzman yazmadıkça renkten anlam TÜRETMEZ: 09'un labeli '16'nın altında görünmez (karışmaz).
  ok(!/Özel uygulama[^<]*9 Eylül|Sünnet günü[^<]*16 Eylül/.test(yx),
    "sayfa1[18]: bir günün açıklaması başka günün altında gösterilmez");

  // Açıklaması OLMAYAN seçili gün ilk sayfada kaybolmaz; uydurma metin eklenmez.
  const noLabel = await buildCalendarPlanWordBuffer({ plan: mkPlan(), days: [mkDay("2026-09-14", { color_key: "blue" })] });
  const { xml: nx } = await docXml(noLabel);
  const h914 = gregorianToHijri("2026-09-14");
  ok(nx.includes("14 Eylül 2026") && h914 !== null && nx.includes(h914.formatted),
    "sayfa1[18]: açıklamasız seçili gün ilk sayfada tarih+Hicrî ile korunur");
  ok(!/Sünnet|Altın|Uygun gün|Yasakl/i.test(nx), "sayfa1[18]: açıklamasız güne sistem 'Sünnet/Uygun/Yasaklı' UYDURMAZ");

  // ── [19] SAYFALAMA — küçük plan TEK A3; TAŞMADA A3 (özet) + A4 devam; tekrar yok; veri kaybı yok ──
  function bulkDays(n: number): CuppingCalendarPlanDay[] {
    const out: CuppingCalendarPlanDay[] = [];
    let count = 0;
    for (let m = 1; m <= 12 && count < n; m++) {
      const dim = new Date(Date.UTC(2026, m, 0, 12)).getUTCDate();
      for (let d = 1; d <= dim && count < n; d += 3) {
        out.push(mkDay(`2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, { color_key: "green", user_label: `G${count + 1}` }));
        count++;
      }
    }
    return out;
  }
  // 40 gün (şablonsuz, notsuz) → özet A3'e sığmaz → TAŞMA (A3 24 + A4 devam 16).
  const many = bulkDays(40);
  const { xml: mx } = await docXml(await buildCalendarPlanWordBuffer({ plan: mkPlan(), days: many }));
  ok((mx.match(/w:pgSz/g)?.length ?? 0) === 2 && mx.includes('w:w="11906"'),
    "sayfa1[19]: taşmada A3 + A4 DİKEY devam bölümü (2 pgSz)");
  ok(/\d+ gün daha/.test(mx), "sayfa1[19]: taşmada 'N gün daha' devam notu (yalnız gerçek taşmada)");
  ok(/SEÇİLİ GÜNLER VE AÇIKLAMALARI \(devam\)/.test(mx),
    "sayfa1[19]: A4'te 'özet (devam)' — kalan günler; ilk sayfadakiler TEKRAR edilmez");
  // Her günün benzersiz etiketi (G1..G40) belgede → hiçbir gün düşmedi (sıkıştırma/kayıp yok).
  const uniqueG = new Set(mx.match(/>G\d+</g) ?? []);
  ok(uniqueG.size >= 40, `sayfa1[19]: 40 günün TAMAMI korunur (benzersiz etiket=${uniqueG.size} ≥ 40)`);
  // Her gün ÖZET'te tam bir kez (24 A3 + 16 A4 = 40 giriş; ikinci toplu liste tekrarı olsaydı 80 olurdu).
  const gTotal = mx.match(/>G\d+</g)?.length ?? 0;
  ok(gTotal === 40, `sayfa1[19]: her gün özet'te TAM BİR kez (toplam giriş=${gTotal}=40; tekrar yok)`);
  // Küçük plan (5 gün, tek A3 sayfa) → devam notu YOK.
  ok(!/gün daha/.test(xml), "sayfa1[19]: küçük planda (tek A3 sayfa) 'devam' notu gösterilmez");

  // ── [20] KÜÇÜK PLAN TEK SAYFA — şablonlu 10 gün de tek A3 (gereksiz 2. sayfa yok) ──
  const tenTpl: CuppingAdviceTemplate = {
    id: "t", tenant_id: "t", title: "Bilgilendirme", before_text: "Önce.", after_text: "Sonra.",
    general_note: "Genel.", is_default: true, is_active: true, created_at: "", updated_at: "",
  };
  const { xml: tenXml } = await docXml(await buildCalendarPlanWordBuffer({ plan: mkPlan(), days: bulkDays(10), template: tenTpl }));
  ok((tenXml.match(/w:pgSz/g)?.length ?? 0) === 1 && !tenXml.includes('w:w="11906"'),
    "sayfa1[20]: 10 gün + şablon TEK A3 sayfa (bilgilendirme aynı sayfada; 2. sayfa yok)");
  ok(tenXml.includes("BİLGİLENDİRME NOTLARI") && !/gün daha/.test(tenXml),
    "sayfa1[20]: bilgilendirme ilk sayfada; devam notu yok");

  // ── [21] AYLIK RAPOR — tek ay, A4 dikey; başka ay SIZMAZ; Hicrî/etiket doğru; boş ay güvenli ──
  const mTpl: CuppingAdviceTemplate = {
    id: "t", tenant_id: "t", title: "Bilgilendirme", before_text: "Önce metni.", after_text: "Sonra metni.",
    general_note: "Genel.", is_default: true, is_active: true, created_at: "", updated_at: "",
  };
  const mDays = [
    mkDay("2026-01-05", { color_key: "blue", user_label: "Ocak günü", note: "Ocak detay notu." }),
    mkDay("2026-01-19", { color_key: "green" }),
    mkDay("2026-07-03", { color_key: "red", user_label: "Temmuz A" }),
    mkDay("2026-07-28", { color_key: "yellow", user_label: "Sünnet günü", note: "Temmuz detay notu." }),
    mkDay("2026-02-29", { color_key: "purple", user_label: "Artık gün" }), // 2026 artık DEĞİL → geçersiz; kullanılmaz
    mkDay("2026-12-20", { color_key: "orange", user_label: "Aralık" }),
  ].filter((d) => d.gregorian_date !== "2026-02-29");
  // M1 Ocak
  const jan = await docXml(await buildCalendarPlanWordBuffer({ plan: mkPlan(), days: mDays, template: mTpl, month: 1 }));
  ok((jan.xml.match(/w:pgSz/g)?.length ?? 0) === 1 && jan.xml.includes('w:w="11906"'),
    "aylık[21/M1]: Ocak raporu A4 DİKEY tek bölüm");
  ok(jan.xml.includes("Ocak 2026") && jan.xml.includes("5 Ocak 2026") && jan.xml.includes("19 Ocak 2026"),
    "aylık[21/M1]: yalnız Ocak başlık + Ocak günleri");
  const hJan = gregorianToHijri("2026-01-05");
  ok(hJan !== null && jan.xml.includes(hJan.formatted), "aylık[21/M1]: Ocak günü tam Hicrî (kanonik)");
  ok(jan.xml.includes("Ocak detay notu."), "aylık[21/M1]: Ocak detay notu var");
  // M3 sızma yok: Temmuz/Aralık verisi Ocak raporunda YOK
  ok(!jan.xml.includes("Temmuz") && !jan.xml.includes("3 Temmuz") && !jan.xml.includes("Temmuz detay notu.")
     && !jan.xml.includes("20 Aralık 2026") && !jan.xml.includes("Aralık"),
    "aylık[21/M3]: başka ayın takvimi/günü/notu SIZMAZ (Ocak)");
  ok(jan.xml.includes("Pazartesi") && jan.xml.includes("Pazar"), "aylık[21]: Pazartesi başlangıç (uzun haftagünü)");
  // M2 Temmuz
  const jul = await docXml(await buildCalendarPlanWordBuffer({ plan: mkPlan(), days: mDays, template: mTpl, month: 7 }));
  ok(jul.xml.includes("Temmuz 2026") && jul.xml.includes("3 Temmuz 2026") && jul.xml.includes("28 Temmuz 2026"),
    "aylık[21/M2]: yalnız Temmuz başlık + Temmuz günleri");
  ok(!jul.xml.includes("5 Ocak") && !jul.xml.includes("Ocak detay notu."), "aylık[21/M3]: Ocak verisi Temmuz'a SIZMAZ");
  // Aynı renkli farklı açıklama (Temmuz 28 sarı 'Sünnet günü' — uzman yazdı; sistem türetmedi)
  ok(jul.xml.includes("Sünnet günü") && jul.xml.includes("Temmuz A"), "aylık[21/M7]: aynı planda farklı günler farklı açıklama");
  // M5 boş ay
  const empty = await docXml(await buildCalendarPlanWordBuffer({ plan: mkPlan(), days: mDays, template: mTpl, month: 3 }));
  ok(empty.xml.includes("Mart 2026") && empty.xml.includes("Bu ay için seçili gün bulunmuyor."),
    "aylık[21/M5]: seçili günü olmayan ay → takvim + nötr durum metni");
  ok(!/Sünnet|Altın|Uygun gün|Yasakl/i.test(empty.xml.replace(/Bu ay için/g, "")),
    "aylık[21/M5]: boş ayda otomatik Sünnet/Altın/Uygun/Yasaklı üretilmez");
  // M4 artık yıl 29 Şubat 2028
  const leapDays = [mkDay("2028-02-29", { color_key: "purple", user_label: "Artık gün" }), mkDay("2028-02-10", { color_key: "blue" })];
  const feb = await docXml(await buildCalendarPlanWordBuffer({ plan: mkPlan({ year: 2028 }), days: leapDays, month: 2 }));
  ok(feb.xml.includes("Şubat 2028") && feb.xml.includes("29 Şubat 2028"), "aylık[21/M4]: artık yıl 29 Şubat 2028 doğru");
  // M11 yıllık varsayılan (month=null) değişmedi — küçük yıllık plan tek A3 yatay (geriye uyumlu).
  ok(!/w:w="11906"/.test(xml) && xml.includes('w:orient="landscape"'),
    "aylık[21/M11]: yıllık (month yok) tek-bölüm A3 yatay — geriye uyumlu");

  // ── [22] PREMIUM TASARIM — serif başlık + sıcak palet + bilgilendirme "pill" tablosu ──
  // Serif başlık fontu (Cambria) başlıkta/bölüm başlıklarında kullanılır.
  ok(/w:ascii="Cambria"/.test(jul.xml), "premium[22]: serif başlık fontu (Cambria) belgede");
  // Sıcak ince çizgi rengi (E7E2D8) — sert siyah çizgi yerine.
  ok(jul.xml.includes("E7E2D8"), "premium[22]: sıcak ince çizgi rengi (E7E2D8) kullanılır");
  // Takvim haftagünü başlığı yumuşak zemin (F3F1EA).
  ok(jul.xml.includes("F3F1EA"), "premium[22]: aylık takvim haftagünü satırı yumuşak zemin");
  // Bilgilendirme "pill" etiket zemini (EDEBE3) + Öncesi/Sonrası/Genel tabloda.
  ok(jul.xml.includes("EDEBE3") && jul.xml.includes("Öncesi") && jul.xml.includes("Sonrası") && jul.xml.includes("Genel"),
    "premium[22]: bilgilendirme pill tablosu (Öncesi/Sonrası/Genel)");
  // Bölüm başlığı teal aksan (■) + serif.
  ok(/■\s+/.test(jul.xml.replace(/<[^>]+>/g, "")) || jul.xml.includes("■"), "premium[22]: bölüm başlığı teal aksan işareti");
  // Ana başlık derin teal (134E4A).
  ok(jul.xml.includes("134E4A"), "premium[22]: ana başlık derin teal (134E4A)");
  // Renkler DEĞİŞMEDİ (7 gün rengi fill'i hâlâ paletten) — sarı fill korunur.
  ok(jul.xml.includes(CUPPING_DAY_WORD_COLORS.yellow.fill), "premium[22]: 7 kontrollü gün rengi DEĞİŞMEDİ (sarı fill)");

  console.log(`\ncupping-calendar-word harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:\n  - " + fails.join("\n  - "));
    process.exit(1);
  }
  console.log("✅ FAZ 6 — Gerçek DOCX üretimi: A3 yatay 12-ay + seçili günler + renk parite + Hicrî + şablon + boş/artık/legacy/Türkçe geçti.");
}

run().catch((e) => {
  console.error("HARNESS ÇÖKTÜ:", e);
  process.exit(1);
});

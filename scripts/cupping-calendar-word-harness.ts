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

  // [5] A3 YATAY ilk sayfa (pgSz) + A4 dikey ikinci sayfa.
  ok(/w:pgSz[^>]*w:w="23811"[^>]*w:h="16838"[^>]*w:orient="landscape"/.test(xml) ||
     /w:pgSz[^>]*w:orient="landscape"[^>]*w:w="23811"/.test(xml) ||
     (xml.includes('w:w="23811"') && xml.includes('w:orient="landscape"')),
    "sayfa[5]: 1. sayfa A3 YATAY (pgSz 23811 + orient=landscape)");
  ok(xml.includes('w:w="11906"'), "sayfa[5]: 2. sayfa A4 DİKEY (pgSz 11906)");
  ok((xml.match(/w:sectPr/g)?.length ?? 0) >= 2, "sayfa[5]: en az 2 ayrı bölüm (A3 + A4)");

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

  // [9] Kısa açıklama ↔ detay notu AYRI (birleştirilmez).
  ok(xml.includes("Kısa açıklama:"), "açıklama[9]: 'Kısa açıklama:' etiketi var");
  ok(xml.includes("Detay notu:"), "açıklama[9]: 'Detay notu:' etiketi var");
  ok(xml.includes("aaaaa"), "açıklama[9]: kısa açıklama metni doğru güne bağlı");
  ok(xml.includes("Uzmanın yazdığı detaylı metin."), "açıklama[9]: detay notu metni aktarıldı");
  ok(xml.includes("İkinci satır."), "açıklama[9]: detay notu satır sonu korunur (çok satır)");
  // Karışmama: 9 Eylül'ün kısa açıklaması ('aaaaa') detay notunun İÇİNDE değil.
  ok(!/aaaaa[^<]*Uzmanın yazdığı/.test(xml), "açıklama[9]: kısa açıklama ile detay notu tek alanda BİRLEŞMEZ");

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

  // [16] Güvenli dosya adı (ASCII; yıl dahil).
  const fn = calendarWordFilename(mainPlan);
  ok(/^Hacamat-Takvimi-[A-Za-z0-9-]*2026\.docx$/.test(fn), `dosya[16]: güvenli/anlaşılır ad ('${fn}')`);
  ok(!/[^\x20-\x7E]/.test(fn), "dosya[16]: dosya adı ASCII (Türkçe→normalize)");
  const fnNamed = calendarWordFilename({ name: "Şubat Özel", year: 2027 });
  ok(fnNamed.endsWith("2027.docx") && !/[^\x20-\x7E]/.test(fnNamed), "dosya[16]: Türkçe plan adı güvenli normalize edilir");

  // [17] Kanonik Hicrî sınır — 30 gün üstü UYDURMAZ (null güvenli). (Motor değişmez.)
  ok(gregorianToHijri("bozuk") === null, "hicri[17]: geçersiz tarih → null (ikinci motor yok; güvenli)");

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

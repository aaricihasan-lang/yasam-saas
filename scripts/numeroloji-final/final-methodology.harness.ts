/**
 * NUMEROLOJİ V1 — NİHAİ METODOLOJİ KARARLARI REGRESYON HARNESS'I (2026-10-03).
 *
 * Her beklenti kullanıcının nihai kararına ya da kaynak sayfasına dayanır (yorumlarda belirtildi).
 * Kapsam: Hayat Yolu 10/11 sunumu, Ana Kulvar / İfade özel sayıları, Element (PİN ilk 8, 9 = Eter/Nötr),
 * Kişisel Yıl/Ay/Gün, Zirve sayısı + iki yaş metodu, Mücadele (Kitap 2 + geçiş-sınırı semantiği),
 * Harflerin Yankılanışı 0 yaş, Çakra sütunu özel Ana Kulvar, çift isim, ISMAIL, eski kayıt Model C,
 * ve aynı fixture için motor ↔ düz metin ↔ Word tutarlılığı.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-final/final-methodology.harness.ts
 */
import JSZip from "jszip";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { hesaplaPinKodu } from "@/lib/numeroloji/pinKodu";
import { calcElementleri, NEUTRAL_ELEMENT_LABEL, elementOfDigit } from "@/lib/numeroloji/elementler";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { personalYear, personalMonth, personalDay } from "@/lib/numeroloji/timing/personal";
import { computePersonalTiming } from "@/lib/numeroloji/timing";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";
import {
  calcMucadeleYillari,
  mucadeleDonemleri,
  mucadeleDonemiAt,
  MUCADELE_ONCEKI_METOD_NOTU,
} from "@/lib/numeroloji/mucadeleYillari";
import { calcHarflerinYankilanisi } from "@/lib/numeroloji/harflerinYankilanisi";
import { anaKulvarCakraDestekleri, pinKoduCakraDestekleri, hesaplaCakraSayiSol } from "@/lib/numeroloji/cakraOmurgasi";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";
import { cutoffMucadele, zirveYasGorunumu } from "@/app/numeroloji/utils/chronoCutoff";
import { buildAnalizOzeti, mucadeleBoundedText, zirveBoundedText } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import {
  LEGACY_METHOD_NOTE,
  buildRecalculatedRecordBody,
  resolveRecordMotor,
} from "@/app/numeroloji/utils/analysisJson";
import { buildNumerolojiWordChildren, packNumerolojiDocx } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { personalDayExplain } from "@/app/numeroloji/utils/teachingExplain";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`  ✗ ${label}${detail !== undefined ? `  → ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

/** Rakamları toplamı `total` olan ilk geçerli tarih (GG.AA.YYYY). */
function dateWithDigitSum(total: number): string {
  for (let y = 1900; y <= 2030; y++)
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= 28; d++) {
        const s = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
        if (Array.from(s).filter((c) => /\d/.test(c)).reduce((a, c) => a + Number(c), 0) === total) return s;
      }
  throw new Error(`toplam ${total} için tarih yok`);
}

// ── HAYAT YOLU / DM — PR #324 tek indirgeme + 10/11 sunum kararı ─────────────────────
eq(calcHayatYolu("19.02.1987").display, "37/10", "HY-01 37 → 37/10 (kitap 1 s.83–153; tam indirge YOK)");
eq(calcHayatYolu(dateWithDigitSum(39)).display, "39/12", "HY-02 39 → 39/12");
eq(calcHayatYolu(dateWithDigitSum(22)).display, "22/4", "HY-03 22 → 22/4");
eq(calcHayatYolu(dateWithDigitSum(33)).display, "33/6", "HY-04 33 → 33/6");
eq(calcHayatYolu(dateWithDigitSum(10)).display, "10/1", "HY-05 doğrudan 10 → 10/1 (kullanıcı kararı)");
eq(calcHayatYolu(dateWithDigitSum(11)).display, "11", "HY-06 doğrudan 11 → 11 (11/2 ana gösterim DEĞİL)");
eq(calcHayatYolu(dateWithDigitSum(29)).display, "29/11", "HY-07 29 → 29/11 (11 tekrar 2'ye inmez)");
eq(calcHayatYolu("14.02.1987").display, "32/5", "HY-08 HASAN 32/5");

// ── ANA KULVAR — 11/19/22/33 korunur (Tier-1) ────────────────────────────────────────
eq(calcAnaKulvar("Hasan", "ARICI").display, "19/2", "AK-01 HASAN ARICI 19/2 (19 indirgenmez)");
eq(calcAnaKulvar("Ali", "ARICI").display.split("/")[0], "19", "AK-02 19 korunur");
eq(calcAnaKulvar("Ayşe", "DEMİR").display.split("/")[0], "11", "AK-03 11 korunur");
eq(calcAnaKulvar("Ayşe Oya", "YILDIZ").display.split("/")[0], "22", "AK-04 22 korunur");
eq(calcAnaKulvar("Işık Işık Ayşe", "YILDIZ").display.split("/")[0], "33", "AK-05 33 korunur");

// ── İFADE / KADER — yalnız 11/22 korunur (kitap 2 s.170–171); Ana Kulvar kuralı TAŞINMAZ ──
eq(calcIfadeSayisi("Esra", "AK").key, "1", "IF-01 toplam 19 → 1 (19 korunmaz)");
eq(calcIfadeSayisi("Ayşe", "UZUN").key, "6", "IF-02 toplam 33 → 6 (33 korunmaz)");
eq(calcIfadeSayisi("Tuba", "AK").key, "11", "IF-03 toplam 11 korunur");
eq(calcIfadeSayisi("Ayşe", "TAN").key, "22", "IF-04 toplam 22 korunur");
eq(calcIfadeSayisi("MİNA", "").key, "1", "IF-05 MİNA 19 → 1 (kitap 2 s.170)");

// ── PIN — matematik değişmedi ────────────────────────────────────────────────────────
{
  const p = hesaplaPinKodu("14.02.1987");
  eq([p.k1, p.k2, p.k3, p.k4, p.k5, p.k6, p.k7, p.k8, p.k9], [5, 2, 7, 5, 1, 7, 9, 7, 7], "PIN-01 HASAN 5-2-7-5-1-7-9-7 (+9. hane 7; not s.2)");
}

// ── ELEMENT — PİN ilk 8 hane; 9 = Eter / Nötr; 9. hane dahil edilmez ──────────────────
{
  const el = calcElementleri("14.02.1987");
  eq(el.counts, { Hava: 3, Su: 4, Ateş: 0, Toprak: 0 }, "EL-01 HASAN Hava 3 (5,5,1) · Su 4 (2,7,7,7) — yalnız ilk 8 hane");
  eq(el.neutralCount, 1, "EL-02 9 sayısı Eter/Nötr: 1 (k7)");
  const total = Object.values(el.counts).reduce((a, b) => a + b, 0) + el.neutralCount;
  eq(total, 8, "EL-03 toplam 8 — 9. PİN hanesi (7) element toplamına girmez");
  eq(NEUTRAL_ELEMENT_LABEL, "Eter / Nötr", "EL-04 9 etiketi 'Eter / Nötr'");
  ok(el.steps.some((s) => s.includes("9 → Eter / Nötr")), "EL-05 adım dökümünde 9 → Eter / Nötr", el.steps);
  eq(elementOfDigit(9), "Nötr", "EL-06 iç anahtar geriye uyumlu (Nötr)");
}

// ── KİŞİSEL YIL — 1–9, doğum gününde geçiş (PR #324) ────────────────────────────────
{
  const bd = "14.02.1987";
  eq(personalYear(bd, { year: 2026, month: 2, day: 13 }).active.value, 7, "KY-01 doğum günü ÖNCESİ (13.02.2026) aktif KY = 2025 yılı → 7");
  eq(personalYear(bd, { year: 2026, month: 2, day: 14 }).active.value, 8, "KY-02 doğum GÜNÜ (14.02.2026) → 8");
  eq(personalYear(bd, { year: 2026, month: 3, day: 1 }).active.value, 8, "KY-03 doğum günü SONRASI → 8");
  eq(calcKisiselYil(bd, 2026).display, "8", "KY-04 DY canonical helper aynı (2026 → 8)");
  let outOfRange = 0;
  for (let y = 1950; y <= 2100; y++) {
    const v = Number(calcKisiselYil(bd, y).display);
    if (!(v >= 1 && v <= 9)) outOfRange++;
  }
  eq(outOfRange, 0, "KY-05 1950–2100 tüm yıllar 1–9");
}

// ── KİŞİSEL AY — KY + ay (Rafet + kitap 1) ──────────────────────────────────────────
eq(personalMonth("14.02.1987", { year: 2024, month: 11, day: 14 }).value, 8, "KA-01 HASAN 14.11.2024: KY 6 + Kasım(11→2) = 8");

// ── KİŞİSEL GÜN — KA + gün (Rafet s.94; nihai karar) ────────────────────────────────
{
  const v = personalDay("14.02.1987", { year: 2024, month: 2, day: 20 }).value;
  eq(v, 1, "KG-01 HASAN 20.02.2024: KA 8 + gün 2 = 10 → 1");
  ok(v !== 7, "KG-02 eski KY+KA+gün sonucu (6+8+2=16→7) artık beklenmez", v);
  eq(personalDayExplain("14.02.1987", { year: 2024, month: 2, day: 20 })?.value, 1, "KG-03 öğretim açıklaması aynı helper sonucu");
  const pt = computePersonalTiming("14.02.1987", { year: 2024, month: 2, day: 20 });
  eq(pt.personalDay.value, 1, "KG-04 Zamanlama/Word kaynağı (computePersonalTiming) aynı sonuç");
}

// ── ZİRVE SAYISI — 11/22 korunur ve bileşik gösterilir ────────────────────────────────
{
  const z = calcZirveYillari("18.02.1987")!;
  eq(z.peaks[0].display, "11/2", "ZS-01 kitap 1 s.211 örneği 1. zirve 11/2");
  eq(z.peaks[0].topic, 2, "ZS-02 11/2 konu çakrası 2");
  eq(calcZirveYillari("11.11.1990")!.peaks[0].display, "22/4", "ZS-03 11+11 → 22/4");
}

// ── ZİRVE YAŞI — iki metot ───────────────────────────────────────────────────────────
{
  const z = calcZirveYillari("14.02.1987")!;
  eq(z.peaks.map((p) => p.yasMetot1), [29, 38, 47, 56], "ZY-01 HASAN Metot 1 (36 − 1. zirve 7): 29/38/47/56");
  eq(z.peaks.map((p) => p.yasMetot2), [31, 40, 49, 58], "ZY-02 HASAN Metot 2 (36 − HY 5): 31/40/49/58");
  eq(z.peaks.map((p) => p.age), [31, 40, 49, 58], "ZY-03 geriye uyumlu `age` = Metot 2");
  const k = calcZirveYillari("18.02.1987")!;
  eq(k.peaks.map((p) => p.yasMetot1), [25, 34, 43, 52], "ZY-04 kitap 1 s.211 örneği 36 − 11 = 25/34/43/52");
  const g = zirveYasGorunumu(z.peaks, 1987, 2100)!;
  ok(g.format === "iki-metot", "ZY-05 yeni hesap iki metotlu görünüm");
  const txt = hesaplaNumeroloji({ firstName: "Hasan", lastName: "ARICI", birthDate: "14.02.1987" }).zirveYillariMetni;
  ok(txt.includes("Metot 1 (İlk Zirve Sayısına Göre): 36 - 7 = 29") && txt.includes("Metot 2 (Hayat Yoluna Göre): 36 - Hayat Yolu (5) = 31"), "ZY-06 hesap metni iki metodu gösterir", txt);
}

// ── MÜCADELE — Kitap 2 (s.181–183) ──────────────────────────────────────────────────
const muc = (bd: string) => {
  const m = calcMucadeleYillari(bd)!;
  return { t: m.method1.map((p) => p.topic), c: m.method1.map((p) => p.cutoffAge), ana: m.anaMucadele, anaStart: m.anaMucadeleBaslangicYasi };
};
eq(muc("14.02.1987"), { t: [3, 2, 5], c: [33, 60, 87], ana: 1, anaStart: 87 }, "MC-01 HASAN 3/2/5 · Ana 1 · sınırlar 33/60/87");
eq(muc("29.03.1986"), { t: [1, 4, 3], c: [35, 62, 89], ana: 3, anaStart: 89 }, "MC-02 Kitap 2 kendi örneği 29.03.1986: 1/4/3 · Ana 3 · 35/62/89");
eq(muc("29.03.1986").t[0], 1, "MC-03 gün 29 → 11 → 2 (11 korunmaz)");
eq(muc("22.02.1732").t, [2, 0, 2], "MC-04 gün 22 → 4 (22 korunmaz); M2 = 0");
eq(muc("18.03.1975"), { t: [6, 5, 1], c: [30, 57, 84], ana: 1, anaStart: 84 }, "MC-05 yıl 1975 → 22 → 4 (korunmaz)");
eq(muc("05.05.1990").t[0], 0, "MC-06 M1 = 0 (gün = ay)");
eq(muc("01.07.1960").t[2], 0, "MC-07 M3 = 0 (ay = yıl)");
eq(muc("02.11.1982"), { t: [0, 0, 0], c: [36, 63, 90], ana: 0, anaStart: 90 }, "MC-08 tümü 0 (ay 11 → 2)");
{
  const h = muc("14.02.1987");
  ok(h.t[2] !== h.ana, "MC-09 farklı M3/Ana vakası: HASAN M3 |2−7| = 5 ≠ Ana |3−2| = 1");
  const e = muc("15.01.1988");
  eq([e.t[2], e.ana], [7, 3], "MC-10 15.01.1988 M3 7 ≠ Ana 3");
}
{
  const d = mucadeleDonemleri(calcMucadeleYillari("14.02.1987"));
  eq(d?.format, "kitap2", "MC-11 yeni hesap yalnız Kitap 2 (method2 YOK)");
  ok(!("method2" in (calcMucadeleYillari("14.02.1987") as object)), "MC-12 motor çıktısında method2 alanı yok");
  eq(mucadeleDonemiAt(d, 0), 1, "MC-13 doğumda 1. dönem");
  eq(mucadeleDonemiAt(d, 32), 1, "MC-14 32 yaş → 1. dönem");
  eq(mucadeleDonemiAt(d, 33), 2, "MC-15 33 yaş (geçiş sınırına ulaşıldı) → 2. dönem (sistem konvansiyonu)");
  eq(mucadeleDonemiAt(d, 39), 2, "MC-16 HASAN 2026 (39 yaş) DEVAM EDEN dönem = 2");
  eq(mucadeleDonemiAt(d, 87), "ana", "MC-17 87 → Ana Mücadele");
  if (d?.format === "kitap2") eq(d.periods.map((p) => p.startAge), [0, 33, 60], "MC-18 dönem başlangıçları 0/33/60");
  const c = cutoffMucadele(calcMucadeleYillari("14.02.1987"), 1987, 2026);
  ok(c?.format === "kitap2" && c.periods.some((p) => p.index === 2), "MC-19 P2 regresyon: 2026'da devam eden 2. mücadele GİZLENMEZ");
  ok(c?.format === "kitap2" && !c.periods.some((p) => p.index === 3) && c.ana === null, "MC-20 başlamamış 3. dönem ve ana gizli");
}

// ── HARFLERİN YANKILANIŞI — ilk harf 0 yaşında başlar ────────────────────────────────
{
  const h = calcHarflerinYankilanisi("Hasan", "ARICI", "14.02.1987");
  eq([h[0].letter, h[0].ageStart, h[0].ageEnd, h[0].yearStart], ["H", 0, 7, 1987], "HR-01 H(8) 0–7 yaş, 1987'den (kullanıcı notundaki +1 kayma YOK)");
  eq([h[1].letter, h[1].ageStart], ["A", 8], "HR-02 ikinci harf 8 yaşında");
}

// ── ÇAKRA SÜTUNU — kullanıcı notu s.2 ────────────────────────────────────────────────
{
  eq(anaKulvarCakraDestekleri("Hasan", "ARICI"), [10, 2], "CK-01 özel Ana Kulvar 19/2 → [10, 2] (eski [2,1,10,2] değil)");
  eq(pinKoduCakraDestekleri("14.02.1987"), [5, 2, 7, 5, 1, 7, 9, 7], "CK-02 PİN ilk 8 hane (9. hane yok)");
  const sol = hesaplaCakraSayiSol("Hasan", "ARICI", "14.02.1987");
  // HY 32/5 → 3,2,5 · PİN 5,2,7,5,1,7,9,7 · Ana Kulvar 19/2 → 10,2  (not s.2 örneği)
  eq([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => sol[c]), [1, 3, 1, 0, 3, 0, 3, 0, 1, 1], "CK-03 HASAN sol sütun not örneğiyle birebir");
  const nonSpecial = anaKulvarCakraDestekleri("Ayşe", "YILMAZ");
  const ak = calcAnaKulvar("Ayşe", "YILMAZ").display;
  ok(!["11", "19", "22", "33"].includes(ak.split("/")[0]) && nonSpecial.length >= 2, "CK-04 özel olmayan Ana Kulvar: isim parçaları + Ana Kulvar (değişmedi)", { ak, nonSpecial });
}

// ── ÇİFT İSİM / SOYİSİM — production davranışı kilitli (isim dosyaları main ile aynı) ────
eq([calcAnaKulvar("Hasan Ali", "ARICI").display, calcYanKulvar("Hasan Ali", "ARICI").display], ["19/3", "11"], "NM-01 çift isim Hasan Ali ARICI");
eq([calcAnaKulvar("Hasan", "ARICI YILMAZ").display, calcYanKulvar("Hasan", "ARICI YILMAZ").display], ["19/3", "22/8"], "NM-02 çift soyisim Hasan ARICI YILMAZ");
eq([calcAnaKulvar("Ayşe Nur", "KAYA").display, calcAnaKulvar("Ayşe-Nur", "KAYA").display], ["11", "11/2"], "NM-03 tire mevcut ürün davranışı (Ayşe-Nur tek kelime) korunur");

// ── ISMAIL / Türkçe harf — I ve İ ikisi de 9 ─────────────────────────────────────────
{
  const v = ["ISMAIL", "İSMAİL", "Ismail", "İsmail"].map((n) => [calcAnaKulvar(n, "KAYA").display, calcYanKulvar(n, "KAYA").display, calcIfadeSayisi(n, "KAYA").display].join("|"));
  ok(new Set(v).size === 1, "TR-01 ISMAIL / İSMAİL / Ismail / İsmail aynı değerler", v);
}

// ── ESKİ KAYIT — MODEL C ──────────────────────────────────────────────────────────────
const fresh = hesaplaNumeroloji({ firstName: "Test", lastName: "KAYIT", birthDate: "19.02.1987" });
// 2026-05-13 → 2026-08-29 dönemine ait eski snapshot: tam indirge HY ("37/1"), not yöntemi mücadele
// (method1 +36 nokta yaşları, method2 27/+9, anaMucadele YOK), zirve yaşları tek liste.
const legacyMotor = JSON.parse(JSON.stringify(fresh));
legacyMotor.hayatYolu = { ...legacyMotor.hayatYolu, display: "37/1", key: "37/1" };
legacyMotor.mucadeleYillari = {
  gSade: 1, aSade: 2, ySade: 7,
  method1: [{ index: 1, topic: 1, age: 35 }, { index: 2, topic: 6, age: 71 }, { index: 3, topic: 5, age: 107 }],
  method2: [{ index: 1, topic: 1, age: 26 }, { index: 2, topic: 6, age: 35 }, { index: 3, topic: 5, age: 44 }],
};
legacyMotor.zirveYillari = { ...legacyMotor.zirveYillari, peaks: legacyMotor.zirveYillari.peaks.map((p: Record<string, unknown>) => ({ index: p.index, topicRaw: p.topicRaw, topic: p.topic, age: p.yasMetot1 })) };
const legacyRow = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test",
  surname: "KAYIT",
  birth_date: "19.02.1987",
  created_at: "2026-06-01T10:00:00Z",
  analysis_data: { version: 1, motor: legacyMotor, summary: "ESKI_OZET_METNI" },
};
const legacyBefore = JSON.stringify(legacyRow);
{
  const r = resolveRecordMotor(legacyRow);
  ok(r.legacy, "OLD-01 damgasız kayıt önceki metodoloji olarak işaretlenir");
  eq(r.motor?.hayatYolu.display, "37/1", "OLD-02 eski snapshot açıldığında sonuç DEĞİŞMEZ (37/1 kalır; sessiz yeniden hesap yok)");
  const mt = mucadeleBoundedText(r.motor!, 2100);
  ok(mt.includes("(önceki metodoloji)") && mt.includes(MUCADELE_ONCEKI_METOD_NOTU) && !/NaN|undefined/.test(mt), "OLD-03 eski method1/method2 mücadele crash/NaN olmadan önceki metodoloji olarak okunur", mt);
  ok(!mt.includes("Ana Mücadele"), "OLD-04 eski kayıtta boş/NaN Ana Mücadele satırı üretilmez", mt);
  const zt = zirveBoundedText(r.motor!, 2100);
  ok(!zt.includes("Metot") && zt.includes("1. zirve — yaş 33"), "OLD-05 eski zirve yaşları kaydedildiği tek listeyle (19.02.1987: 36 − 1. zirve 3 = 33)", zt);

  const body = buildRecalculatedRecordBody(legacyRow, buildAnalizOzeti)!;
  eq(body.analysis_data.recalculatedFrom, legacyRow.id, "OLD-06 yeniden hesap kaynak kayda bağlanır (recalculatedFrom)");
  eq(body.analysis_data.motor.hayatYolu.display, "37/10", "OLD-07 yeniden hesap GÜNCEL yöntemle yeni sonuç üretir");
  eq(mucadeleDonemleri(body.analysis_data.motor.mucadeleYillari)?.format, "kitap2", "OLD-08 yeni hesap Kitap 2 mücadele");
  eq(JSON.stringify(legacyRow), legacyBefore, "OLD-09 orijinal kayıt nesnesi hiçbir alanıyla değişmedi");

  const stamped = { ...legacyRow, analysis_data: { ...legacyRow.analysis_data, motor: fresh, calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } } };
  ok(!resolveRecordMotor(stamped).legacy, "OLD-10 güncel damgalı (yeni) kayıt önceki metodoloji sayılmaz");
  eq(NUMEROLOJI_METHODOLOGY_VERSION, "num-v1-final-2026-10", "OLD-11 yeni kayıt metodoloji sürümü");
}

// ── WORD — eski snapshot + yeni hesap tutarlılığı (motor ↔ Word) ─────────────────────
async function wordXml(rows: unknown[]): Promise<string> {
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
  const sections = { summary: true, plain: true, detailed: false, tas: false } as never;
  const { children } = buildNumerolojiWordChildren(rows as never, sections, shared as never, new Map());
  const buf = await packNumerolojiDocx(children, "Test");
  const zip = await JSZip.loadAsync(buf);
  return (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
}

(async () => {
  const xOld = await wordXml([legacyRow]);
  ok(xOld.includes("37/1") && !xOld.includes("37/10"), "WD-01 Word eski snapshot'ı kullanır (37/1)");
  ok(xOld.includes(LEGACY_METHOD_NOTE), "WD-02 Word'de önceki metodoloji notu");
  ok(xOld.includes("önceki hesaplama metodolojisiyle kaydedilmiştir"), "WD-03 Word eski mücadele formatını crash etmeden önceki metodoloji olarak basar");

  const hasan = hesaplaNumeroloji({ firstName: "Hasan", lastName: "ARICI", birthDate: "14.02.1987" });
  const newRow = {
    id: "00000000-0000-4000-8000-000000000002", name: "Hasan", surname: "ARICI", birth_date: "14.02.1987",
    created_at: "2026-10-03T10:00:00Z",
    analysis_data: { version: 1, motor: hasan, summary: buildAnalizOzeti(hasan), calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } },
  };
  const xNew = await wordXml([newRow]);
  ok(!xNew.includes(LEGACY_METHOD_NOTE), "WD-04 yeni kayıtta eski metodoloji notu yok");
  ok(xNew.includes("Metot 1 — İlk Zirve Sayısına Göre") && xNew.includes("Metot 2 — Hayat Yoluna Göre"), "WD-05 Word zirve iki metot");
  ok(xNew.includes("33 yaşına kadar") && xNew.includes("geçiş sınırı 60"), "WD-06 Word mücadele geçiş-sınırı semantiği + devam eden 2. dönem");
  ok(xNew.includes("Eter / Nötr: 1"), "WD-07 Word element 9 = Eter / Nötr");
  ok(xNew.includes("32/5") && xNew.includes("19/2"), "WD-08 Word temel değerler motorla aynı (HY 32/5 · AK 19/2)");
  const plain = mucadeleBoundedText(hasan, 2026);
  ok(plain.includes("2. Mücadele — sonraki 27 yıllık dönem; geçiş sınırı 60 · konu 2"), "WD-09 UI düz metin ↔ Word aynı dönem (2. mücadele, konu 2)", plain);
  const bulk = await wordXml([legacyRow, newRow]);
  ok(bulk.includes("37/1") && bulk.includes("32/5") && bulk.split(LEGACY_METHOD_NOTE).length - 1 === 1, "WD-10 toplu Word: eski kayıt snapshot + notu, yeni kayıt güncel (not yalnız eskide)");

  console.log(`\nNUMEROLOJİ V1 NİHAİ METODOLOJİ HARNESS: ${pass} PASS · ${fail} FAIL`);
  if (fail) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
  console.log("Tüm nihai karar fixture'ları geçti.");
})();

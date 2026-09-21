/**
 * NUMEROLOJİ — TÜRKÇE KARAKTER BÜTÜNLÜĞÜ harness.
 *
 * Owner kararı: kullanıcının yazdığı Türkçe karakterler GÖSTERİM sırasında başka harflere
 * dönüşmez (özellikle İ↛I). Orijinal veri korunur; birbirine otomatik dönüştürülmez.
 * CANONICAL harf-değer eşlemesi (turkishUpper: İ→I) DEĞİŞMEZ — yalnız GÖSTERİM düzeltilir.
 *
 * Çalıştır:  tsx scripts/numeroloji-faz6/turkish-character-harness.ts
 */
import {
  turkishUpper,
  turkishUpperDisplay,
  calcHarflerinYankilanisi,
  hesaplaNumeroloji,
  LETTER_TO_CHAKRA,
  CHAKRA_LETTER_MAP,
} from "@/lib/numeroloji";
import { extractMotorFromAnalysisJson } from "@/app/numeroloji/utils/analysisJson";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

// ── DISPLAY uppercase: her Türkçe karakter DOĞRU; çapraz dönüşüm YOK ────────────────
eq(turkishUpperDisplay("i"), "İ", "DISP-01 i → İ (dotted)");
eq(turkishUpperDisplay("ı"), "I", "DISP-02 ı → I (dotless)");
eq(turkishUpperDisplay("İ"), "İ", "DISP-03 İ → İ (korunur)");
eq(turkishUpperDisplay("I"), "I", "DISP-04 I → I (korunur)");
eq(turkishUpperDisplay("ö"), "Ö", "DISP-05 ö → Ö");
eq(turkishUpperDisplay("ü"), "Ü", "DISP-06 ü → Ü");
eq(turkishUpperDisplay("ş"), "Ş", "DISP-07 ş → Ş");
eq(turkishUpperDisplay("ç"), "Ç", "DISP-08 ç → Ç");
eq(turkishUpperDisplay("ğ"), "Ğ", "DISP-09 ğ → Ğ");
eq(turkishUpperDisplay("Ö"), "Ö", "DISP-10 Ö korunur");
eq(turkishUpperDisplay("Ü"), "Ü", "DISP-11 Ü korunur");
eq(turkishUpperDisplay("Ş"), "Ş", "DISP-12 Ş korunur");
eq(turkishUpperDisplay("Ç"), "Ç", "DISP-13 Ç korunur");
eq(turkishUpperDisplay("Ğ"), "Ğ", "DISP-14 Ğ korunur");
// YANLIŞ gösterim FAIL olmalı: İ display'de I'ya DÖNMEZ.
assert(turkishUpperDisplay("İ") !== "I", "DISP-15 İ display'de I'ya DÖNMEZ");
assert(turkishUpperDisplay("i") !== "I", "DISP-16 i display'de I'ya DÖNMEZ (İ olur)");
// ı ile i / I ile İ KARIŞMAZ.
assert(turkishUpperDisplay("ı") !== "İ", "DISP-17 ı → I (İ değil)");
assert(turkishUpperDisplay("i") !== turkishUpperDisplay("ı"), "DISP-18 i (İ) ≠ ı (I)");

// ── CANONICAL uppercase KORUNUR: turkishUpper İ→I indirger (harf-değer tablosu için) ─
eq(turkishUpper("İ"), "I", "CANON-UP-01 turkishUpper İ→I (canonical, değişmedi)");
eq(turkishUpper("i"), "I", "CANON-UP-02 turkishUpper i→İ→I (canonical)");
eq(turkishUpper("ç"), "Ç", "CANON-UP-03 turkishUpper ç→Ç (İ dışı korunur)");

// ── CANONICAL İNVARYANS: display fix çakra/değeri DEĞİŞTİRMEZ (İ ve I aynı değer) ────
{
  const name = "Hasan Ali ARICI YILMAZ DEMİR"; // hem i hem İ hem I içerir
  const canon = Array.from(turkishUpper(name)).filter((ch) => /[A-ZÇĞİÖŞÜ]/.test(ch));
  const disp = Array.from(turkishUpperDisplay(name)).filter((ch) => /[A-ZÇĞİÖŞÜ]/.test(ch));
  eq(disp.length, canon.length, "INV-01 display ve canonical harf SAYISI aynı");
  let allEqualChakra = true;
  for (let i = 0; i < canon.length; i++) {
    if (LETTER_TO_CHAKRA[canon[i]] !== LETTER_TO_CHAKRA[disp[i]]) allEqualChakra = false;
  }
  assert(allEqualChakra, "INV-02 her pozisyonda çakra AYNI (İ ve I → 9), display fix canonical'i bozmaz");
  // CHAKRA_LETTER_MAP hem İ hem I için aynı değeri verir (ortak tablo).
  eq(CHAKRA_LETTER_MAP["İ"], CHAKRA_LETTER_MAP["I"], "INV-03 CHAKRA_LETTER_MAP İ === I değeri");
}

// ── HARFLERİN YANKILANIŞI: gösterilen harf orijinal Türkçe karakteri korur ───────────
{
  const segs = calcHarflerinYankilanisi("Hasan Ali", "ARICI YILMAZ DEMİR", "14.02.1987");
  const letters = segs.map((s) => s.letter);
  // 'Ali'deki 'i' büyük harfte İ olmalı (I DEĞİL). İsimde İ segmenti bulunmalı.
  assert(letters.includes("İ"), "HARF-01 segmentlerde İ gösteriliyor (i→İ; I değil)");
  // 'ARICI'daki 'I' (dotless) I olarak kalmalı.
  assert(letters.includes("I"), "HARF-02 segmentlerde I (dotless) korunuyor");
  // Her segment display-safe: kanonik I→I dışında bir kayıp yok; çakra 9 hem İ hem I için.
  const iSeg = segs.find((s) => s.letter === "İ");
  if (iSeg) eq(iSeg.chakra, 9, "HARF-03 İ segmenti çakra 9 (canonical korunur)");
  const dotlessSeg = segs.find((s) => s.letter === "I");
  if (dotlessSeg) eq(dotlessSeg.chakra, 9, "HARF-04 I segmenti çakra 9 (canonical korunur)");
}

// ── CANONICAL SAYISAL SONUÇ: display fix Ana/Yan/İfade/Hayat Yolu değerini DEĞİŞTİRMEZ ─
{
  // Aynı isim için motor değerleri deterministik ve display fix'ten bağımsızdır.
  const m1 = hesaplaNumeroloji({ firstName: "Hasan Ali", lastName: "ARICI YILMAZ DEMİR", birthDate: "14.02.1987" });
  const m2 = hesaplaNumeroloji({ firstName: "Hasan Ali", lastName: "ARICI YILMAZ DEMİR", birthDate: "14.02.1987" });
  eq(m1.anaKulvar.key, m2.anaKulvar.key, "CANON-NUM-01 Ana Kulvar deterministik");
  eq(m1.ifadeSayisi.display, m2.ifadeSayisi.display, "CANON-NUM-02 İfade deterministik");
  // İ ve I aynı değeri aldığından, 'İ'li vs 'I'lı yazım aynı İfade/Ana değerini verir.
  const mDotted = hesaplaNumeroloji({ firstName: "İLKİ", lastName: "", birthDate: "01.01.1990" });
  const mDotless = hesaplaNumeroloji({ firstName: "ILKI", lastName: "", birthDate: "01.01.1990" });
  eq(mDotted.ifadeSayisi.display, mDotless.ifadeSayisi.display, "CANON-NUM-03 İLKİ ve ILKI aynı İfade (İ≡I canonical)");
}

// ── SAVED SNAPSHOT REMAP: eski snapshot letter="I" olsa da orijinal isimden İ türetilir ─
{
  // Eski snapshot simülasyonu: motor'u üret, harf letter'larını canonical (İ→I) hale getir.
  const fresh = hesaplaNumeroloji({ firstName: "Hasan Ali", lastName: "ARICI YILMAZ DEMİR", birthDate: "14.02.1987" });
  const legacySegs = fresh.harflerinYankilanisi.map((s) => ({ ...s, letter: turkishUpper(s.letter) })); // İ→I kaybı
  const legacyPayload = { version: 1, motor: { ...fresh, harflerinYankilanisi: legacySegs }, summary: "x" };
  assert(legacySegs.some((s) => s.letter === "I") && !legacySegs.some((s) => s.letter === "İ"), "REMAP-00 legacy snapshot İ'yi kaybetmiş (I)");

  // İsim VERİLMEDEN okuma: eski davranış (letter olduğu gibi, İ yok).
  const noName = extractMotorFromAnalysisJson(legacyPayload);
  assert(!noName!.harflerinYankilanisi.some((s) => s.letter === "İ"), "REMAP-01 isim yoksa remap YOK (tahmin edilmez)");

  // İsim VERİLEREK okuma: display letter'lar orijinal isimden yeniden türetilir → İ döner.
  const withName = extractMotorFromAnalysisJson(legacyPayload, "Hasan Ali", "ARICI YILMAZ DEMİR");
  assert(withName!.harflerinYankilanisi.some((s) => s.letter === "İ"), "REMAP-02 isimle remap → İ gösterilir (orijinalden türetme, tahmin DEĞİL)");
  // Canonical değişmez: çakra/yaş/yıl remap sonrası birebir aynı.
  eq(
    withName!.harflerinYankilanisi.map((s) => [s.chakra, s.ageStart, s.ageEnd, s.yearStart, s.yearEnd]),
    fresh.harflerinYankilanisi.map((s) => [s.chakra, s.ageStart, s.ageEnd, s.yearStart, s.yearEnd]),
    "REMAP-03 remap çakra/yaş/yıl'ı DEĞİŞTİRMEZ (yalnız letter)",
  );
  // Fresh engine ile remap edilmiş snapshot AYNI display letter dizisini verir (tutarlılık).
  eq(
    withName!.harflerinYankilanisi.map((s) => s.letter),
    fresh.harflerinYankilanisi.map((s) => s.letter),
    "REMAP-04 remap edilmiş snapshot letter'ları fresh engine ile AYNI (yüzey tutarlılığı)",
  );
}

// ── Sonuç ────────────────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ TÜRKÇE KARAKTER HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Türkçe karakter bütünlüğü korundu; canonical harf-değer eşlemesi değişmedi.");

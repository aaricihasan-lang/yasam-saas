/**
 * NUMEROLOJİ SATIŞ-ÖNCESİ — tarih giriş sınırı + motor regresyon kalkanı.
 *
 * MOTOR MATEMATİĞİ LOCKED. Bu harness:
 *   • NUM-005 giriş sınırını (normalizeBirthDateForEngine) doğrular: ISO/TR parite,
 *     takvim doğrulama, leap year, geçersiz/boş/malformed reddi.
 *   • ISO doğum tarihinin normalize sonrası motorda TAM (yarım değil) sonuç ürettiğini,
 *     ve TR ile BİREBİR aynı motor çıktısını verdiğini doğrular.
 *   • Türkçe karakterli isimlerde motorun çökmeden deterministik çalıştığını doğrular.
 *   • Mevcut golden çıktının (Hayat Yolu / PIN / Element) DEĞİŞMEDİĞİNİ kilitler.
 *
 * KURAL: Golden bir değer değişirse TESTİ SONUCA GÖRE GÜNCELLEME — DUR ve motorun
 * neden değiştiğini bul (motor bu çalışmada değişmemeliydi).
 *
 * Çalıştır:  tsx scripts/numeroloji-presale/date-boundary.harness.ts
 */
import { hesaplaNumeroloji, hesaplaPinKodu } from "@/lib/numeroloji";
import {
  normalizeBirthDateForEngine,
  parseBirthDateFlexible,
  isEngineReadyBirthDate,
} from "@/app/numeroloji/utils/numerolojiInput";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`);
  }
}
function eq<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

// ── 1) Boundary normalize — format + takvim doğrulama ────────────────────────
eq(normalizeBirthDateForEngine("1990-03-21"), "21.03.1990", "ISO → 21.03.1990");
eq(normalizeBirthDateForEngine("21.03.1990"), "21.03.1990", "TR nokta → 21.03.1990");
eq(normalizeBirthDateForEngine("21/03/1990"), "21.03.1990", "TR slash → 21.03.1990");
eq(normalizeBirthDateForEngine("21-03-1990"), "21.03.1990", "TR tire → 21.03.1990");
eq(normalizeBirthDateForEngine("1.2.1990"), "01.02.1990", "tek haneli gün/ay sıfır-dolgu");
eq(normalizeBirthDateForEngine("2000-02-29"), "29.02.2000", "leap 2000 geçerli");
eq(normalizeBirthDateForEngine("2001-02-29"), "", "leap-dışı 2001-02-29 reddedilir");
eq(normalizeBirthDateForEngine("29.02.2001"), "", "leap-dışı 29.02.2001 reddedilir");
eq(normalizeBirthDateForEngine("32.13.2000"), "", "32.13.2000 reddedilir");
eq(normalizeBirthDateForEngine("30.02.2001"), "", "30.02 reddedilir");
eq(normalizeBirthDateForEngine("31.04.2000"), "", "31 Nisan reddedilir");
eq(normalizeBirthDateForEngine(""), "", "boş reddedilir");
eq(normalizeBirthDateForEngine("   "), "", "boşluk reddedilir");
eq(normalizeBirthDateForEngine("abc"), "", "malformed reddedilir");
eq(normalizeBirthDateForEngine("1990.03.21"), "", "nokta-ISO (belirsiz) reddedilir");
eq(normalizeBirthDateForEngine(null), "", "null reddedilir");
eq(normalizeBirthDateForEngine(undefined), "", "undefined reddedilir");

assert(isEngineReadyBirthDate("1990-03-21") === true, "isEngineReady ISO true");
assert(isEngineReadyBirthDate("32.13.2000") === false, "isEngineReady geçersiz false");
eq(parseBirthDateFlexible("1990-03-21"), { day: 21, month: 3, year: 1990 }, "parseFlexible ISO parts");
eq(parseBirthDateFlexible("21.03.1990"), { day: 21, month: 3, year: 1990 }, "parseFlexible TR parts");
eq(parseBirthDateFlexible("gibberish"), null, "parseFlexible geçersiz → null");

// ── 2) ISO → normalize → motor TAM sonuç + TR ile BİREBİR parite ─────────────
{
  const tr = hesaplaNumeroloji({ firstName: "Ali", lastName: "TUNA", birthDate: "10.03.2026" });
  const isoNorm = hesaplaNumeroloji({
    firstName: "Ali",
    lastName: "TUNA",
    birthDate: normalizeBirthDateForEngine("2026-03-10"),
  });
  eq(isoNorm, tr, "ISO(normalize) motor çıktısı == TR motor çıktısı (tam parite)");

  // Golden kilit (motor DEĞİŞMEDİ): Hayat Yolu + PIN + Element.
  eq(tr.hayatYolu.display, "14/5", "GOLDEN CASE Hayat Yolu = 14/5");
  const p = tr.pinKodu;
  eq(
    [p.k1, p.k2, p.k3, p.k4, p.k5, p.k6, p.k7, p.k8, p.k9],
    [1, 3, 1, 5, 6, 4, 4, 8, 5],
    "GOLDEN CASE PIN = 1,3,1,5,6,4,4,8,5",
  );
  eq(
    [tr.elementler.counts.Hava, tr.elementler.counts.Su, tr.elementler.counts["Ateş"], tr.elementler.counts.Toprak],
    [3, 0, 2, 3],
    "GOLDEN CASE element Hava3/Su0/Ateş2/Toprak3",
  );
}

// ── 3) ISO ham besleme YARIM sonuç üretir; normalize bunu düzeltir (kanıt) ────
{
  const pinNorm = hesaplaPinKodu(normalizeBirthDateForEngine("1990-03-21"));
  const pinRawIso = hesaplaPinKodu("1990-03-21"); // ham ISO — motorun parseBirthDate'i reddeder
  const normNonZero = [pinNorm.k1, pinNorm.k2, pinNorm.k3].some((x) => x !== 0);
  const rawAllZero = [pinRawIso.k1, pinRawIso.k2, pinRawIso.k3, pinRawIso.k4].every((x) => x === 0);
  assert(normNonZero, "normalize edilmiş ISO → PIN dolu (yarım değil)");
  assert(rawAllZero, "ham ISO → PIN sıfır (giriş sınırının neden gerekli olduğunun kanıtı)");
  eq(pinNorm, hesaplaPinKodu("21.03.1990"), "normalize ISO PIN == TR PIN");
}

// ── 4) Türkçe karakterler — çökmeden deterministik ───────────────────────────
{
  const a = hesaplaNumeroloji({ firstName: "İpek", lastName: "ŞAHİN", birthDate: "05.11.1978" });
  const b = hesaplaNumeroloji({ firstName: "İpek", lastName: "ŞAHİN", birthDate: "05.11.1978" });
  eq(a, b, "Türkçe karakterli isim deterministik (aynı girdi → aynı çıktı)");
  assert(typeof a.ifadeSayisi.display === "string" && a.ifadeSayisi.display.length > 0, "Türkçe isim İfade Sayısı üretir");
  // Ç Ğ İ I Ö Ş Ü / ç ğ ı i ö ş ü kapsayan isim de çökmeden çalışır.
  const c = hesaplaNumeroloji({ firstName: "Çiğdem Işıl", lastName: "Öztürk Güneş", birthDate: "12.09.1995" });
  assert(typeof c.hayatYolu.display === "string" && c.hayatYolu.display.length > 0, "Türkçe karakter seti motoru çökertmez");
}

// ── Özet ─────────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ SATIŞ-ÖNCESİ HARNESS — ${pass} geçti, ${fail} başarısız`);
if (fail > 0) {
  console.log(failures.join("\n"));
  console.log("\n⛔ Golden çıktı değiştiyse: DUR — motor beklenmedik şekilde değişmiş olabilir.");
  process.exit(1);
}
console.log("✓ Tümü geçti (giriş sınırı + parite + Türkçe + golden motor).");

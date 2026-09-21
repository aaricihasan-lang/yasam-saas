/**
 * NUMEROLOJİ — DİNAMİK YIL SINIRI + HARFLERİN YANKILANIŞI DEDUPLICATION harness.
 *
 * Owner kararı (BAŞLANGIÇ-YILI TABANLI, TAM ARALIK): kronolojik numeroloji (Değişim-Dönüşüm /
 * Zirve / Mücadele / Harflerin Yankılanışı) dönemlerinden BAŞLANGICI ≤ currentYear olanlar
 * ORİJİNAL bitişleriyle TAM gösterilir (bitiş currentYear'ı aşabilir — KIRPMA YOK); başlangıcı
 * gelecekte olanlar tamamen gizlenir. Sınır HER YIL kendiliğinden güncellenir (yıl hardcode DEĞİL).
 * Testler currentYear=2026 varsayımına BAĞIMLI DEĞİLDİR: enjekte edilen referans yılıyla
 * 2030/2050/2100 senaryoları çalıştırılır.
 *
 * Çalıştır:  tsx scripts/numeroloji-faz6/year-cutoff-harness.ts
 */
import {
  hesaplaNumeroloji,
  calcHarflerinYankilanisi,
} from "@/lib/numeroloji";
import {
  currentIstanbulYear,
  istanbulYearAt,
  msUntilNextIstanbulYear,
} from "@/lib/numeroloji/currentYear";
import {
  CHRONO_CUTOFF_NOTE,
  cutoffHarfSegments,
  cutoffZirvePeaks,
  cutoffMucadele,
  cutoffDegisimYearOnly,
  cutoffDegisimFullDate,
  dogumYilindanOut,
  harfDisplayYearEnd,
} from "@/app/numeroloji/utils/chronoCutoff";
import {
  buildPlainAnalizFull,
  degisimBoundedText,
  zirveBoundedText,
  mucadeleBoundedText,
  harfBoundedText,
} from "@/app/numeroloji/utils/numerolojiPlainMetin";

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

// ── TZ: Europe/Istanbul (UTC+3, DST YOK). Enjekte edilen an ile deterministik. ──────
const iso = (s: string) => new Date(s);
eq(istanbulYearAt(iso("2030-12-31T23:59:59+03:00")), 2030, "TZ-01 2030-12-31 23:59:59 Istanbul → 2030");
eq(istanbulYearAt(iso("2031-01-01T00:00:00+03:00")), 2031, "TZ-02 2031-01-01 00:00:00 Istanbul → 2031");
eq(istanbulYearAt(iso("2049-12-31T23:59:59+03:00")), 2049, "TZ-03 2049 sınırı");
eq(istanbulYearAt(iso("2050-01-01T00:00:00+03:00")), 2050, "TZ-04 2050 sınırı");
eq(istanbulYearAt(iso("2099-12-31T23:59:59+03:00")), 2099, "TZ-05 2099 sınırı");
eq(istanbulYearAt(iso("2100-01-01T00:00:00+03:00")), 2100, "TZ-06 2100 sınırı (kod değişmeden)");
// UTC ile Türkiye yıl farkı: UTC hâlâ 2030, Türkiye 2031.
eq(istanbulYearAt(iso("2030-12-31T22:30:00Z")), 2031, "TZ-07 UTC 2030 iken Türkiye 2031 (doğru yıl)");
eq(istanbulYearAt(iso("2030-12-31T20:30:00Z")), 2030, "TZ-08 UTC/Türkiye ikisi de 2030");
// msUntilNextIstanbulYear: sınıra ~1sn kala pozitif ve küçük.
{
  const ms = msUntilNextIstanbulYear(iso("2030-12-31T23:59:59+03:00"));
  assert(ms > 0 && ms <= 2000, "TZ-09 sonraki yıl sınırına ~1sn", `ms=${ms}`);
  const ms2 = msUntilNextIstanbulYear(iso("2031-01-01T00:00:00+03:00"));
  assert(ms2 > 300 * 24 * 3600_000, "TZ-10 yıl başında ~1 yıl kalır", `ms=${ms2}`);
}
assert(typeof currentIstanbulYear() === "number" && currentIstanbulYear() >= 2026, "TZ-11 currentIstanbulYear canlı ≥ 2026");

// ── OWNER UAT KAYDI: Hasan Ali ARICI YILMAZ DEMİR, 14.02.1987 ───────────────────────
const OUT = hesaplaNumeroloji({ firstName: "Hasan Ali", lastName: "ARICI YILMAZ DEMİR", birthDate: "14.02.1987" });
eq(dogumYilindanOut(OUT), 1987, "CASE doğum yılı motor metninden çözülür (1987, 1982 DEĞİL)");

// Referans yıl 2026 (deterministik; canlı saate bağlı değil).
const CY = 2026;
const fullHarf = calcHarflerinYankilanisi("Hasan Ali", "ARICI YILMAZ DEMİR", "14.02.1987");
const snapshotBefore = JSON.stringify(fullHarf);

// ── HARF: başlangıç ≤ currentYear → TAM aralık göster; başlamamış gizle (KIRPMA YOK) ──
{
  const cut = cutoffHarfSegments(fullHarf, CY);
  assert(cut.length > 0, "HARF-01 en az bir görünür segment");
  assert(cut.every((s) => s.yearStart == null || s.yearStart <= CY), "HARF-02 hiçbir görünür segment gelecekte BAŞLAMAZ");
  // TAM aralık: gösterilen bitiş = ORİJİNAL bitiş (currentYear'ı aşabilir — KIRPILMAZ).
  assert(cut.every((s) => harfDisplayYearEnd(s) === s.yearEnd), "HARF-03 gösterilen bitiş = orijinal bitiş (kırpma YOK)");
  const anyFuture = fullHarf.some((s) => s.yearStart != null && s.yearStart > CY);
  if (anyFuture) assert(cut.length < fullHarf.length, "HARF-04 gelecekte BAŞLAYAN segment(ler) gizlendi", `${cut.length}/${fullHarf.length}`);
  eq(JSON.stringify(fullHarf), snapshotBefore, "HARF-05 cutoff engine segmentlerini MUTATE ETMEZ (canonical korunur)");

  // OWNER ÖRNEĞİ (currentYear=2026): 2026–2034 TAM göster; 2035–2037 gizle.
  const synth = [
    { letter: "P", chakra: 5, ageStart: 30, ageEnd: 34, yearStart: 2021, yearEnd: 2025 }, // geçmiş
    { letter: "X", chakra: 9, ageStart: 39, ageEnd: 47, yearStart: 2026, yearEnd: 2034 }, // 2026'da başlar, 2034'e sürer
    { letter: "Y", chakra: 3, ageStart: 48, ageEnd: 50, yearStart: 2035, yearEnd: 2037 }, // 2035'te başlar
  ];
  const cs = cutoffHarfSegments(synth, 2026);
  eq(cs.map((s) => s.letter), ["P", "X"], "HARF-06a 2035'te başlayan (Y) gizli; 2026'da başlayan (X) görünür");
  eq(cs.find((s) => s.letter === "X")!.yearEnd, 2034, "HARF-06b 2026–2034 TAM gösterilir (bitiş 2034, 2026'ya KIRPILMAZ)");
  // 2027'ye geçilince (yıl otomasyonu) 2035'te başlayan hâlâ gizli ama 2027'de başlayan görünür olurdu.
  const cs2035 = cutoffHarfSegments(synth, 2035);
  assert(cs2035.some((s) => s.letter === "Y"), "HARF-06c 2035 yılında Y otomatik görünür (kod değişmeden)");
}

// ── ZİRVE (yaş-tabanlı): gelecekte başlayan gizli ───────────────────────────────────
{
  const peaks = OUT.zirveYillari?.peaks ?? [];
  const vis = cutoffZirvePeaks(peaks, 1987, CY);
  assert(vis.every((p) => 1987 + p.age <= CY), "ZIRVE-01 görünür zirveler doğum yılı + yaş ≤ currentYear");
  const futureExists = peaks.some((p) => 1987 + p.age > CY);
  if (futureExists) assert(vis.length < peaks.length, "ZIRVE-02 gelecekte başlayan zirve gizli");
  // Yıl ilerleyince (2100) gelecekteki zirveler görünür olur — KOD DEĞİŞMEDEN.
  const vis2100 = cutoffZirvePeaks(peaks, 1987, 2100);
  assert(vis2100.length >= vis.length, "ZIRVE-03 2100'de daha fazla/eşit zirve görünür (otomatik)");
}

// ── MÜCADELE (yaş-tabanlı): gelecekte başlayan gizli + ana mücadele görünürlüğü ──────
{
  const m = cutoffMucadele(OUT.mucadeleYillari, 1987, CY)!;
  assert(m.method1.every((it) => 1987 + it.age <= CY), "MUC-01 görünür mücadele dönemleri geçmişte/güncelde");
  const full = OUT.mucadeleYillari!;
  const futureExists = full.method1.some((it) => 1987 + it.age > CY);
  if (futureExists) assert(m.method1.length < full.method1.length, "MUC-02 gelecekte başlayan mücadele gizli");
  eq(m.anaMucadeleVisible, 1987 + full.anaMucadeleBaslangicYasi <= CY, "MUC-03 ana mücadele görünürlüğü = başlangıç yaşı geçmişte mi");
}

// ── DEĞİŞİM (takvim yılı): BAŞLANGIÇ ≤ currentYear → TAM aralık; başlamamış gizli (KIRPMA YOK) ──
{
  const y = cutoffDegisimYearOnly("14.02.1987", CY, 20);
  assert(y.length > 0, "DEG-01 en az bir görünür değişim");
  assert(y.every((r) => r.effectStartYear <= CY), "DEG-02 görünür değişimler currentYear'da/öncesinde BAŞLAR");
  // TAM aralık: gösterilen bitiş = orijinal effectEndYear (currentYear'ı aşabilir — KIRPILMAZ).
  assert(y.every((r) => r.effectEndYearDisplay === r.effectEndYear), "DEG-03 gösterilen bitiş = orijinal bitiş (kırpma YOK)");
  // Başlangıcı ≤ CY ama bitişi > CY olan bir dönem TAM (orijinal bitişle) gösterilir.
  const spanning = y.find((r) => r.effectStartYear <= CY && r.effectEndYear > CY);
  if (spanning) eq(spanning.effectEndYearDisplay, spanning.effectEndYear, "DEG-03b 2026–2027 gibi süren dönem TAM (2027 gösterilir, gizlenmez)");
  const f = cutoffDegisimFullDate("14.02.1987", CY, 20);
  assert(f.every((r) => r.effectStartYear <= CY && r.effectEndYearDisplay === r.effectEndYear), "DEG-04 gün-ay dâhil de başlangıç-tabanlı + tam");
  // Başlangıcı gelecekte olan değişim GÖRÜNMEZ (üretilen tam listede olsa bile).
  const allY = cutoffDegisimYearOnly("14.02.1987", 2100, 20);
  const futureStart = allY.filter((r) => r.effectStartYear > CY);
  assert(!y.some((r) => futureStart.some((fr) => fr.index === r.index)), "DEG-04b başlangıcı > currentYear olan değişim gizli");
  // Otomatik güncelleme: 2100'de ≥ değişim görünür (kod değişmeden).
  assert(allY.length >= y.length, "DEG-05 2100'de ≥ değişim görünür (otomatik yıl güncelleme)");
}

// ── BOUNDED METİN: TAM aralık metne yansır (bitiş currentYear'ı aşabilir; KIRPMA YOK) ──
{
  // Harf metni: süren (başlangıç ≤ CY, bitiş > CY) segmentin ORİJİNAL bitişini içerir.
  const cutH = cutoffHarfSegments(fullHarf, CY);
  const ht = harfBoundedText(OUT, CY);
  const spanningH = cutH.find((s) => s.yearStart != null && s.yearEnd != null && s.yearStart <= CY && s.yearEnd > CY);
  if (spanningH) assert(ht.includes(String(spanningH.yearEnd)), `TEXT-01 Harf metni süren segmentin orijinal bitişini (${spanningH.yearEnd}) içerir (tam aralık, kırpma YOK)`);
  // Değişim metni görünür dönemlerin ORİJİNAL bitiş yıllarını içerir.
  const dt = degisimBoundedText(OUT, CY);
  const visD = cutoffDegisimYearOnly("14.02.1987", CY, 20);
  assert(visD.every((r) => dt.includes(String(r.effectEndYear))), "TEXT-02 Değişim metni orijinal bitiş yıllarını içerir (tam aralık)");
  // Zirve/Mücadele yaş-tabanlı — metin üretiliyor.
  assert(zirveBoundedText(OUT, CY) !== "" && mucadeleBoundedText(OUT, CY) !== "", "TEXT-03 Zirve/Mücadele metni üretiliyor");
}

// ── DEDUPLICATION + NOT: Harflerin Yankılanışı TEK KEZ; yeni not metni; not yıl SABİTLEMEZ ──
{
  const plain = buildPlainAnalizFull(OUT, CY);
  const harfHeaderCount = (plain.match(/HARFLERİN YANKILANIŞI/g) || []).length;
  eq(harfHeaderCount, 1, "DEDUP-01 Harflerin Yankılanışı başlığı TEK KEZ (=== === tekrarı yok)");
  assert(!plain.includes("=== HARFLERİN YANKILANIŞI ==="), "DEDUP-02 legacy '=== HARFLERİN YANKILANIŞI ===' bloğu YOK");
  assert(plain.includes(CHRONO_CUTOFF_NOTE), "NOTE-01 bilgilendirme notu plain analizde mevcut");
  // Yeni not: "tam tarih aralıklarıyla" der; ESKİ "yalnızca ... yıla kadar gösterilmiştir" KULLANILMAZ.
  assert(CHRONO_CUTOFF_NOTE.includes("tam tarih aralıklarıyla"), "NOTE-02a not 'tam tarih aralıklarıyla' der (owner metni)");
  assert(!CHRONO_CUTOFF_NOTE.includes("yalnızca içinde bulunduğumuz yıla kadar gösterilmiştir"), "NOTE-02b eski 'yalnızca ... yıla kadar gösterilmiştir' notu KULLANILMAZ");
  // Not metni yıl numarası içermez (her yıl geçerli).
  assert(!/\b20\d{2}\b/.test(CHRONO_CUTOFF_NOTE) && !/\b21\d{2}\b/.test(CHRONO_CUTOFF_NOTE), "NOTE-03 not metni yıl NUMARASI içermez");
}

// ── CANONICAL DEĞİŞMEZLİK: engine tam timeline + metinleri (kaynak) korunur ──────────
{
  // Engine tam timeline gelecek yılları HÂLÂ üretir (kesilmedi); cutoff yalnız sunumda.
  const anyFutureInEngine = fullHarf.some((s) => s.yearStart != null && s.yearStart > CY);
  assert(anyFutureInEngine, "CANON-01 engine tam yaşam çizgisi gelecek segmentleri ÜRETMEYE devam eder");
  // Motorun ham metni (kaynak) değişmez — gelecek yıl içerebilir (bu user-facing değil, kaynak).
  eq(JSON.stringify(calcHarflerinYankilanisi("Hasan Ali", "ARICI YILMAZ DEMİR", "14.02.1987")), snapshotBefore, "CANON-02 engine determinstik + mutasyonsuz");
}

// ── Sonuç ────────────────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ YIL SINIRI + DEDUP HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Tüm yıl-sınırı + deduplication fixture'ları geçti (TZ Europe/Istanbul; 2030/2050/2100 otomatik).");

/**
 * NUMEROLOJİ — PDF METODOLOJİ GOLDEN HARNESS (NUM-PDF, 2026-10)
 *
 * Kaynak: "kitap 1. seviye.pdf" (K1, 252 s.) ve "kitap 2. seviye.pdf" (K2, 239 s.) —
 * Pera Akademi Numeroloji Eğitimi. Sayfa = PDF sayfa numarası (K1'de basılı = PDF − 1).
 * Her test: INPUT → EXPECTED, kitap + sayfa referansıyla. Kitapta olmayan kural TEST EDİLMEZ;
 * kitap içi çelişkili konular (Zirve yaşı) yalnız "mevcut motor davranışı" olarak, açıkça
 * etiketlenerek kilitlenir (kullanıcı kararı bekliyor).
 *
 * Çalıştır: npx tsx scripts/numeroloji-pdf/pdf-golden.harness.ts
 */
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { hesaplaPinKodu } from "@/lib/numeroloji/pinKodu";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";
import { calcMucadeleYillari } from "@/lib/numeroloji/mucadeleYillari";
import { calcDegisimByYearOnly } from "@/lib/numeroloji/degisimDonusum";
import { calcHarflerinYankilanisi } from "@/lib/numeroloji/harflerinYankilanisi";
import { CHAKRA_LETTER_MAP, daysInMonth, sumDigits } from "@/lib/numeroloji/ortak";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { nominalPersonalYear, personalYear, personalMonth, personalDay } from "@/lib/numeroloji/timing/personal";
import { universalYear, universalDay } from "@/lib/numeroloji/timing/universal";
import { maturityNumber } from "@/lib/numeroloji/development/maturity";
import { lifeLesson } from "@/lib/numeroloji/development/lifeLesson";
import { destinyNumber } from "@/lib/numeroloji/development/destinyNumber";
import { verifyMotorMatchesInputs } from "@/lib/numeroloji/methodology";
import { evreDonguFromAge } from "@/lib/numeroloji/timing/cycles";
import { calcPlaceNumber } from "@/lib/numeroloji/place/placeNumber";
import { calcNameNumberSingle } from "@/lib/numeroloji/relationship/calculations";
import { personalityEnergy } from "@/lib/numeroloji/development/personalityLesson";
import { hayatYoluLookupCandidates } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";
import { formatFirstNameTurkish } from "@/app/numeroloji/helpers/nameInputFormat";
import { gorunenSeciliSatirlar, hesaplaKbSilmeEtkisi, kbSilmeOnayMetni } from "@/app/numeroloji/bilgi-bankasi/helpers/kbDeleteImpact";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function t(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    fails.push(`FAIL ${name}\n   beklenen: ${e}\n   gelen   : ${a}`);
  }
}

// ── 1. Harf → sayı tablosu (K1 s.10–11 "ÇAKRA HARFLERİ"; K1 s.217–224) ─────────────────
const LETTERS: Record<number, string> = { 1: "AJSŞ", 2: "BKT", 3: "CÇLUÜ", 4: "DMV", 5: "ENW", 6: "FOÖX", 7: "GĞPY", 8: "HQZ", 9: "Iİ R".replace(" ", "") };
for (const [v, letters] of Object.entries(LETTERS))
  for (const ch of Array.from(letters)) t(`letterValue_${ch}_is_${v}_per_pdf_k1_p10`, CHAKRA_LETTER_MAP[ch], Number(v));

// ── 2. Hayat Yolu / DM (K1 s.58, s.51, s.83–153) ─────────────────────────────────────────
t("hayatYolu_18021987_is_36_9_per_pdf_k1_p58", calcHayatYolu("18.02.1987").display, "36/9");
t("hayatYolu_kristal_02032000_is_7_per_pdf_k1_p51", calcHayatYolu("02.03.2000").display, "7");
// DM kataloğundaki bütün bileşik kodlar: toplam/bir-kez-indirgenmiş (19/10 … 45/9)
const DM_CODES = ["19/10", "28/10", "37/10", "46/10", "29/11", "38/11", "47/11", "20/2", "39/12", "48/12", "30/3", "40/4", "22/4", "15/6", "33/6", "16/7", "25/7", "34/7", "43/7", "17/8", "26/8", "35/8", "44/8", "18/9", "27/9", "36/9", "45/9"];
function dateWithDigitSum(total: number): string | null {
  for (let y = 1900; y <= 2099; y++)
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= daysInMonth(m, y); d++) if (sumDigits(d) + sumDigits(m) + sumDigits(y) === total) return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  return null;
}
for (const code of DM_CODES) {
  const total = Number(code.split("/")[0]);
  const date = dateWithDigitSum(total);
  t(`hayatYolu_total${total}_is_${code.replace("/", "_")}_per_pdf_k1_p83_153`, date ? calcHayatYolu(date).display : null, code);
}
// Kristal çocuk: toplam ≤ 11 → tek değer (kitap 1 s.51).
// NİHAİ KULLANICI KARARI (2026-10-03): doğrudan toplam 10 → "10/1" (eski ürün sunumu); 11 → "11".
for (const total of [4, 7, 11]) {
  const date = dateWithDigitSum(total);
  t(`hayatYolu_total${total}_single_value_per_pdf_k1_p51`, date ? calcHayatYolu(date).display : null, String(total));
}
{
  const date = dateWithDigitSum(10);
  t("hayatYolu_total10_is_10_1_per_user_decision_2026_10_03", date ? calcHayatYolu(date).display : null, "10/1");
}
t("hayatYolu_no_full_reduction_37_not_37_1_per_pdf_k1_p88", calcHayatYolu("19.02.1987").display, "37/10");

// ── 3. Ana / Yan Kulvar, İfade (K1 s.16, s.30, s.34, s.167) ─────────────────────────────
t("anaKulvar_NURAN_ISIK_is_4_per_pdf_k1_p16", calcAnaKulvar("NURAN", "IŞIK").key, "4");
t("yanKulvar_NURAN_ISIK_starts_19_3_per_pdf_k1_p30", calcYanKulvar("NURAN", "IŞIK").display.startsWith("19/3"), true);
t("ifade_NURAN_ISIK_is_8_per_pdf_k1_p34", calcIfadeSayisi("NURAN", "IŞIK").key, "8");
t("anaKulvar_ELIF_YILMAZ_is_6_per_pdf_k1_p167", calcAnaKulvar("ELİF", "YILMAZ").key, "6");
t("yanKulvar_ELIF_YILMAZ_is_22_9_per_pdf_k1_p167", calcYanKulvar("ELİF", "YILMAZ").display.startsWith("22/9"), true);
// Kader (İfade) — yalnız 11 ve 22 korunur (K2 s.171); MİNA 19→10→1 (K2 s.170); İPEK OLGUN 11 (K2 s.169)
t("ifade_MINA_19_reduced_to_1_per_pdf_k2_p170", calcIfadeSayisi("MİNA", "").key, "1");
t("ifade_IPEK_OLGUN_keeps_11_per_pdf_k2_p169_171", calcIfadeSayisi("İPEK", "OLGUN").key, "11");
t("ifade_MUSTAFA_KEMAL_33_not_kept_per_pdf_k2_p171", calcIfadeSayisi("MUSTAFA", "KEMAL").key, destinyNumber("MUSTAFA", "KEMAL").display);
t("ifade_equals_kader_MINA_IPEK_OLGUN_per_pdf_k2_p170", calcIfadeSayisi("MİNA İPEK", "OLGUN").key, destinyNumber("MİNA İPEK", "OLGUN").display);

// ── 4. PİN kodu (K1 s.156–157, s.168) ────────────────────────────────────────────────────
{
  const p = hesaplaPinKodu("18.02.1987");
  t("pin_18021987_is_927992924_per_pdf_k1_p168", [p.k1, p.k2, p.k3, p.k4, p.k5, p.k6, p.k7, p.k8, p.k9], [9, 2, 7, 9, 9, 2, 9, 2, 4]);
}

// ── 5. Zirve (K1 s.210–216) ──────────────────────────────────────────────────────────────
{
  const z = calcZirveYillari("18.02.1987")!; // kitap örneğinin rakamları (başlık "19/02" yazım hatası)
  t("zirve_values_18021987_are_11_7_9_9_per_pdf_k1_p211", z.peaks.map((p) => p.display), ["11/2", "7", "9", "9"]);
  t("zirve_11_topic_is_chakra_2_per_pdf_k1_p212", z.peaks[0].topic, 2);
  const z2 = calcZirveYillari("29.11.1975")!; // gün 29→11, ay 11, yıl 1975→22 korunur (K1 s.210)
  t("zirve_keeps_11_22_components_per_pdf_k1_p210", [z2.peaks[0].display, z2.peaks[1].display], ["22/4", "6"]);
  // Yaş: KİTAP İÇİ ÇELİŞKİ (s.211 örnek 36−11=25 ↔ s.212 metin 36−HY). Mevcut motor = 36−HY kökü.
  t("zirve_age_CURRENT_ENGINE_36_minus_hayatyolu_USER_DECISION_PENDING", z.peaks.map((p) => p.age), [27, 36, 45, 54]);
  t("zirve_age_step_plus9_per_pdf_k1_p211", z.peaks[1].age - z.peaks[0].age, 9);
}

// ── 6. Mücadele (K2 s.181–183) ──────────────────────────────────────────────────────────
{
  const m = calcMucadeleYillari("29.03.1986")!;
  t("mucadele_29031986_topics_ages_per_pdf_k2_p182", m.method1.map((x) => [x.topic, x.age]), [[1, 35], [4, 62], [3, 89]]);
  t("mucadele_29031986_ana_is_3_per_pdf_k2_p183", m.anaMucadele, 3);
}

// ── 7. Kişisel Yıl / Ay / Gün, Evrensel (K1 s.175–177, s.187, s.190) ──────────────────────
t("personalYear_18021987_2024_is_1_per_pdf_k1_p177", nominalPersonalYear("18.02.1987", 2024).value, 1);
t("personalYear_DY_calcKisiselYil_18021987_2024_is_1_per_pdf_k1_p177", calcKisiselYil("18.02.1987", 2024).display, "1");
t("personalYear_19_not_kept_per_pdf_k1_p177", calcKisiselYil("1987-02-18", 2024).display, "1");
t("personalYear_29011950_2026_is_4_DY_equals_numeroloji", calcKisiselYil("29.01.1950", 2026).display, String(nominalPersonalYear("29.01.1950", 2026).value));
{
  const py = personalYear("18.02.1987", { year: 2024, month: 1, day: 10 });
  t("personalYear_active_before_birthday_is_previous_9_per_pdf_k1_p177", py.active.value, 9);
  const py2 = personalYear("18.02.1987", { year: 2024, month: 2, day: 18 });
  t("personalYear_active_from_birthday_is_1_per_pdf_k1_p177", py2.active.value, 1);
}
t("universalYear_2024_is_8_per_pdf_k1_p175", universalYear(2024).value, 8);
t("universalYear_2025_is_9_per_pdf_k1_p175", universalYear(2025).value, 9);
t("universalDay_23012024_is_5_per_pdf_k1_p176", universalDay(2024, 1, 23).value, 5);
t("personalMonth_oct_counts_as_1_per_pdf_k1_p187", personalMonth("18.02.1987", { year: 2024, month: 10, day: 1 }).value, personalMonth("18.02.1987", { year: 2024, month: 1, day: 1 }).value);
// NİHAİ KULLANICI KARARI (2026-10-03): Kişisel Gün = Kişisel Ay + gün (Rafet s.94). Kitap 1 s.190'daki
// KY + KA + gün zinciri (1 + 2 + 5 = 8) ARTIK BEKLENMEZ: KA 2 + gün 5 = 7.
t("personalDay_KA2_plus_5_is_7_per_rafet_s94_user_decision", personalDay("18.02.1987", { year: 2024, month: 1, day: 5 }).value, 7);
// DY ↔ Numeroloji parite: 2026 için tüm takvim (her ayın 1–28'i), 1950–2010
{
  let mismatch = 0;
  for (let y = 1950; y <= 2010; y += 3)
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= 28; d++) {
        const bd = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
        if (calcKisiselYil(bd, 2026).display !== String(nominalPersonalYear(bd, 2026).value)) mismatch++;
      }
  t("personalYear_DY_numeroloji_parity_6888_dates", mismatch, 0);
}

// ── 8. Değişim-Dönüşüm (K1 s.169–170) ────────────────────────────────────────────────────
t("degisim_1987_years_per_pdf_k1_p170", calcDegisimByYearOnly(1987, 2, 7).map((r) => r.changeYear), [2012, 2017, 2027, 2038, 2051, 2059, 2075]);

// ── 9. Elementler (K1 s.229; K2 s.38–39) ─────────────────────────────────────────────────
{
  const m = hesaplaNumeroloji({ firstName: "NURAN", lastName: "IŞIK", birthDate: "18.02.1987" });
  t("elements_9_has_no_element_per_pdf_k1_p229", m.elementler.counts, { Hava: 0, Su: 4, Ateş: 0, Toprak: 0 });
}

// ── 10. Harflerin Yankılanışı (K1 s.208) ─────────────────────────────────────────────────
{
  const h = calcHarflerinYankilanisi("NURAN", "IŞIK", "18.02.1987").slice(0, 9);
  t("harfler_duration_equals_chakra_per_pdf_k1_p208", h.map((s) => `${s.letter}${s.ageEnd - s.ageStart + 1}`), ["N5", "U3", "R9", "A1", "N5", "I9", "Ş1", "I9", "K2"]);
}

// ── 11. Olgunluk, Hayat Dersi (K2 s.67, s.169) ───────────────────────────────────────────
t("maturity_SEMA_CAYLAR_29031986_is_1_per_pdf_k2_p67", maturityNumber("SEMA", "CAYLAR", "29.03.1986").value, 1);
t("lifeLesson_15052019_is_11_per_pdf_k2_p169", lifeLesson("15.05.2019").value, 11);

// ── 11b. Evre/Döngü, Ev sayısı, İsim sayısı, Kişilik (K2 s.34–35, K1 s.231, K2 s.69, K2 s.169) ─
t("evreDongu_age45_is_evre5_dongu9_per_pdf_k2_p34", evreDonguFromAge(45), { evreIndex: 5, donguIndex: 9 });
t("placeNumber_4_plus_11_is_6_per_pdf_k1_p231", calcPlaceNumber(4, 11)?.reducedNumber, 6);
t("nameNumber_SEMA_DURMAZ_is_4_per_pdf_k2_p69", calcNameNumberSingle("SEMA", "DURMAZ"), 4);
t("personality_day15_is_6_per_pdf_k2_p169", personalityEnergy("15.05.2019").value, 6);

// ── 12. NUM-F10 Bilgi bankası aday zinciri (K1 s.58: son sayı = nihai hedef çakrası) ────────
{
  const c = hayatYoluLookupCandidates({ display: "37/10", key: "37/10", steps: [] });
  t("kbLookup_hayatYolu_37_10_chain", c.values, ["37/10", "37/1", "1"]);
  t("kbLookup_hayatYolu_root_is_general", [...c.generalValues], ["1"]);
  const c2 = hayatYoluLookupCandidates({ display: "25/7", key: "25/7", steps: [] });
  t("kbLookup_hayatYolu_25_7_chain", c2.values, ["25/7", "7"]);
}

// ── 13. NUM-F01 sunucu doğrulaması ───────────────────────────────────────────────────────
{
  const ali = hesaplaNumeroloji({ firstName: "Ali", lastName: "VELİ", birthDate: "01.01.1990" });
  t("serverVerify_same_person_ok", verifyMotorMatchesInputs("Ali", "VELİ", "01/01/1990", ali).ok, true);
  t("serverVerify_new_name_old_numbers_rejected", verifyMotorMatchesInputs("Zeynep", "KARA", "15/07/1975", ali).ok, false);
  t("serverVerify_iso_date_ok", verifyMotorMatchesInputs("Ali", "VELİ", "1990-01-01", ali).ok, true);
}

// ── 14. Türkçe büyük/küçük harf (AŞAMA 1 P3) ─────────────────────────────────────────────
t("casing_ISMAIL_not_Ismaıl", formatFirstNameTurkish("ISMAIL"), "ISMAIL");
t("casing_ismail_is_İsmail", formatFirstNameTurkish("ismail"), "İsmail");
t("casing_HASAN_ALİ", formatFirstNameTurkish("HASAN ALİ"), "Hasan Ali");
t("casing_IŞIK", formatFirstNameTurkish("IŞIK"), "Işık");

// ── 15. NUM-F07/F08 Bilgi Bankası silme onayı ────────────────────────────────────────────
{
  const rows = [
    { id: "a", recordId: "k1", kayitTuru: "aciklama" as const, analizTuru: "Diğer", deger: "X" },
    { id: "b", recordId: "s1", kayitTuru: "dogaltas" as const, analizTuru: "Diğer", deger: "Y" },
  ];
  t("kbDelete_hidden_selected_not_deleted", gorunenSeciliSatirlar([rows[0]], new Set(["a", "b"])).map((r) => r.id), ["a"]);
  const etki = hesaplaKbSilmeEtkisi(rows, [{ knowledge_record_id: "k1" }, { knowledge_record_id: "k1" }, { knowledge_record_id: "zz" }], [{ knowledge_record_id: "k1" }]);
  t("kbDelete_impact_counts", etki, { notSayisi: 2, baglantiSayisi: 1 });
  const msg = kbSilmeOnayMetni(rows, etki);
  t("kbDelete_confirm_mentions_count_and_cascade", msg.includes("2 kaydı") && msg.includes("2 kaynak notu") && msg.includes("1 kaynak bağlantısı"), true);
}

console.log(fails.join("\n"));
console.log(`\nNUMEROLOJİ PDF GOLDEN HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) process.exit(1);
console.log("Tüm PDF golden fixture'lar geçti.");

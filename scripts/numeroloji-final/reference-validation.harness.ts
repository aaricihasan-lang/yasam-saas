/**
 * NUMEROLOJİ — PR #433 SON KRİTİK DOĞRULAMA (owner talimatı 2026-10-18).
 * Çalıştır: npx tsx scripts/numeroloji-final/reference-validation.harness.ts [--out <klasör>]
 *
 * Beklenen sonuçlar ÜRETİM KODUNDAN ALINMAZ:
 *   (1) elle gözden geçirilmiş 68 satırlık GOLDEN tablo (aşağıda literal),
 *   (2) bağımsız referans hesaplayıcı `reference/numerologyReference.ts` (lib/numeroloji import etmez).
 * Üretim motoru sentetik/gerçek isimlerle UÇTAN UCA çalıştırılır (hesaplaNumeroloji →
 * calcAnaKulvar/calcYanKulvar → anaKulvarCakraDestekleri → alternativeChakraColumns).
 * Kaynakların kesin cevap vermediği satırlar "KARAR" olarak işaretlenir ve PASS SAYILMAZ.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { anaKulvarCakraDestekleri, hesaplaCakraSayiSol } from "@/lib/numeroloji/cakraOmurgasi";
import { alternativeChakraColumns } from "@/lib/numeroloji/alternativeChakra";
import { findKulvarSpecialCombinations } from "@/lib/numeroloji/alternativeCombinations";
import { extractMotorFromAnalysisJson } from "@/app/numeroloji/utils/analysisJson";
import { CASES_68 } from "./reference/cases68";
import {
  KARAR_ACIKLAMA,
  alternatiflerRef,
  anaCakraRef,
  hamSesli,
  hamSessiz,
  hayatYoluRef,
  kulvarRef,
  parcaDegeri,
  parcalar,
  pinRef,
  tekHane,
  type Karar,
} from "./reference/numerologyReference";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "numeroloji-referans-dogrulama");
mkdirSync(OUT, { recursive: true });

type Bolum = "68" | "isim" | "tarama" | "omurga" | "alternatif" | "eski" | "golden" | "refgolden" | "yol";
const sayac: Record<Bolum, { test: number; pass: number; fail: number; karar: number }> = {
  "68": { test: 0, pass: 0, fail: 0, karar: 0 }, isim: { test: 0, pass: 0, fail: 0, karar: 0 },
  tarama: { test: 0, pass: 0, fail: 0, karar: 0 }, omurga: { test: 0, pass: 0, fail: 0, karar: 0 },
  alternatif: { test: 0, pass: 0, fail: 0, karar: 0 }, eski: { test: 0, pass: 0, fail: 0, karar: 0 },
  golden: { test: 0, pass: 0, fail: 0, karar: 0 },
  refgolden: { test: 0, pass: 0, fail: 0, karar: 0 }, yol: { test: 0, pass: 0, fail: 0, karar: 0 },
};
const hatalar: string[] = [];
function kontrol(b: Bolum, ok: boolean, etiket: string, detay?: unknown) {
  sayac[b].test += 1;
  if (ok) sayac[b].pass += 1;
  else {
    sayac[b].fail += 1;
    hatalar.push(`[${b}] ${etiket} ${detay === undefined ? "" : JSON.stringify(detay)}`);
  }
}
const J = (x: unknown) => JSON.stringify(x);
const msort = (xs: number[]) => [...xs].sort((a, b) => b - a);
const ayni = (a: number[], b: number[]) => J(msort(a)) === J(msort(b));

// ── Sentetik isim: her parça istenen HAM sesli + HAM sessiz toplamını üretir ──
const SESLI_ADIM: [string, number][] = [["I", 9], ["O", 6], ["E", 5], ["U", 3], ["A", 1]];
const SESSIZ_ADIM: [string, number][] = [["R", 9], ["H", 8], ["G", 7], ["F", 6], ["N", 5], ["D", 4], ["C", 3], ["B", 2], ["S", 1]];
function harfler(t: number, adim: [string, number][]): string[] {
  const o: string[] = [];
  let r = t;
  for (const [ch, v] of adim) while (r >= v) { o.push(ch); r -= v; }
  return o;
}
function kelime(sesli: number, sessiz: number): string {
  const v = harfler(sesli, SESLI_ADIM), c = harfler(sessiz, SESSIZ_ADIM), o: string[] = [];
  for (let i = 0; i < Math.max(v.length, c.length); i++) { if (c[i]) o.push(c[i]); if (v[i]) o.push(v[i]); }
  return o.join("");
}
/** Ana ve Yan bileşenleri AYNI ham toplamlar olacak şekilde isim (son parça soyad). */
function sentetikKisi(ham: number[]): [string, string] {
  const p = ham.map((h) => kelime(h, h));
  return p.length === 1 ? [p[0], ""] : [p.slice(0, -1).join(" "), p[p.length - 1]];
}

const DOGUM = "14.02.1987";
const HY_REF = hayatYoluRef(14, 2, 1987);
const PIN_REF = pinRef(14, 2, 1987);

// ════════════════════════ 1. ZORUNLU 68 KOMBİNASYON — ELLE DOĞRULANMIŞ GOLDEN ════════════════════════
// [no, gösterim, anahtar, Ana Kulvar çakra katkısı (owner nihai kararı 2026-10-18), alternatif yollar, açık karar bayrağı]
const GOLDEN_68: [number, string, string, number[], string[], string][] = [
  [1, "11", "11", [10], [], ""], [2, "19", "19", [10], [], ""], [3, "22", "22", [10], [], ""], [4, "33", "33", [10], [], ""],
  [5, "1", "1", [1, 1], [], ""], [6, "4", "4", [4, 4], [], ""], [7, "5", "5", [5, 5], [], ""], [8, "9", "9", [9, 9], [], ""],
  [9, "1", "1", [1, 1], [], ""], [10, "3", "3", [3, 3], [], ""],
  [11, "11", "11", [10], [], ""], [12, "11", "11", [10], [], ""], [13, "1", "1", [9, 1, 1], [], ""], [14, "1", "1", [1, 9, 1], [], ""],
  [15, "11/8 (19)", "8", [10, 8], ["19"], ""], [16, "11/8 (19)", "8", [10, 8], ["19"], ""],
  [17, "11/11 (22)", "11", [10], ["22"], ""], [18, "11/19", "11", [10], [], ""], [19, "19/11", "11", [10], [], ""],
  [20, "19/22", "19", [10], [], ""], [21, "22/19", "19", [10], [], ""], [22, "22/11 (33)", "11", [10], ["33"], ""],
  [23, "11/22 (33)", "11", [10], ["33"], ""], [24, "11/33", "11", [10], [], ""], [25, "33/11", "11", [10], [], ""],
  [26, "22/22", "22", [10], [], ""], [27, "9", "9", [9, 9, 9], [], ""], [28, "2", "2", [1, 1, 2], [], ""],
  [29, "11", "11", [10], [], ""], [30, "3", "3", [6, 6, 3], [], ""],
  [31, "19", "19", [10], [], ""], [32, "11", "11", [10], [], ""],
  [33, "11/11/4 (22/4)", "4", [10, 4], ["22/4"], ""], [34, "22/11/4 (33/4)", "4", [10, 4], ["33/4"], ""],
  [35, "19/11/5", "5", [10, 5], [], ""], [36, "11/3 (19/4)", "3", [10, 3], ["19/4"], ""],
  [37, "11/8", "8", [10, 8], ["19"], ""], [38, "11/8", "8", [10, 8], ["19"], ""],
  [39, "11/11", "11", [10], ["22"], ""], [40, "11/11", "11", [10], ["22"], ""],
  [41, "19/9", "9", [10, 9], [], ""], [42, "19/9", "9", [10, 9], [], ""],
  [43, "11/11/11 (33)", "11", [10], ["22/11", "33"], ""], [44, "11/5", "5", [10, 5], [], ""],
  [45, "6", "6", [1, 6, 8, 6], [], ""], [46, "19", "19", [10], [], ""],
  [47, "11/11/9 (22/9)", "9", [10, 9], ["22/9"], ""], [48, "22/11/3 (33/3)", "3", [10, 3], ["22/19/4", "33/3"], ""],
  [49, "22/19/11/4 (33/5)", "4", [10, 4], ["33/19/4"], ""], [50, "6", "6", [9, 1, 9, 5, 6], ["19/5"], ""],
  [51, "11/19 (19/11)", "19", [10], ["11/11/8", "19/11", "22/8"], ""], [52, "11/19 (19/11)", "19", [10], ["11/11/8", "19/11", "22/8"], ""],
  [53, "3", "3", [1, 6, 8, 6, 3], [], ""], [54, "11/7", "7", [10, 7], [], ""],
  [55, "11/11/3 (22/3)", "3", [10, 3], ["19/11/4", "22/3"], ""], [56, "19/19/5", "5", [10, 5], ["33/19"], ""],
  [57, "8", "8", [2, 2, 2, 2, 8], [], ""], [58, "9", "9", [9, 9, 9, 9, 9], [], ""],
  [59, "11/11/8 (22/8)", "8", [10, 8], ["19/11/9", "22/8"], ""], [60, "22/11/3 (33/3)", "3", [10, 3], ["22/19/4", "33/3"], ""],
  [61, "33/22/19/11/4 (33/11)", "4", [10, 4], ["33/33/19/4"], ""], [62, "11/19", "19", [10], ["19/11"], ""],
  [63, "11/5 (19/6)", "5", [10, 5], ["11/11/3", "19/6", "19/11/4", "22/3"], ""], [64, "11/6", "6", [10, 6], ["19/7"], ""],
  [65, "11/7", "7", [10, 7], ["11/11/5", "19/8", "22/5"], ""], [66, "11/11/11/11/4 (22/8)", "4", [10, 4], ["22/11/11/4", "22/22/4", "33/11/4"], ""],
  [67, "22/22/19/19/5", "5", [10, 5], [], ""], [68, "11/9", "9", [10, 9], [], ""],
];

type Satir = Record<string, string | number>;
const satirlar68: Satir[] = [];
for (const c of CASES_68) {
  const g = GOLDEN_68[c.no - 1];
  const [, gGost, gKey, gCakra, gAlt, gKarar] = g;
  const norm = c.giris.map(parcaDegeri);
  const ref = kulvarRef(norm);
  const refC = anaCakraRef(ref);
  const refAlt = alternatiflerRef(norm);
  // (a) referans = elle doğrulanmış golden (referans hesaplayıcının kendisi de sınanır)
  const refKarar = [...new Set([...refC.kararlar, ...refAlt.flatMap((a) => a.kararlar)])].sort().join("");
  kontrol("refgolden", ref.gosterim === gGost && ref.anahtar === gKey && ayni(refC.destekler, gCakra) && J(refAlt.map((a) => a.yol)) === J(gAlt) && refKarar === [...gKarar].sort().join(""),
    `#${c.no} bağımsız referans ↔ elle doğrulanmış golden`, { ref: ref.gosterim, key: ref.anahtar, cakra: refC.destekler, alt: refAlt.map((a) => a.yol), refKarar });
  // (b) motor uçtan uca (sentetik isim)
  const [ad, soyad] = sentetikKisi(c.giris);
  const ana = calcAnaKulvar(ad, soyad);
  const yan = calcYanKulvar(ad, soyad);
  const motorCakra = anaKulvarCakraDestekleri(ad, soyad);
  const m = hesaplaNumeroloji({ firstName: ad, lastName: soyad, birthDate: DOGUM });
  const altCols = alternativeChakraColumns(m, "ana");
  const normOk = J((ana.componentValues ?? []).filter((v) => v > 0)) === J(norm.filter((v) => v > 0));
  const gostOk = ana.display === gGost;
  const keyOk = ana.key === gKey;
  const cakraOk = ayni(motorCakra, gCakra);
  const altOk = J(altCols.map((a) => a.path)) === J(gAlt);
  const altCakraOk = altCols.every((a) => ayni(a.altSupports, refAlt.find((r) => r.yol === a.path)?.destekler ?? [-1]));
  const yanOk = yan.display === gGost && yan.key === gKey; // aynı ham toplamlar → Yan Kulvar da aynı yapıyı vermeli
  const hepsi = normOk && gostOk && keyOk && cakraOk && altOk && altCakraOk && yanOk;
  const kararlar = [...new Set([...gKarar])] as Karar[];
  let sonuc: "PASS" | "FAIL" | "METODOLOJİ KARARI GEREKİYOR";
  if (!hepsi) sonuc = "FAIL";
  else if (kararlar.length) sonuc = "METODOLOJİ KARARI GEREKİYOR";
  else sonuc = "PASS";
  sayac["68"].test += 1;
  if (sonuc === "PASS") sayac["68"].pass += 1;
  else if (sonuc === "FAIL") { sayac["68"].fail += 1; hatalar.push(`[68] #${c.no} motor ≠ golden ${J({ gost: ana.display, key: ana.key, cakra: motorCakra, alt: altCols.map((a) => a.path), yan: yan.display, normOk })}`); }
  else sayac["68"].karar += 1;
  const fark = gCakra.length - motorCakra.length;
  satirlar68.push({
    no: c.no, grup: c.grup, giris: J(c.giris), normal: J(norm),
    ozel: ref.ozelOlusumlar.map((o) => `${o.sayi}(${o.tur}:${o.parcalar.join("+")})`).join(" ") || "—",
    birlesen: ref.ozelOlusumlar.filter((o) => o.parcalar.length > 1).map((o) => `${o.parcalar.join("+")}=${o.sayi}`).join(" ") || "—",
    kalan: ref.kalan.length ? ref.kalan.join("+") : "—",
    gosterim: ana.display, anahtar: ana.key, alternatif: altCols.map((a) => `${a.path}→[${a.altSupports.join(",")}]`).join(" ") || "—",
    beklenen: J(gCakra), motor: J(motorCakra), fark: fark === 0 && cakraOk ? "0" : `${fark >= 0 ? "+" : ""}${fark} (${J(gCakra)} vs ${J(motorCakra)})`,
    sonuc, karar: kararlar.join(","), aciklama: refC.aciklama,
  });
}

// ════════════════════════ 2. ÖZEL GOLDEN OLUŞUMLAR (önceki hata görülenler) ════════════════════════
{
  const G: [string, number[], string, number[]][] = [
    ["19/5", [19, 5], "19/5", [10, 5]],
    ["19/9", [19, 4, 5], "19/9", [10, 9]],
    ["22/4", [22, 4], "22/4", [10, 4]],
    ["22/6", [22, 6], "22/6", [10, 6]],
    ["11/11/4", [11, 11, 4], "11/11/4 (22/4)", [10, 4]],
    ["22/11/4", [22, 11, 4], "22/11/4 (33/4)", [10, 4]],
  ];
  for (const [ad, ham, gost, cakra] of G) {
    const [f, l] = sentetikKisi(ham);
    kontrol("golden", calcAnaKulvar(f, l).display === gost, `GOLD ${ad} gösterim`, calcAnaKulvar(f, l).display);
    kontrol("golden", J(anaKulvarCakraDestekleri(f, l)) === J(cakra), `GOLD ${ad} çakra ${J(cakra)}`, anaKulvarCakraDestekleri(f, l));
    // kalan değer kaybolmuyor: son hane destek listesinde
    kontrol("golden", anaKulvarCakraDestekleri(f, l).includes(cakra[1]), `GOLD ${ad} sadeleşmiş ${cakra[1]} korunuyor`);
  }
  // Alternatif olarak: owner ekranı — Ana [19,3,3,1,2] 19/9 → 22/6 · Yan [5,3,3,22,8] 22/19 → 22/11/8, 33/8
  const ad = "NIIA CU CU RARD", soyad = "HAA";
  const m = hesaplaNumeroloji({ firstName: ad, lastName: soyad, birthDate: DOGUM });
  const ana = alternativeChakraColumns(m, "ana");
  const yan = alternativeChakraColumns(m, "yan");
  kontrol("golden", J(m.anaKulvar.componentValues) === J([19, 3, 3, 1, 2]) && J(m.yanKulvar.componentValues) === J([5, 3, 3, 22, 8]), "GOLD owner ekranı bileşenleri");
  kontrol("golden", J(ana.map((c) => [c.path, c.altSupports])) === J([["22/6", [10, 6]]]), "GOLD alternatif 22/6 → [10,6]", ana.map((c) => [c.path, c.altSupports]));
  kontrol("golden", J(yan.map((c) => [c.path, c.altSupports, c.ozelSayilar])) === J([["22/11/8", [10, 8], [22, 11]], ["33/8", [10, 8], [33]]]),
    "GOLD alternatif 22/11/8 → [10,8] (iki özel: Karar C) · 33/8 → [10,8]", yan.map((c) => [c.path, c.altSupports, c.ozelSayilar]));
  kontrol("golden", ana[0].officialAnaSupports !== null && J(ana[0].officialAnaSupports) === J([10, 9]), "GOLD resmî 19/9 → [10,9]");
}

// ════════════════════════ 3. REFERANS KİŞİ — HASAN ARICI 14.02.1987 ════════════════════════
{
  const m = hesaplaNumeroloji({ firstName: "Hasan", lastName: "ARICI", birthDate: DOGUM });
  const pin = [m.pinKodu.k1, m.pinKodu.k2, m.pinKodu.k3, m.pinKodu.k4, m.pinKodu.k5, m.pinKodu.k6, m.pinKodu.k7, m.pinKodu.k8, m.pinKodu.k9].join("");
  kontrol("golden", m.anaKulvar.display === "19/2", "HASAN Ana Kulvar 19/2", m.anaKulvar.display);
  kontrol("golden", m.yanKulvar.display === "8", "HASAN Yan Kulvar 8", m.yanKulvar.display);
  kontrol("golden", m.hayatYolu.display === "32/5" && HY_REF.gosterim === "32/5", "HASAN Hayat Yolu 32/5");
  kontrol("golden", pin === "527517977" && PIN_REF.join("") === "527517977", "HASAN PİN 527517977", pin);
  kontrol("golden", J(anaKulvarCakraDestekleri("Hasan", "ARICI")) === J([10, 2]), "HASAN Ana Kulvar çakra [10,2]");
  const sol = hesaplaCakraSayiSol("Hasan", "ARICI", DOGUM);
  kontrol("golden", J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => sol[c])) === J([1, 3, 1, 0, 3, 0, 3, 0, 1, 1]), "HASAN sol sütun (eğitim notu s.2 çizimi)", sol);
}

// ════════════════════════ 4. GERÇEK İSİM-SOYİSİM ════════════════════════
const ISIMLER: { ad: string; soyad: string; tur: string; kaynak?: { ana?: string; yan?: string; cakra?: number[] } }[] = [
  { ad: "Hasan", soyad: "ARICI", tur: "tek isim / tek soyisim · özel 19", kaynak: { ana: "19/2", yan: "8", cakra: [10, 2] } },
  { ad: "Nuran", soyad: "IŞIK", tur: "kitap örneği (K1 s.16/30) · özel yok · I/Ş", kaynak: { ana: "4", cakra: [4, 9, 4] } },
  { ad: "Mustafa Kemal", soyad: "ATATÜRK", tur: "çift isim · 5+6=11 kalan 5 (Kitap PDF-1 s.11 '11 ve 5')", kaynak: { ana: "11/5", cakra: [10, 5] } },
  { ad: "Hasan Ali", soyad: "ARICI", tur: "çift isim · özel 19" },
  { ad: "Hasan", soyad: "ARICI YILMAZ", tur: "çift soyisim" },
  { ad: "Mehmet Ali Rıza", soyad: "KAYA", tur: "üç isim · I" },
  { ad: "Ayşe", soyad: "YILMAZ", tur: "kızlık soyadı · Ş" },
  { ad: "Ayşe", soyad: "KAYA", tur: "evlilik sonrası soyadı (ayrı hesap)" },
  { ad: "Ayşe", soyad: "YILMAZ KAYA", tur: "kızlık + evlilik soyadı birlikte" },
  { ad: "Ömer", soyad: "GÜNEŞ", tur: "özel 11 + kalan · Ö Ü Ş · eski (19/0)", kaynak: { ana: "11/8 (19)" } },
  { ad: "Ahmet", soyad: "DEMİR", tur: "yalnız iki parçalı özel çift 6+5 → yalnız 11 (owner kararı) · İ", kaynak: { ana: "11", cakra: [10] } },
  { ad: "Tuba Ömer", soyad: "EROL", tur: "11/11/4 (önceki kayıp) → [10,4]", kaynak: { cakra: [10, 4] } },
  { ad: "Ömer", soyad: "EROL", tur: "iki özel 11/11 (22)" },
  { ad: "İsmail", soyad: "EROL", tur: "19/11 · İ → [10]", kaynak: { cakra: [10] } },
  { ad: "Ahmet Fatma", soyad: "KURT", tur: "toplam 11, özel parça yok → [10]", kaynak: { cakra: [10] } },
  { ad: "Ahmet Esra", soyad: "DOĞAN", tur: "toplam 19, özel parça yok → [10] · Ğ", kaynak: { cakra: [10] } },
  { ad: "Ayşe Oya", soyad: "YILDIZ", tur: "toplam 22 → [10]", kaynak: { cakra: [10] } },
  { ad: "Işık Işık Ayşe", soyad: "YILDIZ", tur: "üç isim · toplam 33" },
  { ad: "Ahmet Fatma", soyad: "DEMİR YILDIRIM", tur: "iki isim + çift soyisim · 11/11" },
  { ad: "İsmail Cihangir", soyad: "AKINCI", tur: "üç parça 19 (Kitap PDF-1 s.121 kaynak çelişkisi)" },
  { ad: "Zeynep", soyad: "ÇELİK", tur: "Ç İ · özel yok?" },
  { ad: "Gülşen", soyad: "ÖZTÜRK ŞAHİN", tur: "çift soyisim · Ü Ş Ö" },
  { ad: "Çağrı", soyad: "GÜNDOĞDU", tur: "Ç Ğ Ü" },
  { ad: "Şükrü", soyad: "ÜNAL", tur: "Ş Ü" },
  { ad: "Elif", soyad: "YILMAZ", tur: "kitap Yan örneği (K1 s.167 22/9)" },
  { ad: "Fatma Nur", soyad: "ÇAKIR KOÇ", tur: "çift isim + çift soyisim · Ç" },
  { ad: "Mehmet Emin", soyad: "ÖZTÜRK", tur: "çift isim · Ö Ü" },
];
const satirlarIsim: Satir[] = [];
for (const k of ISIMLER) {
  const p = parcalar(k.ad, k.soyad);
  const refAna = kulvarRef(p.map((w) => parcaDegeri(hamSesli(w))));
  const refYan = kulvarRef(p.map((w) => parcaDegeri(hamSessiz(w))));
  const refC = anaCakraRef(refAna);
  const m = hesaplaNumeroloji({ firstName: k.ad, lastName: k.soyad, birthDate: DOGUM });
  const motorC = anaKulvarCakraDestekleri(k.ad, k.soyad);
  const refAlt = alternatiflerRef(refAna.bilesen).map((a) => a.yol);
  const refAltY = alternatiflerRef(refYan.bilesen).map((a) => a.yol);
  const ok = J(m.anaKulvar.componentValues) === J(refAna.bilesen) && J(m.yanKulvar.componentValues) === J(refYan.bilesen)
    && m.anaKulvar.display === refAna.gosterim && m.anaKulvar.key === refAna.anahtar
    && m.yanKulvar.display === refYan.gosterim && m.yanKulvar.key === refYan.anahtar
    && ayni(motorC, refC.destekler)
    && J(findKulvarSpecialCombinations(m.anaKulvar.componentValues ?? [])) === J(refAlt)
    && J(findKulvarSpecialCombinations(m.yanKulvar.componentValues ?? [])) === J(refAltY)
    && (!k.kaynak?.ana || m.anaKulvar.display === k.kaynak.ana)
    && (!k.kaynak?.yan || m.yanKulvar.display === k.kaynak.yan)
    && (!k.kaynak?.cakra || J(motorC) === J(k.kaynak.cakra));
  const kararlar = refC.kararlar;
  const sonuc = !ok ? "FAIL" : kararlar.length ? "METODOLOJİ KARARI GEREKİYOR" : "PASS";
  sayac.isim.test += 1;
  if (sonuc === "PASS") sayac.isim.pass += 1; else if (sonuc === "FAIL") { sayac.isim.fail += 1; hatalar.push(`[isim] ${k.ad} ${k.soyad} ${J({ ana: m.anaKulvar.display, ref: refAna.gosterim, motorC, refC: refC.destekler })}`); } else sayac.isim.karar += 1;
  // Sayısal dizi ile isim aynı motor yolunu kullanıyor mu? (isim bileşenleri → sentetik isim → aynı sonuç)
  const [sa, ss] = sentetikKisi(p.map((w) => hamSesli(w)).map((h) => h || 0).filter((h) => h > 0));
  const sameRoute = calcAnaKulvar(sa, ss).display === m.anaKulvar.display;
  kontrol("yol", sameRoute, `${k.ad} ${k.soyad} sayısal dizi = isim (aynı motor yolu)`);
  satirlarIsim.push({
    isim: `${k.ad} ${k.soyad}`, tur: k.tur, anaBilesen: J(m.anaKulvar.componentValues), ana: m.anaKulvar.display, anaKey: m.anaKulvar.key,
    yanBilesen: J(m.yanKulvar.componentValues), yan: m.yanKulvar.display, cakra: J(motorC), beklenen: J(refC.destekler),
    altAna: refAlt.join(" ") || "—", altYan: refAltY.join(" ") || "—", sonuc, karar: kararlar.join(","),
  });
}

// ════════════════════════ 5. OTOMATİK GENİŞ TARAMA (tohumlu, ≥10.000) ════════════════════════
const taramaSiniflari: Record<string, number> = {
  "Gerçek hesaplama hatası": 0, "Yanlış çakra desteği": 0, "Eksik destek": 0, "Fazla destek": 0,
  "Yanlış özel sayı oluşumu": 0, "Yanlış alternatif": 0, "Sadece gösterim farkı": 0, "Metodoloji belirsizliği": 0,
};
const taramaOrnek: Record<string, string[]> = {};
let tohum = 20261018;
const rnd = () => ((tohum = (tohum * 1103515245 + 12345) >>> 0) / 2 ** 32);
// Ağırlıklı havuz: normal 1–9, sadeleşen (10,12,18,20,28), özel (11,19,22,33), özele sadeleşen (29,38)
const HAVUZ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 20, 28, 11, 11, 19, 19, 22, 22, 33, 29, 38];
const girdiler: number[][] = [];
for (let i = 0; i < 12000; i++) {
  const n = 1 + Math.floor(rnd() * 5);
  girdiler.push(Array.from({ length: n }, () => HAVUZ[Math.floor(rnd() * HAVUZ.length)]));
}
// Sıra varyasyonları: her girdinin ters sırası da taranır (farklı bileşen sıralamaları)
for (let i = 0; i < 1500; i++) girdiler.push([...girdiler[i]].reverse());
// Kalansız özel kombinasyonlar ve tekrarlar
for (const a of [11, 19, 22, 33]) for (const b of [11, 19, 22, 33]) { girdiler.push([a, b]); girdiler.push([a, b, a]); girdiler.push([a, a, a, a]); }
for (const g of girdiler) {
  const norm = g.map(parcaDegeri);
  const ref = kulvarRef(norm);
  const refC = anaCakraRef(ref);
  const refAlt = alternatiflerRef(norm);
  const [f, l] = sentetikKisi(g);
  const a = calcAnaKulvar(f, l);
  const mc = anaKulvarCakraDestekleri(f, l);
  const alts = findKulvarSpecialCombinations(a.componentValues ?? []);
  const etiketle = (s: string) => {
    taramaSiniflari[s] += 1;
    const liste = (taramaOrnek[s] ??= []);
    if (liste.length < 5) liste.push(`${J(g)} → motor ${a.display} ${J(mc)} | ref ${ref.gosterim} ${J(refC.destekler)}`);
  };
  sayac.tarama.test += 1;
  let hata = false;
  if (J((a.componentValues ?? []).filter((v) => v > 0)) !== J(norm.filter((v) => v > 0))) { etiketle("Gerçek hesaplama hatası"); hata = true; }
  else if (a.key !== ref.anahtar) { etiketle("Yanlış özel sayı oluşumu"); hata = true; }
  else if (!ayni(mc, refC.destekler)) { etiketle(mc.length < refC.destekler.length ? "Eksik destek" : mc.length > refC.destekler.length ? "Fazla destek" : "Yanlış çakra desteği"); hata = true; }
  else if (J(alts) !== J(refAlt.map((x) => x.yol))) { etiketle("Yanlış alternatif"); hata = true; }
  else if (a.display !== ref.gosterim) { etiketle("Sadece gösterim farkı"); hata = true; }
  if (/\/0(\D|$)/.test(a.display) || alts.some((p) => /(^|\/)0(\/|$)/.test(p))) { hata = true; hatalar.push(`[tarama] sahte /0 ${J(g)} ${a.display}`); }
  if (hata) sayac.tarama.fail += 1;
  else if (refC.kararlar.length) { sayac.tarama.karar += 1; taramaSiniflari["Metodoloji belirsizliği"] += 1; }
  else sayac.tarama.pass += 1;
}

// ════════════════════════ 6. ÇAKRA OMURGASI DEĞİŞMEZLERİ ════════════════════════
{
  // Sol sütun toplamı = HY + PİN(8) + Ana Kulvar katkısı (bağımsız referans) — her 68 + isim için
  const kisiler: [string, string][] = [...CASES_68.map((c) => sentetikKisi(c.giris)), ...ISIMLER.map((k) => [k.ad, k.soyad] as [string, string])];
  for (const [f, l] of kisiler) {
    const sol = hesaplaCakraSayiSol(f, l, DOGUM);
    const p = parcalar(f, l);
    const refC = anaCakraRef(kulvarRef(p.map((w) => parcaDegeri(hamSesli(w)))));
    const beklenen: number[] = Array(11).fill(0);
    for (const v of [...HY_REF.destekler, ...PIN_REF.slice(0, 8), ...refC.destekler]) beklenen[v] += 1;
    kontrol("omurga", J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => sol[c])) === J(beklenen.slice(1)), `sol sütun = HY+PİN+Ana (${f} ${l})`, sol);
    const toplam = Object.values(sol).reduce((a, b) => a + b, 0);
    kontrol("omurga", toplam === HY_REF.destekler.length + 8 + refC.destekler.length, `destek toplamı eşleşiyor (${f} ${l})`, toplam);
  }
  // Gösterim metni hesap kaynağı değil: display'i bozulmuş snapshot'ta bile alternatif katkıları yapıdan gelir
  const m = hesaplaNumeroloji({ firstName: "NIIA CU CU RARD", lastName: "HAA", birthDate: DOGUM });
  const bozuk = JSON.parse(JSON.stringify(m));
  bozuk.anaKulvar.display = "XX/YY"; bozuk.yanKulvar.display = "";
  kontrol("omurga", J(alternativeChakraColumns(bozuk, "yan").map((c) => c.altSupports)) === J(alternativeChakraColumns(m, "yan").map((c) => c.altSupports)), "gösterim metni değişse de katkılar aynı (display parse yok)");
  // Tekrarlanan katkı silinmez: [9,9,9,9] → dört 9 + Ana 9
  const [f9, l9] = sentetikKisi([9, 9, 9, 9]);
  kontrol("omurga", J(anaKulvarCakraDestekleri(f9, l9)) === J([9, 9, 9, 9, 9]), "tekrarlanan 9 katkıları korunur");
}

// ════════════════════════ 7. ALTERNATİFLER ASIL ANALİZDEN AYRI ════════════════════════
{
  for (const c of CASES_68) {
    const [f, l] = sentetikKisi(c.giris);
    const m = hesaplaNumeroloji({ firstName: f, lastName: l, birthDate: DOGUM });
    const once = JSON.stringify(m);
    const a1 = alternativeChakraColumns(m, "ana");
    const y1 = alternativeChakraColumns(m, "yan");
    // ters sırada / tekrar hesap: önceki senaryonun katkısı taşınmaz
    const y2 = alternativeChakraColumns(m, "yan");
    const a2 = alternativeChakraColumns(m, "ana");
    kontrol("alternatif", JSON.stringify(m) === once, `#${c.no} alternatif hesap asıl analizi değiştirmez`);
    kontrol("alternatif", J(a1) === J(a2) && J(y1) === J(y2), `#${c.no} geçişte katkı taşınmaz (deterministik)`);
    const hyPin = [...HY_REF.destekler, ...PIN_REF.slice(0, 8)];
    for (const col of a1) {
      const bek: number[] = Array(11).fill(0);
      for (const v of [...hyPin, ...col.altSupports]) bek[v] += 1;
      kontrol("alternatif", J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => col.sayilar[x])) === J(bek.slice(1)), `#${c.no} Ana alt ${col.path} = HY+PİN+alternatif (yalnız Ana değişir)`);
    }
    for (const col of y1) {
      const top = Object.values(col.sayilar).reduce((a, b) => a + b, 0);
      kontrol("alternatif", col.fixed === null && col.harfler === null && top === col.altSupports.length, `#${c.no} Yan alt ${col.path} yalnız kendi katkısı`);
    }
    kontrol("alternatif", J(m.cakraOmurgasi) === J(hesaplaNumeroloji({ firstName: f, lastName: l, birthDate: DOGUM }).cakraOmurgasi), `#${c.no} resmî omurga alternatiflerden bağımsız`);
  }
}

// ════════════════════════ 8. ESKİ KAYIT UYUMLULUĞU ════════════════════════
{
  const m = hesaplaNumeroloji({ firstName: "Ömer", lastName: "GÜNEŞ", birthDate: DOGUM });
  const eski = JSON.parse(JSON.stringify(m));
  eski.anaKulvar.display = "11/8 (19/0)"; // eski metodoloji gösterimi
  eski.cakraOmurgasi.sayilar = { ...eski.cakraOmurgasi.sayilar, 10: 1, 8: 0 }; // eski kurallı omurga
  const raw = { version: 1, motor: eski, summary: "" };
  const okunan = extractMotorFromAnalysisJson(JSON.parse(JSON.stringify(raw)), "Ömer", "GÜNEŞ");
  kontrol("eski", okunan?.anaKulvar.display === "11/8 (19/0)", "eski kayıt gösterimi kaydedildiği gibi (yeniden hesap yok)");
  kontrol("eski", J(okunan?.cakraOmurgasi.sayilar) === J(eski.cakraOmurgasi.sayilar), "eski kayıt çakra omurgası kaydedildiği gibi");
  kontrol("eski", J(raw.motor) === J(eski), "okuma snapshot'ı değiştirmez");
  const yeni = hesaplaNumeroloji({ firstName: "Ömer", lastName: "GÜNEŞ", birthDate: DOGUM });
  kontrol("eski", yeni.anaKulvar.display === "11/8 (19)", "yeni analiz sahte /0 içermez");
  const legacyNoComp = JSON.parse(JSON.stringify(m));
  delete legacyNoComp.anaKulvar.componentValues; delete legacyNoComp.yanKulvar.componentValues;
  kontrol("eski", alternativeChakraColumns(legacyNoComp, "ana").length === 0, "bileşensiz eski kayıt: panel yok, çökme yok");
  const legacyHy = JSON.parse(JSON.stringify(hesaplaNumeroloji({ firstName: "NIIA CU CU RARD", lastName: "HAA", birthDate: DOGUM })));
  legacyHy.hayatYolu.display = "37/1";
  kontrol("eski", J(alternativeChakraColumns(legacyHy, "ana")[0]?.fixed?.hayatYolu) === J([3, 7, 1]), "eski HY gösterimi kayıttan okunur, yeniden hesaplanmaz");
}

// ════════════════════════ 9. ÖNCEKİ 1.069 FARKLI OLUŞUM — ESKİ KURAL ↔ YENİ ════════════════════════
const eskiFark: Record<string, number> = {};
let eskiToplam = 0;
{
  const VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 19, 22, 33];
  const diziler: number[][] = [];
  (function gen(p: number[], s: number) {
    if (p.length >= 1) diziler.push([...p]);
    if (p.length === 4) return;
    for (let i = s; i < VALS.length; i++) gen([...p, VALS[i]], i);
  })([], 0);
  // ESKİ (PR öncesi main) kural — display split("/",2) + vowelValueOfWord
  const eskiKural = (b: number[], display: string): number[] => {
    const text = display.trim().replace(/\s*\([^)]*\)\s*$/, "");
    const [l, r] = text.includes("/") ? text.split("/", 2).map(Number) : [Number(text), null];
    if ([11, 19, 22, 33].includes(l) && r !== null) return r >= 1 && r <= 9 ? [10, r] : [10];
    const nv = b.filter((v) => v > 0).map((v) => ([11, 22, 33].includes(v) ? 10 : tekHane(v)));
    if (!nv.length) return [];
    const ak = tekHane(nv.reduce((x, y) => x + y, 0));
    return ak >= 1 && ak <= 9 ? [...nv, ak] : nv;
  };
  for (const d of diziler) {
    if (!d.some((v) => v > 0)) continue;
    const [f, l] = sentetikKisi(d.filter((v) => v > 0));
    const a = calcAnaKulvar(f, l);
    const eski = eskiKural(a.componentValues ?? [], a.display);
    const yeni = anaKulvarCakraDestekleri(f, l);
    if (J(eski) === J(yeni)) continue;
    eskiToplam += 1;
    const ref = kulvarRef(a.componentValues ?? []);
    let sinif: string;
    if (ref.durum === "D2" && eski.length === 1 && yeni.length === 2) sinif = "Gerçek kalan değer kayboluyordu (11/11/4 türü): [10] → [10, kalan]";
    else if (ref.durum === "tek-ozel") sinif = "Tek özel parça: 19 → [1,1] / 11 → [10,1] yerine [10] (özel sayı tek başına yalnız 10)";
    else if (ref.durum === "D1") sinif = "Toplamı özel olan parçalar (ör. [9,1,9] → 19): isim sadeleşmeleri yerine [10]";
    else if (ref.durum === "D4" && ref.kalan.length === 0) sinif = "Kalansız özel çift (5+6 → 11): yapay [10, küçük parça] yerine [10]";
    else sinif = `AÇIKLANAMAYAN (${ref.durum}) ${J(d)} eski ${J(eski)} yeni ${J(yeni)}`;
    eskiFark[sinif] = (eskiFark[sinif] ?? 0) + 1;
  }
  kontrol("omurga", !Object.keys(eskiFark).some((k) => k.startsWith("AÇIKLANAMAYAN")), "eski↔yeni farklarının tamamı açıklandı", eskiFark);
}

// ════════════════════════ ÇIKTI ════════════════════════
const csvBaslik = ["no", "grup", "giris", "normal", "ozel", "birlesen", "kalan", "gosterim", "anahtar", "alternatif", "beklenen", "motor", "fark", "sonuc", "karar", "aciklama"];
const csv = [csvBaslik.join(";"), ...satirlar68.map((r) => csvBaslik.map((k) => String(r[k] ?? "").replace(/;/g, ",")).join(";"))].join("\n");
writeFileSync(path.join(OUT, "68-referans-sonuclari.csv"), "﻿" + csv, "utf8");
const md: string[] = [];
md.push("# Numeroloji — 68 Referans Kombinasyonu (ayrıntılı sonuç)", "");
md.push("Giriş = parça HAM toplamları (sıra korunur). Beklenen = elle doğrulanmış golden + bağımsız referans hesaplayıcı (üretim kodu kullanılmaz). Çakra = Ana Kulvar'ın sol sütun katkısı (eğitim notu s.2 + 03.10.2026 + owner nihai kararı 2026-10-18).", "");
md.push("| # | Grup | Giriş | Normal | Özel oluşumlar | Birleşen | Kalan | Gösterim | Anahtar | Alternatifler → katkı | Beklenen çakra | Motor çakra | Fark | Sonuç | Karar |");
md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of satirlar68) md.push(`| ${r.no} | ${r.grup} | \`${r.giris}\` | \`${r.normal}\` | ${r.ozel} | ${r.birlesen} | ${r.kalan} | \`${r.gosterim}\` | ${r.anahtar} | ${r.alternatif} | ${r.beklenen} | ${r.motor} | ${r.fark} | ${r.sonuc} | ${r.karar || "—"} |`);
md.push("", "## Owner nihai kararı (2026-10-18) — kapatılan sorular", "", ...Object.entries(KARAR_ACIKLAMA).map(([k, v]) => `- **${k}** — ${v}`));
md.push("", "## Gerçek isim-soyisim", "", "| İsim | Tür | Ana bileşen | Ana | Yan bileşen | Yan | Motor çakra | Beklenen | Alt (Ana) | Alt (Yan) | Sonuç | Karar |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of satirlarIsim) md.push(`| ${r.isim} | ${r.tur} | \`${r.anaBilesen}\` | \`${r.ana}\` | \`${r.yanBilesen}\` | \`${r.yan}\` | ${r.cakra} | ${r.beklenen} | ${r.altAna} | ${r.altYan} | ${r.sonuc} | ${r.karar || "—"} |`);
md.push("", "## Otomatik tarama sınıfları", "", ...Object.entries(taramaSiniflari).map(([k, v]) => `- ${k}: **${v}**${taramaOrnek[k]?.length ? ` — örnek: ${taramaOrnek[k].join(" · ")}` : ""}`));
md.push("", `## Eski kural ↔ yeni (PR öncesi main'e göre değişen ${eskiToplam} oluşum)`, "", ...Object.entries(eskiFark).map(([k, v]) => `- ${k}: **${v}**`));
writeFileSync(path.join(OUT, "68-referans-sonuclari.md"), md.join("\n"), "utf8");
writeFileSync(path.join(OUT, "dogrulama-ozet.json"), JSON.stringify({ sayac, taramaSiniflari, eskiFark, eskiToplam, hatalar }, null, 2), "utf8");

console.log("\n| Alan | Test | PASS | FAIL | Karar bekleyen |\n|---|---:|---:|---:|---:|");
const AD: Record<Bolum, string> = { "68": "68 referans kombinasyonu", isim: "Gerçek isim-soyisim", tarama: "Otomatik geniş tarama", omurga: "Ana Çakra Omurgası", alternatif: "Alternatif Çakra Sütunları", eski: "Eski kayıt uyumluluğu", golden: "Özel golden + HASAN", refgolden: "Bağımsız referans ↔ elle golden (68)", yol: "Sayısal dizi ↔ isim aynı motor yolu" };
for (const b of Object.keys(sayac) as Bolum[]) console.log(`| ${AD[b]} | ${sayac[b].test} | ${sayac[b].pass} | ${sayac[b].fail} | ${sayac[b].karar} |`);
console.log("\nTarama sınıfları:", taramaSiniflari);
console.log(`Eski↔yeni fark (${eskiToplam}):`, eskiFark);
if (hatalar.length) { console.log(`\nHATALAR (${hatalar.length}):`); for (const h of hatalar.slice(0, 40)) console.log("  ✗", h); }
console.log(`\nÇıktı: ${OUT}`);
process.exit(Object.values(sayac).some((s) => s.fail > 0) ? 1 : 0);

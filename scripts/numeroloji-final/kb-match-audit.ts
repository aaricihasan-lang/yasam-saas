/**
 * NUMEROLOJİ — BİLGİ BANKASI EŞLEŞME DENETİMİ (F, owner talimatı 2026-10-18). SALT RAPOR — eşleşme
 * mantığı DEĞİŞTİRİLMEZ. Çalıştır: npx tsx scripts/numeroloji-final/kb-match-audit.ts [--out <dosya.md>]
 *
 * Ana/Yan Kulvar için bilgi bankası sorgusu `valueCandidatesFromResult` ile yapılır: gösterimin tam
 * çekirdeği + "/" ile ayrılan her sayı + ara kontrol parantezindeki sayılar + kanonik anahtar (key).
 * Birleşik okuma ("(22)", "(33)") aday değildir. Ana/Yan'da İLK eşleşen değil, eşleşen HER aday için
 * uzmanın kendi bilgi bankasındaki kayıt gösterilir (pickNotesForType; firstMatchOnly yok).
 */
import { writeFileSync } from "node:fs";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { anaKulvarCakraDestekleri } from "@/lib/numeroloji/cakraOmurgasi";
import { valueCandidatesFromResult } from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";
import { formatKulvarSummaryDisplay } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { findKulvarSpecialCombinations } from "@/lib/numeroloji/alternativeCombinations";
import type { NumerolojiResult } from "@/lib/numeroloji/ortak";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : "";

const SESLI: [string, number][] = [["I", 9], ["O", 6], ["E", 5], ["U", 3], ["A", 1]];
const SESSIZ: [string, number][] = [["R", 9], ["H", 8], ["G", 7], ["F", 6], ["N", 5], ["D", 4], ["C", 3], ["B", 2], ["S", 1]];
const harf = (t: number, a: [string, number][]) => { const o: string[] = []; let r = t; for (const [c, v] of a) while (r >= v) { o.push(c); r -= v; } return o; };
function kelime(v: number, c: number) {
  const a = harf(v, SESLI), b = harf(c, SESSIZ), o: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (b[i]) o.push(b[i]); if (a[i]) o.push(a[i]); }
  return o.join("");
}
function kisi(ham: number[]): [string, string] {
  const p = ham.map((h) => kelime(h, h));
  return [p.slice(0, -1).join(" ") || p[0], p.length > 1 ? p[p.length - 1] : ""];
}

const ORNEKLER: { ad: string; ham: number[]; not?: string }[] = [
  { ad: "5+6=11", ham: [5, 6] },
  { ad: "5+6+5=11/5", ham: [5, 6, 5] },
  { ad: "11/22 (33)", ham: [11, 22] },
  { ad: "11/11 (22)", ham: [11, 11] },
  { ad: "11/19/19", ham: [11, 19, 19] },
  { ad: "19/5", ham: [19, 5] },
  { ad: "22/11/8 (resmî sonuç olarak)", ham: [22, 11, 8] },
  { ad: "22/11/8 (owner ekranı: alternatif yol)", ham: [5, 3, 3, 22, 8], not: "Resmî sonuç 22/19 (11/3); 22/11/8 yalnız 'Farklı Özel Sayı Kombinasyonları' kutusunda — alternatifler bilgi bankası sorgusuna GİRMEZ." },
];

type Satir = { kulvar: string; ornek: string; bilesen: string; gosterim: string; ozet: string; key: string; aday: string[]; gorunmeyen: string[]; anahtarYalniz: boolean; parantezAday: string[]; cakra: string; alt: string; not: string };
const satirlar: Satir[] = [];
for (const o of ORNEKLER) {
  const [f, l] = kisi(o.ham);
  for (const [kulvar, r] of [["Ana", calcAnaKulvar(f, l)], ["Yan", calcYanKulvar(f, l)]] as [string, NumerolojiResult][]) {
    const aday = valueCandidatesFromResult(r);
    const ozet = formatKulvarSummaryDisplay(r);
    const ozetSayilar = new Set(ozet.replace(/[()]/g, " ").split(/[\s/-]+/).filter(Boolean));
    const ozetCekirdek = ozet.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const gorunmeyen = aday.filter((v) => v !== ozetCekirdek && !ozetSayilar.has(v));
    const parantez = (r.display.match(/\(([^)]+)\)/)?.[1] ?? "").split("/").filter(Boolean);
    const parantezAday = r.combinedReading ? [] : parantez.filter((v) => aday.includes(v) && !ozetSayilar.has(v));
    const tokens = new Set(r.display.replace(/[()]/g, " ").split(/[\s/-]+/).filter(Boolean));
    satirlar.push({
      kulvar, ornek: o.ad, bilesen: JSON.stringify(r.componentValues), gosterim: r.display, ozet, key: r.key, aday,
      gorunmeyen, anahtarYalniz: !tokens.has(r.key), parantezAday,
      cakra: kulvar === "Ana" ? JSON.stringify(anaKulvarCakraDestekleri(f, l)) : "— (Yan Kulvar resmî omurgada yok)",
      alt: findKulvarSpecialCombinations(r.componentValues ?? []).join(" · ") || "—",
      not: o.not ?? "",
    });
  }
}

const md: string[] = [];
md.push("# Bilgi Bankası Eşleşme Denetimi (F) — Ana / Yan Kulvar", "");
md.push("Kural (değiştirilmedi): aday listesindeki **her** değer için uzmanın bilgi bankasında aynı türde (Ana/Yan Kulvar) kayıt varsa o kayıt gösterilir; sıra = aday sırası, aynı kayıt bir kez. Birleşik okuma (22)/(33) aday değildir. Alternatif yollar aday değildir.", "");
md.push("| Kulvar | Örnek | Bileşenler | Ana sonuç (tam) | Özet ekranında | Kanonik anahtar | Bilgi bankası adayları (sırayla; kayıt varsa gösterilir) | Ekranda görünmeyen aday | Çakra | Değerlendirme |");
md.push("|---|---|---|---|---|---|---|---|---|---|");
for (const s of satirlar) {
  const deg: string[] = [];
  if (s.anahtarYalniz) deg.push(`⚠ anahtar ${s.key} gösterimde YOK (yalnız yorum sayısı) → görünmeyen bir sayının kaydı gelir`);
  if (s.parantezAday.length) deg.push(`ⓘ ara kontrol parantezi adayları (${s.parantezAday.join(", ")}) özet ekranında görünmez; ayrıntılı ekran ve Word'de görünür`);
  if (!deg.length) deg.push("✓ çelişki yok — tüm adaylar görünen sonuçta");
  if (s.not) deg.push(s.not);
  md.push(`| ${s.kulvar} | ${s.ornek} | \`${s.bilesen}\` | \`${s.gosterim}\` | \`${s.ozet}\` | ${s.key} | ${s.aday.map((a) => `\`${a}\``).join(" → ")} | ${s.gorunmeyen.join(", ") || "—"} | ${s.cakra} | ${deg.join("<br>")} |`);
}
const text = md.join("\n");
console.log(text);
if (OUT) writeFileSync(OUT, text, "utf8");

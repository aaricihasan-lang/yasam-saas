import {
  hesaplaNumeroloji,
  type NumerolojiResult,
  type HarfYankilanisiSegment,
  type ElementResult,
  type PinKoduBoxes,
} from "@/lib/numeroloji";
import { findKulvarSpecialCombinationsDetailed } from "@/lib/numeroloji/alternativeCombinations";
import {
  CHRONO_CUTOFF_NOTE,
  cutoffHarfSegments,
  cutoffZirvePeaks,
  cutoffMucadele,
  cutoffDegisimYearOnly,
  cutoffDegisimFullDate,
  dogumYilindanOut,
  harfDisplayAgeEnd,
  harfDisplayYearEnd,
  type HarfCutoffSegment,
} from "./chronoCutoff";

export type NumerolojiMotorOut = ReturnType<typeof hesaplaNumeroloji>;

export function nrDisplay(r: NumerolojiResult | null | undefined): string {
  // Bozuk/eksik kayıtlarda r veya r.display undefined olabilir → çökmemeli.
  const d = r && typeof r.display === "string" ? r.display : "";
  return d.trim() || "—";
}

/**
 * SONUÇ ÖZETİ presentation-only formatı (Ana/Yan Kulvar). CANONICAL DEĞİL; engine/result
 * mutate ETMEZ, key/lookup'ı ETKİLEMEZ. Yalnız Sonuç Özeti kartlarında gösterilen METİN.
 *
 * OWNER KARARI:
 *  - `combinedReading` metadata'sı VARSA (owner birleşik hatırlatması "22"/"33"): display
 *    AYNEN korunur. Örn: "11/11 (22)" → "11/11 (22)".
 *  - `combinedReading` YOKSA: display'in sonundaki LEGACY decomposition parantezi Sonuç
 *    Özeti için gizlenir (metadata-first; string-tahmini DEĞİL). Örn: "22/19 (11/3)" → "22/19",
 *    "33/6 (22/11/6)" → "33/6", "22 (11-11)" → "22". Parantez yoksa değişmez ("19/9" → "19/9").
 *
 * Not: Ayrıntı (Hesap Özetli) sekmesi tam `display`i (`nrDisplay`) kullanmaya devam eder —
 * bu helper YALNIZ Sonuç Özeti içindir. Legacy ve combined parantezleri engine'de birbirini
 * dışladığı için (combinedReading yalnız all-special dalında set edilir) tek `(...)` grubu güvenlidir.
 */
export function formatKulvarSummaryDisplay(r: NumerolojiResult | null | undefined): string {
  const full = nrDisplay(r);
  if (!r || full === "—") return full;
  const cr = typeof r.combinedReading === "string" ? r.combinedReading.trim() : "";
  // Metadata-first: owner birleşik hatırlatması varsa display AYNEN korunur.
  if (cr) return full;
  // combinedReading yok → yalnız sondaki tek legacy parantez grubunu soy.
  const stripped = full.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped || full;
}

/**
 * SONUÇ ÖZETİ / NUMEROLOJİK ANALİZ — "Farklı özel sayı kombinasyonları" YOL LİSTESİ.
 * Ana/Yan Kulvar result'ının GERÇEK per-token component'lerinden türetilir (canonical DEĞİL).
 * Kulvar olmayan (componentValues yok) result'larda `[]` döner.
 */
export function kulvarAlternativePaths(r: NumerolojiResult | null | undefined): string[] {
  const comps = r && Array.isArray(r.componentValues) ? r.componentValues : [];
  return findKulvarSpecialCombinationsDetailed(comps).map((d) => d.path);
}

/** Tek bir oluşum yolunun (variant) kısa köken satırları. */
export type KulvarAlternativeVariant = { lines: string[] };
/**
 * Bir numeric path + onu oluşturan TÜM unique (değer-bazlı) oluşum yolları.
 * `variants.length > 1` → aynı sayısal sonuç birden fazla gerçek gruplayışla oluşuyor.
 */
export type KulvarAlternativeProvenance = { path: string; variants: KulvarAlternativeVariant[] };

/** Tek variant'ın groups+remainder'ından kısa köken satırları üretir. */
function variantLines(v: { groups: { sum: number; parts: number[] }[]; remainderParts: number[]; remainderValue: number }): string[] {
  const lines = v.groups.map((g) =>
    g.parts.length <= 1 ? `${g.sum} (mevcut özel)` : `${g.parts.join("+")} → ${g.sum}`
  );
  if (v.remainderParts.length === 1) lines.push(`kalan ${v.remainderParts[0]}`);
  else if (v.remainderParts.length > 1)
    lines.push(`kalan ${v.remainderParts.join("+")} → ${v.remainderValue}`);
  return lines;
}

/**
 * HESAP ÖZETLİ için provenance'lı alternatif kombinasyon dökümü (yalnız kısa köken; YENİ
 * numeroloji yorumu DEĞİL). NUMERIC path tekil; her path'in altında onu oluşturan TÜM unique
 * (değer-bazlı) gerçek yollar korunur. Owner örneği:
 *   22/11/8 → variants: [["22 (mevcut özel)","3+8 → 11","kalan 5+3 → 8"],
 *                        ["22 (mevcut özel)","5+3+3 → 11","kalan 8"]]
 */
export function kulvarAlternativeProvenance(
  r: NumerolojiResult | null | undefined
): KulvarAlternativeProvenance[] {
  const comps = r && Array.isArray(r.componentValues) ? r.componentValues : [];
  return findKulvarSpecialCombinationsDetailed(comps).map((d) => ({
    path: d.path,
    variants: d.variants.map((v) => ({ lines: variantLines(v) })),
  }));
}

export function pinOneLine(pin: PinKoduBoxes): string {
  return `[${pin.k1}] [${pin.k2}] [${pin.k3}] [${pin.k4}] | [${pin.k5}] [${pin.k6}] [${pin.k7}] | [${pin.k8}] [${pin.k9}]`;
}

export function elementShort(el: ElementResult): string {
  const d = (el.display || "").trim();
  const k = (el.key || "").trim();
  if (!d && !k) return "—";
  if (k) return `${d}  (Baskın: ${k})`;
  return d || "—";
}

export function harfSegmentsToText(segments: HarfYankilanisiSegment[]): string {
  if (!segments.length) return "—";
  return segments
    .map((seg, idx) => {
      const y =
        seg.yearStart != null
          ? `  yıl ${seg.yearStart}${seg.yearEnd != null ? `–${seg.yearEnd}` : ""}`
          : "";
      return `${idx + 1}. ${seg.letter}  çakra ${seg.chakra}  yaş ${seg.ageStart}–${seg.ageEnd}${y}`;
    })
    .join("\n");
}

/**
 * Başlangıç yılı ≤ currentYear olan harf segmentlerini ORİJİNAL (tam) aralıklarıyla metne döker.
 * Kırpma / "gösterilen bölüm" YOK (owner: tam aralık).
 */
export function harfCutoffToText(segments: HarfCutoffSegment[]): string {
  if (!segments.length) return "—";
  return segments
    .map((seg, idx) => {
      const ageEnd = harfDisplayAgeEnd(seg);
      const yearEnd = harfDisplayYearEnd(seg);
      const y = seg.yearStart != null ? `  yıl ${seg.yearStart}${yearEnd != null ? `–${yearEnd}` : ""}` : "";
      return `${idx + 1}. ${seg.letter}  çakra ${seg.chakra}  yaş ${seg.ageStart}–${ageEnd}${y}`;
    })
    .join("\n");
}

/** Kayıt listesi ve Supabase özeti için kısa metin. */
export function buildAnalizOzeti(out: NumerolojiMotorOut): string {
  return [
    `Ana kulvar: ${nrDisplay(out.anaKulvar)}`,
    `Yan kulvar: ${nrDisplay(out.yanKulvar)}`,
    `İfade: ${nrDisplay(out.ifadeSayisi)}`,
    `Hayat yolu: ${nrDisplay(out.hayatYolu)}`,
    `PIN: ${pinOneLine(out.pinKodu)}`,
  ].join(" · ");
}

function extractDogumTarihi(...sources: (string | undefined | null)[]): string | null {
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(/Doğum Tarihi:\s*([^\n\r]+)/i);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function degisimSonucSatirlari(metni: string): string {
  const picked: string[] = [];
  for (const raw of metni.split("\n")) {
    const line = raw.trim();
    if (/^\d+\.\s*Değişim:/.test(line)) picked.push(line);
    else if (line.startsWith("Etki Dönemi")) picked.push(`  ${line}`);
  }
  return picked.join("\n").trim();
}

// OWNER: başlangıç yılı ≤ currentYear olan Değişim dönemleri ORİJİNAL (tam) aralıklarıyla
// gösterilir; başlamamış dönemler gizli. Kırpma / "gösterilen bölüm" YOK. Canonical hesap DEĞİŞMEZ.
// NOT: Bu builder'lar CHRONO_CUTOFF_NOTE'u İÇERMEZ; notu çağıran yüzey ekler (plain metin
// buildPlainAnalizFull'da; UI kartları styled bir bileşenle). İçerik tek kaynaktan gelir (DRY).
export function degisimBoundedText(out: NumerolojiMotorOut, currentYear: number): string {
  const bd = extractDogumTarihi(
    out.degisimDonusumMetni,
    out.elementlerMetni,
    out.zirveYillariMetni,
    out.mucadeleYillariMetni,
  );
  if (!bd) {
    const fallback = degisimSonucSatirlari(out.degisimDonusumMetni || "");
    return fallback || "—";
  }

  const yearOnly = cutoffDegisimYearOnly(bd, currentYear, 5);
  const fullDate = cutoffDegisimFullDate(bd, currentYear, 5);
  if (!yearOnly.length && !fullDate.length) return "—";

  const lines: string[] = ["Doğum yılına göre:"];
  for (const r of yearOnly) {
    lines.push(`  ${r.index}. Değişim ${r.changeYear} → ${r.chakra}. çakra (${r.effectStartYear}–${r.effectEndYearDisplay})`);
  }
  lines.push("", "Gün ve ay dahil:");
  for (const r of fullDate) {
    const md = String(r.effectMonth).padStart(2, "0");
    const dd = String(r.effectDay).padStart(2, "0");
    lines.push(`  ${r.index}. Değişim ${r.changeYear} → ${r.chakra}. çakra (${r.effectStartYear}.${md}.${dd} – ${r.effectEndYearDisplay}.${md}.${dd})`);
  }
  return lines.join("\n");
}

export function zirveBoundedText(out: NumerolojiMotorOut, currentYear: number): string {
  const birthYear = dogumYilindanOut(out);
  const peaks = cutoffZirvePeaks(out.zirveYillari?.peaks, birthYear, currentYear);
  if (!peaks.length) return "—";
  return peaks.map((p) => `${p.index}. zirve — yaş ${p.age}, konu ${p.topic}`).join("\n");
}

export function mucadeleBoundedText(out: NumerolojiMotorOut, currentYear: number): string {
  const birthYear = dogumYilindanOut(out);
  const m = cutoffMucadele(out.mucadeleYillari, birthYear, currentYear);
  if (!m) return "—";
  const lines: string[] = [];
  for (const p of m.method1) lines.push(`${p.index}. mücadele — yaş ${p.age}, konu ${p.topic}`);
  if (m.anaMucadeleVisible) {
    lines.push(`Ana mücadele — ${m.anaMucadeleBaslangicYasi} yaşından itibaren, konu ${m.anaMucadele}`);
  }
  return lines.length ? lines.join("\n") : "—";
}

export function harfBoundedText(out: NumerolojiMotorOut, currentYear: number): string {
  const hy = out.harflerinYankilanisi;
  if (!Array.isArray(hy) || !hy.length) return "—";
  const cut = cutoffHarfSegments(hy as HarfYankilanisiSegment[], currentYear);
  return cut.length ? harfCutoffToText(cut) : "—";
}

/**
 * Hesap Özetsiz sekme: yalnızca nihai sonuçlar (adım/formül yok).
 * `currentYear`: kronolojik bölümler (Değişim/Zirve/Mücadele/Harfler) bu yıla kadar gösterilir.
 */
export function buildPlainAnalizFull(out: NumerolojiMotorOut, currentYear: number): string {
  const chunks: string[] = [];

  const pushBlock = (title: string, body: string) => {
    chunks.push(title, "", (body || "—").trim(), "", "——————————", "");
  };
  // Kronolojik bloklar: içerik + TEK not (owner Section M). Not yılı sabitlemez.
  const pushChronoBlock = (title: string, body: string) => {
    const b = (body || "—").trim();
    const withNote = b === "—" ? b : `${b}\n\n${CHRONO_CUTOFF_NOTE}`;
    chunks.push(title, "", withNote, "", "——————————", "");
  };

  // OWNER: Numerolojik Analiz'de Ana/Yan CLEAN gösterilir (legacy parantez YOK; combinedReading
  // (22)/(33) KORUNUR). Detaylı aritmetik Sayısal Hesaplama (Hesap Özetli) sekmesinde durur.
  pushBlock("ANA KULVAR", formatKulvarSummaryDisplay(out.anaKulvar));
  pushBlock("YAN KULVAR", formatKulvarSummaryDisplay(out.yanKulvar));
  pushBlock("İFADE SAYISI", nrDisplay(out.ifadeSayisi));
  pushBlock("HAYAT YOLU / DM", nrDisplay(out.hayatYolu));
  pushBlock("PIN KODU", pinOneLine(out.pinKodu));
  pushBlock("ÇAKRA OMURGASI", out.cakraOmurgasiMetni || "—");
  pushBlock("ELEMENTLER", elementShort(out.elementler));
  pushChronoBlock("DEĞİŞİM — DÖNÜŞÜM", degisimBoundedText(out, currentYear));
  pushChronoBlock("ZİRVE YILLARI", zirveBoundedText(out, currentYear));
  pushChronoBlock("MÜCADELE YILLARI", mucadeleBoundedText(out, currentYear));
  pushChronoBlock("HARFLERİN YANKILANIŞI", harfBoundedText(out, currentYear));

  return chunks.join("\n").trim();
}

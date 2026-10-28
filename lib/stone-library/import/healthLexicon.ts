// Doğaltaş Kütüphanesi · SAĞLIK İDDIASI SÖZLÜĞÜ (SAF). Fiziksel etki alanı dışındaki metinlerde ve anahtar kelimelerde
// geçen tıbbi iddiaları yakalar → health_sensitive=true. İşaretlenen içerik hukuk onayı + genel kilit olmadan yayına
// çıkamaz (DB). Metin DEĞİŞTİRİLMEZ (owner kuralı: "etkilidir" → "etkili olabilir" yapılmaz).
//
// Eşleme DİLDEN BAĞIMSIZ katlanmış metin üzerinde ve KÖK (önek) olarak yapılır:
//   • "Insomnia" / "IMMUNE" (İngilizce büyük I) ve "İyileştirir" aynı biçimde katlanır (tr-TR küçük harf tuzağı yok).
//   • Türkçe çekim / ses değişimi kökle yakalanır: "hastal" → hastalık, hastalığı, hastalıkları; "agri" → ağrı, ağrısı.
// Kasıtlı olarak GENİŞ tutulur (yanlış pozitif = owner'ın hukuk incelemesine düşer; yanlış negatif = riskli yayın).
// F6: kanıtlı yanlış pozitifler (EXCLUDE) ve duygusal bağlamlı YUMUŞAK kökler cümle düzeyinde ayrıştırılır (aşağıda).

import { foldStoneLibraryText } from "../fold";

/** Kökler (katlanmış biçim; kelime BAŞINDA aranır). */
const ROOTS = [
  // TR
  "hastal", "agri", "basagri", "migren", "bagisiklik", "hormon", "tansiyon", "kan basinc", "kan dolasim", "kani temizle", "kan temizle",
  "kanser", "tumor", "diyabet", "seker hastal", "enfeksiyon", "iltihap", "tedavi", "iyiles", "sifa verir", "metabolizma", "sindirim",
  "bobrek", "karaciger", "kalp hastal", "uykusuzluk", "depresyon", "anksiyete", "doku yenile", "ates dusur", "detoks", "endokrin", "tiroid",
  "kemik", "eklem", "romatizma", "astim", "alerji", "cilt hastal", "yara", "sinir sistem", "hamile", "gebelik", "dogurganlik", "kisirlik",
  "adet donem", "regl", "kolesterol", "bas donmesi", "mide", "bagirsak", "akciger", "solunum", "gorme", "goz hastal", "felc", "epilepsi",
  "saglik", "saglig", "bedeni arindir", "zehir", "toksin",
  // EN
  "migraine", "headache", "immun", "hormon", "blood", "circulat", "cancer", "tumor", "tumour", "diabet", "infect", "inflammat", "disease",
  "illness", "cure", "cures", "heal the body", "heals the body", "treat", "medical", "medicin", "metabol", "digest", "kidney", "liver",
  "insomnia", "depress", "anxiety disorder", "tissue", "fever", "detox", "endocrin", "thyroid", "bone", "joint", "arthrit", "asthma",
  "allerg", "skin condition", "wound", "pain", "physical discomfort", "bruis", "swelling", "injur", "nervous system", "pregnan", "fertil",
  "menstru", "cholesterol", "dyslexia", "paranoia", "spinal", "spine", "lung", "respirat", "eyesight", "vision problem", "stroke", "epileps",
  "health", "toxin", "nausea", "vertigo", "dizziness", "obesity", "weight loss",
].map((r) => foldStoneLibraryText(r));

/**
 * F6 · YUMUŞAK kökler: duygusal / ruhsal anlamda da yaygın kullanılan kelimeler ("emotional wounds", "iyileştirici enerji").
 * Aynı CÜMLEDE duygusal / ruhsal / enerji bağlamı varsa tek başına işaret ÜRETMEZ; bağlamsız kullanımda (ör. "ZZ iyileştirici
 * kabul edilir", "improves overall health") yine işaretler. Güçlü kök aynı cümlede varsa cümle her durumda işaretlidir.
 * Kanıt: C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F6-ENTEGRASYON-2026-10-25 (91 taş eşleşme analizi).
 */
const SOFT = new Set(["agri", "iyiles", "yara", "pain", "wound", "health", "saglik", "saglig", "medicin", "treat"].map((r) => foldStoneLibraryText(r)));
/** Duygusal / ruhsal bağlam işaretleri (kelime başı). */
const CONTEXT = ["duygu", "ruh", "manevi", "enerji", "kalp", "gecmis", "travma", "emotion", "spiritual", "soul", "energ", "heart", "past", "trauma", "negative"].map((r) => foldStoneLibraryText(r));
/** Kelime başı eşleşse de sağlık OLMAYAN kelimeler (kanıtlı yanlış pozitifler: yaratıcı→"yara", Spinel→"spine",
 * Bloodstone→"blood", "treated as …"→"treat"). */
const EXCLUDE = ["yarat", "spinel", "bloodstone", "treated as"].map((r) => foldStoneLibraryText(r));

function rootsAt(sentence: string): string[] {
  const t = ` ${sentence}`;
  return ROOTS.filter((root) => {
    let i = t.indexOf(` ${root}`);
    while (i >= 0) {
      const rest = t.slice(i + 1);
      if (!EXCLUDE.some((x) => rest.startsWith(x))) return true;
      i = t.indexOf(` ${root}`, i + 1);
    }
    return false;
  });
}

/** Ayrıntılı sınıflandırma: güçlü kökler, bağlamla bastırılan yumuşak kökler. */
export function healthAnalysis(text: string | null | undefined): { terms: string[]; suppressed: string[] } {
  if (!text) return { terms: [], suppressed: [] };
  const terms = new Set<string>();
  const suppressed = new Set<string>();
  // Katlama noktalamayı sildiği için cümleler katlamadan ÖNCE ayrılır.
  for (const part of text.split(/[.!?;:\n]+/)) {
    const raw = foldStoneLibraryText(part);
    const hits = rootsAt(raw);
    if (!hits.length) continue;
    const strong = hits.filter((h) => !SOFT.has(h));
    const ctx = ` ${raw}`;
    const emotional = CONTEXT.some((c) => ctx.includes(` ${c}`));
    for (const h of hits) {
      if (strong.length || !emotional || !SOFT.has(h)) terms.add(h);
      else suppressed.add(h);
    }
  }
  return { terms: [...terms], suppressed: [...suppressed].filter((x) => !terms.has(x)) };
}

export function healthTermsIn(text: string | null | undefined): string[] {
  return healthAnalysis(text).terms;
}

export function hasHealthClaim(text: string | null | undefined): boolean {
  return healthTermsIn(text).length > 0;
}

// Doğaltaş Kütüphanesi · SAĞLIK İDDIASI SÖZLÜĞÜ (SAF). Fiziksel etki alanı dışındaki metinlerde ve anahtar kelimelerde
// geçen tıbbi iddiaları yakalar → health_sensitive=true. İşaretlenen içerik hukuk onayı + genel kilit olmadan yayına
// çıkamaz (DB). Metin DEĞİŞTİRİLMEZ (owner kuralı: "etkilidir" → "etkili olabilir" yapılmaz).
//
// Eşleme DİLDEN BAĞIMSIZ katlanmış metin üzerinde ve KÖK (önek) olarak yapılır:
//   • "Insomnia" / "IMMUNE" (İngilizce büyük I) ve "İyileştirir" aynı biçimde katlanır (tr-TR küçük harf tuzağı yok).
//   • Türkçe çekim / ses değişimi kökle yakalanır: "hastal" → hastalık, hastalığı, hastalıkları; "agri" → ağrı, ağrısı.
// Kasıtlı olarak GENİŞ tutulur (yanlış pozitif = owner'ın hukuk incelemesine düşer; yanlış negatif = riskli yayın).

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

export function healthTermsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = ` ${foldStoneLibraryText(text)}`;
  return ROOTS.filter((root) => t.includes(` ${root}`));
}

export function hasHealthClaim(text: string | null | undefined): boolean {
  return healthTermsIn(text).length > 0;
}

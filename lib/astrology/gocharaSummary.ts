// TRANSİT-02 (2026-10-17) — Vedik Gochara TÜRKÇE TEKNİK ÖZETİ (SAF; ekran + Word/PDF aynı metin).
//
// Sağlayıcının Gochara ucu (`/vedic-astrology/transit`) dil parametresi ALMAZ (OpenAPI 2.0.0, 17.10.2026) ve anlatı
// metnini yalnız İngilizce verir (10-11 canlı gözlem). Bu modül YORUM ÜRETMEZ: kayıtlı teknik katmandaki sayıları
// (rashi, derece, Janma Rashi'den ev, Lagna'dan bhava, drishti, kaksha/bindu) onaylı Türkçe terimlerle cümleye çevirir.
// "İyi/kötü", "etkisi", "sonuç" gibi değerlendirme İÇERMEZ; sağlayıcının İngilizce anlatısı ayrı yorum katmanında kalır.

import type { KakshaLord, VedicGrahaId, VedicTransitTechnical } from "./model/vedic";
import { SIGN_LABELS, formatDegree } from "./labels/tr";
import { GRAHA_LABELS } from "./topics/vedic";

/** Onaylı terim sözlüğü (ekranda "Terimler" olarak da gösterilir). */
export const GOCHARA_TERMS: [string, string][] = [
  ["Gochara", "Vedik transit: gezegenlerin (graha) o anki sidereal konumlarının doğum haritasına göre okunması."],
  ["Janma Rashi", "Doğumda Ay'ın bulunduğu burç (rashi). Klasik Gochara evleri bu burçtan sayılır (1 = Janma Rashi)."],
  ["Lagna / bhava", "Doğumdaki yükselen burç; bhava = Lagna'dan bütün-burç sayımıyla ev."],
  ["Drishti", "Parashari bütün-burç bakışı: her graha 7. burca; Mars 4./8., Jüpiter 5./9., Satürn 3./10. burçlara da bakar; Rahu/Ketu bakış atmaz."],
  ["Kaksha (kakshya)", "Her burcun 3°45′'lik sekiz dilimi; her dilimin sırayla Satürn, Jüpiter, Mars, Güneş, Venüs, Merkür, Ay ve Lagna yöneticisi vardır."],
  ["Bindu", "Natal Bhinnashtakavarga'da (BAV) o transit grahanın tablosunda kaksha yöneticisinin bu burca verdiği puan (var / yok). Rahu/Ketu için BAV yoktur."],
  ["Ayanamsa", "Sidereal zodyak için kullanılan kayma değeri; bu teknikte sağlayıcı yalnız Lahiri (Chitrapaksha) kullanır."],
];

const kakshaLord = (l: KakshaLord) => (l === "lagna" ? "Lagna" : GRAHA_LABELS[l]);
const drishtiTxt = (n: number) => (n === 1 ? "aynı rashide" : `${n}. burç bakışı`);

/** Tek transit graha için Türkçe teknik özet cümlesi (değerlendirme içermez). */
export function gocharaLine(t: Pick<VedicTransitTechnical, "transits">, id: VedicGrahaId): string | null {
  const x = t.transits.find((y) => y.id === id);
  if (!x) return null;
  const parts = [
    `Transit ${GRAHA_LABELS[x.id]}: ${SIGN_LABELS[x.rashi]} ${formatDegree(x.degreeInRashi)}`,
    `Janma Rashi'den ${x.houseFromMoon}. ev`,
    `Lagna'dan ${x.natalHouse}. bhava`,
  ];
  const d =
    x.drishti.length === 0
      ? x.id === "rahu" || x.id === "ketu"
        ? "drishti yok (Rahu/Ketu bu yöntemde bakış atmaz)"
        : "bakılan burçlarda natal graha yok"
      : `natal ilişki: ${x.drishti.map((r) => `${GRAHA_LABELS[r.to]} (${drishtiTxt(r.type)})`).join(", ")}`;
  parts.push(d);
  const k = x.kaksha;
  parts.push(
    `kaksha ${k.number}/8 (${formatDegree(k.start)}–${formatDegree(k.end)}, yönetici ${kakshaLord(k.lord)})${
      k.bindu === null ? "; Rahu/Ketu için bindu uygulanmaz" : `; kaksha yöneticisi natal BAV'de bindu ${k.bindu ? "vermiş" : "vermemiş"}, bu rashide ${k.binduCount}/8 bindu`
    }`,
  );
  return `${parts.join(" · ")}.`;
}

/** Ekran ve rapor için: önce yavaş grahalar (Jüpiter, Satürn, Rahu, Ketu), sonra diğerleri — kayıttaki sırayla. */
export function gocharaSummary(t: Pick<VedicTransitTechnical, "transits" | "slow">): { id: VedicGrahaId; slow: boolean; text: string }[] {
  const order = [...t.slow, ...t.transits.map((x) => x.id).filter((id) => !t.slow.includes(id))];
  return order.flatMap((id) => {
    const text = gocharaLine(t, id);
    return text ? [{ id, slow: t.slow.includes(id), text }] : [];
  });
}

export const GOCHARA_SUMMARY_NOTE =
  "Türkçe teknik özet kayıtlı hesaplama değerlerinden (rashi, ev sayımları, drishti, kaksha/bindu) kurulur; yorum veya değerlendirme içermez. Sağlayıcının anlatı metni bu uçta yalnız İngilizce verilir; yetkiye bağlı ayrı yorum bölümünde değiştirilmeden yer alır.";

export const GOCHARA_STRIP_LEGEND =
  "Kutular Janma Rashi'den (natal Ay burcu) sayılan 12 evdir (1–6 üst satır, 7–12 alt satır); 1. ev Janma Rashi'dir (vurgulu). Her kutuda o burçtaki transit grahalar yazılıdır; altı çizili olanlar yavaş grahalardır (Jüpiter, Satürn, Rahu, Ketu). Uygulamadaki ev şeridiyle aynı veri; kayıtlı analizden çizilmiştir.";

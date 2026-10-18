// Gökyüzü Atlası — KP Horary sunum yardımcıları (SAF; ekran ve Word/PDF AYNI kaynağı kullanır).
//
// HESAP MOTORU DEĞİLDİR. Buradaki her değer Roxy /vedic-astrology/kp/horary yanıtının adaptörde doğrulanmış teknik
// katmanından (KpHoraryTechnical) yalnız OKUNUR ve yeniden düzenlenir:
//   • Cusp sub-lord tablosu = her cusp'ın sub lordu + o grahanın Roxy significator satırı (planetWise, 4 düzey). Yeni kural yok.
//   • Lagna karşılaştırması = sayıdan gelen horary Lagna'sı (ascendant) ↔ ruling planets'ın ZAMAN Lagna'sı (rulingPlanets.lagna*).
// Hangi evin hangi soru için "olumlu" sayılacağı (ör. evlilik 2-7-11) EKOL KARARIDIR → burada YOKTUR; uzman yorumlar.

import { SIGN_LORDS, isKpNode, type KpHoraryTechnical, type KpLevel, type KpLordSet } from "../model/kp";
import type { VedicGrahaId } from "../model/vedic";
import type { SignId } from "../model/western";

export const KP_LEVELS: readonly KpLevel[] = [1, 2, 3, 4];

export type KpCuspSublordRow = {
  house: number;
  rashi: SignId;
  signLord: VedicGrahaId;
  starLord: VedicGrahaId;
  subLord: VedicGrahaId;
  kpNumber: number;
  /** Sub lordun Roxy significator düzeyleri (planetWise; düğümde SADE kural). Satır yoksa null (uydurulmaz). */
  levels: Record<KpLevel, number[]> | null;
  /** Düğüm sub lord ise aynı yanıttaki ajan ekli liste (varsa). */
  agent: { levels: Record<KpLevel, number[]>; houses: number[] } | null;
  isNode: boolean;
};

/** 12 cusp × (sub lord → gösterdiği evler). Yalnız Roxy verisinin okunması. */
export function kpCuspSublordRows(t: Pick<KpHoraryTechnical, "cusps" | "significators">): KpCuspSublordRow[] {
  return t.cusps.map((c) => {
    const p = t.significators.planets.find((x) => x.id === c.subLord) ?? null;
    return {
      house: c.house,
      rashi: c.rashi,
      signLord: c.signLord,
      starLord: c.starLord,
      subLord: c.subLord,
      kpNumber: c.kpNumber,
      levels: p ? p.levels : null,
      agent: p?.agent ?? null,
      isNode: isKpNode(c.subLord),
    };
  });
}

/** Bir düzey kümesinin tekrarsız ev listesi (güçlüden zayıfa ilk görülme sırası). */
export function kpUniqueHouses(levels: Record<KpLevel, number[]> | null): number[] {
  if (!levels) return [];
  const out: number[] = [];
  for (const l of KP_LEVELS) for (const h of levels[l]) if (!out.includes(h)) out.push(h);
  return out;
}

export type KpHoraryLagnaContrast = {
  /** Sayının seçtiği KP alt bölümünün orta noktası (yalnız bu kısım sayıdan gelir). */
  horary: { rashi: SignId; signLord: VedicGrahaId; starLord: VedicGrahaId; subLord: VedicGrahaId; kpNumber: number };
  /** Soru anının gerçek (zaman) Lagna'sının lordları — ruling planets bundan okunur (Roxy belgesi + bağımsız test). */
  time: KpLordSet;
  /** Burç lordu farklı mı (ör. golden: horary Başak/Merkür ↔ zaman Akrep/Mars). */
  differs: boolean;
};

export function kpHoraryLagnaContrast(t: Pick<KpHoraryTechnical, "ascendant" | "ruling">): KpHoraryLagnaContrast {
  const a = t.ascendant;
  const horary = { rashi: a.rashi, signLord: SIGN_LORDS[a.rashi], starLord: a.starLord, subLord: a.subLord, kpNumber: a.kpNumber };
  const time = t.ruling.lagna;
  return { horary, time, differs: horary.signLord !== time.sign || horary.starLord !== time.star || horary.subLord !== time.sub };
}

/** Ekran + Word/PDF ortak yöntem metinleri (tek kaynak; metin değişirse ikisi birlikte değişir). */
export const KP_HORARY_TEXT = {
  numberRule:
    "Sayı (1–249) zodyağın KP alt bölümlerinden birini seçer; horary Lagna'sı bu dilimin ORTA noktasıdır. Haritada sayıdan gelen tek değer Lagna'dır: diğer 11 cusp bu Lagna'dan değerlendirme yerinin enleminde (Placidus), gezegenler soru anının gerçek gökyüzünden gelir. Doğum verisi kullanılmaz.",
  rulingRule:
    "Ruling planets soru anının GERÇEK (zaman) Lagna'sından okunur, sayının Lagna'sından değil. Sıra sağlayıcınındır (güçlüden zayıfa). Klasik beş öğe: gün lordu (Hindu günü, gün doğumundan itibaren), Ay'ın burç ve yıldız lordu, zaman Lagna'sının burç ve yıldız lordu. Sub lordlar kümeye girmez; yalnız bilgi olarak gösterilir.",
  cuspSubRule:
    "Her satır: cusp'ın sub lordu ve bu grahanın aynı hesaplamadaki significator evleri (L1 en güçlü … L4 en zayıf). Hangi evlerin hangi soru için destekleyici sayılacağı ekole ve uzmana bağlıdır; Yaşam Sistemi olumlu/olumsuz hüküm üretmez.",
  nodeRule:
    "Sub lord Rahu/Ketu ise tablo sade kuralı gösterir; '+' ile işaretli evler aynı yanıttaki ajan ekli listeden gelir.",
  source: "Kaynak: Roxy /vedic-astrology/kp/horary (OpenAPI 2.0.0). Tablolar sağlayıcı yanıtının yeniden düzenlenmesidir; yeni hesap yoktur.",
} as const;

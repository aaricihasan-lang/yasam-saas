// Astroloji 6C — KP alt bölüm (sub / sub-sub / KP numarası) TUTARLILIK yardımcısı (SAF).
//
// Bir HESAP MOTORU DEĞİLDİR: hiçbir lord buradan üretilip gösterilmez. Adaptör, Roxy'nin döndürdüğü star/sub/sub-sub lord ve KP
// numarasının boylamla çelişmediğini bununla denetler (fail-closed). Kural (KP Reader I): her nakshatra (13°20′) 9 sub'a,
// yıldız yöneticisinden başlayarak Vimshottari sırası ve yıl oranıyla (yıl/120) bölünür; sub da aynı oranla 9 sub-sub'a.
// KP numarası: sub'lar zodyak sırasıyla 1'den numaralanır; bir burç sınırını kesen sub İKİ numara alır → toplam 249.
// Yuvarlama: sağlayıcı boylamı 4 ondalık verir → sınıra BOUNDARY_EPS'ten yakın noktada iki komşu da kabul edilir.

import { NAKSHATRA_LORDS, VIMSHOTTARI_YEARS, type VedicGrahaId } from "../model/vedic";

const NAK = 360 / 27;
export const BOUNDARY_EPS = 1e-4;
/**
 * Sınır kuralı: tam sınırdaki nokta SONRAKİ dilime aittir. Dilim sınırları kayan nokta toplamıyla kurulduğundan (ör. 23.999…96 ya da
 * 24.000…04) aramada boylama 1e-9° eklenir; böylece tam 24.0000° gibi 4 ondalık sağlayıcı değerleri doğru dilime düşer.
 */
const NUDGE = 1e-9;

type Seg = { start: number; end: number; lord: VedicGrahaId };

function subsOf(nakIndex: number, from: number, span: number, startLord: VedicGrahaId): Seg[] {
  const i0 = NAKSHATRA_LORDS.indexOf(startLord);
  const out: Seg[] = [];
  let acc = from;
  for (let k = 0; k < 9; k++) {
    const lord = NAKSHATRA_LORDS[(i0 + k) % 9];
    const w = (span * VIMSHOTTARI_YEARS[lord]) / 120;
    out.push({ start: acc, end: k === 8 ? from + span : acc + w, lord });
    acc += w;
  }
  void nakIndex;
  return out;
}

/** Bir nakshatranın 9 sub'ı (boylam aralığı + lord). */
export function nakshatraSubs(nakIndex: number): Seg[] {
  return subsOf(nakIndex, nakIndex * NAK, NAK, NAKSHATRA_LORDS[nakIndex % 9]);
}

/** KP numarası tablosu (1…249): burç sınırında bölünmüş sub dilimleri. */
let TABLE: { start: number; end: number; star: VedicGrahaId; sub: VedicGrahaId; kp: number }[] | null = null;
export function kpTable() {
  if (TABLE) return TABLE;
  const rows: { start: number; end: number; star: VedicGrahaId; sub: VedicGrahaId; kp: number }[] = [];
  for (let n = 0; n < 27; n++) {
    for (const s of nakshatraSubs(n)) {
      const cut = Math.floor(s.start / 30 + 1e-12) * 30 + 30;
      const pieces = s.end > cut + 1e-9 ? [[s.start, cut], [cut, s.end]] : [[s.start, s.end]];
      for (const [a, b] of pieces) rows.push({ start: a, end: b, star: NAKSHATRA_LORDS[n % 9], sub: s.lord, kp: rows.length + 1 });
    }
  }
  TABLE = rows;
  return rows;
}

export type KpLords = { star: VedicGrahaId; sub: VedicGrahaId; subSub: VedicGrahaId; kpNumber: number };

/** Boylamın KP lordları; `eps` içinde sınıra yakınsa komşu adayları da döndürür (yuvarlama toleransı). */
export function kpLordCandidates(longitude: number, eps = BOUNDARY_EPS): KpLords[] {
  const out: KpLords[] = [];
  const seen = new Set<string>();
  for (const l of [longitude, longitude - eps, longitude + eps]) {
    const lon = Math.min(360 - 1e-12, (((l % 360) + 360) % 360) + NUDGE);
    const n = Math.min(26, Math.floor(lon / NAK));
    const sub = nakshatraSubs(n).find((s) => lon >= s.start && lon < s.end) ?? nakshatraSubs(n)[8];
    const ss = subsOf(n, sub.start, sub.end - sub.start, sub.lord).find((s) => lon >= s.start && lon < s.end) ?? subsOf(n, sub.start, sub.end - sub.start, sub.lord)[8];
    const row = kpTable().find((r) => lon >= r.start && lon < r.end) ?? kpTable()[248];
    const c = { star: NAKSHATRA_LORDS[n % 9], sub: sub.lord, subSub: ss.lord, kpNumber: row.kp };
    const k = JSON.stringify(c);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

/** KP numarasının boylam aralığı (horary Asc denetimi için). */
export function kpSpan(kp: number): { start: number; end: number } | null {
  const r = kpTable()[kp - 1];
  return r ? { start: r.start, end: r.end } : null;
}

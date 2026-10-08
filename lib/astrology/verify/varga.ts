// Astroloji 5.1B — Varga (D2…D60) BAĞIMSIZ DOĞRULAMA referansı (SAF; istemci de import eder).
//
// Bu dosya bir HESAP MOTORU DEĞİLDİR: hiçbir sonuç buradan üretilip gösterilmez. Roxy'nin döndürdüğü
// varga rashisinin, Roxy'nin kendi belirttiği yöntemle ("BPHS Shodasha Varga") tutarlı olup olmadığını
// denetlemek için klasik Parashari kurallarını içerir. Uyuşmazlık = "doğrulanmadı" (arayüzde açık uyarı).
//
// Kaynak: Brihat Parashara Hora Shastra, Bölüm 6–7 (Shodasha Varga). Birden fazla ekolü olan vargalarda
// (Hora, Drekkana, Trimsamsa, Shashtiamsa) YALNIZ Parashari kural kullanılır; diğer ekoller (cyclic hora,
// Jagannatha/Somnath drekkana, eşit trimsamsa…) bu modülde YOKTUR ve karıştırılmaz.

import { SIGN_IDS, type SignId } from "../model/western";

export type VargaRule = {
  division: number;
  name: string;
  /** Yöntem/ekol (yalnız Parashari). */
  method: string;
  /** Kuralın kısa Türkçe tanımı (UI + rapor). */
  rule: string;
  /** Sidereal boylam → varga rashisi sırası (0 = Koç). */
  rashiIndex: (longitude: number) => number;
};

const norm = (x: number) => ((x % 12) + 12) % 12;
const parts = (lon: number, n: number) => {
  const l = ((lon % 360) + 360) % 360;
  const s = Math.min(11, Math.floor(l / 30));
  const deg = l - s * 30;
  return { s, deg, k: Math.min(n - 1, Math.floor((deg * n) / 30)) };
};
const odd = (s: number) => s % 2 === 0; // Koç (0) tek burç
const quality = (s: number) => s % 3; // 0 hareketli (chara), 1 sabit (sthira), 2 çift (dvisvabhava)
const element = (s: number) => s % 4; // 0 ateş, 1 toprak, 2 hava, 3 su

/** BPHS Shodasha Varga (D1 hariç) — Roxy /divisional-chart'ın kabul ettiği bölümlerin tamamı. */
export const BPHS_VARGA_RULES: Readonly<Record<number, VargaRule>> = {
  2: {
    division: 2,
    name: "Hora",
    method: "Parashari Hora",
    rule: "Tek burçta 0–15° Güneş horası (Aslan), 15–30° Ay horası (Yengeç); çift burçta tersi. Yalnız Yengeç/Aslan.",
    rashiIndex: (l) => {
      const { s, k } = parts(l, 2);
      return odd(s) === (k === 0) ? 4 : 3;
    },
  },
  3: { division: 3, name: "Drekkana", method: "Parashari Drekkana", rule: "10°'lik dilimler: aynı burç, 5. ve 9. burç.", rashiIndex: (l) => { const { s, k } = parts(l, 3); return norm(s + 4 * k); } },
  4: { division: 4, name: "Chaturthamsa", method: "Parashari", rule: "7°30′ dilimler: aynı burç, 4., 7. ve 10. burç.", rashiIndex: (l) => { const { s, k } = parts(l, 4); return norm(s + 3 * k); } },
  7: { division: 7, name: "Saptamsa", method: "Parashari", rule: "Tek burçta aynı burçtan, çift burçta 7. burçtan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 7); return norm(s + (odd(s) ? 0 : 6) + k); } },
  9: { division: 9, name: "Navamsa", method: "Parashari", rule: "Hareketli burçta aynı burçtan, sabitte 9.'dan, çiftte 5.'ten ardışık (ateş Koç, toprak Oğlak, hava Terazi, su Yengeç).", rashiIndex: (l) => { const { s, k } = parts(l, 9); return norm(s + [0, 8, 4][quality(s)] + k); } },
  10: { division: 10, name: "Dasamsa", method: "Parashari", rule: "Tek burçta aynı burçtan, çift burçta 9. burçtan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 10); return norm(s + (odd(s) ? 0 : 8) + k); } },
  12: { division: 12, name: "Dwadasamsa", method: "Parashari", rule: "Aynı burçtan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 12); return norm(s + k); } },
  16: { division: 16, name: "Shodasamsa", method: "Parashari", rule: "Hareketli Koç'tan, sabit Aslan'dan, çift Yay'dan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 16); return norm([0, 4, 8][quality(s)] + k); } },
  20: { division: 20, name: "Vimsamsa", method: "Parashari", rule: "Hareketli Koç'tan, sabit Yay'dan, çift Aslan'dan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 20); return norm([0, 8, 4][quality(s)] + k); } },
  24: { division: 24, name: "Chaturvimsamsa", method: "Parashari", rule: "Tek burçta Aslan'dan, çift burçta Yengeç'ten ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 24); return norm((odd(s) ? 4 : 3) + k); } },
  27: { division: 27, name: "Bhamsa (Saptavimsamsa)", method: "Parashari", rule: "Ateş Koç'tan, toprak Yengeç'ten, hava Terazi'den, su Oğlak'tan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 27); return norm([0, 3, 6, 9][element(s)] + k); } },
  30: {
    division: 30,
    name: "Trimsamsa",
    method: "Parashari Trimsamsa (eşit olmayan dilimler)",
    rule: "Tek burç: 0–5 Koç (Mars), 5–10 Kova (Satürn), 10–18 Yay (Jüpiter), 18–25 İkizler (Merkür), 25–30 Terazi (Venüs). Çift burç: 0–5 Boğa (Venüs), 5–12 Başak (Merkür), 12–20 Balık (Jüpiter), 20–25 Oğlak (Satürn), 25–30 Akrep (Mars).",
    rashiIndex: (l) => {
      const { s, deg } = parts(l, 30);
      if (odd(s)) return deg < 5 ? 0 : deg < 10 ? 10 : deg < 18 ? 8 : deg < 25 ? 2 : 6;
      return deg < 5 ? 1 : deg < 12 ? 5 : deg < 20 ? 11 : deg < 25 ? 9 : 7;
    },
  },
  40: { division: 40, name: "Khavedamsa", method: "Parashari", rule: "Tek burçta Koç'tan, çift burçta Terazi'den ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 40); return norm((odd(s) ? 0 : 6) + k); } },
  45: { division: 45, name: "Akshavedamsa", method: "Parashari", rule: "Hareketli Koç'tan, sabit Aslan'dan, çift Yay'dan ardışık.", rashiIndex: (l) => { const { s, k } = parts(l, 45); return norm([0, 4, 8][quality(s)] + k); } },
  60: { division: 60, name: "Shashtiamsa", method: "Parashari", rule: "30′'lık dilimler; aynı burçtan ardışık sayılır (derece × 2, kalan + 1).", rashiIndex: (l) => { const { s, k } = parts(l, 60); return norm(s + k); } },
};

/** Golden (gerçek Roxy yanıtı) ile BPHS kuralı teyit edilmiş bölümler — test dosyası bunu doğrular. */
export const VARGA_GOLDEN_CONFIRMED: readonly number[] = [9, 30];

export type VargaCheck = {
  division: number;
  method: string;
  /** "match": tüm noktalar BPHS kuralıyla aynı · "mismatch": en az biri farklı · "unsupported": kural yok. */
  status: "match" | "mismatch" | "unsupported";
  checked: number;
  mismatches: { id: string; got: SignId; expected: SignId }[];
  goldenConfirmed: boolean;
};

/** Roxy varga noktalarını (D1 boylamı + varga rashisi) BPHS kuralıyla denetler. Hesap üretmez. */
export function checkVargaAgainstBphs(division: number, points: { id: string; longitude: number; rashi: SignId }[]): VargaCheck {
  const rule = BPHS_VARGA_RULES[division];
  if (!rule) return { division, method: "—", status: "unsupported", checked: 0, mismatches: [], goldenConfirmed: false };
  const mismatches = points
    .map((p) => ({ id: p.id, got: p.rashi, expected: SIGN_IDS[rule.rashiIndex(p.longitude)] }))
    .filter((x) => x.got !== x.expected);
  return { division, method: rule.method, status: mismatches.length === 0 ? "match" : "mismatch", checked: points.length, mismatches, goldenConfirmed: VARGA_GOLDEN_CONFIRMED.includes(division) };
}

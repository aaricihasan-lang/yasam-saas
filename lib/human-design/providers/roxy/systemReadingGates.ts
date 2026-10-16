// Roxy "Sistem Yorumu" — KAPILAR görünümü (SAF; DTO'dan türetilir, yeni veri/çağrı YOK).
//
// Roxy her AKTİVASYON (gezegen × taraf) için kapı adı + kapı açıklaması + çizgi + gezegen metni verir.
// Kapı açıklaması kapı düzeyindedir (aynı kapının farklı gezegen aktivasyonlarında aynı metin), bu
// yüzden haritadaki her aktif kapı burada BİR KEZ listelenir.
//   • Kaynak YALNIZ kayıtlı Roxy DTO'sudur (Uzman Bilgilerim / Merkezi Bilgi Bankası ile karışmaz).
//   • Kapı açıklaması yalnız `gateDescription` alanından alınır; çizgi (`lineMeaning`) ve gezegen
//     (`planetDescription`) metinleri kapı açıklaması olarak SUNULMAZ (onlar Aktivasyonlar'da kalır).
//   • Açıklama yoksa boş kalır (uydurma yok). Sağlayıcı aynı kapıya farklı metinler verdiyse
//     hepsi ayrı ayrı korunur (birini seçip diğerini saklamaz).
//   • Sıra: kapı numarası 1 → 64.

import type { SystemReadingActivation } from "./systemReading";

export type SystemReadingGate = {
  gate: number;
  /** Roxy'nin kapı adı (Türkçe yerelleştirilmiş varsa o); yoksa null. */
  name: string | null;
  /** Kapı düzeyindeki benzersiz Roxy açıklamaları (çoğunlukla 1; yoksa boş dizi). */
  descriptions: string[];
  /** Bu kapıyı etkinleştiren aktivasyonlar (yalnız etiket: taraf, gezegen, çizgi). */
  activations: Array<{ side: "design" | "personality"; planet: string | null; line: number }>;
};

export function groupSystemReadingGates(activations: readonly SystemReadingActivation[]): SystemReadingGate[] {
  const byGate = new Map<number, SystemReadingGate>();
  for (const a of activations) {
    if (!Number.isInteger(a.gate) || a.gate < 1 || a.gate > 64) continue;
    let g = byGate.get(a.gate);
    if (!g) {
      g = { gate: a.gate, name: null, descriptions: [], activations: [] };
      byGate.set(a.gate, g);
    }
    if (!g.name && a.gateName) g.name = a.gateName;
    const d = a.gateDescription?.trim();
    if (d && !g.descriptions.includes(d)) g.descriptions.push(d);
    g.activations.push({ side: a.side, planet: a.planet, line: a.line });
  }
  return [...byGate.values()].sort((x, y) => x.gate - y.gate);
}

export const SYSTEM_READING_GATE_EMPTY = "Bu kapı için kayıtlı Roxy açıklaması bulunmuyor.";

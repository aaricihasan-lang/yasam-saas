// ─────────────────────────────────────────────────────────────────────────────
// MOTOR A — EV / OFİS SAYISI (kitap 1. seviye)
// İŞYERİ UYUMU (Motor B) ile KARIŞTIRILMAZ; ortak/global skor YOKTUR.
// ─────────────────────────────────────────────────────────────────────────────

export type PlaceNumberResult = {
  buildingNumber: number; // apartman/bina no
  unitNumber: number; // daire/kapı no
  rawTotal: number; // building + unit (ham)
  reducedNumber: number; // 1–9 (tam sadeleştirme, master YOK)
  steps: string[]; // sadeleştirme izi
  interpretation: string | null; // kaynak 1–9 yorumu
  sourcePage: string;
};

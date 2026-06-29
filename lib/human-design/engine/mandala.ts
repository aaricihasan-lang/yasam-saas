// FAZ 2C — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// MANDALA gate/line EŞLEME — saf, deterministik katman.
//
// Ekliptik boylamı → HD gate (1–64) + line (1–6). BU FAZDA YALNIZCA gate/line.
//   type / authority / center / channel / profile / incarnation cross YOK.
//
// ── KALİBRASYON DURUMU: DOĞRULANDI (FAZ 2D) ──────────────────────────────────
//   Gate sıralaması (GATE_ORDER) ve mandala ofseti (DEFAULT_MANDALA_OFFSET_DEG),
//   3 bağımsız gerçek golden case (Genetic Matrix, Swiss Ephemeris / True Node)
//   ile 78/78 aktivasyon birebir eşleşerek DOĞRULANDI (sıfır boundary, tarih
//   aralığı 1987–2018). Sabit değerler değişmedi; yalnız status güncellendi.
//   Tüm çıktılar calibrationStatus: "validated" taşır.
//   (Kapsama tamamlama için ileride Reflector + bilinçli sınır vakası eklenebilir.)

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** 64 gate × 5.625° = 360°. */
export const GATE_SIZE_DEG = 360 / 64; // 5.625
/** 6 line × 0.9375° = 5.625°. */
export const LINE_SIZE_DEG = GATE_SIZE_DEG / 6; // 0.9375

/**
 * HD Rave Mandala gate sıralaması — 0° (ofset başlangıcı) → ileri.
 * 3 golden case (78/78) ile DOĞRULANDI. Geçerli bir 1..64 permütasyonudur.
 */
export const GATE_ORDER: ReadonlyArray<number> = [
  25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12,
  15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6,
  46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11,
  10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30, 55, 37, 63, 22, 36,
];

/**
 * Mandala ofseti (DOĞRULANDI — 358.25°).
 * Çapa: HD yıl döngüsü Gate 41 ile başlar (Güneş ~302° = 2° Kova, ~22 Ocak).
 * Buradan GATE_ORDER[0]=Gate 25'in başlangıç boylamı türetilir → 358.25°.
 * (Türetilen ofset, "0° Koç → Gate 25" belgeli çapasıyla da tutarlıdır.)
 * 3 golden case ile doğrulandı; değer DEĞİŞMEDİ (yalnız status güncellendi).
 */
const CYCLE_START_GATE = 41;
const CYCLE_START_LONGITUDE_DEG = 302; // doğrulanmış çapa (değişmedi)
export const DEFAULT_MANDALA_OFFSET_DEG = normalizeLongitude(
  CYCLE_START_LONGITUDE_DEG - GATE_ORDER.indexOf(CYCLE_START_GATE) * GATE_SIZE_DEG,
);

/** Line sınırına bu kadar yakınsa (yay-saniye) boundaryFlag true. */
export const DEFAULT_BOUNDARY_THRESHOLD_ARCSEC = 30;

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

/** Boylamı [0, 360) aralığına normalize eder. */
export function normalizeLongitude(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type GateLineOptions = {
  /** Mandala ofseti (derece). Varsayılan DEFAULT_MANDALA_OFFSET_DEG. */
  mandalaOffsetDeg?: number;
  /** Line-sınır boundaryFlag eşiği (yay-saniye). Varsayılan 30. */
  boundaryThresholdArcsec?: number;
};

export type GateLineResult = {
  longitude: number;
  normalizedLongitude: number;
  gate: number;
  line: number;
  gateIndex: number;
  positionInGateDeg: number;
  positionInLineDeg: number;
  gateBoundaryDistanceArcsec: number;
  lineBoundaryDistanceArcsec: number;
  boundaryFlag: boolean;
  mandalaOffsetDeg: number;
  calibrationStatus: "validated";
};

export type GateLineRange = {
  gate: number;
  line: number;
  startLongitude: number;
  endLongitude: number;
  mandalaOffsetDeg: number;
  calibrationStatus: "validated";
};

// ─── Eşleme ───────────────────────────────────────────────────────────────────

/**
 * Ekliptik boylamı → gate + line (+ sınır mesafeleri).
 * Saf fonksiyon; yalnız gate/line, başka HD hesabı yok.
 */
export function longitudeToGateLine(
  longitude: number,
  options?: GateLineOptions,
): GateLineResult {
  const mandalaOffsetDeg = options?.mandalaOffsetDeg ?? DEFAULT_MANDALA_OFFSET_DEG;
  const boundaryThresholdArcsec =
    options?.boundaryThresholdArcsec ?? DEFAULT_BOUNDARY_THRESHOLD_ARCSEC;

  const normalizedLongitude = normalizeLongitude(longitude);
  // Tekerlek başlangıcından itibaren ilerleme [0, 360).
  const rel = normalizeLongitude(normalizedLongitude - mandalaOffsetDeg);

  let gateIndex = Math.floor(rel / GATE_SIZE_DEG);
  if (gateIndex >= 64) gateIndex = 63; // kayan nokta emniyeti
  const gate = GATE_ORDER[gateIndex];

  const positionInGateDeg = rel - gateIndex * GATE_SIZE_DEG; // [0, 5.625)
  let lineIndex = Math.floor(positionInGateDeg / LINE_SIZE_DEG);
  if (lineIndex >= 6) lineIndex = 5;
  const line = lineIndex + 1; // 1..6
  const positionInLineDeg = positionInGateDeg - lineIndex * LINE_SIZE_DEG; // [0, 0.9375)

  const gateBoundaryDistanceDeg = Math.min(
    positionInGateDeg,
    GATE_SIZE_DEG - positionInGateDeg,
  );
  const lineBoundaryDistanceDeg = Math.min(
    positionInLineDeg,
    LINE_SIZE_DEG - positionInLineDeg,
  );
  const gateBoundaryDistanceArcsec = gateBoundaryDistanceDeg * 3600;
  const lineBoundaryDistanceArcsec = lineBoundaryDistanceDeg * 3600;

  return {
    longitude,
    normalizedLongitude,
    gate,
    line,
    gateIndex,
    positionInGateDeg,
    positionInLineDeg,
    gateBoundaryDistanceArcsec,
    lineBoundaryDistanceArcsec,
    boundaryFlag: lineBoundaryDistanceArcsec <= boundaryThresholdArcsec,
    mandalaOffsetDeg,
    calibrationStatus: "validated",
  };
}

/**
 * gate + line → [startLongitude, endLongitude) ekliptik aralığı.
 * longitudeToGateLine'ın tersi (roundtrip için). Saf fonksiyon.
 */
export function gateLineToRange(
  gate: number,
  line: number,
  options?: GateLineOptions,
): GateLineRange {
  const mandalaOffsetDeg = options?.mandalaOffsetDeg ?? DEFAULT_MANDALA_OFFSET_DEG;

  const gateIndex = GATE_ORDER.indexOf(gate);
  if (gateIndex === -1) {
    throw new Error(`Geçersiz gate: ${gate} (1..64 ve GATE_ORDER içinde olmalı).`);
  }
  if (!Number.isInteger(line) || line < 1 || line > 6) {
    throw new Error(`Geçersiz line: ${line} (1..6 olmalı).`);
  }

  const startLongitude = normalizeLongitude(
    mandalaOffsetDeg + gateIndex * GATE_SIZE_DEG + (line - 1) * LINE_SIZE_DEG,
  );
  const endLongitude = normalizeLongitude(startLongitude + LINE_SIZE_DEG);

  return {
    gate,
    line,
    startLongitude,
    endLongitude,
    mandalaOffsetDeg,
    calibrationStatus: "validated",
  };
}

/**
 * lib/cosmic/exactAspects.ts
 * FAZ 2C — Production EXACT ASPECT TIME çözücüsü.
 *
 * Bu modül, iki gök cismi arasındaki bir majör açının TAM (exact) anını dakika
 * doğruluğunda hesaplar. UI'da HENÜZ KULLANILMAZ (FAZ 2C Adım 3'te bağlanacak).
 * `getDailyAspects` / `getAspectBetween` davranışı DEĞİŞMEZ; bu yalnız yeni bir katmandır.
 *
 * ── Çekirdek mantık ───────────────────────────────────────────────────────────
 *   f(t) = wrapTo180( lonA(t) − lonB(t) − hedefAçı )   ;  hedefAçı ∈ {0,60,90,120,180}
 *   Exact an = f(t)'nin sıfır geçişidir. Pencere taranır, bracket bulunan her aralıkta
 *   ikili arama (bisection) ile <1 sn'ye indirilir (kullanıcıya saniye İDDİA EDİLMEZ).
 *
 * ── Ephemeris kaynağı: NEDEN PairLongitude DEĞİL ─────────────────────────────
 *   astronomy-engine'in PairLongitude() fonksiyonu hazır olsa da, bağımsız Swiss
 *   Ephemeris referansına karşı (scripts/cosmic-validation) yeni-ay exact saatinde
 *   ~38 sn sapma gösterdi; aspects.ts'in kullandığı of-date boylam yöntemi ise ~6 sn.
 *   "En doğru hesap" ilkesi gereği, mevcut aspect motoruyla AYNI kaynak kullanılır:
 *   `getPlanetLongitude` (Ay: EclipticGeoMoon, gezegen: Ecliptic(GeoVector(...,true))).
 *   Böylece exact saatler, orb anlık-görüntüleriyle de tutarlı olur.
 *
 * ── Hassasiyet politikası (SAHTE HASSASİYET YASAK) ───────────────────────────
 *   Zaman doğruluğu = konum belirsizliği ÷ göreli açısal hız. Yavaş dış çiftlerde
 *   bu oran dakikayı anlamsız kılar → displayPrecision "date". Bkz. classifyPrecision.
 *
 * Saf/deterministik: yalnız dışarıdan verilen Date'lerle çalışır (SSR↔client tutarlı).
 */

import {
  type AspectBody,
  type AspectName,
  ASPECTS,
  BODY_ORDER,
  BODY_SYMBOL,
  BODY_SLUG,
  getPlanetLongitude,
} from "./aspects";

// ─── Tipler ─────────────────────────────────────────────────────────────────────

/** Kullanıcıya gösterilebilecek doğruluk birimi. "date" = dakika gösterme. */
export type DisplayPrecision = "minute" | "date";

/** Exact zamanın güven düzeyi. "position-only" = saat değil, konum güvenilir. */
export type ExactConfidence = "high" | "medium" | "position-only";

export type ExactAspectHit = {
  id:           string;        // deterministik kimlik
  bodyA:        AspectBody;
  bodyB:        AspectBody;
  bodyASymbol:  string;
  bodyBSymbol:  string;
  aspect:       AspectName;
  aspectSymbol: string;
  aspectAngle:  number;        // 0 | 60 | 90 | 120 | 180

  exactAt:      Date;          // tam açı anı (UTC instant)
  exactAtISO:   string;        // ISO (UTC) — saniye dahil; ama saat İDDİASI displayPrecision'a tabi

  relativeSpeed: number;       // |vA − vB|, derece/gün (exact anında)
  retroA:        boolean;      // bodyA o an retro mu (vA < 0)
  retroB:        boolean;      // bodyB o an retro mu (vB < 0)

  displayPrecision:    DisplayPrecision;  // "minute" | "date"
  confidence:          ExactConfidence;   // "high" | "medium" | "position-only"
  precisionPolicy:     string;            // neden bu birim seçildi (insan-okur)
  positionErrorPolicy: string;            // konum doğruluğu / hata muhasebesi

  residualArcsec: number;      // çözümdeki artık (sağlık kontrolü; ~0 olmalı)
};

export type FindOptions = {
  /** Sınanacak açılar (varsayılan: 5 majör açının tümü). */
  aspects?: ReadonlyArray<AspectName>;
  /** Tarama adımı (gün). Verilmezse çifte göre otomatik. */
  stepDays?: number;
};

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const VELOCITY_H_MS = 0.01 * DAY_MS;       // hız için merkezi fark adımı (~14.4 dk)
const BISECT_FLOOR_MS = 1_000;             // 1 sn taban (dakikanın çok altı)
const BISECT_MAX_ITERS = 60;

const FAST_BODIES = new Set<AspectBody>(["Güneş", "Merkür", "Venüs", "Mars"]);

const POSITION_ERROR_POLICY =
  "Konum JPL-grade (astronomy-engine) ile hesaplanır ve bağımsız Swiss Ephemeris " +
  "referansıyla ≤30″ uyumludur. Zaman doğruluğu = konum belirsizliği ÷ göreli hız; " +
  "yavaş çiftlerde bu oran dakikayı anlamsız kıldığından tarih gösterilir.";

// ─── Açı yardımcıları ───────────────────────────────────────────────────────────

/** (-180, 180] aralığına indir; 0/360 sınırı güvenli. */
function wrap180(x: number): number {
  return ((x % 360) + 540) % 360 - 180;
}

/** Bir açı için exact hedef göreli-boylam değerleri. */
function targetsFor(angle: number): number[] {
  if (angle === 0) return [0];
  if (angle === 180) return [180];
  return [angle, 360 - angle];
}

/** f(t) = wrap180( lonA − lonB − hedef ). AE hatasında NaN. */
function signedResidual(a: AspectBody, b: AspectBody, target: number, ms: number): number {
  const lonA = getPlanetLongitude(a, new Date(ms));
  const lonB = getPlanetLongitude(b, new Date(ms));
  if (Number.isNaN(lonA) || Number.isNaN(lonB)) return NaN;
  return wrap180(lonA - lonB - target);
}

/** Tek cismin işaretli açısal hızı (derece/gün); + ileri, − retro. */
function velocityDegPerDay(body: AspectBody, ms: number): number {
  let d = getPlanetLongitude(body, new Date(ms + VELOCITY_H_MS))
        - getPlanetLongitude(body, new Date(ms - VELOCITY_H_MS));
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d / (2 * VELOCITY_H_MS / DAY_MS);
}

/** Tarama adımı (gün): Ay 0.1, Güneş/iç 0.5, yalnız dış 2. */
function defaultStepDays(a: AspectBody, b: AspectBody): number {
  if (a === "Ay" || b === "Ay") return 0.1;
  if (FAST_BODIES.has(a) || FAST_BODIES.has(b)) return 0.5;
  return 2;
}

// ─── Hassasiyet politikası ──────────────────────────────────────────────────────
// Göreli hız ampirik ayraçtır (Adım 0: yavaş çiftlerde ~6″ konum farkı 48 dk'ya çıkar).
// Eşikler bu nedenle göreli açısal hıza (derece/gün) bağlanır.

function classifyPrecision(relativeSpeed: number): {
  displayPrecision: DisplayPrecision;
  confidence: ExactConfidence;
  precisionPolicy: string;
} {
  const v = Math.abs(relativeSpeed);
  if (v >= 2.0) {
    return {
      displayPrecision: "minute",
      confidence: "high",
      precisionPolicy: "Hızlı göreli hareket (≥2°/gün, ör. Ay): dakika doğruluğu güvenilir.",
    };
  }
  if (v >= 0.5) {
    return {
      displayPrecision: "minute",
      confidence: "medium",
      precisionPolicy: "Orta-hızlı (0.5–2°/gün, Güneş/iç gezegen): dakika gösterilir, güven orta.",
    };
  }
  if (v >= 0.2) {
    return {
      displayPrecision: "date",
      confidence: "medium",
      precisionPolicy: "Yavaş (0.2–0.5°/gün): dakika sahte hassasiyet olur → tarih gösterilir.",
    };
  }
  return {
    displayPrecision: "date",
    confidence: "position-only",
    precisionPolicy: "Çok yavaş (<0.2°/gün, yavaş dış çiftler): yalnız konum güvenilir → tarih gösterilir.",
  };
}

// ─── Kök bulma ──────────────────────────────────────────────────────────────────

/** Bracket [loMs, hiMs] içinde f'in sıfırı; ikili arama ile <1 sn. */
function bisect(a: AspectBody, b: AspectBody, target: number, loMs: number, hiMs: number): number {
  let lo = loMs, hi = hiMs;
  let flo = signedResidual(a, b, target, lo);
  for (let i = 0; i < BISECT_MAX_ITERS; i++) {
    if (hi - lo < BISECT_FLOOR_MS) break;
    const mid = (lo + hi) / 2;
    const fm = signedResidual(a, b, target, mid);
    if (fm === 0 || Number.isNaN(fm)) { lo = hi = mid; break; }
    if (flo < 0 === fm < 0) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

/** Verilen ham boylam çifti + hedef için bir exact anı ExactAspectHit'e dönüştür. */
function buildHit(
  a: AspectBody, b: AspectBody, def: typeof ASPECTS[number], target: number, exactMs: number,
): ExactAspectHit {
  const vA = velocityDegPerDay(a, exactMs);
  const vB = velocityDegPerDay(b, exactMs);
  const relativeSpeed = Math.abs(vA - vB);
  const { displayPrecision, confidence, precisionPolicy } = classifyPrecision(relativeSpeed);
  const exactAt = new Date(exactMs);
  const residual = signedResidual(a, b, target, exactMs);

  return {
    id:           `${BODY_SLUG[a]}-${BODY_SLUG[b]}-${def.slug}-${exactAt.toISOString()}`,
    bodyA:        a,
    bodyB:        b,
    bodyASymbol:  BODY_SYMBOL[a],
    bodyBSymbol:  BODY_SYMBOL[b],
    aspect:       def.name,
    aspectSymbol: def.symbol,
    aspectAngle:  def.angle,
    exactAt,
    exactAtISO:   exactAt.toISOString(),
    relativeSpeed: Math.round(relativeSpeed * 1e6) / 1e6,
    retroA:        vA < 0,
    retroB:        vB < 0,
    displayPrecision,
    confidence,
    precisionPolicy,
    positionErrorPolicy: POSITION_ERROR_POLICY,
    residualArcsec: Math.round(Math.abs(residual) * 3600 * 1000) / 1000,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * [start, end] penceresinde, bodyA–bodyB çifti için (varsayılan tüm majör) açıların
 * TÜM exact anlarını döner (retro civarı çoklu/üçlü geçişler dahil). exactAt'a göre sıralı.
 * bodyA/bodyB BODY_ORDER'a göre kanonik sıraya alınır (deterministik kimlik).
 */
export function findExactAspectsInWindow(
  bodyA: AspectBody, bodyB: AspectBody, start: Date, end: Date, opts: FindOptions = {},
): ExactAspectHit[] {
  if (bodyA === bodyB) return [];
  const [a, b] = BODY_ORDER.indexOf(bodyA) <= BODY_ORDER.indexOf(bodyB) ? [bodyA, bodyB] : [bodyB, bodyA];

  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!(endMs > startMs)) return [];

  const stepMs = (opts.stepDays ?? defaultStepDays(a, b)) * DAY_MS;
  const defs = opts.aspects
    ? ASPECTS.filter(d => opts.aspects!.includes(d.name))
    : ASPECTS;

  const out: ExactAspectHit[] = [];
  for (const def of defs) {
    for (const target of targetsFor(def.angle)) {
      let prevMs = startMs;
      let prevF = signedResidual(a, b, target, prevMs);
      for (let t = startMs; t < endMs; ) {
        const nt = Math.min(t + stepMs, endMs);
        const fn = signedResidual(a, b, target, nt);
        // gerçek geçiş: işaret değişimi VE sarma (wrap) atlaması DEĞİL
        if (!Number.isNaN(prevF) && !Number.isNaN(fn) &&
            (prevF < 0) !== (fn < 0) && Math.abs(fn - prevF) < 180) {
          const exactMs = bisect(a, b, target, prevMs, nt);
          out.push(buildHit(a, b, def, target, exactMs));
        }
        prevMs = nt; prevF = fn; t = nt;
      }
    }
  }
  out.sort((x, y) => x.exactAt.getTime() - y.exactAt.getTime());
  return out;
}

/**
 * [start, end] penceresinde 45 çiftin tamamı için exact açıları döner. exactAt'a göre sıralı.
 * (UI'da kullanılmadan önce performans için memoize edilmelidir — FAZ 2C Adım 5/7.)
 */
export function getExactAspectsInRange(start: Date, end: Date, opts: FindOptions = {}): ExactAspectHit[] {
  const out: ExactAspectHit[] = [];
  for (let i = 0; i < BODY_ORDER.length; i++) {
    for (let j = i + 1; j < BODY_ORDER.length; j++) {
      out.push(...findExactAspectsInWindow(BODY_ORDER[i]!, BODY_ORDER[j]!, start, end, opts));
    }
  }
  out.sort((x, y) => x.exactAt.getTime() - y.exactAt.getTime());
  return out;
}

/**
 * `from`tarihinden sonra, bodyA–bodyB için belirli bir açının ilk exact anını döner.
 * `searchDays` içinde bulunamazsa null.
 */
export function findNextExactAspect(
  bodyA: AspectBody, bodyB: AspectBody, aspect: AspectName, from: Date, searchDays = 400,
): ExactAspectHit | null {
  const end = new Date(from.getTime() + searchDays * DAY_MS);
  const hits = findExactAspectsInWindow(bodyA, bodyB, from, end, { aspects: [aspect] });
  return hits.length ? hits[0]! : null;
}

// Astroloji — EK NOKTALAR birleştirme + natal bağlam (SAF). 2026-10-22.
//
// combineExtraPoints: bölüm satırlarını (her biri ayrı uç / ayrı önbellek satırı) tek teknik katmana birleştirir.
// attachExtraNatal: aynı doğum verisi + aynı ev sistemiyle ÖNBELLEKTEKİ natal sonuçtan (contextUnits; plana/istek sayısına
// girmez, sağlayıcıya natal GÖNDERİLMEZ) natal çerçeve + tutarlılık denetimi ekler. Natal sonuç DEĞİŞTİRİLMEZ; natal yoksa
// çerçeve/denetim null kalır ("natal kayıtlı değil" notu gösterilir), yeni istek yapılmaz.
// Denetimler yalnız aritmetiktir (yeni astronomik hesap YOK): ortalama Lilith ↔ natal Kara Ay; Şans Noktası ↔ natal Şans
// Noktası (+ sect); yedi lotun sağlayıcının BİLDİRDİĞİ formülle natal Yükselen + gezegenlerden yeniden toplanması.

import { NATAL_TECHNICAL_SCHEMA, type HouseSystem, type NatalTechnical } from "../model/western";
import {
  arcDiff,
  EXTRA_CONSISTENCY_TOLERANCE_DEG,
  EXTRA_POINTS_INTERP_SCHEMA,
  EXTRA_POINTS_PART_SCHEMA,
  EXTRA_POINTS_TECHNICAL_SCHEMA,
  LOT_IDS,
  lotPositionWithheld,
  n360,
  type ExtraNatalCheck,
  type ExtraNatalFrame,
  type ExtraPointsInterpretation,
  type ExtraPointsPart,
  type ExtraPointsTechnical,
  type ExtraSection,
  type LotTerm,
} from "../model/westernExtraPoints";

export function combineExtraPoints(parts: unknown[], opt: { sections: ExtraSection[]; houseSystem: HouseSystem }): ExtraPointsTechnical {
  const ps = parts.filter((p): p is ExtraPointsPart => !!p && (p as { schema?: unknown }).schema === EXTRA_POINTS_PART_SCHEMA);
  const find = <S extends ExtraSection>(s: S) => ps.find((p) => p.section === s) as Extract<ExtraPointsPart, { section: S }> | undefined;
  const a = find("asteroids");
  const l = find("lots");
  const li = find("lilith");
  return {
    schema: EXTRA_POINTS_TECHNICAL_SCHEMA,
    zodiac: "tropical",
    houseSystem: opt.houseSystem,
    sections: [...opt.sections],
    asteroids: a ? { houseSystem: a.houseSystem, bodies: a.bodies } : null,
    lots: l ? { sect: l.sect, sectHouseSystem: l.sectHouseSystem, lots: l.lots } : null,
    lilith: li ? { houseSystem: li.houseSystem, mean: li.mean, true: li.true } : null,
  };
}

/** Bölüm yorumlarını birleştirir (her parça yalnız kendi bölümünü taşır). */
export function combineExtraInterpretation(parts: Record<string, unknown>[]): Record<string, unknown> {
  const ps = parts as unknown as ExtraPointsInterpretation[];
  const out: ExtraPointsInterpretation = { schema: EXTRA_POINTS_INTERP_SCHEMA, asteroids: null, lots: null, lilith: null };
  for (const p of ps) {
    if (p?.asteroids) out.asteroids = p.asteroids;
    // 22.10: doğrulanmayan lotun (Zafer) sağlayıcı açıklaması burcunu söyler → yanıta / kayda girmez (ekranda zaten gizli;
    // ham API JSON'unda da kalmasın). Önbellekteki ham yorum satırı değişmez.
    if (p?.lots) out.lots = { ...p.lots, items: p.lots.items.filter((x) => !lotPositionWithheld({ id: x.id })) };
    if (p?.lilith) out.lilith = p.lilith;
  }
  return out as unknown as Record<string, unknown>;
}

/** Önbellekteki natal katmanlardan: aynı ev sistemi + tam ev/açı verisi olan ilk natal. */
export function extraNatalFrom(context: (unknown | null)[], houseSystem: HouseSystem): NatalTechnical | null {
  return (
    context.find(
      (c): c is NatalTechnical => !!c && (c as { schema?: unknown }).schema === NATAL_TECHNICAL_SCHEMA && (c as NatalTechnical).houseSystem === houseSystem && !!(c as NatalTechnical).angles && (c as NatalTechnical).houses?.length === 12,
    ) ?? null
  );
}

export function attachExtraNatal(technical: ExtraPointsTechnical, context: (unknown | null)[]): ExtraPointsTechnical {
  const natal = extraNatalFrom(context, technical.houseSystem);
  if (!natal || !natal.angles) return { ...technical, natalFrame: null, natalCheck: null };
  const angles = natal.angles;
  const frame: ExtraNatalFrame = {
    houseSystem: natal.houseSystem,
    bodies: natal.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, retrograde: b.retrograde })),
    houses: natal.houses,
    angles,
  };
  return { ...technical, natalFrame: frame, natalCheck: extraNatalCheck(technical, natal) };
}

const status = (d: number | null): "consistent" | "inconsistent" | "unavailable" => (d === null ? "unavailable" : d <= EXTRA_CONSISTENCY_TOLERANCE_DEG ? "consistent" : "inconsistent");

export function extraNatalCheck(t: ExtraPointsTechnical, natal: NatalTechnical): ExtraNatalCheck {
  const natalLilith = natal.bodies.find((b) => b.id === "lilith") ?? null;
  const lilithDiff = t.lilith && natalLilith ? arcDiff(t.lilith.mean.longitude, natalLilith.longitude) : null;

  const pof = natal.points?.partOfFortune ?? null;
  const fortune = t.lots?.lots.find((l) => l.id === "fortune") ?? null;
  const fortuneDiff = fortune && pof ? arcDiff(fortune.longitude, pof.longitude) : null;
  const natalSect = pof?.sect ?? null;
  const sectMismatch = !!t.lots && !!natalSect && natalSect !== t.lots.sect;

  // Lot formülleri: sağlayıcının BİLDİRDİĞİ terimlerle (traditional olsun olmasın) natal Yükselen + gezegenlerden toplam.
  let maxDiff: number | null = null;
  if (t.lots) {
    const planet = (id: string) => natal.bodies.find((b) => b.id === id)?.longitude ?? null;
    const asc = natal.angles?.ascendant.longitude ?? null;
    const computed = new Map<string, number>();
    let ok = true;
    for (const id of LOT_IDS) {
      const lot = t.lots.lots.find((l) => l.id === id);
      if (!lot) {
        ok = false;
        break;
      }
      const term = (x: LotTerm) => (x === "fortune" || x === "spirit" ? (computed.get(x) ?? null) : planet(x));
      const p = term(lot.plus);
      const m = term(lot.minus);
      if (p === null || m === null || asc === null) {
        ok = false;
        break;
      }
      const v = n360(asc + p - m);
      computed.set(id, v);
      maxDiff = Math.max(maxDiff ?? 0, arcDiff(v, lot.longitude));
    }
    if (!ok) maxDiff = null;
  }
  return {
    meanLilith: { status: status(lilithDiff), diffDeg: lilithDiff },
    fortune: { status: sectMismatch ? "inconsistent" : status(fortuneDiff), diffDeg: fortuneDiff, lotSect: t.lots?.sect ?? null, natalSect },
    lotFormulas: { status: status(maxDiff), maxDiffDeg: maxDiff },
  };
}

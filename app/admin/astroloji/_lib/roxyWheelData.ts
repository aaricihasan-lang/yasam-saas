// Gökyüzü Atlası — Roxy çift halka bileşenleri için SAF veri dönüştürücüleri (React YOK; test edilir).
// Kayıtlı kanonik TEKNİK katman → Roxy yanıt biçimi. Hesap yapılmaz: boylam / burç / derece / ev / açı aynen aktarılır.
import type { BodyId, SignId } from "@/lib/astrology/model/western";
import type {
  SynastryTechnical,
  TransitTechnical,
} from "@/lib/astrology/model/westernTiming";
import { BODY_LABELS, SIGN_LABELS } from "@/lib/astrology/labels/tr";

/** Roxy API'nin İngilizce kanonik adları (bileşen açı çizgilerini bu adla eşler). */
export const ROXY_BODY_NAME: Record<BodyId, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
  north_node: "North Node",
  south_node: "South Node",
  chiron: "Chiron",
  lilith: "Black Moon Lilith",
};
const POINT_NAME: Record<string, string> = {
  ...ROXY_BODY_NAME,
  ascendant: "Ascendant",
  midheaven: "Midheaven",
};
const signEn = (s: SignId) => s.charAt(0).toUpperCase() + s.slice(1);

type Pt = { longitude: number; sign: SignId; degreeInSign: number };
const planet = (
  id: BodyId,
  p: Pt & {
    retrograde: boolean;
    latitude?: number;
    speed?: number;
    house?: number | null;
  },
) => ({
  name: ROXY_BODY_NAME[id],
  nameLocalized: BODY_LABELS[id],
  longitude: p.longitude,
  latitude: p.latitude ?? 0,
  sign: signEn(p.sign),
  signLocalized: SIGN_LABELS[p.sign],
  degree: p.degreeInSign,
  ...(typeof p.house === "number" ? { house: p.house } : {}),
  speed: p.speed ?? 0,
  isRetrograde: p.retrograde,
});

/** Kayıtlı transit teknik katmanı → `/astrology/transit-aspects` yanıt biçimi. Natal çerçeve yoksa null. */
export function toTransitWheelData(t: TransitTechnical) {
  const f = t.natalFrame;
  if (!f) return null;
  return {
    transitDate: `${t.atUtc.replace(/Z$/, "")}Z`,
    houseSystem: f.houseSystem,
    houses: f.houses.map((h) => ({
      number: h.number,
      longitude: h.longitude,
      sign: signEn(h.sign),
      signLocalized: SIGN_LABELS[h.sign],
      degree: h.degreeInSign,
    })),
    ascendant: {
      sign: signEn(f.angles.ascendant.sign),
      signLocalized: SIGN_LABELS[f.angles.ascendant.sign],
      degree: f.angles.ascendant.degreeInSign,
      longitude: f.angles.ascendant.longitude,
    },
    natalPlanets: f.bodies.map((b) => planet(b.id, b)),
    transitPlanets: t.bodies.map((b) => planet(b.id, b)),
    aspects: t.aspects
      .filter((a) => a.natal !== "ascendant" && a.natal !== "midheaven")
      .map((a) => ({
        planet1: POINT_NAME[a.transit],
        planet2: POINT_NAME[a.natal],
        type: a.type.toUpperCase(),
        angle: a.exactAngle,
        orb: a.orb,
        isApplying: a.applying,
        strength: a.strength,
      })),
  };
}

/** Kayıtlı sinastri teknik katmanı → `/astrology/synastry` yanıt biçimi (yalnız konum + açı; yorum/puan YOK). */
export function toSynastryWheelData(t: SynastryTechnical) {
  if (t.person1.bodies.length === 0 || t.person2.bodies.length === 0)
    return null;
  const person = (p: SynastryTechnical["person1"]) => ({
    ...(p.ascendant
      ? {
          ascendant: {
            sign: signEn(p.ascendant.sign),
            signLocalized: SIGN_LABELS[p.ascendant.sign],
            degree: p.ascendant.degreeInSign,
          },
        }
      : {}),
    planets: p.bodies.map((b) => ({
      ...planet(b.id, b),
      ...(typeof b.houseInOther === "number"
        ? { houseInOtherChart: b.houseInOther }
        : {}),
    })),
  });
  return {
    person1: person(t.person1),
    person2: person(t.person2),
    interAspects: t.aspects.map((a) => ({
      planet1: ROXY_BODY_NAME[a.a],
      planet2: ROXY_BODY_NAME[a.b],
      type: a.type.toUpperCase(),
      angle: a.exactAngle,
      orb: a.orb,
      strength: a.strength,
    })),
  };
}

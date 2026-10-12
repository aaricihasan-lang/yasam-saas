// Çift halka geometri doğrulaması için bileşen verileri üretir (YALNIZ kayıtlı golden Roxy yanıtları + sentetik uç
// durumlar; sağlayıcı ÇAĞRILMAZ). Çıktı: argv[2] yoluna JSON. Kullanım: tsx scripts/astrology/wheels-payloads.ts out.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { toSynastryWheelData, toTransitWheelData } from "@/app/admin/astroloji/_lib/roxyWheelData";
import type { SynastryTechnical, TransitTechnical } from "@/lib/astrology/model/westernTiming";
import { SIGN_IDS, type BodyId } from "@/lib/astrology/model/western";

const F = join(__dirname, "fixtures");
const natalRaw = JSON.parse(readFileSync(join(F, "roxy-natal-golden-2026-10-07.json"), "utf8"));
const transitG = JSON.parse(readFileSync(join(F, "golden", "transit.json"), "utf8"));
const synG = JSON.parse(readFileSync(join(F, "golden", "synastry.json"), "utf8"));
const birth = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };

const natal = projectRoxyNatal(natalRaw, { houseSystem: "placidus", nodeType: "true" });
if (!natal.ok) throw new Error("natal projeksiyon");
const tDef = getTechnique("western.transit")!;
const tOpt = tDef.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "true" }, new Date())!;
const tUnit = tDef.units({ birth, birthUtc: "1990-07-15T11:30:00Z", partner: null }, tOpt)[0];
const tp = tDef.project(tUnit, transitG.response, tOpt);
if (!tp.ok) throw new Error("transit projeksiyon");
const transitTech = tDef.attachContext!(tp.technical, [natal.value.technical], tOpt) as TransitTechnical;

const sDef = getTechnique("western.synastry")!;
const sOpt = { partnerProfileId: "00000000-0000-4000-8000-0000000000bb", houseSystem: "placidus", nodeType: "true" };
const sUnit = sDef.units({ birth, birthUtc: "1990-07-15T11:30:00Z", partner: { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 } }, sOpt)[0];
const sp = sDef.project(sUnit, synG.response, sOpt);
if (!sp.ok) throw new Error("sinastri projeksiyon");
const synTech = sp.technical as SynastryTechnical;

// Sentetik uç durum: 0°/360° sınırı, burç geçişi (29.99 / 30.01), sıkı küme (4 cisim 1.2° içinde), retro.
const pt = (lon: number) => ({ longitude: lon, sign: SIGN_IDS[Math.floor(lon / 30) % 12], degreeInSign: lon % 30 });
const EDGE: [BodyId, number, boolean][] = [
  ["sun", 359.95, false],
  ["moon", 0.05, false],
  ["mercury", 29.99, true],
  ["venus", 30.01, false],
  ["mars", 100.0, false],
  ["jupiter", 100.4, true],
  ["saturn", 100.8, false],
  ["uranus", 101.2, false],
  ["neptune", 210.5, false],
  ["pluto", 270.0, false],
];
const edgeBodies = EDGE.map(([id, lon, r]) => ({ id, ...pt(lon), latitude: 0, speed: r ? -0.1 : 1, retrograde: r, house: null }));
const edgeTransit: TransitTechnical = {
  ...transitTech,
  bodies: EDGE.map(([id, lon, r]) => ({ id, ...pt((lon + 180.0) % 360), latitude: 0, speed: 1, retrograde: r })),
  aspects: [],
  natalFrame: {
    ...transitTech.natalFrame!,
    bodies: edgeBodies,
    houses: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, ...pt((359.9 + i * 30) % 360) })),
    angles: { ascendant: pt(359.9), midheaven: pt(269.9) },
  },
};
const edgeSyn: SynastryTechnical = {
  ...synTech,
  person1: { ascendant: { sign: "pisces", degreeInSign: 29.9 }, bodies: edgeBodies.map((b) => ({ ...b, houseInOther: null })) },
  person2: { ascendant: { sign: "aries", degreeInSign: 0.1 }, bodies: edgeBodies.map((b) => ({ ...b, ...pt((b.longitude + 0.3) % 360), houseInOther: null })) },
  aspects: [],
};

writeFileSync(
  process.argv[2],
  JSON.stringify({
    transitGolden: toTransitWheelData(transitTech),
    transitEdge: toTransitWheelData(edgeTransit),
    synGolden: toSynastryWheelData(synTech),
    synEdge: toSynastryWheelData(edgeSyn),
  }),
);
console.log("ok");

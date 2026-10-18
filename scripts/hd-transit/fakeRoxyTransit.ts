/**
 * Sahte Roxy /human-design/transit yanıtı (OpenAPI v2.0.0 biçimi) — testler ÜCRETLİ ÇAĞRI YAPMAZ.
 * Natal kapılar yerel motorla (engineChart — kayıtlı analizlerin üretildiği fixture ile aynı), transit aktivasyonları
 * yerel genel transit motoruyla, tamamlanan kanallar / geçici merkezler Roxy tanımlarıyla üretilir.
 */
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { CHANNELS, getDefinedCenters } from "../../lib/human-design/engine/channels";
import { engineChart, type Moment } from "../hd-relations/fakeRelationRoxy";

const ROXY_BODY: Record<string, string> = { NorthNode: "North Node", SouthNode: "South Node" };
const ROXY_CENTER: Record<string, string> = { Head: "head", Ajna: "ajna", Throat: "throat", G: "g", Heart: "heart", Spleen: "spleen", SolarPlexus: "solar-plexus", Sacral: "sacral", Root: "root" };

export function fakeTransitResponse(birth: Moment, date: string, time: string, opts: { tamper?: "gate" | "channel" | "center" } = {}) {
  const natal = new Set<number>(engineChart(birth).activations.map((a: { gate: number }) => a.gate));
  const t = computeGeneralTransit(new Date(`${date}T${time}Z`));
  const activations = t.activations.map((a) => ({ body: ROXY_BODY[a.body] ?? a.body, gate: a.gate, line: a.line, gateName: `Gate ${a.gate}`, ichingHexagram: { number: a.gate, english: `Hexagram ${a.gate}` } }));
  if (opts.tamper === "gate") {
    // Sınıra yakın OLMAYAN bir cismin kapısını değiştir (yerel motorla uyuşmazlık).
    const i = t.activations.findIndex((a) => !a.nearBoundary && a.body !== "Earth" && a.body !== "SouthNode");
    activations[i] = { ...activations[i], gate: activations[i].gate === 1 ? 2 : 1 };
  }
  const tg = new Set(activations.map((a) => a.gate));
  const natalChannels = CHANNELS.filter((c) => natal.has(c.gateA) && natal.has(c.gateB));
  const natalCenters = new Set(getDefinedCenters(natalChannels));
  const completed: Record<string, unknown>[] = [];
  const temp = new Set<string>();
  for (const c of CHANNELS) {
    if (natal.has(c.gateA) && natal.has(c.gateB)) continue;
    if (!(natal.has(c.gateA) || tg.has(c.gateA)) || !(natal.has(c.gateB) || tg.has(c.gateB))) continue;
    const natalGates = [c.gateA, c.gateB].filter((g) => natal.has(g));
    const transitGates = [c.gateA, c.gateB].filter((g) => !natal.has(g));
    completed.push({ gateA: c.gateA, gateB: c.gateB, name: c.name, circuit: "Individual", centers: [ROXY_CENTER[c.centerA], ROXY_CENTER[c.centerB]], kind: natalGates.length ? "personal" : "educational", natalGates, transitGates });
    for (const x of [c.centerA, c.centerB]) if (!natalCenters.has(x)) temp.add(x);
  }
  if (opts.tamper === "channel") completed.pop();
  const temporaryCenters = [...temp].map((id) => ({ id: ROXY_CENTER[id], name: id, temporarilyDefined: true }));
  if (opts.tamper === "center") {
    // Geçici merkez listesini boz: varsa birini çıkar, yoksa natalde zaten tanımlı (geçici olamayacak) bir merkez ekle.
    const natalOne = [...natalCenters][0] ?? "Head";
    if (temporaryCenters.length) temporaryCenters.shift();
    else temporaryCenters.push({ id: ROXY_CENTER[natalOne], name: natalOne, temporarilyDefined: true });
  }
  return {
    date,
    time,
    timezone: 0,
    activations,
    completedChannels: completed,
    temporaryCenters,
    summary: `This transit completes ${completed.length} channels.`,
  };
}

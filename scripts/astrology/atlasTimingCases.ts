/** I18N mod-g: Progresyon / Solar Arc / Return / Sinastri / Composite panelleri için ortak sentetik vaka seti (kayıtlı golden yanıtlar; ağ yok). Taban altını (fixtures/i18n/timing-panels-tr-taban.json) AYNI vakalarla üretildi. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as T from "@/lib/astrology/providers/roxy/timing";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
type J = any;
const g = (dir: string, n: string) => JSON.parse(readFileSync(join(dir, "golden", `${n}.json`), "utf8"));
/** Ortak vaka seti (taban ve HEAD aynı girdiler). */
export function timingCases(fix: string): { name: string; technique: string; technical: unknown; timeUnknownMasked: boolean; options?: Record<string, unknown> }[] {
  const pr = g(fix, "progression");
  const sa = g(fix, "solar-arc");
  const natalRaw = JSON.parse(readFileSync(join(fix, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const natal = (projectRoxyNatal(natalRaw.response ?? natalRaw, { houseSystem: "placidus", nodeType: "true" }) as J).value.technical;
  const prog = (T.projectRoxyProgression(structuredClone(pr.response), { nodeType: "true", targetDate: pr.body.targetDate, request: pr.body }) as J).technical;
  const solar = (T.projectRoxySolarArc(structuredClone(sa.response), { nodeType: "true", targetDate: sa.body.targetDate }) as J).technical;
  const frame = { houseSystem: "placidus", bodies: natal.bodies, angles: natal.angles, houses: natal.houses };
  const progF = { ...prog, natalFrame: frame };
  const solarF = { ...solar, natalFrame: frame };
  const out: ReturnType<typeof timingCases> = [
    { name: "prog", technique: "western.progression", technical: prog, timeUnknownMasked: false },
    { name: "progFrame", technique: "western.progression", technical: progF, timeUnknownMasked: false },
    { name: "progFrameWs", technique: "western.progression", technical: { ...progF, natalFrame: { ...frame, houseSystem: "whole-sign" } }, timeUnknownMasked: false },
    { name: "progMasked", technique: "western.progression", technical: maskTechnical("western.progression", prog, { primary: false, partner: null }).technical, timeUnknownMasked: true },
    { name: "progPolar", technique: "western.progression", technical: { ...prog, natalHouseStatus: { status: "polar_undefined", latitude: 69.65 }, bodies: prog.bodies.map((b: J) => ({ ...b, house: null })) }, timeUnknownMasked: false },
    { name: "progPolarNoLat", technique: "western.progression", technical: { ...prog, natalHouseStatus: { status: "polar_undefined", latitude: null }, bodies: prog.bodies.map((b: J) => ({ ...b, house: null })) }, timeUnknownMasked: false },
    { name: "progLegacyPolar", technique: "western.progression", technical: { ...prog, natalHouseStatus: { status: "legacy_polar_provider" } }, timeUnknownMasked: false },
    { name: "progMeanLegacy", technique: "western.progression", technical: { ...prog, nodeType: "mean" }, timeUnknownMasked: false },
    { name: "progMeanLocal", technique: "western.progression", technical: { ...prog, nodeType: "mean", nodeComputation: { method: "local" } }, timeUnknownMasked: false },
    { name: "solarArc", technique: "western.solar_arc", technical: solar, timeUnknownMasked: false },
    { name: "solarArcFrame", technique: "western.solar_arc", technical: solarF, timeUnknownMasked: false },
  ];
  const rets: [string, string, J][] = [["solar-return", "solar", { houseSystem: "placidus", returnYear: 2026, returnDate: null }]];
  for (const [n, k, o] of rets) {
    const r = T.projectRoxyReturn(structuredClone(g(fix, n).response), k as J, o) as J;
    if (r.ok) out.push({ name: n, technique: "western.solar_return", technical: r.technical, timeUnknownMasked: false });
  }
  for (const [n, tech, f] of [["synastry", "western.synastry", T.projectRoxySynastry], ["composite", "western.composite", T.projectRoxyComposite]] as const) {
    const r = (f as J)(structuredClone(g(fix, n).response), { houseSystem: "placidus", nodeType: "true" }) as J;
    if (r.ok) out.push({ name: n, technique: tech, technical: r.technical, timeUnknownMasked: false });
  }
  return out;
}

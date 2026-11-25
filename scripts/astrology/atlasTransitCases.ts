/** I18N mod-g: Transit (tek an) paneli için sentetik vaka seti (kayıtlı golden yanıtlar; ağ yok). Taban altını (fixtures/i18n/transit-panel-tr-taban.json) AYNI vakalarla üretildi. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as T from "@/lib/astrology/providers/roxy/timing";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { calendarExactFor } from "@/lib/astrology/transitDetail";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
type J = any;
const g = (dir: string, n: string) => JSON.parse(readFileSync(join(dir, "golden", `${n}.json`), "utf8"));
export function transitCases(fix: string): { name: string; technical: unknown; options: Record<string, unknown> }[] {
  const tr = (T.projectRoxyTransit(structuredClone(g(fix, "transit").response), { nodeType: "true", atUtc: "2026-10-07T09:00:00Z" }) as J).technical;
  const fc = (T.projectRoxyForecast(structuredClone(g(fix, "forecast").response)) as J).technical;
  const natalRaw = JSON.parse(readFileSync(join(fix, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const natal = (projectRoxyNatal(natalRaw.response ?? natalRaw, { houseSystem: "placidus", nodeType: "true" }) as J).value.technical;
  const frame = { houseSystem: "placidus", bodies: natal.bodies, angles: natal.angles, houses: natal.houses };
  const withFrame = { ...tr, natalFrame: frame };
  const ce = calendarExactFor(tr, [fc], { start: "2026-10-01", end: "2026-12-29" });
  const withCe = { ...withFrame, calendarExact: ce ? { ...ce } : null };
  const partial = ce ? { ...withFrame, calendarExact: { ...ce, complete: false } } : withFrame;
  return [
    { name: "plainUtc", technical: tr, options: {} },
    { name: "frameIst", technical: withFrame, options: { displayTz: "Europe/Istanbul" } },
    { name: "calendarIst", technical: withCe, options: { displayTz: "Europe/Istanbul", calendar: { startDate: "2026-10-01", days: 90 } } },
    { name: "calendarPartialLondon", technical: partial, options: { displayTz: "Europe/London" } },
    { name: "masked", technical: maskTechnical("western.transit", withFrame, { primary: false, partner: null }).technical, options: { displayTz: "Europe/Istanbul" } },
    { name: "empty", technical: { ...tr, aspects: [], summary: { harmonious: 0, challenging: 0, neutral: 0 } }, options: {} },
  ];
}

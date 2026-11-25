/**
 * I18N ATLAS-V — Vedik ek paneller (Drishti, Gochara, Ashtakavarga, Shadbala, Panchanga + Hora/Choghadiya) çevirisi için vaka
 * üreticisi (yalnız test; ağ / DB / sağlayıcı YOK). Gerçek sağlayıcı golden yanıtları üretim normalizer'larıyla projekte edilir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  projectRoxyVedicAshtakavarga,
  projectRoxyVedicDrishti,
  projectRoxyVedicPanchanga,
  projectRoxyVedicPanchangaDetail,
  projectRoxyVedicShadbala,
  projectRoxyVedicTransit,
} from "@/lib/astrology/providers/roxy/vedic";
import { projectRoxyVedicChoghadiya, projectRoxyVedicHora } from "@/lib/astrology/providers/roxy/panchangaHours";
import type { VedicAshtakavargaTechnical, VedicDrishtiTechnical, VedicPanchangaTechnical, VedicShadbalaTechnical, VedicTransitTechnical } from "@/lib/astrology/model/vedic";
import type { PanchangaHours, VedicPanchangaWithHours } from "@/lib/astrology/model/panchangaHours";
import type { KbEntry } from "./atlasVedicCases";

type Kb = ((keys: string[]) => KbEntry[]) | null;
const KB_FULL = (keys: string[]): KbEntry[] => keys.slice(0, 2).map((k, i) => ({ topicKey: k, topicLabel: `Konu ${i + 1}`, title: `Başlık ${k}`, body: `Gövde ${i + 1}\nikinci satır` }));
const KB_EMPTY = (): KbEntry[] => [];

export type VedicExtraCase =
  | { name: string; kind: "drishti"; t: VedicDrishtiTechnical; kb: Kb }
  | { name: string; kind: "transit"; t: VedicTransitTechnical; kb: Kb }
  | { name: string; kind: "ashtakavarga"; t: VedicAshtakavargaTechnical }
  | { name: string; kind: "shadbala"; t: VedicShadbalaTechnical; kb: Kb }
  | { name: string; kind: "panchanga"; t: VedicPanchangaTechnical; kb: Kb }
  | { name: string; kind: "hours"; h: PanchangaHours };

function ok<T>(r: { ok: boolean; technical?: T; errors?: string[] }, name: string): T {
  if (!r.ok || !r.technical) throw new Error(`${name}: projeksiyon başarısız ${JSON.stringify(r.errors)}`);
  return r.technical;
}

export function vedicExtraCases(fixDir: string): VedicExtraCase[] {
  const g = (n: string): unknown => structuredClone((JSON.parse(readFileSync(join(fixDir, "golden", `${n}.json`), "utf8")) as { response: unknown }).response);
  const out: VedicExtraCase[] = [];

  const dr = ok<VedicDrishtiTechnical>(projectRoxyVedicDrishti(g("vedic-aspects"), { birthLocal: "1990-07-15T14:30:00" }), "drishti");
  out.push({ name: "drishti-kb-null", kind: "drishti", t: dr, kb: null });
  out.push({ name: "drishti-kb-full", kind: "drishti", t: dr, kb: KB_FULL });
  out.push({ name: "drishti-empty", kind: "drishti", t: { ...dr, aspects: [], mutual: [] }, kb: KB_EMPTY });

  const tr = ok<VedicTransitTechnical>(projectRoxyVedicTransit(g("vedic-transit"), { birthLocal: "1990-07-15T14:30:00", transitLocal: "2026-10-07T12:00:00", atUtc: "2026-10-07T09:00", utcOffsetHours: 3 }), "transit");
  out.push({ name: "transit-kb-null", kind: "transit", t: tr, kb: null });
  out.push({ name: "transit-kb-full", kind: "transit", t: tr, kb: KB_FULL });
  // Seçili graha Rahu (drishti yok + bindu null dalı), ayanamsa null, negatif ofset.
  const tr2: VedicTransitTechnical = structuredClone(tr);
  tr2.slow = ["rahu", ...tr2.slow.filter((x) => x !== "rahu")];
  tr2.frame = { ...tr2.frame, ayanamsaDegrees: null };
  tr2.at = { ...tr2.at, utcOffsetHours: -4 };
  const firstNonNode = tr2.transits.find((x) => x.id !== "rahu" && x.id !== "ketu");
  if (firstNonNode) {
    firstNonNode.drishti = [];
    firstNonNode.kaksha = { ...firstNonNode.kaksha, bindu: false };
  }
  out.push({ name: "transit-rahu-variant", kind: "transit", t: tr2, kb: KB_EMPTY });
  const tr3: VedicTransitTechnical = structuredClone(tr);
  const nn = tr3.transits.find((x) => x.id !== "rahu" && x.id !== "ketu")!;
  nn.drishti = [];
  tr3.slow = [nn.id];
  out.push({ name: "transit-nodrishti", kind: "transit", t: tr3, kb: null });

  const av = ok<VedicAshtakavargaTechnical>(projectRoxyVedicAshtakavarga(g("vedic-ashtakavarga"), { ayanamsa: "lahiri" }), "ashtakavarga");
  out.push({ name: "ashtakavarga", kind: "ashtakavarga", t: av });

  const sb = ok<VedicShadbalaTechnical>(projectRoxyVedicShadbala(g("vedic-shadbala"), { ayanamsa: "lahiri" }), "shadbala");
  out.push({ name: "shadbala-kb-null", kind: "shadbala", t: sb, kb: null });
  out.push({ name: "shadbala-kb-full", kind: "shadbala", t: sb, kb: KB_FULL });
  const sbt = ok<VedicShadbalaTechnical>(projectRoxyVedicShadbala(g("vedic-shadbala-kutup-tromso"), { ayanamsa: "lahiri" }), "shadbala-tromso");
  out.push({ name: "shadbala-tromso", kind: "shadbala", t: sbt, kb: KB_EMPTY });
  // Seçili (rank 1) graha asgari altında dalı.
  const sbLow: VedicShadbalaTechnical = structuredClone(sb);
  const r1 = sbLow.planets.find((p) => p.rank === 1) ?? sbLow.planets[0];
  r1.strengthRatio = 0.87;
  out.push({ name: "shadbala-below-min", kind: "shadbala", t: sbLow, kb: null });

  const pb = ok<VedicPanchangaTechnical>(projectRoxyVedicPanchanga(g("vedic-panchang")), "panchanga");
  const day = { date: "2026-11-01", latitude: 41.0082, longitude: 28.9784, utcOffsetHours: 3 };
  const det = ok(projectRoxyVedicPanchangaDetail(g("vedic-panchang-detailed"), { ...day, label: "İstanbul" }), "panchanga-detail");
  const detNoLabel = ok(projectRoxyVedicPanchangaDetail(g("vedic-panchang-detailed"), { ...day, label: null }), "panchanga-detail-nolabel");
  const hora = ok(projectRoxyVedicHora(g("vedic-panchang-hora"), { ...day, label: "İstanbul" }), "hora");
  const chog = ok(projectRoxyVedicChoghadiya(g("vedic-panchang-choghadiya"), { ...day, label: "İstanbul" }), "choghadiya");
  out.push({ name: "panchanga-basic", kind: "panchanga", t: pb, kb: null });
  out.push({ name: "panchanga-basic-kb", kind: "panchanga", t: pb, kb: KB_FULL });
  const pbVar: VedicPanchangaTechnical = structuredClone(pb);
  pbVar.tithi = { ...pbVar.tithi, paksha: pbVar.tithi.paksha === "shukla" ? "krishna" : "shukla", element: "ether", deity: null, rulingPlanet: null } as VedicPanchangaTechnical["tithi"];
  pbVar.karana = { ...pbVar.karana, movable: !pbVar.karana.movable };
  out.push({ name: "panchanga-variant", kind: "panchanga", t: { ...pbVar, detail: detNoLabel } as VedicPanchangaTechnical, kb: KB_EMPTY });
  const full: VedicPanchangaWithHours = { ...pb, detail: det, hours: { date: "2026-11-01", hora, choghadiya: chog, missing: [] } } as VedicPanchangaWithHours;
  out.push({ name: "panchanga-detail-hours", kind: "panchanga", t: full as VedicPanchangaTechnical, kb: null });
  out.push({ name: "hours-full", kind: "hours", h: { date: "2026-11-01", hora, choghadiya: chog, missing: [] } });
  out.push({ name: "hours-missing-hora", kind: "hours", h: { date: "2026-11-01", hora: null, choghadiya: chog, missing: ["hora"] } });
  out.push({ name: "hours-missing-both", kind: "hours", h: { date: "2026-11-01", hora: null, choghadiya: null, missing: ["hora", "choghadiya"] } });
  return out;
}

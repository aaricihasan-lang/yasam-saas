/**
 * D3 — kayıtlı Roxy yanıtlarını ÜRETİMİN KENDİ doğrulayıcılarıyla denetler ve demo kayıt satırlarını kurar (saf; ağ / DB yok).
 *
 * Her örnek için (biri bile geçmezse build DURUR, örnek depoya girmez):
 *   BodyGraph  : validateRoxyBodygraph (ingest) → normalizeRoxyBodygraph → checkDesignInstantConsistency (bağımsız efemeris)
 *                + BAĞIMSIZ yerel motor (computeHumanDesignChart): 26 aktivasyonun kapı.hat'ı, tip, otorite, profil birebir.
 *   Dört Ok    : validateRoxyVariables → crossCheckVariables (yerel bantlar) → applyHistoricalOffsetCaution (servisle aynı sıra).
 *   Connection : validateRoxyConnection → checkConnectionConsistency(expectedConnection(kayıtlı iki harita)).
 *   Penta      : validateRoxyPenta → checkPentaConsistency(kayıtlı üye haritaları).
 */
import { validateRoxyBodygraph } from "@/lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "@/lib/human-design/providers/roxy/normalize";
import { checkDesignInstantConsistency } from "@/lib/human-design/providers/roxy/timeConsistency";
import { resolveBirthLocalTime } from "@/lib/human-design/api/birthTimeResolution";
import { computeHumanDesignChart } from "@/lib/human-design/engine/compute";
import { computedChartAppCodes } from "@/lib/human-design/chart/computedChart";
import { validateRoxyVariables } from "@/lib/human-design/variables/variablesContract";
import { applyHistoricalOffsetCaution, crossCheckVariables, localVariableBands } from "@/lib/human-design/variables/localVariablesCheck";
import { checkConnectionConsistency, expectedConnection, validateRoxyConnection } from "@/lib/human-design/relations/connection";
import { checkPentaConsistency, validateRoxyPenta } from "@/lib/human-design/relations/penta";
import { participantChartFacts } from "@/lib/human-design/relations/relationService";
import { getTrDistrictRecord } from "@/lib/human-design/location/trDistricts";
import { ROXY_POLICY } from "@/lib/human-design/providers/roxy/config";
import { DEMO_CONNECTION, DEMO_PENTA, DEMO_PEOPLE, type DemoPerson } from "./demoPeople";

export type RecordedEntry = { label: string; endpoint: string; request: unknown; raw: unknown };
export type Recorded = { recordedAt: string; lang: string; nodeType: string; calls: number; entries: RecordedEntry[] };

export type VerifiedPerson = {
  person: DemoPerson;
  district: NonNullable<ReturnType<typeof getTrDistrictRecord>>;
  birthUtcIso: string;
  utcOffsetSeconds: number;
  input: Record<string, unknown>;
  bodygraphRaw: unknown;
  chart: ReturnType<typeof normalizeRoxyBodygraph> & { ok: true };
  variablesRaw: unknown;
  designDeltaMinutes: number;
  variablesConfident: boolean;
};
export type Verified = { people: VerifiedPerson[]; connectionRaw: unknown; pentaRaw: unknown; report: string[] };

const fail = (m: string): never => {
  throw new Error(`DOĞRULAMA BAŞARISIZ — ${m}`);
};

function entry(rec: Recorded, label: string): RecordedEntry {
  const e = rec.entries.find((x) => x.label === label);
  return e ?? fail(`kayıt yok: ${label}`);
}

export function verifyRecorded(rec: Recorded): Verified {
  const report: string[] = [];
  if (rec.calls !== 12 || rec.entries.length !== 12) fail(`çağrı sayısı ${rec.calls}/${rec.entries.length} (12 bekleniyor)`);
  if (rec.lang !== ROXY_POLICY.lang || rec.nodeType !== ROXY_POLICY.nodeType) fail("politika (lang/nodeType) üretimle aynı değil");
  const people: VerifiedPerson[] = [];
  for (const p of DEMO_PEOPLE) {
    const d = getTrDistrictRecord(p.districtId);
    if (!d || d.durum !== "dogrulandi") fail(`${p.key}: ilçe kaydı`);
    const district = d!;
    const time = `${p.time}:00`;
    const t = resolveBirthLocalTime(p.date, time, district.tz);
    if (t.kind !== "ok") fail(`${p.key}: doğum anı çözülemedi (${t.kind})`);
    const ok = t as Extract<typeof t, { kind: "ok" }>;
    const input = { date: p.date, time, timezone: district.tz, latitude: district.lat, longitude: district.lon, nodeType: ROXY_POLICY.nodeType, lang: ROXY_POLICY.lang };

    // BodyGraph
    const bg = entry(rec, `bodygraph ${p.key}`);
    const { lang: _l, ...req } = input;
    void _l;
    if (JSON.stringify(bg.request) !== JSON.stringify(req)) fail(`${p.key}: kayıtlı istek girdisi kişi tanımıyla aynı değil`);
    const v = validateRoxyBodygraph(bg.raw);
    if (!v.ok) fail(`${p.key}: BodyGraph şeması — ${v.errors.slice(0, 5).join("; ")}`);
    const val = (v as Extract<typeof v, { ok: true }>).value;
    const n = normalizeRoxyBodygraph(val, { ...input, birthUtcIso: ok.utcIso });
    if (!n.ok) fail(`${p.key}: normalize — ${n.errors.slice(0, 5).join("; ")}`);
    const chart = n as Extract<typeof n, { ok: true }>;
    const tc = checkDesignInstantConsistency(ok.utcIso, val.designInstantUtc);
    if (tc.status !== "consistent") fail(`${p.key}: Design anı ${tc.status}`);
    const local = computeHumanDesignChart({ date: p.date, time: p.time, timezone: district.tz, location: { lat: district.lat, lon: district.lon } });
    if (local.warnings.length) fail(`${p.key}: yerel motor sınır uyarısı`);
    const key = (a: { body?: string; planet?: string; side: string; gate: number; line: number }) => `${a.side}:${a.body ?? a.planet}:${a.gate}.${a.line}`;
    const roxyActs = (chart.chart as unknown as { activations: Array<{ body: string; side: string; gate: number; line: number }> }).activations.map(key).sort();
    const localActs = local.activations.map(key).sort();
    if (roxyActs.join("|") !== localActs.join("|")) fail(`${p.key}: Roxy ↔ yerel motor aktivasyonları farklı`);
    const localCodes = computedChartAppCodes(local as unknown as Parameters<typeof computedChartAppCodes>[0]);
    for (const f of ["type_code", "authority_code", "profile_code", "definition_code"] as const) {
      if (localCodes[f] !== chart.codes[f]) fail(`${p.key}: ${f} Roxy=${chart.codes[f]} yerel=${localCodes[f]}`);
    }
    if ([...localCodes.active_centers].sort().join() !== [...chart.codes.active_centers].sort().join()) fail(`${p.key}: tanımlı merkezler farklı`);

    // Dört Ok
    const va = entry(rec, `variables ${p.key}`);
    if (JSON.stringify(va.request) !== JSON.stringify(req)) fail(`${p.key}: Dört Ok isteği BodyGraph girdisiyle aynı değil`);
    const vv = validateRoxyVariables(va.raw);
    if (!vv.ok) fail(`${p.key}: Dört Ok şeması — ${vv.errors.slice(0, 5).join("; ")}`);
    const bands = localVariableBands(new Date(ok.utcIso));
    const vdto = (vv as Extract<typeof vv, { ok: true }>).value;
    const cc = crossCheckVariables(vdto, bands);
    if (!cc.ok) fail(`${p.key}: Dört Ok yerel çapraz denetim — ${JSON.stringify(cc.mismatches)}`);
    const shown = applyHistoricalOffsetCaution(vdto, bands, ok.offsetSeconds);

    people.push({
      person: p,
      district,
      birthUtcIso: ok.utcIso,
      utcOffsetSeconds: ok.offsetSeconds,
      input,
      bodygraphRaw: bg.raw,
      chart,
      variablesRaw: va.raw,
      designDeltaMinutes: tc.status === "consistent" ? tc.deltaMinutes : NaN,
      variablesConfident: shown.confident,
    });
    report.push(
      `${p.key} ${chart.codes.type_code}/${chart.codes.authority_code}/${chart.codes.profile_code}/${chart.codes.definition_code} · 26/26 aktivasyon yerel motorla aynı · Design Δ ${tc.status === "consistent" ? tc.deltaMinutes : "?"} dk · Dört Ok çapraz denetim PASS (kesin=${shown.confident})`,
    );
  }
  const byKey = new Map(people.map((x) => [x.person.key, x]));
  const facts = (k: string) => participantChartFacts(byKey.get(k as DemoPerson["key"])!.chart.chart) ?? fail(`${k}: harita özeti`);

  const conn = entry(rec, `connection ${DEMO_CONNECTION.join("+")}`);
  const cv = validateRoxyConnection(conn.raw);
  if (!cv.ok) fail(`Connection şeması — ${cv.errors.slice(0, 5).join("; ")}`);
  const [fa, fb] = DEMO_CONNECTION.map(facts);
  const cErr = checkConnectionConsistency((cv as Extract<typeof cv, { ok: true }>).value, expectedConnection(fa.gates, fb.gates, fa.defined, fb.defined));
  if (cErr.length) fail(`Connection tutarlılık — ${cErr.slice(0, 5).join("; ")}`);
  report.push(`Connection ${DEMO_CONNECTION.join("+")} şema + kayıtlı haritalarla tutarlılık PASS (${(cv as Extract<typeof cv, { ok: true }>).value.channels.length} kanal)`);

  const pen = entry(rec, `penta ${DEMO_PENTA.join("+")}`);
  const pv = validateRoxyPenta(pen.raw, DEMO_PENTA.length);
  if (!pv.ok) fail(`Penta şeması — ${pv.errors.slice(0, 5).join("; ")}`);
  const pErr = checkPentaConsistency((pv as Extract<typeof pv, { ok: true }>).value, DEMO_PENTA.map((k) => facts(k).gates));
  if (pErr.length) fail(`Penta tutarlılık — ${pErr.slice(0, 5).join("; ")}`);
  report.push(`Penta ${DEMO_PENTA.join("+")} şema + kayıtlı haritalarla tutarlılık PASS`);

  return { people, connectionRaw: conn.raw, pentaRaw: pen.raw, report };
}

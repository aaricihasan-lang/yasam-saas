/**
 * HD TRANSİT — GERÇEK Roxy DOĞRULAMA RAPORU (ÇEVRİMDIŞI; ücretli çağrı YOK — kayıtlı ham yanıtlar).
 *   npx tsx scripts/hd-transit/roxy-live-report.ts [--md docs/human-design/transit-dogrulama-2026-10-19.md]
 * Üç kaynak her an × 13 cisim için karşılaştırılır:
 *   Roxy (gerçek yanıt) · yerel motor (computeGeneralTransit) · Swiss Ephemeris (bağımsız Python; swiss-ephemeris.py)
 * Kanal / merkez: (a) kişisel transit — Roxy completedChannels + temporaryCenters ↔ natal (Roxy bodygraph) + Roxy transit
 * kapılarından bağımsız türetilen beklenen küme; (b) genel transit — Roxy "educational" kanalları ↔ yerel genel transit
 * kanallarının natalde iki kapısı da açık olanları; (c) Roxy kanal tanımı (kapı çifti + merkezler) ↔ yerel 36 kanal tablosu;
 * (d) natal: Roxy bodygraph 26 aktivasyon ↔ yerel motor. Tek uyuşmazlık → çıkış kodu 1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { computeGeneralTransit, TRANSIT_BODY_ORDER } from "../../lib/human-design/transit/generalTransit";
import { checkTransitConsistency, validateRoxyTransit } from "../../lib/human-design/transit/personalTransit";
import { CHANNELS, GATE_CENTER } from "../../lib/human-design/engine/channels";
import { engineChart, type Moment } from "../hd-relations/fakeRelationRoxy";
import type { PlanetName } from "../../lib/human-design/engine/types";

const FIX = path.resolve(__dirname, "fixtures");
const data = JSON.parse(readFileSync(path.join(FIX, "roxy-live-validation.json"), "utf8"));
const se = JSON.parse(readFileSync(path.join(FIX, "swiss-ephemeris-reference.json"), "utf8"));
const ROXY_BODY: Record<string, PlanetName> = { "North Node": "NorthNode", "South Node": "SouthNode" };
const ROXY_CENTER: Record<string, string> = { head: "Head", ajna: "Ajna", throat: "Throat", g: "G", heart: "Heart", sacral: "Sacral", "solar-plexus": "SolarPlexus", spleen: "Spleen", root: "Root" };
const CH = new Map(CHANNELS.map((c) => [c.id, c]));

type Row = { id: string; utc: string; local: string; scenario: string; act: string; chan: string; pass: boolean; note: string };
const rows: Row[] = [];
let actCompared = 0, actRoxyLocal = 0, actRoxySe = 0, actLocalSe = 0;
let chanIssues = 0, chanChecks = 0, eduChecks = 0, defChecks = 0;
let shownCertain = 0, shownCertainWrong = 0, shownUncertain = 0, uncertainMissTruth = 0, generalChanWrong = 0, generalCenterWrong = 0, momentsFullyCertain = 0;
const maxLocalSe: Record<string, number> = {};
const mismatchDetail: unknown[] = [];

// (d) natal
let natalIssues = 0;
const natalGates: Record<string, number[]> = {};
for (const [i, n] of Object.entries(data.natal as Record<string, { birth: Moment; gates: Array<{ planet: string; side: string; gate: number; line: number }> }>)) {
  natalGates[i] = [...new Set(n.gates.map((g) => g.gate))].sort((a, b) => a - b);
  const loc = engineChart(n.birth).activations as Array<{ planet?: string; body?: string; side: string; gate: number; line: number }>;
  for (const g of n.gates) {
    const body = ROXY_BODY[g.planet] ?? g.planet;
    const l = loc.find((x) => (x.planet ?? x.body) === body && x.side === g.side);
    if (!l || l.gate !== g.gate || l.line !== g.line) { natalIssues++; mismatchDetail.push({ natal: i, body, side: g.side, roxy: `${g.gate}.${g.line}`, local: l ? `${l.gate}.${l.line}` : "?" }); }
  }
}

for (const [id, r] of Object.entries(data.results as Record<string, { utc: string; local: string; scenario: string; person: number; ok: boolean; raw: unknown; boundary?: unknown }>)) {
  const notes: string[] = [];
  let pass = r.ok;
  const sent = { date: r.utc.slice(0, 10), time: r.utc.slice(11, 19) };
  const v = validateRoxyTransit(r.raw, sent);
  if (!v.ok) { pass = false; notes.push(`şema: ${v.errors.join("; ")}`); rows.push({ id, utc: r.utc, local: r.local, scenario: r.scenario, act: "—", chan: "—", pass, note: notes.join(" ") }); continue; }
  const local = computeGeneralTransit(new Date(r.utc));
  const ref = se.results[id];
  let okA = 0;
  for (const body of TRANSIT_BODY_ORDER) {
    actCompared++;
    const rx = v.value.activations.find((a) => a.body === body)!;
    const lc = local.activations.find((a) => a.body === body)!;
    const s = ref[body];
    const rl = rx.gate === lc.gate && rx.line === lc.line;
    const rs = rx.gate === s.gate && rx.line === s.line;
    const ls = lc.gate === s.gate && lc.line === s.line;
    if (rl) actRoxyLocal++;
    if (rs) actRoxySe++;
    if (ls) actLocalSe++;
    const d = Math.abs((((lc.longitude - s.lon) % 360) + 540) % 360 - 180) * 3600;
    maxLocalSe[body] = Math.max(maxLocalSe[body] ?? 0, d);
    if (rl && rs && ls) okA++;
    // Roxy ≠ SE → bağımsız kaynaklar ayrışıyor → FAIL. Ham yerel fark: yalnız yerel motor o aktivasyonu KESİN iddia ediyorsa FAIL
    // (belirsiz işaretliyse gösterilen değer aşağıda (e)'de adaylarla denetlenir).
    if (!rs || (!rl && lc.certain)) pass = false;
    if (!(rl && rs && ls)) { notes.push(`${body}: Roxy ${rx.gate}.${rx.line} · yerel ${lc.gate}.${lc.line} · SE ${s.gate}.${s.line} (yerel sınır ${lc.lineBoundaryArcsec.toFixed(2)}″, yerel−SE ${d.toFixed(2)}″, yerel ${lc.certain ? "KESİN" : "kesinleştirilemedi"})`); mismatchDetail.push({ id, utc: r.utc, body, roxy: `${rx.gate}.${rx.line}`, local: `${lc.gate}.${lc.line}`, se: `${s.gate}.${s.line}`, localCertain: lc.certain, localAlternative: lc.alternative, localMarginArcsec: lc.lineBoundaryArcsec, seMarginArcsec: s.lineMarginArcsec, localMinusSeArcsec: d }); }
  }
  // (e) GÖSTERİLEN genel transit ↔ gerçek (Roxy = SE): kesin iddialar birebir doğru, belirsizlerde gerçek değer adaylarda.
  const truthGates = new Set(v.value.activations.map((a) => a.gate));
  for (const lc of local.activations) {
    const t = v.value.activations.find((a) => a.body === lc.body)!;
    if (lc.certain) {
      shownCertain++;
      if (lc.gate !== t.gate || lc.line !== t.line) { shownCertainWrong++; pass = false; notes.push(`KESİN İDDİA YANLIŞ ${lc.body}`); }
    } else {
      shownUncertain++;
      if (![`${lc.gate}.${lc.line}`, `${lc.alternative!.gate}.${lc.alternative!.line}`].includes(`${t.gate}.${t.line}`)) { uncertainMissTruth++; pass = false; notes.push(`belirsiz ${lc.body}: gerçek ${t.gate}.${t.line} adaylarda yok`); }
    }
  }
  if (!local.hasUncertainty) momentsFullyCertain++;
  const truthCh = CHANNELS.filter((c) => truthGates.has(c.gateA) && truthGates.has(c.gateB)).map((c) => c.id);
  const certainCh = local.channels.map((c) => c.id);
  const possibleCh = local.possibleChannels.map((c) => c.id);
  if (certainCh.some((x) => !truthCh.includes(x)) || truthCh.some((x) => !certainCh.includes(x) && !possibleCh.includes(x))) { generalChanWrong++; pass = false; notes.push(`genel kanal: kesin [${certainCh}] olası [${possibleCh}] gerçek [${truthCh}]`); }
  const truthCenters = new Set(CHANNELS.filter((c) => truthCh.includes(c.id)).flatMap((c) => [c.centerA, c.centerB]));
  if (local.definedCenters.some((c) => !truthCenters.has(c)) || local.openCenters.some((c) => truthCenters.has(c))) { generalCenterWrong++; pass = false; notes.push("genel merkez: kesin iddia yanlış"); }
  if (local.hasUncertainty) notes.push(`kesinleştirilemedi: ${local.activations.filter((a) => !a.certain).map((a) => `${a.body} ${a.gate}.${a.line}/${a.alternative!.gate}.${a.alternative!.line}`).join(", ")}`);
  // (a) kişisel kanal / merkez (natal = Roxy bodygraph) — Roxy kendi aktivasyonlarıyla tutarlı mı (bağımsız beklenen küme)
  const natal = natalGates[String(r.person)];
  const rep = checkTransitConsistency(v.value, local, natal);
  const chanErr = rep.errors.filter((e) => !/^[A-Za-z]+: sağlayıcı/.test(e));
  chanChecks++;
  // (b) Roxy "educational" kanalları ↔ Roxy transit kapılarından yerel 36 kanal tablosuyla türetilen transit-yalnız kanallar
  eduChecks++;
  const nat = new Set(natal);
  const expEdu = truthCh.filter((x) => { const c = CH.get(x)!; return !nat.has(c.gateA) && !nat.has(c.gateB); }).sort().join();
  const gotEdu = v.value.completedChannels.filter((c) => c.kind === "educational").map((c) => c.id).sort().join();
  if (expEdu !== gotEdu) chanErr.push(`genel transit kanalları (natalde açık) yerel [${expEdu}] ≠ Roxy [${gotEdu}]`);
  // (c) Roxy kanal tanımı ↔ yerel 36 kanal tablosu
  for (const c of (r.raw as { completedChannels: Array<{ gateA: number; gateB: number; centers: string[] }> }).completedChannels) {
    defChecks++;
    const id = `${Math.min(c.gateA, c.gateB)}-${Math.max(c.gateA, c.gateB)}`;
    const mine = CH.get(id);
    const centers = c.centers.map((x) => ROXY_CENTER[x]).sort().join();
    if (!mine || [GATE_CENTER[mine.gateA], GATE_CENTER[mine.gateB]].sort().join() !== centers) chanErr.push(`kanal tanımı ${id}: Roxy merkezleri ${centers}`);
  }
  if (chanErr.length) { pass = false; chanIssues += chanErr.length; notes.push(...chanErr); }
  const b = r.boundary as { body: string; kind: string; side: string } | undefined;
  const lcB = b ? local.activations.find((a) => a.body === b.body) : undefined;
  if (b && lcB) notes.unshift(`sınır: ${b.body} ${b.kind} ${b.side}, yerel marj ${lcB.lineBoundaryArcsec.toFixed(2)}″, SE marj ${se.results[id][b.body].lineMarginArcsec.toFixed(2)}″`);
  rows.push({ id, utc: r.utc, local: r.local, scenario: r.scenario, act: `${okA}/13`, chan: chanErr.length ? `${chanErr.length} hata` : `OK (${v.value.completedChannels.length} kanal, ${v.value.temporaryCenters.length} geçici merkez)`, pass, note: notes.join(" · ") });
}

const passCount = rows.filter((r) => r.pass).length;
const summary = {
  moments: rows.length,
  passMoments: passCount,
  activationsCompared: actCompared,
  roxyEqLocal: actRoxyLocal,
  roxyEqSwissEph: actRoxySe,
  localEqSwissEph: actLocalSe,
  channelCenterChecks: chanChecks,
  educationalChecks: eduChecks,
  channelDefinitionChecks: defChecks,
  channelCenterIssues: chanIssues,
  shownGeneral: { certainActivations: shownCertain, certainWrong: shownCertainWrong, uncertainActivations: shownUncertain, uncertainTruthNotInCandidates: uncertainMissTruth, momentsFullyCertain, channelClaimsWrong: generalChanWrong, centerClaimsWrong: generalCenterWrong },
  natalActivationsCompared: Object.values(data.natal as Record<string, { gates: unknown[] }>).reduce((s, n) => s + n.gates.length, 0),
  natalIssues,
  maxLocalMinusSwissEphArcsec: Object.fromEntries(Object.entries(maxLocalSe).map(([k, v]) => [k, +v.toFixed(3)])),
};
console.log(JSON.stringify(summary, null, 1));
if (mismatchDetail.length) console.log("UYUŞMAZLIKLAR:\n" + JSON.stringify(mismatchDetail, null, 1));

const mdArg = process.argv.indexOf("--md");
if (mdArg > 0) {
  const md = [
    "# Human Design Transit — Gerçek Roxy Doğrulaması (19 Ekim 2026)",
    "",
    "Kaynaklar: **Roxy** `POST /human-design/transit` gerçek yanıtları (lang=tr, true node) · **yerel motor** `computeGeneralTransit` · **Swiss Ephemeris** (pyswisseph, JPL tabanlı `.se1`, görünen konum, SE_TRUE_NODE; bağımsız Python mandala). Test kişileri sentetik.",
    "",
    "## Özet",
    "",
    "```json",
    JSON.stringify(summary, null, 1),
    "```",
    "",
    "## Anlar",
    "",
    "| # | UTC | Türkiye | Senaryo | 13 aktivasyon (Roxy = yerel = SE) | Kanal / merkez | Sonuç | Ayrıntı |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.utc} | ${r.local} | ${r.scenario} | ${r.act} | ${r.chan} | ${r.pass ? "PASS" : "**FAIL**"} | ${r.note.replace(/\|/g, "/")} |`),
    "",
  ].join("\n");
  writeFileSync(path.resolve(process.argv[mdArg + 1]), md);
  console.log(`rapor → ${process.argv[mdArg + 1]}`);
}
process.exit(passCount === rows.length && natalIssues === 0 ? 0 : 1);

/**
 * HD TRANSİT — SEÇENEK A (yerel + doğrulanmış Roxy gezegen konumları) GERÇEK VERİ REGRESYONU (ÇEVRİMDIŞI; ücretli çağrı YOK).
 *   npx tsx scripts/hd-transit/roxy-planets-report.ts [--md <rapor.md>]
 * Girdi (kayıtlı GERÇEK yanıtlar): fixtures/roxy-planets-validation.json (174 an: Roxy /astrology/planets + yeni anlar için
 * Roxy HD transit), fixtures/roxy-live-validation.json (önceki 120 an HD transit + 3 natal bodygraph),
 * fixtures/swiss-ephemeris-reference-v2.json (BAĞIMSIZ gerçek: Swiss Ephemeris + ayrı Python mandala).
 * Ölçütler (tek hata → çıkış 1):
 *   • Kesin gösterilen her aktivasyon = SE; doğrulanmadan kesin gösterilen 0; "tam" denen sonuçta çözülmemiş aktivasyon 0.
 *   • Genel kanal / merkez = SE kapılarından türetilen gerçek.
 *   • Kişisel: gerçek Roxy HD transit yanıtı doğrulanmış referansla kabul ediliyor (gereksiz ret 0) ve kanal/merkez doğru.
 *   • Önceki 9 yerel motor hatası ayrıca listelenir.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { computeGeneralTransit, TRANSIT_BODY_ORDER } from "../../lib/human-design/transit/generalTransit";
import { resolveGeneralTransit, __resetTransitResolverCache, type ResolvedTransit } from "../../lib/human-design/transit/resolveTransit";
import { checkTransitConsistency, expectedOverlay, validateRoxyTransit } from "../../lib/human-design/transit/personalTransit";
import { CHANNELS } from "../../lib/human-design/engine/channels";
import { istanbulLocalParts } from "../../lib/human-design/transit/transitMoment";

const FIX = path.resolve(__dirname, "fixtures");
type Rec = { id: string; utc: string; local: string; scenario: string; person: number; planets: unknown; hdTransit?: unknown };
const pv = JSON.parse(readFileSync(path.join(FIX, "roxy-planets-validation.json"), "utf8")).results as Record<string, Rec>;
// + 500 rastgele an (1900–2100) — yalnız genel transit (HD transit çağrısı yapılmadı)
const sweep = JSON.parse(readFileSync(path.join(FIX, "roxy-planets-sweep.json"), "utf8")).results as Record<string, { id: string; utc: string; planets: unknown }>;
const trLocal = (utc: string) => { const x = istanbulLocalParts(new Date(utc)); return `${x.localDate} ${x.localTime}`; };
for (const [k, v] of Object.entries(sweep)) pv[k] = { ...v, local: trLocal(v.utc), scenario: "rastgele an (1900–2100)", person: 0 };
const old = JSON.parse(readFileSync(path.join(FIX, "roxy-live-validation.json"), "utf8"));
const se = {
  ...JSON.parse(readFileSync(path.join(FIX, "swiss-ephemeris-reference-v2.json"), "utf8")).results,
  ...JSON.parse(readFileSync(path.join(FIX, "swiss-ephemeris-reference-sweep.json"), "utf8")).results,
} as Record<string, Record<string, { lon: number; gate: number; line: number; lineMarginArcsec: number }>>;
const PREVIOUS_LOCAL_ERRORS = ["B06-a", "B13-a", "B14-b", "B17-b", "B18-a", "B21-b", "B25-b"];

type Row = { id: string; utc: string; local: string; scenario: string; resolution: string; act: string; general: string; personal: string; pass: boolean; note: string };

async function main() {
  const rows: Row[] = [];
  let certainShown = 0, certainWrong = 0, unverifiedCertain = 0, completeWithUnresolved = 0, incomplete = 0;
  let generalChanWrong = 0, generalCenterWrong = 0, personalChecked = 0, personalRejected = 0, personalChanWrong = 0;
  let planetsCalls = 0;
  const prevErrDetail: unknown[] = [];
  const natal: Record<string, number[]> = Object.fromEntries(Object.entries(old.natal as Record<string, { gates: Array<{ gate: number }> }>).map(([k, n]) => [k, [...new Set(n.gates.map((g) => g.gate))]]));
  __resetTransitResolverCache();
  for (const [id, r] of Object.entries(pv)) {
    const notes: string[] = [];
    let pass = true;
    const utc = new Date(r.utc);
    const local = computeGeneralTransit(utc);
    let res: ResolvedTransit;
    try {
      res = await resolveGeneralTransit(utc, {
        config: { apiKey: "kayitli-yanit", baseUrl: "https://example.invalid" },
        callPlanets: async () => { planetsCalls++; return { ok: true, raw: { planets: r.planets } }; },
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        userId: "u", tenantId: "t",
      });
    } catch (e) {
      rows.push({ id, utc: r.utc, local: r.local, scenario: r.scenario, resolution: "DOĞRULAMA HATASI", act: "—", general: "—", personal: "—", pass: false, note: (e as Error).message });
      continue;
    }
    const t = res.transit;
    const truth = se[id];
    let okA = 0;
    for (const a of t.activations) {
      const s = truth[a.body];
      if (a.certain) {
        certainShown++;
        if (res.resolution === "unresolved" && local.activations.find((x) => x.body === a.body)!.certain === false) unverifiedCertain++;
        if (a.gate === s.gate && a.line === s.line) okA++;
        else { certainWrong++; pass = false; notes.push(`KESİN YANLIŞ ${a.body} ${a.gate}.${a.line} ≠ SE ${s.gate}.${s.line}`); }
      } else {
        notes.push(`kesinleştirilemedi ${a.body} (SE marj ${s.lineMarginArcsec.toFixed(2)}″)`);
        if (![`${a.gate}.${a.line}`, `${a.alternative!.gate}.${a.alternative!.line}`].includes(`${s.gate}.${s.line}`)) { pass = false; notes.push(`gerçek adaylarda yok ${a.body}`); }
      }
    }
    const complete = !t.hasUncertainty;
    if (!complete) incomplete++;
    if (complete && t.activations.some((a) => !a.certain)) { completeWithUnresolved++; pass = false; }
    // Genel kanal / merkez ↔ SE gerçeği
    const truthGates = new Set(TRANSIT_BODY_ORDER.map((b) => truth[b].gate));
    const truthCh = CHANNELS.filter((c) => truthGates.has(c.gateA) && truthGates.has(c.gateB)).map((c) => c.id).sort();
    const certCh = t.channels.map((c) => c.id).sort();
    const possCh = t.possibleChannels.map((c) => c.id);
    const truthCenters = new Set(CHANNELS.filter((c) => truthCh.includes(c.id)).flatMap((c) => [c.centerA, c.centerB]));
    const chOk = complete ? certCh.join() === truthCh.join() : certCh.every((x) => truthCh.includes(x)) && truthCh.every((x) => certCh.includes(x) || possCh.includes(x));
    const ceOk = complete ? t.definedCenters.slice().sort().join() === [...truthCenters].sort().join() : t.definedCenters.every((c) => truthCenters.has(c)) && t.openCenters.every((c) => !truthCenters.has(c));
    if (!chOk) { generalChanWrong++; pass = false; notes.push(`genel kanal ${certCh} ≠ ${truthCh}`); }
    if (!ceOk) { generalCenterWrong++; pass = false; notes.push("genel merkez yanlış"); }
    // Kişisel: gerçek Roxy HD transit yanıtı doğrulanmış referansla
    const hdRaw = r.hdTransit ?? old.results[id]?.raw; // P* anları: HD transit yok (yalnız genel)
    let personal = "—";
    if (hdRaw) {
      const v = validateRoxyTransit(hdRaw, { date: r.utc.slice(0, 10), time: r.utc.slice(11, 19) });
      if (!v.ok) { pass = false; personal = "şema hatası"; }
      else if (!complete) personal = "referans eksik → 503 (doğrulanamayan gösterilmez)";
      else {
        personalChecked++;
        const n = natal[String(r.person)];
        const rep = checkTransitConsistency(v.value, t, n);
        const exp = expectedOverlay(n, [...truthGates]);
        const gotP = v.value.completedChannels.filter((c) => c.kind === "personal").map((c) => c.id).sort().join();
        const gotE = v.value.completedChannels.filter((c) => c.kind === "educational").map((c) => c.id).sort().join();
        const chanOk = gotP === exp.personal.map((c) => c.id).sort().join() && gotE === exp.educational.map((c) => c.id).sort().join() && v.value.temporaryCenters.join() === exp.temporaryCenters.join();
        if (rep.errors.length) { personalRejected++; pass = false; notes.push(`kişisel RED: ${rep.errors.join("; ")}`); }
        if (!chanOk) { personalChanWrong++; pass = false; notes.push("kişisel kanal/merkez ≠ SE gerçeği"); }
        personal = rep.errors.length ? "RED" : `KABUL (${gotP.split(",").filter(Boolean).length} kişisel + ${gotE.split(",").filter(Boolean).length} transit-yalnız kanal, ${v.value.temporaryCenters.length} geçici merkez)`;
      }
    }
    if (PREVIOUS_LOCAL_ERRORS.includes(id)) prevErrDetail.push({ id, utc: r.utc, resolution: res.resolution, complete, allEqualSE: okA === 13, personal });
    rows.push({ id, utc: r.utc, local: r.local, scenario: r.scenario, resolution: res.resolution, act: `${okA}/13`, general: chOk && ceOk ? `OK (${certCh.length} kanal)` : "HATA", personal, pass, note: notes.join(" · ") });
  }
  const res = {
    moments: rows.length,
    pass: rows.filter((r) => r.pass).length,
    resolution: rows.reduce<Record<string, number>>((m, r) => ((m[r.resolution] = (m[r.resolution] ?? 0) + 1), m), {}),
    completeMoments: rows.length - incomplete,
    incompleteMoments: incomplete,
    certainShown,
    certainWrong,
    unverifiedCertain,
    completeWithUnresolved,
    generalChannelWrong: generalChanWrong,
    generalCenterWrong,
    personalChecked,
    personalRejected,
    personalChannelCenterWrong: personalChanWrong,
    simulatedPlanetsCalls: planetsCalls,
  };
  console.log(JSON.stringify(res, null, 1));
  console.log("Önceki yerel motor hatalı anlar:", JSON.stringify(prevErrDetail, null, 1));
  // Regresyon: önceki 9 yerel motor hatası (7 an) artık TAM ve SE ile birebir olmalı
  const prevOk = prevErrDetail.length === PREVIOUS_LOCAL_ERRORS.length && (prevErrDetail as Array<{ complete: boolean; allEqualSE: boolean }>).every((x) => x.complete && x.allEqualSE);
  if (!prevOk) rows.push({ id: "REGRESYON", utc: "", local: "", scenario: "önceki 9 hata", resolution: "", act: "", general: "", personal: "", pass: false, note: "önceki hatalı anlardan biri tam/doğru değil" });
  console.log(`Önceki 9 hata regresyonu: ${prevOk ? "PASS (hepsi TAM ve SE ile birebir)" : "FAIL"}`);
  const fails = rows.filter((r) => !r.pass);
  if (fails.length) console.log("FAIL:\n" + fails.map((r) => `${r.id} ${r.utc} ${r.note}`).join("\n"));
  const md = process.argv.indexOf("--md");
  if (md > 0) {
    writeFileSync(path.resolve(process.argv[md + 1]), [
      "# Human Design Transit — Seçenek A Gerçek Veri Doğrulaması (19 Ekim 2026)",
      "",
      "Kaynaklar: kayıtlı GERÇEK Roxy yanıtları (`/astrology/planets` 174 an; `/human-design/transit` 174 an) · yerel motor · **Swiss Ephemeris** (bağımsız gerçek). Çözüm: yerel motor + yalnız belirsiz anlarda bağımsız denetimli Roxy gezegen konumları.",
      "",
      "## Özet",
      "",
      "```json",
      JSON.stringify(res, null, 1),
      "```",
      "",
      "## Önceki 9 yerel motor hatası (7 an)",
      "",
      "```json",
      JSON.stringify(prevErrDetail, null, 1),
      "```",
      "",
      "## Anlar",
      "",
      "| # | UTC | Türkiye | Senaryo | Çözüm | 13 aktivasyon = SE | Genel kanal/merkez | Kişisel (gerçek Roxy HD) | Sonuç | Not |",
      "|---|---|---|---|---|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.id} | ${r.utc} | ${r.local} | ${r.scenario} | ${r.resolution} | ${r.act} | ${r.general} | ${r.personal} | ${r.pass ? "PASS" : "**FAIL**"} | ${r.note.replace(/\|/g, "/")} |`),
      "",
    ].join("\n"));
    console.log(`rapor → ${process.argv[md + 1]}`);
  }
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

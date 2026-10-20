/**
 * HD VARIABLES — HESAPLAMA DOĞRULUĞU (ağ / DB / ücretli çağrı YOK).
 *   A. Matematik: 2 400 boylam (rastgele + Color/Tone/Base/çizgi/kapı sınırı bitişikleri) — TypeScript alt yapı hesabı
 *      (variablesMath.substructureOf; mühürlü mandala) = BAĞIMSIZ Python hesabı (fixtures/math-reference.json).
 *   B. Sözleşme kuralları: Tone → yön (1–3 sol, 4–6 sağ), Cognition Tone eşlemesi, dört okun konum / taraf / gezegeni.
 *   C. GERÇEK Roxy (8 sentetik doğum, fixtures/roxy-live-variables.json) = Swiss Ephemeris (fixtures/swiss-ephemeris-live-cases.json):
 *      Color / Tone / Base ve güvenilirlik bayrağı kuralı (Tone payı ≤ confidenceMarginDeg → confident=false).
 *   D. 1 200 Swiss Ephemeris doğumu (fixtures/se-births.json, 4 800 ok): yerel bağımsız bant adayları SE gerçeğini İÇERMELİ
 *      (çapraz denetim doğru sonucu yanlışlıkla reddetmez) + değer çeşitliliği.
 *   E. 1 000 çağrı bütçeli GERÇEK doğrulama (20.10.2026; fixtures/roxy-live-1000-compact.json — 529 sentetik doğum, 2 116 ok;
 *      ref = Roxy'den ÖNCE sabitlenen Swiss Ephemeris beklentisi): ürün UTC'si, modern ofsetlerde birebir eşleşme, tarihsel
 *      saniyeli ofsetlerde sağlayıcının saniye kesmesiyle açıklanan farklar, güven bayrağı, ürünün çapraz denetimi ve
 *      KULLANICIYA GÖSTERİLEN sonuçta yanlış kesinlik olmaması.
 * Çalıştır: npx tsx scripts/hd-variables/accuracy-harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ARROW_SPECS, COGNITION_BY_TONE, substructureOf, toneDirection, type VariableKey } from "../../lib/human-design/variables/variablesMath";
import { applyHistoricalOffsetCaution, crossCheckVariables, localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import type { VariablesDto } from "../../lib/human-design/variables/variablesContract";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const FIX = path.resolve(__dirname, "fixtures");
const read = <T>(f: string) => JSON.parse(readFileSync(path.join(FIX, f), "utf8")) as T;

section("A. Color / Tone / Base matematiği = bağımsız Python hesabı");
const mathRef = read<{ cases: Array<{ lon: number; gate: number; line: number; color: number; tone: number; base: number }> }>("math-reference.json").cases;
// Tam sınır üzerindeki boylam (Base sınırına < 1e-9°) kayan nokta temsiline bağlı bir "bağ"dır: iki uygulama
// yuvarlama yüzünden farklı tarafa düşebilir (fiziksel anlamı yok — efemeris hassasiyetinin milyonlarca kat altı).
// Bu noktalarda ölçüt: TypeScript yarı-açık aralık kuralına uyar (sınır üst aralığa aittir → değer, sınırın 1e-9° sonrasıyla aynı).
const BASE_DEG = 360 / 64 / 6 / 6 / 6 / 5;
const onTie = (lon: number) => {
  const k = (((lon - 302) % 360) + 360) % 360 / BASE_DEG;
  return Math.abs(k - Math.round(k)) * BASE_DEG < 1e-9;
};
const sig = (s: { gate: number; line: number; color: number; tone: number; base: number }) => `${s.gate}.${s.line}.${s.color}.${s.tone}.${s.base}`;
let ties = 0;
const mathBad = mathRef.filter((c) => {
  const s = substructureOf(c.lon);
  if (sig(s) === sig(c)) return false;
  if (onTie(c.lon) && sig(s) === sig(substructureOf(c.lon + 1e-9))) { ties++; return false; }
  return true;
});
ok(mathRef.length >= 2000 && mathBad.length === 0, `${mathRef.length} boylam (sınır bitişikleri ±1e-7° dahil): kapı/çizgi/Color/Tone/Base farkı ${mathBad.length}; tam sınır bağı ${ties} (Python yuvarlaması alta düştü, TypeScript yarı-açık kurala uydu)`, mathBad.slice(0, 5));
const cover = { color: new Set<number>(), tone: new Set<number>(), base: new Set<number>() };
for (const c of mathRef) { cover.color.add(c.color); cover.tone.add(c.tone); cover.base.add(c.base); }
ok(cover.color.size === 6 && cover.tone.size === 6 && cover.base.size === 5, "tüm Color 1–6, Tone 1–6, Base 1–5 değerleri kapsandı");

section("B. Sözleşme kuralları");
ok([1, 2, 3].every((t) => toneDirection(t) === "left") && [4, 5, 6].every((t) => toneDirection(t) === "right"), "Tone 1–3 → sol, 4–6 → sağ");
ok(JSON.stringify(COGNITION_BY_TONE) === JSON.stringify(["Smell", "Taste", "Outer Vision", "Inner Vision", "Feeling", "Touch"]), "Cognition Tone eşlemesi sözleşmeyle aynı");
const specStr = ARROW_SPECS.map((s) => `${s.key}/${s.position}/${s.side}/${s.planet}/${s.layer}`).join(" | ");
ok(specStr === "determination/Top left/design/Sun/Primary Health System | environment/Bottom left/design/North Node/Primary Health System | motivation/Top right/personality/Sun/Rave Psychology | perspective/Bottom right/personality/North Node/Rave Psychology", "dört ok: sol üst Design Güneş · sol alt Design K.Düğüm · sağ üst Personality Güneş · sağ alt Personality K.Düğüm");

section("C. GERÇEK Roxy yanıtları × Swiss Ephemeris (bağımsız)");
type LiveArrow = { key: VariableKey; position: string; side: string; planet: string; layer: string; color: number; tone: number; base: number; direction: string; confident: boolean; cognitionLabel: string | null };
const live = read<{ results: Record<string, { confident?: boolean; confidenceMarginDeg?: number; arrows?: LiveArrow[]; error?: string; status?: number }> }>("roxy-live-variables.json").results;
const seLive = read<{ results: Record<string, Record<string, { color: number; tone: number; base: number; toneMarginArcsec: number }>> }>("swiss-ephemeris-live-cases.json").results;
let nArrows = 0, eq = 0, flagOk = 0, layoutOk = 0, cogOk = 0;
const diffs: unknown[] = [];
for (const [id, r] of Object.entries(live)) {
  if (r.error) continue;
  const marginArcsec = (r.confidenceMarginDeg ?? 0) * 3600;
  for (const a of r.arrows ?? []) {
    nArrows++;
    const s = seLive[id][a.key];
    if (a.color === s.color && a.tone === s.tone && a.base === s.base) eq++;
    else diffs.push({ id, key: a.key, roxy: `${a.color}.${a.tone}.${a.base}`, se: `${s.color}.${s.tone}.${s.base}` });
    // Bayrak kuralı: SE Tone payı ≤ sağlayıcı payı → false (pay sınırına < 0,1″ yakın vakalar iki yöne de kabul).
    const expect = s.toneMarginArcsec > marginArcsec;
    if (a.confident === expect || Math.abs(s.toneMarginArcsec - marginArcsec) < 0.1) flagOk++;
    else diffs.push({ id, key: a.key, confident: a.confident, toneMargin: s.toneMarginArcsec, margin: marginArcsec });
    const spec = ARROW_SPECS.find((x) => x.key === a.key)!;
    if (a.position === spec.position && a.side === spec.side && a.planet === spec.planet && a.layer === spec.layer && a.direction === toneDirection(a.tone)) layoutOk++;
    if (a.key === "determination" ? a.cognitionLabel === COGNITION_BY_TONE[a.tone - 1] : a.cognitionLabel === null) cogOk++;
  }
  const all = (r.arrows ?? []).every((a) => a.confident);
  ok(r.confident === all, `${id}: genel confident (${r.confident}) = dört okun VE'si`);
}
ok(nArrows === 32 && eq === 32, `8 gerçek yanıt, ${nArrows} ok: Color/Tone/Base Swiss Ephemeris ile birebir ${eq}/${nArrows}`, diffs);
ok(flagOk === nArrows, `güvenilirlik bayrağı kuralı (Tone payı > confidenceMarginDeg ⇔ confident) ${flagOk}/${nArrows}`, diffs);
ok(layoutOk === nArrows, `konum / taraf / gezegen / katman / yön ${layoutOk}/${nArrows}`);
ok(cogOk === nArrows, `Cognition yalnız determination'da ve Tone karşılığı ${cogOk}/${nArrows}`);
ok(live["V09-invalid-tz"]?.error === "bad_request" && live["V09-invalid-tz"]?.status === 400, "geçersiz saat dilimi → gerçek sağlayıcı 400 (bad_request sınıfı)");
const uncertainLive = Object.values(live).flatMap((r) => r.arrows ?? []).filter((a) => !a.confident).length;
ok(uncertainLive >= 2, `gerçek yanıtlarda confident=false okları gözlendi (${uncertainLive}; V07/V08 tasarlanmış sınır vakaları dahil)`);

section("D. 1 200 Swiss Ephemeris doğumu — yerel çapraz denetim doğru sonucu reddetmez");
type SeRow = { color: number; tone: number; base: number; toneMarginArcsec: number; lon: number };
const births = read<{ births: Array<{ id: string; utc: string } & Record<VariableKey, SeRow>> }>("se-births.json").births;
let falseReject = 0, two = 0, total = 0;
const rejects: unknown[] = [];
const dist: Record<string, Set<string>> = {};
for (const b of births) {
  const bands = localVariableBands(new Date(b.utc));
  for (const band of bands) {
    total++;
    const s = b[band.key];
    if (band.candidates.length > 1) two++;
    if (!band.candidates.includes(`${s.color}.${s.tone}`)) { falseReject++; rejects.push({ id: b.id, utc: b.utc, key: band.key, se: `${s.color}.${s.tone}`, local: band.candidates, band: band.bandArcsec, seLon: s.lon, localLon: band.longitude }); }
    (dist[band.key] ??= new Set()).add(`${s.color}.${s.tone}.${s.base}`);
  }
}
ok(births.length >= 1000 && falseReject === 0, `${births.length} doğum × 4 ok = ${total}: SE gerçeği yerel aday kümesinde (yanlış ret ${falseReject}); iki adaylı (bant sınırı kesen) ok ${two} (%${((two / total) * 100).toFixed(1)})`, rejects.slice(0, 5));
ok(ARROW_SPECS.every((s) => dist[s.key] && dist[s.key].size >= 100), `çeşitlilik: her okta farklı Color.Tone.Base birleşimi ${ARROW_SPECS.map((s) => `${s.key}=${dist[s.key]?.size ?? 0}`).join(", ")}`);

section("E. 1 000 çağrı bütçeli gerçek doğrulama (529 sentetik doğum) — ağsız yeniden doğrulama");
{
  type Row = [string, string, string, string, string, string[], number, string | null, number[][]];
  const live = read<{ confidenceMarginDeg: number; placementAllMatch: boolean; cases: Row[] }>("roxy-live-1000-compact.json");
  const thr = live.confidenceMarginDeg * 3600;
  const KEYS: VariableKey[] = ["determination", "environment", "motivation", "perspective"];
  let utcOk = 0, modernArrows = 0, modernExact = 0, lmtArrows = 0, lmtExplained = 0, confAgree = 0, confZone = 0, confTotal = 0, cogOk = 0, dirOk = 0;
  let shownCertain = 0, shownFalseTone = 0, shownBase = 0, shownFalseBase = 0, crossOk = 0, crossWrongReject = 0, lmtCases = 0;
  const bad: unknown[] = [];
  const comboSeen = new Set<string>();
  for (const [id, utc, date, time, tz, rox, , cog, ref] of live.cases) {
    const r = resolveBirthLocalTime(date, time, tz);
    if (r.kind !== "ok") { bad.push({ id, r: r.kind }); continue; }
    if (r.utcIso.replace(".000Z", "Z") === utc) utcOk++;
    const lmt = r.offsetSeconds % 60 !== 0;
    if (lmt) lmtCases++;
    const parsed = rox.map((s) => { const [ctb, d, c] = s.split(":"); const [color, tone, base] = ctb.split(".").map(Number); return { color, tone, base, direction: d === "l" ? "left" : "right", confident: c === "1" }; });
    parsed.forEach((p, i) => {
      const [rc, rt, rb, , rtm] = ref[i];
      comboSeen.add(`${KEYS[i]}:${rc}.${rt}.${rb}`);
      const exact = p.color === rc && p.tone === rt && p.base === rb;
      if (p.direction === toneDirection(p.tone)) dirOk++;
      if (!lmt) { modernArrows++; if (exact) modernExact++; else bad.push({ id, key: KEYS[i], roxy: rox[i], ref: ref[i] }); }
      else { lmtArrows++; const mis = [p.color !== rc ? ref[i][3] : 0, p.tone !== rt ? ref[i][4] : 0, p.base !== rb ? ref[i][5] : 0]; if (Math.max(...mis) <= 2.6) lmtExplained++; else bad.push({ id, lmt: true, key: KEYS[i], roxy: rox[i], ref: ref[i] }); }
      if (!lmt) { confTotal++; if (Math.abs(rtm - thr) <= 0.5) confZone++; else if (p.confident === rtm > thr) confAgree++; else bad.push({ id, conf: KEYS[i], roxy: p.confident, refTone: rtm }); }
    });
    if (cog === COGNITION_BY_TONE[parsed[0].tone - 1]) cogOk++;
    const dto = { confident: parsed.every((p) => p.confident), confidenceMarginDeg: live.confidenceMarginDeg, baseDescription: "-", historicalOffset: false,
      arrows: parsed.map((p, i) => ({ ...p, key: KEYS[i], planet: ARROW_SPECS[i].planet, baseCertain: true })) } as unknown as VariablesDto;
    const bands = localVariableBands(new Date(r.utcIso));
    const cc = crossCheckVariables(dto, bands);
    if (cc.ok) crossOk++; else if (cc.mismatches.some((m) => { const k = KEYS.indexOf(m.key); return m.provider === `${ref[k][0]}.${ref[k][1]}`; })) crossWrongReject++;
    const shown = applyHistoricalOffsetCaution(dto, bands, r.offsetSeconds);
    shown.arrows.forEach((a) => {
      const k = KEYS.indexOf(a.key);
      if (a.confident) { shownCertain++; if (a.color !== ref[k][0] || a.tone !== ref[k][1]) shownFalseTone++; }
      if (a.baseCertain) { shownBase++; if (a.base !== ref[k][2]) shownFalseBase++; }
    });
  }
  const n = live.cases.length;
  ok(n >= 500 && utcOk === n && live.placementAllMatch, `${n} gerçek yanıt: ürün UTC'si = referans UTC ${utcOk}/${n}; konum / taraf / gezegen hepsinde sözleşmeyle aynı`, bad.slice(0, 3));
  ok(modernArrows >= 1800 && modernExact === modernArrows, `saniyesiz (modern) ofset: ${modernExact}/${modernArrows} ok Color/Tone/Base Swiss Ephemeris ile BİREBİR`, bad.slice(0, 5));
  ok(lmtCases >= 40 && lmtExplained === lmtArrows, `tarihsel saniyeli ofset (${lmtCases} doğum, ${lmtArrows} ok): her fark ≤ 2,6″ referans payında (sağlayıcının ofset saniyesi kesmesi; Güneş ≤ 59 sn × 0,0425″)`, bad.slice(0, 5));
  ok(confAgree + confZone === confTotal && confZone < confTotal * 0.05, `güven bayrağı (modern): ${confAgree}/${confTotal - confZone} referansla uyumlu; eşiğin ±0,5″ bölgesi ${confZone} (efemeris farkı ölçeği)`);
  ok(cogOk === n && dirOk === 4 * n, `Cognition yalnız Sindirim/PHS'de ve Tone karşılığı ${cogOk}/${n}; yön Tone kuralıyla ${dirOk}/${4 * n}`);
  ok(crossOk === n && crossWrongReject === 0, `ürünün bağımsız çapraz denetimi gerçek yanıtları kabul etti ${crossOk}/${n} (doğruyu reddetme ${crossWrongReject})`);
  ok(shownFalseTone === 0 && shownFalseBase === 0, `KULLANICIYA GÖSTERİLEN: "kesin" ${shownCertain} okta yanlış Color/Tone ${shownFalseTone}; "kesin" ${shownBase} Base'te yanlış Base ${shownFalseBase}`);
  ok(ARROW_SPECS.every((s) => [...comboSeen].filter((c) => c.startsWith(`${s.key}:`)).length >= 120), `kapsam: ok başına farklı Color.Tone.Base birleşimi ${ARROW_SPECS.map((s) => `${s.key}=${[...comboSeen].filter((c) => c.startsWith(`${s.key}:`)).length}`).join(", ")}`);
}

console.log(`\nHD VARIABLES DOĞRULUK: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
process.exit(0);

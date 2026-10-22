/**
 * HD VARIABLES — 1 000 çağrılık gerçek doğrulamanın ANALİZİ (ağ YOK, ücretli çağrı YOK).
 *
 *   npx tsx scripts/hd-variables/analyze-live-1000.ts <ham_yanıt_klasörü> <çıktı.json> <vakalar1.json> [vakalar2.json ...]
 *
 * Her başarılı gerçek yanıt, Roxy'den ÖNCE sabitlenmiş Swiss Ephemeris beklentisiyle (make-live-1000-cases.py) ve ürünün
 * kendi yolu ile (validateRoxyVariables + resolveBirthLocalTime + localVariableBands/crossCheckVariables) karşılaştırılır.
 * Ok sınıfları: EXACT_MATCH · ACCEPTED_MEASURED_UNCERTAINTY (yalnız referans payı ≤ 2″ olan düzeyde fark) · PROVIDER_MISMATCH ·
 * Vaka sınıfları ayrıca: INVALID_PROVIDER_RESPONSE · LOCAL_CHECK_MISMATCH (ürün çapraz denetimi ile referans çelişiyor) ·
 * UNRESOLVED (yanıt yok / kayıp).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { validateRoxyVariables } from "../../lib/human-design/variables/variablesContract";
import { applyHistoricalOffsetCaution, crossCheckVariables, localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";
import { ARROW_SPEC_BY_KEY, COGNITION_BY_TONE, toneDirection, type VariableKey } from "../../lib/human-design/variables/variablesMath";

const TOL = 2; // yay-saniye: bu payın altında efemeris / Design çözüm farkı ölçülmüş belirsizlik sayılır
const AMBIG = 0.5; // güven eşiği (≈ 9,86″) çevresindeki ±0,5″ bölge: bayrak her iki yönde de kabul
const KEYS: VariableKey[] = ["determination", "environment", "motivation", "perspective"];
type Exp = { gate: number; line: number; color: number; tone: number; base: number; direction: string; colorMarginArcsec: number; toneMarginArcsec: number; baseMarginArcsec: number; lon: number };
type Case = { id: string; stage: number; utc: string; date: string; time: string; timezone: string; target?: { arrow: string; level: string; requestedOffsetArcsec: number }; expected: { arrows: Record<string, Exp> } };

const [rawDir, outFile, ...caseFiles] = process.argv.slice(2);
const cases: Case[] = caseFiles.flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as { cases: Case[] }).cases);
const ledger = readFileSync(path.resolve(__dirname, "fixtures/roxy-live-1000-ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
const resultOf = new Map(ledger.filter((e) => e.type === "result").map((e) => [String(e.case), e]));
const intentOf = new Set(ledger.filter((e) => e.type === "intent").map((e) => String(e.case)));

const caseRows: Record<string, unknown>[] = [];
const arrowRows: Record<string, unknown>[] = [];
const agg = { casesPlanned: cases.length, called: 0, ok200: 0, httpErrors: {} as Record<string, number>, lost: 0, invalid: 0, utcAgree: 0, utcDisagree: [] as unknown[],
  arrows: 0, color: 0, tone: 0, base: 0, direction: 0, placement: 0, cognitionOk: 0, cognitionTotal: 0,
  classes: { EXACT_MATCH: 0, ACCEPTED_MEASURED_UNCERTAINTY: 0, PROVIDER_MISMATCH: 0 } as Record<string, number>,
  confidentAgree: 0, confidentAmbiguousZone: 0, confidentDisagree: [] as unknown[], falseCertainty: [] as unknown[],
  productAccepted: 0, productRejected: 0, localCheckMismatch: [] as unknown[], productFalseAccept: [] as unknown[],
  turkishMissing: [] as unknown[], historicalOffsetCases: 0, shownFalseCertainTone: [] as unknown[], shownFalseCertainBase: [] as unknown[], shownCertainArrows: 0, shownBaseCertain: 0, boundary: { total: 0, exact: 0, measured: 0, mismatch: 0 }, baseNearBoundaryConfidentTrue: 0, provMarginDeg: new Set<number>() };

for (const c of cases) {
  if (!intentOf.has(c.id)) continue;
  agg.called++;
  const res = resultOf.get(c.id);
  if (!res) { agg.lost++; caseRows.push({ id: c.id, cls: "UNRESOLVED", note: "yanıt kayıp (intent var, result yok)" }); continue; }
  if (!res.ok) { const k = `${String(res.status)} ${String(res.kind)}`; agg.httpErrors[k] = (agg.httpErrors[k] ?? 0) + 1; caseRows.push({ id: c.id, cls: "UNRESOLVED", note: k }); continue; }
  agg.ok200++;
  const rawPath = path.join(rawDir, `${c.id}.json`);
  if (!existsSync(rawPath)) { agg.lost++; caseRows.push({ id: c.id, cls: "UNRESOLVED", note: "ham yanıt dosyası yok" }); continue; }
  const raw = JSON.parse(readFileSync(rawPath, "utf8")) as { arrows: Array<Record<string, unknown>>; confident: boolean; confidenceMarginDeg: number };
  const v = validateRoxyVariables(raw);
  if (!v.ok) { agg.invalid++; caseRows.push({ id: c.id, cls: "INVALID_PROVIDER_RESPONSE", errors: v.errors.slice(0, 5) }); continue; }
  agg.provMarginDeg.add(raw.confidenceMarginDeg);
  const marginArcsec = raw.confidenceMarginDeg * 3600;
  // Ürün yolu: yerel saat → UTC (ürün çözücüsü) — referansın UTC'siyle aynı olmalı
  const pr = resolveBirthLocalTime(c.date, c.time, c.timezone);
  const prUtc = pr.kind === "ok" ? pr.utcIso.replace(/\.000Z$/, "Z") : `(${pr.kind})`;
  if (prUtc === c.utc) agg.utcAgree++; else agg.utcDisagree.push({ id: c.id, ref: c.utc, product: prUtc });
  let caseCls = "EXACT_MATCH";
  const perArrow: Record<string, string> = {};
  for (const k of KEYS) {
    const a = raw.arrows.find((x) => x.key === k)!;
    const e = c.expected.arrows[k];
    const spec = ARROW_SPEC_BY_KEY[k];
    const act = (a.activation ?? {}) as Record<string, unknown>;
    agg.arrows++;
    const mC = a.color === e.color, mT = a.tone === e.tone, mB = a.base === e.base;
    if (mC) agg.color++;
    if (mT) agg.tone++;
    if (mB) agg.base++;
    if (a.direction === toneDirection(Number(a.tone)) && a.direction === e.direction) agg.direction++;
    if (a.position === spec.position && act.side === spec.side && act.planet === spec.planet && a.layer === spec.layer) agg.placement++;
    if (k === "determination") {
      agg.cognitionTotal++;
      const cog = a.cognition as Record<string, unknown> | undefined;
      if (cog && cog.label === COGNITION_BY_TONE[Number(a.tone) - 1] && typeof cog.labelLocalized === "string" && cog.labelLocalized) agg.cognitionOk++;
    } else if (a.cognition != null) agg.cognitionTotal++; // başka okta cognition = hata (sayılır, ok değil)
    const missingTr = ["nameLocalized", "layerLocalized", "positionLocalized", "colorLabelLocalized", "directionLabelLocalized", "baseNameLocalized"].filter((f) => typeof a[f] !== "string" || !(a[f] as string).trim());
    if (typeof act.planetLocalized !== "string") missingTr.push("planetLocalized");
    if (missingTr.length) agg.turkishMissing.push({ id: c.id, key: k, missing: missingTr });
    // Sınıf
    const diffs: Array<{ level: string; margin: number }> = [];
    if (!mC) diffs.push({ level: "color", margin: e.colorMarginArcsec });
    if (!mT) diffs.push({ level: "tone", margin: e.toneMarginArcsec });
    if (!mB) diffs.push({ level: "base", margin: e.baseMarginArcsec });
    const cls = diffs.length === 0 ? "EXACT_MATCH" : diffs.every((d) => d.margin <= TOL) ? "ACCEPTED_MEASURED_UNCERTAINTY" : "PROVIDER_MISMATCH";
    agg.classes[cls]++;
    perArrow[k] = cls;
    if (cls === "PROVIDER_MISMATCH") caseCls = "PROVIDER_MISMATCH";
    else if (cls === "ACCEPTED_MEASURED_UNCERTAINTY" && caseCls === "EXACT_MATCH") caseCls = "ACCEPTED_MEASURED_UNCERTAINTY";
    // Güven bayrağı: referansın Tone payı, sağlayıcının eşiğine göre
    const expConf = e.toneMarginArcsec > marginArcsec;
    if (Math.abs(e.toneMarginArcsec - marginArcsec) <= AMBIG) agg.confidentAmbiguousZone++;
    else if (a.confident === expConf) agg.confidentAgree++;
    else agg.confidentDisagree.push({ id: c.id, key: k, roxy: a.confident, refToneMargin: +e.toneMarginArcsec.toFixed(3) });
    // Yanlış kesinlik: sağlayıcı "kesin" diyor ama Color/Tone referansla farklı
    if (a.confident === true && (!mC || !mT)) agg.falseCertainty.push({ id: c.id, key: k, roxy: `${String(a.color)}.${String(a.tone)}`, ref: `${e.color}.${e.tone}`, refToneMargin: e.toneMarginArcsec });
    if (a.confident === true && e.baseMarginArcsec <= TOL) agg.baseNearBoundaryConfidentTrue++;
    if (c.target && c.target.arrow === k) {
      agg.boundary.total++;
      if (cls === "EXACT_MATCH") agg.boundary.exact++; else if (cls === "ACCEPTED_MEASURED_UNCERTAINTY") agg.boundary.measured++; else agg.boundary.mismatch++;
    }
    arrowRows.push({ id: c.id, stage: c.stage, key: k, roxy: `${String(a.color)}.${String(a.tone)}.${String(a.base)}:${String(a.direction)}`, ref: `${e.color}.${e.tone}.${e.base}:${e.direction}`,
      roxyConfident: a.confident, refMargins: { color: +e.colorMarginArcsec.toFixed(3), tone: +e.toneMarginArcsec.toFixed(3), base: +e.baseMarginArcsec.toFixed(3) }, cls, target: c.target?.arrow === k ? c.target : undefined });
  }
  // Ürünün çapraz denetimi (gerçek yanıt + ürünün UTC'si) ve KULLANICIYA GÖSTERİLEN sonuç (tarihsel ofset kesinlik düşürmesi dahil)
  let product = "accepted";
  if (pr.kind === "ok") {
    const bands = localVariableBands(new Date(pr.utcIso));
    const shown = applyHistoricalOffsetCaution(v.value, bands, pr.offsetSeconds);
    if (shown.historicalOffset) agg.historicalOffsetCases++;
    for (const a of shown.arrows) {
      const e = c.expected.arrows[a.key];
      if (a.confident) {
        agg.shownCertainArrows++;
        if (a.color !== e.color || a.tone !== e.tone) agg.shownFalseCertainTone.push({ id: c.id, key: a.key, shown: `${a.color}.${a.tone}`, ref: `${e.color}.${e.tone}` });
      }
      if (a.baseCertain) {
        agg.shownBaseCertain++;
        if (a.base !== e.base) agg.shownFalseCertainBase.push({ id: c.id, key: a.key, shown: a.base, ref: e.base, refBaseMargin: +e.baseMarginArcsec.toFixed(3) });
      }
    }
    const cc = crossCheckVariables(v.value, bands);
    if (cc.ok) agg.productAccepted++;
    else {
      agg.productRejected++;
      product = "rejected";
      // Referans sağlayıcıyla aynıysa ürün DOĞRU sonucu reddetmiş demektir
      const wrongReject = cc.mismatches.filter((m) => { const e = c.expected.arrows[m.key]; return m.provider === `${e.color}.${e.tone}`; });
      if (wrongReject.length) agg.localCheckMismatch.push({ id: c.id, arrows: wrongReject });
    }
    if (cc.ok && caseCls === "PROVIDER_MISMATCH") agg.productFalseAccept.push({ id: c.id, perArrow });
  }
  if (agg.localCheckMismatch.some((x) => (x as { id: string }).id === c.id) && caseCls !== "PROVIDER_MISMATCH") caseCls = "LOCAL_CHECK_MISMATCH";
  caseRows.push({ id: c.id, stage: c.stage, cls: caseCls, perArrow, product, roxyConfident: raw.confident });
}

const caseClasses: Record<string, number> = {};
for (const r of caseRows) caseClasses[String(r.cls)] = (caseClasses[String(r.cls)] ?? 0) + 1;
const summary = { ...agg, provMarginDeg: [...agg.provMarginDeg], caseClasses, generatedAt: new Date().toISOString(), tolArcsec: TOL, ambiguousZoneArcsec: AMBIG };
writeFileSync(outFile, JSON.stringify({ summary, cases: caseRows, arrows: arrowRows }, null, 1));
const s = summary;
console.log(`çağrılan vaka ${s.called} · 200 ${s.ok200} · HTTP hata ${JSON.stringify(s.httpErrors)} · kayıp ${s.lost} · geçersiz ${s.invalid}`);
console.log(`UTC ürün=referans ${s.utcAgree}/${s.ok200 - s.invalid}${s.utcDisagree.length ? ` · FARK ${JSON.stringify(s.utcDisagree.slice(0, 3))}` : ""}`);
console.log(`ok ${s.arrows}: Color ${s.color} · Tone ${s.tone} · Base ${s.base} · yön ${s.direction} · konum/taraf/gezegen ${s.placement} · Cognition ${s.cognitionOk}/${s.cognitionTotal}`);
console.log(`ok sınıfları ${JSON.stringify(s.classes)} · vaka sınıfları ${JSON.stringify(caseClasses)}`);
console.log(`güven bayrağı uyumu ${s.confidentAgree} · eşik bölgesi (±${AMBIG}″) ${s.confidentAmbiguousZone} · uyuşmaz ${s.confidentDisagree.length} · YANLIŞ KESİNLİK ${s.falseCertainty.length}`);
console.log(`ürün çapraz denetimi kabul ${s.productAccepted} / ret ${s.productRejected} · doğruyu reddetme ${s.localCheckMismatch.length} · yanlışı kabul ${s.productFalseAccept.length}`);
console.log(`sınır hedefli oklar ${s.boundary.total}: exact ${s.boundary.exact} · ölçülmüş belirsizlik ${s.boundary.measured} · uyuşmazlık ${s.boundary.mismatch} · Base sınırda (≤${TOL}″) ama confident=true ${s.baseNearBoundaryConfidentTrue}`);
console.log(`KULLANICIYA GÖSTERİLEN: tarihsel ofset vakası ${s.historicalOffsetCases} · "kesin" ok ${s.shownCertainArrows} içinde yanlış Color/Tone ${s.shownFalseCertainTone.length} · "kesin" Base ${s.shownBaseCertain} içinde yanlış Base ${s.shownFalseCertainBase.length}`);
if (s.shownFalseCertainTone.length || s.shownFalseCertainBase.length) console.log("GÖSTERİLEN YANLIŞ KESİNLİK:", JSON.stringify([...s.shownFalseCertainTone, ...s.shownFalseCertainBase].slice(0, 10)));
console.log(`Türkçe alan eksik ok ${s.turkishMissing.length} · sağlayıcı güven payı ${JSON.stringify(s.provMarginDeg)}`);
if (s.confidentDisagree.length) console.log("güven uyuşmazlıkları:", JSON.stringify(s.confidentDisagree.slice(0, 10)));
if (s.falseCertainty.length) console.log("YANLIŞ KESİNLİK:", JSON.stringify(s.falseCertainty.slice(0, 10)));
if (s.localCheckMismatch.length) console.log("ürün doğruyu reddetti:", JSON.stringify(s.localCheckMismatch.slice(0, 10)));
const mism = arrowRows.filter((r) => r.cls !== "EXACT_MATCH");
if (mism.length) console.log("EXACT olmayan oklar:", JSON.stringify(mism.slice(0, 15)));

/**
 * HD TRANSİT — DÜNYA GENELİ SAAT DİLİMİ + ASTRONOMİK GOLDEN testleri (ağ / DB / Roxy YOK).
 *
 *   A. Adlandırılmış golden saat dilimi vakaları — beklenen UTC değerleri ELLE, yayımlanmış IANA kurallarından yazıldı
 *      (Türkiye 2026/2015/1995, Londra, Berlin, Paris, New York, Tokyo, Kolkata, Katmandu, Johannesburg, Nairobi,
 *      Sidney, Lord Howe 30 dk DST, Kiritimati UTC+14, Apia atlanan gün).
 *   B. BAĞIMSIZ referans: fixtures/timezone-reference.json — Python zoneinfo + tzdata (ICU/Intl kodu kullanılmaz),
 *      ≥1000 tarih+saat+bölge, ≥100 bölge, gerçek DST geçişlerinin çevresi. Ölçüt: yanlış UTC 0, sessiz DST düzeltmesi 0.
 *   C. Geçersiz saat dilimi / tarih / saat / ofset reddi (kabul 0).
 *   D. Aynı UTC anı → her saat diliminde AYNI 13 aktivasyon.
 *   E. "Şimdi" iki kez yaşanan saatte gerçek anın ofsetini seçer.
 *   F. Owner canlı test anları (6) — Swiss Ephemeris (pyswisseph + JPL dosyaları) ile BAĞIMSIZ karşılaştırma:
 *      kesin aktivasyon = SE; belirsiz aktivasyonda SE adaylar içinde; kanal / merkez SE kapılarından türetilenle uyumlu;
 *      kişisel natal + transit birleşimi SE ile aynı.
 * Çalıştır: npx tsx scripts/hd-transit/timezone-harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isTransitTimeZone, localParts, nowTransitMoment, resolveTransitMoment, utcOffsetLabel } from "../../lib/human-design/transit/transitMoment";
import { computeGeneralTransit, TRANSIT_BODY_ORDER } from "../../lib/human-design/transit/generalTransit";
import { CHANNELS, getDefinedCenters } from "../../lib/human-design/engine/channels";
import { expectedOverlay } from "../../lib/human-design/transit/personalTransit";
import { resolveGeneralTransit, __resetTransitResolverCache } from "../../lib/human-design/transit/resolveTransit";
import { engineChart, PEOPLE } from "../hd-relations/fakeRelationRoxy";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const FIX = path.resolve(__dirname, "fixtures");

type Exp = { utc: string; off: number } | "gap" | { amb: [number, number] };
function check(tz: string, date: string, time: string, exp: Exp, label: string) {
  const r = resolveTransitMoment(date, time, tz);
  if (exp === "gap") return ok(!r.ok && r.code === "LOCAL_TIME_GAP", `${label}: ${tz} ${date} ${time} → hiç yaşanmadı (reddedilir)`, r);
  if ("amb" in exp) {
    const okAmb = !r.ok && r.code === "LOCAL_TIME_AMBIGUOUS" && JSON.stringify(r.offsetsSeconds) === JSON.stringify(exp.amb);
    return ok(okAmb, `${label}: ${tz} ${date} ${time} → iki kez yaşandı (${exp.amb.map(utcOffsetLabel).join(" / ")}); sessiz seçim YOK`, r);
  }
  ok(r.ok && r.moment.utcIso === exp.utc && r.moment.offsetSeconds === exp.off, `${label}: ${tz} ${date} ${time} → ${exp.utc} (${utcOffsetLabel(exp.off)})`, r);
}

async function main() {
  section("A. Adlandırılmış golden saat dilimi vakaları (beklenen değerler IANA kurallarından elle)");
  const h = 3600;
  check("Europe/Istanbul", "2026-10-20", "12:00", { utc: "2026-10-20T09:00:00.000Z", off: 3 * h }, "TR 2026 güncel UTC+3");
  check("Europe/Istanbul", "2015-02-10", "13:30", { utc: "2015-02-10T11:30:00.000Z", off: 2 * h }, "TR 2015 kış (tarihsel UTC+2)");
  check("Europe/Istanbul", "1995-05-15", "12:00", { utc: "1995-05-15T09:00:00.000Z", off: 3 * h }, "TR 1995 yaz saati UTC+3");
  check("Europe/London", "2026-07-01", "12:00", { utc: "2026-07-01T11:00:00.000Z", off: h }, "Londra yaz UTC+1");
  check("Europe/London", "2026-01-15", "12:00", { utc: "2026-01-15T12:00:00.000Z", off: 0 }, "Londra kış UTC+0");
  check("Europe/London", "2026-03-29", "01:30", "gap", "Londra DST ileri");
  check("Europe/London", "2026-10-25", "01:30", { amb: [0, h] }, "Londra DST geri");
  check("Europe/Berlin", "2026-07-01", "12:00", { utc: "2026-07-01T10:00:00.000Z", off: 2 * h }, "Berlin yaz UTC+2");
  check("Europe/Berlin", "2026-01-15", "12:00", { utc: "2026-01-15T11:00:00.000Z", off: h }, "Berlin kış UTC+1");
  check("Europe/Berlin", "2026-03-29", "02:30", "gap", "Berlin DST ileri");
  check("Europe/Berlin", "2026-10-25", "02:30", { amb: [h, 2 * h] }, "Berlin DST geri");
  check("Europe/Paris", "2026-07-01", "12:00", { utc: "2026-07-01T10:00:00.000Z", off: 2 * h }, "Paris yaz UTC+2");
  check("Europe/Paris", "2026-01-15", "12:00", { utc: "2026-01-15T11:00:00.000Z", off: h }, "Paris kış UTC+1");
  check("Europe/Paris", "2026-03-29", "02:30", "gap", "Paris DST ileri");
  check("Europe/Paris", "2026-10-25", "02:30", { amb: [h, 2 * h] }, "Paris DST geri");
  check("America/New_York", "2026-07-01", "12:00", { utc: "2026-07-01T16:00:00.000Z", off: -4 * h }, "New York yaz UTC−4");
  check("America/New_York", "2026-01-15", "12:00", { utc: "2026-01-15T17:00:00.000Z", off: -5 * h }, "New York kış UTC−5");
  check("America/New_York", "2026-03-08", "02:30", "gap", "New York DST ileri (ABD: Mart 2. pazar — Avrupa'dan farklı tarih)");
  check("America/New_York", "2026-11-01", "01:30", { amb: [-5 * h, -4 * h] }, "New York DST geri (Kasım 1. pazar)");
  check("America/New_York", "2026-03-29", "02:30", { utc: "2026-03-29T06:30:00.000Z", off: -4 * h }, "New York, Avrupa geçiş gününde normal (UTC−4)");
  check("Asia/Tokyo", "2026-10-20", "12:00", { utc: "2026-10-20T03:00:00.000Z", off: 9 * h }, "Tokyo UTC+9");
  check("Asia/Kolkata", "2026-10-20", "12:00", { utc: "2026-10-20T06:30:00.000Z", off: 5.5 * h }, "Kolkata UTC+5:30");
  check("Asia/Kathmandu", "2026-10-20", "12:00", { utc: "2026-10-20T06:15:00.000Z", off: 5.75 * h }, "Katmandu UTC+5:45");
  check("Africa/Johannesburg", "2026-10-20", "12:00", { utc: "2026-10-20T10:00:00.000Z", off: 2 * h }, "Johannesburg UTC+2");
  check("Africa/Nairobi", "2026-10-20", "12:00", { utc: "2026-10-20T09:00:00.000Z", off: 3 * h }, "Nairobi UTC+3");
  check("Australia/Sydney", "2026-01-15", "12:00", { utc: "2026-01-15T01:00:00.000Z", off: 11 * h }, "Sidney güney yaz UTC+11");
  check("Australia/Sydney", "2026-07-15", "12:00", { utc: "2026-07-15T02:00:00.000Z", off: 10 * h }, "Sidney güney kış UTC+10");
  check("Australia/Lord_Howe", "2026-01-15", "12:00", { utc: "2026-01-15T01:00:00.000Z", off: 11 * h }, "Lord Howe yaz UTC+11");
  check("Australia/Lord_Howe", "2026-07-15", "12:00", { utc: "2026-07-15T01:30:00.000Z", off: 10.5 * h }, "Lord Howe kış UTC+10:30");
  check("Australia/Lord_Howe", "2026-10-04", "02:15", "gap", "Lord Howe 30 dk ileri (02:00→02:30)");
  check("Australia/Lord_Howe", "2026-04-05", "01:45", { amb: [10.5 * h, 11 * h] }, "Lord Howe 30 dk geri (02:00→01:30)");
  check("Pacific/Kiritimati", "2026-10-20", "12:00", { utc: "2026-10-19T22:00:00.000Z", off: 14 * h }, "Kiritimati UTC+14 (UTC'de önceki gün)");
  check("Pacific/Apia", "2011-12-29", "12:00", { utc: "2011-12-29T22:00:00.000Z", off: -10 * h }, "Apia tarih çizgisi öncesi (UTC−10)");
  check("Pacific/Apia", "2011-12-30", "12:00", "gap", "Apia ATLANAN GÜN 30.12.2011 (tarih çizgisi geçişi)");
  check("Pacific/Apia", "2011-12-31", "12:00", { utc: "2011-12-30T22:00:00.000Z", off: 14 * h }, "Apia tarih çizgisi sonrası (UTC+14)");
  // Açık ofset seçimi (iki kez yaşanan saat)
  const l1 = resolveTransitMoment("2026-10-25", "01:30", "Europe/London", 3600);
  const l2 = resolveTransitMoment("2026-10-25", "01:30", "Europe/London", 0);
  ok(l1.ok && l1.moment.utcIso === "2026-10-25T00:30:00.000Z" && l2.ok && l2.moment.utcIso === "2026-10-25T01:30:00.000Z", "Londra 25.10.2026 01:30: kullanıcı 'ilk kez' (UTC+1) → 00:30Z, 'ikinci kez' (UTC+0) → 01:30Z");
  const tr0 = resolveTransitMoment("2026-10-20", "12:00");
  ok(tr0.ok && tr0.moment.timeZone === "Europe/Istanbul" && tr0.moment.utcIso === "2026-10-20T09:00:00.000Z", "saat dilimi verilmeyen eski çağrı → Türkiye (geriye uyum)");

  section("B. Bağımsız referans (Python zoneinfo + tzdata) — toplu UTC karşılaştırması");
  const ref = JSON.parse(readFileSync(path.join(FIX, "timezone-reference.json"), "utf8")) as {
    source: string;
    cases: Array<{ tz: string; date: string; time: string; group: string; kind: "ok" | "gap" | "ambiguous"; utc?: string; offset?: number; offsets?: number[] }>;
  };
  let wrongUtc = 0, silentDst = 0, falseReject = 0, unsupported = 0, ambChoiceWrong = 0;
  const bad: unknown[] = [];
  for (const c of ref.cases) {
    if (!isTransitTimeZone(c.tz)) { unsupported++; bad.push({ unsupported: c.tz }); continue; }
    const r = resolveTransitMoment(c.date, c.time, c.tz);
    if (c.kind === "ok") {
      if (!r.ok) { falseReject++; bad.push({ c, got: r.code }); }
      else if (r.moment.utcIso !== c.utc || r.moment.offsetSeconds !== c.offset) { wrongUtc++; bad.push({ c, got: [r.moment.utcIso, r.moment.offsetSeconds] }); }
    } else if (c.kind === "gap") {
      if (r.ok) { silentDst++; bad.push({ c, got: r.moment.utcIso }); }
      else if (r.code !== "LOCAL_TIME_GAP") { wrongUtc++; bad.push({ c, got: r.code }); }
    } else {
      if (r.ok) { silentDst++; bad.push({ c, got: r.moment.utcIso }); }
      else if (r.code !== "LOCAL_TIME_AMBIGUOUS" || JSON.stringify(r.offsetsSeconds) !== JSON.stringify(c.offsets)) { wrongUtc++; bad.push({ c, got: [r.code, r.offsetsSeconds] }); }
      else {
        for (const o of c.offsets!) {
          const x = resolveTransitMoment(c.date, c.time, c.tz, o);
          const [y, mo, d] = c.date.split("-").map(Number);
          const [hh, mi] = c.time.split(":").map(Number);
          const want = new Date(Date.UTC(y, mo - 1, d, hh, mi) - o * 1000).toISOString();
          if (!x.ok || x.moment.utcIso !== want) { ambChoiceWrong++; bad.push({ c, o, got: x }); }
        }
      }
    }
  }
  const zones = new Set(ref.cases.map((c) => c.tz)).size;
  console.log(`    kaynak: ${ref.source} · ${ref.cases.length} vaka · ${zones} bölge · ok ${ref.cases.filter((c) => c.kind === "ok").length} / gap ${ref.cases.filter((c) => c.kind === "gap").length} / ambiguous ${ref.cases.filter((c) => c.kind === "ambiguous").length}`);
  ok(ref.cases.length >= 1000 && zones >= 100, `≥1000 tarih+saat+bölge (${ref.cases.length}) ve ≥100 IANA bölgesi (${zones})`);
  ok(wrongUtc === 0, `yanlış UTC / yanlış sınıf = ${wrongUtc}`, bad.slice(0, 8));
  ok(silentDst === 0, `sessiz DST düzeltmesi (yaşanmamış / iki kez yaşanmış saat sessizce kabul) = ${silentDst}`, bad.slice(0, 8));
  ok(falseReject === 0, `geçerli yerel saatin haksız reddi = ${falseReject}`, bad.slice(0, 8));
  ok(ambChoiceWrong === 0, `iki kez yaşanan saatte açık ofset seçimiyle yanlış UTC = ${ambChoiceWrong}`, bad.slice(0, 8));
  ok(unsupported === 0, `çalışma zamanında desteklenmeyen referans bölgesi = ${unsupported}`, bad.filter((b) => (b as { unsupported?: string }).unsupported).slice(0, 8));

  section("C. Geçersiz girdi reddi (kabul 0)");
  const badTz = ["", "Mars/Olympus", "Europe/Istanbul;DROP TABLE", "../../etc/passwd", "Europe/İstanbul", "GMT+3", "+03:00", "x".repeat(65), "Europe/Istanbul\n", "<script>alert(1)</script>", "Europe/Is tanbul", "http://evil/x"];
  const accepted = badTz.filter((tz) => resolveTransitMoment("2026-10-20", "12:00", tz).ok);
  ok(accepted.length === 0 && badTz.every((tz) => { const r = resolveTransitMoment("2026-10-20", "12:00", tz); return !r.ok && r.code === "INVALID_TIMEZONE"; }), `geçersiz / zararlı ${badTz.length} saat dilimi → INVALID_TIMEZONE (kabul ${accepted.length})`, accepted);
  const bads: Array<[string, string, string, number | null, string]> = [
    ["2026-02-30", "12:00", "Europe/London", null, "INVALID_DATE"], ["2026-10-20", "24:00", "Europe/London", null, "INVALID_TIME"], ["2026-10-20", "9:00", "Europe/London", null, "INVALID_TIME"],
    ["1899-12-31", "12:00", "Europe/London", null, "DATE_OUT_OF_RANGE"], ["2101-01-01", "12:00", "Europe/London", null, "DATE_OUT_OF_RANGE"],
    ["2026-07-01", "12:00", "Europe/London", 0, "INVALID_OFFSET"], ["2026-10-25", "01:30", "Europe/London", 7200, "INVALID_OFFSET"], ["2026-10-20", "12:00", "Europe/London", 999999, "INVALID_OFFSET"],
    ["2026-10-20", "12:00", "Europe/London", 1.5, "INVALID_OFFSET"],
  ];
  for (const [d, t, tz, o, code] of bads) {
    const r = resolveTransitMoment(d, t, tz, o);
    ok(!r.ok && r.code === code, `${tz} ${d} ${t}${o !== null ? ` ofset ${o}` : ""} → ${code}`, r);
  }

  section("D. Aynı UTC anı → her saat diliminde aynı 13 aktivasyon");
  const ZONES = ["Europe/Istanbul", "Europe/London", "Europe/Berlin", "America/New_York", "America/Sao_Paulo", "Asia/Tokyo", "Asia/Kolkata", "Asia/Kathmandu", "Australia/Lord_Howe", "Pacific/Kiritimati", "Pacific/Apia", "Pacific/Chatham"];
  const utcs = ["2026-10-20T09:00:00.000Z", "2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z", "1995-05-15T09:00:00.000Z", "2011-12-30T10:00:00.000Z", "2075-03-01T17:45:00.000Z", "1902-07-04T12:00:00.000Z"];
  // NOT: 1970 öncesi bazı bölgeler SANİYELİ yerel ortalama saat (LMT) kullanır (ör. İstanbul 1902: +01:56:56). Dakika
  // hassasiyetindeki yerel saat girişi bu UTC anlarını tam ifade edemez: yerel dakika → UTC (saniyeli ofsetle) DOĞRU an
  // olur ama başlangıç UTC'sinden <60 sn farklıdır. Bu durumda ölçüt: ofsette saniye var, fark <60 sn ve o UTC geri
  // çevrildiğinde aynı yerel dakika çıkar. "Aynı UTC → aynı aktivasyon" ölçütü tam dakika ofsetli bölgelerde birebir.
  let sameFail = 0;
  let lmtCases = 0;
  for (const u of utcs) {
    const ref0 = JSON.stringify(computeGeneralTransit(new Date(u)).activations.map((a) => `${a.body}:${a.gate}.${a.line}:${a.certain}`));
    for (const tz of ZONES) {
      const p = localParts(new Date(u), tz);
      let r = resolveTransitMoment(p.localDate, p.localTime, tz);
      if (!r.ok && r.code === "LOCAL_TIME_AMBIGUOUS") r = nowTransitMoment(new Date(u), tz); // gerçek anın ofseti
      if (!r.ok) { sameFail++; console.error("    ✗", u, tz, p, r.code); continue; }
      if (r.moment.utcIso !== u) {
        const back = localParts(new Date(r.moment.utcIso), tz);
        const lmt = r.moment.offsetSeconds % 60 !== 0 && Date.parse(u) - Date.parse(r.moment.utcIso) > 0 && Date.parse(u) - Date.parse(r.moment.utcIso) < 60_000 && back.localDate === p.localDate && back.localTime === p.localTime;
        if (lmt) lmtCases++;
        else { sameFail++; console.error("    ✗", u, tz, p, r.moment.utcIso); }
        continue;
      }
      const acts = JSON.stringify(computeGeneralTransit(new Date(r.moment.utcIso)).activations.map((a) => `${a.body}:${a.gate}.${a.line}:${a.certain}`));
      if (acts !== ref0) { sameFail++; console.error("    ✗ aktivasyon farkı", u, tz); }
    }
  }
  ok(sameFail === 0, `${utcs.length} UTC anı × ${ZONES.length} bölge: yerel karşılık → aynı UTC → aynı 13 aktivasyon (hata ${sameFail}; saniyeli LMT ofsetinde dakika girişi ${lmtCases} vaka — doğru yerel dakika, <60 sn)`);

  section("E. Şimdi — iki kez yaşanan saatte gerçek an");
  const n1 = nowTransitMoment(new Date("2026-10-25T00:30:40Z"), "Europe/London");
  const n2 = nowTransitMoment(new Date("2026-10-25T01:30:10Z"), "Europe/London");
  ok(n1.ok && n1.moment.localTime === "01:30" && n1.moment.offsetSeconds === 3600 && n1.moment.utcIso === "2026-10-25T00:30:00.000Z" && n2.ok && n2.moment.localTime === "01:30" && n2.moment.offsetSeconds === 0 && n2.moment.utcIso === "2026-10-25T01:30:00.000Z", "Londra 01:30 iki kez: şimdi = ilk geçişte UTC+1, ikinci geçişte UTC+0 (gerçek ölçüm, tahmin değil)");
  const nk = nowTransitMoment(new Date("2026-10-19T22:00:00Z"), "Pacific/Kiritimati");
  ok(nk.ok && nk.moment.localDate === "2026-10-20" && nk.moment.localTime === "12:00", "Kiritimati'de şimdi: UTC 19.10 22:00 → yerel 20.10 12:00");
  ok(!nowTransitMoment(new Date(), "Mars/Olympus").ok, "geçersiz saat diliminde şimdi reddedilir");

  section("F. Owner canlı test anları × Swiss Ephemeris (bağımsız)");
  const golden = JSON.parse(readFileSync(path.join(FIX, "golden-live-moments.json"), "utf8")).results as Record<string, { utc: string; localDate: string; localTime: string; tz: string; offset: number }>;
  const se = JSON.parse(readFileSync(path.join(FIX, "swiss-ephemeris-golden-live.json"), "utf8")) as { source: string; results: Record<string, Record<string, { lon: number; gate: number; line: number; lineMarginArcsec: number }>> };
  console.log(`    referans: ${se.source}`);
  const natal = [...new Set(engineChart(PEOPLE[0]).activations.map((a: { gate: number }) => a.gate))];
  for (const [id, g] of Object.entries(golden)) {
    const m = resolveTransitMoment(g.localDate, g.localTime, g.tz);
    ok(m.ok && `${m.moment.utcIso.replace(".000Z", "Z")}` === g.utc && m.moment.offsetSeconds === g.offset, `${id} ${g.localDate} ${g.localTime} Türkiye → UTC ${g.utc} (${utcOffsetLabel(g.offset)})`, m);
    if (!m.ok) continue;
    const t = computeGeneralTransit(new Date(m.moment.utcIso));
    const truth = se.results[id];
    const wrong = t.activations.filter((a) => a.certain && (a.gate !== truth[a.body].gate || a.line !== truth[a.body].line));
    const uncertain = t.activations.filter((a) => !a.certain);
    const candidateMiss = uncertain.filter((a) => ![`${a.gate}.${a.line}`, `${a.alternative!.gate}.${a.alternative!.line}`].includes(`${truth[a.body].gate}.${truth[a.body].line}`));
    const seGates = new Set(TRANSIT_BODY_ORDER.map((b) => truth[b].gate));
    const seChannels = CHANNELS.filter((c) => seGates.has(c.gateA) && seGates.has(c.gateB));
    const seCenters = getDefinedCenters(seChannels);
    const chOk = t.channels.every((c) => seChannels.some((s) => s.id === c.id)) && seChannels.every((s) => t.channels.some((c) => c.id === s.id) || t.possibleChannels.some((c) => c.id === s.id));
    const ctOk = t.definedCenters.every((c) => seCenters.includes(c)) && seCenters.every((c) => t.definedCenters.includes(c) || t.uncertainCenters.includes(c));
    const minMargin = Math.min(...TRANSIT_BODY_ORDER.map((b) => truth[b].lineMarginArcsec));
    ok(t.activations.length === 13 && wrong.length === 0 && candidateMiss.length === 0 && chOk && ctOk,
      `${id}: 13 aktivasyon; kesin ${13 - uncertain.length} = SE (yanlış 0); belirsiz ${uncertain.length}${uncertain.length ? ` (${uncertain.map((a) => a.body).join(",")} — SE adaylarda)` : ""}; kanal ${t.channels.length} / merkez ${t.definedCenters.length} SE ile uyumlu; en yakın SE çizgi payı ${minMargin.toFixed(1)}″`,
      { wrong, candidateMiss: candidateMiss.map((a) => a.body), chOk, ctOk });
    if (!t.hasUncertainty) {
      const a = expectedOverlay(natal, t.activeGates);
      const b = expectedOverlay(natal, [...seGates]);
      ok(JSON.stringify(a) === JSON.stringify(b), `${id}: kişisel natal + transit birleşimi (kişisel ${a.personal.length} / eğitici ${a.educational.length} kanal, geçici merkez ${a.temporaryCenters.length}) = SE kapılarından türetilen`);
    } else {
      // Üretim yolu: hassas gezegen konumu (Roxy = Swiss Ephemeris; 8762/8762 ölçülmüştü). Ücretli çağrı YOK — çözücüye
      // Swiss Ephemeris boylamları Roxy yanıt biçiminde verilir; çözücünün bağımsız bant denetimi ve kapı/çizgi türetimi sınanır.
      const NAMES: Record<string, string> = { NorthNode: "North Node", SouthNode: "South Node" };
      const planets = TRANSIT_BODY_ORDER.filter((b) => b !== "Earth").map((b) => ({ name: NAMES[b] ?? b, longitude: truth[b].lon }));
      __resetTransitResolverCache();
      const rr = await resolveGeneralTransit(new Date(m.moment.utcIso), {
        config: { apiKey: "yok", baseUrl: "https://example.invalid" },
        callPlanets: async () => ({ ok: true, raw: { planets } }),
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        userId: "u",
        tenantId: "t",
      });
      const wrong2 = rr.transit.activations.filter((a) => !a.certain || a.gate !== truth[a.body].gate || a.line !== truth[a.body].line);
      const ch2 = JSON.stringify(rr.transit.channels.map((c) => c.id).sort()) === JSON.stringify(seChannels.map((c) => c.id).sort());
      const ct2 = JSON.stringify([...rr.transit.definedCenters].sort()) === JSON.stringify([...seCenters].sort());
      const a = expectedOverlay(natal, rr.transit.activeGates);
      const b = expectedOverlay(natal, [...seGates]);
      ok(rr.resolution === "roxy-resolved" && wrong2.length === 0 && ch2 && ct2 && JSON.stringify(a) === JSON.stringify(b),
        `${id}: hassas konum yolu (SE boylamı, ücretli çağrı yok) → TAM; 13/13 = SE; kanal ${rr.transit.channels.length} / merkez ${rr.transit.definedCenters.length} = SE; kişisel birleşim = SE`,
        { res: rr.resolution, wrong2: wrong2.map((x) => x.body), ch2, ct2 });
    }
  }

  console.log(`\nHD TRANSİT SAAT DİLİMİ + GOLDEN: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

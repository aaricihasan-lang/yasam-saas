/**
 * GÖKYÜZÜ ATLASI — HORARY-KP-01 (2026-10-18): KP Horary tamamlama testleri.
 *
 * Ağ YOK, gerçek Roxy YOK: tek sağlayıcı verisi depodaki gerçek golden `kp-horary.json` (2026-10-07, sayı 108, İstanbul).
 * Bağımsız referans: astronomy-engine 2.1.19 (gerçek zaman Lagna'sı) + kendi KP tablosu (verify/kpSub, 6C'de iki uygulamayla
 * çapraz denenmiş). Sahte veriyle yapılan denetim gerçek Roxy doğrulaması diye SUNULMAZ (sentetik satırlar ayrıca işaretli).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horary01.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { getTechnique, normalizeQuestionMoment, normalizeTransitMoment } from "@/lib/astrology/engine/techniques";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { kpLordCandidates, kpSpan, kpTable } from "@/lib/astrology/verify/kpSub";
import { SIGN_LORDS, type KpHoraryTechnical } from "@/lib/astrology/model/kp";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { KP_HORARY_TEXT, kpCuspSublordRows, kpHoraryLagnaContrast, kpUniqueHouses } from "@/lib/astrology/view/kpHorary";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { describeOptions, runOptionsFor } from "@/app/admin/astroloji/_lib/techniques";
import { horaryDisplayZone, momentLabel, questionMomentLabel } from "@/lib/astrology/transitDetail";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}

const ROOT = join(__dirname, "..", "..");
const HO = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "kp-horary.json"), "utf8"));
const AT = "2026-10-07T09:00";
const PLACE = { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude };
const D2R = Math.PI / 180;
const n360 = (x: number) => ((x % 360) + 360) % 360;
const def = getTechnique("kp.horary")!;
const ctx = { birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null } as J;
const horaryOf = (opts: Record<string, unknown>) => {
  const o = def.parseOptions(opts, new Date("2026-10-18T10:17:00Z"))!;
  const u = def.units(ctx, o)[0];
  return { o, u, r: def.project(u, HO.response, o) as J };
};
const HT = (): KpHoraryTechnical => horaryOf({ atUtc: AT, horaryNumber: 108 }).r.technical;

async function main() {
  // ── 1. Seçenekler / önbellek anahtarı ───────────────────────────────────────────────────────
  await t("H1 seçenek: displayTz yalnız gösterim — eski biçim {atUtc} BİREBİR korunur; tarih+saat+IANA → displayTz eklenir; istek gövdesi ve önbellek anahtarı DEĞİŞMEZ", () => {
    const old = horaryOf({ atUtc: AT, horaryNumber: 108 });
    assert.deepEqual(Object.keys(old.o).sort(), ["atUtc", "ayanamsa", "horaryNumber", "nodeType", "placeLocationId"]);
    const local = horaryOf({ date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", horaryNumber: 108 });
    assert.equal(local.o.atUtc, AT);
    assert.equal(local.o.displayTz, "Europe/Istanbul");
    assert.deepEqual(local.u.body, old.u.body);
    assert.equal(local.u.inputHash, old.u.inputHash);
    assert.deepEqual(local.u.body, HO.body, "ürün gövdesi = golden gövdesi");
    // Kayıtlı seçenek yeniden ayrıştırılınca (atUtc + displayTz) aynı kalır.
    assert.deepEqual(def.parseOptions({ ...local.o }, new Date()), local.o);
    assert.equal(def.parseOptions({ atUtc: AT, horaryNumber: 108, displayTz: "Mars/Olympus" }, new Date()), null, "geçersiz IANA");
    assert.equal(def.parseOptions({ date: "2026-10-07", time: "12:00", timezone: "Yok/Böyle", horaryNumber: 108 }, new Date()), null);
    // "Şimdi" (HORARY-P1): gerçek UTC dakika (saat başı DEĞİL); gösterim dilimi yoksa eklenmez.
    const now = def.parseOptions({ now: true, horaryNumber: 5 }, new Date("2026-10-18T10:17:00Z"))!;
    assert.equal(now.atUtc, "2026-10-18T10:17");
    assert.equal(now.displayTz, undefined);
  });

  await t("H2 saat dilimi: yaz saati, tarih değişimi, belirsiz saat — yerel an → UTC doğru; gövde UTC (timezone 0)", () => {
    const cases: [string, string, string, string][] = [
      ["2026-07-07", "12:00", "Europe/Berlin", "2026-07-07T10:00"], // CEST +2
      ["2026-01-07", "12:00", "Europe/Berlin", "2026-01-07T11:00"], // CET +1
      ["2026-10-07", "20:30", "America/Los_Angeles", "2026-10-08T03:30"], // tarih değişimi (PDT −7)
      ["2026-10-25", "02:30", "Europe/Berlin", "2026-10-25T00:30"], // belirsiz saat → ilk yaşanan (CEST)
      ["2026-10-07", "05:00", "Asia/Kolkata", "2026-10-06T23:30"], // yarım saat ofset + geri tarih
    ];
    for (const [date, time, tz, utc] of cases) {
      const { o, u } = horaryOf({ date, time, timezone: tz, horaryNumber: 1 });
      assert.equal(o.atUtc, utc, `${date} ${time} ${tz}`);
      assert.equal(o.displayTz, tz);
      assert.equal((u.body as J).timezone, 0);
      assert.equal((u.body as J).date, utc.slice(0, 10));
      assert.equal((u.body as J).time, `${utc.slice(11, 16)}:00`);
    }
  });

  // ── 2. 249 tablo ────────────────────────────────────────────────────────────────────────────
  await t("H3 249 tablo: her sayının orta noktası kendi sayısına döner; ilk/son ve komşu sınırlar; burçta bölünen 6 sub aynı yıldız+sub'ı paylaşır; dilimler boşluksuz", () => {
    const tb = kpTable();
    assert.equal(tb.length, 249);
    for (let n = 1; n <= 249; n++) {
      const sp = kpSpan(n)!;
      const c = kpLordCandidates((sp.start + sp.end) / 2, 0);
      assert.equal(c.length, 1);
      assert.equal(c[0].kpNumber, n, `orta nokta ${n}`);
      if (n > 1) assert.ok(Math.abs(kpSpan(n - 1)!.end - sp.start) < 1e-9, `boşluk ${n}`);
      // Tam başlangıç SONRAKİ dilime aittir (sınır kuralı), hemen öncesi önceki dilime.
      assert.equal(kpLordCandidates(sp.start, 0)[0].kpNumber, n);
      if (n > 1) assert.equal(kpLordCandidates(sp.start - 1e-6, 0)[0].kpNumber, n - 1);
    }
    assert.equal(kpSpan(1)!.start, 0);
    assert.ok(Math.abs(kpSpan(249)!.end - 360) < 1e-9);
    assert.equal(kpSpan(0), null);
    assert.equal(kpSpan(250), null);
    const splits = tb.filter((r, i) => i > 0 && Math.abs(r.start % 30) < 1e-9 && tb[i - 1].star === r.star && tb[i - 1].sub === r.sub);
    assert.equal(splits.length, 6, "burç sınırını kesen sub sayısı");
    // Bölünen her sub'ın iki parçası toplamı = sub genişliği (yıl oranı / 120 × 13°20′).
    const YEARS: Record<string, number> = { ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17 };
    for (const r of splits) {
      const i = tb.indexOf(r);
      const w = tb[i - 1].end - tb[i - 1].start + (r.end - r.start);
      assert.ok(Math.abs(w - ((360 / 27) * YEARS[r.sub]) / 120) < 1e-9, `parça toplamı ${r.kp}`);
    }
  });

  // ── 3. Golden: sayı → Lagna, iki Lagna ayrımı (bağımsız) ───────────────────────────────────────
  await t("H4 golden sayı 108: Lagna = KP 108 diliminin orta noktası; Başak (Merkür) · yıldız Güneş · sub Satürn = bağımsız tablo", () => {
    const h = HT();
    const sp = kpSpan(108)!;
    assert.ok(Math.abs(h.ascendant.longitude - (sp.start + sp.end) / 2) < 1e-3);
    const ind = kpLordCandidates(h.ascendant.longitude)[0];
    assert.deepEqual([h.ascendant.rashi, h.ascendant.starLord, h.ascendant.subLord, h.ascendant.kpNumber], [SIGN_IDS[Math.floor(h.ascendant.longitude / 30)], ind.star, ind.sub, 108]);
    assert.equal(SIGN_LORDS[h.ascendant.rashi], "mercury");
  });

  await t("H5 BAĞIMSIZ ruling Lagna = soru anının GERÇEK Lagna'sı (astronomy-engine: GAST + gerçek eğim; ayanamsa sağlayıcınınki) — sayının Lagna'sı DEĞİL; iki Lagna golden'da farklı", () => {
    const h = HT();
    const tm = Astronomy.MakeTime(new Date(`${AT}:00Z`));
    const eps = Astronomy.e_tilt(tm).tobl * D2R;
    const ramc = n360(Astronomy.SiderealTime(tm) * 15 + PLACE.longitude) * D2R;
    const ascTrop = n360(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(PLACE.latitude * D2R) * Math.sin(eps))) / D2R);
    const ascSid = n360(ascTrop - h.frame.ayanamsaDegrees);
    const ind = kpLordCandidates(ascSid, 0.02); // ≤0.02° tolerans: Lagna dakikada ~0.25° hareket eder
    assert.ok(
      ind.some((c) => c.star === h.ruling.lagna.star && c.sub === h.ruling.lagna.sub),
      `zaman Lagna'sı ${ascSid.toFixed(4)}° → ${JSON.stringify(ind)} ≠ ${JSON.stringify(h.ruling.lagna)}`,
    );
    assert.equal(SIGN_LORDS[SIGN_IDS[Math.floor(ascSid / 30)]], h.ruling.lagna.sign);
    const c = kpHoraryLagnaContrast(h);
    assert.equal(c.differs, true);
    assert.deepEqual([c.horary.signLord, c.horary.starLord, c.horary.subLord], ["mercury", "sun", "saturn"]);
    assert.deepEqual([c.time.sign, c.time.star, c.time.sub], [h.ruling.lagna.sign, h.ruling.lagna.star, h.ruling.lagna.sub]);
    assert.notEqual(c.time.sign, c.horary.signLord, "golden'da burç lordları farklı (Akrep/Mars ↔ Başak/Merkür)");
    // Ruling kümesi = klasik 5 öğe; sub lordlar kümeye girmez (adaptör de reddeder).
    assert.deepEqual([...h.ruling.rulingPlanets].sort(), [...new Set([h.ruling.dayLord, h.ruling.moon.sign, h.ruling.moon.star, h.ruling.lagna.sign, h.ruling.lagna.star])].sort());
  });

  await t("H6 BAĞIMSIZ gün lordu: 07.10.2026 Çarşamba, İstanbul gün doğumundan sonra → Merkür; Ay lordları = Ay boylamının bağımsız KP lordları", () => {
    const h = HT();
    const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, new Astronomy.Observer(PLACE.latitude, PLACE.longitude, 0), +1, Astronomy.MakeTime(new Date("2026-10-07T00:00:00Z")), 1)!;
    assert.ok(rise.date.getTime() < Date.parse(`${AT}:00Z`), "soru anı gün doğumundan sonra");
    assert.equal(new Date(`${AT}:00Z`).getUTCDay(), 3);
    assert.equal(h.ruling.dayLord, "mercury");
    const moon = h.bodies.find((b) => b.id === "moon")!;
    const ind = kpLordCandidates(moon.longitude)[0];
    assert.deepEqual([h.ruling.moon.sign, h.ruling.moon.star, h.ruling.moon.sub, h.ruling.moon.subSub], [SIGN_LORDS[moon.rashi], ind.star, ind.sub, ind.subSub]);
  });

  // ── 4. Cusp sub-lord tablosu ─────────────────────────────────────────────────────────────────
  await t("H7 cusp sub-lord tablosu: 12 satır; her satır = cusp sub lordu + AYNI yanıttaki significator satırı (yeniden düzenleme, yeni kural yok); görünür grahalarda 4 düzey bağımsız KP kuralıyla aynı", () => {
    const h = HT();
    const rows = kpCuspSublordRows(h);
    assert.deepEqual(rows.map((r) => r.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const occ = (hs: number) => h.bodies.filter((b) => b.house === hs).map((b) => b.id);
    const owns = (id: string) => h.cusps.filter((c) => SIGN_LORDS[c.rashi] === id).map((c) => c.house);
    for (const r of rows) {
      const cusp = h.cusps[r.house - 1];
      assert.equal(r.subLord, cusp.subLord);
      assert.equal(r.starLord, cusp.starLord);
      const p = h.significators.planets.find((x) => x.id === cusp.subLord)!;
      assert.deepEqual(r.levels, p.levels);
      if (!r.isNode) {
        const b = h.bodies.find((x) => x.id === r.subLord)!;
        const s = (xs: number[]) => [...xs].sort((a, z) => a - z);
        assert.deepEqual(
          [s(r.levels![1]), r.levels![2], s(r.levels![3]), s(r.levels![4])],
          [h.cusps.map((c) => c.house).filter((x) => occ(x).includes(b.starLord)), [b.house], owns(b.starLord), owns(b.id)],
          `cusp ${r.house} sub ${r.subLord}`,
        );
        assert.equal(r.agent, null);
      } else assert.ok(r.agent, "düğüm sub lordunda ajan ekli liste taşınır");
    }
    assert.deepEqual(kpUniqueHouses({ 1: [2, 7], 2: [7], 3: [11], 4: [] }), [2, 7, 11]);
    assert.deepEqual(kpUniqueHouses(null), []);
  });

  await t("H8 SENTETİK (gerçek Roxy değil): sub lord düğüm olan cusp → ajan ekli evler '+' ile ayrı; significator satırı yoksa 'veri yok' (uydurulmaz)", () => {
    const h = structuredClone(HT());
    h.cusps[6] = { ...h.cusps[6], subLord: "rahu" };
    const rows = kpCuspSublordRows(h);
    assert.equal(rows[6].isNode, true);
    assert.ok(rows[6].agent && rows[6].agent.houses.length > 0);
    h.significators.planets = h.significators.planets.filter((p) => p.id !== h.cusps[0].subLord);
    assert.equal(kpCuspSublordRows(h)[0].levels, null);
  });

  // ── 5. Rapor (Word = PDF = ekran verisi) ──────────────────────────────────────────────────────
  const input = (params: Record<string, unknown>): ReportAnalysisInput => ({
    id: "00000000-0000-4000-8000-000000000108",
    title: "Horary test",
    technique: "kp.horary",
    params,
    analysisAt: "2026-10-07T09:05:00Z",
    method: {},
    technical: HT(),
  });
  const fontB64 = readFileSync(join(ROOT, "public", "fonts", "Geist-Regular.ttf")).toString("base64");
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const docxText = async (buf: Buffer) => {
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
  };
  const pdfText = async (u8: Uint8Array) => (await extractText(await getDocumentProxy(u8), { mergePages: true })).text as string;

  await t("H9 rapor modeli: yerel soru anı esas + UTC parantezde (HORARY-P2), iki Lagna, ruling ayrıntısı, cusp sub-lord tablosu (12 satır = ekran yardımcısı), yöntem metni; dilimi olmayan eski kayıt UTC + açıklayıcı not", () => {
    const r = buildAstroReport(input({ atUtc: AT, horaryNumber: 108, displayTz: "Europe/Istanbul", place: { label: "İstanbul" } }));
    const all = reportTexts(r).join("\n");
    for (const m of ["Soru anı", "07.10.2026 12:00 — Türkiye saati, GMT+3 (09:00 UTC)", "Soru anı (UTC)", "07.10.2026 09:00 UTC", "Horary Lagna (sayıdan)", "Soru anı Lagna'sı (zaman) lordları", "Cusp sub lordları ve gösterdikleri evler", "Değerlendirme yeri", KP_HORARY_TEXT.rulingRule, KP_HORARY_TEXT.source]) assert.ok(all.includes(m), `yok: ${m}`);
    const tb = r.blocks.find((b) => b.kind === "table" && b.table.columns[1] === "Sub lord") as J;
    assert.ok(tb);
    const rows = kpCuspSublordRows(HT());
    assert.equal(tb.table.rows.length, 12);
    // Gerçek golden'da 5. cusp'ın sub lordu bir düğüm → ajan ekli evler "+" ile ayrı yazılır (ekranla aynı biçim).
    assert.ok(rows.some((x) => x.isNode), "golden'da düğüm sub lordu var");
    rows.forEach((x, i) =>
      [1, 2, 3, 4].forEach((l) => {
        const plain = x.levels![l as 1];
        const extra = x.agent ? x.agent.levels[l as 1].filter((h) => !plain.includes(h)) : [];
        assert.equal(tb.table.rows[i][1 + l], `${plain.join(", ") || "—"}${extra.length ? ` +${extra.join(", ")}` : ""}`, `L${l} satır ${i + 1}`);
      }),
    );
    const old = reportTexts(buildAstroReport(input({ atUtc: AT, horaryNumber: 108 }))).join("\n");
    // Dilimi doğrulanamayan eski kayıt (displayTz yok, place.timezone yok): UTC + not; GMT+3 VARSAYILMAZ.
    assert.ok(old.includes("07.10.2026 09:00 UTC (yerel saat dilimi doğrulanamadı; UTC gösteriliyor)"));
    assert.ok(!old.includes("GMT+3"));
  });

  await t("H10 Word = PDF: iki çıktı aynı horary satırlarını taşır (yerel an, zaman Lagna'sı lordları, 12 cusp sub lordu)", async () => {
    const r = buildAstroReport(input({ atUtc: AT, horaryNumber: 108, displayTz: "Europe/Istanbul" }));
    const docx = norm(await docxText(await renderAstroReportDocx(r, null, symbolFontBuffers())));
    const pdf = norm(await pdfText(buildAstroReportPdf(r, null, fontB64, symbolFontsBase64())));
    for (const m of ["Soru anı", "07.10.2026 12:00 — Türkiye saati, GMT+3 (09:00 UTC)", "Cusp sub lordları ve gösterdikleri evler", "Horary Lagna (sayıdan)"]) {
      assert.ok(docx.includes(m), `Word: ${m}`);
      assert.ok(pdf.includes(m), `PDF: ${m}`);
    }
  });

  await t("H11 özet satırı (HORARY-P2): yerel saat esas + UTC parantezde; dilim yoksa UTC + not", () => {
    assert.equal(describeOptions("kp.horary", { horaryNumber: 108, atUtc: "2026-10-07T09:00", place: { label: "İstanbul" } }), "sayı 108 · 07.10.2026 09:00 UTC (yerel saat dilimi doğrulanamadı; UTC gösteriliyor) · İstanbul");
    assert.equal(describeOptions("kp.horary", { horaryNumber: 108, atUtc: "2026-10-07T09:00", displayTz: "Europe/Istanbul", place: { label: "İstanbul" } }), "sayı 108 · 07.10.2026 12:00 — Türkiye saati, GMT+3 (09:00 UTC) · İstanbul");
  });

  // ── HORARY-P1 (2026-10-18): "Şimdi" = gerçek soru anı (UTC dakika; saat başı DEĞİL) — yalnız kp.horary ───────────
  const nowOpts = (iso: string, extra: Record<string, unknown> = {}) => def.parseOptions({ now: true, horaryNumber: 108, ...extra }, new Date(iso))!;
  const unitAt = (iso: string) => def.units(ctx, nowOpts(iso))[0];

  await t("P1-1…4 şimdi → UTC dakika: 17:18:42 → 17:18 · 17:59:59 → 17:59 · 18:00:01 → 18:00 · gece yarısı / yıl değişimi; gövde tarih+saat aynı dakika", () => {
    const cases: [string, string][] = [
      ["2026-10-18T17:18:42.000Z", "2026-10-18T17:18"],
      ["2026-10-18T17:59:59.999Z", "2026-10-18T17:59"],
      ["2026-10-18T18:00:01.000Z", "2026-10-18T18:00"],
      ["2026-10-18T23:59:59.000Z", "2026-10-18T23:59"],
      ["2026-10-19T00:00:30.000Z", "2026-10-19T00:00"],
      ["2026-12-31T23:59:30.000Z", "2026-12-31T23:59"],
      ["2027-01-01T00:00:59.000Z", "2027-01-01T00:00"],
    ];
    for (const [iso, want] of cases) {
      const o = nowOpts(iso);
      assert.equal(o.atUtc, want, iso);
      assert.equal(o.now, undefined, "normalize seçenekte 'now' kalmaz (kayıt UTC dakikayı taşır)");
      assert.equal(o.displayTz, undefined);
      const b = def.units(ctx, o)[0].body as J;
      assert.deepEqual([b.date, b.time, b.timezone], [want.slice(0, 10), `${want.slice(11, 16)}:00`, 0], iso);
    }
    // Önceki hata örneği: 20:18 TR (17:18 UTC) artık 17:00'ye düşmez.
    assert.notEqual(nowOpts("2026-10-18T17:18:42Z").atUtc, "2026-10-18T17:00");
  });

  await t("P1-5/6 önbellek: farklı dakika → farklı istek zamanı + farklı anahtar (17:18 ≠ 17:19); aynı dakika (farklı saniye) → aynı an + aynı anahtar", () => {
    const a = unitAt("2026-10-18T17:18:05Z");
    const b = unitAt("2026-10-18T17:18:59Z");
    const c = unitAt("2026-10-18T17:19:00Z");
    assert.deepEqual(a.body, b.body);
    assert.equal(a.inputHash, b.inputHash);
    assert.notEqual((a.body as J).time, (c.body as J).time);
    assert.notEqual(a.inputHash, c.inputHash);
    // Şimdi ile aynı dakikanın elle girilmiş UTC anı aynı anahtardır (tek önbellek).
    assert.equal(def.units(ctx, def.parseOptions({ atUtc: "2026-10-18T17:18", horaryNumber: 108 }, new Date())!)[0].inputHash, a.inputHash);
  });

  await t("P1-7/8 elle tarih-saat ve eski kayıtlar DEĞİŞMEZ: 07.10.2026 12:00 Europe/Istanbul → 09:00 UTC (golden 108); kayıtlı atUtc hangi 'şimdi'de açılırsa açılsın yeniden hesaplanmaz", () => {
    const m = horaryOf({ date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", horaryNumber: 108 });
    assert.equal(m.o.atUtc, AT);
    assert.deepEqual(m.u.body, HO.body);
    assert.equal(m.r.ok, true, "golden projeksiyon temiz");
    for (const saved of [{ atUtc: "2026-10-07T09:00", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null }, { atUtc: "2026-10-18T17:00", horaryNumber: 5, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null }]) {
      assert.deepEqual(def.parseOptions(saved, new Date("2026-10-19T06:42:17Z")), saved, `eski kayıt ${saved.atUtc}`);
    }
  });

  await t("P1-9/10 diğer teknikler DEĞİŞMEDİ: KP transit, KP ruling, Batı transit, Vedik Gochara 'şimdi' → hâlâ UTC saat başı (17:18:42 → 17:00)", () => {
    const at = new Date("2026-10-18T17:18:42Z");
    const want = "2026-10-18T17:00";
    assert.equal(normalizeTransitMoment({ now: true }, at), want);
    assert.equal(getTechnique("kp.transit")!.parseOptions({ now: true, ayanamsa: "kp-newcomb", nodeType: "mean" }, at)!.atUtc, want);
    assert.equal(getTechnique("kp.ruling")!.parseOptions({ now: true, nodeType: "mean" }, at)!.atUtc, want);
    assert.equal(getTechnique("western.transit")!.parseOptions({ now: true, nodeType: "true" }, at)!.atUtc, want);
    assert.equal(getTechnique("vedic.transit")!.parseOptions({ now: true, ayanamsa: "lahiri" }, at)!.atUtc, want);
    // Yalnız horary dakika hassasiyetinde.
    assert.equal(normalizeQuestionMoment({ now: true }, at), "2026-10-18T17:18");
    assert.equal(normalizeQuestionMoment({ atUtc: "2026-10-07T09:00" }, at), "2026-10-07T09:00");
  });

  await t("P1-UI başlatma anı: KP horary + şimdi → ham { now: true } gönderilir (sunucu dakikayı başlatırken alır); horary elle an, KP transit / ruling / Batı transit şimdi → planın normalize seçeneği (eski davranış)", () => {
    const raw = { now: true, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null };
    const planned = { ...raw, now: undefined, atUtc: "2026-10-18T17:00" };
    assert.equal(runOptionsFor("kp.horary", planned, raw), raw);
    const manual = { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", horaryNumber: 108 };
    const manualPlanned = { horaryNumber: 108, atUtc: AT, displayTz: "Europe/Istanbul" };
    assert.equal(runOptionsFor("kp.horary", manualPlanned, manual), manualPlanned);
    for (const tech of ["kp.transit", "kp.ruling", "western.transit", "vedic.transit"]) {
      const p = { atUtc: "2026-10-18T17:00" };
      assert.equal(runOptionsFor(tech, p, { now: true }), p, tech);
    }
    assert.equal(runOptionsFor("kp.horary", null, raw), raw);
    assert.equal(describeOptions("kp.horary", { now: true, horaryNumber: 108 }), "sayı 108 · şimdi (gerçek soru anı)");
  });

  await t("P1-11 UÇTAN UCA (motor + kayıt + rapor; SENTETİK sağlayıcı yankısı, gerçek Roxy YOK): sunucu saati 17:18:42 → istek 17:18:00, teknik + kayıt + ekran özeti + Word + PDF aynı 18.10.2026 17:18 UTC; aynı dakikada tekrar 0 istek, 17:19'da yeni istek", async () => {
    const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
    const CLIENT_X = "44444444-4444-4444-8444-444444444444";
    const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
    const store = createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
    const ectx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
    const pr = await createAstroProfile(ectx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
    assert.equal(pr.status, 201);
    const pid = (pr.body as J).profile.id as string;
    let clock = new Date("2026-10-18T17:18:42.000Z");
    const calls: J[] = [];
    const deps: EngineDeps = {
      config: { apiKey: "k-test-p1", baseUrl: "https://roxy-fake.local/api/v2" },
      now: () => clock,
      callProvider: async (_c, endpoint, body) => {
        calls.push(body);
        if (endpoint !== HO.endpoint) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        const r = structuredClone(HO.response);
        r.questionTime = `${String(body.date)}T${String(body.time)}.000Z`; // SENTETİK yankı: yalnız soru anı (golden 108 gövdesi aynı)
        return { ok: true, raw: r, attempts: 1 };
      },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    };
    const sel = { technique: "kp.horary", options: { now: true, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } };
    const res = ((await runAstrology(ectx, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false })).body as J).results[0];
    assert.equal(res.ok, true, JSON.stringify(res).slice(0, 300));
    assert.equal(calls.length, 1);
    assert.deepEqual([calls[0].date, calls[0].time, calls[0].timezone], ["2026-10-18", "17:18:00", 0]);
    assert.equal(res.view.options.atUtc, "2026-10-18T17:18");
    assert.equal(res.view.technical.at.utc, "2026-10-18T17:18");
    // Aynı dakika (17:18:59) → önbellek; 17:19:05 → yeni istek.
    clock = new Date("2026-10-18T17:18:59.000Z");
    await runAstrology(ectx, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false });
    assert.equal(calls.length, 1, "aynı dakika tekrar istek üretmemeli");
    clock = new Date("2026-10-19T08:00:00.000Z");
    // Kayıt: arayüz gibi sonuç görünümünün seçeneği kaydedilir (atUtc) → kayıt anındaki saat önemsizdir.
    const sv = await saveAnalysis(ectx, { profileId: pid, revision: 1, technique: "kp.horary", options: res.view.options, includeProviderInterp: false, saveRequestId: "11111111-2222-4333-8444-555555555555" }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ectx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(a.params.atUtc, "2026-10-18T17:18");
    assert.equal(a.technical.at.utc, "2026-10-18T17:18");
    assert.equal(calls.length, 1, "kayıt / açma sağlayıcı çağırmaz");
    // HORARY-P2: "şimdi"de displayTz yok → dilim, sunucunun çözdüğü değerlendirme yeri (İstanbul) saat dilimi.
    const LOCAL = "18.10.2026 20:18 — Türkiye saati, GMT+3 (17:18 UTC)";
    assert.equal(a.params.place.timezone, "Europe/Istanbul");
    assert.equal(describeOptions("kp.horary", a.params), `sayı 108 · ${LOCAL} · İstanbul, Türkiye`);
    assert.equal(describeOptions("kp.horary", res.view.options), describeOptions("kp.horary", a.params), "yeni sonuç = kayıtlı analiz");
    assert.equal(questionMomentLabel(a.technical.at.utc, horaryDisplayZone(a.params)), LOCAL, "panel etiketi");
    const rep = buildAstroReport(a);
    assert.ok(reportTexts(rep).join("\n").includes("18.10.2026 17:18 UTC"), "rapor modeli");
    const docx = norm(await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers())));
    const pdf = norm(await pdfText(buildAstroReportPdf(rep, null, fontB64, symbolFontsBase64())));
    assert.ok(docx.includes("18.10.2026 17:18 UTC"), "Word");
    assert.ok(pdf.includes("18.10.2026 17:18 UTC"), "PDF");
    assert.ok(reportTexts(rep).join("\n").includes(LOCAL) && docx.includes(LOCAL) && pdf.includes(LOCAL), "rapor/Word/PDF yerel soru anı");
    assert.ok(!docx.includes("17:00 UTC") && !pdf.includes("17:00 UTC"), "saat başı izi yok");
    clock = new Date("2026-10-18T17:19:05.000Z");
    const r2 = ((await runAstrology(ectx, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false })).body as J).results[0];
    assert.equal(calls.length, 2);
    assert.equal(calls[1].time, "17:19:00");
    assert.equal(r2.view.options.atUtc, "2026-10-18T17:19");
  });

  // ── HORARY-P2 (2026-10-18): soru anı GÖSTERİMİ — yerel saat esas, UTC parantezde (hesap / gövde / anahtar DEĞİŞMEZ) ─────
  const IST = { label: "İstanbul, Türkiye", latitude: 41.0082, longitude: 28.9784, timezone: "Europe/Istanbul", locationId: "tr-34-istanbul" };
  const qm = (iso: string, tz: string | null) => questionMomentLabel(iso, tz);

  await t("P2-1/2 18.10.2026 18:35 UTC → İstanbul 21:35 GMT+3: özet satırı, panel etiketi, rapor modeli (kapak + teknik), Word ve PDF AYNI metin", async () => {
    const opts: Record<string, unknown> = { ...nowOpts("2026-10-18T18:35:20Z"), place: IST };
    assert.equal(opts.atUtc, "2026-10-18T18:35");
    assert.equal(opts.displayTz, undefined, "şimdi: seçenekte displayTz yok → dilim değerlendirme yerinden");
    const L = "18.10.2026 21:35 — Türkiye saati, GMT+3 (18:35 UTC)";
    assert.equal(horaryDisplayZone(opts), "Europe/Istanbul");
    assert.equal(describeOptions("kp.horary", opts), `sayı 108 · ${L} · İstanbul, Türkiye`);
    assert.equal(qm("2026-10-18T18:35", horaryDisplayZone(opts)), L);
    const base = input(opts) as J;
    const rep = buildAstroReport({ ...base, technical: { ...base.technical, at: { ...base.technical.at, utc: "2026-10-18T18:35" } } });
    const txt = reportTexts(rep).join("\n");
    assert.ok(txt.split(L).length - 1 >= 2, "kapak/seçenek özeti VE teknik 'Soru anı' satırı");
    const docx = norm(await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers())));
    const pdf = norm(await pdfText(buildAstroReportPdf(rep, null, fontB64, symbolFontsBase64())));
    assert.ok(docx.includes(L), "Word");
    assert.ok(pdf.includes(L), "PDF");
  });

  await t("P2-3 golden 108: 07.10.2026 12:00 Europe/Istanbul → 09:00 UTC; gövde golden'la BİREBİR, projeksiyon temiz; gösterim 12:00 Türkiye saati", () => {
    const m = horaryOf({ date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", horaryNumber: 108 });
    assert.equal(m.o.atUtc, AT);
    assert.deepEqual(m.u.body, HO.body);
    assert.equal(m.r.ok, true);
    assert.equal(qm(AT, horaryDisplayZone(m.o)), "07.10.2026 12:00 — Türkiye saati, GMT+3 (09:00 UTC)");
  });

  await t("P2-4 Türkiye geçmiş yaz/kış saati: 2015 kış GMT+2, 2015 yaz GMT+3, 1990 kış GMT+2, 2016 sonrası sürekli GMT+3", () => {
    assert.equal(qm("2015-01-15T12:00", "Europe/Istanbul"), "15.01.2015 14:00 — Türkiye saati, GMT+2 (12:00 UTC)");
    assert.equal(qm("2015-07-15T12:00", "Europe/Istanbul"), "15.07.2015 15:00 — Türkiye saati, GMT+3 (12:00 UTC)");
    assert.equal(qm("1990-01-15T12:00", "Europe/Istanbul"), "15.01.1990 14:00 — Türkiye saati, GMT+2 (12:00 UTC)");
    assert.equal(qm("2017-01-15T12:00", "Europe/Istanbul"), "15.01.2017 15:00 — Türkiye saati, GMT+3 (12:00 UTC)");
  });

  await t("P2-5 Europe/Berlin: kış GMT+1, yaz GMT+2; 25.10.2026 belirsiz 02:30 iki ayrı UTC anı ofsetle ayırt edilir; 29.03.2026 ileri sıçrama; elle girişte etiket = girilen yerel saat + atUtc", () => {
    assert.equal(qm("2026-01-15T12:00", "Europe/Berlin"), "15.01.2026 13:00 — Europe/Berlin, GMT+1 (12:00 UTC)");
    assert.equal(qm("2026-07-15T12:00", "Europe/Berlin"), "15.07.2026 14:00 — Europe/Berlin, GMT+2 (12:00 UTC)");
    assert.equal(qm("2026-10-25T00:30", "Europe/Berlin"), "25.10.2026 02:30 — Europe/Berlin, GMT+2 (00:30 UTC)");
    assert.equal(qm("2026-10-25T01:30", "Europe/Berlin"), "25.10.2026 02:30 — Europe/Berlin, GMT+1 (01:30 UTC)");
    assert.equal(qm("2026-03-29T00:59", "Europe/Berlin"), "29.03.2026 01:59 — Europe/Berlin, GMT+1 (00:59 UTC)");
    assert.equal(qm("2026-03-29T01:00", "Europe/Berlin"), "29.03.2026 03:00 — Europe/Berlin, GMT+2 (01:00 UTC)");
    for (const [date, time] of [["2026-10-25", "02:30"], ["2026-07-15", "14:00"], ["2026-01-15", "13:00"]]) {
      const o = def.parseOptions({ date, time, timezone: "Europe/Berlin", horaryNumber: 108 }, new Date())!;
      assert.ok(o, `${date} ${time}`);
      assert.equal(o.displayTz, "Europe/Berlin");
      const lbl = qm(String(o.atUtc), horaryDisplayZone(o));
      assert.ok(lbl.startsWith(`${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)} ${time} — Europe/Berlin, GMT+`), lbl);
      assert.ok(lbl.endsWith(`(${String(o.atUtc).slice(11, 16)} UTC)`), lbl);
    }
  });

  await t("P2-6 yerel tarih ≠ UTC tarihi → parantezde UTC tarihi de yazılır (İstanbul gece yarısı sonrası, yıl değişimi, New York akşamı)", () => {
    assert.equal(qm("2026-10-18T22:30", "Europe/Istanbul"), "19.10.2026 01:30 — Türkiye saati, GMT+3 (18.10.2026 22:30 UTC)");
    assert.equal(qm("2026-12-31T22:15", "Europe/Istanbul"), "01.01.2027 01:15 — Türkiye saati, GMT+3 (31.12.2026 22:15 UTC)");
    assert.equal(qm("2026-10-19T02:00", "America/New_York"), "18.10.2026 22:00 — America/New_York, GMT-4 (19.10.2026 02:00 UTC)");
  });

  await t("P2-7 elle tarih/saat: kullanıcının seçtiği dilim (displayTz) değerlendirme yerinin diliminden ÖNCE gelir; seçenek, gövde ve anahtar DEĞİŞMEZ", () => {
    const o = def.parseOptions({ date: "2026-10-18", time: "20:35", timezone: "Europe/Berlin", horaryNumber: 108 }, new Date())!;
    assert.deepEqual(o, { horaryNumber: 108, atUtc: "2026-10-18T18:35", ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null, displayTz: "Europe/Berlin" });
    const withPlace = { ...o, place: IST };
    assert.equal(horaryDisplayZone(withPlace), "Europe/Berlin");
    assert.equal(describeOptions("kp.horary", withPlace), "sayı 108 · 18.10.2026 20:35 — Europe/Berlin, GMT+2 (18:35 UTC) · İstanbul, Türkiye");
    const bare: Record<string, unknown> = { ...o };
    delete bare.displayTz;
    assert.equal(def.units(ctx, o)[0].inputHash, def.units(ctx, bare)[0].inputHash, "gösterim dilimi önbellek anahtarına girmez");
    assert.deepEqual(def.units(ctx, o)[0].body, def.units(ctx, bare)[0].body);
  });

  await t("P2-8 eski kayıtlar: displayTz yoksa kayıtlı place.timezone; o da yok / geçersizse UTC + not (GMT+3 / tarayıcı saati VARSAYILMAZ); parseOptions kaydı aynen döndürür (yeniden hesap yok)", () => {
    const saved = { atUtc: "2026-10-18T18:35", horaryNumber: 5, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null };
    assert.deepEqual(def.parseOptions(saved, new Date("2027-01-01T00:00:00Z")), saved);
    const local = "18.10.2026 21:35 — Türkiye saati, GMT+3 (18:35 UTC)";
    assert.equal(describeOptions("kp.horary", { ...saved, place: IST }), `sayı 5 · ${local} · İstanbul, Türkiye`);
    const unv = "18.10.2026 18:35 UTC (yerel saat dilimi doğrulanamadı; UTC gösteriliyor)";
    assert.equal(describeOptions("kp.horary", saved), `sayı 5 · ${unv}`);
    assert.equal(describeOptions("kp.horary", { ...saved, place: { label: "X", timezone: "Mars/Olympus" } }), `sayı 5 · ${unv} · X`);
    assert.equal(describeOptions("kp.horary", { ...saved, displayTz: "Yok/Böyle", place: IST }), `sayı 5 · ${local} · İstanbul, Türkiye`, "geçersiz displayTz → yer dilimi");
    assert.equal(horaryDisplayZone(null), null);
    assert.equal(qm("2026-10-18T18:35", "UTC"), "18.10.2026 18:35 UTC", "açıkça UTC dilimi → notsuz UTC");
  });

  await t("P2-9 değişmeyenler: normalizeQuestionMoment / normalizeTransitMoment ve transit momentLabel metni aynı", () => {
    const at = new Date("2026-10-18T18:35:20Z");
    assert.equal(normalizeQuestionMoment({ now: true }, at), "2026-10-18T18:35");
    assert.equal(normalizeTransitMoment({ now: true }, at), "2026-10-18T18:00");
    assert.equal(momentLabel("2026-10-17T09:00", "Europe/Istanbul"), "17.10.2026 12:00 (GMT+3, Europe/Istanbul) · 17.10.2026 09:00 UTC");
    assert.equal(momentLabel("2026-10-17T09:00", null), "17.10.2026 09:00 UTC");
  });

  console.log(`\nastrology horary01 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});

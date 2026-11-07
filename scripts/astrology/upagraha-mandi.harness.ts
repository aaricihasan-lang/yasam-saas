/**
 * ATL-B01 F1 (07.11.2026) — Mandi: klasik ghati tablosu (Uttara Kalamrita şl. 7 · Phaladeepika 25. bölüm şl. 2; gece tablosu Prasna Marga ile aynı).
 * Ağ / sağlayıcı çağrısı YOK. Fixture'lar (scripts/astrology/fixtures/kala-vela/, sentetik kişiler):
 *   • mandi-klasik-ref.json — 687 vaka (07.11 canlı production 35 + denetim-200'ün Mandi'li 198'i + yeni-454) için BAĞIMSIZ klasik Mandi
 *     referansı: ÜRÜN KODU KULLANILMADAN üretildi (QA C:/YasamSistemi-QA/ATL-B01-CANLI-2026-11-07/GENISLETILMIS-DENETIM/F1-MANDI-DENETIMI/
 *     uygulama/klasik_mandi_ref.py): gün doğumu/batımı Swiss Ephemeris (üst kenar + standart kırılma), yükselen NASA/JPL DE440 + Skyfield
 *     (gerçek Lahiri) ve ikinci zincir Swiss houses_ex (SIDM_LAHIRI). Canlı + denetim vakalarında eski servis Mandi'si de vardır.
 *   • onceki-surum-ciktisi.json — düzeltme ÖNCESİ (main 56014b7d) ürün çıktısının donmuş görüntüsü (denetim-200 + 5 golden): diğer 10 nokta
 *     ve bütün alanların DEĞİŞMEDİĞİNİN kanıtı (regresyon; referans değildir).
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyBphsKalaVela, applyClassicalMandi, computeKalaVela, MANDI_GHATI_DAY, MANDI_GHATI_NIGHT, tropicalAscendant } from "@/lib/astrology/engine/upagrahaKalaVela";
import { vedicUpagraha } from "@/lib/astrology/engine/vedicNoktaTechniques";
import { NAKSHATRAS } from "@/lib/astrology/model/vedic";
import {
  UPAGRAHA_LEGACY_ORDER_NOTE,
  UPAGRAHA_MANDI_BASIS_ESKI,
  UPAGRAHA_MANDI_BASIS_KLASIK,
  UPAGRAHA_SCHOOL_NOTE,
  UPAGRAHA_SCHOOL_NOTE_BPHS,
  UPAGRAHA_SCHOOL_NOTE_KLASIK,
  UPAGRAHA_SYSTEMS_NOTE,
  UPAGRAHA_SYSTEMS_NOTE_LEGACY,
  isClassicalMandi,
  upagrahaBasis,
  upagrahaSchoolNote,
  upagrahaSystemsNote,
  type VedicUpagrahaTechnical,
} from "@/lib/astrology/model/vedicNoktalar";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VedicUpagrahaPanel } from "@/app/admin/astroloji/_components/VedicNoktalarPanels";
import { vedicNoktaReport } from "@/lib/astrology/report/vedicNoktalarReport";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
const FX = path.join(__dirname, "fixtures", "kala-vela");
const dang = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const jdMs = (jd: number) => (jd - 2440587.5) * 86400_000;
const PREC = 50.29 / 3600 / 365.25;
/** Önceden sabitlenen ATL-B01 ölçütleri (DEĞİŞTİRİLMEDİ): |enlem| < 58° boylam ≤ 0,05°; her enlemde an ≤ 10 sn ve AYNI anda yükselen ≤ 0,01°. */
const REF_TOL = 0.05;
const START_TOL_S = 10;
const ASC_TOL = 0.01;

type RefCase = {
  id: string;
  kaynak: string;
  date: string;
  time: string;
  offsetHours: number;
  latitude: number;
  longitude: number;
  ayanamsaDegrees: number;
  eskiServisMandi: number | null;
  ref: { isDay: boolean; weekday: number; ghati: number; segmentStartJd: number; segmentEndJd: number; atJd: number; mandiDE440: number; mandiSwiss: number; degPerSec: number };
};
const REF: RefCase[] = JSON.parse(fs.readFileSync(path.join(FX, "mandi-klasik-ref.json"), "utf8")).vakalar;
const kOf = (c: RefCase) => computeKalaVela({ date: c.date, time: c.time, offsetHours: c.offsetHours, latitude: c.latitude, longitude: c.longitude, ayanamsaDegrees: c.ayanamsaDegrees });
const birthMs = (c: RefCase) => Date.UTC(+c.date.slice(0, 4), +c.date.slice(5, 7) - 1, +c.date.slice(8, 10), +c.time.slice(0, 2), +c.time.slice(3, 5), +(c.time.slice(6, 8) || 0)) - c.offsetHours * 3600_000;

// ─── 1 · Kaynak ve tanım ───────────────────────────────────────────────────────────────────────────────────────────
t("kaynak: gündüz 26/22/18/14/10/6/2 (UK şl. 7 · Phaladeepika 25.2), gece 10/6/2/26/22/18/14 (Phaladeepika 25.2 · Prasna Marga), Pazar'dan", () => {
  assert.deepEqual([...MANDI_GHATI_DAY], [26, 22, 18, 14, 10, 6, 2]);
  assert.deepEqual([...MANDI_GHATI_NIGHT], [10, 6, 2, 26, 22, 18, 14]);
});

t("tanım: 687 vakada an = bölüm başı + ghati/30 × bölüm süresi; an 7 gün × gündüz/gece için Satürn parçasının İÇİNDE (başlangıcı değil)", () => {
  const combos = new Set<string>();
  let n = 0;
  for (const c of REF) {
    const k = kOf(c);
    assert.ok(k.ok, c.id);
    if (!k.ok) continue;
    const st = Date.parse(k.segmentStartUtc);
    const en = Date.parse(k.segmentEndUtc);
    const g = (k.isDay ? MANDI_GHATI_DAY : MANDI_GHATI_NIGHT)[k.weekday];
    assert.equal(k.mandi.ghati, g, c.id);
    assert.ok(Math.abs(Date.parse(k.mandi.atUtc) - (st + (g / 30) * (en - st))) <= 1, `${c.id} an`);
    const sat = Date.parse(k.points.gulika.startUtc);
    const len = (en - st) / 8;
    const at = Date.parse(k.mandi.atUtc);
    assert.ok(at > sat && at <= sat + len + 1, `${c.id}: Mandi anı Satürn parçasında değil`);
    combos.add(`${k.weekday}${k.isDay ? "G" : "N"}`);
    n++;
  }
  console.log(`     ${n} vaka · gün × gündüz/gece ${combos.size}/14`);
  assert.equal(n, REF.length);
  assert.equal(combos.size, 14);
});

// ─── 2 · Bağımsız klasik referans (DE440 / Swiss) ──────────────────────────────────────────────────────────────────
t("bağımsız referans: 687 vaka · gündüz/gece, Vedik gün, ghati eşit; an ≤ 10 sn ve aynı anda yükselen ≤ 0,01° (her enlem); |enlem| < 58° boylam ≤ 0,05° (DE440 ve Swiss)", () => {
  const bad: string[] = [];
  const by = new Map<string, { n: number; ok: number }>();
  const mx = { dt: 0, asc: 0, low: 0, lowSw: 0, high: 0 };
  let high = 0;
  for (const c of REF) {
    const k = kOf(c);
    const cat = c.kaynak.split("/")[0] === "yeni-454" ? c.kaynak : c.kaynak.split(" ")[0];
    const s = by.get(cat) ?? { n: 0, ok: 0 };
    s.n++;
    let good = k.ok && k.isDay === c.ref.isDay && k.weekday === c.ref.weekday && k.ok && k.mandi.ghati === c.ref.ghati;
    if (k.ok) {
      const refAt = jdMs(c.ref.atJd);
      const dt = Math.abs(Date.parse(k.mandi.atUtc) - refAt) / 1000;
      const ay = c.ayanamsaDegrees + ((refAt - birthMs(c)) / 86400_000) * PREC;
      const asc = Math.abs(dang(tropicalAscendant(refAt, c.latitude, c.longitude) - ay, c.ref.mandiDE440));
      const dl = Math.abs(dang(k.mandi.longitude, c.ref.mandiDE440));
      const dlSw = Math.abs(dang(k.mandi.longitude, c.ref.mandiSwiss));
      const low = Math.abs(c.latitude) < 58;
      mx.dt = Math.max(mx.dt, dt);
      mx.asc = Math.max(mx.asc, asc);
      if (low) {
        mx.low = Math.max(mx.low, dl);
        mx.lowSw = Math.max(mx.lowSw, dlSw);
      } else {
        high++;
        mx.high = Math.max(mx.high, dl);
      }
      if (dt > START_TOL_S || asc > ASC_TOL || (low && (dl > REF_TOL || dlSw > REF_TOL))) {
        good = false;
        bad.push(`${c.id} ${dt.toFixed(1)}sn ${asc.toFixed(4)}° ${dl.toFixed(4)}°`);
      }
    }
    if (good) s.ok++;
    else if (!bad.some((b) => b.startsWith(c.id))) bad.push(c.id);
    by.set(cat, s);
  }
  console.log(`     ${[...by].map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(" · ")}`);
  console.log(`     en büyük: an ${mx.dt.toFixed(1)} sn · aynı anda yükselen ${mx.asc.toFixed(4)}° · boylam |enlem|<58° DE440 ${mx.low.toFixed(4)}° Swiss ${mx.lowSw.toFixed(4)}° · |enlem|≥58° (${high} vaka) ${mx.high.toFixed(4)}°`);
  assert.deepEqual(bad, []);
});

t("Vedik gün: gün doğumundan ÖNCE doğanlar önceki günün gecesine ait (takvim günü ≠ Vedik gün); hepsi referansla eşit", () => {
  let n = 0;
  for (const c of REF) {
    const k = kOf(c);
    if (!k.ok) continue;
    const calDay = new Date(Date.UTC(+c.date.slice(0, 4), +c.date.slice(5, 7) - 1, +c.date.slice(8, 10))).getUTCDay();
    if (calDay === k.weekday) continue;
    n++;
    assert.equal(k.isDay, false, `${c.id}: takvim günü farklıysa gece doğumu olmalı`);
    assert.equal(k.weekday, (calDay + 6) % 7, `${c.id}: önceki gün`);
    assert.equal(k.weekday, c.ref.weekday, c.id);
  }
  console.log(`     gün doğumundan önceki doğum ${n} vaka`);
  assert.ok(n >= 30, `en az 30 vaka beklenir (${n})`);
});

// ─── 3 · Eski servis Mandi'si (eski kayıtların değeri) ─────────────────────────────────────────────────────────────
t("eski Mandi (233 gerçek servis sonucu): klasik değerden FARKLI; eski değer = klasik andan gün/gece süresinin 1/8'i ÖNCE yükselen derece (eski kural açıklaması doğru)", () => {
  let n = 0;
  let same = 0;
  let oldRule = 0;
  let maxOld = 0;
  for (const c of REF) {
    if (c.eskiServisMandi === null) continue;
    const k = kOf(c);
    assert.ok(k.ok, c.id);
    if (!k.ok) continue;
    n++;
    if (Math.abs(dang(k.mandi.longitude, c.eskiServisMandi)) <= REF_TOL) same++;
    const st = Date.parse(k.segmentStartUtc);
    const en = Date.parse(k.segmentEndUtc);
    const oldAt = Date.parse(k.mandi.atUtc) - (en - st) / 8;
    const ay = c.ayanamsaDegrees + ((oldAt - birthMs(c)) / 86400_000) * PREC;
    const d = Math.abs(dang(tropicalAscendant(oldAt, c.latitude, c.longitude) - ay, c.eskiServisMandi));
    maxOld = Math.max(maxOld, d);
    if (d <= REF_TOL) oldRule++;
  }
  console.log(`     ${n} servis sonucu · klasikle aynı ${same} · eski kural ('1/8 önce') ile açıklanan ${oldRule}/${n} (en büyük ${maxOld.toFixed(4)}°)`);
  assert.equal(n, 233);
  assert.equal(same, 0);
  assert.equal(oldRule, n);
});

// ─── 4 · Kutup / geçersiz: tahmini derece yok ──────────────────────────────────────────────────────────────────────
const audit: { testId: string; body: { date: string; time: string; timezone: number; latitude: number; longitude: number }; service: VedicUpagrahaTechnical }[] = JSON.parse(fs.readFileSync(path.join(FX, "denetim-200.json"), "utf8"));
const bodyOf = (c: (typeof audit)[number]) => ({ date: c.body.date, time: c.body.time, offsetHours: c.body.timezone, latitude: c.body.latitude, longitude: c.body.longitude });
t("kutup / geçersiz: güneş doğmuyorsa Mandi ÜRETİLMEZ (hata); kısmi sonuçta yalnız yöntem işareti; BPHS adımı yoksa uygulanmaz", () => {
  const c = audit.find((x) => x.service.timeBased.length > 0)!;
  const b = applyBphsKalaVela(c.service, bodyOf(c), NAKSHATRAS);
  assert.ok(b.ok && !("unchanged" in b));
  if (!b.ok) return;
  const polar = applyClassicalMandi(b.technical, { ...bodyOf(c), latitude: 89.5, date: "2001-06-21" }, NAKSHATRAS);
  assert.equal(polar.ok, false);
  assert.equal(applyClassicalMandi(c.service as never, bodyOf(c), NAKSHATRAS).ok, false, "BPHS işareti olmadan uygulanmaz");
  const part = audit.find((x) => x.service.timeBased.length === 0)!;
  const pb = applyBphsKalaVela(part.service, bodyOf(part), NAKSHATRAS);
  assert.ok(pb.ok);
  if (!pb.ok) return;
  const pm = applyClassicalMandi(pb.technical, bodyOf(part), NAKSHATRAS);
  assert.ok(pm.ok);
  if (!pm.ok) return;
  const { kalaVela, ...rest } = pm.technical;
  const { kalaVela: kv0, ...rest0 } = pb.technical;
  assert.deepEqual(rest, rest0, "kısmi: noktalar ve diğer alanlar aynen");
  assert.deepEqual(kalaVela, { ...kv0, mandi: "ghati_table" });
  assert.equal(pm.technical.timeBased.length, 0, "kısmi sonuçta Mandi yok");
  let polarRefs = 0;
  for (const x of audit) {
    if (x.service.timeBased.length > 0) continue;
    polarRefs++;
    assert.equal(computeKalaVela({ ...bodyOf(x), ayanamsaDegrees: x.service.frame.ayanamsaDegrees }).ok, false, `${x.testId}: kutupta yerel hesap tanımsız olmalı`);
  }
  assert.ok(polarRefs >= 1);
});

// ─── 5 · Diğer 10 nokta ve bütün alanlar: düzeltme ÖNCESİ çıktıyla AYNI ─────────────────────────────────────────────
const before = JSON.parse(fs.readFileSync(path.join(FX, "onceki-surum-ciktisi.json"), "utf8")) as { denetim200: Record<string, VedicUpagrahaTechnical>; golden: Record<string, VedicUpagrahaTechnical> };
const MANDI_FIELDS = new Set(["longitude", "rashi", "degreeInRashi", "nakshatra", "nakshatraIndex", "pada"]);
function sameExceptMandi(now: VedicUpagrahaTechnical, old: VedicUpagrahaTechnical, label: string): number {
  const { kalaVela: kvNow, timeBased: tbNow, ...restNow } = now;
  const { kalaVela: kvOld, timeBased: tbOld, ...restOld } = old;
  assert.deepEqual(restNow, restOld, `${label}: çerçeve, Güneş türevliler, impliedSun, d1, partial`);
  assert.deepEqual(kvNow, kvOld ? { ...kvOld, mandi: "ghati_table" } : kvNow, `${label}: kalaVela yalnız mandi işareti eklenir`);
  assert.deepEqual(tbNow.map((p) => p.id), tbOld.map((p) => p.id), `${label}: sıra`);
  let other = 0;
  for (let i = 0; i < tbNow.length; i++) {
    if (tbNow[i].id !== "mandi") {
      assert.deepEqual(tbNow[i], tbOld[i], `${label}: ${tbNow[i].id}`);
      other++;
      continue;
    }
    for (const k of new Set([...Object.keys(tbNow[i]), ...Object.keys(tbOld[i])]))
      if (!MANDI_FIELDS.has(k)) assert.deepEqual((tbNow[i] as Record<string, unknown>)[k], (tbOld[i] as Record<string, unknown>)[k], `${label}: mandi.${k}`);
  }
  return other + now.sunBased.length;
}
t("koruma: 200 denetim + 5 golden — Gulika, Kala, Mrityu, Ardhaprahara, Yamaghantaka, 5 Güneş türevli, çerçeve ve diğer alanlar düzeltme ÖNCESİYLE birebir; yalnız Mandi değişir", () => {
  let pts = 0;
  let cases = 0;
  for (const c of audit) {
    const b = applyBphsKalaVela(c.service, bodyOf(c), NAKSHATRAS);
    assert.ok(b.ok, c.testId);
    if (!b.ok) continue;
    const m = applyClassicalMandi(b.technical, bodyOf(c), NAKSHATRAS);
    assert.ok(m.ok, c.testId);
    if (!m.ok) continue;
    pts += sameExceptMandi(m.technical, before.denetim200[c.testId], c.testId);
    cases++;
  }
  for (const f of Object.keys(before.golden)) {
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "golden", f), "utf8"));
    const p = vedicUpagraha.project({ body: g.body } as never, g.response, { ayanamsa: g.body.ayanamsa ?? "lahiri" });
    assert.ok(p.ok, f);
    if (!p.ok) continue;
    pts += sameExceptMandi(p.technical as VedicUpagrahaTechnical, before.golden[f], f);
    cases++;
  }
  console.log(`     ${cases} teknik veri · Mandi dışı ${pts} nokta birebir`);
  assert.equal(cases, 205);
});

// ─── 6 · Eski (-1 / -2) ve yeni (-3) kayıtlar: ekran = Word/PDF, değerler aynen, açıklamalar doğru ─────────────────────────
t("eski -1 / -2 kayıtlar: saklı Mandi AYNEN gösterilir (ekran + Word/PDF); Dayanak 'eski hesap kuralı'; yeni -3: klasik not + dayanak; Mandi 'Satürn parçası başlangıcı' iddiası yok", () => {
  const c = audit.find((x) => x.testId === "TR-0187")!;
  const v1 = c.service; // -1: kalaVela yok (servis sırası, servis Mandi'si)
  const b = applyBphsKalaVela(c.service, bodyOf(c), NAKSHATRAS);
  assert.ok(b.ok && !("unchanged" in b));
  if (!b.ok) return;
  const v2 = b.technical as VedicUpagrahaTechnical; // -2: kalaVela var, mandi işareti yok
  const m = applyClassicalMandi(b.technical, bodyOf(c), NAKSHATRAS);
  assert.ok(m.ok);
  if (!m.ok) return;
  const v3 = m.technical as VedicUpagrahaTechnical;
  const mandiOf = (x: VedicUpagrahaTechnical) => x.timeBased.find((p) => p.id === "mandi")!.longitude;
  assert.equal(mandiOf(v1), mandiOf(v2), "-2 kaydında Mandi servisin (eski) değeri");
  assert.notEqual(mandiOf(v3), mandiOf(v2), "-3 Mandi klasik");
  assert.deepEqual([isClassicalMandi(v1), isClassicalMandi(v2), isClassicalMandi(v3)], [false, false, true]);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
  const doc = (tech: unknown) => {
    const ps: string[] = [];
    const rows: string[][] = [];
    const bb = new Proxy({}, { get: (_o, k) => (...args: unknown[]) => { if (k === "p") ps.push(String(args[0])); if (k === "table") rows.push(...(args[1] as string[][])); } });
    vedicNoktaReport(bb as never, "vedic.upagraha", tech as never);
    return { ps, rows };
  };
  const NOTES = [UPAGRAHA_SYSTEMS_NOTE, UPAGRAHA_SYSTEMS_NOTE_LEGACY, UPAGRAHA_SCHOOL_NOTE, UPAGRAHA_SCHOOL_NOTE_BPHS, UPAGRAHA_SCHOOL_NOTE_KLASIK, UPAGRAHA_LEGACY_ORDER_NOTE];
  for (const [label, tech, want, basis] of [
    ["-1", v1, [UPAGRAHA_SYSTEMS_NOTE_LEGACY, UPAGRAHA_SCHOOL_NOTE, UPAGRAHA_LEGACY_ORDER_NOTE], UPAGRAHA_MANDI_BASIS_ESKI],
    ["-2", v2, [UPAGRAHA_SYSTEMS_NOTE, UPAGRAHA_SCHOOL_NOTE_BPHS], UPAGRAHA_MANDI_BASIS_ESKI],
    ["-3", v3, [UPAGRAHA_SYSTEMS_NOTE, UPAGRAHA_SCHOOL_NOTE_KLASIK], UPAGRAHA_MANDI_BASIS_KLASIK],
  ] as const) {
    const html = renderToStaticMarkup(createElement(VedicUpagrahaPanel, { t: tech as VedicUpagrahaTechnical }));
    const d = doc(tech);
    for (const n of NOTES) {
      const expect = (want as readonly string[]).includes(n);
      assert.equal(html.includes(esc(n)), expect, `${label} ekran: ${n.slice(0, 50)}`);
      assert.equal(d.ps.includes(n), expect, `${label} Word/PDF: ${n.slice(0, 50)}`);
    }
    assert.equal(upagrahaBasis(tech, "mandi"), basis, `${label} dayanak`);
    assert.equal(upagrahaBasis(tech, "gulika"), "Satürn parçası (8'li gün / gece bölümü)", `${label} Gulika dayanağı değişmez`);
    const lon = `${mandiOf(tech as VedicUpagrahaTechnical).toFixed(2).replace(".", ",")}°`;
    const mrow = d.rows.find((r) => r[0] === "Mandi")!;
    assert.ok(mrow && mrow.includes(lon) && mrow[mrow.length - 1] === basis, `${label} Word/PDF Mandi satırı: ${JSON.stringify(mrow)}`);
    assert.ok(html.includes(lon) && html.includes(esc(basis)), `${label} ekran Mandi değeri + dayanağı`);
    assert.equal(upagrahaSystemsNote(tech).includes("Gulika ve Mandi = Satürn parçası"), false, `${label}: sistem notunda Mandi = parça başı iddiası yok`);
    for (const s of [...d.ps, html]) assert.ok(!/\broxy\b/i.test(s), `${label}: marka-nötr`);
  }
  assert.equal(upagrahaSchoolNote(v3), UPAGRAHA_SCHOOL_NOTE_KLASIK);
  for (const want of ["Uttara Kalamrita (şl. 7)", "Phaladeepika (25. bölüm, şl. 2)", "oranla", "gün batımından", "Vedik gün", "Gulika ile aynı nokta değildir"]) assert.ok(UPAGRAHA_SCHOOL_NOTE_KLASIK.includes(want), want);
  assert.ok(UPAGRAHA_SCHOOL_NOTE_BPHS.includes("eski hesap kuralıyla") && UPAGRAHA_SCHOOL_NOTE_BPHS.includes("klasik tablo anının kendisi değildir"));
  assert.ok(!UPAGRAHA_SCHOOL_NOTE_KLASIK.includes("tam bir parça öncesinde"));
});

console.log(`\nupagraha-mandi harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

/**
 * ATL-B03 — KP Horary ruling planets GÜN LORDU (yerel saat dilimi) regresyon harness'i (14.11.2026).
 *
 * Kanıt: 30.10.2026 büyük denetimin 247 GERÇEK sağlayıcı yanıtı (245 numara; eski gövde timezone 0) — fixtures/atl-b03/kp-horary-247.json
 * (ürünün kaydettiği gün lordu + küme; bağımsız Skyfield gün doğumu kuralı referansı) + aynı denetimin 2 GERÇEK yerel-ofset deneyi.
 * Yeni ücretli çağrı YOK; ağ YOK.
 *
 *   A) Yeni gövde: 247 vakanın her biri için değerlendirme yerinin O ANDAKİ ofseti (IANA) ile yerel tarih/saat; UTC an birebir
 *      korunur; 2 gerçek deney gövdesiyle BİREBİR aynı (yerel ofsetle doğru gün lordu dönen gövdeler).
 *   B) Kök neden modeli: gün lordu = gövdedeki takvim gününün gün doğumu kuralı (Hindu vara). Eski UTC gövdesi modeli ürünün kaydettiği
 *      247 gün lordunun TAMAMINI üretir (20 yanlış dahil); yeni yerel gövde modeli bağımsız referansın 247/247'sini üretir.
 *   C) 20 hatalı vaka tek tek: eski değer ≠ referans, yeni model = referans (regresyon listesi).
 *   D) 2 gerçek yerel-ofset yanıtı: sağlayıcının gün lordu = referans (WD-0500 Jüpiter, WD-0506 Mars).
 *   E) Motor sözleşmesi: ofsetsiz seçenekle birim KURULMAZ; adaptör sürümü -2 (ayrı önbellek anahtarı, eski satırlar korunur).
 *   F) Eski kayıtlar: yalnız -1 kp.horary kaydında "kp_horary_day_lord" notu; -2'de ve diğer tekniklerde yok; not metni değerleri
 *      değiştirmediğini söyler.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atl-b03-kp-horary-tz.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { kpHoraryBody } from "@/lib/astrology/providers/roxy/requests";
import { projectRoxyKpHorary, ROXY_KP_HORARY } from "@/lib/astrology/providers/roxy/kp";
import { kpIntervalOffset } from "@/lib/astrology/engine/kpRulingIntervalOptions";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { legacyMethodNotes } from "@/lib/astrology/legacyMethod";
import { computeKalaVela, KALA_VELA_GULIKA_TOLERANCE } from "@/lib/astrology/engine/upagrahaKalaVela";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const FX = JSON.parse(readFileSync(join(__dirname, "fixtures", "atl-b03", "kp-horary-247.json"), "utf8")) as {
  cases: { id: string; horaryNumber: number; atUtc: string; ayanamsa: string; nodeType: string; latitude: number; longitude: number; timezone: string; old: { dayLord: string; rulingPlanets: string[] }; ref: { dayLord: string; durum: string; sunriseDistMin: number; rulingSet: string[] | null } }[];
  tzExperiment: { id: string; body: J; rulingObj: { dayLord: string } }[];
};
const WEEKDAY_LORD = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 14).join("\n     ")}`);
  }
}

const bodyOf = (c: (typeof FX.cases)[number]) => {
  const off = kpIntervalOffset(c.timezone, c.atUtc, 0);
  assert.equal(off.kind, "ok", `${c.id}: ofset`);
  return kpHoraryBody(c.horaryNumber, c.atUtc, { latitude: c.latitude, longitude: c.longitude }, (off as { hours: number }).hours, c.ayanamsa as J, c.nodeType as J);
};

/** Yerinde, verilen UTC aralığında [from, to) ilk gün doğumu (astronomy-engine; üst kenar + standart kırılma). */
function sunriseIn(lat: number, lon: number, fromMs: number, toMs: number): number | null {
  const r = Astronomy.SearchRiseSet(Astronomy.Body.Sun, new Astronomy.Observer(lat, lon, 0), +1, new Date(fromMs), (toMs - fromMs) / 86_400_000);
  return r && r.date.getTime() < toMs ? r.date.getTime() : null;
}

/**
 * Sağlayıcının gün lordu modeli (Hindu vara, gün doğumu kuralı): gövdedeki takvim günü D ve saat; gövdenin ofsetiyle D gününün gün
 * doğumu bulunur; an o gün doğumundan önceyse önceki günün lordu. Ofset 0 = eski gövde (UTC takvim günü), yerel ofset = yeni gövde.
 */
function providerVaraModel(utcMs: number, offsetHours: number, lat: number, lon: number): string {
  const localMs = utcMs + offsetHours * 3_600_000;
  const dayStartLocal = Math.floor(localMs / 86_400_000) * 86_400_000;
  const dayStartUtc = dayStartLocal - offsetHours * 3_600_000;
  const rise = sunriseIn(lat, lon, dayStartUtc, dayStartUtc + 86_400_000);
  if (rise === null) throw new Error("gün doğumu yok");
  const weekday = new Date(dayStartLocal).getUTCDay();
  return WEEKDAY_LORD[utcMs < rise ? (weekday + 6) % 7 : weekday];
}

async function main() {
  const cases = FX.cases;

  await t("hazırlık: fixture 247 gerçek yanıt; bunlardan TAM 20'si eski gövdede yanlış gün lordu (denetim ATL-B03: 20/245 soru)", () => {
    assert.equal(cases.length, 247);
    const bad = cases.filter((c) => c.old.dayLord !== c.ref.dayLord);
    assert.equal(bad.length, 20);
    assert.ok(bad.every((c) => c.ref.durum === "FARK") && cases.filter((c) => c.ref.durum === "FARK").length === 20);
    // Gün doğumuna 5 dakikadan yakın vakalar (sınır duyarlılığı) kapsamda — B testi bunları da birebir doğrular.
    assert.ok(cases.filter((c) => c.ref.sunriseDistMin < 5).length >= 2, "gün doğumu sınırına yakın vaka");
  });

  await t("A) yeni gövde: 247/247 yerel tarih + yerel saat (saniyeli) + o anki ofset; UTC an BİREBİR korunur; gövde alan kümesi değişmedi", () => {
    for (const c of cases) {
      const b = bodyOf(c);
      assert.deepEqual(Object.keys(b).sort(), ["ayanamsa", "date", "horaryNumber", "latitude", "longitude", "nodeType", "time", "timezone"], c.id);
      assert.match(b.time, /^\d{2}:\d{2}:\d{2}$/);
      const utc = Date.parse(`${b.date}T${b.time}Z`) - b.timezone * 3_600_000;
      assert.equal(utc, Date.parse(`${c.atUtc}:00Z`), `${c.id}: UTC an`);
      assert.ok(Math.abs(b.timezone) <= 14);
    }
    const zones = new Set(cases.map((c) => c.timezone));
    assert.ok(zones.size >= 50, `saat dilimi çeşitliliği ${zones.size}`);
    assert.ok(cases.some((c) => bodyOf(c).timezone % 1 !== 0), "kesirli ofset (ör. +5:30 / +5:45) kapsamda");
    assert.ok(cases.some((c) => bodyOf(c).date !== c.atUtc.slice(0, 10)), "yerel tarih ≠ UTC tarihi olan vakalar kapsamda");
  });

  await t("A) 2 gerçek yerel-ofset deneyinin gövdesi = ürünün YENİ gövdesi (aynı vaka, aynı an, aynı yer, aynı ofset)", () => {
    for (const x of FX.tzExperiment) {
      const c = cases.find((k) => k.id.endsWith(x.id) && k.horaryNumber === x.body.horaryNumber)!;
      assert.ok(c, x.id);
      assert.deepEqual(bodyOf(c), x.body, x.id);
    }
  });

  await t("B) kök neden modeli: eski UTC gövdesi (ofset 0) sağlayıcının kaydettiği 247 gün lordunun TAMAMINI üretir (20 yanlış dahil)", () => {
    const miss = cases.filter((c) => providerVaraModel(Date.parse(`${c.atUtc}:00Z`), 0, c.latitude, c.longitude) !== c.old.dayLord).map((c) => c.id);
    assert.deepEqual(miss, []);
  });

  await t("B) yeni yerel gövde modeli bağımsız referansın (Skyfield gün doğumu) 246/247'sini üretir; tek fark TARİH ÇİZGİSİ (Samoa) — referansın LMT haftagünü sınırı", () => {
    const miss = cases
      .filter((c) => {
        const b = bodyOf(c);
        return providerVaraModel(Date.parse(`${c.atUtc}:00Z`), b.timezone, c.latitude, c.longitude) !== c.ref.dayLord;
      })
      .map((c) => c.id);
    // WD-0666 Pacific/Apia (−171,77°; 2011'den beri UTC+13): referans haftanın gününü gün doğumunun YEREL ORTALAMA ZAMANINA (boylam/15)
    // göre kurar → Perşembe (Jüpiter). Yerel takvim günü Cuma (soru 14:57, gün doğumu 06:26 yerel) → yerel gün doğumu kuralı Venüs.
    // Aynı LMT sınırı 30.10 denetiminde Lilly için L-02 (P3, "tarih çizgisinde 21 harita") olarak kayıtlı. Sağlayıcının +13 gövdeyle
    // 14.11.2026 Owner onaylı GERÇEK kp/horary çağrısı (+13 gövde): sağlayıcı Venüs döndürdü → yerel takvim kuralı bu uçta da
    // doğrulandı; referansın LMT haftagünü (Jüpiter) tarih çizgisinde yanlış (aşağıdaki "G" testi).
    assert.deepEqual(miss, ["C-kp.horary-WD-0666"]);
    const c = cases.find((k) => k.id === "C-kp.horary-WD-0666")!;
    const b = bodyOf(c);
    assert.deepEqual([b.date, b.time.slice(0, 5), b.timezone], ["2036-02-22", "14:57", 13]);
    assert.equal(new Date(`${b.date}T00:00:00Z`).getUTCDay(), 5, "yerel takvim günü Cuma");
    assert.equal(providerVaraModel(Date.parse(`${c.atUtc}:00Z`), b.timezone, c.latitude, c.longitude), "venus");
    assert.equal(c.ref.dayLord, "jupiter");
  });

  await t("B) TARİH ÇİZGİSİ — sağlayıcının vara kuralı GERÇEK yanıtlarla: yerel ofsetli (+13) 3 yanıtta (Samoa 2017 + Tonga 1963 upagraha Gulika, Tonga 1999 KP ruling gün lordu) yerel takvim günü kuralı TUTAR, LMT haftagünü kuralı TUTMAZ", () => {
    const EV = JSON.parse(readFileSync(join(__dirname, "fixtures", "atl-b03", "dateline-evidence.json"), "utf8")) as J;
    const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    const loc = (ms: number, off: number) => new Date(ms + off * 3_600_000).toISOString().slice(0, 19);
    for (const u of EV.upagraha) {
      const utc = Date.parse(u.utc);
      const at = (off: number) => {
        const l = loc(utc, off);
        const r = computeKalaVela({ date: l.slice(0, 10), time: l.slice(11, 19), offsetHours: off, latitude: u.latitude, longitude: u.longitude, ayanamsaDegrees: u.ayanamsaDegrees }) as J;
        return r.points.gulika.longitude as number;
      };
      assert.ok(sep(at(u.offsetHours), u.providerGulika) <= KALA_VELA_GULIKA_TOLERANCE, `${u.id}: yerel takvim kuralı`);
      assert.ok(sep(at(u.longitude / 15), u.providerGulika) > 10, `${u.id}: LMT kuralı sağlayıcıyla tutmamalı`);
    }
    for (const k of EV.kpRuling) {
      // Gövde ofsetiyle aynı yerel tarih + gün doğumu kuralı (bu harness'taki model) = sağlayıcının gerçek gün lordu.
      assert.equal(providerVaraModel(Date.parse(`${k.atUtc}:00Z`), k.utcOffsetHours, k.latitude, k.longitude), k.providerDayLord, k.id);
      const lmt = providerVaraModel(Date.parse(`${k.atUtc}:00Z`), k.longitude / 15, k.latitude, k.longitude);
      assert.notEqual(lmt, k.providerDayLord, `${k.id}: LMT kuralı sağlayıcıyla tutmamalı`);
    }
  });

  await t("C) 20 hatalı vaka regresyon listesi: her birinde eski ≠ referans, yeni gövde modeli = referans; ruling kümesi farkı gün lordundan", () => {
    const bad = cases.filter((c) => c.old.dayLord !== c.ref.dayLord);
    const rows = bad.map((c) => {
      const b = bodyOf(c);
      const fresh = providerVaraModel(Date.parse(`${c.atUtc}:00Z`), b.timezone, c.latitude, c.longitude);
      assert.equal(fresh, c.ref.dayLord, c.id);
      assert.notEqual(c.old.dayLord, fresh, c.id);
      // Kümede eski gün lordu yalnız gün lordu olarak girmişse çıkar, yeni gün lordu girer (diğer 4 öğe aynı an → aynı).
      if (c.ref.rulingSet) assert.ok(c.ref.rulingSet.includes(fresh), `${c.id}: referans kümesi yeni gün lordunu içerir`);
      return `${c.id.replace(/^[A-C]-kp\.horary-/, "")} #${c.horaryNumber} ${c.atUtc}Z ${c.timezone}: eski ${c.old.dayLord} → yeni ${fresh}`;
    });
    assert.equal(rows.length, 20);
    console.log(`     ${rows.join("\n     ")}`);
    assert.equal(bad.filter((c) => c.ref.rulingSet).length, 17, "denetim: ruling kümesi 17 soruda değişiyordu");
  });

  await t("D) 2 GERÇEK yerel-ofset yanıtı (30.10 deneyi): sağlayıcının gün lordu = bağımsız referans (WD-0500 Jüpiter, WD-0506 Mars)", () => {
    for (const x of FX.tzExperiment) {
      const c = cases.find((k) => k.id.endsWith(x.id) && k.horaryNumber === x.body.horaryNumber)!;
      assert.equal(x.rulingObj.dayLord.toLowerCase(), c.ref.dayLord, x.id);
      assert.notEqual(c.old.dayLord, c.ref.dayLord, `${x.id}: eski gövdede yanlıştı`);
    }
  });

  await t("E) motor sözleşmesi: ofsetsiz seçenekle kp.horary birimi KURULMAZ (eski UTC gövdesine sessiz dönüş yok); adaptör -2", () => {
    const def = getTechnique("kp.horary")!;
    const o = def.parseOptions({ atUtc: "2026-10-07T09:00", horaryNumber: 108 }, new Date())!;
    const ctx = { birth: { latitude: 41.0082, longitude: 28.9784 } } as J;
    assert.throws(() => def.units(ctx, o), /ofset/);
    const u = def.units(ctx, { ...o, offsetHours: 3 })[0];
    assert.deepEqual([u.body.date, u.body.time, u.body.timezone], ["2026-10-07", "12:00:00", 3]);
    assert.equal(ROXY_KP_HORARY.adapter, "astro-roxy-kp-horary-2");
    assert.throws(() => kpHoraryBody(1, "2026-10-07T09:00", { latitude: 0, longitude: 0 }, Number.NaN, "kp-newcomb", "mean"));
    assert.throws(() => kpHoraryBody(1, "2026-10-07T09:00", { latitude: 0, longitude: 0 }, 15, "kp-newcomb", "mean"));
  });

  await t("E) DST ve tarihsel ofset: değerlendirme yerinin O ANDAKİ ofseti (İstanbul 2015 yaz +3 / kış +2; Berlin geçiş günü; Katmandu +5:45)", () => {
    const at = (tz: string, utc: string) => (kpIntervalOffset(tz, utc, 0) as { hours: number }).hours;
    assert.equal(at("Europe/Istanbul", "2015-07-01T09:00"), 3);
    assert.equal(at("Europe/Istanbul", "2015-01-01T09:00"), 2);
    assert.equal(at("Europe/Berlin", "2026-03-29T00:59"), 1);
    assert.equal(at("Europe/Berlin", "2026-03-29T01:00"), 2);
    assert.equal(at("Asia/Kathmandu", "2026-03-29T01:00"), 5.75);
    const b = kpHoraryBody(5, "2026-03-29T01:00", { latitude: 52.52, longitude: 13.405 }, at("Europe/Berlin", "2026-03-29T01:00"), "kp-newcomb", "mean");
    assert.deepEqual([b.date, b.time, b.timezone], ["2026-03-29", "03:00:00", 2]);
    const k = kpHoraryBody(5, "2026-03-28T20:30", { latitude: 27.7, longitude: 85.3 }, 5.75, "kp-newcomb", "mean");
    assert.deepEqual([k.date, k.time, k.timezone], ["2026-03-29", "02:15:00", 5.75], "yerel gün değişimi");
    assert.equal(kpIntervalOffset(null, "2026-03-28T20:30", 0).kind, "unresolved");
  });

  await t("G) 5 GERÇEK kp/horary yanıtı (14.11.2026, Owner onaylı; YENİ gövde): gövde = ürün gövdesi; adaptör hatasız; gün lordu = yeni model (Samoa Venüs dahil); ruling kümesi bağımsız referansa eşit (konum/cusp/Lagna eşitliği QA kanıtında ölçüldü: fark 0)", () => {
    const dir = join(__dirname, "fixtures", "atl-b03", "roxy-2026-11-14");
    const want: Record<string, { day: string; changed: boolean }> = {
      "WD-0666": { day: "venus", changed: true },
      "WD-0593": { day: "mars", changed: true },
      "WD-0979": { day: "mercury", changed: true },
      "WD-0966": { day: "sun", changed: true },
      "TR-0265": { day: "sun", changed: false },
    };
    for (const [id, w] of Object.entries(want)) {
      const { body, response } = JSON.parse(readFileSync(join(dir, `yanit-${id}.json`), "utf8")) as J;
      const c = cases.find((k) => k.id === `C-kp.horary-${id}`)!;
      assert.deepEqual(bodyOf(c), body, `${id}: kaydedilen gövde = ürünün yeni gövdesi`);
      const p = projectRoxyKpHorary(response, { horaryNumber: c.horaryNumber, atUtc: c.atUtc, ayanamsa: c.ayanamsa as J, nodeType: c.nodeType as J, place: { latitude: body.latitude, longitude: body.longitude } }) as J;
      assert.ok(p.ok, `${id}: ${JSON.stringify(p.errors)}`);
      assert.equal(p.technical.ruling.dayLord, w.day, `${id}: sağlayıcı gün lordu`);
      assert.equal(providerVaraModel(Date.parse(`${c.atUtc}:00Z`), body.timezone, c.latitude, c.longitude), w.day, `${id}: model = sağlayıcı`);
      assert.equal(c.old.dayLord !== w.day, w.changed, `${id}: eski gövdeye göre değişim`);
      const rs = [...p.technical.ruling.rulingPlanets].sort();
      if (c.ref.rulingSet) assert.deepEqual(rs, [...c.ref.rulingSet].sort(), `${id}: ruling kümesi = referans`);
      if (!w.changed) assert.deepEqual(rs, [...c.old.rulingPlanets].sort(), `${id}: değişmeyen vaka kümesi aynı`);
    }
  });

  await t("F) eski kayıt notu: yalnız kp.horary -1 kaydında 'kp_horary_day_lord'; -2'de ve diğer tekniklerde yok; değerler değiştirilmez", () => {
    const n = (technique: string, adapterVersion: string) => legacyMethodNotes({ technique, adapterVersion, houseSystem: null, revisions: [] }).map((x) => x.code);
    assert.deepEqual(n("kp.horary", "astro-roxy-kp-horary-1"), ["kp_horary_day_lord"]);
    assert.deepEqual(n("kp.horary", "astro-roxy-kp-horary-2"), []);
    assert.deepEqual(n("kp.ruling", "astro-roxy-kp-horary-1"), []);
    const text = legacyMethodNotes({ technique: "kp.horary", adapterVersion: "astro-roxy-kp-horary-1", houseSystem: null, revisions: [] })[0].text;
    assert.match(text, /değiştirilmedi/);
    assert.match(text, /yeniden hesaplayıp yeni kayıt/);
  });

  console.log(`\nastrology ATL-B03 (KP horary yerel saat dilimi) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

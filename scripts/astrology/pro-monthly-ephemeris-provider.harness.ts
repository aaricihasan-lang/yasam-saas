/**
 * GÖKYÜZÜ ATLASI — AYLIK EFEMERİS (Batı tropikal + Vedik sideral): GERÇEK sağlayıcı yanıtlarının BAĞIMSIZ matematiksel doğrulaması.
 *
 * Yanıtlar: QA kanıt klasörü (2026-10-30 arşivinden 6 + 2026-11-24 ücretli 15 çağrı; depoya toplu sağlayıcı verisi konmaz). Ücretli
 * çağrı YAPMAZ. Klasör yoksa "SKIP" yazar (PASS sayılmaz).
 * @pro-run-all yerel-kanit  (CI'da kanıt yok → pro-run-all bu dosyayı "YEREL-KANIT" olarak ayrı listeler; yerelde normal çalışır)
 *
 * Referanslar (sağlayıcıdan BAĞIMSIZ):
 *   • Gezegenler, Güneş, Ay, Kuzey düğüm (gerçek) / Rahu (ortalama): Yaşam Sistemi yerel motoru — değiştirilmemiş NASA/JPL DE440 kerneli
 *     + IAU 2006/2000A indirgemesi (lib/astrology/pro/ephemeris/local.ts; ayrıca skyfield/SE/Horizons ile ≤0,1″ doğrulanmış).
 *   • Kiron: NASA/JPL Horizons ham ICRF vektörleri + yerel IAU 2006/2000A indirgemesi (QA referans/kiron-bagimsiz/).
 *   • Kara Ay Lilith: sağlayıcıdan bağımsız referans YOK → bu testte ölçülmez (rapor: DOĞRULANAMADI; tanı yalnız Swiss Ephemeris).
 * Toleranslar crossCheck.ts'te çağrılardan ÖNCE sabitlendi (QA on-kayit.txt SHA-256). Kiron eşiği (1,0″) ilk 4 ay görüldükten SONRA
 * konmuştur — rapor bunu ayrıca belirtir; 2026-11-24 kapanışında eşik DEĞİŞMEDİ, yalnız referansın çerçevesi düzeltildi.
 *
 * Çalıştırma: ATLAS_DE440_PATH=<de440.bsp> npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-monthly-ephemeris-provider.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lahiriTrueAyanamsa, localPosition, STATION_THRESHOLD_DEG_PER_DAY } from "@/lib/astrology/pro/ephemeris/local";
import { deltaTUncertaintySec } from "@/lib/astrology/pro/ephemeris/accuracy";
import { MONTHLY_NODE_METHOD, daysInMonth, projectMonthly } from "@/lib/astrology/pro/monthly/contract";
import { crossCheckMonthly, toleranceArcsec } from "@/lib/astrology/pro/monthly/crossCheck";
import type { MonthlyKind } from "@/lib/astrology/pro/monthly/types";
import { cellParts } from "@/lib/astrology/pro/monthly/format";
import { frameOfDate, mv } from "@/lib/astrology/pro/ephemeris/de440/frames";
import { de440 } from "@/lib/astrology/pro/ephemeris/de440/source";
import { tdbSecondsFromTtJd } from "@/lib/astrology/pro/ephemeris/de440/apparent";
import { isTimeScalesError, scalesFromUtc } from "@/lib/astrology/time";

const AU_KM = 149_597_870.7;
const C_KMS = 299_792.458;
/** 12:00 UTC satır anı → TT Jülyen günü (yerel motorla aynı zaman katmanı). */
function ttJdOf(ms: number): number {
  const sc = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(sc)) throw new Error(sc.error);
  return 2440587.5 + sc.ttMs / 86_400_000;
}
/** Astrometrik geosantrik ICRF vektörü (au) → görünür gerçek ekliptik boylam (derece): göreli yıllık sapma (Yer hızı DE440'tan) +
 *  IAU 2006/2000A tarih çerçevesi — lib/astrology/pro/ephemeris/de440/apparent.ts ile AYNI bağıntılar (ışık bükülmesi < 0,1″ ihmal). */
function reduceAstrometric(p: number[], ttJd: number): number {
  const et = tdbSecondsFromTtJd(ttJd);
  const spk = de440();
  const e = spk.state(0, 3, et);
  const em = spk.state(3, 399, et);
  const vel = [0, 1, 2].map((k) => ((e.v[k] + em.v[k]) * 86_400) / AU_KM);
  const cAuDay = (C_KMS * 86_400) / AU_KM;
  const p1 = Math.hypot(p[0], p[1], p[2]);
  const ltd = p1 / cAuDay;
  const ve = Math.hypot(vel[0], vel[1], vel[2]);
  const beta = ve / cAuDay;
  const cosd = (p[0] * vel[0] + p[1] * vel[1] + p[2] * vel[2]) / (p1 * ve);
  const gi = Math.sqrt(1 - beta * beta);
  const q = (1 + (beta * cosd) / (1 + gi)) * ltd;
  const r = 1 + beta * cosd;
  const app = [0, 1, 2].map((k) => (p[k] * gi + vel[k] * q) / r);
  const ec = mv(frameOfDate((ttJd - 2451545.0) / 36525).toTrueEcliptic, app);
  return ((Math.atan2(ec[1], ec[0]) * 180) / Math.PI + 360) % 360;
}

const QA = process.env.MONTHLY_EPHEMERIS_EVIDENCE_ROOT || "C:/YasamSistemi-QA/ATLAS-AYLIK-EFEMERIS-2026-11-24";
let pass = 0;
let fail = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}: ${(e as Error).message.split("\n")[0]}`);
  }
};
const sepArcsec = (a: number, b: number) => (((((a - b) % 360) + 540) % 360) - 180) * 3600;
type Fx = { name: string; endpoint: string; body: { year: number; month: number; coordinateSystem?: string }; response: { days: { date: string; positions: { planet: string; longitude: number; isRetrograde: boolean }[] }[] } };

function main() {
  if (!existsSync(join(QA, "yanit"))) {
    console.log("SKIP gerçek sağlayıcı yanıtları bulunamadı (QA kanıt klasörü yok)");
    return;
  }
  const fx: Fx[] = readdirSync(join(QA, "yanit"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ""), ...(JSON.parse(readFileSync(join(QA, "yanit", f), "utf8")) as Omit<Fx, "name">) }));
  const product = fx.filter((f) => !f.name.startsWith("vt-"));
  console.log(`kanıt: ${fx.length} yanıt (ürün ${product.length}, tanı ${fx.length - product.length})`);

  const summary: Record<MonthlyKind, { compared: number; max: number; maxAt: string; retroMis: number; station: number; rows: number }> = {
    western: { compared: 0, max: 0, maxAt: "", retroMis: 0, station: 0, rows: 0 },
    vedic: { compared: 0, max: 0, maxAt: "", retroMis: 0, station: 0, rows: 0 },
  };
  const perBody: Record<string, { max: number; at: string; n: number }> = {};
  for (const f of product) {
    const kind: MonthlyKind = f.endpoint.includes("vedic") ? "vedic" : "western";
    const req = { kind, year: f.body.year, month: f.body.month };
    const pr = projectMonthly(req, f.response);
    t(`${f.name}: izdüşüm (gün sayısı ${daysInMonth(req.year, req.month)}, tarih sırası, cisimler, burç/derece, düğüm karşıtlığı)`, () => {
      assert.ok(pr.ok, pr.ok ? "" : pr.reason);
    });
    if (!pr.ok) continue;
    summary[kind].rows += pr.days.length;
    const cc = crossCheckMonthly(kind, pr.days);
    t(`${f.name}: bağımsız DE440 kontrolü (${cc.compared} değer; en büyük ${cc.maxAbsArcsec}″ ${cc.maxAt?.date ?? ""} ${cc.maxAt?.body ?? ""}; retro uyuşmazlığı ${cc.retroMismatches}; istasyon ${cc.retroStationSkipped})`, () => {
      assert.equal(cc.status, "pass", cc.reason ?? `tolerans dışı (${cc.maxAbsArcsec}″)`);
    });
    const s = summary[kind];
    s.compared += cc.compared;
    s.retroMis += cc.retroMismatches;
    s.station += cc.retroStationSkipped;
    if (cc.maxAbsArcsec > s.max) {
      s.max = cc.maxAbsArcsec;
      s.maxAt = `${cc.maxAt?.date} ${cc.maxAt?.body}`;
    }
    // Cisim bazında en büyük fark + tolerans payı (ΔT dahil) — rapor tablosu için.
    for (const d of pr.days) {
      const ms = Date.parse(`${d.date}T12:00:00Z`);
      for (const p of d.positions) {
        const lb = kind === "western" ? ({ north_node: "true_node" } as Record<string, string>)[p.body] ?? p.body : ({ rahu: "mean_node" } as Record<string, string>)[p.body] ?? p.body;
        if (["south_node", "ketu", "chiron", "lilith"].includes(p.body)) continue;
        const loc = localPosition(lb as never, ms, kind === "western" ? "tropical" : "sidereal_lahiri");
        const dd = Math.abs(sepArcsec(p.lon, loc.lon));
        const k = `${kind}:${p.body}:${ms < Date.UTC(1961, 0, 1) || ms >= Date.UTC(2027, 5, 28) ? "ΔT-modeli" : "1961–2027"}`;
        const pb = (perBody[k] ??= { max: 0, at: "", n: 0 });
        pb.n++;
        if (dd > pb.max) {
          pb.max = dd;
          pb.at = `${d.date} (tolerans ${toleranceArcsec(kind, lb as never, ms).toFixed(1)}″, σΔT ${deltaTUncertaintySec(ms).toFixed(0)} s)`;
        }
      }
    }
  }
  console.log("\ncisim bazında en büyük |Δ| (sağlayıcı − DE440, ″):");
  for (const [k, v] of Object.entries(perBody).sort()) console.log(`  ${k.padEnd(30)} ${v.max.toFixed(2).padStart(8)}  n=${v.n}  @${v.at}`);
  for (const k of ["western", "vedic"] as const) console.log(`ÖZET ${k}: ${summary[k].rows} gün-satırı, ${summary[k].compared} karşılaştırma, en büyük ${summary[k].max}″ @${summary[k].maxAt}, retro uyuşmazlığı ${summary[k].retroMis}, istasyon ${summary[k].station}`);

  // Kiron — BAĞIMSIZ referans (2026-11-24 kapanış turu): JPL Horizons ham ICRF vektörleri (geosantrik, ışık zamanı düzeltmeli, TDB) +
  // Yaşam Sistemi yerel indirgemesi (göreli yıllık sapma + IAU 2006/2000A gerçek ekliptik/ekinoks) — gezegenlerle AYNI çerçeve tanımı.
  // İlk turdaki 1600 "1,27″" farkı Horizons QUANTITIES=31 çıktısından geliyordu: o çıktı IAU76/80 ekliptiğindedir. Kanıt: aynı çıktı
  // DE440 Mars'ta da 1600-01'de ≈−1,07″, 2100-02'de ≈−0,43″ verir (aşağıdaki çerçeve testi). Tolerans DEĞİŞMEDİ: 1,0″.
  const KB = join(QA, "referans", "kiron-bagimsiz");
  let cN = 0;
  let cMax = 0;
  let cAt = "";
  let q31Early = 0;
  const marsFrame: string[] = [];
  for (const f of product.filter((x) => !x.endpoint.includes("vedic"))) {
    const vf = join(KB, `vec-${f.name}.txt`);
    if (!f.response.days[0].positions.some((x) => x.planet === "Chiron")) continue;
    assert.ok(existsSync(vf), `Kiron bağımsız vektör dosyası yok: ${vf}`);
    const rows = readFileSync(vf, "utf8").split("$$SOE")[1].split("$$EOE")[0].trim().split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim()));
    f.response.days.forEach((d, i) => {
      const c = d.positions.find((x) => x.planet === "Chiron");
      if (!c) return;
      const lon = reduceAstrometric([Number(rows[i][2]), Number(rows[i][3]), Number(rows[i][4])], ttJdOf(Date.parse(`${d.date}T12:00:00Z`)));
      const dd = Math.abs(sepArcsec(c.longitude, lon));
      cN++;
      if (dd > cMax) {
        cMax = dd;
        cAt = d.date;
      }
    });
    const mf = join(KB, `mars4-q31-${f.name}.txt`);
    if (existsSync(mf)) {
      const mr = readFileSync(mf, "utf8").split("$$SOE")[1].split("$$EOE")[0].trim().split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim()));
      const ds = f.response.days.map((d, i) => sepArcsec(Number(mr[i][3]), localPosition("mars", Date.parse(`${d.date}T12:00:00Z`), "tropical").lon));
      const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
      marsFrame.push(`${f.name} ${avg.toFixed(2)}″`);
      if (f.name === "w-1600-01") q31Early = avg;
    }
  }
  t(`Kiron ↔ bağımsız (Horizons ICRF vektörü + IAU 2006/2000A yerel indirgeme): ${cN} gün (1600–2100), en büyük |Δ| ${cMax.toFixed(2)}″ @${cAt} (eşik 1,0″)`, () => {
    assert.ok(cN >= 250, `karşılaştırma az (${cN})`);
    assert.ok(cMax <= 1.0, `${cMax}″`);
  });
  t(`Çerçeve kanıtı: Horizons QUANTITIES=31 (IAU76/80) Mars − yerel DE440 (IAU2006) ortalama farkları [${marsFrame.join(", ")}] — 1600'de ≈1″ (ilk turdaki Kiron 'farkının' kaynağı referans çerçevesi)`, () => {
    assert.ok(Math.abs(q31Early) > 0.8 && Math.abs(q31Early) < 1.4, `1600 çerçeve farkı ${q31Early}`);
  });
  // Burç / derece / dakika gösterimi: her gerçek değer için ekran/rapor biçimleyicisi sağlayıcının kendi burç ve burç-içi derece alanıyla aynı.
  t("Gösterim: TÜM gerçek değerlerde (cellParts) burç = sağlayıcı burcu, derece/dakika = sağlayıcı burç-içi derecesinin aşağı yuvarlanmışı", () => {
    const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    let n = 0;
    const bad: string[] = [];
    for (const f of product) {
      for (const d of f.response.days) {
        for (const q of d.positions as unknown as { planet: string; longitude: number; sign: string; degreeInSign: number; isRetrograde: boolean }[]) {
          const c = cellParts({ lon: q.longitude, retro: q.isRetrograde });
          const u = Math.round(q.degreeInSign * 10_000);
          const edge = SIGNS[c.signIndex] !== q.sign; // 30/0 kenarı (izdüşüm ayrıca denetler)
          const okSign = SIGNS[c.signIndex] === q.sign || (edge && (u === 0 || u === 300_000));
          const okDeg = edge || (c.degree === Math.floor(u / 10_000) && c.minute === Math.floor(((u % 10_000) * 6) / 1_000));
          n++;
          if (!okSign || !okDeg || c.retro !== q.isRetrograde) bad.push(`${f.name} ${d.date} ${q.planet}`);
        }
      }
    }
    assert.ok(n > 6000, `değer az ${n}`);
    assert.deepEqual(bad.slice(0, 5), []);
    console.log(`     gösterim kontrolü: ${n} değer, uyuşmazlık ${bad.length}`);
  });
  t("Kiron 2600-12: sağlayıcı 31 günün hiçbirinde vermedi → izdüşüm Kiron'u 'bu ay verilmedi' olarak çıkarır", () => {
    const f = product.find((x) => x.name === "w-2600-12");
    assert.ok(f, "w-2600-12 yok");
    const pr = projectMonthly({ kind: "western", year: 2600, month: 12 }, f!.response);
    assert.ok(pr.ok && pr.missingBodies.includes("chiron") && !pr.bodies.includes("chiron"), JSON.stringify(pr.ok ? pr.missingBodies : pr));
  });

  // Vedik ayanamsa ayrıştırması: sağlayıcı tropikal − sideral = sağlayıcının Lahiri değeri; yerel gerçek Lahiri ile karşılaştırılır.
  for (const name of ["2026-11", "2024-02"]) {
    const tr = fx.find((x) => x.name === `vt-${name}`);
    const sd = fx.find((x) => x.name === `v-${name}`);
    if (!tr || !sd) continue;
    let spread = 0;
    let maxVsLocal = 0;
    let trMax = 0;
    for (let i = 0; i < tr.response.days.length; i++) {
      const ms = Date.parse(`${tr.response.days[i].date}T12:00:00Z`);
      const ays: number[] = [];
      for (const p of tr.response.days[i].positions) {
        const q = sd.response.days[i].positions.find((x) => x.planet === p.planet)!;
        ays.push(((((p.longitude - q.longitude) % 360) + 360) % 360));
        const lb = ({ Sun: "sun", Moon: "moon", Mars: "mars", Mercury: "mercury", Jupiter: "jupiter", Venus: "venus", Saturn: "saturn", Rahu: "mean_node" } as Record<string, string>)[p.planet];
        if (lb) trMax = Math.max(trMax, Math.abs(sepArcsec(p.longitude, localPosition(lb as never, ms, "tropical").lon)));
      }
      spread = Math.max(spread, (Math.max(...ays) - Math.min(...ays)) * 3600);
      const mean = ays.reduce((a, b) => a + b, 0) / ays.length;
      maxVsLocal = Math.max(maxVsLocal, Math.abs((mean - lahiriTrueAyanamsa(ms)) * 3600));
    }
    t(`Vedik ${name}: sağlayıcı ayanamsası (tropikal − sideral) cisimler arası sabit (yayılım ${spread.toFixed(2)}″ ≤ 0,8″)`, () => assert.ok(spread <= 0.8, `${spread}`));
    t(`Vedik ${name}: sağlayıcı Lahiri ↔ yerel gerçek Lahiri |Δ| ${maxVsLocal.toFixed(2)}″ (≤ 1,0″)`, () => assert.ok(maxVsLocal <= 1.0, `${maxVsLocal}`));
    t(`Vedik ${name} TROPİKAL (tanı): 7 graha + ortalama düğüm ↔ DE440 tropikal en büyük ${trMax.toFixed(2)}″ (≤ 1,0″)`, () => assert.ok(trMax <= 1.0, `${trMax}`));
  }

  // Ay'ın hızlı hareketi: ardışık günler arası Ay hareketi fiziksel aralıkta (11,7°–15,5°/gün) ve DE440 ile aynı.
  t("Ay günlük hareketi tüm aylarda 11,7°–15,5°/gün (eksik/atlanmış gün yok)", () => {
    for (const f of product) {
      const moon = f.response.days.map((d) => d.positions.find((p) => p.planet === "Moon")!.longitude);
      for (let i = 1; i < moon.length; i++) {
        const step = ((((moon[i] - moon[i - 1]) % 360) + 360) % 360);
        assert.ok(step >= 11.7 && step <= 15.5, `${f.name} ${i}: ${step}`);
      }
    }
  });
  t(`Düğüm yöntemleri: Batı Kuzey düğüm = ${MONTHLY_NODE_METHOD.western}, Vedik Rahu = ${MONTHLY_NODE_METHOD.vedic} (DE440 ile ölçüldü)`, () => {
    for (const f of product) {
      const kind: MonthlyKind = f.endpoint.includes("vedic") ? "vedic" : "western";
      const name = kind === "western" ? "North Node" : "Rahu";
      const other = kind === "western" ? "mean_node" : "true_node";
      let otherMax = 0;
      for (const d of f.response.days) {
        const p = d.positions.find((x) => x.planet === name)!;
        const ms = Date.parse(`${d.date}T12:00:00Z`);
        otherMax = Math.max(otherMax, Math.abs(sepArcsec(p.longitude, localPosition(other, ms, kind === "western" ? "tropical" : "sidereal_lahiri").lon)));
      }
      assert.ok(otherMax > 60, `${f.name}: diğer düğüm yöntemiyle de uyumlu görünüyor (${otherMax}″) — yöntem ayırt edilemedi`);
    }
  });
  t("Retro bayrağı: yalnız sağlayıcı alanından; istasyon eşiği (2″/gün) dışında DE440 hız işaretiyle %100 uyumlu", () => {
    assert.equal(summary.western.retroMis + summary.vedic.retroMis, 0);
    assert.ok(STATION_THRESHOLD_DEG_PER_DAY > 0);
  });
  console.log(`\nSONUÇ ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exitCode = 1;
}

main();

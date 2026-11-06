/**
 * GÖKYÜZÜ ATLASI — #643 NATAL ENTEGRASYONU AŞAMA 1: "sağlayıcı konum + yerel ev" katmanı (lib/astrology/houses/natalLocal.ts).
 * Ağ çağrısı YOK. Girdiler:
 *   • fixtures/pro-natal-houses/roxy-natal-technical-2026-10-31.json — 200 GERÇEK sağlayıcı Natal yanıtının teknik katmanı
 *     (190 Placidus + 10 Tam Burç; sentetik doğum verisi; gen-natal-technical.ts ile mevcut adaptörden üretildi)
 *   • fixtures/pro-natal-houses/swe-natal-ref-2026-10-31.json — BAĞIMSIZ referans: pyswisseph houses_armc + house_pos;
 *     ε ve RAMC Swiss tarafında ayrıca hesaplandı (swe_natal_ref.py)
 *   • fixtures/pro-natal-houses/roxy-natal-interp-house-refs-2026-10-31.json — 200 yanıtın yorumlarında ev atfı sayımı
 *   • fixtures/roxy-natal-golden-2026-10-07.json — Türkçe gerçek yanıt (yorum metni dahil; depoda mevcut)
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-natal-houses.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOUSE_SYSTEMS, type NatalTechnical } from "@/lib/astrology/model/western";
import { parseNatalOptions, projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import { houseOf as lillyHouseOf } from "@/lib/astrology/horary/western/houses";
import { PRO_HOUSE_SYSTEMS, type ProHouseSystem } from "@/lib/astrology/houses/engine";
import { crosscheckCusps } from "@/lib/astrology/pro/houses/crosscheck";
import {
  LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC,
  NATAL_HIGH_LATITUDE_WARN,
  NATAL_HOUSE_SYSTEMS,
  NATAL_POLAR_HOUSE_LATITUDE,
  checkNatalHouseLatitude,
  deriveLocalNatalHouses,
  maskNatalInterpretationForLocalHouses,
  natalInterpretationHouseRefs,
  parseNatalHouseSystem,
  providerHouseSystemFor,
  resolveNatalHouses,
  textHasHouseReference,
  type LocalNatalTechnical,
} from "@/lib/astrology/houses/natalLocal";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).message}\n`);
  }
}
const s180 = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const n360 = (x: number) => ((x % 360) + 360) % 360;
const ROOT = join(__dirname, "fixtures");
const FX = join(ROOT, "pro-natal-houses");
type Case = { id: string; trimmed?: boolean; technical: NatalTechnical };
type SweSys = { cusps: number[]; asc: number; mc: number; houses: Record<string, number> };
const CASES = (JSON.parse(readFileSync(join(FX, "roxy-natal-technical-2026-10-31.json"), "utf8")) as { cases: Case[] }).cases;
const SWE = new Map((JSON.parse(readFileSync(join(FX, "swe-natal-ref-2026-10-31.json"), "utf8")) as { cases: { id: string; eps: number; ramc: number; systems: Record<ProHouseSystem, SweSys> }[] }).cases.map((c) => [c.id, c]));
const REFS = (JSON.parse(readFileSync(join(FX, "roxy-natal-interp-house-refs-2026-10-31.json"), "utf8")) as { cases: { id: string; bodies: number; aspects: number; patterns: number; overall: number; bodyTexts: number; aspectTexts: number; patternTexts: number }[] }).cases;
const PLAC = CASES.filter((c) => c.technical.houseSystem === "placidus");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const derive = (c: Case, s: ProHouseSystem) => {
  const r = deriveLocalNatalHouses(c.technical, s);
  if (!r.ok) throw new Error(`${c.id} ${s}: ${r.code} ${r.error}`);
  return r.technical;
};
const POINT_IDS = (t: NatalTechnical) => [...t.bodies.map((b) => b.id as string), ...(t.points.partOfFortune ? ["part_of_fortune"] : []), ...(t.points.vertex ? ["vertex"] : [])];
const houseOfPoint = (t: LocalNatalTechnical | NatalTechnical, id: string) =>
  id === "part_of_fortune" ? t.points.partOfFortune!.house : id === "vertex" ? t.points.vertex!.house : t.bodies.find((b) => b.id === id)!.house;
const lonOfPoint = (t: NatalTechnical, id: string) => (id === "part_of_fortune" ? t.points.partOfFortune!.longitude : id === "vertex" ? t.points.vertex!.longitude : t.bodies.find((b) => b.id === id)!.longitude);
/** Bağımsız yerleşim (testte ayrı yazıldı; motorun houseOf'una dayanmaz): cusp k'dan k+1'e giden yayda mı. */
function placeIndependent(lon: number, cusps: number[]): number {
  for (let k = 0; k < 12; k++) {
    const span = n360(cusps[(k + 1) % 12] - cusps[k]);
    if (n360(lon - cusps[k]) < span) return k + 1;
  }
  return NaN;
}

async function main() {
  await t("N0 fixture: 200 gerçek yanıt (190 Placidus + 10 Tam Burç), 190 Swiss referansı, tümünde açı + 12 cusp", () => {
    assert.equal(CASES.length, 200);
    assert.equal(PLAC.length, 190);
    assert.equal(CASES.filter((c) => c.technical.houseSystem === "whole-sign").length, 10);
    assert.equal(SWE.size, 190);
    for (const c of CASES) {
      assert.ok(c.technical.angles && c.technical.houses.length === 12, c.id);
      for (const b of c.technical.bodies) assert.ok(Number.isInteger(b.house), `${c.id} ${b.id}`);
    }
  });

  await t("N1 yerleşim kuralı = sağlayıcının kuralı: Roxy Placidus cusp'larıyla gezegen/Şans/Vertex evi (190 × 16 nokta) sağlayıcının verdiği evle birebir", () => {
    let n = 0;
    for (const c of PLAC) {
      const cusps = c.technical.houses.map((h) => h.longitude);
      for (const id of POINT_IDS(c.technical)) {
        const roxy = houseOfPoint(c.technical, id);
        if (roxy === null) continue;
        assert.equal(lillyHouseOf(lonOfPoint(c.technical, id), cusps), roxy, `${c.id} ${id}`);
        n++;
      }
    }
    console.log(`  ${n} nokta karşılaştırıldı`);
    assert.ok(n >= 190 * 14);
  });

  await t("N2 dört klasik sistem × 190: türetme başarılı; cusp 1/7/10/4 = sağlayıcı ASC/DSC/MC/IC birebir; bütünlük kapısı ölçümü ≤ 1″", () => {
    const max: Record<string, { asc: number; mc: number }> = {};
    for (const s of PRO_HOUSE_SYSTEMS) {
      let ma = 0;
      let mm = 0;
      for (const c of PLAC) {
        const d = derive(c, s);
        const asc = c.technical.angles!.ascendant.longitude;
        const mc = c.technical.angles!.midheaven.longitude;
        assert.equal(d.houses[0].longitude, n360(asc), c.id);
        assert.equal(d.houses[9].longitude, n360(mc), c.id);
        assert.ok(Math.abs(s180(d.houses[6].longitude, asc + 180)) < 1e-9 && Math.abs(s180(d.houses[3].longitude, mc + 180)) < 1e-9, c.id);
        assert.ok(d.houseSource.angleCheck.ascArcsec <= LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC && d.houseSource.angleCheck.mcArcsec <= LOCAL_NATAL_ANGLE_TOLERANCE_ARCSEC, c.id);
        ma = Math.max(ma, d.houseSource.angleCheck.ascArcsec);
        mm = Math.max(mm, d.houseSource.angleCheck.mcArcsec);
      }
      max[s] = { asc: ma, mc: mm };
    }
    console.log(`  en büyük motor↔sağlayıcı sapması: ${Object.entries(max).map(([s, v]) => `${s} ASC ${v.asc.toFixed(3)}″ MC ${v.mc.toFixed(4)}″`).join(" · ")}`);
  });

  await t("N3 BAĞIMSIZ cusp doğrulaması: türetilmiş ara cusp'lar ↔ Swiss Ephemeris houses_armc (ε ve RAMC Swiss'te ayrıca hesaplandı) ≤ 0,5″; ↔ #643 ikinci uygulama (crosscheck) ≤ 1e-6°", () => {
    const out: string[] = [];
    for (const s of PRO_HOUSE_SYSTEMS) {
      let mSwe = 0;
      let mX = 0;
      for (const c of PLAC) {
        const d = derive(c, s);
        const ref = SWE.get(c.id)!.systems[s];
        const f = d.houseSource.frame;
        const x = crosscheckCusps(s, { ramc: f.ramcDeg, obliquity: f.obliquityDeg, latitude: f.latitudeDeg });
        for (let k = 0; k < 12; k++) {
          mSwe = Math.max(mSwe, Math.abs(s180(d.houses[k].longitude, ref.cusps[k])) * 3600);
          if (k !== 0 && k !== 3 && k !== 6 && k !== 9) mX = Math.max(mX, Math.abs(s180(d.houses[k].longitude, x[k])));
        }
      }
      out.push(`${s} Swiss ${mSwe.toFixed(3)}″ / crosscheck ${(mX * 3600).toExponential(1)}″`);
      assert.ok(mSwe <= 0.5, `${s} Swiss ${mSwe}″`);
      assert.ok(mX <= 1e-6, `${s} crosscheck ${mX}°`);
    }
    console.log(`  ${out.join(" · ")}`);
  });

  await t("N4 BAĞIMSIZ ev yerleşimi: gezegen + Şans Noktası + Vertex evi ↔ Swiss house_pos ve testteki ayrı yerleşim; sağlayıcının eski ev numarası TAŞINMAZ", () => {
    const changed: Record<string, number> = {};
    let n = 0;
    let boundary = 0;
    for (const s of PRO_HOUSE_SYSTEMS) {
      changed[s] = 0;
      for (const c of PLAC) {
        const d = derive(c, s);
        const ref = SWE.get(c.id)!.systems[s];
        const cusps = d.houses.map((h) => h.longitude);
        for (const id of POINT_IDS(c.technical)) {
          const mine = houseOfPoint(d, id)!;
          const lon = lonOfPoint(c.technical, id);
          assert.equal(mine, placeIndependent(lon, cusps), `${c.id} ${s} ${id} bağımsız yerleşim`);
          const minDist = Math.min(...cusps.map((cu) => Math.abs(s180(lon, cu))));
          if (mine !== ref.houses[id]) {
            // Yalnız ev sınırında (cusp'a ≤ 0,5″) iki referansın cusp farkı kadar ayrışma kabul edilir.
            assert.ok(minDist * 3600 <= 0.5, `${c.id} ${s} ${id}: bizim ${mine} ≠ Swiss ${ref.houses[id]} (sınıra ${(minDist * 3600).toFixed(2)}″)`);
            boundary++;
          }
          if (mine !== houseOfPoint(c.technical, id)) changed[s]++;
          n++;
        }
      }
      assert.ok(changed[s] > 0, `${s}: hiçbir ev değişmedi — eski numaralar taşınıyor olabilir`);
    }
    console.log(`  ${n} yerleşim; Swiss'ten sınır ayrışması ${boundary}; sağlayıcının Placidus evinden farklı çıkan: ${Object.entries(changed).map(([s, v]) => `${s} ${v}`).join(", ")}`);
  });

  await t("N5 değişmeyen alanlar (20 tam vaka × 4 sistem): boylamlar, açılar, desenler, özet, asalet, hız, ASC/MC, Şans/Vertex boylamı ve sect, yankı birebir", () => {
    for (const c of CASES.slice(0, 20).filter((x) => x.technical.houseSystem === "placidus")) {
      const before = clone(c.technical);
      for (const s of PRO_HOUSE_SYSTEMS) {
        const d = derive(c, s);
        assert.deepEqual(c.technical, before, `${c.id}: girdi değiştirildi`);
        for (const k of ["schema", "zodiac", "nodeType", "echo", "variants", "angles", "aspects", "patterns", "summary"] as const) assert.deepEqual(d[k], before[k], `${c.id} ${s} ${k}`);
        assert.deepEqual(d.bodies.map(({ house: _h, ...r }) => r), before.bodies.map(({ house: _h, ...r }) => r), `${c.id} ${s} bodies`);
        const { house: _p1, ...pofA } = d.points.partOfFortune!;
        const { house: _p2, ...pofB } = before.points.partOfFortune!;
        assert.deepEqual(pofA, pofB, `${c.id} PoF`);
        assert.equal(d.points.vertex!.longitude, before.points.vertex!.longitude);
        assert.equal(d.houseSystem, s);
        assert.equal(d.houseSource.kind, "local");
        assert.equal(d.houseSource.base.houseSystem, "placidus");
      }
    }
  });

  await t("N6 eski dört sistemde regresyon yok: resolveNatalHouses aynı nesneyi (aynı referans) döndürür; HOUSE_SYSTEMS ve parseNatalOptions değişmedi", () => {
    assert.deepEqual([...HOUSE_SYSTEMS], ["placidus", "whole-sign", "equal", "koch"]);
    assert.deepEqual([...NATAL_HOUSE_SYSTEMS], ["placidus", "whole-sign", "equal", "koch", "regiomontanus", "campanus", "porphyry", "alcabitius"]);
    for (const c of CASES)
      for (const s of HOUSE_SYSTEMS) {
        const r = resolveNatalHouses(c.technical, s);
        assert.ok(r.ok && r.technical === c.technical, `${c.id} ${s}`);
      }
    for (const s of PRO_HOUSE_SYSTEMS) assert.equal(parseNatalOptions({ houseSystem: s, nodeType: "true" }), null, `mevcut Natal API ${s} kabul etmemeli (Aşama 1 bağlanmadı)`);
    for (const s of HOUSE_SYSTEMS) assert.deepEqual(parseNatalOptions({ houseSystem: s, nodeType: "true" }), { houseSystem: s, nodeType: "true" });
    assert.equal(parseNatalHouseSystem(undefined), "placidus");
    assert.equal(parseNatalHouseSystem("campanus"), "campanus");
    assert.equal(parseNatalHouseSystem("topocentric"), null);
    for (const s of PRO_HOUSE_SYSTEMS) assert.equal(providerHouseSystemFor(s), "placidus");
    for (const s of HOUSE_SYSTEMS) assert.equal(providerHouseSystemFor(s), s);
  });

  await t("N7 ev sınırına yakın gezegen: cusp ± 10″ → doğru ev + nearCusp; cusp üzerinde → kendi evi; 0°/360° sarma", () => {
    const c = PLAC[0];
    for (const s of PRO_HOUSE_SYSTEMS) {
      const cusps = derive(c, s).houses.map((h) => h.longitude);
      for (const k of [1, 4, 7, 10]) {
        for (const [off, want] of [
          [10 / 3600, k + 1],
          [-10 / 3600, k],
          [0, k + 1],
        ] as const) {
          const tech = clone(c.technical);
          tech.bodies.find((b) => b.id === "mars")!.longitude = n360(cusps[k] + off);
          const d = derive({ id: c.id, technical: tech }, s);
          assert.equal(d.bodies.find((b) => b.id === "mars")!.house, want, `${s} cusp ${k + 1} ${off}`);
          assert.ok(d.houseSource.nearCusp.some((x) => x.id === "mars"), `${s} nearCusp`);
        }
      }
      // Uzak gezegen nearCusp listesinde olmaz.
      const tech = clone(c.technical);
      tech.bodies.find((b) => b.id === "mars")!.longitude = n360(cusps[2] + n360(cusps[3] - cusps[2]) / 2);
      assert.ok(!derive({ id: c.id, technical: tech }, s).houseSource.nearCusp.some((x) => x.id === "mars"), `${s} uzak`);
    }
    // Sarma: 0° Koç'u kesen evde 359,9999° ve 0,0001° aynı eve düşer.
    for (const c2 of PLAC.slice(0, 40)) {
      const d = derive(c2, "porphyry");
      const cusps = d.houses.map((h) => h.longitude);
      const k = cusps.findIndex((x, i) => n360(cusps[(i + 1) % 12] - x) > n360(0 - x) && n360(0 - x) > 0.01);
      if (k < 0) continue;
      const tech = clone(c2.technical);
      tech.bodies.find((b) => b.id === "venus")!.longitude = 359.9999;
      tech.bodies.find((b) => b.id === "mars")!.longitude = 0.0001;
      const dd = derive({ id: c2.id, technical: tech }, "porphyry");
      assert.equal(dd.bodies.find((b) => b.id === "venus")!.house, dd.bodies.find((b) => b.id === "mars")!.house, c2.id);
      return;
    }
    throw new Error("sarma vakası bulunamadı");
  });

  await t("N8 bütünlük kapısı: ASC 2″ saparsa açık hata (angle_mismatch), sonuç verilmez; 0,3″ sapma kabul", () => {
    const c = PLAC.reduce((a, b) => (derive(a, "campanus").houseSource.angleCheck.ascArcsec <= derive(b, "campanus").houseSource.angleCheck.ascArcsec ? a : b));
    for (const s of PRO_HOUSE_SYSTEMS) {
      for (const [off, ok] of [
        [2 / 3600, false],
        [-2 / 3600, false],
        [0.3 / 3600, true],
      ] as const) {
        const tech = clone(c.technical);
        tech.angles!.ascendant.longitude = n360(tech.angles!.ascendant.longitude + off);
        const r = deriveLocalNatalHouses(tech, s);
        assert.equal(r.ok, ok, `${s} ${off * 3600}″`);
        if (!r.ok) {
          assert.equal(r.code, "angle_mismatch");
          assert.ok(/uyuşmadı/.test(r.error));
        }
      }
    }
  });

  await t("N9 yüksek enlem (> 60°): gerçek sağlayıcı ASC/MC'li 220 vaka (#643 fixture; 41'i > 60°, en çok 65,98°) → türetme ≤ 1″ kapıdan geçer, uyarı yalnız > 60°'ta", () => {
    // #643 fixture'ı (gerçek Roxy /astrology/houses ASC/MC + Placidus cusp'ları, timezone 0) asgari Natal teknik katmanına çevrilir;
    // gövdeler ev hesabına girmez (yerleşim N1–N4'te ayrıca sınandı) → birkaç sabit boylam yeterli.
    type RCase = { id: string; date: string; time: string; latitude: number; longitude: number; roxy: { asc: number; mc: number; placidus: number[] } };
    const R = (JSON.parse(readFileSync(join(ROOT, "pro-houses", "roxy-houses-2026-10-31.json"), "utf8")) as { cases: RCase[] }).cases;
    const pt = (lon: number) => ({ longitude: n360(lon), sign: "aries" as const, degreeInSign: n360(lon) % 30 });
    const tpl = PLAC[0].technical;
    let hi = 0;
    let maxAsc = 0;
    for (const r of R) {
      const tech: NatalTechnical = {
        ...clone(tpl),
        echo: { date: r.date, time: r.time, utcOffsetHours: 0, latitude: r.latitude, longitude: r.longitude, nodeType: "true" },
        angles: { ascendant: pt(r.roxy.asc), midheaven: pt(r.roxy.mc) },
        houses: r.roxy.placidus.map((c, i) => ({ number: i + 1, ...pt(c) })),
      };
      const lat = Math.abs(r.latitude);
      for (const s of PRO_HOUSE_SYSTEMS) {
        const d = deriveLocalNatalHouses(tech, s);
        assert.ok(d.ok, `${r.id} ${s} ${d.ok ? "" : d.code}`);
        assert.equal(d.technical.houseSource.warnings.includes("high_latitude"), lat > NATAL_HIGH_LATITUDE_WARN, `${r.id} ${s} ${lat}`);
        maxAsc = Math.max(maxAsc, d.technical.houseSource.angleCheck.ascArcsec);
      }
      if (lat > NATAL_HIGH_LATITUDE_WARN) hi++;
    }
    console.log(`  220 vaka × 4 sistem; > 60° vaka ${hi}; en büyük ASC sapması ${maxAsc.toFixed(3)}″`);
    assert.ok(hi >= 30);
    // 200 gerçek Natal'da da kural: ≤ 60° → uyarı yok.
    for (const c of PLAC) for (const s of PRO_HOUSE_SYSTEMS) assert.equal(derive(c, s).houseSource.warnings.includes("high_latitude"), Math.abs(c.technical.echo.latitude) > NATAL_HIGH_LATITUDE_WARN, c.id);
    assert.deepEqual(checkNatalHouseLatitude("regiomontanus", 60.01).warnings, ["high_latitude"]);
    assert.deepEqual(checkNatalHouseLatitude("regiomontanus", -60.01).warnings, ["high_latitude"]);
    assert.deepEqual(checkNatalHouseLatitude("regiomontanus", 60).warnings, []);
    assert.deepEqual(checkNatalHouseLatitude("placidus", 63).warnings, ["high_latitude"]);
  });

  await t("N10 kutup (|φ| > 66,5°): 4 klasik sistem + Placidus/Koch ENGELLİ (sessiz geçiş yok); Tam Burç/Eşit Ev açık; türetme polar_latitude", () => {
    for (const lat of [66.51, -66.51, 69.65, -80, 90]) {
      for (const s of NATAL_HOUSE_SYSTEMS) {
        const r = checkNatalHouseLatitude(s, lat);
        const shouldBlock = s !== "whole-sign" && s !== "equal";
        assert.equal(!!r.blocked, shouldBlock, `${s} ${lat}`);
        if (r.blocked) {
          assert.equal(r.blocked.code, "HOUSE_SYSTEM_POLAR");
          assert.ok(/Whole Sign veya Equal/.test(r.blocked.error));
        }
      }
    }
    for (const s of NATAL_HOUSE_SYSTEMS) assert.equal(checkNatalHouseLatitude(s, 66.5).blocked, null, `${s} 66,5 sınırda engellenmez (mevcut kural >)`);
    const tech = clone(PLAC[0].technical);
    tech.echo.latitude = 69.65;
    for (const s of PRO_HOUSE_SYSTEMS) {
      const r = deriveLocalNatalHouses(tech, s);
      assert.ok(!r.ok && r.code === "polar_latitude", s);
    }
  });

  await t("N11 geçersiz girdi: bilinmeyen sistem, şema, Tam Burç tabanı, saat bilinmiyor (maskeli), 11 cusp, bozuk yankı, NaN enlem → açık hata, istisna yok", () => {
    const base = PLAC[0].technical;
    const cases: [string, NatalTechnical, string, string][] = [
      ["bilinmeyen sistem", base, "topocentric", "unknown_system"],
      ["sağlayıcı sistemi derive'a", base, "placidus", "unknown_system"],
      ["şema", { ...clone(base), schema: "x" as never }, "campanus", "invalid_technical"],
      ["Tam Burç tabanı", CASES.find((c) => c.technical.houseSystem === "whole-sign")!.technical, "campanus", "base_not_placidus"],
      ["saat bilinmiyor", maskTimeDependent(base), "campanus", "angles_missing"],
      ["11 cusp", { ...clone(base), houses: base.houses.slice(0, 11) }, "campanus", "angles_missing"],
      ["bozuk saat", { ...clone(base), echo: { ...base.echo, time: "25h" } }, "campanus", "invalid_echo"],
      ["NaN enlem", { ...clone(base), echo: { ...base.echo, latitude: Number.NaN } }, "campanus", "invalid_echo"],
      ["enlem 91", { ...clone(base), echo: { ...base.echo, latitude: 91 } }, "campanus", "invalid_echo"],
    ];
    for (const [name, tech, s, code] of cases) {
      const r = deriveLocalNatalHouses(tech, s as ProHouseSystem);
      assert.ok(!r.ok, name);
      assert.equal(r.code, code, name);
    }
    const r = resolveNatalHouses(base, "topocentric" as never);
    assert.ok(!r.ok && r.code === "unknown_system");
  });

  await t("N12 saat bilinmiyor: maskTimeDependent türetilmiş sonuçta da evleri, açıları ve ev yerleşimlerini gizler (mevcut davranış korunur)", () => {
    const d = derive(PLAC[0], "alcabitius");
    const m = maskTimeDependent(d as unknown as NatalTechnical);
    assert.deepEqual(m.houses, []);
    assert.equal(m.angles, null);
    assert.ok(m.bodies.every((b) => b.house === null));
    assert.deepEqual(m.points, { partOfFortune: null, vertex: null });
  });

  await t("N13 yorum sızıntısı: 200 gerçek yanıtta gezegen yorumlarının TAMAMI ev atfı içerir; açı/desen/genel özet hiç içermez; Türkçe golden yanıt aynı", () => {
    const sum = (k: keyof (typeof REFS)[number]) => REFS.reduce((a, x) => a + (x[k] as number), 0);
    assert.equal(REFS.length, 200);
    assert.equal(sum("bodies"), sum("bodyTexts"), "her gezegen yorumunda ev atfı bekleniyor");
    assert.ok(sum("bodyTexts") >= 200 * 10);
    assert.equal(sum("aspects"), 0);
    assert.equal(sum("patterns"), 0);
    assert.equal(sum("overall"), 0);
    console.log(`  İngilizce: gezegen ${sum("bodies")}/${sum("bodyTexts")} · açı ${sum("aspects")}/${sum("aspectTexts")} · desen ${sum("patterns")}/${sum("patternTexts")}`);
    // Türkçe gerçek yanıt (depodaki golden).
    const raw = JSON.parse(readFileSync(join(ROOT, "roxy-natal-golden-2026-10-07.json"), "utf8")) as { houseSystem?: string; birthDetails?: { nodeType?: string } };
    const opts = parseNatalOptions({ houseSystem: raw.houseSystem ?? "placidus", nodeType: raw.birthDetails?.nodeType ?? "true" })!;
    const p = projectRoxyNatal(raw, opts);
    assert.ok(p.ok, "golden projeksiyon");
    const i = p.value.interpretation;
    const r = natalInterpretationHouseRefs(i);
    console.log(`  Türkçe golden: gezegen ${r.bodies}/${i.bodies.length} · açı ${r.aspects}/${i.aspects.length} · desen ${r.patterns}/${i.patterns.length} · genel ${r.overall}`);
    assert.equal(r.bodies, i.bodies.length);
    assert.equal(r.aspects + r.patterns + r.overall, 0);
    const m = maskNatalInterpretationForLocalHouses(i);
    assert.deepEqual(m.bodies, []);
    assert.deepEqual(m.aspects, i.aspects);
    assert.deepEqual(m.patterns, i.patterns);
    assert.deepEqual(m.overall, i.overall);
    assert.equal(natalInterpretationHouseRefs(m).bodies, 0);
    // Tespit ifadesi örnekleri (yanlış pozitif / negatif).
    for (const s of ["Dokuzuncu Ev evindeki Güneş", "in the Ninth House", "9. ev konuları", "On İkinci Ev", "the 10th house"]) assert.ok(textHasHouseReference(s), s);
    for (const s of ["ev ve aile hayatı", "Güneş üçgen Ay", "evrensel uyum", "house of cards metaphor"]) assert.ok(!textHasHouseReference(s), s);
  });

  await t("N14 sabit eşitliği: NATAL_POLAR_HOUSE_LATITUDE = engine/service.ts POLAR_HOUSE_LATITUDE (66,5)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "lib", "astrology", "engine", "service.ts"), "utf8");
    const m = /export const POLAR_HOUSE_LATITUDE = ([\d.]+);/.exec(src);
    assert.ok(m, "service.ts sabiti bulunamadı");
    assert.equal(Number(m[1]), NATAL_POLAR_HOUSE_LATITUDE);
  });

  await t("N15 determinizm + performans: aynı girdi → bayt-aynı çıktı; 190 × 4 türetme < 2 sn", () => {
    const a = JSON.stringify(derive(PLAC[5], "regiomontanus"));
    const b = JSON.stringify(derive(PLAC[5], "regiomontanus"));
    assert.equal(a, b);
    const t0 = performance.now();
    for (const s of PRO_HOUSE_SYSTEMS) for (const c of PLAC) derive(c, s);
    const ms = performance.now() - t0;
    console.log(`  760 türetme ${ms.toFixed(0)} ms`);
    assert.ok(ms < 2000);
  });

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();

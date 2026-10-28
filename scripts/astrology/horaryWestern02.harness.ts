/**
 * GÖKYÜZÜ ATLASI — HORARY-W-02 (2026-10-28): Regiomontanus evleri, gerçek olay çizelgesi, Lilly arızi asaleti ve soru haritası
 * birleştiricisi (ÜRÜNE BAĞLI DEĞİL). Yeni sağlayıcı çağrısı YOK.
 *
 * Bağımsız referanslar:
 *   • Swiss Ephemeris 2.10.04 + JPL DE441 — astro.com herkese açık swetest.cgi çıktısı (fixtures/horary-western, 12 kurgusal soru
 *     anı; ham <pre> metni swetest-ham/ altında, URL'siyle). Regiomontanus cusp'ları, ARMC, 7 gezegen boylam + hız.
 *   • GERÇEK Roxy yanıtları (depodaki): tzmatrix natal (ASC/MC, sayısal ofset, ≥1950), natal golden 1990 (sağlayıcı anlık görüntüsü
 *     tutarlılığı), panchang/hora golden 2026-11-01 İstanbul (gezegen saati sırası).
 *   • Harness içinde AYRI yazılmış kaba taramalar (dakika ızgarası) — kütüphane koduyla paylaşılmaz.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWestern02.harness.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { PROFILE_LILLY_1647, essentialDignity, solarPhase, sunAltitude } from "@/lib/astrology/horary/western/calc";
import { accidentalDignity, oriental, partile } from "@/lib/astrology/horary/western/accidental";
import { buildWesternHoraryChart, planetaryHour } from "@/lib/astrology/horary/western/chart";
import { ascendantOf, houseOf, midheavenOf, n360, polarLimit, ramcFromMc, regiomontanusCusps, regiomontanusCuspsGeometric, skyFrameAt } from "@/lib/astrology/horary/western/houses";
import { ACCIDENTAL_UNVERIFIED, CLASSICAL_PLANETS, LILLY_ORB, MEAN_MOTION, MEAN_MOTION_UNVERIFIED, TERMS, type ClassicalPlanet } from "@/lib/astrology/horary/western/tables";
import { analyzePair, findIngresses, findPerfections, findStations, moonCourse, speedAt } from "@/lib/astrology/horary/western/timeline";

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
const w180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
const FX = join(__dirname, "fixtures");
type SweCase = { lat: number; lon: number; date: string; ut: string; system: string; ARMC: number } & Record<string, number | string | { lon: number; speed: number }>;
const SWE = JSON.parse(readFileSync(join(FX, "horary-western", "swetest-regio-2026-10-28.json"), "utf8")) as Record<string, SweCase>;
const cuspOf = (c: SweCase, k: number) => c[`house${k}`] as number;
const bodyOf = (c: SweCase, n: string) => c[n] as { lon: number; speed: number };
const sweMs = (c: SweCase) => {
  const [d, m, y] = String(c.date).split(".");
  return Date.parse(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${c.ut}Z`);
};
const NAMES: Record<string, ClassicalPlanet> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn" };

// Harness'e ÖZEL bağımsız efemeris erişimi (kütüphanedeki önbellekli lonAt kullanılmaz).
const AEB: Record<ClassicalPlanet, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars, jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn };
const L = (b: ClassicalPlanet, ms: number) => Astronomy.Ecliptic(Astronomy.GeoVector(AEB[b], Astronomy.MakeTime(new Date(ms)), true)).elon;

async function main() {
  // ── Ev sistemi ─────────────────────────────────────────────────────────────────────────────────
  await t("R1 Regiomontanus iki bağımsız uygulama (kapalı formül ↔ vektör geometrisi): 3.000 rastgele (RAMC, φ ∈ ±66°, ε) → ≤1e-6″; ASC/MC formülleriyle 1/10/4/7 aynı", () => {
    let worst = 0;
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 3000; i++) {
      const ramc = rnd() * 360;
      const lat = (rnd() * 2 - 1) * 66;
      const eps = 23.43 + (rnd() - 0.5) * 0.02;
      const a = regiomontanusCusps(ramc, lat, eps) as number[];
      const b = regiomontanusCuspsGeometric(ramc, lat, eps) as number[];
      for (let k = 0; k < 12; k++) worst = Math.max(worst, Math.abs(w180(a[k] - b[k])) * 3600);
      assert.ok(Math.abs(w180(a[0] - ascendantOf(ramc, lat, eps))) < 1e-9 && Math.abs(w180(a[9] - midheavenOf(ramc, eps))) < 1e-9);
      assert.ok(Math.abs(w180(a[6] - a[0] - 180)) < 1e-9 && Math.abs(w180(a[3] - a[9] - 180)) < 1e-9);
    }
    console.log(`  bilgi: en büyük fark ${worst.toExponential(2)}″`);
    assert.ok(worst < 1e-6);
  });

  await t("R2 Swiss Ephemeris (DE441, astro.com swetest) Regiomontanus: 12 soru anı (φ −54,8° … +66,0°) — (a) swetest ARMC ile saf ev matematiği ≤0,5″; (b) tam zincir (astronomy-engine GAST + gerçek ε) ≤1″; ARMC ≤0,5″", () => {
    let wa = 0;
    let wb = 0;
    let wr = 0;
    for (const [id, c] of Object.entries(SWE)) {
      assert.equal(c.system, "R", id);
      const fr = skyFrameAt(sweMs(c), c.lat, c.lon);
      assert.ok(!("error" in fr), id);
      if ("error" in fr) continue;
      const pure = regiomontanusCusps(c.ARMC, c.lat, fr.obliquity) as number[];
      const full = regiomontanusCusps(fr.ramc, c.lat, fr.obliquity) as number[];
      for (let k = 0; k < 12; k++) {
        wa = Math.max(wa, Math.abs(w180(pure[k] - cuspOf(c, k + 1))) * 3600);
        wb = Math.max(wb, Math.abs(w180(full[k] - cuspOf(c, k + 1))) * 3600);
      }
      wr = Math.max(wr, Math.abs(w180(fr.ramc - c.ARMC)) * 3600);
    }
    console.log(`  bilgi: saf ${wa.toFixed(3)}″ · tam zincir ${wb.toFixed(3)}″ · ARMC ${wr.toFixed(3)}″`);
    assert.ok(wa <= 0.5 && wb <= 1 && wr <= 0.5);
  });

  await t("R3 GERÇEK Roxy natal (tzmatrix, sayısal ofset, ≥1950; 34 yanıt): yerel çerçevenin ASC/MC'si = Roxy ≤25″; Roxy MC'sinden geri RAMC tutarlı", () => {
    const dir = join(FX, "tzmatrix");
    let n = 0;
    let worst = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".num.json"))) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const b = d.body;
      if (+String(b.date).slice(0, 4) < 1950 || typeof b.timezone !== "number") continue;
      const utc = Date.parse(`${b.date}T${b.time}Z`) - b.timezone * 3_600_000;
      const fr = skyFrameAt(utc, b.latitude, b.longitude);
      if ("error" in fr) continue;
      const da = Math.abs(w180(fr.asc - d.response.ascendant.longitude)) * 3600;
      const dm = Math.abs(w180(fr.mc - d.response.midheaven.longitude)) * 3600;
      const dr = Math.abs(w180(ramcFromMc(d.response.midheaven.longitude, fr.obliquity) - fr.ramc)) * 3600;
      worst = Math.max(worst, da, dm, dr);
      n++;
    }
    console.log(`  bilgi: ${n} yanıt; en büyük fark ${worst.toFixed(1)}″ (≈${(worst / 15).toFixed(1)} sn zaman — sağlayıcının UTC/UT1 kuralı)`);
    assert.ok(n >= 30 && worst <= 25);
  });

  await t("R4 kutup sınırı: |φ| ≥ 90° − ε → 'polar_latitude' HATASI; hiçbir durumda Placidus/başka sistem DÖNMEZ; harita da kurulmaz", () => {
    const eps = 23.4379;
    for (const lat of [66.57, -66.6, 69.65, 78.2, 89.9]) {
      const r = regiomontanusCusps(120, lat, eps);
      assert.ok(!Array.isArray(r) && r.error === "polar_latitude", String(lat));
    }
    assert.ok(Array.isArray(regiomontanusCusps(120, polarLimit(eps) - 0.01, eps)));
    const ch = buildWesternHoraryChart({ questionUtc: "2026-06-21T10:00:00Z", latitude: 69.6492, longitude: 18.9553, profile: PROFILE_LILLY_1647 });
    assert.ok("error" in ch && ch.error === "polar_latitude");
  });

  await t("R5 ev yerleşimi: cusp kendi evine dahil, 0° Koç sarması, sonraki cusp'a mesafe", () => {
    const c = regiomontanusCusps(284.6843562, 41.0082, 23.4379) as number[];
    for (let k = 0; k < 12; k++) assert.equal(houseOf(c[k], c), k + 1);
    assert.equal(houseOf(n360(c[11] + 0.001), c), 12);
    assert.equal(houseOf(n360(c[0] - 0.001), c), 12);
  });

  // ── Konum / hız / olaylar ──────────────────────────────────────────────────────────────────────
  await t("E1 gezegen boylam ve hızları (astronomy-engine) ↔ Swiss Ephemeris DE441: 12 an × 7 gezegen, boylam ≤20″, hız ≤1″/gün (kütüphane speedAt)", () => {
    let wl = 0;
    let ws = 0;
    for (const c of Object.values(SWE)) {
      const ms = sweMs(c);
      for (const [n, id] of Object.entries(NAMES)) {
        wl = Math.max(wl, Math.abs(w180(L(id, ms) - bodyOf(c, n).lon)) * 3600);
        ws = Math.max(ws, Math.abs(speedAt(id, ms) - bodyOf(c, n).speed) * 3600);
      }
    }
    console.log(`  bilgi: boylam ${wl.toFixed(1)}″ · hız ${ws.toFixed(2)}″/gün`);
    assert.ok(wl <= 20 && ws <= 1);
  });

  await t("E2 kesinleşme anları: kütüphane (adım+ikiye bölme) ↔ harness'teki bağımsız 1 dk kaba tarama — Ay × 6 gezegen × 5 açı, 7 gün; aynı küme, an farkı ≤90 sn; kesinleşmede açı hatası ≤1″", () => {
    const t0 = Date.parse("2026-11-03T00:00:00Z");
    const t1 = t0 + 7 * 86_400_000;
    let worst = 0;
    let n = 0;
    for (const b of CLASSICAL_PLANETS.filter((x) => x !== "moon")) {
      const lib = findPerfections("moon", b, t0, t1);
      const brute: { ms: number; angle: number }[] = [];
      for (const ang of [0, 60, 90, 120, 180]) for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
        let prev = w180(L("moon", t0) - L(b, t0) - tg);
        for (let ms = t0 + 60_000; ms <= t1; ms += 60_000) {
          const cur = w180(L("moon", ms) - L(b, ms) - tg);
          if (Math.sign(prev) !== Math.sign(cur) && Math.abs(prev - cur) < 90) brute.push({ ms: ms - 30_000, angle: ang });
          prev = cur;
        }
      }
      brute.sort((x, y) => x.ms - y.ms);
      assert.equal(lib.length, brute.length, `Ay–${b}: ${lib.length} ≠ ${brute.length}`);
      lib.forEach((e, i) => {
        assert.equal(e.angle, brute[i].angle);
        worst = Math.max(worst, Math.abs(e.ms - brute[i].ms) / 1000);
        const tg = [0, 180].includes(e.angle) ? e.angle : Math.abs(w180(L("moon", e.ms) - L(b, e.ms) - e.angle)) < 1 ? e.angle : 360 - e.angle;
        assert.ok(Math.abs(w180(L("moon", e.ms) - L(b, e.ms) - tg)) * 3600 <= 1, `${b} ${e.atUtc}`);
      });
      n += lib.length;
    }
    console.log(`  bilgi: ${n} kesinleşme; en büyük an farkı ${worst.toFixed(0)} sn (kaba tarama 1 dk çözünürlük)`);
    assert.ok(n > 5 && worst <= 90);
  });

  await t("E3 istasyonlar ve burç girişleri: 2026 Merkür istasyonları — hız işareti ±2 sa'te ters; Venüs 2026 geri hareketinde Akrep→Terazi girişi `retrograde` işaretli; Ay girişi sınırda 30°'nin katı (≤1″)", () => {
    const y0 = Date.parse("2026-01-01T00:00:00Z");
    const st = findStations("mercury", y0, y0 + 365 * 86_400_000);
    assert.ok(st.length >= 6 && st.length <= 7, `Merkür istasyon sayısı ${st.length}`);
    for (const s of st) {
      const before = speedAt("mercury", s.ms - 2 * 3_600_000);
      const after = speedAt("mercury", s.ms + 2 * 3_600_000);
      assert.ok(Math.sign(before) !== Math.sign(after) && (s.kind === "retrograde") === after < 0, s.atUtc);
    }
    console.log(`  bilgi: Merkür ${st.map((s) => `${s.kind === "retrograde" ? "R" : "D"} ${s.atUtc.slice(0, 16)}`).join(" · ")}`);
    const ing = findIngresses("moon", y0, y0 + 30 * 86_400_000);
    assert.ok(ing.length >= 12 && ing.length <= 14);
    for (const g of ing) assert.ok(Math.abs(w180(L("moon", g.ms) - Math.round(L("moon", g.ms) / 30) * 30)) * 3600 <= 1);
    // 2026 Merkür geri dönemleri burç içinde kalır; Venüs 3 Eki–13 Kas geri: Akrep 8° → Terazi 22°.
    const vi = findIngresses("venus", Date.parse("2026-10-01T00:00:00Z"), Date.parse("2026-11-30T00:00:00Z"));
    assert.ok(vi.some((g) => g.retrograde && g.from === "scorpio" && g.to === "libra"), JSON.stringify(vi.map((g) => [g.from, g.to, g.retrograde])));
  });

  await t("E4 Ay'ın seyri ↔ #438 moonContext sözleşmesi: 14 an; boşlukta = burç içinde kesinleşme yok (bağımsız 30 dk tarama); son açı ≤ an < sonraki < giriş; dış gezegen varyantı ayrı", () => {
    let voc = 0;
    let probe = Date.parse("2026-10-07T09:00:00Z");
    const instants = [probe, Date.parse("2026-03-15T00:00:00Z"), Date.parse("2027-01-20T18:30:00Z")];
    for (let k = 0; k < 11; k++) {
      const g = findIngresses("moon", probe, probe + 3 * 86_400_000)[0];
      instants.push(g.ms - 3 * 3_600_000);
      probe = g.ms + 3_600_000;
    }
    for (const ms of instants) {
      const mc = moonCourse(ms);
      const ing = Date.parse(mc.ingressUtc);
      let any = false;
      for (const b of CLASSICAL_PLANETS.filter((x) => x !== "moon")) for (const ang of [0, 60, 90, 120, 180]) for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
        for (let x = ms; x < ing && !any; x += 30 * 60_000) {
          const z = Math.min(x + 30 * 60_000, ing);
          const fa = w180(L("moon", x) - L(b, x) - tg);
          const fz = w180(L("moon", z) - L(b, z) - tg);
          if (Math.sign(fa) !== Math.sign(fz) && Math.abs(fa - fz) < 90) any = true;
        }
      }
      assert.equal(mc.voidOfCourse, !any, new Date(ms).toISOString());
      if (mc.last) assert.ok(mc.last.ms <= ms);
      for (const e of mc.nextInSign) assert.ok(e.ms > ms && e.ms < ing);
      if (mc.voidOfCourse) voc++;
      if (!mc.voidOfCourseWithOuter) assert.equal(mc.voidOfCourse, false, "dış gezegen eklemek boşluğu yalnız bozabilir");
    }
    console.log(`  bilgi: ${instants.length} an, ${voc} boşlukta`);
    assert.ok(voc > 0);
  });

  await t("E5 refranation özelliği: 2026 Merkür geri dönüşlerinden önceki her yaklaşan Merkür açısı ya kesinleşir ya da refranation adayıdır; aday ise en küçük uzaklık > 0 ve önünde Merkür/diğer istasyonu var", () => {
    const st = findStations("mercury", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2027-01-01T00:00:00Z")).filter((s) => s.kind === "retrograde");
    let seen = 0;
    for (const s of st) {
      const t0 = s.ms - 5 * 86_400_000;
      for (const other of CLASSICAL_PLANETS.filter((x) => x !== "mercury" && x !== "moon")) {
        const pa = analyzePair("mercury", other, t0, 40, () => []);
        if (!pa.now.applying) continue;
        if (pa.refranation) {
          seen++;
          assert.ok(pa.refranation.minOrb > 0 && pa.refranation.stations.length > 0);
          assert.ok(!pa.perfection || Date.parse(pa.perfection.atUtc) > Date.parse(pa.refranation.atUtc) || pa.perfection.angle !== pa.now.angle);
        }
      }
    }
    console.log(`  bilgi: ${st.length} geri istasyon öncesi ${seen} refranation adayı`);
    assert.ok(seen > 0, "en az bir gerçek refranation örneği sınanmalı");
  });

  await t("E6 ışık aktarımı (Ay aktaran) özelliği: aday → Ay'ın 'from' ile son kesinleşmesi an'dan önce ve an'dan sonraki İLK kesinleşmesi 'to' ile (bağımsız 10 dk tarama); 2026-10-28 İstanbul örneği Mars→Satürn", () => {
    const ms = Date.parse("2026-10-28T14:35:00Z");
    const pa = analyzePair("mars", "saturn", ms, 120, () => []);
    const tr = pa.translations.find((x) => x.by === "moon");
    assert.ok(tr && tr.from === "mars" && tr.to === "saturn" && tr.introduction);
    // Bağımsız: Ay'ın t0'dan sonraki ilk Ptolemaik kesinleşmesi (6 gezegen) hangisiyle?
    let firstBody: string | null = null;
    for (let x = ms; x < ms + 3 * 86_400_000 && !firstBody; x += 10 * 60_000) {
      for (const b of CLASSICAL_PLANETS.filter((y) => y !== "moon")) for (const ang of [0, 60, 90, 120, 180]) for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
        const fa = w180(L("moon", x) - L(b, x) - tg);
        const fz = w180(L("moon", x + 10 * 60_000) - L(b, x + 10 * 60_000) - tg);
        if (!firstBody && Math.sign(fa) !== Math.sign(fz) && Math.abs(fa - fz) < 90) firstBody = b;
      }
    }
    assert.equal(firstBody, "saturn");
    assert.ok(Date.parse(tr!.separatedAt) < ms);
    // s. 125 şartı: Ay, Mars'ın asaletinde mi (ev/üçlü/terim)? Ay İkizler 8° → Mars hiçbirinde değil → judgement.ok = false.
    assert.equal(tr!.judgement.ok, false);
  });

  await t("E7 engelleme / hüsran sınıfı: kesinleşme yoksa liste BOŞ (gürültü yok); varsa her olay a–b kesinleşmesinden önce ve üçüncü gezegen içerir", () => {
    const ms = Date.parse("2026-10-28T14:35:00Z");
    const none = analyzePair("mars", "saturn", ms, 120, () => []);
    assert.equal(none.perfection, null);
    assert.equal(none.interpositions.length, 0);
    const pa = analyzePair("moon", "jupiter", ms, 10, () => []);
    assert.ok(pa.perfection, "Ay–Jüpiter 10 gün içinde kesinleşir");
    for (const i of pa.interpositions) assert.ok(i.ms < pa.perfection!.ms && i.third !== "moon" && i.third !== "jupiter" && ["prohibition", "frustration", "faster_significator_elsewhere", "unresolved"].includes(i.kind));
    console.log(`  bilgi: Ay–Jüpiter ${pa.perfection!.angle}° ${pa.perfection!.atUtc}; araya giren ${pa.interpositions.length}`);
  });

  // ── Asalet / Lilly tabloları ───────────────────────────────────────────────────────────────────
  // H-04-01: CA 1647 s. 107 tıpkıbasım görseli — iki sütun; varsayılan birinci sütun (önceki karışık tablo kaldırıldı).
  await t("D1 tablo sağlamaları: Lilly orbları CA s. 107 birinci sütun varsayılan (Satürn 10, Jüpiter 12, Mars 7°30′, Güneş 17, Venüs 8, Merkür 7, Ay 12°30′); ortalama hızlar (Mars 31′27″ tıpkıbasımla); teyitsiz kalem yalnız sabit yıldız", () => {
    assert.deepEqual(LILLY_ORB, { saturn: 10, jupiter: 12, mars: 7.5, sun: 17, venus: 8, mercury: 7, moon: 12.5 });
    assert.ok(Math.abs(MEAN_MOTION.sun - (59 / 60 + 8 / 3600)) < 1e-12 && Math.abs(MEAN_MOTION.moon - 13.176667) < 1e-5);
    // 2026-10-28 tıpkıbasım görsel teyidi: 3. ev +1, doğrudan +4 (1647 n148), ışın altı −4 (1659 n148), Mars 31′27″ (1659 s. 65).
    assert.deepEqual(MEAN_MOTION_UNVERIFIED, []);
    assert.deepEqual(ACCIDENTAL_UNVERIFIED, ["stars:position-and-orb"]);
    assert.ok(Math.abs(MEAN_MOTION.mars - (31 / 60 + 27 / 3600)) < 1e-12);
    assert.ok(TERMS.lilly && !("ptolemaic" in TERMS));
  });

  await t("D2 yanma burç şartı (CA s. 113) + doğulu/batılı (CA s. 114) + partile (CA s. 106): sınır örnekleri", () => {
    const P1 = PROFILE_LILLY_1647;
    assert.deepEqual(solarPhase(29.5, 31, P1), { phase: "under_beams", distance: 1.5, crossSign: true });
    assert.equal(solarPhase(30.5, 31, P1).phase, "combust");
    assert.equal(solarPhase(30.9, 31, P1).phase, "cazimi");
    assert.equal(solarPhase(29.9, 30.1, P1).crossSign, true, "cazimi burç sınırında: kaynak sessiz → işaret");
    assert.equal(oriental("mars", 100, 120), true);
    assert.equal(oriental("mars", 140, 120), false);
    assert.equal(oriental("venus", 110, 120), true);
    assert.equal(oriental("moon", 20, 120), true, "Ay karşıtlıktan kavuşuma (küçülen) doğulu");
    assert.equal(oriental("moon", 250, 120), false, "Ay kavuşumdan karşıtlığa (büyüyen) batılı");
    assert.equal(partile(9.4, 129.9, 120), true);
    assert.equal(partile(9.4, 130.1, 120), false);
    assert.equal(partile(1.2, 61.7, 60), true);
    assert.equal(partile(29.5, 89.5, 60), true, "Koç 29,5° ↔ İkizler 29,5° (2 burç)");
    assert.equal(partile(29.5, 119.5, 60), false, "aynı derece ama 3 burç → kare, altmışlık değil");
  });

  await t("D3 arızi asalet örneği (elle hesap): Mars Aslan 16°53′ 5. evde, doğrudan 0,514°/g, Güneş Akrep 5° → ev 5 +3, doğrudan +4, yavaş (0,514 < 0,524) −2, doğulu +2, yanmadan uzak +5 = 12", () => {
    const pos = { saturn: 9.506, jupiter: 143.898, mars: 136.895, sun: 215.188, venus: 208.076, mercury: 229.651, moon: 68.309 } as Record<ClassicalPlanet, number>;
    const a = accidentalDignity({ planet: "mars", lon: pos.mars, speed: 0.5143, house: 5, positions: pos, northNode: null, stars: { mode: "none", orb: null } }, PROFILE_LILLY_1647);
    assert.deepEqual(a.items.map((i) => [i.key, i.points]), [["house_5", 3], ["direct", 4], ["slow", -2], ["oriental", 2], ["free_from_combustion", 5]]);
    assert.equal(a.total, 12);
    // Kuşatılma: Venüs Koç 13° Mars 10° ile Satürn 15° arasında (CA s. 114 örneği).
    const pos2 = { ...pos, saturn: 15, mars: 10, venus: 13 };
    const b = accidentalDignity({ planet: "venus", lon: 13, speed: 1.2, house: 1, positions: pos2, northNode: null, stars: { mode: "none", orb: null } }, PROFILE_LILLY_1647);
    assert.ok(b.items.some((i) => i.key === "besieged_saturn_mars" && i.points === -5));
  });

  await t("D4 Lilly'nin peregrine örneği (CA s. 112): Satürn Koç 10° peregrine; Koç 27–28°'de kendi teriminde → peregrine DEĞİL; Güneş Terazi'de peregrine (düşüşte de olsa)", () => {
    assert.equal(essentialDignity("saturn", 10, true, PROFILE_LILLY_1647).peregrine, true);
    assert.equal(essentialDignity("saturn", 27.5, true, PROFILE_LILLY_1647).peregrine, false);
    const sunLib = essentialDignity("sun", 195, true, PROFILE_LILLY_1647);
    assert.ok(sunLib.peregrine && sunLib.fall);
  });

  // ── Soru haritası ──────────────────────────────────────────────────────────────────────────────
  await t("C1 soru haritası İstanbul 2026-10-28 14:35Z: Regiomontanus = swetest; sect irtifa ile (gündüz, +4,5°); Güneş–Mars ev yöneticiliğiyle karşılıklı kabul (+5); Venüs farklı burçta 7° → ışın altı (yanık DEĞİL)", () => {
    const c = buildWesternHoraryChart({ questionUtc: "2026-10-28T14:35:00Z", latitude: 41.0082, longitude: 28.9784, profile: PROFILE_LILLY_1647 });
    assert.ok(!("error" in c));
    if ("error" in c) return;
    for (let k = 0; k < 12; k++) assert.ok(Math.abs(w180(c.cusps[k] - cuspOf(SWE.ist, k + 1))) * 3600 < 1);
    assert.equal(c.sect.day, true);
    assert.ok(Math.abs(c.sect.sunAltitude - 4.54) < 0.05);
    const sun = c.planets.find((p) => p.planet === "sun")!;
    const mars = c.planets.find((p) => p.planet === "mars")!;
    assert.deepEqual(sun.mutualReception, [{ with: "mars", by: "domicile", points: 5 }]);
    assert.deepEqual(mars.mutualReception, [{ with: "sun", by: "domicile", points: 5 }]);
    assert.equal(c.planets.find((p) => p.planet === "venus")!.solar!.phase, "under_beams");
    assert.equal(c.partOfFortune.formula, "lilly_same");
    assert.equal(c.houseSystem, "regiomontanus");
  });

  await t("C2 sect irtifası ↔ astronomy-engine Horizon (kırılmasız, gerçek Güneş RA/dek) — 60 an, kutup dahil (Tromsø/Svalbard): işaret 60/60, |fark| ≤0,02°", () => {
    let worst = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 60; i++) {
      const ms = Date.parse("2026-01-01T00:00:00Z") + rnd() * 365 * 86_400_000;
      const lat = i < 10 ? 69.65 + rnd() * 9 : (rnd() * 2 - 1) * 70;
      const lon = (rnd() * 2 - 1) * 180;
      const fr = skyFrameAt(ms, lat, lon);
      if ("error" in fr) continue;
      const sunLon = L("sun", ms);
      const mine = sunAltitude(sunLon, fr.ramc, lat, fr.obliquity);
      const obs = new Astronomy.Observer(lat, lon, 0);
      const eq = Astronomy.Equator(Astronomy.Body.Sun, new Date(ms), obs, true, true);
      const ref = Astronomy.Horizon(new Date(ms), obs, eq.ra, eq.dec).altitude;
      worst = Math.max(worst, Math.abs(mine - ref));
      if (Math.abs(ref) > 0.05) assert.equal(mine > 0, ref > 0);
    }
    console.log(`  bilgi: en büyük irtifa farkı ${worst.toFixed(4)}° (Güneş enlemi β ≠ 0 ve topo-/geosantrik paralaks)`);
    assert.ok(worst <= 0.02);
  });

  await t("C3 gezegen saati ↔ GERÇEK Roxy panchang/hora (İstanbul 2026-11-01, Pazar): 24 saatin her birinin ORTA anında yönetici aynı; sınır farkı (gün doğumu tanımı) raporlanır", () => {
    const g = JSON.parse(readFileSync(join(FX, "golden", "vedic-panchang-hora.json"), "utf8"));
    const tz = g.body.timezone as number;
    const rows = [...g.response.dayHoras, ...g.response.nightHoras];
    assert.equal(rows.length, 24);
    let worstBoundary = 0;
    for (const h of rows) {
      const s = Date.parse(`${h.start}Z`) - tz * 3_600_000;
      const e = Date.parse(`${h.end}Z`) - tz * 3_600_000;
      const mine = planetaryHour((s + e) / 2, g.body.latitude, g.body.longitude);
      assert.ok(mine, h.start);
      assert.equal(mine!.hourRuler, String(h.planet).toLowerCase(), `${h.number} ${h.start}`);
      worstBoundary = Math.max(worstBoundary, Math.abs(Date.parse(mine!.startUtc) - s) / 60_000);
    }
    console.log(`  bilgi: 24/24 yönetici aynı; saat başlangıcı en büyük fark ${worstBoundary.toFixed(1)} dk (Roxy dakikaya yuvarlar; gün doğumu tanımı farkı)`);
    assert.ok(worstBoundary <= 5);
  });

  await t("C4 sağlayıcı anlık görüntüsü tutarlılığı: GERÇEK Roxy natal golden 1990 İstanbul → ok; ASC 0,1° bozulunca ok=false (sessiz düzeltme yok)", () => {
    const G = JSON.parse(readFileSync(join(FX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
    const planets: Record<string, { lon: number; speed: number }> = {};
    for (const p of G.planets) if (NAMES[p.name]) planets[NAMES[p.name]] = { lon: p.longitude, speed: p.speed };
    const base = { questionUtc: "1990-07-15T11:30:00Z", latitude: 41.0082, longitude: 28.9784, profile: PROFILE_LILLY_1647 };
    const ok = buildWesternHoraryChart({ ...base, provider: { planets, asc: G.ascendant.longitude, mc: G.midheaven.longitude } });
    assert.ok(!("error" in ok) && ok.consistency!.ok, JSON.stringify(!("error" in ok) && ok.consistency));
    if (!("error" in ok)) console.log(`  bilgi: Roxy ↔ yerel boylam ${(ok.consistency!.maxPlanetLonDiff * 3600).toFixed(1)}″, hız ${(ok.consistency!.maxSpeedDiff * 3600).toFixed(1)}″/g, ASC ${(ok.consistency!.ascDiff * 3600).toFixed(1)}″, MC ${(ok.consistency!.mcDiff * 3600).toFixed(1)}″`);
    const bad = buildWesternHoraryChart({ ...base, provider: { planets, asc: G.ascendant.longitude + 0.1, mc: G.midheaven.longitude } });
    assert.ok(!("error" in bad) && bad.consistency!.ok === false);
  });

  await t("C5 dikkat noktaları kanıtlı: ASC <3° ve ≥27° anları bulunur; Ay boşlukta anında 'moon_void_of_course'; her kayıtta kanıt metni dolu", () => {
    const base = Date.parse("2026-11-05T00:00:00Z");
    let early = false;
    let late = false;
    for (let m = 0; m < 24 * 60 && !(early && late); m += 4) {
      const c = buildWesternHoraryChart({ questionUtc: new Date(base + m * 60_000).toISOString(), latitude: 41.0082, longitude: 28.9784, profile: PROFILE_LILLY_1647 });
      if ("error" in c) continue;
      for (const k of c.considerations) assert.ok(k.evidence.length > 0);
      early ||= c.considerations.some((k) => k.key === "asc_early");
      late ||= c.considerations.some((k) => k.key === "asc_late");
    }
    assert.ok(early && late);
    const g = findIngresses("moon", base, base + 3 * 86_400_000)[0];
    const near = buildWesternHoraryChart({ questionUtc: new Date(g.ms - 60_000).toISOString(), latitude: 41.0082, longitude: 28.9784, profile: PROFILE_LILLY_1647 });
    assert.ok(!("error" in near));
    if (!("error" in near) && near.moon.voidOfCourse) assert.ok(near.considerations.some((k) => k.key === "moon_void_of_course"));
  });

  await t("C6 ürün izolasyonu: horary/western hiçbir route/motor/ekran tarafından import EDİLMEZ; teknik kaydı ve UI listesi değişmedi", () => {
    const grepDirs = ["app", "lib/astrology/engine", "lib/astrology/report", "lib/astrology/analyses"];
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(join(process.cwd(), d), { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && readFileSync(join(process.cwd(), p), "utf8").includes("horary/western")) hits.push(p);
      }
    };
    for (const d of grepDirs) walk(d);
    assert.deepEqual(hits, []);
    const tech = readFileSync(join(process.cwd(), "lib/astrology/engine/techniques.ts"), "utf8");
    assert.ok(!/western\.horary/.test(tech));
  });

  console.log(`\nastrology horary-western-02 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});

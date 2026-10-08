/**
 * ASTROLOJİ AŞAMA 6 harness'i — KP (Krishnamurti Paddhati), hesap motoru Roxy.
 *
 * 6B/6C/6D KP haritası: golden eşleme · fail-closed · BAĞIMSIZ doğrulama (yalnız bu dosyada):
 *   – astronomy-engine tropikal − KP ayanamsa; Lahiri D1 golden'ıyla sabit fark (= iki ayanamsa farkı)
 *   – bağımsız Placidus (yarı-yay yinelemesi) cusp'ları
 *   – İKİNCİ, tamsayı yay-saniyesi tabanlı KP alt bölüm tablosu (star / sub / sub-sub / KP no.) + sınır testleri
 *   – Placidus ev yerleşimi; KP 4 düzey significator kuralı
 * Sonraki alt aşamalar bu dosyaya eklenir. Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase6.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlan6 } from "./golden/phase6-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique, traditionOfKey, traditionOfTechnique } from "@/lib/astrology/topics/index";
import { KP_KINDS, VEDIC_KINDS, VEDIC_SPECS, parseVedicTopicKey, vedicArgOptions, vedicDefaultParts, vedicTopicKey } from "@/lib/astrology/topics/vedic";
import { placidusHouse, projectRoxyKpChart } from "@/lib/astrology/providers/roxy/kp";
import { kpLordCandidates, kpSpan, kpTable } from "@/lib/astrology/verify/kpSub";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { NAKSHATRA_LORDS, VIMSHOTTARI_YEARS, type VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_LORDS, type KpChartTechnical } from "@/lib/astrology/model/kp";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const KC = load("kp-chart");
const D1 = load("vedic-d1");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
const NAME: Record<string, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };
const BIRTH = { date: KC.body.date, time: KC.body.time, latitude: KC.body.latitude, longitude: KC.body.longitude, timezone: KC.body.timezone };
const proj = (r: J = KC.response, ay: "kp-newcomb" | "kp-old" = "kp-newcomb") => projectRoxyKpChart(r, { ayanamsa: ay, nodeType: "mean", birth: BIRTH }) as J;
const kpTech = () => {
  const p = proj();
  assert.ok(p.ok, JSON.stringify(p.errors));
  return p.technical as KpChartTechnical;
};

type Call = { endpoint: string; body: Record<string, unknown> };
function roxy() {
  const calls: Call[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-6", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      if (endpoint !== KC.endpoint) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(KC.response);
      // SENTETİK yankı (yalnız anahtar ayrımı testi): kp-old istenirse tip yankısı.
      if (body.ayanamsa !== "kp-newcomb") r.meta.ayanamsaType = body.ayanamsa;
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  };
  return { calls, deps };
}
async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, preview = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: preview });
const KSEL = (options: Record<string, unknown> = {}) => ({ technique: "kp.chart", options });

// ─── BAĞIMSIZ referanslar (yalnız test) ──────────────────────────────────────
const D2R = Math.PI / 180;
const n360 = (x: number) => ((x % 360) + 360) % 360;
/** Bağımsız Placidus (tropikal): ASC/MC kapalı formül; 11/12/2/3 yarı-yay yinelemesi; 4–9 karşıtlar. */
function placidusTropical(utcIso: string, lat: number, lonE: number): number[] {
  const tm = Astronomy.MakeTime(new Date(utcIso));
  const ramc = n360(Astronomy.SiderealTime(tm) * 15 + lonE);
  const eps = Astronomy.e_tilt(tm).tobl * D2R;
  const phi = lat * D2R;
  const R = ramc * D2R;
  const mc = n360(Math.atan2(Math.sin(R), Math.cos(R) * Math.cos(eps)) / D2R);
  const asc = n360(Math.atan2(Math.cos(R), -(Math.sin(R) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / D2R);
  const raToLon = (ra: number) => n360(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps)) / D2R);
  const cusp = (f: number, above: boolean) => {
    let lam = raToLon(above ? ramc + 90 * f : ramc + 180 - 90 * f);
    for (let i = 0; i < 100; i++) {
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam * D2R));
      const ad = Math.asin(Math.max(-1, Math.min(1, Math.tan(phi) * Math.tan(dec)))) / D2R;
      const ra = above ? ramc + f * (90 + ad) : ramc + 180 - f * (90 - ad);
      lam = raToLon(ra);
    }
    return lam;
  };
  const c11 = cusp(1 / 3, true);
  const c12 = cusp(2 / 3, true);
  const c2 = cusp(2 / 3, false);
  const c3 = cusp(1 / 3, false);
  const base = [asc, c2, c3, n360(mc + 180), 0, 0, 0, 0, 0, mc, c11, c12];
  for (let h = 4; h < 10; h++) base[h] = n360(base[h - 6 < 0 ? h + 6 : h - 6] + 180);
  base[4] = n360(c11 + 180);
  base[5] = n360(c12 + 180);
  base[6] = n360(asc + 180);
  base[7] = n360(c2 + 180);
  base[8] = n360(c3 + 180);
  return base;
}
/** İKİNCİ bağımsız KP tablosu: tamsayı birim = 1/120 yay-saniyesi (tüm sınırlar tam sayı). */
const U = 120; // birim/″
const NAK_U = 48000 * U; // 13°20′ = 48000″
function kpIndependent(lonDeg: number): { star: VedicGrahaId; sub: VedicGrahaId; subSub: VedicGrahaId; kp: number } {
  // Ondalık derece → en yakın 1/120″ (floor, 26.7 gibi tam sınırları kayan nokta yüzünden önceki dilime düşürürdü).
  const x = Math.round(n360(lonDeg) * 3600 * U) % (360 * 3600 * U);
  const ni = Math.floor(x / NAK_U);
  const star = NAKSHATRA_LORDS[ni % 9];
  let pos = x - ni * NAK_U;
  const order = (l: VedicGrahaId) => Array.from({ length: 9 }, (_, k) => NAKSHATRA_LORDS[(NAKSHATRA_LORDS.indexOf(l) + k) % 9]);
  let sub = star;
  let subW = 0;
  for (const l of order(star)) {
    const w = (NAK_U / 120) * VIMSHOTTARI_YEARS[l]; // tam sayı (400″ × yıl × U)
    if (pos < w) {
      sub = l;
      subW = w;
      break;
    }
    pos -= w;
  }
  let subSub = sub;
  for (const l of order(sub)) {
    const w = (subW * VIMSHOTTARI_YEARS[l]) / 120;
    if (pos < w) {
      subSub = l;
      break;
    }
    pos -= w;
  }
  // KP numarası: zodyak boyunca sub'ları say; burç sınırını (30° = 108000″·U) kesen sub iki numara alır.
  let kp = 0;
  let acc = 0;
  for (let n = 0; n < 27; n++)
    for (const l of order(NAKSHATRA_LORDS[n % 9])) {
      const w = (NAK_U / 120) * VIMSHOTTARI_YEARS[l];
      const a = acc;
      const b = acc + w;
      const cut = (Math.floor(a / (108000 * U)) + 1) * 108000 * U;
      if (b > cut) {
        kp++;
        if (x >= a && x < cut) return { star, sub, subSub, kp };
        kp++;
        if (x >= cut && x < b) return { star, sub, subSub, kp };
      } else {
        kp++;
        if (x >= a && x < b) return { star, sub, subSub, kp };
      }
      acc = b;
    }
  return { star, sub, subSub, kp: 249 };
}
const pointsOf = (r: J) => [["ascendant", r.ascendant], ...r.cusps.map((c: J) => [`cusp${c.house}`, c]), ...r.planets.map((p: J) => [p.planet, p]), ["Rahu", r.nodes.rahu], ["Ketu", r.nodes.ketu]] as [string, J][];

async function main() {
  // ═══ 6B — KP natal çekirdeği ═════════════════════════════════════════════════
  await t("6B golden: fixture = ürün gövdesi (kp-newcomb, mean düğüm, tz = DOĞUM ofseti açık); yanıt meta yankısı = gövde; Placidus", () => {
    const g = goldenPlan6().find((x) => x.name === "kp-chart")!;
    assert.deepEqual(KC.body, JSON.parse(JSON.stringify(g.body)));
    assert.equal(KC.body.timezone, 3, "Roxy KP varsayılanı 5.5 — açık gönderilmeli");
    assert.deepEqual([KC.body.ayanamsa, KC.body.nodeType], ["kp-newcomb", "mean"]);
    assert.ok(!/api[_-]?key|x-api-key|Bearer |Sentetik/i.test(JSON.stringify(KC)));
    const u = getTechnique("kp.chart")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { ayanamsa: "kp-newcomb", nodeType: "mean" })[0];
    assert.deepEqual(JSON.parse(JSON.stringify(u.body)), KC.body);
    assert.equal(u.endpoint, "/vedic-astrology/kp/chart");
    assert.equal(KC.response.meta.houseSystem, "placidus");
  });

  await t("6B projeksiyon: bilinmeyen 0 / düşürülen 0; 12 cusp + 9 gövde + 9×4 significator; houseThemes (anlatı) yalnız yorumda", () => {
    const p = proj();
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
    const v = p.technical as KpChartTechnical;
    assert.equal(v.cusps.length, 12);
    assert.deepEqual(v.bodies.map((b) => b.id), ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"]);
    assert.equal(v.significators.planets.length, 9);
    assert.equal(v.significators.houses.length, 12);
    const themes = Object.values(KC.response.houseThemes as Record<string, string[]>).flat();
    assert.ok(!themes.some((w) => JSON.stringify(v).includes(`"${w}"`)), "teknikte anlatı");
    assert.equal(p.interpretation.houseThemes.length, 12);
    assert.equal(v.bodies.find((b) => b.id === "saturn")!.retrograde, true);
    assert.equal(v.bodies.find((b) => b.id === "rahu")!.retrograde, null, "düğümde retro alanı yok → null (uydurulmaz)");
  });

  await t("6B BAĞIMSIZ: KP boylamları = astronomy-engine tropikal − Roxy KP ayanamsa ≤ 0.01°; Rahu/Ketu ortalama düğüm", () => {
    const tm = Astronomy.MakeTime(new Date(SYNTH_A.utc));
    const ay = KC.response.meta.ayanamsa as number;
    const T = tm.tt / 36525;
    const node = n360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);
    const B: Record<string, Astronomy.Body> = { Sun: Astronomy.Body.Sun, Moon: Astronomy.Body.Moon, Mars: Astronomy.Body.Mars, Mercury: Astronomy.Body.Mercury, Jupiter: Astronomy.Body.Jupiter, Venus: Astronomy.Body.Venus, Saturn: Astronomy.Body.Saturn };
    for (const p of KC.response.planets as J[]) {
      const sid = n360(Astronomy.Ecliptic(Astronomy.GeoVector(B[p.planet], tm, true)).elon - ay);
      assert.ok(Math.abs(((p.longitude - sid + 540) % 360) - 180) <= 0.01, `${p.planet}`);
    }
    assert.ok(Math.abs(((KC.response.nodes.rahu.longitude - n360(node - ay) + 540) % 360) - 180) <= 0.01, "Rahu");
  });

  await t("6B BAĞIMSIZ: Lahiri D1 golden'ı ile fark TÜM 9 noktada sabit ve = Lahiri − KP-Newcomb ayanamsa (≈ 0.0966° / 5′48″); KP < Lahiri", () => {
    const dAy = D1.response.frame.ayanamsaDegrees - KC.response.meta.ayanamsa;
    assert.ok(dAy > 0.09 && dAy < 0.11, `fark ${dAy}`);
    for (const id of Object.keys(NAME)) {
      const kp = id === "rahu" || id === "ketu" ? KC.response.nodes[id].longitude : KC.response.planets.find((p: J) => p.planet === NAME[id]).longitude;
      const lah = D1.response.meta[NAME[id]].longitude;
      assert.ok(Math.abs(kp - lah - dAy) < 3e-4, `${id}: ${(kp - lah).toFixed(5)} vs ${dAy.toFixed(5)}`);
    }
  });

  // ═══ 6C — Cusp ve lord hiyerarşisi ═══════════════════════════════════════════
  await t("6C BAĞIMSIZ: Placidus cusp'ları (yarı-yay yinelemesi, astronomy-engine RAMC + gerçek eğiklik) − KP ayanamsa = Roxy 12 cusp ≤ 0.02°", () => {
    const trop = placidusTropical(SYNTH_A.utc, SYNTH_A.latitude, SYNTH_A.longitude);
    const ay = KC.response.meta.ayanamsa as number;
    for (const c of KC.response.cusps as J[]) {
      const d = Math.abs(((c.longitude - n360(trop[c.house - 1] - ay) + 540) % 360) - 180);
      assert.ok(d <= 0.02, `cusp ${c.house}: Δ${d.toFixed(4)}°`);
    }
  });

  await t("6C BAĞIMSIZ: star / sub / sub-sub lord + KP numarası — İKİNCİ (tamsayı yay-saniyesi) tablo ile 22 noktanın tamamı aynı (Asc + 12 cusp + 7 graha + 2 düğüm)", () => {
    const pts = pointsOf(KC.response);
    assert.equal(pts.length, 22);
    for (const [n, p] of pts) {
      const ind = kpIndependent(p.longitude);
      assert.deepEqual([ind.star, ind.sub, ind.subSub, ind.kp], [String(p.starLord).toLowerCase(), String(p.subLord).toLowerCase(), String(p.subSubLord).toLowerCase(), p.kpNumber], n);
      assert.equal(SIGN_LORDS[SIGN_IDS[Math.floor(p.longitude / 30)]], String(p.signLord).toLowerCase(), `${n} burç lordu`);
    }
  });

  await t("6C KP tablosu: 249 numara; iki uygulama 0–360° boyunca (0.001° adım) birebir; yayımlanmış örnekler (1 = Koç 0°00′–0°46′40″ Ketu/Ketu; 108 = 153°–155°06′40″; 249 Balık sonu)", () => {
    assert.equal(kpTable().length, 249);
    for (let i = 0; i < 360000; i++) {
      const lon = i / 1000;
      const a = kpLordCandidates(lon, 0)[0];
      const b = kpIndependent(lon);
      assert.deepEqual([a.star, a.sub, a.subSub, a.kpNumber], [b.star, b.sub, b.subSub, b.kp], `${lon}`);
    }
    const s1 = kpSpan(1)!;
    assert.ok(Math.abs(s1.start) < 1e-9 && Math.abs(s1.end - 46 / 60 - 40 / 3600) < 1e-9);
    assert.equal(kpTable()[0].star, "ketu");
    assert.equal(kpTable()[0].sub, "ketu");
    const s108 = kpSpan(108)!;
    assert.ok(Math.abs(s108.start - 153) < 1e-9 && Math.abs(s108.end - (155 + 1 / 9)) < 1e-6, JSON.stringify(s108));
    assert.ok(Math.abs(kpSpan(249)!.end - 360) < 1e-9);
    // Burç sınırını kesen 6 sub iki numara alır: 243 + 6 = 249.
    assert.equal(kpTable().filter((r) => Math.abs(r.start % 30) < 1e-9 && r.start > 0).length, 11);
  });

  await t("6C sınır/yuvarlama: nakshatra ve sub sınırının 1e-5° iki yanında doğru lord; 4 ondalık sağlayıcı boylamı sınıra 1e-4°'den yakınsa İKİ komşu da kabul (yanlış ret yok), uzaksa tek aday", () => {
    const b = 360 / 27; // Bharani başlangıcı
    assert.equal(kpIndependent(b - 1e-5).star, "ketu");
    assert.equal(kpIndependent(b + 1e-5).star, "venus");
    const subEdge = kpTable()[1].start; // Ashwini 2. sub (Venüs) başlangıcı
    assert.deepEqual([kpIndependent(subEdge - 1e-5).sub, kpIndependent(subEdge + 1e-5).sub], ["ketu", "venus"]);
    const near = kpLordCandidates(subEdge + 5e-5);
    assert.ok(near.length === 2 && near.some((c) => c.sub === "ketu") && near.some((c) => c.sub === "venus"));
    assert.equal(kpLordCandidates(subEdge + 0.01).length, 1);
    // Ay 359.3324° → KP 249 (zodyağın son sub'ı).
    assert.equal(kpIndependent(359.3324).kp, 249);
  });

  await t("6C BAĞIMSIZ: gezegen evleri = bağımsız Placidus cusp aralığı (9/9); cusp'lar karşıt (h, h+6) 180°; ASC = cusp 1", () => {
    const trop = placidusTropical(SYNTH_A.utc, SYNTH_A.latitude, SYNTH_A.longitude);
    const ay = KC.response.meta.ayanamsa as number;
    const cusps = trop.map((l, i) => ({ house: i + 1, longitude: n360(l - ay) }));
    for (const b of kpTech().bodies) assert.equal(placidusHouse(b.longitude, cusps), b.house, b.id);
    const v = kpTech();
    for (let h = 0; h < 6; h++) assert.ok(Math.abs(((v.cusps[h + 6].longitude - v.cusps[h].longitude + 360) % 360) - 180) < 1e-3);
    assert.equal(v.ascendant.longitude, v.cusps[0].longitude);
  });

  await t("6C KP evleri ≠ Vedik bütün-burç bhava: aynı kişide Venüs KP 8. ev / D1 9. bhava, Mars KP 6. ev / D1 7. bhava (ayrım gösterilir, karıştırılmaz)", () => {
    const v = kpTech();
    const d1House = (id: string) => D1.response.meta[NAME[id]].house;
    assert.deepEqual([v.bodies.find((b) => b.id === "venus")!.house, d1House("venus")], [8, 9]);
    assert.deepEqual([v.bodies.find((b) => b.id === "mars")!.house, d1House("mars")], [6, 7]);
  });

  await t("6B/6C fail-closed: tutarsız sağlayıcı verisi REDDEDİLİR; bilinmeyen alan yalnız YOLUYLA raporlanır", () => {
    const no = (f: (r: J) => void, why: string) => {
      const r = structuredClone(KC.response);
      f(r);
      assert.equal(proj(r).ok, false, why);
    };
    no((r) => (r.meta.ayanamsaType = "lahiri"), "Lahiri çerçevesi KP diye");
    no((r) => (r.meta.houseSystem = "whole_sign"), "bütün-burç");
    no((r) => (r.meta.timezone = 5.5), "IST varsayılanı");
    no((r) => (r.cusps[3].subLord = "Venus"), "cusp sub-lord");
    no((r) => (r.cusps[3].subSubLord = "Sun"), "cusp sub-sub lord");
    no((r) => (r.planets[0].kpNumber = 62), "KP numarası");
    no((r) => (r.planets[0].starLord = "Sun"), "star lord");
    no((r) => (r.planets[0].signLord = "Moon"), "burç lordu");
    no((r) => (r.planets[1].pada = 3), "pada");
    no((r) => (r.cusps[9].longitude = (r.cusps[9].longitude + 1) % 360), "karşıt cusp");
    no((r) => (r.planets[5].house = 9), "Placidus ev");
    no((r) => (r.nodes.ketu.longitude = (r.nodes.rahu.longitude + 170) % 360), "Ketu karşıtı");
    no((r) => (r.ascendant.longitude = r.ascendant.longitude + 0.5), "ASC ≠ cusp 1");
    no((r) => (r.significators.planetWise[0].signifies[0].houses = [10]), "significator çaprazı");
    no((r) => r.significators.houseWise[2].all.push("Sun"), "all düzleştirmesi");
    const r = structuredClone(KC.response);
    r.planets[0].avastha = "GIZLI-KP-ALAN";
    r.kpExtra = { x: "GIZLI-KP-ALAN" };
    const p = proj(r);
    assert.ok(p.ok);
    assert.deepEqual([...p.unmappedFields].sort(), ["kpExtra", "planets[].avastha"]);
    assert.ok(!JSON.stringify(p.technical).includes("GIZLI"));
  });

  // ═══ 6D — Significator ═══════════════════════════════════════════════════════
  await t("6D BAĞIMSIZ: KP 4 düzey (L1 yıldızı sakinde, L2 sakin, L3 yıldızı sahipte, L4 sahip) 7 görünür graha için Roxy ile birebir; sahip = cusp burç lordu", () => {
    const v = kpTech();
    const occ = (h: number) => v.bodies.filter((b) => b.house === h).map((b) => b.id);
    const owns = (id: string) => v.cusps.filter((c) => c.signLord === id).map((c) => c.house);
    for (const b of v.bodies.filter((x) => x.id !== "rahu" && x.id !== "ketu")) {
      const star = b.starLord;
      const L1 = v.cusps.map((c) => c.house).filter((h) => occ(h).includes(star));
      const L2 = [b.house];
      const L3 = owns(star);
      const L4 = owns(b.id);
      const r = v.significators.planets.find((p) => p.id === b.id)!;
      assert.deepEqual([[...r.levels[1]].sort((a, c) => a - c), r.levels[2], [...r.levels[3]].sort((a, c) => a - c), [...r.levels[4]].sort((a, c) => a - c)], [L1, L2, L3, L4], b.id);
    }
  });

  await t("6D düğüm yöntemi (Roxy): Rahu/Ketu significator'ları sade 4-düzey kuralının ÜST KÜMESİ (ajan eki: kavuşan / bakan / burç sahibi) — fark raporlanır, kendi düğüm motorumuz YOK", () => {
    const v = kpTech();
    const occ = (h: number) => v.bodies.filter((b) => b.house === h).map((b) => b.id);
    const owns = (id: string) => v.cusps.filter((c) => c.signLord === id).map((c) => c.house);
    const extra: string[] = [];
    for (const id of ["rahu", "ketu"] as const) {
      const b = v.bodies.find((x) => x.id === id)!;
      const plain = new Set([...v.cusps.map((c) => c.house).filter((h) => occ(h).includes(b.starLord)), b.house, ...owns(b.starLord)]);
      const r = v.significators.planets.find((p) => p.id === id)!;
      const all = new Set([1, 2, 3, 4].flatMap((l) => r.levels[l as 1 | 2 | 3 | 4]));
      for (const h of plain) assert.ok(all.has(h), `${id}: sade kural evi ${h} Roxy listesinde yok`);
      extra.push(`${id}+${[...all].filter((h) => !plain.has(h)).join(",")}`);
    }
    console.log(`     düğüm ajan ekleri (Roxy): ${extra.join(" · ")}`);
  });

  await t("6D tablo tutarlılığı: ev-bazlı ⇔ gezegen-bazlı birebir (12 × 4 × 9); her evin en az bir significator'ı var (L4 sahibi)", () => {
    const v = kpTech();
    for (const h of v.significators.houses) {
      assert.ok(h.levels[4].length >= 1, `ev ${h.house}`);
      for (const l of [1, 2, 3, 4] as const) assert.deepEqual([...new Set(h.levels[l])].sort(), v.significators.planets.filter((p) => p.levels[l].includes(h.house)).map((p) => p.id).sort());
    }
  });

  // ═══ 6B–6D motor + konular + KB + kayıtlı analiz ═════════════════════════════
  await t("6B motor: 1 istek → tekrar 0; kp-old ayrı anahtar; Lahiri/Raman seçeneği REDDEDİLİR (KP haritası Lahiri ile üretilmez); saat yok → TIME_REQUIRED; görünüm maskesi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const b = (await run(ctx, pa, [KSEL()], rx.deps)).body as J;
    assert.ok(b.results[0].ok, JSON.stringify(b).slice(0, 300));
    assert.equal(rx.calls.length, 1);
    await run(ctx, pa, [KSEL()], rx.deps);
    assert.equal(rx.calls.length, 1, "önbellek");
    await run(ctx, pa, [KSEL({ ayanamsa: "kp-old" })], rx.deps);
    assert.equal(rx.calls.length, 2);
    assert.equal(rx.calls[1].body.ayanamsa, "kp-old");
    assert.equal(getTechnique("kp.chart")!.parseOptions({ ayanamsa: "lahiri" }, new Date()), null);
    assert.equal(getTechnique("kp.chart")!.parseOptions({ ayanamsa: "raman" }, new Date()), null);
    assert.deepEqual(getTechnique("kp.chart")!.parseOptions({}, new Date()), { ayanamsa: "kp-newcomb", nodeType: "mean" });
    const bad = (await run(ctx, pa, [KSEL({ ayanamsa: "lahiri" })], rx.deps)).body as J;
    assert.ok(JSON.stringify(bad).includes("INVALID") || JSON.stringify(bad).includes("Geçersiz"), JSON.stringify(bad).slice(0, 200));
    assert.equal(rx.calls.length, 2);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    assert.equal(((await run(ctx, pu, [KSEL()], rx.deps)).body as J).results[0].code, "TIME_REQUIRED");
    assert.equal(rx.calls.length, 2);
    assert.equal(maskTechnical("kp.chart", kpTech(), { primary: false } as J).masked, true);
    assert.equal(maskTechnical("kp.horary", { x: 1 }, { primary: false } as J).masked, false, "horary doğum saatine bağlı değil");
  });

  await t("6H konular: kp_* anahtarları (DB regex) yalnız 'kp' geleneğinde ayrışır; Vedik/Batı ayrıştırıcıları REDDEDER; teknik geleneği kp; not bölümü yalnız kp.chart", () => {
    const keys = topicsForTechnique("kp.chart", kpTech()).map((x) => x.key);
    assert.ok(keys.includes("kp_cusp_sublord:7:saturn") && keys.includes("kp_planet_in_house:venus:8") && keys.includes("kp_significator:sun:11"));
    assert.ok(keys.length >= 36 + 27);
    for (const k of keys) {
      assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
      assert.equal(traditionOfKey(k), "kp", k);
      assert.equal(parseAnyTopicKey("vedic", k), null, k);
      assert.equal(parseAnyTopicKey("western", k), null, k);
      assert.ok(isSectionKeyForTechnique("kp.chart", k) && !isSectionKeyForTechnique("vedic.d1", k) && !isSectionKeyForTechnique("western.natal", k), k);
    }
    assert.equal(parseVedicTopicKey("graha_in_rashi:sun:gemini", "kp"), null, "Vedik anahtar KP'de geçersiz");
    assert.equal(traditionOfTechnique("kp.chart"), "kp");
    assert.ok(isSectionKeyForTechnique("kp.chart", "kp_principle:cusp_sublord_rule"));
    assert.equal(parseAnyTopicKey("kp", "kp_horary_number:250"), null);
    assert.ok(parseAnyTopicKey("kp", "kp_horary_number:249"));
  });

  await t("6H konu seçici: her KP türü × her argüman seçeneği geçerli 'kp' anahtarı üretir; Vedik/Batı'da GEÇERSİZ; DB regex; Vedik türler KP'de geçersiz", () => {
    let n = 0;
    for (const kind of KP_KINDS) {
      const base = vedicDefaultParts(kind);
      VEDIC_SPECS[kind].args.forEach((a, i) => {
        for (const [v] of vedicArgOptions(a)) {
          const parts = [...base];
          parts[i] = v;
          const key = vedicTopicKey(kind, parts);
          assert.ok(parseAnyTopicKey("kp", key), key);
          assert.equal(parseAnyTopicKey("vedic", key), null, key);
          assert.equal(parseAnyTopicKey("western", key), null, key);
          assert.equal(traditionOfKey(key), "kp");
          assert.match(key, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
          n++;
        }
      });
    }
    assert.ok(n > 300, String(n));
    for (const kind of VEDIC_KINDS) assert.equal(parseAnyTopicKey("kp", vedicTopicKey(kind, vedicDefaultParts(kind))), null, kind);
  });

  await t("6H/6I KB + not + kayıtlı analiz: KP kaydı yalnız KP haritasında eşleşir (aynı varlığın Vedik kaydı eşleşmez); not bağlamı ayanamsa+düğüm; kayıtlı analiz 0 istek + KB anlık görüntüsü; yorum kapısı; tenant 404", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [KSEL()], rx.deps);
    await createKb(ctx, { tradition: "kp", topicKey: "kp_cusp_sublord:7:saturn", title: "7. cusp sub-lord Satürn — notum", body: "kp" });
    await createKb(ctx, { tradition: "vedic", topicKey: "graha_in_bhava:venus:9", title: "Vedik kayıt (KP'ye karışmamalı)", body: "v" });
    assert.equal((await createKb(ctx, { tradition: "vedic", topicKey: "kp_cusp_sublord:7:saturn", title: "x", body: "x" })).status, 400, "KP anahtarı Vedik gelenekte kaydedilemez");
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...KSEL() })).body as J;
    assert.equal(ws.noteContext, "ayanamsa:kp-newcomb|nodeType:mean");
    assert.deepEqual(ws.kbMatches.map((e: J) => e.title), ["7. cusp sub-lord Satürn — notum"]);
    const nr = await saveExpertNote(ctx, { profileId: pa, technique: "kp.chart", sectionKey: "kp_cusp_sublord:7:saturn", expectedRevision: null, noteContext: "ayanamsa:kp-newcomb|nodeType:mean", body: "KP evlilik vaadi notu" });
    assert.equal(nr.status, 201, JSON.stringify(nr.body));
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "kp.chart", sectionKey: "graha_in_bhava:venus:9", expectedRevision: null, noteContext: "ayanamsa:kp-newcomb|nodeType:mean", body: "x" })).status, 400, "Vedik bölüm KP notunda");
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "kp.chart", sectionKey: "overall", expectedRevision: null, noteContext: "ayanamsa:lahiri|nodeType:mean", body: "x" })).status, 400);
    // Anahtar kelime dizisinin tamamı (tek kelime not metninde geçebilir).
    const theme = JSON.stringify(KC.response.houseThemes["12"]);
    const vis = JSON.stringify((await run(ctx, pa, [KSEL()], rx.deps)).body);
    const pre = JSON.stringify((await run(ctx, pa, [KSEL()], rx.deps, true)).body);
    const hid = JSON.stringify((await run(ctxOf(store, { entitlements: NO_INTERP }), pa, [KSEL()], rx.deps)).body);
    assert.ok(vis.includes(theme) && !pre.includes(theme) && !hid.includes(theme), "yorum kapısı");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...KSEL(), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = JSON.stringify(((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis);
    assert.equal(rx.calls.length, n, "kayıtlı analiz Roxy çağırdı");
    for (const s of ["KP evlilik vaadi notu", "7. cusp sub-lord Satürn", "astro-roxy-kp-chart-1", "placidus", "kp-newcomb", "astro.kp.chart.v1"]) assert.ok(a.includes(s), s);
    assert.ok(!a.includes("Vedik kayıt (KP"));
    const hidden = JSON.stringify(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis);
    assert.ok(!hidden.includes(theme));
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (sv.body as J).analysisId, false)).status, 404);
  });

  console.log(`\nastrology phase6 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase6 harness çöktü:", e);
  process.exit(1);
});

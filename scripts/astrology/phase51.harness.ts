/**
 * ASTROLOJİ AŞAMA 5.1 harness'i — Vedik eksikler (hesap motoru Roxy).
 *
 * 5.1A Gochara (Vedik transit): golden eşleme · fail-closed · BAĞIMSIZ doğrulama (astronomy-engine, D1 golden,
 *      Ashtakavarga golden + BPHS bindu tabloları, bütün-burç drishti) · motor/önbellek/ayanamsa · Batı transitten
 *      ayrım · konular/KB/notlar/kayıtlı analiz · yorum kapısı.
 * Sonraki alt aşamalar bu dosyaya eklenir. Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase51.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlan51, VEDIC_TRANSIT_GOLDEN_AT } from "./golden/phase51-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique, TECHNIQUE_TOPIC_CONTEXT } from "@/lib/astrology/topics/index";
import { parseVedicTopicKey } from "@/lib/astrology/topics/vedic";
import { projectRoxyVedicTransit, signCount } from "@/lib/astrology/providers/roxy/vedic";
import { vedicTransitBody, vedicTransitLocal } from "@/lib/astrology/providers/roxy/requests";
import { projectRoxyTransit } from "@/lib/astrology/providers/roxy/timing";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { KAKSHA_LORDS, type VedicTransitTechnical } from "@/lib/astrology/model/vedic";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const GT = load("vedic-transit");
const D1 = load("vedic-d1");
const FK = load("vedic-ashtakavarga");
const WT = load("transit");

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
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };

const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown> };
/** Sahte Roxy: golden (GERÇEK yanıt). Golden dışı an için yalnız transitDatetime SENTETİK yankı (önbellek testleri). */
function roxy(opts: { mutate?: (endpoint: string, r: J, body: Record<string, unknown>) => void } = {}) {
  const calls: Call[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-51", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      let r: J;
      if (endpoint === GT.endpoint) {
        r = structuredClone(GT.response);
        r.transitDatetime = `${String(body.transitDate)}T${String(body.transitTime)}`;
      } else if (endpoint === WT.endpoint) r = structuredClone(WT.response);
      else return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      opts.mutate?.(endpoint, r, body);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  };
  return { calls, deps };
}
async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, preview = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: preview });
const TSEL = (options: Record<string, unknown> = { atUtc: VEDIC_TRANSIT_GOLDEN_AT }) => ({ technique: "vedic.transit", options });
const OPTS = { birthLocal: "1990-07-15T14:30:00", transitLocal: "2026-10-07T12:00:00", atUtc: VEDIC_TRANSIT_GOLDEN_AT, utcOffsetHours: 3 };
const proj = (r: J = GT.response) => projectRoxyVedicTransit(r, OPTS) as J;
const tech = () => {
  const p = proj();
  assert.ok(p.ok, JSON.stringify(p.errors));
  return p.technical as VedicTransitTechnical;
};
const NAME: Record<string, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };

// ─── BAĞIMSIZ referans: BPHS Ashtakavarga bindu tabloları (yalnız doğrulama; ürün kodunda YOK) ──────────
// Satır = BAV sahibi graha; sütun = bindu veren (katkıcı); değer = katkıcının konumundan sayılan (kapsayıcı)
// bindu evleri. Kaynak: Brihat Parashara Hora Shastra, Ashtakavarga bölümü (toplamlar 48/49/39/54/56/52/39/49).
const BPHS: Record<string, Record<string, number[]>> = {
  sun: { sun: [1, 2, 4, 7, 8, 9, 10, 11], moon: [3, 6, 10, 11], mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [3, 5, 6, 9, 10, 11, 12], jupiter: [5, 6, 9, 11], venus: [6, 7, 12], saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [3, 4, 6, 10, 11, 12] },
  moon: { sun: [3, 6, 7, 8, 10, 11], moon: [1, 3, 6, 7, 10, 11], mars: [2, 3, 5, 6, 9, 10, 11], mercury: [1, 3, 4, 5, 7, 8, 10, 11], jupiter: [1, 4, 7, 8, 10, 11, 12], venus: [3, 4, 5, 7, 9, 10, 11], saturn: [3, 5, 6, 11], lagna: [3, 6, 10, 11] },
  mars: { sun: [3, 5, 6, 10, 11], moon: [3, 6, 11], mars: [1, 2, 4, 7, 8, 10, 11], mercury: [3, 5, 6, 11], jupiter: [6, 10, 11, 12], venus: [6, 8, 11, 12], saturn: [1, 4, 7, 8, 9, 10, 11], lagna: [1, 3, 6, 10, 11] },
  mercury: { sun: [5, 6, 9, 11, 12], moon: [2, 4, 6, 8, 10, 11], mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [1, 3, 5, 6, 9, 10, 11, 12], jupiter: [6, 8, 11, 12], venus: [1, 2, 3, 4, 5, 8, 9, 11], saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [1, 2, 4, 6, 8, 10, 11] },
  jupiter: { sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], moon: [2, 5, 7, 9, 11], mars: [1, 2, 4, 7, 8, 10, 11], mercury: [1, 2, 4, 5, 6, 9, 10, 11], jupiter: [1, 2, 3, 4, 7, 8, 10, 11], venus: [2, 5, 6, 9, 10, 11], saturn: [3, 5, 6, 12], lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11] },
  venus: { sun: [8, 11, 12], moon: [1, 2, 3, 4, 5, 8, 9, 11, 12], mars: [3, 5, 6, 9, 11, 12], mercury: [3, 5, 6, 9, 11], jupiter: [5, 8, 9, 10, 11], venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], saturn: [3, 4, 5, 8, 9, 10, 11], lagna: [1, 2, 3, 4, 5, 8, 9, 11] },
  saturn: { sun: [1, 2, 4, 7, 8, 10, 11], moon: [3, 6, 11], mars: [3, 5, 6, 10, 11, 12], mercury: [6, 8, 9, 10, 11, 12], jupiter: [5, 6, 11, 12], venus: [6, 11, 12], saturn: [3, 5, 6, 11], lagna: [1, 3, 4, 6, 10, 11] },
  lagna: { sun: [3, 4, 6, 10, 11, 12], moon: [3, 6, 10, 11, 12], mars: [1, 3, 6, 10, 11], mercury: [1, 2, 4, 6, 8, 10, 11], jupiter: [1, 2, 4, 5, 6, 7, 9, 10, 11], venus: [1, 2, 3, 4, 5, 8, 9], saturn: [1, 3, 4, 6, 10, 11], lagna: [3, 6, 10, 11] },
};
/** Natal rashiler (D1 golden) → bağımsız BAV (her satır × 12 burç). */
function bphsBav(natalRashi: Record<string, SignId>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [owner, row] of Object.entries(BPHS)) {
    out[owner] = SIGN_IDS.map((s) => Object.entries(row).filter(([c, houses]) => houses.includes(signCount(natalRashi[c], s))).length);
  }
  return out;
}
const d1Rashis = (): Record<string, SignId> => {
  const m: Record<string, SignId> = {};
  for (const [k, v] of Object.entries(D1.response.meta as Record<string, J>)) m[k.toLowerCase()] = String(v.rashi).toLowerCase() as SignId;
  return m;
};
const PARASHARI: Record<string, number[]> = { sun: [7], moon: [7], mercury: [7], venus: [7], mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10], rahu: [], ketu: [] };

async function main() {
  // ═══ 5.1A — Gochara ══════════════════════════════════════════════════════════
  await t("5.1A golden: fixture = ürün gövdesi; timezone = DOĞUM ofseti; transit saati o ofsette (09:00 UTC → 12:00:00); ayanamsa alanı YOK; coordinateSystem sidereal", () => {
    const g = goldenPlan51().find((x) => x.name === "vedic-transit")!;
    assert.deepEqual(GT.body, JSON.parse(JSON.stringify(g.body)));
    assert.equal(GT.body.timezone, 3);
    assert.equal(GT.body.transitTime, "12:00:00");
    assert.equal(GT.body.coordinateSystem, "sidereal");
    assert.ok(!("ayanamsa" in GT.body));
    assert.ok(!/api[_-]?key|x-api-key|Bearer |Sentetik/i.test(JSON.stringify(GT)));
    const u = getTechnique("vedic.transit")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { ayanamsa: "lahiri", atUtc: VEDIC_TRANSIT_GOLDEN_AT })[0];
    assert.deepEqual(JSON.parse(JSON.stringify(u.body)), GT.body);
    assert.equal(u.endpoint, "/vedic-astrology/transit");
    // Gün sınırı: 22:30 UTC, +3 → ertesi gün 01:30.
    assert.deepEqual(vedicTransitLocal(SYNTH_A, "2026-12-31T22:30"), { date: "2027-01-01", time: "01:30:00" });
    assert.equal(vedicTransitBody({ ...SYNTH_A, utcOffsetSeconds: -5 * 3600 }, "2026-01-01T03:00").transitDate, "2025-12-31");
  });

  await t("5.1A golden projeksiyon: bilinmeyen 0 / düşürülen 0; 9 natal + 9 transit; Batı sözlüğü (aspectsToNatal) ve anlatı teknikte YOK; anlatı yorum katmanında", () => {
    const p = proj();
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
    assert.equal(p.technical.natal.length, 9);
    assert.equal(p.technical.transits.length, 9);
    const tj = JSON.stringify(p.technical);
    for (const w of ["sextile", "trine", "square", "opposition", "aspectsToNatal"]) assert.ok(!tj.includes(w), `teknikte Batı sözlüğü: ${w}`);
    const desc = GT.response.keyTransits.map((k: J) => k.description as string);
    assert.ok(!desc.some((d: string) => tj.includes(d)), "teknikte anlatı");
    assert.ok(desc.every((d: string) => JSON.stringify(p.interpretation).includes(d)), "yorum katmanında anlatı yok");
    assert.deepEqual(p.technical.slow, ["jupiter", "saturn", "rahu", "ketu"]);
    assert.equal(p.technical.frame.ayanamsa, "lahiri");
    assert.equal(p.technical.at.local, "2026-10-07T12:00:00");
  });

  await t("5.1A BAĞIMSIZ: transit boylamları = astronomy-engine tropikal − Lahiri(transit anı) ≤ 0.01°; Rahu/Ketu = ORTALAMA düğüm", () => {
    const tm = Astronomy.MakeTime(new Date(`${VEDIC_TRANSIT_GOLDEN_AT}:00Z`));
    const years = (Date.parse(`${VEDIC_TRANSIT_GOLDEN_AT}:00Z`) - Date.parse(SYNTH_A.utc)) / (365.25 * 864e5);
    // Lahiri presesyon hızı ≈ 50.29″/yıl (doğum anı değeri sağlayıcı frame'inden; transit anı ileri taşınır).
    const ay = GT.response.frame.ayanamsaDegrees + (50.2879 / 3600) * years;
    const T = tm.tt / 36525;
    const meanNode = (((125.0445479 - 1934.1362891 * T + 0.0020754 * T * T) % 360) + 360) % 360;
    const B: Record<string, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mars: Astronomy.Body.Mars, mercury: Astronomy.Body.Mercury, jupiter: Astronomy.Body.Jupiter, venus: Astronomy.Body.Venus, saturn: Astronomy.Body.Saturn };
    for (const x of tech().transits) {
      const trop = B[x.id] ? Astronomy.Ecliptic(Astronomy.GeoVector(B[x.id], tm, true)).elon : x.id === "rahu" ? meanNode : (meanNode + 180) % 360;
      const sid = (((trop - ay) % 360) + 360) % 360;
      const d = Math.abs(((x.longitude - sid + 540) % 360) - 180);
      assert.ok(d <= 0.01, `${x.id}: ${d.toFixed(4)}°`);
    }
  });

  await t("5.1A BAĞIMSIZ: natal = Vedik D1 golden (Lahiri) birebir; Lagna rashisi = D1 Lagna; Janma Rashi = D1 Ay", () => {
    const tt = tech();
    for (const n of tt.natal) {
      const m = D1.response.meta[NAME[n.id]];
      assert.equal(n.longitude.toFixed(4), Number(m.longitude).toFixed(4), n.id);
      assert.equal(n.house, m.house, n.id);
    }
    assert.equal(tt.lagnaRashi, String(D1.response.meta.Lagna.rashi).toLowerCase());
    assert.equal(tt.janmaRashi, String(D1.response.meta.Moon.rashi).toLowerCase());
  });

  await t("5.1A BAĞIMSIZ: BPHS bindu tabloları Roxy Ashtakavarga golden'ını 8×12 aynen üretir → kaksha binduCount = natal BAV, bindu = kaksha yöneticisinin katkısı", () => {
    const nr = d1Rashis();
    const bav = bphsBav(nr);
    for (const row of FK.response.bhinnashtakavarga as J[]) assert.deepEqual(bav[String(row.planet).toLowerCase()], row.bindus, `BAV ${row.planet}`);
    let checked = 0;
    for (const x of tech().transits) {
      if (x.id === "rahu" || x.id === "ketu") {
        assert.deepEqual([x.kaksha.bindu, x.kaksha.binduCount], [null, null]);
        continue;
      }
      const si = SIGN_IDS.indexOf(x.rashi);
      assert.equal(x.kaksha.binduCount, bav[x.id][si], `${x.id} binduCount`);
      const lordHouses = BPHS[x.id][x.kaksha.lord];
      assert.equal(x.kaksha.bindu, lordHouses.includes(signCount(nr[x.kaksha.lord], x.rashi)), `${x.id} kaksha bindu (${x.kaksha.lord})`);
      assert.equal(x.kaksha.number, Math.floor(x.degreeInRashi / 3.75) + 1);
      assert.equal(x.kaksha.lord, KAKSHA_LORDS[x.kaksha.number - 1]);
      checked++;
    }
    assert.equal(checked, 7);
  });

  await t("5.1A BAĞIMSIZ: drishti = Parashari bütün-burç kuralı (Rahu/Ketu yok) — golden listesi kuralla birebir; houseFromMoon / natalHouse burç sayımı", () => {
    const tt = tech();
    const nr = d1Rashis();
    for (const x of tt.transits) {
      const exp = Object.keys(NAME)
        .filter((n) => PARASHARI[x.id].includes(signCount(x.rashi, nr[n])))
        .sort();
      assert.deepEqual(x.drishti.map((d) => d.to).sort(), exp, x.id);
      assert.equal(x.houseFromMoon, signCount(nr.moon, x.rashi));
      assert.equal(x.natalHouse, signCount(nr.lagna, x.rashi));
    }
    // Derece uzaklığına bakılmaz: Jüpiter → natal Rahu 12.09° farkla da tam (bütün-burç) bakıştır.
    assert.ok(tt.transits.find((x) => x.id === "jupiter")!.drishti.some((d) => d.to === "rahu" && d.orb > 12));
  });

  await t("5.1A fail-closed: tutarsız sağlayıcı verisi REDDEDİLİR; bilinmeyen alan yalnız YOLUYLA raporlanır ve sızmaz", () => {
    const no = (f: (r: J) => void, why: string) => {
      const r = structuredClone(GT.response);
      f(r);
      assert.equal(proj(r).ok, false, why);
    };
    no((r) => (r.transitDatetime = "2026-10-07T09:00:00"), "transit anı yankısı");
    no((r) => (r.birthDatetime = "1990-07-15T11:30:00"), "doğum anı yankısı");
    no((r) => (r.frame = { ayanamsa: "tropical", ayanamsaDegrees: 0 }), "tropikal çerçeve");
    no((r) => (r.transitingPlanets[6].natalHouse = 7), "natalHouse");
    no((r) => (r.transitingPlanets[6].houseFromMoon = 2), "houseFromMoon");
    no((r) => (r.transitingPlanets[0].sign = "Libra"), "rashi ↔ boylam");
    no((r) => (r.natalPlanets[0].house = 10), "natal ev ↔ tek Lagna");
    no((r) => (r.transitingPlanets[4].drishtiToNatal = r.transitingPlanets[4].drishtiToNatal.slice(1)), "eksik drishti");
    no((r) => r.transitingPlanets[7].drishtiToNatal.push({ natalPlanet: "Moon", aspectType: "7th", strength: 100, orb: 1 }), "Rahu drishtisi");
    no((r) => (r.transitingPlanets[2].drishtiToNatal[0].aspectType = "8th"), "drishti türü ↔ burç sayımı");
    no((r) => (r.transitingPlanets[0].drishtiToNatal[0].orb = 1.5), "orb ↔ burç-içi fark");
    no((r) => (r.transitingPlanets[0].kaksha.lord = "Venus"), "kaksha yöneticisi");
    no((r) => (r.transitingPlanets[0].kaksha.number = 5), "kaksha sırası");
    no((r) => (r.transitingPlanets[0].kaksha.bindu = null), "Güneş bindu null");
    no((r) => (r.transitingPlanets[7].kaksha.binduCount = 3), "Rahu binduCount");
    no((r) => (r.keyTransits[0].natalHouse = 3), "keyTransits yansıma");
    no((r) => r.keyTransits.push({ planet: "Sun", description: "x", natalHouse: 12, houseFromMoon: 7, aspects: [], drishti: [] }), "hızlı graha vurgusu");
    const SECRET = "GIZLI-YENI-GOCHARA-ALANI";
    const r = structuredClone(GT.response);
    r.transitingPlanets[0].vedha = SECRET;
    r.sadeSati = { active: true, note: SECRET };
    const p = proj(r);
    assert.ok(p.ok);
    assert.deepEqual([...p.unmappedFields].sort(), ["sadeSati", "transitingPlanets[].vedha"]);
    assert.ok(!JSON.stringify(p.technical).includes(SECRET) && !JSON.stringify(p.interpretation).includes(SECRET));
  });

  await t("5.1A motor: 1 istek → tekrar 0; farklı an → yeni anahtar; Lahiri dışı → BİRİM YOK (0 istek, açık neden); saat yok → TIME_REQUIRED; 'şimdi' = UTC saat başı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r1 = (await run(ctx, pa, [TSEL()], rx.deps)).body as J;
    assert.ok(r1.results[0].ok, JSON.stringify(r1).slice(0, 400));
    assert.deepEqual(rx.calls.map((c) => c.endpoint), ["/vedic-astrology/transit"]);
    assert.deepEqual(JSON.parse(JSON.stringify(rx.calls[0].body)), GT.body);
    await run(ctx, pa, [TSEL()], rx.deps);
    assert.equal(rx.calls.length, 1, "önbellek");
    await run(ctx, pa, [TSEL({ atUtc: "2026-10-08T09:00" })], rx.deps);
    assert.equal(rx.calls.length, 2, "farklı an farklı anahtar");
    assert.equal(rx.calls[1].body.transitDate, "2026-10-08");
    const rr = JSON.stringify((await run(ctx, pa, [TSEL({ atUtc: VEDIC_TRANSIT_GOLDEN_AT, ayanamsa: "raman" })], rx.deps)).body);
    assert.ok(rr.includes("yalnız Lahiri"), rr.slice(0, 300));
    assert.equal(rx.calls.length, 2, "Raman ile sağlayıcı çağrıldı");
    const now = getTechnique("vedic.transit")!.parseOptions({ now: true }, new Date("2026-10-08T07:41:13Z"));
    assert.deepEqual(now, { ayanamsa: "lahiri", atUtc: "2026-10-08T07:00" });
    assert.equal(getTechnique("vedic.transit")!.parseOptions({ atUtc: "2026-13-01T00:00" }, new Date()), null);
    const pu = await profile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown", label: "Saatsiz" });
    const u = (await run(ctx, pu, [TSEL()], rx.deps)).body as J;
    assert.equal(u.results[0].code, "TIME_REQUIRED");
    assert.equal(rx.calls.length, 2);
    assert.equal(maskTechnical("vedic.transit", {}, { timeKnown: false } as J).masked, true);
  });

  await t("5.1A Batı ↔ Vedik transit AYRIMI: aynı an → 2 ayrı uç/anahtar/sonuç; konular, KB bağlamı ve not bölümü karışmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const b = (await run(ctx, pa, [{ technique: "western.transit", options: { atUtc: VEDIC_TRANSIT_GOLDEN_AT, nodeType: "true" } }, TSEL()], rx.deps)).body as J;
    assert.ok(b.results.every((x: J) => x.ok), JSON.stringify(b).slice(0, 400));
    assert.deepEqual(rx.calls.map((c) => c.endpoint).sort(), ["/astrology/transits", "/vedic-astrology/transit"]);
    const ids = store.tables.astro_provider_results.map((x: J) => x.technique).sort();
    assert.deepEqual(ids, ["vedic.transit", "western.transit"]);
    assert.notEqual(store.tables.astro_provider_results[0].input_hash, store.tables.astro_provider_results[1].input_hash);
    assert.equal(TECHNIQUE_TOPIC_CONTEXT["vedic.transit"], "vedic_gochara");
    const keys = topicsForTechnique("vedic.transit", tech()).map((x) => x.key);
    assert.ok(keys.includes("gochara_from_moon:saturn:1") && keys.includes("gochara_in_bhava:saturn:6") && keys.includes("gochara_graha_in_rashi:saturn:pisces"));
    assert.ok(keys.includes("gochara_drishti:jupiter:moon") && keys.includes("gochara_drishti:jupiter:rahu"));
    assert.ok(!keys.some((k) => k.startsWith("gochara_drishti:rahu") || k.startsWith("gochara_drishti:ketu")));
    for (const k of keys) {
      assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
      assert.equal(parseVedicTopicKey(k)?.context, "vedic_gochara");
      assert.equal(parseAnyTopicKey("western", k), null, k);
      assert.ok(isSectionKeyForTechnique("vedic.transit", k) && !isSectionKeyForTechnique("western.transit", k) && !isSectionKeyForTechnique("vedic.d1", k), k);
    }
    const wp = projectRoxyTransit(WT.response, { nodeType: "true", atUtc: `${VEDIC_TRANSIT_GOLDEN_AT}Z` }) as J;
    assert.ok(wp.ok, JSON.stringify(wp.errors));
    const wkeys = topicsForTechnique("western.transit", wp.technical).map((x) => x.key);
    assert.ok(wkeys.length > 0 && wkeys.every((k) => !isSectionKeyForTechnique("vedic.transit", k)));
  });

  await t("5.1A yorum kapısı + KB + not + kayıtlı analiz: yetkisiz/önizlemede anlatı yok; KB eşleşmesi; not bağlamı Lahiri; kayıtlı analiz 0 istek; başka tenant 404", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const desc = GT.response.keyTransits[0].description as string;
    const vis = JSON.stringify((await run(ctx, pa, [TSEL()], rx.deps)).body);
    const hid = JSON.stringify((await run(ctxOf(store, { entitlements: NO_INTERP }), pa, [TSEL()], rx.deps)).body);
    const pre = JSON.stringify((await run(ctx, pa, [TSEL()], rx.deps, true)).body);
    assert.ok(vis.includes(desc));
    assert.ok(!hid.includes(desc) && !pre.includes(desc));
    for (const s of [vis, hid, pre]) assert.ok(!s.includes("sextile") && !s.includes("k-test-51"));
    assert.equal(rx.calls.length, 1);
    await createKb(ctx, { tradition: "vedic", topicKey: "gochara_from_moon:saturn:1", title: "Satürn Janma Rashi üzerinde — notum", body: "kb" });
    await createKb(ctx, { tradition: "vedic", topicKey: "graha_in_rashi:saturn:pisces", title: "D1 kaydı (Gochara'ya karışmamalı)", body: "kb" });
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...TSEL() })).body as J;
    assert.equal(ws.noteContext, "ayanamsa:lahiri");
    assert.deepEqual(ws.kbMatches.map((e: J) => e.title), ["Satürn Janma Rashi üzerinde — notum"]);
    const nr = await saveExpertNote(ctx, { profileId: pa, technique: "vedic.transit", sectionKey: "gochara_from_moon:saturn:1", expectedRevision: null, noteContext: "ayanamsa:lahiri", body: "Gochara notu" });
    assert.equal(nr.status, 201, JSON.stringify(nr.body));
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.transit", sectionKey: "graha_in_rashi:saturn:pisces", expectedRevision: null, noteContext: "ayanamsa:lahiri", body: "x" })).status, 400, "D1 bölümü Gochara notunda");
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.transit", sectionKey: "overall", expectedRevision: null, noteContext: "ayanamsa:raman", body: "x" })).status, 400);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...TSEL(), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const aj = JSON.stringify(a);
    assert.equal(rx.calls.length, n, "kayıtlı analiz sağlayıcı çağırdı");
    assert.ok(aj.includes("Gochara notu") && aj.includes("astro-roxy-vedic-transit-1") && aj.includes(VEDIC_TRANSIT_GOLDEN_AT));
    assert.ok(aj.includes("Satürn Janma Rashi üzerinde") && !aj.includes("D1 kaydı (Gochara"));
    const hidden = JSON.stringify(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis);
    assert.ok(!hidden.includes(desc));
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (sv.body as J).analysisId, false)).status, 404);
  });

  console.log(`\nastrology phase51 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase51 harness çöktü:", e);
  process.exit(1);
});

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
import { dashaEndpoint, navamsaRashiOfPada, projectRoxyVedicD1, projectRoxyVedicDasha, projectRoxyVedicDrishti, projectRoxyVedicTransit, projectRoxyVedicVarga, signCount } from "@/lib/astrology/providers/roxy/vedic";
import { kundliLegend, localizeGrahaLabel, localizeSignLabel, SIGN_TR_ABBR } from "@/app/admin/astroloji/_lib/kundliLocalize";
import { GRAHA_LABELS } from "@/lib/astrology/topics/vedic";
import { BPHS_VARGA_RULES, checkVargaAgainstBphs, VARGA_GOLDEN_CONFIRMED } from "@/lib/astrology/verify/varga";
import { currentDashaIndex, dashaTopicKey, dashaUtcMs, kundliTitles, localizeKundliDom, vargaCheckOf } from "@/app/admin/astroloji/_components/VedicPanels";
import { syntheticSubResponse } from "./syntheticDasha";
import { vedicTransitBody, vedicTransitLocal } from "@/lib/astrology/providers/roxy/requests";
import { projectRoxyTransit } from "@/lib/astrology/providers/roxy/timing";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { KAKSHA_LORDS, VEDIC_VARGA_DIVISIONS, type VedicDrishtiTechnical, type VedicTransitTechnical, type VedicVargaTechnical } from "@/lib/astrology/model/vedic";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const GT = load("vedic-transit");
const D1 = load("vedic-d1");
const FK = load("vedic-ashtakavarga");
const WT = load("transit");
const D30M = load("vedic-d30");

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
      else if (endpoint === D30M.endpoint && body.division === 30) r = structuredClone(D30M.response);
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
    // Güneş (hızlı graha): keyTransits yansıma denetimi devreye girmez → yalnız hedef denetim sınanır.
    no((r) => (r.transitingPlanets[0].natalHouse = 11), "natalHouse");
    no((r) => (r.transitingPlanets[0].houseFromMoon = 6), "houseFromMoon");
    no((r) => (r.transitingPlanets[0].sign = "Libra"), "rashi ↔ boylam");
    no((r) => (r.natalPlanets[0].house = 10), "natal ev ↔ tek Lagna");
    no((r) => (r.transitingPlanets[0].drishtiToNatal = []), "eksik drishti (yalnız tamlık denetimi)");
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

  // ═══ 5.1B — D2…D60 bağımsız doğrulama ═══════════════════════════════════════
  const D9G = load("vedic-d9");
  const D30G = load("vedic-d30");
  const vargaTech = (g: J) => {
    const p = projectRoxyVedicVarga(g.response, { ayanamsa: "lahiri", division: g.body.division }) as J;
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
    return p.technical as VedicVargaTechnical;
  };
  /** "Koç'tan düz eşit bölme" — YANLIŞ genel uygulama modeli (yalnız ayırt edicilik kanıtı için). */
  const naive = (n: number) => (lon: number) => Math.floor((lon * n) / 30) % 12;

  await t("5.1B golden D30: fixture = ürün gövdesi (division 30, lahiri, tz=doğum ofseti); projeksiyon temiz; Roxy yöntemi 'Unequal' (Parashari)", () => {
    const g = goldenPlan51().find((x) => x.name === "vedic-d30")!;
    assert.deepEqual(D30G.body, JSON.parse(JSON.stringify(g.body)));
    assert.equal(D30G.body.timezone, 3);
    const u = getTechnique("vedic.varga")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { ayanamsa: "lahiri", division: 30 })[0];
    assert.deepEqual(JSON.parse(JSON.stringify(u.body)), D30G.body);
    const v = vargaTech(D30G);
    assert.equal(v.division.name, "Trimsamsa");
    assert.equal(D30G.response.division.degreesPerDivision, "Unequal");
    // D30 grahaları D1 boylamını aynen taşır (varga D1'den türetilir).
    for (const x of v.grahas) assert.equal(x.longitude.toFixed(4), Number(D1.response.meta[NAME[x.id]].longitude).toFixed(4));
  });

  await t("5.1B BAĞIMSIZ: D9 ve D30 golden'ları BPHS Parashari kuralıyla 10/10 (Lagna + 9 graha) aynı; teyitli liste = golden'ı olan bölümler", () => {
    for (const g of [D9G, D30G]) {
      const c = vargaCheckOf(vargaTech(g));
      assert.equal(c.status, "match", `D${g.body.division}: ${JSON.stringify(c.mismatches)}`);
      assert.equal(c.checked, 10);
      assert.equal(c.goldenConfirmed, true);
    }
    assert.deepEqual([...VARGA_GOLDEN_CONFIRMED].sort((a, b) => a - b), [9, 30]);
  });

  await t("5.1B ayırt edicilik: D9 golden 'düz eşit bölme' ile de uyuşur (tek başına kanıt DEĞİL); D30 golden düz bölmeyle UYUŞMAZ → Roxy gerçekten BPHS dilimlerini uyguluyor", () => {
    const pts = (g: J) => [g.response.chart.meta.Lagna, ...Object.keys(NAME).map((k) => g.response.chart.meta[NAME[k]])] as J[];
    assert.ok(pts(D9G).every((m) => SIGN_IDS[naive(9)(m.longitude)] === String(m.rashi).toLowerCase()), "D9 düz bölmeyle aynı olmalı (bu yüzden yetersiz kanıttı)");
    const wrong = pts(D30G).filter((m) => SIGN_IDS[naive(30)(m.longitude)] !== String(m.rashi).toLowerCase()).length;
    assert.ok(wrong >= 8, `D30: düz bölme ${wrong}/10 farklı olmalı`);
  });

  await t("5.1B referans tablosu iç tutarlılığı: D9 = pada↔navamsa = düz bölme; D27 = düz bölme; D2 yalnız Yengeç/Aslan; D30 asla Yengeç/Aslan + dilim sınırları; her bölüm sayısı = bölüm sayısı", () => {
    for (let lon = 0; lon < 360; lon += 0.05) {
      const nak = Math.floor(lon / (360 / 27));
      const pada = Math.floor((lon % (360 / 27)) / (360 / 108)) + 1;
      assert.equal(SIGN_IDS[BPHS_VARGA_RULES[9].rashiIndex(lon)], navamsaRashiOfPada(nak, pada), `D9 ${lon}`);
      assert.equal(BPHS_VARGA_RULES[9].rashiIndex(lon), naive(9)(lon));
      assert.equal(BPHS_VARGA_RULES[27].rashiIndex(lon), naive(27)(lon), `D27 ${lon}`);
      assert.ok([3, 4].includes(BPHS_VARGA_RULES[2].rashiIndex(lon)));
      assert.ok(![3, 4].includes(BPHS_VARGA_RULES[30].rashiIndex(lon)));
    }
    // D30 sınırları (tek burç Koç, çift burç Boğa) ve BPHS sıra örnekleri.
    const d30 = (lon: number) => SIGN_IDS[BPHS_VARGA_RULES[30].rashiIndex(lon)];
    assert.deepEqual([4.99, 5, 9.99, 10, 17.99, 18, 24.99, 25].map(d30), ["aries", "aquarius", "aquarius", "sagittarius", "sagittarius", "gemini", "gemini", "libra"]);
    assert.deepEqual([34.99, 35, 41.99, 42, 49.99, 50, 54.99, 55].map(d30), ["taurus", "virgo", "virgo", "pisces", "pisces", "capricorn", "capricorn", "scorpio"]);
    // D60 aynı burçtan sayılır (düz bölmeden FARKLI): Boğa 0°–0°30′ → Boğa.
    assert.equal(SIGN_IDS[BPHS_VARGA_RULES[60].rashiIndex(30.1)], "taurus");
    assert.equal(SIGN_IDS[naive(60)(30.1)], "aries");
    // Her bölüm: bir burç içinde n dilim → kural dışı (ör. hareketli/sabit/çift) olmadıkça ardışık.
    for (const n of VEDIC_VARGA_DIVISIONS) {
      const r = BPHS_VARGA_RULES[n];
      assert.ok(r && r.division === n && r.method.startsWith("Parashari"), `D${n} kuralı`);
    }
  });

  await t("5.1B görünüm: uyuşmazlık REDDEDİLMEZ ama 'Doğrulanmadı' işaretlenir (nokta ve beklenen rashi listelenir); bilinmeyen bölüm → 'unsupported'", () => {
    const r = structuredClone(D30G.response);
    // İç tutarlı (ev + vargottama da uyarlanmış) ama BPHS dışı bir yanıt: kural farkı yalnız bağımsız denetimde görünür.
    r.chart.meta.Sun.rashi = "Gemini";
    r.chart.meta.Sun.house = 7;
    r.vargottama = ["Sun"];
    r.chart.gemini.signs.push({ graha: "Sun" });
    r.chart.libra.signs = r.chart.libra.signs.filter((x: J) => x.graha !== "Sun");
    const p = projectRoxyVedicVarga(r, { ayanamsa: "lahiri", division: 30 }) as J;
    assert.ok(p.ok, "D30 kural farkı adaptörde reddedilmemeli (yalnız işaret): " + JSON.stringify(p.errors));
    const c = vargaCheckOf(p.technical);
    assert.equal(c.status, "mismatch");
    assert.deepEqual(c.mismatches, [{ id: "sun", got: "gemini", expected: "libra" }]);
    assert.equal(checkVargaAgainstBphs(5, [{ id: "sun", longitude: 10, rashi: "aries" }]).status, "unsupported");
  });

  // ═══ 5.1C/5.1D — harita etiketleri (Türkçe) + kalabalık hücre ═════════════════
  await t("5.1D graha/burç etiketleri: kütüphane İngilizcesi → Türkçe (Su→Gü, Mo→Ay, Ju→Jü); kalabalıkta derece düşer; işaretler korunur; idempotent; tanınmayan aynen", () => {
    assert.equal(localizeGrahaLabel("Su 28°", false), "Gü 28°");
    assert.equal(localizeGrahaLabel("Ju 28°ᶜ", false), "Jü 28°ᶜ");
    assert.equal(localizeGrahaLabel("Ju 28°ᶜ", true), "Jüᶜ");
    assert.equal(localizeGrahaLabel("Sa 28°ʳ", false), "Sa 28°ʳ");
    assert.equal(localizeGrahaLabel("Mo", false), "Ay");
    assert.equal(localizeGrahaLabel("Ra 14°ʳ", true), "Raʳ");
    for (const x of ["Gü 28°", "Ay 29°", "Jüᶜ", "Ve"]) assert.equal(localizeGrahaLabel(x, false), x, "idempotent");
    assert.equal(localizeGrahaLabel("Uranus", false), "Uranus", "uydurma kısaltma yok");
    assert.equal(localizeSignLabel("Ar"), "Koç");
    assert.equal(localizeSignLabel("Pi"), "Bal");
    assert.equal(localizeSignLabel("7 · Li"), "7 · Ter");
    assert.equal(localizeSignLabel("D1 Rashi"), "D1 Rashi");
    assert.equal(localizeSignLabel("Ter"), "Ter");
    // lang="tr" + CSS büyük harf: Türkçe kısaltmalar doğru büyür (eski "Pi/Li/Vi" → "Pİ/Lİ/Vİ" hatası yok).
    assert.deepEqual(Object.values(SIGN_TR_ABBR).map((x) => x.toLocaleUpperCase("tr")), ["KOÇ", "BOĞ", "İKİ", "YEN", "ASL", "BAŞ", "TER", "AKR", "YAY", "OĞL", "KOV", "BAL"]);
    assert.ok(!Object.values(SIGN_TR_ABBR).some((x) => /i/.test(x) && !/[İı]/.test(x.toLocaleUpperCase("tr"))));
    assert.equal(GRAHA_LABELS.sun, "Güneş (Surya)");
    assert.equal(GRAHA_LABELS.moon, "Ay (Chandra)");
    assert.ok(kundliLegend(["sun", "jupiter", "rahu"]).startsWith("Gü = Güneş / Surya · Jü = Jüpiter / Guru · Ra = Rahu"));
  });

  await t("5.1D ipucu (SVG title): Türkçe ad / Sanskritçe · rashi derece · nakshatra pada · yönetici · vakri/yanık; varga'da Dn + D1", () => {
    const d1 = projectRoxyVedicD1(D1.response, { ayanamsa: "lahiri" }) as J;
    const tt = kundliTitles(d1.technical.grahas, undefined, d1.technical.combustion.map((c: J) => c.id));
    assert.equal(tt.Sun, "Güneş / Surya · İkizler 28°59′ · Punarvasu 3. pada · nakshatra yöneticisi Jüpiter");
    assert.ok(tt.Jupiter.includes("yanık (asta)"));
    assert.ok(tt.Saturn.includes("vakri (retro)") && tt.Saturn.startsWith("Satürn / Shani · Yay"));
    assert.ok(!Object.values(tt).some((x) => /Gemini|Sun |Moon |retrograde|combust/.test(x)), "İngilizce kaldı");
    const vt = kundliTitles(vargaTech(D30G).grahas, 30);
    assert.ok(vt.Sun.startsWith("Güneş / Surya · D30 Terazi · D1 İkizler 28°59′"), vt.Sun);
  });

  await t("5.1C yerelleştirme uygulayıcısı (sahte DOM): yalnız metin düğümü verisi değişir (Lit işaretçi yorumları korunur); kalabalık hücre (Kuzey/Doğu ≥3, Güney ≥5) küçülür + kayar; Lagna yazımı", () => {
    type N = { nodeType: number; data?: string };
    const mkText = (data: string): N => ({ nodeType: 3, data });
    const linkKids = (o: J): J => {
      for (const k of o.childNodes) k.parentNode = o;
      return o;
    };
    const marker = (): N => ({ nodeType: 8, data: "lit-part" });
    const el = (cls: string, kids: J[]): J => linkKids({ cls, childNodes: kids, style: { fontSize: "", transform: "", textTransform: "", letterSpacing: "" }, querySelector: (s: string) => (s === "title" ? kids.find((k) => k.cls === "title") ?? null : null) });
    const planet = (label: string, title: string) => el("planet-text", [marker(), mkText(label), marker(), el("title", [marker(), mkText(title), marker()])]);
    const cellA = { cls: "cell", kids: [planet("Su 28°", "Sun · 28°59' Gemini · Punarvasu pada 3"), planet("Ju 28°ᶜ", "Jupiter · x"), planet("Ve 0°", "Venus · x")] };
    const cellB = { cls: "cell", kids: [planet("Ma 8°", "Mars · x")] };
    const signs = [el("sign-text", [marker(), mkText("Ge"), marker()]), el("rashi-num", [mkText("7 · Li")])];
    const lagna = el("lagna-marker", [marker(), mkText("ASC"), marker()]);
    const cells = [cellA, cellB].map((c) => ({ querySelectorAll: (s: string) => (s === "text.planet-text" ? c.kids : []) }));
    const root = { querySelectorAll: (s: string) => (s === "g.cell" ? cells : s === "text.sign-text, text.rashi-num" ? signs : s === "text.lagna-marker" ? [lagna] : []) } as unknown as ParentNode;
    const titles = { Sun: "Güneş / Surya · İkizler 28°59′", Jupiter: "Jüpiter / Guru · x", Venus: "Venüs / Shukra · x", Mars: "Mars / Mangala · x" };
    localizeKundliDom(root, titles, "east");
    const label = (p: J) => p.childNodes[1].data;
    assert.deepEqual(cellA.kids.map(label), ["Gü", "Jüᶜ", "Ve"]);
    assert.deepEqual(cellA.kids.map((p: J) => [p.style.fontSize, p.style.transform]), Array(3).fill(["11px", "translateY(3px)"]));
    assert.equal(label(cellB.kids[0]), "Ma 8°");
    assert.equal(cellB.kids[0].style.fontSize, "");
    assert.equal(cellA.kids[0].childNodes[3].childNodes[1].data, "Güneş / Surya · İkizler 28°59′");
    assert.ok(cellA.kids.every((p: J) => p.childNodes[0].nodeType === 8 && p.childNodes[2].nodeType === 8), "Lit işaretçileri silindi");
    assert.deepEqual(signs.map((s: J) => s.childNodes.find((n: N) => n.nodeType === 3).data), ["İki", "7 · Ter"]);
    assert.equal(lagna.childNodes[1].data, "Lagna");
    assert.deepEqual([lagna.style.textTransform, lagna.style.letterSpacing], ["none", "0px"]);
    // İdempotent: ikinci uygulama hiçbir şeyi değiştirmez; Güney'de 3 graha kalabalık sayılmaz (derece geri gelmez ama küçültme kalkar).
    const snap = JSON.stringify(cellA.kids.map(label));
    localizeKundliDom(root, titles, "east");
    assert.equal(JSON.stringify(cellA.kids.map(label)), snap);
    cellA.kids[0].childNodes[1].data = "Su 28°"; // Lit yeniden çizdi (İngilizce)
    localizeKundliDom(root, titles, "south");
    assert.equal(label(cellA.kids[0]), "Gü 28°");
    assert.equal(cellA.kids[0].style.fontSize, "");
  });

  // ═══ 5.1E — Graha Drishti yöntem denetimi ════════════════════════════════════
  const FA = load("vedic-aspects");
  const drishti = (r: J = FA.response) => projectRoxyVedicDrishti(r, { birthLocal: "1990-07-15T14:30:00" }) as J;
  await t("5.1E BULGU: Roxy /aspects = Parashari BÜTÜN-BURÇ drishti (Venüs→Satürn 'orb' 27.58° ile güç 100; Rahu/Ketu bakmaz) — golden liste kuralla birebir; yöntem etiketi düzeltildi", () => {
    const p = drishti();
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
    assert.equal(p.technical.method, "parashari_whole_sign");
    const vs = p.technical.aspects.find((a: J) => a.from === "venus" && a.to === "saturn");
    assert.ok(vs && vs.orb > 27 && vs.strength === 100, "derece+orb yöntemi olsaydı 27.58° bakış olmazdı");
    assert.ok(p.technical.aspects.every((a: J) => a.strength === 100));
    assert.ok(!p.technical.aspects.some((a: J) => a.from === "rahu" || a.from === "ketu"));
    const nr = d1Rashis();
    const exp = Object.keys(NAME).flatMap((a) => Object.keys(NAME).filter((b) => b !== a && PARASHARI[a].includes(signCount(nr[a], nr[b]))).map((b) => `${a}>${b}`)).sort();
    assert.deepEqual(p.technical.aspects.map((a: J) => `${a.from}>${a.to}`).sort(), exp);
    // Aynı yöntem Gochara ucunda da (5.1A): iki uç aynı drishti sözlüğünü kullanır.
    assert.ok(tech().transits.every((x) => x.drishti.every((d) => d.type !== 1)));
  });

  await t("5.1E fail-closed: eksik bakış / Rahu bakışı / kısmi güç / tür≠burç sayımı REDDEDİLİR; 'conjunction' graha drishti değil → düşürülür (raporlanır)", () => {
    const no = (f: (r: J) => void, why: string) => {
      const r = structuredClone(FA.response);
      f(r);
      assert.equal(drishti(r).ok, false, why);
    };
    no((r) => (r.aspects = r.aspects.filter((a: J) => !(a.aspectingPlanet === "Venus" && a.aspectedPlanet === "Saturn"))), "eksik bakış (geniş orb)");
    // Karşılıklı olmayan + tablodan da çıkarılmış bakış: yalnız bütün-burç tamlık denetimi yakalar.
    no((r) => {
      r.aspects = r.aspects.filter((a: J) => !(a.aspectingPlanet === "Mars" && a.aspectedPlanet === "Mercury"));
      for (const row of r.aspectTable) row.aspects = row.aspects.filter((x: J) => !(row.planet === "Mars" && x.planet === "Mercury"));
    }, "eksik bakış (tablo ile tutarlı)");
    no((r) => r.aspects.push({ aspectingPlanet: "Rahu", aspectedPlanet: "Mercury", aspectType: "7th", strength: 100, orb: 1.38 }), "Rahu bakışı");
    no((r) => (r.aspects[0].strength = 75), "kısmi güç");
    no((r) => (r.aspects[1].aspectType = "8th"), "tür ↔ burç sayımı");
    const r = structuredClone(FA.response);
    r.aspects.push({ aspectingPlanet: "Sun", aspectedPlanet: "Jupiter", aspectType: "conjunction", strength: 100, orb: 0.18 });
    const p = drishti(r);
    assert.ok(p.ok, JSON.stringify(p.errors));
    assert.deepEqual(p.droppedValues, ["aspects[].conjunction"]);
  });

  // ═══ 5.1F — Dasha alt düzeyleri ═══════════════════════════════════════════════
  const DM = load("vedic-dasha-major");
  const DS = load("vedic-dasha-sub-md");
  const DSA = load("vedic-dasha-sub-md-ad");
  const LORDS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
  const dashaProj = (raw: J, md: string | null, ad: string | null) =>
    projectRoxyVedicDasha(raw, { ayanamsa: "lahiri", mahadasha: md ? (md.toLowerCase() as J) : null, antardasha: ad ? (ad.toLowerCase() as J) : null, birthLocal: "1990-07-15T14:30:00", utcOffsetHours: 3 }) as J;
  const strip = (p: J) => ({ planet: p.planet, startDate: p.startDate, endDate: p.endDate, d: Number(p.durationYears).toFixed(12), n: p.nominalStartDate ?? null });

  await t("5.1F sentetik model DOĞRULAMASI: gözlenen Roxy tarih kuralı iki gerçek golden'ı (sub/Mercury kesilmiş + sub/Moon/Rahu 9 PD) 1e-12'ye kadar BİREBİR üretir", () => {
    const s = syntheticSubResponse(DM.response, "Mercury", null) as J;
    assert.deepEqual(s.antardashas.map(strip), DS.response.antardashas.map(strip));
    assert.deepEqual(strip(s.mahadashaPeriod), strip(DS.response.mahadashaPeriod));
    const a = syntheticSubResponse(DM.response, "Moon", "Rahu") as J;
    assert.deepEqual(a.pratyantardashas.map(strip), DSA.response.pratyantardashas.map(strip));
    assert.deepEqual(strip(a.antardashaPeriod), strip(DSA.response.antardashaPeriod));
    assert.ok(!JSON.stringify(a).includes("interpretation"), "sentetik anlatı üretmez");
  });

  await t("5.1F kapsam: 9 mahadasha'nın tamamı + doğumdan sonraki TÜM antardasha yolları adaptörden geçer (sıra/ardışıklık/kanonik süre/üst sınır); tarih sırası artan; uçlar istemci regex'inde", () => {
    let mdN = 0;
    let adN = 0;
    for (const md of LORDS) {
      const r = syntheticSubResponse(DM.response, md, null) as J;
      const p = dashaProj(r, md, null);
      assert.ok(p.ok, `${md}: ${JSON.stringify(p.errors)}`);
      assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []]);
      const ps = p.technical.periods as J[];
      assert.ok(ps.every((x: J, i: number) => i === 0 || ps[i - 1].end === x.start), `${md} ardışık`);
      assert.ok(ps.every((x: J) => x.start < x.end));
      if (md !== "Mercury") assert.equal(ps[0].lord, md.toLowerCase(), "dizi MD yöneticisiyle başlar");
      mdN++;
      for (const x of ps) {
        const ad = LORDS.find((l) => l.toLowerCase() === x.lord)!;
        const ra = syntheticSubResponse(DM.response, md, ad) as J;
        const pa = dashaProj(ra, md, ad);
        assert.ok(pa.ok, `${md}/${ad}: ${JSON.stringify(pa.errors)}`);
        assert.equal(pa.technical.parent.start, x.start);
        assert.equal(pa.technical.parent.end, x.end);
        assert.match(dashaEndpoint(md.toLowerCase() as J, ad.toLowerCase() as J), /^\/[a-zA-Z0-9\-/]{1,120}$/);
        adN++;
      }
    }
    assert.equal(mdN, 9);
    // Mercury MD doğumla kesilmiş: yalnız Satürn AD kalır; 9 MD'nin 8'i tam (9 AD) → 8×9 + 1 = 73 AD yolu.
    assert.equal(adN, 73);
    assert.equal(syntheticSubResponse(DM.response, "Mercury", "Ketu"), null, "doğumdan önce biten AD yolu yok");
  });

  await t("5.1F motor (sentetik sahte Roxy): MD → farklı MD'ler → farklı AD yolları tembel; her yol ayrı anahtar; tekrar açılış 0 istek; ayanamsa ayrımı; kayıtlı AD analizi 0 istek; konu anahtarları düzeye göre", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const calls: string[] = [];
    const deps: EngineDeps = {
      config: { apiKey: "k-test-51f", baseUrl: "https://roxy-fake.local/api/v2" },
      callProvider: async (_c, endpoint, body) => {
        calls.push(`${endpoint}:${String(body.ayanamsa)}`);
        const m = /^\/vedic-astrology\/dasha\/(?:major|sub\/([A-Za-z]+)(?:\/([A-Za-z]+))?)$/.exec(endpoint);
        if (!m) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        const r: J = m[1] ? syntheticSubResponse(DM.response, m[1], m[2] ?? null) : structuredClone(DM.response);
        if (!r) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
        if (body.ayanamsa !== "lahiri") r.ayanamsaType = body.ayanamsa; // SENTETİK yankı (yalnız anahtar ayrımı testi)
        return { ok: true, raw: r, attempts: 1 };
      },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    };
    const D = (md?: string, ad?: string, ay?: string) => ({ technique: "vedic.dasha", options: { ...(md ? { mahadasha: md } : {}), ...(ad ? { antardasha: ad } : {}), ...(ay ? { ayanamsa: ay } : {}) } });
    const seq = [D(), D("venus"), D("saturn"), D("venus", "rahu"), D("saturn", "jupiter"), D("ketu", "ketu")];
    for (const s of seq) {
      const b = (await run(ctx, pa, [s], deps)).body as J;
      assert.ok(b.results[0].ok, JSON.stringify(b).slice(0, 300));
    }
    assert.equal(calls.length, 6);
    assert.equal(new Set(calls).size, 6);
    for (const s of seq) await run(ctx, pa, [s], deps);
    assert.equal(calls.length, 6, "tekrar açılış sağlayıcıya gitti");
    await run(ctx, pa, [D("venus", "rahu", "raman")], deps);
    assert.equal(calls.length, 7);
    assert.equal(calls[6], "/vedic-astrology/dasha/sub/Venus/Rahu:raman");
    assert.equal(new Set(store.tables.astro_provider_results.map((x: J) => x.input_hash)).size, 7);
    // Konu anahtarları düzeye göre; DB regex'ine uyar; Vedik D1 ile karışmaz.
    const pd = dashaProj(syntheticSubResponse(DM.response, "Venus", "Rahu"), "Venus", "Rahu").technical;
    const keys = topicsForTechnique("vedic.dasha", pd).map((x) => x.key);
    assert.equal(keys.length, 9);
    assert.ok(keys.every((k) => /^dasha_pratyantardasha:venus:rahu:[a-z]+$/.test(k) && isSectionKeyForTechnique("vedic.dasha", k) && !isSectionKeyForTechnique("vedic.d1", k)));
    // Kayıtlı Pratyantardasha analizi: açmak 0 istek; dönem yolu snapshot'ta.
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...D("venus", "rahu"), includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = calls.length;
    const a = JSON.stringify(((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis);
    assert.equal(calls.length, n);
    assert.ok(a.includes("\"antardasha\":\"rahu\"") && a.includes("\"mahadasha\":\"venus\""), a.slice(0, 200));
  });

  await t("5.1F 'şimdi' göstergesi + bugünkü yol: MD/AD/PD düzeylerinde bugünü içeren dönem tektir; sınır anında bir sonraki dönem başlar (yarı açık aralık)", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    const md = dashaProj(DM.response, null, null).technical;
    const i = currentDashaIndex(md, now);
    assert.equal(md.periods[i].lord, "moon");
    const ad = dashaProj(syntheticSubResponse(DM.response, "Moon", null), "Moon", null).technical;
    const j = currentDashaIndex(ad, now);
    assert.equal(ad.periods[j].lord, "rahu");
    const pd = dashaProj(DSA.response, "Moon", "Rahu").technical;
    const k = currentDashaIndex(pd, now);
    assert.equal(pd.periods[k].lord, "mercury");
    const edge = dashaUtcMs(pd.periods[3].end, 3);
    assert.equal(currentDashaIndex(pd, edge), 4, "sınır anı bir sonraki dönem");
    assert.equal(currentDashaIndex(pd, edge - 1), 3);
    assert.equal(dashaTopicKey(pd, "mercury"), "dasha_pratyantardasha:moon:rahu:mercury");
  });

  // ═══ 5.1G — Bilgi Bankası + kayıtlı analiz uyumu ════════════════════════════
  await t("5.1G kayıtlı D30 analizi: 0 istekle açılır; snapshot teknik verisinden BPHS denetimi aynı sonucu verir (match + golden teyitli); varga notu bölüm bağlamında; D30 KB konusu D9/D1'e karışmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const V30 = { technique: "vedic.varga", options: { division: 30 } };
    const b = (await run(ctx, pa, [V30], rx.deps)).body as J;
    assert.ok(b.results[0].ok, JSON.stringify(b).slice(0, 300));
    await createKb(ctx, { tradition: "vedic", topicKey: "varga_graha_in_rashi:d30:sun:libra", title: "D30 Güneş Terazi notum", body: "kb" });
    await createKb(ctx, { tradition: "vedic", topicKey: "navamsa_graha_in_rashi:sun:gemini", title: "D9 kaydı (karışmamalı)", body: "kb" });
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...V30 })).body as J;
    assert.equal(ws.noteContext, "ayanamsa:lahiri|division:30");
    assert.deepEqual(ws.kbMatches.map((e: J) => e.title), ["D30 Güneş Terazi notum"]);
    const nr = await saveExpertNote(ctx, { profileId: pa, technique: "vedic.varga", sectionKey: "varga_graha_in_rashi:d30:sun:libra", expectedRevision: null, noteContext: "ayanamsa:lahiri|division:30", body: "D30 notu" });
    assert.equal(nr.status, 201, JSON.stringify(nr.body));
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...V30, includeProviderInterp: false, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const n = rx.calls.length;
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n);
    const techSnap = (a.result?.technical ?? a.technical ?? a.view?.technical) as VedicVargaTechnical;
    assert.ok(techSnap && techSnap.division.number === 30, JSON.stringify(Object.keys(a)));
    const c = vargaCheckOf(techSnap);
    assert.deepEqual([c.status, c.checked, c.goldenConfirmed], ["match", 10, true]);
    assert.ok(JSON.stringify(a).includes("D30 notu") && JSON.stringify(a).includes("D30 Güneş Terazi notum") && !JSON.stringify(a).includes("D9 kaydı"));
  });

  await t("5.1G geriye uyum: Aşama 5 'degree_orb' etiketli eski drishti kaydı tipte geçerli ve görünüm yöntemi metinden değil sabit doğru açıklamadan alır; eski Gochara'sız kayıtlar etkilenmez", () => {
    const old = { ...(drishti().technical as J), method: "degree_orb" } as VedicDrishtiTechnical;
    assert.ok(old.aspects.length === 9);
    assert.deepEqual(topicsForTechnique("vedic.drishti", old).map((x) => x.key), topicsForTechnique("vedic.drishti", drishti().technical).map((x) => x.key));
  });

  console.log(`\nastrology phase51 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase51 harness çöktü:", e);
  process.exit(1);
});

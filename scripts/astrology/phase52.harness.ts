/**
 * ASTROLOJİ AŞAMA 5.2 harness'i — kalan 13 varganın GERÇEK Roxy golden'ı ile doğrulanması.
 *
 * Her bölüm: fixture = ürün gövdesi · adaptör temiz (bilinmeyen/düşürülen 0) · BPHS Parashari 10/10 · D1 boylamları
 * D1 golden'ıyla aynı · vargottama listesi (Lagna dahil) rashilerle tutarlı · Dn konuları D1/D9 ile karışmaz ·
 * KB eşleşmesi ve kayıtlı analiz (0 istek) · golden teyit listesi = golden dosyası olan bölümler.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/phase52.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlan52, PHASE52_DIVISIONS } from "./golden/phase52-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { createKb } from "@/lib/astrology/kb/service";
import { getAnalysis, getWorkspace, saveAnalysis } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { parseVedicTopicKey } from "@/lib/astrology/topics/vedic";
import { projectRoxyVedicVarga } from "@/lib/astrology/providers/roxy/vedic";
import { BPHS_VARGA_RULES, VARGA_GOLDEN_CONFIRMED, checkVargaAgainstBphs } from "@/lib/astrology/verify/varga";
import { vargaCheckOf } from "@/app/admin/astroloji/_components/VedicPanels";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { VEDIC_VARGA_DIVISIONS, type VedicVargaTechnical } from "@/lib/astrology/model/vedic";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const D1 = load("vedic-d1");
const G: Record<number, J> = Object.fromEntries(VEDIC_VARGA_DIVISIONS.map((d) => [d, load(`vedic-d${d}`)]));

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

/** Sahte Roxy: divisional-chart → istenen bölümün GERÇEK golden'ı. */
function roxy() {
  const calls: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-52", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push(`${endpoint}:${String(body.division)}`);
      const g = endpoint === "/vedic-astrology/divisional-chart" ? G[Number(body.division)] : null;
      if (!g) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      return { ok: true, raw: structuredClone(g.response), attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  };
  return { calls, deps };
}
const tech = (d: number) => {
  const p = projectRoxyVedicVarga(G[d].response, { ayanamsa: "lahiri", division: d as never }) as J;
  assert.ok(p.ok, `D${d}: ${JSON.stringify(p.errors)}`);
  return p as { technical: VedicVargaTechnical; interpretation: J; unmappedFields: string[]; droppedValues: string[] };
};

async function main() {
  await t("5.2 golden kaydı: 13 bölümün her biri için tam 1 fixture; gövde = ürünün vedic.varga birimi (lahiri, tz=doğum ofseti); anahtar/ad izi yok; D9/D30 yeniden çağrılmadı", () => {
    assert.equal(PHASE52_DIVISIONS.length, 13);
    assert.ok(!(PHASE52_DIVISIONS as readonly number[]).includes(9) && !(PHASE52_DIVISIONS as readonly number[]).includes(30));
    for (const g of goldenPlan52()) {
      const f = load(g.name);
      const d = Number(g.body.division);
      assert.deepEqual(f.body, JSON.parse(JSON.stringify(g.body)), g.name);
      assert.equal(f.body.timezone, 3);
      assert.equal(f.body.ayanamsa, "lahiri");
      assert.ok(!/api[_-]?key|x-api-key|Bearer |Sentetik/i.test(JSON.stringify(f)));
      const u = getTechnique("vedic.varga")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { ayanamsa: "lahiri", division: d })[0];
      assert.deepEqual(JSON.parse(JSON.stringify(u.body)), f.body, g.name);
    }
  });

  for (const d of PHASE52_DIVISIONS) {
    await t(`5.2 D${d}: adaptör temiz · BPHS ${BPHS_VARGA_RULES[d].method} 10/10 · golden teyitli · D1 boylamları D1 golden'ıyla aynı · ev = Lagna'dan bütün-burç · vargottama tutarlı · anlatı yalnız yorumda`, () => {
      const p = tech(d);
      assert.deepEqual([p.unmappedFields, p.droppedValues], [[], []], `D${d}`);
      const v = p.technical;
      assert.equal(v.division.number, d);
      const c = vargaCheckOf(v);
      assert.deepEqual([c.status, c.checked, c.goldenConfirmed, c.mismatches], ["match", 10, true, []]);
      for (const x of v.grahas) {
        assert.equal(x.longitude.toFixed(4), Number(D1.response.meta[NAME[x.id]].longitude).toFixed(4), `D${d} ${x.id} D1 boylamı`);
        assert.equal(x.d1Rashi, String(D1.response.meta[NAME[x.id]].rashi).toLowerCase());
        assert.equal(x.house, ((SIGN_IDS.indexOf(x.rashi) - SIGN_IDS.indexOf(v.lagna.rashi) + 12) % 12) + 1);
      }
      assert.equal(v.lagna.d1Rashi, "libra");
      const vg = (G[d].response.vargottama as string[]).map((s) => s.toLowerCase()).sort();
      const exp = [...v.grahas.filter((x) => x.vargottama).map((x) => x.id), ...(v.lagna.vargottama ? ["lagna"] : [])].sort();
      assert.deepEqual(vg, exp, `D${d} vargottama`);
      const sig = G[d].response.division.significance as string;
      assert.ok(!JSON.stringify(v).includes(sig) && p.interpretation?.significance === sig, `D${d} significance katmanı`);
    });
  }

  await t("5.2 Lagna vargottama (D16 golden: Roxy listeye 'Lagna' koyar) kabul edilir; listede Lagna ama rashi farklıysa REDDEDİLİR; graha listesi çelişkisi REDDEDİLİR", () => {
    assert.deepEqual(G[16].response.vargottama, ["Moon", "Lagna"]);
    assert.equal(tech(16).technical.lagna.vargottama, true);
    const r = structuredClone(G[2].response);
    r.vargottama = [...r.vargottama, "Lagna"];
    assert.equal(projectRoxyVedicVarga(r, { ayanamsa: "lahiri", division: 2 }).ok, false, "D2 Lagna vargottama değil");
    const r2 = structuredClone(G[16].response);
    r2.vargottama = ["Lagna"];
    assert.equal(projectRoxyVedicVarga(r2, { ayanamsa: "lahiri", division: 16 }).ok, false, "Ay listeden düştü");
  });

  await t("5.2 teyit listesi: 15 bölümün tamamı golden teyitli VE her biri için golden dosyası gerçekten var (kanıtsız teyit yok); bilinmeyen bölüm hâlâ 'unsupported'", () => {
    assert.deepEqual([...VARGA_GOLDEN_CONFIRMED].sort((a, b) => a - b), [...VEDIC_VARGA_DIVISIONS].sort((a, b) => a - b));
    for (const d of VARGA_GOLDEN_CONFIRMED) assert.ok(existsSync(join(DIR, `vedic-d${d}.json`)), `D${d} golden yok`);
    assert.equal(checkVargaAgainstBphs(5, [{ id: "sun", longitude: 10, rashi: "aries" }]).status, "unsupported");
  });

  await t("5.2 yöntem notu: D7/D9/D16/D20/D27'de Parashari kuralı 'Koç'tan düz sayım'la MATEMATİKSEL olarak özdeş (0–360° tarama); diğer 10 bölümde golden en az 8/10 noktada ayırt edici", () => {
    const naive = (n: number) => (lon: number) => Math.floor((lon * n) / 30) % 12;
    for (const d of [7, 9, 16, 20, 27]) for (let i = 0; i < 36000; i++) { const lon = i / 100; assert.equal(BPHS_VARGA_RULES[d].rashiIndex(lon), naive(d)(lon), `D${d} ${lon}`); }
    for (const d of [2, 3, 4, 10, 12, 24, 30, 40, 45, 60]) {
      const pts = Object.values(G[d].response.chart.meta as Record<string, J>);
      const diff = pts.filter((m) => naive(d)(m.longitude) !== BPHS_VARGA_RULES[d].rashiIndex(m.longitude)).length;
      assert.ok(diff >= 8, `D${d} ayırt edicilik ${diff}/10`);
    }
  });

  await t("5.2 konular: her Dn kendi varga_*:dN anahtarı (DB regex); D9 navamsa_* ; D1 graha_in_rashi — bölümler ve D1/D9 birbirine KARIŞMAZ", () => {
    const seen = new Map<string, number>();
    for (const d of VEDIC_VARGA_DIVISIONS) {
      const keys = topicsForTechnique("vedic.varga", projectRoxyVedicVarga(G[d].response, { ayanamsa: "lahiri", division: d }).ok ? (projectRoxyVedicVarga(G[d].response, { ayanamsa: "lahiri", division: d }) as J).technical : null).map((x) => x.key);
      assert.ok(keys.length >= 19, `D${d}`);
      for (const k of keys) {
        assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/);
        if (d === 9) assert.ok(k.startsWith("navamsa_"), k);
        else assert.ok(k.startsWith("varga_") && k.split(":")[1] === `d${d}`, k);
        assert.ok(isSectionKeyForTechnique("vedic.varga", k) && !isSectionKeyForTechnique("vedic.d1", k) && !isSectionKeyForTechnique("vedic.transit", k), k);
        assert.equal(parseAnyTopicKey("western", k), null);
        assert.equal(parseVedicTopicKey(k)?.context, "vedic_varga");
        assert.ok(!seen.has(k) || seen.get(k) === d, `${k}: D${seen.get(k)} ile D${d} çakıştı`);
        seen.set(k, d);
      }
    }
  });

  await t("5.2 motor + KB + kayıtlı analiz: 13 bölüm ayrı anahtar (13 istek, tekrar 0); D60 KB kaydı yalnız D60'ta eşleşir; not bağlamı bölüme özgü; kayıtlı D2 ve D60 analizleri 0 istek + snapshot'tan BPHS teyitli; yorum kapısı; başka tenant 404", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const r0 = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
    const pa = (r0.body as J).profile.id;
    const rx = roxy();
    const sels = PHASE52_DIVISIONS.map((d) => ({ technique: "vedic.varga", options: { division: d } }));
    // Maliyet koruması: >10 YENİ sağlayıcı isteği açık onay ister (409, hiç istek yapılmaz) → iki parti (7 + 6).
    const big = await runAstrology(ctx, { profileId: pa, selections: sels }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(big.status, 409);
    assert.equal((big.body as J).code, "CONFIRMATION_REQUIRED");
    assert.equal(rx.calls.length, 0, "onaysız toplu istek yapıldı");
    for (const part of [sels.slice(0, 7), sels.slice(7)]) {
      const b = (await runAstrology(ctx, { profileId: pa, selections: part }, rx.deps, { ownerPreviewHideInterp: false })).body as J;
      assert.ok(b.results?.every((x: J) => x.ok), JSON.stringify(b).slice(0, 300));
    }
    assert.equal(rx.calls.length, 13);
    assert.equal(new Set(store.tables.astro_provider_results.map((x: J) => x.input_hash)).size, 13);
    for (const part of [sels.slice(0, 7), sels.slice(7)]) await runAstrology(ctx, { profileId: pa, selections: part }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(rx.calls.length, 13, "tekrar");
    const sunD60 = tech(60).technical.grahas.find((x) => x.id === "sun")!.rashi;
    await createKb(ctx, { tradition: "vedic", topicKey: `varga_graha_in_rashi:d60:sun:${sunD60}`, title: "D60 Güneş notum", body: "kb" });
    for (const d of [2, 60]) {
      const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, technique: "vedic.varga", options: { division: d } })).body as J;
      assert.equal(ws.noteContext, `ayanamsa:lahiri|division:${d}`);
      assert.deepEqual(ws.kbMatches.map((e: J) => e.title), d === 60 ? ["D60 Güneş notum"] : []);
    }
    const sig60 = G[60].response.division.significance as string;
    for (const d of [2, 60]) {
      const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, technique: "vedic.varga", options: { division: d }, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
      assert.equal(sv.status, 201, JSON.stringify(sv.body));
      const n: number = rx.calls.length;
      const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
      assert.equal(rx.calls.length, n, "kayıtlı analiz Roxy çağırdı");
      const snap = (a.result?.technical ?? a.technical ?? a.view?.technical) as VedicVargaTechnical;
      assert.equal(snap.division.number, d);
      assert.deepEqual([vargaCheckOf(snap).status, vargaCheckOf(snap).goldenConfirmed], ["match", true]);
      if (d === 60) {
        assert.ok(JSON.stringify(a).includes(sig60), "yetkili kayıtta yorum");
        const hid = JSON.stringify(((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis);
        assert.ok(!hid.includes(sig60), "yetkisiz kayıtta yorum");
        assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), (sv.body as J).analysisId, false)).status, 404);
      }
    }
  });

  console.log(`\nastrology phase52 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("phase52 harness çöktü:", e);
  process.exit(1);
});

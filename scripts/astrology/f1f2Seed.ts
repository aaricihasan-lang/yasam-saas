/**
 * F1/F2 (14.11.2026) — yerel ekran doğrulaması tohumu (YALNIZ dev-fake-backend, FAKE_F1F2_SEED=1; prod/DB/Roxy YOK).
 *
 * fixtures/atl-f1f2/progression-real-18.json içindeki GERÇEK progresyon yanıtlarından ürünün KENDİ akışıyla (profil → runAstrology →
 * saveAnalysis; sağlayıcı = kayıtlı yanıt, yalnız gövde BİREBİR aynıysa) 4 kayıt kurar — hepsi SENTETİK "TEST" kişileri:
 *   1) "TEST F1 · Katmandu 1960 — mean"       adaptör -2: ortalama düğüm yerel (TEST-PR-0002)
 *   2) "TEST F2 · Tromsø 2020 — kutup"        adaptör -2: natal ev sütunu yok + not (TEST-PR-0362)
 *   3) "TEST F1 · Katmandu 1960 — ESKİ mean"  -1 dönemi kaydı (snapshot sağlayıcı değerleri, adaptör -1) → uyarı
 *   4) "TEST F2 · Tromsø 2020 — ESKİ kutup"   -1 dönemi kaydı → "Placidus değil" etiketi + uyarı
 * Eski kayıtlar, -1 adaptörünün saklayacağı katmanla (sağlayıcının düğüm / ev değerleri aynen) taklit edilir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { saveAnalysis } from "@/lib/astrology/analyses/service";
import type { FakeStore } from "./fakeSupabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const NAME: Record<string, string> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune", Pluto: "pluto", "North Node": "north_node", "South Node": "south_node", Chiron: "chiron", "Black Moon Lilith": "lilith" };

export async function seedF1F2(ctx: EngineCtx, store: FakeStore): Promise<Record<string, string>> {
  const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "atl-f1f2", "progression-real-18.json"), "utf8")) as { cases: J[] };
  const out: Record<string, string> = {};
  for (const [tid, label] of [["TEST-PR-0002", "TEST F1 · Katmandu 1960 — mean"], ["TEST-PR-0362", "TEST F2 · Tromsø 2020 — kutup"]] as const) {
    const c = fx.cases.find((x) => x.testId === tid)!;
    const loc = { id: `qa-${tid.toLowerCase()}`, label: `${c.yer} (TEST)`, timezone: c.tz, latitude: c.body.latitude, longitude: c.body.longitude };
    const [bd, bt] = String(c.dogumYerel).split("T");
    const pr = await createAstroProfile(ctx, { label, birthDate: bd, birthTime: bt, timeKnown: true, timeAccuracy: "exact_record", locationId: loc.id }, (id) => (id === loc.id ? loc : null));
    const pid = (pr.body as { profile: { id: string } }).profile.id;
    const deps: EngineDeps = {
      config: { apiKey: "local-fake", baseUrl: "https://fake.invalid/api/v2" },
      callProvider: async (_c, endpoint, body) =>
        endpoint === c.endpoint && JSON.stringify(body) === JSON.stringify(c.body) ? { ok: true, raw: structuredClone(c.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    };
    const sel = { technique: "western.progression", options: { targetDate: c.body.targetDate, nodeType: c.body.nodeType } };
    const run = (await runAstrology(ctx, { profileId: pid, selections: [sel], confirmNewRequests: 1 }, deps, { ownerPreviewHideInterp: false })).body as J;
    if (!run.results?.[0]?.ok) throw new Error(`F1F2 tohum: ${tid} hesaplanamadı ${JSON.stringify(run).slice(0, 200)}`);
    for (const legacy of [false, true]) {
      const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, options: run.results[0].view.options, includeProviderInterp: false, saveRequestId: randomUUID(), title: `${label}${legacy ? " — ESKİ kayıt (-1)" : ""}` }, false);
      const id = (sv.body as J).analysisId as string;
      if (legacy) {
        const row = (store.tables.astro_analyses ?? []).find((r) => r.id === id) as J;
        const raw = c.response.planets as J[];
        const t = structuredClone(row.technical_snapshot);
        delete t.nodeComputation;
        delete t.natalHouseStatus;
        t.bodies = t.bodies.map((b: J) => {
          const r = raw.find((x) => NAME[x.name] === b.id)!;
          return { ...b, longitude: r.longitude, sign: b.id.endsWith("_node") ? signOf(r.longitude) : b.sign, degreeInSign: r.longitude % 30, house: r.house, speed: r.speed, retrograde: r.isRetrograde };
        });
        row.technical_snapshot = t;
        row.versions_snapshot = { ...row.versions_snapshot, adapterVersion: "astro-roxy-progression-1", projectionVersion: "progression-proj-1" };
      }
      out[`${tid}${legacy ? "-eski" : ""}`] = id;
    }
    out[`${tid}-profil`] = pid;
  }
  return out;
}

const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const signOf = (lon: number) => SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];

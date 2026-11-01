/**
 * Gökyüzü Atlası — DEMO HESABI örnek verisi üreticisi (D8, owner 2026-11-01).
 *
 * Demo hesabı (users.is_demo_account=true) Atlas'ı YALNIZ önceden hesaplanmış SENTETİK örnek haritalarla görür. Bu betik o
 * örnekleri SİSTEMİN KENDİ MOTORUYLA üretir — elle yazılmış / uydurma sonuç YOKTUR:
 *   1) Bellek içi sahte veritabanı (scripts/astrology/fakeSupabase) üzerinde GERÇEK servisler çalışır:
 *      createAstroProfile → runAstrology → saveAnalysis → (list/get/plan/view/workspace) yanıtları.
 *   2) Sağlayıcı çağrısı AĞA GİTMEZ: yalnız depodaki GERÇEK kayıtlı sağlayıcı yanıtları (fixtures/golden + 2026-10-07 natal
 *      golden'ı) BİREBİR aynı istek gövdesiyle eşleşirse döner; eşleşmeyen tek bir istek bile betiği DURDURUR (exit 1).
 *      Dasha alt dönemleri: golden major yanıtını birebir üreten doğrulanmış model (syntheticDasha; dasha-depth harness).
 *   3) Sağlayıcı yorumları (lisans) örneğe ALINMAZ: providerInterpretations=false, includeProviderInterp=false.
 *   4) Sentetik kişiler: A 1990-07-15 14:30 İstanbul, B 1988-03-21 06:45 Ankara. Danışan kaydı / gerçek kişi verisi YOK.
 *   5) Deterministik: sabit saat + sıralı kimlik → `--check` depodaki dosyanın bu betikle birebir yeniden üretildiğini doğrular.
 *
 * Çalıştır:  npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/demo/build-demo-fixture.ts [--check]
 * Çıktı:     lib/astrology/demo/fixture.generated.ts (tek metin sabiti; TypeScript dev bir JSON tipi çıkarmaz → derleme belleği)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Sabit saat (servisler created_at / başlık tarihi / "şimdi" için Date kullanır) ─────────────────────────────────────
const FIXED_NOW = Date.parse("2026-11-01T09:00:00.000Z");
let tick = 0;
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length === 0) super(FIXED_NOW + tick++ * 1000);
    else super(...(a as [number]));
  }
  static now() {
    return FIXED_NOW + tick++ * 1000;
  }
}
globalThis.Date = FixedDate as unknown as DateConstructor;

const ROOT = join(__dirname, "..", "..", "..");
const FX = join(__dirname, "..", "fixtures");
const OUT = process.env.DEMO_FIXTURE_OUT ?? join(ROOT, "lib", "astrology", "demo", "fixture.generated.ts");

/** Sentetik demo tenant / kullanıcı (yalnız üretim bağlamı; çıktıda kimlik olarak kullanılmaz). */
const TENANT = "de300000-0000-4000-8000-000000000001";
const USER = "de300000-0000-4000-8000-000000000002";

/** Demo seçimleri: her teknik için depodaki gerçek sağlayıcı yanıtıyla BİREBİR eşleşen seçenekler. who: B = örnek B haritası. */
export const DEMO_SELECTIONS: { technique: string; options: Record<string, unknown>; who?: "B"; partner?: true }[] = [
  { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } },
  { technique: "western.transit", options: { atUtc: "2026-10-07T09:00", nodeType: "true" } },
  { technique: "western.forecast", options: { startDate: "2026-10-01", days: 90 } },
  { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } },
  { technique: "western.solar_arc", options: { targetDate: "2026-10-07", nodeType: "true" } },
  { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "placidus", returnLocationId: null } },
  { technique: "western.lunar_return", options: { month: "2026-10", sequence: 1, houseSystem: "placidus" } },
  { technique: "western.synastry", options: { nodeType: "true" }, partner: true },
  { technique: "western.composite", options: { houseSystem: "placidus", nodeType: "true" }, partner: true },
  { technique: "western.astrocartography", options: {} },
  { technique: "western.relocation", options: { targetLocationId: "us-ny-new-york", houseSystem: "placidus" } },
  { technique: "western.local_space", options: { referenceLocationId: null } },
  { technique: "western.fixed_stars", options: { nodeType: "true", orb: 3 } },
  { technique: "western.profections", options: { age: 36 } },
  { technique: "western.extra_points", options: { sections: ["asteroids", "lots", "lilith"], houseSystem: "placidus" } },
  { technique: "western.planetary_return", options: { planet: "jupiter", approxDate: "2025-12-01", crossing: 2, houseSystem: "placidus", returnLocationId: null } },
  { technique: "western.declination_parallels", options: { month: "2026-03", orb: 1.5, nodeType: "true", displayTz: "Europe/Istanbul" } },
  { technique: "vedic.d1", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.varga", options: { division: 9, ayanamsa: "lahiri" } },
  { technique: "vedic.dasha", options: { ayanamsa: "lahiri", mahadasha: null, antardasha: null, chainAtUtc: "2026-11-01T09:00" } },
  { technique: "vedic.drishti", options: {} },
  { technique: "vedic.ashtakavarga", options: {} },
  { technique: "vedic.shadbala", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.panchanga", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.transit", options: { ayanamsa: "lahiri", atUtc: "2026-10-07T09:00" } },
  { technique: "vedic.bhav_chalit", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.chara_karaka", options: { ayanamsa: "lahiri", scheme: "seven" } },
  { technique: "vedic.arudha", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.bhava_bala", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.gun_milan", options: { ayanamsa: "lahiri" }, partner: true },
  { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.dashakoot", options: { ayanamsa: "lahiri" }, partner: true },
  { technique: "vedic.papasamyam", options: { ayanamsa: "lahiri" }, partner: true },
  { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" } },
  { technique: "vedic.heliacal", options: { date: null, placeLocationId: null } },
  { technique: "vedic.monthly", options: { year: 2026, month: 2, sections: ["ingress", "aspects", "lunar", "parallels"], ayanamsa: "lahiri", displayTz: "Europe/Istanbul" } },
  { technique: "kp.chart", options: { ayanamsa: "kp-newcomb", nodeType: "mean" } },
  { technique: "kp.dasha", options: { ayanamsa: "kp-newcomb", nodeType: "mean", mahadasha: null, antardasha: null, chainAtUtc: "2026-11-01T09:00" } },
  { technique: "kp.ruling", options: { atUtc: "2026-10-07T09:00", nodeType: "mean", placeLocationId: null } },
  { technique: "kp.transit", options: { range: { startDate: "2026-10-01", days: 92, planets: ["moon"], kinds: ["sublord"] } } },
  { technique: "kp.horary", options: { atUtc: "2026-10-07T09:00", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } },
  { technique: "kp.ruling_interval", options: { atUtc: "2026-10-07T08:30", durationMinutes: 60, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } },
  { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" }, who: "B" },
];

const canon = (v: unknown): string =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canon).join(",")}]`
      : `{${Object.keys(v as object)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
          .join(",")}}`;

async function main() {
  const check = process.argv.includes("--check");
  const { createFakeClient, createStore } = await import("../fakeSupabase");
  const { createAstroProfile, listAstroProfiles, getAstroProfileDetail } = await import("@/lib/astrology/profiles/service");
  const { runAstrology, planAstrology, viewCachedSelections } = await import("@/lib/astrology/engine/service");
  const { saveAnalysis, listAnalyses, getAnalysis, getWorkspace } = await import("@/lib/astrology/analyses/service");
  const { listKb } = await import("@/lib/astrology/kb/service");
  const { searchClientCandidates } = await import("@/lib/astrology/clients/service");
  const { listHoraryRecords } = await import("@/lib/astrology/horary/westernRecords");
  const { resolveAstroLocation } = await import("@/lib/astrology/birth/location");
  const { syntheticCurrentResponse, syntheticDeepResponse, syntheticSubResponse } = await import("../syntheticDasha");
  // Modül yükleme (tsx derleme önbelleği vb.) saat çağırabilir → sayaç üretim başlamadan sıfırlanır (deterministik çıktı).
  tick = 0;

  // ── KATI sağlayıcı: yalnız gerçek kayıtlı yanıt (birebir gövde) ─────────────────────────────────────────────────────
  const GOLD = readdirSync(join(FX, "golden"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const g = JSON.parse(readFileSync(join(FX, "golden", f), "utf8"));
      return { f, endpoint: g.endpoint as string, body: canon(g.body), query: (g.query ?? null) as Record<string, string> | null, response: g.response };
    });
  const NATAL = JSON.parse(readFileSync(join(FX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const sources = new Set<string>();
  const misses: string[] = [];
  const match = (endpoint: string, body: Record<string, unknown>, query: Record<string, string> | undefined): unknown | null => {
    const exact = GOLD.find((g) => g.endpoint === endpoint && g.body === canon(body) && (!g.query || canon(g.query) === canon(query ?? {})));
    if (exact) {
      sources.add(`golden/${exact.f}`);
      return structuredClone(exact.response);
    }
    if (endpoint === "/astrology/natal-chart") {
      const bd = NATAL.birthDetails;
      if (["date", "time", "latitude", "longitude", "timezone", "nodeType"].every((k) => canon(body[k]) === canon(bd[k])) && body.houseSystem === NATAL.houseSystem) {
        sources.add("roxy-natal-golden-2026-10-07.json");
        return structuredClone(NATAL);
      }
    }
    const major = (b: unknown) => GOLD.find((g) => g.endpoint === "/vedic-astrology/dasha/major" && g.body === canon(b));
    const m = /^\/vedic-astrology\/dasha\/sub\/([A-Za-z]+)(?:\/([A-Za-z]+))?(?:\/([A-Za-z]+))?(?:\/([A-Za-z]+))?$/.exec(endpoint);
    if (m) {
      const mj = major(body);
      const segs = [m[1], m[2], m[3], m[4]].filter(Boolean) as string[];
      const r = mj ? (segs.length <= 2 ? syntheticSubResponse(mj.response, segs[0], segs[1] ?? null) : syntheticDeepResponse(mj.response, segs)) : null;
      if (r) {
        sources.add(`dasha-model(${mj!.f})`);
        return r;
      }
    }
    if (endpoint === "/vedic-astrology/dasha/current" && typeof body.datetime === "string") {
      const { datetime, ...b } = body;
      const mj = major(b);
      const r = mj ? syntheticCurrentResponse(mj.response, String(datetime)) : null;
      if (r) {
        sources.add(`dasha-model(${mj!.f})`);
        return r;
      }
    }
    return null;
  };

  const store = createStore({ users: [], clients: [] });
  const ctx = {
    db: createFakeClient(store),
    tenantId: TENANT,
    userId: USER,
    // Demo görünümü: motor + kendi Bilgi Bankası açık; SAĞLAYICI YORUMU YOK (lisans).
    entitlements: { module: true, engine: true, knowledgeBank: true, providerInterpretations: false },
  };
  const deps = {
    config: { apiKey: "offline-golden-only", baseUrl: "https://offline.invalid/api/v2" },
    callProvider: async (_c: unknown, endpoint: string, body: Record<string, unknown>, opts: { lang: string; query?: Record<string, string> }) => {
      const raw = match(endpoint, body, opts.query ?? (opts.lang && opts.lang !== "en" ? { lang: opts.lang } : undefined));
      if (raw) return { ok: true as const, raw, attempts: 1 };
      misses.push(`${endpoint} ${canon(body)}`);
      return { ok: false as const, kind: "server_error" as const, status: 500, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    now: () => new RealDate(FIXED_NOW),
    clock: () => 0,
    log: () => undefined,
  };
  const idOf = (r: { body: Record<string, unknown> }) => (r.body as { profile: { id: string } }).profile.id;
  const a = await createAstroProfile(ctx, { label: "Örnek Harita A — İstanbul", birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" }, resolveAstroLocation);
  const b = await createAstroProfile(ctx, { label: "Örnek Harita B — Ankara", birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-06-ankara" }, resolveAstroLocation);
  if (a.status >= 300 || b.status >= 300) throw new Error(`profil oluşturulamadı: ${JSON.stringify(a.body)} ${JSON.stringify(b.body)}`);
  const pa = idOf(a);
  const pb = idOf(b);

  const failures: string[] = [];
  const selections: Record<string, unknown>[] = [];
  const revisions: Record<string, unknown> = {};
  let n = 0;
  for (const s of DEMO_SELECTIONS) {
    n += 1;
    const profileId = s.who === "B" ? pb : pa;
    const options = s.partner ? { ...s.options, partnerProfileId: pb } : s.options;
    const req = { profileId, revision: 1, selections: [{ technique: s.technique, options }] };
    misses.length = 0;
    const run = await runAstrology(ctx, req, deps, { ownerPreviewHideInterp: false });
    const item = ((run.body as { results?: { ok: boolean; code?: string }[] }).results ?? [])[0];
    if (!item?.ok || misses.length > 0) {
      failures.push(`${s.technique}: ${item?.code ?? run.status} ${misses.join(" | ")}`);
      continue;
    }
    const plan = await planAstrology(ctx, req, new RealDate(FIXED_NOW));
    const pl = (plan.body as { plan: { newRequestCount: number; selections: { options: unknown }[] } }).plan;
    if (pl.newRequestCount !== 0) failures.push(`${s.technique}: plan yeni istek bekliyor (${pl.newRequestCount})`);
    const view = await viewCachedSelections(ctx, req, { ownerPreviewHideInterp: false });
    const vItem = ((view.body as { results: { ok: boolean }[] }).results ?? [])[0];
    if (!vItem?.ok) failures.push(`${s.technique}: önbellek görünümü yok`);
    revisions[profileId] ??= (view.body as { revision: unknown }).revision;
    const normalized = pl.selections[0].options as Record<string, unknown>;
    const ws = await getWorkspace(ctx, { profileId, revision: 1, technique: s.technique, options: normalized });
    const saved = await saveAnalysis(
      ctx,
      { profileId, revision: 1, technique: s.technique, options: normalized, includeProviderInterp: false, saveRequestId: `de300000-0000-4000-8000-${String(1000 + n).padStart(12, "0")}` },
      false,
    );
    if (saved.status >= 300) failures.push(`${s.technique}: kayıt başarısız ${JSON.stringify(saved.body).slice(0, 200)}`);
    selections.push({
      profileId,
      technique: s.technique,
      options: normalized,
      plan: pl,
      view: vItem,
      workspace: ws.status === 200 ? ws.body : null,
    });
  }
  if (failures.length > 0) {
    console.error(`ÖRNEK ÜRETİLEMEDİ (${failures.length}):\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }

  const profiles: Record<string, unknown> = {};
  const analysesList: Record<string, unknown> = {};
  const analyses: Record<string, unknown> = {};
  for (const pid of [pa, pb]) {
    profiles[pid] = (await getAstroProfileDetail(ctx, pid)).body;
    const list = await listAnalyses(ctx, pid, new URLSearchParams({ limit: "200" }));
    analysesList[pid] = list.body;
    for (const row of (list.body as { analyses: { id: string }[] }).analyses) analyses[row.id] = (await getAnalysis(ctx, row.id, false)).body;
  }
  const fixture = {
    schema: "astro.demo.fixture.v1",
    note: "OTOMATİK ÜRETİLDİ — elle düzenlemeyin. scripts/astrology/demo/build-demo-fixture.ts (gerçek motor + depodaki gerçek sağlayıcı yanıtları; sağlayıcı yorumu yok).",
    generatedAt: new RealDate(FIXED_NOW).toISOString(),
    providerSources: [...sources].sort(),
    profilesList: (await listAstroProfiles(ctx, new URLSearchParams())).body,
    // Analiz Arşivi görünümü (kayıtlı analizi olan profiller) ve arşivlenmiş profiller (demo'da yok → boş liste).
    profilesArchive: (await listAstroProfiles(ctx, new URLSearchParams({ view: "archive" }))).body,
    profilesArchived: (await listAstroProfiles(ctx, new URLSearchParams({ archived: "1" }))).body,
    profiles,
    analysesList,
    analyses,
    revisions,
    kb: (await listKb(ctx, {})).body,
    // Demo hesabının danışan / Horary kaydı YOK: boş yanıtlar da gerçek servislerden alınır (biçim birebir).
    emptyClientCandidates: (await searchClientCandidates(ctx, new URLSearchParams({ name: "örnek" }))).body,
    emptyHoraryRecords: (await listHoraryRecords({ db: ctx.db, tenantId: TENANT, userId: USER }, new URLSearchParams())).body,
    selections,
  };
  const text = [
    "// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: scripts/astrology/demo/build-demo-fixture.ts (--check ile doğrulanır).",
    "// Gökyüzü Atlası demo örneği: sistemin kendi motoru + depodaki gerçek sağlayıcı yanıtları; sağlayıcı yorumu YOK; sentetik kişiler.",
    `const DEMO_FIXTURE_JSON: string = ${JSON.stringify(JSON.stringify(fixture))};`,
    "export default DEMO_FIXTURE_JSON;",
    "",
  ].join("\n");
  if (check) {
    let cur = "";
    try {
      cur = readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
    } catch {
      /* yok */
    }
    if (cur !== text) {
      console.error("DEMO ÖRNEK VERİSİ GÜNCEL DEĞİL: depodaki dosya bu betikle birebir yeniden üretilemiyor. Betiği --check olmadan çalıştırın.");
      process.exit(1);
    }
    console.log(`demo örnek verisi güncel: ${selections.length} seçim, ${Object.keys(analyses).length} kayıtlı analiz, ${sources.size} gerçek sağlayıcı kaynağı`);
    return;
  }
  writeFileSync(OUT, text, "utf8");
  console.log(`yazıldı: ${OUT} (${(text.length / 1024).toFixed(0)} KB) — ${selections.length} seçim, ${Object.keys(analyses).length} kayıtlı analiz, ${sources.size} kaynak`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

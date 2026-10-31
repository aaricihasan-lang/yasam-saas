/**
 * GÖKYÜZÜ ATLASI — #643 NATAL ENTEGRASYONU AŞAMA 2: 8 ev sistemi Natal API'sinde (lib/astrology/engine/natalHouses.ts).
 * Ağ YOK: bellek içi sahte Supabase + sayaçlı sahte sağlayıcı. Sağlayıcı yanıtı GERÇEK Türkçe Natal yanıtıdır
 * (fixtures/roxy-natal-golden-2026-10-07.json — doğum verisi, buradaki profille birebir: 1990-07-15 14:30 İstanbul).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-natal-houses-api.harness.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { getAstrologyResult, runAstrology, viewCachedSelections, type EngineCtx } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import { NATAL_HOUSE_SYSTEMS, LOCAL_NATAL_INTERP_NOTE } from "@/lib/astrology/engine/natalHouses";
import { deriveLocalNatalHouses, sanitizeNatalInterpretationForLocalHouses, textHasHouseReference } from "@/lib/astrology/pro/houses/natalLocal";
import { PRO_HOUSE_SYSTEMS, type ProHouseSystem } from "@/lib/astrology/pro/houses/engine";
import type { NatalInterpretation, NatalTechnical } from "@/lib/astrology/model/western";
import { GOLDEN, LOCATIONS, createProfile, natalApiSnapshot, ownerCtx, providerDeps, seedStore } from "./fixtures/pro-natal-houses/natal-api-snapshot";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack?.split("\n").slice(0, 3).join("\n  ")}\n`);
  }
}
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test yardımcısı (API gövdesi)
const FX = join(__dirname, "fixtures");
const HOPT = (houseSystem: string, nodeType = "true") => ({ houseSystem, nodeType });
const natalSel = (hs: string) => [{ technique: "western.natal", options: HOPT(hs) }];
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps = providerDeps().deps) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: false });
const GOLDEN_TECH = (() => {
  const p = projectRoxyNatal(GOLDEN, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden projeksiyon");
  return p.value;
})();
/** Görünümdeki TÜM metinlerde ev atfı var mı (yorum sızıntısı denetimi). */
function houseRefStrings(v: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") {
      if (textHasHouseReference(x)) out.push(x.slice(0, 80));
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(v);
  return out;
}
const SIGN_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const pt = (lon: number) => ({ longitude: lon, sign: SIGN_EN[Math.floor(lon / 30) % 12], degree: lon % 30 });

async function setup(over: Record<string, unknown> = {}) {
  const store = seedStore();
  const ctx = ownerCtx(store);
  const pid = await createProfile(ctx, over);
  return { store, ctx, pid };
}

async function main() {
  await t("A0 regresyon kilidi: mevcut 4 sistemin API çıktısı + önbellek anahtarları, DEĞİŞİKLİKSİZ taban (#655 6cf67bfc) ile BAYT-AYNI (run, results/[id], kaydet/aç, resultId kaydı; saat bilinen/bilinmeyen)", async () => {
    const base = JSON.parse(readFileSync(join(FX, "pro-natal-houses", "natal-api-baseline-2026-10-31.json"), "utf8")) as { bytes: number; sha256: string };
    const s = JSON.stringify(await natalApiSnapshot());
    assert.equal(s.length, base.bytes, "bayt sayısı");
    assert.equal(createHash("sha256").update(s).digest("hex"), base.sha256, "sha256");
  });

  await t("A1 önbellek anahtarı: 4 klasik sistemin Natal birimi = Placidus birimi (input_hash, gövde, adaptör, endpoint) — 3 doğum × 2 düğüm türü", () => {
    const def = getTechnique("western.natal")!;
    const births = [
      { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 },
      { birthDate: "1972-02-29", birthTime: null, utcOffsetSeconds: 7200, latitude: -33.8688, longitude: 151.2093 },
      { birthDate: "1900-01-01", birthTime: "12:00:00", utcOffsetSeconds: 7016, latitude: 63.4305, longitude: 10.3951 },
    ];
    for (const b of births)
      for (const nodeType of ["true", "mean"]) {
        const ref = def.units({ birth: b as never, birthUtc: "x", partner: null }, def.parseOptions(HOPT("placidus", nodeType), new Date(0))!)[0];
        for (const s of PRO_HOUSE_SYSTEMS) {
          const u = def.units({ birth: b as never, birthUtc: "x", partner: null }, def.parseOptions(HOPT(s, nodeType), new Date(0))!)[0];
          assert.equal(u.inputHash, ref.inputHash, `${s} ${nodeType}`);
          assert.equal(u.adapterVersion, "astro-roxy-natal-1");
          assert.deepEqual(u.body, ref.body);
          assert.equal(u.body.houseSystem, "placidus");
        }
      }
    assert.deepEqual([...NATAL_HOUSE_SYSTEMS], ["placidus", "whole-sign", "equal", "koch", "regiomontanus", "campanus", "porphyry", "alcabitius"]);
    assert.equal(def.parseOptions(HOPT("topocentric"), new Date(0)), null);
  });

  await t("A2 Placidus önbellekteyken 4 klasik sistem: her biri 0 EK sağlayıcı çağrısı; görünüm doğru sistem + yerel hesap etiketi; evler Aşama 1 motoruyla birebir", async () => {
    const { ctx, pid } = await setup();
    const p0 = providerDeps();
    const r0 = await run(ctx, pid, natalSel("placidus"), p0.deps);
    assert.equal(r0.status, 200);
    assert.equal(p0.calls.length, 1);
    const expect = new Map(PRO_HOUSE_SYSTEMS.map((s) => [s, deriveLocalNatalHouses(GOLDEN_TECH.technical, s)]));
    for (const s of PRO_HOUSE_SYSTEMS) {
      const p = providerDeps();
      const r = await run(ctx, pid, natalSel(s), p.deps);
      const res = (r.body as J).results[0];
      assert.equal(r.status, 200, s);
      assert.equal(p.calls.length, 0, `${s}: ek çağrı`);
      assert.equal((r.body as J).executed.newResults, 0);
      assert.equal(res.view.method.houseSystem, s);
      assert.equal(res.view.method.houseCalculation, "local");
      assert.match(res.view.method.houseEngine, /^natal-local-houses-1\/pro-houses-1\.0\.0$/);
      const e = expect.get(s)!;
      assert.ok(e.ok);
      assert.deepEqual(res.view.technical.houses, e.technical.houses, `${s} evler`);
      assert.deepEqual(res.view.technical.bodies.map((b: J) => b.house), e.technical.bodies.map((b) => b.house), `${s} gezegen evleri`);
      assert.equal(res.view.technical.points.partOfFortune.house, e.technical.points.partOfFortune!.house);
      assert.equal(res.view.technical.points.vertex.house, e.technical.points.vertex!.house);
      // Görünüm ve satır aynı önbellek satırı (Placidus): ek satır yok.
      assert.equal(res.view.adapterVersion, "astro-roxy-natal-1");
    }
  });

  await t("A3 önce klasik sistem: 1 çağrı (Placidus gövdesi); ardından Placidus ve diğer klasikler 0 çağrı; tek önbellek satırı", async () => {
    const { store, ctx, pid } = await setup();
    const p1 = providerDeps();
    await run(ctx, pid, natalSel("campanus"), p1.deps);
    assert.equal(p1.calls.length, 1);
    assert.equal(p1.calls[0].body.houseSystem, "placidus");
    for (const s of ["placidus", "regiomontanus", "porphyry", "alcabitius", "campanus"]) {
      const p = providerDeps();
      const r = await run(ctx, pid, natalSel(s), p.deps);
      assert.equal(p.calls.length, 0, s);
      assert.equal((r.body as J).results[0].view.method.houseSystem, s);
    }
    assert.equal(store.tables.astro_provider_results?.length, 1, "tek önbellek satırı (Placidus)");
    assert.equal((store.tables.astro_provider_results[0] as { technical: { houseSystem: string } }).technical.houseSystem, "placidus", "saklanan satır saf Placidus");
  });

  await t("A4 yalnız önbellek görünümü (engine/view): 8 sistem tek istekte, sağlayıcı bağımlılığı yok (yapısal 0 çağrı); sistemler karışmaz", async () => {
    const { ctx, pid } = await setup();
    await run(ctx, pid, natalSel("placidus"));
    const r = await viewCachedSelections(ctx, { profileId: pid, selections: NATAL_HOUSE_SYSTEMS.map((s) => ({ technique: "western.natal", options: HOPT(s) })) }, { ownerPreviewHideInterp: false });
    const res = (r.body as J).results as J[];
    // whole-sign / equal / koch ayrı önbellek satırı ister → hesaplanmadı; Placidus + 4 klasik açılır.
    for (const [i, s] of NATAL_HOUSE_SYSTEMS.entries()) {
      if (s === "whole-sign" || s === "equal" || s === "koch") {
        assert.equal(res[i].code, "NOT_COMPUTED", s);
        continue;
      }
      assert.equal(res[i].ok, true, s);
      assert.equal(res[i].view.method.houseSystem, s);
    }
    const cusps = new Set(res.filter((x) => x.ok).map((x) => JSON.stringify(x.view.technical.houses.map((h: J) => h.longitude))));
    assert.equal(cusps.size, 5, "her sistemin kendi evleri");
  });

  await t("A5 TÜRKÇE yorum güvenliği (gerçek yanıt): klasik sistemde gezegen yorumları (14, hepsi ev numaralı) çıkarılır, açı (33) / desen (3) / genel özet korunur; sunulan yorumda ev atfı 0; Placidus'ta değişmez", async () => {
    const { ctx, pid } = await setup();
    const pl = (await run(ctx, pid, natalSel("placidus"))).body as J;
    const plI = pl.results[0].view.interpretation;
    assert.equal(plI.visible, true);
    assert.equal(plI.content.bodies.length, 14);
    assert.ok(houseRefStrings(plI.content.bodies).length >= 14, "Placidus'ta gezegen yorumları ev atfı içerir (beklenen)");
    assert.ok(!plI.notice.includes(LOCAL_NATAL_INTERP_NOTE));
    for (const s of PRO_HOUSE_SYSTEMS) {
      const r = (await run(ctx, pid, natalSel(s))).body as J;
      const I = r.results[0].view.interpretation;
      assert.equal(I.visible, true, s);
      assert.deepEqual(I.content.bodies, [], s);
      assert.equal(I.content.aspects.length, 33, s);
      assert.equal(I.content.patterns.length, 3, s);
      assert.deepEqual(I.content.overall, plI.content.overall, s);
      assert.deepEqual(houseRefStrings(I.content), [], `${s}: sunulan yorumda ev atfı`);
      assert.ok(I.notice.endsWith(LOCAL_NATAL_INTERP_NOTE), s);
    }
  });

  await t("A6 kaydet + yeniden aç: klasik sistemle kayıt doğru sistem/evler/yorumla saklanır ve açılır; resultId yolu: parametresiz Placidus, options ile klasik, uyuşmazlıkta 409 (yanlış sistemle KAYIT YOK)", async () => {
    const { ctx, pid } = await setup();
    const pl = (await run(ctx, pid, natalSel("placidus"))).body as J;
    const resultId = pl.results[0].view.id as string;
    let seq = 100;
    const rid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
    const save = await saveAnalysis(ctx, { profileId: pid, revision: 1, technique: "western.natal", options: HOPT("regiomontanus"), title: "Regio", saveRequestId: rid() }, false);
    assert.equal(save.status, 201, JSON.stringify(save.body));
    const open = await getAnalysis(ctx, (save.body as J).analysisId, false);
    assert.equal(open.status, 200);
    const a = (open.body as J).analysis as J;
    assert.equal(a.method.houseSystem, "regiomontanus", "yöntem snapshot'ı");
    assert.equal(a.technical.houseSystem, "regiomontanus");
    assert.equal(a.technical.houseSource.kind, "local", "yerel hesap kaynağı snapshot'ta");
    const exp = deriveLocalNatalHouses(GOLDEN_TECH.technical, "regiomontanus");
    assert.ok(exp.ok);
    assert.deepEqual(a.technical.houses, exp.technical.houses, "kayıtlı evler = türetilmiş evler");
    assert.deepEqual(a.technical.bodies.map((b: J) => b.house), exp.technical.bodies.map((b) => b.house));
    assert.equal(a.interpretation.visible, true, "owner'da yorum saklanır");
    assert.deepEqual(a.interpretation.content.bodies, [], "kayıtlı yorumda gezegen yorumu yok");
    assert.equal(a.interpretation.content.aspects.length, 33);
    assert.deepEqual(houseRefStrings(a.interpretation.content), [], "kayıtlı yorumda ev atfı");
    // resultId yolları
    const byId = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId, title: "id", saveRequestId: rid() }, false);
    assert.equal(byId.status, 201);
    assert.equal(((await getAnalysis(ctx, (byId.body as J).analysisId, false)).body as J).analysis.method.houseSystem, "placidus");
    const byIdLocal = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId, options: { houseSystem: "campanus" }, title: "id-c", saveRequestId: rid() }, false);
    assert.equal(byIdLocal.status, 201, JSON.stringify(byIdLocal.body));
    const cA = ((await getAnalysis(ctx, (byIdLocal.body as J).analysisId, false)).body as J).analysis;
    assert.equal(cA.method.houseSystem, "campanus");
    assert.equal(cA.technical.houseSource.kind, "local");
    assert.deepEqual(cA.interpretation.content.bodies, []);
    for (const [opts, code, st] of [
      [{ houseSystem: "koch" }, "HOUSE_SYSTEM_MISMATCH", 409],
      [{ houseSystem: "whole-sign" }, "HOUSE_SYSTEM_MISMATCH", 409],
      [{ houseSystem: "porphyry", nodeType: "mean" }, "HOUSE_SYSTEM_MISMATCH", 409],
      [{ houseSystem: "topocentric" }, "INVALID_HOUSE_SYSTEM", 400],
    ] as const) {
      const r = await saveAnalysis(ctx, { profileId: pid, revision: 1, resultId, options: opts, title: "x", saveRequestId: rid() }, false);
      assert.equal(r.status, st, JSON.stringify(opts));
      assert.equal((r.body as J).code, code);
    }
  });

  await t("A7 results/[id] yeniden açma: parametresiz Placidus (eski davranış); ?houseSystem=porphyry → Porphyry; koch → 409; geçersiz → 400; placidus → aynı evler", async () => {
    const { ctx, pid } = await setup();
    const pl = (await run(ctx, pid, natalSel("placidus"))).body as J;
    const id = pl.results[0].view.id as string;
    const q = (houseSystem: string | null) => getAstrologyResult(ctx, id, { profileId: null, revision: null, ownerPreviewHideInterp: false, houseSystem });
    const none = await q(null);
    assert.equal((none.body as J).view.method.houseSystem, "placidus");
    assert.equal((none.body as J).view.method.houseCalculation, undefined);
    const por = await q("porphyry");
    assert.equal(por.status, 200);
    assert.equal((por.body as J).view.method.houseSystem, "porphyry");
    assert.deepEqual((por.body as J).view.interpretation.content.bodies, []);
    const same = await q("placidus");
    assert.deepEqual((same.body as J).view.technical.houses, (none.body as J).view.technical.houses);
    assert.equal((await q("koch")).status, 409);
    assert.equal(((await q("koch")).body as J).code, "HOUSE_SYSTEM_MISMATCH");
    assert.equal((await q("topocentric")).status, 400);
  });

  await t("A8 Natal + Sinastri + Solar Return birlikte: Natal 8'li seçimi diğerlerini etkilemez; diğer teknikler klasik sistemi REDDEDER (4 sistem kuralı); sağlayıcı gövdeleri kendi sistemiyle", async () => {
    const { ctx, pid } = await setup();
    const partner = await createProfile(ctx, { label: "Örnek — eş", birthDate: "1988-03-02", birthTime: "09:10" });
    const golden = (f: string) => (JSON.parse(readFileSync(join(FX, "golden", f), "utf8")) as { response: unknown }).response;
    const p = providerDeps((endpoint) => (endpoint === "/astrology/natal-chart" ? GOLDEN : endpoint.includes("synastry") ? golden("synastry.json") : golden("solar-return.json")));
    const sel = [
      { technique: "western.natal", options: HOPT("regiomontanus") },
      { technique: "western.synastry", options: { partnerProfileId: partner, houseSystem: "koch", nodeType: "true" } },
      { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "equal", returnLocationId: null } },
    ];
    const r = await run(ctx, pid, sel, p.deps);
    const res = (r.body as J).results as J[];
    assert.equal(res[0].ok, true);
    assert.equal(res[0].view.method.houseSystem, "regiomontanus");
    const bodies = p.calls.map((c) => ({ endpoint: c.endpoint, hs: c.body.houseSystem ?? (c.body as J).person1?.houseSystem }));
    assert.deepEqual(bodies.find((b) => b.endpoint === "/astrology/natal-chart")?.hs, "placidus");
    assert.ok(p.calls.some((c) => /synastry/.test(c.endpoint) && JSON.stringify(c.body).includes('"koch"')), "sinastri gövdesi koch");
    assert.ok(p.calls.some((c) => /solar-return/.test(c.endpoint) && JSON.stringify(c.body).includes('"equal"')), "solar return gövdesi equal");
    assert.ok(!p.calls.some((c) => JSON.stringify(c.body).includes("regiomontanus")), "sağlayıcıya klasik sistem adı gitmez");
    // Diğer teknikler klasik sistemi kabul etmez.
    for (const [tech, opts] of [
      ["western.synastry", { partnerProfileId: partner, houseSystem: "regiomontanus", nodeType: "true" }],
      ["western.solar_return", { returnYear: 2026, houseSystem: "campanus", returnLocationId: null }],
      ["western.composite", { partnerProfileId: partner, houseSystem: "porphyry", nodeType: "true" }],
    ] as const) assert.equal(getTechnique(tech)!.parseOptions(opts, new Date(0)), null, tech);
    const bad = await run(ctx, pid, [sel[0], { technique: "western.synastry", options: { partnerProfileId: partner, houseSystem: "regiomontanus", nodeType: "true" } }]);
    assert.equal(bad.status, 400, `sinastri klasik sistem reddi: ${JSON.stringify(bad.body).slice(0, 160)}`);
  });

  await t("A9 doğum saati bilinmiyor: klasik sistemde evler/ASC/MC/ev yerleşimleri ve ev ayrıntıları (nearCusp, uyarı) gizli; gezegen yorumu yok; yöntem etiketi sistem adını korur", async () => {
    const { ctx, pid } = await setup({ birthTime: undefined, timeKnown: false, timeAccuracy: "unknown" });
    const p = providerDeps();
    const r = (await run(ctx, pid, natalSel("alcabitius"), p.deps)).body as J;
    const v = r.results[0].view;
    assert.equal(v.timeUnknownMasked, true);
    assert.deepEqual(v.technical.houses, []);
    assert.equal(v.technical.angles, null);
    assert.ok(v.technical.bodies.every((b: J) => b.house === null));
    assert.deepEqual(v.technical.points, { partOfFortune: null, vertex: null });
    assert.deepEqual(v.technical.houseSource.nearCusp, []);
    assert.deepEqual(v.technical.houseSource.warnings, []);
    assert.equal(v.method.houseSystem, "alcabitius");
    assert.deepEqual(v.interpretation.content?.bodies ?? [], []);
    assert.equal(p.calls[0].body.houseSystem, "placidus");
  });

  await t("A10 yüksek enlem (> 60°, gerçek sağlayıcı ASC/MC/cusp): klasik sistem görünümünde uyarı; Placidus görünümü mevcut haliyle (uyarı EKLENMEZ)", async () => {
    type RCase = { id: string; date: string; time: string; latitude: number; longitude: number; roxy: { asc: number; mc: number; placidus: number[] } };
    const R = (JSON.parse(readFileSync(join(FX, "pro-houses", "roxy-houses-2026-10-31.json"), "utf8")) as { cases: RCase[] }).cases;
    const c = R.find((x) => x.latitude > 60 && x.latitude < 66)!;
    const raw = structuredClone(GOLDEN) as J;
    raw.birthDetails = { date: c.date, time: c.time, latitude: c.latitude, longitude: c.longitude, timezone: 0, nodeType: "true" };
    raw.ascendant = { ...raw.ascendant, ...pt(c.roxy.asc) };
    raw.midheaven = { ...raw.midheaven, ...pt(c.roxy.mc) };
    raw.houses = c.roxy.placidus.map((lon, i) => ({ ...raw.houses[i], number: i + 1, ...pt(lon) }));
    const { ctx, pid } = await setup();
    const p = providerDeps(() => raw);
    const pl = (await run(ctx, pid, natalSel("placidus"), p.deps)).body as J;
    assert.ok(!pl.results[0].view.warnings.some((w: string) => /Yüksek enlem/.test(w)), "Placidus çıktısı değişmemeli");
    for (const s of PRO_HOUSE_SYSTEMS) {
      const r = (await run(ctx, pid, natalSel(s), p.deps)).body as J;
      assert.equal(r.results[0].ok, true, `${s} ${JSON.stringify(r.results[0]).slice(0, 200)}`);
      assert.ok(r.results[0].view.warnings.some((w: string) => /Yüksek enlem \(6\d\.\d° > 60°\)/.test(w)), s);
    }
    assert.equal(p.calls.length, 1);
  });

  await t("A11 kutup (Tromsø 69,65°): 4 klasik sistem + Placidus/Koch ENGELLİ (HOUSE_SYSTEM_POLAR, 0 çağrı); Tam Burç/Eşit Ev hesaplanır", async () => {
    const TROMSO: ResolvedLocation = { id: "no-tromso", label: "Tromsø, Norveç", timezone: "Europe/Oslo", latitude: 69.6492, longitude: 18.9553 };
    LOCATIONS.set(TROMSO.id, TROMSO);
    const { ctx, pid } = await setup({ locationId: TROMSO.id });
    for (const s of [...PRO_HOUSE_SYSTEMS, "placidus", "koch"]) {
      const p = providerDeps();
      const r = await run(ctx, pid, natalSel(s), p.deps);
      assert.equal(p.calls.length, 0, s);
      assert.equal((r.body as J).results[0].code, "HOUSE_SYSTEM_POLAR", s);
      assert.match((r.body as J).results[0].error, /Whole Sign veya Equal/);
    }
    const p = providerDeps();
    const ws = await run(ctx, pid, natalSel("whole-sign"), p.deps);
    assert.equal(p.calls.length, 1);
    assert.equal((ws.body as J).results[0].ok, true);
  });

  await t("A12 bütünlük kapısı API'de: sağlayıcı ASC 2″ tutarsızsa klasik sistem açık hata (LOCAL_HOUSES_FAILED, 422) — yanlış evlerle görünüm/kayıt YOK; Placidus aynı satırla açılır", async () => {
    const raw = structuredClone(GOLDEN) as J;
    raw.ascendant.longitude += 2 / 3600;
    const { ctx, pid } = await setup();
    const p = providerDeps(() => raw);
    const pl = (await run(ctx, pid, natalSel("placidus"), p.deps)).body as J;
    assert.equal(pl.results[0].ok, true);
    const r = await run(ctx, pid, natalSel("regiomontanus"), p.deps);
    assert.equal(r.status, 422);
    assert.equal((r.body as J).results[0].code, "LOCAL_HOUSES_FAILED");
    assert.equal((r.body as J).code, "LOCAL_HOUSES_FAILED");
    const v = await viewCachedSelections(ctx, { profileId: pid, selections: natalSel("campanus") }, { ownerPreviewHideInterp: false });
    assert.equal((v.body as J).results[0].code, "LOCAL_HOUSES_FAILED");
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, technique: "western.natal", options: HOPT("porphyry"), title: "x", saveRequestId: "00000000-0000-4000-8000-000000000999" }, false);
    assert.equal(sv.status, 409);
    assert.equal((sv.body as J).code, "LOCAL_HOUSES_FAILED");
  });

  await t("A13 Türkçe yorum filtresi (savunma derinliği): ev atfı taşıyan açı/desen/genel özet öğeleri çıkarılır, diğerleri birebir kalır", () => {
    const i = structuredClone(GOLDEN_TECH.interpretation) as NatalInterpretation;
    const cleanA = i.aspects.length;
    i.aspects.push({ ...i.aspects[0], summary: "Venüs Dokuzuncu Ev evindeki Mars ile kare yapar." });
    i.aspects.push({ ...i.aspects[1], summary: "Uyumlu bir açı.", keywords: ["beşinci evin yöneticisi"] });
    i.patterns.push({ ...i.patterns[0], text: "Bu desenin tepe noktası 10. ev konularını vurgular." });
    i.overall = { aspectSummary: "Haritada açılar çoğunlukla apoklima evinde toplanır." };
    const s = sanitizeNatalInterpretationForLocalHouses(i);
    assert.equal(s.content.aspects.length, cleanA);
    assert.deepEqual(s.content.aspects, GOLDEN_TECH.interpretation.aspects);
    assert.deepEqual(s.content.patterns, GOLDEN_TECH.interpretation.patterns);
    assert.equal(s.content.overall.aspectSummary, null);
    assert.deepEqual(s.removed, { bodies: 14, aspects: 2, patterns: 1, overall: 1 });
    assert.deepEqual(houseRefStrings(s.content), []);
  });

  await t("A14 statik: ürün kodunda lib/astrology/pro/** import eden TEK dosya lib/astrology/engine/natalHouses.ts (izole bağlantı noktası)", () => {
    const IMPORTS_PRO = /(from|import)\s*\(?\s*["'](@\/lib\/astrology\/pro\/|(\.\.\/)+pro\/|\.\/pro\/)/;
    const offenders: string[] = [];
    const root = join(__dirname, "..", "..");
    const walk = (rel: string) => {
      for (const f of readdirSync(join(root, rel))) {
        if (f === "node_modules" || f.startsWith(".")) continue;
        const r = `${rel}/${f}`;
        if (statSync(join(root, r)).isDirectory()) walk(r);
        else if (/\.(ts|tsx|js|mjs|cjs)$/.test(f) && !r.startsWith("lib/astrology/pro/") && IMPORTS_PRO.test(readFileSync(join(root, r), "utf8"))) offenders.push(r);
      }
    };
    for (const d of ["app", "lib", "components"]) walk(d);
    assert.deepEqual(offenders, ["lib/astrology/engine/natalHouses.ts"]);
  });

  await t("A15 etiketler: 8 sistemin Türkçe adı (rapor/arşiv yöntem satırı ham kimlik göstermez)", () => {
    for (const s of NATAL_HOUSE_SYSTEMS) assert.ok(NATAL_HOUSE_SYSTEM_LABELS[s] && NATAL_HOUSE_SYSTEM_LABELS[s] !== s, s);
    assert.equal(NATAL_HOUSE_SYSTEM_LABELS.regiomontanus, "Regiomontanus");
    const sys: ProHouseSystem[] = [...PRO_HOUSE_SYSTEMS];
    assert.equal(sys.length, 4);
    void (GOLDEN_TECH.technical as NatalTechnical);
  });

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();

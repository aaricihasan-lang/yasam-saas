/**
 * UPAGRAHA KUTUP GÜNÜ — KISMİ SONUÇ (24.10.2026, owner kararı madde 2) harness'i.
 *
 * Sorun (gerçek yanıtlarla kanıtlı; QA 42-kutup-upagraha): güneşin doğmadığı / batmadığı günde sağlayıcı zaman tabanlı listeyi BOŞ
 * verir (gündüz / gece 8'li bölüm tanımsız), Güneş türevli 5 noktayı ise doğru verir. Ürün bütün yanıtı reddediyordu (istek ücretli).
 * Karar: o yerel günde güneş GERÇEKTEN doğmuyor ya da batmıyorsa → yalnız Güneş türevli 5 nokta + açık not, sonuç KISMİ işaretlenir;
 * zaman tabanlı nokta üretilmez / uydurulmaz. Yalnız enlemle karar verilmez (gün + konum). Güneşin doğup battığı günde boş ya da eksik
 * liste HATA kalır; diğer bütün fail-closed denetimleri korunur.
 *
 * ÜCRETLİ ÇAĞRI (bu harness): 0. Fixture'lar GERÇEK sağlayıcı yanıtlarıdır (fixtures/upagraha-kutup/*, sentetik kişi, Tromsø 69,65°K):
 * 2024-05-15 ve 2024-11-25 (güneş doğup batıyor → 6 + 5), 2024-05-19 / 06-21 (kutup günü) ve 2024-11-29 / 12-21 (kutup gecesi) → 0 + 5.
 * Bağımsız doğrulama: astronomy-engine (MIT) ile gün doğumu / batımı varlığı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/upagraha-kutup.harness.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as AE from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import * as VN from "@/lib/astrology/providers/roxy/vedicNoktalar";
import * as VM from "@/lib/astrology/model/vedicNoktalar";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
// Ad alanı içe aktarımı: düzeltme ÖNCESİ koşuda eksik dışa aktarım tek tek FAIL olarak görünür (koşu çökmez).
const need = (name: string) => () => {
  throw new Error(`dışa aktarım yok: ${name}`);
};
const projectRoxyVedicUpagraha = VN.projectRoxyVedicUpagraha as (raw: unknown, opts: J) => J;
const upagrahaSunDayKind: (date: string, offsetHours: number, latitude: number) => string = (VN as J).upagrahaSunDayKind ?? need("upagrahaSunDayKind");
const upagrahaDayUndefined: (day: { date: string; offsetHours: number; latitude: number }) => boolean = (VN as J).upagrahaDayUndefined ?? need("upagrahaDayUndefined");
const UPAGRAHA_PARTIAL_NOTE: string = (VM as J).UPAGRAHA_PARTIAL_NOTE ?? "«UPAGRAHA_PARTIAL_NOTE yok»";
type Fx = { endpoint: string; body: Record<string, J>; birth: { date: string; time: string; tz: string; lat: number; lon: number }; response: J };
const FX = (d: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", "upagraha-kutup", `tromso-${d}.json`), "utf8")) as Fx;
const NORMAL = ["2024-05-15", "2024-11-25"];
const POLAR = ["2024-05-19", "2024-06-21", "2024-11-29", "2024-12-21"];
const ALL = [...NORMAL, ...POLAR].map(FX);
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
const dayOf = (b: Record<string, J>) => ({ date: String(b.date), offsetHours: Number(b.timezone), latitude: Number(b.latitude) });
const proj = (raw: J, day?: ReturnType<typeof dayOf>) => projectRoxyVedicUpagraha(structuredClone(raw), { ayanamsa: "lahiri", ...(day ? { day } : {}) });

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
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const TROMSO: ResolvedLocation = { id: "no-tromso", label: "Tromsø, Norveç", timezone: "Europe/Oslo", latitude: 69.6492, longitude: 18.9553 };
const resolveLoc = (id: unknown) => (id === TROMSO.id ? TROMSO : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "K" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
/** Sahte sağlayıcı: YALNIZ fixture'ı olan BİREBİR gövdeye gerçek yanıt döner; başka gövde → 400 (sonuç uydurulmaz). */
function roxy() {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-uk", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const hit = ALL.find((f) => f.endpoint === endpoint && canon(f.body) === canon(body));
      if (!hit) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      return { ok: true, raw: structuredClone(hit.response), attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profileOn(ctx: EngineCtx, date: string): Promise<string> {
  const r = await createAstroProfile(ctx, { label: `Sentetik Kutup ${date}`, clientId: CLIENT_X, birthDate: date, birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: TROMSO.id }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const UPA = { technique: "vedic.upagraha", options: { ayanamsa: "lahiri" } };
const run = (ctx: EngineCtx, pid: string, deps: EngineDeps) => runAstrology(ctx, { profileId: pid, selections: [UPA] }, deps, { ownerPreviewHideInterp: false });
const TIME_ERR = "timeBased: 6 zaman tabanlı upagraha (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) tam ve tekil değil";

async function main() {
  // ═══ A) GERÇEK YANITLAR — prototip 17 testinin ürün karşılığı ═══════════════════════
  for (const f of ALL) {
    const polar = POLAR.includes(f.birth.date);
    await t(`A: ${f.birth.date} (${polar ? "güneş doğmuyor/batmıyor → KISMİ" : "güneş doğup batıyor → TAM"})`, () => {
      const r = proj(f.response, dayOf(f.body));
      assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
      if (!r.ok) return;
      if (polar) {
        assert.equal(r.technical.timeBased.length, 0, "zaman tabanlı nokta üretilmemeli");
        assert.equal(r.technical.sunBased.length, 5);
        assert.deepEqual(r.technical.partial, { reason: "sun_does_not_rise_or_set" });
      } else {
        assert.equal(r.technical.timeBased.length, 6);
        assert.equal(r.technical.partial, undefined, "tam sonuçta kısmi işareti olmamalı");
      }
    });
  }
  await t("A: kısmi sonuçta Güneş türevli 5 nokta sağlayıcı değeriyle BİREBİR (yeniden hesap / düzeltme yok)", () => {
    for (const d of POLAR) {
      const f = FX(d);
      const r = proj(f.response, dayOf(f.body));
      assert.ok(r.ok);
      if (!r.ok) continue;
      const want = Object.fromEntries((f.response.sunBased as J[]).map((p) => [p.name, p.longitude]));
      for (const p of r.technical.sunBased) assert.equal(p.longitude, want[p.id === "indra_chapa" ? "Indra Chapa" : p.id[0].toUpperCase() + p.id.slice(1)], `${d} ${p.id}`);
    }
  });

  // ═══ B) FAIL-CLOSED KORUNUR ══════════════════════════════════════════════════════
  const N = FX("2024-05-15");
  await t("B: güneşin doğup battığı gün (Tromsø 15 Mayıs) + boş zaman listesi → HATA (enlem tek başına karar vermez)", () => {
    const raw = structuredClone(N.response);
    raw.timeBased = [];
    const r = proj(raw, dayOf(N.body));
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.errors.includes(TIME_ERR), JSON.stringify(r));
  });
  await t("B: İstanbul (41°) + boş zaman listesi → HATA", () => {
    const raw = structuredClone(N.response);
    raw.timeBased = [];
    assert.equal(proj(raw, { date: "2024-06-21", offsetHours: 3, latitude: 41.0082 }).ok, false);
  });
  await t("B: kutup gününde 3/6 eksik zaman listesi → HATA (eksik liste kabul edilmez)", () => {
    const raw = structuredClone(FX("2024-06-21").response);
    raw.timeBased = structuredClone(N.response.timeBased).slice(0, 3);
    assert.equal(proj(raw, dayOf(FX("2024-06-21").body)).ok, false);
  });
  await t("B: kutup gününde bozuk Güneş zinciri (Upaketu +1°) → HATA", () => {
    const f = FX("2024-06-21");
    const raw = structuredClone(f.response);
    const u = (raw.sunBased as J[]).find((p) => p.name === "Upaketu");
    u.longitude += 1;
    u.degreeInSign += 1;
    const r = proj(raw, dayOf(f.body));
    assert.ok(!r.ok && r.errors.some((e: string) => e.startsWith("upaketu")), JSON.stringify(r));
  });
  await t("B: kutup gününde eksik Güneş türevli nokta → HATA", () => {
    const f = FX("2024-12-21");
    const raw = structuredClone(f.response);
    raw.sunBased.pop();
    assert.equal(proj(raw, dayOf(f.body)).ok, false);
  });
  await t("B: kutup gününde yanlış ayanamsa çerçevesi → HATA", () => {
    const f = FX("2024-12-21");
    const raw = structuredClone(f.response);
    raw.frame.ayanamsa = "raman";
    assert.equal(proj(raw, dayOf(f.body)).ok, false);
  });
  await t("B: gün bağlamı yoksa (eski çağıran) boş liste HATA kalır — davranış değişmez", () => {
    const f = FX("2024-06-21");
    const r = proj(f.response);
    assert.ok(!r.ok && r.errors.includes(TIME_ERR));
  });
  await t("B: geçersiz gün bağlamı (bozuk tarih / NaN ofset / enlem aralık dışı) → kısmi sonuç YOK", () => {
    const f = FX("2024-06-21");
    for (const day of [{ date: "2024-13-40", offsetHours: 2, latitude: 69.6 }, { date: "2024-06-21", offsetHours: Number.NaN, latitude: 69.6 }, { date: "2024-06-21", offsetHours: 2, latitude: 95 }])
      assert.equal(proj(f.response, day).ok, false, JSON.stringify(day));
  });

  // ═══ C) GÜN SINIFLAMASI — bağımsız astronomy-engine ═════════════════════════════════
  await t("C: güney yarımküre (−77,85°) iki gündönümü kutup; Tromsø ekinoks normal; 65° gündönümü normal", () => {
    assert.equal(upagrahaSunDayKind("2024-12-21", 12, -77.85), "polar");
    assert.equal(upagrahaSunDayKind("2024-06-21", 12, -77.85), "polar");
    assert.equal(upagrahaSunDayKind("2024-03-20", 1, 69.6492), "normal");
    assert.equal(upagrahaSunDayKind("2024-06-21", 2, 65.0), "normal");
  });
  await t("C: 2024'ün tüm günleri × 4 enlem (66,6° · 69,65° · 78,22° · −77,85°): sınıflama ↔ astronomy-engine gün doğumu/batımı varlığı — 0 yanlış", () => {
    const places: [number, number][] = [[66.6, 25.7], [69.6492, 18.9553], [78.22, 15.65], [-77.85, 166.67]];
    let wrong = 0;
    let unsure = 0;
    for (const [lat, lon] of places) {
      const obs = new AE.Observer(lat, lon, 0);
      const off = Math.round(lon / 15);
      for (let d = 0; d < 366; d++) {
        const date = new Date(Date.UTC(2024, 0, 1 + d)).toISOString().slice(0, 10);
        const start = AE.MakeTime(new Date(Date.parse(`${date}T00:00:00Z`) - off * 3600e3));
        const rise = AE.SearchRiseSet(AE.Body.Sun, obs, +1, start, 1);
        const set = AE.SearchRiseSet(AE.Body.Sun, obs, -1, start, 1);
        const polar = !(rise && set);
        const k = upagrahaSunDayKind(date, off, lat);
        if (k === "belirsiz") unsure += 1;
        else if ((k === "polar") !== polar) wrong += 1;
      }
    }
    assert.equal(wrong, 0, `yanlış sınıf ${wrong}`);
    assert.ok(unsure <= 60, `belirsiz bant çok geniş: ${unsure}`);
  });
  await t("C: Vedik gün güneş doğuşunda başlar → doğum günü YA DA önceki gün tanımsızsa kabul; ikisi de normalse ret", () => {
    // Kutup günü bitişi çevresi (Tromsø): önceki gün kutup, o gün normal olan ilk gün
    let found: string | null = null;
    for (let d = 190; d < 220 && !found; d++) {
      const a = new Date(Date.UTC(2024, 0, d)).toISOString().slice(0, 10);
      const b = new Date(Date.UTC(2024, 0, d + 1)).toISOString().slice(0, 10);
      if (upagrahaSunDayKind(a, 2, 69.6492) !== "normal" && upagrahaSunDayKind(b, 2, 69.6492) === "normal") found = b;
    }
    assert.ok(found, "geçiş günü bulunamadı");
    assert.equal(upagrahaDayUndefined({ date: found!, offsetHours: 2, latitude: 69.6492 }), true);
    assert.equal(upagrahaDayUndefined({ date: "2024-05-15", offsetHours: 2, latitude: 69.6492 }), false);
    assert.equal(upagrahaDayUndefined({ date: "2024-06-21", offsetHours: 2, latitude: 69.6492 }), true);
  });

  // ═══ D) MOTOR · KAYDET → AÇ · RAPOR · YETKİ · ESKİ KAYIT ═══════════════════════════════
  await t("D: motor — kutup günü profili: 1 istek, sonuç KABUL (kısmi), 0 + 5 nokta; tekrar 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profileOn(ctx, "2024-06-21");
    const rx = roxy();
    const r = (await run(ctx, pid, rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(rx.calls.length, 1);
    assert.equal(canon(rx.calls[0].body), canon(FX("2024-06-21").body), "gövde fixture ile birebir");
    const v = r.results[0].view.technical;
    assert.equal(v.timeBased.length, 0);
    assert.equal(v.sunBased.length, 5);
    assert.deepEqual(v.partial, { reason: "sun_does_not_rise_or_set" });
    await run(ctx, pid, rx.deps);
    assert.equal(rx.calls.length, 1, "önbellekten gelmeli");
  });
  await t("D: motor — güneşin doğup battığı gün (15 Mayıs) TAM sonuç; kısmi işareti yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profileOn(ctx, "2024-05-15");
    const rx = roxy();
    const r = (await run(ctx, pid, rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(r.results[0].view.technical.timeBased.length, 6);
    assert.equal(r.results[0].view.technical.partial, undefined);
  });
  async function saved(date: string) {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profileOn(ctx, date);
    const rx = roxy();
    await run(ctx, pid, rx.deps);
    const n = rx.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...UPA, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    return { store, ctx, pid, rx, id: (sv.body as J).analysisId as string, a };
  }
  await t("D: kaydet → arşivden aç 0 istek; kısmi işaret + 5 nokta korunur", async () => {
    const s = await saved("2024-11-29");
    assert.equal(s.a.technical.timeBased.length, 0);
    assert.equal(s.a.technical.sunBased.length, 5);
    assert.deepEqual(s.a.technical.partial, { reason: "sun_does_not_rise_or_set" });
  });
  const BAD = ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "fixture", "/vedic-astrology", "openapi"];
  await t("D: Word/PDF rapor modeli — kısmi sonuç notu var, Güneş türevli tablo var, zaman tabanlı satır YOK, marka yok", async () => {
    const s = reportTexts(buildAstroReport((await saved("2024-06-21")).a)).join("\n");
    for (const want of [UPAGRAHA_PARTIAL_NOTE, "Güneş türevli (Aprakasha / Dhuma grubu)", "Dhuma", "Upaketu", "Kısmi sonuç"]) assert.ok(s.includes(want), `rapor: "${want.slice(0, 50)}" yok`);
    for (const no of ["Gulika", "Yamaghantaka"].map((x) => `${x}\t`)) assert.ok(!s.includes(no));
    for (const bad of BAD) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });
  await t("D: eski kayıt uyumluluğu — tam sonuç (partial alanı yok) raporu kısmi not İÇERMEZ, 6 + 5 nokta aynen", async () => {
    const s = await saved("2024-05-15");
    assert.equal(s.a.technical.partial, undefined);
    const txt = reportTexts(buildAstroReport(s.a)).join("\n");
    assert.ok(!txt.includes(UPAGRAHA_PARTIAL_NOTE) && !txt.includes("Kısmi sonuç"));
    for (const want of ["Gulika", "Yamaghantaka", "Dhuma", "Zaman tabanlı (Kala-velā / Gulika türü)"]) assert.ok(txt.includes(want), want);
    // partial alanı olmayan ESKİ teknik veri (şema v1) raporu da aynı
    const old = structuredClone(s.a);
    delete old.technical.partial;
    assert.equal(reportTexts(buildAstroReport(old)).join("\n"), txt);
  });
  await t("D: yetki — başka tenant / aynı tenant başka uzman kısmi kaydı açamaz, çalıştıramaz (404)", async () => {
    const s = await saved("2024-06-21");
    assert.equal((await getAnalysis(ctxOf(s.store, { tenantId: TENANT_B, userId: USER_B }), s.id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(s.store, { userId: USER_A2 }), s.id, false)).status, 404);
    assert.equal((await run(ctxOf(s.store, { tenantId: TENANT_B, userId: USER_B }), s.pid, s.rx.deps)).status, 404);
  });

  console.log(`\nupagraha-kutup harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

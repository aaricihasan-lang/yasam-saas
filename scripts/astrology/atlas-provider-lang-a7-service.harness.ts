/**
 * I18N-F1-R5 / A7 — sağlayıcı dili bayrağı SERVİS düzeyinde uçtan uca (sahte DB + sahte sağlayıcı; ağ / ücret YOK).
 *
 *   E1 bayrak KAPALI (varsayılan): TR ve EN ekran dilinde sağlayıcıya giden dil "tr"; EN ekran aynı haritayı önbellekten
 *      açar → 0 yeni sağlayıcı isteği (I18N-0017: dil değişimi yeniden ücretlendirmez).
 *   E2 bayrak AÇIK (yalnız test ortamı): önceden hesaplanmış harita EN ekranda da önbellekten (0 istek; kimlik dilden bağımsız);
 *      YENİ harita EN ekranda lang=en ile istenir, kayıt input.lang / yorum lang = "en", input_hash yine kimlik dili "tr" ile
 *      üretilmiş anahtar (aynı harita TR ekranda tekrar hesaplanmaz).
 *   E3 bayrak yalnız tam "true" ile açılır ("1", "TRUE" kapalı).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-provider-lang-a7-service.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

type J = Record<string, unknown>;
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8")) as { response?: J } & J;
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT = "57575757-5757-4575-8575-575757575757";
const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

async function main() {
  const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Dil" }] });
  const base: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const calls: { lang: string; body: J }[] = [];
  const depsWith = (env: Record<string, string | undefined>): EngineDeps => ({
    config: { apiKey: "k-test-a7", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, _endpoint, body, opts) => {
      calls.push({ lang: opts.lang, body: body as J });
      const raw = structuredClone(NATAL_GOLDEN.response ?? NATAL_GOLDEN) as J;
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
    env,
  });
  const OFF = depsWith({});
  const ON = depsWith({ ASTRO_PROVIDER_LANG_EN: "true" });
  const mkProfile = async (label: string, birthDate: string) => {
    const pr = await createAstroProfile(base, { label, clientId: CLIENT, birthDate, birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, (id) => (id === IST.id ? IST : null));
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    return (pr.body as { profile: { id: string } }).profile.id;
  };
  const run = async (ctx: EngineCtx, profileId: string, deps: EngineDeps) => (await runAstrology(ctx, { profileId, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
  const rows = () => (store.tables.astro_provider_results as J[] | undefined) ?? [];
  const interps = () => (store.tables.astro_provider_interpretations as J[] | undefined) ?? [];

  console.log("\n[E] A7 sağlayıcı dili bayrağı — servis düzeyi");
  let p1 = "";
  await t("E1: bayrak KAPALI — TR ekran 1 istek (lang=tr); EN ekran aynı harita: 0 yeni istek, 0 yeni satır", async () => {
    p1 = await mkProfile("Sentetik A7-1", "1990-07-15");
    const r1 = await run({ ...base, locale: "tr" }, p1, OFF);
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 300));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].lang, "tr");
    const n = rows().length;
    const r2 = await run({ ...base, locale: "en" }, p1, OFF);
    assert.equal(r2.ok, true);
    assert.equal(calls.length, 1, "EN ekranda yeni ücretli istek yapılmamalı");
    assert.equal(rows().length, n);
    assert.equal((rows()[0].input as J).lang, "tr");
    assert.equal(interps()[0].lang, "tr");
  });
  await t("E1b: bayrak KAPALI — yeni harita EN ekranda da lang=tr ile istenir (bugünkü davranış birebir)", async () => {
    const p = await mkProfile("Sentetik A7-1b", "1985-02-03");
    const before = calls.length;
    const r = await run({ ...base, locale: "en" }, p, OFF);
    assert.equal(r.ok, true);
    assert.equal(calls.length, before + 1);
    assert.equal(calls[calls.length - 1].lang, "tr");
  });
  await t("E2: bayrak AÇIK — önceden hesaplanmış harita EN ekranda önbellekten (0 istek; kimlik dilden bağımsız)", async () => {
    const before = calls.length;
    const r = await run({ ...base, locale: "en" }, p1, ON);
    assert.equal(r.ok, true);
    assert.equal(calls.length, before, "aynı harita yeniden ücretlenmemeli");
  });
  await t("E2b: bayrak AÇIK — yeni harita EN ekranda lang=en; kayıt input.lang/yorum lang = en; input_hash kimlik dili 'tr' ile; TR ekran aynı satırı bulur", async () => {
    const p = await mkProfile("Sentetik A7-2", "1979-11-30");
    const before = calls.length;
    const r = await run({ ...base, locale: "en" }, p, ON);
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.equal(calls.length, before + 1);
    const c = calls[calls.length - 1];
    assert.equal(c.lang, "en");
    const row = rows()[rows().length - 1];
    assert.equal((row.input as J).lang, "en");
    const it = interps().find((x) => x.result_id === row.id)!;
    assert.equal(it.lang, "en");
    const expected = calcInputHash({ provider: String(row.provider), providerApiVersion: String(row.provider_api_version), adapterVersion: String(row.adapter_version), endpoint: String(row.endpoint), lang: "tr", body: c.body });
    assert.equal(row.input_hash, expected, "kimlik anahtarı sağlayıcı dilinden bağımsız olmalı");
    const n = calls.length;
    const r2 = await run({ ...base, locale: "tr" }, p, ON);
    assert.equal(r2.ok, true);
    assert.equal(calls.length, n, "TR ekranda aynı harita yeniden hesaplanmamalı");
  });
  await t("E3: bayrak yalnız tam 'true' ile açılır", async () => {
    for (const v of ["1", "TRUE", "yes", ""]) {
      const p = await mkProfile(`Sentetik A7-3-${v || "bos"}`, `1970-01-0${["1", "TRUE", "yes", ""].indexOf(v) + 1}`);
      const before = calls.length;
      await run({ ...base, locale: "en" }, p, depsWith({ ASTRO_PROVIDER_LANG_EN: v }));
      assert.equal(calls.length, before + 1);
      assert.equal(calls[calls.length - 1].lang, "tr", `değer ${JSON.stringify(v)}`);
    }
  });

  console.log(`\natlas-provider-lang-a7-service: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();

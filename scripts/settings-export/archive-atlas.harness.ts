/**
 * Premium Word Arşivi — Gökyüzü Atlası kayıtlı analiz raporu (gerçek üretici, ağ KAPALI).
 *   npx tsx scripts/settings-export/archive-atlas.harness.ts
 *
 * Analiz Atlas'ın kendi sahte DB'si + kayıtlı örnek sağlayıcı yanıtıyla (fixture) kaydedilir; ARŞİV raporu
 * üretilirken global fetch engellenir → sağlayıcı / ağ çağrısı yapılmadığı kanıtlanır. Uzman sahipliği: başka
 * uzmanın analizi 404; modül kapalı / yetki yok → atlanır.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import JSZip from "jszip";
import { createFakeClient, createStore } from "../astrology/fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { saveAnalysis } from "@/lib/astrology/analyses/service";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}: ${(e as Error).message}`);
  }
}

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXPERT = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const OTHER = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT = "44444444-4444-4444-8444-444444444444";
const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const GOLDEN = JSON.parse(readFileSync(path.join(process.cwd(), "scripts", "astrology", "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
type J = Record<string, unknown>;

(async () => {
  process.env.ASTROLOGY_MODULE_ENABLED = "true";
  const { buildAstroReport } = await import("@/lib/archive/server/reports");
  const store = createStore({
    clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Atlas" }],
    users: [
      { id: EXPERT, astrology_technique_grants: { mode: "all" } },
      { id: OTHER, astrology_technique_grants: { mode: "all" } },
    ],
  });
  const db = createFakeClient(store);
  const ent = resolveAstrologyEntitlements({ isOwner: false, role: "expert", flags: { astrology: true }, techniqueGrants: { mode: "all" } });
  const ctx: EngineCtx = { db, tenantId: TENANT, userId: EXPERT, entitlements: ent };
  const pr = await createAstroProfile(ctx, { label: "Sentetik Atlas", clientId: CLIENT, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, (id) => (id === IST.id ? IST : null));
  const pid = ((pr.body as J).profile as J).id as string;
  const deps: EngineDeps = {
    config: { apiKey: "k-test-arsiv", baseUrl: "https://provider-fake.local/api/v2" },
    callProvider: async () => ({ ok: true, raw: structuredClone(GOLDEN.response ?? GOLDEN), attempts: 1 }),
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  const sel = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
  const run = (await runAstrology(ctx, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false })).body as J;
  assert.equal(run.ok, true, JSON.stringify(run).slice(0, 300));
  const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
  assert.equal(sv.status, 201, JSON.stringify(sv.body));
  const analysisId = (sv.body as J).analysisId as string;

  const profile = { role: "expert", module_permissions: { astrology: true } };
  const archiveCtx = (userId: string, prof: Record<string, unknown> = profile) => ({ db, tenantId: TENANT, userId, profile: prof, isDemo: false, isAndroid: false });
  const realFetch = globalThis.fetch;
  let netCalls = 0;
  globalThis.fetch = (async () => {
    netCalls++;
    throw new Error("arşiv sırasında ağ çağrısı yasak");
  }) as typeof fetch;

  console.log("\nAtlas kayıtlı analiz → arşiv raporu");
  await t("rapor kayıtlı snapshot'tan üretilir; açılabilir Word; ağ / sağlayıcı çağrısı 0; marka adı yok", async () => {
    const r = await buildAstroReport(archiveCtx(EXPERT) as never, analysisId);
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    const xml = await (await JSZip.loadAsync(r.bytes)).file("word/document.xml")!.async("string");
    assert.ok(xml.length > 2000 && xml.includes("Sentetik Atlas"), "içerik");
    assert.ok(!/roxy/i.test(xml), "sağlayıcı markası");
    assert.equal(netCalls, 0);
  });
  await t("aynı tenant'taki başka uzman bu analizi alamaz (404)", async () => {
    const r = await buildAstroReport(archiveCtx(OTHER) as never, analysisId);
    assert.ok(!r.ok && r.status === 404, JSON.stringify(r));
  });
  await t("Atlas yetkisi yoksa / modül kapalıysa atlanır (hata değil, gerekçeli)", async () => {
    const r = await buildAstroReport(archiveCtx(EXPERT, { role: "expert", module_permissions: { astrology: false } }) as never, analysisId);
    assert.ok(!r.ok && r.skipped === true, JSON.stringify(r));
    process.env.ASTROLOGY_MODULE_ENABLED = "false";
    const off = await buildAstroReport(archiveCtx(EXPERT) as never, analysisId);
    assert.ok(!off.ok && off.skipped === true);
    process.env.ASTROLOGY_MODULE_ENABLED = "true";
  });
  globalThis.fetch = realFetch;
  console.log(`\narchive-atlas harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("harness çöktü:", e);
  process.exit(1);
});

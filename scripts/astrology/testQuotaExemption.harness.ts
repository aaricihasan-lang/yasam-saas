/**
 * Geçici test kotası muafiyeti — GÖKYÜZÜ ATLASI hacim testi (sahte sağlayıcı + sahte Supabase; ücretli çağrı YOK).
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/testQuotaExemption.harness.ts
 *   • Yetkili test hesabı: 1000 FARKLI kişi × natal hesap (ücretli kota astro-roxy-user 60/sa, tenant 300/gün ATLANIR),
 *     1000+ profil oluşturma (astro-write 120/10 dk) ve 1000 analiz kaydı (astro-analysis-day 200/gün) → hiç 429 yok.
 *   • Normal uzman: 61. yeni hesapta / 121. yazmada / 201. analiz kaydında 429 (eski davranış aynen).
 *   • Pencere bitince yetkili hesap da eski sınırlara döner. Aynı girdinin eşzamanlı iki isteği → tek sağlayıcı çağrısı.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { enforceAstroWrite } from "@/lib/astrology/limits";
import { __resetRateLimitForTest } from "@/lib/security/rateLimit";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TESTER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a"; // owner'ın yetkilendirdiği test hesabı (env listesinde)
const EXPERT = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c"; // aynı tenant, listede DEĞİL
const OTHER_T = "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d"; // başka tenant, listede DEĞİL
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown): ResolvedLocation | null => (id === ISTANBUL.id ? ISTANBUL : null);
const NATAL_SEL = [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }];

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const setWindow = (fromMs: number, toMs: number) => {
  process.env.TEST_QUOTA_EXEMPT_USER_IDS = TESTER;
  process.env.TEST_QUOTA_EXEMPT_WINDOW = `${new Date(fromMs).toISOString()}/${new Date(toMs).toISOString()}`;
};

function seedStore(): FakeStore {
  return createStore({
    users: [
      { id: TESTER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "tester@example.test" },
      { id: EXPERT, role: "expert", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TENANT_A, email: "e@example.test" },
      { id: OTHER_T, role: "expert", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TENANT_B, email: "o@example.test" },
    ],
    clients: [{ id: CLIENT_A, tenant_id: TENANT_A, ad: "Ali", soyad: "Yılmaz" }, { id: "22222222-2222-4222-8222-222222222222", tenant_id: TENANT_B, ad: "B", soyad: "B" }],
  });
}
const ctxOf = (store: FakeStore, userId: string, tenantId = TENANT_A): EngineCtx => ({ db: createFakeClient(store), tenantId, userId, entitlements: resolveAstrologyEntitlements({ isOwner: true }) });

/** Gerçek hız sınırı semantiği (sayaç + sınır) — kapsam bazlı çağrı sayımıyla. */
function deps() {
  const counters = new Map<string, number>();
  const scopeCalls: Record<string, number> = {};
  let providerCalls = 0;
  const d: EngineDeps = {
    config: { apiKey: "zz-fake", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, _e, body) => {
      providerCalls++;
      await new Promise((r) => setTimeout(r, 2));
      const raw = structuredClone(FIXTURE) as Record<string, unknown>;
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async (scope, value, limit) => {
      scopeCalls[scope] = (scopeCalls[scope] ?? 0) + 1;
      const k = `${scope}:${value}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return { allowed: n <= limit, retryAfterSec: n <= limit ? 0 : 5 };
    },
    sleep: async () => new Promise((r) => setTimeout(r, 1)),
  };
  return { d, scopeCalls, providers: () => providerCalls };
}

async function profile(ctx: EngineCtx, i: number): Promise<string> {
  // Her test kişisi BENZERSİZ doğum tarihi (1950-01-01 + i gün) — mükerrer profil kontrolüne takılmaz.
  const d = new Date(Date.UTC(1950, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
  const hh = 6 + (i % 12);
  const r = await createAstroProfile(ctx, { label: `Test kişi ${i}`, clientId: ctx.tenantId === TENANT_A ? CLIENT_A : "22222222-2222-4222-8222-222222222222", birthDate: d, birthTime: `${String(hh).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
  assert.equal(r.status, 201, `profil ${i}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return (r.body as { profile: { id: string } }).profile.id;
}

async function main() {
  const now = Date.now();
  console.info = () => undefined; // muafiyet iz logu (PII'siz) testte susturulur
  setWindow(now - 60_000, now + 4 * 3600_000);

  // ── 1. Yetkili test hesabı: 1000 farklı kişi, ücretli hesap ──
  const store = seedStore();
  const tester = ctxOf(store, TESTER);
  const D = deps();
  let first429 = -1;
  const milestones: Record<number, boolean> = {};
  for (let i = 0; i < 1000; i++) {
    const pid = await profile(tester, i);
    const r = await runAstrology(tester, { profileId: pid, selections: NATAL_SEL }, D.d, { ownerPreviewHideInterp: false });
    if (r.status === 429 && first429 < 0) first429 = i + 1;
    if ([20, 100, 200, 1000].includes(i + 1)) milestones[i + 1] = r.status === 200;
  }
  ok(first429 < 0 && milestones[20] && milestones[100] && milestones[200] && milestones[1000], "A1 yetkili test hesabı: 1000 farklı kişi × natal — 20/100/200/1000. hesapta devam, hiç 429 yok", { first429, milestones });
  ok(D.providers() === 1000, `A2 her kişi gerçekten yeni ücretli hesap (sağlayıcı çağrısı ${D.providers()})`);
  ok(!D.scopeCalls["astro-roxy-user"] && !D.scopeCalls["astro-roxy-tenant"] && (D.scopeCalls["astro-roxy-inflight"] ?? 0) >= 1000, "A3 hacim sayaçları HİÇ çağrılmadı; çift ücret kilidi (inflight) her hesapta çalıştı", D.scopeCalls);
  // Aynı kişi tekrar → kayıtlı sonuç (yeni ücret yok)
  const before = D.providers();
  const pid0 = await profile(tester, 5000);
  await runAstrology(tester, { profileId: pid0, selections: NATAL_SEL }, D.d, { ownerPreviewHideInterp: false });
  const again = await runAstrology(tester, { profileId: pid0, selections: NATAL_SEL }, D.d, { ownerPreviewHideInterp: false });
  ok(D.providers() === before + 1 && again.status === 200, "A4 aynı girdi ikinci kez → kayıtlı sonuç, yeni ücretli çağrı YOK");
  // Eşzamanlı aynı girdi → tek çağrı
  const pidC = await profile(tester, 6000);
  const b2 = D.providers();
  const [c1, c2] = await Promise.all([
    runAstrology(tester, { profileId: pidC, selections: NATAL_SEL }, D.d, { ownerPreviewHideInterp: false }),
    runAstrology(tester, { profileId: pidC, selections: NATAL_SEL }, D.d, { ownerPreviewHideInterp: false }),
  ]);
  ok(D.providers() === b2 + 1, "A5 aynı girdinin eşzamanlı iki isteği → tek ücretli çağrı (çift ücret YOK)", { calls: D.providers() - b2, s: [c1.status, c2.status] });

  // ── 2. Kayıt hacmi: profil oluşturma + analiz kaydı ──
  __resetRateLimitForTest();
  let w429 = -1;
  for (let i = 0; i < 1100; i++) { const r = await enforceAstroWrite(tester, "profile_create", { creating: false }); if (r && w429 < 0) w429 = i + 1; }
  let a429 = -1;
  for (let i = 0; i < 1000; i++) { const r = await enforceAstroWrite(tester, "analysis_save"); if (r && a429 < 0) a429 = i + 1; }
  ok(w429 < 0 && a429 < 0, "A6 yetkili test hesabı: 1100 yazma (astro-write 120/10 dk) + 1000 analiz kaydı (200/gün) → 429 yok", { w429, a429 });

  // ── 3. Normal uzman (aynı tenant) ve başka tenant: eski davranış ──
  const E = deps();
  const expert = ctxOf(store, EXPERT);
  let e429 = -1;
  for (let i = 0; i < 61; i++) {
    const pid = await profile(expert, 10_000 + i);
    const r = await runAstrology(expert, { profileId: pid, selections: NATAL_SEL }, E.d, { ownerPreviewHideInterp: false });
    if (r.status === 429 && e429 < 0) e429 = i + 1;
  }
  ok(e429 === 61, `B1 normal uzman (listede değil): 61. yeni ücretli hesapta 429 (eski 60/saat) — ${e429}`);
  __resetRateLimitForTest();
  let ew = -1;
  for (let i = 0; i < 121; i++) { const r = await enforceAstroWrite(expert, "profile_create", { creating: false }); if (r && ew < 0) ew = i + 1; }
  ok(ew === 121, `B2 normal uzman: 121. yazmada 429 (eski 120/10 dk) — ${ew}`);
  const O = deps();
  const other = ctxOf(store, OTHER_T, TENANT_B);
  let o429 = -1;
  for (let i = 0; i < 61; i++) {
    const pid = await profile(other, 20_000 + i);
    const r = await runAstrology(other, { profileId: pid, selections: NATAL_SEL }, O.d, { ownerPreviewHideInterp: false });
    if (r.status === 429 && o429 < 0) o429 = i + 1;
  }
  ok(o429 === 61, `B3 başka tenant: muafiyetten etkilenmez, 61. hesapta 429 — ${o429}`);
  // İstemci bayrağı etkisiz: muafiyet yalnız ctx.userId (sunucuda doğrulanmış) + env; gövdeye test=true eklemek bir şey değiştirmez
  const pidF = await profile(expert, 30_000);
  const flagged = await runAstrology(expert, { profileId: pidF, selections: NATAL_SEL, test: true, testQuotaExempt: true } as never, E.d, { ownerPreviewHideInterp: false });
  ok(flagged.status === 429, "B4 normal uzman istek gövdesine test=true / testQuotaExempt=true eklese de kota aynen (429)", flagged.status);

  // ── 4. Pencere bitince eski sınır ──
  setWindow(now - 9 * 3600_000, now - 3600_000 - 1); // 8 saat, bitmiş
  const X = deps();
  let x429 = -1;
  for (let i = 0; i < 61; i++) {
    const pid = await profile(tester, 40_000 + i);
    const r = await runAstrology(tester, { profileId: pid, selections: NATAL_SEL }, X.d, { ownerPreviewHideInterp: false });
    if (r.status === 429 && x429 < 0) x429 = i + 1;
  }
  ok(x429 === 61, `C1 pencere bitti: yetkili hesap da 61. hesapta 429 (eski sınır otomatik geri) — ${x429}`);
  delete process.env.TEST_QUOTA_EXEMPT_USER_IDS;
  delete process.env.TEST_QUOTA_EXEMPT_WINDOW;
  __resetRateLimitForTest();
  let y429 = -1;
  for (let i = 0; i < 121; i++) { const r = await enforceAstroWrite(tester, "profile_create", { creating: false }); if (r && y429 < 0) y429 = i + 1; }
  ok(y429 === 121, `C2 env yok: yetkili hesap da 121. yazmada 429 (üretimdeki eski davranış birebir) — ${y429}`);

  console.log(`\nATLAS test-quota hacim testi: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

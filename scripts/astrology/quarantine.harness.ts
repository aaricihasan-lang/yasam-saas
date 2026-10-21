/**
 * ASTROLOJİ — GA-P2-05 ücretli ham yanıt KARANTİNASI harness'i (gerçek Roxy'ye ve gerçek DB'ye ÇAĞRI YOK; sahte Supabase).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/quarantine.harness.ts
 *
 * Kapsam: (a) şema uyuşmazlığı → karantina + kullanıcı hatası, 2. deneme 0 istek · (b) 23514 → karantina · (c) yorum kalıcı
 * yazılamadı → yalnız bağlam (ham yanıt kopyalanmaz) · tablo yok → eski davranış · geçici sağlayıcı/DB hatası → karantina YOK ·
 * başka tenant / uzman görmez/etkilemez · yetkisiz uzman · ham yanıt yanıtlara/loglara sızmıyor · kurtarma betiği · yorum geri
 * doldurma · idempotency · süresi dolmuş satır · profil silmede CASCADE · DB okunamazken ücretli istek yok · statik izolasyon.
 *
 * Bağımlı modüller dinamik içe aktarılır: değişiklik ÖNCESİ koda karşı çalıştırıldığında (önce-başarısız kanıtı) harness
 * çökmeden ilgili testleri FAIL olarak raporlar.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { resolveAstrologyEntitlements, NO_ASTROLOGY_ENTITLEMENTS } from "@/lib/astrology/access/entitlements";
import { runAstrology, viewCachedSelections, getAstrologyResult, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, type TechniqueDefinition } from "@/lib/astrology/engine/techniques";
import { parseSelections } from "@/lib/astrology/engine/planner";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { createFakeClient, createStore, execRpc, type FakeStore } from "./fakeSupabase";

const ROOT = join(__dirname, "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8")) as Record<string, unknown>;
const API_KEY = "test-roxy-key-SECRET-pq-5521";
const LEAK = "PQ-SIZINTI-ISARETI-7731";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const EXPERT_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const OTHER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown): ResolvedLocation | null => (id === ISTANBUL.id ? ISTANBUL : null);
const NATAL_SEL = [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }];
const PQ = "astro_provider_quarantine";
const MISSING = { code: "PGRST205", message: "Could not find the table 'public.astro_provider_quarantine' in the schema cache" };

function seed(): FakeStore {
  return createStore({
    users: [
      { id: OWNER, role: "admin", active: true, is_super_admin: true, tenant_id: TENANT_A },
      { id: EXPERT_A2, role: "expert", active: true, tenant_id: TENANT_A },
      { id: OTHER_B, role: "admin", active: true, tenant_id: TENANT_B },
    ],
    clients: [],
  });
}
const ent = resolveAstrologyEntitlements({ isOwner: true });
const ctxOf = (store: FakeStore, tenantId = TENANT_A, userId = OWNER, e = ent): EngineCtx => ({ db: createFakeClient(store), tenantId, userId, entitlements: e });

/** Şema dışı yanıt: 11 ev (adaptör "houses: 12 yerine 11" ile reddeder) + sızıntı işareti taşıyan bilinmeyen alan. */
function invalidRaw(): Record<string, unknown> {
  const r = structuredClone(FIXTURE);
  r.houses = (r.houses as unknown[]).slice(0, 11);
  r.pqLeakProbe = { note: LEAK };
  return r;
}

type Stub = { calls: number; deps: EngineDeps; logs: string[] };
function roxy(mode: "ok" | "invalid" | "server_error" | "timeout" = "ok", rawOverride?: () => Record<string, unknown>): Stub {
  const s: Stub = { calls: 0, logs: [], deps: null as unknown as EngineDeps };
  const locks = new Map<string, number>();
  s.deps = {
    config: { apiKey: API_KEY, baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, _e, body) => {
      s.calls += 1;
      if (mode === "server_error") return { ok: false, kind: "server_error", status: 500, attempts: 1 };
      if (mode === "timeout") return { ok: false, kind: "timeout", status: 0, attempts: 1 };
      const raw = rawOverride ? rawOverride() : mode === "invalid" ? invalidRaw() : structuredClone(FIXTURE);
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      if (mode === "ok" && rawOverride === undefined) (raw as Record<string, unknown>).pqLeakProbe = { note: LEAK };
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async (scope, value, limit) => {
      const k = `${scope}:${value}`;
      const n = (locks.get(k) ?? 0) + 1;
      locks.set(k, n);
      // in-flight kilidi testlerde her çağrıda serbest (ardışık denemeler) — gerçekte pencere ~90 sn.
      return { allowed: scope === "astro-roxy-inflight" ? true : n <= limit, retryAfterSec: 0 };
    },
    sleep: async () => undefined,
    log: (m, d) => s.logs.push(`${m} ${JSON.stringify(d ?? {})}`),
  };
  return s;
}

async function profile(ctx: EngineCtx, label = "PQ — natal"): Promise<string> {
  const r = await createAstroProfile(ctx, { label, clientId: null, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
  assert.equal(r.status, 201, `profil ${r.status} ${JSON.stringify(r.body)}`);
  return (r.body as { profile: { id: string } }).profile.id;
}
const run = (ctx: EngineCtx, pid: string, s: Stub) => runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, s.deps, { ownerPreviewHideInterp: false });
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = (r: { body: unknown }) => r.body as J;
const pqRows = (store: FakeStore) => store.tables[PQ] ?? [];
/** Boş olmayan tabloların anlık görüntüsü (sahte DB okumada boş tablo anahtarı oluşturur; yazım sayılmaz). */
const snapTables = (store: FakeStore) => JSON.stringify(Object.entries(store.tables).filter(([, v]) => v.length > 0).sort(([a], [b]) => (a < b ? -1 : 1)));

/** "Düzeltilmiş adaptör" taklidi: natal projeksiyonu eksik 12. evi fixture'dan tamamlayarak çalıştırır. */
const fixedResolver = (id: string): TechniqueDefinition | null => {
  const real = getTechnique(id);
  if (!real || id !== "western.natal") return real;
  return { ...real, project: (u, raw, opt) => real.project(u, { ...(raw as Record<string, unknown>), houses: FIXTURE.houses }, opt) };
};

async function loadRecover() {
  return (await import("./quarantine-recover")).recoverQuarantine;
}
async function loadBackfill() {
  return (await import("./interp-backfill")).backfillInterpretations;
}

/** console.* + deps.log yakalama (ham yanıt sızıntı denetimi). */
function captureConsole() {
  const out: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const grab = (...a: unknown[]) => out.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  console.error = grab;
  console.warn = grab;
  console.info = grab;
  return {
    out,
    restore: () => Object.assign(console, orig),
  };
}

async function main() {
  // ─── (a) şema uyuşmazlığı ────────────────────────────────────────────────
  await t("(a) şema uyuşmazlığı → 502 PROVIDER_INVALID_RESPONSE + karantina satırı (ham yanıt + bağlam), 1 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy("invalid");
    const r = await run(ctx, pid, rx);
    assert.equal(r.status, 502);
    assert.equal(body(r).code, "PROVIDER_INVALID_RESPONSE");
    assert.match(String(body(r).error), /incelemeye ayrıldı; aynı hesaplama için yeniden ücretli istek gönderilmeyecek/);
    assert.equal(rx.calls, 1);
    const rows = pqRows(store);
    assert.equal(rows.length, 1, "karantina satırı yok");
    const q = rows[0];
    assert.equal(q.reason, "invalid_response");
    assert.equal(q.tenant_id, TENANT_A);
    assert.equal(q.owner_user_id, OWNER);
    assert.equal(q.profile_id, pid);
    assert.equal(q.profile_revision, 1);
    assert.equal(q.technique, "western.natal");
    assert.match(String(q.input_hash), /^[0-9a-f]{64}$/);
    assert.equal(((q.raw_response as J).houses as unknown[]).length, 11, "ham yanıt aynen saklanmalı");
    assert.equal(((q.context as J).unit as J).inputHash, q.input_hash);
    assert.equal((q.context as J).selectionTechnique, "western.natal");
    assert.ok((q.error_codes as string[]).some((e) => /houses/.test(e)));
    const ttl = Date.parse(String(q.expires_at)) - Date.now();
    assert.ok(ttl > 29.9 * 86400e3 && ttl <= 30 * 86400e3 + 5e3, `süre ${ttl}`);
    assert.equal((store.tables.astro_provider_results ?? []).length, 0);
  });

  await t("(a) ikinci deneme → sağlayıcıya 0 istek, 409 PROVIDER_RESPONSE_QUARANTINED (anlaşılır Türkçe mesaj)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy("invalid");
    await run(ctx, pid, rx);
    const r2 = await run(ctx, pid, rx);
    assert.equal(rx.calls, 1, "ikinci denemede ücretli istek gönderildi");
    assert.equal(r2.status, 409);
    assert.equal(body(r2).code, "PROVIDER_RESPONSE_QUARANTINED");
    assert.match(String(body(r2).error), /^Bu hesaplama için servisin önceki yanıtı incelemede; yeniden ücretli istek gönderilmedi\./);
    assert.ok(!/roxy|golden|fixture|quarantine|karantina/i.test(String(body(r2).error)), "kullanıcı metninde teknik ad");
    assert.equal(body(r2).executed.providerAttempts, 0);
    // geçerli yanıt veren sağlayıcıyla da (aynı girdi) çağrı yapılmaz — engel girdi + adaptör anahtarına bağlı.
    const good = roxy("ok");
    const r3 = await run(ctx, pid, good);
    assert.equal(good.calls, 0);
    assert.equal(body(r3).code, "PROVIDER_RESPONSE_QUARANTINED");
    assert.equal(pqRows(store).length, 1, "tekrar kayıt");
  });

  // ─── (b) deterministik yazım hatası ─────────────────────────────────────
  await t("(b) sonuç yazımı 23514 (ham yanıt > 2 MB CHECK) → 500 DB_INSERT_FAILED + karantina write_failed; 2. deneme 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    let n = 0;
    store.failInsert = (tb) => (tb === "astro_provider_results" ? (n++, { code: "23514", message: "new row violates check constraint astro_pr_raw_size_chk" }) : null);
    const rx = roxy("ok");
    const r = await run(ctx, pid, rx);
    assert.equal(r.status, 500);
    assert.equal(body(r).code, "DB_INSERT_FAILED");
    assert.match(String(body(r).error), /incelemeye ayrıldı/);
    assert.equal(n, 1, "deterministik hata yeniden denenmemeli");
    const rows = pqRows(store);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "write_failed");
    assert.deepEqual(rows[0].error_codes, ["23514"]);
    assert.ok(((rows[0].raw_response as J).planets as unknown[]).length > 0);
    const r2 = await run(ctx, pid, rx);
    assert.equal(rx.calls, 1, "ikinci denemede ücretli istek");
    assert.equal(body(r2).code, "PROVIDER_RESPONSE_QUARANTINED");
  });

  // ─── tablo yok → eski davranış ──────────────────────────────────────────
  await t("tablo yok (PGRST205 / 42P01) → eski davranış: aynı hata metni (not yok), 2. deneme yeniden çağırır, satır yok", async () => {
    for (const code of ["PGRST205", "42P01"]) {
      const store = seed();
      const err = { ...MISSING, code };
      store.failSelect = (tb) => (tb === PQ ? err : null);
      store.failInsert = (tb) => (tb === PQ ? err : null);
      const ctx = ctxOf(store);
      const pid = await profile(ctx);
      const rx = roxy("invalid");
      const r = await run(ctx, pid, rx);
      assert.equal(r.status, 502);
      assert.equal(body(r).error, "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.");
      await run(ctx, pid, rx);
      assert.equal(rx.calls, 2, `${code}: tablo yokken negatif önbellek olmamalı`);
      assert.equal(pqRows(store).length, 0);
      // başarılı yol da aynen çalışır
      const ok = roxy("ok");
      const store2 = seed();
      store2.failSelect = (tb) => (tb === PQ ? err : null);
      store2.failInsert = (tb) => (tb === PQ ? err : null);
      const ctx2 = ctxOf(store2);
      const p2 = await profile(ctx2);
      assert.equal((await run(ctx2, p2, ok)).status, 200);
      assert.equal(ok.calls, 1);
    }
  });

  // ─── geçici hatalar karantinaya girmez ──────────────────────────────────
  await t("geçici sağlayıcı hatası (5xx / zaman aşımı) → karantina YOK, sonraki deneme yeniden çağırır", async () => {
    for (const mode of ["server_error", "timeout"] as const) {
      const store = seed();
      const ctx = ctxOf(store);
      const pid = await profile(ctx);
      const rx = roxy(mode);
      const r = await run(ctx, pid, rx);
      assert.ok(r.status === 502 || r.status === 504, `${mode} ${r.status}`);
      await run(ctx, pid, rx);
      assert.equal(rx.calls, 2, `${mode}: geçici hatada yeniden deneme engellendi`);
      assert.equal(pqRows(store).length, 0, `${mode}: karantina satırı yazıldı`);
    }
  });
  await t("geçici DB yazım hatası (08006, denemeler tükendi) → karantina YOK (belgeli sınır), 3 yazım denemesi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    let n = 0;
    store.failInsert = (tb) => (tb === "astro_provider_results" ? (n++, { code: "08006", message: "connection failure" }) : null);
    const rx = roxy("ok");
    const r = await run(ctx, pid, rx);
    assert.equal(r.status, 500);
    assert.equal(n, 3);
    assert.equal(pqRows(store).length, 0);
    assert.equal(body(r).error, "Hesap sonucu kaydedilemedi.");
  });

  // ─── DB okunamazken ücretli istek yok ────────────────────────────────────
  await t("DB: önbellek yeniden okuması (kilit sonrası) başarısız → ücretli istek GÖNDERİLMEZ (503 DB_UNAVAILABLE)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    let reads = 0;
    // Plan okuması (1.) başarılı, kilit sonrası yeniden okuma (2.) DB hatası.
    store.failSelect = (tb) => (tb === "astro_provider_results" && ++reads >= 2 ? { code: "08006", message: "connection failure" } : null);
    const rx = roxy("ok");
    const r = await run(ctx, pid, rx);
    assert.equal(rx.calls, 0, "DB okunamazken ücretli istek gönderildi");
    assert.equal(r.status, 503);
    assert.equal(body(r).code, "DB_UNAVAILABLE");
  });
  await t("DB: karantina okuması geçici hatada (tablo VAR) → ücretli istek GÖNDERİLMEZ (fail-closed)", async () => {
    const store = seed();
    store.failSelect = (tb) => (tb === PQ ? { code: "57014", message: "canceling statement due to statement timeout" } : null);
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy("ok");
    const r = await run(ctx, pid, rx);
    assert.equal(rx.calls, 0);
    assert.equal(body(r).code, "DB_UNAVAILABLE");
  });
  await t("DB tamamen erişilemez → profil okunamaz, sağlayıcı ÇAĞRILMAZ", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    store.failSelect = () => ({ code: "08006", message: "connection failure" });
    const rx = roxy("ok");
    const r = await run(ctx, pid, rx);
    assert.equal(rx.calls, 0);
    assert.equal(r.status, 500);
  });

  // ─── tenant / uzman izolasyonu ───────────────────────────────────────────
  await t("izolasyon: A tenant'ın karantinası B tenant'ını ve aynı tenant'taki başka uzmanı ENGELLEMEZ; satırlar ayrı", async () => {
    const store = seed();
    const ctxA = ctxOf(store);
    const pA = await profile(ctxA);
    await run(ctxA, pA, roxy("invalid"));
    assert.equal(pqRows(store).length, 1);
    const hash = pqRows(store)[0].input_hash;
    // B tenant: aynı doğum verisi → aynı input_hash, ama engellenmez
    const ctxB = ctxOf(store, TENANT_B, OTHER_B);
    const pB = await profile(ctxB);
    const okB = roxy("ok");
    const rB = await run(ctxB, pB, okB);
    assert.equal(okB.calls, 1, "B tenant engellendi");
    assert.equal(rB.status, 200);
    // aynı tenant, başka uzman (Astroloji yetkili uzman)
    const ctxE = ctxOf(store, TENANT_A, EXPERT_A2, resolveAstrologyEntitlements({ isOwner: false, role: "expert", flags: { astrology: true } }));
    const pE = await profile(ctxE);
    const okE = roxy("ok");
    assert.equal((await run(ctxE, pE, okE)).status, 200);
    assert.equal(okE.calls, 1, "başka uzman engellendi");
    assert.ok((store.tables.astro_provider_results ?? []).every((r) => r.input_hash === hash), "aynı girdi anahtarı");
    // A'nın satırı etkilenmedi; başka tenant/uzman satırı oluşmadı
    assert.equal(pqRows(store).length, 1);
    assert.equal(pqRows(store)[0].owner_user_id, OWNER);
    // A hâlâ engelli
    const again = roxy("ok");
    assert.equal(body(await run(ctxA, pA, again)).code, "PROVIDER_RESPONSE_QUARANTINED");
    assert.equal(again.calls, 0);
  });
  await t("izolasyon: karantina sorguları tenant + uzman filtreli (sahte DB erişim günlüğü)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await run(ctx, pid, roxy("invalid"));
    await run(ctx, pid, roxy("ok"));
    const q = store.log.filter((l) => l.table === PQ);
    assert.ok(q.length >= 3, `karantina erişimi ${q.length}`);
    assert.ok(q.filter((l) => l.op === "select").every((l) => !l.select.includes("raw_response")), "okuma raw_response seçti");
  });

  // ─── yetkisiz uzman ──────────────────────────────────────────────────────
  await t("yetkisiz uzman (motor yetkisi yok) → 403, karantinaya hiç erişilmez", async () => {
    const store = seed();
    const owner = ctxOf(store);
    const pid = await profile(owner);
    await run(owner, pid, roxy("invalid"));
    const before = store.log.length;
    const noEng = ctxOf(store, TENANT_A, EXPERT_A2, { ...NO_ASTROLOGY_ENTITLEMENTS });
    const rx = roxy("ok");
    const r = await run(noEng, pid, rx);
    assert.equal(r.status, 403);
    assert.equal(rx.calls, 0);
    assert.ok(!store.log.slice(before).some((l) => l.table === PQ));
    // yetkili ama başka uzman → kendi kapsamında profil yok (404), karantina okunmaz
    const other = ctxOf(store, TENANT_A, EXPERT_A2, resolveAstrologyEntitlements({ isOwner: false, role: "expert", flags: { astrology: true } }));
    const r2 = await run(other, pid, rx);
    assert.equal(r2.status, 404);
    assert.equal(rx.calls, 0);
    assert.ok(!store.log.slice(before).some((l) => l.table === PQ));
  });

  // ─── sızıntı: ham yanıt yanıtlara / loglara gitmez ──────────────────────
  await t("sızıntı: ham yanıt (işaret değeri) hiçbir yanıt gövdesinde, console.* veya motor logunda YOK; okuma yolları karantinayı seçmez", async () => {
    const cap = captureConsole();
    try {
      const store = seed();
      const ctx = ctxOf(store);
      const pid = await profile(ctx);
      const rx = roxy("invalid");
      const bodies: string[] = [];
      bodies.push(JSON.stringify((await run(ctx, pid, rx)).body));
      bodies.push(JSON.stringify((await run(ctx, pid, rx)).body));
      // (b) yolu: sızıntı işaretli geçerli yanıt + 23514
      const store2 = seed();
      store2.failInsert = (tb) => (tb === "astro_provider_results" ? { code: "23514", message: "check" } : null);
      const ctx2 = ctxOf(store2);
      const p2 = await profile(ctx2);
      const rx2 = roxy("ok");
      bodies.push(JSON.stringify((await run(ctx2, p2, rx2)).body));
      // okuma yolları
      const before = store.log.length;
      bodies.push(JSON.stringify((await viewCachedSelections(ctx, { profileId: pid, selections: NATAL_SEL }, { ownerPreviewHideInterp: false })).body));
      bodies.push(JSON.stringify((await getAstrologyResult(ctx, "00000000-0000-4000-8000-0000000000ff", { profileId: null, revision: null, ownerPreviewHideInterp: false })).body));
      assert.ok(!store.log.slice(before).some((l) => l.table === PQ), "okuma yolu karantinaya erişti");
      for (const b of bodies) assert.ok(!b.includes(LEAK), `yanıt gövdesine ham veri sızdı: ${b.slice(0, 200)}`);
      const logs = [...cap.out, ...rx.logs, ...rx2.logs].join("\n");
      assert.ok(logs.length > 0, "log yakalanmadı");
      assert.ok(!logs.includes(LEAK), "loga ham yanıt değeri yazıldı");
      assert.ok(!logs.includes(API_KEY), "loga anahtar yazıldı");
      assert.ok(!/1990-07-15|41\.0082|28\.9784/.test(logs), "loga doğum verisi yazıldı");
      assert.ok(rx.logs.some((l) => l.startsWith("[astro] provider response quarantine") && /"status":"stored"/.test(l)));
      // kalıcı karantina satırında ham yanıt VAR (yalnız sunucu)
      assert.ok(JSON.stringify(pqRows(store)[0].raw_response).includes(LEAK));
    } finally {
      cap.restore();
    }
  });

  // ─── idempotency ─────────────────────────────────────────────────────────
  await t("idempotency: aynı karantina iki kez → 2. 'exists' (tek satır); süresi dolmuş satır temizlenir ve yeniden çağrıya izin verir", async () => {
    const { insertQuarantine, findActiveQuarantine } = await import("@/lib/astrology/persistence/quarantine");
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await run(ctx, pid, roxy("invalid"));
    const row = pqRows(store)[0];
    const q = {
      profileId: pid, profileRevision: 1, partnerProfileId: null, partnerProfileRevision: null, technique: "western.natal", provider: "roxy",
      endpoint: String(row.endpoint), adapterVersion: String(row.adapter_version), inputHash: String(row.input_hash), reason: "invalid_response" as const,
      errorCodes: ["x"], raw: { a: 1 }, context: { selectionTechnique: "western.natal", options: {}, unit: {} },
    };
    assert.equal((await insertQuarantine(ctx.db, TENANT_A, OWNER, q)).status, "exists");
    assert.equal(pqRows(store).length, 1);
    assert.equal((await insertQuarantine(ctx.db, TENANT_A, OWNER, { ...q, raw: [1] as unknown })).status, "failed");
    // süresi doldu → negatif önbellek kalkar, satır silinir, sağlayıcı yeniden çağrılabilir
    pqRows(store)[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const f = await findActiveQuarantine(ctx.db, TENANT_A, OWNER, String(row.input_hash), String(row.adapter_version));
    assert.equal(f.active, false);
    assert.equal(pqRows(store).length, 0, "süresi dolan satır silinmedi");
    const ok = roxy("ok");
    assert.equal((await run(ctx, pid, ok)).status, 200);
    assert.equal(ok.calls, 1);
  });
  await t("fırsatçı temizlik: yeni karantina INSERT'i aynı tenant+uzmanın süresi dolmuş satırlarını siler, başkasınınkine dokunmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const ctxB = ctxOf(store, TENANT_B, OTHER_B);
    const pB = await profile(ctxB);
    await run(ctxB, pB, roxy("invalid"));
    pqRows(store)[0].expires_at = new Date(Date.now() - 1000).toISOString(); // B'nin süresi dolmuş satırı
    store.tables[PQ].push({ ...pqRows(store)[0], id: "00000000-0000-4000-8000-00000000aaa1", tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: pid, input_hash: "f".repeat(64) });
    await run(ctx, pid, roxy("invalid"));
    const mine = pqRows(store).filter((r) => r.tenant_id === TENANT_A);
    assert.equal(mine.length, 1, "A'nın süresi dolmuş satırı silinmedi");
    assert.notEqual(mine[0].input_hash, "f".repeat(64));
    assert.equal(pqRows(store).filter((r) => r.tenant_id === TENANT_B).length, 1, "başka tenant'ın satırı silindi");
  });

  // ─── (c) yorum kalıcı yazılamadı ─────────────────────────────────────────
  await t("(c) sonuç yazıldı + yorum kalıcı yazılamadı → 200; karantinaya YALNIZ bağlam (raw {}), negatif önbellek YOK (önbellek HIT)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    store.failInsert = (tb) => (tb === "astro_provider_interpretations" ? { code: "23514", message: "check" } : null);
    const rx = roxy("ok");
    assert.equal((await run(ctx, pid, rx)).status, 200);
    assert.equal(store.tables.astro_provider_results.length, 1);
    assert.equal((store.tables.astro_provider_interpretations ?? []).length, 0);
    const rows = pqRows(store);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, "interp_write_failed");
    assert.deepEqual(rows[0].raw_response, {}, "ham yanıt ikinci kez kopyalanmamalı");
    store.failInsert = undefined;
    const r2 = await run(ctx, pid, rx);
    assert.equal(r2.status, 200);
    assert.equal(rx.calls, 1, "önbellekten gelmeli");
  });

  // ─── kurtarma betiği ─────────────────────────────────────────────────────
  await t("kurtarma: DRY-RUN yazmaz; --apply düzeltilmiş adaptörle sonuç + yorum INSERT, karantina DELETE; sonra önbellek HIT (0 istek); 0 Roxy", async () => {
    const recover = await loadRecover();
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy("invalid");
    await run(ctx, pid, rx);
    const origFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("ağ yok");
    }) as typeof fetch;
    try {
      const snap = snapTables(store);
      const dry0 = await recover(ctx.db, { apply: false });
      assert.deepEqual(dry0.items.map((i) => i.status), ["still_invalid"], "güncel (düzeltilmemiş) adaptörle onarım olmamalı");
      const dry = await recover(ctx.db, { apply: false, resolveTechnique: fixedResolver });
      assert.deepEqual(dry.items.map((i) => i.status), ["would_recover"]);
      assert.ok(snapTables(store) === snap, "DRY-RUN yazdı");
      const ap = await recover(ctx.db, { apply: true, resolveTechnique: fixedResolver });
      assert.deepEqual(ap.items.map((i) => i.status), ["recovered"]);
      assert.equal(ap.providerCalls, 0);
      assert.equal(store.tables.astro_provider_results.length, 1);
      assert.equal(store.tables.astro_provider_interpretations.length, 1);
      assert.equal(pqRows(store).length, 0);
      // idempotent: ikinci uygulama hiçbir şey yapmaz
      const again = await recover(ctx.db, { apply: true, resolveTechnique: fixedResolver });
      assert.equal(again.items.length, 0);
      assert.equal(store.tables.astro_provider_results.length, 1);
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.equal(fetches, 0, "kurtarma ağ isteği yaptı");
    const ok = roxy("ok");
    const r = await run(ctx, pid, ok);
    assert.equal(r.status, 200);
    assert.equal(ok.calls, 0, "onarılan sonuç önbellekten gelmeli");
    assert.equal(rx.calls, 1, "toplam ücretli istek 1");
  });
  await t("kurtarma: write_failed (23514) yazım yine başarısız → satır KORUNUR; engel kalkınca --apply onarır; süresi dolmuş satır --apply ile silinir", async () => {
    const recover = await loadRecover();
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    store.failInsert = (tb) => (tb === "astro_provider_results" ? { code: "23514", message: "check" } : null);
    await run(ctx, pid, roxy("ok"));
    assert.equal(pqRows(store).length, 1);
    const r1 = await recover(ctx.db, { apply: true });
    assert.deepEqual(r1.items.map((i) => [i.status, i.code]), [["write_failed_again", "23514"]]);
    assert.equal(pqRows(store).length, 1, "başarısız onarımda satır silindi");
    store.failInsert = undefined;
    const r2 = await recover(ctx.db, { apply: true });
    assert.deepEqual(r2.items.map((i) => i.status), ["recovered"]);
    assert.equal(store.tables.astro_provider_results.length, 1);
    // süresi dolmuş
    store.tables[PQ] = [{ ...structuredClone(store.tables.astro_provider_results[0]), id: "00000000-0000-4000-8000-00000000bbb1", tenant_id: TENANT_A, owner_user_id: OWNER, profile_id: pid, input_hash: "e".repeat(64), adapter_version: "x", reason: "invalid_response", raw_response: {}, context: {}, expires_at: new Date(Date.now() - 1).toISOString() }];
    const dry = await recover(ctx.db, { apply: false });
    assert.deepEqual(dry.items.map((i) => i.status), ["expired"]);
    assert.equal(pqRows(store).length, 1);
    const ap = await recover(ctx.db, { apply: true });
    assert.deepEqual(ap.items.map((i) => i.status), ["expired_purged"]);
    assert.equal(pqRows(store).length, 0);
  });
  await t("kurtarma: bağlam satırla uyuşmuyorsa (hash/adaptör) onarım YAPILMAZ (bad_context)", async () => {
    const recover = await loadRecover();
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await run(ctx, pid, roxy("invalid"));
    ((pqRows(store)[0].context as J).unit as J).inputHash = "0".repeat(64);
    const r = await recover(ctx.db, { apply: true, resolveTechnique: fixedResolver });
    assert.deepEqual(r.items.map((i) => i.status), ["bad_context"]);
    assert.equal((store.tables.astro_provider_results ?? []).length, 0);
  });

  // ─── yorum geri doldurma ─────────────────────────────────────────────────
  await t("yorum geri doldurma (karantina bağlamı): DRY-RUN yazmaz; --apply yorum normal yoldakiyle BİREBİR aynı; bağlam satırı silinir; idempotent", async () => {
    const backfill = await loadBackfill();
    // kontrol: normal yolda üretilen yorum
    const ctrl = seed();
    const cctx = ctxOf(ctrl);
    await run(cctx, await profile(cctx), roxy("ok"));
    const expected = ctrl.tables.astro_provider_interpretations[0];
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    store.failInsert = (tb) => (tb === "astro_provider_interpretations" ? { code: "08006", message: "down" } : null);
    await run(ctx, pid, roxy("ok"));
    store.failInsert = undefined;
    assert.equal((store.tables.astro_provider_interpretations ?? []).length, 0);
    const snap = snapTables(store);
    const dry = await backfill(ctx.db, { apply: false });
    assert.deepEqual(dry.items.map((i) => [i.source, i.status]), [["quarantine", "would_insert"]]);
    assert.ok(snapTables(store) === snap, "DRY-RUN yazdı");
    const ap = await backfill(ctx.db, { apply: true });
    assert.deepEqual(ap.items.map((i) => i.status), ["inserted"]);
    assert.equal(ap.providerCalls, 0);
    const got = store.tables.astro_provider_interpretations[0];
    assert.equal(got.result_id, store.tables.astro_provider_results[0].id);
    assert.deepEqual(got.content, expected.content, "geri doldurulan yorum farklı");
    assert.equal(got.projection_version, expected.projection_version);
    assert.equal(pqRows(store).length, 0);
    const again = await backfill(ctx.db, { apply: true });
    assert.equal(again.items.length, 0, "ikinci uygulama yeniden yazdı");
    assert.equal(store.tables.astro_provider_interpretations.length, 1);
  });
  await t("yorum geri doldurma (eski kayıt): bağlam = kayıtlı analizin seçenekleri; analiz snapshot'ları DEĞİŞMEZ; bağlam yoksa / uyuşmazsa atlanır", async () => {
    const backfill = await loadBackfill();
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await run(ctx, pid, roxy("ok"));
    // eski kayıt taklidi: yorum hiç yazılmamış, karantina bağlamı yok
    store.tables.astro_provider_interpretations = [];
    store.tables[PQ] = [];
    const nb = await backfill(ctx.db, { apply: true });
    assert.deepEqual(nb.items.map((i) => [i.source, i.status]), [["none", "skipped_no_context"]]);
    const res = store.tables.astro_provider_results[0];
    const sel = parseSelections(NATAL_SEL, new Date());
    assert.ok(sel.ok);
    // yanlış seçenek (başka ev sistemi) → teknik katman uyuşmaz → atlanır
    store.tables.astro_analyses = [{ id: "00000000-0000-4000-8000-00000000c001", tenant_id: TENANT_A, owner_user_id: OWNER, technique: "western.natal", result_id: res.id, result_ids: [res.id], technique_params: { ...sel.selections[0].options, houseSystem: "whole_sign" }, technical_snapshot: { frozen: true }, provider_interp_snapshot: null }];
    const mm = await backfill(ctx.db, { apply: true });
    assert.ok(["skipped_context_mismatch", "skipped_projection_failed"].includes(mm.items[0].status), mm.items[0].status);
    assert.equal(store.tables.astro_provider_interpretations.length, 0);
    store.tables.astro_analyses[0].technique_params = sel.selections[0].options;
    const anSnap = JSON.stringify(store.tables.astro_analyses);
    const ap = await backfill(ctx.db, { apply: true });
    assert.deepEqual(ap.items.map((i) => [i.source, i.status]), [["analysis", "inserted"]]);
    assert.equal(store.tables.astro_provider_interpretations.length, 1);
    assert.equal(JSON.stringify(store.tables.astro_analyses), anSnap, "analiz snapshot'ı değişti");
  });

  // ─── KVKK: profil silmede CASCADE (sahte RPC, migration FK'sinin taklidi) ─
  await t("KVKK: profil silinince (RPC) karantina satırları da silinir; başka uzmanınki kalır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await run(ctx, pid, roxy("invalid"));
    const ctxB = ctxOf(store, TENANT_B, OTHER_B);
    await run(ctxB, await profile(ctxB), roxy("invalid"));
    assert.equal(pqRows(store).length, 2);
    const pv = execRpc(store, "astro_profile_delete_preview", { p_tenant_id: TENANT_A, p_owner_user_id: OWNER, p_profile_ids: [pid] }).data as J[];
    const exp = pv.map((p) => ({ id: p.id, current_revision: p.current_revision, updated_ms: p.updated_ms, own: p.own_analysis_count, shared: p.shared_preserved_count }));
    const del = execRpc(store, "astro_profile_delete", { p_tenant_id: TENANT_A, p_owner_user_id: OWNER, p_expected: exp });
    assert.equal(del.error, null, JSON.stringify(del.error));
    assert.deepEqual(pqRows(store).map((r) => r.tenant_id), [TENANT_B]);
  });

  // ─── statik izolasyon ───────────────────────────────────────────────────
  await t("statik: karantina tablosu yalnız motor yazım yolu + kalıcılık modülü + owner betiklerinde; okuma kolonlarında raw_response YOK", () => {
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(e)) out.push(p);
      }
      return out;
    };
    const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
    const hits = ["app", "lib", "components", "hooks"].flatMap((d) => walk(join(ROOT, d))).filter((f) => /astro_provider_quarantine|persistence\/quarantine/.test(readFileSync(f, "utf8"))).map(rel).sort();
    assert.deepEqual(hits, ["lib/astrology/engine/service.ts", "lib/astrology/persistence/quarantine.ts", "lib/backup/ownerPilotTables.ts", "lib/backup/schema.generated.ts"], `beklenmeyen kullanım: ${hits.join(", ")}`);
    const m = readFileSync(join(ROOT, "lib/astrology/persistence/quarantine.ts"), "utf8");
    const look = /const QUARANTINE_LOOKUP_COLUMNS = "([^"]+)"/.exec(m);
    assert.ok(look && !look[1].includes("raw_response"));
    const code = m.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.equal((code.match(/raw_response/g) ?? []).length, 1, "raw_response yalnız INSERT'te geçmeli");
    assert.match(code, /raw_response: raw,/);
    assert.match(m, /^import "server-only";$/m);
    // betikler sağlayıcı istemcisini içe aktarmaz (0 ücretli istek)
    for (const f of ["quarantine-recover.ts", "interp-backfill.ts", "recovery-common.ts"]) {
      const s = readFileSync(join(__dirname, f), "utf8");
      assert.ok(!/providers\/roxy\/client|callRoxy|realEngineDeps|ROXY_API_KEY/.test(s), `${f}: sağlayıcı istemcisi`);
    }
    // engine: ham yanıt loglanmaz (log çağrılarında call.raw yok)
    const svc = readFileSync(join(ROOT, "lib/astrology/engine/service.ts"), "utf8");
    assert.ok(!/log\([^)]*call\.raw/.test(svc) && !/console\.[a-z]+\([^)]*raw/.test(svc), "motor ham yanıtı logluyor");
  });

  console.log(`\nastrology quarantine harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.log("quarantine harness çöktü:", e);
  process.exit(1);
});

/**
 * ASTROLOJİ — BAYAT EKRAN ÇAKIŞMASI harness'i (ATL-P2-08 — 2026-10-20).
 *
 * Production (3/3): eski revizyon numarasıyla doğum bilgisi düzeltilince ~126 sn bekleyip HTTP 500. Kök neden: DB
 * fonksiyonu çakışmayı ERRCODE 40001 ile bildiriyor; PostgREST bunu geçici hata sayıp yeniden deniyor → zaman aşımı →
 * uygulamaya 40001 dışı hata → 500. Aynı desen danışan eşleştirme (astro_profile_set_client).
 *
 * Bu harness PostgREST davranışını taklit eder: RPC 40001 dönerse istemciye zaman aşımı hatası (57014) iletilir.
 *   A) Bayat expectedRevision → RPC ÇAĞRILMADAN anında 409 REVISION_CONFLICT; kayıt değişmez.
 *   B) Güncel expectedRevision → RPC çağrılır, 200 (davranış aynı).
 *   C) Danışan bağı: bayat expectedClientId (eşleştir / kaldır) → RPC ÇAĞRILMADAN 409 CLIENT_LINK_CONFLICT.
 *   D) Danışan bağı: güncel beklenen bağ → eşleştir/kaldır çalışır.
 * Gerçek DB / sağlayıcı YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/record-guards.harness.ts
 */
import assert from "node:assert/strict";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { appendAstroRevision, createAstroProfile } from "@/lib/astrology/profiles/service";
import { linkProfileClient, unlinkProfileClient } from "@/lib/astrology/clients/service";
import type { EngineCtx } from "@/lib/astrology/engine/service";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_A = "44444444-4444-4444-8444-444444444444";
const CLIENT_B = "55555555-5555-4555-8555-555555555555";
const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === IST.id ? IST : null);

/** Production PostgREST taklidi: 40001 yeniden denenir → istemciye zaman aşımı. RPC çağrıları sayılır. */
function setup() {
  const store = createStore({
    clients: [
      { id: CLIENT_A, tenant_id: TENANT, ad: "Sentetik", soyad: "Bir" },
      { id: CLIENT_B, tenant_id: TENANT, ad: "Sentetik", soyad: "İki" },
    ],
  });
  const db = createFakeClient(store) as J;
  const rpcCalls: string[] = [];
  const orig = db.rpc.bind(db);
  db.rpc = async (fn: string, args: unknown) => {
    rpcCalls.push(fn);
    const r = await orig(fn, args);
    return r?.error?.code === "40001" ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } : r;
  };
  const ctx: EngineCtx = { db, tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  return { store, ctx, rpcCalls };
}
async function newProfile(ctx: EngineCtx, clientId: string | null = null) {
  const r = await createAstroProfile(ctx, { label: "Sentetik Çakışma", ...(clientId ? { clientId } : {}), birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id as string;
}
const REV = (expectedRevision: number, birthTime: string) => ({ expectedRevision, birthDate: "1990-07-15", birthTime, timeKnown: true, timeAccuracy: "rectified", locationId: IST.id });

async function main() {
  await t("A: bayat expectedRevision → RPC çağrılmadan anında 409; revizyon sayısı değişmez", async () => {
    const { store, ctx, rpcCalls } = setup();
    const pid = await newProfile(ctx);
    assert.equal((await appendAstroRevision(ctx, pid, REV(1, "14:45"), resolveLoc)).status, 200);
    const before = rpcCalls.length;
    const t0 = Date.now();
    const stale = await appendAstroRevision(ctx, pid, REV(1, "15:00"), resolveLoc);
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal((stale.body as J).code, "REVISION_CONFLICT");
    assert.ok(!rpcCalls.slice(before).includes("astro_profile_append_revision"), "bayat istekte RPC çağrıldı");
    assert.ok(Date.now() - t0 < 2000);
    assert.equal((store.tables.astro_birth_profile_revisions as J[]).filter((x) => x.profile_id === pid).length, 2);
  });

  await t("B: güncel expectedRevision → RPC çağrılır, 200", async () => {
    const { ctx, rpcCalls } = setup();
    const pid = await newProfile(ctx);
    const r = await appendAstroRevision(ctx, pid, REV(1, "14:45"), resolveLoc);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(rpcCalls.includes("astro_profile_append_revision"));
    assert.equal((await appendAstroRevision(ctx, pid, REV(2, "14:50"), resolveLoc)).status, 200);
  });

  await t("C: danışan bağı — bayat beklenen bağ (eşleştir + kaldır) → RPC çağrılmadan 409 CLIENT_LINK_CONFLICT", async () => {
    const { ctx, rpcCalls } = setup();
    const pid = await newProfile(ctx, CLIENT_A);
    const before = rpcCalls.length;
    // Ekran "bağ yok" sanıyor; gerçekte A'ya bağlı.
    const l = await linkProfileClient(ctx, pid, { clientId: CLIENT_B, expectedClientId: null, confirmRelink: true });
    assert.equal(l.status, 409, JSON.stringify(l.body));
    assert.equal((l.body as J).code, "CLIENT_LINK_CONFLICT");
    // Ekran B'ye bağlı sanıyor; kaldırmak istiyor.
    const u = await unlinkProfileClient(ctx, pid, CLIENT_B);
    assert.equal(u.status, 409, JSON.stringify(u.body));
    assert.equal((u.body as J).code, "CLIENT_LINK_CONFLICT");
    assert.ok(!rpcCalls.slice(before).includes("astro_profile_set_client"), "bayat istekte RPC çağrıldı");
  });

  await t("D: danışan bağı — güncel beklenen bağ → yeniden bağla ve kaldır çalışır; bilinmeyen profil 404", async () => {
    const { ctx } = setup();
    const pid = await newProfile(ctx, CLIENT_A);
    const l = await linkProfileClient(ctx, pid, { clientId: CLIENT_B, expectedClientId: CLIENT_A, confirmRelink: true });
    assert.equal(l.status, 200, JSON.stringify(l.body));
    assert.equal((l.body as J).clientId, CLIENT_B);
    const u = await unlinkProfileClient(ctx, pid, CLIENT_B);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal((u.body as J).clientId, null);
    assert.equal((await unlinkProfileClient(ctx, "99999999-9999-4999-8999-999999999999", CLIENT_B)).status, 404);
  });

  console.log(`\nastrology record-guards harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main().catch((e) => {
  console.error("record-guards harness çöktü:", e);
  process.exit(1);
});

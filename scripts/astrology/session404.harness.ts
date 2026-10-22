/**
 * ASTROLOJİ YENİ-P3-02 — oturum sunucuda düşmüşken istemci "Bulunamadı." yerine "oturum sona erdi" görür.
 * Sunucunun tek tip 404'ü DEĞİŞMEZ; istemci YALNIZ 404'te mevcut iki aşamalı oturum yoklamasını
 * (confirmSessionInvalid → GET /api/auth/session) sorar. Diğer durum kodlarında ek istek YOK.
 * Tarayıcı ortamı simülasyonu (localStorage + location + fetch); SENTETİK kullanıcı; ağ YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/session404.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

const UID = "33333333-3333-4333-8333-333333333333";
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
g.sessionStorage = g.localStorage;
g.window = globalThis;
g.location = { pathname: "/admin/astroloji", href: "https://example.invalid/admin/astroloji" };
Object.defineProperty(globalThis, "navigator", { configurable: true, get: () => ({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129" }) });

type Call = { url: string; method: string };
let calls: Call[] = [];
let apiResponse: () => Response = () => new Response("{}", { status: 200 });
let sessionValid: boolean | "network" = true;
g.fetch = async (url: string, init?: { method?: string }) => {
  calls.push({ url: String(url), method: init?.method ?? "GET" });
  if (String(url) === "/api/auth/session") {
    if (sessionValid === "network") throw new Error("ağ");
    return new Response(JSON.stringify(sessionValid ? { valid: true } : { valid: false, reason: "expired" }), { status: 200 });
  }
  return apiResponse();
};
const notFound = () => new Response(JSON.stringify({ ok: false, error: "Bulunamadı." }), { status: 404 });
const sessionCalls = () => calls.filter((c) => c.url === "/api/auth/session").length;

function reset(opts: { user?: boolean } = {}) {
  store.clear();
  calls = [];
  // H6b web: token JS'te yok, kimlik HttpOnly çerezde → hasSessionCredential profil kaydına bakar.
  if (opts.user !== false) store.set("yasam_user", JSON.stringify({ id: UID, role: "admin", active: true, approval_status: "approved", email: "x@test.invalid" }));
}

async function main() {
  const api = await import("@/app/admin/astroloji/_lib/api");

  await t("sessionEndedOnNotFound: 404 dışı kodlarda yoklama çağrılmaz", async () => {
    let n = 0;
    const confirm = async () => {
      n += 1;
      return { valid: false, reason: "expired" as const };
    };
    for (const st of [200, 400, 401, 403, 409, 413, 422, 429, 500, 502]) assert.equal(await api.sessionEndedOnNotFound(st, confirm), false, String(st));
    assert.equal(n, 0);
  });
  await t("sessionEndedOnNotFound: 404 + kesin geçersiz → true; geçerli/null/istisna → false", async () => {
    assert.equal(await api.sessionEndedOnNotFound(404, async () => ({ valid: false, reason: "revoked" })), true);
    assert.equal(await api.sessionEndedOnNotFound(404, async () => null), false);
    assert.equal(await api.sessionEndedOnNotFound(404, async () => ({ valid: true, reason: "revoked" })), false);
    assert.equal(
      await api.sessionEndedOnNotFound(404, async () => {
        throw new Error("x");
      }),
      false,
    );
  });

  await t("astroFetch: 404 + oturum geçerli → özgün 404 mesajı aynen, tek yoklama", async () => {
    reset();
    sessionValid = true;
    apiResponse = notFound;
    const r = await api.astroFetch("/api/admin/astroloji/profiles/x");
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 404);
    assert.equal(r.error, "Bulunamadı.");
    assert.equal(sessionCalls(), 1);
  });
  await t("astroFetch: 404 + oturum iki kez kesin geçersiz → SESSION_ENDED + yeniden giriş mesajı", async () => {
    reset();
    sessionValid = false;
    apiResponse = notFound;
    const r = await api.astroFetch("/api/admin/astroloji/profiles/x");
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.code, api.SESSION_ENDED_CODE);
    assert.equal(r.error, api.SESSION_ENDED_MESSAGE);
    assert.equal(r.status, 401);
    assert.equal(sessionCalls(), 2, "iki aşamalı karar");
  });
  await t("astroFetch: 404 + oturum yoklaması ağ hatası → özgün 404 (oturum sonu SAYILMAZ)", async () => {
    reset();
    sessionValid = "network";
    apiResponse = notFound;
    const r = await api.astroFetch("/api/admin/astroloji/profiles/x");
    assert.ok(!r.ok && r.status === 404 && r.error === "Bulunamadı.");
  });
  await t("astroFetch: 200 / 422 / 500 → oturum yoklaması YOK", async () => {
    for (const [st, body] of [
      [200, { ok: true }],
      [422, { ok: false, code: "BAD", error: "Geçersiz." }],
      [500, { ok: false, error: "Sunucu." }],
    ] as const) {
      reset();
      sessionValid = false;
      apiResponse = () => new Response(JSON.stringify(body), { status: st });
      await api.astroFetch("/api/admin/astroloji/access");
      assert.equal(sessionCalls(), 0, String(st));
    }
  });
  await t("astroFetch: profil kaydı yoksa istek atılmaz (mevcut NO_SESSION kapısı korunur)", async () => {
    reset({ user: false });
    const r = await api.astroFetch("/api/admin/astroloji/access");
    assert.ok(!r.ok && r.code === "NO_SESSION");
    assert.equal(calls.length, 0);
  });

  await t("astroDownload: 404 + oturum geçersiz → oturum mesajı; 404 + geçerli → sunucu mesajı", async () => {
    reset();
    sessionValid = false;
    apiResponse = notFound;
    let r = await api.astroDownload("/api/admin/astroloji/analyses/x/report?format=pdf", "rapor.pdf");
    assert.ok(!r.ok && r.error === api.SESSION_ENDED_MESSAGE);
    reset();
    sessionValid = true;
    r = await api.astroDownload("/api/admin/astroloji/analyses/x/report?format=pdf", "rapor.pdf");
    assert.ok(!r.ok && r.error === "Bulunamadı.");
    assert.equal(sessionCalls(), 1);
  });
  await t("astroDownload: 413 / 429 → yoklama YOK, mevcut mesajlar", async () => {
    reset();
    sessionValid = false;
    apiResponse = () => new Response("payload too large", { status: 413 });
    const r = await api.astroDownload("/api/admin/astroloji/analyses/report", "r.docx");
    assert.ok(!r.ok && /daha az analiz/.test(r.error));
    assert.equal(sessionCalls(), 0);
  });

  await t("statik: yalnız mevcut oturum yardımcıları; ham token başlığı / localStorage okuması yok; sunucu 404 gövdesi aynı", () => {
    const src = readFileSync(join(ROOT, "app/admin/astroloji/_lib/api.ts"), "utf8");
    assert.ok(/from "@\/lib\/auth\/sessionExpiry"/.test(src) && /confirmSessionInvalid\(\)/.test(src));
    assert.ok(!/localStorage\.getItem\("yasam_session_token"\)/.test(src) && !/"x-session-token":/.test(src));
    assert.ok(!/checkSessionStatus\(/.test(src), "tek istekli karar yerine iki aşamalı karar");
    const gate = readFileSync(join(ROOT, "lib/astrology/access/ownerGate.ts"), "utf8");
    assert.ok(/NextResponse\.json\(\{ ok: false, error: "Bulunamadı\." \}, \{ status: 404, headers: ASTRO_NO_STORE \}\)/.test(gate), "tek tip 404 değişmedi");
  });

  console.log(`\nsession404: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

void main();

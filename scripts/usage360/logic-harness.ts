/**
 * USAGE360 AŞAMA 2A — SAF MANTIK + SÖZLEŞME harness'i (DB gerektirmez; ağ/prod temas YOK).
 *
 * Kapsam: aktif süre kredisi sınırları, istemci ping kararı (gizli sekme / 5 dk idle),
 * platform çözücü (Android soneki / WebView türetilmiş / web), konum normalizasyonu,
 * rota→modül allowlist, beacon katı şema (512 B / bilinmeyen alan / yasak eylem / kimlik
 * spoof), beacon işleyici (bayrak / admin / demo / izin / kimlik guard'dan), trackUsage
 * (bayrak kapalı → yalnız eski 4 olay; admin/demo no-op; HMAC idem), TS↔SQL sözlük eşitliği,
 * sentinel sızıntı testi.
 * Çalıştır: npx tsx scripts/usage360/logic-harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserGuardResult } from "../../lib/auth/userGuard";
import {
  computeActiveCredit,
  shouldSendPing,
  INTERACTION_IDLE_MS,
  PING_INTERVAL_MS,
} from "../../lib/usage/activeTime";
import { parseUsageUserAgent, normalizeCity, normalizeCountry, resolveUsageClientContext } from "../../lib/usage/clientContext";
import { resolveUsageModuleFromPath } from "../../lib/usage/usageRouteModules";
import { parseBeaconBody, BEACON_MAX_BYTES } from "../../lib/usage/beaconContract";
import { handleUsageBeacon } from "../../lib/usage/beaconHandler";
import { trackUsage, buildUsageIdemHash, resolveUsageHashSecret } from "../../lib/usage/trackUsage";
import { isUsage360Enabled } from "../../lib/usage/usageFlag";
import {
  USAGE_ACTIONS,
  USAGE_CHANNELS,
  USAGE_OS_FAMILIES,
  USAGE_BROWSER_FAMILIES,
  USAGE_ERROR_CLASSES,
  USAGE_MODULE_KEYS,
  LEGACY_EVENT_ACTION,
  toItemCountBucket,
} from "../../lib/usage/usageTaxonomy";
import { USAGE_EVENT_TYPES } from "../../lib/usage/usageEvents";
import { isLastSeenBackfillArtifact } from "../../lib/admin/stats/uiFormat";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}

const SENTINEL = "SENTINEL_PII_USAGE360_DO_NOT_LEAK";
const U1 = "11111111-1111-1111-1111-111111111101";
const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ON = { USAGE360_ENABLED: "true", USAGE360_HASH_SECRET: "test-secret" };
const OFF: Record<string, string | undefined> = { USAGE360_HASH_SECRET: "test-secret" };

const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const UA_ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const UA_ANDROID_WV = "Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";
const UA_ANDROID_APP = `${UA_ANDROID_WV} YasamSistemiAndroid/1.2.3`;
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// ── Sahte DB (yalnız çağrıları kaydeder) ──────────────────────────────────────
type Call = { kind: "rpc" | "insert"; name: string; args: Record<string, unknown> };
function fakeDb(rpcResult: unknown = "ok") {
  const calls: Call[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ kind: "rpc", name, args });
      return { data: rpcResult, error: null };
    },
    from: (table: string) => ({
      insert: async (payload: Record<string, unknown>) => {
        calls.push({ kind: "insert", name: table, args: payload });
        return { error: null };
      },
    }),
  };
  return { db: db as unknown as SupabaseClient, calls };
}

// ── (1) Aktif süre kredisi ────────────────────────────────────────────────────
console.log("\n[1] computeActiveCredit sınırları");
ok(computeActiveCredit(0) === 0 && computeActiveCredit(-5) === 0 && computeActiveCredit(NaN) === 0, "Δ≤0 / NaN → 0");
ok(computeActiveCredit(45) === 45, "Δ=45 → 45");
ok(computeActiveCredit(60) === 60, "Δ=60 → 60 (normal ping)");
ok(computeActiveCredit(90) === 90 && computeActiveCredit(120) === 90, "Δ=90/120 → 90 (tavan)");
ok(computeActiveCredit(150) === 90, "Δ=150 → 90 (ardışık sınır dahil)");
ok(computeActiveCredit(151) === 30, "Δ=151 → 30 (boşluktan dönüş sabit kredisi)");
ok(computeActiveCredit(29 * 60) === 30, "Δ=29 dk → 30 (8 saatlik sekme uzun boşlukla şişmez)");

// ── (2)(3) İstemci ping kararı ────────────────────────────────────────────────
console.log("\n[2-3] shouldSendPing — görünürlük / 5 dk idle / 60 sn");
const t0 = 1_000_000_000;
ok(shouldSendPing({ visible: true, nowMs: t0, lastInteractionMs: t0 - 1000, lastPingMs: null }), "görünür + taze etkileşim + ilk ping → gönder");
ok(!shouldSendPing({ visible: false, nowMs: t0, lastInteractionMs: t0 - 1000, lastPingMs: null }), "GİZLİ sekme → ping YOK");
ok(!shouldSendPing({ visible: true, nowMs: t0, lastInteractionMs: null, lastPingMs: null }), "hiç etkileşim yok → ping YOK");
ok(shouldSendPing({ visible: true, nowMs: t0, lastInteractionMs: t0 - INTERACTION_IDLE_MS, lastPingMs: t0 - PING_INTERVAL_MS }), "etkileşim tam 5 dk önce → hâlâ gönder (sınır dahil)");
ok(!shouldSendPing({ visible: true, nowMs: t0, lastInteractionMs: t0 - INTERACTION_IDLE_MS - 1, lastPingMs: null }), "5 dk + 1 ms etkileşimsiz → ping DURUR");
ok(!shouldSendPing({ visible: true, nowMs: t0, lastInteractionMs: t0 - 1000, lastPingMs: t0 - 30_000 }), "son ping 30 sn önce → bekle (≤60 sn periyot)");
// 8 saat açık unutulan sekme simülasyonu: t0'da etkileşim, sonra hiç yok; 15 sn'lik tick'ler.
{
  let lastPing: number | null = null; let pings = 0; let credit = 0;
  const interaction = t0;
  for (let now = t0; now <= t0 + 8 * 3600_000; now += 15_000) {
    if (shouldSendPing({ visible: true, nowMs: now, lastInteractionMs: interaction, lastPingMs: lastPing })) {
      if (lastPing != null) credit += computeActiveCredit((now - lastPing) / 1000);
      lastPing = now; pings++;
    }
  }
  ok(pings <= 6 && credit <= 5 * 60, `8 saat açık sekme → ${pings} ping, ~${Math.round(credit / 60)} dk kredi (≤5 dk)`);
}

// ── (8)(9)(10) Platform çözücü ────────────────────────────────────────────────
console.log("\n[8-10] parseUsageUserAgent");
const app = parseUsageUserAgent(UA_ANDROID_APP);
ok(app.channel === "android_app" && app.appVersion === "1.2.3" && app.osFamily === "android" && app.browserFamily === "webview", "UA soneki YasamSistemiAndroid/1.2.3 → android_app + app_version 1.2.3");
const wv = parseUsageUserAgent(UA_ANDROID_WV);
ok(wv.channel === "android_webview_derived" && wv.appVersion === null && wv.browserFamily === "webview", "yalnız `; wv)` → android_webview_derived (türetilmiş)");
const hint = parseUsageUserAgent(UA_ANDROID_CHROME, "android");
ok(hint.channel === "android_webview_derived", "eski x-yasam-client ipucu tek başına → yalnız türetilmiş sınıf (android_app DEĞİL)");
ok(parseUsageUserAgent(UA_ANDROID_CHROME).channel === "mobile_web" && parseUsageUserAgent(UA_ANDROID_CHROME).browserFamily === "chrome", "Android Chrome → mobile_web / chrome");
ok(parseUsageUserAgent(UA_DESKTOP).channel === "desktop_web" && parseUsageUserAgent(UA_DESKTOP).osFamily === "windows", "Windows → desktop_web / windows");
ok(parseUsageUserAgent(UA_MAC).channel === "desktop_web" && parseUsageUserAgent(UA_MAC).osFamily === "macos" && parseUsageUserAgent(UA_MAC).browserFamily === "safari", "macOS Safari → desktop_web / macos / safari");
ok(parseUsageUserAgent(UA_IPAD).channel === "tablet_web" && parseUsageUserAgent(UA_IPAD).osFamily === "ios", "iPad → tablet_web / ios");
ok(parseUsageUserAgent(UA_ANDROID_TABLET).channel === "tablet_web", "Android tablet (Mobile yok) → tablet_web");
ok(parseUsageUserAgent(UA_IPHONE).channel === "mobile_web" && parseUsageUserAgent(UA_IPHONE).osFamily === "ios", "iPhone → mobile_web / ios");
ok(parseUsageUserAgent("").channel === "unknown", "boş UA → unknown");
ok(parseUsageUserAgent("x YasamSistemiAndroid/1.2.3;DROP").appVersion === "1.2.3", "app_version yalnız [0-9A-Za-z._-] (enjeksiyon kesilir)");
{
  const out = JSON.stringify(parseUsageUserAgent(`${UA_DESKTOP} ${SENTINEL}`));
  ok(!out.includes(SENTINEL) && !out.includes("Mozilla"), "ham UA sonuçta YOK (yalnız aile bilgisi)");
}

console.log("\n[12'] konum normalizasyonu");
ok(normalizeCountry("tr") === "TR" && normalizeCountry("TUR") === null && normalizeCountry("XX") === null && normalizeCountry(null) === null, "ülke: ISO-2 büyük harf; geçersiz/XX/boş → null");
ok(normalizeCity("Istanbul") === "Istanbul" && normalizeCity("S%C3%A3o%20Paulo") === "São Paulo", "şehir: URL-decode");
ok(normalizeCity("%E0%A4%A") === null && normalizeCity("") === null, "bozuk kodlama / boş → null");
ok((normalizeCity("a".repeat(200)) ?? "").length === 64 && normalizeCity("x\u0000y") === "xy", "şehir: 64 sınır + kontrol karakteri atılır");
ok(normalizeCity("İstanbul") === "İstanbul" && normalizeCity("K%C3%BCtahya") === "Kütahya" && normalizeCity("Saint-Étienne") === "Saint-Étienne", "şehir: Türkçe/aksanlı harf ve tire korunur");
ok(normalizeCity(SENTINEL) !== SENTINEL && normalizeCity("12345") === null && normalizeCity("a@b/c_1") === "abc", "şehir: rakam / _ / @ / / atılır (serbest metin taşınamaz)");
{
  const h = new Headers({ "user-agent": UA_DESKTOP, "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9", "x-vercel-ip-country": "TR", "x-vercel-ip-city": "Izmir" });
  const ctx = resolveUsageClientContext(h);
  ok(!JSON.stringify(ctx).includes("203.0.113.9"), "bağlamda IP YOK (IP başlıkları okunmaz)");
  ok(ctx.country === "TR" && ctx.city === "Izmir" && ctx.channel === "desktop_web", "Vercel coarse geo: ülke + şehir");
}

// ── Rota → modül (allowlist; ham yol gönderilmez) ─────────────────────────────
console.log("\n[route] resolveUsageModuleFromPath");
ok(resolveUsageModuleFromPath("/numeroloji/analiz") === "numerology", "/numeroloji/analiz → numerology");
ok(resolveUsageModuleFromPath("/refleksoloji/protokol-haritasi?x=1") === "reflexology", "query string atılır → reflexology");
ok(resolveUsageModuleFromPath("/dashboard/clients/abc") === "clients", "/dashboard/clients/[id] → clients");
ok(resolveUsageModuleFromPath("/beslenme/planlar/1") === "beslenme", "/beslenme → beslenme");
ok(resolveUsageModuleFromPath("/digital-content") === "digital_content", "/digital-content hub → digital_content");
ok(resolveUsageModuleFromPath("/dogal-destek") === null && resolveUsageModuleFromPath("/enerji-beden") === null, "çok-modüllü hub → null (tek modüle atfedilmez)");
ok(resolveUsageModuleFromPath("/") === null && resolveUsageModuleFromPath("/settings") === null && resolveUsageModuleFromPath("/admin/kullanim-takibi") === null, "modül dışı sayfa → null");
ok(resolveUsageModuleFromPath("/yasam-hafizasi") === null, "ModuleGateKey olmayan kural → null");

// ── (12)(13)(14)(15) Beacon katı şema ─────────────────────────────────────────
console.log("\n[12-15] parseBeaconBody");
ok(parseBeaconBody(JSON.stringify({ kind: "ping" })).ok, "ping (modülsüz) geçerli");
ok(parseBeaconBody(JSON.stringify({ kind: "module_opened", module: "numerology" })).ok, "module_opened geçerli");
{
  const big = JSON.stringify({ kind: "ping", module: "numerology", pad: "x".repeat(BEACON_MAX_BYTES) });
  const r = parseBeaconBody(big);
  ok(!r.ok && r.status === 413, "512 byte üstü → 413");
  const multi = JSON.stringify({ kind: "module_opened", module: "numerology" }) + " ".repeat(BEACON_MAX_BYTES - 40);
  ok(!parseBeaconBody(multi + "ğğğ").ok, "byte (karakter değil) sayılır: çok baytlı UTF-8 ile sınır aşımı → red");
}
for (const k of ["user_id", "tenant_id", "auth_session_id", "userId", "url", "path", "message", "title"]) {
  const r = parseBeaconBody(JSON.stringify({ kind: "ping", [k]: "x" }));
  ok(!r.ok && r.status === 400 && r.code === "unknown_property", `bilinmeyen/kimlik alanı "${k}" → 400`);
}
for (const k of ["record_created", "record_updated", "record_deleted", "analysis_run", "file_uploaded", "report_generated", "heartbeat", "search_used"]) {
  const r = parseBeaconBody(JSON.stringify({ kind: k, module: "numerology" }));
  ok(!r.ok && r.status === 400, `istemciden yasak eylem "${k}" → 400`);
}
ok(!parseBeaconBody(JSON.stringify({ kind: "module_opened", module: "not_a_module" })).ok, "enum dışı modül → 400");
ok(!parseBeaconBody(JSON.stringify({ kind: "module_opened" })).ok, "module_opened modülsüz → 400");
ok(!parseBeaconBody(JSON.stringify({ kind: "action_failed", module: "numerology", errorClass: "server" })).ok, "istemci sunucu hata sınıfı (server) bildiremez → 400");
ok(parseBeaconBody(JSON.stringify({ kind: "action_failed", module: "numerology", errorClass: "client_export", failedAction: "report_exported" })).ok, "istemci client_export hatası geçerli");
ok(!parseBeaconBody(JSON.stringify({ kind: "action_failed", module: "numerology", errorClass: "network", failedAction: "record_created" })).ok, "istemci failedAction=record_created → 400");
ok(!parseBeaconBody(JSON.stringify({ kind: "report_exported", module: "numerology", nonce: SENTINEL })).ok, "nonce biçim dışı (serbest metin) → 400");
ok(!parseBeaconBody("[1,2]").ok && !parseBeaconBody("nope").ok && !parseBeaconBody("null").ok, "dizi / bozuk JSON / null → 400");
ok(!parseBeaconBody(JSON.stringify({ kind: "ping", module: SENTINEL })).ok, "sentinel serbest metin modül alanında taşınamaz");

// ── Beacon işleyici ───────────────────────────────────────────────────────────
console.log("\n[16-18] handleUsageBeacon");
type Req = { headers: Headers; text: () => Promise<string>; bodyRead: boolean };
function mkReq(body: unknown, extraHeaders: Record<string, string> = {}): Req {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const r: Req = {
    headers: new Headers({ "user-agent": UA_ANDROID_APP, "x-session-token": "tok-u1", "x-user-id": U1, "x-vercel-ip-country": "TR", "x-vercel-ip-city": "Ankara", ...extraHeaders }),
    bodyRead: false,
    text: async () => { r.bodyRead = true; return raw; },
  };
  return r;
}
function mkVerify(db: SupabaseClient, opts: { role?: string; demo?: boolean; perms?: Record<string, boolean>; fail?: boolean } = {}) {
  let called = 0;
  const fn = async (): Promise<UserGuardResult> => {
    called++;
    if (opts.fail) {
      const { NextResponse } = await import("next/server");
      return { ok: false, response: NextResponse.json({ error: "x" }, { status: 401 }) };
    }
    return {
      ok: true, userId: U1, tenantId: T1, email: "e@x", is_demo_account: opts.demo === true, db,
      profile: { role: opts.role ?? "expert", module_permissions: opts.perms ?? { numerology: true, reflexology: true } },
    };
  };
  return { fn, count: () => called };
}
async function run() {
  {
    const { db, calls } = fakeDb();
    const v = mkVerify(db);
    const req = mkReq({ kind: "ping", module: "numerology" });
    const res = await handleUsageBeacon(req, v.fn, OFF);
    ok(res.status === 204 && calls.length === 0 && v.count() === 0 && !req.bodyRead, "bayrak YOK → 204, gövde okunmaz, kimlik/DB çağrısı yok");
    const res2 = await handleUsageBeacon(mkReq({ kind: "ping" }), v.fn, { USAGE360_ENABLED: "false" });
    ok(res2.status === 204 && calls.length === 0, "USAGE360_ENABLED=false → 204 no-op");
    ok(!isUsage360Enabled({}) && !isUsage360Enabled({ USAGE360_ENABLED: "1" }) && !isUsage360Enabled({ USAGE360_ENABLED: "TRUE" }) && isUsage360Enabled({ USAGE360_ENABLED: "true" }), "bayrak yalnız tam \"true\" iken açık (varsayılan KAPALI)");
  }
  {
    const { db, calls } = fakeDb();
    const res = await handleUsageBeacon(mkReq({ kind: "ping", module: "numerology" }), mkVerify(db).fn, ON);
    const c = calls[0];
    ok(res.status === 204 && calls.length === 1 && c.name === "usage360_ping", "bayrak açık → usage360_ping (tek RPC; ping olay satırı üretmez)");
    ok(c.args.p_user_id === U1 && c.args.p_tenant_id === T1 && c.args.p_session_token === "tok-u1", "user/tenant GUARD'dan, token başlıktan (istemci gövdesinden DEĞİL)");
    ok(c.args.p_channel === "android_app" && c.args.p_app_version === "1.2.3" && c.args.p_country === "TR" && c.args.p_city === "Ankara", "kanal/sürüm/yaklaşık konum sunucuda çözülür");
    ok(!("p_user_agent" in c.args) && !JSON.stringify(c.args).includes("Mozilla"), "RPC'ye ham UA gönderilmez");
  }
  {
    const { db, calls } = fakeDb();
    const res = await handleUsageBeacon(mkReq({ kind: "ping", user_id: "22222222-2222-2222-2222-222222222202" }), mkVerify(db).fn, ON);
    ok(res.status === 400 && calls.length === 0, "gövdede user_id spoof → 400, DB çağrısı yok");
    const res2 = await handleUsageBeacon(mkReq({ kind: "record_created", module: "numerology" }), mkVerify(db).fn, ON);
    ok(res2.status === 400 && calls.length === 0, "istemci record_created → 400");
    const res3 = await handleUsageBeacon(mkReq({ kind: "ping" }, { "content-length": "9999" }), mkVerify(db).fn, ON);
    ok(res3.status === 413 && calls.length === 0, "content-length > 512 → 413 (gövde okunmadan)");
  }
  {
    const { db, calls } = fakeDb();
    const vf = mkVerify(db, { fail: true });
    const res = await handleUsageBeacon(mkReq({ kind: "ping" }), vf.fn, ON);
    ok(res.status === 401 && calls.length === 0, "kimlik doğrulanamadı (token binding) → guard yanıtı, DB yok");
  }
  {
    const { db, calls } = fakeDb();
    const r1 = await handleUsageBeacon(mkReq({ kind: "module_opened", module: "numerology" }), mkVerify(db, { role: "admin" }).fn, ON);
    const r2 = await handleUsageBeacon(mkReq({ kind: "module_opened", module: "numerology" }), mkVerify(db, { demo: true }).fn, ON);
    ok(r1.status === 204 && r2.status === 204 && calls.length === 0, "admin ve demo → 204 NO-OP (RPC çağrılmaz)");
  }
  {
    const { db, calls } = fakeDb();
    const r = await handleUsageBeacon(mkReq({ kind: "module_opened", module: "stones" }), mkVerify(db, { perms: { numerology: true } }).fn, ON);
    ok(r.status === 204 && calls.length === 0, "izinsiz modül açılışı → no-op");
  }
  {
    const { db, calls } = fakeDb();
    await handleUsageBeacon(mkReq({ kind: "report_exported", module: "numerology", nonce: "abcdef1234" }), mkVerify(db).fn, ON);
    const a = calls[0]?.args ?? {};
    ok(calls[0]?.name === "usage360_track" && a.p_source === "client" && a.p_action === "report_exported", "report_exported → usage360_track source=client");
    ok(typeof a.p_idempotency_key === "string" && /^[0-9a-f]{64}$/.test(String(a.p_idempotency_key)) && !String(a.p_idempotency_key).includes("abcdef1234"), "istemci nonce HMAC'lanır (ham nonce saklanmaz)");
  }

  // ── trackUsage ──────────────────────────────────────────────────────────────
  console.log("\n[trackUsage] bayrak / admin / demo / idem / eski 4 olay");
  const guardFor = (db: SupabaseClient, extra: Partial<{ is_demo_account: boolean; role: string }> = {}) => ({
    userId: U1, tenantId: T1, is_demo_account: extra.is_demo_account === true, db, profile: { role: extra.role ?? "expert" },
  });
  const reqH = { headers: new Headers({ "user-agent": UA_DESKTOP, "x-session-token": "tok-u1", "x-vercel-ip-country": "TR" }) };
  {
    const { db, calls } = fakeDb();
    const r = await trackUsage(guardFor(db), reqH, { module: "numerology", action: "record_updated", resourceId: "r1" }, OFF);
    ok(r.status === "disabled" && calls.length === 0, "bayrak KAPALI + yeni olay → no-op (DB çağrısı yok)");
    const r2 = await trackUsage(guardFor(db), reqH, { module: "numerology", action: "analysis_run", subEntity: "analysis", resourceId: "r1", legacyEventType: "analysis_created" }, OFF);
    const ins = calls[0];
    ok(r2.status === "legacy" && calls.length === 1 && ins.kind === "insert" && ins.name === "expert_usage_events", "bayrak KAPALI + eski olay → AŞAMA 1 öncesi satır (geriye-uyum)");
    ok(JSON.stringify(Object.keys(ins.args).sort()) === JSON.stringify(["event_type", "idempotency_key", "module_key", "tenant_id", "user_id"]), "eski satır yalnız 5 kolon (yeni Usage360 alanı YOK)");
    ok(ins.args.event_type === "analysis_created" && /^[0-9a-f]{64}$/.test(String(ins.args.idempotency_key)), "eski olay türü korunur; idem HMAC (ham kaynak id'si yok)");
  }
  {
    const { db, calls } = fakeDb();
    const a = await trackUsage(guardFor(db, { role: "admin" }), reqH, { module: "stones", action: "record_created", resourceId: "x", legacyEventType: "record_created" }, ON);
    const d = await trackUsage(guardFor(db, { is_demo_account: true }), reqH, { module: "stones", action: "record_created", resourceId: "x", legacyEventType: "record_created" }, OFF);
    ok(a.status === "noop" && d.status === "noop" && calls.length === 0, "admin (açık) ve demo (kapalı) → no-op, eski yolda bile yazım yok");
  }
  {
    const { db, calls } = fakeDb("ok");
    const r = await trackUsage(guardFor(db), reqH, { module: "stones", action: "record_created", subEntity: "stone", resourceId: `id-${SENTINEL}`, legacyEventType: "record_created" }, ON);
    const a = calls[0].args;
    ok(r.status === "ok" && calls[0].name === "usage360_track" && a.p_source === "server" && a.p_legacy_event_type === "record_created", "bayrak AÇIK → usage360_track (server, eski tür eşlenir)");
    ok(a.p_user_id === U1 && a.p_tenant_id === T1 && a.p_channel === "desktop_web" && a.p_country === "TR", "kimlik guard'dan; bağlam başlıklardan");
    ok(!JSON.stringify(a).includes(SENTINEL), "SENTINEL resourceId RPC argümanlarında YOK (HMAC)");
  }
  {
    const { db, calls } = fakeDb();
    const bad1 = await trackUsage(guardFor(db), reqH, { module: "stones", action: "record_created", subEntity: SENTINEL }, ON);
    const bad2 = await trackUsage(guardFor(db), reqH, { module: "stones", action: "record_updated", errorClass: "server" }, ON);
    ok(bad1.status === "invalid" && bad2.status === "invalid" && calls.length === 0, "izinsiz sub_entity / uyumsuz hata alanı → invalid, yazım yok");
  }
  {
    const { db } = fakeDb();
    const failing = { ...guardFor(db), db: { rpc: async () => { throw new Error(SENTINEL); } } as unknown as SupabaseClient };
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { logs.push(JSON.stringify(a)); };
    const r = await trackUsage(failing, reqH, { module: "stones", action: "record_created", resourceId: "x" }, ON);
    console.error = orig;
    ok(r.status === "error", "RPC istisnası → throw ETMEZ (iş işlemi etkilenmez)");
    ok(!logs.join("").includes(SENTINEL), "hata logu mesaj/stack içermez (yalnız enum + ad)");
  }

  // ── (20) idem hash ──────────────────────────────────────────────────────────
  console.log("\n[20] buildUsageIdemHash");
  const base = { userId: U1, module: "stones" as const, action: "record_created" as const, resourceId: "r-1" };
  const h1 = buildUsageIdemHash(base, "s"), h2 = buildUsageIdemHash(base, "s");
  ok(h1 === h2 && /^[0-9a-f]{64}$/.test(h1), "deterministik 64 hex");
  ok(h1 !== buildUsageIdemHash({ ...base, resourceId: "r-2" }, "s") && h1 !== buildUsageIdemHash(base, "other"), "farklı kaynak / farklı sır → farklı");
  ok(!h1.includes("r-1"), "ham kaynak id'si anahtarda YOK");
  const up = { userId: U1, module: "stones" as const, action: "record_updated" as const, resourceId: "r-1" };
  ok(buildUsageIdemHash({ ...up, nowMs: 60_000 * 10 + 5 }, "s") === buildUsageIdemHash({ ...up, nowMs: 60_000 * 10 + 50_000 }, "s"), "update: aynı 60 sn kovası → aynı anahtar (çift tık tek)");
  ok(buildUsageIdemHash({ ...up, nowMs: 60_000 * 10 }, "s") !== buildUsageIdemHash({ ...up, nowMs: 60_000 * 12 }, "s"), "update: farklı dakika → farklı anahtar (gerçek tekrar sayılır)");
  ok(resolveUsageHashSecret({}) === "dev-only-yasam-usage360-idem" && resolveUsageHashSecret({ SUPABASE_SERVICE_ROLE_KEY: "k" }) !== "k", "sır: env yoksa dev sabiti; sunucu sırrından türetilirse sırrın kendisi değil");

  // ── Sözlük: TS ↔ SQL birebir ────────────────────────────────────────────────
  console.log("\n[sync] TS ↔ migration sözlükleri");
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20270205000000_usage360_telemetry_core.sql"), "utf8");
  const sqlArray = (fn: string): string[] => {
    const i = sql.indexOf(`FUNCTION public.${fn}()`);
    const body = sql.slice(i, sql.indexOf("$$;", i));
    const m = body.match(/ARRAY\[([\s\S]*?)\]/);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };
  const same = (a: readonly string[], b: readonly string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  ok(same(sqlArray("usage360_module_keys"), USAGE_MODULE_KEYS), "modül anahtarları (19, belge_ceviri_ai dahil)");
  ok(same(sqlArray("usage360_actions"), USAGE_ACTIONS), "eylemler");
  ok(same(sqlArray("usage360_channels"), USAGE_CHANNELS), "kanallar");
  ok(same(sqlArray("usage360_os_families"), USAGE_OS_FAMILIES), "OS aileleri");
  ok(same(sqlArray("usage360_browser_families"), USAGE_BROWSER_FAMILIES), "tarayıcı aileleri");
  ok(same(sqlArray("usage360_error_classes"), USAGE_ERROR_CLASSES), "hata sınıfları");
  ok(same(Object.keys(LEGACY_EVENT_ACTION), USAGE_EVENT_TYPES), "eski olay türleri ↔ Usage360 eşlemesi eksiksiz");
  ok(toItemCountBucket(1) === "1" && toItemCountBucket(7) === "2-10" && toItemCountBucket(50) === "11-50" && toItemCountBucket(51) === "51+" && toItemCountBucket(0) === null, "öğe sayısı kovası");
  ok(!/\bjsonb?\b/i.test(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS public.usage_visits"), sql.indexOf("-- ─── (4)"))), "yeni tablolarda JSON/metadata kolonu YOK");
  ok(!/\b(ip_address|ip_hash|user_agent|latitude|longitude)\b/i.test(sql.replace(/--.*$/gm, "")), "migration'da IP / UA / koordinat kolonu YOK");

  console.log("\n[J] mevcut ekran: 27.09 backfill artefaktı işareti");
  ok(isLastSeenBackfillArtifact("2026-09-27T19:13:12.759938+00:00"), "19:13:12Z (prod artefakt dakikası) → artefakt");
  ok(!isLastSeenBackfillArtifact("2026-09-27T19:14:00Z") && !isLastSeenBackfillArtifact("2026-09-28T06:05:09Z") && !isLastSeenBackfillArtifact(null), "başka anlar / null → artefakt değil");

  console.log(`\n──────────\nUSAGE360 LOGIC: PASS ${passed} · FAIL ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}
void run();

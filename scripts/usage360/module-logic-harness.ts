/**
 * USAGE360 AŞAMA 2B — MODÜL-DÜZEYİ SAF MANTIK harness'i (DB/ağ/prod temas YOK).
 *
 * Kapsam: Türkçe şehir Unicode kapısı (ham + percent-encoded; HTML/script/newline/uzun red),
 * 19 modül rota→modül eşlemesi (UsageTracker), hata telemetrisi sınıflandırma + 60 sn dedup,
 * serverErrorResponse `usage` bağlamı (mesaj/cause sızmaz), beacon subEntity allowlist'i,
 * istemci export beacon'ı (bayrak kapalı → ağ yok; açık → yalnız enum gövde).
 * Çalıştır: npx tsx scripts/usage360/module-logic-harness.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCity, resolveUsageClientContext } from "../../lib/usage/clientContext";
import { resolveUsageModuleFromPath } from "../../lib/usage/usageRouteModules";
import { parseBeaconBody } from "../../lib/usage/beaconContract";
import { trackUsage, trackUsageLater, usageErrorClassForStatus } from "../../lib/usage/trackUsage";
import { USAGE_SUB_ENTITIES, USAGE_MODULE_KEYS } from "../../lib/usage/usageTaxonomy";
import { serverErrorResponse } from "../../lib/http/apiError";
import { ADMIN_ONLY_MODULE_KEYS } from "../../lib/auth/moduleAccessCore";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}
const SENTINEL = "SENTINEL_PII_USAGE360_DO_NOT_LEAK";
const U1 = "11111111-1111-1111-1111-111111111101";
const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ON = { USAGE360_ENABLED: "true", USAGE360_HASH_SECRET: "s" };

type Call = { name: string; args: Record<string, unknown> };
function fakeDb() {
  const calls: Call[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: "ok", error: null }; },
    from: () => ({ insert: async () => ({ error: null }) }),
  };
  return { db: db as unknown as SupabaseClient, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

async function run() {
  // ── [28] Türkçe şehir Unicode kapısı ────────────────────────────────────────
  console.log("\n[28] şehir: Türkçe Unicode korunur, zararlı değer reddedilir");
  const cities = ["Çumra", "İzmir", "Şanlıurfa", "Muğla", "Çankırı", "Iğdır", "Kırşehir", "Eskişehir"];
  for (const c of cities) {
    ok(normalizeCity(c) === c, `ham UTF-8 "${c}" aynen korunur`);
    ok(normalizeCity(encodeURIComponent(c)) === c, `percent-encoded "${encodeURIComponent(c)}" → "${c}"`);
    const ctx = resolveUsageClientContext(new Headers({ "x-vercel-ip-city": encodeURIComponent(c), "x-vercel-ip-country": "TR", "user-agent": "Mozilla/5.0 (Windows NT 10.0)" }));
    ok(ctx.city === c && ctx.country === "TR", `Vercel başlık yolu: "${c}" / TR`);
  }
  // Ayrışık (NFD) biçim NFC'ye indirgenir.
  ok(normalizeCity("İzmir".normalize("NFD")) === "İzmir" && normalizeCity("Çumra".normalize("NFD")) === "Çumra", "NFD biçimli Türkçe harf → NFC (İ/Ç kaybolmaz)");
  ok(normalizeCity("Afyonkarahisar") === "Afyonkarahisar" && normalizeCity("Kahramanmaraş") === "Kahramanmaraş" && normalizeCity("Ağrı") === "Ağrı", "diğer Türkçe iller korunur");
  const bad = ["<script>alert(1)</script>", "%3Cscript%3Ealert(1)%3C%2Fscript%3E", "<b>İzmir</b>", "İzmir\nAnkara", "İzmir%0AAnkara", "İzmir\rAnkara", "Muğla\u0000", "İzmir​", "a".repeat(65), "Şanlıurfa".repeat(8), "İzmir 35", "İzmir;DROP", SENTINEL, "javascript:alert", "%ZZ", "İzmir/Konak"];
  for (const b of bad) ok(normalizeCity(b) === null, `reddedilir: ${JSON.stringify(b).slice(0, 40)}`);
  ok(normalizeCity("İzmir\r\n") === "İzmir" && normalizeCity("  İzmir  ") === "İzmir" && normalizeCity("Saint-Étienne") === "Saint-Étienne" && normalizeCity("L'Aquila") === "L'Aquila",
    "yalnız baş/son boşluk (CR/LF dahil) kırpılır; gövde içi satır sonu reddedilir; tire/kesme işareti kabul");

  // ── [24] 19 modül rota eşlemesi (UsageTracker MODULE_OPENED) ────────────────
  console.log("\n[24] rota → modül (19 modül)");
  const expectations: [string, string | null][] = [
    ["/danisan-yolculugu/liste", "clients"], ["/dashboard/clients/abc", "clients"],
    ["/dashboard/ajanda", "appointments"],
    ["/numeroloji/analiz", "numerology"],
    ["/dogaltas/dogaltas-listesi", "stones"],
    ["/urun-stok/yag", "stok"], ["/urun-stok/dogaltas", "stok"],
    ["/sifa-rehberi/1", "sifa_rehberi"],
    ["/dashboard/biyoenerji/seanslar", "energy_body"],
    ["/refleksoloji/protokol-haritasi", "reflexology"], ["/dashboard/refleksoloji", "reflexology"],
    ["/aromaterapi/karisim-olusturucu", "aromatherapy"],
    ["/dashboard/kisisel-arsiv", "personal_archive"],
    ["/video-ceviri", "video_ceviri"],
    ["/belge-ceviri", "belge_ceviri"],
    ["/human-design/harita-kaydi", "human_design"],
    ["/digital-content", "digital_content"],
    ["/cosmic-calendar/moon-phases", "cosmic_calendar"],
    ["/kupa/protokoller", "cupping"],
    ["/beslenme/planlar/1", "beslenme"],
    ["/enerji-beden", null], ["/dogal-destek", null], ["/", null], ["/settings", null], ["/admin/kullanim-takibi", null],
  ];
  for (const [p, m] of expectations) ok(resolveUsageModuleFromPath(p) === m, `${p} → ${m}`);
  const reachable = new Set(expectations.map((e) => e[1]).filter(Boolean));
  const unreachable = USAGE_MODULE_KEYS.filter((k) => !reachable.has(k));
  ok(JSON.stringify(unreachable.sort()) === JSON.stringify(["belge_ceviri_ai", "ders_notu"].sort()),
    `sayfa rotası olmayan anahtarlar yalnız belge_ceviri_ai (sanal kapı) ve ders_notu (admin-only; rota kuralı yok): ${unreachable.join(",")}`);
  for (const k of ADMIN_ONLY_MODULE_KEYS) ok(USAGE_SUB_ENTITIES[k as keyof typeof USAGE_SUB_ENTITIES].length === 0, `admin-only ${k}: alt-varlık listesi boş (uzman işlem olayı yok)`);

  // ── [23] hata sınıflandırma + dedup ─────────────────────────────────────────
  console.log("\n[23] hata telemetrisi: sınıf + 60 sn dedup + mesaj sızmaz");
  ok(usageErrorClassForStatus(409) === "conflict" && usageErrorClassForStatus(413) === "too_large" && usageErrorClassForStatus(422) === "validation", "409/413/422 → conflict/too_large/validation");
  ok(usageErrorClassForStatus(500) === "server" && usageErrorClassForStatus(503) === "server" && usageErrorClassForStatus(504) === "timeout", "5xx → server, 504 → timeout");
  ok([200, 400, 401, 403, 404, 429].every((s) => usageErrorClassForStatus(s) === null), "400/401/403/404/429 → olay YOK (auth/yetki güvenlik sisteminde)");
  const guard = (db: SupabaseClient) => ({ userId: U1, tenantId: T1, is_demo_account: false, db, profile: { role: "expert" } });
  const req = { headers: new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0)" }) };
  {
    const { db, calls } = fakeDb();
    for (let i = 0; i < 3; i++) await trackUsage(guard(db), req, { module: "stones", action: "action_failed", failedAction: "record_created", subEntity: "stone", errorClass: "server" }, ON);
    const keys = new Set(calls.map((c) => c.args.p_idempotency_key));
    ok(calls.length === 3 && keys.size === 1 && /^[0-9a-f]{64}$/.test(String([...keys][0])), "aynı hata 3× → aynı dedup anahtarı (DB tek satır yazar)");
    await trackUsage(guard(db), req, { module: "stones", action: "action_failed", failedAction: "record_updated", subEntity: "stone", errorClass: "server" }, ON);
    ok(calls[3].args.p_idempotency_key !== calls[0].args.p_idempotency_key, "farklı başarısız eylem → ayrı anahtar");
  }
  {
    const { db, calls } = fakeDb();
    await trackUsage(guard(db), req, { module: "stones", action: "report_generated", subEntity: "stone", itemCount: 12 }, ON);
    await trackUsage(guard(db), req, { module: "stones", action: "report_generated", subEntity: "stone", itemCount: 20 }, ON);
    await trackUsage(guard(db), req, { module: "stones", action: "report_generated", subEntity: "stone", itemCount: 3 }, ON);
    ok(calls[0].args.p_idempotency_key === calls[1].args.p_idempotency_key && /^[0-9a-f]{64}$/.test(String(calls[0].args.p_idempotency_key)),
      "kaynak id'siz toplu rapor çift tık (aynı konu + kova) → aynı dedup anahtarı");
    ok(calls[2].args.p_idempotency_key !== calls[0].args.p_idempotency_key, "farklı öğe kovası → ayrı rapor olayı");
  }
  {
    const { db, calls } = fakeDb();
    trackUsageLater(guard(db), req, { module: "clients", action: "record_created", subEntity: "session", resourceId: "x" }, ON);
    await tick();
    ok(calls.length === 1 && calls[0].args.p_action === "record_created", "trackUsageLater istek bağlamı dışında da çalışır (fallback)");
  }
  {
    const { db, calls } = fakeDb();
    const prevEnv = process.env.USAGE360_ENABLED, prevSecret = process.env.USAGE360_HASH_SECRET;
    process.env.USAGE360_ENABLED = "true"; process.env.USAGE360_HASH_SECRET = "s";
    const origErr = console.error; console.error = () => {};
    const res = serverErrorResponse({
      route: "dogaltas/stones", action: "POST", tenantId: T1,
      cause: { message: `duplicate key ${SENTINEL}`, code: "23505" },
      usage: { guard: guard(db), req, module: "stones", failedAction: "record_created", subEntity: "stone" },
    });
    await tick();
    console.error = origErr;
    process.env.USAGE360_ENABLED = prevEnv; process.env.USAGE360_HASH_SECRET = prevSecret;
    const body = await res.json();
    const a = calls[0]?.args ?? {};
    ok(res.status === 500 && !JSON.stringify(body).includes(SENTINEL), "serverErrorResponse yanıtı değişmedi (500, güvenli mesaj)");
    ok(a.p_action === "action_failed" && a.p_error_class === "server" && a.p_failed_action === "record_created" && a.p_sub_entity === "stone", "usage bağlamı → action_failed/server/record_created/stone");
    ok(!JSON.stringify(a).includes(SENTINEL) && !JSON.stringify(a).includes("23505") && !JSON.stringify(a).includes("dogaltas/stones"), "hata mesajı / kod / route telemetriye GİRMEZ");
  }
  {
    const { db, calls } = fakeDb();
    serverErrorResponse({ route: "x", action: "POST", cause: new Error("boom") });
    await tick();
    ok(calls.length === 0, "usage bağlamı verilmeyen serverErrorResponse telemetri üretmez (davranış aynı)");
    void db;
  }
  {
    const { db, calls } = fakeDb();
    const origErr = console.error; console.error = () => {};
    serverErrorResponse({ route: "x", action: "POST", cause: "e", usage: { guard: { ...guard(db), is_demo_account: true }, req, module: "stones", failedAction: "record_created" } });
    serverErrorResponse({ route: "x", action: "POST", cause: "e", usage: { guard: { ...guard(db), profile: { role: "admin" } }, req, module: "stones", failedAction: "record_created" } });
    await tick();
    console.error = origErr;
    ok(calls.length === 0, "demo / admin hata olayı üretmez");
  }

  // ── Beacon subEntity allowlist ──────────────────────────────────────────────
  console.log("\n[beacon] report_exported / action_failed subEntity");
  ok(parseBeaconBody(JSON.stringify({ kind: "report_exported", module: "clients", subEntity: "analysis", nonce: "abcdef12" })).ok, "clients/analysis export geçerli");
  ok(parseBeaconBody(JSON.stringify({ kind: "report_exported", module: "human_design", subEntity: "report" })).ok, "human_design/report export geçerli");
  ok(!parseBeaconBody(JSON.stringify({ kind: "report_exported", module: "clients", subEntity: "report" })).ok, "modül allowlist'inde olmayan subEntity → 400");
  ok(!parseBeaconBody(JSON.stringify({ kind: "report_exported", module: "numerology", subEntity: SENTINEL })).ok, "serbest metin subEntity → 400");
  ok(!parseBeaconBody(JSON.stringify({ kind: "module_opened", module: "clients", subEntity: "client" })).ok, "module_opened subEntity taşıyamaz → 400");
  ok(parseBeaconBody(JSON.stringify({ kind: "action_failed", module: "aromatherapy", errorClass: "client_export", failedAction: "report_exported", subEntity: "blend" })).ok, "istemci export hatası + subEntity geçerli");

  // ── İstemci export beacon'ı: bayrak / kimlik / gövde ─────────────────────────
  console.log("\n[G] usageBeaconClient");
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = g;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const fetched: { url: string; body: string; headers: Record<string, string> }[] = [];
  g.fetch = async (url: string, init: { body: string; headers: Record<string, string> }) => { fetched.push({ url, body: init.body, headers: init.headers }); return { ok: true }; };
  const client = await import("../../lib/usage/usageBeaconClient");
  const { saveYasamUser, saveSessionToken } = await import("../../lib/auth/yasamUser");
  saveYasamUser({ id: U1, email: "e@x", name: "n", role: "expert", status: "active", tenant_id: T1, active: true, approval_status: "approved" } as never);
  saveSessionToken("tok-1");
  client.reportUsageExport("clients", "analysis");
  ok(fetched.length === 0, "bayrak KAPALI (varsayılan) → export beacon ağ isteği YOK");
  client.setUsageBeaconEnabled(true);
  client.reportUsageExport("clients", "analysis");
  client.reportUsageClientFailure("human_design", "client_export", "report_exported", "report");
  ok(fetched.length === 2 && fetched.every((f) => f.url === "/api/usage/beacon"), "bayrak açık → tek beacon ucu");
  const b0 = JSON.parse(fetched[0].body) as Record<string, unknown>;
  ok(b0.kind === "report_exported" && b0.module === "clients" && b0.subEntity === "analysis" && /^[a-z0-9]{8,32}$/.test(String(b0.nonce)), "export gövdesi yalnız enum + nonce");
  ok(parseBeaconBody(fetched[0].body).ok && parseBeaconBody(fetched[1].body).ok, "gönderilen gövdeler sunucu şemasından geçer");
  ok(fetched[0].headers["x-user-id"] === U1 && fetched[0].headers["x-session-token"] === "tok-1", "kimlik başlıklarla (sunucu binding doğrular)");
  saveYasamUser({ id: U1, email: "e@x", name: "n", role: "expert", status: "active", tenant_id: T1, active: true, approval_status: "approved", is_demo_account: true } as never);
  client.reportUsageExport("clients", "analysis");
  ok(fetched.length === 2, "demo kullanıcı → istemci beacon göndermez");
  client.setUsageBeaconEnabled(false);

  console.log(`\n──────────\nUSAGE360 2B MODULE LOGIC: PASS ${passed} · FAIL ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}
void run();

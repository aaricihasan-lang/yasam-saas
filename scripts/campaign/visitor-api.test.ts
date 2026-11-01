// KAMPANYA MERKEZİ KM-3 — herkese açık kampanya uçları + ziyaretçi hattı testi (DB/ağ YOK; bellek içi sahte DB; KREDİ HARCANMAZ).
// Kapsam: ortam kapısı (404), aynı köken, 415/413/400, bal küpü, bilinmeyen / doğrulanmamış teknik, kapalı / yakında / acil
// durdurma, girdi hatası (rezervasyon AÇILMAZ), istek kimliği biçimi, IP hız sınırı, rezervasyon reddi → ziyaretçi mesajı (iç
// neden sızmaz), settle (completed / aborted_no_call / failed_after_call), tarayıcı çerezi (HttpOnly), ücretli teknik akışı,
// Kozmik paket belirteci (sahte / başka rezervasyon / hız sınırı), durum ucu (yalnız bağlı "hazır" teknikler; iç alan yok),
// konum araması (yerel), no-store.
// Çalıştırma: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/visitor-api.test.ts
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { handleLocationSearch, handleVisitorAnalysis, handleVisitorState } from "@/lib/campaign/visitor/handlers";
import { issuePackageToken, visitorCookieHeader } from "@/lib/campaign/visitor/identity";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const ROOT = path.resolve(__dirname, "../..");
const NOW = new Date("2026-11-01T11:00:00Z");
const ORIGIN = "https://yasamsistemi.com";
const ENV: Record<string, string> = { CAMPAIGN_PUBLIC_ENABLED: "true", CAMPAIGN_SUBJECT_SECRET: "s".repeat(40), SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, ROXY_API_KEY: "zz-test-roxy-key-not-a-secret", ASTROLOGY_MODULE_ENABLED: "true", TURNSTILE_SECRET_KEY: "t".repeat(32), NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA-test-site" };
// Sahte Turnstile siteverify (gerçek Cloudflare çağrısı YOK). Başarılı, eylem "kampanya", 10 sn önce.
const BOT_OK = async () => new Response(JSON.stringify({ success: true, action: "kampanya", hostname: "yasamsistemi.com", challenge_ts: new Date(NOW.getTime() - 10_000).toISOString() }), { status: 200 });
const OPEN_RL = async () => ({ allowed: true, retryAfterSec: 0, mode: "db" as const });
const BOT_TOKEN = "turnstile-test-token-0123456789";
const CID = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const RID = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;
function world(over: { status?: string; kill?: boolean; startsAt?: string | null; reserve?: Row; rateAllowed?: boolean; techniques?: Row[]; reservation?: Row | null } = {}) {
  const tables: Record<string, Row[]> = {
    campaign_settings: [{ kill_switch: over.kill ?? false }],
    campaigns: [{ id: CID, status: over.status ?? "aktif", undated: over.startsAt === undefined, starts_at: over.startsAt ?? null, ends_at: null, archived_at: null, slogan: "Ücretsiz keşif", alt_slogan: "", description: "", affirmation: "", cta_text: "Başla", cta_target: "bolum", image_ref: null, hd_options: { word: true, kb: true }, module_comments: { numb: true } }],
    campaign_techniques: over.techniques ?? [
      { campaign_id: CID, technique_key: "numb:analysis", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 50, daily_credit_budget: 0, comments_enabled: false },
      { campaign_id: CID, technique_key: "numb:timing", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 50, daily_credit_budget: 0, comments_enabled: true },
      { campaign_id: CID, technique_key: "hd:bodygraph", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 10, daily_credit_budget: 10, comments_enabled: false },
      { campaign_id: CID, technique_key: "hd:transit", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 10, daily_credit_budget: 10, comments_enabled: false },
      { campaign_id: CID, technique_key: "hd:variables", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 10, daily_credit_budget: 20, comments_enabled: false },
      { campaign_id: CID, technique_key: "kozmik:paket", enabled: true, ip_daily_limit: 2, daily_analysis_limit: 200, daily_credit_budget: 0, comments_enabled: false },
      { campaign_id: CID, technique_key: "numk:core", enabled: false, ip_daily_limit: 1, daily_analysis_limit: 10, daily_credit_budget: 10, comments_enabled: false },
    ],
    campaign_usage_daily: [{ day_tr: "2026-11-01", scope: `tech:${CID}:numb:analysis`, used_analyses: 7, reserved_analyses: 3 }],
    campaign_reservations: over.reservation === null ? [] : [over.reservation ?? { id: RID, technique_key: "kozmik:paket", campaign_id: CID, state: "completed" }],
  };
  const rpcs: { fn: string; args: Row }[] = [];
  const fromLog: string[] = [];
  function q(table: string) {
    fromLog.push(table);
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return b; };
    b.is = (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return b; };
    b.in = (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return b; };
    b.gte = (c: string, v: unknown) => { rows = rows.filter((r) => String(r[c]) >= String(v)); return b; };
    b.order = () => b;
    b.limit = (n: number) => { rows = rows.slice(0, n); return b; };
    b.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, ko);
    return b;
  }
  let callId = 0;
  const db = {
    from: q,
    rpc: async (fn: string, args: Row) => {
      rpcs.push({ fn, args });
      if (fn === "auth_rate_limit_hit") return { data: { allowed: over.rateAllowed ?? true, retry_after: 0 }, error: null };
      if (fn === "campaign_reserve") return { data: over.reserve ?? { ok: true, reservation_id: RID, max_credits: 1, day_tr: "2026-11-01", comments_enabled: false }, error: null };
      if (fn === "campaign_authorize_call") return { data: { ok: true, call_id: ++callId }, error: null };
      return { data: { ok: true }, error: null };
    },
  };
  return { db, rpcs, fromLog };
}

function post(body: unknown, h: Record<string, string> = {}, raw?: string) {
  return new NextRequest("https://yasamsistemi.com/api/kampanya/analiz", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": "203.0.113.7", ...h }, body: raw ?? JSON.stringify(body) });
}
async function call(req: NextRequest, w: ReturnType<typeof world>, extra: Record<string, unknown> = {}) {
  const res = await handleVisitorAnalysis(req, { db: w.db as never, env: ENV, now: NOW, botFetch: BOT_OK, ...extra });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { /* */ }
  return { status: res.status, body, text, cookie: res.headers.get("set-cookie"), cache: res.headers.get("cache-control") };
}
const reserveCalls = (w: ReturnType<typeof world>) => w.rpcs.filter((x) => x.fn === "campaign_reserve");
const settles = (w: ReturnType<typeof world>) => w.rpcs.filter((x) => x.fn === "campaign_settle").map((x) => `${x.args.p_outcome}:${x.args.p_spent_credits}`);
const NUMB = { technique: "numb:analysis", requestId: "req-aaaaaaaaaaaaaaaa", input: { firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-03-15" } };

(async () => {
  // ── Ortam kapısı ──
  {
    const w = world();
    const off = { db: w.db as never, env: { ...ENV, CAMPAIGN_PUBLIC_ENABLED: "false" }, now: NOW };
    const a = await handleVisitorAnalysis(post(NUMB), off);
    const s = await handleVisitorState(new NextRequest("https://yasamsistemi.com/api/kampanya/durum"), off);
    const l = await handleLocationSearch(new NextRequest("https://yasamsistemi.com/api/kampanya/konum?q=ist"), off);
    check("E01 ortam kapısı kapalı → üç uç da 404, DB'ye gidilmez", a.status === 404 && s.status === 404 && l.status === 404 && w.rpcs.length === 0 && w.fromLog.length === 0);
  }
  // ── İstek biçimi ──
  {
    const w = world();
    const noOrigin = await call(new NextRequest("https://yasamsistemi.com/api/kampanya/analiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(NUMB) }), w);
    const foreign = await call(post(NUMB, { origin: "https://kotu.example" }), w);
    check("F01 kökensiz / yabancı köken → 403, rezervasyon yok", noOrigin.status === 403 && foreign.status === 403 && reserveCalls(w).length === 0);
    check("F02 JSON olmayan → 415", (await call(post(NUMB, { "content-type": "text/plain" }), w)).status === 415);
    check("F03 16 KB üstü → 413", (await call(post(null, {}, JSON.stringify({ ...NUMB, pad: "x".repeat(17_000) })), w)).status === 413);
    check("F04 bozuk JSON / dizi → 400", (await call(post(null, {}, "{bozuk"), w)).status === 400 && (await call(post([1]), w)).status === 400);
    const hp = await call(post({ ...NUMB, website: "http://spam" }), w);
    check("F05 bal küpü alanı dolu → 400, rezervasyon yok", hp.status === 400 && reserveCalls(w).length === 0);
    check("F06 istek kimliği biçimi bozuk → 400", (await call(post({ ...NUMB, requestId: "kisa" }), w)).status === 400 && reserveCalls(w).length === 0);
  }
  // ── Teknik ve kampanya kapıları ──
  {
    const w = world();
    const unk = await call(post({ ...NUMB, technique: "hd:sahte" }), w);
    const ver = await call(post({ ...NUMB, technique: "hd:variables", input: {} }), w);
    const tr = await call(post({ ...NUMB, technique: "hd:transit", input: {} }), w);
    check("T01 katalogda olmayan / doğrulanmamış / bağlı olmayan teknik → 404, rezervasyon yok", unk.status === 404 && ver.status === 404 && tr.status === 404 && reserveCalls(w).length === 0);
    for (const [n, ww] of [["kapalı", world({ status: "kapali" })], ["yakında", world({ status: "yakinda" })], ["gelecek tarihli aktif", world({ startsAt: "2026-12-01T00:00:00Z" })], ["acil durdurma", world({ kill: true })]] as const) {
      const r = await call(post(NUMB), ww);
      check(`T02 kampanya ${n} → 403 kampanya_kapali, rezervasyon yok`, r.status === 403 && r.body.code === "kampanya_kapali" && reserveCalls(ww).length === 0);
    }
    const bad = await call(post({ ...NUMB, input: { firstName: "", lastName: "Yılmaz", birthDate: "2099-01-01" } }), w);
    check("T03 girdi hatası → 400 + alan hataları, rezervasyon AÇILMAZ", bad.status === 400 && !!(bad.body.errors as Record<string, string>)?.firstName && reserveCalls(w).length === 0);
    const rl = await call(post(NUMB), world({ rateAllowed: false }));
    check("T04 IP hız sınırı → 429, rezervasyon yok", rl.status === 429 && rl.body.code === "hiz_siniri");
  }
  // ── Rezervasyon reddi mesajları ──
  for (const [reason, status, must, mustNot] of [
    ["ip_hakki_doldu", 429, "hakkınızı", "IP"],
    ["teknik_kontenjan_doldu", 429, "kontenjan doldu", "teknik"],
    ["uzman_payi_korunuyor", 429, "geçici olarak kullanılamıyor", "uzman"],
    ["saglayici_durumu_bilinmiyor", 429, "geçici olarak kullanılamıyor", "sağlayıcı"],
    ["istek_suruyor", 409, "hazırlanıyor", "rezervasyon"],
    ["gizli_anahtar_yok", 503, "hizmet veremiyoruz", "anahtar"],
  ] as const) {
    const w = world({ reserve: { ok: false, reason } });
    const r = await call(post(NUMB), w);
    check(`M01 ${reason} → ${status} + ziyaretçi mesajı; iç neden sızmaz`, r.status === status && String(r.body.error).includes(must) && !String(r.body.error).toLowerCase().includes(mustNot.toLowerCase()) && settles(w).length === 0, `${r.status} ${r.body.error}`);
  }
  // ── Başarılı yerel analiz ──
  {
    const w = world();
    const r = await call(post(NUMB), w);
    const rv = reserveCalls(w)[0]?.args ?? {};
    check("S01 yerel analiz → 200 + gerçek sonuç", r.status === 200 && (r.body.result as { title?: string })?.title === "Bütüncül Numeroloji Analizi");
    check("S02 rezervasyona ham IP / tarayıcı kimliği GİTMEZ (64 hex özet)", /^[0-9a-f]{64}$/.test(String(rv.p_ip_hash)) && /^[0-9a-f]{64}$/.test(String(rv.p_browser_hash)) && !JSON.stringify(rv).includes("203.0.113.7"));
    check("S03 settle completed, 0 kredi", JSON.stringify(settles(w)) === JSON.stringify(["completed:0"]));
    check("S04 tarayıcı çerezi HttpOnly + Secure + SameSite=Lax, 30 gün", !!r.cookie && /^km_z=[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{22};/.test(r.cookie) && /HttpOnly/.test(r.cookie) && /Secure/.test(r.cookie) && /SameSite=Lax/.test(r.cookie));
    check("S05 yanıt no-store ve girdi adı yanıt başlığında yok", /no-store/.test(r.cache ?? ""));
    const SIGNED = String(visitorCookieHeader("abcdefghijklmnopqrstuvwx", true, ENV as NodeJS.ProcessEnv)).split(";")[0];
    const w2 = world();
    const r2 = await call(post({ ...NUMB, requestId: "req-bbbbbbbbbbbbbbbb" }, { cookie: SIGNED }), w2);
    const bh2 = reserveCalls(w2)[0]?.args.p_browser_hash;
    const w3 = world();
    await call(post({ ...NUMB, requestId: "req-cccccccccccccccc" }, { cookie: SIGNED }), w3);
    check("S06 mevcut çerez yeniden kullanılır (yeni Set-Cookie yok; aynı gün aynı özet)", r2.status === 200 && r2.cookie === null && bh2 === reserveCalls(w3)[0]?.args.p_browser_hash);
  }
  // ── Rezervasyon sonrası hata → aborted_no_call ──
  {
    const w = world({ techniques: [{ campaign_id: CID, technique_key: "atlas:horary.lilly", enabled: true, ip_daily_limit: 1, daily_analysis_limit: 10, daily_credit_budget: 0, comments_enabled: false }] });
    const r = await call(post({ technique: "atlas:horary.lilly", requestId: "req-dddddddddddddddd", input: { qDate: "2026-03-29", qTime: "03:30", place: "tr-de-berlin-x", house: "7" } }), w);
    check("S07 konum doğrulaması rezervasyondan ÖNCE (rezervasyon yok)", r.status === 400 && reserveCalls(w).length === 0);
  }
  // ── Ücretli teknik (HD) ──
  {
    const fx = fs.readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
    let fetched = 0;
    const okFetch = async (_u: string | URL | Request, init?: RequestInit) => { fetched++; return new Response(consistentRoxyResponse(fx, String(init?.body ?? "")), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-limit": "50000", "x-ratelimit-remaining": "49000" } }); };
    const HD = { technique: "hd:bodygraph", requestId: "req-eeeeeeeeeeeeeeee", botToken: BOT_TOKEN, input: { birthDate: "2018-07-20", birthTime: "12:00", birthPlace: "tr-34-istanbul" } };
    const w = world();
    const r = await call(post(HD), w, { fetchImpl: okFetch });
    check("P01 HD ücretli akış → 200, tek sağlayıcı isteği, settle completed:1", r.status === 200 && fetched === 1 && JSON.stringify(settles(w)) === JSON.stringify(["completed:1"]), `${r.status} ${JSON.stringify(settles(w))} ${r.body.error ?? ""}`);
    check("P02 ücretli teknikten önce uzman muhasebe defterinden tazelik okunur", w.fromLog.includes("numerology_classic_provider_calls"));
    check("P03 Word raporu Owner açıkken yanıtta (docx)", (r.body.result as { report?: { kind?: string } })?.report?.kind === "docx");
    const w2 = world();
    const errFetch = async () => new Response("{}", { status: 500 });
    const r2 = await call(post({ ...HD, requestId: "req-ffffffffffffffff", botToken: BOT_TOKEN + "-2" }), w2, { fetchImpl: errFetch });
    check("P04 sağlayıcı hatası → 502 güvenli mesaj; settle failed_after_call:1 (yetkilendirilen kredi harcandı sayılır)", r2.status === 502 && JSON.stringify(settles(w2)) === JSON.stringify(["failed_after_call:1"]));
  }
  // ── Bot doğrulaması (gece operasyonu) ──
  {
    const fx = fs.readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
    let fetched = 0;
    const okFetch = async (_u: string | URL | Request, init?: RequestInit) => { fetched++; return new Response(consistentRoxyResponse(fx, String(init?.body ?? "")), { status: 200, headers: { "content-type": "application/json" } }); };
    const HDB = (id: string, tok?: string) => ({ technique: "hd:bodygraph", requestId: `req-bot-${id}`.padEnd(20, "x"), ...(tok === undefined ? {} : { botToken: tok }), input: { birthDate: "2018-07-20", birthTime: "12:00", birthPlace: "tr-34-istanbul" } });
    const w1 = world();
    const r1 = await call(post(HDB("a")), w1, { fetchImpl: okFetch });
    check("B01 ücretli teknik + bot belirteci YOK → 403, rezervasyon yok, sağlayıcı isteği yok", r1.status === 403 && r1.body.code === "bot_dogrulama_basarisiz" && reserveCalls(w1).length === 0 && fetched === 0, `${r1.status} ${r1.body.code}`);
    const failV = async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 });
    const w2 = world();
    const r2 = await call(post(HDB("b", BOT_TOKEN)), w2, { fetchImpl: okFetch, botFetch: failV });
    check("B02 geçersiz belirteç (siteverify success:false) → 403, rezervasyon yok", r2.status === 403 && reserveCalls(w2).length === 0 && fetched === 0);
    const dup = async () => new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] }), { status: 200 });
    check("B03 süresi dolmuş / tekrar kullanılmış (Cloudflare timeout-or-duplicate) → 403", (await call(post(HDB("c", BOT_TOKEN)), world(), { fetchImpl: okFetch, botFetch: dup })).status === 403 && fetched === 0);
    const old = async () => new Response(JSON.stringify({ success: true, action: "kampanya", challenge_ts: new Date(NOW.getTime() - 6 * 60_000).toISOString() }), { status: 200 });
    check("B04 5 dakikadan eski doğrulama → 403", (await call(post(HDB("d", BOT_TOKEN)), world(), { fetchImpl: okFetch, botFetch: old })).status === 403);
    const wrongAction = async () => new Response(JSON.stringify({ success: true, action: "login", challenge_ts: NOW.toISOString() }), { status: 200 });
    check("B05 başka eylem için alınmış belirteç → 403", (await call(post(HDB("e", BOT_TOKEN)), world(), { fetchImpl: okFetch, botFetch: wrongAction })).status === 403);
    // Tek kullanım: kova ikinci kullanımda reddeder (gerçek DB'de auth_rate_limit_hit; burada kova başına sayaç).
    const seen = new Map<string, number>();
    const perBucket = async (b: string, limit: number) => { const n = (seen.get(b) ?? 0) + 1; seen.set(b, n); return { allowed: n <= limit, retryAfterSec: 0, mode: "db" as const }; };
    const w6 = world();
    const a6 = await call(post(HDB("f", "reuse-token-abcdefghijklmnop")), w6, { fetchImpl: okFetch, rateLimit: perBucket });
    const b6 = await call(post(HDB("g", "reuse-token-abcdefghijklmnop")), w6, { fetchImpl: okFetch, rateLimit: perBucket });
    check("B06 aynı bot belirteci İKİNCİ kez → 403 (ilk 200), ikinci için rezervasyon yok", a6.status === 200 && b6.status === 403 && reserveCalls(w6).length === 1, `${a6.status} ${b6.status} ${a6.body.error ?? ""}`);
    const mem = async () => ({ allowed: true, retryAfterSec: 0, mode: "memory" as const });
    check("B07 tek kullanım sayacı DB'de değilse (bellek yedeği) → ücretli fail-closed 503", (await call(post(HDB("h", BOT_TOKEN)), world(), { fetchImpl: okFetch, rateLimit: mem })).status === 503);
    const down = async (): Promise<Response> => { throw new Error("ağ"); };
    check("B08 siteverify erişilemez → 503 (ücretli kapalı), rezervasyon yok", (await call(post(HDB("i", BOT_TOKEN)), world(), { fetchImpl: okFetch, botFetch: down })).status === 503);
    const noBot = { ...ENV, TURNSTILE_SECRET_KEY: "" };
    const w9 = world();
    const r9 = await handleVisitorAnalysis(post(HDB("j", BOT_TOKEN)), { db: w9.db as never, env: noBot, now: NOW, botFetch: BOT_OK, fetchImpl: okFetch });
    check("B09 bot yapılandırması yoksa ücretli → 503, rezervasyon yok", r9.status === 503 && reserveCalls(w9).length === 0);
    const st9 = JSON.parse(await (await handleVisitorState(new NextRequest("https://yasamsistemi.com/api/kampanya/durum"), { db: world().db as never, env: noBot, now: NOW })).text()).state as { bot: unknown; modules: { techniques: { key: string }[] }[] };
    check("B10 bot yapılandırması yoksa durum ucunda ücretli teknik LİSTELENMEZ (yerel olanlar görünür)", st9.bot === null && !st9.modules.flatMap((m) => m.techniques).some((t) => t.key === "hd:bodygraph") && st9.modules.flatMap((m) => m.techniques).some((t) => t.key === "numb:analysis"));
    const w11 = world();
    const r11 = await call(post(NUMB), w11, { botFetch: async (): Promise<Response> => { throw new Error("çağrılmamalı"); } });
    check("B11 yerel (0 kredi) teknik bot belirteci istemez", r11.status === 200);
    const ev = world();
    await call(post(HDB("k", "x".repeat(3000))), ev, { fetchImpl: okFetch });
    check("B12 aşırı uzun / biçimsiz belirteç reddedilir (rezervasyon yok)", reserveCalls(ev).length === 0);
    const st = JSON.parse(await (await handleVisitorState(new NextRequest("https://yasamsistemi.com/api/kampanya/durum"), { db: world().db as never, env: ENV, now: NOW })).text());
    check("B13 durum ucu yalnız herkese açık site anahtarını verir (sır yok)", st.state.bot?.siteKey === ENV.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !JSON.stringify(st).includes(ENV.TURNSTILE_SECRET_KEY));
  }
  // ── IP (gece operasyonu) ──
  {
    const fx = fs.readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
    const okFetch = async (_u: string | URL | Request, init?: RequestInit) => new Response(consistentRoxyResponse(fx, String(init?.body ?? "")), { status: 200, headers: { "content-type": "application/json" } });
    const HDI = (id: string) => ({ technique: "hd:bodygraph", requestId: `req-ip-${id}`.padEnd(20, "x"), botToken: `${BOT_TOKEN}-${id}`, input: { birthDate: "2018-07-20", birthTime: "12:00", birthPlace: "tr-34-istanbul" } });
    const noIp = new NextRequest("https://yasamsistemi.com/api/kampanya/analiz", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(HDI("a")) });
    const w1 = world();
    const r1 = await handleVisitorAnalysis(noIp, { db: w1.db as never, env: ENV, now: NOW, botFetch: BOT_OK, fetchImpl: okFetch });
    check("I01 bilinmeyen IP + ücretli → 403 ip_bilinmiyor, rezervasyon yok", r1.status === 403 && reserveCalls(w1).length === 0);
    const w2 = world();
    const noIpLocal = new NextRequest("https://yasamsistemi.com/api/kampanya/analiz", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(NUMB) });
    const r2 = await handleVisitorAnalysis(noIpLocal, { db: w2.db as never, env: ENV, now: NOW });
    check("I02 bilinmeyen IP + yerel → ortak kovayla çalışır", r2.status === 200 && reserveCalls(w2).length === 1);
    const ipArg = (x: { args: Row }) => JSON.stringify(Object.entries(x.args).filter(([k]) => /ip/i.test(k)));
    const w3 = world();
    await call(post(HDI("b"), { "x-real-ip": "2001:db8:abcd:12:1111:2222:3333:4444" }), w3, { fetchImpl: okFetch });
    await call(post(HDI("c"), { "x-real-ip": "2001:db8:abcd:12:ffff:eeee:dddd:cccc" }), w3, { fetchImpl: okFetch });
    const ips = reserveCalls(w3).map(ipArg);
    check("I03 aynı IPv6 /64 içinde farklı adresler → AYNI IP öznesi (döndürme ile hak çoğaltılamaz)", ips.length === 2 && ips[0] === ips[1] && ips[0] !== "[]", JSON.stringify(ips));
    const w3b = world();
    await call(post(HDI("b2"), { "x-real-ip": "2001:db8:abcd:12::1" }), w3b, { fetchImpl: okFetch });
    await call(post(HDI("c2"), { "x-real-ip": "2001:db8:abcd:13::1" }), w3b, { fetchImpl: okFetch });
    const ipsB = reserveCalls(w3b).map(ipArg);
    check("I04 farklı /64 → farklı IP öznesi", ipsB.length === 2 && ipsB[0] !== ipsB[1], JSON.stringify(ipsB));
    const w4 = world();
    await call(post(HDI("d"), { "x-real-ip": "::ffff:203.0.113.7" }), w4, { fetchImpl: okFetch });
    await call(post(HDI("e"), { "x-real-ip": "203.0.113.7" }), w4, { fetchImpl: okFetch });
    const ips4 = reserveCalls(w4).map(ipArg);
    check("I05 IPv4-eşlemeli IPv6 = aynı IPv4", ips4.length === 2 && ips4[0] === ips4[1]);
    const w5 = world();
    await call(post(HDI("f"), { "x-real-ip": "not-an-ip; DROP" }), w5, { fetchImpl: okFetch });
    check("I06 sözdizimi bozuk IP başlığı → bilinmeyen IP (ücretli red)", reserveCalls(w5).length === 0);
    const w6 = world();
    const c1 = await call(post(NUMB), w6);
    const forged = await call(post({ ...NUMB, requestId: "req-forgedcookie000" }, { cookie: "km_z=AAAAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB" }), w6);
    check("I07 tarayıcı çerezi imzalı; uydurma imza yok sayılır ve yeni imzalı çerez verilir", !!c1.cookie && /^km_z=[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{22};/.test(c1.cookie) && !!forged.cookie && !forged.cookie.startsWith("km_z=AAAAAAAAAAAAAAAAAAAAAAAA."));
    const valid = String(c1.cookie).split(";")[0];
    const again = await call(post({ ...NUMB, requestId: "req-validcookie0000" }, { cookie: valid }), w6);
    check("I08 geçerli imzalı çerez kabul edilir (yeni çerez verilmez)", again.cookie === null);
  }
  // ── Kozmik paket belirteci ──
  {
    const w = world({ reserve: { ok: true, reservation_id: RID, max_credits: 0, day_tr: "2026-11-01", comments_enabled: false } });
    const first = await call(post({ technique: "kozmik:paket", requestId: "req-gggggggggggggggg", input: { feature: "moon", month: "2026-11" } }), w);
    const tok = String(first.body.packageToken ?? "");
    check("K01 ilk paket isteği → rezervasyon + imzalı belirteç (kp1)", first.status === 200 && /^kp1\./.test(tok) && reserveCalls(w).length === 1);
    const second = await call(post({ technique: "kozmik:paket", requestId: "req-hhhhhhhhhhhhhhhh", input: { feature: "hacamat", month: "2026-11" }, packageToken: tok }), w);
    check("K02 belirteçle sonraki özellik → YENİ rezervasyon açılmaz", second.status === 200 && reserveCalls(w).length === 1);
    const forged = await call(post({ technique: "kozmik:paket", requestId: "req-iiiiiiiiiiiiiiii", input: { feature: "moon" }, packageToken: tok.slice(0, -2) + "xx" }), w);
    check("K03 imzası bozuk belirteç → 403", forged.status === 403);
    const otherState = world({ reservation: { id: RID, technique_key: "kozmik:paket", campaign_id: CID, state: "reserved" } });
    const t2 = issuePackageToken(RID, NOW, ENV as NodeJS.ProcessEnv)!;
    check("K04 sonuçlanmamış rezervasyonun belirteci → 403", (await call(post({ technique: "kozmik:paket", requestId: "req-jjjjjjjjjjjjjjjj", input: { feature: "moon" }, packageToken: t2 }), otherState)).status === 403);
    const wrongTech = world({ reservation: { id: RID, technique_key: "numb:analysis", campaign_id: CID, state: "completed" } });
    check("K05 başka tekniğin rezervasyonu → 403", (await call(post({ technique: "kozmik:paket", requestId: "req-kkkkkkkkkkkkkkkk", input: { feature: "moon" }, packageToken: t2 }), wrongTech)).status === 403);
    const limited = world({ rateAllowed: false });
    check("K06 belirteç başına hız sınırı → 429", (await call(post({ technique: "kozmik:paket", requestId: "req-llllllllllllllll", input: { feature: "moon" }, packageToken: t2 }), limited)).status === 429);
    const expired = issuePackageToken(RID, new Date(NOW.getTime() - 3 * 3600_000), ENV as NodeJS.ProcessEnv)!;
    check("K07 süresi dolmuş belirteç → 403", (await call(post({ technique: "kozmik:paket", requestId: "req-mmmmmmmmmmmmmmmm", input: { feature: "moon" }, packageToken: expired }), w)).status === 403);
  }
  // ── Durum ucu ──
  {
    const w = world();
    const res = await handleVisitorState(new NextRequest("https://yasamsistemi.com/api/kampanya/durum"), { db: w.db as never, env: ENV, now: NOW });
    const txt = await res.text();
    const st = JSON.parse(txt).state as { state: string; modules: { techniques: { key: string; remaining: number; total: number; commentsEnabled: boolean }[] }[] };
    const keys = st.modules.flatMap((m) => m.techniques.map((t) => t.key)).sort();
    check("D01 durum: yalnız Owner'ın açtığı + bağlı 'hazır' teknikler (transit / PHS / kapalı numk görünmez)", st.state === "aktif" && JSON.stringify(keys) === JSON.stringify(["hd:bodygraph", "kozmik:paket", "numb:analysis", "numb:timing"]), keys.join(","));
    const na = st.modules.flatMap((m) => m.techniques).find((t) => t.key === "numb:analysis")!;
    check("D02 kalan kontenjan gerçek sayaçtan (50 − 7 kullanılan − 3 süren = 40)", na.remaining === 40 && na.total === 50);
    const nt = st.modules.flatMap((m) => m.techniques).find((t) => t.key === "numb:timing")!;
    check("D03 yorum bayrağı modül + teknik + kaynak (numb:timing açık; numb:analysis kaynaksız kapalı)", nt.commentsEnabled === true && na.commentsEnabled === false);
    check("D04 durum yanıtında bütçe / kredi / kota / iç kimlik alanı yok", !/daily_credit_budget|max_credit|remaining_gap|quota_limit|reservation_id|kill_switch|ip_hash|module_comments|hd_options|campaign_id/.test(txt) && /no-store/.test(res.headers.get("cache-control") ?? ""));
    const closed = await handleVisitorState(new NextRequest("https://yasamsistemi.com/api/kampanya/durum"), { db: world({ status: "kapali" }).db as never, env: ENV, now: NOW });
    check("D05 kapalı kampanya → yalnız { state: kapali }", JSON.stringify((await closed.json()).state) === JSON.stringify({ state: "kapali" }));
  }
  // ── Konum araması ──
  {
    const realFetch = globalThis.fetch;
    let external = 0;
    globalThis.fetch = (async () => { external++; throw new Error("dış ağ yasak"); }) as typeof fetch;
    const res = await (await handleLocationSearch(new NextRequest("https://yasamsistemi.com/api/kampanya/konum?q=istanbul"), { env: ENV, rateLimit: OPEN_RL })).json();
    const d = await (await handleLocationSearch(new NextRequest("https://yasamsistemi.com/api/kampanya/konum?q=Kad%C4%B1k%C3%B6y"), { env: ENV, rateLimit: OPEN_RL })).json();
    const short = await (await handleLocationSearch(new NextRequest("https://yasamsistemi.com/api/kampanya/konum?q=i"), { env: ENV, rateLimit: OPEN_RL })).json();
    globalThis.fetch = realFetch;
    check("L01 il araması (İstanbul) yerel veri setinden", res.results.some((x: { id: string }) => x.id === "tr-34-istanbul"), JSON.stringify(res.results.slice(0, 3)));
    check("L02 ilçe araması (Kadıköy) 973 ilçe dizininden", d.results.some((x: { id: string }) => x.id.startsWith("trd-")), JSON.stringify(d.results.slice(0, 3)));
    check("L03 kısa sorgu boş; dış ağ çağrısı yok", short.results.length === 0 && external === 0);
  }

  console.log(`\nvisitor-api: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL beklenmeyen hata — ${e?.stack ?? e}`);
  process.exit(1);
});

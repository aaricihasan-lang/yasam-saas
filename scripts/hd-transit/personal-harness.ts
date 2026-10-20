/**
 * HD KİŞİSEL TRANSİT — servis + route testi (gerçek route handler + izole Postgres; Roxy SAHTE, ücretli çağrı YOK).
 *   Geçerli / geçersiz natal · natal-transit ayrımı · kişisel / eğitici kanal · tenant izolasyonu · Roxy hata ve
 *   zaman aşımı · tutarsız yanıt reddi · tekrar isteklerde önbellek · eşzamanlılık kilidi · ortak kota ·
 *   eski bireysel analizin korunması · DB'ye yazılmaması.
 * Çalıştır: npx tsx scripts/hd-transit/personal-harness.ts   (HD_TR_PG_PORT, varsayılan 54472)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkUser, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { engineChart, PEOPLE, type Moment } from "../hd-relations/fakeRelationRoxy";
import { fakePlanetsResponse, fakeSkyLongitudes, fakeTransitResponse } from "./fakeRoxyTransit";
import { resolveGeneralTransit, __resetTransitResolverCache } from "../../lib/human-design/transit/resolveTransit";
import { longitudeToGateLine } from "../../lib/human-design/engine/mandala";
import type { PlanetName } from "../../lib/human-design/engine/types";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { expectedOverlay } from "../../lib/human-design/transit/personalTransit";
import { __resetPersonalTransitCache, computePersonalTransit } from "../../lib/human-design/transit/personalTransitService";
import { resolveTransitMoment } from "../../lib/human-design/transit/transitMoment";
import { __resetRateLimitForTest } from "../../lib/security/rateLimit";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

const TA = "0e1e1e1e-0000-4000-8000-00000000000a";
const TB = "0e1e1e1e-0000-4000-8000-00000000000b";
const cid = (n: number) => `eeeeeeee-1111-4000-8000-0000000c00${String(n).padStart(2, "0")}`;
const hid = (n: number) => `eeeeeeee-1111-4000-8000-0000000d00${String(n).padStart(2, "0")}`;
const HD_DDL = `
create table public.human_design_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text not null,
  birth_date date, birth_time text, birth_place text, chart_image_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.human_design_charts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null, client_name text,
  birth_date date, birth_time text, birth_place text, source text default 'manual', input jsonb, computed_result jsonb,
  provider text, provider_raw jsonb, input_hash text, timezone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.tenants(id, name) values ('${TA}', 'ZZ_TR_A'), ('${TB}', 'ZZ_TR_B');
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role;
`;

type Mode = "tamper-boundary" | "ok" | "timeout" | "network" | "429" | "500" | "401" | "400" | "malformed" | "schema" | "tamper-gate" | "tamper-channel" | "tamper-center" | "slow";

async function main() {
  const roxy = { calls: 0, external: [] as string[], keyLeak: false, mode: "ok" as Mode, lastBody: null as null | Json, planetsCalls: 0, planetsMode: "ok" as "ok" | "500" | "offband", override: null as null | Partial<Record<PlanetName, number>> };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    const json0 = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (/roxyapi\.com\/api\/v2\/astrology\/planets\?lang=en$/.test(u)) {
      roxy.planetsCalls++;
      const pb = JSON.parse(String(init?.body ?? "{}")) as { date: string; time: string; timezone: number; nodeType: string };
      if (pb.timezone !== 0 || pb.nodeType !== "true") return json0({ error: "bad" }, 400);
      if (roxy.planetsMode === "500") return json0({ error: "x" }, 500);
      const utcIso = `${pb.date}T${pb.time}Z`;
      const over: Partial<Record<PlanetName, number>> = { ...(roxy.override ?? {}) };
      if (roxy.planetsMode === "offband") over.Sun = (fakeSkyLongitudes(utcIso, over).Sun + 0.2) % 360;
      return json0(fakePlanetsResponse(utcIso, over));
    }
    if (!/roxyapi\.com\/api\/v2\/human-design\/transit\?lang=tr$/.test(u)) { roxy.external.push(u); throw new Error(`harness: dış ağ yasak ${u}`); }
    roxy.calls++;
    if (new Headers(init?.headers).get("x-api-key") !== "zz-harness-fake-roxy-key") roxy.keyLeak = true;
    const body = JSON.parse(String(init?.body ?? "{}")) as { birthData: Moment; date: string; time: string };
    roxy.lastBody = body as unknown as Json;
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    switch (roxy.mode) {
      case "timeout": { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      case "network": throw new TypeError("fetch failed");
      case "429": return json({ error: "x" }, 429);
      case "500": return json({ error: "x" }, 500);
      case "401": return json({ error: "x" }, 401);
      case "400": return json({ error: "x" }, 400);
      case "malformed": return new Response("<html>", { status: 200, headers: { "content-type": "application/json" } });
      case "schema": { const r = fakeTransitResponse(body.birthData, body.date, body.time); return json({ ...r, activations: r.activations.slice(0, 12) }); }
      case "tamper-gate": return json(fakeTransitResponse(body.birthData, body.date, body.time, { tamper: "gate" }));
      case "tamper-channel": return json(fakeTransitResponse(body.birthData, body.date, body.time, { tamper: "channel" }));
      case "tamper-center": return json(fakeTransitResponse(body.birthData, body.date, body.time, { tamper: "center" }));
      case "tamper-boundary": return json(fakeTransitResponse(body.birthData, body.date, body.time, { tamper: "boundary" }));
      case "slow": await new Promise((r) => setTimeout(r, 2500)); return json(fakeTransitResponse(body.birthData, body.date, body.time));
      default: return json(fakeTransitResponse(body.birthData, body.date, body.time, roxy.override ? { sky: fakeSkyLongitudes(`${body.date}T${body.time}Z`, roxy.override) } : {}));
    }
  }) as typeof fetch;
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  delete process.env.ROXY_API_BASE_URL;

  const env: TestEnv = await startAnamnezTestEnv({ port: Number(process.env.HD_TR_PG_PORT ?? 54472), dirName: "hd-transit-personal-pgdata", extraSql: [HD_DDL] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    // Tohum: TA'da 0,1,2 geçerli; 3 manuel; 4 doğum değişmiş; 5 mean node; 6 eksik sonuç. TB'de 7.
    const NAMES = ["Ayşe Yılmaz", "Mehmet Kaya", "Zeynep Demir", "Manuel Kişi", "Değişen Doğum", "Ortalama Düğüm", "Eksik Analiz", "Başka Tenant"];
    for (let i = 0; i < 8; i++) {
      const m = PEOPLE[i % PEOPLE.length];
      const tenant = i === 7 ? TB : TA;
      const birthDate = i === 4 ? "1977-01-01" : m.date;
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [cid(i), tenant, NAMES[i], birthDate, m.time.slice(0, 5)]);
      const source = i === 3 ? "manual" : "computed";
      const nodeType = i === 5 ? "mean" : "true";
      const computed = i === 6 ? { activations: [] } : engineChart(m);
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [hid(i), tenant, cid(i), NAMES[i], source, source === "computed" ? "roxyapi" : null, JSON.stringify({ date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType, lang: "tr" }), `ih-${i}`, JSON.stringify(computed)],
      );
    }
    const PA = { human_design: true };
    const UA: Auth = await mkUser(su, "TRPA", TA, PA);
    const UB: Auth = await mkUser(su, "TRPB", TB, PA);
    const DEMO: Auth = await mkUser(su, "TRPD", TA, PA);
    await su.query(`update public.users set is_demo_account=true where id=$1`, [DEMO.id]);
    const NOHD: Auth = await mkUser(su, "TRPN", TA, { clients: true });
    const route = await import("../../app/api/hd/transit/personal/route");
    const post = async (a: Auth | null, body: unknown) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (a) { headers["x-user-id"] = a.id!; headers["x-session-token"] = a.token!; }
      const res = await route.POST(new NextRequest("http://localhost/api/hd/transit/personal", { method: "POST", headers, body: JSON.stringify(body) }));
      return { status: res.status, j: (await res.json()) as Json };
    };
    const B = (n: number, date = "2026-10-19", time = "09:00") => ({ client_id: cid(n), chart_id: hid(n), date, time });
    const chartSnap = async () => (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from public.human_design_charts c`)).rows[0].h as string;
    const clientSnap = async () => (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from public.human_design_clients c`)).rows[0].h as string;
    const charts0 = await chartSnap();
    const clients0 = await clientSnap();

    section("1. Geçerli kişisel transit");
    const r1 = await post(UA, B(0));
    const v = (r1.j.view ?? {}) as Json;
    ok(r1.status === 200 && r1.j.reused === false && roxy.calls === 1 && !roxy.keyLeak, "1a 200, yeni hesap, tek sahte çağrı, anahtar yalnız başlıkta", { status: r1.status, j: r1.j, calls: roxy.calls });
    const lb = roxy.lastBody as { birthData: Json; date: string; time: string };
    ok(lb && lb.date === "2026-10-19" && lb.time === "06:00:00" && lb.birthData.date === PEOPLE[0].date && lb.birthData.nodeType === "true" && lb.birthData.timezone === PEOPLE[0].timezone, "1b Roxy'ye natal doğum anı (kayıtlı analizden, IANA + true node) + UTC transit anı (09:00 TR → 06:00Z)", lb);
    const natalGates = [...new Set(engineChart(PEOPLE[0]).activations.map((a: { gate: number }) => a.gate))].sort((x, y) => x - y);
    const local = computeGeneralTransit(new Date("2026-10-19T06:00:00Z"));
    const exp = expectedOverlay(natalGates, local.activeGates);
    const natal = v.natal as Json;
    const transit = v.transit as Json;
    ok(JSON.stringify(natal.gates) === JSON.stringify(natalGates) && JSON.stringify(transit.gates) === JSON.stringify(local.activeGates), "1c natal kapılar (kayıtlı analiz) ve transit kapıları (13 aktivasyon) AYRI");
    ok(JSON.stringify((v.personal as Json[]).map((c) => c.id)) === JSON.stringify(exp.personal.map((c) => c.id)) && JSON.stringify((v.educational as Json[]).map((c) => c.id)) === JSON.stringify(exp.educational.map((c) => c.id)), `1d kişisel (${exp.personal.length}) ve iki kapısı transit (${exp.educational.length}) kanallar ayrı sınıflandı`);
    ok(JSON.stringify(natal.channels) === JSON.stringify(exp.natalChannels.map((c) => c.id)) && (v.personal as Json[]).every((c) => !(natal.channels as string[]).includes(c.id as string)), "1e natalde zaten tanımlı kanallar korunur; transit listesine karışmaz");
    ok(JSON.stringify(v.temporaryCenters) === JSON.stringify(exp.temporaryCenters) && (v.temporaryCenters as string[]).every((c) => !(natal.centers as string[]).includes(c)), "1f geçici tanımlanan merkezler yalnız natalde açık merkezler");
    ok((v.personal as Json[]).every((c) => (c.natalGates as number[]).length === 1 && (c.transitGates as number[]).length === 1) && (v.educational as Json[]).every((c) => (c.natalGates as number[]).length === 0 && (c.transitGates as number[]).length === 2), "1g kişisel = 1 natal + 1 transit kapı; eğitici = 2 transit kapı");
    ok(typeof v.providerSummary === "string" && Array.isArray(v.nearBoundaryBodies), "1h sağlayıcı özeti ayrı alan (yorum değil)");

    section("2. Tekrar istek / önbellek / kilit");
    const r2 = await post(UA, B(0));
    ok(r2.status === 200 && r2.j.reused === true && roxy.calls === 1 && JSON.stringify(r2.j.view) === JSON.stringify(r1.j.view), "2a aynı danışan + aynı an → önbellek, ücretli çağrı YOK");
    const r3 = await post(UA, B(0, "2026-10-19", "09:01"));
    ok(r3.status === 200 && r3.j.reused === false && roxy.calls === 2, "2b farklı dakika → yeni hesap");
    roxy.mode = "slow";
    const [p1, p2] = await Promise.all([post(UA, B(1, "2026-10-20", "12:00")), post(UA, B(1, "2026-10-20", "12:00"))]);
    ok(roxy.calls === 3 && [p1, p2].filter((p) => p.status === 200).length === 2 && [p1, p2].some((p) => p.j.reused === true), "2c eşzamanlı aynı istek → tek ücretli çağrı; ikincisi önbellekten", { s: [p1.status, p2.status], reused: [p1.j.reused, p2.j.reused], calls: roxy.calls });
    roxy.mode = "ok";

    section("3. Geçersiz natal — çağrı YOK");
    const before3 = roxy.calls;
    const m3 = await post(UA, B(3));
    const m4 = await post(UA, B(4));
    const m5 = await post(UA, B(5));
    const m6 = await post(UA, B(6));
    const mx = await post(UA, { client_id: cid(0), chart_id: hid(1), date: "2026-10-19", time: "09:00" });
    ok(m3.status === 422 && m3.j.code === "CHART_NOT_ELIGIBLE", "3a manuel analiz → 422 CHART_NOT_ELIGIBLE");
    ok(m4.status === 409 && m4.j.code === "BIRTH_DATA_CHANGED", "3b doğum bilgisi analizden sonra değişmiş → 409 (eski veriden SESSİZCE hesap yok)");
    ok(m5.status === 422 && m5.j.code === "CHART_POLICY_MISMATCH", "3c farklı ay düğümü ayarı → 422");
    ok(m6.status === 422 && m6.j.code === "CHART_INCOMPLETE", "3d eksik analiz → 422");
    ok(mx.status === 404 && mx.j.code === "CHART_NOT_FOUND", "3e başka danışanın analizi → 404");
    ok(roxy.calls === before3, "3f geçersiz natalde ücretli çağrı yapılmadı");

    section("4. Yetki / tenant izolasyonu");
    const before4 = roxy.calls;
    ok((await post(null, B(0))).status === 401, "4a oturumsuz 401");
    ok((await post(NOHD, B(0))).status === 403, "4b Human Design izni yok 403");
    const d = await post(DEMO, B(0, "2026-10-21", "10:00"));
    ok(d.status === 403 && d.j.code === "DEMO_READONLY", "4c demo hesabı 403");
    const x1 = await post(UB, B(0));
    const x2 = await post(UA, B(7));
    ok(x1.status === 404 && x1.j.code === "CLIENT_NOT_FOUND" && x2.status === 404, "4d başka tenant'ın danışanı / analizi → 404 (varlık sızmaz; önbellekteki sonuç da dönmez)");
    ok(roxy.calls === before4, "4e yetkisiz / başka tenant isteklerinde ücretli çağrı YOK");

    section("5. Girdi doğrulama");
    ok((await post(UA, { client_id: "x", chart_id: hid(0), date: "2026-10-19", time: "09:00" })).status === 400, "5a geçersiz kimlik 400");
    ok((await post(UA, B(0, "2011-03-28", "03:30"))).j.code === "LOCAL_TIME_GAP" && (await post(UA, B(0, "2026-02-30", "09:00"))).status === 400, "5b yaz saati boşluğu / geçersiz tarih 400");

    section("6. Sağlayıcı hataları — sonuç gösterilmez / önbelleğe girmez");
    const errs: Array<[Mode, number, string]> = [
      ["timeout", 504, "PROVIDER_TIMEOUT"], ["network", 502, "PROVIDER_UNAVAILABLE"], ["429", 503, "PROVIDER_BUSY"], ["500", 502, "PROVIDER_UNAVAILABLE"],
      ["401", 502, "PROVIDER_CONFIG"], ["400", 422, "PROVIDER_REJECTED"], ["malformed", 502, "PROVIDER_INVALID_RESPONSE"], ["schema", 502, "PROVIDER_INVALID_RESPONSE"],
      ["tamper-gate", 502, "PROVIDER_INCONSISTENT"], ["tamper-channel", 502, "PROVIDER_INCONSISTENT"], ["tamper-center", 502, "PROVIDER_INCONSISTENT"],
    ];
    let minute = 10;
    for (const [mode, status, code] of errs) {
      __resetRateLimitForTest(); // test ortamında kota bellek sayacıdır; her senaryo kendi kotasıyla başlar
      roxy.mode = mode;
      const t = `11:${String(minute++).padStart(2, "0")}`;
      const r = await post(UA, B(2, "2026-10-22", t));
      roxy.mode = "ok";
      const again = await post(UA, B(2, "2026-10-22", t));
      ok(r.status === status && r.j.code === code && !r.j.view && again.status === 200 && again.j.reused === false, `6 ${mode} → ${status} ${code}; hata önbelleğe girmez (sonraki istek yeniden hesaplar)`, { status: r.status, code: r.j.code, again: again.status, reused: again.j.reused });
    }
    // Owner kuralı: sınıra yakın konumdaki fark da KABUL EDİLMEZ (Güneş 2026-10-19 18:07:56.75Z kapı sınırı; 18:07:00Z ≈ 2″ önce)
    __resetRateLimitForTest();
    const bLocal = computeGeneralTransit(new Date("2026-10-19T18:07:00Z"));
    roxy.mode = "tamper-boundary";
    const bd = await post(UA, B(2, "2026-10-19", "21:07"));
    roxy.mode = "ok";
    const bdAgain = await post(UA, B(2, "2026-10-19", "21:07"));
    ok(bLocal.activations.some((a) => a.nearBoundary) && bd.status === 502 && bd.j.code === "PROVIDER_INCONSISTENT" && !bd.j.view && bdAgain.status === 200 && bdAgain.j.reused === false, "6b sınıra yakın cisimde sağlayıcı farkı → 502 PROVIDER_INCONSISTENT (kabul yok, önbelleğe girmez)", { s: bd.status, c: bd.j.code, again: bdAgain.status });

    section("7. Yapılandırma / kota");
    delete process.env.ROXY_API_KEY;
    const nc = await post(UA, B(0, "2026-10-23", "08:00"));
    const cached = await post(UA, B(0));
    process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
    ok(nc.status === 503 && nc.j.code === "AUTO_CALC_NOT_CONFIGURED" && cached.status === 200 && cached.j.reused === true, "7a anahtar yok → 503 (çağrı yok); önbellekteki sonuç yine açılır");
    // Ortak kota: servis doğrudan, kota dolu → 429, çağrı yok
    __resetPersonalTransitCache();
    const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
    let quotaCalls = 0;
    const q = await computePersonalTransit({ db, tenantId: TA, userId: UA.id!, isDemo: false }, B(0, "2026-10-24", "08:00"), {
      resolveTransit: (utc: Date) => resolveGeneralTransit(utc, { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async (_c, pb) => ({ ok: true, raw: fakePlanetsResponse(`${pb.date}T${pb.time}Z`) }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA }),
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callTransit: async () => { quotaCalls++; return { ok: false, kind: "server_error", status: 500 }; },
      rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-user", retryAfterSec: 60 }),
    });
    ok(q.status === 429 && q.body.ok === false && q.body.code === "RATE_LIMITED" && quotaCalls === 0, "7b ortak kullanıcı kotası dolu → 429, ücretli çağrı YOK");
    const scopes: string[] = [];
    await computePersonalTransit({ db, tenantId: TA, userId: UA.id!, isDemo: false }, B(0, "2026-10-24", "08:01"), {
      resolveTransit: (utc: Date) => resolveGeneralTransit(utc, { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async (_c, pb) => ({ ok: true, raw: fakePlanetsResponse(`${pb.date}T${pb.time}Z`) }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA }),
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callTransit: async (_c, body) => ({ ok: true, raw: fakeTransitResponse(body.birthData as unknown as Moment, body.date, body.time) }),
      rateLimit: async (scope) => { scopes.push(scope); return { allowed: true, retryAfterSec: 0 }; },
    });
    ok(JSON.stringify(scopes) === JSON.stringify(["hd-roxy-transit-inflight", "hd-roxy-user", "hd-roxy-tenant"]), "7c kilit + BodyGraph/İlişki ile ORTAK kota sayaçları (hd-roxy-user / hd-roxy-tenant)", scopes);

    section("9. Doğrulanmış referans — gereksiz ret YOK, doğrulanamayan kabul YOK");
    __resetTransitResolverCache();
    // Yerel motorun belirsiz bulduğu dakikalar (Türkiye saati girdisi dakika hassasiyetinde); farklı cisim
    const uncertainMinutes: number[] = [];
    for (let ms = Date.parse("2026-11-03T00:00:00Z"); uncertainMinutes.length < 3; ms += 60_000) {
      const t = computeGeneralTransit(new Date(ms));
      if (t.hasUncertainty && t.activations.some((a) => !a.certain && a.body !== "Earth" && a.body !== "SouthNode")) uncertainMinutes.push(ms);
    }
    const tr = (ms: number) => { const d = new Date(ms + 3 * 3600e3).toISOString(); return [d.slice(0, 10), d.slice(11, 16)] as const; };
    // a) "Gerçek gök" belirsiz cismi yerel motorun öbür adayına (sınırın 2″ ötesine) koyar → eski kural reddederdi, yeni kural doğrular
    __resetRateLimitForTest();
    const ua = computeGeneralTransit(new Date(uncertainMinutes[0]));
    const ub = ua.activations.find((a) => !a.certain && a.body !== "Earth" && a.body !== "SouthNode")!;
    let truthLon = ub.longitude;
    for (const dir of [1, -1]) {
      const cand = (ub.longitude + dir * (ub.lineBoundaryArcsec + 2) / 3600 + 360) % 360;
      const g = longitudeToGateLine(cand);
      if (g.gate === ub.alternative!.gate && g.line === ub.alternative!.line) { truthLon = cand; break; }
    }
    roxy.override = { [ub.body]: truthLon };
    const callsA = roxy.calls;
    const [da, ta] = tr(uncertainMinutes[0]);
    const ra = await post(UA, B(0, da, ta));
    const shown = ((ra.j.view as Json | undefined)?.transit as Json | undefined)?.activations as Array<{ body: string; gate: number; line: number }> | undefined;
    const truthGl = longitudeToGateLine(truthLon);
    const sb = shown?.find((x) => x.body === ub.body);
    ok(ra.status === 200 && !!sb && sb.gate === truthGl.gate && sb.line === truthGl.line && (truthGl.gate !== ub.gate || truthGl.line !== ub.line) && roxy.calls === callsA + 1,
      `9a yerel motor ${ub.body} ${ub.gate}.${ub.line} derken doğrulanmış referans ${truthGl.gate}.${truthGl.line} → doğru Roxy sonucu KABUL (eski kural reddederdi)`, { status: ra.status, code: ra.j.code, sb, truthGl });
    const planetsBefore = roxy.planetsCalls;
    const general = await resolveGeneralTransit(new Date(uncertainMinutes[0]), { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async () => ({ ok: false, kind: "server_error", status: 500 }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA });
    ok(general.resolution === "roxy-resolved" && !general.transit.hasUncertainty && roxy.planetsCalls === planetsBefore, "9b aynı an gezegen konumu süreç önbelleğinden (ikinci ücretli çağrı yok); genel transit TAM");
    roxy.override = null;
    // c) Roxy boylamı bağımsız motor bandı dışında → 502, ücretli HD çağrısı YOK, önbelleğe girmez
    __resetRateLimitForTest();
    roxy.planetsMode = "offband";
    const callsC = roxy.calls;
    const [dc, tc] = tr(uncertainMinutes[1]);
    const rc = await post(UA, B(1, dc, tc));
    roxy.planetsMode = "ok";
    ok(rc.status === 502 && rc.j.code === "TRANSIT_UNVERIFIED" && roxy.calls === callsC, "9c Roxy gezegen boylamı bağımsız motorla uyuşmuyor → 502, ücretli HD çağrısı YOK", { s: rc.status, c: rc.j.code });
    const rc2 = await post(UA, B(1, dc, tc));
    ok(rc2.status === 200 && rc2.j.reused === false, "9d uyumsuz yanıt önbelleğe girmedi (sonraki doğru yanıt yeniden doğrulandı)", { s: rc2.status, c: rc2.j.code });
    // e) gezegen konumu alınamazsa → 503 (doğrulanamayan sonuç gösterilmez), ücretli HD çağrısı YOK
    __resetRateLimitForTest();
    roxy.planetsMode = "500";
    const callsE = roxy.calls;
    const [de, te] = tr(uncertainMinutes[2]);
    const re = await post(UA, B(2, de, te));
    roxy.planetsMode = "ok";
    ok(re.status === 503 && re.j.code === "TRANSIT_REFERENCE_INCOMPLETE" && roxy.calls === callsE && !re.j.view, "9e referans eksik → 503, HD çağrısı YOK, sonuç yok", { s: re.status, c: re.j.code });
    const re2 = await post(UA, B(2, de, te));
    ok(re2.status === 200 && re2.j.reused === false, "9f hata önbelleğe girmedi — kaynak düzelince hesaplandı", { s: re2.status, c: re2.j.code });
    // g) N-01 KALICI astronomik belirsizlik (kayıtlı GERÇEK S08-1b hassas konumu: Ay çizgi sınırına 0,56″) → ayrı kod, tekrar deneme önerilmez
    __resetTransitResolverCache();
    __resetRateLimitForTest();
    const s08 = (JSON.parse(readFileSync(path.resolve(__dirname, "fixtures", "roxy-planets-validation.json"), "utf8")).results as Record<string, { utc: string; planets: unknown }>)["S08-1b"];
    let hdCallsG = 0;
    const partialDeps = {
      resolveTransit: () => resolveGeneralTransit(new Date(s08.utc), { config: { apiKey: "k", baseUrl: "https://example.invalid" }, callPlanets: async () => ({ ok: true as const, raw: { planets: s08.planets } }), rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), userId: UA.id!, tenantId: TA }),
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callTransit: async () => { hdCallsG++; return { ok: false as const, kind: "server_error" as const, status: 500 }; },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    };
    const g1 = await computePersonalTransit({ db, tenantId: TA, userId: UA.id!, isDemo: false }, B(0, "2026-10-27", "08:00"), partialDeps);
    const g2 = await computePersonalTransit({ db, tenantId: TA, userId: UA.id!, isDemo: false }, B(0, "2026-10-27", "08:00"), partialDeps);
    const gErr = g1.body.ok ? "" : g1.body.error;
    ok(g1.status === 422 && !g1.body.ok && g1.body.code === "TRANSIT_REFERENCE_UNCERTAIN" && gErr.includes("Ay") && gErr.includes("Yeniden denemek sonucu değiştirmez") && !/birkaç dakika sonra|roxy|kredi|kota/i.test(gErr) && hdCallsG === 0,
      "9g kalıcı belirsizlik (roxy-partial) → 422 TRANSIT_REFERENCE_UNCERTAIN; gezegen adı; tekrar deneme önerilmez; ücretli HD çağrısı YOK", { s: g1.status, b: g1.body });
    ok(g2.status === 422 && !g2.body.ok && g2.body.code === "TRANSIT_REFERENCE_UNCERTAIN" && hdCallsG === 0, "9h aynı an tekrar → yine 422, yine ücretli HD çağrısı YOK (belirsiz sonuç tam rapora dönüşmez)");
    ok(re.status === 503 && re.j.code === "TRANSIT_REFERENCE_INCOMPLETE" && String(re.j.error).includes("Birkaç dakika sonra"), "9i geçici erişim sorunu (unresolved) ayrı kalır → 503 TRANSIT_REFERENCE_INCOMPLETE, yeniden deneme önerilir (geriye uyumlu)");

    section("10. Dünya geneli saat dilimi (gerçek route)");
    __resetRateLimitForTest();
    // Önce Türkiye saatiyle (tz verilmeden — eski istemci) hesap: 21.10.2026 09:00 Türkiye = 06:00Z (tek ücretli sahte çağrı)
    const prime = await post(UA, B(0, "2026-10-21", "09:00"));
    const callsT = roxy.calls;
    ok(prime.status === 200 && (prime.j.moment as Json).timeZone === "Europe/Istanbul" && (prime.j.moment as Json).utcIso === "2026-10-21T06:00:00.000Z", "10· saat dilimi göndermeyen eski istemci → Türkiye saati (geriye uyum)");
    // Londra (BST, UTC+1) 07:00 aynı UTC anı → sunucu önbelleği (anahtar gerçek UTC anı), ücretli çağrı YOK
    const lon = await post(UA, { ...B(0, "2026-10-21", "07:00"), tz: "Europe/London" });
    const lm = (lon.j.moment ?? {}) as Json;
    ok(lon.status === 200 && lon.j.reused === true && roxy.calls === callsT && lm.utcIso === "2026-10-21T06:00:00.000Z" && lm.timeZone === "Europe/London" && lm.localTime === "07:00" && lm.offsetSeconds === 3600 && JSON.stringify(lon.j.view) === JSON.stringify(prime.j.view),
      "10a Londra 07:00 = Türkiye 09:00 (aynı UTC) → aynı kişisel transit, önbellekten (ücretli çağrı YOK); yanıt Londra saatini taşır", { s: lon.status, reused: lon.j.reused, lm });
    const tk = await post(UA, { ...B(0, "2026-10-21", "15:00"), tz: "Asia/Tokyo" });
    ok(tk.status === 200 && tk.j.reused === true && (tk.j.moment as Json).utcIso === "2026-10-21T06:00:00.000Z" && roxy.calls === callsT, "10b Tokyo 15:00 aynı UTC → aynı sonuç, önbellekten");
    const badTz = await post(UA, { ...B(0), tz: "Mars/Olympus" });
    const inj = await post(UA, { ...B(0), tz: "Europe/Istanbul;DROP TABLE x" });
    ok(badTz.status === 400 && badTz.j.code === "INVALID_TIMEZONE" && inj.status === 400 && inj.j.code === "INVALID_TIMEZONE" && roxy.calls === callsT, "10c geçersiz / zararlı saat dilimi → 400 INVALID_TIMEZONE, ücretli çağrı YOK");
    const amb = await post(UA, { ...B(0, "2026-10-25", "01:30"), tz: "Europe/London" });
    ok(amb.status === 400 && amb.j.code === "LOCAL_TIME_AMBIGUOUS" && JSON.stringify(amb.j.offsets) === JSON.stringify([0, 3600]) && roxy.calls === callsT, "10d Londra 25.10.2026 01:30 iki kez yaşandı → 400 + iki ofset; sessiz seçim YOK, çağrı YOK", amb.j);
    const wrongOff = await post(UA, { ...B(0, "2026-10-25", "01:30"), tz: "Europe/London", offset: 7200 });
    const strOff = await post(UA, { ...B(0, "2026-10-25", "01:30"), tz: "Europe/London", offset: "3600" });
    ok(wrongOff.status === 400 && wrongOff.j.code === "INVALID_OFFSET" && strOff.status === 400 && strOff.j.code === "INVALID_OFFSET", "10e listede olmayan / sayı olmayan ofset → 400 INVALID_OFFSET (körü körüne kabul yok)");
    const picked = await post(UA, { ...B(0, "2026-10-25", "01:30"), tz: "Europe/London", offset: 3600 });
    ok(picked.status === 200 && (picked.j.moment as Json).utcIso === "2026-10-25T00:30:00.000Z" && (picked.j.moment as Json).offsetSeconds === 3600, "10f kullanıcının seçtiği ilk geçiş (UTC+1) → 00:30Z", picked.j.moment);
    const gap = await post(UA, { ...B(0, "2026-03-29", "01:30"), tz: "Europe/London" });
    ok(gap.status === 400 && gap.j.code === "LOCAL_TIME_GAP" && String(gap.j.error).includes("Europe/London"), "10g Londra ileri alma boşluğu → 400 LOCAL_TIME_GAP (bölge adıyla)");
    const crossTenant = await post(UB, { ...B(0), tz: "Europe/London" });
    ok(crossTenant.status === 404 && !crossTenant.j.view, "10h başka tenant + farklı saat dilimi → yine 404 (önbellek tenant'a bağlı, sızma yok)");

    section("8. Kayıtlar korunur");
    ok((await chartSnap()) === charts0 && (await clientSnap()) === clients0, "8a bireysel analizler ve danışanlar BİREBİR aynı (hiçbir satır değişmedi)");
    const tables = (await su.query(`select tablename from pg_tables where schemaname='public' and tablename like 'human_design%'`)).rows.map((r) => r.tablename);
    ok(tables.length === 2, "8b yeni tablo yok (yalnız mevcut iki HD tablosu)", tables);
    const msgs = JSON.stringify([m3.j, m4.j, m5.j, m6.j, nc.j, d.j]);
    ok(!/roxy|kredi|kota|maliyet/i.test(msgs), "8c kullanıcı mesajlarında sağlayıcı / kredi / kota / maliyet ifadesi yok");
    ok(roxy.external.length === 0, "8d dış ağ çağrısı yok (yalnız sahte sağlayıcı)", roxy.external);
    const m = resolveTransitMoment("2026-10-19", "09:00");
    ok(m.ok && !!r1.j.moment && (r1.j.moment as Json).utcIso === m.moment.utcIso, "8e yanıttaki an = Türkiye → UTC dönüşümü");
  } finally {
    await env.stop();
    globalThis.fetch = realFetch;
  }
  console.log(`\nHD KİŞİSEL TRANSİT SERVİS/ROUTE: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

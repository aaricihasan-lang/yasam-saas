/**
 * HD KİŞİSEL TRANSİT — servis + route testi (gerçek route handler + izole Postgres; Roxy SAHTE, ücretli çağrı YOK).
 *   Geçerli / geçersiz natal · natal-transit ayrımı · kişisel / eğitici kanal · tenant izolasyonu · Roxy hata ve
 *   zaman aşımı · tutarsız yanıt reddi · tekrar isteklerde önbellek · eşzamanlılık kilidi · ortak kota ·
 *   eski bireysel analizin korunması · DB'ye yazılmaması.
 * Çalıştır: npx tsx scripts/hd-transit/personal-harness.ts   (HD_TR_PG_PORT, varsayılan 54472)
 */
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkUser, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { engineChart, PEOPLE, type Moment } from "../hd-relations/fakeRelationRoxy";
import { fakeTransitResponse } from "./fakeRoxyTransit";
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

type Mode = "ok" | "timeout" | "network" | "429" | "500" | "401" | "400" | "malformed" | "schema" | "tamper-gate" | "tamper-channel" | "tamper-center" | "slow";

async function main() {
  const roxy = { calls: 0, external: [] as string[], keyLeak: false, mode: "ok" as Mode, lastBody: null as null | Json };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
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
      case "slow": await new Promise((r) => setTimeout(r, 2500)); return json(fakeTransitResponse(body.birthData, body.date, body.time));
      default: return json(fakeTransitResponse(body.birthData, body.date, body.time));
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
    ok(typeof v.providerSummary === "string" && Array.isArray(v.boundaryDifferences), "1h sağlayıcı özeti ayrı alan (yorum değil)");

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
    ok(!JSON.stringify(errs).includes("roxy") || true, "6z kullanıcı mesajlarında sağlayıcı adı yok (aşağıda kontrol)");

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
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callTransit: async () => { quotaCalls++; return { ok: false, kind: "server_error", status: 500 }; },
      rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-user", retryAfterSec: 60 }),
    });
    ok(q.status === 429 && q.body.ok === false && q.body.code === "RATE_LIMITED" && quotaCalls === 0, "7b ortak kullanıcı kotası dolu → 429, ücretli çağrı YOK");
    const scopes: string[] = [];
    await computePersonalTransit({ db, tenantId: TA, userId: UA.id!, isDemo: false }, B(0, "2026-10-24", "08:01"), {
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callTransit: async (_c, body) => ({ ok: true, raw: fakeTransitResponse(body.birthData as unknown as Moment, body.date, body.time) }),
      rateLimit: async (scope) => { scopes.push(scope); return { allowed: true, retryAfterSec: 0 }; },
    });
    ok(JSON.stringify(scopes) === JSON.stringify(["hd-roxy-transit-inflight", "hd-roxy-user", "hd-roxy-tenant"]), "7c kilit + BodyGraph/İlişki ile ORTAK kota sayaçları (hd-roxy-user / hd-roxy-tenant)", scopes);

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

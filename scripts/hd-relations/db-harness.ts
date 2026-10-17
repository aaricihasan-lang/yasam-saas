/**
 * HD İLİŞKİ VE GRUP ANALİZLERİ — İZOLE GERÇEK POSTGRES + GERÇEK ROUTE HANDLER harness'i.
 *
 *   • Geçici embedded-postgres (scripts/anamnez/testEnv) + PostgREST shim; production'a DOKUNULMAZ.
 *   • supabase/migrations/20271102000000_hd_relation_analyses.sql DOSYANIN KENDİSİ uygulanır.
 *   • Roxy: sahte anahtar; connection/penta istekleri bağımsız sahte üreticiye gider ve SAYILIR;
 *     başka her dış ağ isteği reddedilir.
 *
 * Çalıştır: npx tsx scripts/hd-relations/db-harness.ts
 */
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { mkUser, src, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { engineChart, fakeConnectionResponse, fakePentaResponse, PEOPLE, type Moment } from "./fakeRelationRoxy";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ FAIL: ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 500)}` : ""}`); }
}
const section = (t: string) => console.log(`\n[${t}]`);

const TA = "0c0c0c0c-0000-4000-8000-00000000000a";
const TB = "0d0d0d0d-0000-4000-8000-00000000000b";
const cid = (n: number, t = "c") => `${t.repeat(8)}-0000-4000-8000-0000000c00${String(n).padStart(2, "0")}`;
const hid = (n: number, t = "c") => `${t.repeat(8)}-0000-4000-8000-0000000d00${String(n).padStart(2, "0")}`;
const NAMES = ["Ayşe Yılmaz", "Mehmet Kaya", "Zeynep Demir", "Ali Çelik", "Elif Şahin", "Can Öztürk"];

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
insert into public.tenants(id, name) values ('${TA}', 'ZZ_REL_A'), ('${TB}', 'ZZ_REL_B');
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role;
`;
const MIGRATION = src("supabase/migrations/20271102000000_hd_relation_analyses.sql");

type RouteFn = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(handler: unknown, method: string, auth: Auth, opts: { body?: unknown; query?: string; params?: Record<string, string>; ua?: string } = {}) {
  const headers: Record<string, string> = { "user-agent": opts.ua ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth.id) headers["x-user-id"] = auth.id;
  if (auth.token) headers["x-session-token"] = auth.token;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${opts.query ?? ""}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const res = await (handler as RouteFn)(req, { params: Promise.resolve(opts.params ?? {}) });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) return { status: res.status, json: (await res.json()) as Json, buf: null as Buffer | null };
  return { status: res.status, json: {} as Json, buf: Buffer.from(await res.arrayBuffer()) };
}

async function main() {
  // Sahte Roxy (sayılır) + dış ağ kilidi.
  const roxy = { connection: 0, penta: 0, external: [] as string[], keyLeak: false };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    const key = new Headers(init?.headers).get("x-api-key") ?? "";
    if (key !== "zz-harness-fake-roxy-key") roxy.keyLeak = true;
    const body = JSON.parse(String(init?.body ?? "{}")) as { personA?: Moment; personB?: Moment; members?: Moment[] };
    if (/roxyapi\.com\/api\/v2\/human-design\/connection\?lang=tr$/.test(u)) {
      roxy.connection++;
      return new Response(JSON.stringify(fakeConnectionResponse(body.personA!, body.personB!, { lang: "tr" })), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (/roxyapi\.com\/api\/v2\/human-design\/penta\?lang=tr$/.test(u)) {
      roxy.penta++;
      await new Promise((r) => setTimeout(r, 50));
      return new Response(JSON.stringify(fakePentaResponse(body.members!)), { status: 200, headers: { "content-type": "application/json" } });
    }
    roxy.external.push(u);
    throw new Error("harness: dış ağ çağrısı yasak");
  }) as typeof fetch;

  const env: TestEnv = await startAnamnezTestEnv({ port: 54412, dirName: "hd-relations-pgdata", extraSql: [HD_DDL, MIGRATION] });
  const su = env.su;
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  console.log(`embedded-postgres + PostgREST shim hazır (${env.url}).`);
  try {
    // Tohum: tenant A'da 6 danışan + otomatik (Roxy) analizleri; tenant B'de 1 danışan.
    const seedClient = async (tenant: string, id: string, chartId: string, name: string, m: Moment) => {
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [id, tenant, name, m.date, m.time.slice(0, 5)]);
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result, birth_place) values ($1,$2,$3,$4,'computed','roxyapi',$5,$6,$7,$8)`,
        [chartId, tenant, id, name, JSON.stringify({ date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType: "true", lang: "tr" }), `ih-${chartId}`, JSON.stringify(engineChart(m)), `Yer ${name}`],
      );
    };
    for (let i = 0; i < 6; i++) await seedClient(TA, cid(i), hid(i), NAMES[i], PEOPLE[i]);
    await seedClient(TB, cid(0, "d"), hid(0, "d"), "B Uzman Danışanı", PEOPLE[0]);

    const U = {
      A: await mkUser(su, "RELA", TA, { human_design: true, clients: true }),
      A2: await mkUser(su, "RELA2", TA, { human_design: true }),
      B: await mkUser(su, "RELB", TB, { human_design: true, clients: true }),
      NoHd: await mkUser(su, "RELN", TA, { clients: true }),
    };
    const routes = {
      list: await import("../../app/api/hd/relations/route"),
      one: await import("../../app/api/hd/relations/[id]/route"),
      cand: await import("../../app/api/hd/relations/candidates/route"),
      report: await import("../../app/api/hd/relations/[id]/report/route"),
    };
    const P = (...i: number[]) => ({ participants: i.map((n) => ({ client_id: cid(n), chart_id: hid(n) })) });
    const count = async (sql: string, p: unknown[] = []) => Number((await su.query(sql, p)).rows[0].n);

    section("1. Migration: tablolar, kilit, RLS");
    const priv = (await su.query(`select has_table_privilege('anon','public.human_design_relation_analyses','SELECT') a1, has_table_privilege('authenticated','public.human_design_relation_analyses','SELECT') a2, has_table_privilege('anon','public.human_design_relation_participants','INSERT') a3, has_table_privilege('authenticated','public.human_design_relation_participants','SELECT') a4`)).rows[0];
    ok(!priv.a1 && !priv.a2 && !priv.a3 && !priv.a4, "1a anon/authenticated için hiçbir yetki yok", priv);
    const rls = (await su.query(`select relname, relrowsecurity from pg_class where relname in ('human_design_relation_analyses','human_design_relation_participants')`)).rows;
    ok(rls.length === 2 && rls.every((r) => r.relrowsecurity === true), "1b iki tabloda RLS etkin", rls);
    const pol = await count(`select count(*) n from pg_policies where tablename like 'human_design_relation%'`);
    ok(pol === 0, "1c izin veren policy YOK (yalnız service_role)");
    const anonRes = await realFetch(`${env.url}/rest/v1/human_design_relation_analyses?select=*`, { headers: { apikey: ANON_KEY } });
    ok(anonRes.status >= 400 || JSON.stringify(await anonRes.json().catch(() => [])) === "[]", "1d tarayıcı anon REST erişimi veri döndürmez");
    await su.query(`begin`);
    let idemp = false;
    try {
      await su.query(`set local role anon`);
      await su.query(`select * from public.human_design_relation_analyses`);
    } catch { idemp = true; }
    await su.query(`rollback`);
    ok(idemp, "1e anon rolü doğrudan SQL ile de okuyamaz (42501)");
    await su.query(MIGRATION);
    ok(true, "1f migration idempotent (ikinci uygulama hatasız)");

    section("2. Connection (gerçek route)");
    const noHd = await call(routes.list.POST, "POST", U.NoHd, { body: P(0, 1) });
    ok(noHd.status === 403 || noHd.status === 401, "2a Human Design yetkisi olmayan kullanıcı → reddedilir", noHd.status);
    const c1 = await call(routes.list.POST, "POST", U.A, { body: { ...P(0, 1), relation_type: "partner" } });
    ok(c1.status === 200 && c1.json.ok === true && c1.json.kind === "connection" && c1.json.reused === false && roxy.connection === 1, "2b iki kişi → Connection (Roxy 1)", { c1: c1.json, roxy });
    const aid = String(c1.json.id);
    const row = (await su.query(`select * from public.human_design_relation_analyses where id=$1`, [aid])).rows[0];
    ok(row.tenant_id === TA && row.kind === "connection" && row.member_count === 2 && row.endpoint === "/human-design/connection" && row.relation_type === "partner", "2c analiz satırı tenant/tür/uç ile kaydedildi");
    const parts = (await su.query(`select * from public.human_design_relation_participants where analysis_id=$1 order by position`, [aid])).rows;
    ok(parts.length === 2 && parts[0].client_id === cid(0) && parts[1].client_id === cid(1) && parts[0].tenant_id === TA, "2d katılımcılar gerçek danışan id'leriyle");
    const c2 = await call(routes.list.POST, "POST", U.A2, { body: P(1, 0) });
    ok(c2.status === 200 && c2.json.reused === true && c2.json.id === aid && roxy.connection === 1, "2e aynı tenant başka uzman/ters sıra → kayıtlı sonuç (Roxy 0)");
    const [d1, d2] = await Promise.all([call(routes.list.POST, "POST", U.A, { body: P(2, 3) }), call(routes.list.POST, "POST", U.A, { body: P(2, 3) })]);
    ok(d1.status === 200 && d2.status === 200 && d1.json.id === d2.json.id && roxy.connection === 2, "2f çift tık (eşzamanlı iki istek) → tek Roxy çağrısı", { d1: d1.json, d2: d2.json, roxy });
    const cross = await call(routes.list.POST, "POST", U.A, { body: { participants: [{ client_id: cid(0), chart_id: hid(0) }, { client_id: cid(0, "d"), chart_id: hid(0, "d") }] } });
    ok(cross.status === 404 && roxy.connection === 2, "2g başka tenant danışanı → 404 (Roxy 0)");
    const same = await call(routes.list.POST, "POST", U.A, { body: { participants: [{ client_id: cid(0), chart_id: hid(0) }, { client_id: cid(0), chart_id: hid(0) }] } });
    ok(same.status === 422, "2h aynı danışan iki kez → 422");

    section("3. Penta (3 / 4 / 5) + sınırlar");
    for (const n of [3, 4, 5]) {
      const before = roxy.penta;
      const r = await call(routes.list.POST, "POST", U.A, { body: { ...P(...Array.from({ length: n }, (_, i) => i)), relation_type: "team" } });
      ok(r.status === 200 && r.json.kind === "penta" && roxy.penta === before + 1, `3a ${n} kişi → Penta (Roxy +1)`, r.json);
      const pc = await count(`select count(*) n from public.human_design_relation_participants where analysis_id=$1`, [r.json.id]);
      ok(pc === n, `3b ${n} katılımcı satırı`);
    }
    ok((await call(routes.list.POST, "POST", U.A, { body: P(0) })).status === 422 && (await call(routes.list.POST, "POST", U.A, { body: P(0, 1, 2, 3, 4, 5) })).status === 422, "3c 1 ve 6 kişi → 422");

    section("4. Okuma / liste / izolasyon (Roxy 0)");
    const callsBefore = roxy.connection + roxy.penta;
    const g = await call(routes.one.GET, "GET", U.A, { params: { id: aid } });
    ok(g.status === 200 && (g.json.analysis as Json).kind === "connection" && ((g.json.analysis as Json).participants as Json[]).map((p) => p.name).join() === `${NAMES[0]},${NAMES[1]}` && !JSON.stringify(g.json).includes("provider_raw"), "4a kayıtlı Connection açılır (adlar doğru sırada; ham yanıt yok)");
    ok((await call(routes.one.GET, "GET", U.B, { params: { id: aid } })).status === 404, "4b başka tenant → 404");
    const lA = await call(routes.list.GET, "GET", U.A);
    const lB = await call(routes.list.GET, "GET", U.B);
    ok(lA.status === 200 && (lA.json.rows as Json[]).length === 5 && lB.status === 200 && (lB.json.rows as Json[]).length === 0, "4c liste: A'da 5 analiz, B'de 0", { a: (lA.json.rows as Json[]).length, b: (lB.json.rows as Json[]).length });
    const cand = await call(routes.cand.GET, "GET", U.A);
    ok(cand.status === 200 && (cand.json.rows as Json[]).length === 6 && (cand.json.rows as Json[]).every((r) => r.chart) && !JSON.stringify(cand.json).includes("activations"), "4d adaylar: yalnız A danışanları, uygun analizle; hesap verisi yok");
    const candB = await call(routes.cand.GET, "GET", U.B);
    ok((candB.json.rows as Json[]).length === 1 && (candB.json.rows as Json[])[0].name === "B Uzman Danışanı", "4e B yalnız kendi danışanını görür");
    ok(roxy.connection + roxy.penta === callsBefore, "4f açma/liste/aday: Roxy 0");

    section("5. Word raporu (Roxy 0) + Android kısıtı");
    const w = await call(routes.report.POST, "POST", U.A, { params: { id: aid } });
    const xml = w.buf ? await (await JSZip.loadAsync(w.buf)).file("word/document.xml")!.async("string") : "";
    ok(w.status === 200 && xml.includes("İlişki Analizi (Connection)") && xml.includes(NAMES[0]) && !xml.includes("zz-harness-fake-roxy-key"), "5a Word: Connection başlığı + adlar; anahtar yok");
    const wa = await call(routes.report.POST, "POST", U.A, { params: { id: aid }, ua: "Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/130 Mobile" });
    ok(wa.status === 403, "5b Android → 403 (mevcut Word kuralı)");
    ok((await call(routes.report.POST, "POST", U.B, { params: { id: aid } })).status === 404, "5c başka tenant raporu → 404");
    ok(roxy.connection + roxy.penta === callsBefore, "5d rapor: Roxy 0");

    section("6. Silme güvenliği + DB bütünlüğü");
    const clientsBefore = await count(`select count(*) n from public.human_design_clients`);
    const chartsBefore = await count(`select count(*) n from public.human_design_charts`);
    ok((await call(routes.one.DELETE, "DELETE", U.B, { params: { id: aid } })).status === 404, "6a başka tenant silemez");
    const del = await call(routes.one.DELETE, "DELETE", U.A, { params: { id: aid } });
    ok(del.status === 200 && (await count(`select count(*) n from public.human_design_relation_analyses where id=$1`, [aid])) === 0 && (await count(`select count(*) n from public.human_design_relation_participants where analysis_id=$1`, [aid])) === 0, "6b analiz + katılımcı bağları silindi (cascade)");
    ok((await count(`select count(*) n from public.human_design_clients`)) === clientsBefore && (await count(`select count(*) n from public.human_design_charts`)) === chartsBefore, "6c danışanlar ve bireysel BodyGraph analizleri DEĞİŞMEDİ");
    // Danışan profili silinirse analiz tarihsel kalır.
    const pid = String((await call(routes.list.POST, "POST", U.A, { body: P(4, 5) })).json.id);
    await su.query(`delete from public.human_design_clients where id=$1`, [cid(5)]);
    const gh = await call(routes.one.GET, "GET", U.A, { params: { id: pid } });
    const ps = (gh.json.analysis as Json).participants as Json[];
    ok(gh.status === 200 && ps[1].clientId === null && ps[1].name === NAMES[5] && ps[1].status === "client_deleted", "6d danışan silinince analiz kalır (bağ NULL, ad tarihsel)", ps);
    // Doğum bilgisi değişti → tarihsel işaret, otomatik hesap yok.
    await su.query(`update public.human_design_clients set birth_time='01:00' where id=$1`, [cid(4)]);
    const before6 = roxy.connection;
    const gh2 = await call(routes.one.GET, "GET", U.A, { params: { id: pid } });
    ok(((gh2.json.analysis as Json).participants as Json[])[0].status === "birth_data_changed" && roxy.connection === before6, "6e doğum bilgisi değişince sonuç tarihsel işaretlenir; Roxy 0");
    // Tenant tutarlılığı DB seviyesinde.
    let fkBlocked = false;
    try {
      const anyA = (await su.query(`select id from public.human_design_relation_analyses limit 1`)).rows[0].id;
      await su.query(`insert into public.human_design_relation_participants(analysis_id, tenant_id, position, client_name) values ($1,$2,4,'x')`, [anyA, TB]);
    } catch { fkBlocked = true; }
    ok(fkBlocked, "6f başka tenant ile katılımcı bağı DB'de reddedilir (bileşik FK)");
    let uqBlocked = false;
    try {
      const r0 = (await su.query(`select * from public.human_design_relation_analyses limit 1`)).rows[0];
      await su.query(`insert into public.human_design_relation_analyses(id, tenant_id, kind, member_count, endpoint, adapter_version, node_type, lang, input_hash, result) values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,'{}')`, [r0.tenant_id, r0.kind, r0.member_count, r0.endpoint, r0.adapter_version, r0.node_type, r0.lang, r0.input_hash]);
    } catch { uqBlocked = true; }
    ok(uqBlocked, "6g aynı tenant + aynı girdi kimliği ikinci kez yazılamaz (UNIQUE)");
    let ckBlocked = false;
    try {
      await su.query(`insert into public.human_design_relation_analyses(id, tenant_id, kind, member_count, endpoint, adapter_version, node_type, lang, input_hash, result) values (gen_random_uuid(),$1,'penta',2,'/x','v','true','tr','zz','{}')`, [TA]);
    } catch { ckBlocked = true; }
    ok(ckBlocked, "6h tür ↔ kişi sayısı CHECK (Penta 2 kişi olamaz)");

    section("7. Demo hesap + migration uygulanmamış senaryosu");
    await su.query(`update public.users set is_demo_account=true where id=$1`, [U.A2.id]);
    ok((await call(routes.list.POST, "POST", U.A2, { body: P(0, 2) })).status === 403, "7a demo hesap yeni analiz oluşturamaz");
    await su.query(`drop table public.human_design_relation_participants; drop table public.human_design_relation_analyses;`);
    const beforeM = roxy.connection;
    const mp = await call(routes.list.POST, "POST", U.A, { body: P(0, 3) });
    ok(mp.status === 503 && mp.json.code === "RELATIONS_UNAVAILABLE" && roxy.connection === beforeM, "7b tablolar yokken → 503, Roxy ÇAĞRILMAZ", mp.json);
    const ml = await call(routes.list.GET, "GET", U.A);
    ok(ml.status === 503, "7c liste → 503 (mevcut HD akışı etkilenmez)");

    ok(roxy.external.length === 0 && !roxy.keyLeak, "Z dış ağ çağrısı yok; yalnız sahte anahtar kullanıldı", roxy);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nHD İLİŞKİ/GRUP DB + ROUTE: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

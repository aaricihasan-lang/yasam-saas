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
import { Resvg } from "@resvg/resvg-js";

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
create table public.human_design_knowledge_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, category text, title text, code text, content text,
  keywords jsonb default '[]', related_gates jsonb default '[]', related_channels jsonb default '[]', related_centers jsonb default '[]', tags jsonb default '[]',
  sort_order int default 0, is_active boolean default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expert_notes text
);
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_knowledge_records to service_role;
`;
const MIGRATION = src("supabase/migrations/20271102000000_hd_relation_analyses.sql");
const MIGRATION2 = src("supabase/migrations/20271103000000_hd_relation_comments_reports.sql");

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

  const env: TestEnv = await startAnamnezTestEnv({ port: 54412, dirName: "hd-relations-pgdata", extraSql: [HD_DDL, MIGRATION, MIGRATION2] });
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

    const { toAppTypeCode } = await import("../../lib/human-design/normalize/hdAppCodes");
    const typeOf = (i: number) => String(toAppTypeCode(engineChart(PEOPLE[i]).type));
    await su.query(
      `insert into public.human_design_knowledge_records(tenant_id, category, title, code, content, expert_notes, is_active) values
        ($1,'Tipler','Tip kaydı','tip_' || $3,'ZZ_TIP_ICERIK','ZZ_GIZLI_NOT_TIP',true),
        ($1,'Kanallar','Kanal kaydı','kanal_' || $4,'ZZ_KANAL_ICERIK','ZZ_GIZLI_NOT_KANAL',true),
        ($2,'Kanallar','B kanal','kanal_' || $4,'ZZ_B_SIZMAMALI',null,true)`,
      [TA, TB, typeOf(0), "1_8"],
    );
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
      reports: await import("../../app/api/hd/relations/[id]/reports/route"),
      comment: await import("../../app/api/hd/relations/[id]/comment/route"),
      knowledge: await import("../../app/api/hd/relations/[id]/knowledge/route"),
      download: await import("../../app/api/hd/relations/reports/[reportId]/download/route"),
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

    section("5. Uzman Yorumu + Raporu Hazırla + Word (Roxy 0) + Android kısıtı");
    const m2 = (await su.query(`select has_table_privilege('anon','public.human_design_relation_reports','SELECT') a, has_table_privilege('authenticated','public.human_design_relation_reports','SELECT') b, (select relrowsecurity from pg_class where relname='human_design_relation_reports') r`)).rows[0];
    ok(!m2.a && !m2.b && m2.r === true, "5a migration 2: rapor tablosu anon/auth kilitli + RLS", m2);
    const c0 = await call(routes.comment.GET, "GET", U.A, { params: { id: aid } });
    ok(c0.status === 200 && (c0.json.comment as Json).available === true && (c0.json.comment as Json).text === null, "5b yorum başlangıçta boş");
    const cs = await call(routes.comment.PATCH, "PATCH", U.A, { params: { id: aid }, body: { text: "Uzman yorumu: ilk sürüm\n\nİkinci paragraf", expected_updated_at: null } });
    const v1 = String((cs.json.comment as Json).updatedAt);
    ok(cs.status === 200 && (cs.json.comment as Json).text === "Uzman yorumu: ilk sürüm\n\nİkinci paragraf", "5c yorum kaydedildi", cs.json);
    const stale = await call(routes.comment.PATCH, "PATCH", U.A2, { params: { id: aid }, body: { text: "eski sürüme dayalı", expected_updated_at: null } });
    ok(stale.status === 409, "5d eşzamanlı düzenleme (eski sürüm) → 409, üzerine yazılmaz", stale.json);
    ok((await call(routes.comment.GET, "GET", U.B, { params: { id: aid } })).status === 404 && (await call(routes.comment.PATCH, "PATCH", U.B, { params: { id: aid }, body: { text: "x", expected_updated_at: null } })).status === 404, "5e başka tenant yorumu okuyamaz / yazamaz → 404");
    const clr = await call(routes.comment.PATCH, "PATCH", U.A, { params: { id: aid }, body: { text: "   ", expected_updated_at: v1 } });
    ok(clr.status === 422 && clr.json.code === "CLEAR_NOT_CONFIRMED", "5f kayıtlı yorum onaysız boşaltılamaz");
    const big = await call(routes.comment.PATCH, "PATCH", U.A, { params: { id: aid }, body: { text: "x".repeat(10001), expected_updated_at: v1 } });
    ok(big.status === 422, "5g 10.000 karakter sınırı");
    let ckLen = false;
    try { await su.query(`update public.human_design_relation_analyses set expert_comment=repeat('x', 10001) where id=$1`, [aid]); } catch { ckLen = true; }
    ok(ckLen, "5h DB CHECK: 10.000 üstü yorum reddedilir");
    // Rapor 1: yalnız teknik (varsayılan kapalı seçimler)
    const rep1 = await call(routes.reports.POST, "POST", U.A, { params: { id: aid }, body: {} });
    ok(rep1.status === 200 && (rep1.json.sections as Json).expertComment === false && (rep1.json.sections as Json).analysis === false && (rep1.json.image as Json).status === "ok", "5i varsayılan rapor: seçimler KAPALI, görsel hazır", rep1.json);
    // Rapor 2: tüm içerik + hazırlayan
    const rep2 = await call(routes.reports.POST, "POST", U.A, { params: { id: aid }, body: { sections: { analysis: true, knowledge: true, expert_comment: true }, prepared_by: "Uzm. Test" } });
    ok(rep2.status === 200 && (rep2.json.sections as Json).expertComment === true, "5j tam içerikli rapor hazırlandı", rep2.json);
    const dl = async (rid: string, auth = U.A, ua?: string) => call(routes.download.POST, "POST", auth, { params: { reportId: rid }, ua });
    const docOf = async (buf: Buffer | null) => {
      const z = await JSZip.loadAsync(buf!);
      const xml = await z.file("word/document.xml")!.async("string");
      return { xml, text: xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), media: Object.keys(z.files).filter((f) => /^word\/media\/.+\.png$/.test(f)) };
    };
    const dlr1 = await dl(String(rep1.json.id));
    const doc1 = await docOf(dlr1.buf);
    ok(dlr1.status === 200 && doc1.text.includes("İlişki Analizi (Connection)") && doc1.text.includes(NAMES[0]) && !doc1.text.includes("Uzman yorumu: ilk sürüm") && !doc1.text.includes("Analiz Açıklamaları"), "5k teknik rapor: uzman yorumu / açıklama YOK (seçilmedi)");
    ok(doc1.media.length === 2 && doc1.text.includes("Aktif kapı kanalın kendi yarısını") && !doc1.text.includes("şematik"), "5l Word'de logo + silüetli birleşik BodyGraph (sunucuda ekrandaki sahneyle çizilir) + Türkçe lejant", doc1.media);
    const dlr2 = await dl(String(rep2.json.id));
    const doc2 = await docOf(dlr2.buf);
    ok(doc2.text.includes("Uzman Yorumu") && doc2.text.includes("Uzman yorumu: ilk sürüm") && doc2.text.includes("İkinci paragraf") && doc2.text.includes("Analiz Açıklamaları") && doc2.text.includes("Uzm. Test"), "5m seçilen içerik + Raporu Hazırlayan Word'de");
    ok(![doc1.xml, doc2.xml].some((x) => /roxy|\/human-design\/|nodeType|adapter|zz-harness-fake-roxy-key/i.test(x)), "5n Word'de sağlayıcı adı / uç / nodeType / anahtar YOK");
    ok(doc2.text.includes("ZZ_KANAL_ICERIK") && doc2.text.includes("ZZ_TIP_ICERIK") && doc2.text.includes(`${NAMES[0]} — bireysel kayıtlarınız`), "5n2 Bilgi Bankası: genel kanal kaydı + kişi adıyla bireysel tip kaydı Word'de");
    ok(!/ZZ_GIZLI_NOT|ZZ_B_SIZMAMALI/.test(doc2.text) && !doc1.text.includes("ZZ_KANAL_ICERIK"), "5n3 özel çalışma notu ve başka tenant kaydı Word'e GİRMEZ; seçilmeyen raporda Bilgi Bankası yok");
    // 5t–5x Birleşik BodyGraph görseli: sunucuda kayıtlı veriden çizilir; tarayıcıdan gelen grafik YOK SAYILIR
    //        (snapshot'a PNG yazılmaz → DB şişmez). Eski raporlarda donmuş PNG indirmede aynen kullanılır.
    const fakePng = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1270" height="1800"><rect width="1270" height="1800" fill="#fff"/><circle cx="600" cy="900" r="300" fill="#2563eb"/></svg>`).render().asPng();
    const asUrl = (b: Buffer | Uint8Array) => `data:image/png;base64,${Buffer.from(b).toString("base64")}`;
    const rg = await call(routes.reports.POST, "POST", U.A, { params: { id: aid }, body: { graphic_png: asUrl(fakePng) } });
    ok(rg.status === 200 && (rg.json.image as Json).source === "scene" && (rg.json.image as Json).status === "ok" && !JSON.stringify(rg.json).includes("base64"), "5t rapor oluşur; dışarıdan gönderilen grafik yok sayılır (kaynak: sunucu sahnesi)", rg.json);
    const storedImg = (await su.query(`select snapshot->'image'->>'png' p, snapshot->'image'->>'source' s from public.human_design_relation_reports where id=$1`, [rg.json.id])).rows[0];
    ok(storedImg.s === "scene" && storedImg.p === null, "5t2 snapshot'a PNG yazılmaz (yalnız kayıtlı veri; DB şişmez)");
    const mediaBytes = async (buf: Buffer | null) => {
      const z = await JSZip.loadAsync(buf!);
      return Promise.all(Object.keys(z.files).filter((f) => /^word\/media\/.+\.png$/.test(f)).map((f) => z.file(f)!.async("nodebuffer")));
    };
    const dg1 = await dl(String(rg.json.id));
    const dg2 = await dl(String(rg.json.id));
    const mb1 = await mediaBytes(dg1.buf);
    const mb2 = await mediaBytes(dg2.buf);
    const docG = await docOf(dg1.buf);
    const chartPng = mb1.find((b) => b.readUInt32BE(16) === 1100);
    ok(!!chartPng && chartPng.readUInt32BE(20) === Math.round((1100 * 752) / 602) && !mb1.some((b) => b.equals(Buffer.from(fakePng))) && docG.text.includes("Bağlantı türü aşağıdaki kanal tablosundadır") && !docG.text.includes("◆"), "5u Word: sunucuda çizilen silüetli BodyGraph (1100 genişlik, tarayıcı grafiği değil) + lejant", mb1.map((b) => [b.readUInt32BE(16), b.readUInt32BE(20)]));
    ok(mb1.length === mb2.length && mb1.every((b, i) => b.equals(mb2[i])), "5u2 tekrar indirmede görsel birebir aynı (deterministik)");
    ok(docG.text.includes("Yarım Kanallar ve Aktif Kapılar") && docG.text.includes("Kişilerin tüm aktif kapıları"), "5u3 Word: yarım kanallar ve kişilerin tüm aktif kapıları bölümü");
    // Eski rapor biçimi (donmuş standart PNG) indirmede aynen kullanılır (geri uyumluluk).
    await su.query(`update public.human_design_relation_reports set snapshot = jsonb_set(snapshot, '{image}', $2::jsonb) where id=$1`, [rg.json.id, JSON.stringify({ status: "ok", reason: null, source: "standard", png: Buffer.from(fakePng).toString("base64") })]);
    const legacy = await dl(String(rg.json.id));
    const lb = await mediaBytes(legacy.buf);
    const docL = await docOf(legacy.buf);
    ok(legacy.status === 200 && lb.some((b) => b.equals(Buffer.from(fakePng))) && docL.text.includes("Standart Human Design birleşik BodyGraph"), "5v eski rapor: donmuş PNG + eski lejant aynen");
    const pentaId = String((await su.query(`select id from public.human_design_relation_analyses where kind='penta' and tenant_id=$1 limit 1`, [TA])).rows[0].id);
    const pr = await call(routes.reports.POST, "POST", U.A, { params: { id: pentaId }, body: { graphic_png: asUrl(fakePng) } });
    const prImg = pr.status === 200 ? (await su.query(`select snapshot->'image'->>'png' p from public.human_design_relation_reports where id=$1`, [pr.json.id])).rows[0].p : "x";
    ok(pr.status === 200 && prImg === null, "5x Penta: dışarıdan grafik yok sayılır (Penta şeması sunucuda çizilir)", pr.json);
    const reportCount = await count(`select count(*) n from public.human_design_relation_reports where analysis_id=$1`, [aid]);
    ok(reportCount === 3, "5x2 analiz başına rapor sayısı beklenen (3)", reportCount);
    const src = await call(routes.knowledge.GET, "GET", U.A, { params: { id: aid } });
    const srcStr = JSON.stringify(src.json);
    ok(src.status === 200 && srcStr.includes("ZZ_GIZLI_NOT_KANAL") && !srcStr.includes("ZZ_B_SIZMAMALI") && src.json.central === null && src.json.systemReading === null && (src.json.analysis as unknown[]).length > 0, "5n4 ekran kaynakları: özel not yalnız ekranda; B kaydı yok; normal uzmanda merkezî kaynak null; Sistem Yorumu yok");
    // Yorum sonradan değişir → kayıtlı rapor DEĞİŞMEZ; yeni rapor yeni yorumu alır
    const cur = await call(routes.comment.GET, "GET", U.A, { params: { id: aid } });
    await call(routes.comment.PATCH, "PATCH", U.A, { params: { id: aid }, body: { text: "Uzman yorumu: ikinci sürüm", expected_updated_at: (cur.json.comment as Json).updatedAt } });
    const doc2b = await docOf((await dl(String(rep2.json.id))).buf);
    ok(doc2b.text.includes("Uzman yorumu: ilk sürüm") && !doc2b.text.includes("ikinci sürüm"), "5o kayıtlı rapor tekrar indirilince değişmez (eski yorum)");
    const rep3 = await call(routes.reports.POST, "POST", U.A, { params: { id: aid }, body: { sections: { expert_comment: true } } });
    const doc3 = await docOf((await dl(String(rep3.json.id))).buf);
    ok(doc3.text.includes("ikinci sürüm") && !doc3.text.includes("ilk sürüm"), "5p yeni rapor yeni yorumu içerir");
    const list = await call(routes.reports.GET, "GET", U.A, { params: { id: aid } });
    ok(list.status === 200 && (list.json.rows as Json[]).length === 4, "5q rapor listesi: 4 kayıt");
    ok((await call(routes.reports.GET, "GET", U.B, { params: { id: aid } })).status === 200 && ((await call(routes.reports.GET, "GET", U.B, { params: { id: aid } })).json.rows as Json[]).length === 0 && (await dl(String(rep1.json.id), U.B)).status === 404, "5r başka tenant raporları göremez / indiremez");
    const AND = "Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/130 Mobile";
    ok((await dl(String(rep1.json.id), U.A, AND)).status === 403 && (await call(routes.reports.POST, "POST", U.A, { params: { id: aid }, body: {}, ua: AND })).status === 403, "5s Android: rapor hazırlama + indirme → 403 (mevcut Word kuralı)");
    let fkRep = false;
    try { await su.query(`insert into public.human_design_relation_reports(id, tenant_id, analysis_id, snapshot) values (gen_random_uuid(), $1, $2, '{}')`, [TB, aid]); } catch { fkRep = true; }
    ok(fkRep, "5t rapor başka tenant ile analize bağlanamaz (bileşik FK)");
    ok(roxy.connection + roxy.penta === callsBefore, "5u yorum + rapor + indirme: Roxy 0");

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

    section("8. DB güvenlik kapanışı: service_role ile doğrudan SQL (tenant + sahiplik tetikleyicisi)");
    // Her deneme ayrı transaction + SET LOCAL ROLE service_role (uygulamanın kullandığı rol; BYPASSRLS).
    const asService = async (sql: string, p: unknown[] = []): Promise<{ ok: boolean; code?: string; msg?: string }> => {
      await su.query("begin");
      try {
        await su.query("set local role service_role");
        await su.query(sql, p);
        await su.query("commit");
        return { ok: true };
      } catch (e) {
        await su.query("rollback");
        const err = e as { code?: string; message?: string };
        return { ok: false, code: err.code, msg: err.message };
      }
    };
    const trg = await count(`select count(*) n from pg_trigger where tgname='trg_hd_relation_participant_integrity' and not tgisinternal`);
    ok(trg === 1, "8a katılımcı bütünlük tetikleyicisi kurulu");
    const execPriv = (await su.query(`select has_function_privilege('anon','public.hd_relation_participant_integrity()','EXECUTE') a, has_function_privilege('authenticated','public.hd_relation_participant_integrity()','EXECUTE') b`)).rows[0];
    ok(!execPriv.a && !execPriv.b, "8b tetikleyici fonksiyonu anon/authenticated için çalıştırılamaz", execPriv);
    // Taze A analizi (gerçek route ile) — tüm denemeler bunun üzerinde.
    const secId = String((await call(routes.list.POST, "POST", U.A, { body: P(1, 3) })).json.id);
    ok((await count(`select count(*) n from public.human_design_relation_participants where analysis_id=$1`, [secId])) === 2, "8c geçerli aynı-tenant ilişki route ile yazılır (tetikleyiciden geçer)");
    const ins = (client: string | null, chart: string | null, pos = 4) =>
      asService(`insert into public.human_design_relation_participants(analysis_id, tenant_id, position, client_id, client_name, source_chart_id) values ($1,$2,$3,$4,'zz',$5)`, [secId, TA, pos, client, chart]);
    const r1 = await ins(cid(0, "d"), null);
    ok(!r1.ok && r1.code === "23514", "8d INSERT: başka tenant'ın client_id'si → RED (service_role)", r1);
    const r2 = await ins(null, hid(0, "d"));
    ok(!r2.ok && r2.code === "23514", "8e INSERT: başka tenant'ın source_chart_id'si → RED", r2);
    const r3 = await ins(cid(0, "d"), hid(0, "d"));
    ok(!r3.ok && r3.code === "23514", "8f INSERT: başka tenant'ın danışan + haritası birlikte → RED", r3);
    const r4 = await ins(cid(0), hid(2));
    ok(!r4.ok && r4.code === "23514", "8g INSERT: aynı tenant ama harita başka danışanın → RED", r4);
    const r5 = await ins("ffffffff-0000-4000-8000-00000000ffff", null);
    ok(!r5.ok && (r5.code === "23503" || r5.code === "23514"), "8h INSERT: var olmayan danışan → RED", r5);
    const r6 = await ins(cid(0), hid(0));
    ok(r6.ok, "8i INSERT: aynı tenant + haritası kendi danışanının → KABUL", r6);
    await su.query(`delete from public.human_design_relation_participants where analysis_id=$1 and position=4`, [secId]);
    const upd = (set: string, p: unknown[]) => asService(`update public.human_design_relation_participants set ${set} where analysis_id=$1 and position=0`, [secId, ...p]);
    const u1 = await upd("client_id=$2, source_chart_id=null", [cid(0, "d")]);
    ok(!u1.ok && u1.code === "23514", "8j UPDATE: client_id → başka tenant danışanı → RED", u1);
    const u2 = await upd("source_chart_id=$2", [hid(0, "d")]);
    ok(!u2.ok && u2.code === "23514", "8k UPDATE: source_chart_id → başka tenant haritası → RED", u2);
    const u3 = await upd("source_chart_id=$2", [hid(4)]);
    ok(!u3.ok && u3.code === "23514", "8l UPDATE: source_chart_id → aynı tenant başka danışanın haritası → RED", u3);
    const u4 = await upd("tenant_id=$2", [TB]);
    ok(!u4.ok, "8m UPDATE: katılımcı tenant_id → başka tenant → RED", u4);
    const u5 = await upd("client_name=$2", ["Ad güncelleme (bağlar aynı)"]);
    ok(u5.ok, "8n UPDATE: bağ kolonları dışındaki alan (ad) → KABUL", u5);
    const stillOk = (await su.query(`select client_id, source_chart_id from public.human_design_relation_participants where analysis_id=$1 order by position`, [secId])).rows;
    ok(stillOk[0].client_id === cid(1) && stillOk[0].source_chart_id === hid(1) && stillOk[1].client_id === cid(3), "8o reddedilen yazımlar hiçbir bağı değiştirmedi", stillOk);
    // ON DELETE SET NULL tarihsel davranış korunur (tetikleyici FK eylemini engellemez).
    await su.query(`delete from public.human_design_charts where id=$1`, [hid(3)]);
    const afterChart = (await su.query(`select client_id, source_chart_id from public.human_design_relation_participants where analysis_id=$1 and position=1`, [secId])).rows[0];
    ok(afterChart.source_chart_id === null && afterChart.client_id === cid(3), "8p bireysel harita silinince source_chart_id NULL olur, analiz kalır", afterChart);
    const gs = await call(routes.one.GET, "GET", U.A, { params: { id: secId } });
    ok(gs.status === 200 && ((gs.json.analysis as Json).participants as Json[])[1].status === "source_chart_deleted", "8q kaynak harita silinmiş katılımcı tarihsel işaretlenir");
    await su.query(`delete from public.human_design_clients where id=$1`, [cid(3)]);
    const afterClient = (await su.query(`select client_id, source_chart_id from public.human_design_relation_participants where analysis_id=$1 and position=1`, [secId])).rows[0];
    ok(afterClient.client_id === null, "8r danışan silinince client_id NULL olur (ON DELETE SET NULL)", afterClient);
    const t2 = (await su.query(`select client_id, source_chart_id from public.human_design_relation_participants where analysis_id=$1 and position=0`, [secId])).rows[0];
    await su.query(`delete from public.human_design_clients where id=$1`, [cid(1)]);
    const t3 = (await su.query(`select client_id, source_chart_id from public.human_design_relation_participants where analysis_id=$1 and position=0`, [secId])).rows[0];
    ok(t2.source_chart_id === hid(1) && t3.client_id === null && t3.source_chart_id === hid(1), "8s danışan silinip harita kalınca (harita bağı NULL olur) katılımcı silme eylemi tetikleyiciye takılmaz", { t2, t3 });

    section("7. Demo hesap + migration uygulanmamış senaryosu");
    await su.query(`update public.users set is_demo_account=true where id=$1`, [U.A2.id]);
    ok((await call(routes.list.POST, "POST", U.A2, { body: P(0, 2) })).status === 403, "7a demo hesap yeni analiz oluşturamaz");
    await su.query(`drop table public.human_design_relation_reports; drop table public.human_design_relation_participants; drop table public.human_design_relation_analyses;`);
    const beforeM = roxy.connection;
    const mp = await call(routes.list.POST, "POST", U.A, { body: P(0, 2) });
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

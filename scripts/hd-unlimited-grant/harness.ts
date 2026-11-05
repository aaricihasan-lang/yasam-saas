/**
 * HD — 24 saatlik geçici sınırsız kullanım izni: GERÇEK route handler + GERÇEK migration (izole Postgres) + SAHTE Roxy (ücret 0).
 * Çalıştırma: npx tsx scripts/hd-unlimited-grant/harness.ts   (UG_PG_PORT varsayılan 54491, UG_PG_DIR)
 * Kapsam: işlevsel 1–15 + güvenlik (owner / normal admin / uzman / sahte kimlik / başkasının izni / süresi dolmuş / eşzamanlılık /
 * denetim kaydı) + DB yetki kilitleri. Testler hiçbir ağ çağrısı yapmaz (dış ağ = hata).
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { mkUser, callRoute, FIXTURE, startHdFlowEnv, src, TA, TB, type Auth, type Json } from "../hd-analysis-word-flow/env";
import type { TestEnv } from "../anamnez/testEnv";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { engineChart, fakeConnectionResponse, fakePentaResponse, type Moment } from "../hd-relations/fakeRelationRoxy";
import { __resetRateLimitForTest } from "../../lib/security/rateLimit";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const TC = "0c0c0c0c-0000-4000-8000-00000000000c";

async function main() {
  const roxy = { bodygraph: 0, connection: 0, penta: 0, external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    const json = (s: string) => new Response(s, { status: 200, headers: { "content-type": "application/json" } });
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) { roxy.bodygraph++; await new Promise((r) => setTimeout(r, 25)); return json(consistentRoxyResponse(FIXTURE, init?.body)); }
    const body = JSON.parse(String(init?.body ?? "{}")) as { personA?: Moment; personB?: Moment; members?: Moment[] };
    if (/roxyapi\.com\/.*human-design\/connection/.test(u)) { roxy.connection++; return json(JSON.stringify(fakeConnectionResponse(body.personA!, body.personB!, { lang: "tr" }))); }
    if (/roxyapi\.com\/.*human-design\/penta/.test(u)) { roxy.penta++; return json(JSON.stringify(fakePentaResponse(body.members!))); }
    roxy.external.push(u);
    throw new Error("harness: dış ağ yasak");
  }) as typeof fetch;
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  delete process.env.ROXY_API_BASE_URL;
  delete process.env.TEST_QUOTA_EXEMPT_USER_IDS;
  delete process.env.TEST_QUOTA_EXEMPT_TENANT_IDS;
  delete process.env.TEST_QUOTA_EXEMPT_WINDOW;

  const env: TestEnv = await startHdFlowEnv({ port: Number(process.env.UG_PG_PORT ?? 54491), dirName: process.env.UG_PG_DIR ?? "hd-unlimited-grant-pgdata", rpcAllow: ["hd_unlimited_grant_24h"] });
  const su = env.su;
  await su.query(src("supabase/migrations/20271102000000_hd_relation_analyses.sql"));
  await su.query(src("supabase/migrations/20271103000000_hd_relation_comments_reports.sql"));
  await su.query(`insert into public.tenants(id, name) values ('${TC}', 'ZZ_UG_C') on conflict do nothing`);
  await su.query(src("supabase/migrations/20271231000200_hd_unlimited_24h_grants.sql"));
  // Supabase varsayılanı: public şemadaki yeni tablolarda service_role TAM yetkili → aynısını taklit et, ardından düzeltme migration'ı.
  await su.query(`grant all on public.hd_unlimited_grants, public.hd_unlimited_grant_audit to service_role`);
  await su.query(src("supabase/migrations/20271231000300_hd_unlimited_grants_service_role_readonly.sql"));
  try {
    const P = { human_design: true, clients: true };
    const U = {
      OWNER: await mkUser(su, "UGOWNER", TA, P),
      ADMIN: await mkUser(su, "UGADMIN", TA, P),
      E1: await mkUser(su, "UGE1", TA, P),
      E2: await mkUser(su, "UGE2", TA, P),
      OTHER: await mkUser(su, "UGOTH", TB, P),
      DEMO: await mkUser(su, "UGDEMO", TA, P),
      PENDING: await mkUser(su, "UGPEND", TA, P),
    };
    await su.query(`update public.users set role='admin', is_super_admin=true, admin_level='owner' where id=$1`, [U.OWNER.id]);
    await su.query(`update public.users set role='admin', is_super_admin=false, admin_level='owner' where id=$1`, [U.ADMIN.id]); // admin_level=owner TEK BAŞINA yetki vermemeli
    await su.query(`update public.users set is_demo_account=true where id=$1`, [U.DEMO.id]);
    await su.query(`update public.users set approval_status='pending' where id=$1`, [U.PENDING.id]);

    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      relations: await import("../../app/api/hd/relations/route"),
      grant: await import("../../app/api/admin/hd/unlimited-grant/route"),
    };
    const lib = await import("../../lib/human-design/quota/unlimitedGrant");
    type H = (req: NextRequest) => Promise<Response>;
    const adminCall = async (h: H, method: "GET" | "POST", a: Auth | null, body?: unknown, query = "", forgeId?: string) => {
      const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
      if (a?.id || forgeId) headers["x-admin-id"] = forgeId ?? a!.id!;
      if (a?.token) headers["x-session-token"] = a.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const res = await h(new NextRequest(`http://localhost/api/admin/hd/unlimited-grant${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }));
      return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
    };
    const grantPost = (a: Auth | null, userId: string, forgeId?: string) => adminCall(routes.grant.POST as H, "POST", a, { userId }, "", forgeId);
    const grantGet = (a: Auth | null, userId: string) => adminCall(routes.grant.GET as H, "GET", a, undefined, `?userId=${userId}`);
    const grants = async (uid: string) => (await su.query(`select * from public.hd_unlimited_grants where user_id=$1 order by granted_at`, [uid])).rows as Array<{ id: string; tenant_id: string; granted_by: string; granted_at: Date; expires_at: Date }>;
    const audits = async (uid: string) => (await su.query(`select * from public.hd_unlimited_grant_audit where target_user_id=$1 order by created_at, result`, [uid])).rows as Array<{ result: string; actor_user_id: string; grant_id: string | null; granted_at: Date | null; expires_at: Date | null }>;

    let seq = 0;
    const birthOf = (i: number) => new Date(Date.UTC(1950, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    const newPerson = async (a: Auth) => {
      const i = seq++;
      const r = await callRoute(routes.journey.POST, "POST", a, { action: "create_new", ad: `Ug${i}`, soyad: "Kişi", dogum: birthOf(i), birth_time: `${String(6 + (i % 12)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, birth_location_ref: i % 2 ? "tr-06-ankara" : "trd-42-selcuklu", request_id: randomUUID() });
      if (r.status !== 200) throw new Error(`kişi ${i}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
      return String(r.json.hd_client_id);
    };
    const bodygraph = (a: Auth, clientId: string) => callRoute(routes.roxy.POST, "POST", a, { client_id: clientId, location_id: "client" });
    /** n yeni kişi için BodyGraph; ilk 429'un sırası (yoksa -1) ve 200 sayısı. */
    const runBodygraphs = async (a: Auth, n: number) => {
      let first429 = -1; let ok200 = 0; const codes = new Set<string>();
      for (let i = 0; i < n; i++) {
        const r = await bodygraph(a, await newPerson(a));
        if (r.status === 200) ok200++;
        else { codes.add(`${r.status}:${String(r.json.code ?? "")}`); if (r.status === 429 && first429 < 0) first429 = i + 1; }
      }
      return { first429, ok200, codes: [...codes] };
    };
    // Connection/Penta için kayıtlı (motor) haritalar
    const rel: Array<{ c: string; h: string }> = [];
    for (let i = 0; i < 200; i++) {
      const m: Moment = { date: birthOf(5000 + i), time: `${String(5 + (i % 14)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}:00`, timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
      const c = randomUUID(); const h = randomUUID();
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [c, TA, `UgRel${i} Kişi`, m.date, m.time.slice(0, 5)]);
      await su.query(`insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,'computed','roxyapi',$5,$6,$7)`,
        [h, TA, c, `UgRel${i} Kişi`, JSON.stringify({ ...m, nodeType: "true", lang: "tr" }), `ihug-${i}`, JSON.stringify(engineChart(m))]);
      rel.push({ c, h });
    }
    const relPost = (a: Auth, idx: number[]) => callRoute(routes.relations.POST, "POST", a, { participants: idx.map((i) => ({ client_id: rel[i].c, chart_id: rel[i].h })), relation_type: idx.length === 2 ? "friends" : "family" });

    section("G. DB yetki kilitleri (migration)");
    const priv = (await su.query(`select has_table_privilege('anon','public.hd_unlimited_grants','select') a1, has_table_privilege('authenticated','public.hd_unlimited_grants','insert') a2,
      has_table_privilege('authenticated','public.hd_unlimited_grant_audit','select') a3, has_function_privilege('anon','public.hd_unlimited_grant_24h(uuid,uuid)','execute') a4,
      has_function_privilege('authenticated','public.hd_unlimited_grant_24h(uuid,uuid)','execute') a5, has_table_privilege('service_role','public.hd_unlimited_grants','insert') a6,
      has_function_privilege('service_role','public.hd_unlimited_grant_24h(uuid,uuid)','execute') a7,
      (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.hd_unlimited_grants','public.hd_unlimited_grant_audit']) t,
        unnest(array['insert','update','delete','truncate','references','trigger']) p) a8,
      has_table_privilege('service_role','public.hd_unlimited_grants','select') and has_table_privilege('service_role','public.hd_unlimited_grant_audit','select') a9`)).rows[0] as Record<string, boolean>;
    ok(!priv.a1 && !priv.a2 && !priv.a3 && !priv.a4 && !priv.a5, "G1 anon/authenticated: tablo ve fonksiyona erişim YOK", priv);
    ok(!priv.a6 && !priv.a8 && priv.a9 && priv.a7, "G2 service_role iki tabloda INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER YOK (Supabase varsayılan tam yetkisi düzeltme migration'ıyla kaldırıldı); SELECT + fonksiyon EXECUTE var", priv);
    let badInsert = "";
    try { await su.query(`insert into public.hd_unlimited_grants(user_id, tenant_id, granted_by, granted_at, expires_at) values ($1,$2,$1, now(), now() + interval '48 hours')`, [U.E1.id, TA]); } catch (e) { badInsert = String((e as Error).message); }
    ok(/hd_unlimited_grants_exactly_24h/.test(badInsert), "G3 CHECK: 24 saatten farklı süre DB'de reddedilir (süre seçeneği imkânsız)", badInsert);

    section("1–2. Normal sınırlar (izin yok)");
    __resetRateLimitForTest();
    const n1 = await runBodygraphs(U.E2, 21);
    ok(n1.first429 === 21 && n1.ok200 === 20, `1 normal uzman: 20 BodyGraph 200, 21.'de 429 (20/saat) — ${n1.first429}`, n1);
    __resetRateLimitForTest();
    // 100/gün tenant: C tenant'ında 6 uzman × 17 = 102 deneme → 101.'de tenant 429 (kullanıcı başı 20 sınırına takılmadan)
    const tc: Auth[] = [];
    for (let k = 0; k < 6; k++) tc.push(await mkUser(su, `UGC${k}`, TC, P));
    let t429 = -1; let tCount = 0; let tCode = "";
    outer: for (const a of tc) for (let i = 0; i < 17; i++) { tCount++; const r = await bodygraph(a, await newPerson(a)); if (r.status === 429) { t429 = tCount; tCode = String(r.json.error ?? ""); break outer; } }
    ok(t429 === 101 && /günlük/.test(tCode), `2 tenant: 100 hesap sonra 101.'de 429 'günlük' (100/gün) — ${t429}`, tCode);

    section("Güvenlik — yetki (izin tanımlama)");
    const before = roxy.bodygraph;
    const sNoAuth = await grantPost(null, U.E1.id!);
    ok(sNoAuth.status === 404, "S0 kimliksiz istek → 404", sNoAuth.status);
    const sAdmin = await grantPost(U.ADMIN, U.E1.id!);
    ok(sAdmin.status === 404 && (await grants(U.E1.id!)).length === 0, "S1 normal admin (admin_level='owner' olsa bile, is_super_admin=false) → 404, izin yok", sAdmin.status);
    const sExpert = await grantPost(U.E1, U.E1.id!);
    ok(sExpert.status === 404 && (await grants(U.E1.id!)).length === 0, "S2 uzman kendine izin veremez → 404", sExpert.status);
    const sExpert2 = await grantPost(U.E2, U.E1.id!);
    ok(sExpert2.status === 404 && (await grants(U.E1.id!)).length === 0, "S3 uzman başka uzmana (başkasının iznini değiştirme) → 404", sExpert2.status);
    const sForge = await grantPost(U.E2, U.E1.id!, U.OWNER.id!);
    ok(sForge.status !== 200 && (await grants(U.E1.id!)).length === 0, "S4 sahte kimlik: owner id + uzman token'ı → reddedildi (token bağlama)", sForge.status);
    const sForge2 = await grantPost({ id: U.OWNER.id, token: "zz-fake-token" }, U.E1.id!);
    ok(sForge2.status !== 200 && (await grants(U.E1.id!)).length === 0, "S5 sahte kimlik: owner id + geçersiz token → reddedildi", sForge2.status);
    const gHidden = await grantGet(U.ADMIN, U.E1.id!);
    ok(gHidden.status === 404, "S6 normal admin durum GET → 404 (bölüm hiç çizilmez)", gHidden.status);
    const rpcBad = (await su.query(`select * from public.hd_unlimited_grant_24h(p_user_id => $1, p_actor_id => $2)`, [U.E1.id, U.ADMIN.id])).rows[0];
    ok(rpcBad.out_status === "forbidden" && (await grants(U.E1.id!)).length === 0, "S7 DB fonksiyonu da owner'ı yeniden doğrular (normal admin aktör → forbidden)", rpcBad);
    for (const [lbl, target] of [["demo", U.DEMO], ["onaysız", U.PENDING], ["admin", U.ADMIN]] as const) {
      const r = await grantPost(U.OWNER, target.id!);
      ok(r.status === 400 && r.json.code === "INELIGIBLE" && (await grants(target.id!)).length === 0, `S8 uygun olmayan hedef (${lbl}) → 400 INELIGIBLE, izin yok`, r);
    }
    const sBadId = await grantPost(U.OWNER, "not-a-uuid");
    ok(sBadId.status === 400, "S9 geçersiz kullanıcı kimliği → 400", sBadId.status);
    ok(roxy.bodygraph === before, "S10 izin işlemleri hiç Roxy çağrısı yapmaz");

    section("3, 9, 14. Owner izni açar; ikinci basış süre uzatmaz; izin kalıcıdır");
    const g0 = await grantGet(U.OWNER, U.E1.id!);
    ok(g0.status === 200 && (g0.json.status as Json).eligible === true && (g0.json.status as Json).active === false, "3a owner GET: uygun, aktif değil", g0.json);
    const [p1, p2] = await Promise.all([grantPost(U.OWNER, U.E1.id!), grantPost(U.OWNER, U.E1.id!)]);
    const rows1 = await grants(U.E1.id!);
    ok(rows1.length === 1 && [p1.json.result, p2.json.result].sort().join(",") === "already_active,granted", "9a eşzamanlı iki basış → TEK izin (granted + already_active)", { r: [p1.json.result, p2.json.result], n: rows1.length });
    const g = rows1[0];
    ok(g.expires_at.getTime() - g.granted_at.getTime() === 24 * 3600_000 && g.granted_by === U.OWNER.id && g.tenant_id === TA, "3b izin = DB saatiyle tam 24 saat; owner ve uzmanın tenant'ı kaydedildi", g);
    const p3 = await grantPost(U.OWNER, U.E1.id!);
    const rows2 = await grants(U.E1.id!);
    ok(p3.json.result === "already_active" && rows2.length === 1 && rows2[0].expires_at.getTime() === g.expires_at.getTime(), "9b aktif izne tekrar basış → süre UZATILMADI (aynı bitiş)", p3.json);
    const st = (p3.json.status ?? {}) as Json;
    ok(st.active === true && !!st.expiresAt && Date.parse(String(st.expiresAt)) === g.expires_at.getTime(), "3c durum: aktif + bitiş zamanı döner", st);
    const fresh = await lib.readActiveUnlimitedGrant((await import("../../lib/supabase-server")).getServerDb(), U.E1.id!, TA);
    ok(fresh !== null, "14 izin DB'de kalıcı: yeni istemciyle (uygulama yeniden başlamış gibi) okunuyor");

    section("3, 11. İzinli uzman: iki sınırı da aşar (BodyGraph + Connection + Penta)");
    __resetRateLimitForTest();
    const b0 = roxy.bodygraph;
    const u3 = await runBodygraphs(U.E1, 105);
    ok(u3.first429 < 0 && u3.ok200 === 105 && roxy.bodygraph === b0 + 105, `3d izinli uzman: 105 BodyGraph (20/saat ve 100/gün üstü) hiç 429 yok, 105 ücretli (sahte) çağrı`, u3);
    let c429 = -1; let cOk = 0;
    for (let k = 0; k < 25; k++) { const r = await relPost(U.E1, [2 * k, 2 * k + 1]); if (r.status === 200) cOk++; else if (r.status === 429 && c429 < 0) c429 = k + 1; }
    ok(c429 < 0 && cOk === 25, `3e izinli uzman: 25 Connection hiç 429 yok`, { c429, cOk });
    let p429 = -1; let pOk = 0;
    for (let k = 0; k < 6; k++) { const size = 3 + (k % 3); const r = await relPost(U.E1, Array.from({ length: size }, (_, j) => 60 + k * 6 + j)); if (r.status === 200) pOk++; else if (r.status === 429 && p429 < 0) p429 = k + 1; }
    ok(p429 < 0 && pOk === 6, `3f izinli uzman: Penta 3/4/5 kişi çalışıyor`, { p429, pOk });
    const tenantCounterUntouched = await runBodygraphs(U.E2, 21);
    ok(tenantCounterUntouched.first429 === 21, `13 aynı tenant'taki 2. uzman istisnadan yararlanmaz (21.'de 429) — izinli 136 kullanım tenant sayacını (100/gün) doldurmadı`, tenantCounterUntouched);
    // Sayaç SIFIRLANMADAN: izni geçici olarak geçmişe al → uzmanın kendi saatlik sayacı hâlâ boş olmalı (izinli kullanım sayılmadı).
    const live = (await grants(U.E1.id!))[0];
    await su.query(`update public.hd_unlimited_grants set granted_at = now() - interval '24 hours 1 second', expires_at = now() - interval '1 second' where id=$1`, [live.id]);
    const noReset = await runBodygraphs(U.E1, 21);
    ok(noReset.first429 === 21 && noReset.ok200 === 20, "16 sayaç sıfırlanmadan: izin bitince uzmanın tam 20 hakkı var (izinli 136 işlem normal saatlik sayacı doldurmadı)", noReset);
    await su.query(`update public.hd_unlimited_grants set granted_at=$2, expires_at=$3 where id=$1`, [live.id, live.granted_at, live.expires_at]);

    section("10. Kayıtlı analiz / eşzamanlılık korumaları izinliyken de aynen");
    const pid = await newPerson(U.E1);
    const bb = roxy.bodygraph;
    const [x1, x2] = await Promise.all([bodygraph(U.E1, pid), bodygraph(U.E1, pid)]);
    ok(roxy.bodygraph === bb + 1, "10a aynı kişiye eşzamanlı iki BodyGraph → tek ücretli çağrı (inflight kilidi korunur)", { s: [x1.status, x2.status], calls: roxy.bodygraph - bb });
    const x3 = await bodygraph(U.E1, pid);
    ok(x3.json.reused === true && roxy.bodygraph === bb + 1, "10b kayıtlı analizin yeniden açılması ücretli çağrı üretmez");
    const cc = roxy.connection;
    const again = await relPost(U.E1, [0, 1]);
    ok(again.json.reused === true && roxy.connection === cc, "10c kayıtlı Connection tekrar → yeni çağrı yok");

    section("12. Başka tenant ve tenant değişimi");
    __resetRateLimitForTest();
    const o = await runBodygraphs(U.OTHER, 21);
    ok(o.first429 === 21, `12a başka tenant'taki uzman normal sınırda (21.'de 429)`, o);
    await su.query(`update public.users set tenant_id=$1 where id=$2`, [TB, U.E1.id]);
    __resetRateLimitForTest();
    const moved = await runBodygraphs(U.E1, 21);
    ok(moved.first429 === 21, "12b izin başka tenant'a taşınmaz: uzmanın tenant'ı değişince izin uygulanmaz (21.'de 429)", moved);
    await su.query(`update public.users set tenant_id=$1 where id=$2`, [TA, U.E1.id]);

    section("15. İzin kontrolünde DB hatası → izin YOK (normal sınır)");
    await su.query(`alter table public.hd_unlimited_grants rename to hd_unlimited_grants_zz`);
    __resetRateLimitForTest();
    const dbErr = await runBodygraphs(U.E1, 21);
    ok(dbErr.first429 === 21, "15a izin tablosu okunamıyorken aktif izin olsa da sınırsız verilmez (21.'de 429)", dbErr);
    const pe = await grantPost(U.OWNER, U.E2.id!);
    ok(pe.status === 500 || pe.status === 400, "15b izin yazılamazsa owner'a hata döner (sessiz başarı yok)", pe.status);
    await su.query(`alter table public.hd_unlimited_grants_zz rename to hd_unlimited_grants`);

    section("5–8. 24 saat: sona erme, normale dönüş, yeniden açma");
    const exp = (await grants(U.E1.id!))[0].expires_at.getTime();
    ok((await lib.readActiveUnlimitedGrant((await import("../../lib/supabase-server")).getServerDb(), U.E1.id!, TA, exp - 1)) !== null, "5 bitişten 1 ms önce izin AKTİF");
    ok((await lib.readActiveUnlimitedGrant((await import("../../lib/supabase-server")).getServerDb(), U.E1.id!, TA, exp)) === null, "6 tam 24. saatte (bitiş anı) izin PASİF");
    // Gerçek zaman: izni 24 saat + 1 sn önce açılmış gibi geri al (CHECK korunur)
    await su.query(`update public.hd_unlimited_grants set granted_at = now() - interval '24 hours 1 second', expires_at = now() - interval '1 second' where user_id=$1`, [U.E1.id]);
    __resetRateLimitForTest();
    const back = await runBodygraphs(U.E1, 21);
    ok(back.first429 === 21 && back.ok200 === 20, `7 süre bitince normal sınır yeniden uygulanır: 20 hesap, 21.'de 429`, back);
    const gExp = await grantGet(U.OWNER, U.E1.id!);
    ok((gExp.json.status as Json).active === false, "7b owner ekranı: süre dolunca durum normal (buton yeniden görünür)", gExp.json);
    const re = await grantPost(U.OWNER, U.E1.id!);
    const rows3 = await grants(U.E1.id!);
    ok(re.json.result === "granted" && rows3.length === 2 && rows3[1].expires_at.getTime() - rows3[1].granted_at.getTime() === 24 * 3600_000, "8 süre bitince owner yeniden 24 saatlik izin açabildi (yeni kayıt)", re.json);
    __resetRateLimitForTest();
    const again2 = await runBodygraphs(U.E1, 22);
    ok(again2.first429 < 0, "8b yeni izinle tekrar sınırsız", again2);

    section("Denetim kayıtları");
    const a1 = await audits(U.E1.id!);
    const results = a1.map((r) => r.result);
    ok(results.filter((r) => r === "granted").length === 2 && results.filter((r) => r === "already_active").length >= 2 && results.includes("forbidden"), "A1 sonuçlar kaydedildi: granted×2, already_active, forbidden", results);
    const gr = a1.filter((r) => r.result === "granted");
    ok(gr.every((r) => r.actor_user_id === U.OWNER.id && r.grant_id && r.expires_at && r.granted_at && r.expires_at.getTime() - r.granted_at.getTime() === 24 * 3600_000), "A2 granted kaydı: owner, izin kimliği, açılış ve otomatik bitiş", gr.length);
    ok((await audits(U.DEMO.id!)).some((r) => r.result === "ineligible" && r.actor_user_id === U.OWNER.id), "A3 uygun olmayan hedef denemesi de kaydedildi (ineligible)");
    const lk = (await su.query(`select count(*)::int n from public.hd_unlimited_grant_audit`)).rows[0].n as number;
    ok(lk > 0 && !JSON.stringify(await grantGet(U.OWNER, U.E1.id!)).includes("audit"), "A4 denetim kayıtları kullanıcıya/API yanıtına açılmaz");

    ok(roxy.external.length === 0, "Z dış ağ çağrısı 0 (gerçek Roxy kredisi harcanmadı)", roxy.external);
  } finally {
    await env.stop();
  }
  console.log(`\nHD 24 SAAT SINIRSIZ İZİN: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });

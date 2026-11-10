/**
 * UZMAN PROFİLİ (F1) — ROUTE + GÜVENLİK HARNESS
 * Gerçek Next route handler'ı (app/api/settings/profile) + gerçek migration (20280102000000) + yerel embedded-postgres +
 * PostgREST şimi (scripts/anamnez/testEnv — yalnız içe aktarılır, değiştirilmez; sorgular service_role yetkisiyle koşar).
 * Production'a SIFIR temas (127.0.0.1); veriler sentetik (@example.test / @example.invalid).
 *
 * Kapsam: oturumsuz / geçersiz oturum / onaysız hesap, kalıcılık (kaydet → oku), alt küme kaydı, boşaltma, A / A2 (aynı
 * tenant) / B (başka tenant) izolasyonu, hesap alanları (ad soyad, e-posta, rol, paket, parola, kimlikler) → 400, bilinmeyen
 * alan, kötü niyetli metin / URL, gövde boyutu, sürüm çakışması (sıralı + eşzamanlı), demo hesap + demo tenant (403, yazma
 * yok), users satırlarının DEĞİŞMEDİĞİ, logo kolonlarının korunması, okunamayan eski değerin korunması, uygulama ↔ DB
 * kural uyumu, migration uygulanmamışken 503, günlüklerde profil içeriği olmaması, yedek / geri yükleme (gerçek motor).
 * Çalıştır: npx tsx scripts/profile/routes.harness.ts
 */
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, seedAnamnez, startAnamnezTestEnv, type Seed, type TestEnv } from "../anamnez/testEnv";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest) => Promise<Response>;

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations/20280102000000_expert_profiles.sql"), "utf8");
/** Günlük sızıntı denetimi için her profil metnine eklenen işaret. */
const SENTINEL = "ZZSENTINELPII";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("boş port alınamadı"))));
    });
  });
}

// Sunucu günlüklerini yakala (yalnız sızıntı denetimi; çıktı yine yazılır).
const logged: string[] = [];
for (const k of ["log", "error", "warn", "info"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (!line.startsWith("  ✓") && !line.startsWith("  ✗") && !line.startsWith("\n[")) logged.push(line);
    orig(...args);
  };
}

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: await freePort(), dirName: "profile-routes-pgdata", extraSql: [MIGRATION] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed: Seed = await seedAnamnez(env.su);
  // Demo vitrini prod'daki gibi KENDİ tenant'ında; aynı tenant'ta demo bayrağı olmayan ikinci hesap (demo tenant engeli).
  const TD = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_PROFILE_DEMO_TENANT')`, [TD]);
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, seed.users.DEMO.id]);
  const demoMate = randomUUID();
  const demoMateTok = `zz-prof-tok-demomate-${demoMate.slice(0, 8)}`;
  await env.su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,'ZZ_PROFILE_DEMO_MATE','zz.profile.demomate@example.test','expert',true,'approved','{"clients":true}','premium','premium',$2,false)`,
    [demoMate, TD],
  );
  await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [demoMate, demoMateTok]);
  console.log(`embedded-postgres + PostgREST şimi hazır (${env.url}).`);

  try {
    const route = await import("../../app/api/settings/profile/route");
    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const asDemo: Auth = { id: U.DEMO.id, token: U.DEMO.token };
    const asDemoMate: Auth = { id: demoMate, token: demoMateTok };

    async function call(handler: unknown, method: string, auth: Auth, body?: unknown, rawBody?: string): Promise<{ status: number; json: Json }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest("http://localhost/api/settings/profile", { method, headers, body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined) });
      const res = await (handler as Handler)(req);
      let json: Json = {};
      try { json = (await res.clone().json()) as Json; } catch { json = {}; }
      return { status: res.status, json };
    }
    const get = (a: Auth) => call(route.GET, "GET", a);
    const put = (a: Auth, body: unknown, raw?: string) => call(route.PUT, "PUT", a, body, raw);
    const row = async (userId: string) => (await env.su.query(`select * from public.expert_profiles where user_id=$1`, [userId])).rows[0];
    const count = async () => Number((await env.su.query(`select count(*) n from public.expert_profiles`)).rows[0].n);
    const usersSnap = async () => JSON.stringify((await env.su.query(`select * from public.users order by id`)).rows);
    const usersBefore = await usersSnap();
    const fullA = {
      title: `Psikolojik Danışman ${SENTINEL}`, organization: `Yaşam Danışmanlık ${SENTINEL}`, phone: "+90 (532) 123-45-67", contactEmail: "ayse.yilmaz@example.invalid",
      website: "https://www.example.invalid/hakkimda", bio: `Ayşe Yılmaz ${SENTINEL}\n15 yıllık deneyim.`, reportNote: `Bu rapor bilgilendirme amaçlıdır. ${SENTINEL}`,
      reportBrandingEnabled: true, reportShowTitle: true, reportShowOrganization: false, reportShowContact: true, reportShowNote: true,
    };

    section("Kimlik");
    ok((await get({})).status === 401, "oturumsuz GET → 401");
    ok((await put({}, { expectedVersion: 0, profile: { title: "x" } })).status === 401, "oturumsuz PUT → 401");
    ok((await get({ id: U.A.id })).status === 401, "belirteçsiz (yalnız x-user-id) GET → 401");
    ok([401, 403].includes((await get({ id: U.A.id, token: U.B.token })).status), "başkasının belirteci → 401/403");
    ok([401, 403].includes((await get({ id: U.A.id, token: "zz-yanlis-belirtec" })).status), "geçersiz belirteç → 401/403");
    for (const k of ["PENDING", "REJECTED"] as const) {
      ok([401, 403].includes((await put({ id: U[k].id, token: U[k].token }, { expectedVersion: 0, profile: { title: "x" } })).status), `${k} hesap yazamaz`);
    }
    ok((await count()) === 0, "reddedilen isteklerde satır yazılmadı");

    section("Varsayılan (kayıt yok)");
    const g0 = await get(asA);
    ok(g0.status === 200 && g0.json.version === 0 && g0.json.profile.reportBrandingEnabled === false && g0.json.profile.title === null && g0.json.readOnly === false, "kayıt yok → boş profil, version 0, markalama kapalı", g0.json);
    ok(g0.json.account?.fullName === "ZZ_ANAMNEZ_A" || typeof g0.json.account?.fullName === "string", "salt-okunur ad soyad users'tan gelir", g0.json.account);
    const aUser = (await env.su.query(`select full_name, email from public.users where id=$1`, [U.A.id])).rows[0];
    ok(g0.json.account.fullName === aUser.full_name && g0.json.account.email === aUser.email, "account = users.full_name / users.email (salt okunur)");
    ok(!("schemaVersion" in g0.json.profile) && !("tenantId" in g0.json) && !("userId" in g0.json.profile), "yanıtta kimlik / iç alan yok");
    ok(g0.json.profile.logoSource === "none" && g0.json.profile.logoAssetId === null, "logo kaynağı varsayılan 'none' (F2)");

    section("Kaydet → oku (kalıcılık)");
    const p1 = await put(asA, { expectedVersion: 0, profile: fullA });
    ok(p1.status === 200 && p1.json.version === 1 && p1.json.profile.title === fullA.title && p1.json.profile.reportShowOrganization === false, "ilk kayıt 200, version 1", p1.json);
    const g1 = await get(asA);
    ok(g1.status === 200 && JSON.stringify(Object.fromEntries(Object.keys(fullA).map((k) => [k, g1.json.profile[k]]))) === JSON.stringify(fullA), "yeniden okuma kaydedilenle birebir aynı");
    const r1 = await row(U.A.id);
    ok(r1.tenant_id === seed.TA && r1.user_id === U.A.id && r1.contact_email === fullA.contactEmail && r1.report_branding_enabled === true, "satır oturumdaki tenant + kullanıcıya yazıldı");

    section("Alt küme / boşaltma");
    const p2 = await put(asA, { expectedVersion: 1, profile: { phone: "0532 123 45 67" } });
    ok(p2.status === 200 && p2.json.version === 2 && p2.json.profile.phone === "0532 123 45 67" && p2.json.profile.title === fullA.title && p2.json.profile.bio === fullA.bio && p2.json.profile.reportBrandingEnabled === true, "eksik alanlarla kayıt: yalnız gönderilen alan değişir", p2.json);
    const p3 = await put(asA, { expectedVersion: 2, profile: { website: "", bio: "   \n  " } });
    ok(p3.status === 200 && p3.json.profile.website === null && p3.json.profile.bio === null && (await row(U.A.id)).website === null, "boş metin → null (alan temizlenir)");
    const p4 = await put(asA, { expectedVersion: 3, profile: {} });
    ok(p4.status === 200 && p4.json.version === 4, "boş yama kabul (yalnız sürüm artar)");
    ok((await put(asA, { expectedVersion: 4 })).status === 400, "profil alanı olmadan 400");

    section("İzolasyon (A / A2 aynı tenant / B başka tenant)");
    const gA2 = await get(asA2);
    const gB = await get(asB);
    ok(gA2.status === 200 && gA2.json.version === 0 && gA2.json.profile.title === null, "A2 (aynı tenant) A'nın profilini görmez");
    ok(gB.status === 200 && gB.json.version === 0 && gB.json.profile.title === null, "B (başka tenant) A'nın profilini görmez");
    const aBefore = JSON.stringify(await row(U.A.id));
    const pa2 = await put(asA2, { expectedVersion: 0, profile: { title: "A2 unvanı" } });
    const pb = await put(asB, { expectedVersion: 0, profile: { title: "B unvanı" } });
    ok(pa2.status === 200 && pb.status === 200 && JSON.stringify(await row(U.A.id)) === aBefore, "A2 ve B kendi profillerini yazar; A'nın satırı birebir aynı");
    ok((await row(U.A2.id)).tenant_id === seed.TA && (await row(U.B.id)).tenant_id === seed.TB, "her satır kendi tenant'ında");
    const spoof = await put(asB, { expectedVersion: 1, profile: { title: "B yeni" }, user_id: U.A.id } as Json);
    ok(spoof.status === 400 && spoof.json.path === "user_id" && JSON.stringify(await row(U.A.id)) === aBefore, "gövdeyle user_id taşıma → 400; A değişmez");

    section("Hesap alanları / bilinmeyen alan → 400");
    const aSnap = JSON.stringify(await row(U.A.id));
    for (const [k, v] of [["full_name", "Sahte Ad"], ["fullName", "Sahte Ad"], ["name", "x"], ["email", "x@example.invalid"], ["password", "Parola123!"], ["role", "admin"], ["package_type", "premium"], ["plan", "premium"],
      ["tenant_id", seed.TB], ["user_id", U.B.id], ["is_demo_account", false], ["module_permissions", { all: true }], ["admin_level", "main"], ["logoAssetId", randomUUID()], ["logo_source", "custom"]] as const) {
      const r = await put(asA, { expectedVersion: 4, profile: { title: "x", [k]: v } });
      ok(r.status === 400 && r.json.path === `profile.${k}`, `profile.${k} → 400`, r.json);
    }
    for (const k of ["fullName", "email", "role", "tenantId", "version"]) {
      const r = await put(asA, { expectedVersion: 4, profile: { title: "x" }, [k]: "x" });
      ok(r.status === 400 && r.json.path === k, `üst düzey ${k} → 400`);
    }
    ok((await put(asA, { expectedVersion: 4, profile: { titel: "x" } })).json.path === "profile.titel", "yazım hatalı alan → 400 (yol ile)");
    ok(JSON.stringify(await row(U.A.id)) === aSnap, "reddedilen isteklerin hiçbiri A'nın satırını değiştirmedi");

    section("Kötü niyetli metin / URL → alan bazlı 400");
    const evil: [string, unknown][] = [
      ["website", "javascript:alert(1)"], ["website", "data:text/html,<script>alert(1)</script>"], ["website", "http://example.invalid"], ["website", "https://user:pw@example.invalid"],
      ["website", "https://127.0.0.1"], ["title", "a".repeat(81)], ["bio", "a".repeat(1001)], ["reportNote", "a".repeat(301)], ["title", "abc\u202Edef"], ["bio", "x\u2066y"],
      ["organization", "a\u0000b"], ["bio", "<script>alert(1)</script>"], ["title", "<img src=x onerror=alert(1)>"], ["phone", "0532-ABC"], ["contactEmail", "not-an-email"], ["reportBrandingEnabled", "true"],
    ];
    for (const [k, v] of evil) {
      const r = await put(asA, { expectedVersion: 4, profile: { [k]: v } });
      ok(r.status === 400 && r.json.fields && typeof r.json.fields[k] === "string" && r.json.path === `profile.${k}`, `${k}=${JSON.stringify(v).slice(0, 40)} → 400 + fields.${k}`, r.json);
    }
    const many = await put(asA, { expectedVersion: 4, profile: { title: "a".repeat(81), website: "http://x.com", phone: "abc" } });
    ok(many.status === 400 && Object.keys(many.json.fields ?? {}).length === 3, "birden çok geçersiz alan tek yanıtta döner");
    ok(JSON.stringify(await row(U.A.id)) === aSnap, "kötü niyetli isteklerin hiçbiri satırı değiştirmedi");
    const okText = await put(asA, { expectedVersion: 4, profile: { bio: "3 < 5 ve <3 — \"tırnak\" & 'tek' ' OR 1=1 --" } });
    ok(okText.status === 200 && okText.json.profile.bio === "3 < 5 ve <3 — \"tırnak\" & 'tek' ' OR 1=1 --", "doğal < > & tırnak / SQL benzeri metin olduğu gibi METİN olarak saklanır");

    section("Gövde");
    ok((await put(asA, undefined, "{bozuk")).status === 400, "bozuk JSON → 400");
    ok((await put(asA, undefined, "[1,2]")).status === 400, "dizi gövde → 400");
    ok((await put(asA, undefined, JSON.stringify({ expectedVersion: 5, profile: { bio: "a".repeat(17_000) } }))).status === 413, "16 KB üstü gövde → 413");
    ok((await put(asA, { expectedVersion: -1, profile: {} })).status === 400 && (await put(asA, { expectedVersion: "5", profile: {} })).status === 400, "geçersiz expectedVersion → 400");

    section("Sürüm çakışması");
    const cur = (await get(asA)).json.version as number;
    const stale = await put(asA, { expectedVersion: cur - 1, profile: { title: "Eski sekme" } });
    ok(stale.status === 409 && stale.json.code === "VERSION_CONFLICT" && stale.json.version === cur && stale.json.profile.title === fullA.title, "eski sürüm → 409 + güncel profil", stale.json);
    const again0 = await put(asA, { expectedVersion: 0, profile: { title: "Yeni sanıp" } });
    ok(again0.status === 409 && again0.json.version === cur, "satır varken expectedVersion 0 → 409");
    const race = await Promise.all([put(asA, { expectedVersion: cur, profile: { title: "Sekme 1" } }), put(asA, { expectedVersion: cur, profile: { title: "Sekme 2" } }), put(asA, { expectedVersion: cur, profile: { title: "Sekme 3" } })]);
    ok(race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 2, "aynı sürümle 3 eşzamanlı kayıttan yalnız 1'i uygulanır", race.map((r) => r.status));
    ok((await row(U.A.id)).version === cur + 1, "sürüm tam 1 arttı");
    const fresh = randomUUID();
    await env.su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account) values ($1,'ZZ Yeni','zz.yeni@example.test','expert',true,'approved','{"clients":true}','premium','premium',$2,false)`,
      [fresh, seed.TB],
    );
    await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-prof-tok-fresh')`, [fresh]);
    const usersBeforeFresh = await usersSnap();
    const asFresh: Auth = { id: fresh, token: "zz-prof-tok-fresh" };
    const race0 = await Promise.all([put(asFresh, { expectedVersion: 0, profile: { title: "İlk 1" } }), put(asFresh, { expectedVersion: 0, profile: { title: "İlk 2" } })]);
    ok(race0.filter((r) => r.status === 200).length === 1 && race0.filter((r) => r.status === 409).length === 1, "ilk kayıtta eşzamanlı iki ekleme → biri 200, diğeri 409 (UNIQUE)", race0.map((r) => r.status));

    section("Demo hesap / demo tenant");
    const gd = await get(asDemo);
    ok(gd.status === 200 && gd.json.readOnly === true, "demo GET 200, readOnly=true");
    const pd = await put(asDemo, { expectedVersion: 0, profile: { title: "Demo" } });
    ok(pd.status === 403 && pd.json.code === "DEMO_READONLY" && !(await row(U.DEMO.id)), "demo hesap PUT → 403 (DEMO_READONLY), satır yok", pd.json);
    const gm = await get(asDemoMate);
    ok(gm.status === 200 && gm.json.readOnly === true, "demo tenant'taki hesap da salt okunur");
    ok((await put(asDemoMate, { expectedVersion: 0, profile: { title: "x" } })).status === 403 && !(await row(demoMate)), "demo tenant yazma → 403, satır yok");

    section("users tablosu değişmez");
    ok((await usersSnap()) === usersBeforeFresh, "profil yazmaları public.users satırlarını DEĞİŞTİRMEDİ (ad soyad / e-posta / rol / paket aynı)");
    ok(usersBefore.length > 0 && JSON.parse(usersBeforeFresh).length === JSON.parse(usersBefore).length + 1, "users'a yalnız harness'ın kendi eklediği sentetik hesap eklendi");

    section("F2 kolonları korunur / okunamayan eski değer korunur");
    const asset = randomUUID();
    await env.su.query(`update public.expert_profiles set logo_asset_id=$2, logo_source='custom', version=version+1 where user_id=$1`, [U.A2.id, asset]);
    const gl = await get(asA2);
    ok(gl.json.profile.logoSource === "custom" && gl.json.profile.logoAssetId === asset, "GET logo kaynağını / kimliğini salt okunur döner");
    const pl = await put(asA2, { expectedVersion: gl.json.version, profile: { title: "A2 yeni" } });
    const rl = await row(U.A2.id);
    ok(pl.status === 200 && rl.logo_asset_id === asset && rl.logo_source === "custom", "F1 PUT logo kolonlarına DOKUNMAZ");
    const legacyBio = Array.from({ length: 25 }, (_, i) => `satır ${i}`).join("\n"); // DB kabul eder (≤1000), uygulama 20 satır sınırı
    await env.su.query(`update public.expert_profiles set bio=$2, version=version+1 where user_id=$1`, [U.A2.id, legacyBio]);
    const gLeg = await get(asA2);
    ok(gLeg.json.profile.bio === null, "bugünkü kurala uymayan eski değer gösterilmez");
    const pLeg = await put(asA2, { expectedVersion: gLeg.json.version, profile: { organization: "A2 Kurum" } });
    ok(pLeg.status === 200 && (await row(U.A2.id)).bio === legacyBio, "başka alan kaydedilince okunamayan eski değer veritabanında KORUNUR");

    section("Uygulama ↔ veritabanı kural uyumu (uygulamanın kabul ettiği her değer DB'ye yazılır)");
    const corpus: Json = {
      title: ["ş".repeat(80), "Dr. Öğr. Üyesi — Aile & Çift Terapisti", "3 < 5", "🙂".repeat(80)],
      organization: ["a".repeat(120), "Yaşam Merkezi (İstanbul)", "A > B"],
      phone: ["+90 (532) 123-45-67", "05321234567", "+1 202 555 0100", "1".repeat(15)],
      contactEmail: ["ayse.yilmaz+rapor@example.invalid", "a@b.co", "x".repeat(64) + "@" + "d".repeat(60) + ".example.invalid"],
      website: ["https://www.example.invalid", "https://xn--rnek-zoa.com:8443/a?b=c#d", "https://" + ("a".repeat(60) + ".").repeat(3) + "com/abcd"],
      bio: ["🙂".repeat(1000), Array.from({ length: 20 }, () => "x").join("\n"), "Aile 👨\u200D👩\u200D👧 danışmanlığı <3"],
      reportNote: ["a".repeat(300), "a\nb\nc\nd"],
    };
    let ver = (await get(asB)).json.version as number;
    let parity = 0;
    const parityFail: string[] = [];
    for (const [k, vals] of Object.entries(corpus)) {
      for (const v of vals as string[]) {
        const r = await put(asB, { expectedVersion: ver, profile: { [k]: v } });
        if (r.status === 200 && r.json.profile[k] === v) { parity++; ver = r.json.version; }
        else parityFail.push(`${k}:${r.status}:${JSON.stringify(r.json).slice(0, 120)}`);
      }
    }
    ok(parityFail.length === 0 && parity > 15, `uygulamanın kabul ettiği ${parity} sınır değeri DB CHECK'lerinden de geçer`, parityFail);

    section("Yedek / geri yükleme (gerçek motor: lib/backup/engine)");
    const { exportTableAll, restoreChunk } = await import("../../lib/backup/engine");
    const { getRegistryEntry, isRestorable } = await import("../../lib/backup/registry");
    const { getServerDb } = await import("../../lib/supabase-server");
    const sdb = getServerDb();
    const ctxOf = (userId: string, tenantId: string) => ({ tenantId, userId, role: "expert", modulePermissions: { clients: true }, membershipActive: true });
    const e = getRegistryEntry("expert_profiles")!;
    ok(!!e && isRestorable(e) && e.naturalKey === "user_id" && JSON.stringify(e.ownerScope) === JSON.stringify({ column: "user_id" }), "expert_profiles yedek kapsamında, geri yüklenebilir, kullanıcı bazlı");
    const expA = await exportTableAll(sdb, e, seed.TA, { ownerUserId: U.A.id });
    ok(expA.complete && expA.rows.length === 1 && expA.rows[0].user_id === U.A.id, "A'nın dışa aktarması yalnız A'nın profilini içerir (aynı tenant'taki A2 hariç)", { n: expA.rows.length });
    ok((await exportTableAll(sdb, e, seed.TA)).complete === false, "kullanıcı kimliği olmadan kişisel kayıt okunmaz");
    const aNow = JSON.stringify(await row(U.A.id));
    const rr = await restoreChunk(sdb, ctxOf(U.A.id, seed.TA), "expert_profiles", expA.rows);
    ok(rr.inserted === 0 && JSON.stringify(await row(U.A.id)) === aNow, "geri yükleme mevcut profili EZMEZ", rr);
    const rB = await restoreChunk(sdb, ctxOf(U.B.id, seed.TB), "expert_profiles", expA.rows);
    ok(rB.inserted === 0 && (await row(U.B.id)).title !== fullA.title, "başka tenant'ın yedeği B'nin profiline yazılamaz", rB.failed);
    await env.su.query(`delete from public.expert_profiles where user_id=$1`, [U.A.id]); // yalnız sentetik test verisi
    const rBack = await restoreChunk(sdb, ctxOf(U.A.id, seed.TA), "expert_profiles", expA.rows);
    const back = await row(U.A.id);
    ok(rBack.inserted === 1 && back?.title === expA.rows[0].title && back.version === expA.rows[0].version && back.tenant_id === seed.TA, "kayıp profil yedekten geri gelir", rBack);
    const crafted = { ...expA.rows[0], id: randomUUID(), tenant_id: seed.TB, user_id: U.B.id, website: "javascript:alert(1)" };
    await env.su.query(`delete from public.expert_profiles where user_id=$1`, [U.A2.id]);
    const rCraft = await restoreChunk(sdb, ctxOf(U.A2.id, seed.TA), "expert_profiles", [crafted]);
    ok(rCraft.inserted === 0 && !(await row(U.A2.id)), "elle düzenlenmiş yedekteki geçersiz değer (javascript: site) DB CHECK ile reddedilir", rCraft);

    section("Migration uygulanmamış (tablo yok) → 503, 500 değil");
    await env.su.query(`alter table public.expert_profiles rename to expert_profiles_zz_hidden`);
    const g503 = await get(asA);
    const p503 = await put(asA, { expectedVersion: 1, profile: { title: "x" } });
    await env.su.query(`alter table public.expert_profiles_zz_hidden rename to expert_profiles`);
    ok(g503.status === 503 && g503.json.code === "PROFILE_UNAVAILABLE" && p503.status === 503, "tablo yokken GET/PUT 503 PROFILE_UNAVAILABLE", [g503.status, p503.status, g503.json]);
    ok((await get(asA)).status === 200, "tablo geri gelince normal");

    section("Uç yüzeyi + günlük");
    ok(!("DELETE" in route) && !("POST" in route) && !("PATCH" in route), "yalnız GET + PUT (silme ucu yok)");
    const leak = logged.filter((l) => l.includes(SENTINEL) || l.includes("ayse.yilmaz@example.invalid") || l.includes("+90 (532)"));
    ok(leak.length === 0, "sunucu günlüklerinde profil içeriği / iletişim bilgisi YOK", leak.slice(0, 3));
  } finally {
    await env.stop();
  }

  console.log(`\nprofile routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

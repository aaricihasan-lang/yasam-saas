/**
 * UZMAN PROFİLİ (F2) — RAPOR LOGOSU ROUTE + PG + ÇÖZÜCÜ HARNESS
 * Gerçek Next route handler'ları (profile/logo, profile, workspace assets + design) + gerçek migration'lar (20271227000000 +
 * 20271228000000 + 20280102000000) + yerel embedded-postgres + PostgREST şimi + Storage emülatörü (scripts/anamnez/testEnv —
 * yalnız içe aktarılır). Production'a SIFIR temas (127.0.0.1); veriler sentetik (@example.test).
 *
 * Kapsam: kimlik, gövde doğrulaması, sahiplik (başka uzman / başka tenant / olmayan / silinmiş / fotoğraf → AYNI 400),
 * kaydet + sürüm çakışması (409), F1 profil PUT'unun logo kolonlarını koruması, silme koruması (rapor logosu → 409; seçim
 * kaldırılınca silinir), çalışma alanı modu (uygulanan tasarımdaki güncel logo; tasarımdan kaldırılınca logosuz, dosya
 * silinmez), erişim kapalı (bayrak / kademeli açılış), demo hesap + demo tenant 403, çözücü (PNG, ≤ 600 px, markalama
 * kapalı → null, yedekten gelen yabancı uuid → null, Storage dosyası yok / bozuk → null, zaman aşımı → null, istek başına
 * tek okuma), profil tablosu yokken (migration uygulanmamış) görsel silmenin çalışması, günlüklerde kimlik olmaması.
 * Çalıştır: npx tsx scripts/profile/logo.harness.ts
 */
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const MIGS = ["20271227000000_expert_workspace_designs_prefs.sql", "20271228000000_expert_workspace_assets_access.sql", "20280102000000_expert_profiles.sql"]
  .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

// Sunucu günlüklerini yakala (kimlik sızıntısı denetimi; çıktı yine yazılır).
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
  const env: TestEnv = await startAnamnezTestEnv({ port: await freePort(), dirName: "profile-logo-pgdata", extraSql: MIGS });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.REQUIRE_DB_SUPER_ADMIN_MARKER = "true";
  process.env.EXPERT_WORKSPACE_DESIGN_ENABLED = "true";
  process.env.EXPERT_WORKSPACE_ROLLOUT_ALL = "true";
  const seed: Seed = await seedAnamnez(env.su);
  // Demo vitrini KENDİ tenant'ında + aynı tenant'ta demo bayrağı olmayan ikinci hesap (demo tenant engeli).
  const TD = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_LOGO_DEMO_TENANT')`, [TD]);
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, seed.users.DEMO.id]);
  const demoMate = randomUUID();
  const demoMateTok = `zz-logo-tok-demomate-${demoMate.slice(0, 8)}`;
  await env.su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,'ZZ_LOGO_DEMO_MATE','zz.logo.demomate@example.test','expert',true,'approved','{"clients":true}','premium','premium',$2,false)`,
    [demoMate, TD],
  );
  await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [demoMate, demoMateTok]);
  console.log(`embedded-postgres + PostgREST şimi + Storage emülatörü hazır (${env.url}).`);

  try {
    const logoRoute = await import("../../app/api/settings/profile/logo/route");
    const profileRoute = await import("../../app/api/settings/profile/route");
    const startRoute = await import("../../app/api/settings/workspace/assets/uploads/route");
    const chunkRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/chunks/[index]/route");
    const completeRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/complete/route");
    const assetRoute = await import("../../app/api/settings/workspace/assets/[assetId]/route");
    const designRoute = await import("../../app/api/settings/workspace/design/route");
    const { resolveReportLogo, reportLogoLoader } = await import("../../lib/profile/reportLogo");
    const { getProfile } = await import("../../lib/profile/service");
    const { REPORT_LOGO_REF } = await import("../../lib/workspace/assets");
    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const asDemo: Auth = { id: U.DEMO.id, token: U.DEMO.token };
    const asDemoMate: Auth = { id: demoMate, token: demoMateTok };
    const ownerA = { tenantId: seed.TA, userId: U.A.id };
    const ownerA2 = { tenantId: seed.TA, userId: U.A2.id };
    const ownerB = { tenantId: seed.TB, userId: U.B.id };
    const db: SupabaseClient = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    async function call(handler: unknown, method: string, auth: Auth, opts: { body?: unknown; raw?: Uint8Array; rawJson?: string; params?: Record<string, string> } = {}): Promise<{ status: number; json: Json }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      let body: BodyInit | undefined;
      if (opts.raw) { headers["content-type"] = "application/octet-stream"; headers["content-length"] = String(opts.raw.length); body = Buffer.from(opts.raw); }
      else if (opts.rawJson !== undefined) { headers["content-type"] = "application/json"; body = opts.rawJson; }
      else if (opts.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.body); }
      const req = new NextRequest("http://localhost/api/test", { method, headers, body });
      const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
      let json: Json = {};
      if ((res.headers.get("content-type") ?? "").includes("json")) { try { json = (await res.clone().json()) as Json; } catch { json = {}; } }
      return { status: res.status, json };
    }
    const lget = (a: Auth) => call(logoRoute.GET, "GET", a);
    const lput = (a: Auth, body: unknown) => call(logoRoute.PUT, "PUT", a, { body });
    const del = (a: Auth, assetId: string) => call(assetRoute.DELETE, "DELETE", a, { params: { assetId }, body: { confirm: true } });
    const row = async (userId: string) => (await env.su.query(`select * from public.expert_profiles where user_id=$1`, [userId])).rows[0];
    const count = async () => Number((await env.su.query(`select count(*) n from public.expert_profiles`)).rows[0].n);
    const objectsUnder = (prefix: string) => [...(env.storage.objects.get("expert-workspace")?.keys() ?? [])].filter((k) => k.startsWith(prefix));

    async function upload(a: Auth, kind: "logo" | "photo", bytes: Buffer, fileName: string): Promise<string> {
      const s = await call(startRoute.POST, "POST", a, { body: { kind, fileName, mimeType: "image/png", size: bytes.length } });
      if (s.status !== 200) throw new Error(`upload start ${s.status} ${JSON.stringify(s.json)}`);
      const { uploadId, chunkSize, chunkCount } = s.json as { uploadId: string; chunkSize: number; chunkCount: number };
      for (let i = 0; i < chunkCount; i++) {
        const c = await call(chunkRoute.PUT, "PUT", a, { raw: bytes.subarray(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize)), params: { uploadId, index: String(i) } });
        if (c.status !== 200) throw new Error(`chunk ${c.status}`);
      }
      const done = await call(completeRoute.POST, "POST", a, { params: { uploadId } });
      if (done.status !== 200) throw new Error(`complete ${done.status} ${JSON.stringify(done.json)}`);
      return done.json.asset.id as string;
    }
    const png = (w: number, h: number, alpha = 1, color = { r: 18, g: 122, b: 90 }) =>
      sharp({ create: { width: w, height: h, channels: 4, background: { ...color, alpha } } }).png().toBuffer();
    const transparent = async (w: number, h: number) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${w / 4}" y="${h / 4}" width="${w / 2}" height="${h / 2}" fill="#1f3a5f"/></svg>`)).png().toBuffer();

    section("Hazırlık: sentetik logolar (mevcut yükleme akışıyla)");
    const L1 = await upload(asA, "logo", await transparent(1600, 400), "logo-yatay.png");
    const L2 = await upload(asA, "logo", await png(400, 1200), "logo-dikey.png");
    const L3 = await upload(asA, "logo", await png(1200, 300), "logo-3.png");
    const L4 = await upload(asA, "logo", await png(900, 900, 1, { r: 200, g: 60, b: 40 }), "logo-kare.png");
    const L5 = await upload(asA, "logo", await png(500, 500), "logo-5.png");
    const L6 = await upload(asA, "logo", await png(320, 120), "logo-6.png");
    const P1 = await upload(asA, "photo", await png(1600, 1000), "foto.png");
    const LA2 = await upload(asA2, "logo", await png(600, 200), "a2.png");
    const LB = await upload(asB, "logo", await png(600, 200), "b.png");
    ok([L1, L2, L3, L4, L5, L6, P1, LA2, LB].every((x) => typeof x === "string"), "9 görsel yüklendi (A: 6 logo + 1 foto; A2: 1; B: 1)");

    section("Kimlik + varsayılan durum");
    ok([401, 403].includes((await lget({})).status), "oturumsuz GET → 401/403");
    ok([401, 403].includes((await lput({}, { source: "none", expectedVersion: 0 })).status), "oturumsuz PUT → 401/403");
    ok([401, 403].includes((await lget({ id: U.PENDING.id, token: U.PENDING.token })).status), "onaysız hesap → 401/403");
    ok([401, 403].includes((await lget({ id: U.A.id, token: U.B.token })).status), "başkasının oturum belirteci → 401/403");
    const g0 = await lget(asA);
    ok(g0.status === 200 && g0.json.logo.source === "none" && g0.json.logo.status === "none" && g0.json.logo.assetId === null && g0.json.version === 0, "varsayılan: logo yok, sürüm 0", g0.json);
    ok(g0.json.workspace.access === true && g0.json.workspace.logoAssetId === null && g0.json.brandingEnabled === false, "erişim açık, tasarım logosu yok, markalama kapalı");
    ok(!JSON.stringify(g0.json).includes("storage") && !JSON.stringify(g0.json).includes(".webp"), "yanıtta Storage yolu / URL yok");
    ok((await count()) === 0, "GET satır oluşturmaz");

    section("Gövde doğrulaması");
    for (const [label, body, p] of [
      ["bilinmeyen alan", { source: "none", expectedVersion: 0, userId: U.B.id }, "userId"],
      ["kaynak geçersiz", { source: "https", expectedVersion: 0 }, "source"],
      ["custom + assetId yok", { source: "custom", expectedVersion: 0 }, "assetId"],
      ["custom + yol benzeri assetId", { source: "custom", assetId: "../x", expectedVersion: 0 }, "assetId"],
      ["none + assetId", { source: "none", assetId: L1, expectedVersion: 0 }, "assetId"],
      ["sürüm yok", { source: "none" }, "expectedVersion"],
    ] as [string, unknown, string][]) {
      const r = await lput(asA, body);
      ok(r.status === 400 && r.json.path === p, `${label} → 400 (${p})`, r.json);
    }
    ok((await call(logoRoute.PUT, "PUT", asA, { rawJson: "{bozuk" })).status === 400, "bozuk JSON → 400");
    ok((await call(logoRoute.PUT, "PUT", asA, { rawJson: JSON.stringify({ source: "none", expectedVersion: 0, x: "a".repeat(20000) }) })).status === 413, "16 KB üstü gövde → 413");

    section("Sahiplik: başka uzman / başka tenant / olmayan / fotoğraf → AYNI 400");
    const rB = await lput(asA, { source: "custom", assetId: LB, expectedVersion: 0 });
    const rA2 = await lput(asA, { source: "custom", assetId: LA2, expectedVersion: 0 });
    const rNone = await lput(asA, { source: "custom", assetId: randomUUID(), expectedVersion: 0 });
    const rPhoto = await lput(asA, { source: "custom", assetId: P1, expectedVersion: 0 });
    ok(rB.status === 400 && rB.json.code === "LOGO_ASSET_INVALID", "başka tenant'ın (B) logosu → 400 LOGO_ASSET_INVALID", rB.json);
    ok(rA2.status === 400 && rNone.status === 400 && rPhoto.status === 400, "aynı tenant başka uzman (A2) / olmayan uuid / fotoğraf türü → 400");
    const bodies = [rB, rA2, rNone, rPhoto].map((r) => JSON.stringify(r.json));
    ok(new Set(bodies).size === 1, "dört durumda yanıt gövdesi BİREBİR aynı (varlık bilgisi sızmaz)", bodies);
    ok((await count()) === 0, "reddedilen isteklerde satır yazılmadı");

    section("Kaydet + sürüm çakışması + F1 uyumu");
    const s1 = await lput(asA, { source: "custom", assetId: L1, expectedVersion: 0 });
    ok(s1.status === 200 && s1.json.version === 1 && s1.json.logo.source === "custom" && s1.json.logo.assetId === L1 && s1.json.logo.status === "ok", "kendi logosu → 200, sürüm 1, durum ok", s1.json);
    const r1 = await row(U.A.id);
    ok(r1.logo_source === "custom" && r1.logo_asset_id === L1 && r1.tenant_id === seed.TA && r1.title === null && r1.report_branding_enabled === false, "DB: yalnız logo kolonları dolu; markalama varsayılan kapalı");
    const stale = await lput(asA, { source: "none", expectedVersion: 0 });
    ok(stale.status === 409 && stale.json.code === "VERSION_CONFLICT" && stale.json.logo.assetId === L1 && stale.json.version === 1, "eski sürümle yazma → 409 + güncel seçim", stale.json);
    ok((await row(U.A.id)).logo_source === "custom", "409 sonrası seçim değişmedi");
    const pf = await call(profileRoute.PUT, "PUT", asA, { body: { expectedVersion: 1, profile: { title: "Refleksoloji Uzmanı", organization: "Ayşe Yılmaz Yaşam Merkezi", reportBrandingEnabled: true } } });
    ok(pf.status === 200 && pf.json.version === 2 && pf.json.profile.logoSource === "custom" && pf.json.profile.logoAssetId === L1, "F1 profil PUT logo kolonlarını KORUR (sürüm ortak: 2)", pf.json);
    const pfLogo = await call(profileRoute.PUT, "PUT", asA, { body: { expectedVersion: 2, profile: { logoSource: "none" } } });
    ok(pfLogo.status === 400, "F1 profil ucundan logo kolonu yazılamaz (400)");
    const staleAfterProfile = await lput(asA, { source: "none", expectedVersion: 1 });
    ok(staleAfterProfile.status === 409, "profil formu kaydından sonra eski sürümle logo yazımı → 409");

    section("Silme koruması (rapor logosu)");
    const d1 = await del(asA, L1);
    ok(d1.status === 409 && d1.json.code === "asset_in_use" && d1.json.where.includes(REPORT_LOGO_REF), "rapor logosu olan görsel silinmez → 409 asset_in_use", d1.json);
    ok(/rapor logosu/.test(d1.json.error) && /Profilim/.test(d1.json.error) && !/tasarımdan kaldırın/.test(d1.json.error), "mesaj: rapor logosu olarak kullanıldığını ve nereden değiştirileceğini söyler", d1.json.error);
    ok(objectsUnder(`${seed.TA}/${U.A.id}/${L1}/`).length === 2 && !(await env.su.query(`select deleted_at from public.expert_workspace_assets where id=$1`, [L1])).rows[0].deleted_at, "korunan logonun dosyaları ve kaydı yerinde");
    ok((await del(asA2, L1)).status === 404, "başka uzman silmeye çalışırsa 404 (koruma bilgisi sızmaz)");
    const s2 = await lput(asA, { source: "none", expectedVersion: 2 });
    ok(s2.status === 200 && s2.json.version === 3 && (await row(U.A.id)).logo_asset_id === null, "seçim kaldırıldı → logo_asset_id null, sürüm 3", s2.json);
    const d1b = await del(asA, L1);
    ok(d1b.status === 200 && objectsUnder(`${seed.TA}/${U.A.id}/${L1}/`).length === 0, "seçim kaldırılınca aynı görsel silinir", d1b.json);
    const rDel = await lput(asA, { source: "custom", assetId: L1, expectedVersion: 3 });
    ok(rDel.status === 400 && JSON.stringify(rDel.json) === bodies[0], "silinmiş görsel seçilemez → aynı 400");

    section("Çözücü: özel logo → PNG");
    ok((await lput(asA, { source: "custom", assetId: L3, expectedVersion: 3 })).status === 200, "L3 (1200×300) seçildi (sürüm 4)");
    const prof = await getProfile(db, ownerA);
    ok(prof.ok && prof.state.reportBrandingEnabled === true && prof.state.logoSource === "custom", "profil: markalama açık + custom");
    const logo = await resolveReportLogo(db, ownerA);
    ok(!!logo && logo.width === 600 && logo.height === 150 && logo.data.subarray(1, 4).toString("latin1") === "PNG", "resolveReportLogo → PNG 600×150 (oran korunur)", logo && { w: logo.width, h: logo.height });
    ok(!!logo && logo.data.length <= 1_000_000, "PNG ≤ 1 MB");
    if (prof.ok) {
      ok((await resolveReportLogo(db, ownerA, { profile: { ...prof.state, reportBrandingEnabled: false } })) === null, "markalama kapalı → null (rapor bugünküyle aynı)");
      ok((await resolveReportLogo(db, ownerA, { profile: { ...prof.state, logoSource: "none", logoAssetId: null } })) === null, "logo kaynağı none → null");
    }

    section("Çözücü: istek başına tek okuma (önbellek yok)");
    let downloads = 0;
    const counting = new Proxy(db, {
      get(t, k) {
        if (k === "storage") {
          return {
            from: (bucket: string) => {
              const s = t.storage.from(bucket);
              return new Proxy(s, {
                get(s2, k2) {
                  if (k2 === "download") return (...a: Parameters<typeof s2.download>) => { downloads++; return s2.download(...a); };
                  const v = (s2 as unknown as Record<string | symbol, unknown>)[k2];
                  return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(s2) : v;
                },
              });
            },
          };
        }
        const v = (t as unknown as Record<string | symbol, unknown>)[k];
        return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(t) : v;
      },
    }) as SupabaseClient;
    const load = reportLogoLoader(counting, ownerA);
    const [x1, x2] = await Promise.all([load(), load()]);
    const x3 = await load();
    ok(downloads === 1 && x1 === x2 && x2 === x3 && !!x1, "aynı rapor üretiminde 3 çağrı → 1 Storage okuması, aynı sonuç", { downloads });
    downloads = 0;
    const loadB = reportLogoLoader(counting, ownerB);
    ok((await loadB()) === null && downloads === 0, "başka uzmanın yükleyicisi A'nın sonucunu paylaşmaz (B: logo yok → null, okuma yok)");
    const fresh = reportLogoLoader(counting, ownerA);
    await fresh();
    ok(downloads === 1, "yeni rapor (yeni yükleyici) yeniden okur — kullanıcılar / istekler arası paylaşılan önbellek yok");

    section("Çözücü: yedekten gelen yabancı kimlik + bozuk / eksik dosya + zaman aşımı → null");
    await env.su.query(
      `insert into public.expert_profiles(tenant_id, user_id, logo_source, logo_asset_id, report_branding_enabled, version) values ($1,$2,'custom',$3,true,1)`,
      [seed.TA, U.A2.id, L3],
    );
    ok((await resolveReportLogo(db, ownerA2)) === null, "A2 satırına A'nın logo uuid'si (geri yüklenmiş yedek benzetimi) → null (sahiplik her okumada doğrulanır)");
    const gA2 = await lget(asA2);
    ok(gA2.status === 200 && gA2.json.logo.status === "missing", "A2 Profilim: 'Logo bulunamadı, yeniden seçin' durumu (missing)", gA2.json.logo);
    await env.su.query(
      `insert into public.expert_profiles(tenant_id, user_id, logo_source, logo_asset_id, report_branding_enabled, version) values ($1,$2,'custom',$3,true,1)`,
      [seed.TB, U.B.id, L3],
    );
    ok((await resolveReportLogo(db, ownerB)) === null, "başka tenant (B) satırında A'nın uuid'si → null");
    ok((await lput(asA2, { source: "none", expectedVersion: 1 })).status === 200, "A2 yabancı seçimi kaldırabilir");
    const desk = `${seed.TA}/${U.A.id}/${L3}/desktop.webp`;
    const bucket = env.storage.objects.get("expert-workspace")!;
    const saved = bucket.get(desk)!;
    bucket.set(desk, { ...saved, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    ok((await resolveReportLogo(db, ownerA)) === null, "depodaki dosya SVG/metinle değiştirilmiş → null (rapor çökmez)");
    bucket.set(desk, { ...saved, bytes: Buffer.alloc(0) });
    ok((await resolveReportLogo(db, ownerA)) === null, "depodaki dosya boş → null");
    bucket.delete(desk);
    ok((await resolveReportLogo(db, ownerA)) === null, "depoda dosya yok → null");
    bucket.set(desk, saved);
    ok(!!(await resolveReportLogo(db, ownerA)), "dosya geri gelince yine çözülür");
    ok((await resolveReportLogo(db, ownerA, { timeoutMs: 0 })) === null, "zaman sınırı aşılırsa → null");
    await env.su.query(`update public.expert_workspace_assets set deleted_at = now(), deleted_by = $2 where id = $1`, [L3, U.A.id]);
    ok((await resolveReportLogo(db, ownerA)) === null, "seçili logo (yarış / eski veri ile) silinmiş işaretli → null");
    const gMissing = await lget(asA);
    ok(gMissing.json.logo.status === "missing" && gMissing.json.logo.assetId === L3, "Profilim durumu: missing (yeniden seçin)", gMissing.json.logo);

    section("Çalışma alanı modu (uygulanan tasarımdaki GÜNCEL logo)");
    const dget = async () => (await call(designRoute.GET, "GET", asA)).json.design;
    const design = (extra: Json) => ({ layout: "B", text: { useGreeting: true }, ...extra });
    let dv = (await dget()).version;
    const ap = await call(designRoute.POST, "POST", asA, { body: { action: "apply", expectedVersion: dv, draft: design({ logo: { assetId: L4 } }) } });
    ok(ap.status === 200, "A tasarımına L4 logosu uygulandı", ap.json);
    dv = ap.json.design.version;
    let pv = (await lget(asA)).json.version;
    const c6 = await lput(asA, { source: "custom", assetId: L6, expectedVersion: pv });
    ok(c6.status === 200 && (await del(asA, L6)).status === 409, "özel logo L6 seçili → silinemez");
    pv = c6.json.version;
    const w1 = await lput(asA, { source: "workspace", expectedVersion: pv });
    ok(w1.status === 200 && w1.json.logo.source === "workspace" && w1.json.logo.assetId === null && w1.json.logo.status === "ok" && w1.json.workspace.logoAssetId === L4, "workspace seçildi: logo_asset_id null, tasarım logosu L4, durum ok", w1.json);
    const wl = await resolveReportLogo(db, ownerA);
    ok(!!wl && wl.width === 600 && wl.height === 600, "çözücü tasarımdaki L4'ü kullanır (900×900 → 600×600)", wl && { w: wl.width, h: wl.height });
    ok((await del(asA, L6)).status === 200, "workspace moduna geçince önceki özel logo (L6) serbest → silinebilir");
    const dL4 = await del(asA, L4);
    ok(dL4.status === 409 && dL4.json.where.includes("uygulanan tasarım") && !dL4.json.where.includes(REPORT_LOGO_REF), "L4 tasarım referansıyla korunur (rapor logosu ayrıca sayılmaz)", dL4.json);
    const ap2 = await call(designRoute.POST, "POST", asA, { body: { action: "apply", expectedVersion: dv, draft: design({ logo: { assetId: L5 } }) } });
    dv = ap2.json.design.version;
    const wl2 = await resolveReportLogo(db, ownerA);
    ok(ap2.status === 200 && !!wl2 && wl2.width === 500 && wl2.height === 500, "tasarım logosu L5 olunca rapor da L5'i kullanır (500×500, büyütme yok)", wl2 && { w: wl2.width, h: wl2.height });
    const sd = await call(designRoute.POST, "POST", asA, { body: { action: "saveDraft", expectedVersion: dv, draft: design({ logo: { assetId: L2 } }) } });
    dv = sd.json.design.version;
    ok(sd.status === 200 && (await lget(asA)).json.workspace.logoAssetId === L5, "taslaktaki logo (L2) rapora geçmez; yalnız UYGULANAN tasarım");
    const ap3 = await call(designRoute.POST, "POST", asA, { body: { action: "apply", expectedVersion: dv, draft: design({ logo: { assetId: null } }) } });
    ok(ap3.status === 200, "tasarımdan logo kaldırıldı", ap3.json);
    const ge = await lget(asA);
    ok(ge.json.logo.status === "workspace_empty" && ge.json.workspace.logoAssetId === null, "durum: workspace_empty (rapor logosuz)", ge.json.logo);
    ok((await resolveReportLogo(db, ownerA)) === null, "çözücü → null");
    ok(objectsUnder(`${seed.TA}/${U.A.id}/${L5}/`).length === 2 && objectsUnder(`${seed.TA}/${U.A.id}/${L4}/`).length === 2, "tasarımdan kaldırma dosyayı SİLMEZ");

    section("Erişim kapalı (kademeli açılış / bayrak)");
    delete process.env.EXPERT_WORKSPACE_ROLLOUT_ALL;
    const gOff = await lget(asA);
    ok(gOff.status === 200 && gOff.json.workspace.access === false && gOff.json.logo.status === "access_off" && gOff.json.workspace.logoAssetId === null, "izinsiz uzman: GET 200, access=false, durum access_off", gOff.json);
    pv = gOff.json.version;
    const pOffW = await lput(asA, { source: "workspace", expectedVersion: pv });
    const pOffC = await lput(asA, { source: "custom", assetId: L2, expectedVersion: pv });
    ok(pOffW.status === 403 && pOffW.json.code === "LOGO_ACCESS_OFF" && pOffC.status === 403 && pOffC.json.code === "LOGO_ACCESS_OFF", "erişim kapalı: workspace / custom → 403 LOGO_ACCESS_OFF", [pOffW.json, pOffC.json]);
    // Erişim kapalıyken önceki özel seçim varsa da rapor logosuz olmalı.
    await env.su.query(`update public.expert_profiles set logo_source='custom', logo_asset_id=$2, version=version+1 where user_id=$1`, [U.A.id, L2]);
    ok((await resolveReportLogo(db, ownerA)) === null, "erişim kapalı + kayıtlı özel logo → çözücü null");
    pv = (await lget(asA)).json.version;
    ok((await lput(asA, { source: "none", expectedVersion: pv })).status === 200, "erişim kapalıyken 'none' her zaman kaydedilebilir");
    process.env.EXPERT_WORKSPACE_ROLLOUT_ALL = "true";
    delete process.env.EXPERT_WORKSPACE_DESIGN_ENABLED;
    const gFlag = await lget(asA);
    ok(gFlag.status === 200 && gFlag.json.workspace.access === false, "genel bayrak kapalı: Profilim yine çalışır, access=false");
    ok((await lput(asA, { source: "workspace", expectedVersion: gFlag.json.version })).status === 403, "genel bayrak kapalı: workspace → 403");
    process.env.EXPERT_WORKSPACE_DESIGN_ENABLED = "true";

    section("Demo hesap + demo tenant");
    const before = await count();
    const gd = await lget(asDemo);
    ok(gd.status === 200 && gd.json.readOnly === true, "demo GET → 200, readOnly");
    const pd = await lput(asDemo, { source: "none", expectedVersion: 0 });
    ok(pd.status === 403 && pd.json.demo === true, "demo PUT → 403 (demo)", pd.json);
    const pdm = await lput(asDemoMate, { source: "none", expectedVersion: 0 });
    ok(pdm.status === 403, "demo tenant'taki hesap PUT → 403", pdm.json);
    ok((await count()) === before, "demo isteklerinde satır yazılmadı");

    section("Profil tablosu yokken (F1 migration uygulanmamış) görsel silme çalışır");
    const errBefore = env.stats.errors;
    await env.su.query(`alter table public.expert_profiles rename to expert_profiles_zz_hidden`);
    const dFree = await del(asA, L2);
    ok(dFree.status === 200, "tablo yok → rapor logosu referansı yok sayılır, kullanılmayan görsel silinir", dFree.json);
    ok((await lget(asA)).status === 503, "tablo yok → Profilim logo ucu 503 (PROFILE_UNAVAILABLE)");
    await env.su.query(`alter table public.expert_profiles_zz_hidden rename to expert_profiles`);
    const expectedShimErrors = env.stats.errors - errBefore; // tablo yokken şimde beklenen 42P01 hataları

    section("Günlükler");
    const rl = logged.filter((l) => l.includes("[report-logo]"));
    ok(rl.length > 0, "çözücü hataları günlüğe yazıldı (aşama kodu)", rl.length);
    ok(rl.every((l) => !UUID_ANY.test(l) && !l.includes("example.test") && !l.includes(".webp")), "çözücü günlüklerinde kimlik / e-posta / dosya yolu yok", rl.slice(0, 3));
    ok(errBefore === 0, "PostgREST şiminde (bilinçli tablo gizleme dışında) beklenmeyen hata yok", { errBefore, expectedShimErrors });
  } finally {
    await env.stop();
  }
  console.log(`\nprofile logo harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

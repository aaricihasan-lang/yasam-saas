/**
 * Doğaltaş Kütüphanesi F9 — GERÇEK PostgREST (12.2.x) ile owner RPC zaman aşımı regresyonu + görsel izni tek Owner onayı.
 *
 * Production (29.10.2026, salt-okunur kanıt): PostgREST bağlantı rolü `authenticator` statement_timeout=8s. Toplu yayında
 * 88 taş yayımlandı (en uzun çağrı 7 788 ms); Sitrin / Yakut / Rutilli Kuvars 8 sn'yi aşıp iptal edildi. Görsel izni durumu
 * tetikleyiciyle kaynağın bütün taşlarını tek sorguda yeniden hesaplar → aynı sınıra takılır.
 * Bu test production koşulunu küçültülmüş olarak kurar: authenticator statement_timeout=3s + yayın satırı başına yapay 3,5 sn
 * gecikme (yalnız test). Önce hatanın AYNISI görülür (yayın iptal, toplu sonuçta "zaman aşımı", izin onayı düşer), sonra
 * 20271206000300 uygulanınca aynı çağrılar başarılı olur. Geri alma betiği ve yeniden uygulama da denenir.
 *
 * Ön koşul: POSTGREST_BIN (CI: PostgREST 12.2.3). Yoksa ATLANDI (PASS sayılmaz → çıkış 1). Yalnız 127.0.0.1; sentetik veri.
 * Çalıştır: POSTGREST_BIN=<postgrest yolu> npx tsx scripts/stone-library/f9-zaman-asimi.pg.ts
 */
import "../hd-analysis-word-flow/env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../anamnez/testEnv";
import { createFakeCrystals } from "./fakeCrystals";
import { runCrystalImport, type RawPutArgs } from "../../lib/stone-library/import/runner";
import { rpcValue } from "../../lib/stone-library/import/ownerRpc";
import { startRealPostgrest, type RealPostgrest } from "./realPostgrest";

const PORT = 54711;
const REST_PORT = 54712;
const PROXY_PORT = 54713;
const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
  "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"];
const FIX = "20271206000300_stone_library_owner_rpc_timeout.sql";
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const mig = (f: string) => read(`supabase/migrations/${f}`);

let pass = 0; let fail = 0;
const ok = (c: unknown, label: string, extra?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
};
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Who = { kind: "admin" | "user"; id: string; token: string };
async function send(h: Handler, who: Who, o: { params?: Record<string, string>; body?: unknown } = {}) {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130", [who.kind === "admin" ? "x-admin-id" : "x-user-id"]: who.id, "x-session-token": who.token };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const res = await h(new NextRequest("http://localhost/api/test", { method: o.body !== undefined ? "POST" : "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }),
    { params: Promise.resolve(o.params ?? {}) });
  const type = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());
  let json: Record<string, unknown> = {};
  if (!type.startsWith("image/")) { try { json = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>; } catch { /* boş */ } }
  return { status: res.status, type, bytes, json };
}

async function main() {
  const bin = process.env.POSTGREST_BIN;
  if (!bin || !existsSync(bin)) {
    console.log("[ATLANDI] POSTGREST_BIN yok → gerçek PostgREST testleri çalışmadı (PASS sayılmaz).");
    console.log("SONUÇ: 0 PASS / 1 FAIL");
    process.exitCode = 1;
    return;
  }
  const realFetch = globalThis.fetch;
  let fakeHandler: ((u: string, i?: RequestInit) => Promise<Response>) | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    if (/^https:\/\/roxyapi\.com\//.test(u) && fakeHandler) return fakeHandler(u, init);
    throw new Error(`dış ağ yasak ${u}`);
  }) as typeof fetch;

  const fns = [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))];
  const env = await startAnamnezTestEnv({ port: PORT, dirName: `stone-library-f9-${Date.now()}-${randomUUID().slice(0, 8)}`, rpcAllow: fns, extraSql: MIGS.map(mig) });
  const su = env.su;
  const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await su.query(sql, p)).rows[0] ?? { x: 0 })[0]);
  let real: RealPostgrest | null = null;
  try {
    // Production koşulu: bağlantı rolünde kısa statement_timeout (prod 8s; burada 3s). PostgREST bundan SONRA açılır.
    await su.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then
        create role authenticator login noinherit password 'auth-local'; end if; end $$;
      alter role authenticator set statement_timeout = '3s';`);
    real = await startRealPostgrest({ bin, su, pgPort: PORT, shimUrl: env.url, restPort: REST_PORT, proxyPort: PROXY_PORT });
    ok(true, "gerçek PostgREST ayakta (authenticator statement_timeout=3s)");
    process.env.NEXT_PUBLIC_SUPABASE_URL = real.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
    process.env.STONE_LIBRARY_ENABLED = "true";
    const db = createClient(real.url, SERVICE_KEY, { auth: { persistSession: false } });

    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_F9')`, [T]);
    const mk = async (label: string, role: "admin" | "expert", superAdmin: boolean): Promise<Who> => {
      const id = randomUUID(); const token = `zz-f9-${label}-${randomUUID()}`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8)`, [id, `ZZ ${label}`, `zz.f9.${label}@example.test`, role,
        JSON.stringify(role === "expert" ? { stones: true } : {}), T, superAdmin, role === "admin" ? (superAdmin ? "owner" : "admin") : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { kind: role === "admin" ? "admin" : "user", id, token };
    };
    const OWNER = await mk("owner", "admin", true);
    const ADMIN = await mk("admin", "admin", false);
    const EXPG = await mk("uzman-yetkili", "expert", false);
    const EXPN = await mk("uzman-yetkisiz", "expert", false);
    const owner = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(fn, { p_actor: OWNER.id, ...args });
      if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
      return rpcValue(fn, data);
    };

    console.log("\n[1. Kurulum: 4 taş + görseller (onaylı), 3 taş yayında, görsel izni Owner onayı bekliyor]");
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-f9", kind: "api", real_name: "ZZ sentetik", provider_code: "roxy", license_type: "api_terms", license_terms_sha256: "a".repeat(64), commercial_use_ok: true, image_rights: "rehost_ok" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { status: "active" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "ZZ Roxy yazışma", content_sha256: "e".repeat(64) } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: { source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ Roxy",
      commercial_display: true, storage_allowed: true, post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "ZZ", document_id: DOC, document_sha256: "e".repeat(64) } }));
    const imp = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
    await imp.connect();
    const writeRaw = async (a: RawPutArgs): Promise<string> => {
      await imp.query("begin");
      try {
        await imp.query("set local role stone_library_importer");
        const r = await imp.query("select public.stone_library_raw_put($1,$2,$3,$4,$5,$6,$7::jsonb) as id", [a.p_actor, a.p_batch_id, a.p_external_id, a.p_lang, a.p_endpoint, a.p_http_status, JSON.stringify(a.p_payload)]);
        await imp.query("commit"); return String(r.rows[0].id);
      } catch (e) { await imp.query("rollback"); throw e; }
    };
    const fake = createFakeCrystals({ count: 4 });
    fakeHandler = fake.handler;
    const s1 = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, writeRaw,
      client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: fake.handler, timeoutMs: 1000 },
      imageFetch: fake.handler, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0,
      termsSha256: "b".repeat(64), sleep: async () => undefined });
    ok(s1.status === "completed" && s1.stonesCreated === 4, "4 taş aktarıldı", { status: s1.status, stones: s1.stonesCreated });
    await imp.end();
    const stones = (await su.query(`select id, name_tr, slug from public.stone_library_stones where deleted_at is null order by slug`)).rows as { id: string; name_tr: string; slug: string }[];
    for (const i of (await su.query(`select id from public.stone_library_images where deleted_at is null and review_state='pending'`)).rows)
      await su.query(`select public.stone_library_image_review($1,$2,'approve','zz')`, [OWNER.id, i.id]);
    for (const st of stones.slice(0, 3)) await su.query(`select public.stone_library_owner_publish($1,$2,'zz kurulum')`, [OWNER.id, st.id]);
    const LAST = stones[3];
    ok(await n(`select count(*) from public.stone_library_stones where status='published'`) === 3, "kurulum: 3 taş yayında, 1 taslak");
    // Production yavaşlığının küçültülmüş benzeri (YALNIZ TEST): yayın satırı başına 3,5 sn (sınır 3 sn).
    await su.query(`create or replace function public.zz_f9_slow() returns trigger language plpgsql as $$ begin perform pg_sleep(3.5); return null; end $$;
      create trigger zz_f9_slow after insert on public.stone_library_published for each row execute function public.zz_f9_slow();`);

    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const TOPLU = (await R("toplu-yayin/route")).POST;
    const VG = (await import("../../app/api/dogaltas/kutuphane/[slug]/gorsel/route")).GET as unknown as Handler;
    const VS = (await import("../../app/api/dogaltas/kutuphane/route")).GET as unknown as Handler;

    console.log("\n[2. ÖNCE (düzeltme yok): production hatasının aynısı]");
    const pubTry = await db.rpc("stone_library_owner_publish", { p_actor: OWNER.id, p_stone_id: LAST.id, p_note: "zz" });
    ok(pubTry.error?.code === "57014", "tek taş yayını bağlantı rolünün sınırında iptal edilir (57014 statement timeout)", pubTry.error);
    ok(await n(`select count(*) from public.stone_library_stones where id=$1 and status='published'`, [LAST.id]) === 0, "iptal edilen yayın hiçbir şey yazmaz (taş taslak)");
    const pv0 = await send(TOPLU, OWNER, { body: { step: "preview" } });
    const pv0p = pv0.json.preview as { to_publish: number; translations: { affected: number } };
    ok(pv0.status === 200 && pv0p.to_publish === 1, "önizleme: 1 taş yayınlanacak", pv0p);
    const ap0 = await send(TOPLU, OWNER, { body: { step: "apply", expected: { stones: pv0p.to_publish, translations: pv0p.translations.affected } } });
    const ap0r = ap0.json.result as { published: number; failed: { name: string; error: string }[] };
    ok(ap0.status === 200 && ap0r.published === 0 && ap0r.failed.length === 1 && ap0r.failed[0].name === LAST.name_tr && ap0r.failed[0].error === "zaman aşımı",
      "toplu yayın: başarısız taş ADIYLA ve nedeniyle döner (\"zaman aşımı\")", ap0r);
    ok(await n(`select count(*) from public.stone_library_stones where status='published'`) === 3, "yayındaki 3 taş korunur");
    const lv0 = await send(TOPLU, OWNER, { body: { step: "license_verify", grant_id: LIC } });
    ok(lv0.status !== 200 && lv0.json.code === "57014" && await n(`select count(*) from public.stone_library_license_grants where evidence_status='verified'`) === 0,
      "görsel izni onayı (3 taşı yeniden hesaplar) sınırda düşer; izin değişmez", lv0.status);

    console.log("\n[3. Düzeltme: 20271206000300 (işlev düzeyinde statement_timeout) — gövde / yetki değişmez]");
    const defBefore = (await su.query(`select md5(string_agg(prosrc || proacl::text, '|' order by oid)) h from pg_proc where proname like 'stone_library_%'`)).rows[0].h;
    await su.query(mig(FIX));
    const defAfter = (await su.query(`select md5(string_agg(prosrc || proacl::text, '|' order by oid)) h from pg_proc where proname like 'stone_library_%'`)).rows[0].h;
    ok(defBefore === defAfter, "fonksiyon gövdeleri ve yetkileri aynen kalır");
    const cfg = (await su.query(`select p.oid::regprocedure::text sig, p.proconfig from pg_proc p where 'statement_timeout=240s' = any(p.proconfig)`)).rows as { sig: string; proconfig: string[] }[];
    ok(cfg.length === 11 && cfg.every((c) => c.proconfig.some((x) => x.startsWith("search_path="))), "11 owner RPC'sinde statement_timeout=240s; search_path korunur", cfg.map((c) => c.sig));
    ok(!cfg.some((c) => /expert|viewer/.test(c.sig)), "uzman / görüntüleme RPC'lerine dokunulmaz");
    // Şema önbelleği yenilemesi: production'da DDL + migration'daki NOTIFY ile olur; yerel PostgREST'te NOTIFY dinleyicisi
    // çalışmadığı için (yeni işlev bile görünmüyor — ölçüldü) PostgREST yeniden başlatılarak önbellek yenilenir.
    await real.stop();
    real = await startRealPostgrest({ bin, su, pgPort: PORT, shimUrl: env.url, restPort: REST_PORT, proxyPort: PROXY_PORT });
    ok(true, "PostgREST şema önbelleği yenilendi (yeniden başlatma)");

    console.log("\n[4. SONRA: aynı çağrılar başarılı]");
    const pv1 = await send(TOPLU, OWNER, { body: { step: "preview" } });
    const pv1p = pv1.json.preview as { to_publish: number; translations: { affected: number } };
    const t0 = Date.now();
    const ap1 = await send(TOPLU, OWNER, { body: { step: "apply", expected: { stones: pv1p.to_publish, translations: pv1p.translations.affected } } });
    const ap1r = ap1.json.result as { published: number; failed: unknown[] };
    ok(ap1.status === 200 && ap1r.published === 1 && ap1r.failed.length === 0 && Date.now() - t0 > 3000, "toplu yayın: kalan taş yayımlandı (3 sn sınırını aşan çağrı tamamlandı)", { r: ap1r, ms: Date.now() - t0 });
    ok(await n(`select count(*) from public.stone_library_stones where status='published'`) === 4, "4/4 taş yayında (önceki 3 korunarak)");
    ok(await n(`select count(*) from public.stone_library_published where has_image`) === 0, "görsel izni onaylanmadan uzman yayın satırlarında görsel yok");
    await su.query(`select public.stone_library_grant_access($1,$2,'zz')`, [OWNER.id, EXPG.id]);
    const slug = stones[0].slug;
    ok((await send(VG, EXPG, { params: { slug } })).status === 404, "Owner onayı yokken yetkili uzman görseli göremez (404)");

    console.log("\n[5. Görsel izni: Owner'ın TEK onayı (gerekçe / yeni belge yok)]");
    ok((await send(TOPLU, ADMIN, { body: { step: "license_verify", grant_id: LIC } })).status === 404 && await n(`select count(*) from public.stone_library_license_grants where evidence_status='verified'`) === 0,
      "owner olmayan admin onay veremez (404), izin değişmez");
    const lv1 = await send(TOPLU, OWNER, { body: { step: "license_verify", grant_id: LIC } });
    ok(lv1.status === 200 && await n(`select count(*) from public.stone_library_license_grants where evidence_status='verified' and verified_by=$1`, [OWNER.id]) === 1,
      "tek onay: izin Owner onaylı (gerekçe alanı istenmez)", lv1.json);
    const note = String((await su.query(`select note from public.stone_library_reviews where entity='license' and action='verify' order by id desc limit 1`)).rows[0]?.note ?? "");
    ok(/Owner onayı/.test(note) && /e-postayla/.test(note) && /yazışma kaydı/.test(note) && !/roxy/i.test(note), "kayıt notu yalnız gerçeği yazar (Owner beyanı + kayıtlı yazışma kaydı; marka adı yok)", note);
    ok(await n(`select count(*) from public.stone_library_source_documents`) === 1 && await n(`select count(*) from public.stone_library_license_grants`) === 1, "yeni belge / izin kaydı oluşturulmadı; mevcut kanıt korunur");
    ok(await n(`select count(*) from public.stone_library_published where has_image`) === 4, "4 yayın satırında görsel var (yeniden hesaplama tamamlandı)");
    const vg = await send(VG, EXPG, { params: { slug } });
    ok(vg.status === 200 && vg.type.startsWith("image/"), "yetkili uzman görseli görür (200)", vg.status);
    ok((await send(VG, EXPN, { params: { slug } })).status === 404, "erişim verilmemiş uzman görseli göremez (404)");
    const lst = await send(VS, EXPG, {});
    ok(lst.status === 200 && Number(lst.json.total) === 4, "yetkili uzman 4 taşı görür", lst.json.total);
    ok((await send(VS, EXPN, {})).status === 404, "yetkisiz uzman kütüphaneyi göremez (404)");

    console.log("\n[6. Geri alma betiği + yeniden uygulama]");
    await su.query(read("scripts/stone-library/sql/ROLLBACK_20271206000300.sql"));
    ok(await n(`select count(*) from pg_proc where 'statement_timeout=240s' = any(proconfig)`) === 0, "ROLLBACK: işlev ayarları kaldırıldı");
    ok(await n(`select count(*) from public.stone_library_stones where status='published'`) === 4 && await n(`select count(*) from public.stone_library_license_grants where evidence_status='verified'`) === 1,
      "ROLLBACK veri değiştirmez");
    await su.query(mig(FIX));
    ok(await n(`select count(*) from pg_proc where 'statement_timeout=240s' = any(proconfig)`) === 11, "migration yeniden uygulanabilir");
  } finally {
    globalThis.fetch = realFetch;
    if (real) await real.stop();
    await env.stop().catch(() => undefined);
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); console.log(`\nSONUÇ: ${pass} PASS / ${fail + 1} FAIL`); process.exitCode = 1; });

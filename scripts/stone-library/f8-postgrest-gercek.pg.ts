/**
 * Doğaltaş Kütüphanesi F8 — GERÇEK PostgREST (12.2.x) regresyonu: JSON DİZİSİ döndüren owner RPC'leri.
 *
 * Production hatası (29.10.2026, PR #612 sonrası): `stone_library_owner_images` jsonb DİZİSİ döndürür. Gerçek PostgREST bu
 * skaler sonucu doğrudan dizi olarak verir; `rpcValue` (tek satırlı tablo dönüşü için) dizinin İLK elemanını alıyordu →
 * owner kapak ucu 500 (katalog küçük resimleri gri), taş ayrıntısı `images` tek nesne → Görseller sekmesi
 * "l.filter is not a function" ("This page couldn't load"). Testlerdeki PostgREST shim'i sonucu [{ <fn>: değer }] biçiminde
 * verdiği için hata yerelde görünmüyordu. Bu test uygulamanın /rest/v1 isteklerini GERÇEK PostgREST'e, depolama isteklerini
 * test emülatörüne yönlendirir (yerel vekil) ve route handler'ları bu ortamda çalıştırır.
 *
 * Ön koşul: POSTGREST_BIN (CI: PostgREST 12.2.3, SHA-256 doğrulanmış). Yoksa ATLANDI (PASS sayılmaz → çıkış 1).
 * Çalıştır: POSTGREST_BIN=<postgrest yolu> npx tsx scripts/stone-library/f8-postgrest-gercek.pg.ts
 * Yalnız 127.0.0.1; production'a sıfır temas; sentetik veri.
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
import { rpcList, rpcValue } from "../../lib/stone-library/import/ownerRpc";
import { startRealPostgrest, type RealPostgrest } from "./realPostgrest";

const PORT = 54701;
const REST_PORT = 54702;
const PROXY_PORT = 54703;
const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
  "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"];
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

let pass = 0; let fail = 0;
const ok = (c: unknown, label: string, extra?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
};
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Who = { kind: "admin" | "user"; id: string; token: string };
async function send(h: Handler, who: Who, params: Record<string, string>) {
  const headers = { "user-agent": "Mozilla/5.0 Chrome/130", [who.kind === "admin" ? "x-admin-id" : "x-user-id"]: who.id, "x-session-token": who.token };
  const res = await h(new NextRequest("http://localhost/api/test", { method: "GET", headers }), { params: Promise.resolve(params) });
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
  const env = await startAnamnezTestEnv({ port: PORT, dirName: `stone-library-f8-${Date.now()}-${randomUUID().slice(0, 8)}`, rpcAllow: fns, extraSql: MIGS.map(mig) });
  const su = env.su;
  let real: RealPostgrest | null = null;
  try {
    real = await startRealPostgrest({ bin, su, pgPort: PORT, shimUrl: env.url, restPort: REST_PORT, proxyPort: PROXY_PORT });
    ok(true, "gerçek PostgREST ayakta");
    process.env.NEXT_PUBLIC_SUPABASE_URL = real.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
    process.env.STONE_LIBRARY_ENABLED = "true";
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_F8')`, [T]);
    const mk = async (label: string, superAdmin: boolean): Promise<Who> => {
      const id = randomUUID(); const token = `zz-f8-${label}-${randomUUID()}`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,$2,$3,'admin',true,'approved','{}','premium','premium',$4,$5,$6)`, [id, `ZZ ${label}`, `zz.f8.${label}@example.test`, T, superAdmin, superAdmin ? "owner" : "admin"]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { kind: "admin", id, token };
    };
    const OWNER = await mk("owner", true);
    const ADMIN = await mk("admin", false);
    const owner = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(fn, { p_actor: OWNER.id, ...args });
      if (error) throw new Error(`${fn}: ${error.message}`);
      return rpcValue(fn, data);
    };

    console.log("\n[1. Kurulum: kaynak + doğrulanmamış görsel izni + 3 taş / görsel (gerçek PostgREST üzerinden aktarım)]");
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-f8", kind: "api", real_name: "ZZ sentetik", provider_code: "roxy", license_type: "api_terms", license_terms_sha256: "a".repeat(64), commercial_use_ok: true, image_rights: "rehost_ok" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { status: "active" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "ZZ", content_sha256: "e".repeat(64) } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: { source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ",
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
    const fake = createFakeCrystals({ count: 3 });
    fakeHandler = fake.handler;
    const runImport = () => runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, writeRaw,
      client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: fake.handler, timeoutMs: 1000 },
      imageFetch: fake.handler, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0,
      termsSha256: "b".repeat(64), sleep: async () => undefined });
    const s1 = await runImport();
    ok(s1.status === "completed" && s1.stonesCreated === 3 && s1.imagesStored === 3, "3 taş + 3 görsel aktarıldı (gerçek PostgREST)", { status: s1.status, stones: s1.stonesCreated, images: s1.imagesStored });
    const stone = String((await su.query(`select id from public.stone_library_stones order by slug limit 1`)).rows[0].id);

    console.log("\n[2. Kök neden: gerçek PostgREST jsonb dizisini doğrudan dizi olarak verir]");
    const raw = await db.rpc("stone_library_owner_images", { p_actor: OWNER.id, p_stone_id: stone });
    ok(!raw.error && Array.isArray(raw.data) && raw.data.length === 2, "owner_images ham yanıtı: 2 elemanlı dizi (özgün + optimize)", raw.error ?? raw.data);
    ok(!Array.isArray(rpcValue("stone_library_owner_images", raw.data)), "rpcValue diziyi tek nesneye indirger (eski hatanın kaynağı — belgelenir)");
    ok(rpcList("stone_library_owner_images", raw.data).length === 2, "rpcList gerçek PostgREST dizisini korur");
    ok(rpcList("stone_library_owner_images", [{ stone_library_owner_images: [{ a: 1 }, { a: 2 }] }]).length === 2, "rpcList shim biçimini ([{ fn: dizi }]) açar");
    ok(rpcList("stone_library_owner_images", null).length === 0 && rpcList("stone_library_owner_images", { x: 1 }).length === 0, "rpcList null / beklenmeyen → boş liste");

    console.log("\n[3. Route handler'lar gerçek PostgREST ile]");
    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const kapak = (await R("taslar/[id]/kapak/route")).GET;
    const detay = (await R("taslar/[id]/route")).GET;
    const gorsel = (await R("gorseller/[id]/route")).GET;
    const katalog = (await R("katalog/route")).GET;
    const kat = await send(katalog, OWNER, {});
    ok(kat.status === 200 && Array.isArray(kat.json.stones) && (kat.json.stones as unknown[]).length === 3, "katalog 200, 3 taş", kat.status);
    const kp = await send(kapak, OWNER, { id: stone });
    ok(kp.status === 200 && kp.type.startsWith("image/") && kp.bytes.length > 0, "kapak: owner'a taslak taşın görseli gelir (önceden 500)", { status: kp.status, type: kp.type });
    const all = await Promise.all((await su.query(`select id from public.stone_library_stones`)).rows.map((r) => send(kapak, OWNER, { id: String(r.id) })));
    ok(all.every((r) => r.status === 200), "kapak: 3/3 taş (katalog küçük resimleri)", all.map((r) => r.status));
    const dt = await send(detay, OWNER, { id: stone });
    ok(dt.status === 200 && Array.isArray(dt.json.images) && (dt.json.images as unknown[]).length === 2 && Array.isArray(dt.json.image_licenses),
      "taş ayrıntısı: images DİZİ (2) + image_licenses dizi (Görseller sekmesi çökmez)", { images: dt.json.images });
    const imgId = String(((dt.json.images as { id: string; variant: string }[]) ?? []).find((i) => i.variant === "optimized")?.id);
    const gr = await send(gorsel, OWNER, { id: imgId });
    ok(gr.status === 200 && gr.type.startsWith("image/"), "kaynak görsel önizlemesi 200 (önceden 500)", gr.status);
    for (const [h, p, label] of [[kapak, { id: stone }, "kapak"], [detay, { id: stone }, "taş ayrıntısı"], [gorsel, { id: imgId }, "kaynak görsel"]] as const) {
      const r = await send(h, ADMIN, p);
      ok(r.status === 404 && !r.type.startsWith("image/"), `owner olmayan admin: ${label} 404`, r.status);
    }
    const lic = (dt.json.image_licenses as { evidence_status: string }[])[0];
    ok(lic?.evidence_status === "owner_verification_pending", "görsel izni doğrulanmamış kalır (lisans kapısı değişmedi)", lic);

    console.log("\n[4. Aktarım motoru tekrar çalıştırma (owner_images listesi) gerçek PostgREST ile]");
    const s2 = await runImport();
    ok(s2.status === "completed" && s2.imagesStored === 0 && s2.imagesSkippedExisting === 3, "ikinci aktarım mevcut görselleri tanır (yeniden yüklemez)", { stored: s2.imagesStored, skipped: s2.imagesSkippedExisting });
    ok(Number((await su.query(`select count(*) from public.stone_library_images where deleted_at is null`)).rows[0].count) === 6, "görsel kaydı sayısı değişmedi (6)");
    await imp.end();
  } finally {
    globalThis.fetch = realFetch;
    if (real) await real.stop();
    await env.stop().catch(() => undefined);
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); console.log(`\nSONUÇ: ${pass} PASS / ${fail + 1} FAIL`); process.exitCode = 1; });

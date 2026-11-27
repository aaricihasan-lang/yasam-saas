/**
 * Şifa Rehberi V2 — GERÇEK ROTA + OTURUM + RPC + STORAGE HARNESS (7. aşama).
 *
 * Gerçek Next rota işleyicileri (app/api/sifa-rehberi-v2/**) → gerçek requireModuleAccess (users +
 * user_sessions + üyelik/deneme kapısı + modül izni) → gerçek supabase-js istemcisi → PostgREST UYUMLU
 * TEST SHIM'i (scripts/anamnez/testEnv: her istek SET ROLE service_role → GRANT'ler gerçekten sınanır;
 * GERÇEK PostgREST DEĞİL) → gerçek V2 migration'ı kurulu yerel geçici PostgreSQL + Supabase Storage
 * emülatörü (özel bucket, imzalı yükleme/okuma, TTL).
 *
 * Production'a SIFIR temas (yalnız 127.0.0.1). Tüm veriler sentetik.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";

// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma) — mevcut harness'larla aynı.
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
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

type Json = Record<string, unknown>;
type Auth = { id?: string; token?: string };
type Handler = (req: NextRequest) => Promise<Response>;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function main(): Promise<void> {
  const port = 55000 + Math.floor(Math.random() * 900);
  // Gerçek şema sırası: çekirdek → görsel yaşam döngüsü → F3 (kişisel kütüphane, kutular).
  const V2_SQL = ["20280110000000_sifa_rehberi_v2_core.sql", "20280124000000_sifa_v2_asset_lifecycle.sql", "20280130000000_sifa_rehberi_f3.sql"].map((f) => readFileSync(path.resolve("supabase/migrations", f), "utf8"));
  const RPCS = ["sifa_v2_load", "sifa_v2_apply_changeset", "sifa_v2_copy_shared", "sifa_v2_register_upload", "sifa_v2_visible_assets", "sifa_v2_trash_candidates", "sifa_v2_trash_purge", "sifa_v2_import_legacy", "sifa_v2__apply"];
  const env: TestEnv = await startAnamnezTestEnv({ port, dirName: `sifa-v2-routes-${process.pid}`, httpPort: port + 1, rpcAllow: RPCS, extraSql: V2_SQL });
  // Anamnez shim'i genel RPC'yi `select * from fn()` ile çalıştırıp skaler sonucu [{fn: değer}] sarar —
  // GERÇEK PostgREST skaler değeri DOĞRUDAN döndürür (scripts/stone-library/realPostgrest.ts uyarısı).
  // Adaptörü bu sapmaya UYDURMAK gerçek hatayı gizler → bunun yerine sifa_v2_* RPC'leri, gerçek PostgREST
  // semantiğini izleyen dar bir işleyiciye (pg_proc'tan arg türleri, SET ROLE service_role, skaler dönüş,
  // {code,message,details,hint} hata gövdesi) yönlendirilir; diğer her şey (oturum tabloları, Storage)
  // anamnez ortamında kalır. Bu da GERÇEK PostgREST DEĞİLDİR (raporda böyle belirtilir).
  const { default: pgMod } = await import("pg");
  const http = await import("node:http");
  const pool = new pgMod.Pool({ host: "127.0.0.1", port, user: "postgres", password: "testpw", database: "postgres", max: 8 });
  const rpcServer = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const fn = (req.url ?? "").replace(/^\/rest\/v1\/rpc\//, "").split("?")[0];
    const chunks: Buffer[] = [];
    for await (const ch of req) chunks.push(ch as Buffer);
    const args = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
    const client = await pool.connect();
    try {
      await client.query("SET ROLE service_role");
      const sig = await client.query(
        `select p.proargnames n, (select array_agg(format_type(t, null) order by i) from unnest(p.proargtypes) with ordinality a(t, i)) t
           from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`, [fn]);
      if (sig.rowCount !== 1) return send(404, { code: "PGRST202", message: `fn ${fn}`, details: null, hint: null });
      const types = new Map<string, string>((sig.rows[0].n as string[]).map((n, i) => [n, (sig.rows[0].t as string[])[i]]));
      const vals: unknown[] = [];
      const parts: string[] = [];
      for (const [k, v] of Object.entries(args)) {
        const t = types.get(k);
        if (!t) return send(404, { code: "PGRST202", message: `arg ${k}`, details: null, hint: null });
        vals.push(t === "jsonb" || t === "json" ? JSON.stringify(v) : v);
        parts.push(`${k} => $${vals.length}::${t}`);
      }
      const r = await client.query(`select public.${fn}(${parts.join(", ")}) as v`, vals);
      return send(200, r.rows[0]?.v ?? null);
    } catch (e) {
      const err = e as { code?: string; message?: string; detail?: string; hint?: string };
      return send(400, { code: err.code ?? "XX000", message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null });
    } finally {
      await client.query("RESET ROLE").catch(() => {});
      client.release();
    }
  });
  await new Promise<void>((r) => rpcServer.listen(port + 2, "127.0.0.1", () => r()));
  const envUrl = new URL(env.url);
  const proxy = http.createServer((req, res) => {
    const isV2Rpc = /^\/rest\/v1\/rpc\/sifa_v2_/.test(req.url ?? "");
    const headers = { ...req.headers };
    delete headers.host;
    const out = http.request({ host: "127.0.0.1", port: isV2Rpc ? port + 2 : Number(envUrl.port), path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    out.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(out);
  });
  await new Promise<void>((r) => proxy.listen(port + 3, "127.0.0.1", () => r()));
  const SUPA = `http://127.0.0.1:${port + 3}`;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    process.env.SIFA_REHBERI_V2_ENABLED = "1";

    const ws = await import("../../app/api/sifa-rehberi-v2/workspace/route");
    const word = await import("../../app/api/sifa-rehberi-v2/word/route");
    const prep = await import("../../app/api/sifa-rehberi-v2/assets/prepare/route");
    const fin = await import("../../app/api/sifa-rehberi-v2/assets/finalize/route");
    const urls = await import("../../app/api/sifa-rehberi-v2/assets/signed-urls/route");
    const { __resetRateLimitStore } = await import("../../lib/rateLimit");
    const { createClient } = await import("@supabase/supabase-js");
    const { supabaseDb } = await import("../../lib/sifa-rehberi-v2/server/dbAdapters");
    const { supabaseStorage } = await import("../../lib/sifa-rehberi-v2/server/storage");
    const { purgeTrash } = await import("../../lib/sifa-rehberi-v2/server/trash");
    const JSZip = (await import("jszip")).default;

    // ── Sentetik kullanıcılar (gerçek users / user_sessions) ─────────────────
    const T1 = randomUUID();
    const T2 = randomUUID();
    await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_SIFA_T1'),($2,'ZZ_SIFA_T2')`, [T1, T2]);
    const mk = async (label: string, o: { tenant: string; perms?: Json; demo?: boolean; trial?: "expired" }) => {
      const id = randomUUID();
      const token = `zz-sifa-v2-${label.toLowerCase()}-${id.slice(0, 8)}`;
      const now = Date.now();
      await env.su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account,
                                  trial_kind, trial_status, trial_started_at, trial_ends_at, membership_status, subscription_status)
         values ($1,$2,$3,'expert',true,'approved',$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [id, `ZZ_SIFA_${label}`, `zz.sifa.${label.toLowerCase()}@example.test`, JSON.stringify(o.perms ?? { sifa_rehberi: true }),
          o.trial ? "trial" : "premium", o.tenant, o.demo === true,
          o.trial ? "self_7d" : null, o.trial ? "active" : null,
          o.trial ? new Date(now - 8 * 864e5).toISOString() : null, o.trial ? new Date(now - 1 * 864e5).toISOString() : null,
          o.trial ? "trial" : "active"],
      );
      await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const U = {
      U1: await mk("U1", { tenant: T1 }),
      U2: await mk("U2", { tenant: T1 }),
      U3: await mk("U3", { tenant: T2 }),
      NOMOD: await mk("NOMOD", { tenant: T1, perms: { sifa_rehberi: false, healing: false } }),
      DEMO: await mk("DEMO", { tenant: T1, demo: true }),
      TRIAL: await mk("TRIAL", { tenant: T1, trial: "expired" }),
    };

    // ── Kurum (ortak) kaydı: T1'e V1 aktarımıyla aynı fonksiyon (sifa_v2_import_legacy) ──
    const SH = randomUUID();
    const SHB = randomUUID();
    const LEG = randomUUID();
    const legacyPath = `healing-guides/${T1}/g1/kapak.png`;
    await env.su.query("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [
      T1,
      JSON.stringify({
        topics: [{ id: SH, parent_id: null, title: "Kurum Bronşit (V1)", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
        blocks: [{ id: SHB, topic_id: SH, title: "V1 notu", content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Kurum notu ÇĞİÖŞÜ" }] }, { type: "figure", attrs: { src: `sifa-asset:${LEG}`, caption: "V1 görseli" } }] }, content_text: "Kurum notu ÇĞİÖŞÜ", classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }],
        assets: [{ id: LEG, block_id: SHB, storage_path: legacyPath, caption: "V1 görseli" }],
      }),
    ]);
    env.storage.buckets.set("stone-photos", { public: true, sizeLimit: null, mimes: null });
    env.storage.objects.set("stone-photos", new Map([[legacyPath, { bytes: PNG, contentType: "image/png", createdAt: Date.now() }]]));

    async function call(h: Handler, method: string, route: string, auth: Auth, body?: unknown): Promise<{ status: number; json: Json; res: Response }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost/api/sifa-rehberi-v2/${route}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await h(req);
      let json: Json = {};
      try {
        json = (await res.clone().json()) as Json;
      } catch {
        json = {};
      }
      return { status: res.status, json, res };
    }
    const as = (u: { id: string; token: string }): Auth => ({ id: u.id, token: u.token });
    const load = async (u: { id: string; token: string }) => (await call(ws.GET, "GET", "workspace", as(u))).json.workspace as { nodes: Json[]; blocks: Json[] };
    const topic = (title: string, id = randomUUID()) => ({ id, parent_id: null, title, sort_key: "b1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null });
    const blockRow = (topicId: string, text: string, extra: Json = {}) => ({
      id: randomUUID(), topic_id: topicId, title: "Not", content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
      content_text: text, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [], ...extra,
    });

    // ════════════════════════════════════════════════════════════════════════
    section("1. Kimlik / yetki kapısı (gerçek requireModuleAccess)");
    ok((await call(ws.GET, "GET", "workspace", {})).status === 401, "oturum başlığı yok → 401");
    ok([401, 403].includes((await call(ws.GET, "GET", "workspace", { id: U.U1.id, token: U.U2.token })).status), "başkasının token'ı ile x-user-id sahteciliği → 401/403");
    ok((await call(ws.GET, "GET", "workspace", as(U.NOMOD))).status === 403, "Şifa modülü kapalı kullanıcı → 403");
    process.env.SIFA_REHBERI_V2_ENABLED = "0";
    ok((await call(ws.GET, "GET", "workspace", as(U.U1))).status === 404, "sürüm bayrağı kapalı → 404 (V2 API yok)");
    process.env.SIFA_REHBERI_V2_ENABLED = "1";
    const g1 = await call(ws.GET, "GET", "workspace", as(U.U1));
    ok(g1.status === 200, "Uzman 1 (T1) → 200", g1.json);

    section("2. Yetki matrisi — kurum ortak + kişisel (gerçek API + supabase-js RPC adaptörü)");
    const P1 = randomUUID();
    const s1 = await call(ws.POST, "POST", "workspace", as(U.U1), { topics: [topic("Uzman 1 kişisel konusu", P1)], blocks: [blockRow(P1, "U1 GİZLİ NOT")] });
    ok(s1.status === 200, "Uzman 1 kişisel kayıt → 200 (DB'ye yazıldı)", s1.json);
    const row = (await env.su.query("select owner_key, tenant_id, scope from public.sifa_topics where id = $1", [P1])).rows[0];
    ok(row?.owner_key === U.U1.id && row?.tenant_id === T1 && row?.scope === "kisisel", "satır OTURUM kapsamına yazıldı (owner=U1, tenant=T1, kişisel)", row);
    const w1 = await load(U.U1);
    const w2 = await load(U.U2);
    const w3 = await load(U.U3);
    // F3 (Owner kararı 26.11.2026): Şifa Rehberi yalnız KİŞİSEL kütüphane — eski kurum (ortak) kayıtları okunmaz.
    ok(!w1.nodes.some((n) => n.id === SH) && !w2.nodes.some((n) => n.id === SH), "F3: kurum (ortak) kaydı T1 uzmanlarına da GELMEZ (yalnız kişisel)", { w1: w1.nodes.length, w2: w2.nodes.length });
    ok(!w3.nodes.some((n) => n.id === SH), "T2 uzmanı T1 kurum kaydını GÖREMEZ");
    ok(!w2.nodes.some((n) => n.id === P1) && !JSON.stringify(w2).includes("U1 GİZLİ NOT"), "Uzman 2, Uzman 1'in kişisel kaydını GÖREMEZ");
    ok(!w3.nodes.some((n) => n.id === P1), "T2 uzmanı Uzman 1'in kişisel kaydını GÖREMEZ");
    const b1 = (w1.blocks.find((b) => b.nodeId === P1) ?? {}) as Json;
    const tamper = await call(ws.POST, "POST", "workspace", as(U.U2), { blocks: [{ ...blockRow(P1, "ELE GEÇİRİLDİ"), id: b1.id, base_version: b1.version }] });
    ok(tamper.status === 404, "Uzman 2 → Uzman 1'in kutusunu güncelleme → 404", tamper.json);
    const sh1 = (await env.su.query("select version from public.sifa_topic_blocks where id = $1", [SHB])).rows[0] as Json;
    const shEdit = await call(ws.POST, "POST", "workspace", as(U.U1), { blocks: [{ ...blockRow(SH, "KURUM DEĞİŞTİ"), id: SHB, base_version: sh1.version }] });
    ok(shEdit.status === 404, "Uzman 1 → kurum kutusunu güncelleme → 404 (salt-okunur)", shEdit.json);
    const shChild = await call(ws.POST, "POST", "workspace", as(U.U2), { blocks: [blockRow(SH, "Kuruma kişisel ek")] });
    ok(shChild.status === 404, "Uzman 2 → kurum konusuna kutu ekleme → 404", shChild.json);
    const forgedBody = await call(ws.POST, "POST", "workspace", as(U.U2), { topics: [{ ...topic("Sahte kapsam"), owner_key: U.U1.id, tenant_id: T2, scope: "kurum" }] });
    ok(forgedBody.status === 200, "gövdeye sahip/tenant/kapsam yazmak etkisiz (yok sayılır)", forgedBody.json);
    ok((await env.su.query("select count(*)::int n from public.sifa_topics where title = 'Sahte kapsam' and owner_key = $1 and tenant_id = $2 and scope = 'kisisel'", [U.U2.id, T1])).rows[0].n === 1, "→ satır Uzman 2'nin KENDİ kişisel kapsamında");
    const unknownField = await call(ws.POST, "POST", "workspace", as(U.U1), { topics: [], evil: true });
    ok(unknownField.status === 400, "bilinmeyen alan → 400");
    const asTenant = (await env.su.query("select public.sifa_v2_load($1, $1) v", [T1])).rows[0].v as { topics: unknown[] };
    ok(asTenant.topics.length === 0, "→ tenant kimliğiyle yükleme 0 satır");

    section("3. Çakışma yanıtı (aynı anda iki düzenleme)");
    const wA = await load(U.U1);
    const bb = wA.blocks.find((b) => b.nodeId === P1) as Json;
    const firstSave = await call(ws.POST, "POST", "workspace", as(U.U1), { blocks: [{ ...blockRow(P1, "PENCERE-1"), id: bb.id, base_version: bb.version, title: bb.title }] });
    const secondSave = await call(ws.POST, "POST", "workspace", as(U.U1), { blocks: [{ ...blockRow(P1, "PENCERE-2"), id: bb.id, base_version: bb.version, title: bb.title }] });
    ok(firstSave.status === 200 && secondSave.status === 409, "ikinci (bayat) kayıt → 409", secondSave.json);
    const conflicts = secondSave.json.conflicts as { id: string; title: string }[] | undefined;
    ok(Array.isArray(conflicts) && conflicts.length === 1 && conflicts[0].id === bb.id && conflicts[0].title === "Not", "409 yanıtı çakışan kaydı (kimlik + başlık) listeler — kullanıcıya çözüm için", conflicts);

    // F3 (Owner kararı 26.11.2026): Şifa Rehberi yalnız KİŞİSEL kütüphane — kurum kopyası ucu kaldırıldı.
    // Veritabanı fonksiyonu (sifa_v2_copy_shared) integration.pg.mts'de doğrudan sınanmaya devam eder.
    section("4. Kurum kaydından kişisel kopya — uç KALDIRILDI (F3)");
    ok(!(await import("node:fs")).existsSync("app/api/sifa-rehberi-v2/copy/route.ts"), "kurum kopyası ucu (/copy) kaldırıldı");
    ok((await env.su.query("select content_text from public.sifa_topic_blocks where id = $1", [SHB])).rows[0].content_text === "Kurum notu ÇĞİÖŞÜ", "özgün kurum kaydı değişmedi");

    section("5. Görsel yükleme (özel bucket) + bayt doğrulaması");
    const pr = await call(prep.POST, "POST", "assets/prepare", as(U.U1), { mimeType: "image/png", size: PNG.length });
    ok(pr.status === 200 && String(pr.json.path).startsWith(`${T1}/${U.U1.id}/`), "hazırlık: sunucu yolu <tenant>/<uzman>/… + imzalı yükleme", pr.json);
    const put = await fetch(String(pr.json.signedUrl), { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(PNG) });
    ok(put.ok, "imzalı bağlantıyla yükleme (emülatör)", put.status);
    const fz = await call(fin.POST, "POST", "assets/finalize", as(U.U1), { assetId: pr.json.assetId, path: pr.json.path, caption: "Kendi görselim" });
    ok(fz.status === 200 && fz.json.src === `sifa-asset:${pr.json.assetId}`, "onay: bayt PNG → kayıt + sifa-asset referansı", fz.json);
    const OWN = String(pr.json.assetId);
    ok((await call(fin.POST, "POST", "assets/finalize", as(U.U2), { assetId: OWN, path: pr.json.path })).status === 403, "Uzman 2, Uzman 1'in yükleme yolunu kendine kaydedemez → 403");
    ok((await call(prep.POST, "POST", "assets/prepare", as(U.U1), { mimeType: "image/svg+xml", size: 100 })).status === 415, "SVG/izinsiz tür → 415");
    ok((await call(prep.POST, "POST", "assets/prepare", as(U.U1), { mimeType: "image/png", size: 11 * 1024 * 1024 })).status === 413, "10 MB üstü → 413");
    const pr2 = await call(prep.POST, "POST", "assets/prepare", as(U.U1), { mimeType: "image/png", size: 30 });
    await fetch(String(pr2.json.signedUrl), { method: "PUT", headers: { "content-type": "image/png" }, body: new TextEncoder().encode("<html><script>x</script></html>") });
    const fake = await call(fin.POST, "POST", "assets/finalize", as(U.U1), { assetId: pr2.json.assetId, path: pr2.json.path });
    ok(fake.status === 415, "PNG uzantılı HTML (sahte görsel) → 415 + nesne silindi", fake.json);
    ok(!env.storage.objects.get("sifa-arastirma")?.has(String(pr2.json.path)), "→ sahte nesne Storage'dan kaldırıldı");

    section("6. Görsel okuma — imzalı bağlantı yalnız görebilene (Storage ile yetki aşılamaz)");
    const u1 = await call(urls.POST, "POST", "assets/signed-urls", as(U.U1), { ids: [OWN, LEG] });
    const u1urls = u1.json.urls as Record<string, string>;
    ok(u1.status === 200 && !!u1urls?.[OWN] && !!u1urls?.[LEG], "Uzman 1: kendi + kurum görseli → 2 imzalı bağlantı");
    const got = Buffer.from(await (await fetch(u1urls[OWN])).arrayBuffer());
    ok(got.equals(PNG), "imzalı bağlantı baytları birebir döndürür");
    const u2 = (await call(urls.POST, "POST", "assets/signed-urls", as(U.U2), { ids: [OWN, LEG] })).json.urls as Record<string, string>;
    ok(!u2[OWN] && !!u2[LEG], "Uzman 2: yalnız kurum görseli (Uzman 1'in görseli YOK)");
    const u3 = (await call(urls.POST, "POST", "assets/signed-urls", as(U.U3), { ids: [OWN, LEG] })).json.urls as Record<string, string>;
    ok(Object.keys(u3).length === 0, "T2 uzmanı: hiçbir T1 görseli");
    const direct = await fetch(`${env.url}/storage/v1/object/public/sifa-arastirma/${pr.json.path}`);
    ok(!direct.ok, "özel bucket nesnesine İMZASIZ doğrudan erişim reddedilir", direct.status);
    const directAuth = await fetch(`${env.url}/storage/v1/object/authenticated/sifa-arastirma/${pr.json.path}`, { headers: { Authorization: "Bearer anon-key-not-service" } });
    ok(!directAuth.ok, "service anahtarı olmadan kimlikli yol da reddedilir", directAuth.status);
    const tamperedSig = u1urls[OWN].replace(/token=([^&]+)/, "token=zz-sahte");
    ok(!(await fetch(tamperedSig)).ok, "imza değiştirilmiş bağlantı reddedilir");

    section("7. Kaydet + görsel bağlama · Word (görselli) · hız sınırı");
    const imgBlock = blockRow(P1, "Görselli not", { content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Görselli not ÇĞİÖŞÜ" }] }, { type: "figure", attrs: { src: `sifa-asset:${OWN}`, caption: "Kendi görselim" } }] } });
    const si = await call(ws.POST, "POST", "workspace", as(U.U1), { blocks: [imgBlock], asset_links: [{ asset_id: OWN, block_id: imgBlock.id }] });
    ok(si.status === 200, "görselli kutu kaydı → 200", si.json);
    ok((await env.su.query("select block_id from public.sifa_block_assets where id = $1", [OWN])).rows[0].block_id === imgBlock.id, "taslak görsel kutuya bağlandı");
    __resetRateLimitStore();
    const wd = await call(word.POST, "POST", "word", as(U.U1), { rootId: P1 });
    ok(wd.status === 200 && (wd.res.headers.get("content-type") ?? "").includes("wordprocessingml"), "Word (kişisel konu) → 200 .docx");
    const zip = await JSZip.loadAsync(Buffer.from(await wd.res.arrayBuffer()));
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
    const xml = await zip.file("word/document.xml")!.async("string");
    ok(media.length === 1 && xml.includes("Görselli not ÇĞİÖŞÜ"), "Word: Storage'daki görsel gömüldü + Türkçe metin", media);
    ok((await call(word.POST, "POST", "word", as(U.U2), { rootId: P1 })).status === 404, "Uzman 2 → Uzman 1'in konusunun Word'ü → 404");
    const wsh = await call(word.POST, "POST", "word", as(U.U2), { rootId: SH });
    ok(wsh.status === 404, "F3: kurum (ortak) kaydının Word'ü artık alınamaz → 404 (yalnız kişisel kütüphane)");
    ok((await call(word.POST, "POST", "word", as(U.U3), { rootId: SH })).status === 404, "T2 uzmanı → T1 kurum Word'ü → 404");
    __resetRateLimitStore();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call(word.POST, "POST", "word", as(U.U1), { rootId: P1 })).status;
    ok(last === 429, "hız sınırı: aynı tenant'ta dakikada 11. Word → 429", last);
    __resetRateLimitStore();

    section("8. Demo hesap ve süresi dolmuş deneme (mevcut kapılar)");
    ok((await call(ws.GET, "GET", "workspace", as(U.DEMO))).status === 200, "demo: okuma → 200");
    const dsave = await call(ws.POST, "POST", "workspace", as(U.DEMO), { topics: [topic("Demo")] });
    ok(dsave.status === 403 && dsave.json.demo === true, "demo: Kaydet → 403 (DEMO_READONLY)", dsave.json);
    ok((await call(word.POST, "POST", "word", as(U.DEMO), { rootId: SH })).status === 403, "demo: Word → 403 (V1 ile aynı)");
    ok((await call(ws.GET, "GET", "workspace", as(U.TRIAL))).status === 200, "süresi dolmuş deneme: okuma → 200");
    const tsave = await call(ws.POST, "POST", "workspace", as(U.TRIAL), { topics: [topic("Deneme")] });
    ok(tsave.status === 403, "süresi dolmuş deneme: Kaydet → 403", tsave.json);
    ok((await call(prep.POST, "POST", "assets/prepare", as(U.TRIAL), { mimeType: "image/png", size: 10 })).status === 403, "süresi dolmuş deneme: yükleme → 403");
    const tw = (await call(word.POST, "POST", "word", as(U.TRIAL), { rootId: SH })).status;
    ok(tw !== 403 && tw !== 401, "süresi dolmuş deneme: Word (dışa aktarma) deneme kapısından GEÇER (403 değil; F3'te kurum kaydı okunmaz → 404)", tw);
    ok((await call(urls.POST, "POST", "assets/signed-urls", as(U.TRIAL), { ids: [LEG] })).status === 200, "süresi dolmuş deneme: görsel okuma bağlantısı → 200");

    section("9. Çöp Kutusu — 30 gün sonra güvenli kalıcı temizlik (gerçek RPC adaptörü + Storage)");
    const svc = createClient(SUPA, SERVICE_KEY, { auth: { persistSession: false } });
    const db = supabaseDb(svc);
    const st = supabaseStorage(svc);
    const batch = randomUUID();
    await env.su.query("update public.sifa_topic_blocks set deleted_at = now() - interval '31 days', delete_batch_id = $2 where id = $1", [imgBlock.id, batch]);
    await env.su.query("update public.sifa_topics set deleted_at = now() - interval '40 days', delete_batch_id = gen_random_uuid() where title = 'Sahte kapsam'");
    env.storage.failRemove = true;
    const rFail = await purgeTrash(db, st);
    ok(rFail.failedObjects === 1 && rFail.deleted.blocks === 0, "Storage silme BAŞARISIZ → görselli kutu SİLİNMEZ (iz kaybolmaz)", rFail);
    ok((await env.su.query("select count(*)::int n from public.sifa_block_assets where id = $1", [OWN])).rows[0].n === 1, "→ görsel satırı duruyor (sonraki tur yeniden dener)");
    env.storage.failRemove = false;
    const rOk = await purgeTrash(db, st);
    ok(rOk.removedObjects === 1 && rOk.deleted.blocks >= 1 && rFail.deleted.topics + rOk.deleted.topics >= 1 && (await env.su.query("select count(*)::int n from public.sifa_topics where title = 'Sahte kapsam'")).rows[0].n === 0, "Storage silme BAŞARILI → nesne + satırlar kalıcı silindi", rOk);
    ok(!env.storage.objects.get("sifa-arastirma")?.has(String(pr.json.path)), "→ nesne Storage'da yok");
    ok((await env.su.query("select count(*)::int n from public.sifa_topics where scope = 'kurum'")).rows[0].n === 1 && (await env.su.query("select count(*)::int n from public.sifa_block_assets where id = $1", [LEG])).rows[0].n === 1, "kurum kaydı ve kurum görseli temizlikten ETKİLENMEDİ");
    ok(env.storage.objects.get("stone-photos")?.has(legacyPath) === true, "V1 görsel nesnesine (stone-photos) DOKUNULMADI");
    ok((await env.su.query("select count(*)::int n from public.sifa_topics where id = $1", [P1])).rows[0].n === 1, "çöpte OLMAYAN kişisel kayıt duruyor");

    section("10. Surum secimi — ortak dosyalar DEGISMEDI (secim app/sifa-rehberi/layout.tsx'te)");
    const { execSync } = await import("node:child_process");
    for (const f of ["proxy.ts", "next.config.ts", "app/layout.tsx", "lib/auth/routeModuleAccess.ts"]) {
      const d = execSync(`git diff --stat origin/main -- ${f}`, { encoding: "utf8" }).trim();
      const st = execSync(`git status --porcelain -- ${f}`, { encoding: "utf8" }).trim();
      ok(d === "" && st === "", `${f} origin/main ile birebir ayni (astroloji donmus-fark korumalari bozulmaz)`, d || st);
    }
    // F3 (Owner kararı 26.11.2026): V1 liste/detay ekranları kaldırıldı; tek ekran F3 (onaylı F2 tasarımı).
    const { existsSync } = await import("node:fs");
    ok(!existsSync("app/sifa-rehberi/[id]/page.tsx") && !existsSync("app/api/sifa-rehberi"), "F3: V1 detay ekranı ve V1 API'si kaldırıldı");
    const layoutSrc = readFileSync("app/sifa-rehberi/layout.tsx", "utf8");
    ok(/sifaScreen\(sifaV2EnabledFromEnv\(\)\) === "v2"\) return <SifaRehberi \/>/.test(layoutSrc) && /bakımda/.test(layoutSrc), "layout: bayrak açıkken F3 ekranı, kapalıyken 'bakımda' iletisi (kaynak doğrulaması)");
  } finally {
    proxy.closeAllConnections();
    rpcServer.closeAllConnections();
    await new Promise<void>((r) => proxy.close(() => r()));
    await new Promise<void>((r) => rpcServer.close(() => r()));
    await pool.end().catch(() => {});
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
  if (fail) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

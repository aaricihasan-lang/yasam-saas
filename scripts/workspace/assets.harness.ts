/**
 * KİŞİSEL DİJİTAL OFİS (P2) — GÖRSEL DEPOLAMA + KADEMELİ AÇILIŞ ROUTE HARNESS
 * Gerçek Next route handler'ları + gerçek migration'lar (20271227000000 + 20271228000000) + yerel embedded-postgres +
 * (B mimarisi: ham parçalar private staging bucket'ta; 10 MB akış, Vercel yanıt sınırı, idempotent tamamlama, temizlik)
 * PostgREST şimi + Storage emülatörü (scripts/anamnez/testEnv — yalnız içe aktarılır). Production'a SIFIR temas; sentetik veri.
 * Çalıştır: npx tsx scripts/workspace/assets.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import zlib from "node:zlib";
import crypto, { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
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
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string; admin?: boolean };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const MIGS = ["20271227000000_expert_workspace_designs_prefs.sql", "20271228000000_expert_workspace_assets_access.sql"]
  .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function pixelBombPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(Buffer.alloc(64))), pngChunk("IEND", Buffer.alloc(0))]);
}

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: 54479, dirName: "kdo-workspace-assets-pgdata", extraSql: MIGS });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.REQUIRE_DB_SUPER_ADMIN_MARKER = "true";
  delete process.env.EXPERT_WORKSPACE_ROLLOUT_ALL;
  const seed: Seed = await seedAnamnez(env.su);
  const TD = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_KDO2_DEMO')`, [TD]);
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, seed.users.DEMO.id]);
  const mkUser = async (label: string, role: string, superAdmin: boolean, tenant: string) => {
    const id = randomUUID();
    const token = `zz-kdo2-tok-${label}-${id.slice(0, 8)}`;
    await env.su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
       values ($1,$2,$3,$4,true,'approved','{"clients":true}','premium','premium',$5,$6)`,
      [id, `ZZ_KDO2_${label}`, `zz.kdo2.${label}@example.test`, role, tenant, superAdmin],
    );
    await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { id, token };
  };
  const TO = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_KDO2_OWNER')`, [TO]);
  const OWNER = await mkUser("owner", "admin", true, TO);
  const ADMIN2 = await mkUser("admin2", "admin", false, TO);
  const C = await mkUser("c", "expert", false, seed.TB);
  console.log(`embedded-postgres + PostgREST şimi + Storage emülatörü hazır (${env.url}).`);

  try {
    const assetsRoute = await import("../../app/api/settings/workspace/assets/route");
    const startRoute = await import("../../app/api/settings/workspace/assets/uploads/route");
    const abortRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/route");
    const chunkRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/chunks/[index]/route");
    const completeRoute = await import("../../app/api/settings/workspace/assets/uploads/[uploadId]/complete/route");
    const assetRoute = await import("../../app/api/settings/workspace/assets/[assetId]/route");
    const designRoute = await import("../../app/api/settings/workspace/design/route");
    const accessRoute = await import("../../app/api/admin/workspace-access/route");
    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const asC: Auth = { id: C.id, token: C.token };
    const asOwner: Auth = { id: OWNER.id, token: OWNER.token };
    const asOwnerAdmin: Auth = { id: OWNER.id, token: OWNER.token, admin: true };
    const asAdmin2: Auth = { id: ADMIN2.id, token: ADMIN2.token, admin: true };
    const asDemo: Auth = { id: U.DEMO.id, token: U.DEMO.token };

    let maxResp = 0;
    async function call(handler: unknown, method: string, auth: Auth, opts: { body?: unknown; raw?: Uint8Array; params?: Record<string, string>; query?: string } = {}): Promise<{ status: number; json: Json; res: Response; bytes: number }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers[auth.admin ? "x-admin-id" : "x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      let body: BodyInit | undefined;
      if (opts.raw) { headers["content-type"] = "application/octet-stream"; headers["content-length"] = String(opts.raw.length); body = Buffer.from(opts.raw); }
      else if (opts.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.body); }
      const req = new NextRequest(`http://localhost/api/test${opts.query ?? ""}`, { method, headers, body });
      const errBefore = env.stats.errors;
      const res = await (handler as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
      if (env.stats.errors !== errBefore) console.error(`  ! PostgREST hata: ${method} ${res.status} ${JSON.stringify(opts.body ?? opts.params ?? "").slice(0, 120)}`);
      let json: Json = {};
      if ((res.headers.get("content-type") ?? "").includes("json")) { try { json = (await res.clone().json()) as Json; } catch { json = {}; } }
      const bytes = (await res.clone().arrayBuffer()).byteLength; // Vercel işlev yanıt sınırı (~4,5 MB) izlenir
      maxResp = Math.max(maxResp, bytes);
      return { status: res.status, json, res, bytes };
    }
    const listAs = (a: Auth) => call(assetsRoute.GET, "GET", a);
    const objectsUnder = (prefix: string) => [...(env.storage.objects.get("expert-workspace")?.keys() ?? [])].filter((k) => k.startsWith(prefix));
    const stagingUnder = (prefix: string) => [...(env.storage.objects.get("expert-workspace-staging")?.keys() ?? [])].filter((k) => k.startsWith(prefix));
    // Test benzetimi: süresi dolmuş oturum. expires_at değişmezlik tetikleyicisiyle korunur → yalnız bu ifade için tetikleyici
    // devre dışı (session_replication_role = replica; YALNIZ yerel test veritabanı, ürün kuralı değişmez).
    const expireUpload = async (id: string) => {
      await env.su.query("BEGIN");
      await env.su.query("SET LOCAL session_replication_role = replica");
      await env.su.query(`update public.expert_workspace_uploads set expires_at = now() - interval '1 minute' where id=$1`, [id]);
      await env.su.query("COMMIT");
    };
    const uploadRow = async (id: string) => (await env.su.query(`select * from public.expert_workspace_uploads where id=$1`, [id])).rows[0];
    const assetRow = async (id: string) => (await env.su.query(`select * from public.expert_workspace_assets where id=$1`, [id])).rows[0];

    /** Tam yükleme akışı: başlat → parçalar → tamamla. */
    type UploadResult = { stage: string; status: number; json: Json; uploadId?: string; chunkCount?: number; completeBytes?: number };
    async function upload(a: Auth, kind: "logo" | "photo", bytes: Buffer, fileName: string, mimeType: string): Promise<UploadResult> {
      const s = await call(startRoute.POST, "POST", a, { body: { kind, fileName, mimeType, size: bytes.length } });
      if (s.status !== 200) return { stage: "start", ...s };
      const { uploadId, chunkSize, chunkCount } = s.json as { uploadId: string; chunkSize: number; chunkCount: number };
      for (let i = 0; i < chunkCount; i++) {
        const c = await call(chunkRoute.PUT, "PUT", a, { raw: bytes.subarray(i * chunkSize, Math.min(bytes.length, (i + 1) * chunkSize)), params: { uploadId, index: String(i) } });
        if (c.status !== 200) return { stage: "chunk", uploadId, ...c };
      }
      const done = await call(completeRoute.POST, "POST", a, { params: { uploadId } });
      return { stage: "complete", uploadId, chunkCount, completeBytes: done.bytes, status: done.status, json: done.json };
    }

    // Fikstürler
    const jpgExif = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 40 } } })
      .withExif({ IFD0: { ImageDescription: "ZZ-GIZLI-KONUM" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 0/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "28/1 58/1 0/1" } })
      .jpeg().toBuffer();
    const noise = Buffer.alloc(1650 * 1650 * 3);
    crypto.randomFillSync(noise);
    const bigPng = await sharp(noise, { raw: { width: 1650, height: 1650, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    const logoPng = await sharp({ create: { width: 900, height: 300, channels: 4, background: { r: 30, g: 30, b: 90, alpha: 0.5 } } }).png().toBuffer();

    section("Genel bayrak + kullanıcı bazlı açılış");
    delete process.env.EXPERT_WORKSPACE_DESIGN_ENABLED;
    ok((await listAs(asOwner)).status === 404, "bayrak kapalı: Owner bile 404");
    process.env.EXPERT_WORKSPACE_DESIGN_ENABLED = "true";
    ok([401, 403].includes((await listAs({})).status), "oturumsuz → 401/403");
    ok((await listAs(asA)).status === 404, "izin listesinde olmayan uzman → 404 (görseller)");
    ok((await call(designRoute.GET, "GET", asA)).status === 404, "izin listesinde olmayan uzman → 404 (P1 tasarım ucu da kapalı)");
    ok((await listAs(asOwner)).status === 200, "1. adım: Owner (is_super_admin) erişir");
    ok([401, 403].includes((await call(accessRoute.POST, "POST", asA, { body: { action: "grant", userId: U.A.id } })).status), "uzman izin ucunu çağıramaz (admin değil)");
    ok([401, 403].includes((await call(accessRoute.POST, "POST", { id: U.A.id, token: U.A.token, admin: true }, { body: { action: "grant", userId: U.A.id } })).status), "uzman admin başlığıyla da kendine izin veremez");
    const a2g = await call(accessRoute.POST, "POST", asAdmin2, { body: { action: "grant", userId: U.A.id } });
    ok(a2g.status === 403, "Owner olmayan admin izin veremez (requireMainAdmin) → 403", a2g.json);
    ok((await call(accessRoute.GET, "GET", asAdmin2)).status === 403, "Owner olmayan admin izin listesini göremez");
    const g1 = await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: U.A.id, note: "test uzmanı" } });
    ok(g1.status === 200 && g1.json.grant.user_id === U.A.id && g1.json.grant.granted_by === OWNER.id && g1.json.grant.tenant_id === seed.TA, "2. adım: Owner test uzmanına izin verir (kayıt: veren + tenant)", g1.json);
    ok((await listAs(asA)).status === 200, "izinli uzman erişir");
    ok((await listAs(asA2)).status === 404, "aynı tenant'taki izinsiz uzman yine 404 (izin kişiye özel)");
    ok((await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: U.A.id } })).status === 409, "aynı uzmana ikinci etkin izin → 409");
    ok((await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: U.DEMO.id } })).status === 400, "demo hesaba izin verilemez → 400");
    ok((await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: U.PENDING.id } })).status === 400, "onaysız hesaba izin verilemez → 400");
    ok((await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: OWNER.id } })).status === 400, "Owner kendine izin kaydı açmaz → 400");
    ok((await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: U.A2.id, granted_by: U.A2.id } })).status === 400, "istemci granted_by gönderemez (bilinmeyen alan) → 400");
    const rv = await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "revoke", userId: U.A.id } });
    ok(rv.status === 200 && rv.json.grant.revoked_by === OWNER.id && rv.json.grant.revoke_reason === "owner_revoked", "Owner izni geri alır (satır silinmez)");
    ok((await listAs(asA)).status === 404, "geri alınan izinle erişim kapanır");
    ok((await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "revoke", userId: U.A.id } })).status === 404, "ikinci geri alma → 404");
    const gl = await call(accessRoute.GET, "GET", asOwnerAdmin);
    ok(gl.status === 200 && gl.json.grants.some((x: Json) => x.user_id === U.A.id && x.revoked_at), "geri alınan izin denetim izi olarak listede");
    for (const u of [U.A.id, U.A2.id, U.B.id]) await call(accessRoute.POST, "POST", asOwnerAdmin, { body: { action: "grant", userId: u } });
    ok((await listAs(asA)).status === 200 && (await listAs(asB)).status === 200, "A, A2, B yeniden izinli");
    ok((await listAs(asC)).status === 404, "C izinsiz → 404");
    process.env.EXPERT_WORKSPACE_ROLLOUT_ALL = "true";
    ok((await listAs(asC)).status === 200, "3. adım (EXPERT_WORKSPACE_ROLLOUT_ALL=true): bütün uzmanlar erişir");
    const demoStart = await call(startRoute.POST, "POST", asDemo, { body: { kind: "logo", fileName: "a.png", mimeType: "image/png", size: 100 } });
    ok(demoStart.status === 403 && demoStart.json.code === "DEMO_READONLY", "demo hesap yükleme başlatamaz → 403 DEMO_READONLY");
    delete process.env.EXPERT_WORKSPACE_ROLLOUT_ALL;
    ok((await listAs(asC)).status === 404, "ROLLOUT_ALL kaldırılınca C yine 404 (varsayılan kapalı)");

    section("Yükleme başlatma doğrulaması");
    const st = (body: Json, a: Auth = asA) => call(startRoute.POST, "POST", a, { body });
    ok((await st({ kind: "logo", fileName: "l.png", mimeType: "image/png", size: 2 * 1024 * 1024 + 1 })).status === 413, "logo 2 MB + 1 bayt → 413");
    ok((await st({ kind: "photo", fileName: "p.jpg", mimeType: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).status === 413, "fotoğraf 10 MB + 1 bayt → 413");
    ok((await st({ kind: "photo", fileName: "p.svg", mimeType: "image/svg+xml", size: 100 })).status === 415, "SVG → 415");
    ok((await st({ kind: "photo", fileName: "p.png", mimeType: "image/jpeg", size: 100 })).status === 400, "uzantı / MIME uyuşmazlığı → 400");
    const heic = await st({ kind: "photo", fileName: "IMG.HEIC", mimeType: "image/heic", size: 100 });
    ok(heic.status === 415 && /JPEG/.test(heic.json.error), "HEIC → 415 + anlaşılır mesaj");
    ok((await st({ kind: "banner", fileName: "a.png", mimeType: "image/png", size: 100 })).status === 400, "bilinmeyen tür → 400");
    ok((await st({ kind: "logo", fileName: "a.png", mimeType: "image/png", size: 100, path: "x/y" })).status === 400, "istemci Storage yolu gönderemez (bilinmeyen alan) → 400");

    section("Tam yükleme: fotoğraf (çok parçalı) + logo + EXIF temizliği");
    const up1 = await upload(asA, "photo", bigPng, "buyuk.png", "image/png");
    ok(up1.status === 200 && (up1 as Json).chunkCount === Math.ceil(bigPng.length / (3 * 1024 * 1024)) && (up1 as Json).chunkCount >= 3, `çok parçalı fotoğraf (${(bigPng.length / 1048576).toFixed(1)} MB, ${(up1 as Json).chunkCount} parça) yüklenir`, { stage: up1.stage, s: up1.status, j: up1.json });
    const photo1 = up1.json.asset as Json;
    ok(photo1 && photo1.desktop.width === 1650 && photo1.desktop.height === 1650 && photo1.mobile.width === 1280 && photo1.mobile.height === 1280, "fotoğraf varyantları: masaüstü 1650 (büyütme yok), mobil 1280; kare oran korunur", photo1);
    ok(photo1 && !("desktop_path" in photo1) && !JSON.stringify(photo1).includes(seed.TA), "yanıtta Storage yolu / tenant kimliği yok (yalnız assetId)");
    ok(objectsUnder(`${seed.TA}/${U.A.id}/${photo1.id}/`).length === 2, "private bucket'ta tenant/kullanıcı/asset önekli 2 varyant");
    ok(stagingUnder(`${seed.TA}/${U.A.id}/${up1.uploadId}/`).length === 0, "tamamlanınca geçici parçalar (staging bucket) silindi");
    const up2 = await upload(asA, "photo", jpgExif, "exif.jpg", "image/jpeg");
    const photo2 = up2.json.asset as Json;
    ok(up2.status === 200 && photo2.desktop.width === 2560 && photo2.desktop.height === 1707, "3000×2000 JPEG → 2560×1707 (oran korunur)", up2.json);
    const g = await call(assetRoute.GET, "GET", asA, { params: { assetId: photo2.id }, query: "?v=desktop" });
    const gbytes = Buffer.from(await g.res.arrayBuffer());
    const gmeta = await sharp(gbytes).metadata();
    ok(g.status === 200 && g.res.headers.get("content-type") === "image/webp" && g.res.headers.get("x-content-type-options") === "nosniff" && /no-store/.test(g.res.headers.get("cache-control") ?? ""), "görsel sunucu rotasından akar: image/webp, nosniff, no-store");
    ok(gmeta.format === "webp" && !gmeta.exif && !gbytes.includes(Buffer.from("ZZ-GIZLI-KONUM")), "indirilen görselde EXIF / GPS yok");
    const gm = await call(assetRoute.GET, "GET", asA, { params: { assetId: photo2.id }, query: "?v=mobile" });
    ok(gm.status === 200 && (await sharp(Buffer.from(await gm.res.arrayBuffer())).metadata()).width === 1280, "mobil varyant 1280 px");
    const up3 = await upload(asA, "logo", logoPng, "logo.png", "image/png");
    const logo1 = up3.json.asset as Json;
    ok(up3.status === 200 && logo1.kind === "logo" && logo1.desktop.width === 900 && logo1.mobile.width === 600 && logo1.mobile.height === 200, "logo: masaüstü 900×300, mobil 600×200 (oran korunur)", up3.json);
    ok((await listAs(asA)).json.assets.length === 3, "A'nın 3 etkin görseli listelenir");

    section("Görsel güvenliği (içerik doğrulaması)");
    const rejUp = async (label: string, bytes: Buffer, name: string, mime: string, code: string, kind: "logo" | "photo" = "photo") => {
      const r = await upload(asA, kind, bytes, name, mime);
      const chunks = r.uploadId ? stagingUnder(`${seed.TA}/${U.A.id}/${r.uploadId}/`).length : 0;
      const stt = r.uploadId ? (await env.su.query(`select status from public.expert_workspace_uploads where id=$1`, [r.uploadId])).rows[0]?.status : "-";
      ok(r.stage === "complete" && r.status >= 400 && r.status < 500 && r.json.code === code && chunks === 0 && stt === "aborted", `${label} → ${r.status} ${code}; oturum iptal, parçalar silindi`, { stage: r.stage, s: r.status, j: r.json, chunks, stt });
    };
    const smallJpg = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
    await rejUp("SVG içerik .png adıyla", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.png", "image/png", "unsupported_type");
    await rejUp("HTML içerik .jpg adıyla", Buffer.from("<html><body onload=alert(1)>x</body></html>"), "x.jpg", "image/jpeg", "unsupported_type");
    await rejUp("polyglot JPEG + ZIP", Buffer.concat([smallJpg, Buffer.from("PK\u0003\u0004"), Buffer.alloc(300, 9)]), "p.jpg", "image/jpeg", "trailing_data");
    await rejUp("içerik JPEG, beyan PNG", smallJpg, "p.png", "image/png", "type_mismatch");
    await rejUp("kesik JPEG", smallJpg.subarray(0, 400), "k.jpg", "image/jpeg", "corrupt");
    await rejUp("piksel bombası 20000×20000", pixelBombPng(20000, 20000), "b.png", "image/png", "too_large_pixels");
    ok(objectsUnder(`${seed.TA}/`).length === 6, "reddedilen dosyalardan Storage'a hiçbir şey yazılmadı (yalnız 3 kabul × 2 varyant)");

    section("Parça protokolü + başka uzmanın oturumu");
    const s1 = await st({ kind: "photo", fileName: "p.png", mimeType: "image/png", size: 5_000_000 });
    const uid = s1.json.uploadId as string;
    ok(s1.status === 200 && s1.json.chunkCount === 2, "5 MB → 2 parça");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(100), params: { uploadId: uid, index: "0" } })).status === 400, "yanlış boyutlu parça → 400");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(100), params: { uploadId: uid, index: "5" } })).status === 400, "aralık dışı parça numarası → 400");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(3 * 1024 * 1024 + 1), params: { uploadId: uid, index: "0" } })).status === 413, "3 MB üstü parça → 413");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(3 * 1024 * 1024, 1), params: { uploadId: uid, index: "0" } })).status === 200 && stagingUnder(`${seed.TA}/${U.A.id}/${uid}/`).length === 1, "doğru parça kabul (sunucu staging bucket'a yazdı)");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(3 * 1024 * 1024, 1), params: { uploadId: uid, index: "0" } })).status === 409, "aynı parça tekrar → 409");
    ok((await call(completeRoute.POST, "POST", asA, { params: { uploadId: uid } })).status === 409, "eksik parçayla tamamlama → 409");
    ok((await call(chunkRoute.PUT, "PUT", asB, { raw: Buffer.alloc(5_000_000 - 3 * 1024 * 1024, 1), params: { uploadId: uid, index: "1" } })).status === 404, "B, A'nın oturumuna parça yazamaz → 404");
    ok((await call(completeRoute.POST, "POST", asB, { params: { uploadId: uid } })).status === 404, "B, A'nın oturumunu tamamlayamaz → 404");
    ok((await call(abortRoute.DELETE, "DELETE", asB, { params: { uploadId: uid } })).status === 404, "B, A'nın oturumunu iptal edemez → 404");
    ok((await call(abortRoute.DELETE, "DELETE", asA, { params: { uploadId: uid } })).status === 200, "A kendi oturumunu iptal eder");
    ok(stagingUnder(`${seed.TA}/${U.A.id}/${uid}/`).length === 0 && !!(await uploadRow(uid)).staging_cleared_at, "iptalde geçici parçalar (staging bucket) silindi ve işaretlendi");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(10), params: { uploadId: uid, index: "1" } })).status === 410, "kapalı oturuma parça → 410");
    ok((await call(chunkRoute.PUT, "PUT", asA, { raw: Buffer.alloc(10), params: { uploadId: "../../x", index: "0" } })).status === 404, "geçersiz oturum kimliği → 404");


    section("B mimarisi: 10 MB gerçek akış + Vercel yanıt sınırı");
    const raw10 = Buffer.alloc(1860 * 1860 * 3);
    crypto.randomFillSync(raw10);
    const png10 = await sharp(raw10, { raw: { width: 1860, height: 1860, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    ok(png10.length > 9.5 * 1024 * 1024 && png10.length <= 10 * 1024 * 1024, `fikstür: sıkıştırılamayan ${(png10.length / 1048576).toFixed(2)} MB PNG (sınırın hemen altı)`);
    const respBefore = maxResp;
    const t10 = Date.now();
    const u10 = await upload(asA, "photo", png10, "on-mb.png", "image/png");
    const ms10 = Date.now() - t10;
    const a10 = u10.json.asset as Json;
    ok(u10.status === 200 && u10.chunkCount === 4 && a10?.id === u10.uploadId, `10 MB fotoğraf 4 parçada yüklenir ve tamamlanır (${ms10} ms); assetId = uploadId`, { s: u10.status, j: u10.json });
    ok(u10.completeBytes !== undefined && u10.completeBytes < 10_000, `tamamlama yanıtı yalnız üst veri: ${u10.completeBytes} bayt (ham dosya yanıtta yok)`);
    const g10 = await call(assetRoute.GET, "GET", asA, { params: { assetId: a10.id }, query: "?v=desktop" });
    const g10m = await call(assetRoute.GET, "GET", asA, { params: { assetId: a10.id }, query: "?v=mobile" });
    ok(g10.status === 200 && g10.bytes <= 4_000_000 && Number(g10.res.headers.get("content-length")) === g10.bytes && g10m.bytes <= 4_000_000,
      `okunan varyantlar Vercel ~4,5 MB yanıt sınırının altında: masaüstü ${(g10.bytes / 1048576).toFixed(2)} MB, mobil ${(g10m.bytes / 1048576).toFixed(2)} MB`);
    ok(Math.max(maxResp, respBefore) < 4.5 * 1024 * 1024, `bu akıştaki en büyük yanıt ${(maxResp / 1048576).toFixed(2)} MB < 4,5 MB`);
    ok(stagingUnder(`${seed.TA}/${U.A.id}/${u10.uploadId}/`).length === 0 && (await uploadRow(u10.uploadId!)).staging_cleared_at, "tamamlanınca geçici parçalar staging bucket'tan silindi (işaretli)");
    ok(stagingUnder("").every((k) => !k.endsWith(".webp")) && objectsUnder("").every((k) => k.endsWith(".webp")), "kalıcı bucket'ta yalnız WebP varyantlar, staging'de yalnız ham parçalar (doğrulanmamış içerik yayımlanmaz)");

    section("B mimarisi: iki kez / eşzamanlı tamamlama (tek görsel)");
    const again = await call(completeRoute.POST, "POST", asA, { params: { uploadId: u10.uploadId! } });
    ok(again.status === 200 && again.json.reused === true && again.json.asset.id === a10.id, "tamamlanmış oturum yeniden tamamlanınca AYNI görsel döner (reused)", again.json);
    const rows10 = Number((await env.su.query(`select count(*) n from public.expert_workspace_assets where id=$1`, [a10.id])).rows[0].n);
    ok(rows10 === 1 && objectsUnder(`${seed.TA}/${U.A.id}/${a10.id}/`).length === 2, "ikinci çağrı yeni kayıt / dosya üretmedi");
    const conc = await call(startRoute.POST, "POST", asA, { body: { kind: "logo", fileName: "c.png", mimeType: "image/png", size: logoPng.length } });
    const cid = conc.json.uploadId as string;
    await call(chunkRoute.PUT, "PUT", asA, { raw: logoPng, params: { uploadId: cid, index: "0" } });
    const trio = await Promise.all([0, 1, 2].map(() => call(completeRoute.POST, "POST", asA, { params: { uploadId: cid } })));
    const okCount = trio.filter((r) => r.status === 200).length;
    const ids = new Set(trio.filter((r) => r.status === 200).map((r) => r.json.asset.id));
    const rowsC = Number((await env.su.query(`select count(*) n from public.expert_workspace_assets where id=$1`, [cid])).rows[0].n);
    ok(okCount >= 1 && ids.size === 1 && [...ids][0] === cid && trio.every((r) => r.status === 200 || (r.status === 409 && r.json.code === "processing")) && rowsC === 1 && objectsUnder(`${seed.TA}/${U.A.id}/${cid}/`).length === 2,
      `3 eşzamanlı tamamlama → tek görsel (200: ${okCount}, 409 işleniyor: ${3 - okCount})`, trio.map((r) => [r.status, r.json.code]));

    section("B mimarisi: hata sonrası güvenli toparlanma");
    const two = Buffer.concat([await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 9, g: 99, b: 199 } } }).png({ compressionLevel: 0 }).toBuffer()]);
    const sr = await call(startRoute.POST, "POST", asA, { body: { kind: "photo", fileName: "iki.png", mimeType: "image/png", size: two.length } });
    const rid = sr.json.uploadId as string;
    const CS = sr.json.chunkSize as number;
    ok(sr.status === 200 && sr.json.chunkCount >= 2 && Date.parse(sr.json.expiresAt) - Date.now() > 14 * 60_000 && Date.parse(sr.json.expiresAt) - Date.now() <= 15 * 60_000 + 5_000, "oturum süresi 15 dakika", sr.json);
    await call(chunkRoute.PUT, "PUT", asA, { raw: two.subarray(0, CS), params: { uploadId: rid, index: "0" } });
    const miss = await call(completeRoute.POST, "POST", asA, { params: { uploadId: rid } });
    ok(miss.status === 409 && miss.json.code === "incomplete" && JSON.stringify(miss.json.missing) === JSON.stringify(Array.from({ length: sr.json.chunkCount - 1 }, (_, i) => i + 1)) && (await uploadRow(rid)).status === "open",
      "eksik parçayla tamamlama → 409 + eksik liste; oturum yeniden açık (güvenli yeniden deneme)", miss.json);
    const retry0 = await call(chunkRoute.PUT, "PUT", asA, { raw: two.subarray(0, CS), params: { uploadId: rid, index: "0" } });
    ok(retry0.status === 409 && retry0.json.code === "chunk_exists", "zaten yazılmış parçanın yeniden gönderilmesi → 409 chunk_exists (istemci başarılı sayar)");
    // Staging'de parça kaybı (ör. dış silme) → tamamlama eksik parçayı bildirir, yeniden gönderilip tamamlanır.
    for (let i = 1; i < sr.json.chunkCount; i++) await call(chunkRoute.PUT, "PUT", asA, { raw: two.subarray(i * CS, Math.min(two.length, (i + 1) * CS)), params: { uploadId: rid, index: String(i) } });
    env.storage.objects.get("expert-workspace-staging")!.delete(`${seed.TA}/${U.A.id}/${rid}/1.part`);
    const lost = await call(completeRoute.POST, "POST", asA, { params: { uploadId: rid } });
    ok(lost.status === 409 && JSON.stringify(lost.json.missing) === "[1]", "kaybolan parça tespit edilir (missing [1])", lost.json);
    await call(chunkRoute.PUT, "PUT", asA, { raw: two.subarray(CS, Math.min(two.length, 2 * CS)), params: { uploadId: rid, index: "1" } });
    const rec = await call(completeRoute.POST, "POST", asA, { params: { uploadId: rid } });
    ok(rec.status === 200 && rec.json.asset.id === rid, "parça yeniden gönderilince tamamlama başarılı", rec.json);
    // Çökmüş işlem (kilit düşmüş) ↔ süren işlem
    const sx = await call(startRoute.POST, "POST", asA, { body: { kind: "logo", fileName: "x.png", mimeType: "image/png", size: logoPng.length } });
    const xid = sx.json.uploadId as string;
    await call(chunkRoute.PUT, "PUT", asA, { raw: logoPng, params: { uploadId: xid, index: "0" } });
    await env.su.query(`update public.expert_workspace_uploads set status='processing', processing_started_at=now() where id=$1`, [xid]);
    const busy = await call(completeRoute.POST, "POST", asA, { params: { uploadId: xid } });
    ok(busy.status === 409 && busy.json.code === "processing", "süren işlem varken tamamlama → 409 işleniyor");
    ok((await call(abortRoute.DELETE, "DELETE", asA, { params: { uploadId: xid } })).status === 409, "işlenen oturum iptal edilemez → 409");
    await env.su.query(`update public.expert_workspace_uploads set processing_started_at=now() - interval '5 minutes', updated_at=now() where id=$1`, [xid]);
    const stale = await call(completeRoute.POST, "POST", asA, { params: { uploadId: xid } });
    ok(stale.status === 200 && stale.json.asset.id === xid, "kilidi düşmüş (çökmüş) işlem yeniden alınır ve tamamlanır", stale.json);
    // Storage silme hatası → görsel yine tamamlanır, geçici dosya saatlik temizliğe kalır.
    const sy = await call(startRoute.POST, "POST", asA, { body: { kind: "logo", fileName: "y.png", mimeType: "image/png", size: logoPng.length } });
    const yid = sy.json.uploadId as string;
    await call(chunkRoute.PUT, "PUT", asA, { raw: logoPng, params: { uploadId: yid, index: "0" } });
    env.storage.failRemove = true;
    const yc = await call(completeRoute.POST, "POST", asA, { params: { uploadId: yid } });
    env.storage.failRemove = false;
    ok(yc.status === 200 && stagingUnder(`${seed.TA}/${U.A.id}/${yid}/`).length === 1 && !(await uploadRow(yid)).staging_cleared_at, "geçici dosya silinemese de görsel tamamlanır; dosya işaretsiz kalır (temizliğe)");

    section("B mimarisi: saatlik temizlik (Inngest)");
    const { cleanupStaging } = await import("../../lib/workspace/assets");
    const { getServerDb } = await import("../../lib/supabase-server");
    // Terk edilmiş açık oturum (A) + süren / taze oturum (B, başka tenant) + bitmemiş ama süresi dolmamış oturum (A)
    const ab = await call(startRoute.POST, "POST", asA, { body: { kind: "photo", fileName: "terk.png", mimeType: "image/png", size: two.length } });
    await call(chunkRoute.PUT, "PUT", asA, { raw: two.subarray(0, CS), params: { uploadId: ab.json.uploadId, index: "0" } });
    await expireUpload(ab.json.uploadId);
    const live = await call(startRoute.POST, "POST", asB, { body: { kind: "photo", fileName: "canli.png", mimeType: "image/png", size: two.length } });
    await call(chunkRoute.PUT, "PUT", asB, { raw: two.subarray(0, CS), params: { uploadId: live.json.uploadId, index: "0" } });
    const keepObjects = objectsUnder("").length;
    const c1 = await cleanupStaging(getServerDb());
    ok("scanned" in c1 && c1.aborted >= 1 && c1.cleared >= 1 && c1.failed === 0, "saatlik temizlik: terk edilen oturum iptal + parçaları silindi (silinemeyen dosya uzmanın sonraki yüklemesinde zaten toparlandı)", c1);
    ok((await uploadRow(ab.json.uploadId)).status === "aborted" && stagingUnder(`${seed.TA}/${U.A.id}/${ab.json.uploadId}/`).length === 0, "terk edilen oturum iptal, geçici parçası yok");
    ok(stagingUnder(`${seed.TA}/${U.A.id}/${yid}/`).length === 0 && (await uploadRow(yid)).staging_cleared_at, "tamamlanmış oturumun kalan geçici dosyası silindi ve işaretlendi");
    ok((await uploadRow(live.json.uploadId)).status === "open" && stagingUnder(`${seed.TB}/${U.B.id}/${live.json.uploadId}/`).length === 1, "süresi dolmamış (başka tenant) oturuma dokunulmadı");
    ok(objectsUnder("").length === keepObjects, "temizlik kalıcı görsellere (expert-workspace) ASLA dokunmaz");
    const c2 = await cleanupStaging(getServerDb());
    ok("scanned" in c2 && c2.aborted === 0 && c2.failed === 0 && !stagingUnder("").some((k) => k.includes(ab.json.uploadId)), "ikinci çalıştırma idempotent", c2);
    const { runWorkspaceStagingCleanup, workspaceStagingCleanupFunction, WORKSPACE_STAGING_CLEANUP_CRON, WORKSPACE_STAGING_CLEANUP_RETRIES } = await import("../../lib/inngest/functions/workspaceStagingCleanup");
    const inngestRoute = readFileSync(path.join(process.cwd(), "app/api/inngest/route.ts"), "utf8");
    const fnOpts = (workspaceStagingCleanupFunction as unknown as { opts?: Json }).opts ?? {};
    ok(/workspaceStagingCleanupFunction,/.test(inngestRoute) && WORKSPACE_STAGING_CLEANUP_CRON === "23 * * * *" && JSON.stringify(fnOpts.triggers ?? []).includes("23 * * * *") && fnOpts.retries === WORKSPACE_STAGING_CLEANUP_RETRIES && WORKSPACE_STAGING_CLEANUP_RETRIES >= 1 && fnOpts.concurrency === 1,
      "Inngest: /api/inngest'te kayıtlı, saatlik cron (xx:23), concurrency 1, hata durumunda yeniden deneme (retries 3)", { fnOpts });
    const okRun = await runWorkspaceStagingCleanup();
    ok(okRun.status === "ok", "zamanlanmış iş çekirdeği çalışır (status ok)", okRun);
    // Silme hatası → iş hata fırlatır → Inngest yeniden dener; sonraki deneme toparlar.
    const sz = await call(startRoute.POST, "POST", asA, { body: { kind: "logo", fileName: "z.png", mimeType: "image/png", size: logoPng.length } });
    const zid = sz.json.uploadId as string;
    await call(chunkRoute.PUT, "PUT", asA, { raw: logoPng, params: { uploadId: zid, index: "0" } });
    await expireUpload(zid);
    env.storage.failRemove = true;
    let threw = false;
    try { await runWorkspaceStagingCleanup(); } catch { threw = true; }
    env.storage.failRemove = false;
    ok(threw && (await uploadRow(zid)).status === "aborted" && !(await uploadRow(zid)).staging_cleared_at && stagingUnder(`${seed.TA}/${U.A.id}/${zid}/`).length === 1,
      "Storage silme hatasında zamanlanmış iş hata fırlatır (Inngest yeniden dener); oturum iptal, dosya işaretsiz bekler");
    const retryRun = await runWorkspaceStagingCleanup();
    ok(retryRun.status === "ok" && stagingUnder(`${seed.TA}/${U.A.id}/${zid}/`).length === 0 && !!(await uploadRow(zid)).staging_cleared_at, "yeniden denemede geçici dosya silinir ve işaretlenir", retryRun);

    section("Tenant / kullanıcı izolasyonu + istemci Storage erişimi");
    ok((await call(assetRoute.GET, "GET", asB, { params: { assetId: photo1.id } })).status === 404, "B (başka tenant) A'nın assetId'siyle okuyamaz → 404");
    ok((await call(assetRoute.GET, "GET", asA2, { params: { assetId: photo1.id } })).status === 404, "A2 (aynı tenant, başka uzman) okuyamaz → 404");
    ok((await call(assetRoute.DELETE, "DELETE", asA2, { params: { assetId: photo1.id }, body: { confirm: true } })).status === 404, "A2 silemez → 404");
    ok((await listAs(asB)).json.assets.length === 0, "B'nin listesinde A'nın görselleri yok");
    ok((await call(assetRoute.GET, "GET", asA, { params: { assetId: "../../etc" } })).status === 404, "yol benzeri assetId → 404");
    const anonPut = await fetch(`${env.url}/storage/v1/object/expert-workspace/${seed.TA}/${U.A.id}/x/desktop.webp`, { method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "content-type": "image/webp" }, body: Buffer.from("RIFF") });
    ok(anonPut.status >= 400, "istemci anahtarıyla Storage'a doğrudan yazma reddedilir", anonPut.status);
    const pub = await fetch(`${env.url}/storage/v1/object/public/expert-workspace/${seed.TA}/${U.A.id}/${photo1.id}/desktop.webp`);
    ok(pub.status >= 400, "bucket herkese açık değil (public URL çalışmaz)", pub.status);
    const anonGet = await fetch(`${env.url}/storage/v1/object/authenticated/expert-workspace/${seed.TA}/${U.A.id}/${photo1.id}/desktop.webp`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    ok(anonGet.status >= 400, "istemci anahtarıyla Storage'dan doğrudan okuma reddedilir", anonGet.status);

    section("Tasarım referansları: sahiplik + silme koruması");
    const dget = async (a: Auth) => (await call(designRoute.GET, "GET", a)).json.design;
    const dpost = (a: Auth, body: Json) => call(designRoute.POST, "POST", a, { body });
    const design = (extra: Json) => ({ layout: "B", text: { useGreeting: true }, ...extra });
    let v = (await dget(asA)).version;
    const wrongKind = await dpost(asA, { action: "saveDraft", expectedVersion: v, draft: design({ logo: { assetId: photo1.id } }) });
    ok(wrongKind.status === 400 && wrongKind.json.code === "asset_kind", "fotoğrafı logo olarak kullanma → 400 asset_kind", wrongKind.json);
    const bAsset = await upload(asB, "logo", logoPng, "b.png", "image/png");
    const foreignUse = await dpost(asA, { action: "saveDraft", expectedVersion: v, draft: design({ logo: { assetId: bAsset.json.asset.id } }) });
    ok(foreignUse.status === 400 && foreignUse.json.code === "asset_not_found", "başka uzmanın assetId'si tasarımda kullanılamaz → 400", foreignUse.json);
    ok((await dpost(asA, { action: "saveDraft", expectedVersion: v, draft: design({ logo: { src: "https://x/y.png" } }) })).status === 400, "dosya yolu / URL hâlâ reddedilir");
    const d1 = await dpost(asA, { action: "saveDraft", expectedVersion: v, draft: design({ bg: { mode: "photo", photoAssetId: photo1.id, scope: "page" } }) });
    ok(d1.status === 200, "kendi fotoğrafı taslakta kullanılır", d1.json);
    v = d1.json.design.version;
    const delDraft = await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: photo1.id }, body: { confirm: true } });
    ok(delDraft.status === 409 && delDraft.json.code === "asset_in_use" && delDraft.json.where.includes("taslak"), "taslakta kullanılan görsel silinmez → 409", delDraft.json);
    const ap = await dpost(asA, { action: "apply", expectedVersion: v });
    ok(ap.status === 200, "fotoğraflı tasarım uygulanır (fotoğraf: istemci piksel kapısı P4/P5)", ap.json);
    v = ap.json.design.version;
    const delApplied = await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: photo1.id }, body: { confirm: true } });
    ok(delApplied.status === 409 && delApplied.json.where.includes("uygulanan tasarım"), "uygulanan tasarımdaki görsel silinmez → 409");
    const ap2 = await dpost(asA, { action: "apply", expectedVersion: v, draft: design({ logo: { assetId: logo1.id } }) });
    v = ap2.json.design.version;
    const delHist = await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: photo1.id }, body: { confirm: true } });
    ok(ap2.status === 200 && delHist.status === 409 && delHist.json.where.some((w: string) => w.startsWith("geçmiş")), "yalnız geçmiş tasarımda kalan görsel de silinmez → 409", delHist.json);
    const rs = await dpost(asA, { action: "reset", expectedVersion: v });
    ok(rs.status === 200 && (await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: logo1.id }, body: { confirm: true } })).status === 409, "sıfırlama sonrası logo geçmişte → silinmez");
    ok(objectsUnder(`${seed.TA}/${U.A.id}/${photo1.id}/`).length === 2 && !(await assetRow(photo1.id)).deleted_at, "korunan görselin dosyaları ve kaydı yerinde");

    section("Açık kullanıcı eylemiyle silme");
    const free = photo2.id as string;
    ok((await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: free }, body: {} })).status === 400, "onaysız silme isteği → 400 (confirm gerekli)");
    ok((await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: free }, body: { confirm: "evet" } })).status === 400, "confirm yalnız true olabilir");
    const okDel = await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: free }, body: { confirm: true } });
    const row = await assetRow(free);
    ok(okDel.status === 200 && row.deleted_at && row.deleted_by === U.A.id && objectsUnder(`${seed.TA}/${U.A.id}/${free}/`).length === 0, "kullanılmayan görsel silinir: dosyalar kaldırılır, kayıt deleted_at ile korunur", okDel.json);
    ok((await call(assetRoute.GET, "GET", asA, { params: { assetId: free } })).status === 404 && (await call(assetRoute.DELETE, "DELETE", asA, { params: { assetId: free }, body: { confirm: true } })).status === 404, "silinen görsel okunamaz / tekrar silinemez");
    ok(objectsUnder(`${seed.TB}/`).length === 2, "B'nin görsel dosyalarına dokunulmadı");
    const demoDel = await call(assetRoute.DELETE, "DELETE", { id: U.DEMO.id, token: U.DEMO.token }, { params: { assetId: photo1.id }, body: { confirm: true } });
    ok(demoDel.status === 404 || demoDel.status === 403, "demo (izinsiz) silme yapamaz");

    ok(env.stats.errors === 0, "PostgREST şiminde beklenmeyen hata yok", env.stats);
  } finally {
    await env.stop();
  }
  console.log(`\nworkspace assets harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * SİLME GÜVENLİĞİ — owner-only kalıcı uzman silme ROUTE entegrasyonu (gerçek Next handler +
 * gerçek PostgreSQL + gerçek RPC + Storage API taklidi). Production'a SIFIR temas; sentetik veri.
 *
 * Kapsam: arşiv GET viewer.canPermanentDelete (owner true / normal admin false), purge route yetki
 * negatifleri (kimliksiz, uzman token, normal admin → 403), owner doğrulamaları (parola, e-posta, son
 * ifade, kendi hesabı, arşivde olmayan hedef), başarılı purge + Storage temizliği (yalnız hedef tenant
 * önekleri; başka tenant dosyası korunur), tekrar purge → 404, normal admin arşivleme (pasife alma) ve
 * yeniden aktifleştirme REGRESYONU.
 *
 * Çalıştır: npx tsx scripts/delete-safety/purge-route.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { startProxy } from "./storageProxy";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

async function main(): Promise<void> {
  const db = await startTestDb(54419, "delete-safety-purge-route");
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
  try {
    await su.query(readMig("20271009100000_admin_purge_archived_expert.sql"));
    shim = await startPgrestShim(db.pool);
    proxy = await startProxy(shim.url, su);
    process.env.NEXT_PUBLIC_SUPABASE_URL = proxy.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";

    const purgeRoute = await import("../../app/api/admin/users/[id]/purge/route");
    const archiveRoute = await import("../../app/api/admin/users/archive/route");
    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const archiveDeleteRoute = await import("../../app/api/admin/users/[id]/delete/route");

    const mkTenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 13)}`]);
      return id;
    };
    const mkUser = async (role: "admin" | "expert", o: { active?: boolean; superAdmin?: boolean } = {}) => {
      const id = randomUUID();
      const tenant = await mkTenant();
      const email = `zz.delr.${id.slice(0, 8)}@example.test`;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, approved_at)
         values ($1,$2,$3,$4,$5,'approved',$6,$7,now())`,
        [id, `ZZ_DELR ${role} ${id.slice(0, 4)}`, email, role, o.active ?? true, o.superAdmin ?? false, tenant],
      );
      const token = `zz-delr-${randomUUID()}`;
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, tenant, email, token };
    };

    type Auth = { adminId?: string; token?: string };
    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    async function call(handler: unknown, method: string, url: string, auth: Auth, body?: unknown, id = "") {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve({ id }) });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
      return { status: res.status, json };
    }

    const OWNER = await mkUser("admin", { superAdmin: true });
    const ADMIN2 = await mkUser("admin");
    const asOwner = { adminId: OWNER.id, token: OWNER.token };
    const asAdmin2 = { adminId: ADMIN2.id, token: ADMIN2.token };
    const T = await mkUser("expert", { active: false });
    const OTHER = await mkUser("expert");
    for (let i = 0; i < 3; i++) await su.query(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ_DELR')`, [T.tenant]);
    await su.query(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ_DELR other')`, [OTHER.tenant]);
    await su.query(`insert into storage.objects(bucket_id, name) values
      ('stone-photos', $1), ('stone-photos', $2), ('dogaltas-photos', $3), ('stone-photos', $4), ('client-anamnesis-files', $5)`,
      [`${T.tenant}/c1/s1/a.jpg`, `${T.tenant}/c2/b.jpg`, `catalog/${T.tenant}/x.webp`, `${OTHER.tenant}/c9/keep.jpg`, `${T.tenant}/c1/an/f.pdf`]);

    const purge = (target: string, auth: Auth, body: Record<string, unknown>) =>
      call(purgeRoute.POST, "POST", `/api/admin/users/${target}/purge`, auth, body, target);
    const good = { adminPassword: "zz-owner-pass", confirmEmail: T.email, finalPhrase: "KALICI OLARAK SİL" };
    const tClients = async () => (await su.query(`select count(*)::int n from public.clients where tenant_id = $1`, [T.tenant])).rows[0].n as number;

    // ── A) Arşiv görünümü viewer bayrağı ──────────────────────────────────────
    console.log("[A] Arşiv GET viewer.canPermanentDelete");
    let r = await call(archiveRoute.GET, "GET", "/api/admin/users/archive", asOwner);
    ok(r.status === 200 && (r.json.viewer as { canPermanentDelete?: boolean })?.canPermanentDelete === true, "owner → true");
    r = await call(archiveRoute.GET, "GET", "/api/admin/users/archive", asAdmin2);
    ok(r.status === 200 && (r.json.viewer as { canPermanentDelete?: boolean })?.canPermanentDelete === false, "normal admin → false");
    ok(((r.json.users as { id: string }[]) ?? []).some((u) => u.id === T.id), "arşiv listesinde hedef uzman var");

    // ── B) Yetki negatifleri ───────────────────────────────────────────────────
    console.log("\n[B] Yetki negatifleri");
    r = await purge(T.id, {}, good);
    ok(r.status === 401 || r.status === 403, `kimliksiz → ${r.status}`);
    r = await purge(T.id, { adminId: OTHER.id, token: OTHER.token }, good);
    ok(r.status === 401 || r.status === 403, `uzman token → ${r.status}`);
    r = await purge(T.id, { adminId: OWNER.id, token: OTHER.token }, good);
    ok(r.status === 401 || r.status === 403, `uzman token + owner ID spoof → ${r.status}`);
    r = await purge(T.id, asAdmin2, good);
    ok(r.status === 403, `normal admin doğrudan endpoint → 403 (${r.status})`);
    ok(await tClients() === 3, "yetkisiz denemeler veri silmedi");

    // ── C) Owner doğrulamaları ─────────────────────────────────────────────────
    console.log("\n[C] Owner doğrulamaları");
    r = await purge(T.id, asOwner, { ...good, adminPassword: "" });
    ok(r.status === 400, `parolasız → 400 (${r.status})`);
    r = await purge(T.id, asOwner, { ...good, finalPhrase: "SİL" });
    ok(r.status === 400, `son ifade yanlış → 400 (${r.status})`);
    r = await purge(T.id, asOwner, { ...good, confirmEmail: OTHER.email });
    ok(r.status === 400, `başka uzmanın e-postası → 400 (${r.status})`);
    r = await purge(T.id, asOwner, { ...good, adminPassword: "yanlis" });
    ok(r.status === 403, `yanlış owner parolası → 403 (${r.status})`);
    r = await purge(OWNER.id, asOwner, { ...good, confirmEmail: OWNER.email });
    ok(r.status === 400, `owner kendi hesabı → 400 (${r.status})`);
    r = await purge(OTHER.id, asOwner, { ...good, confirmEmail: OTHER.email });
    ok(r.status === 409, `aktif (arşivde olmayan) uzman → 409 (${r.status})`);
    r = await purge("not-a-uuid", asOwner, good);
    ok(r.status === 400, `geçersiz id → 400 (${r.status})`);
    ok(await tClients() === 3, "reddedilen denemeler veri silmedi");

    // ── D) Başarılı purge + Storage ────────────────────────────────────────────
    console.log("\n[D] Başarılı purge + Storage temizliği");
    r = await purge(T.id, asOwner, { ...good, finalPhrase: "kalıcı olarak sil" });
    ok(r.status === 200 && r.json.ok === true, `owner purge → 200 (${r.status} ${JSON.stringify(r.json)})`);
    ok(Number(r.json.deletedRows) >= 3, `silinen satır ${r.json.deletedRows}`);
    ok(Number(r.json.storageRemoved) === 4 && Number(r.json.storageFailures) === 0, `Storage: 4 dosya silindi, hata 0 (${r.json.storageRemoved}/${r.json.storageFailures})`);
    const left = (await su.query(`select bucket_id, name from storage.objects order by name`)).rows as { name: string }[];
    ok(left.length === 1 && left[0].name.startsWith(OTHER.tenant), "başka tenant dosyası KORUNDU, hedefin dosyası kalmadı");
    ok(await tClients() === 0, "hedef danışanları silindi");
    ok((await su.query(`select count(*)::int n from public.clients where tenant_id = $1`, [OTHER.tenant])).rows[0].n === 1, "diğer uzman danışanı yerinde");
    ok((await su.query(`select count(*)::int n from public.users where id = $1`, [T.id])).rows[0].n === 0, "hesap silindi");
    r = await call(archiveRoute.GET, "GET", "/api/admin/users/archive", asOwner);
    ok(!((r.json.users as { id: string }[]) ?? []).some((u) => u.id === T.id), "arşiv listesinden düştü (hayalet yok)");
    r = await purge(T.id, asOwner, good);
    ok(r.status === 404, `tekrar purge → 404 (${r.status})`);

    // ── E) Regresyon: normal admin arşivleme + yeniden aktifleştirme ───────────
    console.log("\n[E] Regresyon — normal admin arşivle / yeniden aktifleştir");
    const E = await mkUser("expert");
    r = await call(statusRoute.POST, "POST", `/api/admin/users/${E.id}/status`, asAdmin2, { action: "toggle_active", currentActive: true }, E.id);
    ok(r.status === 200, `normal admin pasife alır (arşive düşer) → ${r.status}`);
    r = await call(archiveRoute.GET, "GET", "/api/admin/users/archive", asAdmin2);
    ok(((r.json.users as { id: string }[]) ?? []).some((u) => u.id === E.id), "pasife alınan uzman arşivde");
    r = await purge(E.id, asAdmin2, { ...good, confirmEmail: E.email });
    ok(r.status === 403, `normal admin arşivdeki uzmanı kalıcı silemez → 403 (${r.status})`);
    r = await call(statusRoute.POST, "POST", `/api/admin/users/${E.id}/status`, asAdmin2, { action: "toggle_active", currentActive: false }, E.id);
    ok(r.status === 200, `normal admin yeniden aktifleştirir → ${r.status}`);
    ok((await su.query(`select active from public.users where id = $1`, [E.id])).rows[0].active === true, "uzman yeniden aktif");
    r = await call(archiveDeleteRoute.POST, "POST", `/api/admin/users/${E.id}/delete`, asAdmin2, { adminPassword: "zz-owner-pass" }, E.id);
    ok(r.status === 403, `"Pasife Al ve Arşivle" (ana yönetici kısıtı) mevcut davranış korunur → ${r.status}`);
  } finally {
    await proxy?.close().catch(() => undefined);
    await shim?.close().catch(() => undefined);
    await db.stop();
  }

  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
  if (fail > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

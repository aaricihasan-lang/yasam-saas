/**
 * ÜYE PASİFLEŞTİRME F4 — mevcut uzman yönetim sayfası (Pasif Yap / Aktif Yap) harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (… → 4a → 4b → 20280126000000) + test-only PostgREST şimi +
 * GERÇEK admin route handler'ları (detay GET, status POST) + gerçek kullanıcı kapısı (verifyUserRequest).
 * Production'a / ağa SIFIR temas; tüm hesaplar sentetik (ZZ_PSF4_*). Yeni sayfa / modül YOK.
 *
 *   F  migration ÖNCESİ: detay access.supported=false; set_access 500, hiçbir satır değişmez (eski davranış korunur)
 *   P  Pasif Yap (uzman): giriş açık, modüller 403 ACCOUNT_RESTRICTED, oturum korunur, idempotent, bayat ekran 409
 *   A  Aktif Yap: kısıt kalkar, satır pasif öncesiyle birebir (ek yetki yok); yönetici olmayan ana yönetici-dışı admin de yapabilir
 *   Y  yetki: yönetici hedef 409 · ana yönetici dışı → yönetici hedef 403 · kendi hesabı 400 · geçersiz gövde 400
 *   L  eski "giriş kapalı" hesap: Pasif Yap 409 (giriş açılmaz); mevcut Aktif Yap (toggle_active) aynen çalışır
 *   R  arşiv: arşivdeki uzman 409 + giriş yok; arşivden çıkan kısıtlı uzman → toggle_active + set_access ile aktif
 *   D  hiçbir kullanıcı / danışan / ödeme / oturum satırı silinmez; audit kayıtları doğru aktörle
 *   U  arayüz: düğme koşulları, onay metni, işleyiciler (kaynak) + AccountBadge gerçek render (varsayılan davranış AYNEN)
 *
 * Çalıştır: npx tsx scripts/uye-pasif-f4/uye-pasif-f4.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); return; }
  fail++;
  failures.push(label);
  console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 700)}`}`);
}

const realFetch = globalThis.fetch;
let shimUrl = "http://127.0.0.1:1";
const blockedNet: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.startsWith(shimUrl)) return realFetch(input, init);
  blockedNet.push(u.slice(0, 120));
  throw new Error(`AG ENGELLENDI (harness): ${u.slice(0, 80)}`);
}) as typeof fetch;

const MIG_F2 = "20280126000000_member_access_restriction.sql";
const PRE = [
  "20271009100000_admin_purge_archived_expert.sql",
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
  "20280101000690_user_payment_history_payment_date_optional_4b.sql",
  "20280101000700_admin_payment_atomic_4b.sql",
  "20280101000710_admin_trial_convert_passive_guard_4b.sql",
];
const OWNER = "00000000-0000-4000-8000-00000000f4a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000f4a2";
const TOK = { owner: "zz-psf4-owner-0001", admin2: "zz-psf4-admin2-0001" };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const p = typeof a === "object" && a ? a.port : 0;
      srv.close(() => (p ? resolve(p) : reject(new Error("boş port alınamadı"))));
    });
  });
}

async function main(): Promise<void> {
  const port = await freePort();
  const db: TestDb = await startTestDb(port, `uye-pasif-f4-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of PRE) await su.query(readMig(f));

    const tenant = async (key: string) => {
      const t = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZPSF4',$2,'active')`, [t, `zzpsf4-${key}-${t.slice(0, 8)}`]);
      return t;
    };
    for (const [aid, sup] of [[OWNER, true], [ADMIN2, false]] as [string, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
         values ($1,$2,$3,'admin',true,'approved',$4,$5,$6, now() - interval '400 days')`,
        [aid, `ZZ_PSF4 Yönetici ${aid.slice(-2)}`, `zz.psf4.admin.${aid.slice(-2)}@example.test`, sup, sup ? "owner" : "admin", await tenant(aid.slice(-2))],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);

    const ids: Record<string, string> = {};
    const mk = async (key: string, o: { active?: boolean; trial?: boolean } = {}) => {
      const uid = randomUUID();
      ids[key] = uid;
      const now = Date.now();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
            trial_started_at, trial_ends_at, payment_status, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',$4,'approved', now() - interval '20 days', $5,$5,$6,$7,$8,$9,'paid',$10,$11, now() - interval '30 days')`,
        [uid, `ZZ_PSF4 Uzman ${key}`, `zz.psf4.${key}@example.test`, o.active !== false, o.trial ? "trial" : "premium",
          o.trial ? "self_7d" : null, o.trial ? "active" : null, o.trial ? new Date(now - 9 * 86_400_000) : null, o.trial ? new Date(now - 2 * 86_400_000) : null,
          JSON.stringify({ clients: true, numerology: true, stones: true }), await tenant(key)],
      );
      await su.query(`insert into public.clients(tenant_id, full_name) select tenant_id, 'ZZ Danışan' from public.users where id=$1`, [uid]);
      await su.query(`insert into public.user_payment_history(user_id, payment_status, paid_amount, payment_note) values ($1,'paid',1500,'zz')`, [uid]);
      if (o.active !== false) await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [uid, `zz-psf4-${key}`]);
      return uid;
    };
    await mk("pro");
    await mk("trial", { trial: true });
    await mk("legacy", { active: false });
    await mk("arch");
    await mk("cycle");

    shim = await startPgrestShim(pool);
    shimUrl = shim.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const detailRoute = await import("../../app/api/admin/users/[id]/route");
    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const { verifyUserRequest } = await import("../../lib/auth/userGuard");
    type H = (r: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    const call = async (h: unknown, url: string, auth: { adminId: string; token: string }, body?: unknown, paramId?: string) => {
      const headers: Record<string, string> = { "x-admin-id": auth.adminId, "x-session-token": auth.token };
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost${url}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const res = await (h as H)(req, { params: Promise.resolve({ id: paramId ?? "" }) });
      let json: Record<string, unknown> = {};
      try { json = (await res.json()) as Record<string, unknown>; } catch { /* boş */ }
      return { status: res.status, json };
    };
    const asOwner = { adminId: OWNER, token: TOK.owner };
    const asAdmin2 = { adminId: ADMIN2, token: TOK.admin2 };
    const detail = (uid: string, auth = asOwner) => call(detailRoute.GET, `/api/admin/users/${uid}`, auth, undefined, uid);
    const status = (uid: string, body: unknown, auth = asOwner) => call(statusRoute.POST, `/api/admin/users/${uid}/status`, auth, body, uid);
    /** Kullanıcı kapısı: modül ucu (/api/x) ve açık listedeki profil ucu. */
    const gate = async (uid: string, token: string, p = "/api/x") => {
      const r = await verifyUserRequest(new NextRequest(`http://localhost${p}`, { headers: { "x-user-id": uid, "x-session-token": token } }), { includeProfile: true });
      if (r.ok) return "200";
      let code = "";
      try { code = String(((await r.response.clone().json()) as { code?: unknown }).code ?? ""); } catch { /* */ }
      return `${r.response.status}${code ? `:${code}` : ""}`;
    };
    const row = async (uid: string) => (await su.query(`select to_jsonb(u) - 'access_restricted_at' j from public.users u where id=$1`, [uid])).rows[0].j as Record<string, unknown>;
    const state = async (uid: string) => (await su.query(`select active, archived_at is not null arch,
        ${"(select access_restricted_at from public.users x where x.id = u.id)"} is not null r from public.users u where id=$1`, [uid])).rows[0] as { active: boolean; arch: boolean; r: boolean };
    const counts = async () => (await su.query(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c,
        (select count(*)::int from public.user_payment_history) h, (select count(*)::int from public.user_sessions) s`)).rows[0];

    // ── F) Migration ÖNCESİ ──────────────────────────────────────────────────
    console.log("\n[F] Migration öncesi (yeni kod + eski şema)");
    const f1 = await detail(ids.pro);
    ok(f1.status === 200 && (f1.json.access as { supported?: boolean })?.supported === false && (f1.json.access as { restrictedAt?: unknown })?.restrictedAt === null,
      "F1 detay: kolon yokken 200 + access.supported=false (ekran eski 'Pasif Yap' davranışıyla açılır)", f1.json.access);
    const c0 = await counts();
    const f2 = await status(ids.pro, { action: "set_access", restricted: true, expectedRestricted: false });
    ok(f2.status === 500 && JSON.stringify(await counts()) === JSON.stringify(c0) && (await gate(ids.pro, "zz-psf4-pro")) === "200",
      "F2 set_access: fonksiyon yokken 500 (ayrıntı sızdırmaz), hiçbir satır değişmez, uzman erişimi aynen", { st: f2.status, err: f2.json.error });

    await su.query(readMig(MIG_F2));

    // ── P) Pasif Yap ─────────────────────────────────────────────────────────
    console.log("\n[P] Pasif Yap (uzman)");
    const before = await row(ids.pro);
    const sesBefore = (await su.query(`select count(*) filter (where is_active)::int a from public.user_sessions where user_id=$1`, [ids.pro])).rows[0].a;
    const d0 = await detail(ids.pro);
    ok((d0.json.access as { supported?: boolean }).supported === true && (d0.json.access as { restrictedAt?: unknown }).restrictedAt === null, "detay: access.supported=true, kısıt yok");
    const p1 = await status(ids.pro, { action: "set_access", restricted: true, expectedRestricted: false });
    const st1 = await state(ids.pro);
    ok(p1.status === 200 && p1.json.restricted === true && p1.json.changed === true && st1.active === true && st1.r === true,
      "Pasif Yap: 200; giriş AÇIK (active=true), kısıt yazıldı", { p1: p1.json, st1 });
    const d1 = await detail(ids.pro);
    ok(typeof (d1.json.access as { restrictedAt?: unknown }).restrictedAt === "string", "detay: restrictedAt dolu (arayüz 'Pasif' gösterir)");
    ok((await gate(ids.pro, "zz-psf4-pro")) === "403:ACCOUNT_RESTRICTED" && (await gate(ids.pro, "zz-psf4-pro", "/api/auth/profile")) === "200",
      "pasif uzman: AYNI oturumla modül ucu 403 ACCOUNT_RESTRICTED; profil (ana sayfa bilgisi) açık");
    const sesAfter = (await su.query(`select count(*) filter (where is_active)::int a from public.user_sessions where user_id=$1`, [ids.pro])).rows[0].a;
    ok(sesAfter === sesBefore && JSON.stringify(await row(ids.pro)) === JSON.stringify(before),
      "Pasif Yap: oturumlar KAPATILMADI; paket / deneme / modül / ödeme alanları aynen", { sesBefore, sesAfter });
    const p2 = await status(ids.pro, { action: "set_access", restricted: true, expectedRestricted: true });
    const p3 = await status(ids.pro, { action: "set_access", restricted: true, expectedRestricted: false });
    ok(p2.status === 200 && p2.json.changed === false && p3.status === 409, "tekrar istek idempotent (changed=false); bayat ekran → 409", { p2: p2.json, p3: p3.status });

    // ── A) Aktif Yap ─────────────────────────────────────────────────────────
    console.log("\n[A] Aktif Yap (kısıtı kaldır)");
    const a1 = await status(ids.pro, { action: "set_access", restricted: false, expectedRestricted: true }, asAdmin2);
    ok(a1.status === 200 && a1.json.restricted === false && (await state(ids.pro)).r === false && (await gate(ids.pro, "zz-psf4-pro")) === "200",
      "Aktif Yap (ana yönetici olmayan yönetici): 200; kısıt kalktı; aynı oturumla erişim yeniden açık (tekrar giriş GEREKMEZ)", a1.json);
    ok(JSON.stringify(await row(ids.pro)) === JSON.stringify(before), "Aktif Yap: satır pasif öncesiyle BİREBİR — önceki meşru yetkiler döner, ek yetki YOK");
    // Deneme uzmanı: süre politikası değişmez.
    const tb = await row(ids.trial);
    await status(ids.trial, { action: "set_access", restricted: true, expectedRestricted: false });
    await status(ids.trial, { action: "set_access", restricted: false, expectedRestricted: true });
    ok(JSON.stringify(await row(ids.trial)) === JSON.stringify(tb), "deneme uzmanı: pasif → aktif; deneme penceresi / durumu / paketi DEĞİŞMEDİ");

    // ── Y) Yetki ve girdi ────────────────────────────────────────────────────
    console.log("\n[Y] Yetki ve girdi");
    const y1 = await status(ADMIN2, { action: "set_access", restricted: true, expectedRestricted: false });
    const y2 = await status(OWNER, { action: "set_access", restricted: true, expectedRestricted: false }, asAdmin2);
    const y3 = await status(OWNER, { action: "set_access", restricted: true, expectedRestricted: false });
    const y4 = await status(ids.pro, { action: "set_access", restricted: "evet", expectedRestricted: false });
    const y5 = await status(ids.pro, { action: "set_access", restricted: true });
    const y6 = await status(ids.pro, { action: "set_access", restricted: true, expectedRestricted: false }, { adminId: ADMIN2, token: "zz-yanlis-token" });
    ok(y1.status === 409 && y2.status === 403 && y3.status === 400, "yönetici hedef 409 (yalnız uzman) · ana yönetici dışı → yönetici hedef 403 · kendi hesabı 400",
      { y1: y1.status, y2: y2.status, y3: y3.status });
    ok(y4.status === 400 && y5.status === 400 && y6.status === 401, "geçersiz gövde 400 · beklenen durum eksik 400 · geçersiz yönetici oturumu 401", { y4: y4.status, y5: y5.status, y6: y6.status });
    ok((await state(ids.pro)).r === false && (await state(ADMIN2)).r === false, "reddedilen isteklerde kısıt yazılmadı");

    // ── L) Eski "giriş kapalı" hesap ─────────────────────────────────────────
    console.log("\n[L] Eski giriş kapalı hesap");
    const l1 = await status(ids.legacy, { action: "set_access", restricted: true, expectedRestricted: false });
    ok(l1.status === 409 && (await state(ids.legacy)).active === false, "giriş kapalı hesaba Pasif Yap → 409; giriş kendiliğinden AÇILMAZ", l1.json.error);
    const l2 = await status(ids.legacy, { action: "toggle_active", currentActive: false });
    const sl = await state(ids.legacy);
    ok(l2.status === 200 && sl.active === true && sl.r === false, "mevcut 'Aktif Yap' (toggle_active) eski hesapta aynen çalışır; kısıt eklenmez", l2.json);

    // ── R) Arşiv ─────────────────────────────────────────────────────────────
    console.log("\n[R] Arşiv");
    await status(ids.arch, { action: "set_access", restricted: true, expectedRestricted: false });
    await su.query(`select public.admin_archive_user($1,$2)`, [ids.arch, OWNER]);
    const r1 = await status(ids.arch, { action: "set_access", restricted: false, expectedRestricted: true });
    const ra = await gate(ids.arch, "zz-psf4-arch");
    ok(r1.status === 409 && (ra.startsWith("401") || ra.startsWith("403")) && (await state(ids.arch)).arch === true,
      "arşivdeki uzman: set_access 409 (UY005); giriş / oturum yok", { r1: r1.status, ra });
    await su.query(`select public.admin_unarchive_user($1,$2)`, [ids.arch, OWNER]);
    const sr = await state(ids.arch);
    ok(sr.active === false && sr.r === true, "arşivden çıkarılan kısıtlı uzman: giriş kapalı + kısıt KORUNUR (Owner kararı)");
    // Arayüzdeki "Aktif Yap" akışı: önce toggle_active, sonra set_access(false).
    const r2 = await status(ids.arch, { action: "toggle_active", currentActive: false });
    const mid = await state(ids.arch);
    const r3 = await status(ids.arch, { action: "set_access", restricted: false, expectedRestricted: true });
    const fin = await state(ids.arch);
    ok(r2.status === 200 && mid.active === true && mid.r === true && r3.status === 200 && fin.active === true && fin.r === false,
      "Aktif Yap akışı: ara adım güvenli tarafta ('Pasif': giriş açık + kilitli), sonunda aktif", { mid, fin });

    // ── D) Silme yok / audit ─────────────────────────────────────────────────
    console.log("\n[D] Silme yok · audit");
    const c1 = await counts();
    ok(c1.u === c0.u && c1.c === c0.c && c1.h === c0.h && c1.s >= c0.s, "hiçbir kullanıcı / danışan / ödeme / oturum satırı silinmedi", { c0, c1 });
    const aud = (await su.query(`select action, actor_admin_id a, count(*)::int n from public.admin_audit_log
        where action in ('user_access_restricted','user_access_unrestricted') group by 1,2 order by 1,2`)).rows;
    const n = (act: string, actor: string) => aud.find((x) => x.action === act && x.a === actor)?.n ?? 0;
    ok(n("user_access_restricted", OWNER) === 3 && n("user_access_unrestricted", ADMIN2) === 1 && n("user_access_unrestricted", OWNER) === 2,
      "audit: her değişiklik doğru aktörle TEK kayıt (idempotent / reddedilen istek kayıt yazmaz)", aud);
    ok(blockedNet.length === 0, "dış ağ çağrısı denenmedi", blockedNet);

    // ── U) Arayüz ────────────────────────────────────────────────────────────
    console.log("\n[U] Arayüz");
    const page = readFileSync(path.join(process.cwd(), "app/admin/users/[id]/page.tsx"), "utf8");
    // F7: Pasif Yap isteğe bağlı kişiye özel uyarıyı AYNI istekte taşır; bayat-ekran koruması (expectedRestricted) aynen.
    ok(/postStatus\("set_access", \{ restricted: true, expectedRestricted: false(, \.\.\.\(message \? \{ message \} : \{\}\))? \}\)/.test(page)
      && page.includes(`postStatus("set_access", { restricted: false, expectedRestricted: true })`),
      "sayfa: Pasif Yap / Aktif Yap yeni set_access eylemini bayat-ekran korumasıyla çağırır");
    ok(/\{user\.active && !isRestricted \? \(/.test(page) && page.includes("|| (isRestricted && !isArchived) ? ("),
      "düğmeler: kısıtlı uzmanda 'Pasif Yap' gizli, 'Aktif Yap' görünür; arşivde ikisi de yok");
    ok(page.includes(`const usesAccessRestriction = user?.role === "expert" && accessInfo.supported;`)
      && page.includes("const done = usesAccessRestriction ? await doRestrict() : await doToggleActive();"),
      "yönetici hesabı / migration öncesi: eski 'Pasif Yap' (tüm cihazlardan çıkış) davranışı korunur");
    ok(/else void doToggleActive\(\);/.test(page), "yönetici etkinleştirme step-up yeniden denemesi (giriş güvenliği) değişmedi");
    ok(page.includes(`data-deactivate-mode="restrict"`) && page.includes("Oturumlar kapatılmaz; hiçbir danışan, analiz veya rapor"),
      "onay penceresi: uzman için yeni davranış metni (oturum kapanmaz, kayıt silinmez)");
    const { AccountBadge } = await import("../../components/admin/members/MemberBadges");
    const r = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(AccountBadge as never, p as never));
    ok(r({ active: true }).includes(">Aktif<") && r({ active: false }).includes(">Pasif<") && r({ active: false, archived: true }).includes(">Arşivde<"),
      "AccountBadge varsayılan (klasik liste) davranışı AYNEN: Aktif / Pasif / Arşivde");
    ok(r({ active: true, restricted: true }).includes(">Pasif<") && r({ active: false, restricted: false }).includes(">Giriş kapalı<")
      && r({ active: true, restricted: false }).includes(">Aktif<") && r({ active: false, archived: true, restricted: true }).includes(">Arşivde<"),
      "AccountBadge (detay): Pasif = giriş açık + kilitli · Giriş kapalı = eski pasif · Arşivde öncelikli");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

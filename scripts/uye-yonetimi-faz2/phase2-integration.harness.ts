/**
 * ÜYE YÖNETİMİ FAZ 2 — ENTEGRASYON HARNESS (gerçek route handler + gerçek PostgreSQL + gerçek RPC zinciri).
 * Ephemeral embedded-postgres + test-only PostgREST shim. Production'a SIFIR temas; sentetik veri.
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz2/phase2-integration.harness.ts
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "./testDb";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const OWNER = "00000000-0000-4000-8000-00000000f2a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000f2a2";
const INACTIVE_ADMIN = "00000000-0000-4000-8000-00000000f2a3";
const TOK = { owner: "zz-p2-owner-token-0001", admin2: "zz-p2-admin2-token-0001", inactive: "zz-p2-inactive-token-0001" };

async function main(): Promise<void> {
  const db = await startTestDb(54351, "uye-yonetimi-faz2-int");
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, name, email, sup, active] of [
      [OWNER, "ZZ_MEMBER_PHASE2_OWNER", "zz.p2.owner@example.test", true, true],
      [ADMIN2, "ZZ_MEMBER_PHASE2_ADMIN2", "zz.p2.admin2@example.test", false, true],
      [INACTIVE_ADMIN, "ZZ_MEMBER_PHASE2_INACTIVE_ADMIN", "zz.p2.inactive@example.test", false, false],
    ] as [string, string, string, boolean, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
         values ($1,$2,$3,'admin',$5,'approved',$4,$6,$7)`,
        [id, name, email, sup, active, sup ? "owner" : "admin", await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`,
      [OWNER, TOK.owner, ADMIN2, TOK.admin2, INACTIVE_ADMIN, TOK.inactive]);

    shim = await startPgrestShim(db.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    console.log(`FAZ 2 test DB + shim hazır (${shim.url}).\n`);

    const usersRoute = await import("../../app/api/admin/users/route");
    const userRoute = await import("../../app/api/admin/users/[id]/route");
    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const auditRoute = await import("../../app/api/admin/users/[id]/audit/route");
    const sessionsRoute = await import("../../app/api/admin/users/[id]/active-sessions/route");
    const registerRoute = await import("../../app/api/register/route");
    const adminSessionRoute = await import("../../app/api/auth/admin-session/route");
    const yhSearchRoute = await import("../../app/api/yasam-hafizasi/search/route");
    const { resolveAdminShellUserId, ADMIN_SESSION_COOKIE, LEGACY_ADMIN_ID_COOKIE } = await import("../../lib/auth/adminShellSession");
    const { getServerDb } = await import("../../lib/supabase-server");
    const { foldTr } = await import("../../lib/admin/memberListQuery");
    const { mapDbUser } = await import("../../lib/admin/userManagement");

    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    type Auth = { adminId?: string; token?: string; userId?: string };
    const asOwner: Auth = { adminId: OWNER, token: TOK.owner };
    const asAdmin2: Auth = { adminId: ADMIN2, token: TOK.admin2 };

    async function call(
      handler: Handler | ((req: NextRequest) => Promise<Response>),
      method: string,
      url: string,
      auth: Auth,
      body?: unknown,
      opts?: { rawBody?: string; contentType?: string; headers?: Record<string, string>; id?: string },
    ): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
      const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.userId) headers["x-user-id"] = auth.userId;
      if (auth.token) headers["x-session-token"] = auth.token;
      const hasBody = body !== undefined || opts?.rawBody !== undefined;
      if (hasBody) headers["content-type"] = opts?.contentType ?? "application/json";
      const req = new NextRequest(`http://localhost${url}`, {
        method, headers, body: hasBody ? (opts?.rawBody ?? JSON.stringify(body)) : undefined,
      });
      const res = await (handler as Handler)(req, { params: Promise.resolve({ id: opts?.id ?? "" }) });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
      return { status: res.status, json, headers: res.headers };
    }
    const list = (qs: string, auth: Auth = asOwner) => call(usersRoute.GET as never, "GET", `/api/admin/users?${qs}`, auth);
    const row = async (id: string) => (await su.query(`select * from public.users where id=$1`, [id])).rows[0];

    async function makeExpert(o: { name: string; approval?: string; active?: boolean; perms?: Record<string, unknown>; payment?: string }) {
      const id = randomUUID();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, tenant_id, payment_status, package_type, plan)
         values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,'premium','premium')`,
        [id, o.name, `zz.p2.${id.slice(0, 8)}@example.test`, o.active ?? false, o.approval ?? "pending",
          JSON.stringify(o.perms ?? {}), await tenant(), o.payment ?? null],
      );
      return id;
    }

    // ── A. AUTH REGRESSION ────────────────────────────────────────────────────
    console.log("[A] Yetkilendirme regresyonu");
    const E0 = await makeExpert({ name: "ZZ_MEMBER_PHASE2_AUTH", approval: "approved", active: true, perms: { clients: true } });
    const expertTok = `zz-p2-expert-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [E0, expertTok]);
    const neg: [string, Auth][] = [
      ["tokensız", { adminId: OWNER }],
      ["uzman token", { adminId: E0, token: expertTok }],
      ["uzman token + admin ID spoof", { adminId: OWNER, token: expertTok }],
      ["geçersiz token", { adminId: OWNER, token: "zz-bogus" }],
      ["pasif admin (geçerli token)", { adminId: INACTIVE_ADMIN, token: TOK.inactive }],
    ];
    let negOk = 0, negTotal = 0;
    for (const [name, auth] of neg) {
      for (const r of [
        await list("", auth),
        await call(usersRoute.POST as never, "POST", "/api/admin/users", auth, { fullName: "x", email: "x@y.co", password: "abcd1234", role: "expert", modules: ["clients"] }),
        await call(userRoute.GET as never, "GET", `/api/admin/users/${E0}`, auth, undefined, { id: E0 }),
      ]) {
        negTotal++;
        if (r.status === 401 || r.status === 403) negOk++;
        else console.error(`     ${name} → ${r.status}`);
      }
    }
    ok(negOk === negTotal, `negatif matris ${negOk}/${negTotal} → 401/403 (pasif admin dahil)`);
    ok((await su.query(`select count(*)::int n from public.users where full_name='x'`)).rows[0].n === 0, "negatif POST hiç kullanıcı oluşturmadı");

    // ── C. ADMIN SHELL (MEM-015) ──────────────────────────────────────────────
    console.log("\n[C] Admin kabuğu oturumu");
    const sdb = getServerDb();
    ok((await resolveAdminShellUserId(sdb, TOK.owner)) === OWNER, "gerçek admin token → kabuk AÇILIR");
    ok((await resolveAdminShellUserId(sdb, expertTok)) === null, "uzman token → kabuk AÇILMAZ");
    ok((await resolveAdminShellUserId(sdb, OWNER)) === null, "sahte cookie (bilinen admin UUID) → kabuk AÇILMAZ");
    ok((await resolveAdminShellUserId(sdb, "zz-forged-token-000000")) === null, "uydurma token → kabuk AÇILMAZ");
    ok((await resolveAdminShellUserId(sdb, TOK.inactive)) === null, "pasif admin token → kabuk AÇILMAZ");
    ok((await resolveAdminShellUserId(sdb, "")) === null && (await resolveAdminShellUserId(sdb, "a'; drop table users;--")) === null, "boş/bozuk cookie → AÇILMAZ");
    const revTok = `zz-p2-rev-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token, is_active) values ($1,$2,false)`, [ADMIN2, revTok]);
    ok((await resolveAdminShellUserId(sdb, revTok)) === null, "iptal edilmiş admin oturumu → AÇILMAZ");
    const cookieRes = await adminSessionRoute.POST(new NextRequest("http://localhost/api/auth/admin-session", { method: "POST", headers: { "x-session-token": TOK.owner } }));
    const setCookie = cookieRes.headers.getSetCookie?.() ?? [];
    const sessCookie = setCookie.find((c) => c.startsWith(`${ADMIN_SESSION_COOKIE}=`)) ?? "";
    ok(cookieRes.status === 200 && sessCookie.includes(`${ADMIN_SESSION_COOKIE}=${TOK.owner}`), "admin-session: cookie OPAK oturum token'ı taşır (UUID değil)");
    ok(/HttpOnly/i.test(sessCookie) && /SameSite=Strict/i.test(sessCookie) && /Path=\//.test(sessCookie), "cookie bayrakları: HttpOnly + SameSite=Strict + Path=/ (Secure yalnız production)");
    ok(setCookie.some((c) => c.startsWith(`${LEGACY_ADMIN_ID_COOKIE}=;`) && /Max-Age=0/i.test(c)), "eski imzasız UUID cookie'si temizlenir");
    const expCookie = await adminSessionRoute.POST(new NextRequest("http://localhost/api/auth/admin-session", { method: "POST", headers: { "x-session-token": expertTok } }));
    ok(expCookie.status === 401 && !(expCookie.headers.getSetCookie?.() ?? []).some((c) => c.startsWith(`${ADMIN_SESSION_COOKIE}=zz`)), "uzman token ile admin cookie VERİLMEZ (401)");

    // ── D/E. LİSTE: SAYFALAMA + TÜRKÇE ARAMA + SAYAÇLAR (MEM-016) ──────────────
    console.log("\n[D] Sunucu tarafı sayfalama / filtre / sayaçlar");
    for (let i = 1; i <= 23; i++) {
      await makeExpert({ name: `ZZ Page Uzman ${String(i).padStart(2, "0")}`, approval: i % 3 === 0 ? "approved" : "pending", active: i % 3 === 0, payment: i % 2 === 0 ? "paid" : "pending" });
    }
    const archivedId = await makeExpert({ name: "ZZ Arşiv Uzmanı", approval: "approved", active: false });
    const rejectedId = await makeExpert({ name: "ZZ Reddedilen", approval: "rejected", active: false });
    const pendingActive = await makeExpert({ name: "ZZ Bekleyen Aktif", approval: "pending", active: true });
    const p1 = await list("pageSize=10&page=1");
    const p3 = await list("pageSize=10&page=3");
    const allRows = (await su.query(`select count(*)::int n from public.users where not (role='expert' and approval_status='approved' and active is not true)`)).rows[0].n;
    ok(p1.status === 200 && (p1.json.users as unknown[]).length === 10 && p1.json.total === allRows, `sayfa 1: 10 satır, toplam=${allRows} (arşiv hariç)`);
    ok((p3.json.users as unknown[]).length === allRows - 20 && p3.json.page === 3, "sayfa 3: kalan satırlar");
    const ids1 = new Set((p1.json.users as { id: string }[]).map((u) => u.id));
    const p2 = await list("pageSize=10&page=2");
    ok((p2.json.users as { id: string }[]).every((u) => !ids1.has(u.id)), "sayfalar çakışmaz (sayfa 1 ∩ sayfa 2 = ∅)");
    const fp = await list("approval=pending&role=expert&pageSize=10&page=2");
    const pendingTotal = (await su.query(`select count(*)::int n from public.users where role='expert' and approval_status='pending'`)).rows[0].n;
    ok(fp.json.total === pendingTotal && (fp.json.users as { approval_status: string }[]).every((u) => u.approval_status === "pending"), "filtre + sayfa: yalnız bekleyenler, toplam doğru");
    const pay = await list("payment=paid");
    ok((pay.json.users as { payment_status: string }[]).every((u) => u.payment_status === "paid") && Number(pay.json.total) > 0, "ödeme filtresi");
    const act = await list("active=active&approval=pending");
    ok((act.json.users as { id: string }[]).some((u) => u.id === pendingActive), "onay bekleyen + aktif kullanıcı 'Aktif' filtresinde görünür (kayıp yok)");
    const arch = await list("view=archive");
    ok((arch.json.users as { id: string }[]).some((u) => u.id === archivedId) && !(p1.json.users as { id: string }[]).some((u) => u.id === archivedId), "arşivlenmiş uzman arşiv görünümünde; üyeler listesinde DEĞİL");
    const c = p1.json.counts as Record<string, number>;
    ok(c.pending + c.approved_active + c.archived + c.rejected === c.experts_total, `sayaçlar kesişimsiz bölümleme: ${c.pending}+${c.approved_active}+${c.archived}+${c.rejected} = ${c.experts_total}`);
    ok(c.admins === 3, "yönetici sayısı ayrı (3)");
    ok(c.pending === pendingTotal, "bekleyen+aktif kullanıcı 'Onay Bekleyen' sayacına dahil");
    ok((await list("view=archive&pageSize=10")).json.total === c.archived, "arşiv toplamı = arşiv sayacı");
    for (const [qs, label] of [
      ["approval=foo", "bilinmeyen onay filtresi"], ["active=maybe", "bilinmeyen hesap filtresi"],
      ["page=0", "sayfa 0"], ["pageSize=13", "sayfa boyutu 13"], [`q=${"a".repeat(121)}`, "121 karakter arama"],
      ["view=everything", "bilinmeyen görünüm"],
    ] as [string, string][]) {
      ok((await list(qs)).status === 400, `geçersiz sorgu → 400 (${label})`);
    }
    const lh = (await list("")).headers.get("cache-control") ?? "";
    ok(/no-store/.test(lh) && /private/.test(lh) && !/public/.test(lh), "liste yanıtı: Cache-Control private, no-store");

    console.log("\n[E] Türkçe arama");
    const sisgin = await makeExpert({ name: "ZZ Şişgin Çağla", approval: "approved", active: true });
    const arici = await makeExpert({ name: "ZZ ARICI Hasan", approval: "approved", active: true });
    const ilknur = await makeExpert({ name: "ZZ İlknur Işık", approval: "pending" });
    const pct = await makeExpert({ name: "ZZ Yüzde%İsim", approval: "pending" });
    const findIds = async (q: string) => ((await list(`q=${encodeURIComponent(q)}&pageSize=50`)).json.users as { id: string }[]).map((u) => u.id);
    for (const q of ["şişgin", "ŞİŞGİN", "sisgin", "Şişgin çağla", "SISGIN CAGLA"]) ok((await findIds(q)).includes(sisgin), `"${q}" → Şişgin Çağla bulunur`);
    for (const q of ["arıcı", "arici", "ARICI", "Arıcı"]) ok((await findIds(q)).includes(arici), `"${q}" → ARICI Hasan bulunur`);
    for (const q of ["ilknur", "İLKNUR", "ILKNUR", "ışık", "isik", "IŞIK"]) ok((await findIds(q)).includes(ilknur), `"${q}" → İlknur Işık bulunur`);
    const uz = await list("q=uzman&pageSize=50");
    const expertMembers = (await su.query(`select count(*)::int n from public.users where role='expert' and not (approval_status='approved' and active is not true)`)).rows[0].n;
    ok(uz.json.total === expertMembers && (uz.json.users as { role: string }[]).every((u) => u.role === "expert"), `"uzman" → tüm uzmanlar (${expertMembers})`);
    const yo = await list("q=y%C3%B6netici&pageSize=50");
    ok(yo.json.total === 3 && (yo.json.users as { role: string }[]).every((u) => u.role === "admin"), `"yönetici" → yalnız yöneticiler (3)`);
    ok((await list("q=admin&pageSize=50")).json.total === 3, `"admin" → yöneticiler`);
    ok((await findIds("%")).length === 1 && (await findIds("%")).includes(pct), `"%" joker değil, düz karakter (LIKE kaçışı)`);
    const underscore = (await list("q=_&pageSize=50")).json.users as { full_name: string; email: string }[];
    ok(underscore.length > 0 && underscore.every((u) => `${u.full_name}${u.email}`.includes("_")), `"_" joker değil (yalnız gerçekten "_" içerenler)`);
    ok((await findIds("zz.p2.")).length > 0, "e-posta ile arama");
    const sqlFold = (await su.query(`select public.admin_search_fold($1) f`, ["ŞİŞGİN ARICI İlknur Işık ÇĞÖÜ âîû"])).rows[0].f;
    ok(sqlFold === foldTr("ŞİŞGİN ARICI İlknur Işık ÇĞÖÜ âîû"), `SQL katlama = TS katlama ("${sqlFold}")`);
    const pageSearch = await list("q=page&pageSize=10&page=3");
    ok(pageSearch.json.total === 23 && (pageSearch.json.users as unknown[]).length === 3, "arama + sayfa (23 sonuç, sayfa 3 → 3 satır)");

    // ── G. YENİ UZMAN (tek provisioning yolu) ─────────────────────────────────
    console.log("\n[G] Yeni Uzman / Yeni Yönetici");
    const create = (body: Record<string, unknown>, auth: Auth = asOwner) => call(usersRoute.POST as never, "POST", "/api/admin/users", auth, body);
    const tenantsBefore = (await su.query(`select count(*)::int n from public.tenants`)).rows[0].n;
    ok((await create({ fullName: "ZZ Yeni Modülsüz", email: "zz.p2.nomod@example.test", password: "abcd1234", role: "expert", modules: [] })).status === 400, "modülsüz uzman → 400");
    ok((await create({ fullName: "ZZ Yeni", email: "zz.p2.new1@example.test", password: "abcd1234", role: "expert", modules: ["clients"], active: false })).status === 400, "`active` alanı → 400");
    ok((await create({ fullName: "ZZ Yeni", email: "zz.p2.new1@example.test", password: "kisa1", role: "expert", modules: ["clients"] })).status === 400, "zayıf şifre → 400");
    ok((await create({ fullName: "ZZ Yeni", email: "gecersiz", password: "abcd1234", role: "expert", modules: ["clients"] })).status === 400, "geçersiz e-posta → 400");
    ok((await create({ fullName: "ZZ Yeni", email: "zz.p2.new1@example.test", password: "abcd1234", role: "owner", modules: ["clients"] })).status === 400, "bilinmeyen rol → 400");
    ok((await create({ fullName: "ZZ Yeni", email: "zz.p2.new1@example.test", password: "abcd1234", role: "expert", modules: ["is_admin"] })).status === 400, "bilinmeyen modül → 400");
    ok((await su.query(`select count(*)::int n from public.tenants`)).rows[0].n === tenantsBefore, "reddedilen istekler tenant/kullanıcı OLUŞTURMADI");
    const cr = await create({ fullName: "ZZ Yeni Uzman", email: "zz.p2.new1@example.test", password: "abcd1234", role: "expert", modules: ["numerology", "human_design", "cupping"] });
    const newId = String(cr.json.userId ?? "");
    const nu = newId ? await row(newId) : null;
    ok(cr.status === 201 && cr.json.moduleCount === 3, "uzman oluşturma → 201 (3 modül)");
    ok(!!nu && nu.approval_status === "approved" && nu.active === true && nu.package_type === "premium" && nu.plan === "premium", "yeni uzman: onaylı + aktif + Premium");
    ok(!!nu && nu.trial_ends_at === null && nu.trial_started_at === null, "yeni uzman: trial tarihleri YOK");
    ok(!!nu && nu.module_permissions.numerology === true && nu.module_permissions.human_design === true && nu.module_permissions.cupping === true && nu.module_permissions.clients === false, "yeni uzman: tam seçilen modüller");
    const nAud = (await su.query(`select action from public.admin_audit_log where target_user_id=$1 order by created_at, id`, [newId])).rows.map((r) => r.action);
    ok(nAud.includes("user_created") && nAud.includes("user_approved"), "audit: user_created + user_approved");
    ok(mapDbUser(nu).membershipDisplay.packageLabel === "Premium", "gösterge: Premium");
    ok((await create({ fullName: "ZZ Tekrar", email: "ZZ.P2.NEW1@example.test", password: "abcd1234", role: "expert", modules: ["clients"] })).status === 409, "yinelenen e-posta (büyük harf) → 409");
    ok((await create({ fullName: "ZZ Admin", email: "zz.p2.adm@example.test", password: "abcd1234", role: "admin" }, asAdmin2)).status === 403, "normal admin yönetici oluşturamaz → 403");
    const ca = await create({ fullName: "ZZ Yeni Yönetici", email: "zz.p2.adm@example.test", password: "abcd1234", role: "admin" });
    const na = await row(String(ca.json.userId ?? ""));
    ok(ca.status === 201 && na.role === "admin" && na.active === true && na.approved_at !== null && na.trial_ends_at === null, "ana yönetici yönetici oluşturur: approved_at dolu, trial yok");
    // Atomiklik: onay adımı patlarsa kullanıcı/tenant da geri alınır.
    await su.query(`create function public._boom2() returns trigger language plpgsql as $$ begin if new.action = 'user_approved' then raise exception 'boom'; end if; return new; end $$;
                    create trigger _boom2_t before insert on public.admin_audit_log for each row execute function public._boom2();`);
    const tBefore = (await su.query(`select count(*)::int n from public.tenants`)).rows[0].n;
    const boom = await create({ fullName: "ZZ Atomik", email: "zz.p2.atomic@example.test", password: "abcd1234", role: "expert", modules: ["clients"] });
    ok(boom.status === 500 && (await su.query(`select count(*)::int n from public.users where email='zz.p2.atomic@example.test'`)).rows[0].n === 0, "onay adımı hatası → kullanıcı OLUŞMADI (atomik)");
    ok((await su.query(`select count(*)::int n from public.tenants`)).rows[0].n === tBefore, "onay adımı hatası → tenant OLUŞMADI (yarım kayıt yok)");
    await su.query(`drop trigger _boom2_t on public.admin_audit_log; drop function public._boom2();`);

    // ── B. PUBLIC REGISTER (MEM-012) ─────────────────────────────────────────
    console.log("\n[B] Public kayıt sertleştirme");
    let ipSeq = 0;
    const reg = (body: unknown, opts?: { rawBody?: string; contentType?: string; ip?: string }) =>
      call(registerRoute.POST as never, "POST", "/api/register", {}, body, {
        rawBody: opts?.rawBody, contentType: opts?.contentType,
        headers: { "x-forwarded-for": opts?.ip ?? `203.0.113.${(ipSeq++ % 200) + 1}` },
      });
    ok((await reg(undefined, { rawBody: "{bozuk" })).status === 400, "bozuk JSON → 400");
    ok((await reg(undefined, { rawBody: "{}", contentType: "text/plain" })).status === 400, "yanlış içerik türü → 400");
    ok((await reg(undefined, { rawBody: JSON.stringify({ fullName: "x".repeat(9000) }) })).status === 413, "aşırı büyük gövde → 413");
    const weak = await reg({ fullName: "ZZ Kayıt", email: "zz.p2.reg1@example.test", password: "sadeceharf" });
    ok(weak.status === 400 && weak.json.code === "weak_password", "rakamsız şifre → 400 weak_password");
    ok((await reg({ fullName: "ZZ Kayıt", email: "zz.p2.reg1@example.test", password: "12345678" })).json.code === "weak_password", "harfsiz şifre → weak_password");
    ok((await reg({ fullName: "ZZ Kayıt", email: "zz.p2.reg1@example.test", password: "ab1" })).json.code === "weak_password", "kısa şifre → weak_password");
    ok((await reg({ fullName: "ZZ Kayıt", email: "gecersiz@", password: "abcd1234" })).json.code === "invalid_email", "geçersiz e-posta → invalid_email");
    ok((await reg({ fullName: "Z", email: "zz.p2.reg1@example.test", password: "abcd1234" })).json.code === "invalid_name", "tek harf isim → invalid_name");
    ok((await reg({ fullName: "ZZ", email: "zz.p2.reg1@example.test", password: "abcd1234", role: "admin" })).json.code === "invalid_request", "bilinmeyen alan (role) → invalid_request");
    const usersBeforeHp = (await su.query(`select count(*)::int n from public.users`)).rows[0].n;
    const hp = await reg({ fullName: "ZZ Bot", email: "zz.p2.bot@example.test", password: "abcd1234", website: "http://spam.example" });
    ok(hp.status === 200 && (await su.query(`select count(*)::int n from public.users`)).rows[0].n === usersBeforeHp, "honeypot dolu → 200 ama kayıt OLUŞTURULMAZ");
    const good = await reg({ fullName: "  ZZ   Kayıt Uzman ", email: " ZZ.P2.Reg1@Example.test ", password: " abcd1234 ", website: "" });
    const regRow = (await su.query(`select * from public.users where email='zz.p2.reg1@example.test'`)).rows[0];
    ok(good.status === 200 && !!regRow && regRow.approval_status === "pending" && regRow.active === false && regRow.role === "expert", "geçerli kayıt → pending + pasif uzman");
    ok(!!regRow && regRow.full_name === "ZZ Kayıt Uzman", "ad normalize (fazla boşluk temiz)");
    const dup = await reg({ fullName: "ZZ Kayıt", email: "zz.p2.reg1@EXAMPLE.test", password: "abcd1234" });
    ok(dup.status === 409 && dup.json.code === "already_exists", "yinelenen e-posta → 409");
    // IP rate limit: 10 / 15 dk
    const ip = "198.51.100.77";
    let lastIp: Awaited<ReturnType<typeof reg>> | null = null;
    for (let i = 0; i < 11; i++) lastIp = await reg({ fullName: "ZZ RL", email: `zz.p2.rl${i}@example.test`, password: "short" }, { ip });
    ok(lastIp!.status === 429 && lastIp!.json.code === "rate_limited" && Number(lastIp!.headers.get("retry-after")) > 0, "aynı IP 11. deneme → 429 + Retry-After (hatalı denemeler de sayılır)");
    ok((await reg({ fullName: "ZZ RL", email: "zz.p2.rl-other@example.test", password: "short" }, { ip: "198.51.100.78" })).status === 400, "farklı IP etkilenmez");
    // E-posta rate limit: 3 / saat (farklı IP'lerden)
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await reg({ fullName: "ZZ EM", email: "zz.p2.emrl@example.test", password: "abcd1234" }, { ip: `192.0.2.${10 + i}` })).status);
    ok(statuses[0] === 200 && statuses[1] === 409 && statuses[2] === 409 && statuses[3] === 429, `aynı e-posta 4. deneme (farklı IP'ler) → 429 (${statuses.join(",")})`);
    const buckets = JSON.stringify((await su.query(`select bucket from public.auth_rate_limit_events`)).rows);
    ok(!/198\.51\.100|zz\.p2\.|example\.test/.test(buckets), "rate-limit tablosunda ham IP/e-posta YOK (HMAC kova)");
    ok((await su.query(`select has_table_privilege('anon','public.auth_rate_limit_events','SELECT') a`)).rows[0].a === false, "rate-limit tablosu anon'a kapalı");
    await su.query(`insert into public.auth_rate_limit_events(bucket, created_at)
                    select 'reg-ip:zz-stale-' || g, now() - interval '2 days' from generate_series(1, 50) g`);
    await reg({ fullName: "ZZ Prune", email: "zz.p2.prune@example.test", password: "short" });
    ok((await su.query(`select count(*)::int n from public.auth_rate_limit_events where created_at < now() - interval '1 day'`)).rows[0].n === 0, "1 günden eski kovalar budanır (tablo birikmez)");
    const { readFileSync } = await import("node:fs");
    let reapplyErr: string | null = null;
    try { await su.query(readFileSync("supabase/migrations/20270130000000_admin_member_phase2.sql", "utf8")); } catch (e) { reapplyErr = (e as Error).message; }
    ok(reapplyErr === null, "FAZ 2 migration idempotent (ikinci uygulama hatasız)");

    // ── H. CACHE ─────────────────────────────────────────────────────────────
    console.log("\n[H] Cache-Control");
    for (const [label, r] of [
      ["detay", await call(userRoute.GET as never, "GET", `/api/admin/users/${E0}`, asOwner, undefined, { id: E0 })],
      ["audit", await call(auditRoute.GET as never, "GET", `/api/admin/users/${E0}/audit`, asOwner, undefined, { id: E0 })],
      ["aktif oturumlar", await call(sessionsRoute.GET as never, "GET", `/api/admin/users/${E0}/active-sessions?limit=0`, asOwner, undefined, { id: E0 })],
    ] as [string, { status: number; headers: Headers }][]) {
      const cc = r.headers.get("cache-control") ?? "";
      ok(r.status === 200 && /no-store/.test(cc) && !/public/.test(cc), `${label}: no-store (public değil)`);
    }

    // ── J. DB GRANTS (MEM-021) ───────────────────────────────────────────────
    console.log("\n[J] DB grant sertleştirme");
    const g = (await su.query(`select
        has_table_privilege('anon','public.security_events','SELECT') a1, has_table_privilege('anon','public.security_events','INSERT') a2,
        has_table_privilege('authenticated','public.security_events','SELECT') a3,
        has_table_privilege('anon','public.support_messages','SELECT') a4, has_table_privilege('authenticated','public.support_messages','UPDATE') a5,
        has_table_privilege('service_role','public.security_events','SELECT') s1, has_table_privilege('service_role','public.support_messages','INSERT') s2`)).rows[0];
    ok(!g.a1 && !g.a2 && !g.a3 && !g.a4 && !g.a5, "anon/authenticated: security_events + support_messages grant'leri KALDIRILDI");
    ok(g.s1 && g.s2, "service_role erişimi KORUNDU (uygulama akışı kırılmaz)");
    await su.query(`insert into public.security_events(user_id, event_type, severity) values ($1,'login','high')`, [E0]);
    const lsus = await list("q=ZZ_MEMBER_PHASE2_AUTH");
    ok((lsus.json.suspiciousCounts as Record<string, number>)[E0] === 1, "service_role ile güvenlik olayı okunuyor (liste şüpheli sayacı)");
    const fn = (await su.query(`select has_function_privilege('anon','public.admin_list_users(text,text,text,text,text,text,text,integer,integer)','EXECUTE') a,
        has_function_privilege('anon','public.admin_create_user_with_modules(jsonb,jsonb,jsonb,text[])','EXECUTE') b,
        has_function_privilege('authenticated','public.auth_rate_limit_hit(text,integer,integer)','EXECUTE') c`)).rows[0];
    ok(!fn.a && !fn.b && !fn.c, "yeni RPC'ler anon/authenticated'a KAPALI");

    // ── I. YAŞAM HAFIZASI — DİNAMİK MODÜL KAPSAMI ─────────────────────────────
    console.log("\n[I] Yaşam Hafızası kapsamı = Üye Yönetimi modül izinleri");
    // Onay akışı: 3 modül seçilen uzman → YH kapsamı otomatik aynı 3 kaynak.
    const yhId = await makeExpert({ name: "ZZ YH Uzman", approval: "pending", active: false });
    const yhTenant = (await row(yhId)).tenant_id;
    const appr = await call(statusRoute.POST as never, "POST", `/api/admin/users/${yhId}/status`, asOwner,
      { action: "approve", modules: ["numerology", "reflexology", "energy_body"], expectedApproval: "pending" }, { id: yhId });
    ok(appr.status === 200, "3 modülle onay (numeroloji, refleksoloji, biyoenerji)");
    ok((await row(yhId)).module_permissions.yasam_hafizasi === true, "onay → Yaşam Hafızası yetkisi (mevcut YH kuralı; ayrı seçim yok)");
    ok((await su.query(`select yh_enabled, yh_hizli from public.yasam_hafizasi_flags where tenant_id=$1`, [yhTenant])).rows[0]?.yh_enabled === true, "tenant YH bayrakları açık");
    for (const [m, t] of [["numeroloji", "numerology_records"], ["refleksoloji", "reflexology_protocols"], ["biyoenerji", "bioenergy_symbols"], ["dogaltas", "stones"], ["kupa_hacamat", "cupping_protocols"]]) {
      await su.query(`insert into public.yasam_hafizasi_index(tenant_id, source_module, source_table, title) values ($1,$2,$3,$4)`, [yhTenant, m, t, `ZZ ${m} kaydı`]);
    }
    const yhTok = `zz-p2-yh-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [yhId, yhTok]);
    const yhSearch = async () => {
      const r = await call(yhSearchRoute.POST as never, "POST", "/api/yasam-hafizasi/search", { userId: yhId, token: yhTok }, { q: "kayit" });
      return {
        status: r.status,
        modules: new Set(((r.json.results ?? []) as { module: string }[]).map((x) => x.module)),
        facets: new Set(((r.json.facets ?? []) as { module: string }[]).map((x) => x.module)),
      };
    };
    const s1 = await yhSearch();
    ok(s1.status === 200 && [...s1.modules].sort().join(",") === "biyoenerji,numeroloji,refleksoloji", `YH kapsamı = onayda seçilen 3 modül (${[...s1.modules].join(",")})`);
    ok(!s1.facets.has("dogaltas") && !s1.facets.has("kupa_hacamat"), "kapsam dışı modüller facet'lerde de YOK");
    // Admin yeni modül açar (YH için ayrı ayar yok) → otomatik kapsamda.
    await call(userRoute.PATCH as never, "PATCH", `/api/admin/users/${yhId}`, asOwner, { action: "modules", changes: { stones: true } }, { id: yhId });
    await call(userRoute.PATCH as never, "PATCH", `/api/admin/users/${yhId}`, asOwner, { action: "modules", changes: { cupping: true } }, { id: yhId });
    const s2 = await yhSearch();
    ok(s2.modules.has("dogaltas") && s2.modules.has("kupa_hacamat") && s2.modules.size === 5, "admin Doğaltaş + Kupa açar → YH otomatik 5 modül (ayrı kaydet/toggle yok)");
    // Admin bir modülü kapatır → aktif kapsamdan çıkar; geçmiş kayıt SİLİNMEZ.
    const idxBefore = (await su.query(`select count(*)::int n from public.yasam_hafizasi_index where tenant_id=$1`, [yhTenant])).rows[0].n;
    await call(userRoute.PATCH as never, "PATCH", `/api/admin/users/${yhId}`, asOwner, { action: "modules", changes: { reflexology: false } }, { id: yhId });
    const s3 = await yhSearch();
    ok(!s3.modules.has("refleksoloji") && !s3.facets.has("refleksoloji") && s3.modules.size === 4, "Refleksoloji kapatıldı → YH aktif kapsamından çıktı (sonuç + facet)");
    ok((await su.query(`select count(*)::int n from public.yasam_hafizasi_index where tenant_id=$1`, [yhTenant])).rows[0].n === idxBefore, "geçmiş YH kayıtları SİLİNMEDİ (index satır sayısı aynı)");
    ok((await su.query(`select count(*)::int n from public.yasam_hafizasi_index where tenant_id=$1 and source_module='refleksoloji'`, [yhTenant])).rows[0].n === 1, "kapatılan modülün geçmiş kaydı fiziksel olarak duruyor");
    await call(userRoute.PATCH as never, "PATCH", `/api/admin/users/${yhId}`, asOwner, { action: "modules", changes: { reflexology: true } }, { id: yhId });
    ok((await yhSearch()).modules.has("refleksoloji"), "modül yeniden açılınca aynı geçmiş kayıtlar kendiliğinden geri gelir (backfill gerekmez)");
    // Legacy alias: 'dogaltas' anahtarı da kapsamı açar (alias-aware).
    await su.query(`update public.users set module_permissions = module_permissions - 'stones' || '{"dogaltas":true}'::jsonb where id=$1`, [yhId]);
    ok((await yhSearch()).modules.has("dogaltas"), "eski TR alias (dogaltas=true) kapsamı açar (alias-aware)");
    const yhAud = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1 and action in ('module_enabled','module_disabled')`, [yhId])).rows[0].n;
    ok(yhAud === 4, "YH kapsam değişiklikleri yalnız Üye Yönetimi modül audit'leriyle izlenir (4 kayıt)");

    // ── K. YH SNAPSHOT OKUMA + WORD TESLİM EKİ — kapalı modül GÖSTERİLMEZ, SİLİNMEZ ──
    console.log("\n[K] Snapshot okuma + Word teslim eki = aktif modül kapsamı (owner kararı)");
    const snapRoute = await import("../../app/api/clients/[id]/yasam-hafizasi/snapshots/route");
    const { readSnapshotsForDelivery } = await import("../../lib/yasam-hafizasi/client/snapshotStore");
    const { resolveYhModuleScope } = await import("../../lib/yasam-hafizasi/moduleScope");
    const { createClient } = await import("@supabase/supabase-js");
    const sdbJ = createClient(shim!.url, "zz-test-service-role-not-a-secret");
    const clientId = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, full_name) values ($1,$2,'ZZ Danışan')`, [clientId, yhTenant]);
    const group = randomUUID();
    const snapIns = async (tenant: string, client: string, m: string, ord: number) =>
      su.query(
        `insert into public.yasam_hafizasi_report_snapshots(tenant_id, client_id, target_kind, selection_group, source_module,
           source_table, source_id, title, selected_text, content_hash, ordering, selected_by)
         values ($1,$2,'report',$3,$4,'zz_src',gen_random_uuid(),$5,'ZZ metin','zz-hash',$6,$7)`,
        [tenant, client, group, m, `ZZ ${m} snapshot`, ord, yhId]);
    await snapIns(yhTenant, clientId, "numeroloji", 1);
    await snapIns(yhTenant, clientId, "refleksoloji", 2);
    await snapIns(yhTenant, clientId, "kupa_hacamat", 3);
    // Tenant izolasyonu: başka tenant'ın AYNI grup kimliğiyle satırı asla dönmez.
    await snapIns(randomUUID(), randomUUID(), "numeroloji", 4);
    const snapGet = async () => {
      const req = new NextRequest(`http://localhost/api/clients/${clientId}/yasam-hafizasi/snapshots?selectionGroupId=${group}&targetKind=report`, {
        method: "GET", headers: { "x-user-id": yhId, "x-session-token": yhTok },
      });
      const res = await snapRoute.GET(req, { params: Promise.resolve({ id: clientId }) });
      const j = (await res.json()) as { items?: { module: string }[] };
      return { status: res.status, modules: (j.items ?? []).map((i) => i.module).sort().join(",") };
    };
    const scopeNow = async () => {
      const u = await row(yhId);
      return resolveYhModuleScope(u.role, u.module_permissions);
    };
    const deliver = async (scope: ReturnType<typeof resolveYhModuleScope>) =>
      (await readSnapshotsForDelivery(sdbJ, { tenantId: yhTenant, clientId, targetKind: "report", targetRef: null, selectionGroup: group, scope }))
        .map((i) => i.moduleLabel).length;
    const g1 = await snapGet();
    ok(g1.status === 200 && g1.modules === "kupa_hacamat,numeroloji,refleksoloji", `tüm modüller açık → GET 3 snapshot (${g1.modules}); başka tenant satırı YOK`);
    ok((await deliver(await scopeNow())) === 3, "tüm modüller açık → Word teslim eki 3 snapshot");
    const snapCount = async () => (await su.query(`select count(*)::int n from public.yasam_hafizasi_report_snapshots where tenant_id=$1`, [yhTenant])).rows[0].n;
    await call(userRoute.PATCH as never, "PATCH", `/api/admin/users/${yhId}`, asOwner, { action: "modules", changes: { reflexology: false } }, { id: yhId });
    const g2 = await snapGet();
    ok(g2.status === 200 && g2.modules === "kupa_hacamat,numeroloji", `Refleksoloji kapatıldı → GET snapshot okumasında GÖSTERİLMEZ (${g2.modules})`);
    ok((await deliver(await scopeNow())) === 2, "Refleksoloji kapatıldı → Word teslim ekine GİRMEZ (2 snapshot)");
    ok((await snapCount()) === 3, "kapatılan modülün snapshot satırı fiziksel olarak DURUYOR (3 satır, silme yok)");
    ok((await deliver(resolveYhModuleScope("admin", {}))) === 3, "admin kapsamı tüm snapshot'ları görür (yalnız uzman kapsamı süzülür)");
    await call(userRoute.PATCH as never, "PATCH", `/api/admin/users/${yhId}`, asOwner, { action: "modules", changes: { reflexology: true } }, { id: yhId });
    const g3 = await snapGet();
    ok(g3.modules === "kupa_hacamat,numeroloji,refleksoloji" && (await deliver(await scopeNow())) === 3, "modül yeniden açıldı → aynı snapshot'lar GET + Word'de tekrar görünür");
  } finally {
    if (shim) await shim.close();
    await db.stop();
  }
  console.log(`\n──────────\nFAZ 2 ENTEGRASYON: PASS ${pass} · FAIL ${fail}`);
  if (fail > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}
main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });

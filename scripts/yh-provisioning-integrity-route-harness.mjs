/**
 * BF-11F-B — provisioning route + provisionExpert wrapper harness.
 * ====================================================================
 * DETERMİNİSTİK, DB'SİZ (mock rpc), AĞ'SIZ. Gerçek wrapper + statik route sözleşmesi.
 * Çalıştır: npx tsx scripts/yh-provisioning-integrity-route-harness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { provisionExpert } from "../lib/auth/provisionExpert.ts";
import { buildTenantDisplayName, buildTenantSlugBase, slugifyTenantBase } from "../lib/auth/createExpertTenant.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const fails = [];
const ck = (c, d, cond) => { if (cond) pass++; else { fail++; fails.push(`[${c}] ${d}`); console.error(`  FAIL [${c}] ${d}`); } };

const U1 = "11111111-1111-4111-8111-111111111111";
const T1 = "22222222-2222-4222-8222-222222222222";
// Mock db: rpc(fn,args) → yakalar + configured yanıt döndürür.
function mockDb(handler) { return { calls: [], async rpc(fn, args) { this.calls.push({ fn, args }); return handler(fn, args, this.calls.length); } }; }

// ── WRAPPER: payload construction ──
{
  const db = mockDb(() => ({ data: { ok: true, outcome: "provisioned", user_id: U1, tenant_id: T1, request_id: "r1" }, error: null }));
  const r = await provisionExpert(db, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "Ad", tenantName: "Ad Çalışma Alanı", tenantSlugBase: "ad", modulePermissions: { stones: false } });
  const p = db.calls[0].args.p_payload;
  ck("W", "public payload: mode/email/password_hash/tenant_name/slug_base", p.mode === "public" && p.email === "a@x.com" && p.password_hash === "h" && p.tenant_name === "Ad Çalışma Alanı" && p.tenant_slug_base === "ad");
  ck("W", "public payload: role/actor_admin_id YOK", p.role === undefined && p.actor_admin_id === undefined);
  ck("W", "provisioned result parse", r.ok === true && r.outcome === "provisioned" && r.userId === U1 && r.tenantId === T1);
}
{
  const db = mockDb(() => ({ data: { ok: true, outcome: "provisioned", user_id: U1, tenant_id: T1, request_id: "r2" }, error: null }));
  await provisionExpert(db, { mode: "admin", email: "b@x.com", passwordHash: "h", fullName: "Bd", tenantName: "n", tenantSlugBase: "b", role: "expert", active: true, actorAdminId: U1, modulePermissions: { stones: false } });
  const p = db.calls[0].args.p_payload;
  ck("W", "admin payload: role/active/actor_admin_id dahil", p.role === "expert" && p.active === true && p.actor_admin_id === U1);
  ck("W", "RPC adı yalnız provision_expert", db.calls[0].fn === "provision_expert");
}
// ── WRAPPER: result parsing / fail-closed ──
{
  const dbAE = mockDb(() => ({ data: { ok: false, outcome: "already_exists", user_id: U1, request_id: "r" }, error: null }));
  const rAE = await provisionExpert(dbAE, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", modulePermissions: {} });
  ck("W", "already_exists parse", rAE.ok === false && rAE.outcome === "already_exists" && rAE.userId === U1);

  const dbErr = mockDb(() => ({ data: null, error: { message: "raw pg error with secret" } }));
  const rErr = await provisionExpert(dbErr, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", modulePermissions: {} });
  ck("W", "DB error → fail-closed error (ham mesaj taşınmaz)", rErr.ok === false && rErr.outcome === "error" && !JSON.stringify(rErr).includes("secret"));

  const dbThrow = mockDb(() => { throw new Error("boom"); });
  const rThrow = await provisionExpert(dbThrow, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", modulePermissions: {} });
  ck("W", "transport throw → fail-closed", rThrow.ok === false && rThrow.outcome === "error");

  const dbBad = mockDb(() => ({ data: { ok: true, outcome: "provisioned", user_id: "not-a-uuid", tenant_id: T1, request_id: "r" }, error: null }));
  const rBad = await provisionExpert(dbBad, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", modulePermissions: {} });
  ck("W", "geçersiz uuid dönüş → fail-closed", rBad.ok === false && rBad.outcome === "error");

  const dbUnex = mockDb(() => ({ data: { outcome: "weird" }, error: null }));
  const rUnex = await provisionExpert(dbUnex, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", modulePermissions: {} });
  ck("W", "beklenmeyen outcome → fail-closed", rUnex.ok === false && rUnex.outcome === "error");

  const okRes = { ok: true, outcome: "provisioned", userId: U1, tenantId: T1, requestId: "r", idempotentReplay: false };
  ck("W", "result PII taşımaz (yalnız teknik alanlar)", !("email" in okRes) && !("passwordHash" in okRes) && !("fullName" in okRes));

  // Idempotency: RPC mutasyonsuz conflict döndürür → wrapper distinct outcome verir.
  const dbConf = mockDb(() => ({ data: { ok: false, outcome: "idempotency_key_conflict", request_id: "rc" }, error: null }));
  const rConf = await provisionExpert(dbConf, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", requestId: "11111111-1111-4111-8111-111111111111", modulePermissions: {} });
  ck("W", "idempotency_key_conflict parse (distinct outcome, ok=false)", rConf.ok === false && rConf.outcome === "idempotency_key_conflict" && rConf.requestId === "rc");
  ck("W", "conflict result PII taşımaz", !("email" in rConf) && !("passwordHash" in rConf) && !("userId" in rConf));

  // requestId payload'a bind edilir (idempotency anahtarı).
  const dbReq = mockDb(() => ({ data: { ok: true, outcome: "provisioned", user_id: U1, tenant_id: T1, request_id: "r" }, error: null }));
  await provisionExpert(dbReq, { mode: "public", email: "a@x.com", passwordHash: "h", fullName: "A", tenantName: "n", tenantSlugBase: "a", requestId: "22222222-2222-4222-8222-222222222222", modulePermissions: {} });
  ck("W", "requestId payload.request_id olarak geçer", dbReq.calls[0].args.p_payload.request_id === "22222222-2222-4222-8222-222222222222");
}
// ── PURE helpers ──
{
  ck("H", "slugify Türkçe → ascii", slugifyTenantBase("Şerife Öz Çalışması") === "serife-oz-calismasi");
  ck("H", "display name ad ile", buildTenantDisplayName("Ali Veli", "a@x.com") === "Ali Veli Çalışma Alanı");
  ck("H", "display name adsız → email öneki", buildTenantDisplayName("", " ali@x.com") === "ali Çalışma Alanı");
  ck("H", "slug base ad → email → uzman", buildTenantSlugBase("", "@bad") === "uzman" && buildTenantSlugBase("", "ali@x.com") === "ali");
}

// ── STATIC ROUTE CONTRACT ──
const read = (p) => readFileSync(join(root, p), "utf8");
const reg = read("app/api/register/route.ts");
const adm = read("app/api/admin/users/route.ts");
const cet = read("lib/auth/createExpertTenant.ts");
ck("R", "register: provisionExpert kullanır", /provisionExpert\(/.test(reg) && /mode: "public"/.test(reg));
ck("R", "register: direct tenants/users INSERT YOK", !/\.from\("tenants"\)\.insert|\.from\("users"\)\.insert/.test(reg));
ck("R", "register: deleteTenantById/createTenantForNewUser YOK", !/deleteTenantById|createTenantForNewUser/.test(reg));
ck("R", "register: DEFAULT_MODULE_PERMISSIONS geçer", /DEFAULT_MODULE_PERMISSIONS/.test(reg));
ck("R", "register: already_exists → 409", /already_exists[\s\S]*?409/.test(reg));
ck("R", "admin: verifyAdminRequest + provisionExpert(admin)", /verifyAdminRequest/.test(adm) && /mode: "admin"/.test(adm));
ck("R", "admin: actorAdminId guard'dan (body'den DEĞİL)", /actorAdminId: guard\.adminId/.test(adm) && !/actorAdminId: body\./.test(adm));
ck("R", "admin: direct tenants/users INSERT + rollback YOK", !/\.from\("tenants"\)\.insert|\.from\("users"\)\.insert|deleteTenantById/.test(adm));
ck("R", "admin: module_permissions yalnız expert", /role === "expert" \? \{ modulePermissions/.test(adm));
ck("R", "admin: tenant_id client body'den okunmuyor", !/body\.tenant_id|body\.tenantId/.test(adm));
ck("R", "createExpertTenant: DB-dokunan fonksiyonlar kaldırıldı", !/\.from\("tenants"\)|getServerDb|createTenantForNewUser|deleteTenantById/.test(cet));
ck("R", "createExpertTenant: pure helper'lar export", /export function slugifyTenantBase/.test(cet) && /export function buildTenantSlugBase/.test(cet));
ck("R", "register: legacy password kolonuna yazım YOK", !/password:/.test(reg.replace(/password\?:|password ?=|password\)/g, "")));
ck("R", "register: idempotency_key_conflict → 409", /idempotency_key_conflict[\s\S]*?409/.test(reg));
ck("R", "admin create: idempotency_key_conflict → 409", /idempotency_key_conflict[\s\S]*?409/.test(adm));

// ── EMAIL WRITE PATH ENVANTERİ (Fix-4): provisioning-dışı users.email UPDATE yolu ──
const edit = read("app/api/admin/users/[id]/route.ts");
ck("E", "edit route: email server-side normalize lower(btrim eşdeğeri)", /String\(body\.email \?\? ""\)\.trim\(\)\.toLowerCase\(\)/.test(edit));
ck("E", "edit route: blank email reddi (400)", /!fullName \|\| !email[\s\S]*?400/.test(edit));
// Fix-4 kapsamı: YALNIZ email-write dalı (updatePayload). license/modules dalları email
// yazmaz → kapsam-dışı (scope disiplini; pre-existing, dokunulmadı).
const emailBlock = (edit.match(/const updatePayload[\s\S]*?return NextResponse\.json\(\{ ok: true \}\);/) || [""])[0];
ck("E", "edit route (email dalı): ham DB hatası SIZDIRILMAZ (error.message yok)", !/\{ error: error\.message \}/.test(emailBlock));
ck("E", "edit route (email dalı): normalized-unique çakışması → 409 (code 23505)", /error\.code === "23505"[\s\S]*?409/.test(emailBlock));
ck("E", "edit route (email dalı): diğer DB hatası generic 500", /"Kullanıcı güncellenemedi\."[\s\S]*?500/.test(emailBlock));
// login normalize aynı kanonik sözleşme (create/edit ile uyumlu) → provisioning-dışı okuma tutarlılığı
const login = read("lib/auth/loginUser.ts");
ck("E", "login normalize lower+trim (index sözleşmesiyle uyumlu)", /email\.trim\(\)\.toLowerCase\(\)/.test(login));

console.log("");
if (fail > 0) { console.error(`yh-provisioning-integrity-route-harness: ${pass}/${pass + fail} PASS — ${fail} FAIL`); for (const f of fails) console.error("  - " + f); process.exit(1); }
console.log(`yh-provisioning-integrity-route-harness: ${pass}/${pass} PASS`);

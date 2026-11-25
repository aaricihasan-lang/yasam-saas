/**
 * GİRİŞ GÜVENLİĞİ F2-N — Owner MFA zorunluluğu için VERİTABANI düzeyinde kit şartı (20280103001300). GERÇEK PostgreSQL
 * (embedded; yerelde 17.6) + gerçek F2 zinciri + gerçek route'lar. Production'a SIFIR temas; sentetik kullanıcılar; kit kodları
 * YALNIZ bu geçici DB'de üretilir ve hiçbir çıktıya yazılmaz (G bölümü çıktıyı tarar).
 *
 * A) Kitsiz Owner zorunluluğu: RPC, doğrudan UPDATE (postgres + service_role, oturum ayarı açıkken), Owner'a yükseltme, INSERT → RED (YF401).
 *    Owner olmayan kullanıcılar etkilenmez; kitli Owner açabilir.
 * B) Kit iptali: zorunlu Owner'ın SON geçerli kiti iptal / silme / süre düşürme / tür değiştirme → RED (YF402, işlem sonunda);
 *    son kodla ACİL GİRİŞ serbest; kit yenileme (aynı işlemde iptal + yeni) çalışır.
 * C) Eşzamanlılık (READ COMMITTED, iki gerçek bağlantı, iki sıra × 3 tekrar): "aç" ve "son kiti iptal et" birlikte başarılı OLAMAZ.
 * D) Savunma derinliği: API'nin kit denetimi bu süreçte KALDIRILMIŞKEN (sourceMutation) DB yine reddeder → API 409.
 * E) Geri alma + yeniden uygulama + sıra koruması (YF201) + geri almanın tekrarı (YF203).
 * F) Ön kontrol betiği (salt-okunur) 001300'ü tanır; 000200 kuralı en son düzeye (1300) bağlı.
 * G) Sızıntı.
 *
 * Negatif kontrol: F2N_NEGATIF=1 → DB 001300 OLMADAN (F2-M) kurulur; A/B/C/D maddeleri FAIL VERMEK ZORUNDA.
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2n-owner-kit-db.harness.ts
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import pg from "pg";
import { NextRequest } from "next/server";
import { installSourceMutations } from "./sourceMutation";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
// D bölümü için: API'nin Owner kit denetimi bu süreçte KALDIRILIR → reddi yalnız DB verebilir (savunma derinliği kanıtı).
process.env.OWNER_KIT_KORUMASIZ = "1";
installSourceMutations([{ envVar: "OWNER_KIT_KORUMASIZ", file: "app/api/admin/users/[id]/mfa/route.ts", label: "API Owner kit denetimi kaldırıldı (yalnız DB katmanı sınanır)",
  anchor: `if (st.status.isOwnerAccount && st.status.ownerSelfRecoveryReady !== true) {`, replacement: `if (false) {` }]);
const NEGATIF = process.env.F2N_NEGATIF === "1";

const captured: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => { captured.push(a.map(String).join(" ")); origLog(...a); };
let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 260)}` : ""}`); }
}
const section = (s: string) => console.log(`\n── ${s} ──`);
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}
const errCode = async (p: Promise<unknown>): Promise<string | null> => {
  try { await p; return null; } catch (e) { return String((e as { code?: string }).code ?? "hata"); }
};

async function main() {
  const { startF2cDb, readF2Level, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb(NEGATIF ? { withF2m: true } : { withF2n: true, ownerKit: false });
  const { admin, pool } = db;
  const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
  const EXP = U.exp;
  const kits: string[] = [];
  const port = (admin as unknown as { connectionParameters: { port: number } }).connectionParameters.port;
  const newClient = async () => {
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
    await c.connect();
    c.on("error", () => {});
    return c;
  };
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2n-harness", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2n-rate", LOGIN_IP_PEPPER: "f2n-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", AUTH_OTP_PEPPER: "f2n-harness-pepper-0123456789abcdefghijklmnop",
    });
    delete process.env.SESSION_EXPIRY_ENFORCE;
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const recoveryRoute = await import("@/app/api/auth/mfa/recovery/verify/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");
    let ip = 10;
    type Handler = (r: NextRequest, c?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "GET" | "POST", body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...headers },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }), ctx);
      return { res, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost";
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
    const login = async (email: string, uid: string) => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [uid]);
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email, password: pw(email) });
      return { status: l.res.status, json: l.json, sid: cookieFrom(l.res, "__Host-yasam_sid"), bind: cookieFrom(l.res, "__Host-yasam_mfa") };
    };
    const required = async (uid: string) => ((await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [uid])).rows[0] as { mfa_required: boolean }).mfa_required;
    const kitActive = async () => ((await q(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'owner_offline' AND state = 'active'`, [U.owner])).rows[0] as { n: number }).n;
    const issueKit = async () => { const k = (await q(`SELECT k FROM public.auth_owner_offline_kit_issue() k`)).rows.map((r) => String((r as { k: unknown }).k)); kits.push(...k); return k; };
    const setReqDirect = (uid: string, v: boolean, c: pg.Client = admin) =>
      c.query(`BEGIN; SELECT set_config('yasam.mfa_policy','on',true); UPDATE public.users SET mfa_required = $1 WHERE id = '${uid}'; COMMIT;`.replace("$1", v ? "true" : "false"))
        .catch(async (e) => { await c.query("ROLLBACK").catch(() => {}); throw e; });
    const txn = async (sql: string, c: pg.Client = admin) => { try { await c.query(`BEGIN; ${sql}; COMMIT;`); } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } };

    section(`Kurulum (${NEGATIF ? "NEGATİF: 001300 YOK" : "001300 dahil"})`);
    const lv = await readF2Level(admin);
    console.log(`  bilgi: DB düzeyi kayıt=${lv.registry} katalog=${lv.catalog} · PostgreSQL ${(await q(`SELECT current_setting('server_version') v`)).rows[0].v}`);
    ok(NEGATIF ? lv.catalog === 1200 : lv.catalog === 1300 && lv.registry === 1300, `test DB düzeyi ${NEGATIF ? 1200 : 1300}`, lv);
    ok((await q(`SELECT public.auth_is_owner_admin($1) x`, [U.owner])).rows[0].x === true && (await kitActive()) === 0 && (await required(U.owner)) === false, "Owner: kit 0, zorunluluk kapalı");
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2)`, [U.owner, VE.id]);
    const owner = await login(EMAIL.owner, U.owner);
    ok(owner.status === 200 && !!owner.sid, "Owner parolayla oturum (henüz zorunlu değil)");

    section("A) Kitsiz Owner zorunluluğu veritabanında REDDEDİLİR (YF401)");
    const a1 = await errCode(q(`SELECT public.auth_mfa_set_required($1, $2, true, 'kitsiz deneme') r`, [owner.sid, U.owner]));
    ok(a1 === "YF401" && (await required(U.owner)) === false, "doğrudan RPC (auth_mfa_set_required) → YF401; değişmedi", a1);
    const a2 = await errCode(setReqDirect(U.owner, true));
    ok(a2 === "YF401" && (await required(U.owner)) === false, "doğrudan UPDATE (postgres, oturum ayarı açık) → YF401", a2);
    const svc = await newClient();
    await svc.query(`SET ROLE service_role`);
    const a3 = await errCode(setReqDirect(U.owner, true, svc));
    ok(a3 === "YF401" && (await required(U.owner)) === false, "doğrudan UPDATE (service_role = uygulama anahtarı, oturum ayarı açık) → YF401", a3);
    await svc.end();
    // Owner'a yükseltme ve INSERT: F2-K yönetici verme koruması önce durdurur; F2-N'yi YALIN sınamak için o tetikleyici bu
    // işlemde DB sahibi olarak kapatılır (aynı zamanda "DB sahibi tetikleyici kapatabilir" sınırının kanıtı).
    await setReqDirect(VE.id, true);
    const a4 = await errCode(txn(`ALTER TABLE public.users DISABLE TRIGGER trg_users_admin_grant_guard;
      UPDATE public.users SET role = 'admin', is_super_admin = true, active = true WHERE id = '${VE.id}';
      ALTER TABLE public.users ENABLE TRIGGER trg_users_admin_grant_guard`));
    ok(a4 === "YF401", "zorunlu kullanıcıyı Owner'a yükseltme (kit yok) → YF401", a4);
    const a5 = await errCode(txn(`ALTER TABLE public.users DISABLE TRIGGER trg_users_admin_grant_guard;
      INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, password_hash, is_super_admin, mfa_required)
      SELECT gen_random_uuid(), 'ikinci-owner@test.local', 'admin', tenant_id, true, 'approved', password_hash, true, true FROM public.users WHERE id = '${U.owner}';
      ALTER TABLE public.users ENABLE TRIGGER trg_users_admin_grant_guard`));
    ok(a5 === "YF401", "kitsiz, zorunlu yeni Owner INSERT → YF401", a5);
    ok((await q(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'trg_users_admin_grant_guard' AND tgenabled = 'O'`)).rows[0].n === 1, "geri alınan işlemle F2-K tetikleyicisi yine etkin");
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [EXP]);
    const a6 = (await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'uzman') r`, [owner.sid, EXP])).rows[0].r as J;
    ok(a6.ok === true && (await required(EXP)) === true, "Owner olmayan kullanıcı: zorunluluk açılır (etkilenmez)", a6);

    section("D) Savunma derinliği: API kit denetimi KALDIRILMIŞKEN DB yine reddeder");
    const d1 = await call(mfaRoute.POST, `${L}/api/admin/users/${U.owner}/mfa`, "POST", { action: "enable", reason: "API atlanmış deneme", confirm: true },
      { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${owner.sid}`, "sec-fetch-site": "same-origin" }, { params: Promise.resolve({ id: U.owner }) });
    ok(d1.res.status === 409 && d1.json.code === "OWNER_RECOVERY_REQUIRED" && (await required(U.owner)) === false, "API → 409 OWNER_RECOVERY_REQUIRED (DB YF401 eşlendi)", d1.json);

    section("A') Kit varken Owner açabilir");
    await issueKit();
    const a7 = (await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'kit hazır') r`, [owner.sid, U.owner])).rows[0].r as J;
    ok(a7.ok === true && (await required(U.owner)) === true && (await kitActive()) === 5, "kit 5 → Owner zorunluluğu açıldı", a7);

    section("B) Zorunlu Owner'ın son kiti korunur (YF402); kullanım ve yenileme serbest");
    await txn(`UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE id IN (
      SELECT id FROM public.auth_recovery_codes WHERE user_id = '${U.owner}' AND kind = 'owner_offline' AND state = 'active' ORDER BY id LIMIT 4)`);
    ok((await kitActive()) === 1, "4 kod iptal edildi (1 kaldı) — izinli");
    const lastId = (await q(`SELECT id FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'owner_offline' AND state = 'active'`, [U.owner])).rows[0].id;
    const b = [
      ["son kodu İPTAL", `UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE id = '${lastId}'`],
      ["son kodu SİLME", `DELETE FROM public.auth_recovery_codes WHERE id = '${lastId}'`],
      ["son kodun türünü değiştirme", `UPDATE public.auth_recovery_codes SET kind = 'user' WHERE id = '${lastId}'`],
      ["anında kısıt kipinde iptal", `SET CONSTRAINTS ALL IMMEDIATE; UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE id = '${lastId}'`],
    ] as const;
    const exp = await errCode(txn(`UPDATE public.auth_recovery_codes SET expires_at = now() - interval '1 second' WHERE id = '${lastId}'`));
    ok(exp === "23514" && (await kitActive()) === 1, "kit koduna süre atanamaz (mevcut CHECK ticket_chk, 23514) — süre düşürme yolu zaten kapalı", exp);
    for (const [label, sql] of b) {
      const e = await errCode(txn(sql));
      ok(e === "YF402" && (await kitActive()) === 1, `${label} → YF402; kit korunur`, e);
    }
    // Son kit koduyla ACİL GİRİŞ (gerçek route'lar): kullanım serbest.
    const l = await login(EMAIL.owner, U.owner);
    const used = await (async () => {
      for (const k of kits.slice(0, 5)) {
        const v = await call(recoveryRoute.POST, `${L}/api/auth/mfa/recovery/verify`, "POST", { challengeId: String(l.json.challengeId ?? ""), code: k }, web(l.bind));
        if (v.res.status === 200) return v;
      }
      return null;
    })();
    const c = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: String(l.json.challengeId ?? "") }, web(l.bind));
    ok(!!used && c.res.status === 200 && !!cookieFrom(c.res, "__Host-yasam_sid") && (await kitActive()) === 0, "SON kit koduyla acil giriş SERBEST (kit 0 kaldı, zorunluluk açık)", { used: used?.res.status, c: c.res.status });
    await issueKit();
    ok((await kitActive()) === 5, "kit 0 iken yeni kit üretildi");
    await issueKit();
    ok((await kitActive()) === 5, "kit YENİLEME (aynı işlemde 5 iptal + 5 yeni) çalışır");
    await q(`SELECT 1`);
    const trunc = await errCode(txn(`TRUNCATE public.auth_recovery_codes CASCADE`));
    ok(trunc === "YF402" && (await kitActive()) === 5, "zorunlu Owner varken kit tablosunu TRUNCATE → YF402 (satır tetikleyicisi atlanamaz)", trunc);
    const veCodesRevoke = await errCode(txn(`UPDATE public.auth_recovery_codes SET state = 'revoked' WHERE user_id = '${VE.id}' AND state = 'active'`));
    ok(veCodesRevoke === null, "Owner olmayan kullanıcının kodları serbestçe iptal edilir (etkilenmez)", veCodesRevoke);

    section("C) Eşzamanlılık — READ COMMITTED, iki gerçek bağlantı (iki sıra × 3)");
    for (let i = 1; i <= 3; i++) {
      // Hazırlık: zorunluluk kapalı, kit 1.
      await setReqDirect(U.owner, false);
      await txn(`UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE id IN (
        SELECT id FROM public.auth_recovery_codes WHERE user_id = '${U.owner}' AND kind = 'owner_offline' AND state = 'active' ORDER BY id OFFSET 1)`);
      const one = (await q(`SELECT id FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'owner_offline' AND state = 'active'`, [U.owner])).rows[0].id;
      // Sıra 1: önce son kit iptali (açık işlem), sonra "aç" bekler.
      const t1 = await newClient();
      const t2 = await newClient();
      await t1.query(`BEGIN; UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'yaris_testi' WHERE id = '${one}'`);
      await t2.query(`BEGIN; SELECT set_config('yasam.mfa_policy','on',true)`);
      const enableP = errCode(t2.query(`UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'`));
      await sleep(300);
      const waiting = (await q(`SELECT count(*)::int n FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'`, [(t2 as unknown as { processID: number }).processID])).rows[0].n === 1;
      await t1.query("COMMIT");
      const e2 = await enableP;
      await t2.query("ROLLBACK").catch(() => {});
      ok(waiting && e2 === "YF401" && (await required(U.owner)) === false && (await kitActive()) === 0, `#${i} iptal önce: "aç" iptali BEKLEDİ ve YF401 aldı (ikisi birden olmadı)`, { waiting, e2 });
      // Sıra 2: önce "aç" (açık işlem; kit satırı kilitli), sonra son kit iptali bekler ve işlem sonunda YF402.
      await issueKit();
      await txn(`UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE id IN (
        SELECT id FROM public.auth_recovery_codes WHERE user_id = '${U.owner}' AND kind = 'owner_offline' AND state = 'active' ORDER BY id OFFSET 1)`);
      const two = (await q(`SELECT id FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'owner_offline' AND state = 'active'`, [U.owner])).rows[0].id;
      await t2.query(`BEGIN; SELECT set_config('yasam.mfa_policy','on',true); UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'`);
      const revokeP = errCode(t1.query(`BEGIN; UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'yaris_testi' WHERE id = '${two}'; COMMIT;`));
      await sleep(300);
      await t2.query("COMMIT");
      const e1 = await revokeP;
      await t1.query("ROLLBACK").catch(() => {});
      ok(e1 === "YF402" && (await required(U.owner)) === true && (await kitActive()) === 1, `#${i} "aç" önce: son kit iptali işlem sonunda YF402 aldı (zorunlu Owner'ın kiti kaldı)`, { e1 });
      await t1.end(); await t2.end();
    }

    section("E) Geri alma + yeniden uygulama + sıra koruması");
    if (!NEGATIF) {
      const rb = fs.readFileSync(path.join(process.cwd(), "scripts/giris-guvenligi/f2n-rollback.sql"), "utf8");
      await q(rb);
      const l2 = await readF2Level(admin);
      const trg = (await q(`SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('users_owner_mfa_kit_guard_trg','auth_owner_kit_invalidate_upd_trg','auth_owner_kit_invalidate_del_trg','auth_owner_kit_lock_order_trg','auth_owner_kit_truncate_guard_trg')`)).rows[0].n;
      ok(l2.registry === 1200 && l2.catalog === 1200 && trg === 0 && (await required(U.owner)) === true && (await kitActive()) === 1, "geri alma: düzey 1200, tetikleyiciler yok, VERİ değişmedi", { l2, trg });
      await setReqDirect(U.owner, false);
      await txn(`UPDATE public.auth_recovery_codes SET state = 'revoked', revoked_at = now(), revoke_reason = 'test' WHERE user_id = '${U.owner}' AND kind = 'owner_offline' AND state = 'active'`);
      const off = await errCode(setReqDirect(U.owner, true));
      ok(off === null && (await required(U.owner)) === true, "geri alma sonrası kural YOK (beklenen: kitsiz zorunluluk yeniden mümkün)", off);
      await setReqDirect(U.owner, false);
      const rb2 = await errCode(q(rb));
      await q("ROLLBACK").catch(() => {});
      ok(rb2 === "YF203", "geri almanın tekrarı → YF203 (yanlış ortam), hiçbir şey değişmedi", rb2);
      const mig = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280103001300_auth_owner_mfa_kit_guard_f2n.sql"), "utf8");
      await q(mig);
      const l3 = await readF2Level(admin);
      const again = await errCode(setReqDirect(U.owner, true));
      ok(l3.registry === 1300 && l3.catalog === 1300 && again === "YF401", "001300 yeniden uygulandı: düzey 1300, kural yine etkin (YF401)", { l3, again });
      const idem = await errCode(q(mig));
      ok(idem === null && (await readF2Level(admin)).catalog === 1300, "001300 aynı düzeyde ikinci kez: hata yok (idempotent)", idem);
      const m12 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280103001200_auth_email_smtp_provider_f2m.sql"), "utf8");
      const old = await errCode(q(m12));
      await q("ROLLBACK").catch(() => {});
      ok(old === "YF201" && (await q(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'users_owner_mfa_kit_guard_trg'`)).rows[0].n === 1,
        "001200 (eski aşama) 001300'den sonra REDDEDİLİR (YF201); koruma yerinde", old);

      section("F) Ön kontrol (salt-okunur) ve 000200 kuralı");
      // Sentetik migration geçmişi (prod'daki supabase_migrations karşılığı; yalnız bu test DB'sinde): uygulanan F2 sürümleri.
      await q(`CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, name text);
        INSERT INTO supabase_migrations.schema_migrations (version) SELECT unnest(ARRAY['20280103000000','20280103000100','20280103000200','20280103000300',
          '20280103000400','20280103000500','20280103000600','20280103000700','20280103000800','20280103000900','20280103001000','20280103001100',
          '20280103001200','20280103001300']) ON CONFLICT DO NOTHING`);
      const pre = fs.readFileSync(path.join(process.cwd(), "scripts/giris-guvenligi/f2-preflight.sql"), "utf8");
      const c2 = await newClient();
      await c2.query("BEGIN READ ONLY");
      const rows = (await c2.query(pre)).rows.map((r) => String(Object.values(r as J)[0]));
      await c2.query("ROLLBACK"); await c2.end();
      ok(rows.some((r) => r.startsWith("on_kontrol|20280103001300|ZATEN UYGULANMIŞ")), "ön kontrol 001300'ü 'ZATEN UYGULANMIŞ' görür", rows.filter((r) => r.includes("001300")));
      ok(/WHEN s\.fp < 1300 OR s\.catalog_ok IS NOT TRUE THEN 'SIRA HATASI\|tüm doğrusal zincir/.test(pre), "000200 kuralı en son doğrusal düzeye (1300) bağlı: önce zincir + kod yayını, 000200 EN SON");
    }

    section("G) Sızıntı");
    const out = captured.join("\n").toUpperCase().replace(/-/g, "");
    ok(kits.length >= 5 && !kits.some((k) => out.includes(k.replace(/-/g, "").toUpperCase())), `çıktıda kit kodu yok (${kits.length} sentetik kod tarandı)`);
    void pool;
  } finally {
    await db.close();
  }
  console.log(`\nf2n-owner-kit-db: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => {
  // Beklenmeyen hata (ör. negatif kipte zincirleme durum) de FAIL'dir; özet satırı her durumda yazılır.
  console.error(e);
  fail++;
  console.log(`
f2n-owner-kit-db: ${pass} PASS / ${fail} FAIL (beklenmeyen hata)`);
  process.exit(1);
});

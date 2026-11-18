/**
 * Yönetici "onay bekleyen" (pending_approval) girişi KAPALI kalır — gerçek route + gerçek PostgreSQL (F2-A…F2-K zinciri).
 *
 * Owner kararı (2026-10-04): admin web girişi her zaman doğrudan aktif oturum açar. Veritabanındaki pending makinesi hâlâ
 * mevcut; uygulama katmanı rolü geçici olarak okuyamazsa istek uzman yoluna gider ve veritabanı pending üretebilir.
 * Bekleyen satırın anahtarı onaylanınca tam oturum anahtarı olacağı için bu durumda:
 *   - yanıt gövdesinde hiçbir oturum / bekleme anahtarı OLMAMALI (hiçbir taşıma kipinde),
 *   - bekleyen satır kapatılmalı, çerez yazılmamalı, bekleyen anahtar hiçbir korumalı uçta geçmemeli,
 *   - normal admin girişi (aktif oturum + HttpOnly çerez) DEĞİŞMEMELİ.
 * Hata enjeksiyonu: yalnız sentetik veritabanında, rol okumasının seçtiği bir kolon geçici olarak yeniden adlandırılır.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/pending-kapali.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";

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
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

type J = Record<string, unknown>;
const ORIGIN = "https://www.yasamsistemi.com";
const UA = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0",
  safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
  appWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0 Mobile Safari/537.36",
};

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2k: true });
  const { admin } = db;
  const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "pending-kapali", SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "pending-kapali-rate", LOGIN_IP_PEPPER: "pending-kapali-ip",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
  });
  let renamed = false;
  try {
    const sessionRoute = await import("@/app/api/auth/session/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    let ip = 10;
    const call = async (h: (r: NextRequest) => Promise<Response>, url: string, method: string, body: unknown, headers: Record<string, string>) => {
      const res = await h(new NextRequest(`${ORIGIN}${url}`, {
        method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "sec-fetch-site": "same-origin", origin: ORIGIN, ...headers },
        ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
      }));
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const text = await res.clone().text();
      let json: J = {};
      try { json = JSON.parse(text) as J; } catch { /* JSON değil */ }
      return { status: res.status, json, set, text };
    };
    const login = (headers: Record<string, string>) => call(sessionRoute.POST, "/api/auth/session", "POST", { email: EMAIL.owner, password: pw(EMAIL.owner) }, headers);
    const sid = (set: string[]) => (set.find((c) => c.startsWith("__Host-yasam_sid=")) ?? "").split(";")[0].split("=").slice(1).join("=");
    const profile = (headers: Record<string, string>) => call(profileRoute.GET, "/api/auth/profile", "GET", null, { "x-user-id": U.owner, ...headers });
    const endAll = () => q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND (is_active OR ended_at IS NULL)`, [U.owner]);
    const pendingRows = async () => (await q(
      `SELECT id, session_token, is_active, ended_at, end_reason FROM public.user_sessions WHERE user_id = $1 AND session_state = 'pending_approval' ORDER BY created_at`, [U.owner])).rows as J[];

    // Canlıdaki gibi yönetici denetim kaydı yazılabilir olmalı: yazılamazsa eski kod da "audit fail-closed" dalına düşer
    // ve test pending yolunu ÖLÇEMEZ (sahte PASS). Sentetik DB'de servis rolüne canlıdaki ekleme yetkisi verilir.
    await q(`GRANT SELECT, INSERT ON public.admin_audit_log TO service_role`);
    await q(`DO $$ BEGIN EXECUTE (SELECT string_agg(format('GRANT USAGE ON SEQUENCE %s TO service_role', s::regclass), '; ')
      FROM pg_class s WHERE s.relkind = 'S' AND s.relnamespace = 'public'::regnamespace AND s.relname LIKE 'admin_audit_log%'); EXCEPTION WHEN others THEN NULL; END $$`);
    // Sentetik Owner MFA'sız olmalı (MFA'lı yönetici girişi auth_finalize_login → doğrudan aktif oturum; bu yol etkilenmez).
    await q(`UPDATE public.users SET mfa_required = false WHERE id = $1`, [U.owner]).catch(() => undefined);
    await endAll();

    console.log("\n── 1) Normal admin web girişi (regresyon): iki aktif oturum, HttpOnly çerez, gövdede anahtar yok ──");
    const a = await login({ "user-agent": UA.chrome });
    ok(a.status === 200 && sid(a.set) !== "" && !("sessionToken" in a.json) && !("pendingToken" in a.json), "ilk admin girişi 200 + çerez, gövdede anahtar YOK", { s: a.status, code: a.json.code, k: Object.keys(a.json) });
    const b = await login({ "user-agent": UA.firefox });
    ok(b.status === 200 && sid(b.set) !== "" && !("pendingToken" in b.json), "ikinci admin web girişi doğrudan aktif (onay yok), gövdede anahtar YOK", { s: b.status, k: Object.keys(b.json) });
    ok((await pendingRows()).length === 0, "normal akışta bekleyen (pending) satır OLUŞMADI");

    console.log("\n── 2) Rol okuması geçici hata verirken (aktif admin web oturumu varken) giriş: pending anahtarı DIŞARI ÇIKMAZ ──");
    // Pending koşulu: tam BİR aktif admin web oturumu (A) — ikinci (B) kapatılır (iki aktifle web üst sınırı 409 verir).
    await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE session_token = $1`, [sid(b.set)]);
    await q(`ALTER TABLE public.users RENAME COLUMN security_mode TO security_mode__test_gecici`);
    renamed = true;
    for (const [name, headers, env] of [
      ["web (çerez kipi)", { "user-agent": UA.safari }, {}],
      ["web kill-switch (SESSION_COOKIE_WEB_HEADER=on, anahtar normalde gövdede)", { "user-agent": UA.chrome }, { SESSION_COOKIE_WEB_HEADER: "on" }],
      ["web, ANDROID_APP_SESSION_TRANSPORT=cookie açıkken", { "user-agent": UA.firefox }, { ANDROID_APP_SESSION_TRANSPORT: "cookie" }],
    ] as const) {
      Object.assign(process.env, env);
      const before = (await pendingRows()).length;
      const r = await login(headers as Record<string, string>);
      for (const k of Object.keys(env)) delete process.env[k];
      const rows = await pendingRows();
      const created = rows.slice(before);
      ok(created.length === 1, `${name}: hata enjeksiyonu pending yolunu gerçekten tetikledi (test geçerli)`, { yeni: created.length, s: r.status });
      const tok = String(created[0]?.session_token ?? "");
      ok(!("pendingToken" in r.json) && !("sessionToken" in r.json) && (tok === "" || !r.text.includes(tok)), `${name}: yanıt gövdesinde oturum / bekleme anahtarı YOK`, { s: r.status, k: Object.keys(r.json) });
      ok(r.status >= 400 && sid(r.set) === "", `${name}: giriş başarı sayılmadı (${r.status}), çerez yazılmadı`);
      ok(created[0]?.ended_at != null && created[0]?.is_active === false && created[0]?.end_reason !== "audit_failed",
        `${name}: bekleyen satır kapatıldı (${String(created[0]?.end_reason)}; denetim kaydı yazılabilir durumda)`, created[0] ? { ended: created[0].ended_at != null, aktif: created[0].is_active, neden: created[0].end_reason } : null);
      if (tok) {
        const viaCookie = await profile({ "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${tok}` });
        const viaHeader = await profile({ "user-agent": UA.appWebView, "x-requested-with": "com.yasamsistemi.app", "x-session-token": tok });
        ok(viaCookie.status === 401 && viaHeader.status === 401, "bekleyen anahtar korumalı uçta geçmiyor (çerez ve başlık: 401)", { c: viaCookie.status, h: viaHeader.status });
      }
    }
    {
      // Android kanalı (taklit başlıklar, çerez kipi): veritabanı admin Android yolunda pending ÜRETMEZ; anahtar gövdede yok.
      process.env.ANDROID_APP_SESSION_TRANSPORT = "cookie";
      const before = (await pendingRows()).length;
      const r = await login({ "user-agent": UA.appWebView, "x-requested-with": "com.yasamsistemi.app" });
      delete process.env.ANDROID_APP_SESSION_TRANSPORT;
      ok((await pendingRows()).length === before && !("pendingToken" in r.json) && !("sessionToken" in r.json),
        `Android taklit + çerez kipi: pending oluşmadı, gövdede anahtar YOK (${r.status})`, { s: r.status, k: Object.keys(r.json) });
      await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND client_channel = 'android_app' AND is_active`, [U.owner]);
    }
    await q(`ALTER TABLE public.users RENAME COLUMN security_mode__test_gecici TO security_mode`);
    renamed = false;

    console.log("\n── 3) Hata giderilince normal admin girişi yeniden çalışır; mevcut oturumlar etkilenmedi ──");
    ok((await profile({ "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${sid(a.set)}` })).status === 200, "önceki admin oturumu (A) hâlâ geçerli");
    const c = await login({ "user-agent": UA.safari });
    ok(c.status === 200 && sid(c.set) !== "" && !("pendingToken" in c.json), "yeniden giriş 200 + çerez, anahtar gövdede yok", { s: c.status });

    // ── 4–7: kapatma / denetim kaydı başarısız olursa ve kalan bekleyen satır başka uçtan etkinleştirilmeye çalışılırsa ──
    const listRoute = await import("@/app/api/admin/me/session-approvals/route");
    const decideRoute = await import("@/app/api/admin/me/session-approvals/[id]/route");
    const seen: string[] = []; // bu bölümdeki bütün yanıt gövdeleri + Set-Cookie başlıkları (anahtar taraması)
    const track = <T extends { text: string; set: string[] }>(r: T) => { seen.push(r.text, ...r.set); return r; };
    const aCookie = { "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${sid(a.set)}`, "x-admin-id": U.owner };
    const listAs = (h: Record<string, string>) => call(listRoute.GET, "/api/admin/me/session-approvals", "GET", null, h).then(track);
    const decideAs = (id: string, h: Record<string, string>) =>
      call((r) => decideRoute.POST(r, { params: Promise.resolve({ id }) }), `/api/admin/me/session-approvals/${id}`, "POST", { decision: "approve" }, h).then(track);
    const sessionStatus = (tok: string) => call(sessionRoute.GET, "/api/auth/session", "GET", null, { "user-agent": UA.chrome, "x-session-token": tok }).then(track);
    const injectRoleFault = async (on: boolean) => {
      await q(on ? `ALTER TABLE public.users RENAME COLUMN security_mode TO security_mode__test_gecici` : `ALTER TABLE public.users RENAME COLUMN security_mode__test_gecici TO security_mode`);
      renamed = on;
    };
    const onlyA = () => q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout'
      WHERE user_id = $1 AND (is_active OR ended_at IS NULL) AND session_token <> $2`, [U.owner, sid(a.set)]);
    const rowOf = async (tok: string) => (await q(`SELECT id, is_active, ended_at, end_reason, session_state FROM public.user_sessions WHERE session_token = $1`, [tok])).rows[0] as J | undefined;

    console.log("\n── 4) Bekleyen satırı KAPATMA güncellemesi başarısız olursa: yine fail-closed ──");
    await onlyA();
    await q(`CREATE OR REPLACE FUNCTION public.zz_test_kapatma_hatasi() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.end_reason = 'pending_disabled' THEN RAISE EXCEPTION 'test: kapatma hatası'; END IF; RETURN NEW; END $f$`);
    await q(`CREATE TRIGGER zz_test_kapatma_hatasi BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION public.zz_test_kapatma_hatasi()`);
    await injectRoleFault(true);
    const before4 = (await pendingRows()).length;
    const r4 = track(await login({ "user-agent": UA.safari }));
    await injectRoleFault(false);
    await q(`DROP TRIGGER zz_test_kapatma_hatasi ON public.user_sessions; DROP FUNCTION public.zz_test_kapatma_hatasi()`);
    const p4 = (await pendingRows()).slice(before4)[0];
    const tok4 = String(p4?.session_token ?? "");
    ok(!!tok4, "enjeksiyon geçerli: bekleyen satır oluştu", { s: r4.status });
    ok(r4.status === 503 && sid(r4.set) === "" && !("pendingToken" in r4.json) && !r4.text.includes(tok4), "kapatma başarısız olsa da yanıt 503, çerez yok, gövdede anahtar yok", { s: r4.status, k: Object.keys(r4.json) });
    const row4 = tok4 ? await rowOf(tok4) : undefined;
    ok(row4?.is_active === false && row4?.ended_at == null && row4?.session_state === "pending_approval", "kapatılamayan satır AKTİF DEĞİL (bekleyen; süresi 10 dk ile sınırlı)", row4);
    if (tok4) {
      const pc = await profile({ "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${tok4}` });
      const ph = await profile({ "user-agent": UA.appWebView, "x-requested-with": "com.yasamsistemi.app", "x-session-token": tok4 });
      const st = await sessionStatus(tok4);
      const adm = await listAs({ "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${tok4}`, "x-admin-id": U.owner });
      const admH = await listAs({ "user-agent": UA.chrome, "x-session-token": tok4, "x-admin-id": U.owner });
      ok(pc.status === 401 && ph.status === 401 && st.json.valid !== true && (adm.status === 401 || adm.status === 403) && (admH.status === 401 || admH.status === 403),
        "bekleyen anahtar: korumalı uç 401, oturum durumu geçersiz, yönetici ucu (x-admin-id ile, çerez ve başlık) reddedildi", { pc: pc.status, ph: ph.status, valid: st.json.valid, adm: adm.status, admH: admH.status });
      const ctl = await listAs(aCookie);
      ok(ctl.status === 200, "kontrol: aynı yönetici ucu geçerli A oturumuyla 200 (ret, eksik başlıktan DEĞİL)", ctl.status);
    }

    console.log("\n── 5) Kalan bekleyen satır başka uçtan etkinleştirilmeye çalışılırsa (yönetici onay ucu) ──");
    const list5 = await listAs(aCookie);
    const item = ((list5.json.pending as J[] | undefined) ?? []).find((p) => p.id === row4?.id);
    ok(list5.status === 200 && !list5.text.includes(tok4), "bekleyen girişler listesi anahtarı İÇERMİYOR", { s: list5.status });
    if (item && tok4) {
      const d5 = await decideAs(String(item.id), aCookie);
      const row5 = await rowOf(tok4);
      ok(!d5.text.includes(tok4) && d5.set.every((x) => !x.includes(tok4)), `onay yanıtı anahtarı / çerezi İÇERMİYOR (${d5.status})`);
      // Onay verilse bile anahtar sunucu dışına hiç çıkmadı: hiçbir istemci bu oturumu kullanamaz.
      const audit = (await q(`SELECT coalesce(string_agg(t::text, ' '), '') AS s FROM public.admin_audit_log t`)).rows[0] as J;
      const sec = (await q(`SELECT coalesce(string_agg(t::text, ' '), '') AS s FROM public.security_events t`)).rows[0] as J;
      ok(!String(audit.s).includes(tok4) && !String(sec.s).includes(tok4), "anahtar denetim / güvenlik kayıtlarında YOK");
      ok(!seen.some((x) => x.includes(tok4)), `bu bölümdeki ${seen.length} yanıt gövdesi / Set-Cookie başlığının HİÇBİRİ anahtarı içermiyor`);
      console.log(`  bilgi: onaydan sonra satır durumu → aktif=${String(row5?.is_active)} (anahtar hiçbir istemcide yok; MFA zorunlu hesapta bu adım veritabanında reddedilir — bkz. 7)`);
    } else {
      ok(false, "bekleyen satır onay listesinde görünmedi (senaryo yürütülemedi)", { s: list5.status, n: (list5.json.pending as unknown[] | undefined)?.length });
    }

    console.log("\n── 6) Denetim kaydı yazılamazsa: satır yine kapatılır, anahtar yok ──");
    await onlyA();
    await q(`REVOKE INSERT ON public.admin_audit_log FROM service_role`);
    await injectRoleFault(true);
    const before6 = (await pendingRows()).length;
    const r6 = await login({ "user-agent": UA.firefox });
    await injectRoleFault(false);
    await q(`GRANT SELECT, INSERT ON public.admin_audit_log TO service_role`);
    const p6 = (await pendingRows()).slice(before6)[0];
    ok(!!p6 && r6.status === 503 && !("pendingToken" in r6.json) && !r6.text.includes(String(p6.session_token)) && sid(r6.set) === "",
      "denetim kaydı başarısız: 503, anahtar / çerez yok", { s: r6.status });
    ok(p6?.ended_at != null && p6?.is_active === false && p6?.end_reason === "pending_disabled", "denetim kaydı başarısız olsa da bekleyen satır kapatıldı", p6 ? { neden: p6.end_reason } : null);

    console.log("\n── 7) Rol okuma hatası uzmana yetki vermez; MFA zorunlu hesapta bekleyen satır MFA'sız aktifleşemez ──");
    await injectRoleFault(true);
    const ex = await call(sessionRoute.POST, "/api/auth/session", "POST", { email: EMAIL.free, password: pw(EMAIL.free) }, { "user-agent": UA.chrome });
    await injectRoleFault(false);
    const exSid = sid(ex.set);
    const exRow = exSid ? (await q(`SELECT u.role FROM public.user_sessions s JOIN public.users u ON u.id = s.user_id WHERE s.session_token = $1 AND s.is_active`, [exSid])).rows[0] as J | undefined : undefined;
    const exAdm = await listAs({ "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${exSid}`, "x-admin-id": U.free });
    const exAdm2 = await listAs({ "user-agent": UA.chrome, cookie: `__Host-yasam_sid=${exSid}`, "x-admin-id": U.owner });
    ok(ex.status === 200 && exRow?.role === "expert" && (exAdm.status === 401 || exAdm.status === 403) && (exAdm2.status === 401 || exAdm2.status === 403) && !("sessionToken" in ex.json),
      "rol okuma hatasında uzman girişi normal uzman oturumu; yönetici ucu (kendi ve Owner kimliğiyle) reddedildi", { s: ex.status, rol: exRow?.role, adm: exAdm.status, adm2: exAdm2.status });
    {
      // Yeni bekleyen satır (kapatma engelli) → hesap MFA zorunlu yapılır → satır doğrudan aktifleştirilmeye çalışılır.
      await onlyA();
      await q(`CREATE OR REPLACE FUNCTION public.zz_test_kapatma_hatasi() RETURNS trigger LANGUAGE plpgsql AS $f$
        BEGIN IF NEW.end_reason = 'pending_disabled' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END $f$`);
      await q(`CREATE TRIGGER zz_test_kapatma_hatasi BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION public.zz_test_kapatma_hatasi()`);
      await injectRoleFault(true);
      const b7 = (await pendingRows()).length;
      await login({ "user-agent": UA.safari });
      await injectRoleFault(false);
      await q(`DROP TRIGGER zz_test_kapatma_hatasi ON public.user_sessions; DROP FUNCTION public.zz_test_kapatma_hatasi()`);
      const p7 = (await pendingRows()).slice(b7)[0];
      // Sentetik kurulum kısayolu: MFA zorunluluğu resmî yolla (auth_mfa_set_required) açılınca Owner'ın MFA'sız A oturumu
      // da kapanır (K2) ve onay ucunu çağıracak aktör kalmaz. Bu yüzden YALNIZ users satırı tetikleyicisiz güncellenir;
      // user_sessions üzerindeki MFA koruması (asıl denetlenen) devrede kalır.
      await q(`BEGIN; SET LOCAL session_replication_role = replica; UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'; COMMIT;`);
      const mfaOn = ((await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [U.owner])).rows[0] as J).mfa_required === true;
      const list7 = await listAs(aCookie);
      const item7 = ((list7.json.pending as J[] | undefined) ?? []).find((x) => x.id === p7?.id);
      const d7 = item7 ? await decideAs(String(item7.id), aCookie) : null;
      const row7 = p7 ? await rowOf(String(p7.session_token)) : undefined;
      console.log(`  bilgi: onay denemesi → ${d7?.status ?? "liste dışı"} ${String(d7?.json.error ?? "")}`);
      ok(!!p7 && mfaOn && !!item7 && d7 !== null && d7.status !== 200 && row7?.is_active === false,
        "MFA zorunlu hesapta bekleyen satır yönetici onayıyla MFA'sız AKTİFLEŞEMEDİ (veritabanı koruması)", { p7: !!p7, mfaOn, listede: !!item7, onay: d7?.status, aktif: row7?.is_active });
      await q(`BEGIN; SET LOCAL session_replication_role = replica; UPDATE public.users SET mfa_required = false WHERE id = '${U.owner}'; COMMIT;`);
    }
    await endAll();
  } finally {
    if (renamed) await q(`ALTER TABLE public.users RENAME COLUMN security_mode__test_gecici TO security_mode`).catch(() => undefined);
    await db.close();
  }
  console.log(`\npending-kapali: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
process.on("beforeExit", () => { console.error("pending-kapali: özet yazılmadan bitti → FAIL"); process.exit(1); });
main().catch((e) => { console.error(e); process.exit(1); });

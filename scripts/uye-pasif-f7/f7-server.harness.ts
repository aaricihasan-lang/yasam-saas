/**
 * ÜYE PASİFLEŞTİRME F7 — kişiye özel üyelik uyarısı: SUNUCU + GÜVENLİK + ARAYÜZ BİLEŞENİ harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri + test-only PostgREST şimi + GERÇEK route handler'ları (detay GET,
 * status POST) + gerçek kullanıcı kapısı (verifyUserRequest, kendi profil ucu). Production'a / ağa SIFIR temas; sentetik hesaplar.
 *
 *   F  F7 migration ÖNCESİ: messageSupported=false · mesajlı Pasif Yap 409 (hiçbir satır değişmez) · mesajsız Pasif Yap AYNEN çalışır
 *   P  mesajsız Pasif Yap → profil mesajı null (standart uyarı) · modül 403 · oturum korunur
 *   M  3 hazır mesaj · düzenlenmiş hazır · özel çok satırlı · HTML (olduğu gibi, düz metin) · 501 / kontrol karakteri / Aktif Yap+mesaj → 400
 *   E  sonradan düzenle / kaldır (set_access_message) · bayat 409 · pasif olmayan 409 · ikinci yönetici · arşiv 409 · geçersiz gövde 400
 *   X  Aktif Yap → mesaj temizlenir (detay + profil) · yeniden Pasif Yap (mesajsız) → eski mesaj GELMEZ
 *   I  izolasyon: mesaj yalnız ilgili uzmanın KENDİ profilinde; başka uzmanın profilinde / 403 gövdelerinde / aktif hesapta YOK
 *   L  log: mesaj metni hiçbir console çıktısına yazılmaz · tam metin audit'te
 *   C  eşzamanlı iki düzenleme (aynı beklenen) → bir 200 + bir 409
 *   T  isimlendirme: girişi kapalı hesap metinleri "pasif" demez · düğme / açıklama / Girişi Kapat (kaynak)
 *   U  AccessMessageEditor gerçek render: HTML kaçışlanır · sayaç · önizleme · hazır mesajlar Owner metniyle birebir
 *
 * Çalıştır: npx tsx scripts/uye-pasif-f7/f7-server.harness.ts
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
// Şema yenileme (gerçek PostgREST: NOTIFY pgrst): F7 migration sonrası ilk şim adresine gelen istekler YENİ şim örneğine gider
// (ortak şim fonksiyon imzasını önbelleğe alır; sunucu istemcisi ilk URL ile tekil).
let shimRedirect: string | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.startsWith(shimUrl)) {
    if (shimRedirect && typeof input === "string") return realFetch(shimRedirect + input.slice(shimUrl.length), init);
    if (shimRedirect && input instanceof URL) return realFetch(shimRedirect + input.href.slice(shimUrl.length), init);
    return realFetch(input, init);
  }
  throw new Error(`AG ENGELLENDI (harness): ${u.slice(0, 80)}`);
}) as typeof fetch;

// Konsol yakalama (L): mesaj metni hiçbir loga yazılmamalı.
const logged: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { logged.push(a.map((x) => { try { return typeof x === "string" ? x : JSON.stringify(x); } catch { return String(x); } }).join(" ")); orig(...a); };
}

const MIG_F2 = "20280126000000_member_access_restriction.sql";
const MIG_F7 = "20280127000000_member_access_message.sql";
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
const OWNER = "00000000-0000-4000-8000-00000000f7b1";
const ADMIN2 = "00000000-0000-4000-8000-00000000f7b2";
const TOK = { owner: "zz-psf7-owner-0001", admin2: "zz-psf7-admin2-0001" };
const SECRET_MARK = "ZZ-GIZLI-ISARET-7Q";

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
  const db: TestDb = await startTestDb(port, `uye-pasif-f7s-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  let shim2: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of PRE) await su.query(readMig(f));
    await su.query(readMig(MIG_F2));
    const tenant = async (key: string) => {
      const t = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZPSF7S',$2,'active')`, [t, `zzpsf7s-${key}-${t.slice(0, 8)}`]);
      return t;
    };
    for (const [aid, sup] of [[OWNER, true], [ADMIN2, false]] as [string, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
         values ($1,$2,$3,'admin',true,'approved',$4,$5,$6, now() - interval '400 days')`,
        [aid, `ZZ_PSF7S Yönetici ${aid.slice(-2)}`, `zz.psf7s.admin.${aid.slice(-2)}@example.test`, sup, sup ? "owner" : "admin", await tenant(aid.slice(-2))],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);
    const ids: Record<string, string> = {};
    const mk = async (key: string) => {
      const uid = randomUUID();
      ids[key] = uid;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, payment_status, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',true,'approved', now() - interval '20 days','premium','premium','paid',$4,$5, now() - interval '30 days')`,
        [uid, `ZZ_PSF7S Uzman ${key}`, `zz.psf7s.${key}@example.test`, JSON.stringify({ clients: true, numerology: true }), await tenant(key)],
      );
      await su.query(`insert into public.clients(tenant_id, full_name) select tenant_id, 'ZZ Danışan' from public.users where id=$1`, [uid]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [uid, `zz-psf7s-${key}`]);
      return uid;
    };
    for (const k of ["pre", "plain", "p1", "p2", "p3", "edited", "custom", "html", "edit", "cycle", "other", "conc", "arch"]) await mk(k);

    shim = await startPgrestShim(pool);
    shimUrl = shim.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const detailRoute = await import("../../app/api/admin/users/[id]/route");
    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const { verifyUserRequest } = await import("../../lib/auth/userGuard");
    const { ACCESS_MESSAGE_PRESETS } = await import("../../lib/auth/accessRestrictionMessage");
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
    const accessOf = async (uid: string) => (await detail(uid)).json.access as { supported?: boolean; messageSupported?: boolean; message?: string | null; restrictedAt?: string | null };
    /** Uzmanın KENDİ profil ucu (açık liste) → profil; modül ucu → 403 gövdesi. */
    const profile = async (key: string) => {
      const r = await verifyUserRequest(new NextRequest("http://localhost/api/auth/profile", { headers: { "x-user-id": ids[key], "x-session-token": `zz-psf7s-${key}` } }), { includeProfile: true });
      return r.ok ? (r.profile as Record<string, unknown>) : null;
    };
    const moduleBody = async (key: string) => {
      const r = await verifyUserRequest(new NextRequest("http://localhost/api/clients", { headers: { "x-user-id": ids[key], "x-session-token": `zz-psf7s-${key}` } }));
      return r.ok ? { status: 200, text: "" } : { status: r.response.status, text: await r.response.clone().text() };
    };
    const restrictedOnly = async (key: string) => (await su.query(`select access_restricted_at r from public.users where id=$1`, [ids[key]])).rows[0];
    const dbMsg = async (key: string) => (await su.query(`select access_restriction_message m, access_restricted_at r from public.users where id=$1`, [ids[key]])).rows[0];
    const restrict = (key: string, message?: unknown, auth = asOwner) => status(ids[key], { action: "set_access", restricted: true, expectedRestricted: false, ...(message !== undefined ? { message } : {}) }, auth);
    const unrestrict = (key: string) => status(ids[key], { action: "set_access", restricted: false, expectedRestricted: true });
    const setMsg = (key: string, message: unknown, expectedMessage: unknown, auth = asOwner) => status(ids[key], { action: "set_access_message", message, expectedMessage }, auth);

    // ── F) F7 migration öncesi ───────────────────────────────────────────────
    console.log("\n[F] F7 migration öncesi (yeni kod + 20280126 şeması)");
    const fa = await accessOf(ids.pre);
    ok(fa.supported === true && fa.messageSupported === false && fa.message === null, "detay: messageSupported=false (uyarı seçeneği gizli)", fa);
    const f1 = await restrict("pre", ACCESS_MESSAGE_PRESETS[0].text);
    ok(f1.status === 409 && /henüz etkin değil/.test(String(f1.json.error)) && (await restrictedOnly("pre")).r === null, "mesajlı Pasif Yap → 409, kısıt UYGULANMAZ", f1);
    const f2 = await restrict("pre");
    ok(f2.status === 200 && (await restrictedOnly("pre")).r !== null, "mesajsız Pasif Yap AYNEN çalışır (F4 davranışı)", f2);
    const fp = await profile("pre");
    ok(fp !== null && fp.access_restriction_message === null, "profil: kolon yokken mesaj null (standart uyarı), profil ucu açık", fp?.access_restriction_message);
    ok((await unrestrict("pre")).status === 200, "Aktif Yap (migration öncesi) çalışır");
    await su.query(readMig(MIG_F7));
    shim2 = await startPgrestShim(pool); // şema yenileme
    shimRedirect = shim2.url;

    // ── P) Mesajsız ──────────────────────────────────────────────────────────
    console.log("\n[P] Mesajsız Pasif Yap");
    const p0 = await restrict("plain");
    const pp = await profile("plain");
    ok(p0.status === 200 && p0.json.messageSet === false && Boolean(pp?.access_restricted_at) && pp?.access_restriction_message === null,
      "mesajsız: kısıt var, profil mesajı null → standart uyarı");
    ok((await moduleBody("plain")).status === 403, "modül ucu 403 (kısıt kapısı aynen)");

    // ── M) Hazır / düzenlenmiş / özel / HTML ─────────────────────────────────
    console.log("\n[M] Mesajlı Pasif Yap");
    for (const [i, k] of [[0, "p1"], [1, "p2"], [2, "p3"]] as [number, string][]) {
      const r = await restrict(k, ACCESS_MESSAGE_PRESETS[i].text);
      const pr = await profile(k);
      ok(r.status === 200 && r.json.messageSet === true && pr?.access_restriction_message === ACCESS_MESSAGE_PRESETS[i].text
        && (await accessOf(ids[k])).message === ACCESS_MESSAGE_PRESETS[i].text, `hazır mesaj ${i + 1}: DB + profil + yönetici detayı aynı metin`);
    }
    const edited = ACCESS_MESSAGE_PRESETS[2].text.replace("Lütfen", `Lütfen bu hafta içinde ${SECRET_MARK}`);
    ok((await restrict("edited", edited)).status === 200 && (await profile("edited"))?.access_restriction_message === edited, "düzenlenmiş hazır mesaj");
    const custom = `Sayın uzmanımız,\nhesabınızla ilgili bilgi için ofisimizi arayınız.`;
    ok((await restrict("custom", custom + "  \r\n")).status === 200 && (await profile("custom"))?.access_restriction_message === custom, "tamamen özel, çok satırlı (normalleştirilmiş)");
    const html = `<script>alert('x')</script><img src=x onerror=alert(1)> <b>ödeme</b> & "${SECRET_MARK}"`;
    ok((await restrict("html", html)).status === 200 && (await profile("html"))?.access_restriction_message === html, "HTML / betik metni olduğu gibi saklanır (görüntüde kaçışlanır — [U])");
    const big = await restrict("other", "a".repeat(501));
    ok(big.status === 400 && (await dbMsg("other")).r === null, "501 karakter → 400; kısıt UYGULANMAZ", big);
    const ctl = await restrict("other", "zil\u0007");
    ok(ctl.status === 400 && (await dbMsg("other")).r === null, "kontrol karakteri → 400", ctl);
    const typ = await restrict("other", 42);
    ok(typ.status === 400 && (await dbMsg("other")).r === null, "metin olmayan mesaj → 400", typ);
    const unm = await status(ids.plain, { action: "set_access", restricted: false, expectedRestricted: true, message: "olmaz" });
    ok(unm.status === 400 && (await dbMsg("plain")).r !== null, "Aktif Yap + mesaj → 400, durum değişmez", unm);

    // ── E) Sonradan düzenle / kaldır ─────────────────────────────────────────
    console.log("\n[E] Düzenle / kaldır");
    await restrict("edit");
    const e1 = await setMsg("edit", ACCESS_MESSAGE_PRESETS[1].text, null);
    ok(e1.status === 200 && (await profile("edit"))?.access_restriction_message === ACCESS_MESSAGE_PRESETS[1].text, "mesajsız pasife sonradan mesaj eklendi");
    const e2 = await setMsg("edit", "İkinci yönetici güncelledi.", ACCESS_MESSAGE_PRESETS[1].text, asAdmin2);
    ok(e2.status === 200 && (await profile("edit"))?.access_restriction_message === "İkinci yönetici güncelledi.", "ikinci (ana olmayan) yönetici düzenleyebilir");
    const e3 = await setMsg("edit", "bayat", ACCESS_MESSAGE_PRESETS[1].text);
    ok(e3.status === 409 && (await profile("edit"))?.access_restriction_message === "İkinci yönetici güncelledi.", "bayat ekran → 409, değişmez", e3);
    const e4 = await setMsg("edit", null, "İkinci yönetici güncelledi.");
    ok(e4.status === 200 && (await profile("edit"))?.access_restriction_message === null && (await accessOf(ids.edit)).message === null && (await dbMsg("edit")).r !== null,
      "mesaj kaldırıldı → standart uyarı; kısıt sürüyor");
    ok((await setMsg("cycle", "x", null)).status === 409, "pasif olmayan uzmana mesaj → 409");
    ok((await setMsg("edit", "x".repeat(501), null)).status === 400, "düzenlemede 501 karakter → 400");
    ok((await setMsg("edit", "x", 5)).status === 400, "geçersiz expectedMessage → 400");
    ok((await status(OWNER, { action: "set_access_message", message: "x", expectedMessage: null })).status === 400, "kendi hesabı → 400");

    // ── X) Aktif Yap temizler ────────────────────────────────────────────────
    console.log("\n[X] Aktif Yap + yeniden pasifleştirme");
    await restrict("cycle", ACCESS_MESSAGE_PRESETS[0].text);
    ok((await unrestrict("cycle")).status === 200, "Aktif Yap 200");
    const cx = await dbMsg("cycle");
    const cp = await profile("cycle");
    ok(cx.r === null && cx.m === null && (await accessOf(ids.cycle)).message === null && cp?.access_restriction_message === null, "Aktif Yap: mesaj DB, detay ve profilden temizlendi");
    ok((await moduleBody("cycle")).status === 200, "aktif uzman modüllere erişir");
    await restrict("cycle");
    ok((await profile("cycle"))?.access_restriction_message === null, "yeniden Pasif Yap (mesajsız): ESKİ MESAJ GERİ GELMEDİ");

    // ── I) İzolasyon ─────────────────────────────────────────────────────────
    console.log("\n[I] İzolasyon");
    const other = await profile("plain");
    ok(other?.access_restriction_message === null, "başka pasif uzmanın profilinde mesaj YOK");
    const m403 = await moduleBody("html");
    ok(m403.status === 403 && !m403.text.includes(SECRET_MARK) && !m403.text.includes("<script>"), "403 gövdesi kişiye özel mesajı İÇERMEZ (standart kod/metin)", m403.text.slice(0, 200));
    const a2 = await detail(ids.html, asAdmin2);
    ok(a2.status === 200 && (a2.json.access as { message?: string }).message === html, "yönetici detayı yalnız hedef uzmanın mesajını gösterir");
    const pa = await profile("other");
    ok(pa !== null && pa.access_restriction_message === null && !pa.access_restricted_at, "aktif uzman profilinde kısıt / mesaj alanı boş");

    // ── L) Log / audit ───────────────────────────────────────────────────────
    console.log("\n[L] Log ve audit");
    const leak = logged.filter((l) => l.includes(SECRET_MARK) && !l.startsWith("  ✓") && !l.startsWith("  ✗"));
    ok(leak.length === 0, "mesaj metni hiçbir console / uygulama loguna yazılmadı", leak.slice(0, 2));
    const au = (await su.query(`select count(*)::int n from public.admin_audit_log where new_value->>'message' = $1`, [edited])).rows[0].n;
    ok(au === 1, "tam metin yalnız admin_audit_log'da (yetkili yönetici kaydı)");

    // ── C) Eşzamanlılık ──────────────────────────────────────────────────────
    console.log("\n[C] Eşzamanlılık");
    await restrict("conc", "başlangıç");
    const both = await Promise.all([setMsg("conc", "Birinci", "başlangıç"), setMsg("conc", "İkinci", "başlangıç", asAdmin2)]);
    const sts = both.map((b) => b.status).sort();
    ok(JSON.stringify(sts) === "[200,409]" && ["Birinci", "İkinci"].includes(String((await dbMsg("conc")).m)), "eşzamanlı iki düzenleme → bir 200 + bir 409", sts);
    // Arşiv
    await restrict("arch", "arşiv öncesi");
    await su.query(`select public.admin_archive_user($1,$2)`, [ids.arch, OWNER]);
    ok((await setMsg("arch", "x", "arşiv öncesi")).status === 409, "arşivdeki uzmanın mesajı düzenlenemez (409)");
    const archDetail = await detail(ids.arch);
    ok(archDetail.status === 200, "arşivdeki uzmanın detayı açılır (mesaj kayıtta korunur)");

    // ── T) İsimlendirme (kaynak) ─────────────────────────────────────────────
    console.log("\n[T] İsimlendirme");
    const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    const authSrc = ["app/api/auth/session/route.ts", "app/api/auth/mfa/complete/route.ts", "app/api/devices/enroll/route.ts", "lib/auth/yasamUser.ts"].map(read).join("\n");
    ok(!/pasif durumda/i.test(authSrc) && (authSrc.match(/Hesabınızın sisteme girişi kapalı/g) ?? []).length >= 6, "giriş / MFA / cihaz kaydı / istemci: 'pasif' yerine 'sisteme girişi kapalı' (6 yer)");
    ok(/row\.active !== true\) \{\s*return json\(\s*\{ code: "INACTIVE"/.test(read("app/api/auth/session/route.ts")), "giriş reddetme kuralı AYNEN (active !== true → 403 INACTIVE)");
    const page = read("app/admin/users/[id]/page.tsx");
    ok(!/Pasife Al ve Arşivle/.test(page) && (page.match(/>\s*Arşivle\s*</g) ?? []).length >= 2, "düğme adı: 'Arşivle' (eski 'Pasife Al ve Arşivle' yok)");
    ok(page.includes("Giriş açık, modüller kilitli") && page.includes("Sisteme giriş tamamen kapanır. Kayıtlar korunur."), "düğme açıklamaları (Pasif Yap / Arşivle)");
    ok(/usesAccessRestriction \? "Pasif Yap" : "Girişi Kapat"/.test(page), "yönetici hesabında 'Girişi Kapat'");
    ok(/const \[msgEnabled, setMsgEnabled\] = useState\(false\)/.test(page) && /setMsgEnabled\(false\); \/\/ F7: her açılışta varsayılan KAPALI/.test(page), "'Üyeye özel uyarı göster' varsayılan KAPALI ve her açılışta sıfırlanır");

    // ── U) Editör bileşeni gerçek render ─────────────────────────────────────
    console.log("\n[U] AccessMessageEditor render");
    const ed = await import("../../app/admin/users/[id]/AccessMessageEditor");
    const htmlOut = renderToStaticMarkup(createElement(ed.default, { draft: { choice: "custom", text: html }, onChange: () => undefined, idPrefix: "t" }));
    ok(!htmlOut.includes("<script>") && htmlOut.includes("&lt;script&gt;") && !/<img[^>]*onerror/.test(htmlOut), "HTML metni önizlemede KAÇIŞLANIR (çalıştırılmaz)");
    ok(/data-msg-counter[^>]*>\s*\d+(<!-- -->)?\s*\/\s*(<!-- -->)?500/.test(htmlOut), "karakter sayacı '/ 500'");
    const presetOut = renderToStaticMarkup(createElement(ed.default, { draft: ed.draftFromMessage(null), onChange: () => undefined, idPrefix: "t" }));
    ok(presetOut.includes(ACCESS_MESSAGE_PRESETS[0].text) && (presetOut.match(/data-msg-preset=/g) ?? []).length === 3 && presetOut.includes("data-msg-custom"), "3 hazır mesaj + özel seçeneği; önizleme hazır mesajı gösterir");
    const owner = [
      "Deneme süreniz sona ermiştir. Ücretli üyelik hakkında bilgi almak için lütfen sistem yöneticimizle iletişime geçiniz.",
      "Üyelik ödeme süreniz sona ermiştir. Sistemi kullanmaya devam edebilmek için lütfen sistem yöneticimizle iletişime geçiniz.",
      "Gecikmiş üyelik ödemeleriniz bulunmaktadır. Lütfen sistem yöneticimizle iletişime geçiniz.",
    ];
    ok(JSON.stringify(ACCESS_MESSAGE_PRESETS.map((p) => p.text)) === JSON.stringify(owner), "hazır mesajlar Owner metniyle BİREBİR");
    const over = renderToStaticMarkup(createElement(ed.default, { draft: { choice: "custom", text: "ç".repeat(501) }, onChange: () => undefined, idPrefix: "t" }));
    ok(over.includes("en fazla 500 karakter"), "500 aşımı görünür uyarı");
    ok(ed.draftResult({ choice: "custom", text: "   " }).ok && (ed.draftResult({ choice: "custom", text: "   " }) as { value: unknown }).value === null, "boş metin → null (standart uyarı)");
    const cnt = (await su.query(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c`)).rows[0];
    ok(cnt.u === 15 && cnt.c === 13, "hiçbir kullanıcı / danışan satırı silinmedi", cnt);
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    if (shim2) await shim2.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * KİŞİSEL DİJİTAL OFİS (P1) — ROUTE + GÜVENLİK HARNESS
 * Gerçek Next route handler'ları + gerçek migration (20271227000000) + yerel embedded-postgres + PostgREST şimi
 * (scripts/anamnez/testEnv — yalnız içe aktarılır, değiştirilmez). Production'a SIFIR temas (127.0.0.1); veriler sentetik.
 *
 * Kapsam: bayrak kapalı 404, kimlik, tenant izolasyonu, başka uzmanın satırı, demo hesap + demo tenant yazma engeli,
 * şema doğrulama (bilinmeyen alan, dosya yolu/URL, varlık kimliği, kontrol karakteri, boyut), 409 sürüm çakışması
 * (sıralı + eşzamanlı), en fazla 10 geçmiş, Favorilerim ≤ 8, bilinmeyen modül anahtarı, tasarım sıfırlamanın tercihleri
 * korunması, modül yetkisinin değişmemesi, varsayılan (kayıt yok) davranışı, okunamayan eski kaydın yazmada korunması.
 * Çalıştır: npx tsx scripts/workspace/routes.harness.ts
 */
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

type Auth = { id?: string; token?: string };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest) => Promise<Response>;

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations/20271227000000_expert_workspace_designs_prefs.sql"), "utf8");
// P2: tasarım ucu görsel sahipliğini expert_workspace_assets'te doğrular → P2 migration'ı da uygulanır.
const MIGRATION_P2 = readFileSync(path.join(process.cwd(), "supabase/migrations/20271228000000_expert_workspace_assets_access.sql"), "utf8");

const design = (title = "Hoş geldiniz", extra: Json = {}) => ({
  layout: "B",
  text: { useGreeting: false, showDate: true, align: "right", valign: "center", lines: [{ id: "l1", role: "title", text: title, size: 44, color: "auto" }] },
  bg: { mode: "theme", theme: "lavanta", overlay: 0.5, tone: "light", scope: "page", pageAttach: "fixed" },
  ...extra,
});
const prefs = (extra: Json = {}) => ({
  hiddenModules: ["center:stok", "module:cupping"],
  favorites: ["module:human_design", "module:numerology", "module:client_journey"],
  cardLevel: "module", viewMode: "night", reading: { scale: 1.2, lineHeight: 1.8, width: 58 },
  ...extra,
});

/**
 * Boş TCP portu (işletim sistemi atar). Sabit port (5447x), CI makinesinin geçici giden bağlantı aralığında (Linux 32768–60999)
 * olduğundan başka bir bağlantıca tutulabiliyor → embedded-postgres dinleyemez, test ECONNREFUSED ile düşer.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("boş port alınamadı"))));
    });
  });
}

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: await freePort(), dirName: "kdo-workspace-routes-pgdata", extraSql: [MIGRATION, MIGRATION_P2] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  // P2 kullanıcı bazlı açılış: bu harness P1 davranışını sınar → herkese açık kip. Owner / izin listesi / varsayılan kapalı
  // davranışı scripts/workspace/assets.harness.ts'te ayrıca doğrulanır.
  process.env.EXPERT_WORKSPACE_ROLLOUT_ALL = "true";
  const seed: Seed = await seedAnamnez(env.su);
  // Demo vitrini prod'daki gibi KENDİ tenant'ında olsun (anamnez tohumu DEMO'yu A tenant'ına koyar; yalnız bu süreçte taşınır).
  const TD = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ_KDO_DEMO_TENANT')`, [TD]);
  await env.su.query(`update public.users set tenant_id=$1 where id=$2`, [TD, seed.users.DEMO.id]);
  const demoMate = randomUUID();
  const demoMateTok = `zz-kdo-tok-demomate-${demoMate.slice(0, 8)}`;
  await env.su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,'ZZ_KDO_DEMO_MATE','zz.kdo.demomate@example.test','expert',true,'approved','{"clients":true}','premium','premium',$2,false)`,
    [demoMate, TD],
  );
  await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [demoMate, demoMateTok]);
  console.log(`embedded-postgres + PostgREST şimi hazır (${env.url}).`);

  try {
    const designRoute = await import("../../app/api/settings/workspace/design/route");
    const prefsRoute = await import("../../app/api/settings/workspace/prefs/route");
    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asA2: Auth = { id: U.A2.id, token: U.A2.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };

    async function call(handler: unknown, method: string, auth: Auth, body?: unknown, rawBody?: string): Promise<{ status: number; json: Json }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined || rawBody !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest("http://localhost/api/settings/workspace/test", {
        method, headers, body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
      const errBefore = env.stats.errors;
      const res = await (handler as Handler)(req);
      if (env.stats.errors !== errBefore) console.error(`  ! PostgREST hata: ${method} ${res.status} ${JSON.stringify(body ?? rawBody ?? "").slice(0, 160)}`);
      let json: Json = {};
      try { json = (await res.clone().json()) as Json; } catch { json = {}; }
      return { status: res.status, json };
    }
    const dget = (a: Auth) => call(designRoute.GET, "GET", a);
    const dpost = (a: Auth, body: unknown) => call(designRoute.POST, "POST", a, body);
    const pget = (a: Auth) => call(prefsRoute.GET, "GET", a);
    const pput = (a: Auth, body: unknown) => call(prefsRoute.PUT, "PUT", a, body);
    const dRow = async (userId: string) => (await env.su.query(`select * from public.expert_workspace_designs where user_id=$1`, [userId])).rows[0];
    const pRow = async (userId: string) => (await env.su.query(`select * from public.expert_ui_prefs where user_id=$1`, [userId])).rows[0];
    const countAll = async () => Number((await env.su.query(`select (select count(*) from public.expert_workspace_designs) + (select count(*) from public.expert_ui_prefs) n`)).rows[0].n);
    const userSnap = async (id: string) => JSON.stringify((await env.su.query(`select * from public.users where id=$1`, [id])).rows[0]);

    section("Bayrak kapalı → uç yok");
    delete process.env.EXPERT_WORKSPACE_DESIGN_ENABLED;
    ok((await dget(asA)).status === 404, "bayrak kapalı: GET design 404");
    ok((await dpost(asA, { action: "saveDraft", expectedVersion: 0, draft: design() })).status === 404, "bayrak kapalı: POST design 404");
    ok((await pput(asA, { expectedVersion: 0, prefs: prefs() })).status === 404, "bayrak kapalı: PUT prefs 404");
    ok((await countAll()) === 0, "bayrak kapalıyken hiçbir satır yazılmadı");
    process.env.EXPERT_WORKSPACE_DESIGN_ENABLED = "true";

    section("Kimlik");
    ok([401, 403].includes((await dget({})).status), "oturumsuz GET → 401/403");
    ok([401, 403].includes((await dpost({}, { action: "reset", expectedVersion: 0 })).status), "oturumsuz POST → 401/403");
    ok([401, 403].includes((await dget({ id: U.A.id, token: U.B.token })).status), "A kimliği + B oturumu (sahte başlık) → reddedildi");
    ok([401, 403].includes((await dget({ id: U.A.id, token: "zz-yanlis" })).status), "geçersiz oturum → reddedildi");
    ok((await dget({ id: U.PENDING.id, token: U.PENDING.token })).status === 403, "onay bekleyen hesap → 403");
    ok((await dget({ id: U.REJECTED.id, token: U.REJECTED.token })).status === 403, "reddedilmiş hesap → 403");

    section("Varsayılan davranış (kayıt yok)");
    const g0 = await dget(asA);
    ok(g0.status === 200 && g0.json.design.applied === null && g0.json.design.draft === null && g0.json.design.version === 0 && g0.json.design.history.length === 0,
      "kayıt yok: applied=null (mevcut ana sayfa aynen), version 0", g0.json);
    const p0 = await pget(asA);
    ok(p0.status === 200 && p0.json.prefs.version === 0 && p0.json.prefs.viewMode === "auto" && p0.json.prefs.cardLevel === "center"
      && p0.json.prefs.favorites.length === 0 && p0.json.prefs.hiddenModules.length === 0, "kayıt yok: varsayılan tercihler", p0.json);
    ok((await countAll()) === 0, "GET satır oluşturmaz");

    section("Taslak / uygula / geri dön / geçmiş");
    const s1 = await dpost(asA, { action: "saveDraft", expectedVersion: 0, draft: design("Taslak 1") });
    ok(s1.status === 200 && s1.json.design.version === 1 && s1.json.design.draft?.text.lines[0].text === "Taslak 1" && s1.json.design.applied === null,
      "taslak kaydı: aktif görünüm değişmez (applied=null)", s1.json);
    const stale = await dpost(asA, { action: "saveDraft", expectedVersion: 0, draft: design("Eski sekme") });
    ok(stale.status === 409 && stale.json.code === "VERSION_CONFLICT" && stale.json.design.version === 1, "eski sürümle yazma → 409 + güncel durum", stale.json);
    ok((await dRow(U.A.id)).draft.text.lines[0].text === "Taslak 1", "409 sonrası veri değişmedi");
    const [c1, c2] = await Promise.all([
      dpost(asA, { action: "saveDraft", expectedVersion: 1, draft: design("Sekme 1") }),
      dpost(asA, { action: "saveDraft", expectedVersion: 1, draft: design("Sekme 2") }),
    ]);
    ok([c1.status, c2.status].sort().join(",") === "200,409", "eşzamanlı iki sekme: biri 200, diğeri 409", [c1.status, c2.status]);
    const v2 = (await dget(asA)).json.design.version;
    ok(v2 === 2, "eşzamanlı yazmadan sonra sürüm tam 1 arttı", v2);
    const ap = await dpost(asA, { action: "apply", expectedVersion: v2 });
    ok(ap.status === 200 && ap.json.design.applied !== null && ap.json.design.draft === null && ap.json.design.history.length === 0, "uygula: taslak aktif oldu, ilk uygulamada geçmiş boş", ap.json);
    ok((await dpost(asA, { action: "apply", expectedVersion: ap.json.design.version })).status === 400, "taslak yokken uygula → 400");
    const dis1 = await dpost(asA, { action: "saveDraft", expectedVersion: ap.json.design.version, draft: design("Vazgeçilecek") });
    const dis2 = await dpost(asA, { action: "discardDraft", expectedVersion: dis1.json.design.version });
    ok(dis2.status === 200 && dis2.json.design.draft === null && dis2.json.design.applied.text.lines[0].text === ap.json.design.applied.text.lines[0].text, "taslaktan vazgeç: uygulanan aynen kalır");
    let ver = dis2.json.design.version;
    for (let i = 1; i <= 12; i++) {
      const r = await dpost(asA, { action: "apply", expectedVersion: ver, draft: design(`Tasarım ${i}`) });
      ver = r.json.design?.version ?? ver;
      if (r.status !== 200) ok(false, `uygula ${i}`, r.json);
    }
    const afterMany = (await dget(asA)).json.design;
    ok(afterMany.history.length === 10 && (await dRow(U.A.id)).history.length === 10, "13 uygulama sonrası geçmiş en fazla 10", afterMany.history.length);
    ok(afterMany.applied.text.lines[0].text === "Tasarım 12" && afterMany.history[0].design.text.lines[0].text === "Tasarım 11", "geçmiş en yeniden eskiye sıralı");
    const target = afterMany.history[3];
    const ld = await dpost(asA, { action: "loadHistory", expectedVersion: ver, historyId: target.id });
    ok(ld.status === 200 && ld.json.design?.draft?.text.lines[0].text === target.design.text.lines[0].text && ld.json.design?.applied?.text.lines[0].text === "Tasarım 12", "geçmişi taslağa yükle: aktif görünüm değişmez", { r: ld.json, id: target?.id });
    ver = ld.json.design.version;
    const rs = await dpost(asA, { action: "restore", expectedVersion: ver, historyId: target.id });
    ok(rs.status === 200 && rs.json.design.applied.text.lines[0].text === target.design.text.lines[0].text && rs.json.design.history.length === 10
      && rs.json.design.history[0].design.text.lines[0].text === "Tasarım 12" && !rs.json.design.history.some((h: Json) => h.id === target.id), "önceki tasarıma dön: seçilen aktif, önceki aktif geçmişe, toplam ≤ 10");
    ver = rs.json.design.version;
    ok((await dpost(asA, { action: "restore", expectedVersion: ver, historyId: randomUUID() })).status === 400, "olmayan geçmiş kimliği → 400");

    section("Kontrast kapısı (sunucu; Owner kararı 1)");
    const lowC = design("Beyaz yazı", { text: { useGreeting: false, lines: [{ id: "l1", role: "body", text: "Beyaz yazı", size: 16, color: "#ffffff" }] } });
    const appliedBeforeC = JSON.stringify((await dRow(U.A.id)).applied);
    const c422 = await dpost(asA, { action: "apply", expectedVersion: ver, draft: lowC });
    ok(c422.status === 422 && c422.json.code === "CONTRAST_INSUFFICIENT" && c422.json.issues?.[0]?.path === "design.text.lines[0]" && c422.json.issues[0].need === 4.5,
      "düşük kontrastlı tasarım uygulanamaz → 422 + sorun listesi", c422.json);
    ok(JSON.stringify((await dRow(U.A.id)).applied) === appliedBeforeC && (await dget(asA)).json.design.version === ver, "422 sonrası aktif tasarım ve sürüm değişmedi");
    const cDraft = await dpost(asA, { action: "saveDraft", expectedVersion: ver, draft: lowC });
    ok(cDraft.status === 200, "düşük kontrastlı tasarım TASLAK olarak kaydedilebilir (düzeltme için)");
    ver = cDraft.json.design.version;
    ok((await dpost(asA, { action: "apply", expectedVersion: ver })).status === 422, "kayıtlı düşük kontrastlı taslak da uygulanamaz");
    const badBrand = design("x", { brand: { accent: "#7c3aed", soft: "#f4effd", ink: "#d8d0f0" } });
    ok((await dpost(asA, { action: "apply", expectedVersion: ver, draft: badBrand })).status === 422, "soluk marka koyu yazısı → 422");
    const fixedC = design("Düzeltildi", { text: { useGreeting: false, lines: [{ id: "l1", role: "body", text: "Düzeltildi", size: 16, color: "#17142b" }] } });
    const cOk = await dpost(asA, { action: "apply", expectedVersion: ver, draft: fixedC });
    ok(cOk.status === 200 && cOk.json.design.applied.text.lines[0].text === "Düzeltildi", "düzeltilen tasarım uygulanır");
    ver = cOk.json.design.version;
    // Eski / dışarıdan gelmiş düşük kontrastlı geçmiş kaydı: "önceki tasarıma dön" de aynı kapıdan geçer.
    const lowHist = { id: randomUUID(), savedAt: "2026-10-01T00:00:00.000Z", design: { ...lowC } };
    await env.su.query(`update public.expert_workspace_designs set history = $2::jsonb || (history - 9), version = version + 1 where user_id=$1`, [U.A.id, JSON.stringify([lowHist])]);
    ver += 1;
    const rh = await dpost(asA, { action: "restore", expectedVersion: ver, historyId: lowHist.id });
    ok(rh.status === 422 && (await dget(asA)).json.design.applied.text.lines[0].text === "Düzeltildi", "düşük kontrastlı geçmişe dönüş → 422, aktif değişmez");
    const lh = await dpost(asA, { action: "loadHistory", expectedVersion: ver, historyId: lowHist.id });
    ok(lh.status === 200 && lh.json.design.draft.text.lines[0].color === "#ffffff", "aynı geçmiş taslağa yüklenebilir (düzeltmek için)");
    ver = lh.json.design.version;

    section("Tercihler (tasarımdan bağımsız) + sıfırlama");
    const pp1 = await pput(asA, { expectedVersion: 0, prefs: prefs() });
    ok(pp1.status === 200 && pp1.json.prefs.version === 1 && pp1.json.prefs.favorites.length === 3, "tercih kaydı", pp1.json);
    ok((await pput(asA, { expectedVersion: 0, prefs: prefs() })).status === 409, "tercih: eski sürüm → 409");
    const [q1, q2] = await Promise.all([pput(asA, { expectedVersion: 1, prefs: prefs({ viewMode: "day" }) }), pput(asA, { expectedVersion: 1, prefs: prefs({ viewMode: "focus" }) })]);
    ok([q1.status, q2.status].sort().join(",") === "200,409", "tercih: eşzamanlı iki sekme → 200 + 409", [q1.status, q2.status]);
    const prefsBefore = JSON.stringify(await pRow(U.A.id));
    const appliedBeforeReset = (await dget(asA)).json.design.applied;
    ok(appliedBeforeReset !== null, "sıfırlama öncesi aktif özel tasarım var");
    const rst = await dpost(asA, { action: "reset", expectedVersion: ver });
    ok(rst.status === 200 && rst.json.design.applied === null && rst.json.design.draft === null && JSON.stringify(rst.json.design.history[0].design) === JSON.stringify(appliedBeforeReset),
      "Tasarımımı sıfırla: görsel tasarım varsayılana döner, eski tasarım geçmişte", rst.json);
    ok(JSON.stringify(await pRow(U.A.id)) === prefsBefore, "sıfırlama: gizlenen modüller ve Favorilerim AYNEN korunur");
    ver = rst.json.design.version;
    const designBefore = JSON.stringify((await dRow(U.A.id)));
    const pv = (await pget(asA)).json.prefs.version;
    await pput(asA, { expectedVersion: pv, prefs: prefs({ favorites: ["module:stones"] }) });
    ok(JSON.stringify(await dRow(U.A.id)) === designBefore, "tercih değişikliği tasarım/taslak satırını değiştirmez");

    section("Modül yetkisi değişmez");
    const permBefore = await userSnap(U.A.id);
    const allHidden = ["center:clients", "center:yasam_hafizasi", "center:energy_body", "center:sifa_rehberi", "center:digital_content", "center:numerology", "center:stok"];
    const pv2 = (await pget(asA)).json.prefs.version;
    const hideAll = await pput(asA, { expectedVersion: pv2, prefs: prefs({ hiddenModules: allHidden, favorites: [] }) });
    ok(hideAll.status === 200 && hideAll.json.prefs.hiddenModules.length === 7, "tüm merkezleri gizle → 200");
    ok((await userSnap(U.A.id)) === permBefore, "gizleme sonrası users satırı (module_permissions dahil) birebir aynı");
    const { requireModuleAccess } = await import("../../lib/auth/userGuard");
    const ma = await requireModuleAccess(new NextRequest("http://localhost/api/x", { headers: { "x-user-id": U.A.id, "x-session-token": U.A.token } }), "clients");
    ok(ma.ok === true, "gizlenen 'clients' merkezi için sunucu erişim kararı hâlâ İZİNLİ (yetki değil tercih)");

    section("Şema doğrulama");
    const bad = async (label: string, body: unknown, code = 400) => {
      const before = await countAll();
      const r = await dpost(asA2, body);
      ok(r.status === code && (await countAll()) === before, `${label} → ${code}, yazma yok`, r.json);
    };
    await bad("bilinmeyen üst alan (user_id)", { action: "saveDraft", expectedVersion: 0, draft: design(), user_id: U.B.id });
    await bad("bilinmeyen üst alan (tenant_id)", { action: "saveDraft", expectedVersion: 0, draft: design(), tenant_id: seed.TB });
    await bad("taslakta bilinmeyen alan", { action: "saveDraft", expectedVersion: 0, draft: { ...design(), hacker: 1 } });
    await bad("logo dosya yolu (src)", { action: "saveDraft", expectedVersion: 0, draft: design("x", { logo: { src: "/storage/v1/object/public/logo.png" } }) });
    await bad("fotoğraf URL'si", { action: "saveDraft", expectedVersion: 0, draft: design("x", { bg: { mode: "photo", photo: { src: "https://evil.example/a.jpg" } } }) });
    await bad("sahibi olmayan varlık kimliği (P2: sahiplik doğrulaması)", { action: "saveDraft", expectedVersion: 0, draft: design("x", { logo: { assetId: randomUUID() } }) });
    await bad("fotoğraf modu görselsiz", { action: "saveDraft", expectedVersion: 0, draft: design("x", { bg: { mode: "photo" } }) });
    await bad("geçersiz düzen", { action: "saveDraft", expectedVersion: 0, draft: { ...design(), layout: "D" } });
    await bad("geçersiz renk", { action: "saveDraft", expectedVersion: 0, draft: design("x", { text: { lines: [{ id: "a", role: "title", text: "x", color: "red;background:url(x)" }] } }) });
    await bad("kontrol karakteri", { action: "saveDraft", expectedVersion: 0, draft: design("a\u0000b") });
    await bad("yön işareti (RLO)", { action: "saveDraft", expectedVersion: 0, draft: design("a\u202Eb") });
    await bad("300 karakter üstü satır", { action: "saveDraft", expectedVersion: 0, draft: design("x".repeat(301)) });
    await bad("11 satır", { action: "saveDraft", expectedVersion: 0, draft: design("x", { text: { lines: Array.from({ length: 11 }, (_, i) => ({ id: `l${i}`, role: "body", text: "x" })) } }) });
    await bad("aralık dışı katman", { action: "saveDraft", expectedVersion: 0, draft: design("x", { bg: { overlay: 5 } }) });
    await bad("NaN/metin sayı", { action: "saveDraft", expectedVersion: 0, draft: design("x", { bg: { zoom: "2" } }) });
    await bad("marka teması paletsiz", { action: "saveDraft", expectedVersion: 0, draft: design("x", { bg: { mode: "theme", theme: "marka" } }) });
    await bad("geçersiz işlem", { action: "dropTable", expectedVersion: 0 });
    await bad("negatif sürüm", { action: "saveDraft", expectedVersion: -1, draft: design() });
    await bad("kesirli sürüm", { action: "saveDraft", expectedVersion: 1.5, draft: design() });
    await bad("geçersiz geçmiş kimliği", { action: "restore", expectedVersion: 0, historyId: "../../etc" });
    await bad("taslak almayan işleme taslak", { action: "reset", expectedVersion: 0, draft: design() });
    const big = await call(designRoute.POST, "POST", asA2, undefined, JSON.stringify({ action: "saveDraft", expectedVersion: 0, draft: design("x".repeat(60_000)) }));
    ok(big.status === 413, "48 KB üstü gövde → 413", big.status);
    const badJson = await call(designRoute.POST, "POST", asA2, undefined, "{bozuk");
    ok(badJson.status === 400, "bozuk JSON → 400");
    const arrJson = await call(designRoute.POST, "POST", asA2, undefined, "[1,2]");
    ok(arrJson.status === 400, "dizi gövde → 400");
    const pbad = async (label: string, p: unknown) => {
      const r = await pput(asA2, { expectedVersion: 0, prefs: p });
      ok(r.status === 400 && !(await pRow(U.A2.id)), `tercih: ${label} → 400, yazma yok`, r.json);
    };
    await pbad("bilinmeyen modül anahtarı", prefs({ hiddenModules: ["module:yonetici_paneli"] }));
    await pbad("ham yetki anahtarı (önek yok)", prefs({ hiddenModules: ["clients"] }));
    await pbad("9 favori", prefs({ favorites: ["module:client_journey", "module:appointments", "module:yasam_hafizasi", "module:energy_body", "module:reflexology", "module:cupping", "module:stones", "module:stone_library", "module:aromatherapy"] }));
    await pbad("tekrarlanan favori", prefs({ favorites: ["module:stones", "module:stones"] }));
    await pbad("favoride merkez anahtarı", prefs({ favorites: ["center:stok"] }));
    await pbad("geçersiz görünüm modu", prefs({ viewMode: "neon" }));
    await pbad("okuma ölçeği aralık dışı", prefs({ reading: { scale: 3, lineHeight: 1.7, width: 68 } }));
    await pbad("eksik alan", { hiddenModules: [], favorites: [] });
    const p8 = await pput(asA2, { expectedVersion: 0, prefs: prefs({ favorites: ["module:client_journey", "module:appointments", "module:yasam_hafizasi", "module:energy_body", "module:reflexology", "module:cupping", "module:stones", "module:stone_library"] }) });
    ok(p8.status === 200 && p8.json.prefs.favorites.length === 8 && p8.json.prefs.favorites[0] === "module:client_journey", "8 favori kabul, sıra korunur");
    const pExtra = await pput(asA2, { expectedVersion: 1, prefs: prefs(), user_id: U.A.id });
    ok(pExtra.status === 400, "tercih: gövdede user_id → 400");

    section("Tenant izolasyonu / başka uzman");
    const aBefore = JSON.stringify(await dRow(U.A.id));
    const aPrefsBefore = JSON.stringify(await pRow(U.A.id));
    const gB = await dget(asB);
    ok(gB.status === 200 && gB.json.design.version === 0 && gB.json.design.applied === null, "B, A'nın tasarımını görmez (kendi boş kaydı)");
    ok((await pget(asB)).json.prefs.version === 0, "B, A'nın tercihlerini görmez");
    const aVer = (await dget(asA)).json.design.version;
    const bw = await dpost(asB, { action: "saveDraft", expectedVersion: aVer, draft: design("B saldırı") });
    ok(bw.status === 409 && bw.json.design.version === 0, "B, A'nın sürüm numarasıyla yazamaz (kendi satırına bakılır → 409)");
    const bw2 = await dpost(asB, { action: "saveDraft", expectedVersion: 0, draft: design("B kendi") });
    ok(bw2.status === 200 && (await dRow(U.B.id)).tenant_id === seed.TB, "B kendi satırını kendi tenant'ında oluşturur");
    const a2w = await dpost(asA2, { action: "saveDraft", expectedVersion: 0, draft: design("A2 kendi") });
    ok(a2w.status === 200 && (await dRow(U.A2.id)).user_id === U.A2.id, "aynı tenant'taki başka uzman (A2) ayrı satır");
    ok(JSON.stringify(await dRow(U.A.id)) === aBefore && JSON.stringify(await pRow(U.A.id)) === aPrefsBefore, "A'nın satırları B/A2 işlemlerinden sonra birebir aynı");
    ok((await dget(asA2)).json.design.draft.text.lines[0].text === "A2 kendi" && (await dget(asA)).json.design.applied === null, "A2 ve A birbirinin taslağını görmez");

    section("Demo hesap / demo tenant");
    const demo: Auth = { id: U.DEMO.id, token: U.DEMO.token };
    const before = await countAll();
    const dw = await dpost(demo, { action: "saveDraft", expectedVersion: 0, draft: design() });
    ok(dw.status === 403 && dw.json.code === "DEMO_READONLY", "demo hesap tasarım yazma → 403 DEMO_READONLY", dw.json);
    ok((await pput(demo, { expectedVersion: 0, prefs: prefs() })).status === 403, "demo hesap tercih yazma → 403");
    const mate = await dpost({ id: demoMate, token: demoMateTok }, { action: "saveDraft", expectedVersion: 0, draft: design() });
    ok(mate.status === 403, "demo tenant'taki demo olmayan kullanıcı → 403");
    ok((await countAll()) === before, "demo isteklerinden sonra satır sayısı değişmedi");
    ok((await dget(demo)).status === 200, "demo hesap okuyabilir (varsayılan görünüm)");

    section("Okunamayan eski kayıt korunur");
    const legacy = { id: "legacy-1", savedAt: "2026-01-01T00:00:00.000Z", design: { layout: "Z", futureField: true } };
    await env.su.query(`update public.expert_workspace_designs set history = history || $2::jsonb, version = version + 1 where user_id=$1`, [U.A2.id, JSON.stringify([legacy])]);
    const g2 = (await dget(asA2)).json.design;
    ok(!g2.history.some((h: Json) => h.id === "legacy-1"), "bugünkü şemaya uymayan geçmiş gösterilmez");
    const sv = await dpost(asA2, { action: "saveDraft", expectedVersion: g2.version, draft: design("A2 yeni") });
    ok(sv.status === 200 && (await dRow(U.A2.id)).history.some((h: Json) => h.id === "legacy-1"), "yazma sonrası okunamayan eski kayıt veritabanında KORUNUR (silinmez)");

    section("Yedek / geri yükleme (gerçek motor: lib/backup/engine)");
    const { exportTableAll, restoreChunk } = await import("../../lib/backup/engine");
    const { getRegistryEntry, isRestorable } = await import("../../lib/backup/registry");
    const { getServerDb } = await import("../../lib/supabase-server");
    const sdb = getServerDb();
    const ctxOf = (userId: string, tenantId: string) => ({ tenantId, userId, role: "expert", modulePermissions: { clients: true }, membershipActive: true });
    const eD = getRegistryEntry("expert_workspace_designs")!;
    const eP = getRegistryEntry("expert_ui_prefs")!;
    ok(!!eD && !!eP && isRestorable(eD) && isRestorable(eP) && eD.naturalKey === "user_id" && eP.naturalKey === "user_id", "iki tablo yedek kapsamında, geri yüklenebilir, doğal anahtar user_id");
    const expD = await exportTableAll(sdb, eD, seed.TA);
    const expP = await exportTableAll(sdb, eP, seed.TA);
    ok(expD.complete && expD.rows.length === 2 && expD.rows.every((r) => r.tenant_id === seed.TA), "A tenant'ı dışa aktarma: yalnız kendi 2 tasarım satırı (A, A2), tam", { n: expD.rows.length, e: expD.error });
    ok(expP.complete && expP.rows.every((r) => r.tenant_id === seed.TA), "tercih dışa aktarma yalnız A tenant'ı");
    const expB = await exportTableAll(sdb, eD, seed.TB);
    ok(expB.rows.length === 1 && expB.rows[0].user_id === U.B.id, "B tenant'ı dışa aktarma A satırlarını içermez");
    // Mevcut satır EZİLMEZ (A'nın tasarımı yedekten sonra değişmiş olabilir; geri yükleme yalnız eksik satırı ekler).
    const aNow = await dpost(asA, { action: "saveDraft", expectedVersion: (await dget(asA)).json.design.version, draft: design("Yedekten sonra") });
    ok(aNow.status === 200, "yedekten sonra A yeni taslak kaydetti");
    const aRowNow = JSON.stringify(await dRow(U.A.id));
    const aPrefNow = JSON.stringify(await pRow(U.A.id));
    const r1 = await restoreChunk(sdb, ctxOf(U.A.id, seed.TA), "expert_workspace_designs", expD.rows);
    const r1p = await restoreChunk(sdb, ctxOf(U.A.id, seed.TA), "expert_ui_prefs", expP.rows);
    ok(r1.inserted === 0 && r1.failed.length === 0 && JSON.stringify(await dRow(U.A.id)) === aRowNow, "geri yükleme mevcut tasarımı EZMEZ (eklenen 0, satır birebir aynı)", r1);
    ok(r1p.inserted === 0 && JSON.stringify(await pRow(U.A.id)) === aPrefNow, "geri yükleme mevcut tercihleri EZMEZ");
    // Kayıp senaryosu (yalnız sentetik test verisi; süper kullanıcıyla silinir): A2'nin satırı yok → yedekten döner.
    const a2Before = await dRow(U.A2.id);
    await env.su.query(`delete from public.expert_workspace_designs where user_id=$1`, [U.A2.id]);
    const r2 = await restoreChunk(sdb, ctxOf(U.A2.id, seed.TA), "expert_workspace_designs", expD.rows);
    const a2After = await dRow(U.A2.id);
    ok(r2.inserted === 1 && a2After?.id === a2Before.id && a2After.tenant_id === seed.TA && a2After.user_id === U.A2.id, "kayıp satır yedekten geri gelir (aynı kimlik, aynı tenant/kullanıcı)", r2);
    ok(JSON.stringify(a2After.history) === JSON.stringify(a2Before.history) && JSON.stringify(a2After.draft) === JSON.stringify(a2Before.draft), "geri yüklenen satırda geçmiş ve taslak KAYBOLMAZ (okunamayan eski kayıt dahil)");
    ok(JSON.stringify(await dRow(U.A.id)) === aRowNow, "A2 geri yüklemesi A'nın satırına dokunmaz");
    const g2r = await dget(asA2);
    ok(g2r.status === 200 && g2r.json.design.version === a2Before.version, "geri yüklenen kayıt API'den okunur, sürüm korunur");
    // Tenant izolasyonu: A tenant'ının yedeği B tarafından yüklenemez.
    const bRowBefore = JSON.stringify(await dRow(U.B.id));
    const r3 = await restoreChunk(sdb, ctxOf(U.B.id, seed.TB), "expert_workspace_designs", expD.rows);
    ok(r3.inserted === 0 && r3.failed.some((f) => f.code === "id_conflict_other_tenant") && JSON.stringify(await dRow(U.B.id)) === bRowBefore, "başka tenant'ın yedeği yüklenemez (id_conflict_other_tenant), B satırı aynı", r3.failed);
    ok(Number((await env.su.query(`select count(*) n from public.expert_workspace_designs where tenant_id=$1`, [seed.TB])).rows[0].n) === 1, "B tenant'ında yabancı satır oluşmadı");
    // Kötü niyetli / elle düzenlenmiş yedek: tenant/kullanıcı zorlanır, geçersiz tasarım gösterilmez.
    await env.su.query(`delete from public.expert_workspace_designs where user_id=$1`, [U.A2.id]);
    const crafted = { id: randomUUID(), tenant_id: seed.TB, user_id: U.B.id, applied: { layout: "A", logo: { src: "https://evil.example/x.png" } }, draft: null, history: [], schema_version: 1, version: 7 };
    const r4 = await restoreChunk(sdb, ctxOf(U.A2.id, seed.TA), "expert_workspace_designs", [crafted]);
    const cr = await dRow(U.A2.id);
    ok(r4.inserted === 1 && cr.tenant_id === seed.TA && cr.user_id === U.A2.id, "elle düzenlenmiş yedek: tenant_id / user_id sunucuda oturuma zorlanır", { r4: r4.failed, t: cr?.tenant_id });
    const gc = await dget(asA2);
    ok(gc.status === 200 && gc.json.design.applied === null && JSON.stringify(cr.applied).includes("evil"), "şemaya uymayan (dosya yolu içeren) tasarım gösterilmez; veri silinmez");
    const fix = await dpost(asA2, { action: "saveDraft", expectedVersion: gc.json.design.version, draft: design("Toparlandı") });
    ok(fix.status === 200 && fix.json.design.draft.text.lines[0].text === "Toparlandı", "geri yüklenen kayıttan sonra uzman normal çalışmaya devam eder");

    section("Silme ucu yok");
    ok(!("DELETE" in designRoute) && !("DELETE" in prefsRoute), "tasarım/tercih için DELETE ucu yok");
    ok(env.stats.errors === 0, "PostgREST şiminde beklenmeyen hata yok", env.stats);
  } finally {
    await env.stop();
  }

  console.log(`\nworkspace routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

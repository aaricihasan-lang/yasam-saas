/**
 * HD Eğitmene Özel Eğitim Haritaları (FAZ 6) — ERİŞİM / İZOLASYON / İZİN / SİLME testi.
 * İzole embedded-postgres + PostgREST shim + GERÇEK migration'lar + GERÇEK route'lar. Prod/Preview'a SIFIR temas; tüm kişiler,
 * danışanlar, haritalar ve izinler SENTETİK (ZZ_*); Roxy / dış ağ çağrısı YOK (fetch kilidi sayar ve reddeder).
 * Kapsam: hazırlık kapısı · owner anahtarı · 2 eğitmen (10 + 20 kayıt) + 98 diğer uzman · ID tahmini · çapraz düzenleme / silme ·
 * owner global yönetim · normal admin red · yetki iptali · rol / tenant değişimi · demo / pasif / paket düşmüş / HD izni kapalı ·
 * eski / sahte oturum · kaynak danışan / harita silinmesi ve değişmesi · izin geri çekme · eski bağlantı · mükerrer (eşzamanlı) ekleme ·
 * başka eğitmen adına ekleme · hatalı izin · bozuk kanıt · fiziksel veri temizliği · merkezî katalogla ayrım · tek tip 404 + no-store.
 * Çalıştır: npx tsx scripts/hd-education/private/private-harness.ts   (HD_EDU_PRIV_PG_PORT, varsayılan 54741)
 */
import "../../hd-analysis-word-flow/env";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { privateArchiveSql, PRIVATE_RPCS } from "./pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";

// Gerçek biçimli SENTETİK harita (repo fixture → gerçek doğrulama/normalizasyon); her kayıt kendi n işaretiyle ayrışır.
const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Who = { id: string; token: string; tenant: string; label: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null; headers: Headers };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Auth = { kind: "user" | "admin"; id?: string; token?: string } | null;

async function call(h: Handler, auth: Auth, o: { method?: string; body?: unknown; query?: string; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const body = res.headers.get("content-type")?.includes("application/json") || !res.headers.get("content-type") ? await res.text() : `[binary ${res.headers.get("content-type")}]`;
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control"), headers: res.headers };
}

/** Sentetik kanıt: geçerli PDF imzası + dolgu (gerçek belge DEĞİL). */
function syntheticPdf(tag: string, size = 400): string {
  const head = Buffer.from(`%PDF-1.4\n% ZZ_SENTETIK_IZIN_KANITI ${tag}\n`, "utf8");
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x20)]).toString("base64");
}
const pngB64 = (size = 200) => Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(size, 1)]).toString("base64");

async function main() {
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_PRIV_PG_PORT ?? 54741),
    dirName: `hd-edu-priv-access-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: PRIVATE_RPCS,
    extraSql: privateArchiveSql(),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  delete process.env.HD_PRIVATE_EDUCATION_ENABLED;
  delete process.env.HD_EDUCATION_CATALOG_ENABLED;
  const su = env.su;
  // Prod'da service_role mevcut HD tablolarında tam yetkilidir (Supabase varsayılanı); test şemasında açıkça verilir.
  await su.query(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role`);
  try {
    const R = (p: string) => import(`../../../app/api/${p}/route`) as Promise<Record<string, Handler>>;
    const tAccess = (await R("hd/education/private/access")).GET;
    const tText = (await R("hd/education/private/consent-text")).GET;
    const tConsents = await R("hd/education/private/consents");
    const tConsentDel = (await R("hd/education/private/consents/[id]")).DELETE;
    const tConsentWd = (await R("hd/education/private/consents/[id]/withdraw")).POST;
    const tEvidence = (await R("hd/education/private/consents/[id]/evidence")).GET;
    const tItems = await R("hd/education/private/items");
    const tItem = await R("hd/education/private/items/[id]");
    const tRebind = (await R("hd/education/private/items/[id]/rebind")).POST;
    const tDelete = (await R("hd/education/private/items/delete")).POST;
    const oOverview = await R("admin/hd/education/private/overview");
    const oAccess = await R("admin/hd/education/training-access"); // FAZ 8: TEK yetki anahtarı
    const oItems = (await R("admin/hd/education/private/items")).GET;
    const oItem = await R("admin/hd/education/private/items/[id]");
    const oDelete = (await R("admin/hd/education/private/items/delete")).POST;
    const oConsentWd = (await R("admin/hd/education/private/consents/[id]/withdraw")).POST;
    const oConsentDel = (await R("admin/hd/education/private/consents/[id]")).DELETE;
    const oEvidence = (await R("admin/hd/education/private/consents/[id]/evidence")).GET;
    const centralCharts = (await R("hd/education/charts")).GET;
    const centralAccess = (await R("hd/education/access")).GET;

    // ── Tohum (sentetik) ─────────────────────────────────────────────────────────────────────
    let seq = 0;
    const mk = async (label: string, o: { role?: string; active?: boolean; approval?: string; hd?: boolean; pkg?: string; demo?: boolean; superAdmin?: boolean; adminLevel?: string | null; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID();
      const tenant = o.tenant ?? randomUUID();
      await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_PRIV_T_${label}`]);
      const token = `zz-priv-tok-${++seq}-${id.slice(0, 8)}`;
      const role = o.role ?? "expert";
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12)`,
        [id, `ZZ_PRIV_${label}`, `zz.priv.${label.toLowerCase()}@example.test`, role, o.active ?? true, o.approval ?? "approved",
          JSON.stringify(role === "expert" ? { human_design: o.hd ?? true, clients: true } : {}), o.pkg ?? "premium", tenant,
          o.demo === true, o.superAdmin === true, o.adminLevel ?? (role === "admin" ? "owner" : null)],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant, label };
    };
    const asAdmin = (w: Who): Auth => ({ kind: "admin", id: w.id, token: w.token });
    const asUser = (w: Who): Auth => ({ kind: "user", id: w.id, token: w.token });

    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin", adminLevel: "owner" }); // admin_level='owner' YANILTICI — super değil
    const ADMIN2 = await mk("ADMIN2", { role: "admin", adminLevel: "admin" });
    const A = await mk("EGITMEN_A");
    const B = await mk("EGITMEN_B");
    const OTHERS: Who[] = [];
    for (let i = 0; i < 98; i++) OTHERS.push(await mk(`U${String(i).padStart(3, "0")}`));
    const DEMO = await mk("DEMO", { demo: true });
    const NOHD = await mk("NOHD", { hd: false });

    // Danışan + hesaplanmış harita (sentetik; Roxy çağrısı yok). Her harita farklı kanıt alanlarıyla.
    const mkClient = async (w: Who, name: string) =>
      (await su.query(`insert into public.human_design_clients(tenant_id, user_id, name, birth_date, birth_time, birth_place) values ($1,$2,$3,'1990-01-01','10:00','ZZ Şehir') returning id`, [w.tenant, w.id, name])).rows[0].id as string;
    const mkChart = async (w: Who, clientId: string | null, n: number, o: { source?: string; result?: boolean } = {}) =>
      (await su.query(
        `insert into public.human_design_charts(tenant_id, user_id, client_id, client_name, source, birth_date, birth_time, birth_place, timezone, input,
           computed_result, type_code, profile_code, authority_code, definition_code, provider, provider_raw)
         values ($1,$2,$3,$4,$5,'1990-01-01',$6,'ZZ Şehir','Europe/Istanbul',$7,$8,'generator','1/3','sacral','single','roxyapi',$9) returning id`,
        [w.tenant, w.id, clientId, `ZZ_DANISAN_${w.label}_${n}`, o.source ?? "computed", `10:${String(n % 60).padStart(2, "0")}`,
          JSON.stringify({ date: "1990-01-01", time: `10:${n % 60}`, timezone: "Europe/Istanbul" }),
          o.result === false ? null : JSON.stringify({ ...(SNAP.computed_result as object), zz_synthetic: true, zz_n: n }),
          JSON.stringify({ ...(SNAP.provider_raw as object), zz_synthetic_raw: true, zz_n: n })],
      )).rows[0].id as string;

    const fixture: Record<string, { clients: string[]; charts: string[] }> = {};
    const seedOwnerData = async (w: Who, clients: number, chartsPerClient: number) => {
      const f = { clients: [] as string[], charts: [] as string[] };
      for (let c = 0; c < clients; c++) {
        const cid = await mkClient(w, `ZZ_DANISAN_${w.label}_${c}`);
        f.clients.push(cid);
        for (let k = 0; k < chartsPerClient; k++) f.charts.push(await mkChart(w, cid, c * 10 + k));
      }
      fixture[w.id] = f;
      return f;
    };
    const FA = await seedOwnerData(A, 10, 1);
    const FB = await seedOwnerData(B, 10, 2);
    for (const u of OTHERS) await seedOwnerData(u, 1, 1);
    const FO = await seedOwnerData(OWNER, 1, 1);

    // ── 1) Hazırlık kapısı KAPALI (varsayılan) ───────────────────────────────────────────────
    // Owner kararı 31.10.2026: kapı owner'ın arşiv anahtarıdır (DB, varsayılan KAPALI); owner yönetimi kapıdan bağımsız.
    section("1 · Hazırlık kapısı KAPALI (HD_PRIVATE_EDUCATION_ENABLED yok → owner arşiv anahtarı kapalı)");
    const closed = [
      await call(tAccess, asUser(A)), await call(tItems.GET, asUser(A)), await call(tItems.POST, asUser(A), { method: "POST", body: {} }),
    ];
    ok(closed.every((r) => r.status === 404 && r.cache === "no-store"), "arşiv anahtarı kapalı: eğitmen uçları 404 no-store");
    const ovClosed = await call(oOverview.GET, asAdmin(OWNER));
    ok(ovClosed.status === 200 && ovClosed.cache === "no-store" && (ovClosed.json.overview as Record<string, unknown> | undefined)?.archiveOpen === false,
      "owner yönetimi kapıdan bağımsız: genel bakış 200, arşiv anahtarı KAPALI", ovClosed.status);
    process.env.HD_PRIVATE_EDUCATION_ENABLED = "false";
    const reqBefore = env.stats.requests;
    const ks = [await call(tAccess, asUser(A)), await call(oOverview.GET, asAdmin(OWNER)), await call(oItems, asAdmin(OWNER))];
    ok(ks.every((r) => r.status === 404 && r.cache === "no-store"), "acil kapatma \"false\": eğitmen + owner uçları 404 no-store");
    ok(env.stats.requests === reqBefore, "acil kapatmada DB'ye HİÇ istek gitmedi", env.stats.requests - reqBefore);
    delete process.env.HD_PRIVATE_EDUCATION_ENABLED;
    process.env.HD_PRIVATE_EDUCATION_ENABLED = "TRUE";
    ok((await call(tAccess, asUser(A))).status === 404, `"TRUE" (büyük harf) açmaz — yalnız tam "true"`);
    process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";

    // ── 2) Owner anahtarı + izin metni + yetkiler ────────────────────────────────────────────
    section("2 · Owner anahtarı KAPALI → eğitmen 404; owner çalışır; normal admin owner değildir");
    const notFoundBodies = new Set<string>();
    const nonNoStore: string[] = [];
    const track = (label: string, r: Res) => { if (r.cache !== "no-store") nonNoStore.push(`${label}:${r.status}`); if (r.status === 404) notFoundBodies.add(r.body); return r; };
    const ov0 = track("ov0", await call(oOverview.GET, asAdmin(OWNER)));
    ok(ov0.status === 200 && (ov0.json.overview as Record<string, unknown>)?.archiveOpen === false, "owner genel bakış 200, anahtar KAPALI");
    for (const [w, l] of [[ADMIN, "admin(admin_level=owner)"], [ADMIN2, "admin"]] as const) {
      ok(track(l, await call(oOverview.GET, asAdmin(w))).status === 404, `${l} owner ekranı 404`);
      ok(track(l, await call(oAccess.POST, asAdmin(w), { method: "POST", body: { userId: A.id, enabled: true } })).status === 404, `${l} TEK eğitim yetkisini veremez (404)`);
      ok(track(l, await call(oAccess.GET, asAdmin(w), { query: `?userId=${A.id}` })).status === 404, `${l} TEK yetki anahtarını göremez (404)`);
      ok(track(l, await call(oItems, asAdmin(w))).status === 404, `${l} özel arşiv listesi 404`);
      ok(track(l, await call(tItems.GET, asUser(w))).status === 404, `${l} kullanıcı yüzünden de 404`);
    }
    ok(track("ownerAsExpertTokenMismatch", await call(oOverview.GET, { kind: "admin", id: OWNER.id, token: A.token })).status === 404, "owner kimliği + başka oturum token'ı → 404");
    // Onaysız metinle izin kaydedilemez.
    const st0 = await call(oAccess.GET, asAdmin(OWNER), { query: `?userId=${A.id}` });
    ok(st0.status === 200 && (st0.json.access as { enabled: boolean }).enabled === false && (st0.json.access as { eligible: boolean }).eligible === true
      && st0.json.label === "Human Design Eğitim Haritaları", "TEK anahtar: 'Human Design Eğitim Haritaları' KAPALI, uzman uygun");
    const g0 = await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: A.id, enabled: true } });
    ok(g0.status === 200 && (g0.json.access as { enabled: boolean }).enabled === true, "owner TEK anahtarı A için AÇTI", g0.json);
    ok(track("A-closed", await call(tItems.GET, asUser(A))).status === 404, "anahtar KAPALIYKEN yetkili eğitmen bile 404");
    const op = await call(oOverview.POST, asAdmin(OWNER), { method: "POST", body: { action: "open" } });
    ok(op.status === 400 && op.json.code === "CONFIRM_REQUIRED", "anahtar açma onaysız reddedilir");
    ok((await call(oOverview.POST, asAdmin(OWNER), { method: "POST", body: { action: "open", confirm: true } })).status === 200, "owner anahtarı AÇTI");
    const txt0 = await call(tText, asUser(A));
    ok(txt0.status === 409 && txt0.json.code === "CONSENT_TEXT_NOT_APPROVED", "izin metni onaysız → 409 (izin kaydı mümkün değil)");
    const preConsent = await call(tConsents.POST, asUser(A), { method: "POST", body: {
      hdClientId: FA.clients[0], consenterName: "ZZ Danışan", relation: "danisan", displayScope: "anonim", includeBirthData: false, namedConfirmed: false,
      textVersion: "hd-egitim-izin-v1", textSha256: "0".repeat(64), givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: syntheticPdf("pre") } });
    ok(preConsent.status === 400 && preConsent.json.code === "CONSENT_TEXT_INVALID", "onaysız metinle izin → 400 CONSENT_TEXT_INVALID", preConsent.json);
    ok((await call(oOverview.POST, asAdmin(OWNER), { method: "POST", body: { action: "approveText", version: "hd-egitim-izin-v1", legalRef: "", confirm: true } })).status === 400, "hukuk referansı olmadan metin onayı reddedilir");
    ok((await call(oOverview.POST, asAdmin(OWNER), { method: "POST", body: { action: "approveText", version: "hd-egitim-izin-v1", legalRef: "ZZ-SENTETIK-HUKUK-REF", confirm: true } })).status === 200, "owner metni (sentetik hukuk ref.) onayladı");
    const txt = await call(tText, asUser(A));
    const TEXT = txt.json.text as { version: string; sha256: string };
    ok(txt.status === 200 && TEXT?.version === "hd-egitim-izin-v1" && /^[0-9a-f]{64}$/.test(TEXT.sha256), "eğitmen onaylı metni + SHA'yı alır");

    // Yetkiler: B + 49 diğer uzman; 49 uzman yetkisiz. Demo / HD izni olmayan / owner'ın kendisi / admin → reddedilir.
    ok((await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: B.id, enabled: true } })).status === 200, "owner B'ye yetki verdi");
    const GRANTED = OTHERS.slice(0, 49), UNGRANTED = OTHERS.slice(49);
    for (const u of GRANTED) await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: u.id, enabled: true } });
    for (const [w, l] of [[DEMO, "demo"], [NOHD, "HD izni yok"], [ADMIN, "admin"]] as const) {
      const r = await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: w.id, enabled: true } });
      ok(r.status === 400 && r.json.code === "ED005", `${l} hesabına yetki verilemez`, r.json);
    }
    const dupG = await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: A.id, enabled: true } });
    ok(dupG.status === 200 && (await su.query(`select count(*)::int n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [A.id])).rows[0].n === 1,
      "anahtarı tekrar AÇMAK idempotent: tek etkin yetki satırı (çifte kayıt yok)");
    const selfG = await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: OWNER.id, enabled: true } });
    ok(selfG.status === 400, "owner kendine yetki veremez");
    ok((await su.query(`select count(*)::int n from information_schema.tables where table_name = 'hd_edu_private_grants'`)).rows[0].n === 0, "ayrı özel arşiv yetki tablosu YOK (tek kaynak)");

    // ── 3) İzin kayıtları + kayıt ekleme ─────────────────────────────────────────────────────
    section("3 · İzin kaydı (sentetik kanıt) + 'Eğitim Arşivime Ekle'");
    const consentBody = (w: Who, client: string, o: Record<string, unknown> = {}) => ({
      hdClientId: client, consenterName: `ZZ İzin Veren ${w.label}`, relation: "danisan", displayScope: "anonim", includeBirthData: false,
      namedConfirmed: false, textVersion: TEXT.version, textSha256: TEXT.sha256, givenOn: "2026-10-01", method: "islak_imza_tarama",
      evidenceMime: "application/pdf", evidenceBase64: syntheticPdf(`${w.label}-${client.slice(0, 6)}`), ...o,
    });
    const recordConsent = async (w: Who, client: string, o: Record<string, unknown> = {}) => {
      const r = await call(tConsents.POST, asUser(w), { method: "POST", body: consentBody(w, client, o) });
      return { r, id: String(r.json.id ?? "") };
    };
    const MARK = "ZZMARK7Q";
    const addItem = (w: Who, chart: string, consent: string, o: Record<string, unknown> = {}) =>
      call(tItems.POST, asUser(w), { method: "POST", body: { chartId: chart, consentId: consent, title: `${MARK}_${w.label}_${chart.slice(0, 6)}`,
        aliasLabel: `Danışan ${chart.slice(0, 4)}`, category: "tip", description: `${MARK} açıklama`, teachingNotes: `${MARK} gizli ders notu ${w.label}`, ...o } });

    // Hatalı izin senaryoları
    const badCases: [string, Record<string, unknown>, string][] = [
      ["yanlış metin SHA", { textSha256: "a".repeat(64) }, "CONSENT_TEXT_INVALID"],
      ["bilinmeyen sürüm", { textVersion: "hd-egitim-izin-v9" }, "CONSENT_TEXT_INVALID"],
      ["PDF dediği PNG içerik", { evidenceBase64: pngB64() }, "EVIDENCE_INVALID"],
      ["çok küçük kanıt", { evidenceBase64: Buffer.from("%PDF-1").toString("base64") }, "EVIDENCE_INVALID"],
      ["2 MB üstü kanıt (sunucu ilk kilidi)", { evidenceBase64: syntheticPdf("big", 2 * 1024 * 1024 + 10) }, "INVALID_FIELD"],
      ["izinsiz MIME", { evidenceMime: "text/html" }, "INVALID_FIELD"],
      ["gelecek tarih", { givenOn: "2099-01-01" }, "INVALID_FIELD"],
      ["açık isim + e-posta yöntemi", { displayScope: "acik_isim", namedConfirmed: true, method: "kayitli_eposta" }, "INVALID_FIELD"],
      ["açık isim teyitsiz", { displayScope: "acik_isim", namedConfirmed: false }, "INVALID_FIELD"],
      ["boş izin veren adı", { consenterName: " " }, "INVALID_FIELD"],
    ];
    for (const [l, o, code] of badCases) {
      const { r } = await recordConsent(A, FA.clients[0], o);
      ok((r.status === 400 || r.status === 413) && r.json.code === code, `hatalı izin reddedildi: ${l} (${code})`, r.json);
    }
    const crossConsent = await recordConsent(A, FB.clients[0]);
    ok(crossConsent.r.status === 404, "A, B'nin danışanı için izin kaydedemez (404 — varlık sızmaz)");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_consents`)).rows[0].n === 0, "hatalı denemelerden sonra izin tablosu BOŞ");

    const consentA: string[] = [];
    for (const c of FA.clients) { const x = await recordConsent(A, c); consentA.push(x.id); }
    ok(consentA.every((x) => /^[0-9a-f-]{36}$/.test(x)), "A: 10 izin kaydı");
    const itemsA: string[] = [];
    for (let i = 0; i < 10; i++) { const r = await addItem(A, FA.charts[i], consentA[i]); itemsA.push(String(r.json.id ?? "")); }
    ok(itemsA.every((x) => /^[0-9a-f-]{36}$/.test(x)), "A: 10 özel eğitim kaydı");
    const consentB: string[] = [];
    for (const c of FB.clients) consentB.push((await recordConsent(B, c)).id);
    const itemsB: string[] = [];
    for (let i = 0; i < 20; i++) { const r = await addItem(B, FB.charts[i], consentB[Math.floor(i / 2)]); itemsB.push(String(r.json.id ?? "")); }
    ok(itemsB.every((x) => /^[0-9a-f-]{36}$/.test(x)) && new Set(itemsB).size === 20, "B: 20 özel eğitim kaydı (10 danışan × 2 harita)");
    const itemsOther = new Map<string, string>();
    for (const u of GRANTED) {
      const cid = (await recordConsent(u, fixture[u.id].clients[0])).id;
      const r = await addItem(u, fixture[u.id].charts[0], cid);
      itemsOther.set(u.id, String(r.json.id ?? ""));
    }
    ok([...itemsOther.values()].every((x) => /^[0-9a-f-]{36}$/.test(x)), "49 yetkili uzman: her biri 1 kayıt");
    for (const u of UNGRANTED.slice(0, 5)) {
      ok(track("ungranted-consent", (await recordConsent(u, fixture[u.id].clients[0])).r).status === 404, `yetkisiz uzman ${u.label} izin kaydedemez`);
    }

    // Ekleme hataları
    const dup = await addItem(A, FA.charts[0], consentA[0]);
    ok(dup.status === 409 && dup.json.code === "DUPLICATE", "aynı harita ikinci kez → 409 DUPLICATE");
    ok(track("A-addB", await addItem(A, FB.charts[0], consentA[0])).status === 404, "A, B'nin haritasını ekleyemez (404)");
    const extraA = await mkChart(A, FA.clients[1], 99);
    ok(track("A-consentB", await addItem(A, extraA, consentB[0])).status === 404, "A, B'nin izniyle ekleyemez (404)");
    const mism = await addItem(A, extraA, consentA[0]);
    ok(mism.status === 400 && mism.json.code === "CONSENT_CLIENT_MISMATCH", "başka danışanın izni → 400 CONSENT_CLIENT_MISMATCH");
    const manualChart = await mkChart(A, FA.clients[1], 98, { source: "manual" });
    const man = await addItem(A, manualChart, consentA[1]);
    ok(man.status === 400 && man.json.code === "SOURCE_NOT_ELIGIBLE", "manuel (hesaplanmamış) harita → 400");
    const orphanChart = await mkChart(A, null, 97);
    ok((await addItem(A, orphanChart, consentA[1])).json.code === "SOURCE_NOT_ELIGIBLE", "danışana bağlı olmayan harita → 400");
    const named = await addItem(A, extraA, consentA[1], { displayMode: "named" });
    ok(named.status === 400 && named.json.code === "NAMED_NOT_ALLOWED", "anonim izinle açık isim → 400");
    // Başka eğitmen adına ekleme: gövdeye trainer/tenant alanları koymak etkisiz.
    const spoof = await addItem(A, extraA, consentA[1], { trainerUserId: B.id, tenantId: B.tenant, trainer_user_id: B.id, tenant_id: B.tenant });
    ok(spoof.status === 201, "gövdedeki trainer/tenant alanları yok sayıldı (kayıt yine A'ya)");
    const spoofRow = (await su.query(`select trainer_user_id, tenant_id from public.hd_edu_private_items where id = $1`, [spoof.json.id])).rows[0];
    ok(spoofRow?.trainer_user_id === A.id && spoofRow?.tenant_id === A.tenant, "DB: kayıt A'nın kimliği + tenant'ı ile yazıldı");
    const spoofId = String(spoof.json.id);
    const ownerOnA = await call(tItems.POST, asUser(OWNER), { method: "POST", body: { chartId: FA.charts[0], consentId: consentA[0], title: "x", aliasLabel: "y" } });
    ok(ownerOnA.status === 404, "owner bile A'nın tenant'ında A adına kayıt OLUŞTURAMAZ (404)");
    // Eşzamanlı mükerrer ekleme: tam 1 başarı.
    const raceChart = await mkChart(A, FA.clients[2], 96);
    const race = await Promise.all(Array.from({ length: 6 }, () => addItem(A, raceChart, consentA[2])));
    ok(race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409).length === 5, "6 eşzamanlı ekleme → 1 kayıt + 5×409", race.map((r) => r.status));
    const raceId = String(race.find((r) => r.status === 201)?.json.id ?? "");

    // ── 4) İzolasyon matrisi ─────────────────────────────────────────────────────────────────
    section("4 · İzolasyon: A yalnız A'yı, B yalnız B'yi görür; 98 uzman hiçbirini göremez");
    const listOf = async (w: Who) => ((await call(tItems.GET, asUser(w))).json.items as { id: string }[] | undefined) ?? [];
    const la = await listOf(A), lb = await listOf(B);
    const aAll = [...itemsA, spoofId, raceId];
    ok(la.length === 12 && la.every((x) => aAll.includes(x.id)), "A listesi = A'nın 12 kaydı (10 + 2 ek)", la.length);
    ok(lb.length === 20 && lb.every((x) => itemsB.includes(x.id)), "B listesi = B'nin 20 kaydı", lb.length);
    const aBody = (await call(tItems.GET, asUser(A))).body;
    ok(!aBody.includes("EGITMEN_B") && !itemsB.some((x) => aBody.includes(x)), "A yanıtında B'ye ait hiçbir kimlik / başlık yok");
    ok(!/tenant|provider_raw|teaching|notes/i.test(aBody), "liste yanıtında tenant / ham sağlayıcı / ders notu alanı yok");
    let otherLeak = 0, otherOk = 0;
    for (const u of OTHERS) {
      const r = await call(tItems.GET, asUser(u));
      const own = itemsOther.get(u.id);
      if (r.status === 200) {
        const ids = ((r.json.items as { id: string }[]) ?? []).map((x) => x.id);
        if (ids.length === 1 && ids[0] === own) otherOk++;
        if (ids.some((x) => x !== own) || r.body.includes("EGITMEN_A") || r.body.includes("EGITMEN_B")) otherLeak++;
      } else if (r.status === 404 && !own) otherOk++;
      else otherLeak++;
    }
    ok(otherLeak === 0 && otherOk === 98, "98 uzman: yetkili 49 yalnız kendi 1 kaydını, yetkisiz 49 → 404; sızıntı 0", { otherLeak, otherOk });
    // ID tahmini / çapraz okuma-yazma-silme
    let crossDenied = 0, crossTotal = 0;
    for (const id of itemsB.slice(0, 10)) {
      crossTotal += 3;
      if (track("A-getB", await call(tItem.GET, asUser(A), { params: { id } })).status === 404) crossDenied++;
      if (track("A-patchB", await call(tItem.PATCH, asUser(A), { method: "PATCH", params: { id }, body: { patch: { title: "hack" }, expectedUpdatedAt: new Date().toISOString() } })).status === 404) crossDenied++;
      if (track("A-delB", await call(tDelete, asUser(A), { method: "POST", body: { ids: [id], confirmCount: 1 } })).status === 404) crossDenied++;
    }
    for (const id of itemsA.slice(0, 5)) {
      crossTotal += 2;
      if (track("B-getA", await call(tItem.GET, asUser(B), { params: { id } })).status === 404) crossDenied++;
      if (track("B-patchA", await call(tItem.PATCH, asUser(B), { method: "PATCH", params: { id }, body: { patch: { title: "hack" }, expectedUpdatedAt: new Date().toISOString() } })).status === 404) crossDenied++;
    }
    ok(crossDenied === crossTotal, `çapraz okuma/düzenleme/silme ${crossDenied}/${crossTotal} → 404`);
    const mixed = await call(tDelete, asUser(A), { method: "POST", body: { ids: [itemsA[9], itemsB[0]], confirmCount: 2 } });
    ok(mixed.status === 404, "A: [kendi + B'nin] toplu silme → 404 (hepsi-ya-hiçbiri)");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_items where id = any($1)`, [[itemsA[9], itemsB[0]]])).rows[0].n === 2, "karma silme denemesinden sonra iki kayıt da duruyor");
    let otherCross = 0;
    for (const u of OTHERS) {
      const id = itemsA[OTHERS.indexOf(u) % 10];
      if ((await call(tItem.GET, asUser(u), { params: { id } })).status === 404) otherCross++;
    }
    ok(otherCross === 98, "98 uzmanın her biri A'nın kaydını ID ile açamaz (404)");
    const fakeId = randomUUID();
    const nf1 = track("fake", await call(tItem.GET, asUser(A), { params: { id: fakeId } }));
    const nf2 = track("bad", await call(tItem.GET, asUser(A), { params: { id: "../../etc" } }));
    const nf3 = track("B-of-A", await call(tItem.GET, asUser(B), { params: { id: itemsA[0] } }));
    ok(nf1.body === nf3.body && nf2.body === nf3.body, "var olmayan / bozuk / başkasının kimliği → BİREBİR aynı 404 gövdesi");
    ok((await call(tItem.GET, asUser(A), { params: { id: itemsA[0] } })).status === 200, "A kendi kaydını açar");

    // ── 5) Owner global yönetimi ─────────────────────────────────────────────────────────────
    section("5 · Owner: tüm eğitmenler + eğitmen filtresi + düzenleme + izin durumu");
    const oAll = await call(oItems, asAdmin(OWNER));
    const oList = (oAll.json.items as { id: string; trainer?: { userId: string } }[]) ?? [];
    ok(oList.length === 12 + 20 + 49, "owner tüm 81 kaydı görür", oList.length);
    ok(oList.every((x) => x.trainer && x.trainer.userId), "owner listesinde her kaydın eğitmeni var");
    const oA = (await call(oItems, asAdmin(OWNER), { query: `?trainer=${A.id}` })).json.items as { id: string }[];
    const oB = (await call(oItems, asAdmin(OWNER), { query: `?trainer=${B.id}` })).json.items as { id: string }[];
    ok(oA.length === 12 && oB.length === 20, "owner eğitmen filtresi: A=12, B=20");
    ok((await call(oItems, asAdmin(OWNER), { query: "?trainer=xyz" })).status === 400, "bozuk filtre 400");
    const oDet = await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsB[0] } });
    const oDetItem = oDet.json.item as { chart: unknown; trainer: { name: string }; consent: { consenterName: string }; item: { hdClientId: unknown } };
    ok(oDet.status === 200 && !!oDetItem?.chart && oDetItem.trainer.name === "ZZ_PRIV_EGITMEN_B", "owner B kaydını açar (harita + eğitmen adı)");
    ok(!("hdClientId" in (oDetItem?.item ?? {})) && !oDet.body.includes(FB.clients[0]) && !oDet.body.includes(FB.charts[0]), "owner yanıtında kaynak danışan / harita kimliği yok (asgari bilgi)");
    ok(!oDet.body.includes("provider_raw") && !oDet.body.includes("zz_synthetic_raw"), "ham sağlayıcı yanıtı istemciye GİTMEZ");
    const ownSelf = (await call(tItems.GET, asUser(OWNER))).json.items as unknown[] | undefined;
    ok(Array.isArray(ownSelf) && ownSelf.length === 0, "owner 'Bana Özel' yüzünde yalnız KENDİ kayıtlarını görür (0)");
    // Owner kendi uzman tenant'ında (kendi danışanı) kayıt ekleyebilir; bu kayıt yalnız onun "Bana Özel" listesinde görünür.
    const oCons = await call(tConsents.POST, asUser(OWNER), { method: "POST", body: consentBody(OWNER, FO.clients[0]) });
    const oAdd = await addItem(OWNER, FO.charts[0], String(oCons.json.id ?? ""));
    const ownSelf2 = (await call(tItems.GET, asUser(OWNER))).json.items as { id: string }[];
    ok(oCons.status === 201 && oAdd.status === 201 && ownSelf2.length === 1 && ownSelf2[0].id === oAdd.json.id, "owner kendi danışanını kendi özel arşivine ekledi (yalnız kendi listesinde)");
    ok(!((await call(tItems.GET, asUser(A))).body.includes(String(oAdd.json.id))), "owner'ın özel kaydı eğitmen A'ya görünmez");
    const ovr = (await call(oOverview.GET, asAdmin(OWNER))).json.overview as { trainers: { userId: string; items: number }[]; grants: unknown[] };
    ok(ovr.trainers.find((t) => t.userId === A.id)?.items === 12 && ovr.grants.length === 51, "genel bakış: eğitmen bazında sayılar + 51 etkin yetki");
    const before = (await call(tItem.GET, asUser(A), { params: { id: itemsA[1] } })).json.item as { item: { updatedAt: string } };
    const oPatch = await call(oItem.PATCH, asAdmin(OWNER), { method: "PATCH", params: { id: itemsA[1] }, body: { patch: { title: "Owner düzenledi", category: "otorite" }, expectedUpdatedAt: before.item.updatedAt } });
    ok(oPatch.status === 200, "owner A'nın kaydını düzenler", oPatch.json);
    const afterA = (await call(tItem.GET, asUser(A), { params: { id: itemsA[1] } })).json.item as { item: { title: string; category: string } };
    ok(afterA.item.title === "Owner düzenledi" && afterA.item.category === "otorite", "A owner düzenlemesini görür");

    // ── 6) Düzenleme kuralları ───────────────────────────────────────────────────────────────
    section("6 · Düzenleme: yalnız eğitim alanları + CAS");
    const d0 = (await call(tItem.GET, asUser(A), { params: { id: itemsA[2] } })).json.item as { item: { updatedAt: string } };
    const p1 = await call(tItem.PATCH, asUser(A), { method: "PATCH", params: { id: itemsA[2] }, body: { patch: { title: "Yeni başlık", aliasLabel: "Örnek K", teachingNotes: "Ders notu güncellendi", description: null }, expectedUpdatedAt: d0.item.updatedAt } });
    ok(p1.status === 200 && typeof p1.json.updatedAt === "string", "A başlık / takma ad / not / açıklama düzenler");
    const stale = await call(tItem.PATCH, asUser(A), { method: "PATCH", params: { id: itemsA[2] }, body: { patch: { title: "eski" }, expectedUpdatedAt: d0.item.updatedAt } });
    ok(stale.status === 409 && stale.json.code === "CONFLICT", "eski updatedAt ile düzenleme → 409 (kayıp güncelleme yok)");
    for (const f of ["birth_date", "birthTime", "computed_result", "sourceChartId", "consentId", "trainerUserId"]) {
      const r = await call(tItem.PATCH, asUser(A), { method: "PATCH", params: { id: itemsA[2] }, body: { patch: { [f]: "x" }, expectedUpdatedAt: String(p1.json.updatedAt) } });
      ok(r.status === 400, `kaynak/doğum alanı '${f}' düzenlenemez (400)`);
    }
    const chartAfterEdit = (await su.query(`select birth_date::text, birth_time, computed_result from public.human_design_charts where id = $1`, [FA.charts[2]])).rows[0];
    ok(chartAfterEdit.birth_date === "1990-01-01" && chartAfterEdit.computed_result?.activations?.length === 26, "kaynak haritanın doğum / hesap verisi DEĞİŞMEDİ");
    const emptyTitle = await call(tItem.PATCH, asUser(A), { method: "PATCH", params: { id: itemsA[2] }, body: { patch: { title: "" }, expectedUpdatedAt: String(p1.json.updatedAt) } });
    ok(emptyTitle.status === 400, "boş başlık reddedilir");
    const audUpd = (await su.query(`select detail from public.hd_edu_private_audit where action='item_updated' and item_id=$1`, [itemsA[2]])).rows;
    ok(audUpd.length === 1 && JSON.stringify(audUpd[0].detail).includes("title") && !JSON.stringify(audUpd[0].detail).includes("Yeni başlık"), "denetimde yalnız alan ADLARI (içerik yok)");

    // ── 7) Kaynak harita değişimi / silinmesi / danışan silinmesi ───────────────────────────
    section("7 · Kaynak harita değişti → erişim kapanır; silindi → kayıt da gider; danışan / izin / analiz korunur");
    await su.query(`update public.human_design_charts set client_name = 'ZZ yeni ad', notes = 'not' where id = $1`, [FA.charts[3]]);
    ok((await call(tItem.GET, asUser(A), { params: { id: itemsA[3] } })).status === 200, "yalnız ad / not değişikliği erişimi BOZMAZ");
    await su.query(`update public.human_design_charts set birth_time = '11:11', computed_result = jsonb_set(computed_result, '{zz_recalc}', 'true') where id = $1`, [FA.charts[3]]);
    ok(track("srcchg", await call(tItem.GET, asUser(A), { params: { id: itemsA[3] } })).status === 404, "doğum saati + hesap değişti → eğitmen eski bağlantıyla 404");
    const st = ((await call(tItems.GET, asUser(A))).json.items as { id: string; state: string; typeCode: unknown }[]).find((x) => x.id === itemsA[3]);
    ok(st?.state === "source_changed" && st.typeCode === null, "listede 'source_changed', tip bilgisi gösterilmiyor");
    const oSrc = (await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsA[3] } })).json.item as { state: string; chart: unknown };
    ok(oSrc.state === "source_changed" && oSrc.chart === null, "owner durumu görür; harita verisi GÖSTERİLMEZ");
    ok((await call(tRebind, asUser(B), { method: "POST", params: { id: itemsA[3] } })).status === 404, "B, A'nın kaydını yeniden bağlayamaz");
    const rb = await call(tRebind, asUser(A), { method: "POST", params: { id: itemsA[3] } });
    ok(rb.status === 200 && (await call(tItem.GET, asUser(A), { params: { id: itemsA[3] } })).status === 200, "A güncel hesabı bilinçli olarak yeniden bağladı → erişim açık");
    ok((await call(tRebind, asUser(A), { method: "POST", params: { id: itemsA[3] } })).json.code === "SOURCE_UNCHANGED", "değişmemiş kaynağı yeniden bağlama → 409");
    await su.query(`update public.human_design_charts set client_id = $2 where id = $1`, [FA.charts[4], FA.clients[5]]);
    ok((await call(tItem.GET, asUser(A), { params: { id: itemsA[4] } })).status === 404, "harita başka danışana taşındı → 404 (izin o danışana ait değil)");
    ok((await call(tRebind, asUser(A), { method: "POST", params: { id: itemsA[4] } })).json.code === "SOURCE_NOT_ELIGIBLE", "başka danışana taşınmış harita yeniden bağlanamaz");
    const cnt = async () => (await su.query(`select (select count(*) from public.human_design_clients)::int cl, (select count(*) from public.human_design_charts)::int ch,
      (select count(*) from public.hd_edu_private_consents)::int k, (select count(*) from public.hd_edu_private_items)::int it`)).rows[0];
    const c0 = await cnt();
    await su.query(`delete from public.human_design_charts where id = $1`, [FA.charts[5]]);
    const c1 = await cnt();
    ok(c1.it === c0.it - 1 && c1.cl === c0.cl && c1.k === c0.k, "kaynak harita silindi → yalnız o eğitim kaydı CASCADE gitti; danışan + izin duruyor");
    ok((await call(tItem.GET, asUser(A), { params: { id: itemsA[5] } })).status === 404 && (await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsA[5] } })).status === 404, "silinen kaynağın kaydı owner + eğitmen için 404");
    await su.query(`delete from public.human_design_clients where id = $1`, [FA.clients[6]]);
    const c2 = await cnt();
    ok(c2.it === c1.it - 1 && c2.k === c1.k - 1 && c2.ch === c1.ch, "danışan silindi → izni + kanıtı + eğitim kaydı gitti; harita satırı korunuyor (mevcut FK davranışı: client_id NULL)");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_consent_evidence where consent_id = $1`, [consentA[6]])).rows[0].n === 0, "silinen danışanın kanıt dosyası fiziksel olarak yok");

    // ── 8) İzin geri çekme ───────────────────────────────────────────────────────────────────
    section("8 · İzin geri çekme → ANINDA kapanır; eski bağlantı reddedilir");
    const wNo = await call(tConsentWd, asUser(A), { method: "POST", params: { id: consentA[7] }, body: { channel: "danisan_talebi" } });
    ok(wNo.status === 400 && wNo.json.code === "CONFIRM_REQUIRED", "onaysız geri çekme reddedilir");
    ok((await call(tConsentWd, asUser(B), { method: "POST", params: { id: consentA[7] }, body: { channel: "danisan_talebi", confirm: true } })).status === 404, "B, A'nın iznini geri çekemez");
    ok((await call(tConsentWd, asUser(A), { method: "POST", params: { id: consentA[7] }, body: { channel: "owner_karari", confirm: true } })).status === 400, "eğitmen 'owner_karari' kanalını kullanamaz");
    const w1 = await call(tConsentWd, asUser(A), { method: "POST", params: { id: consentA[7] }, body: { channel: "danisan_talebi", confirm: true } });
    ok(w1.status === 200 && w1.json.closedItems === 1, "A danışan talebiyle izni geri çekti (1 kayıt kapandı)");
    ok(track("wd", await call(tItem.GET, asUser(A), { params: { id: itemsA[7] } })).status === 404, "geri çekilen izinli kayıt: eğitmen eski bağlantı 404");
    const oW = (await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsA[7] } })).json.item as { state: string; chart: unknown; consent: { withdrawnAt: string } };
    ok(oW.state === "consent_withdrawn" && oW.chart === null && !!oW.consent.withdrawnAt, "owner: durum + geri çekme tarihi görünür, harita verisi YOK");
    ok((await call(tConsentWd, asUser(A), { method: "POST", params: { id: consentA[7] }, body: { channel: "danisan_talebi", confirm: true } })).json.code === "CONSENT_WITHDRAWN", "ikinci geri çekme 409");
    const newOnWd = await addItem(A, await mkChart(A, FA.clients[7], 95), consentA[7]);
    ok(newOnWd.status === 409 && newOnWd.json.code === "CONSENT_WITHDRAWN", "geri çekilmiş izinle yeni kayıt eklenemez");
    let reopen = "";
    try { await su.query(`update public.hd_edu_private_consents set withdrawn_at = null, withdrawn_by = null, withdraw_channel = null where id = $1`, [consentA[7]]); } catch (e) { reopen = (e as { code?: string }).code ?? "?"; }
    ok(reopen === "23514", "DB: geri çekilmiş izin süper kullanıcıyla bile yeniden AÇILAMAZ (tetikleyici)");
    const oWd = await call(oConsentWd, asAdmin(OWNER), { method: "POST", params: { id: consentB[9] }, body: { channel: "owner_karari", confirm: true } });
    ok(oWd.status === 200 && oWd.json.closedItems === 2, "owner B'nin iznini geri çekti (2 kayıt kapandı)");
    ok((await call(tItem.GET, asUser(B), { params: { id: itemsB[18] } })).status === 404 && (await call(tItem.GET, asUser(B), { params: { id: itemsB[19] } })).status === 404, "B iki kaydına erişemez");

    // ── 9) Kanıt dosyası ─────────────────────────────────────────────────────────────────────
    section("9 · Kanıt dosyası: yetkili indirme, SHA doğrulama, bozuk / eksik kanıt");
    const evA = await call(tEvidence, asUser(A), { params: { id: consentA[0] } });
    ok(evA.status === 200 && evA.headers.get("content-type") === "application/pdf" && evA.cache === "no-store" && evA.headers.get("x-content-type-options") === "nosniff"
      && /attachment/.test(evA.headers.get("content-disposition") ?? ""), "A kendi kanıtını indirir (PDF, attachment, no-store, nosniff)");
    ok((await call(tEvidence, asUser(B), { params: { id: consentA[0] } })).status === 404, "B, A'nın kanıtını indiremez");
    ok((await call(oEvidence, asAdmin(OWNER), { params: { id: consentA[0] } })).status === 200, "owner kanıtı indirir");
    await su.query(`alter table public.hd_edu_private_consent_evidence disable trigger trg_hd_edu_priv_evidence_guard`);
    await su.query(`update public.hd_edu_private_consent_evidence set content = overlay(content placing '\\x58'::bytea from 20 for 1) where consent_id = $1`, [consentA[8]]);
    await su.query(`alter table public.hd_edu_private_consent_evidence enable trigger trg_hd_edu_priv_evidence_guard`);
    ok((await call(tItem.GET, asUser(A), { params: { id: itemsA[8] } })).status === 404, "bozulmuş kanıt (SHA uyuşmazlığı) → kayıt erişime kapalı");
    const evBad = await call(tEvidence, asUser(A), { params: { id: consentA[8] } });
    ok(evBad.status === 400 && evBad.json.code === "EVIDENCE_INVALID", "bozulmuş kanıt indirilemez (400)");
    ok(((await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsA[8] } })).json.item as { state: string }).state === "evidence_invalid", "owner: 'evidence_invalid'");
    await su.query(`delete from public.hd_edu_private_consent_evidence where consent_id = $1`, [consentA[9]]);
    const stMissing = ((await call(tItems.GET, asUser(A))).json.items as { id: string; state: string }[]).find((x) => x.id === itemsA[9]);
    ok(stMissing?.state === "evidence_invalid", "eksik kanıt (bozuk dosya referansı) → listede de 'evidence_invalid'");
    let evUpd = "";
    try { await su.query(`update public.hd_edu_private_consent_evidence set mime = 'image/png' where consent_id = $1`, [consentA[0]]); } catch (e) { evUpd = (e as { code?: string }).code ?? "?"; }
    ok(evUpd === "23514", "DB: kanıt satırı değiştirilemez");

    // ── 10) Yetki iptali + uygunluk senaryoları ──────────────────────────────────────────────
    section("10 · Yetki iptali / rol / tenant / demo / pasif / paket / HD izni / oturum");
    const U = GRANTED; // 49 yetkili diğer uzman
    const probe = async (w: Who) => (await call(tItems.GET, asUser(w))).status;
    ok((await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: U[0].id, enabled: false } })).status === 200 && (await probe(U[0])) === 404, "owner TEK anahtarı kapattı → 404 (açık oturum dahil)");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_items where trainer_user_id = $1`, [U[0].id])).rows[0].n === 1, "iptal kaydı SİLMEZ (owner yönetimi için korunur)");
    ok((await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsOther.get(U[0].id)! } })).status === 200, "owner iptal edilmiş eğitmenin kaydını görür");
    await su.query(`update public.users set role = 'admin' where id = $1`, [U[1].id]);
    ok((await probe(U[1])) === 404, "rol admin yapıldı → 404");
    await su.query(`update public.users set role = 'expert' where id = $1`, [U[1].id]);
    ok((await probe(U[1])) === 404, "rol geri expert → yetki KALICI iptal (404)");
    ok((await su.query(`select revoke_reason from public.hd_education_access_grants where user_id = $1`, [U[1].id])).rows[0]?.revoke_reason === "role_changed", "iptal gerekçesi role_changed");
    const newT = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_PRIV_NEWT')`, [newT]);
    await su.query(`update public.users set tenant_id = $2 where id = $1`, [U[2].id, newT]);
    ok((await probe(U[2])) === 404 && (await su.query(`select revoke_reason from public.hd_education_access_grants where user_id = $1`, [U[2].id])).rows[0]?.revoke_reason === "tenant_changed", "tenant değişti → 404 + tenant_changed");
    await su.query(`update public.users set tenant_id = $2 where id = $1`, [U[2].id, U[2].tenant]);
    ok((await probe(U[2])) === 404, "eski tenant'a dönse de yetki geri gelmez");
    await su.query(`update public.users set is_demo_account = true where id = $1`, [U[3].id]);
    ok((await probe(U[3])) === 404, "demo hesaba dönüştü → 404");
    await su.query(`update public.users set active = false where id = $1`, [U[4].id]);
    ok((await probe(U[4])) === 404, "pasif uzman → 404");
    await su.query(`update public.users set package_type = 'trial', plan = 'trial' where id = $1`, [U[5].id]);
    ok((await probe(U[5])) === 404, "süresi bitmiş premium (paket trial'a düştü) → 404");
    await su.query(`update public.users set module_permissions = '{"human_design": false}'::jsonb where id = $1`, [U[6].id]);
    ok((await probe(U[6])) === 404, "HD izni kapandı → 404");
    await su.query(`update public.users set approval_status = 'pending' where id = $1`, [U[7].id]);
    ok((await probe(U[7])) === 404, "onay durumu pending → 404");
    await su.query(`update public.user_sessions set is_active = false, ended_at = now() where user_id = $1`, [U[8].id]);
    ok((await probe(U[8])) === 404, "sonlandırılmış (eski) oturum token'ı → 404");
    ok((await call(tItems.GET, { kind: "user", id: U[9].id, token: "zz-sahte-token" })).status === 404, "sahte token → 404");
    ok((await call(tItems.GET, { kind: "user", id: U[9].id, token: U[10].token })).status === 404, "başka kullanıcının token'ı → 404");
    ok((await call(tItems.GET, { kind: "user", id: U[9].id })).status === 404 && (await call(tItems.GET, null)).status === 404, "token yok / oturum yok → 404");
    ok((await call(tItems.GET, asAdmin(U[9]))).status === 404, "uzman kimliği admin başlığıyla → 404");
    ok((await probe(U[9])) === 200, "kontrol: etkilenmeyen yetkili uzman hâlâ 200");

    // Owner anahtarı kapatma
    ok((await call(oOverview.POST, asAdmin(OWNER), { method: "POST", body: { action: "close", confirm: true } })).status === 200, "owner tüm özel arşiv erişimini KAPATTI");
    ok((await probe(A)) === 404 && (await probe(B)) === 404 && (await probe(U[9])) === 404, "anahtar kapalı → tüm eğitmenler 404");
    ok((await call(oItems, asAdmin(OWNER))).status === 200, "owner kapalıyken de yönetebilir");
    await call(oOverview.POST, asAdmin(OWNER), { method: "POST", body: { action: "open", confirm: true } });
    ok((await probe(A)) === 200, "owner yeniden açtı → A 200");

    // ── 11) Silme ────────────────────────────────────────────────────────────────────────────
    section("11 · Silme: tekli / toplu (3+ ifade) · yalnız eğitim kaydı · fiziksel temizlik");
    const one = await call(tDelete, asUser(A), { method: "POST", body: { ids: [itemsA[0]] } });
    ok(one.status === 400 && one.json.code === "CONFIRM_REQUIRED", "confirmCount olmadan silme reddedilir");
    const c3 = await cnt();
    const chartsBefore = (await su.query(`select count(*)::int n from public.human_design_charts where tenant_id = $1`, [A.tenant])).rows[0].n;
    const reportsBefore = (await su.query(`select count(*)::int n from public.human_design_reports`)).rows[0].n;
    const d1 = await call(tDelete, asUser(A), { method: "POST", body: { ids: [itemsA[0]], confirmCount: 1 } });
    ok(d1.status === 200 && d1.json.deleted === 1, "A tek kaydını sildi");
    const c4 = await cnt();
    ok(c4.it === c3.it - 1 && c4.k === c3.k && c4.cl === c3.cl && c4.ch === c3.ch, "yalnız eğitim kaydı gitti: izin / danışan / harita sayıları aynı");
    ok((await su.query(`select count(*)::int n from public.human_design_charts where id = $1`, [FA.charts[0]])).rows[0].n === 1, "danışanın ASIL haritası duruyor");
    ok((await su.query(`select count(*)::int n from public.human_design_charts where tenant_id = $1`, [A.tenant])).rows[0].n === chartsBefore
      && (await su.query(`select count(*)::int n from public.human_design_reports`)).rows[0].n === reportsBefore, "diğer HD analizleri / raporlar etkilenmedi");
    ok((await call(tItem.GET, asUser(A), { params: { id: itemsA[0] } })).status === 404 && (await call(oItem.GET, asAdmin(OWNER), { params: { id: itemsA[0] } })).status === 404, "silinen kayıt: eğitmen + owner eski URL 404");
    ok(!(((await call(oItems, asAdmin(OWNER))).json.items as { id: string }[]).some((x) => x.id === itemsA[0])), "owner listesinden de kayboldu");
    const three = [itemsB[0], itemsB[1], itemsB[2]];
    ok((await call(tDelete, asUser(B), { method: "POST", body: { ids: three, confirmCount: 3 } })).json.code === "CONFIRM_REQUIRED", "3 kayıt: ifade olmadan reddedilir");
    ok((await call(tDelete, asUser(B), { method: "POST", body: { ids: three, confirmCount: 3, confirmPhrase: "2 KAYDI SİL" } })).json.code === "CONFIRM_REQUIRED", "3 kayıt: yanlış ifade reddedilir");
    const d3 = await call(tDelete, asUser(B), { method: "POST", body: { ids: three, confirmCount: 3, confirmPhrase: "3 kaydı sil" } });
    ok(d3.status === 200 && d3.json.deleted === 3, "3 kayıt: doğru ifadeyle (küçük harf / ı) silindi");
    const oDel = await call(oDelete, asAdmin(OWNER), { method: "POST", body: { ids: [itemsB[3], itemsA[1]], confirmCount: 2 } });
    ok(oDel.status === 200 && oDel.json.deleted === 2, "owner farklı eğitmenlerin kayıtlarını birlikte silebilir");
    // Fiziksel temizlik: silinen kayıtların başlık / not işaretleri hiçbir tabloda kalmamalı.
    const deletedTitles = [itemsA[0], itemsB[0], itemsB[1], itemsB[2], itemsB[3]].map((id) => id.slice(0, 6));
    const tables = (await su.query(`select table_schema, table_name from information_schema.tables where table_schema in ('public') and table_type='BASE TABLE'`)).rows;
    let leftovers = 0;
    for (const t of tables) {
      const r = await su.query(`select count(*)::int n from ${t.table_schema}."${t.table_name}" x where x::text like any($1)`,
        [[`%${MARK}_EGITMEN_A_${FA.charts[0].slice(0, 6)}%`, ...[0, 1, 2, 3].map((i) => `%${MARK}_EGITMEN_B_${FB.charts[i].slice(0, 6)}%`)]]);
      leftovers += r.rows[0].n;
    }
    ok(leftovers === 0, `silinen kayıtların başlık/not içeriği ${tables.length} tablonun HİÇBİRİNDE yok (fiziksel temizlik)`, { deletedTitles, leftovers });
    const audDel = (await su.query(`select detail::text d from public.hd_edu_private_audit where action='item_deleted'`)).rows;
    ok(audDel.length === 6 && audDel.every((r) => !r.d.includes(MARK)), "denetimde 6 silme izi, kişisel içerik YOK");
    let audMut = "";
    try { await su.query(`delete from public.hd_edu_private_audit`); } catch (e) { audMut = (e as { code?: string }).code ?? "?"; }
    ok(audMut === "23514", "denetim izi silinemez (append-only)");
    // İzin silme → bağlı kayıtlar + kanıt gider; danışan / harita kalır.
    const c5 = await cnt();
    const cdNo = await call(tConsentDel, asUser(B), { method: "DELETE", params: { id: consentB[2] }, body: {} });
    ok(cdNo.status === 400, "onaysız izin silme reddedilir");
    ok((await call(tConsentDel, asUser(A), { method: "DELETE", params: { id: consentB[2] }, body: { confirm: true } })).status === 404, "A, B'nin iznini silemez");
    const cd = await call(tConsentDel, asUser(B), { method: "DELETE", params: { id: consentB[2] }, body: { confirm: true } });
    const c6 = await cnt();
    ok(cd.status === 200 && cd.json.deletedItems === 2 && c6.k === c5.k - 1 && c6.it === c5.it - 2 && c6.cl === c5.cl && c6.ch === c5.ch, "B izni sildi → 2 kayıt + kanıt gitti; danışan + haritalar kaldı");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_consent_evidence where consent_id = $1`, [consentB[2]])).rows[0].n === 0, "silinen iznin kanıtı fiziksel olarak yok");
    ok((await call(oConsentDel, asAdmin(OWNER), { method: "DELETE", params: { id: consentA[7] }, body: { confirm: true } })).status === 200, "owner geri çekilmiş izni (ve bağlı kaydı) temizledi");

    // ── 12) Merkezî katalogla ayrım ──────────────────────────────────────────────────────────
    section("12 · TEK yetki: merkezî + özel; içerik ayrımı korunur");
    process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
    ok((await call(centralAccess, asUser(B))).status === 200, "TEK yetki: B'nin eğitim yetkisi merkezî kataloğu da açar");
    ok((await call(centralAccess, asUser(UNGRANTED[0]))).status === 404, "yetkisiz uzman merkezî kataloğa da erişemez");
    const cc = await call(centralCharts, asUser(B));
    ok(cc.status === 200 && Array.isArray(cc.json.items) && (cc.json.items as unknown[]).length === 0, "merkezî katalog listesinde özel kayıt YOK (0)");
    ok(!cc.body.includes(MARK), "merkezî katalog yanıtında özel kayıt içeriği yok");
    const cross = (await su.query(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c,
       (select count(*) from public.hd_education_publications)::int p`)).rows[0];
    ok(cross.s === 0 && cross.c === 0 && cross.p === 0, "merkezî içerik tablolarına HİÇ satır yazılmadı");
    // Yetki kapatma veri silmez; yeniden açınca geçerli kayıtlar geri görünür.
    const bBefore = (await call(tItems.GET, asUser(B))).json.items as unknown[];
    await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: B.id, enabled: false } });
    ok((await call(tItems.GET, asUser(B))).status === 404 && (await call(centralAccess, asUser(B))).status === 404, "kapalı: özel + merkezî erişim birlikte kapandı");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_items where trainer_user_id = $1`, [B.id])).rows[0].n === bBefore.length, "kapatma kayıtları SİLMEDİ");
    await call(oAccess.POST, asAdmin(OWNER), { method: "POST", body: { userId: B.id, enabled: true } });
    ok(((await call(tItems.GET, asUser(B))).json.items as unknown[]).length === bBefore.length, "yeniden açınca B'nin geçerli kayıtları geri görünür");
    delete process.env.HD_EDUCATION_CATALOG_ENABLED;

    // ── 13) DB kilitleri (service_role doğrudan erişemez) ────────────────────────────────────
    section("13 · DB: service_role tabloya doğrudan erişemez; RPC aktörü yeniden doğrular");
    const direct = await realFetch(`${env.url}/rest/v1/hd_edu_private_items?select=*`, { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } });
    ok(direct.status === 403 || direct.status === 400, "service_role REST ile hd_edu_private_items okuyamaz (42501)", direct.status);
    const rpcFake = await realFetch(`${env.url}/rest/v1/rpc/hd_edu_priv_item_list`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_actor: randomUUID() }) });
    ok(rpcFake.status === 400, "RPC'ye uydurma aktör → yetkisiz aktör hatası", rpcFake.status);
    const rpcAdmin = await realFetch(`${env.url}/rest/v1/rpc/hd_edu_priv_item_list`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_actor: ADMIN.id }) });
    ok(rpcAdmin.status === 400, "RPC'ye normal admin aktör → reddedilir (owner değil)");
    const rpcUngr = await realFetch(`${env.url}/rest/v1/rpc/hd_edu_priv_item_get`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_actor: UNGRANTED[0].id, p_item: itemsA[2] }) });
    ok(rpcUngr.status === 400, "RPC'ye yetkisiz uzman aktör → reddedilir");
    const rpcBasA = await realFetch(`${env.url}/rest/v1/rpc/hd_edu_priv_item_get`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ p_actor: B.id, p_item: itemsA[2] }) });
    const rpcBasABody = await rpcBasA.text();
    ok(rpcBasA.status === 200 && /null/.test(rpcBasABody) && !rpcBasABody.includes(MARK), "RPC doğrudan çağrılsa bile B → A'nın kaydı NULL (DB katmanı izolasyonu)");

    // DB ikinci kilidi: sunucu katmanı atlanıp RPC doğrudan çağrılsa bile 2 MB üstü kanıt reddedilir.
    const bigRpc = await realFetch(`${env.url}/rest/v1/rpc/hd_edu_priv_consent_record`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      p_actor: A.id, p_hd_client: FA.clients[3], p_consenter_name: "ZZ Büyük", p_relation: "danisan", p_display_scope: "anonim", p_include_birth: false,
      p_named_confirmed: false, p_text_version: TEXT.version, p_text_sha256: TEXT.sha256, p_given_on: "2026-10-01", p_method: "islak_imza_tarama",
      p_evidence_b64: syntheticPdf("bigdb", 2 * 1024 * 1024 + 10), p_evidence_mime: "application/pdf" }) });
    const bigBody = (await bigRpc.json()) as { code?: string };
    ok(bigRpc.status === 400 && bigBody.code === "EP011", "DB ikinci kilit: 2 MB üstü kanıt doğrudan RPC'de de EP011", bigBody);
    const namedRpc = await realFetch(`${env.url}/rest/v1/rpc/hd_edu_priv_consent_record`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      p_actor: A.id, p_hd_client: FA.clients[3], p_consenter_name: "ZZ İsim", p_relation: "danisan", p_display_scope: "acik_isim", p_include_birth: false,
      p_named_confirmed: true, p_text_version: TEXT.version, p_text_sha256: TEXT.sha256, p_given_on: "2026-10-01", p_method: "kayitli_eposta",
      p_evidence_b64: syntheticPdf("named"), p_evidence_mime: "application/pdf" }) });
    ok(namedRpc.status === 400 && ((await namedRpc.json()) as { code?: string }).code === "EP012", "DB ikinci kilit: açık isim + e-posta yöntemi doğrudan RPC'de de EP012");

    section("14 · Genel");
    ok(notFoundBodies.size === 1, "tüm 404 yanıtları BİREBİR aynı gövde", [...notFoundBodies]);
    ok(nonNoStore.length === 0, "izlenen tüm yanıtlar Cache-Control: no-store", nonNoStore.slice(0, 5));
    ok(external.length === 0, "dış ağ / Roxy çağrısı 0", external);
  } finally {
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error("BAŞARISIZ:\n" + fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });

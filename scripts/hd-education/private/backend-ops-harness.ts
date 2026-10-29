/**
 * FAZ 7–8 — Özel eğitim arşivi: işletim uçları + yedek riski + olağan dışı kullanım sınırları.
 * İzole embedded-postgres + gerçek migration + gerçek route'lar; sentetik veri; dış ağ 0.
 *  A) D akışı uygunluk yoklaması (kendi / başka tenant / mükerrer / manuel / danışansız)
 *  B) Owner listesi gerçek filtreleri (eğitmen + durum + arama)
 *  C) FAZ 8 owner kararı: ayrı iptal günlüğü YOK (uç + RPC kaldırıldı)
 *  D) Eski yedekten geri yükleme RİSKİNİN KANITI (owner kararıyla kabul edilen, belgelenen risk) + owner'ın acil kapatma anahtarı
 *  E) Hız sınırı: olağan görüntüleme SINIRSIZ; toplu izin yükleme / silme / kayıt tahmini sınırlı (429)
 * Çalıştır: npx tsx scripts/hd-education/private/backend-ops-harness.ts   (HD_EDU_PRIV_F7_PORT, varsayılan 54771)
 */
import "../../hd-analysis-word-flow/env";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";
import { privateArchiveSql, PRIVATE_RPCS } from "./pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const PRIV_TABLES = ["hd_edu_private_control", "hd_education_access_grants", "hd_edu_private_consent_texts", "hd_edu_private_consents",
  "hd_edu_private_consent_evidence", "hd_edu_private_items", "hd_edu_private_audit"];

async function main() {
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;
  const env = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_PRIV_F7_PORT ?? 54771), dirName: `hd-edu-priv-f7-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: PRIVATE_RPCS, extraSql: privateArchiveSql(),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";
  const su = env.su;
  await su.query(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role`);
  try {
    const R = (p: string) => import(`../../../app/api/${p}/route`) as Promise<Record<string, Handler>>;
    const tStatus = (await R("hd/education/private/charts/[id]/status")).GET;
    const tItems = await R("hd/education/private/items");
    const tItem = (await R("hd/education/private/items/[id]")).GET;
    const tConsents = await R("hd/education/private/consents");
    const tDelete = (await R("hd/education/private/items/delete")).POST;
    const tWd = (await R("hd/education/private/consents/[id]/withdraw")).POST;
    const oItems = (await R("admin/hd/education/private/items")).GET;
    const oOverview = await R("admin/hd/education/private/overview");
    const oAccess = await R("admin/hd/education/training-access");
    const call = async (h: Handler, kind: "user" | "admin", w: { id: string; token: string } | null, o: { method?: string; body?: unknown; params?: Record<string, string>; query?: string } = {}) => {
      const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
      if (w) { headers[kind === "admin" ? "x-admin-id" : "x-user-id"] = w.id; headers["x-session-token"] = w.token; }
      if (o.body !== undefined) headers["content-type"] = "application/json";
      const res = await h(new NextRequest(`http://localhost/api/t${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), { params: Promise.resolve(o.params ?? {}) });
      const body = await res.text();
      return { status: res.status, body, json: (() => { try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; } })() };
    };
    const mk = async (label: string, role = "expert", o: { superAdmin?: boolean; hd?: boolean; active?: boolean } = {}) => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-f7-${label}-${id.slice(0, 6)}`;
      await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_F7_${label}`]);
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
                      values ($1,$2,$3,$4,$5,'approved',$6,'premium','premium',$7,$8)`,
        [id, `ZZ_F7_${label}`, `zz.f7.${label.toLowerCase()}@example.test`, role, o.active ?? true, JSON.stringify(role === "expert" ? { human_design: o.hd ?? true } : {}), tenant, o.superAdmin === true]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant, label };
    };
    const OWNER = await mk("OWNER", "admin", { superAdmin: true });
    const A = await mk("EGITMEN_A"), B = await mk("EGITMEN_B"), C = await mk("ADAY_C");
    await su.query(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await su.query(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const w of [A, B]) await su.query(`select public.hd_education_grant_access($1,$2,null)`, [OWNER.id, w.id]);
    const sha = (await su.query(`select body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-izin-v1'`)).rows[0].body_sha256 as string;
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    let n = 0;
    const client = async (w: typeof A) => (await su.query(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [w.tenant, w.id, `ZZ_DANISAN_${w.label}_${++n}`])).rows[0].id as string;
    const chart = async (w: typeof A, c: string | null, src = "computed") => (await su.query(
      `insert into public.human_design_charts(tenant_id, user_id, client_id, source, birth_date, birth_time, timezone, computed_result, provider, provider_raw)
       values ($1,$2,$3,$4,'2018-07-20',$5,'UTC',$6,'roxyapi',$7) returning id`,
      [w.tenant, w.id, c, src, `16:${String(++n % 60).padStart(2, "0")}`, src === "computed" ? JSON.stringify({ ...(SNAP.computed_result as object), zz: n }) : null, JSON.stringify(SNAP.provider_raw)])).rows[0].id as string;
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ\n"), Buffer.alloc(200, 32)]).toString("base64");
    const consent = async (w: typeof A, c: string) => String((await call(tConsents.POST, "user", w, { method: "POST", body: {
      hdClientId: c, consenterName: "ZZ İzin Veren", relation: "danisan", displayScope: "anonim", includeBirthData: false, namedConfirmed: false,
      textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } })).json.id);
    const add = async (w: typeof A, ch: string, k: string, title: string) => String((await call(tItems.POST, "user", w, { method: "POST", body: { chartId: ch, consentId: k, title, aliasLabel: "Örnek" } })).json.id);

    // ── A) Uygunluk yoklaması ─────────────────────────────────────────────────────────────
    section("A · D akışı uygunluk yoklaması");
    const ca1 = await client(A), cha1 = await chart(A, ca1);
    const s1 = await call(tStatus, "user", A, { params: { id: cha1 } });
    const st1 = s1.json.status as { eligible: boolean; reason: unknown; hdClientId: string; consents: unknown[] };
    ok(s1.status === 200 && st1.eligible === true && st1.reason === null && st1.hdClientId === ca1 && st1.consents.length === 0, "kendi hesaplanmış haritası: uygun, izin yok");
    const k1 = await consent(A, ca1);
    const st1b = (await call(tStatus, "user", A, { params: { id: cha1 } })).json.status as { consents: { id: string }[] };
    ok(st1b.consents.length === 1 && st1b.consents[0].id === k1, "izin kaydı sonrası danışanın izni listede");
    const i1 = await add(A, cha1, k1, "ZZ başlık 1");
    const st1c = (await call(tStatus, "user", A, { params: { id: cha1 } })).json.status as { eligible: boolean; reason: string; itemId: string };
    ok(st1c.eligible === false && st1c.reason === "duplicate" && st1c.itemId === i1, "zaten arşivde → duplicate + mevcut kayıt kimliği");
    const chb = await chart(B, await client(B));
    const sB = await call(tStatus, "user", A, { params: { id: chb } });
    const sFake = await call(tStatus, "user", A, { params: { id: randomUUID() } });
    ok(sB.status === 404 && sFake.status === 404 && sB.body === sFake.body, "başka eğitmenin haritası = var olmayan harita (aynı 404)");
    const chm = await chart(A, ca1, "manual");
    ok(((await call(tStatus, "user", A, { params: { id: chm } })).json.status as { reason: string }).reason === "not_computed", "manuel harita → not_computed");
    const cho = await chart(A, null);
    ok(((await call(tStatus, "user", A, { params: { id: cho } })).json.status as { reason: string }).reason === "no_client", "danışansız harita → no_client");
    ok((await call(tStatus, "user", C, { params: { id: cha1 } })).status === 404, "yetkisiz uzman → 404");

    // ── B) Owner filtreleri + uzman araması ──────────────────────────────────────────────
    section("B · Owner gerçek filtreleri");
    const ca2 = await client(A), cha2 = await chart(A, ca2), k2 = await consent(A, ca2), i2 = await add(A, cha2, k2, "Sakral örnek ZZARAMA");
    const ca3 = await client(A), cha3 = await chart(A, ca3), k3 = await consent(A, ca3), i3 = await add(A, cha3, k3, "Geri çekilecek");
    const cb1 = await client(B), chb1 = await chart(B, cb1), kb1 = await consent(B, cb1), ib1 = await add(B, chb1, kb1, "B kaydı");
    await call(tWd, "user", A, { method: "POST", params: { id: k3 }, body: { channel: "danisan_talebi", confirm: true } });
    await su.query(`update public.human_design_charts set computed_result = jsonb_set(computed_result,'{zz}','999') where id = $1`, [chb1]);
    const ol = async (q: string) => { const r = await call(oItems, "admin", OWNER, { query: q }); return { st: r.status, ids: ((r.json.items as { id: string }[]) ?? []).map((x) => x.id), total: r.json.total }; };
    const all = await ol("");
    ok(all.ids.length === 4 && all.total === 4, "owner tümü: 4 kayıt");
    ok(JSON.stringify((await ol(`?trainer=${A.id}`)).ids.sort()) === JSON.stringify([i1, i2, i3].sort()), "eğitmen filtresi A: 3 kayıt");
    ok(JSON.stringify((await ol("?state=ok")).ids.sort()) === JSON.stringify([i1, i2].sort()), "durum=aktif: yalnız erişime açık 2 kayıt");
    ok(JSON.stringify((await ol("?state=consent_withdrawn")).ids) === JSON.stringify([i3]), "durum=izni geri çekilmiş: 1 kayıt");
    ok(JSON.stringify((await ol("?state=invalid")).ids) === JSON.stringify([ib1]), "durum=geçersiz kaynak: B'nin değişmiş haritası");
    ok(JSON.stringify((await ol("?q=zzarama")).ids) === JSON.stringify([i2]), "arama (büyük/küçük harf duyarsız) gerçek sonuç");
    ok(JSON.stringify((await ol(`?q=egitmen_b`)).ids) === JSON.stringify([ib1]), "arama eğitmen adında da çalışır");
    ok((await ol(`?trainer=${A.id}&state=ok&q=sakral`)).ids.length === 1, "filtreler birlikte çalışır");
    ok((await ol("?q=yokboylebirsey")).ids.length === 0, "eşleşmeyen arama → boş sonuç");
    ok((await ol("?state=hepsi")).st === 400, "desteklenmeyen durum filtresi → 400 (sahte filtre yok)");
    const tl = await call(tItems.GET, "user", A, { query: `?trainer=${B.id}` });
    ok(((tl.json.items as { id: string }[]) ?? []).every((x) => [i1, i2, i3].includes(x.id)), "eğitmen ?trainer= ile başka eğitmeni filtreleyemez (yok sayılır)");
    // ── C) Ayrı iptal günlüğü kaldırıldı (FAZ 8 owner kararı) ───────────────────────────────
    section("C · Ayrı iptal günlüğü YOK");
    await call(tDelete, "user", A, { method: "POST", body: { ids: [i1], confirmCount: 1 } });
    const jr = await su.query(`select count(*)::int n from pg_proc where proname in ('hd_edu_priv_owner_journal','hd_edu_priv_owner_apply_journal')`);
    ok(jr.rows[0].n === 0, "iptal günlüğü RPC'leri şemada YOK");
    const jroute = existsSync(path.join(process.cwd(), "app/api/admin/hd/education/private/journal/route.ts"));
    ok(!jroute, "iptal günlüğü API ucu YOK");
    ok((await su.query(`select count(*)::int n from public.hd_edu_private_audit where action = 'consent_withdrawn'`)).rows[0].n >= 1, "olağan denetim izi (izin geri çekme) AYNEN yazılıyor");

    // ── D) Eski yedekten geri yükleme RİSKİ (owner kararıyla kabul; ayrı kurtarma sistemi YOK) ──
    section("D · Eski yedekten geri yükleme riski (belgelenen, kabul edilen)");
    const ca4 = await client(A), cha4 = await chart(A, ca4), k4 = await consent(A, ca4), i4 = await add(A, cha4, k4, "Yedekte açık");
    const C2 = await mk("EGITMEN_C2");
    await su.query(`select public.hd_education_grant_access($1,$2,null)`, [OWNER.id, C2.id]);
    await su.query(`create schema zz_yedek`);
    for (const t of PRIV_TABLES) await su.query(`create table zz_yedek.${t} as select * from public.${t}`);
    ok(true, "T0 yedeği (tam pg_dump'ın bu tablolardaki içeriğine eşdeğer satır kopyası)");
    await call(tWd, "user", A, { method: "POST", params: { id: k4 }, body: { channel: "danisan_talebi", confirm: true } });
    await call(tDelete, "user", A, { method: "POST", body: { ids: [i2], confirmCount: 1 } });
    await call(oAccess.POST, "admin", OWNER, { method: "POST", body: { userId: C2.id, enabled: false } });
    ok((await call(tItem, "user", A, { params: { id: i4 } })).status === 404, "canlı sistem: izin geri çekilince erişim ANINDA kapalı");
    await su.query(`set session_replication_role = replica`);
    await su.query(`truncate ${PRIV_TABLES.map((t) => `public.${t}`).join(", ")}`);
    for (const t of PRIV_TABLES) await su.query(`insert into public.${t} select * from zz_yedek.${t}`);
    await su.query(`set session_replication_role = origin`);
    const r = (await su.query(`select
      (select withdrawn_at is null from public.hd_edu_private_consents where id = $1) as k4_acik,
      (select count(*) from public.hd_edu_private_items where id = $2)::int as i2_var,
      (select count(*) from public.hd_education_access_grants where user_id = $3 and revoked_at is null)::int as c2_yetki`, [k4, i2, C2.id])).rows[0];
    ok(r.k4_acik === true && r.i2_var === 1 && r.c2_yetki === 1, "BİLİNEN RİSK (gizlenmedi): eski yedekten dönüşte yedekten SONRAKİ izin geri çekme / kayıt silme / yetki kapatma eski hâline döner", r);
    await call(oOverview.POST, "admin", OWNER, { method: "POST", body: { action: "close", confirm: true } });
    ok((await call(tItem, "user", A, { params: { id: i4 } })).status === 404, "owner'ın mevcut acil kapatma anahtarı geri yükleme sonrası tüm eğitmen erişimini kapatır");
    await call(oOverview.POST, "admin", OWNER, { method: "POST", body: { action: "open", confirm: true } });

    // ── E) Hız sınırı: olağan kullanım SINIRSIZ, olağan dışı davranış sınırlı ─────────────
    section("E · Hız sınırı (owner kararı)");
    // Ders akışı: 150 harita açma (10'lu dalgalar; test PostgREST shim'i tek süreçte yüksek eşzamanlılıkta kaynak hatası verir).
    const views: Awaited<ReturnType<typeof call>>[] = [];
    for (let w = 0; w < 15; w++) views.push(...await Promise.all(Array.from({ length: 10 }, () => call(tItem, "user", A, { params: { id: i4 } }))));
    const viewsList = await Promise.all(Array.from({ length: 50 }, () => call(tItems.GET, "user", A)));
    ok(views.every((v) => v.status === 200) && viewsList.every((v) => v.status === 200),
      "olağan ders kullanımı: 150 harita açma + 50 liste isteği → hepsi 200, HİÇ 429 yok", [...new Set(views.map((v) => v.status))]);
    const D = await mk("OTOMASYON_D");
    await su.query(`select public.hd_education_grant_access($1,$2,null)`, [OWNER.id, D.id]);
    const cd = await client(D);
    let firstLimited = -1;
    for (let n2 = 0; n2 < 32; n2++) {
      const rr = await call(tConsents.POST, "user", D, { method: "POST", body: {
        hdClientId: cd, consenterName: "ZZ Oto", relation: "danisan", displayScope: "anonim", includeBirthData: false, namedConfirmed: false,
        textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } });
      if (rr.status === 429) { firstLimited = n2; ok(rr.json.code === "RATE_LIMITED", "429 gövdesi RATE_LIMITED"); break; }
    }
    ok(firstLimited === 30, "toplu belge yükleme: 30 izin/saat sonrası 429 (otomasyon)", firstLimited);
    let probes = 0, limitedAt = -1;
    for (; probes < 310; probes++) {
      const rr = await call(tItem, "user", D, { params: { id: randomUUID() } });
      if (rr.status === 429) { limitedAt = probes; break; }
    }
    ok(limitedAt === 300, "kayıt kimliği tahmini: 300 'bulunamadı' / 10 dk sonrası 429", limitedAt);
    let delLimited = -1;
    for (let n3 = 0; n3 < 62; n3++) {
      const rr = await call(tDelete, "user", D, { method: "POST", body: { ids: [randomUUID()], confirmCount: 1 } });
      if (rr.status === 429) { delLimited = n3; break; }
    }
    ok(delLimited === 60, "kısa sürede aşırı silme: 60 istek / 10 dk sonrası 429", delLimited);
    ok((await call(tItem, "user", A, { params: { id: i4 } })).status !== 429, "bir kullanıcının sınırı diğer eğitmeni etkilemez");
    ok(external.length === 0, "dış ağ / Roxy çağrısı 0", external);
  } finally {
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });

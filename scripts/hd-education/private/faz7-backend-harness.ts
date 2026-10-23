/**
 * FAZ 7 — Özel eğitim arşivi: yeni backend uçları + FELAKET KURTARMA (geri yükleme) provası.
 * İzole embedded-postgres + gerçek migration + gerçek route'lar; sentetik veri; dış ağ 0.
 *  A) D akışı uygunluk yoklaması (kendi / başka tenant / mükerrer / manuel / danışansız)
 *  B) Owner listesi gerçek filtreleri (eğitmen + durum + arama), uzman araması (yalnız hesap metadata'sı)
 *  C) İptal günlüğü: kişisel içerik yok, SHA, arşiv açıkken uygulama RED, kurcalanmış günlük RED
 *  D) Geri yükleme provası: eski "yedek" (7 tablo satır kopyası) → pg_restore --disable-triggers eşdeğeri (replika modu)
 *     → dirilmenin KANITI → arşiv kapat → günlük uygula → geri çekilmiş izin / silinmiş kayıt / iptal edilmiş yetki DİRİLMEDİ;
 *     ikinci uygulama idempotent; eğitmen erişimi güncel iptal durumuyla doğrulanır.
 * Çalıştır: npx tsx scripts/hd-education/private/faz7-backend-harness.ts   (HD_EDU_PRIV_F7_PORT, varsayılan 54771)
 */
import "../../hd-analysis-word-flow/env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
const PRIV_TABLES = ["hd_edu_private_control", "hd_edu_private_grants", "hd_edu_private_consent_texts", "hd_edu_private_consents",
  "hd_edu_private_consent_evidence", "hd_edu_private_items", "hd_edu_private_audit"];
const OUT = process.env.HD_EDU_F7_OUT ?? "";

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
    const tConsentDel = (await R("hd/education/private/consents/[id]")).DELETE;
    const oItems = (await R("admin/hd/education/private/items")).GET;
    const oOverview = await R("admin/hd/education/private/overview");
    const oJournal = await R("admin/hd/education/private/journal");
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
    const ADMIN = await mk("ADMIN", "admin");
    const A = await mk("EGITMEN_A"), B = await mk("EGITMEN_B"), C = await mk("ADAY_C"), PASIF = await mk("PASIF", "expert", { active: false }), NOHD = await mk("NOHD", "expert", { hd: false });
    await su.query(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await su.query(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const w of [A, B]) await su.query(`select public.hd_edu_priv_owner_grant($1,$2,null)`, [OWNER.id, w.id]);
    const sha = (await su.query(`select body_sha256 from public.hd_edu_private_consent_texts`)).rows[0].body_sha256 as string;
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
    section("B · Owner gerçek filtreleri + uzman araması");
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
    const ex = await call(oOverview.GET, "admin", OWNER, { query: "?experts=zz_f7" });
    const experts = (ex.json.experts as { id: string; eligible: boolean; reason: string | null; granted: boolean }[]) ?? [];
    const ofE = (w: { id: string }) => experts.find((e) => e.id === w.id);
    ok(ex.status === 200 && ofE(A)?.granted === true && ofE(C)?.eligible === true && ofE(C)?.granted === false, "uzman araması: A yetkili, C uygun");
    ok(ofE(PASIF)?.reason === "Pasif hesap" && ofE(NOHD)?.reason === "Human Design izni yok" && !ofE(ADMIN), "uygunsuz uzman gerekçeli; admin listede yok");
    ok(!/tenant|module_permissions|is_super_admin|approval_status/.test(JSON.stringify(experts)) && !ex.body.includes(A.tenant), "uzman listesinde yalnız ad / e-posta / uygunluk (tenant / izin yapısı yok)");
    ok((await call(oOverview.GET, "admin", ADMIN, { query: "?experts=zz" })).status === 404, "normal admin uzman araması → 404");

    // ── C) İptal günlüğü ─────────────────────────────────────────────────────────────────
    section("C · İptal günlüğü");
    await call(tDelete, "user", A, { method: "POST", body: { ids: [i1], confirmCount: 1 } });
    await call(oOverview.POST, "admin", OWNER, { method: "POST", body: { action: "revoke", userId: B.id } });
    const j1 = await call(oJournal.GET, "admin", OWNER);
    const J = j1.json.journal as { format: string; events: { k: string; id: string }[]; sha256: string };
    ok(j1.status === 200 && J.format === "hd-edu-priv-journal-1" && /^[0-9a-f]{64}$/.test(J.sha256), "günlük dışa aktarıldı (biçim + SHA)");
    ok(J.events.some((e) => e.k === "consent_withdrawn" && e.id === k3) && J.events.some((e) => e.k === "item_deleted" && e.id === i1) && J.events.some((e) => e.k === "grant_revoked"),
      "günlük: izin geri çekme + kayıt silme + yetki iptali olayları");
    ok(!/ZZ_DANISAN|ZZ İzin|ZZ başlık|Sakral|ZZ_F7_/.test(j1.body) && !j1.body.includes(A.tenant), "günlükte kişisel içerik / ad / başlık / tenant YOK");
    ok((await call(oJournal.GET, "admin", ADMIN)).status === 404 && (await call(oJournal.GET, "user", A)).status === 404, "admin / eğitmen günlüğe erişemez");
    const openApply = await call(oJournal.POST, "admin", OWNER, { method: "POST", body: { journal: J, confirm: true } });
    ok(openApply.status === 409 && openApply.json.code === "ARCHIVE_OPEN", "arşiv AÇIKKEN günlük uygulanamaz (409)");

    // ── D) Geri yükleme provası ───────────────────────────────────────────────────────────
    section("D · Felaket kurtarma: eski yedekten geri yükleme");
    // T0 "yedeği": şu an değil — iptallerden ÖNCEKİ durumu temsil etmek için önce yeni durum kur, yedek al, sonra iptal et.
    const ca4 = await client(A), cha4 = await chart(A, ca4), k4 = await consent(A, ca4), i4 = await add(A, cha4, k4, "Yedekte açık");
    const C2 = await mk("EGITMEN_C2");
    await su.query(`select public.hd_edu_priv_owner_grant($1,$2,null)`, [OWNER.id, C2.id]);
    await su.query(`create schema zz_yedek`);
    for (const t of PRIV_TABLES) await su.query(`create table zz_yedek.${t} as select * from public.${t}`);
    await su.query(`create table zz_yedek.users as select * from public.users`);
    ok(true, "T0 yedeği alındı (7 tablo; tam pg_dump'ın bu tablolardaki içeriğine eşdeğer)");
    // T0 SONRASI iptaller:
    await call(tWd, "user", A, { method: "POST", params: { id: k4 }, body: { channel: "danisan_talebi", confirm: true } }); // izin geri çekildi
    await call(tDelete, "user", A, { method: "POST", body: { ids: [i2], confirmCount: 1 } });                               // kayıt silindi
    await call(tConsentDel, "user", A, { method: "DELETE", params: { id: k1 }, body: { confirm: true } });                 // izin silindi
    await call(oOverview.POST, "admin", OWNER, { method: "POST", body: { action: "revoke", userId: C2.id } });             // yetki iptal
    const journal = (await call(oJournal.GET, "admin", OWNER)).json.journal as Record<string, unknown>;
    if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(path.join(OUT, "ornek-iptal-gunlugu-sentetik.json"), JSON.stringify(journal, null, 2)); }
    // FELAKET → T0 yedeğine geri yükleme (pg_restore --disable-triggers eşdeğeri: replika modu, FK/tetikleyici kapalı).
    await su.query(`set session_replication_role = replica`);
    await su.query(`truncate ${PRIV_TABLES.map((t) => `public.${t}`).join(", ")}`);
    for (const t of PRIV_TABLES) await su.query(`insert into public.${t} select * from zz_yedek.${t}`);
    await su.query(`set session_replication_role = origin`);
    const resurrected = (await su.query(`select
      (select withdrawn_at is null from public.hd_edu_private_consents where id = $1) as k4_acik,
      (select count(*) from public.hd_edu_private_items where id = $2)::int as i2_var,
      (select count(*) from public.hd_edu_private_consents where id = $3)::int as k1_var,
      (select count(*) from public.hd_edu_private_grants where user_id = $4 and revoked_at is null)::int as c2_yetki,
      (select archive_open from public.hd_edu_private_control) as acik`, [k4, i2, k1, C2.id])).rows[0];
    ok(resurrected.k4_acik === true && resurrected.i2_var === 1 && resurrected.k1_var === 1 && resurrected.c2_yetki === 1,
      "KANIT: günlüksüz geri yükleme izin / kayıt / yetkiyi DİRİLTİR (risk gerçek)", resurrected);
    ok(resurrected.acik === true && (await call(tItem, "user", A, { params: { id: i4 } })).status === 200, "KANIT: yedekte anahtar açıksa geri çekilmiş izinli kayıt yeniden okunabilir → runbook adım 1 zorunlu");
    // Runbook: 1) arşivi kapat 2) en güncel günlüğü uygula 3) incele 4) aç.
    await call(oOverview.POST, "admin", OWNER, { method: "POST", body: { action: "close", confirm: true } });
    ok((await call(tItem, "user", A, { params: { id: i4 } })).status === 404, "adım 1 (kapat) → eğitmen erişimi anında kapalı");
    const tampered = { ...journal, events: [...(journal.events as unknown[]), { k: "item_deleted", id: i4, at: "2026-01-01T00:00:00.000000Z" }] };
    const tamp = await call(oJournal.POST, "admin", OWNER, { method: "POST", body: { journal: tampered, confirm: true } });
    ok(tamp.status === 400 && tamp.json.code === "JOURNAL_INVALID", "kurcalanmış günlük (SHA uyuşmaz) → RED");
    ok((await call(oJournal.POST, "admin", OWNER, { method: "POST", body: { journal } })).status === 400, "onaysız uygulama → RED");
    const ap = await call(oJournal.POST, "admin", OWNER, { method: "POST", body: { journal, confirm: true } });
    const res = ap.json.result as Record<string, number>;
    ok(ap.status === 200 && res.consents_withdrawn >= 1 && res.items_deleted >= 1 && res.consents_deleted >= 1 && res.grants_revoked >= 1, "günlük uygulandı", res);
    const after = (await su.query(`select
      (select withdrawn_at is not null from public.hd_edu_private_consents where id = $1) as k4_kapali,
      (select count(*) from public.hd_edu_private_items where id = $2)::int as i2_var,
      (select count(*) from public.hd_edu_private_consents where id = $3)::int as k1_var,
      (select count(*) from public.hd_edu_private_items where consent_id = $3)::int as k1_kayit,
      (select count(*) from public.hd_edu_private_grants where user_id = $4 and revoked_at is null)::int as c2_yetki,
      (select count(*) from public.hd_edu_private_grants where user_id = $5 and revoked_at is null)::int as b_yetki`, [k4, i2, k1, C2.id, B.id])).rows[0];
    ok(after.k4_kapali === true, "geri çekilmiş izin yeniden AÇILMADI");
    ok(after.i2_var === 0 && after.k1_var === 0 && after.k1_kayit === 0, "silinmiş kayıt ve izin sessizce DİRİLMEDİ");
    ok(after.c2_yetki === 0 && after.b_yetki === 0, "iptal edilmiş eğitmen yetkileri tekrar verilmedi");
    const again = (await call(oJournal.POST, "admin", OWNER, { method: "POST", body: { journal, confirm: true } })).json.result as Record<string, number>;
    ok(again.consents_withdrawn === 0 && again.items_deleted === 0 && again.consents_deleted === 0 && again.grants_revoked === 0, "ikinci uygulama idempotent (0 değişiklik)");
    await call(oOverview.POST, "admin", OWNER, { method: "POST", body: { action: "open", confirm: true } });
    ok((await call(tItem, "user", A, { params: { id: i4 } })).status === 404, "açıldıktan sonra: geri çekilmiş izinli kayıt 404 (güncel iptal durumu)");
    ok((await call(tItems.GET, "user", C2)).status === 404 && (await call(tItems.GET, "user", B)).status === 404, "iptal edilmiş eğitmenler 404");
    const aList = ((await call(tItems.GET, "user", A)).json.items as { id: string; state: string }[]).map((x) => `${x.id}:${x.state}`);
    ok(!aList.some((x) => x.startsWith(i2) || x.startsWith(i1)), "A listesinde silinmiş kayıtlar yok");
    const aud = (await su.query(`select detail::text d from public.hd_edu_private_audit where action='journal_applied'`)).rows;
    ok(aud.length === 2 && aud.every((r) => !/ZZ_|başlık/.test(r.d)), "uygulama denetimi: 2 olay, içerik yok");
    ok(external.length === 0, "dış ağ / Roxy çağrısı 0", external);
  } finally {
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });

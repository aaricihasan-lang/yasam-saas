/**
 * HD Hazır Eğitim Haritaları — FAZ 2-B3 testi: EĞİTMEN kataloğu + kişi ayrıntısı + HD giriş kartı yoklaması.
 * İzole embedded-postgres + PostgREST shim + migration 20271110000000 + 20271112000000 + GERÇEK route'lar.
 * Yayın, owner'ın GERÇEK B2 uçlarıyla yapılır (doğrula → hukuk inceleme kaydı → onay → yayımla). Snapshot SENTETİKTİR
 * (repo fixture'ı + gerçek normalizasyon zinciri; ZZ_* kişileri) — gerçek kişi haritası veya gerçek sağlayıcı doğrulaması DEĞİLDİR.
 * Ağ kilidi: localhost dışı HER istek reddedilir ve sayılır (sağlayıcı çağrısı beklenen sayı: 0).
 * Çalıştır: npx tsx scripts/hd-education/b3-harness.ts   (HD_EDU_B3_PG_PORT, varsayılan 54565)
 */
import "../hd-analysis-word-flow/env"; // server-only stub + sahte Roxy anahtarı (kullanılmaz; ağ kilitli)
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { syntheticEducationSnapshot } from "./syntheticSnapshot";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = process.cwd();
const MIG = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"].map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
const PRE_DDL = `create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid,
  target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`;
const RPCS = ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"];

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(h: Handler, auth: { kind: "user" | "admin"; id?: string; token?: string } | null, o: { method?: string; body?: unknown; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest("http://localhost/api/test", { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const body = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control") };
}

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
    port: Number(process.env.HD_EDU_B3_PG_PORT ?? 54565), dirName: `hd-edu-b3-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: RPCS, extraSql: [PRE_DDL, ...MIG],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
  delete process.env.HD_EDUCATION_PROVIDER_CALLS_ENABLED;
  const su = env.su;
  const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
  try {
    const viewAccess = (await import("../../app/api/hd/education/access/route")).GET as unknown as Handler;
    const viewList = (await import("../../app/api/hd/education/charts/route")).GET as unknown as Handler;
    const viewDetail = (await import("../../app/api/hd/education/charts/[id]/route")).GET as unknown as Handler;
    const ownerAccessPost = (await import("../../app/api/admin/hd/education/access/route")).POST as unknown as Handler;
    const ownerAct = (await import("../../app/api/admin/hd/education/subjects/[id]/route")).POST as unknown as Handler;

    // ── Tohum (sentetik) ────────────────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await q(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_B3_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; tenant?: string; superAdmin?: boolean; demo?: boolean } = {}): Promise<Who> => {
      const id = randomUUID();
      const token = `zz-b3-tok-${++seq}-${id.slice(0, 8)}`;
      const role = o.role ?? "expert";
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8,$9)`,
        [id, `ZZ_B3_${label}`, `zz.b3.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}),
          o.tenant ?? T[0], o.demo === true, o.superAdmin === true, role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin" });
    const E: Who[] = [];
    for (let i = 0; i < 100; i++) E.push(await mk(`E${String(i).padStart(3, "0")}`, { tenant: T[i % 4] }));
    const asOwner = { kind: "admin" as const, id: OWNER.id, token: OWNER.token };
    const asUser = (w: Who) => ({ kind: "user" as const, id: w.id, token: w.token });
    const grant = async (w: Who) => (await call(ownerAccessPost, asOwner, { method: "POST", body: { action: "grant", userId: w.id } })).status;
    const revoke = async (w: Who) => (await call(ownerAccessPost, asOwner, { method: "POST", body: { action: "revoke", userId: w.id } })).status;
    const act = async (id: string, body: Record<string, unknown>) => call(ownerAct, asOwner, { method: "POST", body, params: { id } });

    const notFoundBodies = new Set<string>();
    const nonNoStore: string[] = [];
    const track = (label: string, r: Res) => { if (r.cache !== "no-store") nonNoStore.push(`${label}:${r.status}`); if (r.status === 404) notFoundBodies.add(r.body); return r; };

    // Kişiler: A, B yayımlanacak; DRAFT hesaplı ama taslak; WD yayımlanıp kaldırılacak; STALE/UTCX/LEGALX okuma-anı savunması.
    const mkSubject = async (key: string, name: string, cat: string, utc: string, local: string, offset: number) => {
      const id = randomUUID();
      const date = local.slice(0, 10);
      await q(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, latitude, longitude,
                 documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, legal_status, legal_note, blockers)
               values ($1,$2,'ZZ-B3',$3,$4,false,$5,'ZZ Şehir',48.85,2.35,$6,'ZZ sentetik belge ifadesi','ZZ şehir ortalama saati',$7,'Europe/Paris',$8,'VERIFIED','LOW_UNREVIEWED','ZZ',array['AVUKAT-GÖRMEDİ'])`,
        [id, key, name, cat, date, local.slice(11, 16), offset, utc]);
      await q(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, archive_ref, time_explicit, primary_secondary)
               values ($1,1,'birth_time','https://example.test/zz-b3-belge','ZZ Arşiv','ZZ Doğum Kaydı','ZZ-1',true,'birincil')`, [id]);
      await q(`insert into public.hd_education_publications (subject_id) values ($1)`, [id]);
      const syn = syntheticEducationSnapshot(utc, 48.85, 2.35, 1);
      const ch = (await q(`insert into public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, engine_version, contract_version,
                 computed_result, provider_raw, provider_raw_sha256, design_instant_utc, time_check, boundary_flags, calc_status, created_by)
               values ($1,1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'OK',$15) returning id`,
        [id, JSON.stringify(syn.request_body), syn.request_hash, syn.provider, syn.endpoint, syn.adapter_version, syn.engine_version, syn.contract_version,
          JSON.stringify(syn.computed_result), JSON.stringify(syn.provider_raw), syn.provider_raw_sha256, syn.design_instant_utc, JSON.stringify(syn.time_check),
          JSON.stringify(syn.boundary_flags), OWNER.id])).rows[0].id as string;
      return { id, chartId: ch, name };
    };
    const publish = async (s: { id: string; chartId: string }) => {
      const steps = [
        await act(s.id, { action: "verify_chart", chartId: s.chartId }),
        await act(s.id, { action: "legal_review", reference: "AV-ZZ-B3-001" }),
        await act(s.id, { action: "approve", legalClearanceRef: "HK-ZZ-B3-1" }),
        await act(s.id, { action: "publish" }),
      ];
      return steps.map((r) => r.status);
    };
    const A = await mkSubject("zz-b3-a-1869-11-22", "ZZ Sentetik Bilimci", "bilim", "1869-11-22T02:50:39Z", "1869-11-22T03:00:00", 561);
    const B = await mkSubject("zz-b3-b-1901-05-05", "ZZ Sentetik Sanatçı Çok Uzun Bir Adla Taşma Denemesi", "sanat", "1901-05-05T09:00:00Z", "1901-05-05T10:00:00", 3600);
    const DRAFT = await mkSubject("zz-b3-draft-1902-01-01", "ZZ Sentetik Taslak Kişi", "tarih", "1902-01-01T09:00:00Z", "1902-01-01T10:00:00", 3600);
    const WD = await mkSubject("zz-b3-wd-1903-01-01", "ZZ Sentetik Kaldırılan", "muzik", "1903-01-01T09:00:00Z", "1903-01-01T10:00:00", 3600);
    const STALE = await mkSubject("zz-b3-stale-1904-01-01", "ZZ Sentetik Eski Revizyon", "bilim", "1904-01-01T09:00:00Z", "1904-01-01T10:00:00", 3600);
    const UTCX = await mkSubject("zz-b3-utcx-1905-01-01", "ZZ Sentetik UTC Bozuk", "bilim", "1905-01-01T09:00:00Z", "1905-01-01T10:00:00", 3600);
    const LEGALX = await mkSubject("zz-b3-legalx-1906-01-01", "ZZ Sentetik Hukuk Geri", "bilim", "1906-01-01T09:00:00Z", "1906-01-01T10:00:00", 3600);

    section("A. Yetki + boş katalog (yayın yok)");
    {
      ok(await grant(E[0]) === 200 && await grant(E[1]) === 200, "owner 2 eğitmene yetki verdi");
      const r = track("list-empty", await call(viewList, asUser(E[0])));
      ok(r.status === 200 && Array.isArray(r.json.items) && (r.json.items as unknown[]).length === 0, "yayın yokken yetkili eğitmen: 200 + BOŞ katalog (hata değil, sahte kart yok)", r.json);
      const d = track("detail-draft-before", await call(viewDetail, asUser(E[0]), { params: { id: A.id } }));
      ok(d.status === 404, "yayımlanmamış kayıt ayrıntısı → 404");
    }

    section("B. Owner yayın akışı (gerçek B2 uçları)");
    for (const s of [A, B, WD, STALE, UTCX, LEGALX]) {
      const st = await publish(s);
      ok(st.every((x) => x === 200), `yayımlandı: ${s.name.slice(0, 28)}`, st);
    }
    ok((await act(WD.id, { action: "withdraw", reason: "ZZ eğitim içeriği güncelleniyor" })).status === 200, "WD gerekçeyle yayından kaldırıldı");

    section("C. 100 uzman / 2 yetkili / 98 ret (katalog + ayrıntı + kart yoklaması)");
    {
      let allowed = 0; let denied = 0; const wrong: string[] = [];
      for (const [i, w] of E.entries()) {
        const a = track(`acc-${i}`, await call(viewAccess, asUser(w)));
        const l = track(`list-${i}`, await call(viewList, asUser(w)));
        const d = track(`det-${i}`, await call(viewDetail, asUser(w), { params: { id: A.id } }));
        const yes = a.status === 200 && l.status === 200 && d.status === 200;
        const no = a.status === 404 && l.status === 404 && d.status === 404;
        if (i < 2 ? yes : no) { if (i < 2) allowed++; else denied++; } else wrong.push(`E${i}:${a.status}/${l.status}/${d.status}`);
      }
      ok(allowed === 2 && denied === 98 && wrong.length === 0, `100 uzman → ${allowed} izinli / ${denied} ret`, wrong.slice(0, 5));
      const l = await call(viewList, asUser(E[0]));
      const names = ((l.json.items ?? []) as Array<{ displayName: string; id: string }>).map((x) => x.id);
      ok(names.length === 5 && names.includes(A.id) && names.includes(B.id) && !names.includes(DRAFT.id) && !names.includes(WD.id), "katalog YALNIZ yayımlı kayıtlar (taslak + kaldırılan yok)", names.length);
      const a = await call(viewAccess, asUser(E[0]));
      ok((a.json.card as { title?: string } | undefined)?.title === "Hazır Eğitim Haritaları", "kart yoklaması: başlık sunucudan");
    }

    section("D. Kişi ayrıntısı — kayıtlı snapshot + yanıt hijyeni");
    {
      const d = track("detail-A", await call(viewDetail, asUser(E[0]), { params: { id: A.id } }));
      const it = d.json.item as Record<string, unknown> & { chart: { result: Record<string, unknown>; render: { centers?: unknown[] } | null; version: number }; sources: unknown[] };
      ok(d.status === 200 && it.birthDate === "1869-11-22" && it.documentedLocalTime === "03:00" && it.birthUtc === "1869-11-22T02:50:39Z", "takvim tarihi metin olarak korunur (22.11.1869 kayması yok) + saniyeli UTC", [it?.birthDate, it?.birthUtc]);
      ok(!!it.chart?.result && typeof it.chart.result === "object" && Array.isArray(it.chart.render?.centers) && it.chart.render!.centers!.length === 9, "kayıtlı computed_result + yapısal render yükü (9 merkez)");
      ok(/modern saat dilimi kuralı kullanılmaz/.test(String(it.utcMethodology)) && it.utcOffsetSeconds === 561, "UTC metodolojisi + saniyeli ofset");
      ok(Array.isArray(it.sources) && it.sources.length === 1, "güncel revizyon kaynakları");
      const leak = /provider_raw|request_body|request_hash|x-api-key|zz-harness-fake-roxy-key|AV-ZZ-B3|HK-ZZ-B3|legal_clearance|chart_verified_by|approved_by|legalReviewRef|blockers/;
      ok(!leak.test(d.body) && !d.body.includes(OWNER.id), "ham yanıt / istek gövdesi / hash / anahtar / hukuk iç referansı / owner kimliği YOK", d.body.match(leak)?.[0]);
      ok(d.cache === "no-store", "ayrıntı no-store");
    }

    section("E. Hatalı kimlik / yayımlanmamış / kaldırılmış");
    {
      for (const [label, id] of [["taslak (hesaplı)", DRAFT.id], ["yayından kaldırılmış", WD.id], ["rastgele uuid", randomUUID()], ["uuid değil", "abc"], ["yol denemesi", "../../admin"], ["boş", ""], ["SQL benzeri", "' or 1=1 --"]] as const) {
        const r = track(`bad-${label}`, await call(viewDetail, asUser(E[0]), { params: { id } }));
        ok(r.status === 404, `ayrıntı 404: ${label}`, r.status);
      }
    }

    section("F. Okuma anı savunması (DB tetikleyicileri atlatılmış tutarsızlık simülasyonu)");
    {
      // Yalnız test: süper kullanıcı tetikleyicileri devre dışı bırakarak yayındaki kaydı bozar → eğitmen görmemeli.
      await q(`set session_replication_role = replica`);
      await q(`update public.hd_education_subjects set revision = 2 where id = $1`, [STALE.id]);
      await q(`update public.hd_education_subjects set birth_utc = '1905-01-01T09:01:00Z' where id = $1`, [UTCX.id]);
      await q(`update public.hd_education_subjects set legal_status = 'LOW_UNREVIEWED' where id = $1`, [LEGALX.id]);
      await q(`set session_replication_role = origin`);
      for (const [label, s] of [["eski kaynak revizyonu (snapshot geçersiz)", STALE], ["UTC kanıtı tutarsız", UTCX], ["hukuk incelemesi geri alınmış", LEGALX]] as const) {
        const r = track(`def-${label}`, await call(viewDetail, asUser(E[0]), { params: { id: s.id } }));
        ok(r.status === 404, `ayrıntı gizlendi: ${label}`, r.status);
      }
      const l = await call(viewList, asUser(E[0]));
      const ids = ((l.json.items ?? []) as Array<{ id: string }>).map((x) => x.id);
      ok(ids.length === 2 && ids.includes(A.id) && ids.includes(B.id), "katalogdan da düştü (yalnız A + B)", ids.length);
    }

    section("G. Uygunluk değişimi — her biri ayrı yetkili eğitmen (anında 404)");
    {
      const cases: Array<[string, number, string, unknown[]]> = [
        ["demo yapıldı", 4, `update public.users set is_demo_account = true where id = $1`, []],
        ["pasif yapıldı", 8, `update public.users set active = false where id = $1`, []],
        ["premium bitti (pro)", 12, `update public.users set package_type = 'pro', plan = 'pro' where id = $1`, []],
        ["HD izni kapatıldı", 16, `update public.users set module_permissions = '{"human_design":false,"clients":true}'::jsonb where id = $1`, []],
        ["onay geri alındı", 20, `update public.users set approval_status = 'pending' where id = $1`, []],
        ["tenant değişti", 24, `update public.users set tenant_id = $2 where id = $1`, [T[4]]],
        ["admin yapıldı", 28, `update public.users set role = 'admin' where id = $1`, []],
      ];
      for (const [label, i, sql, extra] of cases) {
        const w = E[i];
        ok(await grant(w) === 200, `ön koşul: ${label} için yetki verildi`);
        const before = await call(viewList, asUser(w));
        await q(sql, [w.id, ...extra]);
        const a = track(`elig-a-${label}`, await call(viewAccess, asUser(w)));
        const l = track(`elig-l-${label}`, await call(viewList, asUser(w)));
        const d = track(`elig-d-${label}`, await call(viewDetail, asUser(w), { params: { id: A.id } }));
        ok(before.status === 200 && a.status === 404 && l.status === 404 && d.status === 404, `${label} → kart/katalog/ayrıntı 404`, [before.status, a.status, l.status, d.status]);
      }
      // Rol geri alınsa da yetki KENDİLİĞİNDEN dönmez (kalıcı iptal).
      await q(`update public.users set role = 'expert' where id = $1`, [E[28].id]);
      const back = await call(viewList, asUser(E[28]));
      const g = Number((await q(`select count(*)::int n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [E[28].id])).rows[0].n);
      ok(back.status === 404 && g === 0, "admin → tekrar uzman: yetki kalıcı kapalı (owner yeniden vermeli)", [back.status, g]);
      // Tenant değişimi de kalıcı iptal (eski tenant'a dönse de).
      await q(`update public.users set tenant_id = $2 where id = $1`, [E[24].id, T[0]]);
      ok((await call(viewList, asUser(E[24]))).status === 404, "tenant geri alındı: yetki yine kapalı");
    }

    section("H. Yetki kaldırma + oturum taklidi + eski token");
    {
      ok(await revoke(E[1]) === 200, "owner E1 yetkisini kaldırdı");
      const r = track("revoked", await call(viewDetail, asUser(E[1]), { params: { id: A.id } }));
      ok(r.status === 404 && (await call(viewList, asUser(E[1]))).status === 404, "kaldırma anında: açık sekme veri çekemez (404)");
      const spoof: Array<[string, { kind: "user" | "admin"; id?: string; token?: string } | null]> = [
        ["yetkisiz uzman, yetkili eğitmenin id'siyle (kendi token'ı)", { kind: "user", id: E[0].id, token: E[50].token }],
        ["yetkili id, token yok", { kind: "user", id: E[0].id }],
        ["yetkili id, sahte token", { kind: "user", id: E[0].id, token: "zz-sahte" }],
        ["oturumsuz", null],
        ["owner (admin başlığı)", asOwner],
        ["owner (kullanıcı başlığı)", { kind: "user", id: OWNER.id, token: OWNER.token }],
        ["normal admin", { kind: "user", id: ADMIN.id, token: ADMIN.token }],
      ];
      for (const [label, a] of spoof) {
        const l = track(`spoof-l-${label}`, await call(viewList, a));
        const d = track(`spoof-d-${label}`, await call(viewDetail, a, { params: { id: A.id } }));
        const c = track(`spoof-a-${label}`, await call(viewAccess, a));
        ok(l.status === 404 && d.status === 404 && c.status === 404, `404: ${label}`, [l.status, d.status, c.status]);
      }
      const oldTok = `zz-b3-old-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [E[0].id, oldTok]);
      ok((await call(viewList, { kind: "user", id: E[0].id, token: oldTok })).status === 200, "ikinci oturum geçerliyken 200");
      await q(`update public.user_sessions set is_active = false, ended_at = now(), end_reason = 'logout' where session_token = $1`, [oldTok]);
      ok((await call(viewList, { kind: "user", id: E[0].id, token: oldTok })).status === 404, "kapatılmış (eski) token → 404");
    }

    section("I. Yan etkisizlik: sağlayıcı 0, danışan/HD/YH yazımı 0");
    {
      const countAll = async () => {
        const rows = (await q(`select c.relname as t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as n
                                 from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' order by 1`)).rows as Array<{ t: string; n: number }>;
        return new Map(rows.map((r) => [r.t, r.n]));
      };
      const before = await countAll();
      for (let k = 0; k < 5; k++) {
        await call(viewAccess, asUser(E[0]));
        await call(viewList, asUser(E[0]));
        await call(viewDetail, asUser(E[0]), { params: { id: A.id } });
        await call(viewDetail, asUser(E[0]), { params: { id: B.id } });
      }
      const after = await countAll();
      const changed = [...after.entries()].filter(([t, n]) => before.get(t) !== n).map(([t]) => t);
      ok(changed.length === 0, "20 eğitmen okuması: HİÇBİR tabloda satır sayısı değişmedi (danışan / human_design_* / YH / snapshot dahil)", changed);
      ok(external.length === 0, `dış ağ / sağlayıcı çağrısı 0 (${external.length})`, external);
      const charts = Number((await q(`select count(*)::int n from public.hd_education_charts`)).rows[0].n);
      ok(charts === 7, "yeni snapshot üretilmedi (7 tohum)", charts);
    }

    section("J. Yanıt tekdüzeliği");
    ok(nonNoStore.length === 0, "tüm yanıtlar no-store", nonNoStore.slice(0, 5));
    ok(notFoundBodies.size === 1, "tüm 404'ler AYNI gövde (özellik / sebep sızmaz)", [...notFoundBodies]);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nhd-education B3 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
  // Başarıda açık çıkış YOK: süreç kendiliğinden kapanmalı (açık kaynak bırakılmadığının kanıtı).
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });

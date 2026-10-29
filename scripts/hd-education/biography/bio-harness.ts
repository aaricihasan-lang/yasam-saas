/**
 * HD Hazır Eğitim Haritaları — FAZ 10 "HAYAT HİKÂYESİ" arka uç testi.
 * İzole embedded-postgres + PostgREST shim + migration 20271110 + 20271112 + 20271206000200 + GERÇEK route'lar.
 * Kişiler ve snapshot SENTETİKTİR (ZZ_*); biyografi içe aktarması gerçek araçla (bioImport) yapılır.
 * Ağ kilidi: localhost dışı HER istek reddedilir ve sayılır (sunucu kaynak bağlantılarını indirmemeli → 0).
 * Çalıştır: npx tsx scripts/hd-education/biography/bio-harness.ts [--real-dir <biyografi klasörü>]   (HD_EDU_BIO_PG_PORT, varsayılan 54611)
 */
import "../../hd-analysis-word-flow/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { bioImportReportSql, bioImportSql, bioInsertSql, loadBioDir, parseBioFile } from "./bioImport";
import { isBioChronological, sortBioTimeline } from "../../../lib/human-design/education/biography/biographyContract";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = process.cwd();
const MIG = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271206000200_hd_education_biographies.sql"]
  .map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
const PRE_DDL = `create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid,
  target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`;
const RPCS = ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"];
const argv = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(h: Handler, auth: { kind: "user" | "admin"; id?: string; token?: string } | null, o: { method?: string; body?: unknown; raw?: string; params?: Record<string, string>; query?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  if (o.body !== undefined || o.raw !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const body = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control") };
}

/** Sentetik sözleşme dosyası (ZZ). */
function synthBio(personKey: string, naturalKey: string | null, lang: "tr" | "en", name: string, extra: Record<string, unknown> = {}) {
  return {
    contract: "hd-edu-bio-1", person_key: personKey, natural_key: naturalKey, lang, display_name: name, life_span: "1869–1951", birth_year: 1869, death_year: 1951,
    is_living: false, profession: "ZZ Sentetik bilim insanı", known_for: "ZZ sentetik buluşlar", country: "ZZ Ülke", era: "19.–20. yüzyıl", category: "bilim",
    short_intro: `${name} için sentetik kısa tanıtım. Bu metin yalnız testtir.`,
    sections: [
      { key: "career", title: "Mesleki Hayat", paragraphs: [{ text: "ZZ sentetik mesleki hayat paragrafı.", source_ids: ["s1", "s2"] }] },
      { key: "childhood", title: "Çocukluk ve Aile", paragraphs: [{ text: "ZZ sentetik çocukluk paragrafı.\nİkinci satır.", source_ids: ["s1"] }] },
    ],
    timeline: [
      { date: "1905", title: "ZZ önemli yayın", text: "ZZ sentetik olay.", source_ids: ["s2"] },
      { date: "1869-11-22", title: "Doğumu", text: "", source_ids: ["s1", "s2"] },
      { date: "1951-02", title: "Vefatı", text: "ZZ sentetik.", source_ids: ["s1"] },
    ],
    sources: [
      { id: "s1", title: "ZZ Sentetik Kişi", publisher: "Vikipedi (Türkçe)", kind: "wikipedia", url: "https://tr.wikipedia.org/w/index.php?title=ZZ&oldid=123", accessed_on: "2026-10-24", revision_id: "123", license: "CC BY-SA 4.0", license_url: "https://creativecommons.org/licenses/by-sa/4.0/deed.tr" },
      { id: "s2", title: "ZZ Ansiklopedi maddesi", publisher: "ZZ Ansiklopedi", kind: "encyclopedia", url: "https://example.org/zz-madde", accessed_on: "2026-10-24", revision_id: null, license: null },
    ],
    wikipedia_usage: { direct_quotes: false, adapted_text: false, articles: [{ lang: "tr", title: "ZZ", oldid: "123", url: "https://tr.wikipedia.org/w/index.php?title=ZZ&oldid=123" }], note: "ZZ sentetik not." },
    fact_checks: [
      { claim: "ZZ sentetik çapraz iddia", source_ids: ["s1", "s2"], status: "capraz" },
      { claim: "ZZ sentetik tek kaynaklı iddia", source_ids: ["s2"], status: "tek_kaynak" },
    ],
    neutrality_note: null, open_questions: ["ZZ sentetik açık soru"], content_status: "source_checked",
    ...extra,
  };
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
    port: Number(process.env.HD_EDU_BIO_PG_PORT ?? 54611), dirName: `hd-edu-bio-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: RPCS, extraSql: [PRE_DDL, ...MIG],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
  delete process.env.HD_EDUCATION_PROVIDER_CALLS_ENABLED;
  const su = env.su;
  const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
  const dbErr = async (sql: string, args: unknown[] = []) => { try { await q(sql, args); return null; } catch (e) { return String((e as Error).message); } };
  try {
    const ownerAccessPost = (await import("../../../app/api/admin/hd/education/access/route")).POST as unknown as Handler;
    const ownerAct = (await import("../../../app/api/admin/hd/education/subjects/[id]/route")).POST as unknown as Handler;
    const viewList = (await import("../../../app/api/hd/education/charts/route")).GET as unknown as Handler;
    const viewDetail = (await import("../../../app/api/hd/education/charts/[id]/route")).GET as unknown as Handler;
    const viewBio = (await import("../../../app/api/hd/education/charts/[id]/biography/route")).GET as unknown as Handler;
    const ownList = (await import("../../../app/api/admin/hd/education/biographies/route")).GET as unknown as Handler;
    const ownBio = await import("../../../app/api/admin/hd/education/biographies/[bioId]/route");
    const ownGet = ownBio.GET as unknown as Handler;
    const ownPut = ownBio.PUT as unknown as Handler;
    const ownPost = ownBio.POST as unknown as Handler;

    // ── Tohum ───────────────────────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await q(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_BIO_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; superAdmin?: boolean; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID();
      const token = `zz-bio-tok-${++seq}-${id.slice(0, 8)}`;
      const role = o.role ?? "expert";
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,false,$7,$8)`,
        [id, `ZZ_BIO_${label}`, `zz.bio.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}),
          o.tenant ?? T[0], o.superAdmin === true, role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin" });
    const E1 = await mk("E1");
    const E2 = await mk("E2", { tenant: T[1] });
    const E3 = await mk("E3_NOGRANT");
    const asOwner = { kind: "admin" as const, id: OWNER.id, token: OWNER.token };
    const asAdmin = { kind: "admin" as const, id: ADMIN.id, token: ADMIN.token };
    const asUser = (w: Who) => ({ kind: "user" as const, id: w.id, token: w.token });
    const notFoundBodies = new Set<string>();
    const nonNoStore: string[] = [];
    const track = (label: string, r: Res) => { if (r.cache !== "no-store") nonNoStore.push(`${label}:${r.status}`); if (r.status === 404) notFoundBodies.add(r.body); return r; };

    const mkSubject = async (key: string, name: string, utc: string, local: string, offset: number) => {
      const id = randomUUID();
      await q(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, latitude, longitude,
                 documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, legal_status, legal_note, blockers)
               values ($1,$2,'ZZ-BIO',$3,'bilim',false,$4,'ZZ Şehir',48.85,2.35,$5,'ZZ sentetik belge ifadesi','ZZ şehir ortalama saati',$6,'Europe/Paris',$7,'VERIFIED','LOW_UNREVIEWED','ZZ',array['AVUKAT-GÖRMEDİ'])`,
        [id, key, name, local.slice(0, 10), local.slice(11, 16), offset, utc]);
      await q(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, archive_ref, time_explicit, primary_secondary)
               values ($1,1,'birth_time','https://example.test/zz-bio-belge','ZZ Arşiv','ZZ Doğum Kaydı','ZZ-1',true,'birincil')`, [id]);
      await q(`insert into public.hd_education_publications (subject_id) values ($1)`, [id]);
      const syn = syntheticEducationSnapshot(utc, 48.85, 2.35, 1);
      const ch = (await q(`insert into public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, engine_version, contract_version,
                 computed_result, provider_raw, provider_raw_sha256, design_instant_utc, time_check, boundary_flags, calc_status, created_by)
               values ($1,1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'OK',$15) returning id`,
        [id, JSON.stringify(syn.request_body), syn.request_hash, syn.provider, syn.endpoint, syn.adapter_version, syn.engine_version, syn.contract_version,
          JSON.stringify(syn.computed_result), JSON.stringify(syn.provider_raw), syn.provider_raw_sha256, syn.design_instant_utc, JSON.stringify(syn.time_check),
          JSON.stringify(syn.boundary_flags), OWNER.id])).rows[0].id as string;
      return { id, chartId: ch, key };
    };
    const act = async (id: string, body: Record<string, unknown>) => call(ownerAct, asOwner, { method: "POST", body, params: { id } });
    const publishSubject = async (s: { id: string; chartId: string }) => [
      await act(s.id, { action: "verify_chart", chartId: s.chartId }), await act(s.id, { action: "legal_review", reference: "AV-ZZ-BIO-1" }),
      await act(s.id, { action: "approve", legalClearanceRef: "HK-ZZ-BIO-1" }), await act(s.id, { action: "publish" }),
    ].map((r) => r.status);
    const A = await mkSubject("zz-bio-a-1869-11-22", "ZZ Sentetik Bilimci", "1869-11-22T02:50:39Z", "1869-11-22T03:00:00", 561);
    const B = await mkSubject("zz-bio-b-1901-05-05", "ZZ Sentetik Biyografisiz", "1901-05-05T09:00:00Z", "1901-05-05T10:00:00", 3600);
    const DRAFT = await mkSubject("zz-bio-draft-1902-01-01", "ZZ Sentetik Taslak Harita", "1902-01-01T09:00:00Z", "1902-01-01T10:00:00", 3600);

    section("A. Migration + ayrıcalıklar");
    {
      const r = await q(`select c.relname, c.relrowsecurity from pg_class c where c.relname in ('hd_education_biographies','hd_education_biography_revisions') order by 1`);
      ok(r.rows.length === 2 && r.rows.every((x: { relrowsecurity: boolean }) => x.relrowsecurity), "2 tablo oluştu + RLS açık");
      const pol = await q(`select count(*)::int n from pg_policies where tablename like 'hd_education_biograph%'`);
      ok(pol.rows[0].n === 0, "policy YOK (varsayılan deny)");
      const priv = await q(`select grantee, privilege_type, table_name from information_schema.role_table_grants where table_name like 'hd_education_biograph%' order by 1,3,2`);
      const g = priv.rows.map((x: { grantee: string; privilege_type: string; table_name: string }) => `${x.grantee}:${x.table_name}:${x.privilege_type}`);
      ok(!g.some((x: string) => /^(anon|authenticated|PUBLIC):/.test(x)), "anon / authenticated / PUBLIC ayrıcalığı YOK", g);
      ok(!g.some((x: string) => !x.startsWith("postgres:") && /DELETE|TRUNCATE/.test(x)), "DELETE / TRUNCATE ayrıcalığı yok (service_role dahil; yalnız tablo sahibi)", g);
      ok(g.includes("service_role:hd_education_biographies:UPDATE") && !g.includes("service_role:hd_education_biography_revisions:UPDATE"), "service_role: biyografi SELECT/INSERT/UPDATE; geçmiş yalnız SELECT/INSERT");
      const again = await dbErr(MIG[2]);
      ok(again === null, "migration ikinci kez uygulanabilir (idempotent)", again);
    }

    section("B. DB kuralları (ikinci kilit)");
    {
      const base = `insert into public.hd_education_biographies (person_key, lang, display_name, is_living, short_intro, sources) values `;
      const src = `'[{"id":"s1","url":"https://example.org/x"}]'::jsonb`;
      ok(/hd_edu_bio_no_markup_chk/.test(await dbErr(`${base}('zz-x1','tr','A<script>',false,'x',${src})`) ?? ""), "'<' içeren ad → red");
      ok(/hd_edu_bio_no_markup_chk/.test(await dbErr(`${base}('zz-x2','tr','A',false,'x','[{"id":"s1","url":"https://e.org/a","title":"<b>"}]'::jsonb)`) ?? ""), "JSON içinde '<' → red");
      ok(/HD_EDU_BIO_SOURCE_URL/.test(await dbErr(`${base}('zz-x3','tr','A',false,'x','[{"id":"s1","url":"http://example.org/x"}]'::jsonb)`) ?? ""), "http (https değil) kaynak → red");
      ok(/HD_EDU_BIO_SOURCE_URL/.test(await dbErr(`${base}('zz-x4','tr','A',false,'x','[{"id":"s1","url":"javascript:alert(1)"}]'::jsonb)`) ?? ""), "javascript: kaynak → red");
      ok(/hd_edu_bio_living_chk/.test(await dbErr(`insert into public.hd_education_biographies (person_key, lang, display_name, is_living, death_year, short_intro, sources) values ('zz-x5','tr','A',true,1990,'x',${src})`) ?? ""), "yaşayan kişide ölüm yılı → red");
      ok(/HD_EDU_BIO_REVIEW_REQUIRED|hd_edu_bio_publish_chk/.test(await dbErr(`insert into public.hd_education_biographies (person_key, lang, display_name, is_living, short_intro, sources, publish_status) values ('zz-x6','tr','A',false,'x',${src},'published')`) ?? ""), "taslak içerik doğrudan yayımlanamaz (yayın kilidi)");
      // FAZ 19 (P2-f): yeni kayıt owner incelemesi taşıyamaz; inceleme yalnız owner aktörüyle; source_checked yayına YETMEZ.
      ok(/HD_EDU_BIO_REVIEW_REQUIRED/.test(await dbErr(`insert into public.hd_education_biographies (person_key, lang, display_name, is_living, short_intro, sources, content_status) values ('zz-x6b','tr','A',false,'x',${src},'owner_reviewed')`) ?? ""), "içe aktarma / yeni kayıt 'owner_reviewed' yazamaz");
      // FAZ 19 (P2-g): kişi kaydıyla yaşam durumu uyuşmazlığı → red (B kişisi yaşamıyor).
      ok(/HD_EDU_BIO_LIVING_MISMATCH/.test(await dbErr(`insert into public.hd_education_biographies (person_key, lang, display_name, is_living, short_intro, sources, subject_id) values ('zz-x6c','tr','A',true,'x',${src},$1)`, [B.id]) ?? ""), "kişi yaşamıyor ↔ biyografi yaşıyor → red (HD_EDU_BIO_LIVING_MISMATCH)");
      ok(/check constraint|lang/.test(await dbErr(`${base}('zz-x7','de','A',false,'x',${src})`) ?? ""), "desteklenmeyen dil → red");
      await q(`${base}('zz-x8','tr','A',false,'x',${src})`);
      ok(/hd_edu_bio_person_lang_uq|duplicate/.test(await dbErr(`${base}('zz-x8','tr','B',false,'x',${src})`) ?? ""), "aynı kişi × dil ikinci kayıt → red");
      ok(/HD_EDU_BIO_REVISION/.test(await dbErr(`update public.hd_education_biographies set short_intro='y' where person_key='zz-x8'`) ?? ""), "revizyon artırılmadan güncelleme → red");
      ok(/HD_EDU_BIO_IMMUTABLE/.test(await dbErr(`update public.hd_education_biographies set person_key='zz-x9', revision=revision+1 where person_key='zz-x8'`) ?? ""), "person_key değiştirilemez");
      ok(/hd_edu_bio_publish_chk/.test(await dbErr(`update public.hd_education_biographies set content_status='source_checked', publish_status='published', published_at=now(), published_by=$1, revision=revision+1 where person_key='zz-x8'`, [OWNER.id]) ?? ""), "source_checked (owner incelemesi yok) → yayın DB'de red");
      ok(/HD_EDU_BIO_REVIEWER|hd_edu_bio_review_chk/.test(await dbErr(`update public.hd_education_biographies set content_status='owner_reviewed', revision=revision+1 where person_key='zz-x8'`) ?? ""), "inceleme kaydı (aktör/zaman) olmadan owner_reviewed → red");
      ok(/HD_EDU_BIO_REVIEWER/.test(await dbErr(`update public.hd_education_biographies set content_status='owner_reviewed', reviewed_by=$1, reviewed_at=now(), revision=revision+1 where person_key='zz-x8'`, [ADMIN.id]) ?? ""), "normal admin incelemeyi yazamaz (DB owner doğrulaması)");
      await q(`update public.hd_education_biographies set content_status='owner_reviewed', reviewed_by=$1, reviewed_at=now(), revision=revision+1 where person_key='zz-x8'`, [OWNER.id]);
      ok(/HD_EDU_BIO_PUBLISHER/.test(await dbErr(`update public.hd_education_biographies set publish_status='published', published_at=now(), published_by=$1, revision=revision+1 where person_key='zz-x8'`, [ADMIN.id]) ?? ""), "normal admin yayımlayamaz (DB owner doğrulaması)");
      await q(`update public.hd_education_biographies set publish_status='published', published_at=now(), published_by=$1, revision=revision+1 where person_key='zz-x8'`, [OWNER.id]);
      await q(`update public.hd_education_biographies set short_intro='zz değişti', revision=revision+1 where person_key='zz-x8'`);
      const x8 = (await q(`select content_status, publish_status, reviewed_by from public.hd_education_biographies where person_key='zz-x8'`)).rows[0];
      ok(x8.publish_status === "hidden" && x8.content_status === "source_checked" && x8.reviewed_by === null, "yayımlı içerik değişti → DB yayından çıkardı + inceleme düştü (yeniden onay)", x8);
      const bid = (await q(`select id from public.hd_education_biographies where person_key='zz-x8'`)).rows[0].id as string;
      await q(`insert into public.hd_education_biography_revisions (biography_id, revision, action, snapshot) values ($1,1,'import','{}'::jsonb)`, [bid]);
      ok(/append-only/.test(await dbErr(`update public.hd_education_biography_revisions set action='status' where biography_id=$1`, [bid]) ?? ""), "geçmiş satırı değiştirilemez (append-only)");
      ok(/append-only/.test(await dbErr(`delete from public.hd_education_biography_revisions where biography_id=$1`, [bid]) ?? ""), "geçmiş satırı silinemez");
      ok(/RESTRICT|foreign key|violates/.test(await dbErr(`delete from public.hd_education_subjects where id=$1`, [A.id]) ?? "x"), "biyografili/haritalı kişi silinemez (RESTRICT)");
      await q(`delete from public.hd_education_biography_revisions where false`);
    }

    section("C. İçe aktarma aracı (gerçek bioImport)");
    {
      const files = [
        parseBioFile("zz-bio-a.tr.json", JSON.stringify(synthBio("zz-bio-a", A.key, "tr", "ZZ Sentetik Bilimci"))),
        parseBioFile("zz-bio-b-taslak.tr.json", JSON.stringify(synthBio("zz-bio-b-taslak", null, "tr", "ZZ Aday Kişi", { natural_key: null, is_living: true, death_year: null, life_span: "1950–", content_status: "draft" }))),
        parseBioFile("zz-bio-draft.tr.json", JSON.stringify(synthBio("zz-bio-draft", DRAFT.key, "tr", "ZZ Taslak Harita Biyografisi"))),
      ];
      for (const f of files) await q(bioInsertSql(f));
      for (const f of files) await q(bioInsertSql(f)); // idempotent
      const n = (await q(`select count(*)::int n from public.hd_education_biographies where person_key like 'zz-bio-%'`)).rows[0].n;
      const rv = (await q(`select count(*)::int n from public.hd_education_biography_revisions r join public.hd_education_biographies b on b.id=r.biography_id where b.person_key like 'zz-bio-%'`)).rows[0].n;
      ok(n === 3 && rv === 3, "3 biyografi + 3 içe aktarma geçmişi (ikinci çalıştırma DOKUNMADI)", { n, rv });
      // FAZ 19 (P3): atlanan (güncellenmeyen) ve harita kaydına bağlanamayan satırlar sessiz kalmaz.
      await q(bioInsertSql(parseBioFile("zz-bio-haritasiz.tr.json", JSON.stringify(synthBio("zz-bio-haritasiz", "zz-olmayan-kisi-1900-01-01", "tr", "ZZ Haritasız")))));
      const lg = (await q(`select sonuc, count(*)::int n, string_agg(person_key, ',' order by person_key) k from pg_temp.hd_edu_bio_import_log group by sonuc order by sonuc`)).rows as Array<{ sonuc: string; n: number; k: string }>;
      const by = Object.fromEntries(lg.map((x) => [x.sonuc, x]));
      ok(by.eklendi?.n === 3 && by.atlandi_mevcut?.n === 3 && by.atlandi_mevcut.k === "zz-bio-a,zz-bio-b-taslak,zz-bio-draft" && by.eklendi_harita_yok?.k === "zz-bio-haritasiz",
        "içe aktarma günlüğü: eklendi 3 · atlandı (güncellenmedi) 3 anahtarıyla · harita kaydı bulunamadı 1", lg);
      const notices: string[] = [];
      const onNotice = (m: { message?: string }) => { notices.push(String(m.message ?? "")); };
      su.on("notice", onNotice);
      await q(bioImportReportSql());
      su.off("notice", onNotice);
      ok(notices.some((m) => /ATLANDI \(zaten var; GÜNCELLENMEDİ\) 3/.test(m)) && notices.some((m) => /atlanan \(güncellenmeyen\) anahtarlar: zz-bio-a\.tr/.test(m))
        && notices.some((m) => /bağlanamayan anahtarlar: zz-bio-haritasiz\.tr \(zz-olmayan-kisi-1900-01-01\)/.test(m)), "rapor NOTICE: sayı + atlanan / bağlanamayan anahtarlar", notices);
      ok(/TRUNCATE pg_temp\.hd_edu_bio_import_log/.test(bioImportSql(files)) && /bio_rapor/.test(bioImportSql(files)), "toplu SQL: günlük sıfırlanır + sonda rapor");
      const link = (await q(`select person_key, subject_id, publish_status from public.hd_education_biographies where person_key like 'zz-bio-%' order by 1`)).rows;
      ok(link.find((x: { person_key: string }) => x.person_key === "zz-bio-a")?.subject_id === A.id, "natural_key ile harita kaydına bağlandı");
      ok(link.find((x: { person_key: string }) => x.person_key === "zz-bio-b-taslak")?.subject_id === null, "harita kaydı olmayan aday: subject_id NULL");
      ok(link.every((x: { publish_status: string }) => x.publish_status === "hidden"), "içe aktarma YAYIMLAMAZ (hepsi hidden)");
      const tl = (await q(`select timeline from public.hd_education_biographies where person_key='zz-bio-a'`)).rows[0].timeline as Array<{ date: string }>;
      ok(tl.map((e) => e.date).join(",") === "1869-11-22,1905,1951-02", "zaman çizelgesi kronolojik sıraya konur", tl.map((e) => e.date));
      // FAZ 19 (P3): önek eşitliği (aynı yıl, daha az kesin tarih) bozukluk değildir; yazarın anlamlı sırası korunur.
      {
        const arm = ["1930-08-05", "1949", "1955-01", "1955", "1962-01-28", "1962", "1966-03-16", "2014"].map((date) => ({ date }));
        ok(isBioChronological(arm.map((e) => e.date)) && sortBioTimeline(arm).map((e) => e.date).join() === arm.map((e) => e.date).join(),
          "'1955-01' → '1955' (yalnız yıl) sırası korunur; bozukluk sayılmaz");
        const mixed = ["1955-03", "1955", "1955-01", "1950"].map((date) => ({ date }));
        const out = sortBioTimeline(mixed).map((e) => e.date);
        ok(isBioChronological(out) && out[0] === "1950" && out.indexOf("1955-01") < out.indexOf("1955-03"), "gerçek ters sıra düzeltilir (sonuç kronolojik)", out);
        ok(!isBioChronological(["1956", "1955-01"]) && isBioChronological(["1955-01", "1955", "1955-02"]), "doğrulama: yalnız kesin ters sıra bozukluk");
        const f = parseBioFile("zz-arm.tr.json", JSON.stringify(synthBio("zz-arm", null, "tr", "ZZ", { timeline: [
          { date: "1955-01", title: "ZZ mezuniyet", source_ids: ["s1"] }, { date: "1955", title: "ZZ işe giriş", source_ids: ["s1"] }, { date: "1954", title: "ZZ önce", source_ids: ["s1"] },
        ] })));
        ok(f.content.timeline.map((e) => e.date).join() === "1954,1955-01,1955", "içe aktarma: aynı yıl içi anlamlı sıra korunur, yalnız ters olay taşınır", f.content.timeline.map((e) => e.date));
      }
      const bad = [
        ["script", { short_intro: "<script>alert(1)</script>" }],
        ["http kaynak", { sources: [{ id: "s1", title: "x", kind: "encyclopedia", url: "http://example.org/a" }] }],
        ["javascript url", { sources: [{ id: "s1", title: "x", kind: "encyclopedia", url: "javascript:alert(1)" }] }],
        ["kaynak yok", { sources: [] }],
        ["bilinmeyen kaynak id", { timeline: [{ date: "1900", title: "x", source_ids: ["s9"] }] }],
        ["kaynaksız paragraf", { sections: [{ key: "career", paragraphs: [{ text: "x", source_ids: [] }] }] }],
        ["oldid'siz Vikipedi", { sources: [{ id: "s1", title: "x", kind: "wikipedia", url: "https://tr.wikipedia.org/wiki/X" }, { id: "s2", title: "y", kind: "book", url: "https://example.org/y" }] }],
        ["geçersiz tarih", { timeline: [{ date: "19xx", title: "x", source_ids: ["s1"] }] }],
        ["bilinmeyen bölüm", { sections: [{ key: "dedikodu", paragraphs: [{ text: "x", source_ids: ["s1"] }] }] }],
        ["yaşayanda ölüm yılı", { is_living: true }],
        ["kimlikli URL", { sources: [{ id: "s1", title: "x", kind: "book", url: "https://user:pw@example.org/a" }, { id: "s2", title: "y", kind: "book", url: "https://example.org/y" }] }],
        // FAZ 19 (P2-d / P2-e)
        ["fact_checks: bilinmeyen kaynak", { fact_checks: [{ claim: "x", source_ids: ["s9"], status: "capraz" }] }],
        ["fact_checks: bilinmeyen durum", { fact_checks: [{ claim: "x", source_ids: ["s1"], status: "kesin" }] }],
        ["fact_checks: kaynaksız iddia", { fact_checks: [{ claim: "x", source_ids: [], status: "tek_kaynak" }] }],
        ["fact_checks: liste değil", { fact_checks: { claim: "x" } }],
        ["sözleşmede olmayan üst alan", { fact_check_notes: ["sessizce düşmesin"] }],
        ["alıntı işaretli + makale listesi boş", { wikipedia_usage: { direct_quotes: true, adapted_text: false, articles: [], note: null } }],
        ["uyarlama işaretli + oldid'siz makale", { wikipedia_usage: { direct_quotes: false, adapted_text: true, articles: [{ lang: "tr", title: "ZZ", oldid: null, url: "https://tr.wikipedia.org/wiki/ZZ" }], note: null } }],
      ] as const;
      for (const [label, patch] of bad) {
        let threw = false;
        try { parseBioFile("zz-bad.tr.json", JSON.stringify(synthBio("zz-bad", null, "tr", "ZZ", patch as Record<string, unknown>))); } catch { threw = true; }
        ok(threw, `doğrulayıcı reddetti: ${label}`);
      }
      {
        const okFile = parseBioFile("zz-ok.tr.json", JSON.stringify(synthBio("zz-ok", null, "tr", "ZZ", { wikipedia_usage: { direct_quotes: true, adapted_text: true, articles: [{ lang: "tr", title: "ZZ", oldid: "123", url: "https://tr.wikipedia.org/w/index.php?title=ZZ&oldid=123" }], note: null } })));
        ok(okFile.content.licenseInfo.directQuotes && okFile.content.licenseInfo.articles[0].oldid === "123", "alıntı işaretli + makale (oldid) → kabul");
        ok(files[0].content.factChecks.length === 2 && files[0].content.factChecks[1].status === "tek_kaynak" && files[0].content.factChecks[1].sourceIds.join() === "s2",
          "fact_checks içe aktarmada korunur (sessizce düşmez)", files[0].content.factChecks);
        const fc = (await q(`select fact_checks from public.hd_education_biographies where person_key='zz-bio-a'`)).rows[0].fact_checks as Array<{ status: string; claim: string }>;
        ok(Array.isArray(fc) && fc.length === 2 && fc.some((x) => x.status === "tek_kaynak" && x.claim === "ZZ sentetik tek kaynaklı iddia"), "DB: fact_checks jsonb'de saklandı", fc);
        ok(/hd_edu_bio_no_markup_chk/.test(await dbErr(`update public.hd_education_biographies set fact_checks='[{"claim":"<b>x</b>","sourceIds":["s1"],"status":"capraz"}]'::jsonb, revision=revision+1 where person_key='zz-bio-a'`) ?? ""), "DB: fact_checks içinde '<' → red");
        ok(/check constraint/.test(await dbErr(`update public.hd_education_biographies set fact_checks='{}'::jsonb, revision=revision+1 where person_key='zz-bio-a'`) ?? ""), "DB: fact_checks dizi değilse → red");
      }
      {
        const bad = parseBioFile("zz-bio-yasiyor.en.json", JSON.stringify(synthBio("zz-bio-yasiyor", A.key, "en", "ZZ Uyuşmaz", { is_living: true, death_year: null, life_span: "1869–" })));
        const e = await dbErr(bioInsertSql(bad));
        ok(/HD_EDU_BIO_LIVING_MISMATCH: zz-bio-yasiyor/.test(e ?? ""), "içe aktarma: kişi kaydı ↔ biyografi yaşam durumu uyuşmazlığı AÇIK hatayla reddedildi (anahtar mesajda)", e);
      }
      const real = argv("--real-dir");
      if (real) {
        const { files: rf, errors } = loadBioDir(real);
        ok(errors.length === 0, `gerçek biyografi dosyaları doğrulayıcıdan geçti (${rf.length})`, errors.slice(0, 3));
        let dbOk = 0; const dbFail: string[] = [];
        for (const f of rf) { try { await q(bioInsertSql(f)); dbOk++; } catch (e) { dbFail.push(`${f.file}: ${(e as Error).message}`); } }
        ok(dbFail.length === 0, `gerçek biyografiler DB kurallarından geçti (${dbOk}/${rf.length})`, dbFail.slice(0, 3));
      }
    }

    section("D. Yetki: eğitmen / owner / normal admin");
    {
      ok((await call(ownerAccessPost, asOwner, { method: "POST", body: { action: "grant", userId: E1.id } })).status === 200, "owner E1'e eğitim yetkisi verdi");
      ok((await call(ownerAccessPost, asOwner, { method: "POST", body: { action: "grant", userId: E2.id } })).status === 200, "owner E2'ye eğitim yetkisi verdi");
      const stA = await publishSubject(A);
      ok(stA.every((x) => x === 200), "A haritası yayımlandı (gerçek owner uçları)", stA);
      const stD = await publishSubject(B);
      ok(stD.every((x) => x === 200), "B haritası yayımlandı (biyografisiz)", stD);
      const before = track("bio-before", await call(viewBio, asUser(E1), { params: { id: A.id }, query: "?lang=tr" }));
      ok(before.status === 200 && before.json.biography === null && Array.isArray(before.json.availableLangs) && (before.json.availableLangs as unknown[]).length === 0,
        "biyografi yayımlanmadan: 200 + biography=null (taslak eğitmene GİTMEZ)", before.json);
      for (const [label, who] of [["yetkisiz uzman", asUser(E3)], ["normal admin (kullanıcı ucu)", { kind: "user" as const, id: ADMIN.id, token: ADMIN.token }], ["oturumsuz", null], ["sahte token", { kind: "user" as const, id: E1.id, token: "zz-yanlis" }]] as const) {
        const r = track(`bio-deny-${label}`, await call(viewBio, who, { params: { id: A.id }, query: "?lang=tr" }));
        ok(r.status === 404, `eğitmen biyografi ucu → 404: ${label}`, r.status);
      }
      for (const [label, who] of [["normal admin", asAdmin], ["eğitmen (admin başlığıyla)", { kind: "admin" as const, id: E1.id, token: E1.token }], ["oturumsuz", null]] as const) {
        const l = track(`own-list-${label}`, await call(ownList, who));
        ok(l.status === 404, `owner liste ucu → 404: ${label}`, l.status);
      }
      const lst = track("own-list", await call(ownList, asOwner));
      const rows = ((lst.json.data as { rows?: unknown[] } | undefined)?.rows ?? []) as Array<{ personKey: string; displayName: string; subjectId: string | null; birthData: string; hd: string; mapPublication: string | null; biographies: Array<{ id: string; lang: string; publishStatus: string; contentStatus: string }> }>;
      const ra = rows.find((r) => r.personKey === "zz-bio-a");
      const rc = rows.find((r) => r.personKey === "zz-bio-b-taslak");
      const rb = rows.find((r) => r.subjectId === B.id);
      ok(!!ra && ra.birthData === "dogrulandi" && ra.hd === "hesaplandi" && ra.mapPublication === "published" && ra.biographies[0]?.publishStatus === "hidden",
        "owner tablosu: A → doğum verisi doğrulandı · HD hesaplandı · harita yayında · biyografi kapalı", ra);
      ok(!!rc && rc.subjectId === null && rc.birthData === "kayit-yok" && rc.hd === "kayit-yok", "owner tablosu: aday (harita kaydı yok) ayrı görünür", rc);
      ok(!!rb && rb.biographies.length === 0, "owner tablosu: biyografisi olmayan harita da görünür (Hayat Hikâyesi: yok)");
      const bioA = ra!.biographies[0].id;
      const bioDraft = rows.find((r) => r.personKey === "zz-bio-draft")!.biographies[0].id;
      const bioCand = rc!.biographies[0].id;

      section("E. Owner düzenleme · CAS · yayın");
      const g = track("own-get", await call(ownGet, asOwner, { params: { bioId: bioA } }));
      const det = g.json.data as Record<string, unknown> & { revision: number; history: unknown[] };
      ok(g.status === 200 && det.revision === 1 && Array.isArray(det.history) && det.history.length === 1, "owner ayrıntı: sürüm 1 + içe aktarma geçmişi");
      ok(JSON.stringify(det.openQuestions) === '["ZZ sentetik açık soru"]', "owner ayrıntı: editoryal / araştırma notları (openQuestions) owner'da görünür", det.openQuestions);
      ok(Array.isArray(det.factChecks) && (det.factChecks as Array<{ status: string }>).filter((x) => x.status === "tek_kaynak").length === 1, "owner ayrıntı: iddia doğrulama kaydı (tek kaynak dahil) görünür", det.factChecks);
      ok(track("own-get-admin", await call(ownGet, asAdmin, { params: { bioId: bioA } })).status === 404, "normal admin owner ayrıntısını okuyamaz (404)");
      ok(track("own-put-admin", await call(ownPut, asAdmin, { method: "PUT", params: { bioId: bioA }, body: { revision: 1, content: {} } })).status === 404, "normal admin düzenleyemez (404)");
      ok(track("own-post-trainer", await call(ownPost, { kind: "admin", id: E1.id, token: E1.token }, { method: "POST", params: { bioId: bioA }, body: { action: "publish", revision: 1 } })).status === 404, "eğitmen yayımlayamaz (404)");
      const content = { ...(det as Record<string, unknown>) };
      for (const k of ["id", "personKey", "lang", "subjectId", "contentStatus", "publishStatus", "revision", "publishedAt", "createdAt", "updatedAt", "history", "reviewedAt"]) delete content[k];
      const edited = { ...content, shortIntro: "ZZ owner tarafından düzenlenmiş tanıtım." };
      const put1 = await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, body: { revision: 1, content: edited } });
      ok(put1.status === 200 && put1.json.revision === 2, "owner düzenledi → sürüm 2", put1.json);
      const stale = await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, body: { revision: 1, content: { ...edited, shortIntro: "ZZ eski sekme" } } });
      ok(stale.status === 409 && stale.json.code === "BIO_CONFLICT" && stale.json.current === 2, "eski sürümle kayıt → 409 (sessiz üzerine yazma YOK)", stale.json);
      const cur = (await q(`select short_intro, content_status, revision from public.hd_education_biographies where id=$1`, [bioA])).rows[0];
      ok(cur.short_intro === "ZZ owner tarafından düzenlenmiş tanıtım." && cur.content_status === "source_checked" && cur.revision === 2, "DB: düzenleme kalıcı; düzenleme owner incelemesi SAYILMAZ (source_checked kalır)", cur);
      const liv = await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, body: { revision: 2, content: { ...edited, isLiving: true, deathYear: null } } });
      ok(liv.status === 422 && liv.json.code === "BIO_LIVING_MISMATCH", "owner düzenlemesi: kişi kaydıyla yaşam durumu uyuşmazlığı → 422 açık hata", liv.json);
      for (const [label, c] of [
        ["script etiketi", { ...edited, shortIntro: "<script>alert(1)</script>" }],
        ["onerror özniteliği", { ...edited, displayName: "<img src=x onerror=alert(1)>" }],
        ["javascript bağlantı", { ...edited, sources: [{ id: "s1", title: "x", kind: "book", url: "javascript:alert(1)" }] }],
        ["data bağlantı", { ...edited, sources: [{ id: "s1", title: "x", kind: "book", url: "data:text/html;base64,PHNjcmlwdD4=" }] }],
        ["iç ağ http", { ...edited, sources: [{ id: "s1", title: "x", kind: "book", url: "http://169.254.169.254/latest/meta-data" }] }],
        ["bilinmeyen kaynak", { ...edited, timeline: [{ date: "1900", title: "x", text: "", sourceIds: ["zz9"] }] }],
        ["boş tanıtım", { ...edited, shortIntro: "" }],
      ] as const) {
        const r = await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, body: { revision: 2, content: c } });
        ok(r.status === 400 && r.json.code === "BIO_INVALID", `geçersiz içerik → 400: ${label}`, r.json);
      }
      const big = await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, raw: JSON.stringify({ revision: 2, content: { ...edited, pad: "x".repeat(400_000) } }) });
      ok(big.status === 413, "300 KB üstü gövde → 413", big.status);
      ok((await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, raw: "{bozuk" })).status === 400, "bozuk JSON → 400");
      ok((await call(ownGet, asOwner, { params: { bioId: "../../etc" } })).status === 404, "geçersiz kimlik → 404");
      ok(external.length === 0, "iç ağ / harici bağlantı sunucuda İNDİRİLMEDİ (SSRF yok)", external);

      const pub0 = await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "publish", revision: 2 } });
      ok(pub0.status === 422 && pub0.json.code === "BIO_REVIEW_REQUIRED", "owner incelemesi olmadan (source_checked) yayın → 422 BIO_REVIEW_REQUIRED", pub0.json);
      const rv1 = await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "review", revision: 2 } });
      ok(rv1.status === 200 && rv1.json.revision === 3, "owner incelemesi kaydedildi → sürüm 3", rv1.json);
      const revw = (await q(`select content_status, reviewed_by from public.hd_education_biographies where id=$1`, [bioA])).rows[0];
      ok(revw.content_status === "owner_reviewed" && revw.reviewed_by === OWNER.id, "DB: inceleme kaydı (owner aktör)", revw);
      const pub = await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "publish", revision: 3 } });
      ok(pub.status === 200 && pub.json.revision === 4, "owner yayımladı → sürüm 4", pub.json);
      // FAZ 19 (P2-f): YAYINDAKİ içerik değişirse yayından düşer ve yeniden onay gerekir.
      const put2 = await call(ownPut, asOwner, { method: "PUT", params: { bioId: bioA }, body: { revision: 4, content: { ...edited, era: "ZZ yeni dönem" } } });
      ok(put2.status === 200 && put2.json.revision === 5 && put2.json.unpublished === true && put2.json.publishStatus === "hidden" && put2.json.contentStatus === "source_checked",
        "yayımlı içerik düzenlendi → yayından çıktı + inceleme düştü (yanıtta açık)", put2.json);
      const hid = await call(viewBio, asUser(E1), { params: { id: A.id }, query: "?lang=tr" });
      ok(hid.status === 200 && hid.json.biography === null, "onaysız yeni içerik eğitmene GİTMEZ", hid.json);
      ok((await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "publish", revision: 5 } })).json.code === "BIO_REVIEW_REQUIRED", "yeniden onay olmadan yeniden yayın → red");
      ok((await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "review", revision: 5 } })).status === 200, "owner yeni içeriği inceledi → sürüm 6");
      ok((await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "publish", revision: 6 } })).status === 200, "yeniden yayımlandı → sürüm 7");
      const pubCand = await call(ownPost, asOwner, { method: "POST", params: { bioId: bioCand }, body: { action: "publish", revision: 1 } });
      ok(pubCand.status === 422 && pubCand.json.code === "BIO_REVIEW_REQUIRED", "taslak (draft) içerik yayımlanamaz → 422 (DB yayın kilidi)", pubCand.json);
      ok((await call(ownPost, asOwner, { method: "POST", params: { bioId: bioDraft }, body: { action: "review", revision: 1 } })).status === 200
        && (await call(ownPost, asOwner, { method: "POST", params: { bioId: bioDraft }, body: { action: "publish", revision: 2 } })).status === 200, "taslak haritanın biyografisi incelendi + yayımlandı (harita yayımlı değil)");

      section("F. Eğitmen görünümü");
      const v = track("bio-E1", await call(viewBio, asUser(E1), { params: { id: A.id }, query: "?lang=tr" }));
      const b = v.json.biography as Record<string, unknown> & { sections: Array<{ key: string }>; timeline: Array<{ date: string }>; sources: unknown[] };
      ok(v.status === 200 && b?.shortIntro === "ZZ owner tarafından düzenlenmiş tanıtım." && b.sections[0].key === "childhood", "yetkili eğitmen yayımlı biyografiyi görür (bölüm sırası sözleşmeye göre)");
      ok(JSON.stringify(v.json.availableLangs) === '["tr"]', "mevcut diller: yalnız TR");
      ok(!("openQuestions" in b) && !JSON.stringify(v.json).includes("ZZ sentetik açık soru"), "FAZ 13: araştırmacı / editoryal notlar eğitmen yanıtında YOK (sunucuda çıkarılır)");
      ok(!("factChecks" in b) && !("fact_checks" in b) && !JSON.stringify(v.json).includes("ZZ sentetik tek kaynaklı iddia"), "FAZ 19: iddia doğrulama kaydı (fact_checks) eğitmen yanıtında YOK; eğitmen metni değişmez");
      const leak = /created_by|updated_by|published_by|person_key|content_status|publish_status|"id":"[0-9a-f-]{36}"|AV-ZZ|HK-ZZ|provider_raw|request_body/;
      ok(!leak.test(v.body) && !v.body.includes(OWNER.id), "yanıtta owner kimliği / iç durum / hesap ham verisi YOK", v.body.match(leak)?.[0]);
      const v2 = track("bio-E2", await call(viewBio, asUser(E2), { params: { id: A.id } }));
      ok(v2.status === 200 && (v2.json.biography as { shortIntro?: string })?.shortIntro === b.shortIntro, "başka tenant'taki yetkili eğitmen AYNI merkezî biyografiyi görür");
      const en = track("bio-en", await call(viewBio, asUser(E1), { params: { id: A.id }, query: "?lang=en" }));
      ok(en.status === 200 && en.json.biography === null && JSON.stringify(en.json.availableLangs) === '["tr"]', "EN istenir, yok → biography=null + availableLangs=[tr] (uydurma çeviri yok)", en.json);
      ok(track("bio-de", await call(viewBio, asUser(E1), { params: { id: A.id }, query: "?lang=de" })).status === 404, "desteklenmeyen dil → 404");
      ok(track("bio-draftmap", await call(viewBio, asUser(E1), { params: { id: DRAFT.id } })).status === 404, "harita yayımlı değilse biyografi yayımlı olsa da → 404");
      for (const [label, id] of [["rastgele uuid", randomUUID()], ["uuid değil", "abc"], ["yol", "../../x"]] as const) {
        ok(track(`bio-bad-${label}`, await call(viewBio, asUser(E1), { params: { id } })).status === 404, `geçersiz kimlik → 404: ${label}`);
      }
      const nb = track("bio-B", await call(viewBio, asUser(E1), { params: { id: B.id } }));
      ok(nb.status === 200 && nb.json.biography === null, "biyografisi olmayan yayımlı harita → 200 + biography=null (harita açılır)");
      const det2 = track("detail-A", await call(viewDetail, asUser(E1), { params: { id: A.id } }));
      ok(det2.status === 200 && !!(det2.json.item as { chart?: unknown })?.chart, "biyografi varken harita ayrıntısı aynen açılır (snapshot)");
      const list = track("list", await call(viewList, asUser(E1)));
      const items = (list.json.items ?? []) as Array<{ id: string; bio: { profession?: string; country?: string } | null }>;
      ok(items.find((x) => x.id === A.id)?.bio?.profession === "ZZ Sentetik bilim insanı" && items.find((x) => x.id === B.id)?.bio === null, "katalog: meslek/ülke/dönem arama alanları yalnız yayımlı biyografiden");

      section("G. Yayından kaldırma · yetki kapatma");
      const un = await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "unpublish", revision: 7 } });
      ok(un.status === 200, "owner yayından kaldırdı");
      const after = await call(viewBio, asUser(E1), { params: { id: A.id } });
      ok(after.status === 200 && after.json.biography === null, "kaldırılınca eğitmen göremez; içerik silinmedi", after.json);
      ok((await q(`select count(*)::int n from public.hd_education_biographies where id=$1`, [bioA])).rows[0].n === 1, "kayıt DB'de duruyor (silme yok)");
      const rep = await call(ownPost, asOwner, { method: "POST", params: { bioId: bioA }, body: { action: "publish", revision: 8 } });
      ok(rep.status === 200, "içerik değişmeden yeniden yayın: mevcut owner incelemesi geçerli (yeniden onay gerekmez)", rep.json);
      ok((await call(ownerAccessPost, asOwner, { method: "POST", body: { action: "revoke", userId: E2.id } })).status === 200, "owner E2 yetkisini kapattı");
      ok(track("bio-E2-revoked", await call(viewBio, asUser(E2), { params: { id: A.id } })).status === 404, "yetkisi kapalı eğitmen biyografi ucuna erişemez → 404");
      const hist = (await q(`select action, revision from public.hd_education_biography_revisions where biography_id=$1 order by revision, action`, [bioA])).rows.map((x: { action: string; revision: number }) => `${x.revision}:${x.action}`);
      ok(hist.join(",") === "1:import,2:owner_edit,3:status,4:publish,5:owner_edit,6:status,7:publish,8:unpublish,9:publish", "geçmiş: içe aktarma → düzenleme → inceleme → yayın → düzenleme (yayından düştü) → inceleme → yayın → kaldırma → yayın", hist);
    }

    section("H. Hesap katmanı ayrılığı");
    {
      const fp = async () => (await q(`select md5(string_agg(t::text, '|' order by t::text)) h from (select * from public.hd_education_charts) t`)).rows[0].h as string;
      const fs = async () => (await q(`select md5(string_agg(t::text, '|' order by t::text)) h from (select id, revision, birth_utc, utc_status from public.hd_education_subjects) t`)).rows[0].h as string;
      const c0 = await fp(); const s0 = await fs();
      const rows = ((await call(ownList, asOwner)).json.data as { rows: Array<{ personKey: string; biographies: Array<{ id: string; revision: number }> }> }).rows;
      const bio = rows.find((r) => r.personKey === "zz-bio-a")!.biographies[0];
      const d = (await call(ownGet, asOwner, { params: { bioId: bio.id } })).json.data as Record<string, unknown>;
      const content = { ...d }; for (const k of ["id", "personKey", "lang", "subjectId", "contentStatus", "publishStatus", "revision", "publishedAt", "createdAt", "updatedAt", "history", "reviewedAt"]) delete content[k];
      for (let i = 0; i < 5; i++) {
        const cur = Number((await q(`select revision from public.hd_education_biographies where id=$1`, [bio.id])).rows[0].revision);
        await call(ownPut, asOwner, { method: "PUT", params: { bioId: bio.id }, body: { revision: cur, content: { ...content, era: `ZZ dönem ${i}` } } });
      }
      ok(await fp() === c0 && await fs() === s0, "5 biyografi düzenlemesi: hesap snapshot'ları ve kişi kanıtı DEĞİŞMEDİ (md5)");
      const raw = (await q(`select count(*)::int n from public.hd_education_biographies where sections::text ~ 'provider|computed_result|request_hash'`)).rows[0].n;
      ok(raw === 0, "biyografi tablosunda hesap / sağlayıcı verisi yok");
    }

    section("I. Yanıt tekdüzeliği");
    ok(nonNoStore.length === 0, "tüm yanıtlar no-store", nonNoStore.slice(0, 5));
    ok(notFoundBodies.size === 1, "tüm 404'ler AYNI gövde (özellik / sebep sızmaz)", [...notFoundBodies]);
    ok(external.length === 0, `dış ağ çağrısı 0 (${external.length})`, external);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nhd-education BİYOGRAFİ harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });

/**
 * HD Hazır Eğitim Haritaları — ERİŞİM GÜVENLİĞİ testi (FAZ 2-B1).
 * İzole embedded-postgres + PostgREST shim + migration 20271110000000 + GERÇEK route'lar. Prod/Preview'a SIFIR temas,
 * gerçek kişi verisi YOK (tüm kayıtlar sentetik ZZ_*), Roxy/dış ağ çağrısı YOK (fetch kilidi sayar).
 * Kapsam: hazırlık kapısı (varsayılan KAPALI; owner yönetimi bayraktan bağımsız), owner kapısı, 100 kullanıcı / 2 yetki / 98 red, rol senaryoları, sahte
 * kimlik, iptal, rol/tenant değişimi (eşzamanlı istekler dahil), yayımlanmamış id, yayın sonrası kanıt tutarsızlığı,
 * kullanıcı silme, denetim, ayrıcalık kilidi, aynı 404 gövdesi + no-store.
 * Çalıştır: npx tsx scripts/hd-education/access-harness.ts   (HD_EDU_PG_PORT, varsayılan 54561)
 */
import "../hd-analysis-word-flow/env"; // server-only stub + sahte Roxy anahtarı (gerçek anahtar ASLA)
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";

let pass = 0;
let fail = 0;
let raceGrantOk = false; // 9b yarışında owner yetkisi rol değişiminden önce yazıldı mı (sıra belirsiz; iki dal da güvenli)
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

// B1 + B2 birlikte (production'a ikisi birlikte uygulanacak; güvenlik matrisi son şemada koşar).
const MIGRATION = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"]
  .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8")).join("\n");
const PRE_DDL = `
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null,
  action text not null, created_at timestamptz not null default now()
);`;
const RPCS = ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"];

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(h: Handler, auth: { kind: "user" | "admin"; id?: string; token?: string } | null, o: { method?: string; body?: unknown; query?: string; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const body = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control") };
}

async function main() {
  // Dış ağ kilidi: yalnız 127.0.0.1 shim'i. Roxy dahil her dış çağrı reddedilir ve sayılır.
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  const dirName = `hd-edu-b1-access-${Date.now()}-${randomUUID().slice(0, 8)}`; // her koşu YENİ klasör
  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_PG_PORT ?? 54561), dirName, rpcAllow: RPCS, extraSql: [PRE_DDL, MIGRATION],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  delete process.env.HD_EDUCATION_CATALOG_ENABLED; // varsayılan: KAPALI
  const su = env.su;
  try {
    const adminSubjects = (await import("../../app/api/admin/hd/education/subjects/route")).GET as unknown as Handler;
    const adminAccessMod = await import("../../app/api/admin/hd/education/access/route");
    const adminAccessGet = adminAccessMod.GET as unknown as Handler;
    const adminAccessPost = adminAccessMod.POST as unknown as Handler;
    const viewAccess = (await import("../../app/api/hd/education/access/route")).GET as unknown as Handler;
    const viewCharts = (await import("../../app/api/hd/education/charts/route")).GET as unknown as Handler;
    const viewChart = (await import("../../app/api/hd/education/charts/[id]/route")).GET as unknown as Handler;

    // ── Tohum (sentetik) ─────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_EDU_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; tenant?: string; active?: boolean; approval?: string; hd?: boolean; pkg?: string; demo?: boolean; superAdmin?: boolean; adminLevel?: string | null } = {}): Promise<Who> => {
      const id = randomUUID();
      const token = `zz-edu-tok-${++seq}-${id.slice(0, 8)}`;
      const role = o.role ?? "expert";
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12)`,
        [id, `ZZ_EDU_${label}`, `zz.edu.${label.toLowerCase()}@example.test`, role, o.active ?? true, o.approval ?? "approved",
          JSON.stringify(role === "expert" ? { human_design: o.hd ?? true, clients: true } : {}), o.pkg ?? "premium", o.tenant ?? T[0],
          o.demo === true, o.superAdmin === true, o.adminLevel ?? (role === "admin" ? "owner" : null)],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin", adminLevel: "owner" }); // admin_level 'owner' YANILTICI — super değil
    const ADMIN2 = await mk("ADMIN2", { role: "admin", adminLevel: "admin" });
    const E: Who[] = [];
    for (let i = 0; i < 100; i++) E.push(await mk(`E${String(i).padStart(3, "0")}`, { tenant: T[i % 4] }));
    const NOHD = await mk("NOHD", { hd: false });
    const DEMO = await mk("DEMO", { demo: true });
    const PASIF = await mk("PASIF", { active: false });
    const PENDING = await mk("PENDING", { approval: "pending" });
    const TRIAL = await mk("TRIAL", { pkg: "trial" });
    const PRO = await mk("PRO", { pkg: "pro" });

    const asAdmin = (w: Who) => ({ kind: "admin" as const, id: w.id, token: w.token });
    const asUser = (w: Who) => ({ kind: "user" as const, id: w.id, token: w.token });
    const notFoundBodies = new Set<string>();
    const nonNoStore: string[] = [];
    const track = (label: string, r: Res) => {
      if (r.cache !== "no-store") nonNoStore.push(`${label}:${r.status}`);
      if (r.status === 404) notFoundBodies.add(r.body);
      return r;
    };
    const activeGrants = async (uid: string) => Number((await su.query(`select count(*)::int n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [uid])).rows[0].n);
    const lastRevoke = async (uid: string) => (await su.query(`select revoke_reason from public.hd_education_access_grants where user_id=$1 and revoked_at is not null order by revoked_at desc limit 1`, [uid])).rows[0]?.revoke_reason ?? null;

    // ── 0) Hazırlık kapısı KAPALI (varsayılan) → eğitmen uçları DB'ye gitmeden 404; owner yönetimi bayraktan BAĞIMSIZ ─
    section("0. Hazırlık kapısı (varsayılan KAPALI) — eğitmen kapalı, owner yönetimi açık");
    {
      // Acil kapatma: "false" → eğitmen uçları veritabanına HİÇ gitmeden 404.
      process.env.HD_EDUCATION_CATALOG_ENABLED = "false";
      const ksBefore = env.stats.requests;
      const ks = [await call(viewAccess, asUser(E[0])), await call(viewCharts, asUser(E[0]))];
      ok(ks.every((r) => r.status === 404) && env.stats.requests === ksBefore, `acil kapatma "false" → eğitmen uçları 404 ve veritabanına HİÇ istek gitmedi`, env.stats.requests - ksBefore);
      for (const val of [undefined, "", "1", "TRUE", "yes", " true"]) {
        if (val === undefined) delete process.env.HD_EDUCATION_CATALOG_ENABLED;
        else process.env.HD_EDUCATION_CATALOG_ENABLED = val;
        const before = env.stats.requests;
        const viewer = [
          track(`off-view:${val}`, await call(viewAccess, asUser(E[0]))),
          track(`off-list:${val}`, await call(viewCharts, asUser(E[0]))),
          track(`off-view-owner-as-user:${val}`, await call(viewAccess, asUser(OWNER))),
        ];
        ok(viewer.every((r) => r.status === 404), `kapı "${val ?? "(yok)"}" → eğitmen uçları 404`, viewer.map((r) => r.status));
        // Owner kararı 31.10.2026: ortam değişkeni tanımsız / geçersizse kapı owner'ın DB anahtarıdır (bu ortamda tablo yok →
        // fail-closed). "Veritabanına hiç gitmeden 404" garantisi yalnız acil kapatma ("false") için geçerlidir (aşağıda).
        void before;
        const own = [
          track(`off-owner-subjects:${val}`, await call(adminSubjects, asAdmin(OWNER))),
          track(`off-owner-access:${val}`, await call(adminAccessGet, asAdmin(OWNER))),
        ];
        ok(own.every((r) => r.status === 200), `kapı "${val ?? "(yok)"}" → owner yönetim uçları 200`, own.map((r) => r.status));
        const others = [
          track(`off-admin-subjects:${val}`, await call(adminSubjects, asAdmin(ADMIN))),
          track(`off-admin2-subjects:${val}`, await call(adminSubjects, asAdmin(ADMIN2))),
          track(`off-expert-subjects:${val}`, await call(adminSubjects, asAdmin(E[0]))),
          track(`off-anon-subjects:${val}`, await call(adminSubjects, null)),
          track(`off-admin-access:${val}`, await call(adminAccessGet, asAdmin(ADMIN2))),
        ];
        ok(others.every((r) => r.status === 404), `kapı "${val ?? "(yok)"}" → normal admin / uzman / oturumsuz owner uçlarında 404`, others.map((r) => r.status));
      }
      ok(await activeGrants(E[0].id) === 0, "kapı kapalıyken yetki yazılmadı");
      process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
    }

    // ── 1) Owner kapısı ─────────────────────────────────────────────────────
    section("1. Owner kapısı (yönetim uçları)");
    {
      const r = track("owner-subjects", await call(adminSubjects, asAdmin(OWNER)));
      ok(r.status === 200 && (r.json.data as { rows: unknown[] }).rows.length === 0, "owner envanter: 200, içe aktarım yokken boş", r.json);
      const cases: Array<[string, Parameters<typeof call>[1]]> = [
        ["admin (admin_level=owner, super değil)", asAdmin(ADMIN)],
        ["normal admin", asAdmin(ADMIN2)],
        ["uzman, admin başlığıyla", asAdmin(E[0])],
        ["oturumsuz", null],
        ["owner id + token yok", { kind: "admin", id: OWNER.id }],
        ["owner id + geçersiz token", { kind: "admin", id: OWNER.id, token: "zz-sahte-token" }],
        ["owner id + başka adminin token'ı (sahte kimlik)", { kind: "admin", id: OWNER.id, token: ADMIN.token }],
        ["owner, kullanıcı başlığıyla", asUser(OWNER)],
      ];
      for (const [label, a] of cases) {
        const s = track(`subjects:${label}`, await call(adminSubjects, a));
        const g = track(`access:${label}`, await call(adminAccessGet, a));
        ok(s.status === 404 && g.status === 404, `yönetim uçları 404: ${label}`, [s.status, g.status]);
      }
    }

    // ── 2) Sentetik katalog: 1 yayımlı + 1 taslak ───────────────────────────
    const PUB = randomUUID();
    const DRAFT = randomUUID();
    await su.query(
      `insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, documented_local_time, document_quote, utc_status, birth_utc, legal_status, created_by, legal_reviewed_by, legal_reviewed_at, legal_review_ref, utc_offset_seconds, latitude, longitude) values
       ($1,'zz-sentetik-yayimli-1900-01-01','ZZ-1','ZZ Sentetik Yayımlı','bilim',false,'1900-01-01','ZZ Şehir','10:00','ZZ sentetik belge ifadesi','VERIFIED','1900-01-01T09:00:00Z','LOW_REVIEWED',$3,$3,now(),'ZZ-AV-1',3600,48.85,2.35),
       ($2,'zz-sentetik-taslak-1901-02-02','ZZ-2','ZZ Sentetik Taslak','sanat',false,'1901-02-02','ZZ Kasaba','11:30','ZZ sentetik belge ifadesi 2','PENDING_VERIFICATION',null,'E',$3,null,null,null,null,null,null)`,
      [PUB, DRAFT, OWNER.id],
    );
    await su.query(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution) values ($1,1,'birth_time','https://example.test/zz-belge','ZZ Arşiv')`, [PUB]);
    const ch = (await su.query(
      `insert into public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, computed_result, calc_status)
       values ($1,1,1,'{"date":"1900-01-01"}',repeat('a',64),'test','/test','t-1','{"type":"x"}','OK') returning id`, [PUB])).rows[0].id as string;
    await su.query(`insert into public.hd_education_publications (subject_id) values ($1),($2)`, [PUB, DRAFT]);
    // B2 kuralı: owner snapshot doğrulaması → owner onayı → yayın (iki adım).
    await su.query(`update public.hd_education_publications set chart_id=$2, chart_verified_by=$3, chart_verified_at=now() where subject_id=$1`, [PUB, ch, OWNER.id]);
    await su.query(`update public.hd_education_publications set status='approved', approved_by=$2, approved_at=now(), legal_clearance_ref='ZZ-L-1', updated_by=$2 where subject_id=$1`, [PUB, OWNER.id]);
    await su.query(`update public.hd_education_publications set status='published', updated_by=$2 where subject_id=$1`, [PUB, OWNER.id]);
    {
      const r = track("owner-subjects-2", await call(adminSubjects, asAdmin(OWNER)));
      const d = r.json.data as { rows: Array<{ id: string; publicationStatus: string; sources: unknown[] }>; summary: Record<string, number> };
      ok(r.status === 200 && d.rows.length === 2 && d.summary.published === 1 && d.summary.legalE === 1 && d.summary.utcPending === 1, "owner envanter: 2 sentetik kayıt + özet", d?.summary);
      ok(d.rows.find((x) => x.id === PUB)?.sources.length === 1, "owner envanter: güncel revizyon kaynakları");
    }

    // ── 3) Yetki verme (yalnız owner) ───────────────────────────────────────
    section("3. Yetki ver / reddet");
    {
      const g0 = track("grant-E0", await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[0].id, note: "ZZ not", actorId: ADMIN.id, role: "admin", grantedBy: ADMIN.id } }));
      const g1 = track("grant-E1", await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[1].id } }));
      ok(g0.status === 200 && g1.status === 200, "owner E0 ve E1'e yetki verdi", [g0.json, g1.json]);
      const by = (await su.query(`select granted_by, granted_tenant_id from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [E[0].id])).rows[0];
      ok(by?.granted_by === OWNER.id && by?.granted_tenant_id === T[0], "granted_by = oturumdan doğrulanan owner (gövdedeki actorId/role YOK SAYILDI); tenant bağlı", by);
      for (const [label, a] of [["admin (admin_level=owner)", asAdmin(ADMIN)], ["normal admin", asAdmin(ADMIN2)], ["uzman", asAdmin(E[0])], ["oturumsuz", null]] as const) {
        const r = track(`grant-by:${label}`, await call(adminAccessPost, a, { method: "POST", body: { action: "grant", userId: E[2].id } }));
        ok(r.status === 404, `${label} yetki veremez (404)`, r.status);
      }
      ok(await activeGrants(E[2].id) === 0, "reddedilen denemeler satır üretmedi");
      const dup = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[0].id } });
      ok(dup.status === 409 && await activeGrants(E[0].id) === 1, "mükerrer etkin yetki reddedildi (409)", dup.json);
      for (const [label, w] of [["HD izni yok", NOHD], ["demo", DEMO], ["pasif", PASIF], ["onay bekleyen", PENDING], ["admin hedef", ADMIN]] as const) {
        const r = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: w.id } });
        ok(r.status === 409 && await activeGrants(w.id) === 0, `uygun olmayan hedef reddedildi: ${label}`, [r.status, r.json]);
      }
      const self = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: OWNER.id } });
      ok(self.status === 400 || self.status === 409, "owner kendine yetki veremez", [self.status, self.json]);
      const bad = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: "zz-not-uuid" } });
      const none = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: randomUUID() } });
      const act = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "publish", userId: E[3].id } });
      ok(bad.status === 400 && none.status === 404 && act.status === 400, "geçersiz uuid 400 / olmayan kullanıcı 404 / geçersiz işlem 400", [bad.status, none.status, act.status]);
      const big = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[3].id, note: "x".repeat(5000) } });
      ok(big.status === 413 && await activeGrants(E[3].id) === 0, "aşırı büyük gövde reddedildi (413)", big.status);
    }

    // ── 4) 100 kullanıcı / 2 yetki / 98 red ─────────────────────────────────
    section("4. 100 kullanıcı / 2 yetki / 98 red");
    {
      let allowed = 0;
      let denied = 0;
      const allowedIds: string[] = [];
      for (const w of E) {
        const r = track(`view:${w.id}`, await call(viewAccess, asUser(w)));
        if (r.status === 200) { allowed++; allowedIds.push(w.id); } else if (r.status === 404) denied++;
      }
      ok(allowed === 2 && denied === 98, `100 uzman → ${allowed} erişim / ${denied} red`, { allowed, denied });
      ok(allowedIds.sort().join() === [E[0].id, E[1].id].sort().join(), "erişen 2 kişi tam olarak yetki verilen E0/E1");
      console.log(`  ⇒ SONUÇ 100/2/98: erişim=${allowed} red=${denied}`);
    }

    // ── 5) Katalog: yalnız yayımlı + yalnız yetkili ─────────────────────────
    section("5. Katalog: yayımlı / yayımlanmamış id");
    {
      const l = track("charts-E0", await call(viewCharts, asUser(E[0])));
      const items = (l.json.items ?? []) as Array<{ id: string }>;
      ok(l.status === 200 && items.length === 1 && items[0].id === PUB, "yetkili eğitmen: yalnız yayımlı kayıt listelenir (taslak yok)", l.json);
      ok(!/ZZ Sentetik Taslak|document_quote|documentQuote|legal|blockers|birthUtc/.test(l.body), "liste yanıtında taslak/hukuk/belge alıntısı/UTC alanı yok");
      const one = track("chart-pub", await call(viewChart, asUser(E[0]), { params: { id: PUB } }));
      ok(one.status === 200, "yetkili eğitmen: yayımlı kayıt 200");
      for (const [label, id] of [["taslak id", DRAFT], ["rastgele uuid", randomUUID()], ["bozuk id", "../../etc"], ["boş", ""]] as const) {
        const r = track(`chart:${label}`, await call(viewChart, asUser(E[0]), { params: { id } }));
        ok(r.status === 404, `yetkili eğitmen, ${label} → 404`, r.status);
      }
      const other = track("chart-pub-E5", await call(viewChart, asUser(E[5]), { params: { id: PUB } }));
      const otherL = track("charts-E5", await call(viewCharts, asUser(E[5])));
      ok(other.status === 404 && otherL.status === 404, "yetkisiz HD uzmanı yayımlı id'yi bilse de 404");
    }

    // ── 6) Rol senaryoları (görüntüleme uçları) ─────────────────────────────
    section("6. Rol senaryoları");
    {
      const cases: Array<[string, Parameters<typeof call>[1]]> = [
        ["owner", asUser(OWNER)], ["owner admin başlığıyla", asAdmin(OWNER)], ["admin (admin_level=owner)", asUser(ADMIN)], ["normal admin", asUser(ADMIN2)],
        ["HD izinsiz uzman", asUser(NOHD)], ["demo", asUser(DEMO)], ["pasif", asUser(PASIF)], ["onay bekleyen", asUser(PENDING)], ["premium olmayan (deneme)", asUser(TRIAL)],
        ["premium olmayan (pro)", asUser(PRO)],
        ["oturumsuz", null], ["E0 id + token yok", { kind: "user", id: E[0].id }], ["E0 id + geçersiz token", { kind: "user", id: E[0].id, token: "zz-gecersiz" }],
        ["E0 id + yetkisiz E5 token'ı (sahte user_id)", { kind: "user", id: E[5].id, token: E[0].token }],
        ["E5 id + E0 token'ı", { kind: "user", id: E[0].id, token: E[5].token }],
      ];
      for (const [label, a] of cases) {
        const r1 = track(`v:${label}`, await call(viewAccess, a));
        const r2 = track(`l:${label}`, await call(viewCharts, a));
        const r3 = track(`d:${label}`, await call(viewChart, a, { params: { id: PUB } }));
        ok(r1.status === 404 && r2.status === 404 && r3.status === 404, `görüntüleme uçları 404: ${label}`, [r1.status, r2.status, r3.status]);
      }
    }

    // ── 7) İptal anında etkili; admin iptal edemez ──────────────────────────
    section("7. İptal");
    {
      const byAdmin = await call(adminAccessPost, asAdmin(ADMIN), { method: "POST", body: { action: "revoke", userId: E[0].id } });
      ok(byAdmin.status === 404 && await activeGrants(E[0].id) === 1, "admin (owner değil) yetki kaldıramaz");
      const before = await call(viewCharts, asUser(E[1]));
      const rv = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "revoke", userId: E[1].id } });
      const after = track("after-revoke", await call(viewCharts, asUser(E[1])));
      const afterOne = track("after-revoke-one", await call(viewChart, asUser(E[1]), { params: { id: PUB } }));
      ok(before.status === 200 && rv.status === 200 && after.status === 404 && afterOne.status === 404, "owner iptali sonraki ilk istekte etkili (açık sekme/önbellek yok)", [before.status, rv.status, after.status]);
      ok(await lastRevoke(E[1].id) === "owner_revoked", "iptal nedeni owner_revoked");
      const again = await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "revoke", userId: E[1].id } });
      ok(again.status === 409, "etkin yetkisi olmayan iptal 409");
    }

    // ── 8) HD modül izni kaldırılırsa erişim yok ───────────────────────────
    section("8. HD modül izni");
    {
      await su.query(`update public.users set module_permissions = '{"human_design": false, "clients": true}' where id=$1`, [E[0].id]);
      const r = track("nohd-after", await call(viewCharts, asUser(E[0])));
      ok(r.status === 404, "HD izni kaldırılan eğitmen 404");
      await su.query(`update public.users set module_permissions = '{"human_design": true, "clients": true}' where id=$1`, [E[0].id]);
      ok((await call(viewCharts, asUser(E[0]))).status === 200, "HD izni geri verilince (owner yetkisi etkin) erişim sürer");
    }

    // ── 8b) Premium sona erdi (paket düştü) / hesap pasifleşti → erişim yok ──
    section("8b. Premium / pasif");
    {
      await su.query(`update public.users set package_type='trial', plan='trial' where id=$1`, [E[0].id]);
      ok((await call(viewCharts, asUser(E[0]))).status === 404, "paketi premium'dan düşen yetkili eğitmen 404");
      await su.query(`update public.users set package_type='premium', plan='premium' where id=$1`, [E[0].id]);
      await su.query(`update public.users set active=false where id=$1`, [E[0].id]);
      ok((await call(viewCharts, asUser(E[0]))).status === 404, "pasifleştirilen yetkili eğitmen 404");
      await su.query(`update public.users set active=true where id=$1`, [E[0].id]);
      ok((await call(viewCharts, asUser(E[0]))).status === 200, "yeniden aktif + premium → owner yetkisi etkin olduğundan erişim sürer");
    }

    // ── 9) Admin yapılan eğitmen kalıcı kapanır ─────────────────────────────
    section("9. Rol değişimi");
    {
      const grant = async (w: Who) => (await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: w.id } })).status;
      ok(await grant(E[2]) === 200 && (await call(viewAccess, asUser(E[2]))).status === 200, "E2 yetkili");
      await su.query(`update public.users set role='admin' where id=$1`, [E[2].id]);
      await su.query(`insert into public.admin_audit_log(actor_admin_id, target_user_id, action) values ($1,$2,'role_changed')`, [ADMIN2.id, E[2].id]);
      ok((await call(viewAccess, asUser(E[2]))).status === 404, "admin yapılınca anında 404");
      ok(await activeGrants(E[2].id) === 0 && await lastRevoke(E[2].id) === "role_changed", "yetki kalıcı kapatıldı (role_changed)");
      await su.query(`update public.users set role='expert' where id=$1`, [E[2].id]);
      ok((await call(viewAccess, asUser(E[2]))).status === 404 && await activeGrants(E[2].id) === 0, "yeniden uzman yapılması erişimi geri GETİRMEZ");

      // Arada hiç istek yokken admin→uzman gidiş-dönüşü: denetim kaydı yakalar.
      ok(await grant(E[3]) === 200, "E3 yetkili");
      await su.query(`update public.users set role='admin' where id=$1`, [E[3].id]);
      await su.query(`insert into public.admin_audit_log(actor_admin_id, target_user_id, action) values ($1,$2,'role_changed')`, [ADMIN2.id, E[3].id]);
      await su.query(`update public.users set role='expert' where id=$1`, [E[3].id]);
      await su.query(`insert into public.admin_audit_log(actor_admin_id, target_user_id, action) values ($1,$2,'role_changed')`, [ADMIN2.id, E[3].id]);
      ok((await call(viewAccess, asUser(E[3]))).status === 404 && await lastRevoke(E[3].id) === "role_changed", "sessiz admin→uzman gidiş-dönüşü de kalıcı kapatır");
    }

    // ── 9b) Eşzamanlı istekler + rol değişimi sıralaması ────────────────────
    section("9b. Eşzamanlılık");
    {
      const grant = async (w: Who) => (await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: w.id } })).status;
      ok(await grant(E[9]) === 200, "E9 yetkili");
      // Rol yazımı (route sırası: önce users.role, sonra admin_audit_log) ile paralel okuma yağmuru.
      const burst1 = Array.from({ length: 12 }, () => call(viewAccess, asUser(E[9])));
      await su.query(`update public.users set role='admin' where id=$1`, [E[9].id]);
      const mid = await Promise.all(Array.from({ length: 12 }, () => call(viewAccess, asUser(E[9])))); // audit henüz yok
      await su.query(`insert into public.admin_audit_log(actor_admin_id, target_user_id, action) values ($1,$2,'role_changed')`, [OWNER.id, E[9].id]);
      await su.query(`update public.users set role='expert' where id=$1`, [E[9].id]);
      const after = await Promise.all(Array.from({ length: 12 }, () => call(viewAccess, asUser(E[9]))));
      await Promise.all(burst1);
      ok(mid.every((r) => r.status === 404), "rol admin yazıldıktan sonraki (denetim kaydı öncesi) tüm paralel istekler 404", mid.map((r) => r.status));
      ok(after.every((r) => r.status === 404), "uzmana geri dönüş sonrası tüm paralel istekler 404 (yetki dirilmedi)", after.map((r) => r.status));
      ok(await activeGrants(E[9].id) === 0 && await lastRevoke(E[9].id) === "role_changed", "tek kalıcı iptal (role_changed); etkin yetki 0");
      const autoN = Number((await su.query(`select count(*)::int n from public.hd_education_audit_events where action='access_auto_revoked' and target_user_id=$1`, [E[9].id])).rows[0].n);
      ok(autoN === 1, "paralel isteklere rağmen tek otomatik iptal denetim kaydı", autoN);

      // Owner yetki verirken aynı anda rol admin yapılırsa: ya hiç verilmez ya da ilk okumada kalıcı kapanır.
      const [g, _] = await Promise.all([
        call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[10].id } }),
        su.query(`update public.users set role='admin' where id=$1`, [E[10].id]),
      ]);
      void _;
      raceGrantOk = g.status === 200;
      const v = await call(viewAccess, asUser(E[10]));
      ok(v.status === 404 && await activeGrants(E[10].id) === 0, `yetki verme ↔ rol değişimi yarışı güvenli (grant=${g.status})`, { grant: g.status, view: v.status });
      await su.query(`update public.users set role='expert' where id=$1`, [E[10].id]);
      ok((await call(viewAccess, asUser(E[10]))).status === 404, "yarış sonrası yeniden uzman → erişim yok");

      // BİLİNEN KALINTI (P3, belgelenir; PASS sayılmaz): denetim kaydı YAZILAMAZSA ve arada hiç okuma yoksa admin→uzman
      // gidiş-dönüşü iz bırakmaz. users route denetim hatasında 500 döner; tetiklemek için ana yönetici + DB yazma hatası gerekir.
      ok(await grant(E[11]) === 200, "E11 yetkili (kalıntı gözlemi)");
      await su.query(`update public.users set role='admin' where id=$1`, [E[11].id]);
      await su.query(`update public.users set role='expert' where id=$1`, [E[11].id]);
      const residual = (await call(viewAccess, asUser(E[11]))).status;
      console.log(`  ℹ KALINTI GÖZLEMİ (denetimsiz + okumasız gidiş-dönüş): erişim=${residual} — rapora P3 olarak yazılır`);
      await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "revoke", userId: E[11].id } });
    }

    // ── 10) Tenant değişimi ─────────────────────────────────────────────────
    section("10. Tenant değişimi");
    {
      ok((await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[4].id } })).status === 200, "E4 yetkili");
      const orig = (await su.query(`select tenant_id from public.users where id=$1`, [E[4].id])).rows[0].tenant_id as string;
      await su.query(`update public.users set tenant_id=$2 where id=$1`, [E[4].id, T[3] === orig ? T[2] : T[3]]);
      ok((await call(viewAccess, asUser(E[4]))).status === 404 && await lastRevoke(E[4].id) === "tenant_changed", "tenant değişince 404 + tenant_changed");
      await su.query(`update public.users set tenant_id=$2 where id=$1`, [E[4].id, orig]);
      ok((await call(viewAccess, asUser(E[4]))).status === 404, "eski tenant'a dönüş erişimi geri getirmez");
    }

    // ── 11) Kullanıcı silme → sarkan yetki yok ──────────────────────────────
    section("11. Kullanıcı silme");
    {
      ok((await call(adminAccessPost, asAdmin(OWNER), { method: "POST", body: { action: "grant", userId: E[6].id } })).status === 200, "E6 yetkili");
      await su.query(`delete from public.user_sessions where user_id=$1`, [E[6].id]);
      await su.query(`delete from public.users where id=$1`, [E[6].id]);
      const n = Number((await su.query(`select count(*)::int n from public.hd_education_access_grants where user_id=$1`, [E[6].id])).rows[0].n);
      const aud = Number((await su.query(`select count(*)::int n from public.hd_education_audit_events where target_user_id=$1`, [E[6].id])).rows[0].n);
      const kept = Number((await su.query(`select count(*)::int n from public.hd_education_audit_events where action='access_granted' and target_user_id is null`)).rows[0].n);
      ok(n === 0 && aud === 0 && kept >= 1, "yetki satırı CASCADE silindi; denetim kaydı korunup hedef NULL'landı", { n, aud, kept });
    }

    // ── 11b) Yayındaki kişinin kanıtı: DB kilidi + okuma anı filtresi ───────
    section("11b. Yayın sonrası kanıt");
    {
      const blocked = await su.query(`update public.hd_education_subjects set legal_status='E', revision=revision+1 where id=$1`, [PUB]).then(() => "kabul", (e: { code?: string }) => e.code);
      ok(blocked === "23514", "DB: yayındaki kişinin hukuk statüsü değiştirilemez (önce yayından kaldırma)", blocked);
      // Derinlemesine savunma: tetikleyici yokmuş gibi tutarsız durum oluşturulur (yalnız test süper kullanıcısı) → okuma filtresi gizler.
      await su.query(`alter table public.hd_education_subjects disable trigger trg_hd_edu_subject_guard`);
      for (const [label, sql] of [
        ["hukuk E", `update public.hd_education_subjects set legal_status='E' where id=$1`],
        ["yeni engel", `update public.hd_education_subjects set legal_status='LOW_REVIEWED', blockers=array['KAYNAK'] where id=$1`],
        ["UTC teyit bekliyor", `update public.hd_education_subjects set blockers='{}', utc_status='PENDING_VERIFICATION' where id=$1`],
        ["yaşayan kişi", `update public.hd_education_subjects set utc_status='VERIFIED', is_living=true where id=$1`],
        ["snapshot eski revizyon", `update public.hd_education_subjects set is_living=false, revision=revision+1 where id=$1`],
      ] as const) {
        await su.query(sql, [PUB]);
        const l = await call(viewCharts, asUser(E[0]));
        const d = track(`downgrade:${label}`, await call(viewChart, asUser(E[0]), { params: { id: PUB } }));
        ok(l.status === 200 && (l.json.items as unknown[]).length === 0 && d.status === 404, `okuma filtresi gizler: ${label}`, [l.status, (l.json.items as unknown[] | undefined)?.length, d.status]);
      }
      await su.query(`update public.hd_education_subjects set revision=revision-1 where id=$1`, [PUB]);
      await su.query(`alter table public.hd_education_subjects enable trigger trg_hd_edu_subject_guard`);
      const back = await call(viewCharts, asUser(E[0]));
      ok(back.status === 200 && (back.json.items as unknown[]).length === 1, "tutarlı duruma dönünce kayıt yeniden görünür (filtre aşırı değil)");
    }

    // ── 12) Yayından kaldırma ───────────────────────────────────────────────
    section("12. Yayından kaldırma");
    {
      await su.query(`update public.hd_education_publications set status='withdrawn', withdrawn_at=now(), withdraw_reason='ZZ test', updated_by=$2 where subject_id=$1`, [PUB, OWNER.id]);
      const l = await call(viewCharts, asUser(E[0]));
      const d = track("withdrawn", await call(viewChart, asUser(E[0]), { params: { id: PUB } }));
      ok(l.status === 200 && (l.json.items as unknown[]).length === 0 && d.status === 404, "kaldırılan kayıt yetkili eğitmene de görünmez");
    }

    // ── 13) Owner genel bakış + denetim ─────────────────────────────────────
    section("13. Owner genel bakış + denetim");
    {
      const r = track("overview", await call(adminAccessGet, asAdmin(OWNER), { query: "?q=ZZ_EDU_E00" }));
      const d = r.json.data as { users: Array<{ id: string; grant: unknown }>; activeCount: number; events: Array<{ action: string }> };
      ok(r.status === 200 && d.activeCount === 1 && d.users.some((u) => u.id === E[0].id && u.grant), "owner genel bakış: etkin yetki sayısı 1 (E0)", { activeCount: d?.activeCount });
      const ev = (await su.query(`select action, actor_kind, count(*)::int n from public.hd_education_audit_events where action like 'access_%' group by 1,2 order by 1,2`)).rows;
      const n = (a: string) => ev.filter((x) => x.action === a).reduce((s, x) => s + Number(x.n), 0);
      const eg = 8 + (raceGrantOk ? 1 : 0);
      const ea = 4 + (raceGrantOk ? 1 : 0);
      ok(n("access_granted") === eg && n("access_revoked") === 2 && n("access_auto_revoked") === ea, `denetim: ${eg} verme / 2 iptal / ${ea} otomatik kapatma`, ev);
      const ownerActs = (await su.query(`select count(*)::int n from public.hd_education_audit_events where action in ('access_granted','access_revoked') and actor_user_id <> $1`, [OWNER.id])).rows[0].n;
      ok(Number(ownerActs) === 0, "tüm verme/iptal kayıtlarının aktörü owner");
    }

    // ── 14) Ayrıcalık kilidi ────────────────────────────────────────────────
    section("14. Ayrıcalık kilidi");
    {
      const tables = ["subjects", "sources", "charts", "publications", "audit_events", "takedown_requests", "access_grants"].map((t) => `public.hd_education_${t}`);
      let leak = 0;
      for (const role of ["anon", "authenticated", "public"]) {
        for (const t of tables) {
          for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
            const r = await su.query(`select has_table_privilege($1, $2, $3) v`, [role, t, p]).catch(() => ({ rows: [{ v: false }] }));
            if (r.rows[0].v) leak++;
          }
        }
        for (const f of RPCS) {
          const r = await su.query(`select has_function_privilege($1, p.oid, 'EXECUTE') v from pg_proc p where proname=$2`, [role, f]).catch(() => ({ rows: [{ v: false }] }));
          if (r.rows.some((x: { v: boolean }) => x.v)) leak++;
        }
      }
      ok(leak === 0, "anon/authenticated/PUBLIC: tablo ve RPC ayrıcalığı YOK", leak);
      let blocked = 0;
      for (const sql of [
        `insert into public.hd_education_access_grants(user_id, granted_tenant_id, granted_by) values ('${E[7].id}','${T[3]}','${OWNER.id}')`,
        `delete from public.hd_education_audit_events`,
        `select public.hd_edu_actor_is_owner('${OWNER.id}')`,
      ]) {
        await su.query("SET ROLE service_role");
        try { await su.query(sql); } catch { blocked++; } finally { await su.query("RESET ROLE"); }
      }
      ok(blocked === 3, "service_role: doğrudan yetki INSERT / denetim DELETE / iç owner fonksiyonu reddedilir", blocked);
      const rpcAdmin = await su.query(`select public.hd_education_grant_access($1,$2,null)`, [ADMIN.id, E[8].id]).then(() => "kabul", (e: { code?: string }) => e.code);
      ok(rpcAdmin === "ED002", "DB: owner olmayan aktörle RPC reddedilir (ED002)", rpcAdmin);
    }

    // ── Ortak: aynı 404 gövdesi + no-store ──────────────────────────────────
    section("Ortak 404 / önbellek");
    ok(notFoundBodies.size === 1, `tüm 404 gövdeleri özdeş (${[...notFoundBodies].join(" | ")})`);
    ok(![...notFoundBodies].some((b) => /katalog|erişim|yetki|eğitim|unauthor|forbidden/i.test(b)), "404 gövdesinde katalog/erişim/yetki ifadesi yok");
    ok(nonNoStore.length === 0, "tüm yanıtlar Cache-Control: no-store", nonNoStore.slice(0, 5));
    ok(external.length === 0, `dış ağ / Roxy çağrısı 0 (${external.length})`, external);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nhd-education access harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });

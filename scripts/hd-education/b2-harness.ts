/**
 * HD Hazır Eğitim Haritaları — FAZ 2-B2 testi: tarihsel UTC katmanı + owner hesaplama + doğrulama/hukuk/yayın akışı.
 * İzole embedded-postgres + PostgREST shim + migration 20271110000000 + 20271112000000 + GERÇEK route'lar.
 * SAĞLAYICI TAMAMEN SAHTE: global fetch kilidi; roxyapi bodygraph ucu yalnız repo fixture'ından tutarlı yanıt üretir ve
 * SAYILIR (gerçek ücretli çağrı YOK, gerçek anahtar YOK). Tüm kişiler SENTETİK (ZZ_*).
 * Bu test GERÇEK sağlayıcı doğrulaması DEĞİLDİR (bkz. sağlayıcı çağrı planı).
 * Çalıştır: npx tsx scripts/hd-education/b2-harness.ts   (HD_EDU_B2_PG_PORT, varsayılan 54563)
 */
import "../hd-analysis-word-flow/env"; // server-only stub + sahte Roxy anahtarı
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { parseDocumentedLocalTime, parseUtcOffsetText, resolveEducationBirthUtc, type EduUtcInput } from "../../lib/human-design/education/educationUtc";

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
const FIXTURE = readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
const PRE_DDL = `create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid,
  target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`;
// Global hız sınırı / çok-instance kirası: production'daki auth_rate_limit_hit (20270130000000) BİREBİR (dosyadan okunur).
const RL_SQL = (() => {
  const m = readFileSync(path.join(ROOT, "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8");
  const start = m.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events");
  const fn = m.indexOf("CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(");
  const end = m.indexOf("$$;", fn) + 3;
  if (start < 0 || fn < 0 || end < 3) throw new Error("auth_rate_limit_hit tanımı bulunamadı");
  return m.slice(start, end);
})();
const RPCS = ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible", "auth_rate_limit_hit"];

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(h: Handler, auth: { kind: "user" | "admin"; id: string; token: string } | null, o: { method?: string; body?: unknown; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
  if (auth) { headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest("http://localhost/api/test", { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const body = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control") };
}

function utcUnitTests() {
  section("A. Tarihsel UTC katmanı (saf)");
  const base: EduUtcInput = { birthDate: "1869-11-22", documentedLocalTime: "03:00 ('ZZ trois heures du matin')", timeStandard: "Paris ortalama saati (LMT)", utcOffsetSeconds: 561, birthUtc: "1869-11-22T02:50:39Z", utcStatus: "VERIFIED", ianaZone: "Europe/Paris", latitude: 48.85, longitude: 2.35 };
  const r = resolveEducationBirthUtc(base);
  ok(r.ok && r.utcIso === "1869-11-22T02:50:39Z" && r.request.time === "02:50:39" && r.request.timezone === "UTC" && r.request.date === "1869-11-22", "LMT +00:09:21 → UTC saniyeli; sağlayıcıya UTC tarih/saat + 'UTC'", r);
  ok(r.ok && r.secondsNonZero === true, "saniyeli UTC işaretlenir (sağlayıcının saniye işleme davranışı doğrulanmadı)");
  ok(r.ok && /modern saat dilimi kuralı kullanılmaz/.test(r.methodology), "metodoloji açıklaması üretilir");
  const roll = resolveEducationBirthUtc({ ...base, birthDate: "1953-04-27", documentedLocalTime: "20 heures 34 minutes (= 20:34)", utcOffsetSeconds: -14400, birthUtc: "1953-04-28T00:34:00Z", ianaZone: "America/New_York", timeStandard: "EDT" });
  ok(roll.ok && roll.request.date === "1953-04-28" && roll.request.time === "00:34:00", "negatif ofset → UTC ertesi gün (tarih atlaması) + '(= HH:MM)' okunur", roll);
  const plus = resolveEducationBirthUtc({ ...base, birthDate: "1924-05-22", documentedLocalTime: "00:15 ('ZZ')", utcOffsetSeconds: 3600, birthUtc: "1924-05-21T23:15:00Z", timeStandard: "CET" });
  ok(plus.ok && plus.request.date === "1924-05-21", "pozitif ofset → UTC önceki gün");
  ok(parseDocumentedLocalTime("12:31 A.M. (= 00:31)")?.h === 0, "'12:31 A.M. (= 00:31)' → açık karşılık 00:31");
  ok(parseDocumentedLocalTime("7:24 P.M. ZZ") === null, "AM/PM'li açık karşılıksız saat okunmaz (tahmin YOK)");
  ok(parseDocumentedLocalTime("dix heures du matin") === null, "rakamsız saat ifadesi okunmaz");
  ok(parseUtcOffsetText("-00:00:45 (ZZ)") === -45 && parseUtcOffsetText("+00:39:58") === 2398 && parseUtcOffsetText("+02:00") === 7200, "ofset metni saniyeye");
  const cases: Array<[string, Partial<EduUtcInput>, string]> = [
    ["PENDING", { utcStatus: "PENDING_VERIFICATION" }, "UTC_NOT_VERIFIED"],
    ["UTC yok", { birthUtc: null }, "UTC_MISSING"],
    ["koordinat yok", { latitude: null }, "COORDINATES_MISSING"],
    ["yerel saat okunamıyor", { documentedLocalTime: "sabah" }, "LOCAL_TIME_UNPARSED"],
    ["ofset yok", { utcOffsetSeconds: null }, "OFFSET_MISSING"],
    ["tutarsız (1 dk)", { birthUtc: "1869-11-22T02:51:39Z" }, "UTC_INCONSISTENT"],
    ["tutarsız (modern kural sanılan ofset)", { utcOffsetSeconds: 0 }, "UTC_INCONSISTENT"],
  ];
  for (const [label, patch, code] of cases) {
    const x = resolveEducationBirthUtc({ ...base, ...patch });
    ok(!x.ok && x.code === code, `red: ${label} → ${code}`, x);
  }
  const berlin = resolveEducationBirthUtc({ ...base, birthDate: "1879-03-14", documentedLocalTime: "11:30", utcOffsetSeconds: 2398, birthUtc: "1879-03-14T10:50:02Z", ianaZone: "Europe/Berlin", timeStandard: "ZZ şehir LMT" });
  ok(berlin.ok && berlin.ianaModern !== null && berlin.ianaModern.deltaSeconds !== 0 && /modern kural/.test(berlin.methodology), "belgeli LMT ≠ modern IANA → fark yalnız BİLGİ olarak raporlanır, karar belgeye dayanır", berlin.ok ? berlin.ianaModern : berlin);
}

async function main() {
  utcUnitTests();

  // Ağ kilidi: yalnız 127.0.0.1 + sahte bodygraph ucu (sayılır).
  const prov = { calls: 0, delayMs: 120, mode: "ok" as "ok" | "500" | "network" | "malformed" | "mismatch", bodies: [] as Record<string, unknown>[], keys: [] as string[], external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/\/rest\/v1\/rpc\/auth_rate_limit_hit$/.test(u)) {
      // Test shim RPC sonucunu satır dizisi döndürür; gerçek PostgREST skaler jsonb fonksiyonu DOĞRUDAN döndürür → aynı biçime çevir.
      const res = await realFetch(input, init);
      const txt = await res.text();
      let out = txt;
      try { const j = JSON.parse(txt) as unknown; if (Array.isArray(j) && j.length === 1 && j[0] && typeof j[0] === "object" && "auth_rate_limit_hit" in j[0]) out = JSON.stringify((j[0] as Record<string, unknown>).auth_rate_limit_hit); } catch { /* olduğu gibi */ }
      return new Response(out, { status: res.status, headers: { "content-type": "application/json" } });
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    if (/^https:\/\/roxyapi\.com\/api\/v2\/human-design\/bodygraph\?lang=tr$/.test(u)) {
      prov.calls++;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      prov.bodies.push(body);
      prov.keys.push(new Headers(init?.headers).get("x-api-key") ?? "");
      await new Promise((r) => setTimeout(r, prov.delayMs));
      if (prov.mode === "network") throw new TypeError("fetch failed");
      if (prov.mode === "500") return new Response("{}", { status: 500 });
      if (prov.mode === "malformed") return new Response("<html>", { status: 200, headers: { "content-type": "application/json" } });
      const txt = consistentRoxyResponse(FIXTURE, JSON.stringify(body));
      const j = JSON.parse(txt) as Record<string, unknown>;
      if (prov.mode === "mismatch") j.designInstantUtc = "2001-01-01T00:00:00.000Z";
      return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
    }
    prov.external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_B2_PG_PORT ?? 54563), dirName: `hd-edu-b2-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: RPCS, extraSql: [PRE_DDL, RL_SQL, ...MIG],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
  delete process.env.HD_EDUCATION_PROVIDER_CALLS_ENABLED; // varsayılan KAPALI
  const su = env.su;
  try {
    const detailMod = await import("../../app/api/admin/hd/education/subjects/[id]/route");
    const detailGet = detailMod.GET as unknown as Handler;
    const actionPost = detailMod.POST as unknown as Handler;
    const computePost = (await import("../../app/api/admin/hd/education/subjects/[id]/compute/route")).POST as unknown as Handler;
    const listSubjects = (await import("../../app/api/admin/hd/education/subjects/route")).GET as unknown as Handler;
    const accessPost = (await import("../../app/api/admin/hd/education/access/route")).POST as unknown as Handler;
    const viewCharts = (await import("../../app/api/hd/education/charts/route")).GET as unknown as Handler;
    const viewChart = (await import("../../app/api/hd/education/charts/[id]/route")).GET as unknown as Handler;
    const svc = await import("../../lib/human-design/education/educationCompute");

    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_EDU_B2')`, [T]);
    const mk = async (label: string, role: "admin" | "expert", superAdmin = false): Promise<Who> => {
      const id = randomUUID();
      const token = `zz-edu-b2-${label}-${id.slice(0, 8)}`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8)`,
        [id, `ZZ_B2_${label}`, `zz.b2.${label}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true } : {}), T, superAdmin, role === "admin" ? "owner" : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("owner", "admin", true);
    const ADMIN = await mk("admin", "admin");
    const EXP = await mk("exp", "expert");
    const asOwner = { kind: "admin" as const, ...OWNER };
    const asAdmin = { kind: "admin" as const, ...ADMIN };
    const asExp = { kind: "user" as const, ...EXP };

    const subj = async (key: string, o: { utc?: string | null; status?: string; offset?: number | null; local?: string; date?: string; lat?: number | null; legal?: string; blockers?: string[]; source?: boolean }) => {
      const id = randomUUID();
      await su.query(
        `insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, latitude, longitude, documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, legal_status, blockers)
         values ($1,$2,'ZZ',$3,'bilim',false,$4,'ZZ Şehir',$5,2.35,$6,'ZZ sentetik belge','ZZ LMT',$7,'Europe/Paris',$8,$9,$10,$11)`,
        [id, `zz-b2-${key}-${(o.date ?? "1869-11-22")}`, `ZZ B2 ${key}`, o.date ?? "1869-11-22", o.lat === undefined ? 48.85 : o.lat, o.local ?? "03:00 ('ZZ')",
          o.offset === undefined ? 561 : o.offset, o.utc === undefined ? "1869-11-22T02:50:39Z" : o.utc, o.status ?? "VERIFIED", o.legal ?? "LOW_UNREVIEWED", o.blockers ?? ["AVUKAT-GÖRMEDİ"]],
      );
      if (o.source !== false) await su.query(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution) values ($1,1,'birth_time','https://example.test/zz','ZZ Arşiv')`, [id]);
      await su.query(`insert into public.hd_education_publications (subject_id) values ($1)`, [id]);
      return id;
    };
    const A = await subj("a", {});
    const PENDING = await subj("pending", { status: "PENDING_VERIFICATION", utc: null, offset: null });
    const BAD = await subj("bad", { utc: "1869-11-22T02:00:00Z" });
    const NOSRC = await subj("nosrc", { source: false });
    const NOLAT = await subj("nolat", { lat: null });
    const F = await subj("f", { date: "1870-01-01", utc: "1870-01-01T02:50:39Z" });
    const charts = async (id: string) => (await su.query(`select * from public.hd_education_charts where subject_id=$1 order by version`, [id])).rows;
    const auditN = async (id: string, action: string) => Number((await su.query(`select count(*)::int n from public.hd_education_audit_events where subject_id=$1 and action=$2`, [id, action])).rows[0].n);
    const compute = (id: string, who = asOwner) => call(computePost, who, { method: "POST", params: { id } });
    const act = (id: string, body: Record<string, unknown>, who = asOwner) => call(actionPost, who, { method: "POST", body, params: { id } });
    const detail = async (id: string) => (await call(detailGet, asOwner, { params: { id } })).json.data as Record<string, unknown> & { stage: string; checklist: Record<string, boolean> };

    section("B. Hesaplama kapıları (sağlayıcı çağrısı öncesi)");
    {
      const r = await compute(A);
      ok(r.status === 409 && r.json.code === "PROVIDER_DISABLED" && prov.calls === 0, "ücretli çağrı kapısı KAPALI (varsayılan) → 409, dış istek 0", r.json);
      process.env.HD_EDUCATION_PROVIDER_CALLS_ENABLED = "1";
      ok((await compute(A)).json.code === "PROVIDER_DISABLED" && prov.calls === 0, "kapı yalnız tam 'true' ile açılır ('1' kapalı)");
      process.env.HD_EDUCATION_PROVIDER_CALLS_ENABLED = "true";
      for (const [label, id, code] of [["PENDING UTC", PENDING, "BLOCKED_UTC"], ["tutarsız UTC", BAD, "UTC_INCONSISTENT"], ["kaynak yok", NOSRC, "SOURCE_MISSING"], ["koordinat yok", NOLAT, "COORDINATES_MISSING"]] as const) {
        const x = await compute(id);
        ok(x.status === 409 && x.json.code === code, `${label} → ${code}, çağrı yok`, x.json);
      }
      ok(prov.calls === 0, "hiçbir red dalında sağlayıcıya istek gitmedi", prov.calls);
      for (const [label, who] of [["normal admin (admin_level=owner)", asAdmin], ["uzman (admin başlığıyla)", { kind: "admin" as const, ...EXP }]] as const) {
        const x = await compute(A, who);
        ok(x.status === 404 && x.json.error === "Bulunamadı.", `${label} hesaplatamaz → genel 404`);
      }
      const noCfg = await svc.computeEducationChart({ db: (await import("../../lib/supabase-server")).getServerDb(), ownerId: OWNER.id }, A, {
        config: null, callRoxy: async () => { throw new Error("çağrılmamalı"); }, rateLimit: async () => ({ allowed: true, retryAfterSec: 0, mode: "db" as const }), env: { HD_EDUCATION_PROVIDER_CALLS_ENABLED: "true" },
      });
      ok(noCfg.status === 503, "yapılandırma yok → 503, çağrı yok");
      const capped = await svc.computeEducationChart({ db: (await import("../../lib/supabase-server")).getServerDb(), ownerId: OWNER.id }, A, {
        config: { apiKey: "zz", baseUrl: "https://roxyapi.com/api/v2" }, callRoxy: async () => { throw new Error("çağrılmamalı"); },
        rateLimit: async (scope: string) => ({ allowed: scope !== "hd-edu-compute-daily", retryAfterSec: 3600, mode: "db" as const }), env: { HD_EDUCATION_PROVIDER_CALLS_ENABLED: "true" },
      });
      ok(capped.status === 429 && (capped.body as { code?: string }).code === "DAILY_CAP", "günlük tavan → 429, çağrı yok");
      const memMode = await svc.computeEducationChart({ db: (await import("../../lib/supabase-server")).getServerDb(), ownerId: OWNER.id }, A, {
        config: { apiKey: "zz", baseUrl: "https://roxyapi.com/api/v2" }, callRoxy: async () => { throw new Error("çağrılmamalı"); },
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0, mode: "memory" as const }), env: { HD_EDUCATION_PROVIDER_CALLS_ENABLED: "true" },
      });
      ok(memMode.status === 503 && (memMode.body as { code?: string }).code === "LOCK_UNAVAILABLE", "DB kilidi yok (bellek-içi yedek mod) → 503, ücretli çağrı YOK (fail-closed)");
    }

    section("C. Başarılı hesap + snapshot");
    {
      const r = await compute(A);
      ok(r.status === 200 && r.json.reused === false && r.json.version === 1 && prov.calls === 1, "owner hesap → 200, tek çağrı, sürüm 1", r.json);
      const b = prov.bodies[0];
      ok(b.date === "1869-11-22" && b.time === "02:50:39" && b.timezone === "UTC" && b.latitude === 48.85 && b.nodeType === "true", "sağlayıcı gövdesi: UTC tarih + saniyeli UTC saat + timezone 'UTC' (IANA/ofset YOK)", b);
      const [row] = await charts(A);
      ok(row && row.calc_status === "OK" && row.subject_revision === 1 && /^[0-9a-f]{64}$/.test(row.request_hash) && /^[0-9a-f]{64}$/.test(row.provider_raw_sha256), "snapshot: OK, revizyon 1, istek özeti + ham yanıt özeti");
      ok(row.request_body.timezone === "UTC" && !JSON.stringify(row.request_body).includes(prov.keys[0]) && !JSON.stringify(row).includes("zz-harness-fake-roxy-key"), "snapshot'ta API anahtarı YOK");
      ok(row.computed_result?.timing?.birthUtcIso?.startsWith("1869-11-22T02:50:39"), "normalize sonuç: doğum anı = belgeli UTC", row.computed_result?.timing);
      ok(row.computed_result?.input?.timezone === "UTC" && Array.isArray(row.computed_result?.activations) && row.computed_result.activations.length === 26, "mevcut sözleşme (26 aktivasyon) + girdi timezone 'UTC'");
      ok(row.time_check?.durum === "consistent" && row.boundary_flags?.saniyeGonderildi === true && row.boundary_flags?.saniyeIslemeDogrulandi === false, "zaman denetimi tutarlı; saniye işleme 'doğrulanmadı' olarak işaretli", { tc: row.time_check, bf: row.boundary_flags });
      ok(row.adapter_version === "roxy-bodygraph-1" && row.engine_version === "roxyapi:roxy-bodygraph-1" && row.created_by === OWNER.id, "adapter / motor sürümü + owner");
      ok(await auditN(A, "chart_recorded") === 1, "denetim: chart_recorded");
      const again = await compute(A);
      ok(again.status === 200 && again.json.reused === true && prov.calls === 1 && (await charts(A)).length === 1, "aynı istek tekrar → kayıtlı snapshot, YENİ ÇAĞRI YOK");
    }

    section("D. Eşzamanlılık + hata + otomatik tekrar yok");
    {
      const before = prov.calls;
      const [r1, r2] = await Promise.all([compute(F), compute(F)]);
      const codes = [r1.json.code ?? r1.status, r2.json.code ?? r2.status].map(String).sort();
      ok(prov.calls - before === 1 && (await charts(F)).length === 1 && codes.includes("IN_PROGRESS"), "aynı kişiye eşzamanlı iki istek → tek çağrı, tek snapshot, ikinci 'sürüyor'", codes);
      for (const [mode, code] of [["500", "PROVIDER_SERVER_ERROR"], ["network", "PROVIDER_NETWORK"], ["malformed", "PROVIDER_MALFORMED_JSON"], ["mismatch", "TIME_MISMATCH"]] as const) {
        const id = await subj(`fail-${mode}`, {});
        prov.mode = mode;
        const c0 = prov.calls;
        const r = await compute(id);
        ok(r.status >= 500 && r.json.code === code && prov.calls - c0 === 1, `${mode} → ${code}; TEK çağrı (otomatik tekrar yok)`, { status: r.status, code: r.json.code, calls: prov.calls - c0 });
        ok((await charts(id)).length === 0 && await auditN(id, "chart_failed") === 1, `${mode}: snapshot YAZILMADI; denetimde chart_failed`);
        const d = await detail(id);
        ok(d.stage === "Taslak" && d.checklist.snapshotOk === false, `${mode}: aşama 'Taslak' (hesaplandı gösterilmez)`);
      }
      prov.mode = "ok";
    }

    section("D2. Çok-instance (Vercel) simülasyonu — ücretli çağrı kirası");
    {
      const { callRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/client");
      const { readRoxyServerConfig } = await import("../../lib/human-design/providers/roxy/config");
      const { hitDbRateLimit, rateLimitBucket } = await import("../../lib/security/dbRateLimit");
      const db = (await import("../../lib/supabase-server")).getServerDb();
      type Deps = Parameters<typeof svc.computeEducationChart>[2];
      const realDeps: Deps = {
        config: readRoxyServerConfig(), callRoxy: (c, b, o) => callRoxyBodygraph(c, b, o),
        rateLimit: async (scope, limit, win, key) => hitDbRateLimit(db, rateLimitBucket(scope, key ?? "platform"), limit, win),
        env: { HD_EDUCATION_PROVIDER_CALLS_ENABLED: "true" },
      };
      const waitCalls = async (n: number) => { for (let i = 0; i < 200 && prov.calls < n; i++) await new Promise((r) => setTimeout(r, 10)); };
      // Örnek 2, örnek 1'in sağlayıcı çağrısı SÜRERKEN başlar; süreç içi kilit örnekler arasında paylaşılmaz → sıfırlanır.
      const twoInstances = async (id: string, deps: Deps) => {
        const c0 = prov.calls;
        prov.delayMs = 800;
        const p1 = svc.computeEducationChart({ db, ownerId: OWNER.id }, id, deps);
        await waitCalls(c0 + 1);
        svc.__resetEducationComputeLocks();
        const r2 = await svc.computeEducationChart({ db, ownerId: OWNER.id }, id, deps);
        const r1 = await p1;
        prov.delayMs = 120;
        return { r1, r2, calls: prov.calls - c0 };
      };
      const G = await subj("multi", { date: "1871-01-01", utc: "1871-01-01T02:50:39Z" });
      const a = await twoInstances(G, realDeps);
      ok(a.calls === 1 && a.r1.status === 200 && a.r2.status === 409 && (a.r2.body as { code?: string }).code === "IN_PROGRESS" && (await charts(G)).length === 1,
        "iki sunucu örneği aynı kişi → TEK ücretli çağrı (DB kirası), ikinci örnek çağrı yapmadan 409, tek snapshot", { calls: a.calls, r1: a.r1.status, r2: a.r2.body });
      const H = await subj("multi-old", { date: "1872-01-01", utc: "1872-01-01T02:50:39Z" });
      const noLease: Deps = { ...realDeps, rateLimit: async () => ({ allowed: true, retryAfterSec: 0, mode: "db" as const }) };
      const b = await twoInstances(H, noLease);
      ok(b.calls === 2 && (await charts(H)).length === 1,
        "KONTROL — kirasız (eski davranış): 2 ücretli çağrı; DB UNIQUE yalnız ikinci KAYDI reddetti (ücretli çağrıyı engellemedi)", { calls: b.calls, snaps: (await charts(H)).length });
      const I = await subj("lease-fail", { date: "1873-01-01", utc: "1873-01-01T02:50:39Z" });
      prov.mode = "500";
      const c0 = prov.calls;
      const f1 = await svc.computeEducationChart({ db, ownerId: OWNER.id }, I, realDeps);
      prov.mode = "ok";
      const f2 = await svc.computeEducationChart({ db, ownerId: OWNER.id }, I, realDeps);
      ok(f1.status === 502 && f2.status === 409 && prov.calls - c0 === 1 && (await charts(I)).length === 0,
        "sağlayıcı hatası sonrası: süreç kilidi bırakıldı, DB kirası süre dolana dek tekrar ücretli çağrıyı engeller (otomatik tekrar yok)", { f1: f1.status, f2: f2.body, calls: prov.calls - c0 });
      svc.__resetEducationComputeLocks();
    }

    section("E. Kanıt revizyonu → yeni sürüm (eski korunur)");
    {
      await su.query(`update public.hd_education_subjects set birth_place='ZZ Şehir (düzeltilmiş)', revision=2 where id=$1`, [A]);
      const noSrc = await compute(A);
      ok(noSrc.status === 409 && noSrc.json.code === "SOURCE_MISSING", "yeni revizyonda kaynak yok → hesap yok");
      await su.query(`insert into public.hd_education_sources (subject_id, subject_revision, role, url) values ($1,2,'birth_time','https://example.test/zz-r2')`, [A]);
      const c0 = prov.calls;
      const r = await compute(A);
      const all = await charts(A);
      ok(r.status === 200 && r.json.version === 2 && prov.calls - c0 === 1 && all.length === 2 && all[0].subject_revision === 1 && all[1].subject_revision === 2, "revizyon 2 → sürüm 2; sürüm 1 aynen duruyor", all.map((x: { version: number; subject_revision: number }) => [x.version, x.subject_revision]));
      const upd = await su.query(`set role service_role; update public.hd_education_charts set calc_status='TIME_MISMATCH' where subject_id='${A}'`).then(() => "kabul", (e: { code?: string }) => e.code);
      await su.query(`reset role`);
      ok(upd === "23514" || upd === "42501", "snapshot üzerine yazılamaz (uygulama rolünde UPDATE yetkisi yok + append-only tetikleyici)", upd);
    }

    section("F. Doğrulama / hukuk / yayın akışı (owner)");
    {
      const grant = await call(accessPost, asOwner, { method: "POST", body: { action: "grant", userId: EXP.id } });
      ok(grant.status === 200, "eğitmene erişim verildi");
      let d = await detail(A);
      ok(d.stage === "Doğrulama bekliyor" && d.checklist.snapshotOk && !d.checklist.snapshotVerified, "hesaplandı, owner doğrulaması bekliyor", d.stage);
      ok(!!d.preview && (d.preview as { version: number }).version === 2 && !JSON.stringify(d).includes("provider_raw"), "owner önizlemesi güncel sürüm (ham yanıt YOK)");
      const chartsA = await charts(A);
      const v1 = chartsA[0].id as string;
      const v2 = chartsA[1].id as string;
      ok((await act(A, { action: "verify_chart", chartId: v1 })).status === 409, "eski revizyon snapshot'ı doğrulanamaz");
      for (const [label, body] of [["normal admin doğrulama", { action: "verify_chart", chartId: v2 }], ["normal admin yayın", { action: "publish" }], ["normal admin hukuk", { action: "legal_review", reference: "AV-1" }]] as const) {
        const x = await act(A, body as Record<string, unknown>, asAdmin);
        ok(x.status === 404, `${label} → 404`);
      }
      ok((await act(A, { action: "verify_chart", chartId: v2 })).status === 200, "owner güncel snapshot'ı doğruladı");
      d = await detail(A);
      ok(d.stage === "Hesaplandı" && d.checklist.snapshotVerified && !d.checklist.legalReviewed, "aşama: Hesaplandı (hukuk incelemesi eksik)", d.stage);
      const ap1 = await act(A, { action: "approve", legalClearanceRef: "HK-ZZ-1" });
      ok(ap1.status === 409, "LOW_UNREVIEWED → onay reddi (DB kilidi)", ap1.json);
      ok((await act(A, { action: "publish" })).status === 409, "onaysız doğrudan yayın reddi");
      ok((await act(A, { action: "clear_blocker", blocker: "UTC-TEYİT", reason: "ZZ deneme" })).status === 400, "UTC-TEYİT owner'ca kaldırılamaz (yalnız kanıt revizyonu)");
      ok((await act(A, { action: "legal_review", reference: "x" })).status === 400, "kısa / boş inceleme referansı reddi");
      ok((await act(A, { action: "legal_review", reference: "AV-ZZ-2026-001" })).status === 200, "owner hukuk inceleme kaydı (referanslı)");
      d = await detail(A);
      ok(d.checklist.legalReviewed && d.checklist.noBlockers && (d.revision as number) === 2 && d.checklist.snapshotVerified, "LOW_REVIEWED; AVUKAT-GÖRMEDİ kalktı; revizyon/doğrulama bozulmadı");
      ok(d.stage === "Yayın onayı bekliyor", "aşama: Yayın onayı bekliyor", d.stage);
      ok((await act(A, { action: "approve", legalClearanceRef: "HK-ZZ-1", note: "ZZ" })).status === 200, "owner onayı");
      ok((await detail(A)).stage === "Yayına hazır", "aşama: Yayına hazır");
      ok((await act(A, { action: "legal_review", reference: "AV-ZZ-2" })).status === 409, "onaylı kişide hukuk kaydı değiştirilemez");
      ok((await act(A, { action: "publish" })).status === 200, "owner yayımladı");
      const c0 = prov.calls;
      const list = await call(viewCharts, asExp);
      const one = await call(viewChart, asExp, { params: { id: A } });
      ok(list.status === 200 && (list.json.items as Array<{ id: string }>).some((x) => x.id === A) && one.status === 200, "yetkili eğitmen yayımlanan kaydı görür");
      ok(prov.calls === c0, "eğitmen açılışı: sağlayıcı çağrısı 0");
      ok((await act(A, { action: "withdraw", reason: "x" })).status === 400, "gerekçesiz kaldırma reddi");
      ok((await act(A, { action: "withdraw", reason: "ZZ hak sahibi talebi" })).status === 200, "owner yayından kaldırdı");
      const list2 = await call(viewCharts, asExp);
      const one2 = await call(viewChart, asExp, { params: { id: A } });
      ok((list2.json.items as unknown[]).length === 0 && one2.status === 404 && one2.body === '{"ok":false,"error":"Bulunamadı."}', "kaldırılan kayıt anında gizlendi; eski detay URL'si genel 404");
      ok((await detail(A)).stage === "Yayından kaldırıldı", "aşama: Yayından kaldırıldı");
      const hist = (await detail(A)).history as Array<{ action: string }>;
      const acts = new Set(hist.map((h) => h.action));
      ok(["chart_recorded", "chart_verified", "legal_updated", "publication_changed"].every((x) => acts.has(x)), "onay geçmişi: hesap / doğrulama / hukuk / yayın olayları", [...acts]);
      // PENDING kişi hiçbir yolla
      ok((await act(PENDING, { action: "approve", legalClearanceRef: "HK-ZZ-9" })).status === 409, "UTC bekleyen kişi onaylanamaz");
    }

    section("G. Envanter + yanıt hijyeni");
    {
      const inv = await call(listSubjects, asOwner);
      const rows = (inv.json.data as { rows: Array<{ id: string; stage: string; computed: boolean }> }).rows;
      ok(rows.find((r) => r.id === A)?.stage === "Yayından kaldırıldı" && rows.find((r) => r.id === PENDING)?.stage === "Taslak", "envanterde türetilmiş aşama");
      const d = await call(detailGet, asOwner, { params: { id: A } });
      ok(d.cache === "no-store" && !/provider_raw|request_body|x-api-key|zz-harness-fake-roxy-key/.test(d.body), "owner ayrıntısı: no-store, ham yanıt / istek gövdesi / anahtar YOK");
      const bad = await call(detailGet, asOwner, { params: { id: randomUUID() } });
      ok(bad.status === 404, "olmayan kişi → 404");
    }
    ok(prov.external.length === 0, `dış ağ (sağlayıcı dışı) 0 (${prov.external.length})`, prov.external);
    console.log(`  ⇒ SAHTE sağlayıcı çağrı sayısı: ${prov.calls} (gerçek çağrı 0)`);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nhd-education B2 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
  console.log(`açık kaynaklar (çıkış öncesi): ${JSON.stringify(process.getActiveResourcesInfo())}`);
  // Route modüllerinin süreç içi zamanlayıcıları (hız sınırı vb.) olay döngüsünü açık tutabilir: sonuç yazıldıktan sonra açık çıkış.
  process.exit(0);
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });

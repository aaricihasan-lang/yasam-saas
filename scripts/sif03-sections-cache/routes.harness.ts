/**
 * SIF-03 — Şifa Rehberi listesinde bölümler 1000 satırda kesilince EKSİK bölümler detay önbelleğine
 * tohumlanmaz (eksik bölümle "Düzenle → Kaydet" replace-all silmesinin kökü).
 * GERÇEK route (GET /api/sifa-rehberi/guides) + GERÇEK Postgres (embedded; PostgREST taklidi max-rows 1000)
 * + GERÇEK istemci veri katmanı (lib/sifa-rehberi/healingGuideLiveData). PROD'A SIFIR TEMAS; ZZ_* veri.
 *
 * Not: search_healing_guides yalnız SIRALAMA verir ve bu testin konusu değildir; taklit set-döndüren
 * RPC desteklemediği için aynı imzalı test fonksiyonuyla (jsonb) taklit edilir. Bölüm sorgusu GERÇEK.
 *
 * 1) küçük sayfa (bölüm < 1000) → sectionsComplete:true, bölümler sıralı + tam; detay önbelleği tohumlanır (eski davranış)
 * 2) büyük sayfa (6 rehber × 200 bölüm = 1200) → sectionsComplete:false; istemci detay önbelleğini TOHUMLAMAZ
 * 3) liste satırları yine döner (liste görünümü bozulmaz); 4) tenant izolasyonu
 * Çalıştır: npx tsx scripts/sif03-sections-cache/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, readMig, startBioTestEnv } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import type pg from "pg";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("sif03-sections-cache/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
type U = { id: string; token: string; tenant: string };
type Json = Record<string, unknown>;

const LEGACY = [
  "general_summary", "medical_causes", "subconscious_causes", "temperament_causes", "other_causes",
  "iridology_match", "hand_analysis_match", "cupping_leech", "reflexology", "diet_recommendations",
  "herbal_methods", "stone_recommendations", "aromatherapy", "meditation", "breathwork", "bioenergy",
  "massage", "daily_routine", "sleep_routine", "supportive_alternative_methods", "islamic_recommendations",
];
const HEALING_DDL = `
create table public.healing_guides (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, category text, images jsonb,
  symptoms text,
  ${LEGACY.map((k) => `${k} text`).join(",\n  ")},
  created_at timestamptz not null default now(), updated_at timestamptz
);`;
// Sıralama taklidi (A–Z, limit) — gerçek RPC'nin döndürdüğü kolonların alt kümesi.
const SEARCH_FAKE = `
create or replace function public.search_healing_guides(p_tenant_id uuid, p_q text, p_category text, p_limit integer, p_after_fold text, p_after_id uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(g) order by g.name, g.id), '[]'::jsonb)
    from (select * from public.healing_guides where tenant_id = p_tenant_id order by name, id limit p_limit) g
$$;`;

async function seedUser(su: pg.Client, label: string): Promise<U> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_SIF03_${label}`]);
  const id = randomUUID();
  const token = `zz-sif03-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,false)`,
    [id, `ZZ_SIF03_${label}`, `zz.sif03.${label.toLowerCase()}@example.test`, JSON.stringify({ sifa_rehberi: true }), tenant],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

async function seedGuides(su: pg.Client, tenant: string, guides: number, sectionsEach: number, prefix: string): Promise<string[]> {
  const ids: string[] = [];
  for (let g = 0; g < guides; g++) {
    const id = (await su.query(`insert into healing_guides(tenant_id, name, updated_at) values ($1,$2, now()) returning id`, [tenant, `${prefix} Rehber ${g}`])).rows[0].id as string;
    ids.push(id);
    await su.query(
      `insert into healing_guide_sections(guide_id, section_type, title, note, sort_order)
       select $1, 'reasons', 'ZZ Bölüm ' || s, 'ZZ not ' || s, s from generate_series(0, $2 - 1) s`, [id, sectionsEach]);
  }
  return ids;
}

(async () => {
  const env = await startBioTestEnv({ port: 54641, dirName: "sif03-sections-cache-pgdata", maxRows: 1000 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(HEALING_DDL);
    for (const f of ["20260520120000_healing_guide_sections.sql", "20260521120000_healing_guide_applications_section.sql",
      "20261201000000_lock_healing_guide_sections_anon.sql", "20261202000000_healing_guide_sections_faz2_provenance_notes.sql"]) {
      await su.query(readMig(f));
    }
    await su.query(SEARCH_FAKE);
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
    const S = await seedUser(su, "S");
    const B = await seedUser(su, "B");
    const X = await seedUser(su, "X");
    const sIds = await seedGuides(su, S.tenant, 3, 5, "ZZS");
    const bIds = await seedGuides(su, B.tenant, 6, 200, "ZZB");
    await seedGuides(su, X.tenant, 2, 3, "ZZX");
    const route = await import("../../app/api/sifa-rehberi/guides/route");
    const live = await import("../../lib/sifa-rehberi/healingGuideLiveData");

    const get = async (u: U) => {
      const r = await route.GET(new NextRequest("http://localhost/api/sifa-rehberi/guides?limit=50", {
        method: "GET", headers: { "x-user-id": u.id, "x-session-token": u.token },
      }));
      return { status: r.status, json: (await r.json()) as Json };
    };
    /** İstemci veri katmanını GERÇEK route yanıtıyla çalıştır (fetch → route). */
    const clientPage = async (u: U) => {
      const res = await get(u);
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response(JSON.stringify(res.json), { status: res.status, headers: { "content-type": "application/json" } })) as typeof fetch;
      try {
        live.invalidateHealingGuideCache();
        return await live.fetchGuideSearchPage({ limit: 50 });
      } finally {
        globalThis.fetch = realFetch;
      }
    };

    // ── 1) küçük sayfa ──
    let r = await get(S);
    let rows = (r.json.rows ?? []) as Json[];
    const secOf = (row: Json) => (row.healing_guide_sections ?? []) as Json[];
    H.ok(r.status === 200 && r.json.sectionsComplete === true && rows.length === 3 && rows.every((x) => secOf(x).length === 5), "1a: küçük sayfa → sectionsComplete:true, her rehberde 5 bölüm", r.json);
    H.ok(rows.every((x) => secOf(x).map((s) => s.sort_order).join() === "0,1,2,3,4"), "1b: bölümler sort_order sırasıyla");
    let page = await clientPage(S);
    H.ok(!page.error && page.rows.length === 3 && sIds.every((id) => (live.peekCachedDetail(id)?.sections.length ?? -1) === 5), "1c: tam liste → detay önbelleği tohumlanır (eski davranış)");

    // ── 2) büyük sayfa (1200 bölüm > 1000) ──
    r = await get(B);
    rows = (r.json.rows ?? []) as Json[];
    const total = rows.reduce((n, x) => n + secOf(x).length, 0);
    H.ok(r.status === 200 && r.json.sectionsComplete === false && total === 1000, `2a: 6×200 bölüm → yanıt 1000'de kesik VE sectionsComplete:false bildirilir (got ${total})`, { status: r.status, json: r.json, total });
    page = await clientPage(B);
    H.ok(!page.error && page.rows.length === 6, "3: liste satırları yine döner (liste görünümü bozulmaz)");
    const cached = bIds.map((id) => live.peekCachedDetail(id));
    H.ok(cached.every((d) => d === null), "2b: kesik bölümlerle detay önbelleği TOHUMLANMAZ → detay sunucudan tam okunur (eksik bölümle düzenleme yok)",
      cached.map((d) => d?.sections.length ?? null));

    // ── 4) tenant ──
    r = await get(S);
    H.ok(!JSON.stringify(r.json).includes("ZZX") && !JSON.stringify(r.json).includes("ZZB"), "4: başka uzmanın rehber/bölümleri gelmez");
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();

/**
 * SIF-02 — Şifa Rehberi Word "Tümü" 1000 rehberde SESSİZCE kesilmez.
 * GERÇEK route (POST /api/sifa-rehberi/word-report) + GERÇEK Postgres (embedded; PostgREST taklidi max-rows 1000).
 * PROD'A SIFIR TEMAS; ZZ_* sentetik veri.
 *
 * 1) 1003 rehber + "Tümü" → 413 + açık mesaj (sayı ve "seçerek indirin"); eksik .docx ÜRETİLMEZ
 * 2) başka uzmanın rehberleri sayıma girmez (B: 3 rehber → sınır aşımı YOK)
 * 3) oturumsuz 401
 * Not: ≤1000 başarı yolu (iç içe bölüm seçimi) bu PostgREST taklidinde desteklenmez; değişmeyen o yol
 * mevcut Şifa Word harness'larıyla doğrulanır. "Filtreli" yoklaması statik + tip doğrulamalıdır.
 * Çalıştır: npx tsx scripts/sif02-word-limit/routes.harness.ts
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
const H0 = harness("sif02-word-limit/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
type U = { id: string; token: string; tenant: string };
const LEGACY = [
  "general_summary", "medical_causes", "subconscious_causes", "temperament_causes", "other_causes",
  "iridology_match", "hand_analysis_match", "cupping_leech", "reflexology", "diet_recommendations",
  "herbal_methods", "stone_recommendations", "aromatherapy", "meditation", "breathwork", "bioenergy",
  "massage", "daily_routine", "sleep_routine", "supportive_alternative_methods", "islamic_recommendations",
];
const HEALING_DDL = `
create table public.healing_guides (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, category text, images jsonb, symptoms text,
  ${LEGACY.map((k) => `${k} text`).join(",\n  ")},
  created_at timestamptz not null default now(), updated_at timestamptz
);`;

async function seedUser(su: pg.Client, label: string): Promise<U> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_SIF02_${label}`]);
  const id = randomUUID();
  const token = `zz-sif02-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,false)`,
    [id, `ZZ_SIF02_${label}`, `zz.sif02.${label.toLowerCase()}@example.test`, JSON.stringify({ sifa_rehberi: true }), tenant],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

(async () => {
  const env = await startBioTestEnv({ port: 54653, dirName: "sif02-word-limit-pgdata", maxRows: 1000 });
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
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);
    const A = await seedUser(su, "A");
    const B = await seedUser(su, "B");
    await su.query(`insert into healing_guides(tenant_id, name) select $1, 'ZZ Rehber ' || g from generate_series(1,1003) g`, [A.tenant]);
    await su.query(`insert into healing_guides(tenant_id, name) select $1, 'ZZ B ' || g from generate_series(1,3) g`, [B.tenant]);
    const route = await import("../../app/api/sifa-rehberi/word-report/route");
    const post = (u: U | null, body: unknown) => route.POST(new NextRequest("http://localhost/api/sifa-rehberi/word-report", {
      method: "POST", headers: { "content-type": "application/json", ...(u ? { "x-user-id": u.id, "x-session-token": u.token } : {}) }, body: JSON.stringify(body),
    }));

    // ≤1000 başarı yolu: taklit iç içe seçimi (healing_guide_sections(...)) desteklemez → yalnız bu
    // istek GERÇEK SQL ile PostgREST biçiminde yanıtlanır (rehber + bölümleri json_agg).
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname.endsWith("/rest/v1/healing_guides") && /healing_guide_sections\(/.test(url.searchParams.get("select") ?? "")) {
        const tenant = (url.searchParams.get("tenant_id") ?? "").replace(/^eq\./, "");
        const rows = (await su.query(
          `select g.*, coalesce((select json_agg(s order by s.sort_order) from healing_guide_sections s where s.guide_id = g.id), '[]') as healing_guide_sections
             from healing_guides g where g.tenant_id = $1 order by g.name limit 1000`, [tenant])).rows;
        return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    const r = await post(A, { exportMode: "all" });
    const ct = r.headers.get("content-type") ?? "";
    const j = ct.includes("json") ? (await r.json()) as { error?: string; count?: number; limit?: number } : {};
    H.ok(r.status === 413 && j.count === 1003 && j.limit === 1000 && /\(1003\)/.test(String(j.error)) && /seçerek indirin/.test(String(j.error)),
      "1: 1003 rehber 'Tümü' → 413 + açık mesaj (eksik Word üretilmez)", { status: r.status, j, ct });
    let aNames = -1;
    if (ct.includes("wordprocessingml")) {
      const JSZip = (await import("jszip")).default;
      const xml = (await (await JSZip.loadAsync(Buffer.from(await r.clone().arrayBuffer()))).file("word/document.xml")?.async("string")) ?? "";
      aNames = (xml.match(/ZZ Rehber \d+/g) ?? []).length;
    }
    H.ok(!ct.includes("wordprocessingml"), "1b: yanıt .docx DEĞİL (sessiz eksik rapor yok)", { ct, rehberAdiGecisi: aNames });

    const rb = await post(B, { exportMode: "all" });
    const bct = rb.headers.get("content-type") ?? "";
    let names = 0;
    if (bct.includes("wordprocessingml")) {
      const JSZip = (await import("jszip")).default;
      const xml = (await (await JSZip.loadAsync(Buffer.from(await rb.arrayBuffer()))).file("word/document.xml")?.async("string")) ?? "";
      names = ["ZZ B 1", "ZZ B 2", "ZZ B 3"].filter((n) => xml.includes(n)).length;
    }
    H.ok(rb.status === 200 && bct.includes("wordprocessingml") && names === 3, `2: ≤1000 başarı yolu değişmedi — B'nin 3 rehberi Word'de (HTTP ${rb.status}); A'nın 1003'ü B'nin sayımına girmedi`, { status: rb.status, bct, names });

    globalThis.fetch = realFetch;
    const ru = await post(null, { exportMode: "all" });
    H.ok(ru.status === 401, "3: oturumsuz 401", ru.status);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();

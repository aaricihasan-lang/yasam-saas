/**
 * ŞİFA REHBERİ — SIFA-1 (iyimser kilit / lost update) ROUTE + DB HARNESS
 * (GERÇEK Next route handler'ları + yerel embedded PostgreSQL + PostgREST shim; PRODUCTION'A SIFIR TEMAS).
 *
 * Şema: `healing_guides` taban CREATE'i repoda YOK (tablo Dashboard'da oluşturulmuş; repo yalnız
 * ALTER'lar içerir) → route'ların kullandığı kolonlarla SADIK minimal DDL (sifa-search harness'ı ile
 * aynı şekil; updated_at NULLABLE — legacy kayıtlar). Üstüne GERÇEK migration'lar uygulanır:
 *   20260520120000 (sections tablosu + healing_guides ek kolonları), 20260521120000 (applications tipi),
 *   20261201000000 (sections anon lock + RLS), 20261202000000 (FAZ2 kolonları + replace RPC).
 *
 * Çalıştır: npx tsx scripts/dogal-destek-p2/sifa/routes.harness.ts   (port 54621)
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { startAnamnezTestEnv, seedAnamnez, SERVICE_KEY, ANON_KEY } from "../../anamnez/testEnv";
import { saveGuideVersioned, type FetchLike } from "../../../lib/sifa-rehberi/guideSaveFlow";
import { SIFA_STALE_MESSAGE } from "../../../lib/sifa-rehberi/guideVersion";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

// PostgREST timestamptz biçimi ("2026-10-01T10:00:00.123456+00:00") — mikro-saniye hassasiyeti
// KORUNUR (pg varsayılanı JS Date → milisaniyeye keser ve gerçek CAS'ı maskelerdi).
pg.types.setTypeParser(1184, (v: string) => v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

const LEGACY = [
  "general_summary", "medical_causes", "subconscious_causes", "temperament_causes", "other_causes",
  "iridology_match", "hand_analysis_match", "cupping_leech", "reflexology", "diet_recommendations",
  "herbal_methods", "stone_recommendations", "aromatherapy", "meditation", "breathwork", "bioenergy",
  "massage", "daily_routine", "sleep_routine", "supportive_alternative_methods", "islamic_recommendations",
];

const HEALING_DDL = `
create table public.healing_guides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  category text,
  images jsonb,
  ${LEGACY.map((k) => `${k} text`).join(",\n  ")},
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
`;

async function main(): Promise<void> {
  const env = await startAnamnezTestEnv({
    port: 54621,
    dirName: "dd-p2-sifa-routes-pgdata",
    rpcAllow: ["replace_healing_guide_sections"],
    extraSql: [
      // Supabase/PostgREST oturumları UTC'dir → timestamptz metni "+00:00" ile döner.
      `alter database postgres set timezone to 'UTC'; set timezone to 'UTC';`,
      HEALING_DDL,
      readMig("20260520120000_healing_guide_sections.sql"),
      readMig("20260521120000_healing_guide_applications_section.sql"),
      readMig("20261201000000_lock_healing_guide_sections_anon.sql"),
      readMig("20261202000000_healing_guide_sections_faz2_provenance_notes.sql"),
      `grant select, insert, update, delete on public.healing_guides, public.healing_guide_sections to service_role;`,
    ],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed = await seedAnamnez(env.su);
  await env.su.query(
    `update public.users set module_permissions = '{"sifa_rehberi":true}'::jsonb where id = any($1::uuid[])`,
    [[seed.users.A.id, seed.users.B.id, seed.users.DEMO.id]],
  );
  console.log(`embedded-postgres + PostgREST shim hazır (${env.url}).`);

  try {
    const guideRoute = await import("../../../app/api/sifa-rehberi/guides/[id]/route");
    const sectionsRoute = await import("../../../app/api/sifa-rehberi/guides/[id]/sections/route");

    const asA: Auth = { id: seed.users.A.id, token: seed.users.A.token };
    const asB: Auth = { id: seed.users.B.id, token: seed.users.B.token };
    const asDemo: Auth = { id: seed.users.DEMO.id, token: seed.users.DEMO.token };

    async function call(handler: unknown, method: string, id: string, auth: Auth, body?: unknown) {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest("http://localhost/api/test", { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve({ id }) });
      let json: Json = {};
      try { json = (await res.clone().json()) as Json; } catch { json = {}; }
      return { status: res.status, json };
    }
    const patch = (id: string, body: Json, who: Auth = asA) => call(guideRoute.PATCH, "PATCH", id, who, body);
    const put = (id: string, body: Json, who: Auth = asA) => call(sectionsRoute.PUT, "PUT", id, who, body);
    const row = async (id: string) =>
      (await env.su.query(`select name, category, images, general_summary, updated_at from public.healing_guides where id=$1`, [id])).rows[0] as
        { name: string; category: string | null; images: unknown; general_summary: string | null; updated_at: string | null };
    const secs = async (id: string) =>
      (await env.su.query(`select section_type, note, source, sort_order from public.healing_guide_sections where guide_id=$1 order by sort_order`, [id])).rows as
        Array<{ section_type: string; note: string | null; source: string | null }>;

    // ── Tohum ────────────────────────────────────────────────────────────────
    const G1 = randomUUID();
    const GNULL = randomUUID();
    const GB = randomUUID();
    await env.su.query(
      `insert into public.healing_guides(id, tenant_id, name, category, general_summary, updated_at) values
       ($1,$4,'ZZ Astım','Solunum','Özet A','2026-10-01 10:00:00.123456+00'),
       ($2,$4,'ZZ Legacy NULL','Genel','Legacy', NULL),
       ($3,$5,'ZZ B Kaydı','Cilt','B özet','2026-10-01 11:00:00.654321+00')`,
      [G1, GNULL, GB, seed.TA, seed.TB],
    );
    await env.su.query(
      `insert into public.healing_guide_sections(guide_id, section_type, note, source, sort_order) values
       ($1,'reasons','Neden notu','Kaynak-ilk',0), ($1,'herbal','Bitkisel not','Kaynak-bitki',1)`,
      [G1],
    );
    const t0 = (await row(G1)).updated_at!;
    ok(t0 === "2026-10-01T10:00:00.123456+00:00", "tohum: updated_at PostgREST biçimi + mikro-saniye korunur", t0);

    // ── 1. Belirteç doğrulaması ─────────────────────────────────────────────
    section("1. PATCH belirteç doğrulaması (400)");
    let r = await patch(G1, { category: "X" });
    ok(r.status === 400 && r.json.code === "SIFA_MISSING_VERSION", "içerik alanı + belirteç YOK → 400 SIFA_MISSING_VERSION", r);
    r = await patch(G1, { images: [] });
    ok(r.status === 400 && r.json.code === "SIFA_MISSING_VERSION", "yalnız-görsel + belirteç YOK → 400 (tasarım: muafiyet yok)", r);
    for (const bad of ["abc", "", "2026-13-45T99:00:00Z", "2026-10-01", 1727776800000, true, { v: 1 }, ["2026-10-01T10:00:00Z"]]) {
      r = await patch(G1, { category: "X", expected_updated_at: bad });
      ok(r.status === 400 && r.json.code === "SIFA_INVALID_VERSION", `biçimsiz belirteç ${JSON.stringify(bad)} → 400 SIFA_INVALID_VERSION`, r);
    }
    ok((await row(G1)).category === "Solunum" && (await row(G1)).updated_at === t0, "400'ler DB'yi değiştirmedi");

    // ── 2. Taze / bayat belirteç ────────────────────────────────────────────
    section("2. Taze belirteç → 200 + yeni sürüm; bayat → 409");
    r = await patch(G1, { category: "Solunum Sistemi", expected_updated_at: t0 });
    const t1 = r.json.updated_at as string;
    ok(r.status === 200 && r.json.ok === true && typeof t1 === "string" && t1 !== t0, "taze belirteç → 200 + yeni updated_at", r);
    ok((await row(G1)).updated_at === t1 && (await row(G1)).category === "Solunum Sistemi", "DB: kategori yazıldı, updated_at = dönen sürüm");
    ok(Date.parse(t1) > Date.parse(t0), "yeni sürüm eskisinden İLERİ (monoton)");
    r = await patch(G1, { category: "BAYAT", expected_updated_at: t0 });
    ok(r.status === 409 && r.json.stale === true && r.json.ok === false && r.json.error === SIFA_STALE_MESSAGE, "bayat belirteç → 409 {ok:false, stale:true, Türkçe mesaj}", r);
    ok((await row(G1)).category === "Solunum Sistemi" && (await row(G1)).updated_at === t1, "409 sonrası DB DEĞİŞMEDİ");
    r = await patch(G1, { images: [{ id: "x", name: "x", file_path: "x" }], expected_updated_at: t0 });
    ok(r.status === 409 && (await row(G1)).images === null, "bayat yalnız-görsel PATCH → 409, images ezilmedi", r);
    {
      // Mikro-saniyeli sürüm: istemci değeri AYNEN yollamalı; milisaniyeye kesilmiş kopya eşleşmez.
      const GMS = randomUUID();
      await env.su.query(`insert into public.healing_guides(id, tenant_id, name, updated_at) values ($1,$2,'ZZ µs','2026-10-02 09:00:00.123456+00')`, [GMS, seed.TA]);
      const exact = (await row(GMS)).updated_at!;
      const truncated = new Date(Date.parse(exact)).toISOString(); // "…00.123Z"
      r = await patch(GMS, { category: "ms", expected_updated_at: truncated });
      ok(r.status === 409, "milisaniyeye kesilmiş belirteç (µs kaybı) → 409 (sessiz eşleşme yok)", { exact, truncated, r });
      r = await patch(GMS, { category: "µs", expected_updated_at: exact });
      ok(r.status === 200, "sunucudan AYNEN alınan µs belirteç → 200", r);
    }

    // ── 3. Tenant / bulunamadı / demo ───────────────────────────────────────
    section("3. Tenant izolasyonu / 404 / demo");
    r = await patch(G1, { category: "HACK", expected_updated_at: t1 }, asB);
    ok(r.status === 404 && r.json.notFound === true, "tenant B → A kaydı (geçerli belirteçle) → 404 (409 DEĞİL; varlık sızmaz)", r);
    ok((await row(G1)).category === "Solunum Sistemi", "tenant B denemesi DB'yi değiştirmedi");
    r = await patch(randomUUID(), { category: "x", expected_updated_at: t1 });
    ok(r.status === 404, "olmayan kayıt → 404", r);
    r = await patch("not-a-uuid", { category: "x", expected_updated_at: t1 });
    ok(r.status === 404, "geçersiz id → 404 (uuid guard korunur)", r);
    r = await patch(G1, { category: "DEMO", expected_updated_at: t1 }, asDemo);
    ok(r.status === 200 && r.json.demo === true && (await row(G1)).category === "Solunum Sistemi", "demo → yazma yok (mevcut davranış)", r);
    r = await patch(G1, { category: "x", expected_updated_at: t1 }, {});
    ok(r.status === 401, "kimliksiz → 401", r);

    // ── 4. Legacy NULL updated_at ───────────────────────────────────────────
    section("4. Legacy NULL updated_at (expected_updated_at: null)");
    r = await patch(GNULL, { category: "Yeni" });
    ok(r.status === 400, "NULL kayıt + anahtar YOK → 400", r);
    r = await patch(GNULL, { category: "Yeni", expected_updated_at: null });
    const tn1 = r.json.updated_at as string;
    ok(r.status === 200 && typeof tn1 === "string" && (await row(GNULL)).category === "Yeni", "NULL kayıt + null belirteç → 200 + sürüm atanır", r);
    r = await patch(GNULL, { category: "Bayat", expected_updated_at: null });
    ok(r.status === 409 && (await row(GNULL)).category === "Yeni", "artık NULL değil → null belirteç 409", r);
    r = await patch(G1, { category: "x", expected_updated_at: null });
    ok(r.status === 409, "NULL-olmayan kayda null belirteç → 409", r);

    // ── 5. Sections PUT ─────────────────────────────────────────────────────
    section("5. PUT sections — sürüm kontrollü (claim)");
    const before5 = await secs(G1);
    const newSecs = [{ section_type: "reasons", note: "Yeni neden", source: "Kaynak-YENİ" }];
    r = await put(G1, { sections: newSecs });
    ok(r.status === 400 && r.json.code === "SIFA_MISSING_VERSION", "PUT belirteç YOK → 400", r);
    r = await put(G1, { sections: newSecs, expected_updated_at: "dün" });
    ok(r.status === 400 && r.json.code === "SIFA_INVALID_VERSION", "PUT biçimsiz belirteç → 400", r);
    r = await put(G1, { sections: newSecs, expected_updated_at: t0 });
    ok(r.status === 409 && r.json.stale === true, "PUT bayat belirteç → 409 stale", r);
    ok(JSON.stringify(await secs(G1)) === JSON.stringify(before5) && (await row(G1)).updated_at === t1, "PUT 409 → bölümler + sürüm DEĞİŞMEDİ");
    r = await put(G1, { sections: newSecs, expected_updated_at: t1 }, asB);
    ok(r.status === 404, "PUT tenant B → 404", r);
    ok(JSON.stringify(await secs(G1)) === JSON.stringify(before5), "PUT tenant B → bölümler değişmedi");
    r = await put(G1, { sections: [{ section_type: "bogus_type", note: "x" }], expected_updated_at: t1 });
    ok(r.status === 400 && (await row(G1)).updated_at === t1, "RPC hatası (geçersiz tip) → 400 + claim GERİ ALINDI (sürüm = beklenen)", { r, v: (await row(G1)).updated_at });
    ok(JSON.stringify(await secs(G1)) === JSON.stringify(before5), "RPC hatası → bölümler değişmedi (rollback)");
    r = await put(G1, { sections: newSecs, expected_updated_at: t1 });
    const t2 = r.json.updated_at as string;
    ok(r.status === 200 && typeof t2 === "string" && t2 !== t1, "PUT taze belirteç → 200 + yeni updated_at (claim sonrası aynı belirteç yeniden kullanılabildi)", r);
    ok((await row(G1)).updated_at === t2, "DB updated_at = PUT'un döndürdüğü sürüm");
    const after5 = await secs(G1);
    ok(after5.length === 1 && after5[0].source === "Kaynak-YENİ", "bölümler değiştirildi", after5);
    r = await put(G1, { sections: newSecs, expected_updated_at: t1 });
    ok(r.status === 409, "aynı (artık eski) belirteçle ikinci PUT → 409", r);

    // ── 6. Aynı-sekme ardışık yazımları ─────────────────────────────────────
    section("6. Aynı sekme: görsel persist → içerik kaydet (kendi kendisiyle çakışmaz)");
    r = await patch(G1, { images: [{ id: "img1", name: "a.jpg", file_path: "t/a.jpg" }], expected_updated_at: t2 });
    const t3 = r.json.updated_at as string;
    ok(r.status === 200 && t3 !== t2, "görsel persist (sürümlü) → 200 + yeni sürüm", r);
    r = await patch(G1, { name: "ZZ Astım", category: "Solunum", expected_updated_at: t3 });
    const t4 = r.json.updated_at as string;
    ok(r.status === 200, "dönen sürümle içerik PATCH → 200 (self-conflict YOK)", r);
    r = await put(G1, { sections: newSecs, expected_updated_at: t4 });
    const t5 = r.json.updated_at as string;
    ok(r.status === 200, "PATCH sürümüyle PUT → 200", r);

    // ── 7. Eşzamanlı CAS ────────────────────────────────────────────────────
    section("7. Eşzamanlı iki PATCH aynı belirteçle → tam olarak biri kazanır");
    const [c1, c2] = await Promise.all([
      patch(G1, { category: "Yarış-1", expected_updated_at: t5 }),
      patch(G1, { category: "Yarış-2", expected_updated_at: t5 }),
    ]);
    const statuses = [c1.status, c2.status].sort();
    ok(statuses[0] === 200 && statuses[1] === 409, "200 + 409 (tek cümle CAS)", statuses);
    const winner = c1.status === 200 ? "Yarış-1" : "Yarış-2";
    ok((await row(G1)).category === winner, "DB kazananın değerini taşır", await row(G1));

    // ── 8. SIFA-1 CANLI SENARYO (gerçek orkestrasyon + gerçek route'lar) ────
    section("8. SIFA-1 iki sekme senaryosu — saveGuideVersioned + GERÇEK handler'lar");
    function fetchAs(who: Auth, log: string[]): FetchLike {
      return async (input, init) => {
        const m = /^\/api\/sifa-rehberi\/guides\/([^/]+)(\/sections)?$/.exec(input);
        if (!m) throw new Error(`beklenmeyen url ${input}`);
        const method = String(init?.method ?? "GET");
        log.push(`${method} ${m[2] ? "sections" : "guide"}`);
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (who.id) headers["x-user-id"] = who.id;
        if (who.token) headers["x-session-token"] = who.token;
        const req = new NextRequest(`http://localhost${input}`, { method, headers, body: init?.body as string });
        const handler = m[2] ? sectionsRoute.PUT : method === "PATCH" ? guideRoute.PATCH : null;
        if (!handler) throw new Error(`beklenmeyen method ${method}`);
        return (handler as Handler)(req, { params: Promise.resolve({ id: decodeURIComponent(m[1]) }) });
      };
    }
    const deps = (log: string[]) => ({ fetchImpl: fetchAs(asA, log), headers: () => ({}) });
    const base = (await row(G1)).updated_at; // iki sekme de AYNI sürümü yükledi
    const tabACopy = await secs(G1);          // A'nın (bayatlayacak) bölüm kopyası
    // Sekme B: bölüm kaynağını düzenler + kaydeder.
    const logB: string[] = [];
    const resB = await saveGuideVersioned(deps(logB), {
      guideId: G1,
      fields: { name: "ZZ Astım", category: (await row(G1)).category, images: null },
      sections: [{ section_type: "reasons", note: "Yeni neden", source: "B'nin YENİ kaynağı" }],
      expectedUpdatedAt: base,
    });
    ok(resB.ok === true && logB.join(",") === "PATCH guide,PUT sections", "Sekme B kaydı → PATCH + PUT başarılı", { resB, logB });
    // Sekme A (bayat): kategoriyi düzenler + kaydeder → eskiden B'nin kaynağını SESSİZCE geri alıyordu.
    const logA: string[] = [];
    const resA = await saveGuideVersioned(deps(logA), {
      guideId: G1,
      fields: { name: "ZZ Astım", category: "A'nın kategorisi", images: null },
      sections: tabACopy.map((s) => ({ section_type: s.section_type, note: s.note, source: s.source })),
      expectedUpdatedAt: base,
    });
    ok(resA.ok === false && resA.stage === "guide" && resA.stale === true && resA.error === SIFA_STALE_MESSAGE, "Sekme A (bayat) → 409 stale (PATCH kapısında)", resA);
    ok(logA.join(",") === "PATCH guide", "Sekme A: 409 sonrası PUT sections ÇAĞRILMADI", logA);
    const finalSecs = await secs(G1);
    ok(finalSecs.length === 1 && finalSecs[0].source === "B'nin YENİ kaynağı", "B'nin bölüm değişikliği KORUNDU (lost update YOK)", finalSecs);
    ok((await row(G1)).category !== "A'nın kategorisi", "A'nın bayat kategorisi YAZILMADI");
    ok(!resA.ok && resA.updatedAt === base, "A'nın bilinen sürümü değişmedi (taslak korunur; tekrar → yine 409)");
  } finally {
    await env.stop();
  }

  console.log(`\nŞİFA SIFA-1 ROUTE+DB HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAILURES:\n - " + failures.join("\n - "));
    process.exitCode = 1;
  } else {
    console.log("OVERALL: PASS");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

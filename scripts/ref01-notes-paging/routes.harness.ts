/**
 * REF-01 — Refleksoloji klinik notları GET 1000 satırda sessizce KESİLMEZ.
 * GERÇEK route + GERÇEK Postgres (embedded; PostgREST taklidi max-rows = 1000 → prod varsayılanı).
 * PROD'A SIFIR TEMAS; ZZ_* sentetik veri.
 *
 * 1) 1203 notlu tenant → GET 1203 not döner (eskiden 1000), her not tekil, sıra updated_at azalan
 * 2) her notta baseUpdatedAt = DB updated_at (CAS sözleşmesi aynı)
 * 3) küçük tenant (3 not) davranışı aynı
 * 4) tenant izolasyonu: başka uzmanın notu gelmez
 * 5) demo → boş liste (eski davranış); 6) oturumsuz 401
 * Çalıştır: npx tsx scripts/ref01-notes-paging/routes.harness.ts
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
const H0 = harness("ref01-notes-paging/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
type U = { id: string; token: string; tenant: string };
type Note = { id: string; title: string; baseUpdatedAt: string };
const req = (u: U | null) => new NextRequest("http://localhost/api/refleksoloji/notes", {
  method: "GET", headers: u ? { "x-user-id": u.id, "x-session-token": u.token } : {},
});

async function seedUser(su: pg.Client, label: string, demo = false): Promise<U> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_REF01_${label}`]);
  const id = randomUUID();
  const token = `zz-ref01-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,$6)`,
    [id, `ZZ_REF01_${label}`, `zz.ref01.${label.toLowerCase()}@example.test`, JSON.stringify({ reflexology: true }), tenant, demo],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

async function seedNotes(su: pg.Client, tenant: string, n: number, prefix: string) {
  // Bazı notlar AYNI updated_at'e sahip → ikincil sıra (id) olmadan sayfalar arası tekrar/kayıp olurdu.
  await su.query(
    `insert into reflexology_notes(tenant_id, source_uid, title, raw_json, updated_at)
     select $1, $2 || g, $2 || ' ' || g,
            jsonb_build_object('id', $2 || g, 'title', $2 || ' ' || g, 'content', 'ZZ içerik ' || g),
            timestamptz '2026-10-01 00:00:00+00' + ((g / 3) * interval '1 minute')
       from generate_series(1, $3) g`,
    [tenant, prefix, n],
  );
}

(async () => {
  const env = await startBioTestEnv({ port: 54637, dirName: "ref01-notes-paging-pgdata", maxRows: 1000 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(readMig("20260705120000_reflexology_notes_atlas.sql"));
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
    const T = await seedUser(su, "T");
    const S = await seedUser(su, "S");
    const X = await seedUser(su, "X");
    const D = await seedUser(su, "D", true);
    await seedNotes(su, T.tenant, 1203, "zzt");
    await seedNotes(su, S.tenant, 3, "zzs");
    await seedNotes(su, X.tenant, 5, "zzx");
    const route = await import("../../app/api/refleksoloji/notes/route");

    let r = await route.GET(req(T));
    let b = (await r.json()) as { ok?: boolean; notes?: Note[]; demo?: boolean };
    const notes = b.notes ?? [];
    H.ok(r.status === 200 && notes.length === 1203, `1a: 1203 not → 1203 döner (eskiden 1000'de kesiliyordu; got ${notes.length})`, r.status);
    H.ok(new Set(notes.map((n) => n.id)).size === 1203, "1b: sayfalar arası tekrar / kayıp yok (eşit updated_at'lerde bile)");
    H.ok(notes.every((n, i) => i === 0 || notes[i - 1]!.baseUpdatedAt >= n.baseUpdatedAt), "1c: sıra updated_at azalan (eski sıra korunur)");
    const db = (await su.query(`select source_uid, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') u from reflexology_notes where tenant_id=$1`, [T.tenant])).rows;
    const byUid = new Map(db.map((x) => [x.source_uid as string, x.u as string]));
    H.ok(notes.every((n) => typeof n.baseUpdatedAt === "string" && n.baseUpdatedAt.slice(0, 19) === byUid.get(n.id)), "2: baseUpdatedAt = DB updated_at (CAS sözleşmesi aynı)");
    H.ok(!notes.some((n) => /^zz[sx]/.test(n.id)), "4a: başka tenant'ın notu gelmez");

    r = await route.GET(req(S));
    b = (await r.json()) as { ok?: boolean; notes?: Note[] };
    H.ok(r.status === 200 && (b.notes ?? []).length === 3 && b.notes!.every((n) => n.id.startsWith("zzs")), "3: küçük tenant davranışı aynı", b);

    r = await route.GET(req(D));
    b = (await r.json()) as { ok?: boolean; notes?: Note[]; demo?: boolean };
    H.ok(r.status === 200 && b.demo === true && (b.notes ?? []).length === 0, "5: demo → boş liste (eski davranış)", b);
    r = await route.GET(req(null));
    H.ok(r.status === 401, "6: oturumsuz 401", r.status);
    H.ok(env.stats.maxReturned <= 1000, `taklit max-rows sınırı gerçekten uygulandı (en çok ${env.stats.maxReturned} satır/istek)`);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();

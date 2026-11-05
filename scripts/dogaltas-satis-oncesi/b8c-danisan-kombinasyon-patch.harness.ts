/**
 * B8c (05.11 canlı denetim) — PATCH /api/clients/[id]/combinations/[combinationId] taş listesini günceller.
 * GERÇEK route + embedded-postgres + PostgREST uyumlu kabuk. Prod'a SIFIR temas.
 *  - stones verilirse stones_text = POST ile aynı biçim (", " ile); boş liste → 400; diğer alanlar korunur.
 *  - stones verilmezse stones_text DEĞİŞMEZ (mevcut ad/amaç/not güncellemesi aynen).
 *  - Başka danışanın / başka kiracının kaydı güncellenemez (mevcut IDOR kapısı).
 * Çalıştır: npx tsx scripts/dogaltas-satis-oncesi/b8c-danisan-kombinasyon-patch.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startBioTestEnv, SERVICE_KEY, ANON_KEY } from "../bioenergy-presale-final/bioTestEnv";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };

const DDL = `
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, full_name text, created_at timestamptz default now());
create table public.client_combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  name text, description text, note text, stones_text text, notes_text text, notes_text_2 text, created_at timestamptz default now(), updated_at timestamptz);
grant select, insert, update, delete on public.clients, public.client_combinations to service_role;`;

async function main() {
  const env = await startBioTestEnv({ port: Number(process.env.B8C_PG_PORT ?? 54741), dirName: `zz-b8c-${Date.now()}` });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(DDL);
    const mk = async (tenant: string, label: string) => {
      const id = randomUUID(), token = `zz-b8c-${label}-${randomUUID()}`;
      await su.query(`insert into public.tenants(id,name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_${label}`]);
      await su.query(`insert into public.users(id,email,role,active,approval_status,module_permissions,package_type,plan,tenant_id,membership_status)
        values ($1,$2,'expert',true,'approved','{"clients":true,"stones":true}','premium','premium',$3,'active')`, [id, `zz.b8c.${label}@example.test`, tenant]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const T1 = randomUUID(), T2 = randomUUID();
    const U1 = await mk(T1, "u1"), U2 = await mk(T2, "u2");
    const C1 = String((await su.query(`insert into public.clients(tenant_id,full_name) values ($1,'ZZ Danışan 1') returning id`, [T1])).rows[0].id);
    const C1b = String((await su.query(`insert into public.clients(tenant_id,full_name) values ($1,'ZZ Danışan 1b') returning id`, [T1])).rows[0].id);
    const K = String((await su.query(`insert into public.client_combinations(tenant_id,client_id,name,description,note,stones_text,notes_text,notes_text_2)
      values ($1,$2,'ZZ Kombi','ZZ amaç','ZZ not','AKİK, AMETİST','Arama Koşulları','Stok: 0/2 stokta') returning id`, [T1, C1])).rows[0].id);
    const route = await import("../../app/api/clients/[id]/combinations/[combinationId]/route");
    const patch = async (who: { id: string; token: string }, clientId: string, body: unknown) => {
      const res = await route.PATCH(new NextRequest("http://localhost/api/test", { method: "PATCH", headers: { "x-user-id": who.id, "x-session-token": who.token, "content-type": "application/json" }, body: JSON.stringify(body) }),
        { params: Promise.resolve({ id: clientId, combinationId: K }) });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    const rowNow = async () => (await su.query(`select name, description, note, stones_text, notes_text, notes_text_2 from public.client_combinations where id=$1`, [K])).rows[0];

    console.log("\n[B8c taş listesi]");
    const r1 = await patch(U1, C1, { name: "ZZ Kombi", description: "ZZ amaç", note: "ZZ not", stones: [" AKİK ", "GÜL KUVARS", ""] });
    const a1 = await rowNow();
    ok(r1.status === 200 && a1.stones_text === "AKİK, GÜL KUVARS", "stones → stones_text (kırpılır, boşlar atılır, POST biçimi)", { r1, a1 });
    ok(a1.name === "ZZ Kombi" && a1.description === "ZZ amaç" && a1.note === "ZZ not" && a1.notes_text === "Arama Koşulları" && a1.notes_text_2 === "Stok: 0/2 stokta", "diğer alanlar korunur");
    const r2 = await patch(U1, C1, { stones: [] });
    ok(r2.status === 400 && (await rowNow()).stones_text === "AKİK, GÜL KUVARS", "boş taş listesi → 400, kayıt değişmez", r2);
    const r2b = await patch(U1, C1, { stones: "AKİK" });
    ok(r2b.status === 400, "dizi olmayan stones → 400", r2b);

    console.log("\n[Mevcut davranış korunur]");
    const r3 = await patch(U1, C1, { name: "ZZ Kombi 2", description: null, note: "yeni not" });
    const a3 = await rowNow();
    ok(r3.status === 200 && a3.name === "ZZ Kombi 2" && a3.description === null && a3.note === "yeni not" && a3.stones_text === "AKİK, GÜL KUVARS", "stones yokken taşlar değişmez; ad/amaç/not güncellenir");
    ok((await patch(U1, C1, { name: "  " })).status === 400, "boş ad → 400 (mevcut)");
    ok((await patch(U1, C1, {})).status === 400, "alan yok → 400 (mevcut)");
    const r4 = await patch(U2, C1, { stones: ["X"] });
    ok(r4.status === 403 && (await rowNow()).stones_text === "AKİK, GÜL KUVARS", "başka kiracı → 403, değişmez", r4);
    const r5 = await patch(U1, C1b, { stones: ["X"] });
    ok(r5.status !== 200 && (await rowNow()).stones_text === "AKİK, GÜL KUVARS", "aynı kiracıda başka danışan kimliğiyle güncellenemez", r5);
  } catch (e) {
    ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop().catch(() => {});
  }
  console.log(`\nB8c PATCH harness: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  process.exit(fail ? 1 : 0);
}
void main();

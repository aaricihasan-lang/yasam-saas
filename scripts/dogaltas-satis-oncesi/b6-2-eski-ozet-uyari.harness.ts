/**
 * B6.2 (05.11 canlı denetim, owner kararı A — migration YOK) — kombinasyonun taşları değiştirildiğinde
 * kayıt anındaki OTOMATİK koşul / stok özetleri "güncel değil" olarak kalıcı işaretlenir.
 * GERÇEK PATCH route + GERÇEK migration (20270124000000: combination_stones + update_combination_with_stones
 * + updated_at trigger'ı) + embedded-postgres + PostgREST uyumlu kabuk. Prod'a SIFIR temas.
 * Çalıştır: npx tsx scripts/dogaltas-satis-oncesi/b6-2-eski-ozet-uyari.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { startBioTestEnv, SERVICE_KEY, ANON_KEY, readMig } from "../bioenergy-presale-final/bioTestEnv";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
// Gerçek PostgREST timestamptz'yi mikro-saniyeli METİN döndürür; test kabuğu da öyle yapsın (Date → ms kaybı yok).
pg.types.setTypeParser(1184, (v: string) => v);
// Test kabuğu RPC'de dizi parametresini Postgres dizisi olarak geçirir; gerçek PostgREST jsonb olarak
// geçirir. Yalnız bu test sürecinde: RPC çağrısındaki nesne dizileri JSON metnine çevrilir.
{
  const proto = pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const orig = proto.query;
  proto.query = function (this: unknown, ...a: unknown[]) {
    // Kabuk eq'yu "kolon::text = değer" diye karşılaştırır; gerçek PostgREST kolon tipine göre
    // (timestamptz) karşılaştırır. updated_at eşitliği gerçek davranışa çevrilir.
    if (typeof a[0] === "string") a[0] = a[0].replace(/"updated_at"::text = \$(\d+)/g, '"updated_at" = $$$1::timestamptz');
    if (typeof a[0] === "string" && a[0].startsWith("select public.") && Array.isArray(a[1]))
      a[1] = (a[1] as unknown[]).map((v) => (Array.isArray(v) && v.some((x) => x && typeof x === "object") ? JSON.stringify(v) : v));
    return orig.apply(this, a);
  };
}
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 500)}` : ""}`); } };

const BASE = `
create table if not exists public.stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, stone_name text, created_at timestamptz default now());
create table if not exists public.minerals (id uuid primary key default gen_random_uuid(), tenant_id uuid, name text);
create table public.combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, source_id text, issue text, description text,
  variant_index int default 0, source text, stones_text text, notes_text text, notes_text_2 text, notes_text_3 text, origin_type text, created_at timestamptz default now());
grant select, insert, update, delete on public.stones, public.minerals, public.combinations to service_role;
-- Yalnız test: gömülü PG'de max(uuid) toplayıcısı yok (migration'daki tekil-eşleşme sorgusu kullanır).
do $$ begin
  if not exists (select 1 from pg_aggregate a join pg_proc p on p.oid = a.aggfnoid where p.proname = 'max' and p.proargtypes::text = (select oid::text from pg_type where typname = 'uuid')) then
    create function pg_catalog.zz_uuid_greater(a uuid, b uuid) returns uuid language sql immutable as 'select case when a is null then b when b is null then a when a > b then a else b end';
    create aggregate pg_catalog.max(uuid) (sfunc = pg_catalog.zz_uuid_greater, stype = uuid);
  end if;
end $$;`;

const COND = "Arama Koşulları:\n- Mineral: Lityum ≥ %1\n\nKarşılanan: Mineral: Lityum\nEksik: —";
const STOCK = "Stok: 2/3 stokta\nUyarılı taşlar: LEPİDOLİT";
const MARK = "⚠ GÜNCEL DEĞİL";

async function main() {
  const env = await startBioTestEnv({ port: Number(process.env.B62_PG_PORT ?? 54761), dirName: `zz-b62-${Date.now()}` });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(BASE);
    await su.query(readMig("20270124000000_dogaltas_combination_stones_relational.sql"));
    await su.query(`grant select, insert, update, delete on public.combination_stones to service_role`);
    const mk = async (tenant: string, label: string) => {
      const id = randomUUID(), token = `zz-b62-${label}-${randomUUID()}`;
      await su.query(`insert into public.tenants(id,name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_${label}`]);
      await su.query(`insert into public.users(id,email,role,active,approval_status,module_permissions,package_type,plan,tenant_id,membership_status)
        values ($1,$2,'expert',true,'approved','{"stones":true}','premium','premium',$3,'active')`, [id, `zz.b62.${label}@example.test`, tenant]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const T1 = randomUUID(), T2 = randomUUID();
    const U1 = await mk(T1, "u1"), U2 = await mk(T2, "u2");
    // Oluşturucu ile kaydedilmiş (junction'lı) kombinasyon — gerçek create RPC'si ile.
    const created = async (issue: string, stones: string[], n1: string | null, n2: string | null, n3: string | null) => {
      const r = await su.query(`select public.create_combination_with_stones($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as v`,
        [T1, issue, "ZZ açıklama", "Kombinasyon Oluştur", "zz-src-" + randomUUID().slice(0, 8), 0, n1, n2, n3,
          JSON.stringify(stones.map((n) => ({ stone_id: null, snapshot_name: n })))]);
      const v = r.rows[0].v as { id?: string } | string;
      return typeof v === "string" ? v : String(v.id);
    };
    const fnArgs = (await su.query(`select pg_get_function_identity_arguments(oid) as a from pg_proc where proname='create_combination_with_stones'`)).rows[0]?.a;
    console.log(`  · create RPC imzası: ${fnArgs}`);
    const A = await created("ZZ Uyku", ["AMETİST", "LEPİDOLİT", "AKİK"], COND, STOCK, "ZZ kullanıcı notu");
    const Bx = await created("ZZ Serbest", ["KUVARS", "PİRİT"], "Kullanıcının kendi yazdığı serbest not.", STOCK, null);
    // Eski (legacy, junction'sız) kayıt — 139 eski kombinasyon gibi.
    const L = String((await su.query(`insert into public.combinations(tenant_id,source_id,issue,stones_text,notes_text,notes_text_2,notes_text_3,source)
      values ($1,'zz-legacy','ZZ Eski','AMETİST, KUVARS',$2,$3,'eski not','Nuran IŞIK') returning id`, [T1, COND, STOCK])).rows[0].id);
    const row = async (id: string) => (await su.query(`select issue, stones_text, notes_text, notes_text_2, notes_text_3, updated_at from public.combinations where id=$1`, [id])).rows[0];
    const junction = async (id: string) => (await su.query(`select string_agg(snapshot_name, ', ' order by sort_order) as s from public.combination_stones where combination_id=$1`, [id])).rows[0].s;
    const route = await import("../../app/api/dogaltas/combinations/[id]/route");
    const patch = async (who: { id: string; token: string }, id: string, body: Record<string, unknown>) => {
      const res = await route.PATCH(new NextRequest("http://localhost/api/test", { method: "PATCH", headers: { "x-user-id": who.id, "x-session-token": who.token, "content-type": "application/json" }, body: JSON.stringify(body) }),
        { params: Promise.resolve({ id }) });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    const sameTs = async (a: unknown, b: unknown) => (await su.query(`select $1::timestamptz = $2::timestamptz as s`, [a, b])).rows[0].s === true;

    console.log("\n[B6.2 — taşlar değişince otomatik özetler 'güncel değil']");
    const a0 = await row(A);
    const r1 = await patch(U1, A, { issue: "ZZ Uyku", stones_text: "AMETİST, LEPİDOLİT, GÜL KUVARS", notes_text_3: "ZZ kullanıcı notu", expectedUpdatedAt: a0.updated_at });
    const a1 = await row(A);
    ok(r1.status === 200 && a1.stones_text === "AMETİST, LEPİDOLİT, GÜL KUVARS" && (await junction(A)) === "AMETİST, LEPİDOLİT, GÜL KUVARS", "taş değişikliği kaydedildi (RPC + junction)", { r1, a1 });
    ok(String(a1.notes_text).startsWith(MARK) && String(a1.notes_text_2).startsWith(MARK), "koşul ve stok özetlerinin başında 'GÜNCEL DEĞİL' satırı var", { n1: a1.notes_text, n2: a1.notes_text_2 });
    ok(String(a1.notes_text).includes("yeniden hesaplanmadı") && !/yeniden hesaplandı|güncellendi\b/.test(String(a1.notes_text)), "uyarı yeniden hesaplama yapılmış gibi göstermez ('yeniden hesaplanmadı')");
    ok(String(a1.notes_text).endsWith(COND) && String(a1.notes_text_2).endsWith(STOCK), "özgün özet metni aynen altında korunur (silinmez/ezilmez)");
    ok(a1.notes_text_3 === "ZZ kullanıcı notu", "kullanıcı notu (notes_text_3) değişmedi");
    ok(await sameTs(r1.json.updated_at, a1.updated_at), "yanıttaki updated_at son yazımla aynı (sonraki düzenleme 409 almaz)", { resp: r1.json.updated_at, db: a1.updated_at });
    const r2 = await patch(U1, A, { issue: "ZZ Uyku", stones_text: "AMETİST, GÜL KUVARS", expectedUpdatedAt: String(r1.json.updated_at) });
    const a2 = await row(A);
    ok(r2.status === 200, "ardışık ikinci düzenleme (dönen updated_at ile) çakışmasız", r2);
    ok(String(a2.notes_text).split(MARK).length === 2 && String(a2.notes_text_2).split(MARK).length === 2, "ikinci taş değişikliğinde uyarı tekrar eklenmez (tek satır)");

    console.log("\n[Taşlar değişmezse mevcut davranış]");
    const r3 = await patch(U1, A, { issue: "ZZ Uyku Yeni Ad", stones_text: "gül kuvars,  ametist", expectedUpdatedAt: String(r2.json.updated_at) });
    const a3 = await row(A);
    ok(r3.status === 200 && a3.issue === "ZZ Uyku Yeni Ad" && a3.notes_text === a2.notes_text && a3.notes_text_2 === a2.notes_text_2, "yalnız ad / sıra / büyük-küçük harf değişince özetlere dokunulmaz");
    const B0 = await row(Bx);
    const r4 = await patch(U1, Bx, { issue: "ZZ Serbest", stones_text: "KUVARS, PİRİT" , expectedUpdatedAt: B0.updated_at });
    const b4 = await row(Bx);
    ok(r4.status === 200 && b4.notes_text === B0.notes_text && b4.notes_text_2 === B0.notes_text_2, "taşlar aynıysa hiçbir özet işaretlenmez");

    console.log("\n[Serbest metin ve eski kayıtlar korunur]");
    const r5 = await patch(U1, Bx, { issue: "ZZ Serbest", stones_text: "KUVARS, OBSİDYEN", expectedUpdatedAt: String(r4.json.updated_at) });
    const b5 = await row(Bx);
    ok(r5.status === 200 && b5.notes_text === "Kullanıcının kendi yazdığı serbest not." && String(b5.notes_text_2).startsWith(MARK), "serbest metin notu AYNEN kalır; yalnız otomatik stok özeti işaretlenir", b5);
    const l0 = await row(L);
    const r6 = await patch(U1, L, { issue: "ZZ Eski", stones_text: "AMETİST, OBSİDYEN", expectedUpdatedAt: l0.updated_at });
    const l6 = await row(L);
    ok(r6.status === 200 && l6.stones_text === "AMETİST, OBSİDYEN" && l6.notes_text === COND && l6.notes_text_2 === STOCK && l6.notes_text_3 === "eski not", "eski (junction'sız) kayıt: notlar hiç değişmez (139 eski kayıt davranışı aynen)", l6);

    console.log("\n[Güvenlik / çakışma]");
    const a4 = await row(A);
    const r7 = await patch(U1, A, { issue: "ZZ Uyku Yeni Ad", stones_text: "AMETİST", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" });
    ok(r7.status === 409 && JSON.stringify(await row(A)) === JSON.stringify(a4), "eski sürümle düzenleme → 409; kayıt ve özetler değişmez", r7);
    const r8 = await patch(U2, A, { issue: "X", stones_text: "X" });
    ok(r8.status === 404 && JSON.stringify(await row(A)) === JSON.stringify(a4), "başka kiracı → 404; kayıt değişmez", r8);
  } catch (e) {
    ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop().catch(() => {});
  }
  console.log(`\nB6.2 harness: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  process.exit(fail ? 1 : 0);
}
void main();

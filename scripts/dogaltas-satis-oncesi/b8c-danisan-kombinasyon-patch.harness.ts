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
import pg from "pg";
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
// Gerçek PostgREST timestamptz'yi metin döndürür ve eq'yu kolon tipine göre karşılaştırır (kabuk ::text).
pg.types.setTypeParser(1184, (v: string) => v);
const INJECT: { concurrent: string | null; su: pg.Client | null } = { concurrent: null, su: null };
{
  const proto = pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const orig = proto.query;
  proto.query = function (this: unknown, ...a: unknown[]) {
    if (typeof a[0] === "string") a[0] = a[0].replace(/"updated_at"::text = \$(\d+)/g, '"updated_at" = $$$1::timestamptz');
    // Hata enjeksiyonu (yalnız test): okuma ile sürüm-korumalı güncelleme ARASINA başka oturum yazımı.
    if (typeof a[0] === "string" && /^update /i.test(a[0]) && a[0].includes("client_combinations") && a[0].includes('"updated_at" =') && INJECT.concurrent) {
      const cid = INJECT.concurrent; INJECT.concurrent = null;
      return (async () => { await INJECT.su!.query(`update public.client_combinations set note = 'EŞZAMANLI YAZIM' where id = $1`, [cid]); return orig.apply(this, a); })();
    }
    return orig.apply(this, a);
  };
}
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };

const DDL = `
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, full_name text, created_at timestamptz default now());
create table public.client_combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  name text, description text, note text, stones_text text, notes_text text, notes_text_2 text, created_at timestamptz default now(), updated_at timestamptz not null default now());
create or replace function public.zz_set_updated_at() returns trigger language plpgsql as $f$ begin new.updated_at = now(); return new; end $f$;
create trigger trg_client_combinations_updated_at before update on public.client_combinations for each row execute function public.zz_set_updated_at();
grant select, insert, update, delete on public.clients, public.client_combinations to service_role;`;

async function main() {
  const env = await startBioTestEnv({ port: Number(process.env.B8C_PG_PORT ?? 54741), dirName: `zz-b8c-${Date.now()}` });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(DDL);
    INJECT.su = su;
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
    ok(a1.name === "ZZ Kombi" && a1.description === "ZZ amaç" && a1.note === "ZZ not" && a1.notes_text === "Arama Koşulları", "diğer alanlar korunur (biçimsiz özet metni dahil)");
    ok(String(a1.notes_text_2).startsWith("⚠ GÜNCEL DEĞİL") && String(a1.notes_text_2).endsWith("Stok: 0/2 stokta"), "otomatik stok özeti taşlarla aynı güncellemede 'GÜNCEL DEĞİL' işaretlendi", a1.notes_text_2);
    const r2 = await patch(U1, C1, { stones: [] });
    ok(r2.status === 400 && (await rowNow()).stones_text === "AKİK, GÜL KUVARS", "boş taş listesi → 400, kayıt değişmez", r2);
    const r2b = await patch(U1, C1, { stones: "AKİK" });
    ok(r2b.status === 400, "dizi olmayan stones → 400", r2b);

    console.log("\n[B6.2 — danışan kombinasyonunda eski özet]");
    const COND = "Arama Koşulları:\n- Mineral: Lityum ≥ %1\n\nKarşılanan: Mineral: Lityum\nEksik: —";
    const STOCK = "Stok: 2/3 stokta\nUyarılı taşlar: LEPİDOLİT";
    const K2 = String((await su.query(`insert into public.client_combinations(tenant_id,client_id,name,description,note,stones_text,notes_text,notes_text_2)
      values ($1,$2,'ZZ Oto','ZZ amaç 2','ZZ kendi notum','AMETİST, LEPİDOLİT, AKİK',$3,$4) returning id`, [T1, C1, COND, STOCK])).rows[0].id);
    const row2 = async () => (await su.query(`select name, description, note, stones_text, notes_text, notes_text_2, updated_at from public.client_combinations where id=$1`, [K2])).rows[0];
    const patch2 = async (who: { id: string; token: string }, clientId: string, body: unknown) => {
      const res = await route.PATCH(new NextRequest("http://localhost/api/test", { method: "PATCH", headers: { "x-user-id": who.id, "x-session-token": who.token, "content-type": "application/json" }, body: JSON.stringify(body) }),
        { params: Promise.resolve({ id: clientId, combinationId: K2 }) });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    const s1 = await patch2(U1, C1, { name: "ZZ Oto", description: "ZZ amaç 2", note: "ZZ kendi notum", stones: ["AMETİST", "LEPİDOLİT", "GÜL KUVARS"] });
    const k1 = await row2();
    ok(s1.status === 200 && k1.stones_text === "AMETİST, LEPİDOLİT, GÜL KUVARS" && String(k1.notes_text).startsWith("⚠ GÜNCEL DEĞİL") && String(k1.notes_text_2).startsWith("⚠ GÜNCEL DEĞİL"), "taş değişince Mineral Özeti ve Uyarı/Stok Özeti 'GÜNCEL DEĞİL'", { s1, k1 });
    ok(String(k1.notes_text).endsWith(COND) && String(k1.notes_text_2).endsWith(STOCK) && String(k1.notes_text).includes("(AMETİST, LEPİDOLİT, AKİK)") && String(k1.notes_text).includes("yeniden hesaplanmadı"), "özgün özet aynen altında; uyarı özgün listeyi yazar, yeniden hesaplanmadı der");
    ok(k1.note === "ZZ kendi notum" && k1.description === "ZZ amaç 2", "kullanıcının notu ve amacı korunur");
    const k1b = await row2();
    const s2 = await patch2(U1, C1, { stones: ["gül kuvars", "ametist", "LEPİDOLİT"] });
    const k2 = await row2();
    ok(s2.status === 200 && k2.notes_text === k1b.notes_text && k2.notes_text_2 === k1b.notes_text_2, "sıra/harf farkı değişiklik sayılmaz: özetlere dokunulmaz (uyarı tekrar eklenmez)");
    const s3 = await patch2(U1, C1, { stones: ["akik", "AMETİST", "lepidolit"] });
    const k3 = await row2();
    ok(s3.status === 200 && k3.notes_text === COND && k3.notes_text_2 === STOCK, "özgün listeye dönüşte uyarı kalkar, özetler birebir özgün", k3);
    const s4 = await patch2(U1, C1, { name: "ZZ Oto Yeni" });
    ok(s4.status === 200 && (await row2()).notes_text === COND, "taş gönderilmeyen düzenlemede özetlere dokunulmaz");
    const free = String((await su.query(`insert into public.client_combinations(tenant_id,client_id,name,stones_text,notes_text,notes_text_2)
      values ($1,$2,'ZZ Serbest','KUVARS','Uzmanın kendi yazdığı açıklama.',$3) returning id`, [T1, C1, STOCK])).rows[0].id);
    const resF = await route.PATCH(new NextRequest("http://localhost/api/test", { method: "PATCH", headers: { "x-user-id": U1.id, "x-session-token": U1.token, "content-type": "application/json" }, body: JSON.stringify({ stones: ["KUVARS", "PİRİT"] }) }),
      { params: Promise.resolve({ id: C1, combinationId: free }) });
    const fr = (await su.query(`select notes_text, notes_text_2 from public.client_combinations where id=$1`, [free])).rows[0];
    ok(resF.status === 200 && fr.notes_text === "Uzmanın kendi yazdığı açıklama." && String(fr.notes_text_2).startsWith("⚠ GÜNCEL DEĞİL"), "serbest metin AYNEN kalır; yalnız otomatik stok özeti işaretlenir", fr);
    const k5 = await row2();
    INJECT.concurrent = K2;
    const s5 = await patch2(U1, C1, { stones: ["OPAL"] });
    const k6 = await row2();
    ok(s5.status === 409 && s5.json.ok === false && k6.stones_text === k5.stones_text && k6.notes_text === COND && k6.note === "EŞZAMANLI YAZIM", "araya başka oturum yazımı → 409; taş + özet yazılmaz, başkasının yazımı ezilmez", { s5, k6 });
    const s6 = await patch2(U2, C1, { stones: ["X"] });
    const s7 = await patch2(U1, C1b, { stones: ["X"] });
    ok(s6.status === 403 && s7.status !== 200 && (await row2()).stones_text === k6.stones_text, "başka kiracı / başka danışan kimliğiyle taş + özet değişmez", { s6: s6.status, s7: s7.status });

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

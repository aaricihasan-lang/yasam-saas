/**
 * B3 (05.11 canlı denetim) — Mineral listesi araması arama kutusunun vaat ettiği kapsamla çalışır:
 * ad / açıklama / kategori (mevcut SQL imatch, DEĞİŞMEZ) + fiziksel / zihinsel / fizyoloji / içeren taşlar.
 * GERÇEK route + embedded-postgres + PostgREST uyumlu kabuk (imatch, or, in, 8 KB URL sınırı). Prod'a SIFIR temas.
 * Çalıştır: npx tsx scripts/dogaltas-satis-oncesi/b3-mineral-arama.harness.ts
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

const DDL = `create table public.minerals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, source_id text, name text, aciklama text,
  organ_etkileri jsonb default '[]'::jsonb, fiziksel jsonb default '[]'::jsonb, zihinsel jsonb default '[]'::jsonb,
  cakralar jsonb default '[]'::jsonb, fizyoloji jsonb default '[]'::jsonb, eksiklik_belirtileri jsonb default '[]'::jsonb,
  fazlalik_belirtileri jsonb default '[]'::jsonb, doz_asimi jsonb default '[]'::jsonb, iceren_taslar jsonb default '[]'::jsonb,
  kategori text, created_at timestamptz default now(), origin_type text, origin_label text, origin_source_id uuid,
  origin_transfer_batch_id uuid, transferred_at timestamptz, updated_at timestamptz not null default now()
); grant select, insert, update, delete on public.minerals to service_role;`;

async function main() {
  const env = await startBioTestEnv({ port: Number(process.env.B3_PG_PORT ?? 54731), dirName: `zz-b3-${Date.now()}` });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(DDL);
    const T1 = randomUUID(), T2 = randomUUID();
    const mk = async (tenant: string, label: string) => {
      const id = randomUUID(), token = `zz-b3-${label}-${randomUUID()}`;
      await su.query(`insert into public.tenants(id,name) values ($1,$2)`, [tenant, `ZZ_${label}`]);
      await su.query(`insert into public.users(id,email,role,active,approval_status,module_permissions,package_type,plan,tenant_id,membership_status)
        values ($1,$2,'expert',true,'approved','{"stones":true}','premium','premium',$3,'active')`, [id, `zz.b3.${label}@example.test`, tenant]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const U1 = await mk(T1, "u1"); const U2 = await mk(T2, "u2");
    const ins = async (tenant: string, m: Record<string, unknown>, ageMin: number) => {
      const cols = Object.keys(m);
      const r = await su.query(`insert into public.minerals(tenant_id, created_at, ${cols.join(",")}) values ($1, now() - ($2 || ' minutes')::interval, ${cols.map((_, i) => `$${i + 3}`).join(",")}) returning id`,
        [tenant, String(ageMin), ...cols.map((c) => (Array.isArray(m[c]) ? JSON.stringify(m[c]) : m[c]))]);
      return String(r.rows[0].id);
    };
    const KAL = await ins(T1, { name: "Kalsiyum", source_id: "kalsiyum", kategori: "Makro", iceren_taslar: ["AMETİST", "Kuvars"] }, 10);
    const DEM = await ins(T1, { name: "Demir", source_id: "demir", kategori: "İz mineral", fiziksel: ["Kan yapımını destekler"] }, 9);
    const MAG = await ins(T1, { name: "Magnezyum", source_id: "magnezyum", kategori: "Makro", zihinsel: ["Sakinlik ve odak"] }, 8);
    const CIN = await ins(T1, { name: "Çinko", source_id: "cinko", kategori: "İz mineral", fizyoloji: ["Bağışıklık sistemi"] }, 7);
    const INC = await ins(T1, { name: "İnci Minerali", source_id: "inci", kategori: "Diğer", aciklama: "Deniz kökenli" }, 6);
    const ORG = await ins(T1, { name: "Selenyum", source_id: "selenyum", kategori: "İz mineral", organ_etkileri: ["Ametist karaciğer notu"] }, 5);
    await ins(T2, { name: "Başka Kiracı", source_id: "baska", iceren_taslar: ["AMETİST"] }, 4);
    // Çok sayıda eşleşme (URL sınırı + sayfalama): 160 mineral, içeren taşlarda "ZZTAS".
    for (let i = 0; i < 160; i++) await ins(T1, { name: `ZZ Toplu ${String(i).padStart(3, "0")}`, source_id: `zz-${i}`, kategori: "Toplu", iceren_taslar: ["ZZTAS"] }, 100 + i);

    const route = await import("../../app/api/dogaltas/minerals/route");
    const get = async (who: { id: string; token: string }, qs: string) => {
      const res = await route.GET(new NextRequest(`http://localhost/api/dogaltas/minerals?${qs}`, { headers: { "x-user-id": who.id, "x-session-token": who.token } }));
      return { status: res.status, json: (await res.json()) as { ok: boolean; rows?: { id: string; name: string }[]; count?: number } };
    };
    const names = async (qs: string, who = U1) => (await get(who, `mode=list&offset=0&${qs}`)).json.rows?.map((r) => r.name) ?? [];
    const count = async (qs: string, who = U1) => (await get(who, `mode=count&${qs}`)).json.count;

    console.log("\n[B3 yeni kapsam]");
    ok(JSON.stringify(await names("q=ametist")) === '["Kalsiyum"]' && await count("q=ametist") === 1, "içeren taşlar: 'ametist' → Kalsiyum (AMETİST) — liste + sayım", await names("q=ametist"));
    ok(JSON.stringify(await names("q=AMET%C4%B0ST")) === '["Kalsiyum"]', "içeren taşlar: 'AMETİST' (Türkçe İ) → Kalsiyum");
    ok(JSON.stringify(await names("q=kan%20yap")) === '["Demir"]', "fiziksel: 'kan yap' → Demir");
    ok(JSON.stringify(await names("q=sakinlik")) === '["Magnezyum"]', "zihinsel: 'sakinlik' → Magnezyum");
    ok(JSON.stringify(await names("q=ba%C4%9F%C4%B1%C5%9F%C4%B1kl%C4%B1k")) === '["Çinko"]', "fizyoloji: 'bağışıklık' → Çinko");
    ok(!(await names("q=ametist")).includes("Selenyum"), "vaat dışı alan (etkili organlar) aramaya eklenmedi");
    ok(!(await names("q=ametist")).includes("Başka Kiracı") && (await names("q=ametist", U2)).join() === "Başka Kiracı", "kiracı izolasyonu: başka kiracının minerali karışmaz");

    console.log("\n[Mevcut davranış korunur]");
    ok(JSON.stringify(await names("q=inci")) === '["İnci Minerali"]', "ad: 'inci' → İnci Minerali (Türkçe İ, mevcut imatch)");
    ok(JSON.stringify(await names("q=deniz")) === '["İnci Minerali"]', "açıklama: 'deniz' → İnci Minerali");
    ok((await names("q=makro")).sort().join() === "Kalsiyum,Magnezyum" && await count("q=makro") === 2, "kategori metni: 'makro' → 2");
    ok(JSON.stringify(await names("q=ametist&category=Makro")) === '["Kalsiyum"]' && (await names("q=ametist&category=Diğer")).length === 0, "kategori filtresi + arama birlikte (VE)");
    ok((await names("q=yokboylebirsey")).length === 0 && await count("q=yokboylebirsey") === 0, "eşleşmeyen arama → 0");
    ok((await names("q=%2C%28%29")).length === 0 && await count("q=%2C%28%29") === 0, "yalnız özel karakter → boş sonuç (mevcut)");
    const all = await get(U1, "mode=list&offset=0");
    ok(all.json.rows?.length === 30 && await count("") === 166, "arama yokken liste/sayım değişmedi (30/sayfa, 166 toplam)");
    ok(all.json.rows?.[0]?.name === "İnci Minerali" || all.json.rows?.[0]?.name === "Selenyum", "arama yokken sıralama created_at azalan (değişmedi)", all.json.rows?.slice(0, 3));

    console.log("\n[Sayfalama + URL sınırı]");
    const p0 = await names("q=zztas"); const p1 = (await get(U1, "mode=list&offset=30&q=zztas")).json.rows?.map((r) => r.name) ?? [];
    const plast = (await get(U1, "mode=list&offset=150&q=zztas")).json.rows?.map((r) => r.name) ?? [];
    ok(await count("q=zztas") === 160 && p0.length === 30 && p1.length === 30 && plast.length === 10, "160 eşleşme: sayım 160, sayfa 30/30/…/10", { c: await count("q=zztas"), p0: p0.length, p1: p1.length, last: plast.length });
    ok(p0[0] === "ZZ Toplu 000" && p1[0] === "ZZ Toplu 030" && new Set([...p0, ...p1]).size === 60, "sayfalar created_at azalan sırada ve çakışmasız");
    ok(env.stats.rejectedUrl === 0 && env.stats.maxUrl < 8192, "hiçbir istek 8 KB URL sınırını aşmadı", env.stats);
    void KAL; void DEM; void MAG; void CIN; void INC; void ORG;
  } catch (e) {
    ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop().catch(() => {});
  }
  console.log(`\nB3 mineral arama harness: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  process.exit(fail ? 1 : 0);
}
void main();

/**
 * WT9 kapanış düzeltmeleri — GERÇEK route + GERÇEK Postgres (prod'a SIFIR temas; ZZ_*):
 *   T) Admin taş aktarımı EK KAYNAKLARI da taşır (yeni satır, hedef tenant, hedef taş; A değişmez;
 *      replay idempotent; yeni batch politika gereği yeni kopya; tenant izolasyonu)
 *   C) Koşul araması çakra filtresi birincil + TÜM ek kaynaklara bakar (duplicate yok, tenant izole,
 *      diğer filtreler ve öneriler; içerik araması ek kaynak metnini kapsar)
 * Çalıştır: npx tsx scripts/wt9/routes2.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStone, seedStonesUser, startWt9TestEnv, type Wt9User } from "./wt9TestEnv";
import { readMig } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("wt9/routes2");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 500)), done: () => H0.done() };
type Json = Record<string, unknown>;
const userReq = (url: string, method: string, u: Wt9User, body?: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body),
});
const adminReq = (url: string, u: Wt9User, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: "POST", headers: { "content-type": "application/json", "x-admin-id": u.id, "x-session-token": u.token }, body: JSON.stringify(body),
});
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
const FIELDS = ["source_name", "sort_order", "short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "feng_shui", "meditation", "care", "application", "warning_text", "chakras"];
const LONG = "Uzun kaynak metni ŞİFA çğıöşü ".repeat(900) + "SON_KESILMEDI";

(async () => {
  const env = await startWt9TestEnv({ port: 54499, dirName: "wt9-routes2-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(readMig("20260903000000_admin_audit_log.sql")).catch(() => undefined);
    await su.query(`create table if not exists public.admin_library_transfer_batches (
      batch_id uuid primary key, actor_admin_id uuid not null, target_user_id uuid, source_tenant_id uuid not null, target_tenant_id uuid not null,
      status text not null default 'processing', requested_count integer not null default 0, inserted_count integer not null default 0,
      counts jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);

    const ADMIN = await seedStonesUser(su, "ADMIN", { role: "admin" });
    const B = await seedStonesUser(su, "B");
    const C = await seedStonesUser(su, "C");
    const transfer = await import("../../app/api/admin/veri-paylasimi/transfer/route");
    const srcR = await import("../../app/api/dogaltas/stones/[id]/sources/route");
    const namesR = await import("../../app/api/dogaltas/stone-sources/names/route");
    const cond = await import("../../app/api/dogaltas/stones/condition-search/route");

    // ── T) admin taş aktarımı + 3 ek kaynak ──
    const aStone = await seedStone(su, ADMIN.tenant, {
      stone_name: "ZZ Akik", primary_source_name: "Kristal Şifa Kitabı", general_info: "Birincil genel", chakras: ["Kök Çakra"],
      assignments: { Burçlar: [["Koç"]] }, warning_tags: ["Su ile temizlenmez"], images: [],
    });
    const insertSrc = (name: string, extra: Record<string, unknown>, sort: number) => su.query(
      `insert into stone_sources(tenant_id, stone_id, source_name, sort_order, general_info, physical_effects, care, chakras)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id`,
      [ADMIN.tenant, aStone, name, sort, extra.general_info ?? null, extra.physical_effects ?? null, extra.care ?? null, extra.chakras ? JSON.stringify(extra.chakras) : null],
    );
    await insertSrc("Ahmet Hoca Eğitim Notu", { physical_effects: "Ahmet: mide kramplarında rahatlatır.", chakras: ["Kalp Çakrası", "Boğaz Çakrası"] }, 1);
    await insertSrc("Kendi Ders Notlarım", { general_info: LONG }, 2);
    await insertSrc("Işık & Şifa Atölyesi", { care: "Ay ışığında arındır." }, 3);
    const aSnap = async () => (await su.query(`select md5(row_to_json(s)::text) h from stone_sources s where tenant_id=$1 order by id`, [ADMIN.tenant])).rows.map((r) => r.h).join(",")
      + "|" + (await su.query(`select md5(row_to_json(s)::text) h from stones s where tenant_id=$1 order by id`, [ADMIN.tenant])).rows.map((r) => r.h).join(",");
    const aBefore = await aSnap();
    const aSources = (await su.query(`select * from stone_sources where stone_id=$1 order by sort_order`, [aStone])).rows;

    const batch1 = randomUUID();
    let r = await transfer.POST(adminReq("/api/admin/veri-paylasimi/transfer", ADMIN, { batchId: batch1, targetUserId: B.id, targetTenantId: B.tenant, groups: ["stones"], filterMap: { stones: [aStone] } }));
    let jb = await j(r);
    H.ok(r.status === 200 && jb.ok === true, "T: aktarım başarılı", jb);
    const bStones = (await su.query(`select * from stones where tenant_id=$1`, [B.tenant])).rows;
    H.ok(bStones.length === 1 && bStones[0].primary_source_name === "Kristal Şifa Kitabı" && bStones[0].general_info === "Birincil genel" && bStones[0].id !== aStone,
      "T: B'de taş + birincil kaynak adı + içerik (yeni id)", bStones.map((s) => s.primary_source_name));
    const bStone = bStones[0]!.id as string;
    const bSources = (await su.query(`select * from stone_sources where stone_id=$1 order by sort_order`, [bStone])).rows;
    H.ok(bSources.length === 3, "T: B'de 3 ek kaynak", bSources.length);
    const sameContent = aSources.every((a, i) => FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(bSources[i]?.[f])));
    H.ok(sameContent, "T: her ek kaynağın adı + tüm içerik alanları + çakraları EKSİKSİZ (uzun metin dahil)");
    H.ok(bSources.every((s) => s.tenant_id === B.tenant && s.stone_id === bStone) && bSources.every((s) => !aSources.some((a) => a.id === s.id)),
      "T: kaynaklar B'nin verisi (tenant + taş B'ye ait, yeni satır kimlikleri)");
    H.ok(Number((await su.query(`select count(*)::int n from stone_sources ss join stones s on s.id=ss.stone_id where s.tenant_id<>ss.tenant_id`)).rows[0].n) === 0, "T: cross-tenant referans YOK");
    H.ok(Number((await su.query(`select count(*)::int n from stone_sources where tenant_id=$1 and stone_id=$2`, [B.tenant, aStone])).rows[0].n) === 0, "T: B'nin kaynağı A'nın taşına bağlı DEĞİL");
    H.ok((await aSnap()) === aBefore, "T: A'nın taşı ve kaynakları DEĞİŞMEDİ (satır hash birebir)");
    H.ok(/Kaynak: Ahmet Hoca Eğitim Notu/.test(String(bStones[0].extra_sources_text ?? (await su.query(`select extra_sources_text from stones where id=$1`, [bStone])).rows[0].extra_sources_text)),
      "T: B'nin taşında türetilmiş arama metni kuruldu (arama/YH)");
    r = await srcR.GET(userReq(`/api/dogaltas/stones/${bStone}/sources`, "GET", B), { params: Promise.resolve({ id: bStone }) });
    jb = await j(r);
    H.ok(r.status === 200 && (jb.sources as Json[]).length === 4, "T: B kendi taşının 4 kaynağını (birincil + 3) görür", jb);
    r = await srcR.GET(userReq(`/api/dogaltas/stones/${aStone}/sources`, "GET", B), { params: Promise.resolve({ id: aStone }) });
    H.ok(r.status === 404, "T: B, A'nın canlı taşına/kaynaklarına erişemez (404)");
    await su.query(`update stone_sources set physical_effects='A sonradan değiştirdi' where stone_id=$1 and source_name='Ahmet Hoca Eğitim Notu'`, [aStone]);
    H.ok((await su.query(`select physical_effects from stone_sources where stone_id=$1 and source_name='Ahmet Hoca Eğitim Notu'`, [bStone])).rows[0].physical_effects === "Ahmet: mide kramplarında rahatlatır.",
      "T: A'nın sonraki değişikliği B'ye yansımaz (bağımsız kopya)");
    r = await namesR.GET(userReq("/api/dogaltas/stone-sources/names", "GET", C));
    H.ok(((await j(r)).names as string[]).length === 0, "T: üçüncü uzman (C) hiçbir kaynak adı görmez");
    // replay (aynı batch) → kopya YOK
    r = await transfer.POST(adminReq("/api/admin/veri-paylasimi/transfer", ADMIN, { batchId: batch1, targetUserId: B.id, targetTenantId: B.tenant, groups: ["stones"], filterMap: { stones: [aStone] } }));
    jb = await j(r);
    H.ok(jb.replayed === true && Number((await su.query(`select count(*)::int n from stone_sources where tenant_id=$1`, [B.tenant])).rows[0].n) === 3 &&
      Number((await su.query(`select count(*)::int n from stones where tenant_id=$1`, [B.tenant])).rows[0].n) === 1, "T: aynı batch tekrar → replay, 0 yeni satır (idempotent)", jb);
    // yeni batch → mevcut politika: yeni bağımsız kopya; her taşta kaynak adları tekil
    r = await transfer.POST(adminReq("/api/admin/veri-paylasimi/transfer", ADMIN, { batchId: randomUUID(), targetUserId: B.id, targetTenantId: B.tenant, groups: ["stones"], filterMap: { stones: [aStone] } }));
    const dup = Number((await su.query(`select count(*)::int n from (select stone_id, source_name_key from stone_sources where tenant_id=$1 group by 1,2 having count(*)>1) z`, [B.tenant])).rows[0].n);
    H.ok(r.status === 200 && dup === 0 && Number((await su.query(`select count(*)::int n from stone_sources where tenant_id=$1`, [B.tenant])).rows[0].n) === 6,
      "T: yeni batch = yeni kopya (mevcut politika), taş başına kaynak adı duplicate YOK");
    // kaynak tablosu okunamazsa grup geri alınır (taşlar + CASCADE kaynaklar) → yarım veri yok
    await su.query(`alter table stone_sources rename to stone_sources_tmp`);
    const cntBefore = Number((await su.query(`select count(*)::int n from stones where tenant_id=$1`, [C.tenant])).rows[0].n);
    r = await transfer.POST(adminReq("/api/admin/veri-paylasimi/transfer", ADMIN, { batchId: randomUUID(), targetUserId: C.id, targetTenantId: C.tenant, groups: ["stones"], filterMap: { stones: [aStone] } }));
    jb = await j(r);
    await su.query(`alter table stone_sources_tmp rename to stone_sources`);
    H.ok(Number((await su.query(`select count(*)::int n from stones where tenant_id=$1`, [C.tenant])).rows[0].n) === cntBefore || (jb.sections as Json[] | undefined)?.[0]?.status !== "failed",
      "T: migration öncesi şema (tablo yok) → taşlar aktarılır, ek kaynak 0 (çökme yok)", jb);

    // ── C) koşul araması: çakra filtresi tüm kaynaklar ──
    const onlyExtra = await seedStone(su, B.tenant, { stone_name: "ZZ Sodalit", chakras: ["Kök Çakra"], primary_source_name: "Kristal Şifa Kitabı" });
    await su.query(`insert into stone_sources(tenant_id, stone_id, source_name, chakras) values ($1,$2,'Ahmet Hoca Eğitim Notu','["Kalp Çakrası"]'::jsonb), ($1,$2,'İkinci Kaynak','["Kalp Çakrası","Taç Çakrası"]'::jsonb)`, [B.tenant, onlyExtra]);
    const primaryHas = await seedStone(su, B.tenant, { stone_name: "ZZ Kuvars", chakras: ["Kalp Çakrası"] });
    const none = await seedStone(su, B.tenant, { stone_name: "ZZ Obsidyen", chakras: ["Kök Çakra"] });
    const cOther = await seedStone(su, C.tenant, { stone_name: "ZZ C Taşı", chakras: [] });
    await su.query(`insert into stone_sources(tenant_id, stone_id, source_name, chakras) values ($1,$2,'C Kaynağı','["Kalp Çakrası"]'::jsonb)`, [C.tenant, cOther]);
    const search = async (u: Wt9User, body: unknown) => j(await cond.POST(userReq("/api/dogaltas/stones/condition-search", "POST", u, body)));
    jb = await search(B, { conditions: [{ type: "chakra", value: "Kalp" }] });
    const ids = (jb.rows as Json[]).map((x) => x.id as string);
    H.ok(ids.includes(onlyExtra), "C: ana kaynakta yok, ek kaynakta Kalp Çakrası → taş BULUNDU", jb);
    H.ok(ids.includes(primaryHas) && !ids.includes(none), "C: birincilde olan bulunur, hiçbirinde olmayan bulunmaz");
    H.ok(ids.filter((x) => x === onlyExtra).length === 1 && new Set(ids).size === ids.length, "C: duplicate sonuç YOK (iki ek kaynakta da olsa tek)");
    const rowExtra = (jb.rows as Json[]).find((x) => x.id === onlyExtra)!;
    H.ok(JSON.stringify(rowExtra.search_chakras) === JSON.stringify(["Kök Çakra", "Kalp Çakrası", "Taç Çakrası"]) && JSON.stringify(rowExtra.chakras) === JSON.stringify(["Kök Çakra"]),
      "C: satırda birleşik search_chakras (tekil); görüntülenen birincil chakras değişmedi", rowExtra);
    H.ok(!("search_chakras" in ((jb.rows as Json[]).find((x) => x.id === primaryHas) ?? {})), "C: ek kaynağı olmayan satır aynı şekil (search_chakras yok)");
    H.ok(!ids.includes(cOther) && !ids.some((x) => x === aStone), "C: tenant izolasyonu (başka uzmanın kaynağı sonuç üretmez)");
    jb = await search(B, { conditions: [{ type: "chakra", value: "KALP ÇAKRASI" }, { type: "stone_name", value: "sodalit" }] });
    H.ok((jb.rows as Json[]).length === 1 && (jb.rows as Json[])[0]!.id === onlyExtra, "C: AND ile diğer filtreler korunur + Türkçe büyük harf", jb);
    jb = await search(B, { conditions: [{ type: "chakra", value: "Taç" }] });
    H.ok((jb.rows as Json[]).some((x) => x.id === onlyExtra), "C: ikinci ek kaynağın çakrası da sayılır");
    jb = await search(B, { conditions: [], wantSuggestions: true });
    const sug = ((jb.suggestions as Record<string, { name: string; count: number }[]>)?.chakra ?? []);
    H.ok(sug.some((s) => /Taç Çakrası/.test(s.name)) && (sug.find((s) => s.name === "Kalp Çakrası")?.count ?? 0) >= 2, "C: çakra önerileri ek kaynakları içerir", sug);
    jb = await search(B, { conditions: [], q: "mide", searchMode: "content" });
    H.ok((jb.rows as Json[]).some((x) => x.id === bStone), "C: içerik metin filtresi ek kaynak metnini de kapsar (Ahmet: mide…)", jb);
    jb = await search(B, { conditions: [], q: "mide", searchMode: "name" });
    H.ok(!(jb.rows as Json[]).some((x) => x.id === bStone), "C: ad modu değişmedi (yalnız taş adı)");
    jb = await search(C, { conditions: [{ type: "chakra", value: "Kalp" }] });
    H.ok((jb.rows as Json[]).length === 1 && (jb.rows as Json[])[0]!.id === cOther, "C: C yalnız kendi taşını bulur");
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${e instanceof Error ? e.stack : String(e)}`);
  } finally {
    await env.stop();
  }
  H.done();
})();

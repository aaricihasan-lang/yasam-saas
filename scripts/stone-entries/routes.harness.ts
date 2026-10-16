/**
 * Doğaltaş BİLGİ KAYDI BAZLI KAYNAK modeli — GERÇEK route + GERÇEK Postgres (prod'a SIFIR temas; ZZ_*).
 *
 * P) migration ÖNCESİ (WT9 şeması): kayıt GET boş, POST 503, içerik araması WT9 kolonlarıyla, Word eski düzen
 * M) migration: idempotent, mevcut veri DEĞİŞMEZ, RLS açık, anon/authenticated grant yok
 * 1) A=AAA/Ahmet Hoca + B=BBB/Mehmet Hoca → kaydet/yeniden yükle → ayrı kayıtlar
 * 2) A düzenle → yalnız A · 3) A'nın kaynağı → yalnız A · 4) B sil → A kalır
 * 5) aynı bölümde 3 kaynak · 6) farklı bölümde aynı kaynak · 7) aynı kaynakta birden çok kayıt
 * 8) save → reload → edit → save → reload · 9) eski metin kaybolmaz (tek eski kayıt; dönüşüm/silme atomik, çakışma 409)
 * 10) arama yalnız ikinci kayıttaki kelime · 11) Word her bilgi kendi kaynağıyla (tekli + toplu)
 * 12) Yaşam Hafızası bilgi + kaynak · 13) admin aktarımı kayıt + kaynak + sıra · 14) tenant izolasyonu
 * Çalıştır: npx tsx scripts/stone-entries/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStone, seedStonesUser, startWt9TestEnv, type Wt9User } from "../wt9/wt9TestEnv";
import { readMig } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { YH_INDEX_SOURCES } from "../../lib/yasam-hafizasi/indexer/sources";
import { extractFields } from "../../lib/yasam-hafizasi/indexer/extractFields";
import { buildIndexUnit } from "../../lib/yasam-hafizasi/indexer/buildCandidate";
import { buildStoneSourcesView, type StoneSourceView } from "../../lib/dogaltas/stoneSources";
import { buildFieldEntries, type StoneEntryView } from "../../lib/dogaltas/stoneEntries";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("stone-entries/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 500)), done: () => H0.done() };
type Json = Record<string, unknown>;
const req = (url: string, method: string, u: Wt9User, body?: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body),
});
const adminReq = (url: string, u: Wt9User, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: "POST", headers: { "content-type": "application/json", "x-admin-id": u.id, "x-session-token": u.token }, body: JSON.stringify(body),
});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ectx = (id: string, entryId: string) => ({ params: Promise.resolve({ id, entryId: encodeURIComponent(entryId) }) });
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
async function resText(res: Response): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
}
const CONTENT_COLS = ["stone_name", "short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "warning_text", "warning_tags", "feng_shui", "meditation", "care", "application", "chakras", "assignments", "images", "primary_source_name", "extra_sources_text"];
const sumSql = `md5(concat_ws('|', ${CONTENT_COLS.map((c) => `coalesce(${c}::text, '<NULL>')`).join(", ")}))`;
const MIG = "20271016000000_dogaltas_stone_entries.sql";
const LEGACY_PHYS = "ESKİ METİN — A cümlesi. B cümlesi.\nC cümlesi (bölünmemeli).";

(async () => {
  const env = await startWt9TestEnv({ port: 54517, dirName: "stone-entries-routes-pgdata" });
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
    const A = await seedStonesUser(su, "SEA", { role: "admin" });
    const T = await seedStonesUser(su, "SET");
    const X = await seedStonesUser(su, "SEX");
    const stonesR = await import("../../app/api/dogaltas/stones/route");
    const srcR = await import("../../app/api/dogaltas/stones/[id]/sources/route");
    const entR = await import("../../app/api/dogaltas/stones/[id]/entries/route");
    const oneR = await import("../../app/api/dogaltas/stones/[id]/entries/[entryId]/route");
    const namesR = await import("../../app/api/dogaltas/stone-sources/names/route");
    const wordR = await import("../../app/api/dogaltas/stones/[id]/word-report/route");
    const bulkR = await import("../../app/api/dogaltas/word-report/route");
    const transfer = await import("../../app/api/admin/veri-paylasimi/transfer/route");

    const adamin = await seedStone(su, A.tenant, {
      stone_name: "ZZ ADAMİN", primary_source_name: "Kristal Şifa Kitabı", physical_effects: LEGACY_PHYS, general_info: "Eski genel bilgi.",
      chakras: ["Kalp Çakrası"], warning_tags: ["Su ile temizlenmez"], assignments: { Burçlar: [["Yengeç"]] }, images: [],
    });
    const other = await seedStone(su, A.tenant, { stone_name: "ZZ Ametist", general_info: "Ametist genel.", images: [] });

    // ── P) migration ÖNCESİ ──
    let r = await entR.GET(req(`/api/dogaltas/stones/${adamin}/entries`, "GET", A), ctx(adamin));
    let jb = await j(r);
    H.ok(r.status === 200 && Array.isArray(jb.entries) && (jb.entries as unknown[]).length === 0 && jb.schemaMissing === true, "P: migration öncesi kayıt GET → boş + schemaMissing (çökme yok)", jb);
    r = await entR.POST(req(`/api/dogaltas/stones/${adamin}/entries`, "POST", A, { field_key: "physical_effects", content: "x", source_name: "y" }), ctx(adamin));
    H.ok(r.status === 503, "P: migration öncesi yeni kayıt → 503 (net mesaj)", r.status);
    await su.query(`insert into stone_sources(tenant_id, stone_id, source_name, sort_order, care) values ($1,$2,'Ek Kaynak',1,'ZZEKBAKIM ek kaynak bakımı')`, [A.tenant, other]);
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("ZZEKBAKIM")}&searchMode=content`, "GET", A));
    H.ok(r.status === 200 && ((await j(r)).rows as Json[]).some((x) => x.id === other), "P: migration öncesi içerik araması WT9 ek kaynak metnini KAYBETMEZ (kademeli geri uyum)");
    r = await wordR.POST(req(`/api/dogaltas/stones/${adamin}/word-report`, "POST", A, {}), ctx(adamin));
    let txt = r.status === 200 ? await resText(r) : "";
    H.ok(r.status === 200 && txt.includes("C cümlesi (bölünmemeli).") && !/Kaynak: /.test(txt), "P: migration öncesi Word eski düzen", r.status);
    r = await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", A));
    H.ok(r.status === 200 && ((await j(r)).names as string[]).includes("Kristal Şifa Kitabı"), "P: migration öncesi kaynak önerileri çalışır");

    // ── M) migration ──
    const before = (await su.query(`select id, ${sumSql} s, updated_at from stones order by id`)).rows;
    const srcBefore = (await su.query(`select md5(row_to_json(s)::text) h from stone_sources s order by id`)).rows.map((x) => x.h).join();
    await su.query(readMig(MIG));
    await su.query(readMig(MIG));
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
    const after = (await su.query(`select id, ${sumSql} s, updated_at, entries_text from stones order by id`)).rows;
    H.ok(JSON.stringify(before.map((x) => [x.id, x.s, String(x.updated_at)])) === JSON.stringify(after.map((x) => [x.id, x.s, String(x.updated_at)])) && after.every((x) => x.entries_text === null),
      "M: migration (2×, idempotent) mevcut taş verisini DEĞİŞTİRMEZ (içerik hash + updated_at birebir)");
    H.ok((await su.query(`select md5(row_to_json(s)::text) h from stone_sources s order by id`)).rows.map((x) => x.h).join() === srcBefore, "M: stone_sources değişmedi");
    H.ok((await su.query(`select relrowsecurity r from pg_class where oid='public.stone_entries'::regclass`)).rows[0].r === true, "M: stone_entries RLS açık");
    H.ok(Number((await su.query(`select count(*)::int n from information_schema.role_table_grants where table_name='stone_entries' and grantee in ('anon','authenticated')`)).rows[0].n) === 0, "M: anon/authenticated grant YOK");

    const sourcesOf = async (u: Wt9User, id: string) => ((await j(await srcR.GET(req(`/api/dogaltas/stones/${id}/sources`, "GET", u), ctx(id)))).sources ?? []) as StoneSourceView[];
    const rowsOf = async (u: Wt9User, id: string) => ((await j(await entR.GET(req(`/api/dogaltas/stones/${id}/entries`, "GET", u), ctx(id)))).entries ?? []) as Json[];
    const fieldOf = async (u: Wt9User, id: string, f: "physical_effects" | "spiritual_effects" | "care" | "general_info"): Promise<StoneEntryView[]> =>
      buildFieldEntries(await sourcesOf(u, id), await rowsOf(u, id), f);
    const add = async (id: string, field: string, content: string, source: string) => {
      const res = await entR.POST(req(`/api/dogaltas/stones/${id}/entries`, "POST", A, { field_key: field, content, source_name: source }), ctx(id));
      const b = await j(res);
      return { status: res.status, id: String((b.entry as Json)?.id ?? ""), body: b };
    };

    // ── 9) eski metin: tek eski kayıt, bölünmez ──
    let phys = await fieldOf(A, adamin, "physical_effects");
    H.ok(phys.length === 1 && phys[0]!.legacy && phys[0]!.content === LEGACY_PHYS && phys[0]!.sourceName === "Kristal Şifa Kitabı",
      "9: eski Fiziksel Etkiler metni TEK eski kayıt (bölünmedi), kaynağı Kristal Şifa Kitabı", phys);

    // ── 1) A + B ──
    const a = await add(adamin, "physical_effects", "AAA", "Ahmet Hoca");
    const b = await add(adamin, "physical_effects", "BBB", "Mehmet Hoca");
    H.ok(a.status === 201 && b.status === 201 && a.id && b.id && a.id !== b.id, "1: iki ayrı kayıt eklendi (bağımsız kimlik)", { a, b });
    phys = await fieldOf(A, adamin, "physical_effects");
    H.ok(phys.length === 3 && phys[1]!.content === "AAA" && phys[1]!.sourceName === "Ahmet Hoca" && phys[2]!.content === "BBB" && phys[2]!.sourceName === "Mehmet Hoca",
      "1: yeniden yükleme → eski kayıt + A/Ahmet + B/Mehmet ayrı ve eklenme sırasıyla", phys.map((e) => `${e.content}|${e.sourceName}`));
    H.ok((await su.query(`select physical_effects from stones where id=$1`, [adamin])).rows[0].physical_effects === LEGACY_PHYS, "1: yeni kayıt eklemek eski metne dokunmadı");

    // ── 2) A düzenle ──
    const bBefore = (await su.query(`select content, source_name, sort_order from stone_entries where id=$1`, [b.id])).rows[0];
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${adamin}/entries/${a.id}`, "PATCH", A, { content: "AAA-GÜNCEL" }), ectx(adamin, a.id));
    phys = await fieldOf(A, adamin, "physical_effects");
    H.ok(r.status === 200 && phys[1]!.id === a.id && phys[1]!.content === "AAA-GÜNCEL" && phys[1]!.sourceName === "Ahmet Hoca", "2: A güncellendi, kaynağı aynı, SIRASI aynı (en alta atılmadı)", phys.map((e) => e.content));
    H.ok(JSON.stringify((await su.query(`select content, source_name, sort_order from stone_entries where id=$1`, [b.id])).rows[0]) === JSON.stringify(bBefore), "2: Mehmet kaydı (BBB) AYNEN");

    // ── 3) A'nın kaynağı ──
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${adamin}/entries/${a.id}`, "PATCH", A, { source_name: "Ahmet Eğitmen" }), ectx(adamin, a.id));
    phys = await fieldOf(A, adamin, "physical_effects");
    H.ok(r.status === 200 && phys[1]!.sourceName === "Ahmet Eğitmen" && phys[1]!.content === "AAA-GÜNCEL" && phys[2]!.sourceName === "Mehmet Hoca" && phys[0]!.sourceName === "Kristal Şifa Kitabı",
      "3: yalnız A'nın kaynağı değişti (Mehmet + eski kayıt kaynağı aynı)", phys.map((e) => e.sourceName));

    // ── 5/6/7) ──
    const c = await add(adamin, "physical_effects", "CCC kitap bilgisi", "Kristal Şifa Kitabı");
    phys = await fieldOf(A, adamin, "physical_effects");
    H.ok(new Set(phys.map((e) => e.sourceName)).size === 3 && phys.length === 4, "5: aynı bölümde 3 farklı kaynak (+ aynı kaynaktan eski kayıt)", phys.map((e) => e.sourceName));
    const s1 = await add(adamin, "spiritual_effects", "Ruhsal: Ahmet anlatımı", "Ahmet Eğitmen");
    const s2 = await add(adamin, "spiritual_effects", "Ruhsal: Ahmet ikinci not", "Ahmet Eğitmen");
    const spir = await fieldOf(A, adamin, "spiritual_effects");
    H.ok(s1.status === 201 && s2.status === 201 && spir.length === 2 && spir.every((e) => e.sourceName === "Ahmet Eğitmen") && spir[0]!.content.includes("anlatımı") && spir[1]!.content.includes("ikinci"),
      "6+7: farklı bölümde aynı kaynak; aynı kaynakta birden çok AYRI kayıt", spir);

    // ── 4) B sil ──
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${adamin}/entries/${b.id}`, "DELETE", A, {}), ectx(adamin, b.id));
    phys = await fieldOf(A, adamin, "physical_effects");
    H.ok(r.status === 200 && !phys.some((e) => e.id === b.id) && phys.some((e) => e.id === a.id && e.content === "AAA-GÜNCEL") && phys.some((e) => e.id === c.id) && phys[0]!.legacy,
      "4: Mehmet kaydı silindi; Ahmet + Kitap + eski kayıt duruyor", phys.map((e) => e.content));

    // ── 9b) eski kayıt düzenle → dönüşüm (aynı sıra, atomik), çakışma 409 ──
    const legacyId = phys[0]!.id;
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${adamin}/entries/${legacyId}`, "PATCH", A, { expected: "BAYAT METİN", content: "x" }), ectx(adamin, legacyId));
    H.ok(r.status === 409 && (await su.query(`select physical_effects from stones where id=$1`, [adamin])).rows[0].physical_effects === LEGACY_PHYS, "9: bayat eski metinle düzenleme → 409, eski metin AYNEN");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${adamin}/entries/${legacyId}`, "PATCH", A, { expected: LEGACY_PHYS, content: LEGACY_PHYS + "\nEK SATIR", source_name: "Kristal Şifa Kitabı" }), ectx(adamin, legacyId));
    jb = await j(r);
    phys = await fieldOf(A, adamin, "physical_effects");
    const conv = phys[0]!;
    H.ok(r.status === 200 && !conv.legacy && conv.content === LEGACY_PHYS + "\nEK SATIR" && conv.sourceName === "Kristal Şifa Kitabı" && phys.length === 3,
      "9: eski kayıt düzenlenince gerçek kayda DÖNÜŞTÜ, sırası ilk, metin tam (eski + yeni satır)", phys.map((e) => `${e.legacy}|${e.content.slice(0, 20)}`));
    H.ok((await su.query(`select physical_effects, general_info from stones where id=$1`, [adamin])).rows[0].physical_effects === null
      && (await su.query(`select general_info from stones where id=$1`, [adamin])).rows[0].general_info === "Eski genel bilgi.",
      "9: dönüşüm yalnız o eski kolonu boşalttı (çift kayıt yok), Genel Bilgi eski metni duruyor");
    // eski kayıt sil (Genel Bilgi)
    let gi = await fieldOf(A, adamin, "general_info");
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${adamin}/entries/${gi[0]!.id}`, "DELETE", A, { expected: "Eski genel bilgi." }), ectx(adamin, gi[0]!.id));
    gi = await fieldOf(A, adamin, "general_info");
    H.ok(r.status === 200 && gi.length === 0 && (await fieldOf(A, adamin, "physical_effects")).length === 3, "9: eski kayıt silme yalnız o kaydı kaldırdı");

    // ── 8) save → reload → edit → save → reload ──
    const e8 = await add(adamin, "care", "Bakım: ay ışığı\nikinci satır  ", "Ahmet Eğitmen");
    let care = await fieldOf(A, adamin, "care");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${adamin}/entries/${e8.id}`, "PATCH", A, { content: "Bakım: ay ışığı (güncel)\nikinci satır  ", source_name: "Mehmet Hoca" }), ectx(adamin, e8.id));
    const care2 = await fieldOf(A, adamin, "care");
    H.ok(care.length === 1 && care[0]!.content === "Bakım: ay ışığı\nikinci satır  " && r.status === 200 && care2[0]!.content === "Bakım: ay ışığı (güncel)\nikinci satır  " && care2[0]!.sourceName === "Mehmet Hoca",
      "8: kaydet/yükle/düzenle/kaydet/yükle — metin + boşluk + satır sonu birebir, veri kaybı yok", care2);

    // ── 10) arama ──
    await add(adamin, "physical_effects", "ZZYALNIZIKINCI kelime bu kayıtta", "Mehmet Hoca");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("ZZYALNIZIKINCI")}&searchMode=content`, "GET", A));
    H.ok(r.status === 200 && ((await j(r)).rows as Json[]).some((x) => x.id === adamin), "10: yalnız bir bilgi kaydında geçen kelime taşı bulur");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("ZZYALNIZIKINCI")}&searchMode=content`, "GET", X));
    H.ok(((await j(r)).rows as Json[]).length === 0, "14: başka uzman aramada bu kaydı bulamaz");

    // ── 11) Word ──
    r = await wordR.POST(req(`/api/dogaltas/stones/${adamin}/word-report`, "POST", A, {}), ctx(adamin));
    txt = r.status === 200 ? await resText(r) : "";
    const body = txt.slice(txt.lastIndexOf("2. Etkiler"));
    const i1 = body.indexOf("•  AAA-GÜNCEL"), i1s = body.indexOf("Kaynak: Ahmet Eğitmen", i1), i2 = body.indexOf("•  CCC kitap bilgisi"), i2s = body.indexOf("Kaynak: Kristal Şifa Kitabı", i2);
    H.ok(r.status === 200 && i1 > 0 && i1s > i1 && i2 > i1s && i2s > i2 && body.includes("B cümlesi.C cümlesi (bölünmemeli).EK SATIR") /* satır sonları w:br — çıkarıcı birleştirir */, "11: tekli Word — her bilgi madde + hemen altında kendi kaynağı; dönüşmüş eski metin tam", body.slice(0, 500));
    H.ok(!body.includes("•  BBB"), "11: silinen kayıt Word'de yok");
    r = await bulkR.POST(new NextRequest("http://localhost/api/dogaltas/word-report", {
      method: "POST", headers: { "content-type": "application/json", "x-user-id": A.id, "x-session-token": A.token },
      body: JSON.stringify({ sections: { stones: true }, selectedStoneIds: [adamin, other] }),
    }));
    txt = r.status === 200 ? await resText(r) : "";
    const bulk = txt.slice(txt.lastIndexOf("ZZ ADAMİN"));
    H.ok(r.status === 200 && bulk.includes("•  AAA-GÜNCEL\nKaynak: Ahmet Eğitmen") && bulk.includes("•  Ruhsal: Ahmet ikinci not\nKaynak: Ahmet Eğitmen"), "11: toplu Word — kayıt + kaynak ayrı", bulk.slice(0, 400));

    // ── 12) Yaşam Hafızası ──
    const cfg = YH_INDEX_SOURCES.find((x) => x.sourceKey === "dogaltas:stones")!;
    const row = (await su.query(`select * from stones where id=$1`, [adamin])).rows[0] as Record<string, unknown>;
    const ex = extractFields(cfg, row);
    const unit = buildIndexUnit(cfg, row, { ok: true, tenantId: A.tenant, isShared: false }, ex);
    const ev = ex.evidenceFields.filter((e) => e.origin === "entries_text").map((e) => e.text).join("\n");
    H.ok(unit !== null && ev.includes("Fiziksel Etkiler\nKaynak: Ahmet Eğitmen\nAAA-GÜNCEL") && ev.includes("Ruhsal Etkiler\nKaynak: Ahmet Eğitmen\nRuhsal: Ahmet ikinci not"),
      "12: YH belgesi bilgi + KAYNAK birlikte indeksler", ev.slice(0, 400));
    const ob = (await su.query(`select count(*)::int n, bool_and(tenant_id=$2) t from yasam_hafizasi_outbox where source_id=$1`, [adamin, A.tenant])).rows[0];
    H.ok(ob.n >= 1 && ob.t === true, "12: kayıt değişikliği outbox'a düştü, yalnız taşın tenant'ı", ob);

    // ── 13) admin aktarımı ──
    const aRows = (await su.query(`select field_key, content, source_name, sort_order from stone_entries where stone_id=$1 order by field_key, sort_order, created_at`, [adamin])).rows;
    r = await transfer.POST(adminReq("/api/admin/veri-paylasimi/transfer", A, { batchId: randomUUID(), targetUserId: T.id, targetTenantId: T.tenant, groups: ["stones"], filterMap: { stones: [adamin] } }));
    jb = await j(r);
    const tStone = (await su.query(`select id from stones where tenant_id=$1 and stone_name='ZZ ADAMİN'`, [T.tenant])).rows[0];
    const tRows = tStone ? (await su.query(`select tenant_id, field_key, content, source_name, sort_order from stone_entries where stone_id=$1 order by field_key, sort_order, created_at`, [tStone.id])).rows : [];
    H.ok(r.status === 200 && tRows.length === aRows.length && tRows.every((t, i) => t.tenant_id === T.tenant && t.field_key === aRows[i].field_key && t.content === aRows[i].content && t.source_name === aRows[i].source_name && t.sort_order === aRows[i].sort_order),
      "13: aktarım her kaydı metin + KENDİ kaynağı + sırasıyla taşıdı (hedef tenant)", { status: r.status, jb, a: aRows.length, t: tRows.length });
    const tPhys = tStone ? await fieldOf(T, tStone.id, "physical_effects") : [];
    H.ok(tPhys.map((e) => `${e.content.slice(0, 12)}|${e.sourceName}`).join() === (await fieldOf(A, adamin, "physical_effects")).map((e) => `${e.content.slice(0, 12)}|${e.sourceName}`).join(),
      "13: hedef uzman aynı sıralı kayıt + kaynak listesini görür (birleştirme yok)");

    // ── 14) tenant izolasyonu ──
    r = await entR.GET(req(`/api/dogaltas/stones/${adamin}/entries`, "GET", X), ctx(adamin));
    H.ok(r.status === 404, "14: başka uzman taşın kayıtlarını okuyamaz (404)");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${adamin}/entries/${a.id}`, "PATCH", X, { content: "hack" }), ectx(adamin, a.id));
    H.ok(r.status === 404 && (await su.query(`select content from stone_entries where id=$1`, [a.id])).rows[0].content === "AAA-GÜNCEL", "14: başka uzman kaydı DÜZENLEYEMEZ");
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${adamin}/entries/${a.id}`, "DELETE", X, {}), ectx(adamin, a.id));
    H.ok(r.status === 404 && Number((await su.query(`select count(*)::int n from stone_entries where id=$1`, [a.id])).rows[0].n) === 1, "14: başka uzman kaydı SİLEMEZ");
    r = await entR.POST(req(`/api/dogaltas/stones/${adamin}/entries`, "POST", X, { field_key: "care", content: "sızma", source_name: "X" }), ctx(adamin));
    H.ok(r.status === 404, "14: başka uzman yabancı taşa kayıt EKLEYEMEZ");
    let dbErr = "";
    try { await su.query(`insert into stone_entries(tenant_id, stone_id, field_key, content) values ($1,$2,'care','x')`, [X.tenant, adamin]); } catch (e) { dbErr = String((e as { code?: string }).code); }
    H.ok(dbErr === "42501", "14: DB tetikleyicisi çapraz-tenant kaydı reddeder", dbErr);
    r = await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", X));
    H.ok(!((await j(r)).names as string[]).includes("Ahmet Eğitmen"), "14: başka uzman A'nın kaynak adlarını öneride görmez");
    r = await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", A));
    H.ok(((await j(r)).names as string[]).includes("Mehmet Hoca") && ((await j(await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", A)))).names as string[]).includes("Ahmet Eğitmen"), "kaynak önerileri: uzmanın kayıtlarındaki kendi kaynakları");

    // ── doğrulama / kenar ──
    r = await entR.POST(req(`/api/dogaltas/stones/${adamin}/entries`, "POST", A, { field_key: "chakras", content: "x", source_name: "y" }), ctx(adamin));
    H.ok(r.status === 400, "geçersiz alan (yapısal çakra) bilgi kaydı olamaz → 400");
    r = await entR.POST(req(`/api/dogaltas/stones/${adamin}/entries`, "POST", A, { field_key: "care", content: "   ", source_name: "y" }), ctx(adamin));
    H.ok(r.status === 400, "boş metin → 400");
    r = await entR.POST(req(`/api/dogaltas/stones/${adamin}/entries`, "POST", A, { field_key: "care", content: "metin", source_name: "  " }), ctx(adamin));
    H.ok(r.status === 400, "kaynak zorunlu → 400");
    const D = await seedStonesUser(su, "SED", { demo: true });
    r = await entR.POST(req(`/api/dogaltas/stones/${adamin}/entries`, "POST", D, { field_key: "care", content: "demo", source_name: "demo" }), ctx(adamin));
    H.ok((await j(r)).demo === true && Number((await su.query(`select count(*)::int n from stone_entries where content='demo'`)).rows[0].n) === 0, "demo hesap yazamaz");
    await su.query(`delete from stones where id=$1`, [other]);
    H.ok(Number((await su.query(`select count(*)::int n from stone_entries where stone_id=$1`, [other])).rows[0].n) === 0, "taş silinince kayıtları CASCADE (yetim yok)");
    const v = buildStoneSourcesView({ physical_effects: "x" }, []);
    H.ok(v.length === 1, "sanity");
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();

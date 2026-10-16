/**
 * Manuel test Madde 14 — Doğaltaş ALAN BAŞINA çoklu kaynak: GERÇEK route + GERÇEK Postgres (prod'a SIFIR temas; ZZ_*).
 *
 * A) eski tek kaynaklı taş içerik aynen · B) iki kaynak AAA/BBB ayrı · C) aynı iki kaynak başka alanlarda farklı metin
 * D) Kaynak B düzenlenince A değişmez · E) Kaynak B'nin boş alanı A'yı silmez · F) arama B'nin içeriğini bulur
 * G) Word (tekli + toplu) A+B ayrı · H) admin aktarımı A+B içeriklerini korur · I) Yaşam Hafızası kaynak içeriğini kaybetmez
 * J) kaydet/yeniden yükle sonrası metinler birebir · K) eski kayıt geriye uyumlu (Word ESKİ kurucuyla birebir)
 * Çalıştır: npx tsx scripts/manual-14-20/m14-routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { Packer } from "docx";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStone, seedStonesUser, startWt9TestEnv, type Wt9User } from "../wt9/wt9TestEnv";
import { readMig } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { YH_INDEX_SOURCES } from "../../lib/yasam-hafizasi/indexer/sources";
import { extractFields } from "../../lib/yasam-hafizasi/indexer/extractFields";
import { buildIndexUnit } from "../../lib/yasam-hafizasi/indexer/buildCandidate";
import { fieldEntriesBySource, type StoneSourceView } from "../../lib/dogaltas/stoneSources";
import { buildStoneReportDoc, type StoneReportRow } from "../../app/api/dogaltas/stones/[id]/word-report/buildStoneReport";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("manual-14/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 500)), done: () => H0.done() };
type Json = Record<string, unknown>;
const req = (url: string, method: string, u: Wt9User, body?: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body),
});
const adminReq = (url: string, u: Wt9User, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: "POST", headers: { "content-type": "application/json", "x-admin-id": u.id, "x-session-token": u.token }, body: JSON.stringify(body),
});
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const sctx = (id: string, sourceId: string) => ({ params: Promise.resolve({ id, sourceId }) });
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
async function xmlText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
}
async function resText(res: Response) { return xmlText(Buffer.from(await res.arrayBuffer())); }
/** Bir başlığın (paragraf) altındaki bölümü sonraki bilinen başlığa kadar keser. */
function sectionAfter(txt: string, heading: string, nextHeadings: string[]): string {
  const lines = txt.split("\n");
  const i = lines.lastIndexOf(heading); // İçindekiler de aynı başlığı taşır → gövdedeki (son) başlık
  if (i < 0) return "";
  const rest = lines.slice(i + 1);
  const end = rest.findIndex((l) => nextHeadings.includes(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

// Türkçe + çok satır + baş/son boşluk: kaydet/yeniden yükle sonrası BİREBİR kalmalı (J).
const AAA = "AAA — Ahmet Eğitmen: mide ve sindirim; çğıöşü ÇĞİÖŞÜ.\nİkinci satır.";
const BBB = "BBB — Mehmet Eğitmen: baş ağrısını hafifletir.";
const BBB2 = "BBB2 — Mehmet Eğitmen güncel: uykusuzlukta destekler.\n  girintili satır  ";
const KITAP = "KİTAP — Kristal Şifa Kitabı: kas gerginliği.";

(async () => {
  const env = await startWt9TestEnv({ port: 54513, dirName: "manual14-routes-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const baseDir = path.join(process.cwd(), "scripts", "manual-14-20", ".baseline-tmp");
  try {
    await su.query(readMig("20260903000000_admin_audit_log.sql")).catch(() => undefined);
    await su.query(`create table if not exists public.admin_library_transfer_batches (
      batch_id uuid primary key, actor_admin_id uuid not null, target_user_id uuid, source_tenant_id uuid not null, target_tenant_id uuid not null,
      status text not null default 'processing', requested_count integer not null default 0, inserted_count integer not null default 0,
      counts jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);

    const A = await seedStonesUser(su, "M14A", { role: "admin" });
    const T = await seedStonesUser(su, "M14T");
    const X = await seedStonesUser(su, "M14X");
    const stonesR = await import("../../app/api/dogaltas/stones/route");
    const srcR = await import("../../app/api/dogaltas/stones/[id]/sources/route");
    const oneR = await import("../../app/api/dogaltas/stones/[id]/sources/[sourceId]/route");
    const wordR = await import("../../app/api/dogaltas/stones/[id]/word-report/route");
    const bulkR = await import("../../app/api/dogaltas/word-report/route");
    const transfer = await import("../../app/api/admin/veri-paylasimi/transfer/route");
    const getSources = async (u: Wt9User, id: string) => ((await j(await srcR.GET(req(`/api/dogaltas/stones/${id}/sources`, "GET", u), ctx(id)))).sources ?? []) as StoneSourceView[];

    // ── A/K) eski tek kaynaklı taş ──
    const legacyFields = {
      stone_name: "ZZ Eski Ametist", short_description: "Eski kısa", general_info: "Eski genel bilgi.", source_note: "Kristal Şifa kitabı",
      physical_effects: "Eski fiziksel.", spiritual_effects: "Eski ruhsal.", other_effects: null, warning_text: "Eski uyarı.", feng_shui: "Eski feng",
      meditation: null, care: "Eski bakım", application: null, chakras: ["Taç Çakra"], warning_tags: ["Su ile temizlenmez"], assignments: { Burçlar: [["Balık"]] }, images: [],
    };
    const legacy = await seedStone(su, A.tenant, legacyFields);
    const legacyNamed = await seedStone(su, A.tenant, { ...legacyFields, stone_name: "ZZ Eski Adlı", primary_source_name: "Kristal Şifa Kitabı" });
    let srcs = await getSources(A, legacy);
    H.ok(srcs.length === 1 && srcs[0]!.isPrimary && srcs[0]!.name === null && srcs[0]!.fields.physical_effects === "Eski fiziksel." && srcs[0]!.fields.general_info === "Eski genel bilgi.",
      "A: eski tek kaynaklı taş → 1 kaynak, içerik AYNEN", srcs);
    H.ok(fieldEntriesBySource(srcs, "physical_effects").length === 1, "A: tek kaynakta alan girdisi tek (UI eski görünümde kalır)");

    // K) Word: yeni kurucu, origin/main'deki ESKİ kurucuyla tek kaynaklı taşta BİREBİR aynı metni üretir.
    mkdirSync(baseDir, { recursive: true });
    const oldSrc = execFileSync("git", ["show", "origin/main:app/api/dogaltas/stones/[id]/word-report/buildStoneReport.ts"], { encoding: "utf8" });
    writeFileSync(path.join(baseDir, "buildStoneReport.base.ts"), oldSrc, "utf8");
    const oldMod = (await import(pathToFileURL(path.join(baseDir, "buildStoneReport.base.ts")).href)) as { buildStoneReportDoc: typeof buildStoneReportDoc };
    const now = new Date("2026-10-16T09:00:00Z");
    for (const id of [legacy, legacyNamed]) {
      const row = (await su.query(`select * from stones where id=$1`, [id])).rows[0] as StoneReportRow;
      const a = await xmlText(await Packer.toBuffer(oldMod.buildStoneReportDoc({ stone: row, imageBuf: null, isLibrary: false, now }).doc));
      const b = await xmlText(await Packer.toBuffer(buildStoneReportDoc({ stone: row, imageBuf: null, isLibrary: false, now, extraSources: [] }).doc));
      H.ok(a === b && a.length > 200, `K: tek kaynaklı Word eski kurucuyla birebir (${row.primary_source_name ? "adlı" : "adsız"} birincil)`, { a: a.slice(0, 120), b: b.slice(0, 120) });
    }
    let r = await wordR.POST(req(`/api/dogaltas/stones/${legacy}/word-report`, "POST", A, {}), ctx(legacy));
    let txt = r.status === 200 ? await resText(r) : "";
    H.ok(r.status === 200 && !/Kaynak: /.test(txt) && txt.includes("Eski fiziksel.") && txt.includes("Eski genel bilgi."), "K: eski kayıt Word route → kaynak etiketi YOK, içerik tam", r.status);

    // ── B) iki kaynak: Ahmet (birincil) AAA, Mehmet (ek) BBB ──
    const stone = await seedStone(su, A.tenant, {
      stone_name: "ZZ Çok Kaynak Akik", primary_source_name: "Ahmet Eğitmen", physical_effects: AAA, spiritual_effects: "A-ruh: Ahmet ruhsal.",
      general_info: "A-genel", chakras: ["Kök Çakra"], warning_tags: ["Tuzlu su"], assignments: { Burçlar: [["Koç"]] }, images: [],
    });
    r = await srcR.POST(req(`/api/dogaltas/stones/${stone}/sources`, "POST", A, { source_name: "Mehmet Eğitmen", physical_effects: BBB, spiritual_effects: "B-ruh: Mehmet ruhsal ÖZELSÖZ.", care: "B-bakım", chakras: ["Kalp Çakrası"] }), ctx(stone));
    let jb = await j(r);
    const mehmet = String((jb.source as Json)?.id ?? "");
    H.ok((r.status === 200 || r.status === 201) && mehmet, "B: ikinci kaynak (Mehmet) eklendi", jb);
    r = await srcR.POST(req(`/api/dogaltas/stones/${stone}/sources`, "POST", A, { source_name: "Kristal Şifa Kitabı", physical_effects: KITAP }), ctx(stone));
    const kitap = String(((await j(r)).source as Json)?.id ?? "");
    srcs = await getSources(A, stone);
    let phys = fieldEntriesBySource(srcs, "physical_effects");
    H.ok(phys.length === 3 && phys[0]!.name === "Ahmet Eğitmen" && phys[0]!.text === AAA && phys[1]!.name === "Mehmet Eğitmen" && phys[1]!.text === BBB && phys[2]!.text === KITAP,
      "B: Fiziksel Etkiler → 3 AYRI kaynak girdisi (Ahmet AAA · Mehmet BBB · Kitap), karışma yok", phys);
    H.ok(!phys.some((e) => e.text.includes("AAA") && e.text.includes("BBB")), "B: metinler tek metinde BİRLEŞTİRİLMEDİ");
    const st0 = (await su.query(`select physical_effects from stones where id=$1`, [stone])).rows[0];
    H.ok(st0.physical_effects === AAA, "B: taş satırı (birincil) yalnız Ahmet'in metnini taşır");

    // ── C) aynı iki kaynak başka alanlarda farklı metin ──
    const spir = fieldEntriesBySource(srcs, "spiritual_effects");
    const care = fieldEntriesBySource(srcs, "care");
    H.ok(spir.length === 2 && spir[0]!.text.startsWith("A-ruh") && spir[1]!.text.startsWith("B-ruh") && care.length === 1 && care[0]!.name === "Mehmet Eğitmen",
      "C: Ruhsal Etkiler A/B ayrı; Bakım yalnız Mehmet'te (Ahmet'te boş → girdi yok)", { spir, care });
    H.ok(JSON.stringify(srcs.map((s) => s.fields.chakras)) === JSON.stringify([["Kök Çakra"], ["Kalp Çakrası"], null]), "C: çakralar kaynak başına ayrı", srcs.map((s) => s.fields.chakras));

    // ── D) Kaynak B düzenlenince A değişmez ──
    const snapA = async () => (await su.query(`select md5(row_to_json(s)::text) h from stones s where id=$1`, [stone])).rows[0].h as string;
    const snapSrc = async (id: string) => (await su.query(`select md5((to_jsonb(s) - 'updated_at')::text) h from stone_sources s where id=$1`, [id])).rows[0].h as string;
    const aBefore = (await su.query(`select physical_effects, spiritual_effects, general_info, chakras from stones where id=$1`, [stone])).rows[0];
    const kitapBefore = await snapSrc(kitap);
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${stone}/sources/${mehmet}`, "PATCH", A, { physical_effects: BBB2 }), sctx(stone, mehmet));
    H.ok(r.status === 200, "D: Mehmet'in fiziksel etkisi güncellendi", await j(r));
    let aAfter = (await su.query(`select physical_effects, spiritual_effects, general_info, chakras from stones where id=$1`, [stone])).rows[0];
    H.ok(JSON.stringify(aAfter) === JSON.stringify(aBefore), "D: Ahmet'in (birincil) TÜM alanları değişmedi", aAfter);
    H.ok((await snapSrc(kitap)) === kitapBefore, "D: üçüncü kaynak (Kitap) değişmedi");
    let mRow = (await su.query(`select * from stone_sources where id=$1`, [mehmet])).rows[0];
    H.ok(mRow.physical_effects === BBB2 && mRow.spiritual_effects === "B-ruh: Mehmet ruhsal ÖZELSÖZ." && mRow.care === "B-bakım", "D: Mehmet'in diğer alanları korundu (kısmi PATCH)");

    // ── E) Kaynak B'nin boş alanı A'yı silmez ──
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${stone}/sources/${mehmet}`, "PATCH", A, { care: "   " }), sctx(stone, mehmet));
    mRow = (await su.query(`select * from stone_sources where id=$1`, [mehmet])).rows[0];
    aAfter = (await su.query(`select physical_effects, spiritual_effects, general_info, chakras from stones where id=$1`, [stone])).rows[0];
    H.ok(r.status === 200 && mRow.care === null && JSON.stringify(aAfter) === JSON.stringify(aBefore), "E: Mehmet'in Bakım'ı boşaltıldı → yalnız Mehmet'te NULL, Ahmet aynı");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${stone}/sources/${mehmet}`, "PATCH", A, { general_info: null }), sctx(stone, mehmet));
    aAfter = (await su.query(`select general_info from stones where id=$1`, [stone])).rows[0];
    H.ok(r.status === 200 && aAfter.general_info === "A-genel", "E: Mehmet'te boş Genel Bilgi Ahmet'in Genel Bilgisini SİLMEDİ");
    // Ahmet'i (birincil) düzenlemek Mehmet'i değiştirmez (ters yön).
    const mBefore = await snapSrc(mehmet);
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${stone}/sources/primary`, "PATCH", A, { spiritual_effects: "A-ruh güncel." }), sctx(stone, "primary"));
    H.ok(r.status === 200 && (await snapSrc(mehmet)) === mBefore && (await su.query(`select spiritual_effects from stones where id=$1`, [stone])).rows[0].spiritual_effects === "A-ruh güncel.",
      "E: birincil (Ahmet) düzenlemesi Mehmet'in kaydına dokunmadı");

    // ── J) kaydet / yeniden yükle → metinler birebir ──
    srcs = await getSources(A, stone);
    phys = fieldEntriesBySource(srcs, "physical_effects");
    H.ok(phys[0]!.text === AAA && phys[1]!.text === BBB2 && phys[2]!.text === KITAP, "J: yeniden yükleme sonrası Türkçe/çok satır/boşluklu metinler BİREBİR (kırpma yok)", phys);

    // ── F) arama Kaynak B'nin içeriğini bulur ──
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("ruhsal ÖZELSÖZ")}&searchMode=content`, "GET", A));
    jb = await j(r);
    H.ok(r.status === 200 && (jb.rows as Json[]).some((x) => x.id === stone), "F: içerik araması yalnız Mehmet'te geçen ifadeyi bulur", jb);
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("uykusuzlukta")}&searchMode=content`, "GET", A));
    H.ok(((await j(r)).rows as Json[]).some((x) => x.id === stone), "F: Mehmet'in GÜNCELLENMİŞ metni aranabilir (türetilmiş metin tazelendi)");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("ruhsal ÖZELSÖZ")}&searchMode=content`, "GET", X));
    H.ok(((await j(r)).rows as Json[]).length === 0, "F: başka uzman (X) bu kaynak içeriğini bulamaz (tenant izolasyonu)");

    // ── G) Word: A+B ayrı ──
    r = await wordR.POST(req(`/api/dogaltas/stones/${stone}/word-report`, "POST", A, {}), ctx(stone));
    txt = r.status === 200 ? await resText(r) : "";
    const physSec = sectionAfter(txt, "Fiziksel Etkiler", ["Ruhsal Etkiler", "Diğer Etkiler", "Uyarılar ve Hassasiyetler", "BÖLÜM 3"]);
    const iA = physSec.indexOf("Kaynak: Ahmet Eğitmen"), iAt = physSec.indexOf("AAA — Ahmet"), iB = physSec.indexOf("Kaynak: Mehmet Eğitmen"), iBt = physSec.indexOf("BBB2 — Mehmet"), iK = physSec.indexOf("Kaynak: Kristal Şifa Kitabı");
    H.ok(r.status === 200 && iA >= 0 && iA < iAt && iAt < iB && iB < iBt && iBt < iK && physSec.includes(KITAP), "G: tekli Word — Fiziksel Etkiler altında Ahmet→AAA, Mehmet→BBB2, Kitap ayrı ve sıralı", physSec.slice(0, 400));
    H.ok(!txt.includes("Ek Kaynak 1:") && (txt.match(/^Fiziksel Etkiler$/gm) ?? []).length === 2, "G: alan başlığı bir kez (+İçindekiler), ayrı 'Ek Kaynak' bölümü yok", (txt.match(/^Fiziksel Etkiler$/gm) ?? []).length);
    const spirSec = sectionAfter(txt, "Ruhsal Etkiler", ["Diğer Etkiler", "Uyarılar ve Hassasiyetler", "BÖLÜM 3"]);
    H.ok(spirSec.includes("Kaynak: Ahmet Eğitmen") && spirSec.includes("A-ruh güncel.") && spirSec.includes("Kaynak: Mehmet Eğitmen") && !spirSec.includes("Kaynak: Kristal Şifa Kitabı"),
      "G: Ruhsal Etkiler'de yalnız içeriği olan kaynaklar (Kitap'ın boş alanı blok üretmez)", spirSec);
    H.ok(/Bilgi Kaynakları/.test(txt) && txt.includes("Ahmet Eğitmen · Mehmet Eğitmen · Kristal Şifa Kitabı"), "G: özet sayfasında kaynak listesi");
    r = await bulkR.POST(new NextRequest("http://localhost/api/dogaltas/word-report", {
      method: "POST", headers: { "content-type": "application/json", "x-user-id": A.id, "x-session-token": A.token },
      body: JSON.stringify({ sections: { stones: true }, selectedStoneIds: [stone, legacy] }),
    }));
    txt = r.status === 200 ? await resText(r) : "";
    const bulkStone = txt.slice(txt.lastIndexOf("ZZ Çok Kaynak Akik"));
    const bPhys = sectionAfter(bulkStone, "Fiziksel Etkiler", ["Ruhsal Etkiler", "Diğer Etkiler", "Feng Shui", "Bakım", "Çakralar"]);
    H.ok(r.status === 200 && bPhys.indexOf("Kaynak: Ahmet Eğitmen") < bPhys.indexOf("AAA — Ahmet") && bPhys.indexOf("Kaynak: Mehmet Eğitmen") < bPhys.indexOf("BBB2 — Mehmet") && bPhys.indexOf("AAA — Ahmet") < bPhys.indexOf("Kaynak: Mehmet Eğitmen"),
      "G: toplu Word — aynı alan altında kaynak kaynak ayrı", { status: r.status, bPhys: bPhys.slice(0, 300) });
    const bulkLegacy = txt.slice(txt.lastIndexOf("ZZ Eski Ametist"), txt.lastIndexOf("ZZ Çok Kaynak Akik") > txt.lastIndexOf("ZZ Eski Ametist") ? txt.lastIndexOf("ZZ Çok Kaynak Akik") : undefined);
    H.ok(bulkLegacy.includes("Eski fiziksel.") && !/Kaynak: /.test(bulkLegacy), "G: toplu Word — eski tek kaynaklı taş şişmedi (kaynak etiketi yok)", bulkLegacy.slice(0, 300));

    // ── I) Yaşam Hafızası ──
    const cfg = YH_INDEX_SOURCES.find((c) => c.sourceKey === "dogaltas:stones")!;
    const row = (await su.query(`select * from stones where id=$1`, [stone])).rows[0] as Record<string, unknown>;
    const ex = extractFields(cfg, row);
    const unit = buildIndexUnit(cfg, row, { ok: true, tenantId: A.tenant, isShared: false }, ex);
    const ev = ex.evidenceFields.map((e) => `${e.origin}=${e.text}`).join("\n");
    H.ok(unit !== null && ev.includes(AAA.split("\n")[0]!) && /Kaynak: Mehmet Eğitmen\nKısa|Kaynak: Mehmet Eğitmen\n/.test(ev) && ev.includes("Fiziksel Etkiler: BBB2 — Mehmet") && ev.includes("Fiziksel Etkiler: KİTAP"),
      "I: YH belgesi birincil + her ek kaynağın metnini KAYNAK ADIYLA içerir", ev.slice(0, 600));
    H.ok(ex.evidenceFields.filter((e) => e.origin === "extra_sources_text").length === 1, "I: taş başına tek belge (duplicate yok)");
    const ob = (await su.query(`select tenant_id::text t, count(*)::int n from yasam_hafizasi_outbox where source_id=$1 group by 1`, [stone]).catch(() => ({ rows: [] as Json[] }))).rows;
    H.ok(ob.length === 0 || ob.every((x) => x.t === A.tenant), "I: outbox kayıtları yalnız taşın tenant'ında", ob);

    // ── H) admin aktarımı A+B içeriklerini korur ──
    const FIELDS = ["source_name", "sort_order", "short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "feng_shui", "meditation", "care", "application", "warning_text", "chakras"];
    const aSources = (await su.query(`select * from stone_sources where stone_id=$1 order by sort_order, created_at, id`, [stone])).rows;
    r = await transfer.POST(adminReq("/api/admin/veri-paylasimi/transfer", A, { batchId: randomUUID(), targetUserId: T.id, targetTenantId: T.tenant, groups: ["stones"], filterMap: { stones: [stone] } }));
    jb = await j(r);
    const tStone = (await su.query(`select * from stones where tenant_id=$1 and stone_name='ZZ Çok Kaynak Akik'`, [T.tenant])).rows[0];
    const tSources = tStone ? (await su.query(`select * from stone_sources where stone_id=$1 order by sort_order, created_at, id`, [tStone.id])).rows : [];
    H.ok(r.status === 200 && tStone && tStone.primary_source_name === "Ahmet Eğitmen" && tStone.physical_effects === AAA, "H: aktarılan taş birincil kaynak adı + Ahmet'in metniyle geldi", jb);
    H.ok(tSources.length === aSources.length && aSources.every((a, i) => FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(tSources[i]?.[f]))),
      "H: Mehmet + Kitap kaynakları TÜM alan içerikleriyle (BBB2, ruhsal, çakra) taşındı", tSources.map((s) => s.source_name));
    const tView = await getSources(T, String(tStone?.id));
    const tPhys = fieldEntriesBySource(tView, "physical_effects");
    H.ok(tPhys.length === 3 && tPhys[1]!.text === BBB2 && tPhys[1]!.name === "Mehmet Eğitmen", "H: hedef uzman aynı alan-başı kaynak bloklarını görür", tPhys);
    H.ok(tSources.every((s) => s.tenant_id === T.tenant), "H: kaynak satırları hedef tenant'ta (cross-tenant yok)");
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    await env.stop?.();
    H.done();
  }
})();

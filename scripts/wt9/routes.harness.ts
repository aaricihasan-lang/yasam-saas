/**
 * WT9 — Doğaltaş ÇOKLU KAYNAK: GERÇEK route + GERÇEK Postgres entegrasyon harness'ı (prod'a SIFIR temas; ZZ_*).
 *
 * P) Migration ÖNCESİ (eski şema): uygulama çökmez — kaynak GET birincil-yalnız + schemaMissing,
 *    POST 503, ad önerisi boş, içerik araması eski kolonlarla çalışır, Word eski düzen.
 * M) Migration: kolonlar/tablo/RLS/grant yok/idempotent, mevcut veri DEĞİŞMEZ.
 * A/B/C) 1/2/5 kaynak · D) aynı adı tekrar (Türkçe büyük-küçük + boşluk) · E) yeni kaynak diğerlerini değiştirmez
 * F) düzenleme/yeniden adlandırma · G) silme (ek / birincil→terfi / son kaynak reddi) · H) diğer kaynaklar korunur
 * I) tenant izolasyonu (API + DB tetikleyici + öneriler) · J) arama · K) Word (tekli + toplu) · L) Yaşam Hafızası
 * M2) uzun metin · N) boş alan · O) Türkçe karakter · Demo yazamaz.
 * Çalıştır: npx tsx scripts/wt9/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, applyWt9Migration, seedStone, seedStonesUser, startWt9TestEnv, type Wt9User } from "./wt9TestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { YH_INDEX_SOURCES } from "../../lib/yasam-hafizasi/indexer/sources";
import { extractFields } from "../../lib/yasam-hafizasi/indexer/extractFields";
import { buildIndexUnit } from "../../lib/yasam-hafizasi/indexer/buildCandidate";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("wt9/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
type Json = Record<string, unknown>;
function req(url: string, method: string, u: Wt9User, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const sctx = (id: string, sourceId: string) => ({ params: Promise.resolve({ id, sourceId }) });
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
async function docText(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
}
const CONTENT_COLS = ["stone_name", "short_description", "general_info", "source_note", "physical_effects", "spiritual_effects", "other_effects", "warning_text", "warning_tags", "feng_shui", "meditation", "care", "application", "chakras", "assignments", "images"];
const sumSql = `md5(concat_ws('|', ${CONTENT_COLS.map((c) => `coalesce(${c}::text, '<NULL>')`).join(", ")}))`;

const LONG = ("Uzun ŞİFA metni çğıöşü ÇĞİÖŞÜ \"tırnak\" & <açı> mide; ".repeat(400)) + "SON_KESILMEDI";

(async () => {
  const env = await startWt9TestEnv({ port: 54497, dirName: "wt9-routes-pgdata", withMigration: false });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    const A = await seedStonesUser(su, "A");
    const B = await seedStonesUser(su, "B");
    const D = await seedStonesUser(su, "DEMO", { demo: true });
    const legacy = await seedStone(su, A.tenant, {
      stone_name: "ZZ Akik", short_description: "Kısa", general_info: "Genel: mide ve sindirim.", source_note: "Kristal Şifa kitabı",
      physical_effects: "Fiziksel etkiler", spiritual_effects: null, other_effects: "", feng_shui: "Feng", care: "Bakım",
      chakras: ["Kök Çakra", "Sakral Çakra"], warning_tags: ["Su ile temizlenmez"], assignments: { Burçlar: [["Koç"]] }, images: [],
    });
    const stonesR = await import("../../app/api/dogaltas/stones/route");
    const stoneR = await import("../../app/api/dogaltas/stones/[id]/route");
    const srcR = await import("../../app/api/dogaltas/stones/[id]/sources/route");
    const oneR = await import("../../app/api/dogaltas/stones/[id]/sources/[sourceId]/route");
    const namesR = await import("../../app/api/dogaltas/stone-sources/names/route");
    const wordR = await import("../../app/api/dogaltas/stones/[id]/word-report/route");
    const bulkR = await import("../../app/api/dogaltas/word-report/route");

    // ── P) migration ÖNCESİ ──
    let r = await srcR.GET(req(`/api/dogaltas/stones/${legacy}/sources`, "GET", A), ctx(legacy));
    let jb = await j(r);
    H.ok(r.status === 200 && (jb.sources as Json[]).length === 1 && jb.schemaMissing === true && (jb.sources as Json[])[0]!.name === null,
      "P: migration öncesi kaynak GET → yalnız birincil (eski tek kaynak), çökme yok", jb);
    r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", A, { source_name: "X" }), ctx(legacy));
    H.ok(r.status === 503, "P: migration öncesi yeni kaynak → 503 (net mesaj, 500 değil)", r.status);
    r = await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", A));
    H.ok(r.status === 200 && Array.isArray((await j(r)).names), "P: migration öncesi ad önerisi → boş liste");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("mide")}&searchMode=content&withCount=1`, "GET", A));
    jb = await j(r);
    H.ok(r.status === 200 && (jb.rows as Json[]).some((x) => x.id === legacy), "P: migration öncesi içerik araması eski kolonlarla çalışır (geri uyum)", { status: r.status, jb });
    r = await wordR.POST(req(`/api/dogaltas/stones/${legacy}/word-report`, "POST", A, {}), ctx(legacy));
    let txt = r.status === 200 ? await docText(r) : "";
    H.ok(r.status === 200 && !/KAYNAK:/.test(txt) && txt.includes("Genel: mide ve sindirim."), "P: migration öncesi Word eski düzen (kaynak etiketi yok)", r.status);

    // ── M) migration ──
    const before = (await su.query(`select id, ${sumSql} as s, updated_at from public.stones order by id`)).rows;
    await applyWt9Migration(su);
    await applyWt9Migration(su); // idempotent
    const after = (await su.query(`select id, ${sumSql} as s, updated_at, primary_source_name, extra_sources_text from public.stones order by id`)).rows;
    H.ok(JSON.stringify(before.map((x) => [x.id, x.s, String(x.updated_at)])) === JSON.stringify(after.map((x) => [x.id, x.s, String(x.updated_at)])),
      "M: migration mevcut veriyi DEĞİŞTİRMEZ (içerik checksum + updated_at birebir)");
    H.ok(after.every((x) => x.primary_source_name === null && x.extra_sources_text === null), "M: yeni kolonlar NULL (backfill migration'da DEĞİL)");
    H.ok((await su.query(`select relrowsecurity from pg_class where oid='public.stone_sources'::regclass`)).rows[0].relrowsecurity === true, "M: stone_sources RLS açık");
    H.ok(Number((await su.query(`select count(*)::int n from information_schema.role_table_grants where table_name='stone_sources' and grantee in ('anon','authenticated')`)).rows[0].n) === 0, "M: anon/authenticated grant YOK");
    H.ok(Number((await su.query(`select count(*)::int n from pg_constraint where conname='stones_primary_source_name_chk'`)).rows[0].n) === 1, "M: CHECK tek (idempotent)");

    // ── A) 1 taş / 1 kaynak (eski kayıt) ──
    r = await srcR.GET(req(`/api/dogaltas/stones/${legacy}/sources`, "GET", A), ctx(legacy));
    jb = await j(r);
    let sources = jb.sources as Json[];
    H.ok(r.status === 200 && sources.length === 1 && sources[0]!.id === "primary" && sources[0]!.name === null && jb.schemaMissing === false,
      "A: eski kayıt → 1 kaynak (birincil, adı belirtilmemiş)", jb);
    H.ok(((sources[0]!.fields as Json).general_info === "Genel: mide ve sindirim.") && JSON.stringify((sources[0]!.fields as Json).chakras) === JSON.stringify(["Kök Çakra", "Sakral Çakra"]),
      "A: birincil kaynak alanları taşın kendi içeriği (taşınmadı)");

    // birincil ad ver
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${legacy}/sources/primary`, "PATCH", A, { source_name: "  Kristal   Şifa Kitabı " }), sctx(legacy, "primary"));
    H.ok(r.status === 200 && (await su.query(`select primary_source_name from stones where id=$1`, [legacy])).rows[0].primary_source_name === "Kristal Şifa Kitabı",
      "F: birincil kaynağa ad verildi (boşluk normalize)");
    const sumAfterName = (await su.query(`select ${sumSql} s from stones where id=$1`, [legacy])).rows[0].s;
    H.ok(sumAfterName === before.find((x) => x.id === legacy)!.s, "F: ad vermek içeriği DEĞİŞTİRMEDİ");

    // ── E/B) yeni kaynak ──
    r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", A, { source_name: "Ahmet Hoca Eğitim Notu", physical_effects: "Ahmet: mide kramplarında rahatlatır.", chakras: ["Kalp"] }), ctx(legacy));
    jb = await j(r);
    const ahmet = (jb.source as Json)?.id as string;
    H.ok(r.status === 201 && ahmet, "E: yeni kaynak eklendi (201)", jb);
    H.ok((await su.query(`select ${sumSql} s from stones where id=$1`, [legacy])).rows[0].s === sumAfterName, "E: yeni kaynak birincil içeriği DEĞİŞTİRMEDİ");
    r = await srcR.GET(req(`/api/dogaltas/stones/${legacy}/sources`, "GET", A), ctx(legacy));
    sources = (await j(r)).sources as Json[];
    H.ok(sources.length === 2 && sources[0]!.name === "Kristal Şifa Kitabı" && sources[1]!.name === "Ahmet Hoca Eğitim Notu" &&
      (sources[1]!.fields as Json).physical_effects === "Ahmet: mide kramplarında rahatlatır." && (sources[1]!.fields as Json).general_info === null,
      "B: 1 taş / 2 kaynak — hangi metnin hangi kaynağa ait olduğu ayrı", sources);

    // ── D) aynı kaynak adı ──
    for (const dup of ["kristal şifa KİTABI", "Ahmet  Hoca eğitim notu", "AHMET HOCA EĞİTİM NOTU"]) {
      r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", A, { source_name: dup }), ctx(legacy));
      H.ok(r.status === 409 && (await j(r)).code === "duplicate_source", `D: "${dup}" → 409 (aynı kaynak iki kez yok)`);
    }
    let dbErr = "";
    try { await su.query(`insert into stone_sources(tenant_id, stone_id, source_name) values ($1,$2,'KRİSTAL ŞİFA KİTABI')`, [A.tenant, legacy]); } catch (e) { dbErr = String((e as { code?: string }).code); }
    H.ok(dbErr === "23505", "D: DB de birincil adla çakışan ek kaynağı reddeder (23505)", dbErr);
    try { dbErr = ""; await su.query(`insert into stone_sources(tenant_id, stone_id, source_name) values ($1,$2,'ahmet hoca EĞİTİM notu')`, [A.tenant, legacy]); } catch (e) { dbErr = String((e as { code?: string }).code); }
    H.ok(dbErr === "23505", "D: DB UNIQUE (normalize ad) — 23505", dbErr);
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${legacy}/sources/primary`, "PATCH", A, { source_name: "Ahmet Hoca Eğitim Notu" }), sctx(legacy, "primary"));
    H.ok(r.status === 409, "D: birincili ek kaynağın adına çevirmek → 409");
    try { dbErr = ""; await su.query(`update stones set primary_source_name='ahmet hoca eğitim NOTU' where id=$1`, [legacy]); } catch (e) { dbErr = String((e as { code?: string }).code); }
    H.ok(dbErr === "23505", "D: DB tetikleyicisi birincil→ek ad çakışmasını reddeder", dbErr);

    // ── C) 5 kaynak + O) Türkçe + M2) uzun metin + N) boş ──
    const names5 = ["Kendi Ders Notlarım", "X Yayınları — Çakra Rehberi", "Işık & Şifa Atölyesi"];
    const ids5: string[] = [];
    for (const n of names5) {
      r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", A, { source_name: n, general_info: n === names5[0] ? LONG : `${n} genel bilgisi`, feng_shui: "   ", meditation: "" }), ctx(legacy));
      jb = await j(r);
      ids5.push((jb.source as Json)?.id as string);
    }
    r = await srcR.GET(req(`/api/dogaltas/stones/${legacy}/sources`, "GET", A), ctx(legacy));
    sources = (await j(r)).sources as Json[];
    H.ok(sources.length === 5 && sources.map((s) => s.name).join("|") === ["Kristal Şifa Kitabı", "Ahmet Hoca Eğitim Notu", ...names5].join("|"), "C: 1 taş / 5 kaynak, ekleme sırası korunur", sources.map((s) => s.name));
    const longSrc = sources.find((s) => s.name === "Kendi Ders Notlarım")!;
    H.ok((longSrc.fields as Json).general_info === LONG && (LONG.length > 20000), "M2: uzun metin (20k+) KISALTILMADAN kaydedildi", (longSrc.fields as Json).general_info?.toString().length);
    H.ok((longSrc.fields as Json).feng_shui === null && (longSrc.fields as Json).meditation === null, "N: yalnız boşluk/boş → NULL (boş dolu sanılmaz)");
    H.ok(sources.some((s) => s.name === "Işık & Şifa Atölyesi") && sources.some((s) => s.name === "X Yayınları — Çakra Rehberi"), "O: Türkçe karakter/özel işaret kaynak adları birebir");
    r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", A, { source_name: "Çok Uzun", general_info: "a".repeat(150_001) }), ctx(legacy));
    H.ok(r.status === 400, "M2: üst sınırı aşan metin REDDEDİLİR (sessiz kısaltma yok)");
    r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", A, { source_name: "   " }), ctx(legacy));
    H.ok(r.status === 400, "N: boş kaynak adı → 400");

    // ── F) düzenleme / yeniden adlandırma ──
    const othersBefore = (await su.query(`select id, md5(row_to_json(s)::text) h from stone_sources s where stone_id=$1 and id<>$2 order by id`, [legacy, ahmet])).rows;
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${legacy}/sources/${ahmet}`, "PATCH", A, { spiritual_effects: "Ahmet: ruhsal denge", source_name: "Ahmet Hoca Eğitim Notları" }), sctx(legacy, ahmet));
    jb = await j(r);
    H.ok(r.status === 200 && (jb.source as Json)?.source_name === "Ahmet Hoca Eğitim Notları" && (jb.source as Json)?.spiritual_effects === "Ahmet: ruhsal denge" &&
      (jb.source as Json)?.physical_effects === "Ahmet: mide kramplarında rahatlatır.", "F: ek kaynak düzenlendi + yeniden adlandırıldı (diğer alanları korunarak)", jb);
    const othersAfter = (await su.query(`select id, md5(row_to_json(s)::text) h from stone_sources s where stone_id=$1 and id<>$2 order by id`, [legacy, ahmet])).rows;
    H.ok(JSON.stringify(othersBefore) === JSON.stringify(othersAfter), "H: düzenleme diğer kaynakları DEĞİŞTİRMEDİ (satır hash birebir)");
    H.ok((await su.query(`select ${sumSql} s from stones where id=$1`, [legacy])).rows[0].s === sumAfterName, "H: ek kaynak düzenlemesi birincil içeriği DEĞİŞTİRMEDİ");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${legacy}/sources/primary`, "PATCH", A, { care: "Birincil bakım güncel" }), sctx(legacy, "primary"));
    H.ok(r.status === 200 && (await su.query(`select care from stones where id=$1`, [legacy])).rows[0].care === "Birincil bakım güncel", "F: birincil kaynak alanı düzenlendi (taş satırı)");

    // ── I) tenant izolasyonu ──
    r = await srcR.GET(req(`/api/dogaltas/stones/${legacy}/sources`, "GET", B), ctx(legacy));
    H.ok(r.status === 404, "I: B, A'nın taşının kaynaklarını OKUYAMAZ (404)");
    r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", B, { source_name: "Sızma" }), ctx(legacy));
    H.ok(r.status === 404, "I: B, A'nın taşına kaynak EKLEYEMEZ");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${legacy}/sources/${ahmet}`, "PATCH", B, { physical_effects: "hack" }), sctx(legacy, ahmet));
    H.ok(r.status === 404 && (await su.query(`select physical_effects from stone_sources where id=$1`, [ahmet])).rows[0].physical_effects === "Ahmet: mide kramplarında rahatlatır.", "I: B, A'nın kaynağını DÜZENLEYEMEZ (değişmedi)");
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${legacy}/sources/${ahmet}`, "DELETE", B), sctx(legacy, ahmet));
    H.ok(r.status === 404 && Number((await su.query(`select count(*)::int n from stone_sources where id=$1`, [ahmet])).rows[0].n) === 1, "I: B, A'nın kaynağını SİLEMEZ");
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${legacy}/sources/primary`, "PATCH", B, { source_name: "hack" }), sctx(legacy, "primary"));
    H.ok(r.status === 404, "I: B, A'nın birincil kaynağını yeniden adlandıramaz");
    const bStone = await seedStone(su, B.tenant, { stone_name: "ZZ B Taşı", primary_source_name: "B'nin Gizli Kaynağı" });
    try { dbErr = ""; await su.query(`insert into stone_sources(tenant_id, stone_id, source_name) values ($1,$2,'çapraz')`, [A.tenant, bStone]); } catch (e) { dbErr = String((e as { code?: string }).code); }
    H.ok(dbErr === "42501", "I: DB tetikleyicisi çapraz-tenant kaynak satırını reddeder (42501)", dbErr);
    r = await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", A));
    const namesA = (await j(r)).names as string[];
    r = await namesR.GET(req(`/api/dogaltas/stone-sources/names`, "GET", B));
    const namesB = (await j(r)).names as string[];
    H.ok(namesA.includes("Kristal Şifa Kitabı") && namesA.includes("Ahmet Hoca Eğitim Notları") && !namesA.includes("B'nin Gizli Kaynağı"), "I: A'nın önerileri yalnız A'nın kaynakları", namesA);
    H.ok(JSON.stringify(namesB) === JSON.stringify(["B'nin Gizli Kaynağı"]), "I: B'nin önerilerinde A'nın kaynakları YOK", namesB);

    // ── demo ──
    r = await srcR.POST(req(`/api/dogaltas/stones/${legacy}/sources`, "POST", D, { source_name: "Demo" }), ctx(legacy));
    H.ok(r.status === 200 && (await j(r)).demo === true && Number((await su.query(`select count(*)::int n from stone_sources where source_name='Demo'`)).rows[0].n) === 0, "Demo: yazma yok (demo:true)");

    // ── J) arama ──
    const onlyExtra = await seedStone(su, A.tenant, { stone_name: "ZZ Sodalit", general_info: "Boğaz bölgesi.", primary_source_name: "Kristal Şifa Kitabı" });
    r = await srcR.POST(req(`/api/dogaltas/stones/${onlyExtra}/sources`, "POST", A, { source_name: "Ahmet Hoca Eğitim Notları", other_effects: "MİDE ekşimesinde kullanılır." }), ctx(onlyExtra));
    H.ok(r.status === 201, "J: yalnız ek kaynağında 'mide' geçen taş hazırlandı");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("mide")}&searchMode=content&withCount=1`, "GET", A));
    jb = await j(r);
    const hitIds = (jb.rows as Json[]).map((x) => x.id);
    H.ok(r.status === 200 && hitIds.includes(onlyExtra) && hitIds.includes(legacy), "J: 'mide' farklı kaynaklardaki eşleşmeleri bulur (ek kaynak dahil)", jb);
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("MİDE")}&searchMode=content`, "GET", A));
    H.ok(((await j(r)).rows as Json[]).some((x) => x.id === onlyExtra), "J: Türkçe büyük harf 'MİDE' de bulur");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("mide")}&searchMode=content`, "GET", B));
    H.ok(!((await j(r)).rows as Json[]).some((x) => x.id === onlyExtra || x.id === legacy), "J: B'nin araması A'nın taşlarını/kaynaklarını bulmaz");
    r = await stonesR.GET(req(`/api/dogaltas/stones?q=${encodeURIComponent("Ahmet Hoca")}&searchMode=content`, "GET", A));
    H.ok(((await j(r)).rows as Json[]).some((x) => x.id === onlyExtra), "J: kaynak adı arama bağlamında korunur");
    const extraText = (await su.query(`select extra_sources_text from stones where id=$1`, [onlyExtra])).rows[0].extra_sources_text as string;
    H.ok(/^Kaynak: Ahmet Hoca Eğitim Notları\nDiğer Etkiler: MİDE ekşimesinde kullanılır\.$/.test(extraText), "J: türetilmiş metin kaynak başlığıyla", extraText);

    // ── K) Word ──
    r = await wordR.POST(req(`/api/dogaltas/stones/${legacy}/word-report`, "POST", A, {}), ctx(legacy));
    txt = r.status === 200 ? await docText(r) : "";
    H.ok(r.status === 200 && txt.includes("KAYNAK: KRİSTAL ŞİFA KİTABI") && txt.includes("Ek Kaynak 1: Ahmet Hoca Eğitim Notları"), "K: tekli Word — KAYNAK başlıkları ayrı", r.status);
    H.ok(txt.includes("Ahmet: mide kramplarında rahatlatır.") && txt.includes("Ahmet: ruhsal denge") && txt.includes("Genel: mide ve sindirim."), "K: her kaynağın metni kendi bölümünde");
    H.ok(txt.includes("SON_KESILMEDI") && txt.includes("Işık & Şifa Atölyesi"), "K: uzun metin kesilmeden + Türkçe ad");
    H.ok(txt.indexOf("Genel: mide ve sindirim.") < txt.indexOf("Ek Kaynak 1:"), "K: birincil kaynak önce, ek kaynaklar sonra");
    r = await bulkR.POST(req(`/api/dogaltas/word-report`, "POST", A, { sections: { stones: true }, selectedStoneIds: [legacy, onlyExtra] }));
    txt = r.status === 200 ? await docText(r) : "";
    H.ok(r.status === 200 && (txt.match(/KAYNAK: Ahmet Hoca Eğitim Notları/g) ?? []).length === 2 && txt.includes("MİDE ekşimesinde kullanılır."), "K: toplu Word — her taşın ek kaynakları ayrı başlıkla", { status: r.status, sample: txt.slice(0, 300) });
    H.ok(/KAYNAK\s*:?\s*Kristal Şifa Kitabı/.test(txt), "K: toplu Word — birincil kaynak etiketi");

    // ── L) Yaşam Hafızası ──
    const outbox = (await su.query(`select operation, event_version from yasam_hafizasi_outbox where source_table='stones' and source_id=$1::uuid`, [onlyExtra])).rows;
    H.ok(outbox.length === 1 && outbox[0].operation === "upsert" && Number(outbox[0].event_version) >= 2, "L: ek kaynak eklenince mevcut outbox 'upsert' (coalesce, tek satır)", outbox);
    const cfg = YH_INDEX_SOURCES.find((c) => c.sourceKey === "dogaltas:stones")!;
    const row = (await su.query(`select * from stones where id=$1`, [onlyExtra])).rows[0] as Record<string, unknown>;
    const ex = extractFields(cfg, row);
    const unit = buildIndexUnit(cfg, row, { ok: true, tenantId: A.tenant, isShared: false }, ex);
    const evText = ex.evidenceFields.map((e) => `${e.origin}=${e.text}`).join("\n");
    H.ok(unit !== null && /primary_source_name=Kristal Şifa Kitabı/.test(evText) && /extra_sources_text=Kaynak: Ahmet Hoca Eğitim Notları/.test(evText), "L: YH belgesi birincil ad + ek kaynak metnini (kaynak adıyla) içerir", evText);
    H.ok(cfg.unit === "record" && ex.evidenceFields.filter((e) => e.origin === "extra_sources_text").length === 1, "L: taş başına TEK belge (ek kaynak ayrı belge değil → duplicate yok)");

    // ── G) silme ──
    const victim = ids5[1]!;
    const othersG = (await su.query(`select id, md5(row_to_json(s)::text) h from stone_sources s where stone_id=$1 and id<>$2 order by id`, [legacy, victim])).rows;
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${legacy}/sources/${victim}`, "DELETE", A), sctx(legacy, victim));
    H.ok(r.status === 200 && Number((await su.query(`select count(*)::int n from stone_sources where id=$1`, [victim])).rows[0].n) === 0, "G: ek kaynak silindi");
    H.ok(JSON.stringify(othersG) === JSON.stringify((await su.query(`select id, md5(row_to_json(s)::text) h from stone_sources s where stone_id=$1 order by id`, [legacy])).rows), "G/H: diğer kaynaklar birebir korundu");
    H.ok(Number((await su.query(`select count(*)::int n from stones where id=$1`, [legacy])).rows[0].n) === 1, "G: taşın kendisi silinmedi");
    // birincil sil → ilk ek kaynak terfi
    const promoted = (await su.query(`select * from stone_sources where stone_id=$1 order by sort_order, created_at limit 1`, [legacy])).rows[0];
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${legacy}/sources/primary`, "DELETE", A), sctx(legacy, "primary"));
    jb = await j(r);
    const st = (await su.query(`select * from stones where id=$1`, [legacy])).rows[0];
    H.ok(r.status === 200 && jb.promoted === promoted.id && st.primary_source_name === promoted.source_name &&
      st.physical_effects === promoted.physical_effects && st.general_info === promoted.general_info && JSON.stringify(st.chakras) === JSON.stringify(promoted.chakras),
      "G: birincil silinince ilk ek kaynak ATOMİK olarak birincil oldu (alanlar birebir)", jb);
    H.ok(Number((await su.query(`select count(*)::int n from stone_sources where id=$1`, [promoted.id])).rows[0].n) === 0 && st.stone_name === "ZZ Akik" &&
      JSON.stringify(st.warning_tags) === JSON.stringify(["Su ile temizlenmez"]) && JSON.stringify(st.assignments) === JSON.stringify({ Burçlar: [["Koç"]] }),
      "G: terfi eden ek satır kalktı; taşa özgü alanlar (ad, uyarı etiketi, atama) korundu");
    // son kaynak
    const single = await seedStone(su, A.tenant, { stone_name: "ZZ Tek", general_info: "Tek kaynak içerik", primary_source_name: "Tek Kaynak" });
    const sSum = (await su.query(`select ${sumSql} s from stones where id=$1`, [single])).rows[0].s;
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${single}/sources/primary`, "DELETE", A), sctx(single, "primary"));
    H.ok(r.status === 409 && (await j(r)).code === "last_source" && (await su.query(`select ${sumSql} s from stones where id=$1`, [single])).rows[0].s === sSum,
      "G: taşın TEK kaynağı silinemez (409) — içerik değişmedi");
    // taş silinince kaynaklar CASCADE, diğer taşınkiler kalır
    const before3 = Number((await su.query(`select count(*)::int n from stone_sources where stone_id<>$1`, [legacy])).rows[0].n);
    r = await stoneR.DELETE(req(`/api/dogaltas/stones/${legacy}`, "DELETE", A), ctx(legacy));
    H.ok(r.status === 200 && Number((await su.query(`select count(*)::int n from stone_sources where stone_id=$1`, [legacy])).rows[0].n) === 0 &&
      Number((await su.query(`select count(*)::int n from stone_sources where stone_id<>$1`, [legacy])).rows[0].n) === before3, "G: taş silinince YALNIZ onun kaynakları silinir (CASCADE, çökme yok)");

    // ── create with primary_source_name ──
    r = await stonesR.POST(req(`/api/dogaltas/stones`, "POST", A, { stone_name: "ZZ Yeni", general_info: "Yeni", primary_source_name: "  Kendi Ders Notlarım " }));
    const newId = ((await j(r)) as Json).id as string;
    H.ok(r.status === 200 && (await su.query(`select primary_source_name from stones where id=$1`, [newId])).rows[0].primary_source_name === "Kendi Ders Notlarım", "E: yeni taş kaynak adıyla oluşturulur (normalize)");
    r = await stoneR.PATCH(req(`/api/dogaltas/stones/${newId}`, "PATCH", A, { primary_source_name: "" }), ctx(newId));
    H.ok(r.status === 200 && (await su.query(`select primary_source_name from stones where id=$1`, [newId])).rows[0].primary_source_name === null, "N: boş ad → NULL (belirtilmemiş)");
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${e instanceof Error ? e.stack : String(e)}`);
  } finally {
    await env.stop();
  }
  H.done();
})();

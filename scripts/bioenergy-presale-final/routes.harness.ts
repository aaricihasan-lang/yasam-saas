/**
 * BİYOENERJİ SATIŞ-ÖNCESİ FİNAL — GERÇEK ROUTE + GERÇEK POSTGRES ENTEGRASYON HARNESS'I
 * (embedded-postgres + PostgREST shim, max-rows=1000; production'a SIFIR temas; ZZ_BIO_*).
 * Çalıştır: npx tsx scripts/bioenergy-presale-final/routes.harness.ts
 *
 * Kapsam: auth/tenant (401/403/404, IDOR), CRUD + kalıcılık, BIO-13 (Tümünü Sil beklenen
 * sayı 400/409/200), BIO-19 (kategori 1000+), BIO-18 (NULL block_type yönetimi + evidence
 * koruması), P3 (geçersiz uuid → 404, blok updated_at), BIO-01 (1.250 bloklu çakra Word
 * raporu eksiksiz; max-rows < sayfa → rapor reddi), Android Word 403.
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { SERVICE_KEY, ANON_KEY, startBioTestEnv, seedBio, type BioSeed } from "./bioTestEnv";
import { harness } from "./fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const H = harness("bioenergy-presale-final/routes");
type Auth = { id: string; token: string } | null;
type Json = Record<string, unknown>;
const BASE = "http://localhost/api/biyoenerji";

function req(url: string, method: string, auth: Auth, body?: unknown, ua?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) { headers["x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  if (ua) headers["user-agent"] = ua;
  return new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
async function j(res: Response): Promise<Json> { try { return (await res.clone().json()) as Json; } catch { return {}; } }

(async () => {
  const env = await startBioTestEnv({ port: 54472, dirName: "bio-presale-routes-pgdata", maxRows: 1000 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed: BioSeed = await seedBio(env.su);
  const A = seed.users.A, B = seed.users.B;
  try {
    const list = await import("../../app/api/biyoenerji/[resource]/route");
    const one = await import("../../app/api/biyoenerji/[resource]/[id]/route");
    const blocks = await import("../../app/api/biyoenerji/chakra-blocks/route");
    const blockOne = await import("../../app/api/biyoenerji/chakra-blocks/[id]/route");
    const reorder = await import("../../app/api/biyoenerji/chakra-blocks/reorder/route");
    const chakraReport = await import("../../app/api/biyoenerji/chakra-report/route");
    const subReport = await import("../../app/api/biyoenerji/subconscious-report/route");

    // ── Auth katmanı ───────────────────────────────────────────────
    let r = await list.GET(req(`${BASE}/sessions?count=1`, "GET", null), ctx({ resource: "sessions" }));
    H.ok(r.status === 401, `oturumsuz → 401 (${r.status})`);
    r = await list.GET(req(`${BASE}/sessions?count=1`, "GET", { id: A.id, token: "zz-sahte" }), ctx({ resource: "sessions" }));
    H.ok(r.status === 401, `sahte token → 401 (${r.status})`);
    r = await list.GET(req(`${BASE}/sessions?count=1`, "GET", { id: B.id, token: A.token }), ctx({ resource: "sessions" }));
    H.ok(r.status === 403, `x-user-id/token uyuşmazlığı → 403 (${r.status})`);
    r = await list.GET(req(`${BASE}/sessions?count=1`, "GET", seed.users.NOMOD), ctx({ resource: "sessions" }));
    H.ok(r.status === 403, `modül izni yok → 403 (${r.status})`);
    r = await list.GET(req(`${BASE}/sessions?count=1`, "GET", seed.users.PENDING), ctx({ resource: "sessions" }));
    H.ok(r.status === 403, `onay bekleyen → 403 (${r.status})`);
    r = await list.GET(req(`${BASE}/__proto__?count=1`, "GET", A), ctx({ resource: "__proto__" }));
    H.ok(r.status === 404, `whitelist dışı kaynak → 404 (${r.status})`);

    // ── CRUD + kalıcılık + tenant ──────────────────────────────────
    const title = "ZZ_TEST_BIYO_ALPHA Seans ÇĞİÖŞÜı 🌿";
    r = await list.POST(req(`${BASE}/sessions`, "POST", A, { title, content: "Satır 1\nSatır 2 <script>x</script>", note: "Not ✨", tenant_id: seed.TB }), ctx({ resource: "sessions" }));
    const created = (await j(r)).row as Json;
    H.ok(r.status === 200 && created?.tenant_id === seed.TA, `oluştur → tenant SUNUCUDA A (body tenant_id=B yok sayıldı)`);
    const sid = String(created.id);
    const db = await env.su.query(`select * from bioenergy_sessions where id=$1`, [sid]);
    H.ok(db.rows[0]?.content === "Satır 1\nSatır 2 <script>x</script>" && db.rows[0]?.note === "Not ✨", "DB kalıcılığı: satır sonu + emoji + metin aynen");
    r = await list.POST(req(`${BASE}/sessions`, "POST", A, { title: "   " }), ctx({ resource: "sessions" }));
    H.ok(r.status === 400, `boşluk başlık → 400 (${r.status})`);
    r = await one.PATCH(req(`${BASE}/sessions/${sid}`, "PATCH", A, { title: title + " v2" }), ctx({ resource: "sessions", id: sid }));
    const after = await env.su.query(`select title, content from bioenergy_sessions where id=$1`, [sid]);
    H.ok(r.status === 200 && after.rows[0].title.endsWith("v2") && after.rows[0].content.startsWith("Satır 1"), "kısmi PATCH: yalnız başlık değişti, içerik korundu");
    r = await one.GET(req(`${BASE}/sessions/${sid}`, "GET", B), ctx({ resource: "sessions", id: sid }));
    H.ok(r.status === 404, `IDOR GET (B → A kaydı) → 404 (${r.status})`);
    r = await one.PATCH(req(`${BASE}/sessions/${sid}`, "PATCH", B, { title: "hack" }), ctx({ resource: "sessions", id: sid }));
    H.ok(r.status === 404, `IDOR PATCH → 404 (${r.status})`);
    r = await one.DELETE(req(`${BASE}/sessions/${sid}`, "DELETE", B), ctx({ resource: "sessions", id: sid }));
    const still = await env.su.query(`select 1 from bioenergy_sessions where id=$1`, [sid]);
    H.ok(still.rowCount === 1, "IDOR DELETE → kayıt yerinde (B silemedi)");
    r = await one.GET(req(`${BASE}/sessions/not-a-uuid`, "GET", A), ctx({ resource: "sessions", id: "not-a-uuid" }));
    H.ok(r.status === 404, `P3: geçersiz uuid → 404 (500 değil) (${r.status})`);
    r = await one.DELETE(req(`${BASE}/sessions/${sid}`, "DELETE", seed.users.DEMO), ctx({ resource: "sessions", id: sid }));
    H.ok((await env.su.query(`select 1 from bioenergy_sessions where id=$1`, [sid])).rowCount === 1, "demo hesap silemez");

    // ── BIO-13 Tümünü Sil kapsam doğrulaması ───────────────────────
    for (let i = 0; i < 5; i++) await env.su.query(`insert into bioenergy_symbols(tenant_id, symbol, category) values ($1,$2,$3)`, [seed.TA, `ZZ A${i}`, i < 2 ? "Kuş" : "Ağaç"]);
    await env.su.query(`insert into bioenergy_symbols(tenant_id, symbol) values ($1,'ZZ B0')`, [seed.TB]);
    r = await list.DELETE(req(`${BASE}/symbols`, "DELETE", A, { all: true }), ctx({ resource: "symbols" }));
    H.ok(r.status === 400 && (await env.su.query(`select count(*)::int n from bioenergy_symbols where tenant_id=$1`, [seed.TA])).rows[0].n === 5, `expectedCount yok → 400, hiçbir şey silinmedi (${r.status})`);
    r = await list.DELETE(req(`${BASE}/symbols`, "DELETE", A, { all: true, expectedCount: 2 }), ctx({ resource: "symbols" }));
    H.ok(r.status === 409 && (await env.su.query(`select count(*)::int n from bioenergy_symbols where tenant_id=$1`, [seed.TA])).rows[0].n === 5, `onaylanan (2, filtreli görünüm) ≠ toplam (5) → 409, hiçbir şey silinmedi (${r.status})`);
    r = await list.DELETE(req(`${BASE}/symbols`, "DELETE", A, { all: true, expectedCount: 5 }), ctx({ resource: "symbols" }));
    const leftA = (await env.su.query(`select count(*)::int n from bioenergy_symbols where tenant_id=$1`, [seed.TA])).rows[0].n;
    const leftB = (await env.su.query(`select count(*)::int n from bioenergy_symbols where tenant_id=$1`, [seed.TB])).rows[0].n;
    H.ok(r.status === 200 && (await j(r)).deleted === 5 && leftA === 0 && leftB === 1, `doğru toplam → A'nın 5 kaydı silindi, B'nin kaydı sağlam`);
    r = await list.DELETE(req(`${BASE}/symbols`, "DELETE", A, { ids: ["not-uuid", randomUUID()] }), ctx({ resource: "symbols" }));
    H.ok(r.status === 200, `seçili silmede geçersiz id filtrelenir (500 yok) (${r.status})`);

    // ── BIO-19 kategori listesi > 1000 satır ───────────────────────
    await env.su.query(`insert into bioenergy_subconscious_causes(tenant_id, title, category) select $1, 'ZZ '||g, 'K'||lpad(g::text,4,'0') from generate_series(1,1300) g`, [seed.TA]);
    r = await list.GET(req(`${BASE}/subconscious-causes?distinct=category`, "GET", A), ctx({ resource: "subconscious-causes" }));
    const cats = ((await j(r)).categories as string[]) ?? [];
    H.ok(cats.length === 1300 && cats.includes("K1300"), `kategori listesi 1300/1300 (max-rows 1000'de kesilmez) (${cats.length})`);
    r = await list.GET(req(`${BASE}/subconscious-causes?count=1`, "GET", A), ctx({ resource: "subconscious-causes" }));
    H.ok((await j(r)).count === 1300, "sayım 1300");

    // ── BIO-01 Word raporu: Bilinçaltı 1300 kayıt (max-rows 1000) ──
    r = await subReport.POST(req(`${BASE}/subconscious-report`, "POST", A, { exportMode: "all" }));
    H.ok(r.status === 200, `bilinçaltı Word 1300 kayıt → 200 (${r.status})`);
    if (r.status === 200) {
      const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
      const xml = await zip.file("word/document.xml")!.async("string");
      H.ok(xml.includes("ZZ 1300") && xml.includes("ZZ 1001") && xml.includes("ZZ 1"), "rapor 1000. kayıttan sonrakileri de içerir (ZZ 1001, ZZ 1300)");
    }
    r = await subReport.POST(req(`${BASE}/subconscious-report`, "POST", A, { exportMode: "all" }, "Mozilla/5.0 (Linux; Android 14; wv)"));
    H.ok(r.status === 403, `Android UA → Word 403 korunur (${r.status})`);

    // ── Çakra + bloklar: BIO-01 / BIO-18 / updated_at ──────────────
    const ch = (await env.su.query(`insert into bioenergy_chakras(tenant_id, name, stones) values ($1,'ZZ Kök','Hematit') returning id`, [seed.TA])).rows[0].id as string;
    await env.su.query(`update bioenergy_chakras set sanskrit_name='Muladhara', element='Toprak', location='Omurga', bija_mantra='LAM' where id=$1`, [ch]);
    await env.su.query(
      `insert into bioenergy_chakra_blocks(tenant_id, chakra_id, section_key, block_type, sort_order, editorial_explanation)
       select $1, $2, 'genel-bakis', 'overview', g*10, 'ZZBLK'||lpad(g::text,4,'0') from generate_series(1,1250) g`, [seed.TA, ch]);
    const nullBlk = (await env.su.query(`insert into bioenergy_chakra_blocks(tenant_id, chakra_id, section_key, block_type, sort_order, editorial_explanation, updated_at) values ($1,$2,'genel-bakis',NULL,99999,'ZZ LEGACY NULL', now() - interval '1 day') returning id`, [seed.TA, ch])).rows[0].id as string;
    const evBlk = (await env.su.query(`insert into bioenergy_chakra_blocks(tenant_id, chakra_id, section_key, block_type, sort_order, source_title) values ($1,$2,'notlar-kaynaklar','source-evidence',1,'Kaynak') returning id`, [seed.TA, ch])).rows[0].id as string;

    r = await chakraReport.POST(req(`${BASE}/chakra-report`, "POST", A, { exportMode: "single", chakraId: ch }));
    H.ok(r.status === 200, `çakra Word (1.251 görünür blok) → 200 (${r.status})`);
    if (r.status === 200) {
      const xml = await (await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()))).file("word/document.xml")!.async("string");
      const n = (xml.match(/ZZBLK\d{4}/g) ?? []).length;
      H.ok(n === 1250, `rapordaki blok sayısı ${n}/1250 (eski kod 1000'de keserdi)`);
      H.ok(xml.includes("ZZ LEGACY NULL"), "NULL tipli legacy blok rapora dahil");
      H.ok(xml.includes("Muladhara") && xml.includes("LAM") && xml.includes("Toprak") && xml.includes("Omurga"), "Word: sanskritçe ad / element / konum / bija mantra");
      H.ok(xml.includes("Hematit"), "Word: Ek Bilgiler (Taşlar) zengin çakrada da raporlanır");
      H.ok(!xml.includes("Kaynak UID"), "Word: 'Kaynak UID' jargonu yok");
    }
    env.setMaxRows(300); // sunucu max-rows < sayfa boyutu (500) → eksik okuma
    r = await chakraReport.POST(req(`${BASE}/chakra-report`, "POST", A, { exportMode: "single", chakraId: ch }));
    H.ok(r.status === 500 && /eksiksiz okunamadı/.test(String((await j(r)).error)), `eksik blok okuma → rapor REDDEDİLİR, sessiz eksik rapor yok (${r.status})`);
    env.setMaxRows(1000);

    r = await blocks.GET(req(`${BASE}/chakra-blocks?chakraId=${ch}`, "GET", A));
    const blkList = ((await j(r)).blocks as Json[]) ?? [];
    H.ok(blkList.some((b) => b.id === nullBlk), "NULL tipli blok editör listesinde görünür");
    r = await blockOne.PATCH(req(`${BASE}/chakra-blocks/${nullBlk}`, "PATCH", A, { editorial_explanation: "ZZ LEGACY NULL düzenlendi" }), ctx({ id: nullBlk }));
    const nb = (await env.su.query(`select editorial_explanation, updated_at, block_type from bioenergy_chakra_blocks where id=$1`, [nullBlk])).rows[0];
    H.ok(r.status === 200 && nb.editorial_explanation.endsWith("düzenlendi"), `BIO-18: NULL tipli blok düzenlenir (önceden 404) (${r.status})`);
    H.ok(Date.now() - new Date(nb.updated_at).getTime() < 60_000, "P3: blok PATCH updated_at'i günceller");
    H.ok(nb.block_type === null, "BIO-18: düzenleme NULL tipi körlemesine dönüştürmez");
    r = await reorder.PATCH(req(`${BASE}/chakra-blocks/reorder`, "PATCH", A, { chakraId: ch, items: [{ id: nullBlk, sort_order: 5 }] }));
    H.ok(r.status === 200 && (await j(r)).updated === 1, `BIO-18: NULL tipli blok sıralanır (${r.status})`);
    r = await blockOne.PATCH(req(`${BASE}/chakra-blocks/${evBlk}`, "PATCH", A, { editorial_explanation: "x" }), ctx({ id: evBlk }));
    H.ok(r.status === 404, `kaynak-kanıt bloğu hâlâ düzenlenemez (${r.status})`);
    r = await blockOne.DELETE(req(`${BASE}/chakra-blocks/${evBlk}`, "DELETE", A), ctx({ id: evBlk }));
    H.ok(r.status === 404 && (await env.su.query(`select 1 from bioenergy_chakra_blocks where id=$1`, [evBlk])).rowCount === 1, "kaynak-kanıt bloğu silinemez");
    r = await blockOne.DELETE(req(`${BASE}/chakra-blocks/${nullBlk}`, "DELETE", B), ctx({ id: nullBlk }));
    H.ok(r.status === 404, "IDOR: B, A'nın bloğunu silemez");
    r = await blockOne.DELETE(req(`${BASE}/chakra-blocks/${nullBlk}`, "DELETE", A), ctx({ id: nullBlk }));
    H.ok(r.status === 200 && (await env.su.query(`select 1 from bioenergy_chakra_blocks where id=$1`, [nullBlk])).rowCount === 0, "BIO-18: NULL tipli blok silinir");
    r = await blockOne.PATCH(req(`${BASE}/chakra-blocks/xyz`, "PATCH", A, { editorial_explanation: "x" }), ctx({ id: "xyz" }));
    H.ok(r.status === 404, "P3: geçersiz blok id → 404");
    r = await blocks.GET(req(`${BASE}/chakra-blocks?chakraId=bad`, "GET", A));
    H.ok(r.status === 404, "P3: geçersiz chakraId → 404 (500 değil)");

    // BIO-05 sunucu: eski alanlar kısmi PATCH ile güncellenir (Taşlar → Doğaltaş eşleşmesi)
    r = await one.PATCH(req(`${BASE}/chakras/${ch}`, "PATCH", A, { stones: "Hematit, Siyah Turmalin" }), ctx({ resource: "chakras", id: ch }));
    const c2 = (await env.su.query(`select name, stones, sanskrit_name from bioenergy_chakras where id=$1`, [ch])).rows[0];
    H.ok(r.status === 200 && c2.stones === "Hematit, Siyah Turmalin" && c2.name === "ZZ Kök" && c2.sanskrit_name === "Muladhara", "BIO-05: Taşlar kısmi PATCH; diğer alanlar korunur");

    // Kaskad: çakra silinince yalnız kendi blokları gider
    const otherCh = (await env.su.query(`insert into bioenergy_chakras(tenant_id, name) values ($1,'ZZ Diğer') returning id`, [seed.TA])).rows[0].id;
    await env.su.query(`insert into bioenergy_chakra_blocks(tenant_id, chakra_id, section_key, editorial_explanation) values ($1,$2,'genel-bakis','diğer')`, [seed.TA, otherCh]);
    r = await one.DELETE(req(`${BASE}/chakras/${ch}`, "DELETE", A), ctx({ resource: "chakras", id: ch }));
    const remaining = (await env.su.query(`select chakra_id from bioenergy_chakra_blocks where tenant_id=$1`, [seed.TA])).rows;
    H.ok(r.status === 200 && remaining.length === 1 && remaining[0].chakra_id === otherCh, "çakra silme → yalnız o çakranın blokları kaskad silinir");
    H.ok(env.stats.maxReturned <= 1000, `hiçbir yanıt max-rows'u aşmadı (en çok ${env.stats.maxReturned})`);
  } finally {
    await env.stop();
  }
  H.done();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });

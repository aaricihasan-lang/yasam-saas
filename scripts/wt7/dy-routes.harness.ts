/**
 * WT7 — Danışan Yolculuğu GERÇEK route + GERÇEK Postgres entegrasyon harness'ı (prod'a SIFIR temas; ZZ_*).
 *
 * M) Migration: eski satır NULL kalır (tahmin yok) · CHECK · kısmi index · RLS korunur · idempotent
 * P) Ücret API: POST'ta ödeme durumu zorunlu · PATCH Ödenmedi→Ödendi kalıcı · geçersiz değer 400 ·
 *    başka alan düzenlemesi durumu bozmaz · tenant izolasyonu (IDOR) · demo yazamaz
 * U) Rozet aggregate (/api/clients/charges-unpaid): yalnız 'unpaid'; NULL/paid sayılmaz; ödenince kalkar;
 *    tenant izolasyonu; >1000 satır sayfalı (kesilme yok); tek istek (N+1 yok)
 * W) Toplu Word: boş seçim 400 · geçersiz id 400 · başka tenant id 409 (sızıntı yok) · "all" yalnız kendi
 *    tenant'ı · seçim sırası · tekli rapor gövdesi BİREBİR toplu dosyada (gerçek veri) · sınır 413 ·
 *    >1000 alt satır (randevu) kesilmeden · Android engeli · akış (stream) yanıtı
 * Çalıştır: npx tsx scripts/wt7/dy-routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, startDyTestEnv, seedDyUser, seedRichClient, applyPaymentMigration, type DyUser } from "./dyTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { wellnessNote } from "../../lib/docx/reportDisclaimer";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("wt7/dy-routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d)), done: () => H0.done() };
type Json = Record<string, unknown>;
function req(url: string, method: string, u: DyUser, body?: unknown, extra: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
async function docText(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
}

(async () => {
  const env = await startDyTestEnv({ port: 54493, dirName: "wt7-dy-routes-pgdata", withPaymentMigration: false });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    // ── M) Migration ───────────────────────────────────────────────────────
    const A = await seedDyUser(su, "A");
    const B = await seedDyUser(su, "B");
    const D = await seedDyUser(su, "DEMO", { demo: true });
    const legacyClient = (await su.query(`insert into public.clients(tenant_id, ad, soyad) values ($1,'ZZ_Eski','Kayıt') returning id`, [A.tenant])).rows[0].id as string;
    const legacyCharge = (await su.query(`insert into public.client_charges(tenant_id, client_id, category, detail, amount) values ($1,$2,'other','Eski ürün',250) returning id`, [A.tenant, legacyClient])).rows[0].id as string;
    await applyPaymentMigration(su);
    await applyPaymentMigration(su); // idempotent
    const col = (await su.query(`select is_nullable, column_default from information_schema.columns where table_name='client_charges' and column_name='payment_status'`)).rows[0];
    H.ok(col?.is_nullable === "YES" && col?.column_default === null, "M: payment_status NULLABLE + DEFAULT YOK", col);
    H.ok((await su.query(`select payment_status from client_charges where id=$1`, [legacyCharge])).rows[0].payment_status === null, "M: eski kayıt NULL kaldı (Ödendi/Ödenmedi tahmini YOK)");
    let bad = "";
    try { await su.query(`update client_charges set payment_status='maybe' where id=$1`, [legacyCharge]); } catch (e) { bad = String((e as { code?: string }).code); }
    H.ok(bad === "23514", "M: CHECK geçersiz değeri reddeder (23514)", bad);
    H.ok((await su.query(`select indexdef from pg_indexes where indexname='client_charges_unpaid_idx'`)).rows[0]?.indexdef?.includes("WHERE (payment_status = 'unpaid'::text)"), "M: kısmi unpaid index");
    H.ok((await su.query(`select relrowsecurity from pg_class where oid='public.client_charges'::regclass`)).rows[0].relrowsecurity === true, "M: RLS açık kaldı");
    H.ok((await su.query(`select count(*)::int n from pg_constraint where conname='client_charges_payment_status_check'`)).rows[0].n === 1, "M: CHECK tek (idempotent)");
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);

    const charges = await import("../../app/api/clients/[id]/charges/route");
    const unpaidR = await import("../../app/api/clients/charges-unpaid/route");
    const bulk = await import("../../app/api/clients/word-report-bulk/route");
    const single = await import("../../app/api/clients/[id]/word-report/route");

    // ── P) Ücret API ───────────────────────────────────────────────────────
    const ca = await seedRichClient(su, A.tenant, 1, { charges: [] });
    const cb = await seedRichClient(su, B.tenant, 2, { charges: [] });
    let r = await charges.POST(req(`/api/clients/${ca}/charges`, "POST", A, { category: "session", amount: 1500 }), ctx(ca));
    H.ok(r.status === 400 && /Ödeme durumunu/.test(String((await j(r)).error)), "P: POST ödeme durumu yok → 400 (açık seçim zorunlu)");
    r = await charges.POST(req(`/api/clients/${ca}/charges`, "POST", A, { category: "session", amount: 1500, payment_status: "maybe" }), ctx(ca));
    H.ok(r.status === 400, "P: POST geçersiz durum → 400");
    r = await charges.POST(req(`/api/clients/${ca}/charges`, "POST", A, { category: "session", amount: 1500, payment_status: "unpaid" }), ctx(ca));
    let jb = await j(r);
    const ch1 = (jb.charge as Json)?.id as string;
    H.ok(r.status === 200 && (jb.charge as Json)?.payment_status === "unpaid", "P: POST unpaid kaydedildi");
    r = await charges.POST(req(`/api/clients/${ca}/charges`, "POST", A, { category: "other", detail: "Krem", amount: 350, payment_status: "paid" }), ctx(ca));
    const ch2 = ((await j(r)).charge as Json)?.id as string;
    H.ok(r.status === 200 && ch2, "P: POST paid kaydedildi");
    r = await charges.PATCH(req(`/api/clients/${ca}/charges`, "PATCH", A, { id: ch1, payment_status: "paid" }), ctx(ca));
    H.ok(r.status === 200 && (await su.query(`select payment_status from client_charges where id=$1`, [ch1])).rows[0].payment_status === "paid", "P: PATCH Ödenmedi → Ödendi KALICI (DB)");
    r = await charges.PATCH(req(`/api/clients/${ca}/charges`, "PATCH", A, { id: ch1, payment_status: null }), ctx(ca));
    H.ok(r.status === 400, "P: PATCH null → 400 (bilinmeyene geri dönüş yok)");
    r = await charges.PATCH(req(`/api/clients/${ca}/charges`, "PATCH", A, { id: ch1, payment_status: "unpaid" }), ctx(ca));
    r = await charges.PATCH(req(`/api/clients/${ca}/charges`, "PATCH", A, { id: ch1, note: "yalnız not", amount: 1600 }), ctx(ca));
    H.ok(r.status === 200 && (await su.query(`select payment_status from client_charges where id=$1`, [ch1])).rows[0].payment_status === "unpaid", "P: başka alan düzenlemesi ödeme durumunu bozmaz");
    r = await charges.PATCH(req(`/api/clients/${legacyClient}/charges`, "PATCH", A, { id: legacyCharge, note: "eski düzenlendi" }), ctx(legacyClient));
    H.ok(r.status === 200 && (await su.query(`select payment_status from client_charges where id=$1`, [legacyCharge])).rows[0].payment_status === null, "P: eski kayıt düzenlenince durum NULL kalır (tahmin yazılmaz)");
    r = await charges.PATCH(req(`/api/clients/${ca}/charges`, "PATCH", B, { id: ch1, payment_status: "paid" }), ctx(ca));
    H.ok(r.status === 403, "P: B, A'nın danışanına PATCH → 403");
    r = await charges.PATCH(req(`/api/clients/${cb}/charges`, "PATCH", B, { id: ch1, payment_status: "paid" }), ctx(cb));
    H.ok(r.status === 404 && (await su.query(`select payment_status from client_charges where id=$1`, [ch1])).rows[0].payment_status === "unpaid", "P: B kendi danışanı + A'nın ücret id'si → 404, A'nın kaydı DEĞİŞMEDİ");
    r = await charges.POST(req(`/api/clients/${ca}/charges`, "POST", B, { category: "session", amount: 1, payment_status: "paid" }), ctx(ca));
    H.ok(r.status === 403, "P: B, A'nın danışanına POST → 403");
    const dc = await seedRichClient(su, D.tenant, 3, { charges: ["unpaid"] });
    r = await charges.POST(req(`/api/clients/${dc}/charges`, "POST", D, { category: "session", amount: 1, payment_status: "paid" }), ctx(dc));
    H.ok(r.status !== 200 && (await su.query(`select count(*)::int n from client_charges where client_id=$1`, [dc])).rows[0].n === 1, "P: demo hesap yazamaz", r.status);

    // ── U) Rozet aggregate ─────────────────────────────────────────────────
    const before = env.stats.requests;
    r = await unpaidR.GET(req("/api/clients/charges-unpaid", "GET", A));
    jb = await j(r);
    let up = jb.unpaid as Record<string, { count: number; total: number }>;
    H.ok(r.status === 200 && up[ca]?.count === 1 && up[ca]?.total === 1600, "U: A'nın ödenmemiş özeti (1 kayıt · 1600)", up);
    H.ok(!up[legacyClient], "U: eski/NULL kayıt rozet ÜRETMEZ");
    H.ok(!up[cb] && !up[dc], "U: başka tenant'ın rozetleri A'ya görünmez");
    H.ok(env.stats.requests - before <= 4, "U: tek aggregate okuma (N+1 yok)", env.stats.requests - before);
    await charges.PATCH(req(`/api/clients/${ca}/charges`, "PATCH", A, { id: ch1, payment_status: "paid" }), ctx(ca));
    up = (await j(await unpaidR.GET(req("/api/clients/charges-unpaid", "GET", A)))).unpaid as typeof up;
    H.ok(!up[ca], "U: ödendi işaretlenince rozet kalkar");
    const B2 = await seedDyUser(su, "BIG");
    const big = await seedRichClient(su, B2.tenant, 4, { charges: [] });
    await su.query(`insert into client_charges(tenant_id, client_id, category, detail, amount, payment_status)
                    select $1, $2, 'other', 'x'||g, 1, 'unpaid' from generate_series(1,1203) g`, [B2.tenant, big]);
    up = (await j(await unpaidR.GET(req("/api/clients/charges-unpaid", "GET", B2)))).unpaid as typeof up;
    H.ok(up[big]?.count === 1203 && up[big]?.total === 1203, "U: 1203 ödenmemiş satır sayfalı okunur (1000'de kesilmez)", up[big]);

    // ── W) Toplu Word ──────────────────────────────────────────────────────
    const W = await seedDyUser(su, "W");
    const ids: string[] = [];
    for (let i = 10; i < 15; i++) ids.push(await seedRichClient(su, W.tenant, i, { charges: ["paid", "unpaid", null] }));
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: [] }));
    H.ok(r.status === 400, "W: boş seçim → 400 (tüme düşmez)");
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected" }));
    H.ok(r.status === 400, "W: clientIds yok → 400");
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: [ids[0], "x' or 1=1"] }));
    H.ok(r.status === 400, "W: geçersiz id → 400 (sessiz eleme yok)");
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: [ids[0], ca] }));
    jb = await j(r);
    H.ok(r.status === 409 && !JSON.stringify(jb).includes("ZZ_Ayşe1"), "W: başka tenant'ın id'si → 409, veri sızmaz", jb);
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: [ca] }));
    H.ok(r.status === 404, "W: yalnız başka tenant id → 404");
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "weird" }));
    H.ok(r.status === 400, "W: bilinmeyen kapsam → 400");

    const sel = [ids[3], ids[0], ids[2]];
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: sel }));
    H.ok(r.status === 200 && r.headers.get("X-Report-Client-Count") === "3" && !r.headers.get("Content-Length") && r.body instanceof ReadableStream, "W: 3 seçili → 200, sayaç 3, akış yanıtı");
    let text = await docText(r);
    const pos = [13, 10, 12].map((n) => text.indexOf(`ZZ_Ayşe${n} Çiğdem-Işık${n}`));
    H.ok(pos.every((p) => p >= 0) && !text.includes("ZZ_Ayşe11 ") && !text.includes("ZZ_Ayşe14 "), "W: yalnız seçilenler var");
    H.ok(text.indexOf("DANIŞAN 1 / 3") < text.indexOf("ZZ_Ayşe10 Çiğdem-Işık10\n") || text.indexOf("Danışan Dizini") >= 0, "W: dizin + sıra etiketi");
    const order = [13, 10, 12].map((n) => text.indexOf(`SON_${n}_KESILMEDI`));
    H.ok(order[0]! < order[1]! && order[1]! < order[2]!, "W: seçim sırası korunur", order);
    H.ok(!text.includes("GIZLI_UZMAN_NOTU_"), "W: uzman iç notu varsayılan HARİÇ (tekli ile aynı)");
    H.ok(["Ödendi", "Ödenmedi", "Belirtilmemiş"].every((x) => text.includes(x)), "W: ödeme durumları Word'de");

    // Tekli rapor (GERÇEK route) gövdesi toplu dosyada birebir mi? (aynı gün; rapor kimliği/kapak hariç)
    const note = wellnessNote("danisan").full;
    for (const id of [ids[3], ids[0]]) {
      const sr = await single.POST(req(`/api/clients/${id}/word-report`, "POST", W, { exportMode: "full" }), ctx(id));
      const st = await docText(sr);
      const a = st.indexOf("DANIŞAN PROFİLİ");
      const b = st.lastIndexOf("Bilgilendirme", st.indexOf(note));
      const body = st.slice(a, b);
      H.ok(sr.status === 200 && a > 0 && b > a && text.includes(body), `W: tekli rapor gövdesi toplu dosyada BİREBİR (${id.slice(0, 8)}, ${body.length} krk)`);
    }

    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "all" }));
    text = await docText(r);
    H.ok(r.status === 200 && r.headers.get("X-Report-Client-Count") === "5" && [10, 11, 12, 13, 14].every((n) => text.includes(`SON_${n}_KESILMEDI`)), "W: all → tenant'ın 5 danışanı da TAM");
    H.ok(!text.includes("ZZ_Ayşe1 ") && !text.includes("ZZ_Ayşe2 ") && !text.includes("ZZ_Eski"), "W: all başka tenant içermez");
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: ids }));
    H.ok(r.status === 200 && r.headers.get("X-Report-Client-Count") === "5", "W: 5/5 seçili = all ile aynı kapsam");
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "filtered", clientIds: [ids[1]] }));
    H.ok(r.status === 200 && r.headers.get("X-Report-Client-Count") === "1", "W: eski 'filtered' istemcisi → seçilen gibi");

    // >1000 alt satır kesilmez
    await su.query(`insert into appointments(tenant_id, client_id, title, appointment_date, status)
                    select $1, $2, 'ZZ_APT_'||lpad(g::text,4,'0'), '2026-01-01'::timestamptz + (g||' hours')::interval, 'tamamlandi' from generate_series(1,1205) g`, [W.tenant, ids[4]]);
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: [ids[4]] }));
    text = await docText(r);
    const apts = new Set(Array.from(text.matchAll(/ZZ_APT_(\d{4})/g)).map((m) => m[1]));
    H.ok(r.status === 200 && apts.size === 1205, "W: 1205 randevu sayfalı okundu (1000'de kesilmedi)", apts.size);

    // Sınır: 151 seçili / tenant'ta 151 danışan → 413 açık mesaj
    const fakeIds = Array.from({ length: 101 }, () => randomUUID());
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "selected", clientIds: fakeIds }));
    jb = await j(r);
    H.ok(r.status === 413 && /en fazla 100/.test(String(jb.error)), "W: 101 seçili → 413 açık hata (kırpma yok)", jb.error);
    const L = await seedDyUser(su, "LIM");
    await su.query(`insert into clients(tenant_id, ad, soyad) select $1, 'ZZ_L'||g, 'X' from generate_series(1,101) g`, [L.tenant]);
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", L, { exportMode: "all" }));
    jb = await j(r);
    H.ok(r.status === 413 && /101/.test(String(jb.error)) && jb.limit === 100, "W: all 101 danışan → 413 (sayı + sınır mesajda)", jb);

    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", W, { exportMode: "all" }, { "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36" }));
    H.ok(r.status !== 200, "W: Android → Word engeli korunur (altyapıya dokunulmadı)", r.status);
    r = await bulk.POST(new NextRequest("http://localhost/api/clients/word-report-bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exportMode: "all" }) }));
    H.ok(r.status === 401 || r.status === 403, "W: oturumsuz → 401/403", r.status);
    r = await bulk.POST(req("/api/clients/word-report-bulk", "POST", D, { exportMode: "all" }));
    H.ok(r.status === 200, "W: demo hesap toplu Word (salt-okunur) açık kalır");
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${String((e as Error)?.stack ?? e).slice(0, 600)}`);
  } finally {
    await env.stop();
  }
  H.done();
})();

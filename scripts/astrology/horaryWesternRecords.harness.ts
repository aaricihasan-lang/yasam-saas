/**
 * GÖKYÜZÜ ATLASI — William Lilly Horary KAYIT servisi (lib/astrology/horary/westernRecords.ts) güvenlik + davranış testleri.
 * Sahte PostgREST (scripts/astrology/fakeSupabase.ts; tekillik, danışan FK ve tavan taklidi). Gerçek PostgreSQL kısıtları
 * ayrıca scripts/astrology/pg/horary-questions.mjs ile doğrulanır. Ağ / gerçek DB / ücretli çağrı YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWesternRecords.harness.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { createFakeClient, createStore } from "./fakeSupabase";
import { getHoraryRecord, listHoraryRecords, loadHoraryForReport, patchHoraryRecord, saveHoraryRecord, HORARY_METHODOLOGY_VERSION, cleanSearch } from "@/lib/astrology/horary/westernRecords";
import { renderHoraryReport } from "@/lib/astrology/horary/westernReportService";
import { runWesternHorary } from "@/lib/astrology/horary/westernRun";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U1 = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const U2 = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
const UB = "c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5";
const CA = "11111111-1111-4111-8111-111111111111";
const CB = "33333333-3333-4333-8333-333333333333";
const store = createStore({ clients: [{ id: CA, tenant_id: TA, ad: "Ali", soyad: "Örnek" }, { id: CB, tenant_id: TB, ad: "Başka", soyad: "Tenant" }] });
store.disableRateLimit = true;
const db = createFakeClient(store);
const me = { db, tenantId: TA, userId: U1 };
const colleague = { db, tenantId: TA, userId: U2 };
const otherTenant = { db, tenantId: TB, userId: UB };
const base = { date: "2026-10-29", time: "14:30", locationId: "tr-34-istanbul", quesitedHouse: 7 };
const Q = "Bu ortaklık teklifi gerçekleşir mi?";
const rows = () => store.tables.astro_horary_questions ?? [];
type Rec = { id: string; clientId: string | null; clientLabel: string | null; title: string; methodologyVersion: string };

async function main() {
  let id1 = "";
  let id2 = "";
  await t("K1 danışansız kayıt → 201; soru metni VARSAYILAN olarak SAKLANMAZ (question gönderilse bile saveQuestion yok); yöntem sürümü + ekol + orb", async () => {
    const r = await saveHoraryRecord(me, { ...base, title: "Ortaklık", question: Q, saveRequestId: randomUUID() });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const rec = r.body.record as Rec;
    id1 = rec.id;
    const row = rows().find((x) => x.id === id1)!;
    assert.equal(row.question_text, null);
    assert.equal(row.client_id, null);
    assert.equal(row.tenant_id, TA);
    assert.equal(row.owner_user_id, U1);
    assert.deepEqual([row.school, row.methodology_version, row.orb_variant, row.snapshot_schema], ["lilly_1647", HORARY_METHODOLOGY_VERSION, "lilly_ca107_primary", 1]);
    assert.ok(!JSON.stringify(row.result_snapshot).includes("ortaklık teklifi"), "soru metni anlık görüntüye de girmemeli");
  });

  await t("K2 danışan bağlı kayıt + AÇIK izinle soru metni saklanır", async () => {
    const r = await saveHoraryRecord(me, { ...base, quesitedHouse: 10, title: "Meslek", clientId: CA, saveQuestion: true, question: Q, saveRequestId: randomUUID() });
    assert.equal(r.status, 201);
    const rec = r.body.record as Rec;
    id2 = rec.id;
    assert.deepEqual([rec.clientId, rec.clientLabel], [CA, "Ali Örnek"]);
    assert.equal(rows().find((x) => x.id === id2)!.question_text, Q);
  });

  await t("K3 soru metni > 500 → 400; saveQuestion + boş metin → 400; başlık yok → 400", async () => {
    assert.equal((await saveHoraryRecord(me, { ...base, title: "x", saveQuestion: true, question: "q".repeat(501), saveRequestId: randomUUID() })).status, 400);
    assert.equal((await saveHoraryRecord(me, { ...base, title: "x", saveQuestion: true, question: "  ", saveRequestId: randomUUID() })).status, 400);
    assert.equal((await saveHoraryRecord(me, { ...base, title: "   ", saveRequestId: randomUUID() })).status, 400);
  });

  await t("K4 başka tenant'ın danışanı ve var olmayan danışan → AYNI yanıt (400 CLIENT_NOT_FOUND), kayıt oluşmaz", async () => {
    const n = rows().length;
    const a = await saveHoraryRecord(me, { ...base, title: "x", clientId: CB, saveRequestId: randomUUID() });
    const b = await saveHoraryRecord(me, { ...base, title: "x", clientId: randomUUID(), saveRequestId: randomUUID() });
    assert.deepEqual([a.status, a.body.code, b.status, b.body.code, a.body.error], [400, "CLIENT_NOT_FOUND", 400, "CLIENT_NOT_FOUND", b.body.error]);
    assert.equal(rows().length, n);
  });

  await t("K5 aynı saveRequestId iki kez (ardışık + eşzamanlı) → tek kayıt, ikinci yanıt reused", async () => {
    const req = randomUUID();
    const n = rows().length;
    const [x, y] = await Promise.all([saveHoraryRecord(me, { ...base, title: "Çift", saveRequestId: req }), saveHoraryRecord(me, { ...base, title: "Çift", saveRequestId: req })]);
    const z = await saveHoraryRecord(me, { ...base, title: "Çift", saveRequestId: req });
    assert.equal(rows().length, n + 1);
    assert.ok([x, y, z].every((r) => r.status === 200 || r.status === 201));
    assert.equal(z.body.reused, true);
    assert.equal((x.body.record as Rec).id, (z.body.record as Rec).id);
  });

  await t("K6 sunucu, istemcinin gönderdiği sonucu KABUL ETMEZ: sahte result / chart alanları yok sayılır, anlık görüntü = sunucu hesabı", async () => {
    const fake = { chart: { cusps: [0, 0, 0] }, significators: { querent: "venus" } };
    const r = await saveHoraryRecord(me, { ...base, title: "Sahte", result: fake, result_snapshot: fake, chart: fake.chart, saveRequestId: randomUUID() });
    assert.equal(r.status, 201);
    const row = rows().find((x) => x.id === (r.body.record as Rec).id)!;
    const ref = runWesternHorary({ date: base.date, time: base.time, place: { label: "x", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 }, quesitedHouse: 7 });
    assert.ok(ref.ok);
    const snap = row.result_snapshot as { chart: { cusps: number[] }; significators: { querent: string } };
    assert.deepEqual(snap.chart.cusps.map((c) => c.toFixed(6)), ref.result.chart.cusps.map((c) => c.toFixed(6)));
    assert.equal(snap.significators.querent, ref.result.significators.querent);
  });

  await t("K7 başka UZMANIN ve başka TENANT'ın kaydı okunamaz; tahmin edilen / bozuk kimlik → 404 (aynı yanıt)", async () => {
    const r1 = await getHoraryRecord(colleague, id2);
    const r2 = await getHoraryRecord(otherTenant, id2);
    const r3 = await getHoraryRecord(me, randomUUID());
    const r4 = await getHoraryRecord(me, "../../etc");
    for (const r of [r1, r2, r3, r4]) assert.deepEqual([r.status, r.body.code], [404, "NOT_FOUND"]);
    assert.equal((await getHoraryRecord(me, id2)).status, 200);
  });

  await t("K8 izinsiz müdahale: başka uzman PATCH → 404 ve kayıt değişmez; sonuç / soru / sahip alanı PATCH → 400; başka tenant danışanı bağlama → 400", async () => {
    const before = JSON.stringify(rows().find((x) => x.id === id2));
    assert.equal((await patchHoraryRecord(colleague, id2, { title: "ele geçirildi" })).status, 404);
    assert.equal((await patchHoraryRecord(otherTenant, id2, { clientId: null })).status, 404);
    for (const body of [{ result_snapshot: {} }, { questionText: "x" }, { owner_user_id: U2 }, { title: "ok", methodology_version: "x" }]) assert.equal((await patchHoraryRecord(me, id2, body)).status, 400, JSON.stringify(body));
    assert.equal((await patchHoraryRecord(me, id2, { clientId: CB })).status, 400);
    assert.equal(JSON.stringify(rows().find((x) => x.id === id2)), before);
  });

  await t("K9 izinli güncelleme: başlık + danışan bağlantısını kaldırma / yeniden bağlama", async () => {
    const a = await patchHoraryRecord(me, id2, { title: "Meslek değişikliği", clientId: null });
    assert.equal(a.status, 200);
    assert.deepEqual([(a.body.record as Rec).title, (a.body.record as Rec).clientId], ["Meslek değişikliği", null]);
    const b = await patchHoraryRecord(me, id2, { clientId: CA });
    assert.equal((b.body.record as Rec).clientLabel, "Ali Örnek");
  });

  await t("K10 kayıtlı harita yeniden açılır: anlık görüntü + yöntem sürümü; motor değişse de kayıtlı sonuç KORUNUR (yeniden hesap yok)", async () => {
    // Motor sürümü değişikliğini taklit: kayıttaki anlık görüntü bugünkü hesaptan farklı bir değer taşıyor.
    const row = rows().find((x) => x.id === id1)!;
    const snap = row.result_snapshot as { chart: { cusps: number[] } };
    snap.chart.cusps[0] = 123.456789;
    row.methodology_version = "lilly-1647@horary-western-ESKI";
    const r = await getHoraryRecord(me, id1);
    assert.equal(r.status, 200);
    assert.equal((r.body.result as { chart: { cusps: number[] } }).chart.cusps[0], 123.456789);
    assert.equal((r.body.record as Rec).methodologyVersion, "lilly-1647@horary-western-ESKI");
  });

  await t("K11 arşiv: yalnız kendi kayıtları; başlık araması (büyük/küçük harf), tarih ve danışan filtresi, sayfalama (hasMore)", async () => {
    await saveHoraryRecord(colleague, { ...base, title: "Meslektaşın kaydı", saveRequestId: randomUUID() });
    await saveHoraryRecord(otherTenant, { ...base, title: "Başka tenant", saveRequestId: randomUUID() });
    for (const [d, n] of [["2026-01-15", "Kayıp yüzük"], ["2026-05-02", "Yolculuk"], ["2027-03-10", "Ev satışı"]] as const) await saveHoraryRecord(me, { ...base, date: d, title: n, saveRequestId: randomUUID() });
    const all = await listHoraryRecords(me, new URLSearchParams({ limit: "50" }));
    const recs = all.body.records as Rec[];
    assert.ok(recs.length >= 7 && recs.every((x) => x.title !== "Meslektaşın kaydı" && x.title !== "Başka tenant"));
    const s = await listHoraryRecords(me, new URLSearchParams({ q: "YÜZÜK" }));
    assert.deepEqual((s.body.records as Rec[]).map((x) => x.title), ["Kayıp yüzük"]);
    const d = await listHoraryRecords(me, new URLSearchParams({ from: "2026-05-01", to: "2026-12-31" }));
    assert.ok((d.body.records as { localDate: string }[]).every((x) => x.localDate >= "2026-05-01" && x.localDate <= "2026-12-31") && (d.body.records as Rec[]).some((x) => x.title === "Yolculuk"));
    const c = await listHoraryRecords(me, new URLSearchParams({ clientId: CA }));
    assert.deepEqual((c.body.records as Rec[]).map((x) => x.clientId), [CA]);
    const p1 = await listHoraryRecords(me, new URLSearchParams({ limit: "3", offset: "0" }));
    const p2 = await listHoraryRecords(me, new URLSearchParams({ limit: "3", offset: "3" }));
    assert.equal((p1.body.records as Rec[]).length, 3);
    assert.equal(p1.body.hasMore, true);
    assert.ok(!(p2.body.records as Rec[]).some((x) => (p1.body.records as Rec[]).some((y) => y.id === x.id)));
    const order = (all.body.records as { questionUtc: string }[]).map((x) => x.questionUtc);
    assert.deepEqual(order, [...order].sort().reverse(), "yeni → eski");
    assert.equal((await listHoraryRecords(me, new URLSearchParams({ from: "29.10.2026" }))).status, 400);
    assert.equal(cleanSearch("a%b_c*d,(e)\\"), "a b c d e");
  });

  await t("K12 kayıtlı haritadan GERÇEK Word / PDF: başlık + danışan + 'Kayıtlı sonuç' + kayıtlı anlık görüntü; soru metni yalnız saklıysa VE istenirse", async () => {
    const rec = await loadHoraryForReport(me, id2);
    assert.ok(rec.ok);
    const meta = { title: rec.title, clientLabel: rec.clientLabel, methodologyVersion: rec.methodologyVersion, savedAt: rec.savedAt };
    const txt = async (question: string | null) => {
      const d = await renderHoraryReport(rec.result, "docx", { question, demo: rec.demo, generatedAt: "2026-10-29T12:00:00Z", saved: meta });
      const z = await JSZip.loadAsync(Buffer.from(d.bytes));
      return [...(await z.file("word/document.xml")!.async("string")).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
    };
    const withQ = await txt(rec.questionText);
    assert.ok(withQ.includes("Meslek değişikliği") && withQ.includes("Ali Örnek") && withQ.includes("Kayıtlı sonuç") && withQ.includes(HORARY_METHODOLOGY_VERSION) && withQ.includes("ortaklık teklifi"));
    assert.ok(!(await txt(null)).includes("ortaklık teklifi"));
    const noQ = await loadHoraryForReport(me, id1);
    assert.ok(noQ.ok && noQ.questionText === null, "soru saklanmamışsa rapora giremez");
    const pdf = await renderHoraryReport(rec.result, "pdf", { question: null, demo: false, generatedAt: "2026-10-29T12:00:00Z", saved: meta });
    assert.equal(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1"), "%PDF-");
    assert.equal((await loadHoraryForReport(colleague, id2)).ok, false, "başka uzman raporu alamaz");
  });

  await t("K13 danışan silinmişse (DB: client_id NULL; geçiş anında satır yok) kayıt açılır, danışan etiketi güvenli biçimde boş", async () => {
    store.tables.clients = store.tables.clients.filter((c) => c.id !== CA);
    const r = await getHoraryRecord(me, id2);
    assert.equal(r.status, 200);
    assert.deepEqual([(r.body.record as Rec).clientLabel, (r.body.record as { clientMissing: boolean }).clientMissing], [null, true]);
  });

  await t("K14 kayıt tavanı (DB tetikleyici taklidi) → 409 RECORD_CAP_REACHED; başka uzman etkilenmez", async () => {
    const mine = rows().filter((x) => x.tenant_id === TA && x.owner_user_id === U1).length;
    store.dbRecordCaps = { astro_horary_questions: mine };
    const r = await saveHoraryRecord(me, { ...base, title: "Tavan", saveRequestId: randomUUID() });
    assert.deepEqual([r.status, r.body.code], [409, "RECORD_CAP_REACHED"]);
    assert.equal((await saveHoraryRecord(colleague, { ...base, title: "Meslektaş 2", saveRequestId: randomUUID() })).status, 201);
    store.dbRecordCaps = undefined;
  });

  await t("K15 soru metni günlüğe / hata metnine girmez (DB hatası anında)", async () => {
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    store.failInsert = (table: string) => (table === "astro_horary_questions" ? { code: "XX000", message: "boom" } : null);
    try {
      const r = await saveHoraryRecord(me, { ...base, title: "Hata", saveQuestion: true, question: "GİZLİ-SORU-METNİ", saveRequestId: randomUUID() });
      assert.equal(r.status, 500);
      assert.ok(!JSON.stringify(r.body).includes("GİZLİ"));
    } finally {
      console.error = orig;
      store.failInsert = undefined;
    }
    assert.ok(logs.length > 0 && logs.every((l) => !l.includes("GİZLİ")), logs.join(" | "));
  });

  console.log(`\nastrology horary-western-records (kayıt/arşiv) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});

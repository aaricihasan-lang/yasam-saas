/**
 * DY canlı denetim (2026-11-04) düzeltmeleri — saf birim + gerçek DOCX doğrulaması.
 *
 *   npx tsx scripts/dy-canli-denetim/harness.ts [--out <klasör>]
 *
 * Kapsam: M3-A/C (sunucu doğrulayıcı), C3 (dosya adı), C4 (para biçimi), C6 (Q harfi),
 * C11 (Taşlar Word fotoğrafı), C12 (Beslenme tercih/kaçınılan). DB/ağ YOK.
 */
import Module from "node:module";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { Document, Packer } from "docx";
import sharp from "sharp";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); }
}
const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
async function renderDoc(doc: Document, name: string) {
  const buf = await Packer.toBuffer(doc);
  if (OUT) writeFileSync(path.join(OUT, `${name}.docx`), buf);
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
  const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !n.endsWith("/"));
  return { text, media, drawings: (xml.match(/<w:drawing>/g) ?? []).length };
}

async function main() {
  console.log("── M3-A / M3-C: sunucu doğrulayıcı");
  const V = await import("../../lib/danisan/subRecordValidation");
  const sOnlyDate = V.validateSessionWrite({ session_date: "2026-11-04", session_type: "", duration_minutes: null, session_note: "", actions_done: "", suggestions: "", next_plan: "" }, "create");
  ok(!sOnlyDate.ok && sOnlyDate.code === "SESSION_EMPTY", "M3-A: yalnız tarihli (tamamen boş) seans → SESSION_EMPTY", sOnlyDate);
  ok(!V.validateSessionWrite({}, "create").ok, "M3-A: boş gövde → reddedilir");
  ok(!V.validateSessionWrite({ session_type: "   " }, "create").ok, "M3-A: yalnız boşluk → reddedilir");
  ok(V.validateSessionWrite({ session_date: "2026-11-04", session_type: "Refleksoloji" }, "create").ok, "M3-A: tür dolu → kabul");
  ok(V.validateSessionWrite({ session_date: "2026-11-04", duration_minutes: 45 }, "create").ok, "M3-A: yalnız süre dolu → kabul");
  ok(V.validateSessionWrite({ session_note: "not" }, "create").ok, "M3-A: yalnız not dolu → kabul");
  ok(V.validateSessionWrite({ session_date: "2026-11-05" }, "patch").ok, "M3-A: PATCH (yalnız tarih) etkilenmez");
  const durBad = V.validateSessionWrite({ session_type: "x", duration_minutes: -5 }, "create");
  ok(!durBad.ok && durBad.code === "DURATION_INVALID", "M3-A: mevcut süre kuralı korunur", durBad);

  const stNo = V.validateStoneWrite({ stone_name: "", stone_type: "Kolye", stone_date: "2026-11-04" }, "create");
  ok(!stNo.ok && stNo.code === "STONE_NAME_REQUIRED", "M3-C: adsız taş → STONE_NAME_REQUIRED", stNo);
  ok(!V.validateStoneWrite({ stone_name: "   " }, "create").ok, "M3-C: yalnız boşluk ad → reddedilir");
  ok(!V.validateStoneWrite({ stone_type: "Kolye" }, "create").ok, "M3-C: ad alanı hiç yok → reddedilir");
  ok(V.validateStoneWrite({ stone_name: "Ametist" }, "create").ok, "M3-C: ad dolu → kabul");
  ok(V.validateStoneWrite({ note: "yeni not" }, "patch").ok, "M3-C: PATCH ad göndermiyorsa etkilenmez");
  ok(!V.validateStoneWrite({ stone_name: "" }, "patch").ok, "M3-C: PATCH adı boşaltamaz");

  console.log("\n── C6: İlk Harf Q");
  const F = await import("../../lib/danisan/clientListFilter");
  ok((F.TR_ALPHABET as readonly string[]).includes("Q") && F.TR_ALPHABET.indexOf("Q" as never) === F.TR_ALPHABET.indexOf("P" as never) + 1, "C6: Q, P'den hemen sonra");
  ok(F.TR_ALPHABET.length === 30 && !(F.TR_ALPHABET as readonly string[]).includes("W") && !(F.TR_ALPHABET as readonly string[]).includes("X"), "C6: Türkçe 29 harf korunur (+Q), W/X eklenmedi");

  console.log("\n── C3 / C4 / C11: Taşlar + Ücretlendirme Word (gerçek DOCX)");
  const B = await import("../../app/api/clients/[id]/word-report/clientReportBuilder");
  const client = { id: "c1", ad: "QA Denetim", soyad: "BİR", dogum: "1990-03-15" } as never;
  const STONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const STONE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const stones = [
    { id: STONE_A, stone_name: "Ametist QA", stone_type: "Kolye", created_at: "2026-11-04T10:00:00Z", stone_date: "2026-11-04" },
    { id: STONE_B, stone_name: "Pirit QA", stone_type: "Cep", created_at: "2026-11-04T10:00:00Z", stone_date: "2026-11-03" },
  ];
  const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 120, g: 60, b: 200 } } }).jpeg().toBuffer();

  const plain = B.buildClientTabReport({ tab: "taslar", client, notes: null, rows: stones as never }, {});
  ok(/qa-denetim-bir/.test(plain.filename) && !/bi-r/.test(plain.filename), "C3: dosya adı 'qa-denetim-bir' (bi-r YOK)", plain.filename);
  const dPlain = await renderDoc(plain.doc, "taslar-fotosuz");
  const set = (images: Buffer[], total = images.length, omitted = 0, unreadable = 0) => ({ images, total, omitted, unreadable });
  const withPhotos = B.buildClientTabReport({ tab: "taslar", client, notes: null, rows: stones as never, stonePhotos: new Map([[STONE_A, set([jpeg, jpeg])], ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", set([jpeg])]]) }, {});
  const dPhotos = await renderDoc(withPhotos.doc, "taslar-fotolu");
  ok(dPhotos.drawings - dPlain.drawings === 2, "C11: yalnız raporlanan taşın 2 fotoğrafı gömülür (yabancı taş id YOK)", { plain: dPlain.drawings, photos: dPhotos.drawings });
  ok(/Fotoğraflar\n2 fotoğraf/.test(dPhotos.text) && !/Fotoğraflar/.test(dPlain.text) && !/rapora eklenmedi/.test(dPhotos.text), "C11: 'Fotoğraflar' etiketi yalnız fotoğraf varsa; eksik yoksa not yok");
  const partial = B.buildClientTabReport({ tab: "taslar", client, notes: null, rows: stones as never, stonePhotos: new Map([[STONE_A, set([jpeg, jpeg, jpeg, jpeg], 7, 2, 1)]]) }, {});
  const dPartial = await renderDoc(partial.doc, "taslar-kismi");
  ok(dPartial.drawings - dPlain.drawings === 4 && /7 fotoğraftan 4 tanesi eklendi/.test(dPartial.text), "C11: eksik varsa 'N fotoğraftan M tanesi eklendi' yazılır", dPartial.text.match(/Fotoğraflar\n[^\n]*/));
  ok(/2 fotoğraf rapor boyutu sınırı nedeniyle, 1 fotoğraf okunamadığı için rapora eklenmedi/.test(dPartial.text), "C11: eklenmeyen her fotoğraf nedeniyle AÇIKÇA yazılır (sessiz eksiltme yok)");
  const allFailed = B.buildClientTabReport({ tab: "taslar", client, notes: null, rows: stones as never, stonePhotos: new Map([[STONE_B, set([], 2, 0, 2)]]) }, {});
  const dFailed = await renderDoc(allFailed.doc, "taslar-okunamadi");
  ok(/2 fotoğraftan 0 tanesi eklendi/.test(dFailed.text) && /2 fotoğraf okunamadığı için rapora eklenmedi/.test(dFailed.text), "C11: hiçbiri okunamasa da taşın fotoğrafı olduğu raporda görünür");
  ok(dPhotos.text.includes("Ametist QA") && dPhotos.text.includes("Pirit QA"), "C11: taş metinleri korunur");
  const noMap = B.buildClientTabReport({ tab: "taslar", client, notes: null, rows: stones as never, stonePhotos: undefined }, {});
  ok((await renderDoc(noMap.doc, "taslar-undefined")).drawings === dPlain.drawings, "C11: harita verilmezse çıktı eskisiyle aynı");

  const charges = [
    { id: "ch1", charge_date: "2026-11-04", category: "session", detail: "Refleksoloji QA", note: null, amount: 1500.5, payment_status: "paid", created_at: "2026-11-04T10:00:00Z" },
    { id: "ch2", charge_date: "2026-11-03", category: "other", detail: "Tam tutar", note: null, amount: 1500, payment_status: "unpaid", created_at: "2026-11-03T10:00:00Z" },
  ];
  const ucr = B.buildClientTabReport({ tab: "ucretlendirme", client, notes: null, rows: charges as never }, {});
  const dU = await renderDoc(ucr.doc, "ucretlendirme");
  ok(dU.text.includes("1.500,50 ₺"), "C4: kuruşlu tutar '1.500,50 ₺'", dU.text.match(/[\d.,]+ ₺/g));
  ok(!/1\.500,5 ₺/.test(dU.text), "C4: eski hatalı '1.500,5 ₺' YOK");
  ok(/(^|\n)1\.500 ₺/.test(dU.text), "C4: tam tutar biçimi korunur ('1.500 ₺')");
  ok(dU.text.includes("3.000,50 ₺"), "C4: toplam '3.000,50 ₺'", dU.text.match(/[\d.,]+ ₺/g));

  console.log("\n── C11: fetchClientStonePhotos — sahiplik süzgeci + küçültme (sahte DB)");
  const RD = await import("../../app/api/clients/[id]/word-report/clientReportData");
  const T = "11111111-1111-4111-8111-111111111111";
  const CL = "22222222-2222-4222-8222-222222222222";
  const OTHER = "33333333-3333-4333-8333-333333333333";
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 200, b: 90 } } }).png().toBuffer();
  const webp = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer();
  const photoRows = [
    { stone_id: STONE_A, file_path: `${T}/${CL}/${STONE_A}/1.png` },
    { stone_id: STONE_A, file_path: `${T}/${CL}/${STONE_A}/2.webp` },
    { stone_id: STONE_A, file_path: `${OTHER}/${CL}/${STONE_A}/x.png` },        // yabancı tenant
    { stone_id: STONE_A, file_path: `${T}/${OTHER}/${STONE_A}/x.png` },        // yabancı danışan
    { stone_id: STONE_A, file_path: `${T}/${CL}/${STONE_B}/x.png` },           // başka taşın yolu
    { stone_id: STONE_A, file_path: `${T}/${CL}/${STONE_A}/../../x.png` },     // traversal
    { stone_id: STONE_B, file_path: `${T}/${CL}/${STONE_B}/missing.png` },     // depoda yok
    ...Array.from({ length: 5 }, (_, i) => ({ stone_id: STONE_B, file_path: `${T}/${CL}/${STONE_B}/${i}.png` })),
    { stone_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", file_path: `${T}/${CL}/dddddddd-dddd-4ddd-8ddd-dddddddddddd/x.png` }, // raporda olmayan taş
  ];
  const filters: Array<[string, unknown]> = [];
  const downloads: string[] = [];
  const q = {
    select() { return q; },
    eq(c: string, v: unknown) { filters.push([c, v]); return q; },
    in(c: string, v: unknown) { filters.push([c, v]); return q; },
    order() { return Promise.resolve({ data: photoRows, error: null }); },
  };
  const fakeDb = {
    from(t: string) { filters.push(["table", t]); return q; },
    storage: { from: () => ({ download: async (p: string) => {
      downloads.push(p);
      if (p.endsWith("missing.png")) return { data: null, error: { status: 404 } };
      const b = p.endsWith(".webp") ? webp : png;
      return { data: new Blob([new Uint8Array(b)]), error: null };
    } }) },
  };
  const map = await RD.fetchClientStonePhotos(fakeDb as never, T, CL, stones as never);
  ok(JSON.stringify(filters.slice(0, 4)) === JSON.stringify([["table", "client_stone_photos"], ["tenant_id", T], ["client_id", CL], ["stone_id", [STONE_A, STONE_B]]]), "C11: sorgu tenant + client + raporlanan taş id'leriyle sınırlı", filters);
  ok(downloads.every((p) => p.startsWith(`${T}/${CL}/`) && !p.includes("..")) && !downloads.some((p) => p.includes(OTHER)), "C11: yabancı tenant/danışan/traversal yolu İNDİRİLMEZ", downloads);
  ok(!downloads.includes(`${T}/${CL}/${STONE_B}/x.png`), "C11: başka taşın klasöründeki dosya o taşa eklenmez");
  const A_ = map.get(STONE_A); const B_ = map.get(STONE_B);
  ok(A_?.images.length === 2 && A_.total === 6 && A_.unreadable === 4 && A_.omitted === 0, "C11: taş A → 2 eklendi; doğrulanamayan 4 yol SAYILIR (sessiz düşmez)", A_ && { ...A_, images: A_.images.length });
  ok(B_?.images.length === 5 && B_.total === 6 && B_.unreadable === 1 && B_.omitted === 0, "C11: taş B → taş başına sınır YOK (5 eklendi), depoda olmayan 1 → okunamadı", B_ && { ...B_, images: B_.images.length });
  ok(!map.has("dddddddd-dddd-4ddd-8ddd-dddddddddddd"), "C11: raporda olmayan taşın fotoğrafı haritaya girmez");
  const metas = await Promise.all([...map.values()].flatMap((e) => e.images).map((b) => sharp(b).metadata()));
  ok(metas.every((m) => m.format === "jpeg" && Math.max(m.width ?? 0, m.height ?? 0) <= RD.STONE_REPORT_PHOTO_MAX_PX), "C11: tümü JPEG ve uzun kenar ≤ 900px", metas.map((m) => [m.format, m.width, m.height]));
  const errDb = { from: () => ({ select() { return this; }, eq() { return this; }, in() { return this; }, order: () => Promise.resolve({ data: null, error: { code: "XX000" } }) }), storage: fakeDb.storage };
  let threw = false;
  try { await RD.fetchClientStonePhotos(errDb as never, T, CL, stones as never); } catch (e) { threw = RD.isClientReportReadError(e); }
  ok(threw, "C11: tablo okuma hatası yutulmaz (DY-02 → ClientReportReadError)");
  // Rapor geneli tavan: aşan fotoğraflar 'omitted' olarak sayılır (sessiz değil).
  const many = Array.from({ length: RD.STONE_REPORT_MAX_PHOTOS + 3 }, (_, i) => ({ stone_id: STONE_A, file_path: `${T}/${CL}/${STONE_A}/m${i}.png` }));
  const capQ = { select() { return capQ; }, eq() { return capQ; }, in() { return capQ; }, order: () => Promise.resolve({ data: many, error: null }) };
  const capMap = await RD.fetchClientStonePhotos({ from: () => capQ, storage: fakeDb.storage } as never, T, CL, stones as never);
  const C_ = capMap.get(STONE_A);
  ok(C_?.images.length === RD.STONE_REPORT_MAX_PHOTOS && C_.omitted === 3 && C_.total === RD.STONE_REPORT_MAX_PHOTOS + 3, "C11: rapor geneli tavan aşılırsa fazlası 'omitted' sayılır", C_ && { ...C_, images: C_.images.length });
  const none = await RD.fetchClientStonePhotos(fakeDb as never, T, CL, []);
  ok(none.size === 0, "C11: taş yoksa sorgu/indirme yok");

  console.log("\n── C12: Beslenme Özeti tercih / kaçınılan besinler (gerçek DOCX)");
  type DS = Parameters<typeof B.buildClientFullReport>[0]["data"];
  const DATA = { client: { id: "c1", ad: "ZZ Ayşe", soyad: "Çiğdem", dogum: "1990-03-15" }, notes: { notlar: "ZZ not" }, appointments: [], stones: [], sessions: [], homeworks: [], analyses: [], charges: [] } as unknown as DS;
  const base = { profile: { goal_type: "weight_loss", daily_meal_count: 3 }, allergens: [{ name: "Yumurta", note: null }], measurements: [], measurementTotal: 0 };
  const dWith = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, beslenme: { ...base, preferences: [
    { stance: "avoided", label: "ZZ Patlıcan", note: "ZZ hazımsızlık" },
    { stance: "preferred", label: "ZZ Ispanak", note: null },
    { stance: "hack", label: "ZZ Geçersiz", note: null },
  ] } as never }, {}).doc, "beslenme-tercihli");
  ok(dWith.text.includes("Tercih Edilen / Kaçınılan Besinler"), "C12: alt başlık var");
  ok(/Tercih Edilen\nZZ Ispanak\n—/.test(dWith.text) && /Kaçınılan\nZZ Patlıcan\nZZ hazımsızlık/.test(dWith.text), "C12: durum + besin + not satırları", dWith.text.slice(dWith.text.indexOf("Tercih Edilen /"), dWith.text.indexOf("Tercih Edilen /") + 160));
  ok(dWith.text.indexOf("ZZ Ispanak") < dWith.text.indexOf("ZZ Patlıcan"), "C12: önce tercih edilenler");
  ok(!dWith.text.includes("ZZ Geçersiz"), "C12: bilinmeyen durum değeri rapora girmez");
  ok(dWith.text.includes("Beyan Edilen Alerjiler") && dWith.text.includes("Yumurta") && dWith.text.includes("Kilo Verme"), "C12: mevcut profil/alerji bölümleri korunur");
  const dWithout = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, beslenme: base as never }, {}).doc, "beslenme-tercihsiz");
  ok(!dWithout.text.includes("Tercih Edilen") && /profili, beyan edilen alerjiler ve ölçüm özetinden/.test(dWithout.text), "C12: tercih yoksa bölüm + not metni eskisiyle aynı");
  const dOnlyPref = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, beslenme: { profile: null, allergens: [], measurements: [], measurementTotal: 0, preferences: [{ stance: "preferred", label: "ZZ Elma", note: null }] } as never }, {}).doc, "beslenme-yalniz-tercih");
  ok(dOnlyPref.text.includes("ZZ Elma") && dOnlyPref.text.includes("Beslenme Özeti"), "C12: yalnız tercih varsa da bölüm üretilir");

  console.log("\n── H1: snapshot yolu + demo verisi");
  const SR = await import("../../lib/yasam-hafizasi/client/clientSearchResult");
  const HEALTH = "tansiyon_saglik_sentinel";
  const snapRow = { id: "x", tenant_id: "t", client_id: "c", source_table: "client_notes", snippet: HEALTH, unit_type: "record",
    evidence_fields: [{ origin: "saglik_notu", kind: "paragraph", text: HEALTH }, { origin: "notlar", kind: "paragraph", text: "genel not" }] };
  const stripped = SR.stripClientHealthNote(snapRow);
  ok(!JSON.stringify(stripped).includes(HEALTH) && stripped.snippet === "genel not" && stripped.client_id === "c", "H1: snapshot okumasında sağlık kanıtı + önizlemesi ayıklanır, diğer alanlar korunur", stripped);
  const other = { ...snapRow, source_table: "client_sessions" };
  ok(SR.stripClientHealthNote(other) === other, "H1: başka kaynak satırına dokunulmaz (aynı nesne)");
  const DM = await import("../../lib/demo/demoYasamHafizasi");
  const FX = await import("../../lib/demo/demoVitrinFixture");
  const demoRows = DM.demoYhTenantClientRows("a", 500);
  const healthTexts = FX.DEMO_NOTES_SEED.map((n) => n.saglik);
  ok(DM.demoYhTenantClientRows("not", 500).filter((r) => r.source_table === "client_notes").length === FX.DEMO_NOTES_SEED.length, "H1 demo: not satırları hâlâ var ('not' etiketiyle)");
  ok(!demoRows.some((r) => healthTexts.some((h) => JSON.stringify(r).includes(h))), "H1 demo: hiçbir demo sonucunda sentetik sağlık metni yok");
  ok(!DM.demoYhTenantClientRows("baş ağrısı gerilim", 500).some((r) => r.source_table === "client_notes") && !DM.demoYhTenantClientRows("sağlık", 500).some((r) => r.source_table === "client_notes"), "H1 demo: sağlık metni / 'sağlık' etiketiyle not satırı eşleşmez");

  console.log(`\nDY CANLI DENETİM HARNESS: ${pass}/${pass + fail} PASS`);
  console.log(fail === 0 ? "RESULT: PASS" : "RESULT: FAIL");
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

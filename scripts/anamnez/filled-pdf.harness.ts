/**
 * ANAMNEZ — KAYITLI (DOLU) FORM PDF HARNESS (DB/ağ yok).
 *   - 11 alan tipi + danışana özel sorular + gizli alanlar + koşullu bölüm L (açık/kapalı)
 *   - 4000 karakter uzun metin + 30 satır × 300 karakter tablo (sayfalama, başlık tekrarı)
 *   - Türkçe karakterler, danışan adı, durum rozeti (TASLAK / TAMAMLANDI), imza bloğu, alt bilgi
 *   - unpdf ile metin çıkarımı: değerler VAR, gizli cevaplar YOK, "NaN"/"undefined" YOK
 *   - Boş form çıktısı paylaşılan Writer refactor'ından ETKİLENMEDİ (normalize sha256 kilidi)
 *   - Route statik kontrolleri (guard, tenant, demo 404, rev 409, rate limit, K8)
 * Çalıştır: npx tsx scripts/anamnez/filled-pdf.harness.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBlankAnamnesisPdf } from "../../lib/danisan/anamnez/blankFormPdf";
import { buildFilledAnamnesisPdf, type FilledFormRecord } from "../../lib/danisan/anamnez/filledFormPdf";
import { displayAnswer, formatInstantIstanbul } from "../../lib/danisan/anamnez/format";
import { effectiveSections, getCatalog } from "../../lib/danisan/anamnez/schema";
import { validateAnswers, validateFormCustom } from "../../lib/danisan/anamnez/validate";
import type { Answers, FormCustom } from "../../lib/danisan/anamnez/types";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const font = readFileSync(path.join(ROOT, "public/fonts/Geist-Regular.ttf")).toString("base64");

/** jsPDF çıktısında zaman damgası + dosya kimliği dışındaki her bayt deterministiktir. */
const normHash = (b: Uint8Array) =>
  createHash("sha256")
    .update(Buffer.from(b).toString("latin1").replace(/\/CreationDate \(D:[^)]*\)/g, "").replace(/\/ID \[ <[0-9A-Fa-f]+> <[0-9A-Fa-f]+> \]/g, ""))
    .digest("hex");
const pageCount = (b: Uint8Array) => (Buffer.from(b).toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
/** Seçili kutu işareti: 1.8 mm dolu kare (5.10 pt) → içerik akışında "re" + "f". */
const markCount = (b: Uint8Array) => (Buffer.from(b).toString("latin1").match(/ 5\.10\d* -5\.10\d* re\s+f\b/g) ?? []).length;

async function pdfText(b: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(b));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text: (text as string).replace(/\s+/g, " "), pages: totalPages };
}

// ── Fixture ──────────────────────────────────────────────────────────────────
const TR_SAMPLE = "ğüşıöçİĞŞ";
const LONG = (`Uzun açıklama ${TR_SAMPLE} — gece uykusu bölünüyor, sabah yorgun kalkıyor. `).repeat(80).slice(0, 4000);
const ROW_CELL = ("Sırt üstü çok uzun açıklama şçğüöı ").repeat(12).slice(0, 300);
const ROWS = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, region: `${ROW_CELL.slice(0, 280)} #${i + 1}`, duration: `${i + 1} hafta`, intensity: i % 11, pattern: i % 2 ? "intermittent" : "continuous" }));

const CUSTOM_TEXT = "c_00000000000a";
const CUSTOM_SINGLE = "c_00000000000b";
const CUSTOM_MULTI = "c_00000000000c";
const CUSTOM_YND = "c_00000000000d";
const CUSTOM_SCALE = "c_00000000000e";
const CUSTOM_DATE = "c_00000000000f";
const CUSTOM_NUMBER = "c_000000000010";
const CUSTOM_HIDDEN = "c_000000000011";

const fcBase: FormCustom = {
  hidden: ["J.occupation", CUSTOM_HIDDEN],
  labels: { "A.reason": "Başvuru nedeni — danışanın ifadesi" },
  enabledSections: ["L"],
  custom: [
    { key: CUSTOM_TEXT, section: "A", type: "textarea", label: "Özel: Gece uyanma örüntüsü" },
    { key: CUSTOM_SINGLE, section: "M", type: "single", label: "Özel: Ağrı yönü", options: [{ key: "o1", label: "Sağ taraf" }, { key: "o2", label: "Sol taraf" }] },
    { key: CUSTOM_MULTI, section: "M", type: "multi", label: "Özel: Tetikleyiciler", options: [{ key: "o1", label: "Soğuk" }, { key: "o2", label: "Stres" }, { key: "o3", label: "Oturma" }] },
    { key: CUSTOM_YND, section: "K", type: "ynd", label: "Özel: Meditasyon deneyimi" },
    { key: CUSTOM_SCALE, section: "K", type: "scale10", label: "Özel: Motivasyon" },
    { key: CUSTOM_DATE, section: "B", type: "date", label: "Özel: Son kontrol tarihi" },
    { key: CUSTOM_NUMBER, section: "G", type: "number", label: "Özel: Günlük çay" },
    { key: CUSTOM_HIDDEN, section: "Q", type: "text", label: "Özel: Kaldırılmış soru" },
  ],
};
ok(validateFormCustom("std-v1", fcBase).ok, "fixture form farkı geçerli", validateFormCustom("std-v1", fcBase));

const answers: Answers = {
  "A.reason": LONG,                                          // textarea (4000)
  "A.duration": "m1_6",                                      // single
  "B.conditions": { v: true, d: "Hipotiroidi — İlaç kullanıyor" }, // ynd
  "C.any": false,                                            // yn
  "E.conditions": ["diabetes", "thyroid"],                   // multi
  "F.bedtime": "23:45",                                      // time
  "F.quality": 7,                                            // scale10
  "F.duration": 6.5,                                         // number (+birim)
  "L.last_period": "2026-09-01",                             // date (koşullu bölüm)
  "L.notes": "Döngü düzenli — ŞÜPHELİ_L_NOTU",              // L metni (L kapalıyken YOK)
  "M.items": ROWS,                                           // rows (30 × ~300)
  "J.occupation": "GİZLİ_MESLEK_ZZ",                         // gizli kanonik alan
  [CUSTOM_HIDDEN]: "GİZLİ_ÖZEL_ZZ",                          // gizli özel alan
  [CUSTOM_TEXT]: "Saat 03:00 civarı uyanıyor; çarşamba günleri ağırlaşıyor",
  [CUSTOM_SINGLE]: "o2",
  [CUSTOM_MULTI]: ["o1", "o3"],
  [CUSTOM_YND]: { v: false, d: "Hiç denemedi, öğrenmek istiyor" },
  [CUSTOM_SCALE]: 9,
  [CUSTOM_DATE]: "2026-08-15",
  [CUSTOM_NUMBER]: 4,
};
const va = validateAnswers("std-v1", fcBase, answers);
ok(va.ok, "fixture cevapları sunucu doğrulamasından geçiyor (11 tip + özel)", va);

const baseRecord: FilledFormRecord = {
  template_version: "std-v1",
  form_custom: fcBase,
  answers,
  status: "completed",
  assessment_date: "2026-09-28",
  completed_at: "2026-09-30T21:30:00.000Z", // İstanbul: 01.10.2026 00:30
  revision: 7,
  client_snapshot: { ad: "Çağrı Işıl", soyad: "Şükrüoğlu", dogum: "1990-03-21" },
  title: "Kış dönemi değerlendirmesi",
  kind: "initial",
};
const NOW = new Date("2026-10-01T09:05:00.000Z"); // İstanbul 12:05

async function main() {
  const catTr = getCatalog("std-v1", "tr");

  // ── 1. Boş form değişmedi ──────────────────────────────────────────────────
  section("1. Boş form çıktısı (refactor öncesi ile birebir)");
  const cfOld: FormCustom = { hidden: ["A.duration"], labels: { "A.reason": "Neden?" }, enabledSections: ["L"], custom: [{ key: "c_0011223344ab", section: "M", type: "single", label: "Özel", options: [{ key: "o1", label: "Bir" }, { key: "o2", label: "İki" }] }] };
  const blankTr = buildBlankAnamnesisPdf({ locale: "tr", version: "std-v1", formCustom: null, clientName: "Ayşe Yılmaz", fontBase64: font });
  const blankEn = buildBlankAnamnesisPdf({ locale: "en", version: "std-v1", formCustom: cfOld, clientName: null, fontBase64: font });
  ok(normHash(blankTr) === "c1b0f2dd8b01673c9c4883a071ce4cb47b465ec20e155dac1b7d1b65d2d8ba11", "TR standart boş form normalize hash = refactor öncesi", normHash(blankTr));
  ok(normHash(blankEn) === "a3986a88c6ba77ba7019a64073f1951ef48fb5aeae918abb8ec0ae284b7542c7", "EN özel boş form normalize hash = refactor öncesi", normHash(blankEn));
  ok(markCount(blankTr) === 0, "boş formda işaretli kutu YOK");

  // ── 2. Tamamlanmış kayıt (TR, L açık) ─────────────────────────────────────
  section("2. Dolu form — tamamlanmış, TR, L etkin");
  const pdf = buildFilledAnamnesisPdf({ locale: "tr", record: baseRecord, fontBase64: font, now: NOW });
  const { text, pages } = await pdfText(pdf);
  ok(Buffer.from(pdf).subarray(0, 5).toString() === "%PDF-", "PDF imzası");
  ok(Buffer.from(pdf).toString("latin1").includes("/FontFile2"), "Geist TTF gömülü");
  ok(pages >= 6 && pages === pageCount(pdf), `sayfa sayısı ≥ 6 (${pages})`);
  ok(text.includes("Çağrı Işıl Şükrüoğlu"), "danışan adı (client_snapshot)");
  ok(text.includes(TR_SAMPLE), `Türkçe karakterler "${TR_SAMPLE}"`);
  ok(text.includes("TAMAMLANDI") && !text.includes("TASLAK"), "durum rozeti TAMAMLANDI");
  ok(text.includes("28.09.2026"), "değerlendirme tarihi (DD.MM.YYYY)");
  ok(text.includes(formatInstantIstanbul(baseRecord.completed_at, "tr")) && text.includes("01.10.2026 00:30"), "tamamlanma zamanı Europe/Istanbul (UTC 21:30 → 00:30 ertesi gün)");
  ok(text.includes("Kış dönemi değerlendirmesi"), "başlık");
  ok(text.includes("std-v1 · rev 7"), "alt bilgi: std-v1 · rev N");
  ok(text.includes("Oluşturma: 01.10.2026 12:05"), "alt bilgi: oluşturma zamanı (İstanbul)");
  ok(text.includes(`Sayfa 1 / ${pages}`) && text.includes(`Sayfa ${pages} / ${pages}`), "sayfa numaraları");
  ok(text.includes("Danışan imzası") && text.includes("Uzman imzası"), "imza bloğu");
  const lastPage = await (async () => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const d = await getDocumentProxy(new Uint8Array(pdf));
    const r = await extractText(d, { mergePages: false });
    return (r.text as string[])[r.totalPages - 1].replace(/\s+/g, " ");
  })();
  ok(lastPage.includes("Danışan imzası") && lastPage.includes("Uzman imzası") && lastPage.includes("Tarih"), "imza bloğu SON sayfada");
  ok(!/\bNaN\b/.test(text) && !/\bundefined\b/.test(text) && !/\[object Object\]/.test(text), '"NaN" / "undefined" / "[object Object]" YOK');

  // Değerler
  ok(text.includes("Başvuru nedeni — danışanın ifadesi"), "başlık düzenlemesi (label override) kullanılıyor");
  const longWords = LONG.split(" ").filter((x) => x.length > 3);
  ok(text.includes(LONG.slice(0, 60)) && text.includes("sabah yorgun kalkıyor"), "4000 karakter uzun metin yazıldı");
  ok((text.match(/gece uykusu bölünüyor/g) ?? []).length >= 45, `uzun metin tamamı akıyor (tekrar sayısı ${(text.match(/gece uykusu bölünüyor/g) ?? []).length})`, longWords.length);
  ok(text.includes("Hipotiroidi — İlaç kullanıyor"), "ynd açıklama");
  ok(text.includes("23:45"), "time");
  ok(text.includes(displayAnswer(6.5, { kind: "template", key: "F.duration", field: { key: "F.duration", type: "number", unit: "hours" }, labelOverride: null, hidden: false }, "std-v1", "tr", { yes: "Evet", no: "Hayır" })), "number + birim");
  ok(text.includes("01.09.2026"), "date (L.last_period, DD.MM.YYYY)");
  ok(text.includes("Döngü düzenli"), "koşullu bölüm L etkin → yazıldı");
  ok(text.includes(catTr.sections.L.title), "L bölüm başlığı");
  ok(text.includes(catTr.options.familyConditions?.diabetes ?? "§") && text.includes(catTr.options.duration?.m1_6 ?? "§"), "single/multi seçenek etiketleri");
  ok(text.includes("Saat 03:00 civarı uyanıyor"), "özel textarea");
  ok(text.includes("Özel: Ağrı yönü") && text.includes("Sol taraf"), "özel single");
  ok(text.includes("Özel: Tetikleyiciler") && text.includes("Oturma"), "özel multi");
  ok(text.includes("Hiç denemedi, öğrenmek istiyor"), "özel ynd açıklama");
  ok(text.includes("15.08.2026"), "özel date");
  ok(text.includes("Özel: Günlük çay"), "özel number");
  // Gizli alanlar
  ok(!text.includes("GİZLİ_MESLEK_ZZ") && !text.includes("GIZLI_MESLEK_ZZ"), "gizli kanonik alan cevabı YOK");
  ok(!text.includes("GİZLİ_ÖZEL_ZZ") && !text.includes("Özel: Kaldırılmış soru"), "gizli özel alan + cevabı YOK");
  ok(!text.includes(catTr.fields["J.occupation"].label), "gizli alanın etiketi de YOK");
  // Satır tablosu
  ok(text.includes("#1") && text.includes("#30") && text.includes("30 hafta"), "30 satırın ilki ve sonuncusu yazıldı");
  const colHead = catTr.columns.intensity;
  const headCount = (text.match(new RegExp(colHead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  ok(headCount >= 2, `sayfa kırılımında tablo başlığı tekrarlandı (${headCount}×)`);
  ok(text.includes(catTr.options.painPattern?.intermittent ?? "§"), "satır single kolonu etiketli");
  // Seçim işaretleri: yn(1) + ynd(1) + single(1) + multi(2) + scale10(1) + özel single(1) + özel multi(2) + özel ynd(1) + özel scale(1)
  const expectedMarks = 1 + 1 + 1 + 2 + 1 + 1 + 2 + 1 + 1;
  ok(markCount(pdf) === expectedMarks, `seçili kutu işaretleri (${markCount(pdf)} = ${expectedMarks})`);
  // Boş alan
  ok(text.includes("—"), 'boş alanlar soluk "—"');

  // ── 3. Taslak + L kapalı + EN ─────────────────────────────────────────────
  section("3. Dolu form — taslak, L kapalı, TR + EN");
  const draftRec: FilledFormRecord = { ...baseRecord, status: "draft", completed_at: null, revision: 3, form_custom: { ...fcBase, enabledSections: [] } };
  const draft = await pdfText(buildFilledAnamnesisPdf({ locale: "tr", record: draftRec, fontBase64: font, now: NOW }));
  ok(draft.text.includes("TASLAK") && !draft.text.includes("TAMAMLANDI"), "durum rozeti TASLAK");
  ok(!draft.text.includes("ŞÜPHELİ_L_NOTU") && !draft.text.includes("01.09.2026") && !draft.text.includes(catTr.sections.L.title), "L kapalı → L bölümü ve cevapları YOK");
  ok(draft.text.includes("std-v1 · rev 3"), "taslak revizyonu");
  const en = await pdfText(buildFilledAnamnesisPdf({ locale: "en", record: baseRecord, fontBase64: font, now: NOW }));
  ok(en.text.includes("COMPLETED") && en.text.includes("Client signature") && en.text.includes("28/09/2026") && en.text.includes("Generated: 01/10/2026 12:05"), "EN metinler + tarih biçimi");
  ok(!/\bNaN\b|\bundefined\b/.test(draft.text + en.text), "taslak/EN: NaN/undefined YOK");

  // ── 4. Boş kayıt + bozuk biçimli değerler ─────────────────────────────────
  section("4. Kenar durumları");
  const emptyRec: FilledFormRecord = { ...baseRecord, answers: {}, form_custom: { hidden: [], labels: {}, enabledSections: [], custom: [] }, title: null, client_snapshot: { ad: null, soyad: null, dogum: null } };
  const emptyPdf = buildFilledAnamnesisPdf({ locale: "tr", record: emptyRec, fontBase64: font, now: NOW });
  const empty = await pdfText(emptyPdf);
  const visibleFieldCount = effectiveSections("std-v1", emptyRec.form_custom).filter((s) => !s.optional).flatMap((s) => s.fields).length;
  ok((empty.text.match(/—/g) ?? []).length >= visibleFieldCount, `tüm boş alanlar "—" (${(empty.text.match(/—/g) ?? []).length} ≥ ${visibleFieldCount})`);
  ok(markCount(emptyPdf) === 0, "boş kayıtta işaret YOK");
  ok(empty.text.includes("İlk Anamnez"), "başlık yoksa tür etiketi (İlk Anamnez)");
  const weird = { ...emptyRec, answers: { "F.quality": "x", "F.duration": Number.NaN, "B.conditions": "bozuk", "E.conditions": "diabetes", "M.items": "x", "A.duration": { a: 1 } } as unknown as Answers };
  let weirdText = "";
  try { weirdText = (await pdfText(buildFilledAnamnesisPdf({ locale: "tr", record: weird, fontBase64: font, now: NOW }))).text; } catch (e) { weirdText = `THROW ${String(e)}`; }
  ok(!weirdText.startsWith("THROW") && !/\bNaN\b|\bundefined\b|\[object Object\]/.test(weirdText), "bozuk biçimli değerler çökertmez, NaN/undefined/[object Object] üretmez", weirdText.slice(0, 120));
  const spaceless = { ...emptyRec, answers: { "A.reason": "ş".repeat(4000) } };
  const sp = buildFilledAnamnesisPdf({ locale: "tr", record: spaceless, fontBase64: font, now: NOW });
  const spText = await pdfText(sp);
  ok((spText.text.match(/ş/g) ?? []).length >= 4000, "boşluksuz 4000 karakter sarılıp tamamı yazıldı");

  // ── 5. displayAnswer (EffectiveField genelleştirmesi) ─────────────────────
  section("5. displayAnswer — özel alanlar");
  const efCustom = effectiveSections("std-v1", fcBase).flatMap((s) => s.fields).find((f) => f.key === CUSTOM_MULTI)!;
  ok(displayAnswer(["o1", "o3"], efCustom, "std-v1", "tr", { yes: "Evet", no: "Hayır" }) === "Soğuk, Oturma", "özel multi → etiketler");
  const efYnd = effectiveSections("std-v1", fcBase).flatMap((s) => s.fields).find((f) => f.key === CUSTOM_YND)!;
  ok(displayAnswer({ v: true, d: "Not" }, efYnd, "std-v1", "tr", { yes: "Evet", no: "Hayır" }) === "Evet — Not", "özel ynd");
  ok(displayAnswer(Number.NaN, { key: "F.duration", type: "number", unit: "hours" }, "std-v1", "tr", { yes: "E", no: "H" }) === "", "NaN sayı → boş");
  ok(displayAnswer("2026-01-02", { key: "L.last_period", type: "date" }, "std-v1", "en", { yes: "Y", no: "N" }) === "02/01/2026", "TemplateField imzası geriye uyumlu");

  // ── 6. Route statik kontrolleri ───────────────────────────────────────────
  section("6. Route statik");
  const route = read("app/api/clients/[id]/anamnez/[anamnesisId]/pdf/route.ts");
  ok(/requireModuleAccess\(req, "clients"\)/.test(route) && /if \(!guard\.ok\) return guard\.response;/.test(route), "guard: requireModuleAccess(clients)");
  ok(/const \{ db, tenantId \} = guard;/.test(route) && !/searchParams\.get\("tenant|body\./.test(route), "tenant yalnız guard'dan");
  // DEMO VİTRİN (2026-10-03): demo tenant'ı yalnız SENTETİK veri içerir → PDF okuması demo'da da açık
  // (yazma uçları demoReadOnly ile kapalı). Eski "demo → 404" dalı bilinçli olarak kaldırıldı.
  ok(!/is_demo_account/.test(route), "demo: salt-okunur PDF okuması açık (demo 404 dalı yok)");
  ok(/loadClientInTenant\(db, tenantId, clientId\)/.test(route) && /loadAnamnesis<AnamnezRecord>\(db, tenantId, clientId, anamnesisId,/.test(route), "danışan + anamnez tenant/client/id ile");
  ok(/anamnezError\("CONFLICT", 409/.test(route) && /searchParams\.get\("rev"\)/.test(route), "?rev uyuşmazlığı → 409 CONFLICT");
  ok(/checkRateLimit\(`anamnez-filled:\$\{tenantId\}`/.test(route), "rate limit anamnez-filled:<tenant>");
  ok(/isMissingRelation\(error\)\) return notReady\(\)/.test(route), "tablo yok → NOT_READY");
  ok(/resourceId: `\$\{clientId\}:filled:\$\{row\.id\}`/.test(route) && /action: "report_generated"/.test(route), "trackUsage report_generated (PII yok)");
  ok(/"X-Anamnez-Revision"/.test(route) && /attachment; filename=/.test(route) && /no-store/.test(route), "X-Anamnez-Revision + attachment + no-store");
  ok(!/androidWordGuard|isAndroid/i.test(route), "Android engeli YOK (K8)");
  ok(!/console\.(log|info|warn)\(/.test(route), "route içerik loglamıyor");
  const filledSrc = read("lib/danisan/anamnez/filledFormPdf.ts");
  ok(!/console\./.test(filledSrc) && !/[✓✔■☐☑●]/.test(filledSrc.replace(/\/\*[\s\S]*?\*\//g, "")), "PDF modülü log yok + özel glif yok (işaret çizimle)");

  console.log(`\nanamnez filled-pdf harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * ANAMNEZ V1 — SAF HARNESS (DB/ağ yok).
 *   - std-v1 kanonik şablon HASH KİLİDİ + bütünlük (bölüm/alan/tip/katalog TR+EN)
 *   - doğrulama (11 alan tipi, allowlist, özel soru, kaynak bağlantısı, silme onayı)
 *   - danışana özel özelleştirme (cevap koruma, standarda dönüş, şablon değişmezliği)
 *   - kaynak eşleme / değişiklik tespiti / çakışma / güncel bilgilerle yeni kayıt
 *   - private storage yol & PDF imza yardımcıları, boş form PDF üretimi
 *   - TR/EN mesaj eşliği + kullanılan anahtarların varlığı + statik güvenlik/K8 kontrolleri
 * Çalıştır: npx tsx scripts/anamnez/pure.harness.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalTemplateJson, effectiveSections, getCatalog, getTemplate, stableStringify } from "../../lib/danisan/anamnez/schema";
import {
  isValidDeleteConfirm,
  validateAnswers,
  validateCreateInput,
  validateFormCustom,
  validatePatchEnvelope,
  validateSourceLinks,
} from "../../lib/danisan/anamnez/validate";
import {
  addCustomField,
  deleteCustomField,
  hiddenFieldsWithAnswers,
  hideField,
  resetToStandard,
  restoreField,
  sectionProgress,
  setLabelOverride,
} from "../../lib/danisan/anamnez/customize";
import {
  applyChangedSources,
  applyImport,
  buildSourceValues,
  EMPTY_SOURCE_VALUES,
  fieldSourceState,
  linksChanged,
  listSourceChanges,
  planSectionImport,
  sectionSourceStates,
} from "../../lib/danisan/anamnez/sources";
import {
  checkPrepare,
  checkUploadedBytes,
  hasPdfMagic,
  isOwnedAttachmentPath,
  sanitizeAttachmentName,
} from "../../lib/danisan/anamnez/storage";
import { formatIsoDate, todayIsoIstanbul } from "../../lib/danisan/anamnez/format";
import { buildBlankAnamnesisPdf } from "../../lib/danisan/anamnez/blankFormPdf";
import { ANAMNEZ_FIELD_TYPES, EMPTY_FORM_CUSTOM, type FormCustom, type SourceValues } from "../../lib/danisan/anamnez/types";

/** std-v1 kilidi — şablon yapısı veya TR/EN metinleri değişirse FAIL (yeni sürüm = std-v2). */
const STD_V1_SHA256 = "e7682323cb4d6310cbf0d958af1c0d6191d7c590dd7d2bb220c67a24864bc8d3";

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

// ── 1. Şablon ────────────────────────────────────────────────────────────────
section("1. Kanonik std-v1 şablonu");
const hash = createHash("sha256").update(canonicalTemplateJson("std-v1")).digest("hex");
ok(hash === STD_V1_SHA256, "std-v1 hash kilidi (yapı + TR/EN metin dondurulmuş)", hash);
const T = getTemplate("std-v1");
ok(T.sections.map((s) => s.key).join("") === "ABCDEFGHIJKLMNOPQ", "17 bölüm A–Q");
const allFields = T.sections.flatMap((s) => s.fields);
ok(allFields.length >= 115, `alan sayısı ≥ 115 (${allFields.length})`);
ok(new Set(allFields.map((f) => f.key)).size === allFields.length, "alan anahtarları benzersiz");
ok(allFields.every((f) => f.key.startsWith(`${T.sections.find((s) => s.fields.includes(f))!.key}.`)), "alan anahtarı bölüm önekli");
const usedTypes = new Set(allFields.map((f) => f.type));
ok(ANAMNEZ_FIELD_TYPES.every((t) => usedTypes.has(t)), "11 alan tipinin tamamı kullanılıyor");
ok(allFields.filter((f) => f.type === "textarea").length / allFields.length < 0.4, "uzun metin oranı < %40 (her şey textarea değil)");
ok(T.sections.find((s) => s.key === "L")!.optional === true && T.sections.filter((s) => s.optional).length === 1, "yalnız L (Kadın Sağlığı) koşullu");
for (const loc of ["tr", "en"] as const) {
  const C = getCatalog("std-v1", loc);
  ok(T.sections.every((s) => C.sections[s.key]?.title), `${loc}: tüm bölüm başlıkları`);
  ok(allFields.every((f) => C.fields[f.key]?.label), `${loc}: tüm alan etiketleri`);
  ok(allFields.filter((f) => f.options).every((f) => (T.optionSets[f.options!] ?? []).length > 0 && T.optionSets[f.options!].every((o) => C.options[f.options!]?.[o])), `${loc}: tüm seçenek etiketleri`);
  ok(allFields.flatMap((f) => f.columns ?? []).every((c) => C.columns[c.key] && (!c.options || T.optionSets[c.options].every((o) => C.options[c.options!]?.[o]))), `${loc}: satır kolon etiketleri`);
  ok(allFields.filter((f) => f.unit).every((f) => C.units[f.unit!]), `${loc}: birim etiketleri`);
}
const tr = getCatalog("std-v1", "tr");
const diagnosis = /teşhis|tanı\b|tanısı|diagnos/i;
ok(!Object.values(tr.fields).some((f) => diagnosis.test(f.label)) && !Object.values(getCatalog("std-v1", "en").fields).some((f) => diagnosis.test(f.label)), "soru metinlerinde tanı/teşhis dili YOK");
ok(allFields.filter((f) => f.source).map((f) => `${f.key}<${f.source}`).sort().join("|") ===
  ["B.blood_type<clients.kan", "B.height_cm<nutrition.height_cm", "B.weight_kg<nutrition.weight_kg", "D.items<nutrition.allergens",
    "G.diet_style<nutrition.dietary_pattern", "G.meal_count<nutrition.daily_meal_count", "G.water<nutrition.water_note",
    "I.activity_level<nutrition.activity_level", "J.lifestyle_note<nutrition.lifestyle_note"].sort().join("|"), "yalnız 9 onaylı yapılandırılmış kaynak eşlendi");
ok(allFields.some((f) => f.key === "J.occupation" && !f.source), "Meslek (K1) yalnız anamnezde, kaynaksız");

// ── 2. Doğrulama ─────────────────────────────────────────────────────────────
section("2. Doğrulama");
const E = EMPTY_FORM_CUSTOM;
const ANAMNEZ_SECTIONS_FOR_BIG = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"] as const;
const good = {
  "A.reason": "x", "A.duration": "m1_6", "B.conditions": { v: true, d: "d" }, "C.any": false, "E.conditions": ["diabetes"],
  "F.bedtime": "22:15", "F.quality": 0, "F.duration": 7.5, "L.last_period": "2026-02-28", "J.occupation": "Öğretmen",
  "M.items": [{ id: "a1", region: "Bel", intensity: 3, pattern: "continuous" }], "D.items": [{ id: "d1", ref: "code:peanut", category: "food", trigger: "Yer fıstığı" }],
};
const va = validateAnswers("std-v1", E, good);
ok(va.ok, "11 tip geçerli cevaplar kabul", va);
const bad: Array<[string, unknown]> = [
  ["bilinmeyen alan", { "X.y": 1 }], ["yn metin", { "C.any": "yes" }], ["ynd fazladan alan", { "B.conditions": { v: true, d: "", z: 1 } }],
  ["seçenek dışı", { "A.duration": "forever" }], ["multi seçenek dışı", { "E.conditions": ["x"] }], ["saat", { "F.bedtime": "25:00" }],
  ["tarih", { "L.last_period": "2026-02-30" }], ["ölçek 11", { "F.quality": 11 }], ["ölçek ondalık", { "F.quality": 2.5 }],
  ["sayı aralık", { "F.duration": 30 }], ["metin > 300", { "J.occupation": "x".repeat(301) }], ["uzun metin > 4000", { "A.reason": "x".repeat(4001) }],
  ["satır bilinmeyen kolon", { "M.items": [{ id: "a", foo: "x" }] }], ["satır id tekrar", { "M.items": [{ id: "a" }, { id: "a" }] }],
  ["satır sayı kolon metin", { "M.items": [{ id: "a", intensity: "5" }] }], ["> 30 satır", { "M.items": Array.from({ length: 31 }, (_, i) => ({ id: `r${i}` })) }],
];
for (const [label, v] of bad) ok(!validateAnswers("std-v1", E, v).ok, `ret: ${label}`);
{
  const bigFc: FormCustom = { ...E, custom: Array.from({ length: 30 }, (_, i) => ({ key: `c_${(1000000000000 + i).toString(16)}`, section: ANAMNEZ_SECTIONS_FOR_BIG[i % 17], type: "textarea" as const, label: `Özel ${i}` })) };
  const bigAnswers: Record<string, string> = {};
  for (const f of allFields.filter((x) => x.type === "textarea")) bigAnswers[f.key] = "ş".repeat(4000);
  for (const c of bigFc.custom) bigAnswers[c.key] = "ş".repeat(4000);
  const r = validateAnswers("std-v1", validateFormCustom("std-v1", bigFc).ok ? bigFc : E, bigAnswers);
  ok(validateFormCustom("std-v1", bigFc).ok && !r.ok && /boyut/.test((r as { error: string }).error), "toplam içerik boyut sınırı (≈200 KB) aşımı → ret");
}
const clean = validateAnswers("std-v1", E, { "A.reason": "", "C.any": null, "E.conditions": [] });
ok(clean.ok && Object.keys(clean.value).length === 0, "boş değerler kayda yazılmaz");
const cf: FormCustom = { hidden: ["A.duration"], labels: { "A.reason": "Neden?" }, enabledSections: ["L"], custom: [{ key: "c_0011223344ab", section: "M", type: "single", label: "Özel", options: [{ key: "o1", label: "Bir" }, { key: "o2", label: "İki" }] }] };
ok(validateFormCustom("std-v1", cf).ok, "form farkı geçerli");
ok(validateAnswers("std-v1", cf, { c_0011223344ab: "o2", "A.duration": "m1_6" }).ok, "gizli alan + özel soru cevabı kabul");
ok(!validateAnswers("std-v1", cf, { c_0011223344ab: "o9" }).ok, "özel soru seçenek dışı → ret");
const badFc: Array<[string, unknown]> = [
  ["bilinmeyen alan", { ...cf, extra: 1 }], ["gizlenen bilinmeyen", { ...cf, hidden: ["Q.none"] }], ["başlık özel alana", { ...cf, labels: { c_0011223344ab: "x" } }],
  ["zorunlu bölüm etkinleştirme", { ...cf, enabledSections: ["A"] }], ["özel anahtar biçimi", { ...cf, custom: [{ ...cf.custom[0], key: "A.reason" }] }],
  ["özel tip rows", { ...cf, custom: [{ key: "c_aa11bb22cc33", section: "A", type: "rows", label: "x" }] }],
  ["tek seçenek", { ...cf, custom: [{ key: "c_aa11bb22cc33", section: "A", type: "single", label: "x", options: [{ key: "o1", label: "a" }] }] }],
  ["boş başlık", { ...cf, custom: [{ key: "c_aa11bb22cc33", section: "A", type: "text", label: "  " }] }],
];
for (const [label, v] of badFc) ok(!validateFormCustom("std-v1", v).ok, `form farkı ret: ${label}`);
const now = "2026-09-28T10:00:00.000Z";
const sl = validateSourceLinks("std-v1", { "I.activity_level": { src: "nutrition.activity_level", v: "moderate", a: "imported", at: "2001-01-01T00:00:00Z" } }, {}, now);
ok(sl.ok && sl.value["I.activity_level"].at === now, "kaynak bağlantısı: zaman damgası sunucuda");
const sl2 = validateSourceLinks("std-v1", { "I.activity_level": { src: "nutrition.activity_level", v: "moderate", a: "imported", at: "x" } }, sl.ok ? sl.value : {}, "2027-01-01T00:00:00.000Z");
ok(sl2.ok && sl2.value["I.activity_level"].at === now, "değişmeyen bağlantı eski damgayı korur");
ok(!validateSourceLinks("std-v1", { "A.reason": { src: "clients.kan", v: "a", a: "imported", at: now } }, {}, now).ok, "kaynaksız alana bağlantı → ret");
ok(!validateSourceLinks("std-v1", { "B.blood_type": { src: "nutrition.water_note", v: "a", a: "imported", at: now } }, {}, now).ok, "yanlış kaynak anahtarı → ret");
ok(validateCreateInput({ mode: "standard", assessmentDate: "2026-09-28" }).ok, "oluştur: standart");
ok(!validateCreateInput({ mode: "previous", assessmentDate: "2026-09-28" }).ok, "oluştur: önceki kayıtsız → ret");
ok(!validateCreateInput({ mode: "standard", fromId: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01", assessmentDate: "2026-09-28" }).ok, "oluştur: standart+fromId → ret");
ok(!validateCreateInput({ mode: "standard", assessmentDate: "28.09.2026" }).ok, "oluştur: tarih biçimi → ret");
ok(!validatePatchEnvelope({ baseRevision: 1, status: "completed" }).ok, "PATCH: status alanı → ret");
ok(!validatePatchEnvelope({ baseRevision: 1, client_id: "x" }).ok, "PATCH: client_id alanı → ret");
ok(!validatePatchEnvelope({ answers: {} }).ok, "PATCH: baseRevision zorunlu");
ok(isValidDeleteConfirm("completed", { confirmText: "SİL" }) && isValidDeleteConfirm("completed", { confirmText: " sil " }) && isValidDeleteConfirm("completed", { confirmText: "DELETE" }), "silme onayı: SİL / sil / DELETE");
ok(!isValidDeleteConfirm("completed", { confirmText: "evet" }) && !isValidDeleteConfirm("completed", { confirmDraft: true }) && !isValidDeleteConfirm("completed", {}), "silme onayı: yanlış metin / taslak onayı → ret");
ok(isValidDeleteConfirm("draft", { confirmDraft: true }) && !isValidDeleteConfirm("draft", {}), "taslak silme: açık onay bayrağı şart");

// ── 3. Özelleştirme ──────────────────────────────────────────────────────────
section("3. Danışana özel özelleştirme");
const before = canonicalTemplateJson("std-v1");
const answers = { "A.reason": "neden", "A.duration": "m1_6" };
let fc: FormCustom = hideField(E, "A.duration");
ok(fc.hidden.includes("A.duration") && answers["A.duration"] === "m1_6", "Bu danışandan kaldır → cevap korunur");
ok(hiddenFieldsWithAnswers("std-v1", fc, answers).some((h) => h.key === "A.duration" && h.hasAnswer), "kaldırılan alanlar listesinde 'cevap var'");
ok(restoreField(fc, "A.duration").hidden.length === 0, "geri ekle");
fc = addCustomField(fc, { section: "A", type: "text", label: "Özel soru", options: [] });
const ck = fc.custom[0].key;
ok(/^c_[0-9a-f]{12}$/.test(ck) && validateFormCustom("std-v1", fc).ok, "özel soru ekle (geçerli anahtar)");
fc = setLabelOverride(fc, "A.reason", "Başvuru nedeni (özel)");
const withCustom = { ...answers, [ck]: "özel cevap" };
const reset = resetToStandard(fc, withCustom);
ok(reset.labels["A.reason"] === undefined && !reset.hidden.includes("A.duration") && reset.custom.length === 1 && reset.hidden.includes(ck), "standarda dön: fark kalkar, cevaplı özel soru gizlenerek korunur");
ok(Object.keys(withCustom).length === 3, "standarda dönüş hiçbir cevabı silmez");
const del = deleteCustomField(fc, withCustom, ck);
ok(!(ck in del.answers) && del.formCustom.custom.length === 0, "özel soruyu sil → soru + cevabı birlikte (açık işlem)");
ok(canonicalTemplateJson("std-v1") === before && E.hidden.length === 0 && E.custom.length === 0, "kanonik şablon + boş fark nesnesi değişmedi (başka danışan etkilenmez)");
const prog = sectionProgress("std-v1", E, { "A.reason": "x" });
ok(prog.A.filled === 1 && prog.A.total === 9 && prog.L.total === 0, "bölüm doluluğu (L kapalı → 0)");
ok(effectiveSections("std-v1", { ...E, enabledSections: ["L"] }).find((s) => s.key === "L")!.enabled, "L bölümü bu anamnezde etkinleştirilebilir");

// ── 4. Kaynaklar ─────────────────────────────────────────────────────────────
section("4. Kaynak eşleme / değişiklik tespiti");
const raw = {
  kan: "A Rh+",
  profile: { activity_level: "moderate", dietary_pattern: " Akdeniz ", daily_meal_count: 3, water_note: "2 L", lifestyle_note: null },
  measurements: [{ height_cm: null, weight_kg: 68.5, measured_at: "2026-09-27" }, { height_cm: 168, weight_kg: 70, measured_at: "2026-09-18" }],
  allergens: [
    { code: "peanut", custom_label: null, name_tr: "Yer fıstığı", name_en: "Peanut", note: null },
    { code: null, custom_label: "Çilek", name_tr: null, name_en: null, note: "kızarıklık" },
    { code: "peanut", custom_label: null, name_tr: "Yer fıstığı", name_en: "Peanut", note: null },
  ],
};
const sv = buildSourceValues(raw);
ok(sv["clients.kan"] === "a_pos" && buildSourceValues({ ...raw, kan: "A pozitif" })["clients.kan"] === null, "kan: kanonik → seçenek; kanonik dışı eşlenmez");
ok(sv["nutrition.height_cm"] === 168 && sv["nutrition.weight_kg"] === 68.5, "boy/kilo: son dolu ölçüm");
ok(sv["nutrition.dietary_pattern"] === "Akdeniz" && sv["nutrition.lifestyle_note"] === null, "metin normalize + boş → kaynak yok");
ok(sv["nutrition.allergens"].length === 2 && sv["nutrition.allergens"].map((a) => a.ref).join(",") === "code:peanut,custom:çilek", "alerjiler tekilleştirildi + sıralı ref");
ok(buildSourceValues({ ...raw, profile: { ...raw.profile, activity_level: "extreme" } })["nutrition.activity_level"] === null, "aktivite enum dışı → eşlenmez");
const fields = Object.fromEntries(T.sections.flatMap((s) => s.fields).map((f) => [f.key, f]));
ok(fieldSourceState(fields["I.activity_level"], undefined, {}, sv) === "available", "🔔 kaynak var, alan boş");
ok(fieldSourceState(fields["I.activity_level"], "moderate", {}, sv) === "current", "✓ alan zaten kaynağa eşit");
ok(fieldSourceState(fields["J.lifestyle_note"], undefined, {}, sv) === "none", "kaynak yok → rozet yok");
const planG = planSectionImport("std-v1", E, "G", {}, sv, "tr");
const impG = applyImport(planG, {}, {}, {}, sv, "std-v1", now);
ok(impG.answers["G.meal_count"] === 3 && impG.links["G.meal_count"].a === "imported" && !("I.activity_level" in impG.answers), "bölüm bazlı içe aktarma yalnız o bölüm");
const sv2: SourceValues = { ...sv, "nutrition.daily_meal_count": 5 };
ok(fieldSourceState(fields["G.meal_count"], 3, impG.links, sv2) === "changed", "⚠ aktarılan kaynak değişti");
ok(fieldSourceState(fields["G.meal_count"], 5, impG.links, sv2) === "current", "cevap zaten yeni değerde → güncel");
ok(linksChanged("std-v1", impG.links, sv2) && !linksChanged("std-v1", impG.links, sv), "liste uyarısı yalnız bağlantılardan");
const statesSame = JSON.stringify(sectionSourceStates("std-v1", E, impG.answers, impG.links, sv));
ok(JSON.stringify(sectionSourceStates("std-v1", E, impG.answers, impG.links, buildSourceValues(raw))) === statesSame, "aynı kaynak → aynı durum (deterministik)");
const hiddenStates = sectionSourceStates("std-v1", hideField(E, "G.meal_count"), impG.answers, impG.links, sv2);
ok(hiddenStates.find((s) => s.section === "G")!.fields.every((f) => f.key !== "G.meal_count"), "gizli alan uyarı üretmez");
const planI = planSectionImport("std-v1", E, "I", { "I.activity_level": "active" }, sv, "tr");
ok(planI.conflicts.length === 1 && planI.fills.length === 0, "farklı değer → çakışma");
ok(applyImport(planI, {}, { "I.activity_level": "active" }, {}, sv, "std-v1", now).answers["I.activity_level"] === "active", "varsayılan seçim Mevcudu Koru");
const planD = planSectionImport("std-v1", E, "D", { "D.items": [{ id: "x", ref: "code:peanut", trigger: "Fıstık" }] }, sv, "en");
ok(planD.conflicts.length === 1 && planD.conflicts[0].addRows?.length === 1 && planD.conflicts[0].addRows?.[0].trigger === "Çilek", "liste: yalnız eksik satırlar eklenecek");
const useD = applyImport(planD, { "D.items": "use" }, { "D.items": [{ id: "x", ref: "code:peanut", trigger: "Fıstık" }] }, {}, sv, "std-v1", now);
ok((useD.answers["D.items"] as unknown[]).length === 2, "liste: mevcut satır silinmedi, eksik eklendi");
const oldAnswers = { ...impG.answers };
const ch = listSourceChanges("std-v1", E, oldAnswers, impG.links, sv2, "tr");
ok(ch.length === 1 && ch[0].key === "G.meal_count", "değişiklik listesi yalnız değişen eşlenmiş alan");
const refreshed = applyChangedSources("std-v1", E, oldAnswers, impG.links, sv2, "tr", now);
ok(refreshed.answers["G.meal_count"] === 5 && oldAnswers["G.meal_count"] === 3, "güncel bilgilerle yeni kayıt: yeni değer; eski nesne değişmedi");
ok(JSON.stringify(EMPTY_SOURCE_VALUES["nutrition.allergens"]) === "[]", "boş kaynak listesi");

// ── 5. Storage ───────────────────────────────────────────────────────────────
section("5. Private storage yardımcıları");
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CA = "11111111-1111-4111-8111-111111111111", AA = "22222222-2222-4222-8222-222222222222";
const good1 = `${TA}/${CA}/${AA}/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e01.pdf`;
ok(isOwnedAttachmentPath(good1, TA, CA, AA), "sahip yol kabul");
for (const [label, p] of [
  ["başka tenant", `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/${CA}/${AA}/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e01.pdf`],
  ["traversal", `${TA}/${CA}/${AA}/../x.pdf`], ["encoded", `${TA}/${CA}/${AA}/%2e%2e%2fx.pdf`], ["backslash", `${TA}/${CA}/${AA}\\x.pdf`],
  ["fazla segment", `${TA}/${CA}/${AA}/sub/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e01.pdf`], ["uuid olmayan ad", `${TA}/${CA}/${AA}/form.pdf`],
  ["uzantı", `${TA}/${CA}/${AA}/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e01.exe`], ["mutlak URL", `https://x/${good1}`],
] as const) ok(!isOwnedAttachmentPath(p, TA, CA, AA), `yol ret: ${label}`);
ok(hasPdfMagic(Buffer.from("%PDF-1.7")) && !hasPdfMagic(Buffer.from("MZ...")) && !hasPdfMagic(Buffer.from("%PD")), "PDF imzası (%PDF-)");
ok(checkPrepare({ fileName: "a.pdf", size: 10, contentType: "application/pdf" }, 0).ok, "prepare geçerli");
ok((checkPrepare({ fileName: "a.pdf", size: 10, contentType: "application/pdf" }, 5) as { code: string }).code === "LIMIT_REACHED", "prepare 6. dosya");
ok((checkPrepare({ fileName: "a.pdf", size: 10 * 1024 * 1024 + 1, contentType: "application/pdf" }, 0) as { code: string }).code === "TOO_LARGE", "prepare > 10 MB");
ok((checkPrepare({ fileName: "a.png", size: 10, contentType: "application/pdf" }, 0) as { code: string }).code === "INVALID_TYPE", "prepare uzantı");
ok((checkPrepare({ fileName: "a.pdf", size: 10, contentType: "application/octet-stream" }, 0) as { code: string }).code === "INVALID_TYPE", "prepare MIME");
ok((checkUploadedBytes(Buffer.from("hello")) as { code: string }).code === "INVALID_TYPE" && checkUploadedBytes(Buffer.from("%PDF-1.4 x")).ok, "finalize gerçek bayt kontrolü");
ok(sanitizeAttachmentName("../../etc/passwd") === ".._.._etc_passwd.pdf" && sanitizeAttachmentName("Form Ç.pdf") === "Form Ç.pdf", "dosya adı temizleme");

// ── 6. Boş form PDF ──────────────────────────────────────────────────────────
section("6. Boş anamnez PDF");
const font = readFileSync(path.join(ROOT, "public/fonts/Geist-Regular.ttf")).toString("base64");
const pdfTr = buildBlankAnamnesisPdf({ locale: "tr", version: "std-v1", formCustom: null, clientName: "Ayşe Yılmaz", fontBase64: font });
const pdfEn = buildBlankAnamnesisPdf({ locale: "en", version: "std-v1", formCustom: cf, clientName: null, fontBase64: font });
const pages = (b: Uint8Array) => (Buffer.from(b).toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
ok(hasPdfMagic(pdfTr) && pages(pdfTr) >= 5, `TR standart form PDF (${pages(pdfTr)} sayfa)`);
ok(hasPdfMagic(pdfEn) && pages(pdfEn) >= 5, `EN danışana özel form PDF (${pages(pdfEn)} sayfa)`);
ok(Buffer.from(pdfTr).toString("latin1").includes("/FontFile2"), "Türkçe karakter için TTF gömülü");

// ── 7. Biçim ─────────────────────────────────────────────────────────────────
section("7. Biçim (TZ bağımsız)");
ok(formatIsoDate("2026-09-28", "tr") === "28.09.2026" && formatIsoDate("2027-01-15", "en") === "15/01/2027", "tarih biçimi TR/EN");
ok(/^\d{4}-\d{2}-\d{2}$/.test(todayIsoIstanbul(new Date("2026-09-28T22:30:00Z"))) && todayIsoIstanbul(new Date("2026-09-28T22:30:00Z")) === "2026-09-29", "bugün Europe/Istanbul");

// ── 8. i18n ──────────────────────────────────────────────────────────────────
section("8. TR / EN metinler");
const flat = (o: unknown, p = ""): string[] => (typeof o === "object" && o !== null ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [p]);
const mTr = JSON.parse(read("messages/tr/clients.anamnez.json"));
const mEn = JSON.parse(read("messages/en/clients.anamnez.json"));
const kTr = flat(mTr).sort();
const kEn = flat(mEn).sort();
ok(JSON.stringify(kTr) === JSON.stringify(kEn), `clients.anamnez TR/EN anahtar eşliği (${kTr.length})`, kTr.filter((k) => !kEn.includes(k)).concat(kEn.filter((k) => !kTr.includes(k))));
const dTr = JSON.parse(read("messages/tr/clients.detail.json")).clients.detail;
const dEn = JSON.parse(read("messages/en/clients.detail.json")).clients.detail;
ok(dTr.tab.anamnez && dEn.tab.anamnez && dTr.deletePreview.table.anamneses && dEn.deletePreview.table.anamnesisFiles, "sekme + silme önizleme etiketleri TR/EN");
ok(/clients\.anamnez\.json/.test(read("i18n/request.ts")) && (read("i18n/request.ts").match(/ClientsAnamnez/g) ?? []).length === 4, "namespace i18n/request.ts'e kayıtlı (TR+EN)");
// Kullanılan literal anahtarlar mevcut mu?
const has = (key: string) => key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), mTr.clients.anamnez) !== undefined;
const uiFiles = [
  ...readdirSync(path.join(ROOT, "components/danisan/anamnez")).filter((f) => f.endsWith(".tsx")).map((f) => `components/danisan/anamnez/${f}`),
  "app/dashboard/clients/[id]/components/AnamnezTab.tsx",
];
const missing: string[] = [];
for (const f of uiFiles) {
  const src = read(f);
  // Her dosyada useTranslations kapsamı: "clients.anamnez", "clients.anamnez.field", "clients.anamnez.source".
  const scopes = [...src.matchAll(/useTranslations\("clients\.anamnez(\.[a-z]+)?"\)/g)].map((m) => (m[1] ?? "").slice(1));
  for (const m of src.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)) {
    const k = m[1];
    if (!scopes.some((sc) => has(sc ? `${sc}.${k}` : k))) missing.push(`${f}: ${k}`);
  }
}
ok(missing.length === 0, "UI'da kullanılan tüm çeviri anahtarları mevcut", missing);
ok(["text", "textarea", "yn", "ynd", "single", "multi", "scale10", "date", "number"].every((k) => mTr.clients.anamnez.custom.types[k] && mEn.clients.anamnez.custom.types[k]), "özel soru tipleri TR/EN");
ok(["filledForm", "filledFormBusy", "filledFormSaveFirst"].every((k) => mTr.clients.anamnez.list[k] && mEn.clients.anamnez.list[k]) &&
  ["statusDraft", "statusCompleted", "signatureClient", "signatureExpert", "signatureDate", "empty", "generatedAt"].every((k) => mTr.clients.anamnez.pdf[k] && mEn.clients.anamnez.pdf[k]) &&
  mTr.clients.anamnez.pdf.generatedAt.includes("{date}") && mEn.clients.anamnez.pdf.generatedAt.includes("{date}"), "kayıtlı form PDF metinleri TR/EN");
ok(mTr.clients.anamnez.list.filledForm === "Kayıtlı Anamnez Formunu İndir (PDF)", "CTA metni: Kayıtlı Anamnez Formunu İndir (PDF)");
ok(["NOT_FOUND", "INVALID", "DEMO_READ_ONLY", "NOT_READY", "LOCKED", "CONFLICT", "DRAFT_EXISTS", "PREVIOUS_REQUIRED", "CONFIRM_REQUIRED", "LIMIT_REACHED", "INVALID_TYPE", "TOO_LARGE", "EMPTY", "UPLOAD_MISSING", "STORAGE_FAILED", "RATE_LIMITED", "generic"].every((k) => mTr.clients.anamnez.errors[k] && mEn.clients.anamnez.errors[k]), "tüm hata kodları TR/EN");

// ── 9. Statik güvenlik / entegrasyon ─────────────────────────────────────────
section("9. Statik güvenlik + entegrasyon");
const routeDir = "app/api/clients/[id]/anamnez";
const routes: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (e.name === "route.ts") routes.push(p); } };
walk(routeDir);
ok(routes.length === 9, `9 anamnez route dosyası (${routes.length})`);
ok(routes.includes("app/api/clients/[id]/anamnez/[anamnesisId]/pdf/route.ts"), "kayıtlı form PDF route'u mevcut");
ok(routes.every((r) => /requireModuleAccess\(req, "clients"\)/.test(read(r))), "her route requireModuleAccess(req, \"clients\") çağırıyor");
ok(routes.every((r) => !/body\.tenant|body\.tenantId|tenant_id:\s*body|searchParams\.get\("tenant/.test(read(r))), "hiçbir route istemciden tenant almıyor");
ok(routes.every((r) => !/androidWordGuard|isAndroid/i.test(read(r))), "route'larda Android engeli YOK (K8)");
ok(uiFiles.concat(["lib/danisan/anamnez/client.ts"]).every((f) => !/useIsAndroid|isAndroid|androidWordGuard/.test(read(f))), "UI'da cihaz tespitiyle PDF gizleme YOK (K8)");
ok(!/\bconfirm\(\s*["'`]/.test(uiFiles.map(read).join("\n")) && !/window\.confirm/.test(uiFiles.map(read).join("\n")), "tarayıcı confirm() kullanılmıyor");
ok(/ANAMNEZ_SIGNED_URL_TTL_SECONDS = 60/.test(read("lib/danisan/anamnez/storage.ts")), "signed URL TTL 60 sn");
const cascade = read("app/api/clients/[id]/cascade-delete/route.ts");
const clientDeleteAt = cascade.search(/\.from\("clients"\)\s*\.delete\(\)/);
ok(cascade.indexOf("collectAnamnesisObjectPaths(db") > 0 && clientDeleteAt > 0 && cascade.indexOf("collectAnamnesisObjectPaths(db") < clientDeleteAt, "danışan silme: anamnez PDF'leri DB silmesinden ÖNCE");
ok(/anamneses[\s\S]*client_anamneses[\s\S]*anamnesisFiles[\s\S]*client_anamnesis_attachments/.test(read("lib/danisan/deletePreview.ts")), "silme önizlemesi yeni tabloları sayıyor");
ok(/"anamnez"/.test(read("lib/danisan/clientDetailTabs.ts")) && /id="anamnez"/.test(read("app/dashboard/clients/[id]/page.tsx")), "sekme allowlist + Danışan Detayı sekmesi");
const reg = read("lib/backup/registry.ts");
ok(/entry\("client_anamneses"/.test(reg) && /entry\("client_anamnesis_attachments"[\s\S]*st\("storage_path", "tenant"\)/.test(reg), "backup registry (+ storage yolu tenant doğrulaması)");
const man = JSON.parse(read("supabase/expected-manifest.json"));
ok(man.tables_rls_enabled.names.includes("client_anamneses") && man.tables_no_client_grant.names.includes("client_anamnesis_attachments") && man.buckets["client-anamnesis-files"].public === false, "expected-manifest: RLS + grant + private bucket");
ok(/"client-anamnesis-files"/.test(read("lib/yasam-hafizasi/backup/constants.ts")), "KNOWN_STORAGE_BUCKETS");
const mig = read("supabase/migrations/20270202000000_client_anamnesis.sql");
ok(/REVOKE ALL ON TABLE public\.client_anamneses FROM PUBLIC, anon, authenticated, service_role;/.test(mig) && /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.client_anamneses TO service_role;/.test(mig), "migration: explicit REVOKE + allowlist GRANT");
ok(!/ALTER DEFAULT PRIVILEGES/i.test(mig) && !/DROP TABLE|TRUNCATE|DELETE FROM public\.clients/i.test(mig.replace(/--.*$/gm, "")), "migration additive (default privileges / yıkıcı ifade yok)");
ok(/"\/api\/clients\/\[id\]\/anamnez\/blank-form": \["\.\/public\/fonts\/Geist-Regular\.ttf"\]/.test(read("next.config.ts")), "boş form fontu Vercel paketine dahil");
ok(/"\/api\/clients\/\[id\]\/anamnez\/\[anamnesisId\]\/pdf": \["\.\/public\/fonts\/Geist-Regular\.ttf"\]/.test(read("next.config.ts")), "kayıtlı form PDF fontu Vercel paketine dahil");
{
  const tab = read("app/dashboard/clients/[id]/components/AnamnezTab.tsx");
  const ed = read("components/danisan/anamnez/AnamnezEditor.tsx");
  ok(/\/pdf\?rev=\$\{item\.revision\}/.test(tab) && /t\("list\.filledForm"\)/.test(tab), "geçmiş satırı: kayıtlı form PDF (rev ile)");
  ok(/\/pdf\?rev=\$\{rec\.revision\}/.test(ed) && /disabled=\{busy !== null \|\| dirty\}/.test(ed) && /t\("list\.filledFormSaveFirst"\)/.test(ed), "editör: kaydedilmemiş değişiklikte pasif + 'Önce kaydedin'");
}

console.log(`\nanamnez pure harness: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  console.error("FAIL:\n - " + fails.join("\n - "));
  process.exit(1);
}
void stableStringify;

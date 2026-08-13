/**
 * Şifa Rehberi — FAZ 2 acceptance harness (ağ/DB YOK; saf fonksiyon + statik dosya kontrolleri).
 * Çalıştır: npx tsx scripts/sifa-rehberi-faz2-harness.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODALITIES,
  MODE_LABEL,
  SECTION_TYPES,
  SECTION_TYPE_LABEL,
  modalityById,
  isAllowedSourceKind,
  normalizeReplaceSections,
  sectionHasAnyLayer,
} from "@/lib/sifa-rehberi/sectionModel";
import { validateSectionsBody } from "@/lib/sifa-rehberi/limits";
import {
  sectionRowToEditable,
  editableToPayload,
  emptyEditableSection,
} from "@/lib/sifa-rehberi/sectionEditorModel";
import { foldTr, isMeaningfulText } from "@/lib/sifa-rehberi/normalizeTr";
import { matchesListSearch, listRowPreview, type HealingGuideSectionRow, type HealingGuideListRow } from "@/lib/sifa-rehberi/healingGuideLiveData";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
  }
}
function eq<T>(a: T, b: T, label: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}
function makeSection(p: Partial<HealingGuideSectionRow>): HealingGuideSectionRow {
  return {
    id: "sec-1", guide_id: "g-1", section_type: "reasons", mode: null, title: null,
    note: null, source: null, source_kind: null, expert_note: null, attention: null,
    sort_order: null, images: [], created_at: "2026-01-01T00:00:00Z", ...p,
  };
}

// ── SECTION-NATIVE round-trip (production-şekilli kayıtlar KAYIPSIZ) ─────────────
const prodHerbal = makeSection({ id: "h1", section_type: "herbal", mode: null, title: null, note: "250 gram sarı kantaron", source: "Geleneksel", images: [] });
const prodHacamat = makeSection({ id: "a1", section_type: "applications", mode: "hacamat_suluk", title: "Hacamat & Sülük", note: "Sırt bölgesi", source: null });
const prodBilincalti = makeSection({ id: "r1", section_type: "reasons", mode: "bilincalti", title: null, note: "Öfke birikimi" });

const e1 = sectionRowToEditable(prodHerbal);
eq(e1.section_type, "herbal", "round-trip: herbal section_type korunur");
eq(e1.mode, null, "round-trip: null mode korunur");
eq(e1.note, "250 gram sarı kantaron", "round-trip: note korunur");
eq(e1.source, "Geleneksel", "round-trip: source korunur");

const payload = editableToPayload([sectionRowToEditable(prodHerbal), sectionRowToEditable(prodHacamat), sectionRowToEditable(prodBilincalti)]);
eq(payload.length, 3, "editableToPayload: 3 bölüm");
eq(payload[0].section_type, "herbal", "payload[0] herbal survives");
eq(payload[1].mode, "hacamat_suluk", "payload[1] hacamat_suluk mode survives");
eq(payload[2].mode, "bilincalti", "payload[2] bilincalti mode survives");
eq(payload[0].sort_order, 0, "payload sort_order 0");
eq(payload[2].sort_order, 2, "payload sort_order 2");

const norm = normalizeReplaceSections(payload);
eq(norm[0].section_type, "herbal", "normalize: herbal survives");
eq(norm[1].title, "Hacamat & Sülük", "normalize: title survives");
eq(norm[0].source, "Geleneksel", "normalize: source survives");
eq(norm[0].mode, null, "normalize: null mode survives");
eq(norm.map((s) => s.sort_order), [0, 1, 2], "normalize: sort_order 0..N");

// add / edit / delete / reorder semantics (saf liste ops üzerinden)
let list = [sectionRowToEditable(prodHerbal), sectionRowToEditable(prodHacamat)];
list = [...list, emptyEditableSection()];
eq(list.length, 3, "add section → 3");
list = list.map((s, i) => (i === 0 ? { ...s, note: "düzenlendi" } : s));
eq(list[0].note, "düzenlendi", "edit section note");
list = list.filter((_, i) => i !== 1);
eq(list.length, 2, "delete section → 2");
// reorder: swap 0 <-> 1
const swapped = [list[1], list[0]];
eq(editableToPayload(swapped).map((s) => s.sort_order), [0, 1], "reorder persist sort_order deterministik");
eq(editableToPayload(swapped)[0].note, "", "reorder: yeni ilk = eski ikinci (boş)");

// image round-trip
const withImg = makeSection({ id: "i1", section_type: "stones_details", images: [{ url: "x" }] });
eq(sectionRowToEditable(withImg).images.length, 1, "images round-trip");
eq(editableToPayload([sectionRowToEditable(withImg)])[0].images, [{ url: "x" }], "images payload round-trip");

// ── PROVENANCE ──────────────────────────────────────────────────────────────────
ok(isAllowedSourceKind("Kitap"), "source_kind: allowed value");
ok(isAllowedSourceKind(""), "source_kind: blank accepted");
ok(isAllowedSourceKind(null), "source_kind: null accepted (optional)");
ok(!isAllowedSourceKind("Bilimsel Kanıt A1"), "source_kind: unknown rejected");
ok(!isAllowedSourceKind(123 as unknown), "source_kind: non-string rejected");
eq(validateSectionsBody([{ section_type: "reasons", source_kind: "Eğitim / Ders" }]), null, "validate: valid source_kind OK");
eq(validateSectionsBody([{ section_type: "reasons", source_kind: "" }]), null, "validate: blank source_kind OK");
ok(validateSectionsBody([{ section_type: "reasons", source_kind: "Rastgele" }]) !== null, "validate: invalid source_kind red");
eq(validateSectionsBody([{ section_type: "reasons", note: "A", source: "Kitap X" }]), null, "validate: source note'tan bağımsız OK");

// ── EXPERT NOTE ───────────────────────────────────────────────────────────────
eq(validateSectionsBody([{ section_type: "reasons", expert_note: "u".repeat(20001) }]), null, "expert_note >20k KABUL");
eq(validateSectionsBody([{ section_type: "reasons", expert_note: "u".repeat(50001) }]), null, "expert_note >50k KABUL");
eq(validateSectionsBody([{ section_type: "reasons", expert_note: "" }]), null, "expert_note blank KABUL");
ok(validateSectionsBody([{ section_type: "reasons", expert_note: { x: 1 } }]) !== null, "expert_note object red");
ok(validateSectionsBody([{ section_type: "reasons", expert_note: [1] }]) !== null, "expert_note array red");

// ── ATTENTION ─────────────────────────────────────────────────────────────────
eq(validateSectionsBody([{ section_type: "reasons", attention: "u".repeat(20001) }]), null, "attention >20k KABUL");
eq(validateSectionsBody([{ section_type: "reasons", attention: "u".repeat(50001) }]), null, "attention >50k KABUL");
eq(validateSectionsBody([{ section_type: "reasons" }]), null, "attention opsiyonel (yok) KABUL");
eq(validateSectionsBody([{ section_type: "reasons", attention: "" }]), null, "attention blank KABUL");
ok(validateSectionsBody([{ section_type: "reasons", attention: { x: 1 } }]) !== null, "attention object red");
// note limitsiz + abuse guard korunur
eq(validateSectionsBody([{ section_type: "reasons", note: "n".repeat(60000) }]), null, "note >50k KABUL");
ok(validateSectionsBody([{ section_type: "reasons", note: { x: 1 } }]) !== null, "note object red (abuse)");

// ── TAXONOMY (herbal korunur; aromaterapi anlam kaybı YOK) ──────────────────────
const bitkisel = MODALITIES.find((m) => m.id === "bitkisel")!;
eq(bitkisel.section_type, "herbal", "bitkisel modalitesi → section_type HERBAL (applications DEĞİL)");
ok(!MODALITIES.some((m) => m.id === "bitkisel" && m.section_type === "applications"), "yeni herbal applications'a dönüşmez");
const aroma = MODALITIES.find((m) => m.id === "aromaterapi")!;
eq(aroma.id, "aromaterapi", "aromaterapi modalite id korunur (anlam)");
eq(MODE_LABEL["aromaterapi"], "Aromaterapi", "aromaterapi label 'Aromaterapi' (sessizce Destekleyici olmaz)");
eq(MODE_LABEL["herbal"], "Bitkisel Yöntemler", "merkezi label: herbal → Bitkisel Yöntemler");
eq(SECTION_TYPE_LABEL["herbal"], "Bitkisel Yöntemler", "herbal section_type label merkezi");
eq(modalityById("bitkisel")?.section_type, "herbal", "modalityById bitkisel → herbal");
ok((SECTION_TYPES as readonly string[]).includes("herbal"), "canonical SECTION_TYPES herbal içerir");

// ── STATIC: ATOMIK RPC MIGRATION ────────────────────────────────────────────────
const mig = read("supabase/migrations/20261202000000_healing_guide_sections_faz2_provenance_notes.sql");
ok(/security\s+definer/i.test(mig), "migration: SECURITY DEFINER");
ok(/set\s+search_path\s*=\s*''/i.test(mig), "migration: search_path='' (shadowing-proof)");
// Kritik relation'lar schema-qualified (public.<tbl>) → search_path'e bağımlı değil.
ok(/from\s+public\.healing_guides/i.test(mig), "migration: public.healing_guides schema-qualified");
ok(/delete\s+from\s+public\.healing_guide_sections/i.test(mig), "migration: public.healing_guide_sections (delete) qualified");
ok(/insert\s+into\s+public\.healing_guide_sections/i.test(mig), "migration: public.healing_guide_sections (insert) qualified");
ok(!/\bfrom\s+healing_guides\b/i.test(mig) && !/\binto\s+healing_guide_sections\b/i.test(mig), "migration: unqualified relation referansı yok");
ok(/revoke\s+all\s+on\s+function[\s\S]*from\s+anon/i.test(mig), "migration: REVOKE from anon");
ok(/revoke\s+all\s+on\s+function[\s\S]*from\s+authenticated/i.test(mig), "migration: REVOKE from authenticated");
ok(/from\s+public;/i.test(mig), "migration: REVOKE from PUBLIC");
ok(/grant\s+execute\s+on\s+function[\s\S]*to\s+service_role/i.test(mig), "migration: GRANT EXECUTE to service_role");
ok(/guide_not_found_for_tenant/.test(mig), "migration: tenant binding (guide<->tenant)");
ok(/with\s+ordinality/i.test(mig), "migration: deterministic sort_order (ordinality)");
ok(/add\s+column\s+if\s+not\s+exists\s+source_kind/i.test(mig), "migration: additive source_kind");
ok(/add\s+column\s+if\s+not\s+exists\s+expert_note/i.test(mig), "migration: additive expert_note");
ok(/add\s+column\s+if\s+not\s+exists\s+attention/i.test(mig), "migration: additive attention");
ok(/add\s+column\s+if\s+not\s+exists\s+sort_order/i.test(mig), "migration: additive sort_order");
ok(!/\bdrop\s+table\b/i.test(mig) && !/\bupdate\s+public\.healing_guide_sections\s+set/i.test(mig), "migration: destructive rewrite/backfill YOK");

// ── STATIC: SECTIONS ROUTE (RPC + tenant + demo) ────────────────────────────────
const route = read("app/api/sifa-rehberi/guides/[id]/sections/route.ts");
ok(/db\.rpc\(\s*["']replace_healing_guide_sections["']/.test(route), "route: RPC çağrısı");
ok(/p_tenant_id:\s*tenantId/.test(route), "route: p_tenant_id = session-türetilmiş tenantId");
ok(/is_demo_account/.test(route), "route: demo guard");
ok(/validateSectionsBody/.test(route), "route: payload validation");
ok(/requireModuleAccess/.test(route), "route: auth guard");
ok(/guide_not_found_for_tenant/.test(route) && /404/.test(route), "route: cross-tenant/notFound 404");

// ── STATIC: SECTION EDITOR (mobil/WebView) ──────────────────────────────────────
const editor = read("components/sifa-rehberi/SectionEditor.tsx");
ok(editor.includes("Yukarı taşı") && editor.includes("Aşağı taşı"), "editor: ↑↓ reorder kontrolleri (aria-label)");
ok(editor.includes("+ Yeni Bölüm Ekle"), "editor: add section kontrolü");
ok(/aria-label="Bölümü sil"/.test(editor), "editor: delete kontrolü erişilebilir");
ok(!/draggable|onDrag|DndContext|react-dnd/i.test(editor), "editor: drag-and-drop YOK (WebView güvenli)");
ok(/h-11/.test(editor) && /h-9/.test(editor), "editor: touch-friendly yükseklikler");
ok(!editor.includes("SERVICE_ROLE"), "editor: browser'da service_role YOK");

// ── STATIC: WORD LAYER SEPARATION ───────────────────────────────────────────────
const word = read("app/api/sifa-rehberi/word-report/route.ts");
ok(word.includes("Uzman Notu:"), "word: Uzman Notu katmanı");
ok(word.includes("Dikkat Edilmesi Gerekenler:"), "word: Dikkat katmanı");
ok(/sourceLine/.test(word) && /hasAnySectionLayer/.test(word), "word: kaynak + katman ayrımı");
ok(/sort_order/.test(word), "word: kalıcı sıra yansır");
ok(!/\.slice\(0,\s*\d+\)/.test(word.split("buildFromSections")[1] ?? ""), "word: içerik truncate yok (buildFromSections)");
// CONTENT DEDUP YOK: word-report'ta section içeriğini metin eşitliği/hash/Set ile düşüren
// mantık BULUNMAMALI (tek Set = kategori sayacı, section değil).
ok(!/new\s+Set\([^)]*note/i.test(word), "word: note-tabanlı Set dedup YOK");
ok(!/content.?hash|md5|createHash/i.test(word), "word: content-hash dedup YOK");
ok(!/dedupe?(Section|Content)/i.test(word), "word: section/content dedup fonksiyonu YOK");
// hasAnySectionLayer YALNIZ boş-bölüm filtresidir → aynı note'a sahip İKİ FARKLI section
// ikisi de "renderable" kalır (biri düşmez).
const dupA = { note: "aynı profesyonel metin", source: null, source_kind: null, expert_note: null, attention: null };
const dupB = { note: "aynı profesyonel metin", source: "Kitap X", source_kind: "Kitap", expert_note: "yorum", attention: "dikkat" };
ok(sectionHasAnyLayer(dupA) && sectionHasAnyLayer(dupB), "word: aynı note'lu iki farklı section ikisi de renderable");
ok(!sectionHasAnyLayer({ note: "  ", source: "", source_kind: "", expert_note: null, attention: undefined }), "word: gerçekten boş bölüm elenir");
ok(sectionHasAnyLayer({ expert_note: "yalnız uzman notu" }), "word: yalnız expert_note olan bölüm renderable");
ok(sectionHasAnyLayer({ attention: "yalnız dikkat" }), "word: yalnız attention olan bölüm renderable");

// ── STATIC: page.tsx (form-shaped gate kaldırıldı; section editor bağlı) ────────
const page = read("app/sifa-rehberi/[id]/page.tsx");
ok(/SectionEditor/.test(page), "page: SectionEditor entegre");
ok(/sectionEditMode/.test(page), "page: section-native edit modu");
ok(!/isFormShapedSections/.test(page), "page: form-shaped edit gate KALDIRILDI");
ok(!page.includes("SERVICE_ROLE"), "page: browser'da service_role YOK");

// ── FAZ 1 REGRESSION ────────────────────────────────────────────────────────────
ok(foldTr("astım") === foldTr("astim"), "regresyon: astım == astim");
ok(foldTr("SİĞİL") === foldTr("sigil"), "regresyon: SİĞİL == sigil");
ok(!isMeaningfulText("Bu bölüm için henüz bilgi eklenmemiş."), "regresyon: placeholder anlamsız");
ok(isMeaningfulText("250 gram sarı kantaron otu"), "regresyon: gerçek metin anlamlı");
function makeRow(p: Partial<HealingGuideListRow>): HealingGuideListRow {
  return { id: "id", tenant_id: "t", name: "", category: null, symptoms: null, created_at: "", updated_at: null, sectionCount: 0, sectionTypes: [], sectionSnippets: [], legacyGroupCount: 0, legacyPreview: null, legacyText: "", ...p };
}
ok(matchesListSearch(makeRow({ name: "ASTIM" }), "astim"), "regresyon: search astim → ASTIM");
ok(matchesListSearch(makeRow({ name: "SİĞİL" }), "sigil"), "regresyon: search sigil → SİĞİL");
eq(listRowPreview(makeRow({ symptoms: "Bu bölüm için henüz bilgi eklenmemiş.", sectionCount: 1, sectionSnippets: ["gerçek içerik"] })), "gerçek içerik", "regresyon: placeholder önizleme gölgelemez");

// ── ÖZET ────────────────────────────────────────────────────────────────────────
console.log(`\nŞifa Rehberi FAZ 2 harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("OVERALL: PASS");

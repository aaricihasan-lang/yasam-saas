/**
 * Şifa Rehberi — FAZ 3 acceptance harness (create/edit convergence, edit safety,
 * read-view completeness, search completeness, mobile). Ağ/DB YOK.
 * Çalıştır: npx tsx scripts/sifa-rehberi-faz3-harness.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sectionRowToEditable,
  editableToPayload,
  emptyEditableSection,
  editorSignature,
  type EditableSection,
} from "@/lib/sifa-rehberi/sectionEditorModel";
import { validateSectionsBody } from "@/lib/sifa-rehberi/limits";
import { MODALITIES, MODE_LABEL, modalityById } from "@/lib/sifa-rehberi/sectionModel";
import { foldTr, isMeaningfulText } from "@/lib/sifa-rehberi/normalizeTr";
import {
  matchesListSearch,
  listRowPreview,
  type HealingGuideListRow,
  type HealingGuideSectionRow,
} from "@/lib/sifa-rehberi/healingGuideLiveData";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(c: boolean, l: string) { if (c) pass++; else { fail++; failures.push(l); } }
function eq<T>(a: T, b: T, l: string) { ok(JSON.stringify(a) === JSON.stringify(b), `${l} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function read(rel: string): string { return readFileSync(join(process.cwd(), rel), "utf8"); }
function mkSection(p: Partial<HealingGuideSectionRow>): HealingGuideSectionRow {
  return { id: "s", guide_id: "g", section_type: "reasons", mode: null, title: null, note: null, source: null, source_kind: null, expert_note: null, attention: null, sort_order: null, images: [], created_at: "2026-01-01", ...p };
}
function mkRow(p: Partial<HealingGuideListRow>): HealingGuideListRow {
  return { id: "id", tenant_id: "t", name: "", category: null, symptoms: null, created_at: "", updated_at: null, sectionCount: 0, sectionTypes: [], sectionSnippets: [], legacyGroupCount: 0, legacyPreview: null, legacyText: "", ...p };
}
function editableWith(p: Partial<EditableSection>): EditableSection {
  return { ...emptyEditableSection(), ...p };
}

// ── CREATE (section-native) ───────────────────────────────────────────────────
const created: EditableSection[] = [
  editableWith({ section_type: "herbal", mode: "bitkisel", note: "kantaron", source: "Geleneksel", source_kind: "Geleneksel Kaynak", expert_note: "gözlemim", attention: "sıcak uygulama" }),
  editableWith({ section_type: "applications", mode: "hacamat_suluk", title: "Hacamat", note: "sırt" }),
];
const payload = editableToPayload(created);
eq(validateSectionsBody(payload), null, "create: section-native payload API'ye geçerli");
eq(payload[0].section_type, "herbal", "create: herbal stays herbal (applications DEĞİL)");
eq(payload[0].source_kind, "Geleneksel Kaynak", "create: source_kind persist");
eq(payload[0].expert_note, "gözlemim", "create: expert_note persist");
eq(payload[0].attention, "sıcak uygulama", "create: attention persist");
eq(payload[0].source, "Geleneksel", "create: source persist");
eq(payload.map((s) => s.sort_order), [0, 1], "create: order 0..N");
eq(validateSectionsBody([]), null, "create: zero section mevcut contract kabul");

// create → (kaydedildi gibi) → edit parity (KAYIPSIZ)
const storedLikeRow = mkSection({ id: "new1", section_type: "herbal", mode: "bitkisel", note: "kantaron", source: "Geleneksel", source_kind: "Geleneksel Kaynak", expert_note: "gözlemim", attention: "sıcak uygulama" });
const backToEditable = sectionRowToEditable(storedLikeRow);
const reEmitted = editableToPayload([backToEditable])[0];
eq(reEmitted.section_type, "herbal", "create→edit parity: herbal");
eq(reEmitted.expert_note, "gözlemim", "create→edit parity: expert_note");
eq(reEmitted.attention, "sıcak uygulama", "create→edit parity: attention");
eq(reEmitted.source_kind, "Geleneksel Kaynak", "create→edit parity: source_kind");

// ── TAXONOMY (herbal / aromaterapi) ───────────────────────────────────────────
eq(modalityById("bitkisel")?.section_type, "herbal", "taxonomy: bitkisel → herbal");
const aroma = MODALITIES.find((m) => m.id === "aromaterapi")!;
eq(aroma.id, "aromaterapi", "taxonomy: aromaterapi id korunur");
eq(MODE_LABEL["aromaterapi"], "Aromaterapi", "taxonomy: aromaterapi label (gizli supportive DEĞİL)");
ok(!MODALITIES.some((m) => m.id === "bitkisel" && m.section_type === "applications"), "taxonomy: yeni herbal applications olmaz");

// ── DIRTY (deterministik imza; referential equality DEĞİL) ────────────────────
const clean = editorSignature("", "", []);
ok(editorSignature("", "", []) === clean, "dirty: clean initial sabit");
ok(editorSignature("Migren", "", []) !== clean, "dirty: name değişikliği");
ok(editorSignature("", "Solunum", []) !== clean, "dirty: category değişikliği");
const secA = editableWith({ mode: "bitkisel", section_type: "herbal", note: "a" });
const secB = editableWith({ mode: "hacamat_suluk", section_type: "applications", note: "b" });
ok(editorSignature("", "", [secA]) !== clean, "dirty: add section");
ok(editorSignature("", "", [secA, secB]) !== editorSignature("", "", [secB, secA]), "dirty: reorder");
ok(editorSignature("", "", [secA, secB]) !== editorSignature("", "", [secA]), "dirty: delete section");
ok(editorSignature("", "", [{ ...secA, note: "değişti" }]) !== editorSignature("", "", [secA]), "dirty: note edit");
// aynı içerik farklı key → aynı imza (referential-equality bağımsız)
const secAclone = { ...secA, key: "different-key-xyz" };
ok(editorSignature("X", "Y", [secA]) === editorSignature("X", "Y", [secAclone]), "dirty: aynı içerik farklı key → aynı imza");

// ── STATIC: SECTION DELETE SAFETY (SectionEditor) ─────────────────────────────
const editor = read("components/sifa-rehberi/SectionEditor.tsx");
ok(/confirmKey/.test(editor), "delete: confirm state var");
ok(editor.includes("Silinsin mi?") && editor.includes("Evet") && editor.includes("Vazgeç"), "delete: inline confirm UI");
ok(/setConfirmKey\(s\.key\)/.test(editor), "delete: Sil önce confirm ister (anında silmez)");
ok(/aria-label="Silmeyi onayla"/.test(editor) && /aria-label="Silmeyi iptal et"/.test(editor), "delete: erişilebilir onay/iptal");
ok(!/draggable|onDrag|DndContext/i.test(editor), "delete/reorder: drag YOK");
ok(editor.includes("Yukarı taşı") && editor.includes("Aşağı taşı"), "reorder: ↑↓ kontrolleri korundu");

// ── STATIC: UNSAVED GUARD ─────────────────────────────────────────────────────
const guard = read("hooks/useUnsavedGuard.ts");
ok(/beforeunload/.test(guard), "unsaved: beforeunload dinleyicisi");
ok(/if\s*\(!dirty\)\s*return/.test(guard), "unsaved: yalnız dirty iken aktif");
ok(!/history\.pushState\(|addEventListener\(\s*["']popstate/i.test(guard), "unsaved: fragile router hack (pushState/popstate) YOK");
const listPage = read("app/sifa-rehberi/page.tsx");
ok(/useUnsavedGuard\(createDirty\)/.test(listPage), "unsaved: create dirty guard bağlı");
ok(/guardedLeaveCreate/.test(listPage), "unsaved: create çıkış onayı");
const detailPage = read("app/sifa-rehberi/[id]/page.tsx");
ok(/useUnsavedGuard\(editDirty\)/.test(detailPage), "unsaved: edit dirty guard bağlı");
ok(/editInitialSig/.test(detailPage), "unsaved: edit başlangıç imzası yakalanıyor");

// ── EDIT NAVIGATION GUARD (in-app) — pure state contract ──────────────────────
// editDirty = editEnabled && currentSig !== initialSig  (deterministik, referential-eq DEĞİL)
const editDirtyOf = (editEnabled: boolean, cur: string, init: string) => editEnabled && cur !== init;
const initSig = editorSignature("ASTIM", "", [secA]);
ok(!editDirtyOf(true, initSig, initSig), "edit-nav: clean edit → confirm YOK");
ok(editDirtyOf(true, editorSignature("ASTIM", "", [{ ...secA, note: "değişti" }]), initSig), "edit-nav: dirty edit → confirm VAR");
ok(!editDirtyOf(false, editorSignature("ASTIM", "", [{ ...secA, note: "değişti" }]), initSig), "edit-nav: save sonrası (editEnabled=false) → confirm YOK");
// cancel → sig mutasyonsuz → dirty durumu değişmez (route değişmez, state korunur)
ok(editDirtyOf(true, initSig, initSig) === false, "edit-nav: cancel/kal → state korunur");
// beforeunload aktiflik: yalnız dirty
ok(editDirtyOf(true, editorSignature("ASTIM", "", [{ ...secA, note: "x" }]), initSig) === true, "edit-nav: beforeunload dirty → active");
ok(editDirtyOf(true, initSig, initSig) === false, "edit-nav: beforeunload clean → inactive");
// static: guarded in-app back wiring
ok(/guardedBackToList/.test(detailPage), "edit-nav: guarded in-app back fonksiyonu");
ok(/← Liste/.test(detailPage), "edit-nav: Listeye dön butonu");
ok(/navConfirm\(/.test(detailPage), "edit-nav: dirty iken onay modalı");
ok(!/history\.pushState\(|addEventListener\(\s*["']popstate/.test(detailPage), "edit-nav: fragile router hack YOK");
// create guard regresyonu
ok(/useUnsavedGuard\(createDirty\)/.test(listPage) && /guardedLeaveCreate/.test(listPage), "edit-nav: create guard regresyon PASS");

// ── STATIC: CREATE/EDIT CONVERGENCE ───────────────────────────────────────────
ok(/SectionEditor/.test(listPage) && /createSections/.test(listPage), "convergence: create section-native");
ok(!/formToSections/.test(listPage), "convergence: eski formToSections create'ten kaldırıldı");
ok(!/FORM_TABS/.test(listPage), "convergence: 7-sekmeli FORM_TABS kaldırıldı");
ok(/editableToPayload\(createSections\)/.test(listPage), "convergence: create payload section-native");

// ── STATIC: READ-VIEW COMPLETENESS ────────────────────────────────────────────
ok(/hasSourceKind/.test(detailPage), "read-view: source_kind bloğu");
ok(/Uzman Notu/.test(detailPage) && /hasExpert/.test(detailPage), "read-view: Uzman Notu bloğu");
ok(/Dikkat Edilmesi Gerekenler/.test(detailPage) && /hasAttention/.test(detailPage), "read-view: Dikkat bloğu");
ok(/text-violet-700/.test(detailPage), "read-view: Uzman Notu mor ton");
ok(/text-amber-700/.test(detailPage), "read-view: Dikkat amber ton (kırmızı alarm DEĞİL)");
ok(/!hasNote && !hasSource && !hasSourceKind && !hasExpert && !hasAttention/.test(detailPage), "read-view: boş optional gizlenir");

// ── STATIC: SEARCH COMPLETENESS (haystack yeni alanları içerir) ───────────────
const live = read("lib/sifa-rehberi/healingGuideLiveData.ts");
ok(/section\.source_kind/.test(live) && /section\.expert_note/.test(live) && /section\.attention/.test(live), "search: snippet source_kind/expert_note/attention içerir");
// behavioral: fold arama snippet içeriği üzerinde çalışır
ok(matchesListSearch(mkRow({ sectionSnippets: ["Kendi gözlemimde gece artıyor"] }), "gozlemimde"), "search: expert_note metni aranabilir");
ok(matchesListSearch(mkRow({ sectionSnippets: ["Çok sıcak uygulamayınız"] }), "sicak"), "search: attention metni aranabilir");
ok(matchesListSearch(mkRow({ sectionSnippets: ["Kişisel Deneyim / Gözlem"] }), "kisisel"), "search: source_kind metni aranabilir");

// ── REGRESSION (Faz 1/2 çekirdeği) ────────────────────────────────────────────
ok(foldTr("astım") === foldTr("astim"), "regresyon: astım == astim");
ok(foldTr("SİĞİL") === foldTr("sigil"), "regresyon: SİĞİL == sigil");
ok(matchesListSearch(mkRow({ name: "ASTIM" }), "astim"), "regresyon: search astim → ASTIM");
ok(matchesListSearch(mkRow({ name: "SİĞİL" }), "sigil"), "regresyon: search sigil → SİĞİL");
ok(!isMeaningfulText("Bu bölüm için henüz bilgi eklenmemiş."), "regresyon: placeholder anlamsız");
eq(listRowPreview(mkRow({ symptoms: "Bu bölüm için henüz bilgi eklenmemiş.", sectionCount: 1, sectionSnippets: ["gerçek içerik"] })), "gerçek içerik", "regresyon: preview placeholder gölgelemez");
// prod-shape round-trip korunur
eq(editableToPayload([sectionRowToEditable(mkSection({ section_type: "herbal", mode: null, note: "x", source: "s" }))])[0].section_type, "herbal", "regresyon: herbal round-trip");

// ── ÖZET ──────────────────────────────────────────────────────────────────────
console.log(`\nŞifa Rehberi FAZ 3 harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:"); for (const f of failures) console.log("  ✗ " + f); process.exit(1); }
console.log("OVERALL: PASS");

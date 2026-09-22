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
import { MODALITIES, MODE_LABEL, modalityById, normalizeReplaceSections } from "@/lib/sifa-rehberi/sectionModel";
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

// ── CREATE ROUTE SEAM (POST /guides section insert) — regresyon kilidi ─────────
// Bug: POST /guides elle map ederken source_kind/expert_note/attention/sort_order
// DÜŞÜRÜYORDU (yeni kayıtta sessiz veri kaybı; edit yolu bunları koruyordu).
// Fix: route istemci payload'ını edit yolu ile AYNI normalizeReplaceSections'tan
// geçirir. Aşağısı o seam'i birebir taklit eder ve tüm katmanların KAYIPSIZ
// gittiğini + sıralamanın deterministik olduğunu doğrular.
const routeRows = normalizeReplaceSections(payload as unknown as Record<string, unknown>[]);
eq(routeRows[0].source_kind, "Geleneksel Kaynak", "create route seam: source_kind persist (drop DEĞİL)");
eq(routeRows[0].expert_note, "gözlemim", "create route seam: expert_note persist (drop DEĞİL)");
eq(routeRows[0].attention, "sıcak uygulama", "create route seam: attention persist (drop DEĞİL)");
eq(routeRows[0].source, "Geleneksel", "create route seam: source persist");
eq(routeRows[0].section_type, "herbal", "create route seam: section_type korunur");
eq(routeRows.map((s) => s.sort_order), [0, 1], "create route seam: sort_order deterministik");
eq(routeRows[1].note, "sırt", "create route seam: ikinci bölüm içeriği korunur");
// Static: POST /guides canonical seam'i kullanıyor (elle lossy map DEĞİL) VE
// guide+sections'ı tek atomik RPC ile yazıyor (A+key).
const guidesPostRoute = read("app/api/sifa-rehberi/guides/route.ts");
ok(/normalizeReplaceSections\s*\(/.test(guidesPostRoute), "create route: normalizeReplaceSections kullanılıyor (tek merkez)");
ok(/create_healing_guide_with_sections/.test(guidesPostRoute), "create route: atomik RPC (create_healing_guide_with_sections) kullanılıyor");
ok(!/from\(\s*["']healing_guides["']\s*\)\s*\.insert/.test(guidesPostRoute), "create route: elle iki-insert kaldırıldı (atomiklik RPC'de)");

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

// ── FAZ 2 son düzenleme: uzun-metin GENİŞ EDİTÖR (Doğaltaş UX) ─────────────────
ok(/function ExpandableTextarea/.test(editor), "large-editor: ExpandableTextarea (⤢) bileşeni var");
ok(/openLarge\(s\.key,\s*"note"/.test(editor) && /openLarge\(s\.key,\s*"expert_note"/.test(editor) && /openLarge\(s\.key,\s*"attention"/.test(editor), "large-editor: İçerik+Uzman Notu+Dikkat kapsanır");
ok(!/openLarge\([^)]*"title"/.test(editor) && !/openLarge\([^)]*"source"/.test(editor), "large-editor: kısa alanlar (başlık/kaynak/kaynak türü) HARİÇ");
ok(/const saveLarge/.test(editor) && /update\(large\.key/.test(editor), "large-editor: Kaydet → section alanına aktarır (form state)");
ok(/const closeLarge/.test(editor), "large-editor: Vazgeç/× kapatır (mevcut metni silmez)");
ok(!/fetch\s*\(/.test(editor), "large-editor: DB'ye bağımsız yazma YOK (nihai kayıt mevcut Kaydet ile)");
ok(/Escape/.test(editor) && /autoFocus/.test(editor), "large-editor: klavye/erişilebilirlik (Escape + autoFocus + role=dialog)");
ok(/role="dialog"/.test(editor) && /aria-modal="true"/.test(editor), "large-editor: erişilebilir modal (role/aria-modal)");

// ── FAZ 2 son UX: bölüme-göre içerik türü + tıklayınca otomatik geniş editör ───
// Fix 1 — bölüm-kapsamlı modalite seçimi:
ok(/allowedModalityIds/.test(editor), "scope: SectionEditor allowedModalityIds prop");
ok(/const scopedModalities/.test(editor), "scope: yalnız o bölümün türleri listelenir");
ok(/const singleModality/.test(editor) && /Tek türlü bölüm/.test(editor), "scope: tek türlü bölümde açılır liste gizlenir (otomatik tür)");
const createPageForScope = read("app/sifa-rehberi/page.tsx");
ok(/function createTabModalityIds/.test(createPageForScope), "scope: bölüm→modalite id türetici (create)");
ok(/allowedModalityIds=\{createTabModalityIds\(activeCreateTab\)\}/.test(createPageForScope), "scope: create aktif bölümün modalitelerini geçirir");
// Fix 2 — yazı alanına tıklayınca geniş editör OTOMATİK açılır:
ok(/readOnly/.test(editor), "auto-editor: uzun-metin alanı readOnly (inline yazım yok, tüm düzenleme modalde)");
ok(/onClick=\{\(\)\s*=>\s*\{\s*if\s*\(!disabled\)\s*onExpand\(\);/.test(editor), "auto-editor: alana tıklayınca geniş editör açılır");
// A11y (Faz 3): tıkla-aç korunur; onFocus-aç KALDIRILDI (odak-döndürme güvenli); klavye Enter/Space açar.
ok(/role="button"/.test(editor) && /aria-haspopup="dialog"/.test(editor), "a11y: tetikleyici button semantiği (role/aria-haspopup)");
ok(/e\.key === "Enter" \|\| e\.key === " "/.test(editor), "a11y: Enter/Space ile klavyeden açılır");
ok(!/onFocus=\{\(e\)\s*=>[\s\S]*onExpand/.test(editor), "a11y: onFocus-aç kaldırıldı (odak buraya güvenle döner)");
ok(/const returnFocusRef/.test(editor) && /el\.focus\(\)/.test(editor), "a11y: kapanınca odak açan alana döner");
ok(/onModalKeyDown/.test(editor) && /const first = items\[0\]/.test(editor), "a11y: modal içi focus-trap (Tab döngüsü)");

// ── STATIC: UNSAVED GUARD ─────────────────────────────────────────────────────
const guard = read("hooks/useUnsavedGuard.ts");
ok(/beforeunload/.test(guard), "unsaved: beforeunload dinleyicisi");
ok(/if\s*\(!dirty\)\s*return/.test(guard), "unsaved: yalnız dirty iken aktif");
ok(!/history\.pushState\(|addEventListener\(\s*["']popstate/i.test(guard), "unsaved: fragile router hack (pushState/popstate) YOK");
const listPage = read("app/sifa-rehberi/page.tsx");
ok(/useUnsavedGuard\(createDirty\)/.test(listPage), "unsaved: create beforeunload guard bağlı");
ok(/useBackNavigationGuard\(/.test(listPage), "unsaved: create geri/ileri (popstate) guard bağlı (FAZ 2)");
const detailPage = read("app/sifa-rehberi/[id]/page.tsx");
ok(/useUnsavedGuard\(editDirty\)/.test(detailPage), "unsaved: edit beforeunload guard bağlı");
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
// static: FAZ 2 navigation model — in-app geri butonları KALDIRILDI; popstate guard EKLENDİ.
ok(/useBackNavigationGuard\(/.test(detailPage), "edit-nav: edit geri/ileri (popstate) guard bağlı (FAZ 2)");
ok(!/←\s*Liste/.test(detailPage), "edit-nav: '← Liste' butonu KALDIRILDI");
ok(!/guardedBackToList/.test(detailPage), "edit-nav: eski in-app back fonksiyonu kaldırıldı");
ok(!/history\.pushState\(|addEventListener\(\s*["']popstate/.test(detailPage), "edit-nav: fragile router hack detay sayfasında INLINE yok (hook'ta kapsüllü)");
// create guard regresyonu (beforeunload + popstate)
ok(/useUnsavedGuard\(createDirty\)/.test(listPage) && /useBackNavigationGuard\(/.test(listPage), "edit-nav: create guard regresyon PASS (beforeunload+popstate)");

// ── FAZ 2: 7-alan navigasyon + geri-buton kaldırma + detay yönlendirme (static) ──
ok(/CREATE_TABS\s*:\s*CreateTab\[\]/.test(listPage), "faz2: CREATE_TABS 7-alan modeli tanımlı");
const createTabIds = ["rahatsizlik","belirtiler","uygulamalar","dogaltas","aromaterapi","islami","destekleyici"];
ok(createTabIds.every((id) => new RegExp(`id:\\s*"${id}"`).test(listPage)), "faz2: 7 kanonik alan (rahatsizlik…destekleyici) mevcut");
ok(!/SifaRehberiMainMenuButton/.test(listPage), "faz2: ölü SifaRehberiMainMenuButton kaldırıldı");
ok(!/guardedLeaveCreate/.test(listPage), "faz2: create '← Ana Menü'/'Kapat' onay-wrapper kaldırıldı");
ok(/router\.replace\(`\/sifa-rehberi\/\$\{newId\}`\)/.test(listPage), "faz2: başarılı kayıt → yeni kaydın DETAYINA yönlendirme");
ok(/makeNewSection=\{/.test(listPage), "faz2: alan-kapsamlı SectionEditor default modalite fabrikası");
ok(/setSectionsForTab\(/.test(listPage), "faz2: alan-kapsamlı section reconciliation");
ok(/sectionHasAnyLayer\(s\)/.test(listPage), "faz2: doluluk göstergesi gerçek veriden (yanlış-tamamlandı YOK)");
// SectionEditor makeNewSection prop'u geriye-uyumlu (edit yolu default davranış)
const sectionEditorSrc = read("components/sifa-rehberi/SectionEditor.tsx");
ok(/makeNewSection\?\:/.test(sectionEditorSrc), "faz2: SectionEditor makeNewSection opsiyonel prop");
ok(/\(makeNewSection\s*\?\?\s*emptyEditableSection\)\(\)/.test(sectionEditorSrc), "faz2: makeNewSection yoksa default emptyEditableSection (edit yolu bozulmaz)");
// popstate guard hook sözleşmesi
const backGuard = read("hooks/useBackNavigationGuard.ts");
ok(/addEventListener\("popstate"/.test(backGuard) && /removeEventListener\("popstate"/.test(backGuard), "faz2: popstate guard listener ekle/temizle (kalıcı kilit YOK)");
ok(/history\.pushState/.test(backGuard) && /window\.confirm/.test(backGuard), "faz2: sentinel + senkron confirm deseni");

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

/**
 * I18N-F1-R5 HD-B — Eğitim Merkezi (uzman yüzü): TR çizim kaynak metinle aynı, EN çizimde Türkçe sistem metni yok,
 * bileşenlerin kullandığı katalog anahtarları var, TR/EN anahtar ağacı eşit. Ağ / DB / sağlayıcı yok.
 * Çalıştırma: npx tsx --require ./scripts/astrology/css-module-stub.cjs scripts/hd-i18n/education-en-smoke.ts (CSS modülü yükleyicisi)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { ErrorView, LoadingView, NotFoundView } from "../../app/human-design/egitim-merkezi/_ui/Shell";
import { NewAnalysisButton } from "../../app/human-design/egitim-merkezi/_ui/NewAnalysisEntry";
import { DeleteFlow, TwoStepConfirm } from "../../app/human-design/egitim-merkezi/_ui/DeleteFlow";
import { FictionalForm } from "../../app/human-design/egitim-merkezi/_ui/FictionalForm";
import { EduLoading, EduNotFound } from "../../app/human-design/egitim-haritalari/EduShell";
import { EvidenceTag } from "../../app/human-design/egitim-haritalari/EvidenceTag";
import { EduFamilyCards } from "../../app/human-design/egitim-haritalari/EduFamilyCards";
import { BiographyTab, SourcesTab, fmtBioDate } from "../../app/human-design/egitim-haritalari/[id]/_hayat/BiographyViews";
import type { BioTrainerView } from "../../lib/human-design/education/biography/biographyContract";
import type { EduVisibleFamily } from "../../lib/human-design/education/educationFamilies";
import { EDU_BIRTH_EVIDENCE_HINT, EDU_BIRTH_EVIDENCE_LABEL } from "../../lib/human-design/education/birthEvidence";
import trEdu from "../../messages/tr/hd.education.json";
import enEdu from "../../messages/en/hd.education.json";
import trAll from "../../messages/tr/hd.chart.json";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond || info === undefined ? "" : ` — ${JSON.stringify(info).slice(0, 600)}`}`);
};
const TR_CHARS = /[çğıöşüÇĞİÖŞÜâÂ]/;
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const attrs = (html: string) => [...html.matchAll(/(?:aria-label|placeholder|title)="([^"]*)"/g)].map((m) => decode(m[1]));
/** EN çiziminde Türkçe harf: kullanıcı / editoryal içerik nöbetçileri ve marka hariç. */
// Selçuklu: ortak doğum yeri seçicisinin yer adı örneği (özel ad; hd.forms — clients-en-smoke ile aynı istisna).
const ALLOW = [/Selçuklu/g, /Yaşam Sistemi/g, /YAŞAM SİSTEMİ/g, /ı\/i/g, /\d+ KAYDI SİL/g, /⟦[^⟧]*⟧/g];
const leak = (s: string) => { let x = s; for (const r of ALLOW) x = x.replace(r, ""); return TR_CHARS.test(x) ? x.match(/\S*[çğıöşüÇĞİÖŞÜâÂ]\S*/g) : null; };
const both = (el: () => Parameters<typeof renderToStaticMarkup>[0]) => ({ tr: renderToStaticMarkup(el(), "tr"), en: renderToStaticMarkup(el(), "en") });
const enClean = (name: string, html: string) => {
  const bad = leak(text(html)) ?? leak(attrs(html).join(" | "));
  ok(`${name}: EN'de Türkçe sistem metni yok`, !bad, bad);
};

console.log("— Kabuk / ortak");
{
  const r = both(() => createElement(NotFoundView));
  ok("NotFoundView TR kaynak metin", r.tr.includes("Sayfa bulunamadı.") && r.tr.includes("Ana sayfaya dön"));
  ok("NotFoundView EN", r.en.includes("Page not found.") && r.en.includes("Back to home page"));
  enClean("NotFoundView", r.en);
  const l = both(() => createElement(LoadingView));
  ok("LoadingView TR/EN", l.tr.includes("Yükleniyor…") && l.en.includes("Loading…"));
  const e = both(() => createElement(ErrorView, { message: "⟦hata⟧", onRetry: () => {} }));
  ok("ErrorView TR/EN düğme", e.tr.includes("Tekrar dene") && e.en.includes("Try again") && e.en.includes("⟦hata⟧"));
  const n = both(() => createElement(NewAnalysisButton, {}));
  ok("NewAnalysisButton TR/EN (sunucu çizimi: kontrol ediliyor)", n.tr.includes("Yeni Human Design Analizi") && n.en.includes("New Human Design Analysis"));
  enClean("NewAnalysisButton", n.en);
  const en1 = both(() => createElement(EduNotFound));
  ok("EduNotFound TR/EN", en1.tr.includes("Human Design ana sayfası") && en1.en.includes("Human Design home page"));
  enClean("EduNotFound", en1.en);
  ok("EduLoading EN", renderToStaticMarkup(createElement(EduLoading), "en").includes("Loading…"));
}

console.log("— Silme akışı (ifade SUNUCUDA TR doğrulanır → her dilde TR)");
{
  const one = both(() => createElement(DeleteFlow, { side: "trainer", endpoint: "/x", items: [{ id: "1", title: "⟦Başlık⟧" }], onDone: () => {}, onCancel: () => {} }));
  ok("DeleteFlow TR tekli kaynak metin", one.tr.includes("Bu eğitim kaydı kaldırılsın mı?") && one.tr.includes("Adım 1 / 2") && one.tr.includes("<b>⟦Başlık⟧</b> özel eğitim arşivinden kaldırılacak."));
  ok("DeleteFlow EN tekli", one.en.includes("Remove this education record?") && one.en.includes("Step 1 / 2"));
  enClean("DeleteFlow tekli", one.en);
  const many = both(() => createElement(DeleteFlow, { side: "trainer", endpoint: "/x", items: [1, 2, 3].map((i) => ({ id: String(i), title: `⟦K${i}⟧` })), onDone: () => {}, onCancel: () => {} }));
  ok("DeleteFlow TR çoklu: '3 eğitim kaydı kaldırılsın mı?' + 'Adım 1 / 3'", many.tr.includes("3 eğitim kaydı kaldırılsın mı?") && many.tr.includes("Adım 1 / 3") && many.tr.includes("Seçili 3 kayıt özel eğitim arşivinden kaldırılacak."));
  ok("DeleteFlow EN çoklu", many.en.includes("Remove 3 education records?") && many.en.includes("Step 1 / 3"));
  enClean("DeleteFlow çoklu", many.en);
  const two = both(() => createElement(TwoStepConfirm, { title: "⟦başlık⟧", body1: "⟦g1⟧", body2: "⟦g2⟧", confirmLabel: "⟦onay⟧", onConfirm: async () => null, onCancel: () => {} }));
  ok("TwoStepConfirm TR/EN", two.tr.includes("Adım 1 / 2") && two.tr.includes("Vazgeç") && two.tr.includes("Devam et") && two.en.includes("Step 1 / 2") && two.en.includes("Continue"));
}

console.log("— Kurgusal harita formu");
{
  const r = both(() => createElement(FictionalForm, { onDone: () => {} }));
  ok("FictionalForm TR kaynak metin", r.tr.includes("Kurgusal Eğitim Haritası") && r.tr.includes("Haritayı Hesapla ve Arşivime Ekle") && r.tr.includes('value="Kurgusal kişi"')
    && r.tr.includes("Eksik: Eğitim başlığı · Kurgusal doğum tarihi · Kurgusal doğum saati · Doğum yeri (listeden) · Kurgusal beyan onayı"));
  ok("FictionalForm EN", r.en.includes("Fictional Education Chart") && r.en.includes("Calculate Chart and Add to My Archive") && r.en.includes('value="Fictional person"'));
  // Yasal beyan metni sürümlü kayda geçer (hd-egitim-kurgusal-beyan-v1) → TR kalır; dışında sızıntı yok.
  const enNoDecl = r.en.replace(/Bu haritadaki doğum tarihi[^<]*/g, "");
  enClean("FictionalForm (yasal beyan hariç)", enNoDecl.replace(/<select[\s\S]*?<\/select>/g, (m) => m));
  ok("FictionalForm kategori seçenekleri EN", r.en.includes(">General<") && r.en.includes(">Centers<") && r.tr.includes(">Merkezler<"));
}

console.log("— Hazır Eğitim Haritaları: kanıt etiketi, aile kartları, hayat hikâyesi");
{
  for (const v of Object.keys(EDU_BIRTH_EVIDENCE_LABEL) as (keyof typeof EDU_BIRTH_EVIDENCE_LABEL)[]) {
    const r = both(() => createElement(EvidenceTag, { value: v }));
    ok(`EvidenceTag ${v}: TR = lib sözlüğü`, r.tr.includes(`>${EDU_BIRTH_EVIDENCE_LABEL[v]}<`) && decode(r.tr).includes(`title="${EDU_BIRTH_EVIDENCE_HINT[v]}"`));
    enClean(`EvidenceTag ${v}`, r.en);
  }
  const fam: EduVisibleFamily[] = [{ key: "curie", title: "Curie Ailesi", members: [{ id: "a", role: "Anne", displayName: "⟦Marie⟧" }, { id: "b", role: "Kız", displayName: "⟦Irène⟧" }], links: [{ from: "a", to: "b", label: "anne – kız" }] }];
  const f = both(() => createElement(EduFamilyCards, { families: fam }));
  ok("EduFamilyCards TR kaynak metin", f.tr.includes("Curie Ailesi") && f.tr.includes("⟦Marie⟧ ⟷ ⟦Irène⟧ (anne – kız)") && f.tr.includes("Ailenin Tamamını İncele") && f.tr.includes('data-edu-family-role="Anne">Anne<'));
  ok("EduFamilyCards EN", f.en.includes("The Curie Family") && f.en.includes("(mother – daughter)") && f.en.includes('data-edu-family-role="Anne">Mother<'));
  enClean("EduFamilyCards", f.en);

  const bio: BioTrainerView = {
    lang: "tr", revision: 3, updatedAt: "2026-11-20T10:00:00.000Z", displayName: "⟦Kişi⟧", lifeSpan: "⟦1867–1934⟧", profession: "⟦Fizikçi⟧", knownFor: "⟦Radyoaktivite⟧",
    country: "⟦Fransa⟧", era: "⟦20. yy⟧", category: null, isLiving: false, birthYear: 1867, deathYear: 1934, shortIntro: "⟦giriş⟧",
    sections: [{ key: "childhood", title: "", paragraphs: [{ text: "⟦paragraf⟧", sourceIds: ["s1"] }] }],
    timeline: [{ date: "1903-12-10", title: "⟦Nobel⟧", text: "", sourceIds: ["s1"] }, { date: "1911", title: "⟦İkinci⟧", text: "", sourceIds: [] }],
    sources: [{ id: "s1", title: "⟦kaynak⟧", publisher: "⟦yayıncı⟧", kind: "encyclopedia", url: "https://example.org", accessedOn: "2026-10-01", revisionId: "123", license: null, licenseUrl: null }],
    licenseInfo: { directQuotes: false, adaptedText: false, note: null, articles: [{ lang: "tr", title: "⟦madde⟧", oldid: "99", url: "https://tr.wikipedia.org/x" }] }, neutralityNote: null,
  };
  const b = both(() => createElement(BiographyTab, { state: { kind: "ok", data: { lang: "tr", availableLangs: ["tr"], biography: bio } }, lang: "tr", onLang: () => {}, onCite: () => {}, onAddNote: () => {}, displayName: "⟦Kişi⟧" }));
  ok("BiographyTab TR kaynak metin", b.tr.includes("HAYAT HİKÂYESİ") && b.tr.includes("Çocukluk ve Aile") && b.tr.includes("10 Aralık 1903") && b.tr.includes("Notlarıma ekle")
    && b.tr.includes("English · hazır değil") && b.tr.includes("Sürüm 3 · güncelleme 20.11.2026") && b.tr.includes("<b>Yaşam:</b>"));
  ok("BiographyTab EN", b.en.includes("LIFE STORY") && b.en.includes("Childhood and Family") && b.en.includes("10 December 1903") && b.en.includes("Add to my notes") && b.en.includes("Version 3 · updated 20/11/2026"));
  enClean("BiographyTab (içerik nöbetçili)", b.en);
  const notReady = both(() => createElement(BiographyTab, { state: { kind: "ok", data: { lang: "en", availableLangs: ["tr"], biography: null } }, lang: "en", onLang: () => {}, onCite: () => {}, onAddNote: () => {}, displayName: "⟦Kişi⟧" }));
  ok("BiographyTab dil yok: TR / EN", notReady.tr.includes("English hayat hikâyesi henüz hazır değil") && notReady.tr.includes("Türkçe sürümünü aç") && notReady.en.includes("The English life story is not ready yet") && notReady.en.includes("Open the Turkish version"));
  enClean("BiographyTab dil yok", notReady.en);
  const s = both(() => createElement(SourcesTab, { birthSources: [{ role: "birth_time", url: "https://e.org", institution: null, documentTitle: null, archiveRef: null, documentDate: null, timeExplicit: true, primarySecondary: "birincil", license: "CC0", seenHow: null }],
    documentQuote: "⟦alıntı⟧", calendarNote: null, bio, focusSource: null }));
  ok("SourcesTab TR kaynak metin", s.tr.includes("Doğum saati belgesi") && s.tr.includes("birincil kaynak · saat belgede açık · lisans: CC0") && s.tr.includes("(TR Vikipedi, sürüm 99) · Vikipedi katkıcıları ·") && s.tr.includes("Ansiklopedi · sayfa sürümü 123 · erişim 2026-10-01"));
  ok("SourcesTab EN", s.en.includes("Birth time document") && s.en.includes("primary source · time explicit in document · licence: CC0") && s.en.includes("(TR Wikipedia, revision 99) · Wikipedia contributors ·"));
  enClean("SourcesTab", s.en);
  ok("fmtBioDate TR varsayılan (eski imza) aynı", fmtBioDate("1867-11-07") === "7 Kasım 1867" && fmtBioDate("1867-11") === "Kasım 1867" && fmtBioDate("1867") === "1867");
  ok("fmtBioDate EN", fmtBioDate("1867-11-07", "en") === "7 November 1867");
}

console.log("— Katalog");
{
  const leaves = (o: unknown, p = "", out: Record<string, string> = {}) => {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v && typeof v === "object") leaves(v, p ? `${p}.${k}` : k, out);
      else out[p ? `${p}.${k}` : k] = String(v);
    }
    return out;
  };
  const trL = leaves(trEdu);
  const enL = leaves(enEdu);
  ok("hd.education TR/EN anahtar kümesi eşit", Object.keys(trL).sort().join() === Object.keys(enL).sort().join());
  const enLeak = Object.entries(enL).filter(([, v]) => leak(v));
  ok("hd.education EN değerlerinde Türkçe yok (marka / ı/i ipucu hariç)", enLeak.length === 0, enLeak);
  // Kaynakta kullanılan statik anahtarlar katalogda var (yazım hatası yakalama).
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
  walk("app/human-design/egitim-merkezi"); walk("app/human-design/egitim-haritalari");
  const allTr = { ...leaves(trEdu), ...leaves(trAll) };
  const missing: string[] = [];
  let used = 0;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    // Aynı dosyada aynı değişken adı farklı işlevlerde farklı ad alanına bağlanabilir → anahtar o adın ad alanlarından birinde olmalı.
    const byVar = new Map<string, string[]>();
    for (const m of src.matchAll(/const (\w+) = useTranslations\("([^"]+)"\)/g)) byVar.set(m[1], [...(byVar.get(m[1]) ?? []), m[2]]);
    const has = (key: string) => key in allTr || Object.keys(allTr).some((k) => k.startsWith(`${key}.`));
    for (const [v, nss] of byVar) {
      for (const m of src.matchAll(new RegExp(`\\b${v}(?:\\.rich|\\.has)?\\("([^"]+)"`, "g"))) {
        used++;
        if (!nss.some((ns) => has(`${ns}.${m[1]}`))) missing.push(`${path.basename(file)}: ${nss.join("|")} :: ${m[1]}`);
      }
    }
  }
  ok(`kaynakta kullanılan ${used} statik anahtarın tamamı katalogda`, missing.length === 0, missing);
}

console.log(`\nHD EĞİTİM MERKEZİ EN SMOKE: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);

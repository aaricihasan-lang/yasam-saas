/**
 * Stones (Doğaltaş) i18n — AŞAMA 2E final visual-UAT fix gate.
 *
 * 2E, owner Preview screenshot UAT'ında bulunan son EN copy/system-UI kusurlarını ve
 * Stone Detail fonksiyonel çökme (rules-of-hooks + Invalid Date) kapanışını doğrular.
 * Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2e-harness.mjs
 *
 * KAPSAM:
 *   A) EN copy düzeltmeleri (developer/DB-leak/awkward → native product copy)
 *   B) Canonical/persisted/query anahtarları KORUNDU (mutasyon yok)
 *   C) Hub ay etiketleri locale-aware (hardcoded "tr-TR" month kaldırıldı)
 *   D) Stone Detail çökme kök nedenleri kapatıldı (hook sırası + tarih guard)
 *   E) Knowledge "diğerleri" provenance sözleşmesi (verbatim data — çevrilmez)
 *   F) ICU/placeholder parse sağlamlığı (EN+TR tüm stones mesajları)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";

const ROOT = process.cwd();
let fail = 0;
const err = (m) => { console.log("  ❌ " + m); fail++; };
const ok = (m) => console.log("  ✅ " + m);
const rd = (p) => JSON.parse(readFileSync(join(ROOT, "messages", p), "utf8"));
const src = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (s, sub) => s.includes(sub);

const enS = rd("en/stones.json").stones, trS = rd("tr/stones.json").stones;
const enHub = rd("en/stones.hub.json").stones.hub;
const enMin = rd("en/stones.minerals.json").stones.minerals;
const enRec = rd("en/stones.records.json").stones.records;
const enList = rd("en/stones.list.json").stones.list;
const enComb = rd("en/stones.combinations.json").stones.combinations;
const enK = rd("en/stones.knowledge.json").stones.knowledge, trK = rd("tr/stones.knowledge.json").stones.knowledge;

// ── GATE A: EN copy düzeltmeleri ────────────────────────────────────────────
console.log("[GATE A] EN copy fixes");
// 2.2 / 2.3 hub
enHub.analytics.trendSubtitle === "Last 6 months"
  ? ok('2.2 hub trendSubtitle = "Last 6 months"') : err(`2.2 hub trendSubtitle beklenmedik: "${enHub.analytics.trendSubtitle}"`);
!has(enHub.analytics.subtitle, "Supabase")
  ? ok("2.3 hub analytics.subtitle Supabase içermiyor") : err("2.3 hub analytics.subtitle hâlâ 'Supabase'");
// 2.4 minerals
enMin.list.subtitle === "Browse and manage your mineral records."
  ? ok("2.4 minerals list.subtitle native") : err(`2.4 minerals list.subtitle beklenmedik: "${enMin.list.subtitle}"`);
// 2.5 records intro
has(enRec.intro.description, '+ Create New Record') && !has(enRec.intro.description, '+ New Record"')
  ? ok("2.5 records intro CTA = '+ Create New Record'") : err("2.5 records intro CTA gerçek butonla uyuşmuyor");
// 2.6 / 2.7 records desc — developer copy kaldırıldı
!has(enRec.basic.desc, "streamlined web version") && !has(enRec.general.desc, "streamlined web version")
  ? ok("2.6/2.7 records basic/general desc developer-copy değil") : err("2.6/2.7 records desc hâlâ 'streamlined web version'");
// 2.9 minerals iceren_taslar section label consistency
enMin.bank.sections.iceren_taslar.label === "Stones Containing This Mineral" &&
enMin.detail.sections.iceren_taslar.title === "Stones Containing This Mineral"
  ? ok("2.9 iceren_taslar label/title tutarlı") : err("2.9 iceren_taslar label/title tutarsız");
// 2.10 list card CTA
enList.card.readOnDetail === "View Details →"
  ? ok("2.10 list card CTA = 'View Details →'") : err(`2.10 list card CTA beklenmedik: "${enList.card.readOnDetail}"`);
// 2.11 photos stat
enList.stat.image === "Photos"
  ? ok("2.11 list stat.image = 'Photos'") : err(`2.11 list stat.image beklenmedik: "${enList.stat.image}"`);
// 2.12 combination metric labels
enComb.detail.statCombination === "Combinations" && enComb.detail.statStockStone === "In Stock" && enComb.detail.statMissing === "Missing"
  ? ok("2.12 combination metric labels (Combinations/In Stock/Missing)") : err("2.12 combination metric labels yanlış");
// 2.13 scan → find matching
enComb.builder.scan === "Find Matching Stones"
  ? ok("2.13 builder.scan = 'Find Matching Stones'") : err(`2.13 builder.scan beklenmedik: "${enComb.builder.scan}"`);
has(enComb.builder.resultsEmptyTitle, "Find Matching Stones") && !has(enComb.builder.resultsEmptyTitle, "Scan Stones")
  ? ok("2.13 resultsEmptyTitle 'Find Matching Stones' + 'Scan Stones' yok") : err("2.13 resultsEmptyTitle güncel değil");
// 2.14 search criteria
enComb.builder.conditionsTitle === "Search Criteria"
  ? ok("2.14 builder.conditionsTitle = 'Search Criteria'") : err(`2.14 conditionsTitle beklenmedik: "${enComb.builder.conditionsTitle}"`);
// 2.8 percentage label + placeholder
enS.assignmentFields["Oran %"] === "Percentage"
  ? ok("2.8 assignmentFields['Oran %'] EN = 'Percentage' (çift-% yok)") : err(`2.8 EN percentage label yanlış: "${enS.assignmentFields["Oran %"]}"`);
enS.assignmentFieldPlaceholders?.["Oran %"] === "Enter percentage..."
  ? ok("2.8 EN percentage placeholder = 'Enter percentage...'") : err("2.8 EN percentage placeholder yok/yanlış");

// "Scan Stones" / "Read on the details page" hiçbir stones EN copy'de render edilmesin
const allEnStones = ["en/stones.json","en/stones.hub.json","en/stones.minerals.json","en/stones.records.json",
  "en/stones.list.json","en/stones.combinations.json","en/stones.knowledge.json"].map((p) => readFileSync(join(ROOT,"messages",p),"utf8")).join("\n");
!has(allEnStones, "Scan Stones") ? ok("EN stones: 'Scan Stones' hiç yok") : err("EN stones: 'Scan Stones' hâlâ var");
!has(allEnStones, "Read on the details page") ? ok("EN stones: 'Read on the details page' hiç yok") : err("EN stones: eski card CTA var");
!/Supabase|public\.minerals|public\.stones|stones\.created_at|minerals table/.test(allEnStones)
  ? ok("EN stones: DB/schema/Supabase leak yok") : err("EN stones: DB/schema/Supabase leak KALDI");

// ── GATE B: canonical/persisted anahtarlar KORUNDU ──────────────────────────
console.log("\n[GATE B] canonical / persisted keys preserved");
const ASG_FIELDS = ["Mineral", "Oran %", "Etkili Organ / Not", "Astrolojik Atama", "Element"];
let bOk = true;
for (const k of ASG_FIELDS) {
  if (!(k in enS.assignmentFields)) { err(`assignmentFields EN anahtar '${k}' YOK`); bOk = false; }
  if (!(k in trS.assignmentFields)) { err(`assignmentFields TR anahtar '${k}' YOK`); bOk = false; }
  if (trS.assignmentFields[k] !== k) { err(`assignmentFields TR '${k}' identity DEĞİL ("${trS.assignmentFields[k]}")`); bOk = false; }
}
if (bOk) ok("assignmentFields kanonik anahtarlar (Oran % dahil) + TR identity korunmuş");
// persisted field config (dogaltas-kayit) canonical Türkçe ["Mineral", "Oran %"]
has(src("app/dogaltas/dogaltas-kayit/page.tsx"), 'fields: ["Mineral", "Oran %"]')
  ? ok("dogaltas-kayit persisted fields ['Mineral','Oran %'] korunmuş") : err("dogaltas-kayit persisted fields DEĞİŞMİŞ");
// placeholder parity: EN+TR aynı override anahtarı
(enS.assignmentFieldPlaceholders && trS.assignmentFieldPlaceholders &&
 "Oran %" in enS.assignmentFieldPlaceholders && "Oran %" in trS.assignmentFieldPlaceholders)
  ? ok("assignmentFieldPlaceholders EN+TR parity ('Oran %')") : err("assignmentFieldPlaceholders parity BOZUK");

// ── GATE C: hub ay etiketleri locale-aware ──────────────────────────────────
console.log("\n[GATE C] hub month labels locale-aware");
const hubSrc = src("app/dogaltas/page.tsx");
has(hubSrc, 'formatDate(date, { month: "short" }, locale)')
  ? ok("hub buildLast6MonthTrend formatDate(...locale) kullanıyor") : err("hub month formatDate(...locale) BULUNAMADI");
!/toLocaleDateString\("tr-TR",\s*\{\s*month:\s*"short"\s*\}\)/.test(hubSrc)
  ? ok("hub hardcoded tr-TR month kalmadı") : err("hub hâlâ hardcoded tr-TR month");
has(hubSrc, "useLocale") ? ok("hub useLocale import/kullanım var") : err("hub useLocale YOK");

// ── GATE D: Stone Detail çökme kök nedenleri kapatıldı ──────────────────────
console.log("\n[GATE D] Stone Detail crash root causes closed");
const detSrc = src("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
// D1: hook'lar erken return'lerden ÖNCE (useSignedStoneImageUrls, if(loading) return sırası)
const idxHook = detSrc.indexOf("useSignedStoneImageUrls(imageFilePaths)");
const idxLoadingReturn = detSrc.indexOf("if (loading) {");
const idxNoStone = detSrc.indexOf("if (!safeStone) return null;");
(idxHook > -1 && idxLoadingReturn > -1 && idxHook < idxLoadingReturn && idxHook < idxNoStone)
  ? ok("D1 useSignedStoneImageUrls erken return'lerden ÖNCE (rules-of-hooks)") : err("D1 hook hâlâ erken return SONRASI");
// eski hook konumu (safeStone sonrası useMemo(imageFilePaths)) kalmadı
!/const safeImages[\s\S]{0,120}useMemo\([\s\S]{0,120}imageFilePath/.test(detSrc)
  ? ok("D1 eski (return sonrası) imageFilePaths useMemo kaldırıldı") : err("D1 eski return-sonrası imageFilePaths useMemo KALDI");
// D2: formatDate Invalid Date guard
/Number\.isNaN\(\s*(?:parsed|[a-zA-Z]+)\.getTime\(\)\s*\)\s*\)\s*return\s*"-"/.test(detSrc)
  ? ok("D2 formatDate Invalid Date guard var (RangeError çökme yok)") : err("D2 formatDate Invalid Date guard YOK");

// ── GATE E: knowledge "diğerleri" provenance (verbatim data — çevrilmez) ─────
console.log("\n[GATE E] knowledge 'diğerleri' provenance contract");
const kbSrc = src("app/dogaltas/tas-bilgi-kutuphanesi/page.tsx");
// catLabel bilinen kategoriyi localize, bilinmeyeni VERBATIM döner → "diğerleri" gibi
// DB/legacy/source değerleri Türkçe kalır (owner kararı: content çevrilmez).
/t\.has\(`categoryLabels\.\$\{name\}`\)\s*\?\s*t\(`categoryLabels\.\$\{name\}`\)\s*:\s*name/.test(kbSrc)
  ? ok("catLabel bilinmeyen kategori verbatim (fallback = name)") : err("catLabel verbatim-fallback sözleşmesi bulunamadı");
// "diğerleri" bir system label DEĞİL: knowledge kaynak kodunda literal olarak yok
!/["']diğerleri["']/.test(kbSrc)
  ? ok("'diğerleri' knowledge kaynak kodunda literal DEĞİL (data/source alanı)") : err("'diğerleri' beklenmedik şekilde kaynak literali");
// canonical categoryLabels seti EN'de mevcut (localize edilen sistem-owned kategoriler)
["Şifa","Araştırma","Mineroloji","Uygulamalar","Genel"].every((c) => c in enK.categoryLabels && c in trK.categoryLabels)
  ? ok("categoryLabels kanonik seti EN+TR mevcut") : err("categoryLabels kanonik seti eksik");

// ── GATE F: ICU / placeholder parse sağlamlığı ──────────────────────────────
console.log("\n[GATE F] ICU / placeholder parse integrity");
const FILES = ["en/stones.json","en/stones.hub.json","en/stones.minerals.json","en/stones.records.json",
  "en/stones.list.json","en/stones.combinations.json","en/stones.knowledge.json",
  "tr/stones.json","tr/stones.hub.json","tr/stones.minerals.json","tr/stones.records.json",
  "tr/stones.list.json","tr/stones.combinations.json","tr/stones.knowledge.json"];
let icuCount = 0, icuBad = 0;
const walk = (obj, path) => {
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "string") {
      icuCount++;
      try { parse(v); } catch (e) { icuBad++; err(`ICU parse hatası @ ${p}: ${e.message}`); }
    } else if (v && typeof v === "object") walk(v, p);
  }
};
for (const f of FILES) walk(rd(f), f);
icuBad === 0 ? ok(`ICU parse: ${icuCount} string sağlam (0 hata)`) : err(`ICU parse: ${icuBad} hata`);

// ── SONUÇ ───────────────────────────────────────────────────────────────────
console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2E KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);

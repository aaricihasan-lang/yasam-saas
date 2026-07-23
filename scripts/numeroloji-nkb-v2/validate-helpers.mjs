/**
 * NKB-V2-B — Saf helper doğrulama harness'ı.
 * knowledgeSections.ts (Ana/Yan Kulvar ortak sözleşme) davranışını kanıtlar.
 * Node 24 native TS type-stripping ile .ts doğrudan import edilir. DB/ağ yok.
 *
 * Çalıştır: node scripts/numeroloji-nkb-v2/validate-helpers.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPER = pathToFileURL(
  join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers", "knowledgeSections.ts"),
).href;

const mod = await import(HELPER);
const {
  validateKulvarSections,
  sectionsFromLegacyDescription,
  resolveKulvarSectionsForRead,
  isKulvarAnalysisType,
  KULVAR_SECTION_TEMPLATE,
} = mod;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

// Ortak dört bölüm (Ana Kulvar ve Yan Kulvar aynı sözleşme).
const fourSections = KULVAR_SECTION_TEMPLATE.map((t, i) => ({
  key: t.key,
  label: t.label,
  body: `gövde ${i + 1}`,
  order: t.order,
}));

console.log("── NKB-V2-B — Saf helper doğrulama ──");

// 1) Ana Kulvar dört bölüm geçer.
const r1 = validateKulvarSections(fourSections);
check("Ana Kulvar dört bölüm sözleşmesi geçer", r1.ok && r1.sections.length === 4);

// 2) Yan Kulvar aynı dört bölüm sözleşmesiyle geçer (tip-agnostik + tür tanınır).
check(
  "Yan Kulvar aynı dört bölüm sözleşmesiyle geçer",
  isKulvarAnalysisType("yan-kulvar") && validateKulvarSections(fourSections).ok,
);

// 3) Duplicate key reddedilir.
const dupKey = [
  { key: "overview", label: "A", body: "x", order: 1 },
  { key: "overview", label: "B", body: "y", order: 2 },
];
check("Duplicate key reddedilir", validateKulvarSections(dupKey).ok === false);

// 4) Bilinmeyen key reddedilir.
const badKey = [{ key: "sonuc", label: "A", body: "x", order: 1 }];
check("Bilinmeyen key reddedilir", validateKulvarSections(badKey).ok === false);

// 5) Duplicate order reddedilir.
const dupOrder = [
  { key: "overview", label: "A", body: "x", order: 1 },
  { key: "constructive", label: "B", body: "y", order: 1 },
];
check("Duplicate order reddedilir", validateKulvarSections(dupOrder).ok === false);

// 6) Geçersiz body (string değil) reddedilir.
const badBody = [{ key: "overview", label: "A", body: 123, order: 1 }];
check("Geçersiz body (string değil) reddedilir", validateKulvarSections(badBody).ok === false);

// 7) Bilinmeyen alan reddedilir.
const extraField = [{ key: "overview", label: "A", body: "x", order: 1, extra: true }];
check("Bilinmeyen alan reddedilir", validateKulvarSections(extraField).ok === false);

// 8) Array olmayan girdi reddedilir.
check("Array olmayan girdi reddedilir", validateKulvarSections({ key: "overview" }).ok === false);

// 9) Legacy description yalnız tek 'Genel Açıklama' (overview) fallback'i üretir.
const legacy = sectionsFromLegacyDescription("eski açıklama metni");
check(
  "Legacy description yalnız Genel Açıklama fallback'i üretir",
  legacy.length === 1 &&
    legacy[0].key === "overview" &&
    legacy[0].label === "Genel Açıklama" &&
    legacy[0].body === "eski açıklama metni",
);

// 10) Legacy fallback girdiyi/DB'yi değiştirmez (saf: taze dizi döner, input string sabit).
const srcDesc = "değişmez";
const l1 = sectionsFromLegacyDescription(srcDesc);
const l2 = sectionsFromLegacyDescription(srcDesc);
check(
  "Legacy fallback saf: taze dizi döner, girdi değişmez",
  l1 !== l2 && srcDesc === "değişmez" && l1[0].body === "değişmez",
);

// 11) content_sections yoksa read-resolver overview fallback verir.
const resolved = resolveKulvarSectionsForRead({ description: "yalnız açıklama" });
check(
  "Resolver: content_sections yoksa overview fallback",
  resolved.length === 1 && resolved[0].key === "overview" && resolved[0].body === "yalnız açıklama",
);

// 12) Geçerli content_sections order'a göre sıralı döner.
const shuffled = [
  { key: "destructive", label: "Yıkıcı", body: "d", order: 4 },
  { key: "overview", label: "Genel", body: "o", order: 1 },
];
const resolved2 = resolveKulvarSectionsForRead({ content_sections: shuffled });
check(
  "Resolver: geçerli content_sections order'a göre sıralanır",
  resolved2.length === 2 && resolved2[0].order === 1 && resolved2[1].order === 4,
);

// 13) Element bu template'e alınmaz.
check("Element bu template'e alınmaz", isKulvarAnalysisType("element") === false);

// 14) Çakra bu template'e alınmaz.
check("Çakra bu template'e alınmaz", isKulvarAnalysisType("cakra-omurga") === false);

// 15) Diğer analysis_type Kulvar doğrulamasına zorlanmaz.
check(
  "Diğer analysis_type Kulvar sözleşmesine zorlanmaz",
  isKulvarAnalysisType("hayat-yolu") === false &&
    isKulvarAnalysisType("ifade-sayisi") === false &&
    isKulvarAnalysisType("diger") === false,
);

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);

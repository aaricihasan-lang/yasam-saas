/**
 * NUMEROLOJİ FAZ 6 / FINAL UAT ISSUE #1 — POPUP KAPSAM (SCOPE) GUARD.
 *
 * OWNER FINAL KARARI: "ⓘ Bu ne demek?" + "∑ Nasıl hesaplandı?" popup/chip kontrolleri
 * YALNIZ "Zamanlama & Gelişim" sekmesinde kalır. Numeroloji'nin diğer HİÇBİR
 * kullanıcı-facing yüzeyinde (Sonuç Özeti / Analiz Hesap Özetli-Özetsiz / İlişki /
 * Ev-İş) bu popup render EDİLMEZ.
 *
 * Bu harness KAYNAK TARAMASIDIR (motor/hesap çalıştırmaz): NumerolojiCalculationInfo
 * render/import'unun yalnız izinli yüzeyde bulunduğunu ve kaldırılan yüzeylerde
 * bulunmadığını kilitler. Ayrıca Sinerji disclosure label'ında eski "Nasıl hesaplandı?"
 * ibaresinin kalmadığını doğrular.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-faz6/popup-scope-harness.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENTS = join(HERE, "..", "..", "app", "numeroloji", "components");
const read = (name: string) => readFileSync(join(COMPONENTS, name), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`);
  }
}

// İZİN VERİLEN TEK YÜZEY — Zamanlama & Gelişim.
const timing = read("NumerolojiZamanlamaGelisimTab.tsx");
assert(timing.includes("NumerolojiCalculationInfo"), "POPUP-SCOPE-05 Zamanlama & Gelişim öğretici help KORUNUR");

// KALDIRILAN YÜZEYLER — hiçbir popup import/render kalmamalı.
const removedSurfaces: { file: string; scope: string }[] = [
  { file: "NumerolojiAnalizSonucTabs.tsx", scope: "POPUP-SCOPE-01/02 Sonuç Özeti + Analiz (Hesap Özetli/Özetsiz)" },
  { file: "NumerolojiIliskiAnaliziTab.tsx", scope: "POPUP-SCOPE-03 İlişki Analizi" },
  { file: "NumerolojiEvIsYeriSayisiTab.tsx", scope: "POPUP-SCOPE-04 Ev / İş Yeri" },
];
for (const { file, scope } of removedSurfaces) {
  const src = read(file);
  assert(!src.includes("NumerolojiCalculationInfo"), `${scope}: NumerolojiCalculationInfo render/import = 0`, file);
  // Görünür chip metinleri kaynakta literal olarak da bulunmamalı.
  assert(!src.includes("Bu ne demek?"), `${scope}: "Bu ne demek?" literal = 0`, file);
}

// POPUP-SCOPE-08 — Sinerji disclosure label sadeleşti ("· Nasıl hesaplandı?" YOK).
const iliski = read("NumerolojiIliskiAnaliziTab.tsx");
// I18N-F1-R5: etiket metni bileşenden TR mesaj dosyasına taşındı (TR değeri birebir). Kural aynı: ya kaynakta literal,
// ya da bileşen tam o anahtarı kullanıyor VE TR değeri birebir "Hane karşılaştırmasını göster".
const iliskiTr = (JSON.parse(readFileSync(join(HERE, "../../messages/tr/numerology.tabs.json"), "utf8")) as {
  numerology?: { tabs?: { relationship?: { showCompare?: string } } };
}).numerology?.tabs?.relationship?.showCompare;
const disclosureLabel = iliski.includes('{t("showCompare")}') ? iliskiTr : iliski.includes("Hane karşılaştırmasını göster") ? "Hane karşılaştırmasını göster" : undefined;
assert(disclosureLabel === "Hane karşılaştırmasını göster", "POPUP-SCOPE-08a Sinerji disclosure KORUNUR");
assert(!iliski.includes("Hane karşılaştırmasını göster · Nasıl hesaplandı?") && !(disclosureLabel ?? "").includes("Nasıl hesaplandı?"), "POPUP-SCOPE-08b disclosure label'ında 'Nasıl hesaplandı?' YOK");
// QA-N3-05 (R5): 08b dar sıkılaştırma — anahtar + bileşende yapıştırılmış metin (`{t("showCompare")} · Nasıl hesaplandı?`)
// ya da "Nasıl hesaplandı?" değerli bir katalog anahtarı da yakalanır. Kapsam YALNIZ İlişki bileşeni + disclosure <summary>'si.
const trCatalogLeaves = (o: unknown, pre = ""): [string, string][] =>
  o && typeof o === "object"
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => trCatalogLeaves(v, pre ? `${pre}.${k}` : k))
    : typeof o === "string" ? [[pre, o]] : [];
const MSG_DIR = join(HERE, "../../messages/tr");
const howKeys = new Set(
  readdirSync(MSG_DIR).filter((f) => f.startsWith("numerology") && f.endsWith(".json"))
    .flatMap((f) => trCatalogLeaves(JSON.parse(readFileSync(join(MSG_DIR, f), "utf8"))))
    .filter(([, v]) => /Nasıl hesaplandı/i.test(v))
    .map(([k]) => k.split(".").pop()!),
);
const compareSummary = Array.from(iliski.matchAll(/<summary\b[\s\S]*?<\/summary>/g)).map((m) => m[0]).find((s) => s.includes('t("showCompare")')) ?? "";
const summaryKeys = Array.from(compareSummary.matchAll(/\bt\w*\(\s*["'`]([\w.]+)["'`]/g)).map((m) => m[1]!.split(".").pop()!);
assert(
  !/Nasıl hesaplandı/i.test(iliski) && compareSummary !== "" && howKeys.size > 0 && summaryKeys.every((k) => !howKeys.has(k)) && !/∑/.test(compareSummary),
  "POPUP-SCOPE-08b' İlişki bileşeninde literal 'Nasıl hesaplandı' YOK ve disclosure <summary>'si 'Nasıl hesaplandı?' değerli anahtar (ör. howQ) kullanmıyor",
  JSON.stringify({ summaryKeys, howKeys: Array.from(howKeys) }),
);

// POPUP-SCOPE-02/09 — Analiz (Hesap Özetli) inline hesap dökümü + Bilgi Bankası korunur.
const tabs = read("NumerolojiAnalizSonucTabs.tsx");
assert(tabs.includes("r.steps") || tabs.includes("steps?.length"), "POPUP-SCOPE-09a inline hesap dökümü (steps) KORUNUR");
assert(tabs.includes("BilgiBankasiYorumBlock"), "POPUP-SCOPE-09b Bilgi Bankası Yorumu KORUNUR");

console.log(`\nNUMEROLOJİ FAZ 6 / POPUP SCOPE GUARD: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Popup yalnız Zamanlama & Gelişim'de; Sonuç Özeti/Analiz/İlişki/Ev-İş temiz; inline hesap korunuyor.");

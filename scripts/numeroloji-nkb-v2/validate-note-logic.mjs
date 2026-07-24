/**
 * NKB-V2-H — Analiz yorumu + liste özeti SAF mantık harness'ı (React/DB yok).
 * node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-note-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const nl = await import(pathToFileURL(join(HELPERS, "noteLogic.ts")).href);
const { resolveNoteSectionsForView, noteHeading, buildListSummary } = nl;

let pass = 0, fail = 0;
function check(n, c) {
  const ok = Boolean(c);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}`);
  if (ok) pass++;
  else fail++;
}

const four = [
  { key: "overview", label: "Genel Açıklama", body: "genel", order: 1 },
  { key: "constructive", label: "Yapıcı Potansiyeller", body: "yapıcı", order: 2 },
  { key: "negative", label: "Olumsuz Potansiyeller", body: "olumsuz", order: 3 },
  { key: "destructive", label: "Yıkıcı Potansiyeller", body: "yıkıcı", order: 4 },
];
const onlyOverview = [
  { key: "overview", label: "Genel Açıklama", body: "yalnız genel", order: 1 },
  { key: "constructive", label: "Yapıcı Potansiyeller", body: "", order: 2 },
  { key: "negative", label: "Olumsuz Potansiyeller", body: "", order: 3 },
  { key: "destructive", label: "Yıkıcı Potansiyeller", body: "", order: 4 },
];

console.log("── NKB-V2-H — not mantığı ──");

// 1-2) Ana 19 ve Ana 2 → dört dolu bölüm
check("(1) Ana Kulvar 19 dört bölüme çözülür", resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "19", content_sections: four }).length === 4);
check("(2) Ana Kulvar 2 dört bölüme çözülür", resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "2", content_sections: four }).length === 4);
// bölüm etiketleri kanonik sıra
check("dört bölüm etiketleri kanonik", resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "1", content_sections: four }).map((s) => s.label).join("|") === "Genel Açıklama|Yapıcı Potansiyeller|Olumsuz Potansiyeller|Yıkıcı Potansiyeller");

// 3) 19/2 → iki ayrı not kartı (her ikisi de dolu çözülür)
const n19 = resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "19", content_sections: four });
const n2 = resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "2", content_sections: four });
check("(3) 19 ve 2 ayrı ayrı dolu kart üretir", n19.length > 0 && n2.length > 0);

// 4) Başlıklar
check("(4) başlık 'Ana Kulvar — 19'", noteHeading("ana-kulvar", "19") === "Ana Kulvar — 19");
check("(4) başlık 'Ana Kulvar — 2'", noteHeading("ana-kulvar", "2") === "Ana Kulvar — 2");
check("(4) başlık 'Yan Kulvar — 8'", noteHeading("yan-kulvar", "8") === "Yan Kulvar — 8");

// 5) Ana 33 yalnız Genel Açıklama
const a33 = resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "33", content_sections: onlyOverview });
check("(5) Ana 33 yalnız Genel Açıklama", a33.length === 1 && a33[0].label === "Genel Açıklama");

// 6) Yan 8 yalnız Genel Açıklama
const y8 = resolveNoteSectionsForView({ analysisType: "yan-kulvar", value: "8", content_sections: onlyOverview });
check("(6) Yan 8 yalnız Genel Açıklama", y8.length === 1 && y8[0].label === "Genel Açıklama");

// 7) Yan 19 doğru overview
const y19 = resolveNoteSectionsForView({ analysisType: "yan-kulvar", value: "19", content_sections: [{ key: "overview", label: "Genel Açıklama", body: "üstadını bulmak", order: 1 }, { key: "constructive", label: "Yapıcı Potansiyeller", body: "", order: 2 }, { key: "negative", label: "Olumsuz Potansiyeller", body: "", order: 3 }, { key: "destructive", label: "Yıkıcı Potansiyeller", body: "", order: 4 }] });
check("(7) Yan 19 doğru Genel Açıklama", y19.length === 1 && y19[0].body === "üstadını bulmak");

// 8) Yan 33 (içerik yok) → bölüm yok (kayıt/kart oluşmaz)
check("(8) Yan 33 içeriksiz → 0 bölüm (kart yok)", resolveNoteSectionsForView({ analysisType: "yan-kulvar", value: "33", content_sections: null, description: "" }).length === 0);

// 9) content_sections yok → legacy description overview fallback (kulvar)
const legacy = resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "5", content_sections: null, description: "eski açıklama" });
check("(9) legacy description → Genel Açıklama fallback", legacy.length === 1 && legacy[0].label === "Genel Açıklama" && legacy[0].body === "eski açıklama");

// 10) content_sections varsa description tekrarlanmaz
const withBoth = resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "1", content_sections: four, description: "ESKI-TEKRAR" });
check("(10) content_sections varsa description tekrarlanmaz", !withBoth.some((s) => s.body.includes("ESKI-TEKRAR")));

// 11) boş bölümler render planından çıkar
check("(11) boş bölümler dışlanır", resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "33", content_sections: onlyOverview }).length === 1);

// 13) diğer analysis_type description davranışı korunur (etiketsiz)
const ifade = resolveNoteSectionsForView({ analysisType: "ifade-sayisi", value: "8", description: "ifade açıklaması" });
check("(13) diğer tür legacy description (etiketsiz)", ifade.length === 1 && ifade[0].label === "" && ifade[0].body === "ifade açıklaması");
check("(13b) diğer tür content_sections'a zorlanmaz (boş desc → 0)", resolveNoteSectionsForView({ analysisType: "ifade-sayisi", value: "8", description: "" }).length === 0);

// 14-16) source / display_label / internal_note render planında YOK
const keys = new Set(resolveNoteSectionsForView({ analysisType: "ana-kulvar", value: "1", content_sections: four }).flatMap((s) => Object.keys(s)));
check("(14-16) ViewSection yalnız {label,body} — source/display_label/internal_note YOK", [...keys].sort().join(",") === "body,label");

// 17) liste özeti display_label önceliği
check("(17) liste özeti display_label öncelikli", buildListSummary({ displayLabels: ["Elif YILMAZ&Sema ÇAYLAR"], content_sections: four, source: "x", description: "y" }) === "Elif YILMAZ&Sema ÇAYLAR");
// 18) display_label yoksa overview snippet
check("(18) display_label yoksa overview snippet", buildListSummary({ displayLabels: [], content_sections: four, source: "", description: "" }) === "genel");
// 19) legacy source/description fallback + "—"
check("(19a) overview yoksa legacy source—description", buildListSummary({ displayLabels: [], content_sections: null, source: "Kaynak", description: "Açıklama" }) === "Kaynak — Açıklama");
check("(19b) hiçbiri yoksa '—'", buildListSummary({ displayLabels: [], content_sections: null, source: "", description: "" }) === "—");

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);

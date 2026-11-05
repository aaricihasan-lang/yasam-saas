/**
 * D5-A (05.11.2026) — Element Bilgi Bankası bağlantısı regresyon kalkanı (SAF; ağ / DB YOK).
 *
 *   • buildElementLookupValues: gerçek motor çıktısında (hesaplaNumeroloji) element sayılarından bağımsız
 *     beklenen anahtarlar: 0–1 → "X | AZ Destek", 2–3 → not yok, 4+ → "X | FAZLA Destek" (Nötr sayılmaz).
 *   • Sözleşme: Bilgi Bankası formunun değer listesi ve Doğaltaş element anahtarlarıyla birebir aynı.
 *   • pickNotesForType: kayıt varsa not döner (ekran + Word aynı planı kullanır); kayıt yoksa boş →
 *     ekrandaki "Bu sonuç için bilgi bankası kaydı bulunamadı" durumu korunur; başka türdeki aynı değer eşleşmez.
 *   • Diğer kategorilerin planı DEĞİŞMEDİ (Ana/Yan Kulvar, İfade, Hayat Yolu, Çakra).
 *
 * Çalıştır: npx tsx scripts/numeroloji-nkb-v2/element-kb-lookup.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import {
  buildChakraLookupValues,
  buildElementLookupValues,
  buildKnowledgeLookupPlan,
  hayatYoluLookupCandidates,
  kulvarValueCandidatesFromResult,
  pickNotesForType,
  valueCandidatesFromResult,
} from "@/app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup";
import { buildElementStoneLookupValues } from "@/app/numeroloji/bilgi-bankasi/helpers/stoneLookup";
import type { KnowledgeRecordRow } from "@/app/numeroloji/bilgi-bankasi/helpers/bilgiBankaKayit";
import type { NumerolojiMotorOut } from "@/app/numeroloji/utils/numerolojiPlainMetin";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`  ✗ ${label}${detail !== undefined ? `  → ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}

const ROOT = path.resolve(__dirname, "../..");
const ELEMENTS = ["Hava", "Su", "Ateş", "Toprak"] as const;
const motor = (first: string, last: string, date: string) => hesaplaNumeroloji({ firstName: first, lastName: last, birthDate: date }) as unknown as NumerolojiMotorOut;
const expectedKeys = (counts: Record<string, number>) =>
  ELEMENTS.flatMap((el) => {
    const n = counts[el] ?? 0;
    return n <= 1 ? [`${el} | AZ Destek`] : n >= 4 ? [`${el} | FAZLA Destek`] : [];
  });

// ── 1) gerçek motor çıktıları ───────────────────────────────────────────────────────────────
const PEOPLE: [string, string, string][] = [
  ["Çağrı Gülşen", "Şükrüoğlu", "01.01.1950"], ["Ayşe Nur", "Işık Öztürk", "29.02.2000"], ["İlker", "Öğüt", "31.12.1999"],
  ["Mehmet Ali", "Yıldız", "11.11.1988"], ["Zeynep", "Çelik-Uğur", "22.07.1977"], ["Ümit", "Işıl", "15.06.2026"],
  ["Hasan Hüseyin", "Arıcı", "09.09.1965"], ["Deniz", "Bebek", "15.03.2027"],
];
let sawAz = 0, sawFazla = 0, sawNone = 0;
for (const [f, l, d] of PEOPLE) {
  const out = motor(f, l, d);
  const counts = (out.elementler as { counts: Record<string, number> }).counts;
  const keys = buildElementLookupValues(out);
  ok(JSON.stringify([...keys].sort()) === JSON.stringify(expectedKeys(counts).sort()), `${f} ${l}: element anahtarları sayılardan beklenen (${JSON.stringify(counts)})`, keys);
  ok(JSON.stringify([...keys].sort()) === JSON.stringify([...buildElementStoneLookupValues(out)].sort()), `${f} ${l}: Bilgi Bankası anahtarları = Doğaltaş element anahtarları`);
  ok(keys.every((k) => /^(Hava|Su|Ateş|Toprak) \| (AZ|FAZLA) Destek$/.test(k)) && new Set(keys).size === keys.length, `${f} ${l}: biçim + tekrar yok`);
  sawAz += keys.filter((k) => k.endsWith("AZ Destek")).length;
  sawFazla += keys.filter((k) => k.endsWith("FAZLA Destek")).length;
  sawNone += ELEMENTS.filter((el) => (counts[el] ?? 0) >= 2 && (counts[el] ?? 0) <= 3).length;
}
ok(sawAz > 0 && sawFazla > 0 && sawNone > 0, "örneklem AZ, FAZLA ve ideal (not yok) durumlarını kapsar", { sawAz, sawFazla, sawNone });
ok(buildElementLookupValues({} as NumerolojiMotorOut).length === 0, "element sonucu yok → boş (çökmez)");
// Hasan Hüseyin Arıcı 09.09.1965: Hava 0, Su 0, Ateş 5, Toprak 0 (04.11 canlı gözlem)
{
  const keys = buildElementLookupValues(motor("Hasan Hüseyin", "Arıcı", "09.09.1965"));
  ok(JSON.stringify([...keys].sort()) === JSON.stringify(["Ateş | FAZLA Destek", "Hava | AZ Destek", "Su | AZ Destek", "Toprak | AZ Destek"].sort()), "09.09.1965 (Ateş 5, diğerleri 0) → Ateş FAZLA + 3 AZ", keys);
}

// ── 2) sözleşme: form değer listesi ─────────────────────────────────────────────────────────
{
  const form = readFileSync(path.join(ROOT, "app/numeroloji/bilgi-bankasi/components/BilgiKayitEkleDuzenle.tsx"), "utf8");
  ok(/\["Ateş", "Su", "Toprak", "Hava"\] as const\)\.flatMap\(\(el\) => \[\s*`\$\{el\} \| AZ Destek`,\s*`\$\{el\} \| FAZLA Destek`,/.test(form), "form değer listesi aynı biçimi üretir (Ateş/Su/Toprak/Hava | AZ/FAZLA Destek)");
}

// ── 3) not eşleştirme: ekran + Word aynı plan ───────────────────────────────────────────────
const row = (id: string, analysis_type: string, value: string, description = "kaynak metni"): KnowledgeRecordRow => ({ id, tenant_id: "t-zz", analysis_type, value, source: "gizli kaynak", description, updated_at: "2026-11-05T00:00:00.000Z" });
{
  const out = motor("Hasan Hüseyin", "Arıcı", "09.09.1965");
  const plan = buildKnowledgeLookupPlan(out);
  const el = plan.find((p) => p.analysisType === "element");
  ok(!!el && el.values.length === 4, "lookup planında element değerleri var (önceden [])", el?.values);
  const rows = [row("e1", "element", "Ateş | FAZLA Destek"), row("e2", "element", "Su | FAZLA Destek"), row("x1", "cakra-omurga", "Ateş | FAZLA Destek"), row("e3", "element", "Hava | AZ Destek")];
  const notes = pickNotesForType(rows, "element", el!.values, new Set());
  ok(notes.map((n) => n.id).sort().join(",") === "e1,e3", "kayıt varsa yalnız eşleşen element notları (Su FAZLA eşleşmez, başka türdeki aynı değer alınmaz)", notes.map((n) => n.id));
  ok(notes.every((n) => !("source" in n)), "not kaynağı (source) danışan çıktısına taşınmaz");
  ok(pickNotesForType([], "element", el!.values, new Set()).length === 0, "kayıt yoksa boş → 'bulunamadı' boş durumu korunur");
  const seen = new Set<string>(["e1"]);
  ok(pickNotesForType(rows, "element", el!.values, seen).map((n) => n.id).join(",") === "e3", "aynı not iki kez eklenmez (global seen)");
}

// ── 4) diğer kategoriler değişmedi ──────────────────────────────────────────────────────────
for (const [f, l, d] of PEOPLE) {
  const out = motor(f, l, d);
  const plan = buildKnowledgeLookupPlan(out);
  const byType = Object.fromEntries(plan.map((p) => [p.analysisType, p.values]));
  ok(
    JSON.stringify(byType["ana-kulvar"]) === JSON.stringify(kulvarValueCandidatesFromResult(out.anaKulvar)) &&
      JSON.stringify(byType["yan-kulvar"]) === JSON.stringify(kulvarValueCandidatesFromResult(out.yanKulvar)) &&
      JSON.stringify(byType["ifade-sayisi"]) === JSON.stringify(valueCandidatesFromResult(out.ifadeSayisi)) &&
      JSON.stringify(byType["hayat-yolu"]) === JSON.stringify(hayatYoluLookupCandidates(out.hayatYolu).values) &&
      JSON.stringify(byType["cakra-omurga"]) === JSON.stringify(buildChakraLookupValues(out)),
    `${f} ${l}: diğer kategorilerin plan değerleri değişmedi`,
  );
  ok(plan.map((p) => p.analysisType).join(",") === "ana-kulvar,yan-kulvar,ifade-sayisi,hayat-yolu,cakra-omurga,element", `${f} ${l}: plan sırası korunur`);
}

// ── 5) statik: ekran ve Word aynı planı kullanır; tenant istemciden gönderilmez ─────────────
{
  const lookup = readFileSync(path.join(ROOT, "app/numeroloji/bilgi-bankasi/helpers/knowledgeLookup.ts"), "utf8");
  const word = readFileSync(path.join(ROOT, "app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild.ts"), "utf8");
  const tabs = readFileSync(path.join(ROOT, "app/numeroloji/components/NumerolojiAnalizSonucTabs.tsx"), "utf8");
  ok(/element: pickNotesForType\(rows, NUMERO_ANALYSIS_TYPES\.element, plan\[5\]\.values, seenIds\)/.test(lookup), "ekran: element notları plan[5] ile seçilir");
  ok(/<BilgiBankasiYorumBlock notes=\{knowledgeNotes\.element\} \/>/.test(tabs), "ekran: Elementler bölümünde Bilgi Bankası yorum bloğu");
  ok(/for \(const plan of buildKnowledgeLookupPlan\(motor\)\) for \(const nt of pickNotesForType\(shared\.knowledgeRows/.test(word), "Word: aynı plan (element dahil) ile notlar seçilir");
  const api = lookup.slice(lookup.indexOf("export async function getKnowledgeNotesForAnalysis"));
  ok(/numApi\(KNOWLEDGE_API\)/.test(api) && !/tenant_id=|tenantId=/.test(api.slice(0, 600)), "Bilgi Bankası okuması oturum tenant'ıyla (istemciden tenant yok)");
}

console.log(`\nD5-A element Bilgi Bankası harness: ${pass} geçti, ${fail} kaldı`);
if (failures.length) console.log(failures.join("\n"));
process.exit(fail ? 1 : 0);

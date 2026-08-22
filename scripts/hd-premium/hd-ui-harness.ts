/**
 * HD Premium Bilgi Bankası — statik doğrulama harness'i (tsx ile çalışır).
 *   npx tsx scripts/hd-premium/hd-ui-harness.ts
 *
 * Kapsam (saf mantık; production write / DB YOK):
 *   A. Kapı sayısal sıralama (1→64), Kanal tuple, Tip/Otorite sabit sıra, fallback
 *   B. ReaderModal güvenli biçimleyici: ## → heading, ### → heading, list, paragraf
 *   C. bulk-delete payload doğrulama semantiği (UUID / boş / max / duplicate normalize)
 */
import { sortCanonicalRows, compareCanonicalKeys, HD_TYPE_ORDER, HD_AUTHORITY_ORDER } from "@/lib/human-design/admin/hdSort";
import { parseReaderBlocks, promotePlainHeadings } from "@/components/common/reader/formatReaderText";

let pass = 0;
let fail = 0;
const results: string[] = [];
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; results.push(`PASS  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); }
}

// ── A. SORTING ──────────────────────────────────────────────────────────────
const gateKeys = Array.from({ length: 64 }, (_, i) => ({ canonical_key: `kapi_${i + 1}` }));
// deliberately shuffle (string order would give 1,10,11,...,2)
const gateShuffled = [...gateKeys].sort((a, b) => (a.canonical_key < b.canonical_key ? -1 : 1));
const gateSorted = sortCanonicalRows("kapi", gateShuffled).map((r) => r.canonical_key);
const gateExpected = gateKeys.map((r) => r.canonical_key);
assert("gates 1→64 numeric", JSON.stringify(gateSorted) === JSON.stringify(gateExpected), gateSorted.slice(0, 5));
assert("gates NOT lexical (1,10,11,2…)", gateSorted[1] === "kapi_2" && gateSorted[9] === "kapi_10");

const channels = [
  "kanal_10_20", "kanal_1_8", "kanal_10_34", "kanal_2_14", "kanal_10_57", "kanal_11_56", "kanal_9_52",
].map((k) => ({ canonical_key: k }));
const channelSorted = sortCanonicalRows("kanal", channels).map((r) => r.canonical_key);
assert(
  "channels tuple [A,B] numeric",
  JSON.stringify(channelSorted) === JSON.stringify(["kanal_1_8", "kanal_2_14", "kanal_9_52", "kanal_10_20", "kanal_10_34", "kanal_10_57", "kanal_11_56"]),
  channelSorted,
);

const tips = [...HD_TYPE_ORDER].reverse().map((k) => ({ canonical_key: k }));
assert("type fixed order", JSON.stringify(sortCanonicalRows("tip", tips).map((r) => r.canonical_key)) === JSON.stringify(HD_TYPE_ORDER));
const auths = [...HD_AUTHORITY_ORDER].reverse().map((k) => ({ canonical_key: k }));
assert("authority fixed order", JSON.stringify(sortCanonicalRows("otorite", auths).map((r) => r.canonical_key)) === JSON.stringify(HD_AUTHORITY_ORDER));

// unknown/future key → stable fallback (goes after known, lexical among themselves)
const mixed = [{ canonical_key: "kapi_5" }, { canonical_key: "kapi_zzz" }, { canonical_key: "kapi_3" }];
const mixedSorted = sortCanonicalRows("kapi", mixed).map((r) => r.canonical_key);
assert("unknown key stable fallback (end)", mixedSorted[0] === "kapi_3" && mixedSorted[1] === "kapi_5" && mixedSorted[2] === "kapi_zzz", mixedSorted);
assert("comparator returns 0 for equal", compareCanonicalKeys("kapi", "kapi_7", "kapi_7") === 0);

// ── B. SAFE MARKDOWN-LIKE FORMATTER ─────────────────────────────────────────
const md = "## Temel Mekanizma\n\nBir paragraf metni.\n\n### Sakral Ses\n\n- birinci madde\n- ikinci madde";
const blocks = parseReaderBlocks(md);
const h2 = blocks.find((b) => b.type === "heading" && b.level === 2);
const h3 = blocks.find((b) => b.type === "heading" && b.level === 3);
assert("## → heading level 2", !!h2 && (h2 as { text: string }).text === "Temel Mekanizma", h2);
assert("### → heading level 3", !!h3 && (h3 as { text: string }).text === "Sakral Ses", h3);
assert("heading text has no leading #", blocks.filter((b) => b.type === "heading").every((b) => !(b as { text: string }).text.includes("#")));
const list = blocks.find((b) => b.type === "list");
assert("list detected (2 items)", !!list && (list as { items: string[] }).items.length === 2, list);
const para = blocks.find((b) => b.type === "paragraph");
assert("paragraph detected", !!para && (para as { lines: string[] }).lines[0] === "Bir paragraf metni.");
// no raw '##' survives as heading text
assert("no raw '##' as content", !blocks.some((b) => JSON.stringify(b).includes("##")));

// ── B2. GÜVENLİ DÜZ (plain) BÖLÜM ETİKETİ TESPİTİ ────────────────────────────
// Gerçek corpus yapısını yansıtan örnek: etiket \n\n paragraf. Kaynak metin `##` taşımaz.
const plainMd = [
  "Mekanik Yapı",
  "",
  "Tezahür Eden Jeneratörün Sakral Merkezi tanımlıdır ve Sakral ya da bir motor Boğaz Merkezi'ne bağlanır.",
  "",
  "Manifesting Generatorlar insanlığın yaklaşık %33'ünü oluşturur.",
  "",
  "Aura",
  "",
  "Tezahür Eden Jeneratörün aurası açık ve sarıp sarmalayıcıdır. Sakral Merkezin yaratıcı yaşam gücünü iletir.",
  "",
  "Yaşam Gücü, Çalışma ve Kendini Tanıma",
  "",
  "Tezahür Eden Jeneratör her gün yaratıcı Sakral enerjisini kullanmak, çalışmak ve yaptığı işi sevmek üzere tasarlanmıştır.",
  "",
  // Enumerasyon parçaları (Manifestör §Öfke): başlığa DÖNMEMELİ
  "Dirençle karışmış erken koşullanma deneyimleri Manifestörü öfkeye doğru iter. Bu öfke iki biçimde ifade edilebilir:",
  "",
  "Öfke ve isyan",
  "",
  "veya",
  "",
  "pasiflik ve uyum sağlama.",
  "",
  // Soru işaretiyle biten gerçek etiket: güvenli tarafta kalıp paragraf sayılır (false-negative kabul)
  "Bilgilendirmek Neden Zordur?",
  "",
  "Bilgilendirmek Manifestöre doğal veya hoş gelmeyebilir; başkalarına bilgi vermek aklına gelen son şey olabilir.",
].join("\n");
const pBlocks = promotePlainHeadings(parseReaderBlocks(plainMd));
const isHeadingText = (t: string) => pBlocks.some((b) => b.type === "heading" && (b as { text: string }).text === t);
const isParagraphText = (t: string) =>
  pBlocks.some((b) => b.type === "paragraph" && (b as { lines: string[] }).lines.join(" ") === t);

// PASS: gerçek etiketler → heading
assert("plain heading: 'Mekanik Yapı' → heading", isHeadingText("Mekanik Yapı"));
assert("plain heading: 'Aura' → heading", isHeadingText("Aura"));
assert("plain heading: 'Yaşam Gücü, Çalışma ve Kendini Tanıma' → heading", isHeadingText("Yaşam Gücü, Çalışma ve Kendini Tanıma"));
// Yükseltilen etiketler H2 seviyesinde
assert("promoted plain headings are level 2", pBlocks.filter((b) => b.type === "heading").every((b) => (b as { level: number }).level === 2));

// PASS (FALSE-POSITIVE KORUMASI): normal cümle/parça → paragraph
assert("no false-positive: '%33' cümlesi → paragraph", isParagraphText("Manifesting Generatorlar insanlığın yaklaşık %33'ünü oluşturur."));
assert("no false-positive: 'Öfke ve isyan' (enum parçası) → paragraph", isParagraphText("Öfke ve isyan"));
assert("no false-positive: 'veya' (küçük harf) → paragraph", isParagraphText("veya"));
assert("no false-positive: ':' ile biten lead-in → paragraph", isParagraphText("Dirençle karışmış erken koşullanma deneyimleri Manifestörü öfkeye doğru iter. Bu öfke iki biçimde ifade edilebilir:"));
assert("no false-positive: '?' ile biten satır → paragraph", isParagraphText("Bilgilendirmek Neden Zordur?"));
// Mevcut '##' başlık davranışı promotePlainHeadings sonrası korunur
const keepMd = "## Temel Mekanizma\n\nSacral Otorite, Solar Pleksus tanımsız ve Sakral Merkez tanımlı olduğunda çalışır.";
const keepBlocks = promotePlainHeadings(parseReaderBlocks(keepMd));
assert("existing '##' still heading after promote", keepBlocks.some((b) => b.type === "heading" && (b as { text: string }).text === "Temel Mekanizma"));

// ── C. BULK-DELETE PAYLOAD VALIDATION SEMANTICS ─────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateBulk(entity_ids: unknown): { ok: boolean; error?: string; ids?: string[] } {
  if (!Array.isArray(entity_ids) || entity_ids.length === 0) return { ok: false, error: "empty" };
  if (entity_ids.length > 112) return { ok: false, error: "max" };
  if (!entity_ids.every((x) => typeof x === "string" && UUID_RE.test(x))) return { ok: false, error: "uuid" };
  return { ok: true, ids: Array.from(new Set(entity_ids as string[])) };
}
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
assert("bulk reject empty", validateBulk([]).ok === false);
assert("bulk reject non-array", validateBulk("x").ok === false);
assert("bulk reject invalid uuid", validateBulk(["not-a-uuid"]).ok === false);
assert("bulk reject >112", validateBulk(Array.from({ length: 113 }, (_, i) => U(i))).ok === false);
const dedup = validateBulk([U(1), U(1), U(2)]);
assert("bulk dedupe duplicates", dedup.ok === true && dedup.ids!.length === 2, dedup.ids);

// ── report ──────────────────────────────────────────────────────────────────
for (const r of results) console.log(r);
console.log(`\nSUMMARY: ${pass}/${pass + fail} PASS · ${fail} FAIL`);
console.log(fail === 0 ? "HD-UI-HARNESS — PASS" : "HD-UI-HARNESS — FAIL");
process.exit(fail === 0 ? 0 : 1);

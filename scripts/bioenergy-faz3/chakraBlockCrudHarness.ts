/**
 * BİYOENERJİ FAZ 2 — Çakra block CRUD güvenlik/validation harness (saf logic).
 * npx tsx scripts/bioenergy-faz3/chakraBlockCrudHarness.ts
 *
 * validateChakraBlockInput / validateReorderInput / renumberSortOrders güvenlik
 * sözleşmesini test eder: source-evidence + gizli provenance alanları reddedilir;
 * yalnız izinli visible alanlar geçer; section_key/block_type whitelist zorlanır.
 */
import {
  validateChakraBlockInput,
  validateReorderInput,
  renumberSortOrders,
  chakraChildBreakdown,
  CHAKRA_SECTION_KEYS,
  VISIBLE_BLOCK_TYPES,
} from "../../lib/bioenergy/chakraBlockCrud";

let pass = 0, fail = 0;
const failures: string[] = [];
const check = (n: string, c: boolean, d = "") => c ? pass++ : (fail++, failures.push(`✗ ${n}${d ? ` — ${d}` : ""}`));

// ── create: geçerli ──
const okc = validateChakraBlockInput({ section_key: "genel-bakis", block_type: "overview", block_title: "Adlandırmalar", editorial_explanation: "İçerik metni." }, "create");
check("create geçerli PASS", okc.ok === true);
check("create title trim/korunur", okc.ok && okc.fields.block_title === "Adlandırmalar");
check("create içerik AYNEN (trim edilmez)", okc.ok && okc.fields.editorial_explanation === "İçerik metni.");

// ── create: source-evidence REDDEDİLİR ──
const se = validateChakraBlockInput({ section_key: "genel-bakis", block_type: "source-evidence", editorial_explanation: "x" }, "create");
check("create source-evidence RED", se.ok === false && (se as { status: number }).status === 400);

// ── create: gizli provenance/kaynak alanları RED ──
for (const f of ["source_excerpt", "source_title", "source_author", "origin_type", "editorial_interpretation", "expert_note", "source_translation", "tenant_id", "chakra_id", "id"]) {
  const r = validateChakraBlockInput({ section_key: "genel-bakis", block_type: "overview", editorial_explanation: "x", [f]: "hack" }, "create");
  check(`create '${f}' enjeksiyonu RED`, r.ok === false);
}

// ── create: geçersiz section_key / block_type ──
check("create geçersiz section_key RED", validateChakraBlockInput({ section_key: "kok-cakra", block_type: "overview", editorial_explanation: "x" }, "create").ok === false);
check("create geçersiz block_type RED", validateChakraBlockInput({ section_key: "genel-bakis", block_type: "banner", editorial_explanation: "x" }, "create").ok === false);
check("create boş içerik RED", validateChakraBlockInput({ section_key: "genel-bakis", block_type: "overview", editorial_explanation: "   " }, "create").ok === false);
check("create eksik section RED", validateChakraBlockInput({ block_type: "overview", editorial_explanation: "x" }, "create").ok === false);

// ── update: kısmi ──
const up = validateChakraBlockInput({ editorial_explanation: "Güncel metin" }, "update");
check("update yalnız içerik PASS", up.ok === true && Object.keys(up.ok ? up.fields : {}).length === 1);
check("update source-evidence'e çevirme RED", validateChakraBlockInput({ block_type: "source-evidence" }, "update").ok === false);
check("update gizli alan RED", validateChakraBlockInput({ source_author: "x" }, "update").ok === false);
check("update block_title null kabul", (() => { const r = validateChakraBlockInput({ block_title: null }, "update"); return r.ok && r.fields.block_title === null; })());

// ── tüm section/type kombinasyonları geçerli ──
let comboOk = true;
for (const sk of CHAKRA_SECTION_KEYS) for (const bt of VISIBLE_BLOCK_TYPES) {
  const r = validateChakraBlockInput({ section_key: sk, block_type: bt, editorial_explanation: "x" }, "create");
  if (!r.ok) comboOk = false;
}
check("tüm (8 section × 6 visible type) create PASS", comboOk);

// ── sort_order validation ──
check("sort_order negatif RED", validateChakraBlockInput({ sort_order: -1 }, "update").ok === false);
check("sort_order ondalık RED", validateChakraBlockInput({ sort_order: 1.5 }, "update").ok === false);
check("sort_order geçerli PASS", validateChakraBlockInput({ sort_order: 20 }, "update").ok === true);

// ── reorder ──
const ro = validateReorderInput({ items: [{ id: "a", sort_order: 10 }, { id: "b", sort_order: 20 }] });
check("reorder geçerli PASS", ro.ok === true && (ro.ok ? ro.items.length : 0) === 2);
check("reorder boş RED", validateReorderInput({ items: [] }).ok === false);
check("reorder tekrarlı id RED", validateReorderInput({ items: [{ id: "a", sort_order: 10 }, { id: "a", sort_order: 20 }] }).ok === false);
check("reorder geçersiz sort RED", validateReorderInput({ items: [{ id: "a", sort_order: -5 }] }).ok === false);

// ── renumber ──
const rn = renumberSortOrders([{ id: "x" }, { id: "y" }, { id: "z" }]);
check("renumber 10/20/30 deterministik", JSON.stringify(rn) === JSON.stringify([{ id: "x", sort_order: 10 }, { id: "y", sort_order: 20 }, { id: "z", sort_order: 30 }]));

// ── cascade breakdown (bulk delete uyarısı) ──
check("breakdown 428=155+273", JSON.stringify(chakraChildBreakdown(428, 273)) === JSON.stringify({ total: 428, evidence: 273, visible: 155 }));
check("breakdown zero-child (legacy) 0/0/0", JSON.stringify(chakraChildBreakdown(0, 0)) === JSON.stringify({ total: 0, evidence: 0, visible: 0 }));
check("breakdown evidence>total klamplenir", JSON.stringify(chakraChildBreakdown(5, 9)) === JSON.stringify({ total: 5, evidence: 5, visible: 0 }));
check("breakdown negatif/NaN güvenli", JSON.stringify(chakraChildBreakdown(-3, Number.NaN)) === JSON.stringify({ total: 0, evidence: 0, visible: 0 }));
check("breakdown all-visible (evidence 0)", JSON.stringify(chakraChildBreakdown(115, 0)) === JSON.stringify({ total: 115, evidence: 0, visible: 115 }));

console.log(`\nBİYOENERJİ FAZ 2 — ÇAKRA BLOCK CRUD HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail) { console.log("\nBAŞARISIZ:"); failures.forEach((f) => console.log("  " + f)); console.log("\nOVERALL = FAIL"); process.exit(1); }
console.log("OVERALL = PASS");

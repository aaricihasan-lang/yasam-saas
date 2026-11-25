/**
 * I18N mod-g — Atlas terim kataloğu (messages/{tr,en}/terms.json) bütünlüğü. Ağ / DB YOK.
 *
 *   • Anahtarlar kanonik kimlik listeleriyle BİREBİR (ASPECT_TYPES, VEDIC_GRAHAS, NAKSHATRAS, VEDIC_DASHA_LEVELS, VEDIC_AYANAMSA_IDS,
 *     NATAL_HOUSE_SYSTEMS …) → katalog yeni bir "kimlik" icat etmez, eksik kimlik bırakmaz.
 *   • TR değerleri Atlas'ın mevcut Türkçe etiket tablolarıyla (lib/astrology/labels/tr.ts, topics/vedic.ts) karakteri karakterine
 *     aynı → katalogdan basılan Türkçe ekran metni değişmez (tek kaynak ileride katalog olabilir).
 *   • EN: her anahtar dolu, Türkçe harf yok; Sanskrit / KP terimleri (Nakshatra adları, Rahu, Ketu, Mahadasha …) korunur.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-terms-catalog.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASPECT_LABELS, BODY_LABELS, DIGNITY_LABELS, MODALITY_LABELS, NATAL_HOUSE_SYSTEM_LABELS, NATURE_LABELS, NODE_TYPE_LABELS, PATTERN_LABELS, SIGN_LABELS, ELEMENT_LABELS } from "@/lib/astrology/labels/tr";
import { ASPECT_TYPES, PATTERN_KINDS } from "@/lib/astrology/model/western";
import { NAKSHATRAS, VEDIC_AYANAMSA_IDS, VEDIC_DASHA_LEVELS, VEDIC_GRAHAS } from "@/lib/astrology/model/vedic";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import { NATAL_HOUSE_SYSTEMS } from "@/lib/astrology/houses/natalLocal";

const root = join(__dirname, "..", "..");
type Terms = Record<string, Record<string, string>>;
const tr = (JSON.parse(readFileSync(join(root, "messages/tr/terms.json"), "utf8")) as { terms: Terms }).terms;
const en = (JSON.parse(readFileSync(join(root, "messages/en/terms.json"), "utf8")) as { terms: Terms }).terms;

const sameKeys = (domain: string, ids: readonly string[]) => {
  assert.deepEqual(Object.keys(tr[domain]).sort(), [...ids].sort(), `tr.${domain} anahtarları ↔ kanonik kimlikler`);
  assert.deepEqual(Object.keys(en[domain]).sort(), [...ids].sort(), `en.${domain} anahtarları ↔ kanonik kimlikler`);
};
const sameTr = (domain: string, labels: Record<string, string>) => {
  for (const [id, label] of Object.entries(labels)) assert.equal(tr[domain][id], label, `tr.${domain}.${id} ≠ kod etiketi`);
};

let checked = 0;
// Batı
sameKeys("aspect", ASPECT_TYPES);
sameTr("aspect", ASPECT_LABELS);
sameKeys("aspectNature", Object.keys(NATURE_LABELS));
sameTr("aspectNature", NATURE_LABELS);
sameKeys("dignity", Object.keys(DIGNITY_LABELS));
sameTr("dignity", DIGNITY_LABELS);
sameKeys("pattern", PATTERN_KINDS);
sameTr("pattern", PATTERN_LABELS);
sameKeys("modality", Object.keys(MODALITY_LABELS));
sameTr("modality", MODALITY_LABELS);
sameKeys("houseSystem", NATAL_HOUSE_SYSTEMS);
sameTr("houseSystem", NATAL_HOUSE_SYSTEM_LABELS);
sameKeys("nodeType", ["true", "mean"]);
sameTr("nodeType", NODE_TYPE_LABELS);
// F1'de var olan alanlar (değiştirilmedi): burç / gövde / element etiketleri astroloji etiketleriyle aynı kalmalı.
sameTr("zodiac", SIGN_LABELS);
sameTr("body", BODY_LABELS);
sameTr("element", ELEMENT_LABELS);
// Vedik
sameKeys("graha", VEDIC_GRAHAS);
sameTr("graha", GRAHA_LABELS);
sameKeys("nakshatra", NAKSHATRAS);
sameTr("nakshatra", NAKSHATRA_LABELS);
sameKeys("dashaLevel", VEDIC_DASHA_LEVELS);
sameKeys("ayanamsa", VEDIC_AYANAMSA_IDS);
// Sanskrit adlar EN'de korunur (transliterasyon aynı).
for (const n of NAKSHATRAS) assert.equal(en.nakshatra[n], tr.nakshatra[n], `nakshatra ${n} EN = Sanskrit ad`);
for (const l of VEDIC_DASHA_LEVELS) assert.equal(en.dashaLevel[l], tr.dashaLevel[l], `dasha ${l} EN = Sanskrit ad`);

// Genel: aynı anahtar ağacı, dolu, EN'de Türkçe harf yok.
assert.deepEqual(Object.keys(en).sort(), Object.keys(tr).sort(), "alanlar");
for (const d of Object.keys(tr)) {
  assert.deepEqual(Object.keys(en[d]).sort(), Object.keys(tr[d]).sort(), `alan ${d}`);
  for (const [k, v] of Object.entries(en[d])) {
    assert.ok(typeof v === "string" && v.trim().length > 0, `en.${d}.${k} boş`);
    assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(v), `en.${d}.${k} Türkçe harf içeriyor: ${v}`);
    assert.ok(typeof tr[d][k] === "string" && tr[d][k].trim().length > 0, `tr.${d}.${k} boş`);
    checked++;
  }
}
console.log(`✅ atlas-terms-catalog: ${Object.keys(tr).length} alan · ${checked} terim · TR = kod etiketleri · anahtarlar = kanonik kimlikler · EN dolu ve Türkçe harfsiz`);

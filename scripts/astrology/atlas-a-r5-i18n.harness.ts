/**
 * I18N-F1-R5 (ATLAS-A) — Atlas ekran çevirisi kilitleri. Ağ / DB / sağlayıcı YOK.
 *
 *   [S] "Yakında" (ComingSoonPanel): TR bölüm/madde metinleri KANONİK ANAHTAR olarak kaynakta kalır (görünürlük eşlemesi);
 *       ekran metni koddan katalogla. TR katalog değeri = kaynak metin (karakteri karakterine); her madde/bölüm/not kodlu;
 *       EN katalog eksiksiz ve Türkçe harfsiz; görünürlük kararı dilden bağımsız (kod kümesi aynı).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-a-r5-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { AVAILABLE_TECHNIQUES, COMING_SOON_AVAILABLE_AS, COMING_SOON_ITEM_CODES, COMING_SOON_SECTION_CODES, visibleComingSoonSections } from "@/app/admin/astroloji/_lib/comingSoon";

const ROOT = join(__dirname, "..", "..");
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
type Tr = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: "tr" | "en", namespace: string): Tr =>
  createTranslator({ locale, messages: getCatalogMessages(locale) as Record<string, never>, namespace: namespace as never }) as unknown as Tr;

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

// ─── [S] Yakında ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n[S] Yakında: kanonik TR anahtar → kod → katalog");
// Panel yazı tipi yüklediği için içe aktarılmaz (panchanga-hours deseni): bölümler kaynak metinden okunur.
const soonSrc = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/ComingSoonPanel.tsx"), "utf8");
const block = soonSrc.slice(soonSrc.indexOf("COMING_SOON_SECTIONS"), soonSrc.indexOf("/** Yalnız henüz"));
const sections = [...block.matchAll(/title: "([^"]+)",\s*items: \[([\s\S]*?)\],(?:\s*notes: \[([\s\S]*?)\],)?/g)].map((m) => ({
  title: m[1],
  items: [...m[2].matchAll(/"([^"\n]+)"/g)].map((x) => x[1]),
  notes: [...(m[3] ?? "").matchAll(/"([^"\n]+)"/g)].map((x) => x[1]),
}));
const soonTr = translator("tr", "atlas.soon");
const soonEn = translator("en", "atlas.soon");
t(`10 bölüm / ${sections.reduce((n, s) => n + s.items.length, 0)} madde: her bölüm ve madde kodlu, TR katalog = kaynak metin (karakteri karakterine)`, () => {
  assert.equal(sections.length, 10);
  for (const s of sections) {
    const code = COMING_SOON_SECTION_CODES[s.title];
    assert.ok(code, `bölüm kodu yok: ${s.title}`);
    assert.equal(soonTr(`sections.${code}`), s.title);
    s.notes.forEach((n, k) => assert.equal(soonTr(`notes.${code}_${k + 1}`), n));
    for (const it of s.items) {
      const ic = COMING_SOON_ITEM_CODES[it];
      assert.ok(ic, `madde kodu yok: ${it}`);
      assert.equal(soonTr(`items.${ic}`), it);
    }
  }
  const codes = Object.values(COMING_SOON_ITEM_CODES);
  assert.equal(new Set(codes).size, codes.length, "madde kodları benzersiz");
  for (const k of Object.keys(COMING_SOON_AVAILABLE_AS)) assert.ok(COMING_SOON_ITEM_CODES[k], `eşlemedeki madde kodsuz: ${k}`);
});
t("TR sabit metinler (durum, başlık, giriş, süreç notları) eski kaynakla birebir", () => {
  assert.equal(soonTr("status"), "GELİŞTİRİLİYOR");
  assert.equal(soonTr("eyebrow"), "Yakında");
  assert.equal(soonTr("title"), "GÖKYÜZÜ ATLASI GENİŞLİYOR");
  assert.equal(soonTr("sub"), "Yeni Haritalar — Geleneksel Astroloji Ekolleri — Yeni Hesaplamalar");
  assert.equal(soonTr("back"), "Ana ekrana dön");
  assert.equal(soonTr("processTitle"), "GELİŞTİRME SÜRECİ HAKKINDA");
  assert.equal(soonTr("process.p4"), "Kesin bir yayın tarihi taahhüt edilmemektedir.");
});
t("EN katalog eksiksiz, Türkçe harfsiz; ham anahtar yok", () => {
  const all: string[] = [];
  for (const k of ["status", "eyebrow", "title", "sub", "back", "ariaExpanding", "intro1", "intro2", "processTitle", "process.p1", "process.p2", "process.p3", "process.p4"]) all.push(soonEn(k));
  for (const s of sections) {
    const code = COMING_SOON_SECTION_CODES[s.title];
    all.push(soonEn(`sections.${code}`), ...s.notes.map((_n, k) => soonEn(`notes.${code}_${k + 1}`)), ...s.items.map((it) => soonEn(`items.${COMING_SOON_ITEM_CODES[it]}`)));
  }
  for (const x of all) {
    // Marka adı her dilde korunur (TERMINOLOJI: "Yaşam Sistemi" çevrilmez).
    assert.ok(!TR_LETTERS.test(x.replace(/Yaşam Sistemi/g, "")), `Türkçe harf: ${x}`);
    assert.ok(!/^(atlas\.soon\.|items\.|sections\.)/.test(x), `ham anahtar: ${x}`);
  }
});
t("görünürlük kararı dilden bağımsız: görünen madde kodları her dilde aynı; açılmış teknik maddesi düşer", () => {
  const v = visibleComingSoonSections(sections, AVAILABLE_TECHNIQUES);
  const codes = v.flatMap((s) => s.items.map((it) => COMING_SOON_ITEM_CODES[it]));
  assert.ok(!codes.includes("declination_parallels") && !codes.includes("detailed_panchanga"));
  assert.ok(codes.includes("kalsarpa") && codes.includes("ecliptic_crossings"));
  const enView = v.map((s) => s.items.map((it) => soonEn(`items.${COMING_SOON_ITEM_CODES[it]}`)));
  assert.equal(enView.flat().length, codes.length);
});
t("panel kaynakta kullanıcı metni yok (yalnız katalog anahtarı); kanonik liste bloğu korunuyor", () => {
  const body = soonSrc.slice(soonSrc.indexOf("export default function ComingSoonPanel"));
  assert.ok(!TR_LETTERS.test(body), "panel gövdesinde Türkçe metin");
  assert.ok(body.includes('useTranslations("atlas.soon")'));
});

console.log(`\natlas-a-r5-i18n: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

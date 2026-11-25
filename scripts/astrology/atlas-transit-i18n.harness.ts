/**
 * I18N mod-g — Transit (tek an) paneli çevirisi. Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: TransitPanel'in TR kataloğuyla HTML'i çeviri ÖNCESİ bileşenle (taban c616c371c) bayt-bayt aynı
 *     (fixtures/i18n/transit-panel-tr-taban.json; 6 vaka: UTC, natal çerçeve + İstanbul, takvim kesinleşmeli, eksik takvim +
 *     Londra, saat bilinmiyor maskesi, açısız).
 *   • KİLİT: göreli süre metni (useRelativeTo) TR'de lib relativeTo ile birebir (−400…+400 gün aralığında 4.000+ fark);
 *     takvim/ev notları lib sabitleriyle aynı.
 *   • EN: Türkçe harf / ham anahtar yok; dereceler ve orb'lar TR ile aynı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-transit-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { TransitPanel } from "@/app/admin/astroloji/_components/TransitPanels";
import { CALENDAR_UNMATCHED_NOTE, NATAL_HOUSE_NOTE, relativeTo } from "@/lib/astrology/transitDetail";
import { transitCases } from "./atlasTransitCases";
import { createTranslator } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";

const FIX = join(__dirname, "fixtures");
const golden = (JSON.parse(readFileSync(join(FIX, "i18n", "transit-panel-tr-taban.json"), "utf8")) as { cases: Record<string, string> }).cases;

// KİLİT 1: lib sabitleri = TR katalog.
// Katalog tipi gevşek (Record<string, unknown>); lib/i18n/output.ts ile aynı desen — anahtarlar çalışma anında doğrulanır.
type Tr = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: "tr" | "en", namespace: string): Tr =>
  createTranslator({ locale, messages: getCatalogMessages(locale) as Record<string, never>, namespace: namespace as never }) as unknown as Tr;
const tr = translator("tr", "atlas.transit");
assert.equal(tr("calendarUnmatched"), CALENDAR_UNMATCHED_NOTE);
assert.equal(tr("natalHouseNote"), NATAL_HOUSE_NOTE);

// KİLİT 2: göreli süre — bileşendeki katalog kompozisyonu (aynı aritmetik) TR'de relativeTo ile birebir.
const rel = (loc: "tr" | "en") => {
  const t = translator(loc, "atlas.transit.rel");
  return (atUtc: string, exactUtc: string): string => {
    const a = Date.parse(/Z$/.test(atUtc) ? atUtc : `${atUtc}Z`);
    const b = Date.parse(exactUtc);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
    const diff = b - a;
    const m = Math.round(Math.abs(diff) / 60_000);
    if (m < 1) return t("same");
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    const mm = m % 60;
    const span = d > 0 ? (h ? t("daysHours", { d, h }) : t("days", { d })) : h > 0 ? (mm ? t("hoursMinutes", { h, m: mm }) : t("hours", { h })) : t("minutes", { m: mm });
    return diff > 0 ? t("after", { span }) : t("before", { span });
  };
};
const relTr = rel("tr");
const base = Date.parse("2026-10-07T09:00:00Z");
let relN = 0;
for (let k = -4000; k <= 4000; k += 2) {
  const off = Math.round(k * k * Math.sign(k) * 3.7 + k * 61.3) * 1000; // 0 sn … ±400 gün, düzensiz adım
  const x = new Date(base + off).toISOString();
  assert.equal(relTr("2026-10-07T09:00:00", x), relativeTo("2026-10-07T09:00:00", x), `relativeTo ${off}`);
  relN++;
}
assert.equal(relTr("2026-10-07T09:00:00", "bozuk"), relativeTo("2026-10-07T09:00:00", "bozuk"));
assert.equal(rel("en")("2026-10-07T09:00:00", "2026-10-08T10:00:00Z"), "1 day 1 h later");
assert.equal(rel("en")("2026-10-07T09:00:00", "2026-10-05T09:00:00Z"), "2 days earlier");

const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const degs = (h: string) => (strip(h).match(/\d+°\d{2}′/g) ?? []).join(" ");
const cases = transitCases(FIX);
assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(golden).sort());
for (const c of cases) {
  const el = createElement(TransitPanel, { t: c.technical as never, options: c.options });
  const trHtml = renderToStaticMarkup(el, "tr");
  assert.equal(trHtml, golden[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  const enHtml = renderToStaticMarkup(el, "en");
  const txt = strip(enHtml);
  assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(txt), `${c.name}: EN Türkçe: ${txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 8).join(" | ")}`);
  assert.ok(!/atlas\.transit|terms\./.test(txt), `${c.name}: ham anahtar`);
  assert.equal(degs(enHtml), degs(trHtml), `${c.name}: derece/orb TR = EN`);
}
console.log(`✅ atlas-transit-i18n: TR HTML = taban ${cases.length}/${cases.length} vaka · göreli süre kilidi ${relN} fark (TR = lib relativeTo) · lib notları kilitli · EN Türkçe harfsiz, ham anahtarsız, derece/orb aynı`);

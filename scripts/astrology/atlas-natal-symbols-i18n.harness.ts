/**
 * I18N mod-g — Natal "Semboller" rehberi (NatalSymbolGuide) çevirisi. Ağ / DB / sağlayıcı YOK.
 *
 *   • TR BİREBİR: TR kataloğuyla çizilen yeni bileşenin HTML'i, çeviri ÖNCESİ bileşenin (taban c616c371c) aynı girdilerle ürettiği
 *     HTML ile bayt-bayt aynı (fixtures/i18n/natal-symbol-guide-tr-taban.json; 3 vaka: golden Natal, mean düğüm + gece doğumu,
 *     Şans Noktası yok).
 *   • EN: aynı bileşen EN kataloğuyla çizilir — Türkçe harf yok, ham anahtar yok, eksik mesaj yok; teknik değerler (derece
 *     aralıkları, açı dereceleri, glifler) TR ile aynı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-natal-symbols-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import NatalSymbolGuide from "@/app/admin/astroloji/_components/NatalSymbolGuide";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import type { NatalTechnical } from "@/lib/astrology/model/western";

const FIX = join(__dirname, "fixtures");
const raw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
const p = projectRoxyNatal(raw.response ?? raw, { houseSystem: "placidus", nodeType: "true" });
if (!p.ok) throw new Error("golden projeksiyon başarısız");
const base = p.value.technical as NatalTechnical;
type Pts = NonNullable<NatalTechnical["points"]>;
const night = { ...base, nodeType: "mean", points: { ...(base.points ?? {}), partOfFortune: { ...((base.points as Pts | undefined)?.partOfFortune ?? {}), sect: "night" } } } as unknown as NatalTechnical;
const none = { ...base, points: undefined } as unknown as NatalTechnical;
const cases: Record<string, NatalTechnical> = { golden: base, meanNight: night, noPoints: none };

const missing: string[] = [];
const render = (locale: "tr" | "en", el: ReactElement) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: getCatalogMessages(locale), timeZone: "Europe/Istanbul", onError: (e: Error) => void missing.push(String(e.message)), children: el }),
  );

const golden = JSON.parse(readFileSync(join(FIX, "i18n", "natal-symbol-guide-tr-taban.json"), "utf8")) as { cases: Record<string, string> };
const strip = (h: string) => h.replace(/<[^>]+>/g, " ");
const numbers = (h: string) => strip(h).match(/\d+(?:[.,]\d+)?°|[♈-♓☉☽☿♀♂♃♄♅♆♇☊☋⚷⚸☌☍△□⚹⚺∠⚼⚻℞⊗]/gu) ?? [];

let n = 0;
for (const [name, technical] of Object.entries(cases)) {
  const trHtml = render("tr", createElement(NatalSymbolGuide, { technical }));
  assert.equal(trHtml, golden.cases[name], `${name}: TR çıktı çeviri öncesiyle bayt-bayt aynı değil`);
  const enHtml = render("en", createElement(NatalSymbolGuide, { technical }));
  const enText = strip(enHtml);
  assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(enText), `${name}: EN çıktıda Türkçe harf: ${enText.match(/[^ ]*[çğıöşüÇĞİÖŞÜ][^ ]*/)?.[0]}`);
  assert.ok(!/atlas\.natal|terms\.|⟦/.test(enText), `${name}: EN çıktıda ham anahtar`);
  assert.deepEqual(numbers(enHtml).filter((x) => /°/.test(x)).map((x) => x.replace(",", ".")), numbers(trHtml).filter((x) => /°/.test(x)).map((x) => x.replace(",", ".")), `${name}: derece değerleri TR = EN`);
  n++;
}
assert.deepEqual(missing, [], "eksik / hatalı mesaj");
console.log(`✅ atlas-natal-symbols-i18n: ${n} vaka · TR HTML = taban (bayt-bayt) · EN Türkçe harfsiz, ham anahtarsız, derece değerleri aynı`);

/**
 * Relocation otomatik yorumu — Yükselen / Tepe Noktası burcu değişmediğinde "… burcuna geçer" kalıbı (2026-11-28 canlı kabul).
 * Saf fonksiyon (lib/astrology/relocationSummary.ts) + ekran paneli (ProviderInterpretationPanel, sunucu render). Word/PDF
 * rapor tarafı: report8.harness.ts ("relocation yorumu: burç değişmediyse …"). Ağ / DB / sağlayıcı çağrısı YOK.
 *
 * Çalıştır: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/relocation-yorum-burc.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProviderInterpretationPanel from "@/app/admin/astroloji/_components/ProviderInterpretationPanel";
import { relocationAngleSigns, relocationMcSignChanged, relocationSummaryNote, relocationSummaryText, type RelocationAngleSigns } from "@/lib/astrology/relocationSummary";

let pass = 0;
let fail = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
};

const G = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "relocation.json"), "utf8"));
const GOLDEN_SUMMARY: string = G.response.interpretation.summary;
// Sağlayıcı kalıbı (burç değişmese de "geçer" der) — canlı örnek: natal Terazi → relocation Terazi.
const TERAZI = "Bu yere taşındığınızda, gezegenler doğum konumlarını korurken haritanızın açıları kayar. Yükselen Terazi burcuna, Tepe Noktası ise Yengeç burcuna geçer; açılara yaklaşan Venüs ile birlikte, buradaki günlük yaşamda etkisi en güçlü düzeye ulaşır.";
const S = (natalAsc: string, relAsc: string, natalMc: string, relMc: string) => ({ natalAsc, relAsc, natalMc, relMc }) as RelocationAngleSigns;
const tech = (na: string, ra: string, nm: string, rm: string) => ({
  angles: { ascendant: { sign: ra, longitude: 0 }, midheaven: { sign: rm, longitude: 0 } },
  natal: { angles: { ascendant: { sign: na }, midheaven: { sign: nm } } },
});

t("kalıp: golden özet sağlayıcının sabit '… burcuna, Tepe Noktası ise … burcuna geçer' cümlesini içerir", () => {
  assert.match(GOLDEN_SUMMARY, /Yükselen Aslan burcuna, Tepe Noktası ise Boğa burcuna geçer/);
});

t("ikisi de AYNI burç (Terazi→Terazi, Yengeç→Yengeç): 'geçer' yok, 'kalır' + yalnız derece/ev değişir; cümlenin devamı aynen", () => {
  const s = S("libra", "libra", "cancer", "cancer");
  const out = relocationSummaryText(TERAZI, s);
  assert.ok(!/burcuna geçer/.test(out), out);
  assert.ok(out.includes("Yükselen Terazi, Tepe Noktası Yengeç burcunda kalır (yalnız dereceleri ve gezegenlerin ev yerleşimleri değişir)"), out);
  assert.ok(out.startsWith("Bu yere taşındığınızda, gezegenler doğum konumlarını korurken haritanızın açıları kayar. "));
  assert.ok(out.endsWith("; açılara yaklaşan Venüs ile birlikte, buradaki günlük yaşamda etkisi en güçlü düzeye ulaşır."));
});

t("yalnız Yükselen aynı: Yükselen 'kalır', Tepe Noktası 'geçer' (gerçek değişim korunur)", () => {
  const out = relocationSummaryText(TERAZI, S("libra", "libra", "leo", "cancer"));
  assert.ok(out.includes("Yükselen Terazi burcunda kalır (yalnız derecesi değişir), Tepe Noktası ise Yengeç burcuna geçer"), out);
});

t("yalnız Tepe Noktası aynı: Yükselen 'geçer', Tepe Noktası 'kalır'", () => {
  const out = relocationSummaryText(TERAZI, S("virgo", "libra", "cancer", "cancer"));
  assert.ok(out.includes("Yükselen Terazi burcuna geçer, Tepe Noktası ise Yengeç burcunda kalır (yalnız derecesi değişir)"), out);
});

t("ikisi de GERÇEKTEN değişti: sağlayıcı metni AYNEN; not yok", () => {
  const s = S("scorpio", "leo", "leo", "taurus");
  assert.equal(relocationSummaryText(GOLDEN_SUMMARY, s), GOLDEN_SUMMARY);
  assert.equal(relocationSummaryNote(GOLDEN_SUMMARY, s), null);
});

t("güvenlik: kalıp yoksa / burç adları kayıtla uyuşmuyorsa / natal yoksa metne DOKUNULMAZ", () => {
  const same = S("libra", "libra", "cancer", "cancer");
  const other = "Yükselen konumunuz bu şehirde daha belirgin olur.";
  assert.equal(relocationSummaryText(other, same), other);
  assert.equal(relocationSummaryText(TERAZI, S("aries", "aries", "cancer", "cancer")), TERAZI, "metindeki burç kayıttaki relocation burcu değil");
  assert.equal(relocationSummaryText(TERAZI, null), TERAZI);
  assert.equal(relocationAngleSigns({ angles: tech("libra", "libra", "cancer", "cancer").angles, natal: null }), null);
  assert.equal(relocationAngleSigns(null), null);
});

t("not: yalnız düzeltme yapıldığında; natal → relocation burçlarını ve 'burç aynı'yı açıkça söyler", () => {
  const n = relocationSummaryNote(TERAZI, S("libra", "libra", "cancer", "cancer"))!;
  assert.ok(n.includes("Yükselen Terazi → Terazi (burç aynı)") && n.includes("Tepe Noktası Yengeç → Yengeç (burç aynı)") && n.includes("Diğer metin değiştirilmemiştir"), n);
  assert.equal(relocationSummaryNote(123, S("libra", "libra", "cancer", "cancer")), null);
});

t("kayıtlı teknik katmandan burçlar + Tepe Noktası değişti mi (rapor tablosu satırı)", () => {
  assert.deepEqual(relocationAngleSigns(tech("libra", "libra", "cancer", "leo")), S("libra", "libra", "cancer", "leo"));
  assert.equal(relocationMcSignChanged(tech("libra", "libra", "cancer", "leo")), true);
  assert.equal(relocationMcSignChanged(tech("libra", "libra", "cancer", "cancer")), false);
  assert.equal(relocationMcSignChanged({ angles: {} }), null);
});

const layer = (summary: string) => ({
  visible: true as const,
  notice: "Otomatik yorum",
  content: { schema: "astro.western.relocation.interp.v1", summary, bodies: [] },
});
t("EKRAN: Sistem Yorumu paneli — burç aynıysa düzeltilmiş cümle + açıklama notu; 'Terazi burcuna, … geçer' görünmez", () => {
  const html = renderToStaticMarkup(createElement(ProviderInterpretationPanel, { interpretation: layer(TERAZI) as never, relocation: S("libra", "libra", "cancer", "cancer") }));
  assert.ok(html.includes("Yükselen Terazi, Tepe Noktası Yengeç burcunda kalır"), "düzeltilmiş cümle yok");
  assert.ok(!html.includes("Terazi burcuna, Tepe Noktası ise Yengeç burcuna geçer"), "yanlış kalıp hâlâ görünüyor");
  assert.ok(html.includes('data-testid="astro-relocation-sign-note"'), "açıklama notu yok");
});
t("EKRAN: burç gerçekten değiştiyse metin aynen, not yok; relocation verisi verilmezse (eski çağrı) metin aynen", () => {
  const a = renderToStaticMarkup(createElement(ProviderInterpretationPanel, { interpretation: layer(GOLDEN_SUMMARY) as never, relocation: S("scorpio", "leo", "leo", "taurus") }));
  assert.ok(a.includes("Yükselen Aslan burcuna, Tepe Noktası ise Boğa burcuna geçer") && !a.includes("astro-relocation-sign-note"));
  const b = renderToStaticMarkup(createElement(ProviderInterpretationPanel, { interpretation: layer(TERAZI) as never }));
  assert.ok(b.includes("Terazi burcuna, Tepe Noktası ise Yengeç burcuna geçer") && !b.includes("astro-relocation-sign-note"));
});

console.log(`\nrelocation yorum burç harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

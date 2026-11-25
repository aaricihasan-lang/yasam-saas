/**
 * I18N ATLAS-V — Batı Horary (William Lilly) masası + Horary arşivi çevirisi. Ağ / DB / sağlayıcı YOK; hesap GERÇEK (runWesternHorary).
 *
 *   • TR BİREBİR: masa ilk durumu, sonuç görünümü (HoraryResult + ReportBar + SaveBar), kayıtlı harita çubuğu (SavedBar), arşiv
 *     listesi ilk durumu, arşiv sekme anahtarı ve danışan seçicisi; TR kataloğuyla HTML çeviri ÖNCESİ bileşenle (taban 26f217b9b)
 *     bayt-bayt aynı (fixtures/i18n/horary-desk-tr-taban.json).
 *   • KİLİT: statik çizimde görünmeyen (etkileşimle çıkan) hata / durum metinlerinin TR katalog değeri = çeviri öncesi kaynak literali;
 *     labels modülünün (Word/PDF raporu da kullanır) TR tabloları = katalog (ikinci kaynak sapmaz).
 *   • EN: Türkçe harf / ham anahtar yok (motor/sunucu kaynaklı metinler — sonuç nesnesindeki dizeler, yer adı — hariç; listelenir);
 *     dereceler, saatler ve sayılar TR = EN.
 *
 * Golden üretimi (yalnız taban bileşenle, bir kez): ... atlas-horary-i18n.harness.ts --write-golden
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-horary-i18n.harness.ts
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import Module from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, Fragment, type ReactElement } from "react";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "./intlRender";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { runWesternHorary, type WesternHoraryResult } from "@/lib/astrology/horary/westernRun";
import type { SavedRecord, Snapshot } from "@/app/admin/astroloji/_components/horary/WesternHoraryDesk";

// next/font (arşiv premium kabuğu yazı tipleri) Node'da çalışmaz → yalnız test için sınıf adı döndüren sahte modül. Ürün etkilenmez.
const ML = Module as unknown as { _load: (req: string, parent: unknown, isMain: boolean) => unknown };
const origLoad = ML._load;
ML._load = (req, parent, isMain) => (/^next\/font\/(local|google)$/.test(req) ? Object.assign(() => ({ className: "font-stub", variable: "--font-stub", style: { fontFamily: "stub" } }), { default: () => ({ className: "font-stub", variable: "--font-stub", style: { fontFamily: "stub" } }) }) : origLoad(req, parent, isMain));

async function main() {
const { default: WesternHoraryDesk, accidentalText, HoraryResult, ReportBar, SaveBar, SavedBar } = await import("@/app/admin/astroloji/_components/horary/WesternHoraryDesk");
const { default: HoraryArchive } = await import("@/app/admin/astroloji/_components/horary/HoraryArchive");
const { default: HoraryArchiveSwitch } = await import("@/app/admin/astroloji/_components/horary/HoraryArchiveSwitch");
const { default: HoraryClientPick } = await import("@/app/admin/astroloji/_components/horary/HoraryClientPick");
const L = await import("@/app/admin/astroloji/_lib/horaryWesternLabels");

process.env.TZ = "Europe/Istanbul"; // SavedBar "kaydedildi" zamanı süreç saat dilimiyle biçimlenir → golden ve test aynı

const FIX = join(__dirname, "fixtures", "i18n", "horary-desk-tr-taban.json");
const WRITE = process.argv.includes("--write-golden");

type Place = { label: string; timezone: string; latitude: number; longitude: number };
const IST: Place = { label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const SYD: Place = { label: "Sydney, Australia", timezone: "Australia/Sydney", latitude: -33.8688, longitude: 151.2093 };
const NYC: Place = { label: "New York, USA", timezone: "America/New_York", latitude: 40.7128, longitude: -74.006 };
const REY: Place = { label: "Reykjavik, Iceland", timezone: "Atlantic/Reykjavik", latitude: 64.1466, longitude: -21.9426 };
const LON: Place = { label: "London, UK", timezone: "Europe/London", latitude: 51.5074, longitude: -0.1278 };

const RUNS: { name: string; date: string; time: string; place: Place; house: number; dst?: "earlier" | "later"; question: string }[] = [
  { name: "ist-h7", date: "2026-10-29", time: "14:30", place: IST, house: 7, question: "Will this partnership offer come through?" },
  { name: "ist-h2-bos-soru", date: "2026-03-20", time: "09:05", place: IST, house: 2, question: "" },
  { name: "syd-h10", date: "2026-07-04", time: "21:40", place: SYD, house: 10, question: "Job offer?" },
  { name: "nyc-dst-h5", date: "2026-11-01", time: "01:30", place: NYC, house: 5, dst: "earlier", question: "Pregnancy?" },
  { name: "rey-h12", date: "2026-06-21", time: "23:50", place: REY, house: 12, question: "Hidden enemy?" },
  { name: "lon-h4", date: "2027-01-15", time: "06:15", place: LON, house: 4, question: "Sell the house?" },
  { name: "ist-h11", date: "2025-12-31", time: "23:59", place: IST, house: 11, question: "Hopes?" },
  { name: "ist-h9", date: "2026-05-05", time: "12:00", place: IST, house: 9, question: "Long journey?" },
];

function run(x: (typeof RUNS)[number]): WesternHoraryResult {
  const r = runWesternHorary({ date: x.date, time: x.time, place: x.place, quesitedHouse: x.house, ...(x.dst ? { dst: x.dst } : {}) });
  assert.ok(r.ok, `${x.name}: ${JSON.stringify(!r.ok && r.error)}`);
  return r.result;
}

const REC = (r: WesternHoraryResult, o: Partial<SavedRecord>): SavedRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "Kayıtlı soru",
  clientId: null,
  clientLabel: null,
  clientMissing: false,
  localDate: r.question.localDate,
  localTime: r.question.localTime,
  quesitedHouse: 7,
  methodologyVersion: "lilly-ca1647-v1",
  orbVariant: "ca107",
  isDemo: false,
  createdAt: "2026-10-30T08:15:00.000Z",
  questionText: null,
  ...o,
});

type Case = { name: string; el: ReactElement; data: unknown };
function cases(): Case[] {
  const out: Case[] = [];
  const noop = () => undefined;
  out.push({ name: "desk-initial", el: createElement(WesternHoraryDesk, { onHome: noop }), data: null });
  out.push({ name: "archive-initial", el: createElement(HoraryArchive), data: null });
  out.push({ name: "switch-profiles", el: createElement(HoraryArchiveSwitch, { mode: "profiles", onMode: noop }), data: null });
  out.push({ name: "switch-horary", el: createElement(HoraryArchiveSwitch, { mode: "horary", onMode: noop }), data: null });
  out.push({ name: "client-pick-empty", el: createElement(HoraryClientPick, { value: null, onChange: noop }), data: null });
  out.push({ name: "client-pick-value", el: createElement(HoraryClientPick, { value: { id: "c1", label: "Ada Lovelace" }, onChange: noop, testId: "x", disabled: true }), data: null });
  for (const x of RUNS) {
    const r = run(x);
    const snap: Snapshot = { date: x.date, time: x.time, placeId: "tr-34-istanbul", house: x.house, question: x.question, ...(x.dst ? { dst: x.dst } : {}) };
    for (const demo of [false, true]) {
      if (demo && x.name !== "ist-h7") continue;
      const actions = createElement(Fragment, null, createElement(ReportBar, { snap, demo }), createElement(SaveBar, { r, snap, demo }));
      out.push({ name: `result-${x.name}${demo ? "-demo" : ""}`, el: createElement(HoraryResult, { r, snap, demo, actions }), data: r });
    }
    if (x.name === "ist-h7" || x.name === "syd-h10") {
      const recs = [
        REC(r, {}),
        REC(r, { clientId: "c9", clientLabel: "Ada Lovelace", questionText: "Will it?", isDemo: true }),
        REC(r, { clientId: "c9", clientLabel: null, clientMissing: true, createdAt: "bozuk" }),
      ];
      recs.forEach((rec, i) => {
        const snap2: Snapshot = { date: rec.localDate, time: rec.localTime, placeId: "", house: rec.quesitedHouse, question: rec.questionText ?? rec.title };
        out.push({ name: `saved-${x.name}-${i}`, el: createElement(HoraryResult, { r, snap: snap2, demo: rec.isDemo, actions: createElement(SavedBar, { rec, onSaved: noop }) }), data: { r, rec } }); // kayıt başlığı = kullanıcı verisi
      });
    }
  }
  return out;
}

const all = cases();
if (WRITE) {
  const g: Record<string, string> = {};
  for (const c of all) g[c.name] = renderToStaticMarkup(c.el, "tr");
  writeFileSync(FIX, `${JSON.stringify({ taban: "26f217b9b (çeviri öncesi bileşen)", cases: g }, null, 1)}\n`);
  console.log(`golden yazıldı: ${Object.keys(g).length} vaka → ${FIX}`);
  process.exit(0);
}

assert.ok(existsSync(FIX), "golden yok");
const golden = (JSON.parse(readFileSync(FIX, "utf8")) as { cases: Record<string, string> }).cases;
assert.deepEqual(all.map((c) => c.name).sort(), Object.keys(golden).sort());

// ── KİLİT: etkileşimle görünen metinler (statik çizimde yok) — TR katalog = çeviri öncesi literal ─────────────
type Tr = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: "tr" | "en", namespace: string): Tr =>
  createTranslator({ locale, messages: getCatalogMessages(locale) as Record<string, never>, namespace: namespace as never }) as unknown as Tr;
const tr = translator("tr", "atlas.horary");
const en = translator("en", "atlas.horary");
const LOCKS: [string, Record<string, string | number> | undefined, string][] = [
  ["err.date", undefined, "Sorunun tarihini girin."],
  ["err.time", undefined, "Sorunun saatini girin."],
  ["err.place", undefined, "Sorunun sorulduğu konumu seçin."],
  ["err.house", undefined, "Sorulan evi seçin. Sorunun konusu hangi eve aitse onu bilerek seçmelisiniz."],
  ["err.range", { min: 1800, max: 2200 }, "Desteklenen tarih aralığı 1800–2200. Bu sınır, hesaplamanın doğrulandığı aralıktır."],
  ["err.timeout", { s: 25 }, "Hesaplama 25 saniye içinde yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin."],
  ["err.network", undefined, "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."],
  ["err.server", undefined, "Sunucu hatası nedeniyle harita oluşturulamadı. Girdileriniz korunuyor; biraz sonra tekrar deneyin."],
  ["dst.earlier", undefined, "İlk yaşanan"],
  ["dst.later", undefined, "İkinci yaşanan"],
  ["unc.sec", { n: 5 }, "±5 sn"],
  ["unc.min", { n: 12 }, "±12 dk"],
  ["unc.hour", { n: "1.5" }, "±1.5 sa"],
  ["busySubmit", undefined, "Hesaplanıyor…"],
  ["busyLine", undefined, "Harita hesaplanıyor…"],
  ["report.serverError", undefined, "Sunucu hatası nedeniyle rapor oluşturulamadı. Biraz sonra tekrar deneyin."],
  ["report.failed", undefined, "Rapor oluşturulamadı."],
  ["report.preparing", undefined, "Hazırlanıyor…"],
  ["report.downloaded", { fmt: "Word", name: "Horary.docx" }, "Word raporu indirildi: Horary.docx"],
  ["report.downloaded", { fmt: "PDF", name: "a.pdf" }, "PDF raporu indirildi: a.pdf"],
  ["save.titleRequired", undefined, "Kayıt başlığı gerekli."],
  ["save.reused", undefined, "Bu harita zaten kayıtlı."],
  ["save.saved", undefined, "Kaydedildi. Analiz Arşivi → Horary Soruları içinde bulabilirsiniz."],
  ["save.failed", undefined, "Kayıt şu anda yapılamadı. Girdileriniz korunuyor; tekrar deneyin."],
  ["save.saving", undefined, "Kaydediliyor…"],
  ["save.done", undefined, "Kaydedildi"],
  ["save.retry", undefined, "Tekrar dene"],
  ["save.okFallback", undefined, "Kaydedildi."],
  ["save.errFallback", undefined, "Kayıt yapılamadı."],
  ["save.openSaved", undefined, "Kayıtlı haritayı aç"],
  ["record.loading", undefined, "Kayıtlı harita yükleniyor…"],
  ["record.notFound", undefined, "Kayıt bulunamadı ya da bu kayda erişim yetkiniz yok."],
  ["record.loadFailed", undefined, "Kayıt yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin."],
  ["record.newQuestion", undefined, "Yeni Horary sorusu"],
  ["saved.updateFailed", undefined, "Güncelleme yapılamadı; tekrar deneyin."],
  ["saved.titleUpdated", undefined, "Başlık güncellendi."],
  ["saved.clientLinked", undefined, "Danışan bağlandı."],
  ["saved.clientUnlinked", undefined, "Danışan bağlantısı kaldırıldı."],
  ["archive.loadFailed", undefined, "Horary kayıtları yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin."],
  ["archive.emptyFiltered", undefined, "Bu filtrelere uyan Horary kaydı yok."],
  ["archive.empty", undefined, "Henüz kayıtlı Horary sorusu yok. Horary ekranında haritayı oluşturup “Kaydet”e basın."],
  ["archive.loadingMore", undefined, "Yükleniyor…"],
  ["archive.more", undefined, "Daha fazla göster"],
  ["archive.openRecord", { title: "X" }, "X kaydını aç"],
  ["client.minChars", undefined, "En az 2 harf yazın."],
  ["client.searching", undefined, "Aranıyor…"],
  ["client.noMatch", undefined, "Eşleşen danışan yok."],
  ["client.unnamed", undefined, "Adsız danışan"],
  ["demo.question", undefined, "DEMO — Bu ortaklık teklifi gerçekleşecek mi?"],
  ["demo.place", undefined, "İstanbul, Türkiye"],
];
for (const [k, v, lit] of LOCKS) {
  assert.equal(tr(k, v), lit, `kilit ${k}`);
  // "Türkiye" BM'nin resmî İngilizce ülke adıdır (2022) → yer adı istisnası.
  if (k !== "demo.place") assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(en(k, v)), `EN Türkçe: ${k} → ${en(k, v)}`);
}
// labels modülü (Word/PDF raporu da kullanır) TR tabloları = katalog → ekran ve rapor aynı terimi kullanır.
const tablePairs: [string, Readonly<Record<string, string>>][] = [
  ["houseTopic", L.HOUSE_TOPICS as Record<string, string>],
  ["aspect", L.ASPECT_LABEL as Record<string, string>],
  ["interposition", L.INTERPOSITION_LABEL],
  ["unresolvedReason", L.UNRESOLVED_REASON],
  ["translationStatus", L.TRANSLATION_STATUS],
  ["solarPhase", L.SOLAR_PHASE],
  ["consideration", L.CONSIDERATION_LABEL],
  ["timelineTag", L.TIMELINE_TAG],
  ["reception", L.RECEPTION_LABEL],
];
let tableN = 0;
for (const [ns, tbl] of tablePairs) {
  const t = translator("tr", `atlas.horary.${ns}`);
  const te = translator("en", `atlas.horary.${ns}`);
  for (const [k, v] of Object.entries(tbl)) {
    assert.equal(t(k), v, `${ns}.${k}`);
    assert.ok(!/[çğıöşüÇĞİÖŞÜ]/.test(te(k)), `EN ${ns}.${k}`);
    tableN++;
  }
}
// Arızi kalem anahtarları: dil-bağımsız ayrıştırıcı + katalog, TR'de lib accidentalLabel ile birebir.
const accKeys = ["retrograde", "direct", "swift", "slow", "moon_increasing", "moon_decreasing", "oriental", "occidental", "cazimi", "combust", "under_beams", "free_from_combustion", "besieged_saturn_mars", "partile_conj_north_node", "partile_conj_south_node", "regulus_1647", "spica_1647", "algol_1647", "bilinmeyen_kalem"];
for (let h = 1; h <= 12; h++) accKeys.push(`house_${h}`);
for (const a of ["conj", "sextile", "square", "trine", "opposition"]) for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "north_node"]) accKeys.push(`partile_${a}_${b}`);
const ttr = translator("tr", "atlas.horary");
for (const k of accKeys) assert.equal(accidentalText(k, ttr, L.body), L.accidentalLabel(k), `arızi ${k}`);
// Yerel saat biçimi: TR'de lib localAt ile birebir (rapor ile aynı).
for (const iso of ["2026-10-29T11:30:00Z", "2026-03-29T00:59:00Z", "2026-03-29T01:00:00Z", "2027-01-01T00:00:00Z"])
  for (const tz of ["Europe/Istanbul", "Australia/Sydney", "America/New_York", "Atlantic/Reykjavik"]) assert.equal(L.localAtIn("tr", iso, tz), L.localAt(iso, tz));

// ── HTML: TR = golden; EN Türkçe harfsiz ────────────────────────────────────────────────────────────────
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const attrs = (h: string) => [...h.matchAll(/\s(?:title|aria-label|placeholder|alt|value)="([^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
// EN sıra sayıları ("7th house") sözcük sınırı taşımaz → tam sayı yalın \d+ ile alınır.
// en-GB tarih "30/10/2026, 11:15:00" ↔ tr-TR "30.10.2026 11:15:00": aynı sayılar, farklı ayraç → karşılaştırma öncesi eşlenir.
const nums = (h: string) => (strip(h).replace(/(\d{2})\/(\d{2})\/(\d{4}),?/g, "$1.$2.$3").match(/\d+°\d{2}′|\d{1,2}:\d{2}|[+−-]?\d+[.,]\d+|\d+/g) ?? []).map((s) => s.replace(",", ".")).join(" ");
function dataStrings(x: unknown, acc: Set<string>) {
  if (typeof x === "string") {
    if (/[çğıöşüÇĞİÖŞÜ]/.test(x)) acc.add(x);
  } else if (Array.isArray(x)) x.forEach((y) => dataStrings(y, acc));
  else if (x && typeof x === "object") Object.values(x).forEach((y) => dataStrings(y, acc));
}
// Başka ajanın bileşeni (LocationPicker / NatalWheel) ve motor verisi: EN denetiminden düşülür, sayılır.
const libExempt = new Map<string, number>();
let enOk = 0;
for (const c of all) {
  const trHtml = renderToStaticMarkup(c.el, "tr");
  assert.equal(trHtml, golden[c.name], `${c.name}: TR HTML çeviri öncesiyle bayt-bayt aynı değil`);
  const enHtml = renderToStaticMarkup(c.el, "en");
  assert.ok(!/atlas\.horary|terms\./.test(strip(enHtml) + attrs(enHtml).join(" ")), `${c.name}: ham anahtar`);
  const ds = new Set<string>();
  dataStrings(c.data, ds);
  // NatalWheel (ATLAS-A kapsamı; bu dalda çevrilmedi) çark bölümü EN denetiminden çıkarılır; içindeki Türkçe sözcükler sayılır.
  let enOwn = enHtml;
  const wi = enHtml.indexOf('data-testid="horary-wheel"');
  if (wi >= 0) {
    const s0 = enHtml.lastIndexOf("<section", wi);
    const s1 = enHtml.indexOf("</section>", wi) + "</section>".length;
    for (const w of strip(enHtml.slice(s0, s1)).match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g) ?? []) libExempt.set(`[NatalWheel] ${w}`, (libExempt.get(`[NatalWheel] ${w}`) ?? 0) + 1);
    enOwn = enHtml.slice(0, s0) + enHtml.slice(s1);
  }
  let txt = `${strip(enOwn)} ${attrs(enOwn).join(" ")}`;
  for (const s of [...ds].sort((a, b) => b.length - a.length)) {
    if (txt.includes(s)) {
      libExempt.set(s, (libExempt.get(s) ?? 0) + 1);
      txt = txt.split(s).join(" ");
    }
  }
  // Başka bileşenin (LocationPicker — ATLAS-A kapsamı) TR metinleri yalnız desk-initial'da görünür → listelenir.
  const bad = txt.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g) ?? [];
  if (c.name === "desk-initial" && bad.length) {
    for (const w of bad) libExempt.set(`[LocationPicker] ${w}`, (libExempt.get(`[LocationPicker] ${w}`) ?? 0) + 1);
  } else assert.equal(bad.length, 0, `${c.name}: EN Türkçe: ${bad.slice(0, 10).join(" | ")}`);
  assert.equal(nums(enHtml).replace(/[−-]/g, "-"), nums(trHtml).replace(/[−-]/g, "-"), `${c.name}: sayılar TR = EN`);
  enOk++;
}
console.log(`✅ atlas-horary-i18n: TR HTML = taban ${all.length}/${all.length} vaka · ${LOCKS.length} etkileşim metni kilidi · ${tableN} labels tablo kilidi · ${accKeys.length} arızi kalem kilidi · localAt kilidi · EN ${enOk} vaka Türkçe harfsiz/ham anahtarsız/sayılar aynı`);
console.log(`   EN muaf (motor/veri veya başka bileşen kaynaklı, ${libExempt.size} farklı dize):`);
for (const [s, n] of [...libExempt].sort((a, b) => b[1] - a[1])) console.log(`     ${n}× ${s.slice(0, 110)}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

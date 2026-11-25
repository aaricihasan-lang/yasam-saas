/**
 * I18N-F1-R5 / ATLAS-E — Aylık efemeris (ekran + Word/PDF + sunucu hata metinleri) çevirisi. Ağ / DB / sağlayıcı / DE440 YOK.
 *
 *   T1 TR BİREBİR: gösterim katmanının bütün kullanıcı çıktısı (format/contract/rapor modeli/Word belge metni/servis-kayıt-rota hata
 *      gövdeleri/ekran ilk çizimi) çeviri ÖNCESİ kodun (26f217b9b) ürettiği tabanla aynı (fixtures/i18n/monthly-ephemeris-tr-taban.json).
 *      Hem varsayılan (dil verilmeden) hem açık `monthlyText("tr")` ile.
 *   T2 EN: aynı vakalar EN metinle — Türkçe harf / ham anahtar yok (marka "Yaşam Sistemi", kullanıcı içeriği ve kayda yazılan kaynak-dil
 *      teknik metinleri hariç; bunlar ayrıca T4'te çevrilerek gösterilir).
 *   T3 SAYISAL EŞİTLİK: efemeris değerleri TR = EN (burç sembolü, derece°dakika′, retro, boylam rakamları, tarih bileşenleri, kontrol sayıları).
 *   T4 Kaynak-dil teknik metinlerin gösterim çevirisi (bağımsız kontrol yöntemi / nedeni) + sunucu hata gövdesi (localizeBody):
 *      TR'de aynı nesne (bayt-bayt), EN'de yalnız `error` değişir; her bilinen hata metninin EN karşılığı var.
 *   T5 Biçimleyici eşitliği: text.fill (sunucu/rapor) = next-intl ICU (ekran) — bütün atlas.monthly anahtarları, iki dil.
 *   T6 Tarih/saat biçimi: ekran tarihi tr GG.AA.YYYY · en GG/AA/YYYY; rapor damgası tr "(TSİ)" · en "(UTC+3)", 24 saat.
 *   T7 Statik: çevrilen dosyalarda sabit metin 0; kodda kullanılan her anahtar iki dilde katalogda; graha etiketleri terms registry'den
 *      (TR "Rahu (Kuzey Ay Düğümü)" korunur, ikinci tablo yok); Vedik ad tablosu kaldırıldı.
 *   T8 EN Word/PDF gerçekten üretilir (dosya adı EN, %PDF, yatay A4).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-monthly-i18n.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { captureMonthly } from "./atlasMonthlyCapture";
import { CROSSCHECK_REASON_SAMPLES, FIXED_NOW_ISO, monthlyCases } from "./atlasMonthlyCases";
import { checkMethodText, checkReasonText, fill, monthlyText, SOURCE_TEXT } from "@/lib/astrology/pro/monthly/text";
import { localizeBody } from "@/lib/astrology/pro/monthly/routeKit";
import { renderMonthlyReport } from "@/lib/astrology/pro/monthly/reportRender";
import { buildMonthlyReport } from "@/lib/astrology/pro/monthly/reportModel";
import { CROSSCHECK_METHOD } from "@/lib/astrology/pro/monthly/crossCheck";
import { scanSource } from "../i18n/hardcoded-scan.mjs";

const root = join(__dirname, "..", "..");
type Tree = { [k: string]: string | Tree };
const read = (p: string) => readFileSync(join(root, p), "utf8");
const json = <T>(p: string) => JSON.parse(read(p)) as T;
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const ALLOWED_TR = [/Yaşam Sistemi/g, /YAŞAM SİSTEMİ/g];
const stripAllowed = (s: string) => ALLOWED_TR.reduce((a, re) => a.replace(re, ""), s);
// React metin ayırıcı yorumları atılır; katlanır "Ayrıntılı yerel tablo" (eski EphemerisDesk — bu işin dışı) gövdesi süreç saat dilimine
// bağlı metin içerir (TZ=UTC'de "UTC", Europe/Istanbul'da "TSİ") → yalnız özet başlığı karşılaştırılır.
const normHtml = (h: string) =>
  h.replace(/<!-- -->/g, "").replace(/(<details[^>]*>\s*<summary>[\s\S]*?<\/summary>)[\s\S]*<\/details>/, "$1</details>");

let pass = 0;
let fail = 0;
async function t(name: string, f: () => unknown | Promise<unknown>) {
  try {
    await f();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`  FAIL ${name}\n       ${(e as Error).message.split("\n").slice(0, 8).join("\n       ")}`);
  }
}
/** Nesnedeki bütün metin yapraklarını yol ile toplar. */
function leaves(v: unknown, path = "", out: [string, string][] = []): [string, string][] {
  if (typeof v === "string") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) leaves(x, path ? `${path}.${k}` : k, out);
  return out;
}

async function main() {
  const base = json<{ out: Record<string, unknown> }>("scripts/astrology/fixtures/i18n/monthly-ephemeris-tr-taban.json").out;
  const TR = monthlyText("tr");
  const EN = monthlyText("en");

  // ─── T1 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const trDefault = await captureMonthly(undefined, "tr");
  const trExplicit = await captureMonthly(TR, "tr");
  for (const [label, got] of [["varsayılan (dil yok)", trDefault], ["monthlyText(\"tr\")", trExplicit]] as const) {
    await t(`T1 TR çıktı = çeviri öncesi taban — ${label} (${Object.keys(base).length} bölüm)`, () => {
      assert.deepEqual(Object.keys(got).sort(), Object.keys(base).sort(), "bölüm kümesi");
      for (const k of Object.keys(base)) {
        if (k === "deskHtml") assert.equal(normHtml(got[k] as string), normHtml(base[k] as string), "ekran ilk çizimi (React metin ayırıcı yorumları hariç)");
        else assert.deepEqual(got[k], base[k], `bölüm ${k}`);
      }
    });
  }

  // ─── T2 / T3 ─────────────────────────────────────────────────────────────────────────────────────────────────
  const en = await captureMonthly(EN, "en");
  // Kayda/önbelleğe yazılan KAYNAK-DİL teknik metinler ve kütüphanenin kaynak-dil hata gövdeleri (rota sınırında çevrilir → T4) hariç.
  const SOURCE_SECTIONS = new Set(["crossCheckMethod", "crossReasons", "parseErrors", "service", "records", "anyRate"]);
  const userContent = new Set(monthlyCases().flatMap((c) => (c.saved ? [c.saved.title] : [])));
  await t("T2 EN: Türkçe harf / ham anahtar yok (marka ve kullanıcı içeriği hariç)", () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(en)) {
      if (SOURCE_SECTIONS.has(k)) continue;
      let txt = k === "deskHtml" ? (v as string).replace(/<details[\s\S]*<\/details>/, (d) => d.match(/<summary>[\s\S]*?<\/summary>/)?.[0] ?? "") : null;
      const items: [string, string][] = txt !== null ? [[k, txt]] : leaves(v, k);
      for (const [p, s] of items) {
        let x = stripAllowed(s);
        for (const u of userContent) x = x.split(u).join("");
        if (TR_CHARS.test(x)) bad.push(`${p}: ${x.match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g)?.slice(0, 4).join(" | ")}`);
        if (/atlas\.monthly\.|terms\.[a-z]/.test(x)) bad.push(`${p}: ham anahtar`);
      }
      txt = null;
    }
    assert.equal(bad.length, 0, bad.slice(0, 12).join("\n"));
  });
  await t("T2b EN ekran: Ayrıntılı yerel tablo (eski EphemerisDesk, bu görevin dışı) yalnız katlanır özet başlığı çevrilir", () => {
    const html = en.deskHtml as string;
    assert.match(html, /<summary>Detailed local table/);
  });

  const trCases = trDefault.cases as Record<string, { model: ReturnType<typeof buildMonthlyReport>; methodLines: string[]; docxFilename: string }>;
  const enCases = en.cases as typeof trCases;
  // Sayı dizisi: ondalık ayırıcı ("," / ".") ve saat yazımı (tr "12.00" / en "12:00") normalize; EN bölge etiketi "UTC+3" sayı değildir.
  const nums = (s: string) =>
    (s.replace(/UTC\+3/g, "").replace(/(\d),(\d)/g, "$1.$2").replace(/\b(\d{1,2})[.:](\d{2})(?=[\s).]|$)/g, "$1h$2").match(/\d+(?:[.h]\d+)?/g) ?? []).join(" ");
  await t("T3 efemeris değerleri TR = EN: hücre (sembol + derece°dakika′ + ℞), gün numarası, sütun sembolleri, yöntem/künye sayıları", () => {
    for (const name of Object.keys(trCases)) {
      const a = trCases[name].model;
      const b = enCases[name].model;
      assert.equal(a.rows.length, b.rows.length, name);
      a.rows.forEach((r, i) => {
        assert.equal(r.day.slice(0, 2), b.rows[i].day.slice(0, 2), `${name} gün ${i}`);
        r.cells.forEach((c, j) => {
          assert.equal(c.bottom, b.rows[i].cells[j].bottom, `${name} ${i}/${j} derece`);
          assert.equal(c.top.split(" ")[0], b.rows[i].cells[j].top.split(" ")[0], `${name} ${i}/${j} burç sembolü`);
        });
      });
      assert.deepEqual(a.columns.slice(1).map((c) => c.split(" ")[0]), b.columns.slice(1).map((c) => c.split(" ")[0]), `${name} sütun sembolleri`);
      assert.equal(nums(trCases[name].methodLines.join(" ")), nums(enCases[name].methodLines.join(" ")), `${name} yöntem metni sayıları`);
      const metaNums = (m: [string, string][]) => m.filter(([k]) => !/Hesaplandı|Calculated|Rapor tarihi|Report date|Kayıt|Record/.test(k)).map(([, v]) => nums(v)).join("|");
      assert.equal(metaNums(a.meta), metaNums(b.meta), `${name} künye sayıları`);
    }
    const cellsTr = trDefault.cells as { lonText: string; degMin: string; signGlyph: string }[];
    const cellsEn = en.cells as typeof cellsTr;
    cellsTr.forEach((c, i) => {
      assert.equal(c.degMin, cellsEn[i].degMin);
      assert.equal(c.signGlyph, cellsEn[i].signGlyph);
      assert.equal(c.lonText.replace(",", "."), cellsEn[i].lonText, "boylam: yalnız ondalık ayırıcı farklı");
    });
  });

  // ─── T4 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await t("T4 kayda yazılan kaynak-dil kontrol yöntemi/nedeni: TR aynen, EN çevrilir; bilinmeyen eski metin olduğu gibi", () => {
    for (const r of CROSSCHECK_REASON_SAMPLES) {
      assert.equal(checkReasonText(r, TR), r);
      const e = checkReasonText(r, EN);
      assert.ok(e !== r && !TR_CHARS.test(e), `neden çevrilmedi: ${r}`);
    }
    assert.equal(checkReasonText("eski bilinmeyen neden", EN), "eski bilinmeyen neden");
    for (const k of ["western", "vedic"] as const) {
      assert.equal(CROSSCHECK_METHOD[k], (base.crossCheckMethod as Record<string, string>)[k], "saklanan yöntem metni değişmedi");
      assert.equal(checkMethodText(k, CROSSCHECK_METHOD[k], TR), CROSSCHECK_METHOD[k]);
      assert.ok(!TR_CHARS.test(stripAllowed(checkMethodText(k, CROSSCHECK_METHOD[k], EN))));
    }
    assert.equal(checkMethodText("western", "", EN), "", "boş yöntem (eski) aynen");
  });
  await t("T4b hata gövdesi: TR aynı nesne (bayt-bayt); EN yalnız `error` değişir, bütün bilinen metinler çevrilir", () => {
    const bodies: Record<string, unknown>[] = [];
    for (const v of Object.values(base.service as Record<string, unknown>)) {
      if (Array.isArray(v)) v.forEach((x) => bodies.push({ ok: false, ...(x as object) }));
      else bodies.push({ ok: false, ...((v as { error: object }).error) });
    }
    for (const v of Object.values(base.records as Record<string, unknown>)) if (v && typeof v === "object") bodies.push((v as { body: Record<string, unknown> }).body);
    bodies.push((base.anyRate as { body: Record<string, unknown> }).body);
    for (const p of base.parseErrors as { ok: boolean; error?: Record<string, unknown> }[]) if (!p.ok && p.error) bodies.push({ ok: false, ...p.error });
    bodies.push({ ok: false, code: "INVALID_FORMAT", error: SOURCE_TEXT.t("errors.formatInvalid") }, { ok: false, code: "RATE_LIMITED", error: SOURCE_TEXT.t("errors.reportRate") });
    bodies.push({ ok: false, code: "RECORD_CAP_REACHED", error: SOURCE_TEXT.t("errors.recordCap", { cap: "3000" }), cap: 3000 });
    let n = 0;
    for (const b of bodies) {
      assert.equal(localizeBody(b, TR), b, "TR: aynı nesne");
      const e = localizeBody(b, EN);
      assert.deepEqual(Object.keys(e), Object.keys(b), "alan sırası aynı");
      for (const k of Object.keys(b)) if (k !== "error") assert.deepEqual(e[k], b[k], `alan ${k} değişmez`);
      assert.ok(typeof e.error === "string" && !TR_CHARS.test(e.error as string), `EN karşılığı yok: ${String(b.error)}`);
      n++;
    }
    assert.ok(n >= 25, `gövde sayısı ${n}`);
    const ok = { ok: true, result: { a: 1 } };
    assert.equal(localizeBody(ok, EN), ok, "başarılı gövde aynen");
  });

  // ─── T5 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await t("T5 text.fill (sunucu/rapor) = next-intl ICU (ekran): bütün atlas.monthly anahtarları, TR + EN", () => {
    let n = 0;
    for (const loc of ["tr", "en"] as const) {
      const msgs = json<{ atlas: { monthly: Tree; skyTools: Tree } }>(`messages/${loc}/atlas.monthly.json`);
      const icu = createTranslator({ locale: loc, messages: msgs as never, namespace: "atlas.monthly" as never }) as unknown as (k: string, v?: Record<string, string>) => string;
      for (const [key, msg] of leaves(msgs.atlas.monthly)) {
        const names = [...msg.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const values = Object.fromEntries(names.map((x, i) => [x, `«${x}${i}'1,5»`]));
        assert.equal(fill(msg, values), icu(key, values), `${loc} ${key}`);
        assert.equal(monthlyText(loc).t(key, values), icu(key, values), `${loc} ${key} (monthlyText)`);
        n++;
      }
    }
    assert.ok(n > 300, String(n));
  });

  // ─── T6 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await t("T6 tarih/saat: ekran tr GG.AA.YYYY · en GG/AA/YYYY; rapor damgası tr '(TSİ)' · en '(UTC+3)', 24 saat", () => {
    const dTr = trDefault.dates as { date: string; day: string }[];
    const dEn = en.dates as typeof dTr;
    dTr.forEach((d, i) => {
      assert.match(d.date, /^\d{2}\.\d{2}\.\d{4}$/);
      assert.equal(dEn[i].date, d.date.replace(/\./g, "/"));
    });
    assert.equal(dEn[0].day, "01 Sun");
    const c = monthlyCases()[0];
    const mTr = buildMonthlyReport(c.e, { generatedAt: "2026-11-25T21:05:00.000Z", saved: null });
    const mEn = buildMonthlyReport(c.e, { generatedAt: "2026-11-25T21:05:00.000Z", saved: null, text: EN });
    assert.equal(mTr.meta.at(-1)![1], "26.11.2026 00:05 (TSİ)");
    assert.equal(mEn.meta.at(-1)![1], "26/11/2026, 00:05 (UTC+3)");
    assert.equal(mEn.meta.at(-1)![0], "Report date");
    assert.equal(EN.t("method.localNote"), "(15:00 Istanbul time, UTC+3)");
  });

  // ─── T7 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const FILES = [
    "app/admin/astroloji/_components/ephemeris/MonthlyEphemerisDesk.tsx",
    "app/admin/astroloji/_components/ephemeris/SkyToolsDesk.tsx",
    "app/api/admin/astroloji/efemeris/aylik/rapor/route.ts",
    "app/api/admin/astroloji/efemeris/aylik/kayitlar/[id]/rapor/route.ts",
    "lib/astrology/pro/monthly/crossCheck.ts",
    "lib/astrology/pro/monthly/format.ts",
    "lib/astrology/pro/monthly/records.ts",
    "lib/astrology/pro/monthly/reportModel.ts",
    "lib/astrology/pro/monthly/reportRender.ts",
    "lib/astrology/pro/monthly/routeKit.ts",
    "lib/astrology/pro/monthly/service.ts",
    "lib/astrology/pro/monthly/text.ts",
    "lib/auth/emailSelfService.ts",
  ];
  await t(`T7 sabit metin 0 (${FILES.length} dosya); contract.ts yalnız 10 izdüşüm günlük nedeni (kullanıcıya gösterilmez)`, () => {
    for (const f of FILES) assert.deepEqual((scanSource(f, read(f)) as { hits: unknown[] }).hits, [], f);
    const c = scanSource("lib/astrology/pro/monthly/contract.ts", read("lib/astrology/pro/monthly/contract.ts")) as { hits: { line: number }[] };
    const src = read("lib/astrology/pro/monthly/contract.ts").split(/\r?\n/);
    assert.equal(c.hits.length, 10);
    for (const h of c.hits) assert.match(src[h.line - 1], /reason:/, `contract.ts:${h.line} yalnız izdüşüm nedeni olmalı`);
  });
  await t("T7b kodda kullanılan her atlas.monthly / atlas.skyTools anahtarı iki dilde var", () => {
    const tr = json<{ atlas: Tree }>("messages/tr/atlas.monthly.json").atlas;
    const en2 = json<{ atlas: Tree }>("messages/en/atlas.monthly.json").atlas;
    const has = (tree: Tree, k: string) => k.split(".").reduce<string | Tree | undefined>((a, p) => (a && typeof a === "object" ? a[p] : undefined), tree) !== undefined;
    let n = 0;
    for (const f of FILES.concat(["lib/astrology/pro/monthly/contract.ts", "app/api/admin/astroloji/efemeris/aylik/route.ts"])) {
      const src = read(f);
      const ns = f.endsWith("SkyToolsDesk.tsx") ? "skyTools" : "monthly";
      for (const m of src.matchAll(/(?:\bL|\bTR|\bSOURCE_TEXT|\bt)\.?t?\(\s*"([a-zA-Z][\w.]*)"/g)) {
        const k = `${ns}.${m[1]}`;
        if (!/\./.test(m[1]) && ns === "monthly") continue; // t("x") tek parçalı anahtar yalnız skyTools'ta
        assert.ok(has(tr, k) && has(en2, k), `${f}: ${k}`);
        n++;
      }
      for (const m of src.matchAll(/\bE\("(\w+)"/g)) {
        assert.ok(has(tr, `monthly.errors.${m[1]}`) && has(en2, `monthly.errors.${m[1]}`), `${f}: errors.${m[1]}`);
        n++;
      }
    }
    assert.ok(n > 120, String(n));
  });
  await t("T7c graha etiketleri terms registry'den: Vedik ad = terms.graha (Rahu/Ketu = terms.grahaNodeFull, TR 'Rahu (Kuzey Ay Düğümü)'); ikinci tablo yok", () => {
    const termsTr = json<{ terms: Record<string, Record<string, string>> }>("messages/tr/terms.json").terms;
    const termsEn = json<{ terms: Record<string, Record<string, string>> }>("messages/en/terms.json").terms;
    assert.equal(termsTr.grahaNodeFull.rahu, "Rahu (Kuzey Ay Düğümü)");
    assert.equal(termsTr.grahaNodeFull.ketu, "Ketu (Güney Ay Düğümü)");
    assert.equal(termsEn.grahaNodeFull.rahu, "Rahu (North Node)");
    assert.equal(termsTr.graha.rahu, "Rahu", "mevcut terms değeri değişmedi");
    const b = base.bodies as Record<string, { name: string; header: string }>;
    for (const g of ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"]) assert.equal(b[`vedic.${g}`].name, termsTr.graha[g], `vedic.${g}`);
    const enB = en.bodies as typeof b;
    assert.equal(enB["vedic.rahu"].name, "Rahu (North Node)");
    assert.equal(enB["vedic.sun"].name, "Sun (Surya)");
    const fmt = read("lib/astrology/pro/monthly/format.ts");
    assert.ok(!/VEDIC_NAME|VEDIC_SHORT|WESTERN_SHORT|MONTH_NAMES_TR|WEEKDAY_TR/.test(fmt), "format.ts ikinci etiket tablosu taşımaz");
  });

  // ─── T8 ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await t("T8 EN Word/PDF üretilir: dosya adı EN, %PDF yatay A4, Word metni Türkçe harfsiz (marka/ortak altbilgi hariç)", async () => {
    const c = monthlyCases()[0];
    const docx = await renderMonthlyReport(c.e, "docx", { generatedAt: FIXED_NOW_ISO, saved: null, text: EN });
    assert.equal(docx.filename, "ephemeris-western-tropical-2026-11.docx");
    const pdf = await renderMonthlyReport(monthlyCases()[1].e, "pdf", { generatedAt: FIXED_NOW_ISO, saved: null, text: EN });
    assert.equal(pdf.filename, "ephemeris-vedic-sidereal-2024-02.pdf");
    const s = Buffer.from(pdf.bytes).toString("latin1");
    assert.ok(s.startsWith("%PDF"));
    assert.ok([...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].every((m) => Math.abs(Number(m[1]) - 841.89) < 0.01));
    const enDoc = (en.cases as Record<string, { docxText: string; docxHeaderFooter: string[] }>)["bati-2026-11-pass"];
    assert.ok(!TR_CHARS.test(stripAllowed(enDoc.docxText).split("Efemeris · Batı (Tropikal) · Kasım 2026").join("")), "Word gövdesi");
    // Ortak altbilgi (lib/docx/reportHelpers.buildFooter) "Sayfa" kelimesini kendisi yazar → rapor sözleşmesi (#855) kapsamı; burada yalnız bilgi.
    console.log(`       bilgi: EN Word üst/alt bilgi = ${JSON.stringify(enDoc.docxHeaderFooter)}`);
  });

  console.log(`\nSONUÇ atlas-monthly-i18n: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

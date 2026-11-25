/**
 * I18N — RAPOR GOLDEN HARNESS'I (ortak çıktı dili sözleşmesi + Kupa & Hacamat pilotu).
 *
 * Çalıştırma (repo kökü):
 *   npx tsx scripts/i18n/reports-golden.harness.ts                 → TR golden + EN dil kontrolleri
 *   npx tsx scripts/i18n/reports-golden.harness.ts --write-golden  → TR golden'ı yazar (yalnız golden YOKSA)
 *   … --write-golden --overwrite                                    → bilinçli golden güncellemesi (PR'da diff görünür)
 *   … --out <dizin>                                                 → TR + EN örnek .docx'leri diske yazar (kanıt/manuel kabul)
 *
 * KURAL: Golden, ortak motor / üretici değişikliğinden ÖNCE taban SHA'da üretilir. Sonraki her koşuda:
 *   (1) parametresiz (bugünkü) çağrı, (2) açık Türkçe çıktı dili → parça bazında normalize SHA'lar golden'a EŞİT.
 *   (3) İngilizce çıktı dili → kullanıcı nöbetçi metinleri AYNEN; nöbetçi dışı Türkçe sistem metni = 0;
 *       sayısal değerler (gün numaraları, Hicrî gün/yıl, yıllar) TR ile aynı; belge dili en-GB.
 * DB / ağ / sır YOK; tamamen sentetik fikstür.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { buildProtocolWordBuffer, protocolWordFilename } from "@/lib/cupping/protocolWord";
import { buildCalendarPlanWordBuffer, calendarWordFilename } from "@/lib/cupping/calendarWord";
import { brandingFixture, calendarFixtures, protocolFixtures } from "./reports-golden/fixtures";
import { buildEnginesDoc } from "./reports-golden/engines";
import { digest, docxParts, textNodes } from "./reports-golden/normalize";
import type { ReportLocale } from "@/lib/i18n/reportLocale";

const ROOT = process.cwd();
const GOLDEN = join(ROOT, "scripts/i18n/golden/reports-tr.golden.json");
const args = process.argv.slice(2);
const WRITE = args.includes("--write-golden");
const OVERWRITE = args.includes("--overwrite");
const outIdx = args.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : null;

let pass = 0;
let fail = 0;
let info = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string): void {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
  }
}
function note(msg: string): void {
  info++;
  console.log(`  INFO: ${msg}`);
}

type Built = { name: string; buffer: Buffer; filename: string | null };
type GoldenFile = { baseSha: string; generator: string; fixtures: Record<string, { filename: string | null; digest: string; parts: Record<string, string> }> };

// Taban (dil parametresiz) ile yeni imzaları aynı dosyadan çağırabilmek için gevşek tipli erişim.
type AnyFn = (...a: unknown[]) => unknown;
const callFn = <T>(fn: unknown, ...a: unknown[]) => (fn as AnyFn)(...a) as T;

/** output === undefined → tabandaki parametresiz çağrı. */
async function buildAll(output?: ReportLocale, common?: unknown, engineStyles?: unknown): Promise<Built[]> {
  const out: Built[] = [];
  for (const f of protocolFixtures()) {
    const input = output === undefined ? f.input : { ...f.input, output };
    out.push({
      name: f.name,
      buffer: await buildProtocolWordBuffer(input),
      filename: output === undefined ? protocolWordFilename(f.input.protocol) : callFn<string>(protocolWordFilename, f.input.protocol, output),
    });
  }
  for (const f of calendarFixtures()) {
    const input = output === undefined ? f.input : { ...f.input, output };
    out.push({
      name: f.name,
      buffer: await buildCalendarPlanWordBuffer(input),
      filename: output === undefined ? calendarWordFilename(f.input.plan, f.input.month ?? null) : callFn<string>(calendarWordFilename, f.input.plan, f.input.month ?? null, output),
    });
  }
  out.push({ name: "ortak-motorlar", buffer: await buildEnginesDoc(brandingFixture(), common, engineStyles), filename: null });
  return out;
}

async function snapshot(built: Built[]): Promise<GoldenFile["fixtures"]> {
  const fx: GoldenFile["fixtures"] = {};
  for (const b of built) {
    const { parts } = await docxParts(b.buffer);
    fx[b.name] = { filename: b.filename, digest: digest(parts), parts };
  }
  return fx;
}

function compare(label: string, golden: GoldenFile["fixtures"], got: GoldenFile["fixtures"]): void {
  for (const name of Object.keys(golden)) {
    const g = golden[name]!;
    const c = got[name];
    if (!c) {
      ok(false, `${label}: ${name} üretilmedi`);
      continue;
    }
    ok(c.filename === g.filename, `${label}: ${name} dosya adı birebir (${c.filename} vs ${g.filename})`);
    const diffParts = Object.keys({ ...g.parts, ...c.parts }).filter((p) => g.parts[p] !== c.parts[p]);
    ok(diffParts.length === 0 && c.digest === g.digest, `${label}: ${name} normalize XML SHA birebir${diffParts.length ? ` — farklı parçalar: ${diffParts.join(", ")}` : ""}`);
  }
}

function writeSamples(dir: string, lang: string, built: Built[]): void {
  mkdirSync(dir, { recursive: true });
  for (const b of built) {
    const fname = `${lang}__${b.name}${b.filename ? `__${b.filename.replace(/[^\w.-]+/g, "_")}` : ".docx"}`;
    writeFileSync(join(dir, fname.endsWith(".docx") ? fname : `${fname}.docx`), b.buffer);
  }
}

// ── EN dil kontrolleri ───────────────────────────────────────────────────────
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜâîûÂÎÛ]/;
/** ASCII yazılabilen sık Türkçe sistem sözcükleri (Türkçe harf içermeyen sızıntılar için). */
const TR_ASCII_WORDS = /\b(Sayfa|Takvim|Takvimi|Kaynak|Kaynaklar|Teknikler|Bilgiler|Hazirlik|Hazirlayan|Yillik|Ocak|Mart|Nisan|Haziran|Temmuz|Ekim|Kasim|Aralik|Pazartesi|Cuma|Pazar|Renk|Genel|Sonrasi|Oncesi|Mavi|Mor|Pembe|Turuncu|Muharrem|Safer|Recep|Ramazan|Zilkade|Zilhicce|gun|daha|ilk|Not|Tarih|Rapor|Uzman|Bilgilendirme|Protokol|Protokolu|Kupa|Hacamat)\b/;

/** Metin düğümlerinden kullanıcı nöbetçileri (⟦…⟧) ÇIKARILMIŞ sistem metni (ör. "Kaynak: ⟦…⟧" → "Kaynak: "). */
const USER_RE = /⟦[^⟧]*⟧/g;
/**
 * ASCII yazılmış Türkçe sızıntılar için (ör. "Detay notu:"): her rapor katalog anahtarının TR değerinden çıkarılan parçalar
 * (ICU yer tutucuları ayrılır; ≥ 4 harf). EN belgede bu parçalardan biri görülürse sızıntıdır. EN katalogda TR değeri
 * kopyalanmış olsa bile yakalanır (TR = EN karşılaştırması YAPILMAZ; bugün TR = EN olan tek anahtar harfsiz `dayDate`).
 */
const TR_CATALOG_FRAGMENTS: { text: string; re: RegExp }[] = (() => {
  const flat = (o: unknown, p = "", out: Record<string, string> = {}) => {
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o as Record<string, unknown>)) flat(v, p ? `${p}.${k}` : k, out);
    else if (typeof o === "string") out[p] = o;
    return out;
  };
  const frags = new Set<string>();
  for (const ns of ["reports.common", "reports.cupping"]) {
    const tr = flat(JSON.parse(readFileSync(join(ROOT, `messages/tr/${ns}.json`), "utf8")));
    for (const v of Object.values(tr)) {
      for (const part of v.split(/\{[^}]*\}|·|•|\+/)) {
        const f = part.trim();
        if (f.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüâîû]/g, "").length >= 4) frags.add(f);
      }
    }
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...frags].map((text) => ({ text, re: new RegExp(`(^|[^A-Za-zÇĞİÖŞÜçğıöşü])${esc(text)}($|[^A-Za-zÇĞİÖŞÜçğıöşü])`) }));
})();

function systemTexts(xml: string): string[] {
  return textNodes(xml).map((t) => t.replace(USER_RE, " ")).filter((t) => t.trim() !== "");
}
/** Kullanıcı nöbetçilerinin kendisi (sırasıyla). */
function userTexts(xml: string): string[] {
  return textNodes(xml).flatMap((t) => t.match(USER_RE) ?? []);
}

async function enChecks(trBuilt: Built[], enBuilt: Built[]): Promise<void> {
  for (const en of enBuilt) {
    const tr = trBuilt.find((b) => b.name === en.name)!;
    const { xml: enXml } = await docxParts(en.buffer);
    const { xml: trXml } = await docxParts(tr.buffer);
    const textParts = Object.keys(enXml).filter((p) => /^word\/(document|footer\d*|header\d*)\.xml$/.test(p) || p === "docProps/core.xml");
    const leaks: string[] = [];
    for (const p of textParts) {
      const nodes = p === "docProps/core.xml" ? [...enXml[p]!.matchAll(/<dc:(title|description|subject)>([^<]*)<\/dc:\1>/g)].map((m) => m[2]!.replace(USER_RE, " ")) : systemTexts(enXml[p]!);
      for (const t of nodes) {
        const frag = TR_CATALOG_FRAGMENTS.find((f) => f.re.test(t));
        if (TR_LETTERS.test(t.replace(/Yaşam Sistemi/g, "")) || TR_ASCII_WORDS.test(t) || frag) leaks.push(`${p}: «${t}»${frag ? ` (TR katalog parçası «${frag.text}»)` : ""}`);
      }
    }
    ok(leaks.length === 0, `EN ${en.name}: Türkçe sistem metni = 0${leaks.length ? ` — ${leaks.slice(0, 6).join(" | ")}${leaks.length > 6 ? ` (+${leaks.length - 6})` : ""}` : ""}`);

    // Kullanıcı nöbetçileri AYNEN (TR ile aynı küme ve sıra).
    const userOf = (x: Record<string, string>) => Object.keys(x).filter((p) => /^word\/(document|footer\d*)\.xml$/.test(p)).sort().flatMap((p) => userTexts(x[p]!));
    const uTr = userOf(trXml);
    const uEn = userOf(enXml);
    ok(JSON.stringify(uTr) === JSON.stringify(uEn), `EN ${en.name}: kullanıcı metinleri çevrilmeden aynen (${uEn.length}/${uTr.length} düğüm)`);

    // Sayısal değerler: belge metnindeki tüm sayı dizileri (kullanıcı nöbetçileri dışı) TR ile aynı çoklu küme.
    const nums = (x: Record<string, string>) => (x["word/document.xml"] ? systemTexts(x["word/document.xml"]).join(" ").match(/\d+/g) ?? [] : []).sort().join(",");
    ok(nums(trXml) === nums(enXml), `EN ${en.name}: sayısal değerler (gün/Hicrî gün-yıl/yıl/sıra) TR ile aynı`);

    // Belge dili: EN'de w:lang en-GB; TR golden'da dil işareti eklenmedi.
    const styles = enXml["word/styles.xml"] ?? "";
    ok(/<w:lang w:val="en-GB"/.test(styles), `EN ${en.name}: belge dili w:lang=en-GB`);
    ok(!/w:lang w:val="tr-TR"/.test(Object.values(enXml).join("")), `EN ${en.name}: belgede tr-TR dil işareti yok`);
    // Dosya adı: sistem kısmı İngilizce, kullanıcı başlığı aynen.
    if (en.filename) {
      ok(!TR_ASCII_WORDS.test(en.filename.replace(/⟦[^⟧]*⟧/g, "")) && !TR_LETTERS.test(en.filename.replace(/⟦[^⟧]*⟧/g, "")), `EN ${en.name}: dosya adı sistem kısmı İngilizce (${en.filename})`);
    }
  }
}

// ── Sözleşme birim kontrolleri (dil çözümü, biçimler, etiket yardımcıları, hesap ayrımı) ─────────────────
async function contractChecks(rl: typeof import("@/lib/i18n/reportLocale")): Promise<void> {
  const { NextRequest } = await import("next/server");
  const { cuppingReportText, protocolSafetyExtra, protocolSourceTypeLabel } = await import("@/lib/cupping/reportText");
  const { gregorianToHijri } = await import("@/lib/cupping/hijri");
  const req = (cookie?: string, query = "") => new NextRequest(`http://localhost/api/x${query}`, { headers: cookie ? { cookie } : {} });
  const prev = process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
  const fakeDb = (locale: string | null, fail = false) => ({
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => (fail ? { data: null, error: { code: "XX000", message: "x" } } : { data: locale ? { preferred_locale: locale } : null, error: null }) };
      return chain;
    },
  }) as never;
  try {
    process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "off";
    ok((await rl.resolveReportLocale(req("NEXT_LOCALE=en"))).locale === "tr", "sözleşme: yayın kapısı kapalı → eski en çerezi yok sayılır (tr)");
    ok((await rl.resolveReportLocale(req(undefined), { db: fakeDb("en"), tenantId: "t", userId: "u" })).locale === "tr", "sözleşme: kapı kapalı → hesap tercihi de uygulanmaz (tr)");
    process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "on";
    ok((await rl.resolveReportLocale(req("NEXT_LOCALE=en"))).locale === "en", "sözleşme: kapı açık + çerez en → en");
    ok((await rl.resolveReportLocale(req(undefined, "?locale=en"))).locale === "tr", "sözleşme: istemci ?locale=en KABUL EDİLMEZ (çerez yok → tr)");
    ok((await rl.resolveReportLocale(req("NEXT_LOCALE=tr"), { db: fakeDb("en"), tenantId: "t", userId: "u" })).locale === "en", "sözleşme: hesap tercihi > çerez (pref en, çerez tr → en)");
    ok((await rl.resolveReportLocale(req("NEXT_LOCALE=en"), { db: fakeDb(null), tenantId: "t", userId: "u" })).locale === "en", "sözleşme: hesap tercihi yok → çerez (en)");
    ok((await rl.resolveReportLocale(req("NEXT_LOCALE=en"), { db: fakeDb("tr", true), tenantId: "t", userId: "u" })).locale === "en", "sözleşme: tercih okunamazsa → çerez (istisna yok)");
    ok((await rl.resolveReportLocale(null)).locale === "tr", "sözleşme: istek yok → tr");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
    else process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = prev;
  }
  const tr = rl.reportLocaleFor("tr");
  const en = rl.reportLocaleFor("en");
  ok(tr.docxStyles() === undefined && en.docxStyles()?.default.document.run.language.value === "en-GB", "sözleşme: belge dili yalnız TR dışında (en-GB)");
  const at = "2026-11-25T21:05:00Z";
  ok(tr.date(at) === "26.11.2026" && en.date(at) === "26/11/2026", `sözleşme: tarih tr 26.11.2026 · en 26/11/2026 (Europe/Istanbul) — ${tr.date(at)} · ${en.date(at)}`);
  ok(tr.time(at) === "00:05" && en.time(at) === "00:05", `sözleşme: saat 24h her dilde — ${tr.time(at)} · ${en.time(at)}`);
  ok(tr.dateOnly("2026-01-05") === "05.01.2026" && en.dateOnly("2026-01-05") === "05/01/2026", "sözleşme: takvim günü kaymaz (DATE)");
  ok(tr.currency(1250) === new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(1250) && /TRY|₺/.test(en.currency(1250)) && /1,250\.00/.test(en.currency(1250)), `sözleşme: para TRY sabit, yalnız biçim — ${tr.currency(1250)} · ${en.currency(1250)}`);
  ok(tr.upper("bilgiler") === "BİLGİLER" && en.upper("information") === "INFORMATION", "sözleşme: büyük harf dilin kuralıyla (tr İ / en I)");
  ok(en.term("zodiac.aries") === "Aries", "sözleşme: terim sözlüğü erişimi");
  // Etiket yardımcıları (route'tan taşındı): kanonik kod → dil etiketi; bilinmeyen/none → yazılmaz.
  ok(protocolSafetyExtra("contraindication", "absolute") === "Kontrendikasyon · Mutlak" && protocolSafetyExtra("warning", "none") === "Uyarı" && protocolSafetyExtra("x", "") === null, "Kupa: güvenlik etiketi TR birebir (eski route sabitleri)");
  ok(protocolSafetyExtra("contraindication", "relative", en) === "Contraindication · Relative", "Kupa: güvenlik etiketi EN");
  ok(protocolSourceTypeLabel("systematic_review") === "Sistematik Derleme" && protocolSourceTypeLabel("official_guidance", en) === "Official Guidance" && protocolSourceTypeLabel("bogus", en) === null, "Kupa: kaynak türü etiketi TR birebir / EN / bilinmeyen → null");
  // Hesap ayrımı: Hicrî dönüşüm dile bağlı değil; yalnız ay adı.
  const h = gregorianToHijri("2000-01-01")!;
  ok(h.day === 24 && h.month === 9 && h.year === 1420 && h.formatted === "24 Ramazan 1420", "Kupa: Hicrî hesap kanonik (değişmedi)");
  ok(cuppingReportText(tr).hijri(h) === h.formatted && cuppingReportText(en).hijri(h) === "24 Ramadan 1420", "Kupa: Hicrî gösterim TR = kanonik formatted, EN yalnız ay adı");
  ok(cuppingReportText(en).t("calendar.overflow.moreDays", { count: 1 }) === "1 more day" && cuppingReportText(en).t("calendar.overflow.moreDays", { count: 12 }) === "12 more days", "Kupa: EN çoğul (ICU plural)");
  ok(cuppingReportText(tr).t("calendar.overflow.moreDays", { count: 12 }) === "12 gün daha", "Kupa: TR sayı metni birebir");
  // Katalog anahtar tamlığı (EN'de eksik anahtar → sessiz TR düşüşü olmasın).
  const leaves = (o: unknown, p = ""): string[] => (o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k)) : [p]);
  for (const ns of ["reports.common", "reports.cupping"]) {
    const a = JSON.parse(readFileSync(join(ROOT, `messages/tr/${ns}.json`), "utf8"));
    const b = JSON.parse(readFileSync(join(ROOT, `messages/en/${ns}.json`), "utf8"));
    const la = leaves(a).sort();
    const lb = leaves(b).sort();
    ok(JSON.stringify(la) === JSON.stringify(lb), `katalog: ${ns} TR/EN anahtar ağacı aynı (${la.length})`);
  }
}

async function main(): Promise<void> {
  const trBuilt = await buildAll();
  const trSnap = await snapshot(trBuilt);

  if (WRITE) {
    if (existsSync(GOLDEN) && !OVERWRITE) {
      console.error(`Golden zaten var: ${GOLDEN} — bilinçli güncelleme için --overwrite.`);
      process.exit(2);
    }
    const baseSha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    const dirty = execSync("git status --porcelain -- lib app", { cwd: ROOT }).toString().trim();
    mkdirSync(dirname(GOLDEN), { recursive: true });
    const g: GoldenFile = { baseSha: dirty ? `${baseSha}+kirli` : baseSha, generator: "scripts/i18n/reports-golden.harness.ts", fixtures: trSnap };
    writeFileSync(GOLDEN, JSON.stringify(g, null, 2) + "\n");
    console.log(`Golden yazıldı: ${GOLDEN} (${Object.keys(trSnap).length} fikstür, taban ${g.baseSha})`);
    // Determinizm: aynı süreçte ikinci üretim aynı olmalı.
    compare("determinizm", trSnap, await snapshot(await buildAll()));
  } else {
    ok(existsSync(GOLDEN), "golden dosyası mevcut");
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as GoldenFile;
    console.log(`Golden tabanı: ${golden.baseSha} · ${Object.keys(golden.fixtures).length} fikstür`);
    compare("TR(parametresiz)", golden.fixtures, trSnap);

    let rl: typeof import("@/lib/i18n/reportLocale") | null = null;
    try {
      rl = await import("@/lib/i18n/reportLocale");
    } catch {
      note("lib/i18n/reportLocale yok (taban) — açık-dil koşuları atlandı");
    }
    if (rl) {
      const trOut = rl.reportLocaleFor("tr");
      const trExplicit = await buildAll(trOut, trOut.common, trOut.docxStyles());
      compare("TR(açık çıktı dili + TR katalog)", golden.fixtures, await snapshot(trExplicit));
      const enOut = rl.reportLocaleFor("en");
      const enBuilt = await buildAll(enOut, enOut.common, enOut.docxStyles());
      await enChecks(trBuilt, enBuilt);
      await contractChecks(rl);
      if (OUT_DIR) {
        writeSamples(OUT_DIR, "TR", trBuilt);
        writeSamples(OUT_DIR, "EN", enBuilt);
        console.log(`Örnek belgeler yazıldı: ${OUT_DIR}`);
      }
    }
  }

  console.log(`\nreports-golden: ${pass} PASS / ${fail} FAIL / ${info} INFO`);
  if (fail > 0) {
    console.log("FAIL:\n  - " + fails.join("\n  - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("HARNESS ÇÖKTÜ:", e);
  process.exit(1);
});

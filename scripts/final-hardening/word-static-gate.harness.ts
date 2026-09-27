/**
 * FAZ1 FINAL HARDENING — PAKET WORD — STATİK KAPI (FA-02 regresyon kilidi).
 *
 * Sunucu rapor/Word üreticileri Vercel'de UTC'de çalışır. Şu kalıplar saat dilimi
 * belirtilmeden kullanılırsa Word'de yanlış saat/gün basılır:
 *   (A) `.toLocaleDateString(` / `.toLocaleTimeString(` — `timeZone` seçeneği YOK
 *   (B) `.toLocaleString(` bir TARİH alıcısı üzerinde — `timeZone` YOK
 *       (sayı biçimleme — `n.toLocaleString("tr-TR")`, `minimumFractionDigits` — serbest)
 *   (C) `toISOString().slice(0, 10)` — UTC günü (00:00–03:00 arası "dün")
 * Doğru yol: `lib/time/reportTime` (formatInstant* / formatDateOnly / formatDateLoose /
 * zonedDayKey / reportFileDate / reportGeneratedLabel).
 *
 * Kapsam: app/api/**, lib/**\/report*, lib/**\/word*, **\/wordDocxBuild.ts + ek rapor
 * üreticileri (snapshotReport, cupping *Word*, HD istemci export).
 * İstisnalar gerekçeli allow-list'tedir. `owner` alanı başka pakete ait, o paket
 * tarafından dönüştürülecek dosyaları işaretler → varsayılan WARN; koordinatör son
 * birleştirmede `WORD_GATE_STRICT=1` ile koşunca FAIL olur.
 *
 * Çalıştır: npx tsx scripts/final-hardening/word-static-gate.harness.ts
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..");
const STRICT = process.env.WORD_GATE_STRICT === "1";

let pass = 0;
let fail = 0;
let warn = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── Dosya toplama ─────────────────────────────────────────────────────────────
function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts)$/.test(e)) out.push(full);
  }
}
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

const all: string[] = [];
walk(join(ROOT, "app"), all);
walk(join(ROOT, "lib"), all);

const EXTRA = new Set([
  "lib/yasam-hafizasi/client/snapshotReport.ts",
  "app/human-design/rapor-olustur/helpers/exportHdReportDocx.ts",
]);
function inScope(r: string): boolean {
  if (r.startsWith("app/api/")) return true;
  if (r.startsWith("lib/")) {
    const segs = r.split("/").slice(1);
    if (segs.some((s) => /^report/i.test(s) || /^word/i.test(s))) return true;
    if (/^lib\/cupping\/[^/]*Word[^/]*\.ts$/.test(r)) return true;
  }
  if (r.endsWith("/wordDocxBuild.ts")) return true;
  return EXTRA.has(r);
}
const files = all.map((f) => ({ abs: f, rel: rel(f) })).filter((f) => inScope(f.rel));

// ── Gerekçeli istisnalar ──────────────────────────────────────────────────────
type Allow = { file: string; match: RegExp; why: string; owner?: string };
const ALLOW: Allow[] = [
  {
    file: "app/api/clients/[id]/charges/route.ts",
    match: /d\.toISOString\(\)\.slice\(0, 10\) === s/,
    why: "DATE geçerlilik round-trip'i: d = `${s}T00:00:00Z` (UTC) → UTC günü birebir s; gösterim/dosya adı değil.",
  },
  {
    file: "app/api/cosmic/audit/route.ts",
    match: /./,
    why: "Yalnız yöneticiye açık astronomik denetim ucu (Word üreticisi değil); UTC değerleri bilinçli olarak raporlar, danışana gitmez.",
  },
];

// ── Tarama ────────────────────────────────────────────────────────────────────
type Hit = { file: string; line: number; text: string; rule: string };
const hits: Hit[] = [];

const NUMERIC_OPTS = /minimumFractionDigits|maximumFractionDigits|style:\s*["'](currency|percent|decimal)["']|useGrouping/;
const DATE_RECEIVER = /(new Date\([^)]*\)|\b\w*(date|Date|_at|At|time|Time|now|Now|today|Today|day|Day)\w*)\s*\)?\s*\.toLocaleString\(/;

for (const f of files) {
  const src = readFileSync(f.abs, "utf8").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  let inBlock = false;
  lines.forEach((raw, i) => {
    const t = raw.trim();
    // Yorum satırları (JSDoc / // / blok) taranmaz.
    if (inBlock) { if (t.includes("*/")) inBlock = false; return; }
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; return; }
    if (t.startsWith("*") || t.startsWith("//")) return;
    // Çağrı argümanları birkaç satıra yayılabilir → 4 satırlık pencere.
    const win = lines.slice(i, i + 4).join(" ");
    if (/\.toLocale(Date|Time)String\(/.test(raw) && !/timeZone/.test(win)) {
      hits.push({ file: f.rel, line: i + 1, text: t, rule: "A:toLocale(Date|Time)String tz'siz" });
    }
    if (/\.toLocaleString\(/.test(raw) && !/timeZone/.test(win) && !NUMERIC_OPTS.test(win) && DATE_RECEIVER.test(raw)) {
      hits.push({ file: f.rel, line: i + 1, text: t, rule: "B:tarih.toLocaleString tz'siz" });
    }
    if (/toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(raw)) {
      hits.push({ file: f.rel, line: i + 1, text: t, rule: "C:toISOString().slice(0,10)" });
    }
  });
}

console.log(`\n[kapsam] ${files.length} dosya taranıyor (strict=${STRICT})`);

// ── Sonuç ─────────────────────────────────────────────────────────────────────
const unexpected: Hit[] = [];
for (const h of hits) {
  const a = ALLOW.find((x) => x.file === h.file && x.match.test(h.text));
  if (!a) { unexpected.push(h); continue; }
  if (a.owner) {
    if (STRICT) unexpected.push(h);
    else { warn++; console.log(`  WARN  [${a.owner}] ${h.file}:${h.line} ${h.rule} — ${a.why}`); }
  } else {
    console.log(`  ALLOW ${h.file}:${h.line} ${h.rule} — ${a.why}`);
  }
}
for (const h of unexpected) console.log(`  HIT   ${h.file}:${h.line} [${h.rule}] ${h.text.slice(0, 140)}`);
check("gate: kapsamda tz'siz tarih biçimleme / UTC gün dilimi YOK", unexpected.length === 0, `${unexpected.length} ihlal`);

// ── Pozitif kapsam kanıtları (üreticiler gerçekten ortak helper'ı kullanıyor) ──
const mustUse: [string, RegExp][] = [
  ["app/api/ajanda/word-report/buildAjandaReport.ts", /formatInstantDateTime|zonedDayKey/],
  ["app/api/clients/[id]/word-report/clientReportBuilder.ts", /formatInstantDateTime/],
  ["app/api/clients/[id]/word-report/clientReportBuilder.ts", /looseDayKey/],
  ["app/api/clients/word-report-bulk/route.ts", /reportFileDate/],
  ["app/api/biyoenerji/session-report/buildSessionReport.ts", /formatInstantDateTime/],
  ["app/api/dogaltas/stones/[id]/word-report/buildStoneReport.ts", /reportFileDate/],
  ["app/api/numeroloji/knowledge-report/route.ts", /reportFileDate/],
  ["app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild.ts", /formatInstantDateTime/],
  ["app/api/sifa-rehberi/word-report/route.ts", /reportFileDate/],
  ["lib/sifa-rehberi/wordDocument.ts", /formatInstantDate/],
  ["app/api/urun-stok/stock-report/route.ts", /reportFileDate/],
  ["lib/aromaterapi/report/theme.ts", /zonedDayKey/],
  ["lib/yasam-hafizasi/client/snapshotReport.ts", /formatDateLoose/],
  ["app/api/hacamat/word-report/route.ts", /todayInZone/],
  ["app/api/hacamat/pdf-report/route.ts", /todayInZone/],
  ["app/human-design/rapor-olustur/helpers/exportHdReportDocx.ts", /reportFileDate/],
];
for (const [f, re] of mustUse) {
  const p = join(ROOT, f);
  check(`helper kullanımı: ${f} ${re}`, existsSync(p) && re.test(readFileSync(p, "utf8")));
}

// Aromaterapi theme: yerel getter'lar (sunucu UTC) kaldırıldı.
{
  const theme = readFileSync(join(ROOT, "lib/aromaterapi/report/theme.ts"), "utf8");
  check("aroma theme: getFullYear/getMonth/getDate YOK", !/\.get(FullYear|Month|Date)\(\)/.test(theme));
}
// Uzman adı: aroma route'larında `expertName: null` kalmadı.
{
  const aromaRoutes: string[] = [];
  walk(join(ROOT, "app/api/aromaterapi"), aromaRoutes);
  const bad = aromaRoutes.filter((p) => /word-report/.test(p) && /expertName:\s*null/.test(readFileSync(p, "utf8")));
  check("aroma word route'ları expertDisplayName(guard.profile) kullanır (expertName: null YOK)", bad.length === 0, bad.map(rel).join(", "));
}
// FA-41: DY üreticilerinde otomatik title-case (toLowerCase + ilk harf büyütme) KALDIRILDI.
for (const f of ["app/api/clients/[id]/word-report/clientReportBuilder.ts", "app/api/clients/word-report-bulk/route.ts"]) {
  const s = readFileSync(join(ROOT, f), "utf8");
  check(`${f}: otomatik title-case gövdesi YOK`, !/\.replace\(\/İ\/g, "i"\)\s*\.replace\(\/I\/g, "ı"\)/.test(s) && /tidyUserText/.test(s));
}
// FA-26: DY ve Şifa iç not opt-in kapısı.
{
  const dy = readFileSync(join(ROOT, "app/api/clients/[id]/word-report/clientReportBuilder.ts"), "utf8");
  check("DY: expert_note yalnız includeExpertNotes ile", /includeExpertNotes\s*(===\s*true\s*)?&&\s*hw\.expert_note/.test(dy) && !/if \(hw\.expert_note\?\.trim\(\)\)/.test(dy));
  const sifa = readFileSync(join(ROOT, "lib/sifa-rehberi/wordDocument.ts"), "utf8");
  check("Şifa: Uzman Notu yalnız includeExpertNotes ile", /includeExpertNotes \? meaningful\(s\.expert_note\) : ""/.test(sifa));
}
// FA-16: danışana giden üreticilerde not var; Refleksoloji/Kupa'ya ikinci not EKLENMEDİ.
{
  const noteUsers: [string, string][] = [
    ["app/api/clients/[id]/word-report/clientReportBuilder.ts", "danisan"],
    ["app/api/biyoenerji/session-report/buildSessionReport.ts", "biyoenerji"],
    ["app/api/biyoenerji/chakra-report/route.ts", "biyoenerji"],
    ["app/api/dogaltas/stones/[id]/word-report/buildStoneReport.ts", "dogaltas"],
    ["app/api/dogaltas/word-report/route.ts", "dogaltas"],
    ["app/api/sifa-rehberi/word-report/route.ts", "sifa"],
    ["lib/aromaterapi/report/document.ts", "aromaterapi"],
    ["app/api/numeroloji/knowledge-report/route.ts", "numeroloji"],
    ["app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild.ts", "numeroloji"],
    ["lib/beslenme/word/planDocxBuilder.ts", "beslenme"],
    ["app/api/hacamat/word-report/route.ts", "hacamat"],
    ["app/api/hacamat/pdf-report/route.ts", "hacamat"],
  ];
  for (const [f, kind] of noteUsers) {
    const s = readFileSync(join(ROOT, f), "utf8");
    check(`not: ${f} → "${kind}"`, new RegExp(`(buildWellnessNoteSection|wellnessNote|note:)\\s*\\(?\\s*"${kind}"`).test(s));
  }
  for (const f of ["lib/cupping/calendarWord.ts", "lib/cupping/protocolWord.ts", "lib/refleksoloji/reflexologyWord.ts"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    check(`çift not YOK: ${f} ortak buildWellnessNoteSection eklenmedi`, !/buildWellnessNoteSection/.test(readFileSync(p, "utf8")));
  }
}

console.log(`\nword-static-gate: ${pass} PASS / ${fail} FAIL / ${warn} WARN`);
if (fail > 0) {
  console.log("FAILURES:\n - " + failures.join("\n - "));
  process.exit(1);
}

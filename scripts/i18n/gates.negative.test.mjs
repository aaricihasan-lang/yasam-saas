#!/usr/bin/env node
/**
 * I18N-F1 — NEGATİF TESTLER: kalite kapıları hatalı değişikliği GERÇEKTEN reddediyor mu?
 * Her vaka geçici bir kopyada (os.tmpdir) kasıtlı bir hata üretir ve ilgili kapının sıfırdan farklı çıkışla
 * bitmesini + beklenen kural kodunu basmasını bekler. Ürün dosyalarına dokunulmaz.
 *
 * Kullanım: node scripts/i18n/gates.negative.test.mjs [--with-pg]   (--with-pg: migration negatif testi ~1 dk)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n}${d ? "\n       " + String(d).slice(0, 600) : ""}`); } };
const run = (args, cwd = root) => spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: { ...process.env } });
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `i18n-neg-${name}-`));
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.cpSync(src, dst, { recursive: true }); };

// ── Katalog kapısı (C1–C10) ───────────────────────────────────────────────────
function catalogFixture() {
  const d = tmp("cat");
  cp(path.join(root, "lib/i18n/locales.ts"), path.join(d, "lib/i18n/locales.ts"));
  const tr = { demo: { hello: "Merhaba {name}", items: "{count} kayıt", word: "Kaydet" } };
  const en = { demo: { hello: "Hello {name}", items: "{count, plural, one {# record} other {# records}}", word: "Save" } };
  fs.mkdirSync(path.join(d, "messages/tr"), { recursive: true });
  fs.mkdirSync(path.join(d, "messages/en"), { recursive: true });
  fs.writeFileSync(path.join(d, "messages/tr/demo.json"), JSON.stringify(tr));
  fs.writeFileSync(path.join(d, "messages/en/demo.json"), JSON.stringify(en));
  fs.mkdirSync(path.join(d, "i18n"), { recursive: true });
  fs.writeFileSync(path.join(d, "i18n/catalog.generated.ts"), 'import a from "@/messages/tr/demo.json";\nimport b from "@/messages/en/demo.json";\n');
  fs.mkdirSync(path.join(d, "app"), { recursive: true });
  fs.writeFileSync(path.join(d, "app/page.tsx"), 'const t = useTranslations("demo");\nexport default () => t("hello", { name: "x" }) + t("word");\n');
  return d;
}
const catRun = (d) => run([path.join(here, "catalog-check.mjs"), "--root", d, "--quiet"]);
const mut = (d, rel, fn) => { const p = path.join(d, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8"))); };
const editJson = (d, rel, fn) => mut(d, rel, (s) => JSON.stringify(fn(JSON.parse(s))));

console.log("\n[katalog kapısı]");
{ const d = catalogFixture(); const r = catRun(d); ok(r.status === 0, "temiz fixture → PASS (kontrol grubu)", r.stderr); }
const catCases = [
  ["C2", "EN'de eksik anahtar", (d) => editJson(d, "messages/en/demo.json", (j) => { delete j.demo.word; return j; })],
  ["C2", "EN'de fazla anahtar", (d) => editJson(d, "messages/en/demo.json", (j) => { j.demo.extra = "x"; return j; })],
  ["C3", "boş EN değeri", (d) => editJson(d, "messages/en/demo.json", (j) => { j.demo.word = ""; return j; })],
  ["C4", "iki dosyada aynı anahtar", (d) => { fs.writeFileSync(path.join(d, "messages/tr/dup.json"), JSON.stringify({ demo: { word: "X" } })); fs.writeFileSync(path.join(d, "messages/en/dup.json"), JSON.stringify({ demo: { word: "X" } })); mut(d, "i18n/catalog.generated.ts", (s) => s + 'import c from "@/messages/tr/dup.json";\nimport e from "@/messages/en/dup.json";\n'); }],
  ["C5", "bozuk ICU", (d) => editJson(d, "messages/en/demo.json", (j) => { j.demo.items = "{count, plural, one {# record}"; return j; })],
  ["C6", "placeholder adı farklı ({name} → {nme})", (d) => editJson(d, "messages/en/demo.json", (j) => { j.demo.hello = "Hello {nme}"; return j; })],
  ["C7", "çoğulda other dalı yok", (d) => editJson(d, "messages/en/demo.json", (j) => { j.demo.items = "{count, plural, one {# record}}"; return j; })],
  ["C8", "kodda katalogda olmayan anahtar", (d) => mut(d, "app/page.tsx", (s) => s + 'export const x = () => t("nope");\n')],
  ["C9", "dinamik anahtarın ön eki yok", (d) => mut(d, "app/page.tsx", (s) => s + "export const y = (k: string) => t(`missing.${k}`);\n")],
  ["C10", "kayda alınmamış katalog dosyası", (d) => { fs.writeFileSync(path.join(d, "messages/tr/yeni.json"), JSON.stringify({ yeni: { a: "b" } })); fs.writeFileSync(path.join(d, "messages/en/yeni.json"), JSON.stringify({ yeni: { a: "b" } })); }],
];
for (const [rule, name, apply] of catCases) {
  const d = catalogFixture();
  apply(d);
  const r = catRun(d);
  // Not: "other" dalı olmayan çoğul ICU ayrıştırıcısı tarafından zaten reddedilir (MISSING_OTHER_CLAUSE → C5);
  // C7 ayrıca savunma katmanıdır. Bu vakada C5 veya C7 kabul edilir — her iki durumda da kapı FAIL verir.
  const rules = rule === "C7" ? ["C7", "C5"] : [rule];
  ok(r.status !== 0 && rules.some((x) => r.stderr.includes(`FAIL ${x}`)), `${rule} ${name} → REDDEDİLDİ`, r.stderr || r.stdout);
}

// ── Sabit metin kapısı ────────────────────────────────────────────────────────
console.log("\n[sabit metin kapısı]");
function hcRun(fileContent, baseline = {}) {
  const d = tmp("hc");
  fs.mkdirSync(path.join(d, "app"), { recursive: true });
  fs.writeFileSync(path.join(d, "app/x.tsx"), fileContent);
  fs.writeFileSync(path.join(d, "baseline.json"), JSON.stringify({ files: baseline }));
  return run([path.join(here, "hardcoded-scan.mjs"), "--root", d, "--file", "app/x.tsx", "--baseline", path.join(d, "baseline.json"), "--check"]);
}
{ const r = hcRun('export default function X({ t }: any) { return <p>{t("ok")}</p>; }\n'); ok(r.status === 0, "çevrilmiş bileşen → PASS (kontrol grubu)", r.stderr); }
{ const r = hcRun("export default function X() { return <p>Danışan kaydedildi</p>; }\n"); ok(r.status !== 0 && /jsx-text/.test(r.stderr), "yeni JSX Türkçe metin → REDDEDİLDİ", r.stderr); }
{ const r = hcRun("export default function X() { return <button>Kaydet</button>; }\n"); ok(r.status !== 0, "ASCII Türkçe ('Kaydet') → REDDEDİLDİ", r.stderr); }
{ const r = hcRun('export default function X() { return <input placeholder="Search clients" />; }\n'); ok(r.status !== 0 && /jsx-attr/.test(r.stderr), "çevrilmemiş placeholder (dilden bağımsız) → REDDEDİLDİ", r.stderr); }
{ const r = hcRun('export const msg = () => { throw new Error("Kayıt bulunamadı"); };\n'); ok(r.status !== 0 && /tr-string/.test(r.stderr), "Türkçe hata metni → REDDEDİLDİ", r.stderr); }
{ const r = hcRun('export const BURC = "Koç"; // i18n-ignore: kanonik DB değeri\n'); ok(r.status === 0, "gerekçeli kanonik değer (i18n-ignore) → kabul", r.stderr); }
{ const r = hcRun('export const f = (t: any) => t("başlık.anahtar");\nexport const g = () => console.error("günlük metni");\n'); ok(r.status === 0, "çeviri anahtarı ve console metni sayılmaz", r.stderr); }
{ const r = hcRun("export default function X() { return <p>Danışan kaydedildi</p>; }\n", { "app/x.tsx": 1 }); ok(r.status === 0, "taban içinde kalan mevcut metin → PASS (cırcır yalnız artışı reddeder)", r.stderr); }
{ const r = hcRun("export default function X() { return <div><p>Danışan kaydedildi</p><p>İptal</p></div>; }\n", { "app/x.tsx": 1 }); ok(r.status !== 0, "tabanın ÜSTÜNE çıkan dosya → REDDEDİLDİ", r.stderr); }

// ── Türkçe dondurma kapısı ───────────────────────────────────────────────────
console.log("\n[Türkçe dondurma kapısı]");
function freezeFixture() {
  const d = tmp("tr");
  cp(path.join(here, "tr-freeze.mjs"), path.join(d, "scripts/i18n/tr-freeze.mjs"));
  fs.mkdirSync(path.join(d, "messages/tr"), { recursive: true });
  fs.writeFileSync(path.join(d, "messages/tr/a.json"), JSON.stringify({ a: { x: "Kaydet", y: "Vazgeç" } }));
  fs.mkdirSync(path.join(d, "scripts/i18n/baseline"), { recursive: true });
  run([path.join(d, "scripts/i18n/tr-freeze.mjs"), "--update"], d);
  return d;
}
const frRun = (d) => run([path.join(d, "scripts/i18n/tr-freeze.mjs")], d);
{ const d = freezeFixture(); ok(frRun(d).status === 0, "değişmemiş Türkçe → PASS (kontrol grubu)"); }
{ const d = freezeFixture(); fs.writeFileSync(path.join(d, "messages/tr/a.json"), JSON.stringify({ a: { x: "Kaydet ", y: "Vazgeç" } })); const r = frRun(d); ok(r.status !== 0 && /değeri değişti: a\.x/.test(r.stderr), "Türkçe metinde tek boşluk değişikliği → REDDEDİLDİ", r.stderr); }
{ const d = freezeFixture(); fs.writeFileSync(path.join(d, "messages/tr/a.json"), JSON.stringify({ a: { x: "Kaydet" } })); const r = frRun(d); ok(r.status !== 0 && /silindi: a\.y/.test(r.stderr), "Türkçe anahtar silinmesi → REDDEDİLDİ", r.stderr); }
{ const d = freezeFixture(); fs.writeFileSync(path.join(d, "messages/tr/a.json"), JSON.stringify({ a: { x: "Kaydet", y: "Vazgeç", z: "Yeni" } })); ok(frRun(d).status === 0, "yeni Türkçe anahtar → kabul"); }

// ── Katalog kaydı (gen-catalog --check) ──────────────────────────────────────
console.log("\n[katalog kaydı]");
{
  const d = tmp("gen");
  cp(path.join(here, "gen-catalog.mjs"), path.join(d, "scripts/i18n/gen-catalog.mjs"));
  for (const l of ["tr", "en"]) { fs.mkdirSync(path.join(d, `messages/${l}`), { recursive: true }); fs.writeFileSync(path.join(d, `messages/${l}/a.json`), "{}"); }
  fs.mkdirSync(path.join(d, "i18n"), { recursive: true });
  run([path.join(d, "scripts/i18n/gen-catalog.mjs")], d);
  ok(run([path.join(d, "scripts/i18n/gen-catalog.mjs"), "--check"], d).status === 0, "güncel kayıt → PASS (kontrol grubu)");
  for (const l of ["tr", "en"]) fs.writeFileSync(path.join(d, `messages/${l}/b.json`), "{}");
  ok(run([path.join(d, "scripts/i18n/gen-catalog.mjs"), "--check"], d).status !== 0, "yeni sözlük eklenip kayıt üretilmemiş → REDDEDİLDİ");
}

// ── Doğaltaş harness'ları gerçek gerilemeyi yakalıyor mu (düzeltme sonrası) ───
console.log("\n[Doğaltaş i18n harness'ları — mutasyon]");
function stonesFixture() {
  const d = tmp("stones");
  cp(path.join(root, "messages"), path.join(d, "messages"));
  cp(path.join(root, "app/dogaltas"), path.join(d, "app/dogaltas"));
  cp(path.join(root, "lib/dogaltas"), path.join(d, "lib/dogaltas"));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(d, "node_modules"), "junction");
  return d;
}
const DETAIL = "app/dogaltas/dogaltas-listesi/[id]/page.tsx";
{
  const d = stonesFixture();
  ok(run([path.join(root, "scripts/stones-i18n-2f-harness.mjs")], d).status === 0, "2F temiz kopya → PASS (kontrol grubu)");
  mut(d, DETAIL, (s) => s.replace('stone_name: stringField(data.stone_name) || "İsimsiz Taş",', 'stone_name: stringField(data.stone_name) || t("unnamed"),'));
  const r = run([path.join(root, "scripts/stones-i18n-2f-harness.mjs")], d);
  ok(r.status !== 0, "2F: toSafeStone veri katmanına t() sızması → REDDEDİLDİ", r.stdout.slice(-400));
}
{
  const d = stonesFixture();
  mut(d, "lib/dogaltas/stoneTaxonomy.ts", (s) => s.replace('"Kök Çakra"', '"Root Chakra"'));
  const r = run([path.join(root, "scripts/stones-i18n-2a-harness.mjs")], d);
  ok(r.status !== 0 && /Kök Çakra/.test(r.stdout), "2A: kanonik 'Kök Çakra' değeri çevrilirse → REDDEDİLDİ", r.stdout.slice(-400));
}
{
  const d = stonesFixture();
  mut(d, "app/dogaltas/page.tsx", (s) => s.replace("res.error === STONES_WORKSPACE_UNAVAILABLE", 'res.error === "Çalışma alanı bulunamadı"'));
  const r = run([path.join(root, "scripts/stones-i18n-2i-harness.mjs")], d);
  ok(r.status !== 0, "2I: kontrol akışı Türkçe metne bağlanırsa → REDDEDİLDİ", r.stdout.slice(-400));
}

// ── Migration (isteğe bağlı, embedded-postgres) ──────────────────────────────
if (process.argv.includes("--with-pg")) {
  console.log("\n[migration — dil kodu CHECK kaldırılırsa assert FAIL olmalı]");
  const d = tmp("pg");
  const mig = path.join(d, "20280126000000_user_locale_prefs.sql");
  fs.writeFileSync(mig, fs.readFileSync(path.join(root, "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8").replace(",\n  CONSTRAINT user_locale_prefs_locale_chk CHECK (preferred_locale IN ('tr', 'en', 'de'))", ""));
  const r = run([path.join(root, "scripts/final-hardening/pg-migration-check.mjs"), "--fixture", "scripts/i18n/pg/user-locale-prefs-fixture.sql", "--migration", mig, "--assert", "scripts/i18n/pg/user-locale-prefs-assert.sql"]);
  ok(r.status !== 0 && /T6/.test(r.stdout + r.stderr), "CHECK'siz migration → assert REDDETTİ (T6)", (r.stdout + r.stderr).slice(-500));
}

console.log(`\n=== kapı negatif testleri: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);

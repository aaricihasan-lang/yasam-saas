/**
 * NUMEROLOJİ RAPOR GOLDEN (I18N-F1-R5, P35–P37) — TR bayt-eşitlik + EN çıktı denetimi.
 *
 *   --write-golden : TABAN koşusu (üretici değişikliğinden ÖNCE). Her fikstürün `base` çıktısı normalize
 *                    parça SHA'larıyla scripts/numeroloji/report-golden/golden-tr.json'a yazılır.
 *   (varsayılan)   : base (parametresiz/çerezsiz) ve açık tr → golden ile BİREBİR; en → aşağıdaki denetimler.
 *
 * EN denetimleri (her fikstür):
 *   E1 sistem metni sızıntısı 0 — çıktı metninden fikstür içeriği (kullanıcı/sağlayıcı/veri), motor yorum kataloğu
 *      ve ortak motor (lib/docx, #855'e bağlı) metinleri çıkarılır; kalan Türkçe harfli/ASCII-Türkçe sözcük = FAIL.
 *      Çıkarılan sınıflar ayrıca SAYILIR ve "KISMİ" olarak raporlanır (Türkçe fallback EN kabulü değildir).
 *   E2 kanonik sayılar TR = EN (tüm rakam dizilerinin çoklu kümesi aynı → gelecek yıl gizleme yapısal ve aynı).
 *   E3 belge dili: EN docx `w:lang w:val="en-GB"`; TR'de dil işareti YOK.
 *   E4 dosya adı: EN dosya adında Türkçe sistem sözcüğü yok (kullanıcı adı parçası hariç).
 *   E5 EN çıktı TR'den farklı (çeviri gerçekten uygulandı).
 *
 * Çalıştır: npx tsx scripts/numeroloji/report-golden.harness.ts [--write-golden] [--out <klasör>] [--verbose]
 */
import "./report-golden/setup";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { FIXTURES, type Built, type Fixture } from "./report-golden/fixtures";

const ROOT = process.cwd();
const GOLDEN = path.join(ROOT, "scripts", "numeroloji", "report-golden", "golden-tr.json");
const WRITE = process.argv.includes("--write-golden");
const VERBOSE = process.argv.includes("--verbose");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]! : null;
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : null;
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; if (VERBOSE) console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 900)}`); }
}

// ── Normalizasyon (zaman/rastgelelik maskeli; geri kalan her bayt kilitli) ───────────────────────
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
function normalizeXml(name: string, xml: string): string {
  let s = xml;
  if (name === "docProps/core.xml") {
    s = s
      .replace(/<dcterms:created[^>]*>[^<]*<\/dcterms:created>/g, "<dcterms:created/>")
      .replace(/<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/g, "<dcterms:modified/>")
      .replace(/<cp:revision>[^<]*<\/cp:revision>/g, "<cp:revision/>");
  }
  return s.replace(/\sw:rsid\w*="[^"]*"/g, "").replace(/\sw14:(paraId|textId)="[^"]*"/g, "").replace(/rId[a-z0-9_-]{12,}/g, "rId#");
}
type Parts = { parts: Record<string, string>; xml: Record<string, string> };
async function partsOf(b: Built): Promise<Parts> {
  if (b.kind !== "docx") return { parts: { [b.kind]: sha(b.buffer) }, xml: b.kind === "svg" ? { svg: b.buffer.toString("utf8") } : {} };
  const zip = await JSZip.loadAsync(b.buffer);
  const parts: Record<string, string> = {};
  const xml: Record<string, string> = {};
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name]!;
    if (f.dir) continue;
    if (/\.(xml|rels)$/.test(name)) { const t = normalizeXml(name, await f.async("string")); xml[name] = t; parts[name] = sha(t); }
    else parts[name] = sha(await f.async("uint8array"));
  }
  return { parts, xml };
}
const digest = (p: Record<string, string>) => sha(Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("\n"));
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Görünen metin: docx paragrafları (w:t birleşik) / SVG text düğümleri. docProps hariç. */
function visibleLines(p: Parts): string[] {
  const out: string[] = [];
  for (const [name, xml] of Object.entries(p.xml)) {
    if (name.startsWith("docProps/")) continue;
    if (name === "svg") {
      for (const m of xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)) out.push(unesc(m[1]!.replace(/<[^>]+>/g, "")).trim());
      continue;
    }
    for (const para of xml.split("</w:p>")) {
      const t = Array.from(para.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unesc(m[1]!)).join("");
      if (t.trim()) out.push(t.replace(/\s+/g, " ").trim());
    }
  }
  return out.filter(Boolean);
}

// ── Türkçe sistem metni dedektörü ────────────────────────────────────────────────────────────────
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_ASCII_WORDS = /\b(Sayfa|Rapor|Raporu|Tarihi|Danisan|Kayit|Kayitlari|Secili|Bolumler|Bolum|Ozet|Ozeti|Hesap|Yorum|Yorumlar|Taslar|Tas|Destek|Cakra|Zirve|Mucadele|Degisim|Donusum|Yasam|Sistemi|Numeroloji|Bilgi|Bankasi|Kaynak|Kaynakca|Analiz|Iliski|Isletme|Isimler|Karsilastirma|Dogaltas|Uyum|Yontem|Sayi|Sayilar|yas|yil|Yil|Evre|Dongu|Kisisel|Evrensel|Hayat|Yolu|Kulvar|Ifade|Olgunluk|Kader|Uzman|Hazirlayan|Bilgilendirme|ve|ile|icin|bir|olarak|degil)\b/;
const isTurkishish = (s: string) => TR_CHARS.test(s) || TR_ASCII_WORDS.test(s);

function literalStrings(file: string): string[] {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, "\u0000");
    for (const piece of s.split("\u0000")) if (piece.trim().length >= 3 && isTurkishish(piece)) out.push(piece.trim());
  }
  return out;
}
/** Ortak motorlar (lib/docx — #855 sözleşmesine bağlı) — KISMİ sınıfı. */
const SHARED_ENGINE = ["lib/docx/reportHelpers.ts", "lib/docx/reportDisclaimer.ts", "lib/docx/premiumToc.ts", "lib/docx/expertBranding.ts"].flatMap(literalStrings);

/** Numeroloji motoru yorum kataloğu (lib/numeroloji/**) — içerik; yalnız TR (KISMİ sınıfı). */
async function engineCatalogStrings(): Promise<string[]> {
  const { readdirSync, statSync } = await import("node:fs");
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(path.join(ROOT, d))) { const r = `${d}/${f}`; if (statSync(path.join(ROOT, r)).isDirectory()) walk(r); else if (/\.ts$/.test(f)) files.push(r); } };
  walk("lib/numeroloji");
  return files.flatMap(literalStrings);
}

type Residue = { system: string[]; content: number; engine: number; shared: number };
function classify(lines: string[], content: string[], engine: string[]): Residue {
  const byLen = (a: string[]) => [...new Set(a)].filter((s) => s.trim().length >= 2).sort((x, y) => y.length - x.length);
  const C = byLen(content);
  // Motor yorum kataloğu: yalnız cümle uzunluğundaki metinler (kısa etiketler sistem metni sayılır → maskelenmez).
  const E = byLen(engine).filter((e) => e.length >= 24);
  const S = byLen(SHARED_ENGINE);
  const r: Residue = { system: [], content: 0, engine: 0, shared: 0 };
  const CSET = new Set(content.map((c) => c.trim()));
  for (const raw of lines) {
    // Ürün markası (çevrilmez; diğer rapor harness'larıyla aynı kural).
    const line = raw.replace(/Yaşam Sistemi|YAŞAM SİSTEMİ/g, " ");
    if (!isTurkishish(line)) continue;
    if (CSET.has(line.trim())) { r.content++; continue; } // tam satır içerik (ör. Harfler tablosundaki ad harfi)
    let rest = line;
    let hitC = false, hitE = false, hitS = false;
    for (const c of C) if (rest.includes(c)) { rest = rest.split(c).join(" "); hitC = true; }
    if (!isTurkishish(rest)) { if (hitC) r.content++; continue; }
    for (const s of S) if (rest.includes(s)) { rest = rest.split(s).join(" "); hitS = true; }
    if (!isTurkishish(rest)) { if (hitS) r.shared++; continue; }
    for (const e of E) if (rest.includes(e)) { rest = rest.split(e).join(" "); hitE = true; }
    if (!isTurkishish(rest)) { if (hitE) r.engine++; continue; }
    r.system.push(line);
  }
  return r;
}
const digitsBag = (lines: string[]) => lines.flatMap((l) => l.match(/\d+/g) ?? []).sort().join(",");

// ── Koşu ─────────────────────────────────────────────────────────────────────────────────────────
type GoldenEntry = { filename: string | null; digest: string; parts: Record<string, string> };
async function main() {
  if (WRITE) {
    const golden: Record<string, GoldenEntry> = {};
    for (const f of FIXTURES) {
      const b = await f.run("base");
      const p = await partsOf(b);
      golden[f.name] = { filename: b.filename, digest: digest(p.parts), parts: p.parts };
      if (OUT) writeFileSync(path.join(OUT, `${f.name}.base.${b.kind}`), b.buffer);
      console.log(`  golden  ${f.name}  ${golden[f.name]!.digest.slice(0, 16)}  ${b.filename ?? ""}`);
    }
    writeFileSync(GOLDEN, JSON.stringify(golden, null, 1) + "\n");
    console.log(`\n${FIXTURES.length} fikstür golden yazıldı → ${path.relative(ROOT, GOLDEN)}`);
    return;
  }
  if (!existsSync(GOLDEN)) throw new Error("golden yok — önce tabanda --write-golden");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, GoldenEntry>;
  const engine = await engineCatalogStrings();
  const partial: string[] = [];
  ok(Object.keys(golden).length === FIXTURES.length, `golden fikstür sayısı ${Object.keys(golden).length} = ${FIXTURES.length}`);

  for (const f of (FIXTURES as Fixture[]).filter((x) => !ONLY || x.name.startsWith(ONLY))) {
    const g = golden[f.name];
    ok(!!g, `${f.name}: golden kaydı var`);
    if (!g) continue;
    const base = await f.run("base");
    const tr = await f.run("tr");
    const en = await f.run("en");
    const pb = await partsOf(base), pt = await partsOf(tr), pe = await partsOf(en);
    if (OUT) for (const [m, b] of [["tr", tr], ["en", en]] as const) writeFileSync(path.join(OUT, `${f.name}.${m}.${b.kind}`), b.buffer);

    const diffParts = (p: Parts) => Object.keys({ ...g.parts, ...p.parts }).filter((k) => g.parts[k] !== p.parts[k]);
    ok(digest(pb.parts) === g.digest, `${f.name}: TR parametresiz/çerezsiz çıktı golden ile bayt-eşit`, diffParts(pb));
    ok(digest(pt.parts) === g.digest, `${f.name}: TR açık dil çıktısı golden ile bayt-eşit`, diffParts(pt));
    ok(base.filename === g.filename && tr.filename === g.filename, `${f.name}: TR dosya adı aynı (${g.filename})`, [base.filename, tr.filename]);

    ok(digest(pe.parts) !== g.digest, `${f.name}: EN çıktı TR'den farklı (çeviri uygulandı)`);
    const enLines = visibleLines(pe);
    const trLines = visibleLines(pt);
    const res = classify(enLines, f.content(), engine);
    ok(res.system.length === 0, `${f.name}: E1 EN'de Türkçe SİSTEM metni 0 (${res.system.length})`, res.system.slice(0, 8));
    if (res.content || res.engine || res.shared) partial.push(`${f.name}: içerik(kullanıcı/sağlayıcı/veri) ${res.content} · motor yorumu ${res.engine} · ortak motor(#855) ${res.shared}`);
    ok(digitsBag(enLines) === digitsBag(trLines), `${f.name}: E2 kanonik sayılar TR = EN (rakam çoklu kümesi)`, { tr: digitsBag(trLines).length, en: digitsBag(enLines).length });
    if (en.kind === "docx") {
      const enLang = Object.values(pe.xml).some((x) => /<w:lang [^>]*w:val="en-GB"/.test(x));
      const trLang = Object.values(pt.xml).some((x) => /<w:lang [^>]*w:val="en-GB"/.test(x));
      ok(enLang && !trLang, `${f.name}: E3 w:lang en-GB yalnız EN`, { enLang, trLang });
    }
    if (en.filename !== null) {
      const userParts = f.content().flatMap((s) => s.split(/\s+/)).map((w) => w.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/İ/g, "I"));
      let rest = en.filename;
      for (const w of userParts.sort((a, b) => b.length - a.length)) if (w.length >= 3) rest = rest.split(w).join("_");
      ok(!isTurkishish(rest.replace(/[_\-.]+/g, " ")) && /^[\x20-\x7e]+$/.test(en.filename), `${f.name}: E4 EN dosya adı (${en.filename})`, rest);
    }
  }
  console.log("\n── KISMİ (EN'de Türkçe kalan, sistem metni DEĞİL — sınıflandırılmış):");
  for (const l of partial) console.log(`  ${l}`);
  console.log(`\n=== numeroloji rapor golden: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

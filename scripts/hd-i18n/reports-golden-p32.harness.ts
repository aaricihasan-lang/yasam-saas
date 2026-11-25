/**
 * P32 — HD eski istemci Word hattı (app/human-design/rapor-olustur/helpers/exportHdReportDocx.ts) golden + EN kontrolü.
 *
 * Çalıştır:  npx tsx scripts/hd-i18n/reports-golden-p32.harness.ts                → TR golden + EN kontrolleri
 *            npx tsx scripts/hd-i18n/reports-golden-p32.harness.ts --write-golden → TABANDA TR golden'ı yazar
 *            ... --out <dizin>  → üretilen DOCX'leri (tr/en) diske yazar (Word render örnekleri için)
 *
 * Tarayıcı API'leri (document / URL.createObjectURL) sahte; saat sabit (2026-11-25T21:30Z = İstanbul 26.11 00:30 →
 * dosya adı/kapak tarihi İstanbul günü). Kullanıcı içeriği ⟦…⟧ nöbetçileriyle işaretlidir: EN'de AYNEN kalmalı,
 * sistem metninde Türkçe 0 (Türkçe harf + ASCII-katlanmış sözcük listesi).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { digest, docxParts, textNodes } from "./reports-golden/normalize";

const ROOT = process.cwd();
const GOLDEN = join(ROOT, "scripts/hd-i18n/golden/p32-tr.golden.json");
const WRITE = process.argv.includes("--write-golden");
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;

// ── Sabit saat ───────────────────────────────────────────────────────────────
const FIXED = Date.parse("2026-11-25T21:30:00.000Z");
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length === 0) super(FIXED);
    else super(...(a as [number]));
  }
  static now() {
    return FIXED;
  }
}
(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;

// ── Sahte tarayıcı indirme ───────────────────────────────────────────────────
type Captured = { filename: string; bytes: Uint8Array };
const blobs = new Map<string, Blob>();
let captured: Promise<Captured> | null = null;
let seq = 0;
(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
  const id = `blob:p32-${++seq}`;
  blobs.set(id, b);
  return id;
};
(URL as unknown as { revokeObjectURL: (id: string) => void }).revokeObjectURL = () => {};
const anchor = {
  href: "",
  download: "",
  click() {
    const b = blobs.get(this.href)!;
    const filename = this.download;
    captured = b.arrayBuffer().then((ab) => ({ filename, bytes: new Uint8Array(ab) }));
  },
};
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => anchor,
  body: { appendChild() {}, removeChild() {} },
};

type Params = { reportTitle: string; clientName: string; reportText: string };
const FIXTURES: Record<string, Params> = {
  tam: {
    reportTitle: "⟦Ayşe Örnek Özel Başlık⟧",
    clientName: "⟦Ayşe Gül Şahin Örnek⟧",
    reportText: [
      "# ⟦Genel Bölüm Başlığı⟧",
      "",
      "⟦Düz paragraf: şğüöçİı metni.⟧",
      "**⟦kalın bölüm⟧**⟦ ara metin ⟧*⟦italik bölüm⟧*",
      "",
      "## ⟦İkinci düzey⟧",
      "- ⟦birinci madde⟧",
      "* ⟦ikinci madde **kalın**⟧",
      "---",
      "### ⟦Tipler — Jeneratör⟧",
      "⟦Kayıtlı Bilgi Bankası içeriği (kullanıcı verisi).⟧",
    ].join("\n"),
  },
  kisa: {
    reportTitle: "⟦Kısa⟧",
    clientName: "⟦Çağrı İnce⟧",
    reportText: "⟦Tek satır.⟧",
  },
  bosAd: {
    reportTitle: "⟦Başlık⟧",
    clientName: "⟦⟧",
    reportText: "⟦Metin⟧",
  },
};

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    fails.push(label);
    console.log(`  FAIL  ${label}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
}

async function render(p: Params, locale?: "tr" | "en"): Promise<Captured> {
  const mod = await import("../../app/human-design/rapor-olustur/helpers/exportHdReportDocx");
  captured = null;
  await (mod.exportHdReportDocx as (x: unknown) => Promise<void>)({ ...p, ...(locale ? { locale } : {}) });
  if (!captured) throw new Error("indirme yakalanmadı");
  return captured;
}

const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
// ASCII-katlanmış Türkçe sistem sözcükleri (EN çıktıda olmamalı).
const TR_ASCII = /\b(Danisan|Rapor|Raporu|Olusturma|Tarihi|Bilgilendirme|kisisel|farkindalik|amaclidir|tavsiye|niteligi)\b/i;
const stripUser = (s: string) => s.replace(/⟦[^⟧]*⟧/g, "");

async function main() {
  const golden: Record<string, { digest: string; parts: Record<string, string>; filename: string }> = {};
  const prior = existsSync(GOLDEN) ? (JSON.parse(readFileSync(GOLDEN, "utf8")) as { fixtures: typeof golden }) : null;
  if (OUT) mkdirSync(OUT, { recursive: true });

  console.log(WRITE ? "── TR golden YAZILIYOR (taban) ──" : "── TR golden (parametresiz + açık tr) ──");
  for (const [name, p] of Object.entries(FIXTURES)) {
    const a = await render(p);
    const parts = (await docxParts(a.bytes)).parts;
    golden[name] = { digest: digest(parts), parts, filename: a.filename };
    if (OUT) writeFileSync(join(OUT, `P32-${name}-tr.docx`), a.bytes);
    if (WRITE) continue;
    const g = prior?.fixtures[name];
    ok(!!g && g.digest === golden[name].digest, `TR ${name}: parametresiz normalize SHA = golden`, g ? Object.keys(parts).filter((k) => parts[k] !== g.parts[k]) : "golden yok");
    ok(!!g && g.filename === a.filename, `TR ${name}: dosya adı = golden (${a.filename})`);
    const b = await render(p, "tr");
    const pb = (await docxParts(b.bytes)).parts;
    ok(!!g && digest(pb) === g.digest && b.filename === g.filename, `TR ${name}: açık locale=tr normalize SHA = golden`);
  }
  if (WRITE) {
    mkdirSync(join(ROOT, "scripts/hd-i18n/golden"), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify({ producer: "P32 exportHdReportDocx", fixedNow: new RealDate(FIXED).toISOString(), fixtures: golden }, null, 2) + "\n");
    console.log(`golden yazıldı: ${GOLDEN}`);
    return;
  }

  console.log("── EN kontrolleri ──");
  for (const [name, p] of Object.entries(FIXTURES)) {
    const e = await render(p, "en");
    if (OUT) writeFileSync(join(OUT, `P32-${name}-en.docx`), e.bytes);
    const { xml } = await docxParts(e.bytes);
    const doc = xml["word/document.xml"] ?? "";
    const nodes = textNodes(doc);
    // Nöbetçi markdown ile birden çok run'a bölünebilir → düğümler birleştirilip nöbetçiler bütün olarak çıkarılır.
    const SEP = String.fromCharCode(1);
    const sys = stripUser(nodes.join(SEP)).split(SEP).filter((s) => s.trim());
    const trHits = sys.filter((s) => TR_LETTERS.test(s) || TR_ASCII.test(s));
    ok(trHits.length === 0, `EN ${name}: sistem metninde Türkçe 0 (harf + ASCII-katlanmış)`, trHits);
    const joined = nodes.join("");
    const sentinels = (Object.values(p).join("\n").match(/⟦[^⟧]*⟧/g) ?? []).map((s) => s.replace(/\*\*|\*/g, ""));
    // Markdown (**, *) sözdizimi run'lara ayrıştırıldığı için yalnız yıldızsız nöbetçi metinleri aranır.
    const missing = sentinels.filter((s) => !joined.includes(s.replace(/^⟦|⟧$/g, "")) && !joined.includes(s));
    ok(missing.length === 0, `EN ${name}: kullanıcı içeriği aynen`, missing);
    const styles = xml["word/styles.xml"] ?? "";
    ok(/w:lang w:val="en-GB"/.test(styles), `EN ${name}: w:lang=en-GB (styles.xml)`);
    ok(e.filename.startsWith("Human-Design-Report-") && e.filename.endsWith("-2026-11-26.docx") && !TR_LETTERS.test(e.filename), `EN ${name}: dosya adı EN (${e.filename})`);
    ok(joined.includes("26 November 2026"), `EN ${name}: kapak tarihi en-GB uzun biçim`);
    const trXml = (await docxParts((await render(p)).bytes)).xml;
    ok(!/w:lang/.test(trXml["word/styles.xml"] ?? "") && !/w:lang/.test(trXml["word/document.xml"] ?? ""), `TR ${name}: belge dil işareti YOK`);
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.log(" - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

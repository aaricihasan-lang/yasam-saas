/**
 * F3B — Kademe B markalı ÖRNEK + uç durum üretimi ve yapı denetimi (SENTETİK profil / logolar; gerçek kişi / marka YOK).
 *
 *  Her Kademe B senaryosu × profil (tam, yalnız unvan, yalnız kurum, uzun kurum, Türkçe unvan, uzun dipnot,
 *  `& " < > emoji`, logo yok, dikey logo, şeffaf logo, bozuk logo, yalnız dipnot):
 *   DOCX — zip açılır, TÜM XML parçaları katı (strict) sax ile ayrıştırılır; beklenen alanlar var, gösterilmeyen alanlar yok;
 *          Yaşam Sistemi / bilgilendirme / kullanım notu metinleri aynen; üst-alt bilgi + stil parçaları markasızla BİREBİR;
 *          gövde değişikliği tek noktada EKLEME (Kupa yıllık takvim hariç: sayfa kararı); logo media sayısı +1.
 *   PDF  — dosyalar + manifest (check.py: pypdf / PyMuPDF açılış, sayfa sayısı, gömülü yazı tipi, alanlar, logo, taşma).
 *   Hacamat — form adı KORUNUR: markalamada (hatalı çözücü simülasyonu) ad olsa bile profil adı belgeye GİRMEZ.
 *   Kural "none" (Hacamat form adı boş / GET) — markalı girdiyle bile çıktı markasızla birebir.
 *   Word ↔ PDF tutarlılığı (Hacamat, Atlas): aynı markalamadan iki biçimde aynı alan kümesi (manifest; check.py doğrular).
 *
 * Çalıştır: npx tsx scripts/expert-branding/kademeB/samples.ts [--out <klasör>]  (verilmezse geçici klasör)
 * Çıktı: <out>/docx, <out>/pdf, <out>/logolar, <out>/manifest.json ; "N PASS / M FAIL"
 */
import { allKademeBCases } from "./cases";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import JSZip from "jszip";
import { syntheticLogo, type SyntheticLogoKind } from "../syntheticLogos";
import { normalizeKademeBDocx } from "./normalize";
import { normalizeExpertBranding, type ExpertBranding, type ExpertBrandingInput } from "@/lib/docx/expertBranding";
import { expertSignaturePdfTexts, pdfSafeText } from "@/lib/pdf/expertBrandingPdf";

type SaxParser = { write(x: string): SaxParser; close(): void };
const sax = createRequire(__filename)("sax") as { parser(strict: boolean): SaxParser };

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
// --out verilmezse (CI regresyon listesi) geçici klasöre yazılır.
const OUT = arg("--out") ?? mkdtempSync(path.join(tmpdir(), "f3b-kademeb-"));
for (const d of ["docx", "pdf", "logolar", "docx-markasiz", "pdf-markasiz"]) mkdirSync(path.join(OUT, d), { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail = "") {
  if (cond) pass++;
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const BASE: ExpertBrandingInput = {
  name: "Ayşe Yılmaz",
  title: "Refleksoloji ve Kupa Uygulama Uzmanı",
  organization: "Ayşe Yılmaz Yaşam Merkezi",
  phone: "+90 5xx xxx xx xx (sahte)",
  email: "ayse.yilmaz@example.invalid",
  website: "www.ornek-yasam-merkezi.example",
  note: "Bu rapor, seans sürecinizi desteklemek amacıyla hazırlanmıştır. Sorularınız için yazılı olarak ulaşabilirsiniz.",
};
const LONG_NOTE =
  "Bu raporda yer alan öneriler, görüşmemizde birlikte belirlediğimiz hedeflere göre düzenlenmiştir. Uygulamalar sırasında kendinizi nasıl hissettiğinizi not etmeniz, bir sonraki görüşmemizde süreci birlikte değerlendirmemizi kolaylaştırır.\n\n" +
  "Önerilen çalışmaları günlük yaşamınıza kademeli olarak eklemeniz; dinlenme, su tüketimi ve uyku düzenine özen göstermeniz önerilir. Herhangi bir rahatsızlık hissettiğinizde uygulamaya ara veriniz ve bana bilgi veriniz.\n\n" +
  "Bu not, uzmanın kişisel açıklamasıdır; rapordaki bilgilendirme metninin yerine geçmez. Şükran ve sevgiyle — İyi günler dilerim (ığüşöç ĞÜŞİÖÇ).";

type Profile = { key: string; label: string; input: ExpertBrandingInput; logo: SyntheticLogoKind | "bozuk" | null };
const PROFILES: Profile[] = [
  { key: "tam", label: "Tam profil (yatay logo)", input: BASE, logo: "yatay" },
  { key: "uc-yalniz-unvan", label: "Yalnız unvan", input: { title: "Refleksoloji Uzmanı" }, logo: null },
  { key: "uc-yalniz-kurum", label: "Yalnız kurum", input: { organization: "Ayşe Yılmaz Yaşam Merkezi" }, logo: null },
  { key: "uc-uzun-kurum", label: "Uzun kurum adı", input: { ...BASE, organization: "Ayşe Yılmaz Bütüncül Sağlık, Refleksoloji, Aromaterapi ve Kişisel Gelişim Danışmanlık Merkezi Limited Şirketi — Kadıköy / İstanbul Şubesi" }, logo: "kare" },
  { key: "uc-turkce-unvan", label: "Türkçe karakterli uzun unvan", input: { ...BASE, title: "Uzm. Psikolojik Danışman · Çocuk ve Ergen Gelişimi Eğitmeni (İĞÜŞÖÇ ığüşöç)" }, logo: "kare" },
  { key: "uc-uzun-dipnot", label: "Uzun çok paragraflı dipnot", input: { ...BASE, note: LONG_NOTE }, logo: "kare" },
  { key: "uc-ozel-karakter", label: "Özel karakterler (& \" < > <script> emoji)", input: { ...BASE, name: "Ayşe <script>alert(1)</script> Yılmaz & Ortakları 🌿", organization: "A&B <Merkez> \"Şifa\" 'Evi' 🌸", note: "Not: 5 < 7 & 7 > 5 \u0001 — emoji 🙏 ve yalnız vekil \uD800 temizlenir." }, logo: "kare" },
  { key: "uc-logo-yok", label: "Logo yok", input: BASE, logo: null },
  { key: "uc-dikey-logo", label: "Dikey logo", input: BASE, logo: "dikey" },
  { key: "uc-seffaf-logo", label: "Şeffaf PNG logo", input: BASE, logo: "seffaf" },
  { key: "uc-bozuk-logo", label: "Bozuk logo (PNG değil → logosuz)", input: BASE, logo: "bozuk" },
  { key: "uc-yalniz-dipnot", label: "Yalnız dipnot", input: { note: "Yalnız dipnot satırı — uzman notu." }, logo: null },
];

const MUST_KEEP: Record<string, string[]> = {
  refleks: ["Refleksoloji uygulamaları tamamlayıcı niteliktedir", "Tamamlayıcı uygulama · tıbbi tanı/tedavi yerine geçmez", "Yaşam Sistemi"],
  kupa: ["Bu içerik, uzman tarafından oluşturulan çalışma ve bilgilendirme kaydının bir parçasıdır.", "Yaşam Sistemi™"],
  hacamat: ["Yaşam Sistemi™"],
  atlas: ["Rapor Yaşam Sistemi Astroloji modülünde, kayıtlı analizden oluşturulmuştur.", "YAŞAM SİSTEMİ"],
};
const modOf = (n: string) => n.split("-")[0]!;

async function xml(buf: Buffer): Promise<{ parts: Record<string, string>; errors: string[]; media: number }> {
  const zip = await JSZip.loadAsync(buf);
  const parts: Record<string, string> = {};
  const errors: string[] = [];
  let media = 0;
  for (const f of Object.keys(zip.files)) {
    if (zip.files[f]!.dir) continue;
    if (f.startsWith("word/media/")) media++;
    if (!/\.(xml|rels)$/.test(f)) continue;
    const x = await zip.file(f)!.async("string");
    parts[f] = x;
    try { sax.parser(true).write(x).close(); } catch (e) { errors.push(`${f}: ${(e as Error).message.split("\n")[0]}`); }
  }
  return { parts, errors, media };
}

/** Docx görünür metni (w:t düğümleri; XML kaçışı çözülmüş). */
function docText(x: string): string {
  return [...x.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")).join("");
}

/** a → b tek noktada ekleme mi? (ortak önek + ortak sonek a'yı tamamen kapsıyor) */
function singleInsertion(a: string, b: string): boolean {
  if (b.length < a.length) return false;
  let p = 0;
  while (p < a.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return p + s >= a.length;
}

type ManifestRow = {
  file: string; caseName: string; module: string; kind: "docx" | "pdf"; profile: string; profileLabel: string; rule: string;
  base: string; expect: { present: string[]; absent: string[]; logo: boolean; card: boolean };
};

async function main() {
  const cases = await allKademeBCases();
  const logos: Record<SyntheticLogoKind, Buffer> = { yatay: await syntheticLogo("yatay"), dikey: await syntheticLogo("dikey"), kare: await syntheticLogo("kare"), seffaf: await syntheticLogo("seffaf") };
  for (const [k, v] of Object.entries(logos)) writeFileSync(path.join(OUT!, "logolar", `sentetik-logo-${k}.png`), v);
  const brandingOf = (p: Profile): ExpertBranding | null =>
    normalizeExpertBranding({ ...p.input, logoPng: p.logo === "bozuk" ? Buffer.from("bu bir PNG değil") : p.logo ? logos[p.logo] : null });

  const manifest: ManifestRow[] = [];
  for (const c of cases) {
    const baseBuf = await c.render(null);
    const baseFile = `${c.kind}-markasiz/${c.name}.${c.kind}`;
    writeFileSync(path.join(OUT!, baseFile), baseBuf);
    const base = c.kind === "docx" ? await xml(baseBuf) : null;
    const baseNorm = c.kind === "docx" ? await normalizeKademeBDocx(baseBuf) : null;
    for (const p of PROFILES) {
      const b0 = brandingOf(p);
      ok(`${p.key}: profil normalize edilir`, !!b0);
      if (!b0) continue;
      // Hacamat: hatalı çözücü simülasyonu → markalamada profil adı OLSA bile formdaki ad korunmalı.
      const b: ExpertBranding = c.rule === "named-by-form" || c.rule === "none" ? { ...b0, name: "ZZ Profil Adı Ezmemeli" } : b0;
      const buf = await c.render(b as unknown as Record<string, unknown>);
      const file = `${c.kind}/${c.name}__${p.key}.${c.kind}`;
      writeFileSync(path.join(OUT!, file), buf);
      const label = `${c.name}__${p.key}`;
      const t = expertSignaturePdfTexts(c.rule === "named-by-form" ? { ...b, name: null } : b, { fallbackName: c.formName ?? null });
      const applies = c.rule !== "none";
      const present: string[] = [];
      const absent: string[] = [];
      const f = normalizeExpertBranding({ name: b.name, title: b.title, organization: b.organization, contactLine: b.contactLine, note: b.note, logoPng: b.logoPng ?? null })!;
      const cardShown = applies && !!(t && (t.name || t.title || t.organization || t.contactLine || t.hasLogo));
      if (applies) {
        if (c.rule === "named-by-form") {
          present.push(c.formName!);
          if (b.name && b.name !== c.formName) absent.push(b.name);
        } else if (f.name) present.push(f.name);
        for (const v of [f.title, f.organization, f.contactLine]) if (v) present.push(v);
        if (f.note) present.push(...f.note.split("\n").filter((l) => l.trim()));
        if (cardShown) present.push("İmza");
        if (f.note) present.push("Uzman Notu");
      } else {
        for (const v of [f.name, f.title, f.organization, f.contactLine]) if (v) absent.push(v);
        absent.push("Uzman Notu", "İmza");
      }
      manifest.push({ file, caseName: c.name, module: c.module, kind: c.kind, profile: p.key, profileLabel: p.label, rule: c.rule, base: baseFile, expect: { present: c.kind === "pdf" ? present.map(pdfSafeText) : present, absent: c.kind === "pdf" ? absent.map(pdfSafeText) : absent, logo: applies && !!f.logoPng, card: cardShown } });

      if (c.kind !== "docx") continue;
      const d = await xml(buf);
      ok(`${label}: XML parçaları katı ayrıştırılır`, d.errors.length === 0, d.errors.join("; "));
      const body = docText(d.parts["word/document.xml"] ?? "");
      const allText = Object.entries(d.parts).filter(([k]) => /word\/(document|footer\d*|header\d*)\.xml$/.test(k)).map(([, v]) => docText(v)).join("\n");
      for (const s of present) ok(`${label}: "${s.slice(0, 40)}" var`, body.includes(s));
      for (const s of absent) ok(`${label}: "${s.slice(0, 40)}" YOK`, !allText.includes(s));
      ok(`${label}: <script> kaçışlı (ham etiket yok)`, !(d.parts["word/document.xml"] ?? "").includes("<script>"));
      for (const s of MUST_KEEP[modOf(c.name)] ?? []) ok(`${label}: zorunlu metin aynen: ${s.slice(0, 40)}`, allText.includes(s));
      ok(`${label}: logo media ${applies && f.logoPng ? "+1" : "+0"}`, d.media === base!.media + (applies && f.logoPng ? 1 : 0), `${d.media} vs ${base!.media}`);
      const norm = await normalizeKademeBDocx(buf);
      if (!applies) {
        const diff = Object.keys({ ...norm, ...baseNorm }).filter((k) => norm[k] !== baseNorm![k]);
        ok(`${label}: kural dışı → markasızla BİREBİR`, diff.length === 0, diff.join(","));
        continue;
      }
      const fixedParts = Object.keys(baseNorm!).filter((k) => /word\/(header\d*|footer\d*|styles|settings|numbering|fontTable)\.xml$/.test(k));
      const changed = fixedParts.filter((k) => norm[k] !== baseNorm![k]);
      ok(`${label}: üst/alt bilgi + stil parçaları değişmedi (${fixedParts.length})`, changed.length === 0, changed.join(","));
      if (!c.name.startsWith("kupa-takvim-yillik")) {
        ok(`${label}: gövde değişikliği tek noktada ekleme (kapak / içerik aynen)`, singleInsertion(baseNorm!["word/document.xml"]!, norm["word/document.xml"]!));
      }
    }
  }

  // Word ↔ PDF tutarlılığı: aynı markalamadan üretilen Word ve PDF aynı alan kümesini taşır (PDF'te emoji süzülmüş hâli);
  // gerçek PDF içeriği check.py ile doğrulanır.
  const PAIRS: [string, string][] = [["hacamat-word-form-adli", "hacamat-pdf-form-adli"], ["atlas-toplu-word", "atlas-toplu-pdf"], ["atlas-horary-word", "atlas-horary-pdf"]];
  for (const [w, pdf] of PAIRS) {
    for (const p of PROFILES) {
      const a = manifest.find((m) => m.caseName === w && m.profile === p.key);
      const z = manifest.find((m) => m.caseName === pdf && m.profile === p.key);
      ok(`Word↔PDF ${w} / ${pdf} · ${p.key}: iki biçim de üretildi`, !!a && !!z);
      if (!a || !z) continue;
      const norm = (xs: string[]) => [...new Set(xs.map((x) => pdfSafeText(x).replace(/\s+/g, " ").trim()).filter(Boolean))].sort();
      ok(`Word↔PDF ${p.key} (${w.split("-")[0]}): aynı görünür alanlar`, JSON.stringify(norm(a.expect.present)) === JSON.stringify(norm(z.expect.present)), `${norm(a.expect.present)} | ${norm(z.expect.present)}`);
      ok(`Word↔PDF ${p.key} (${w.split("-")[0]}): aynı gizli alanlar`, JSON.stringify(norm(a.expect.absent)) === JSON.stringify(norm(z.expect.absent)));
      ok(`Word↔PDF ${p.key} (${w.split("-")[0]}): logo ikisinde de ${a.expect.logo ? "var" : "yok"}`, a.expect.logo === z.expect.logo && a.expect.card === z.expect.card);
    }
  }

  writeFileSync(path.join(OUT!, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`\n${manifest.length} markalı örnek (${manifest.filter((m) => m.kind === "docx").length} docx, ${manifest.filter((m) => m.kind === "pdf").length} pdf)`);
  console.log(`${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(fails.slice(0, 40).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });

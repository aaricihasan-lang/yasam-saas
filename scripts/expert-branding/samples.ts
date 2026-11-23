/**
 * F3A — Markalı ÖRNEK üretimi (Owner tasarım seçimi için). SENTETİK profil + SENTETİK logolar;
 * gerçek kişi / marka / danışan verisi YOK.
 *
 *   1) Her Kademe A raporu × 3 varyant (A Kurumsal Premium · B Uzman İmzalı · C Minimal)
 *   2) Her Kademe A raporu × uç durumlar (varsayılan varyant): uzun kurum, Türkçe unvan, uzun dipnot,
 *      özel karakter, logo yok, yalnız unvan, yalnız kurum, dikey logo, şeffaf logo
 *   3) Yapı denetimi: zip açılır, TÜM XML parçaları katı (strict) sax ile ayrıştırılır; beklenen
 *      metinler yerinde; `<script>` kaçışlı; boş profil → null ile normalize parça eşitliği.
 *
 * Çalıştır: npx tsx scripts/expert-branding/samples.ts --out <klasör>
 * Çıktı: <out>/docx/*.docx + <out>/samples.json ; "N PASS / M FAIL"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { createRequire } from "node:module";
import { allReportCases, type ReportCase } from "./reportCases";
import { syntheticLogo, type SyntheticLogoKind } from "./syntheticLogos";
import { normalizeDocx } from "./normalizeDocx";
import { normalizeExpertBranding, type ExpertBranding, type ExpertBrandingInput, type ExpertBrandingVariant } from "@/lib/docx/expertBranding";

// sax (geçişli bağımlılık; yalnız bu örnek aracı) — katı XML iyi-biçimlilik denetimi.
type SaxParser = { write(x: string): SaxParser; close(): void };
const sax = createRequire(import.meta.url)("sax") as { parser(strict: boolean): SaxParser };

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (!OUT) throw new Error("--out gerekli");
const DOCX_DIR = path.join(OUT, "docx");
mkdirSync(DOCX_DIR, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail = "") {
  if (cond) pass++;
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Sentetik profil (gerçek kişi DEĞİL; telefon bilinçli olarak sahte maske).
const BASE: ExpertBrandingInput = {
  name: "Ayşe Yılmaz",
  title: "Refleksoloji Uzmanı",
  organization: "Ayşe Yılmaz Yaşam Merkezi",
  phone: "+90 5xx xxx xx xx (sahte)",
  email: "ayse.yilmaz@example.invalid",
  website: "www.ornek-yasam-merkezi.example",
  note: "Bu rapor, seans sürecinizi desteklemek amacıyla hazırlanmıştır. Sorularınız için randevu saatleri dışında da yazılı olarak ulaşabilirsiniz.",
};
const LONG_NOTE =
  "Bu raporda yer alan öneriler, görüşmemizde birlikte belirlediğimiz hedeflere göre düzenlenmiştir. Uygulamalar sırasında kendinizi nasıl hissettiğinizi not etmeniz, bir sonraki görüşmemizde süreci birlikte değerlendirmemizi kolaylaştırır.\n\n" +
  "Önerilen çalışmaları günlük yaşamınıza kademeli olarak eklemeniz; dinlenme, su tüketimi ve uyku düzenine özen göstermeniz önerilir. Herhangi bir rahatsızlık hissettiğinizde uygulamaya ara veriniz ve bana bilgi veriniz.\n\n" +
  "Bu not, uzmanın kişisel açıklamasıdır; rapordaki bilgilendirme metninin yerine geçmez. Şükran ve sevgiyle — İyi günler dilerim (ığüşöç ĞÜŞİÖÇ).";

type Profile = { key: string; label: string; input: ExpertBrandingInput; logo: SyntheticLogoKind | null };
const VARIANT_PROFILES: Record<ExpertBrandingVariant, Profile> = {
  A: { key: "varyant-A", label: "A · Kurumsal Premium (yatay logo)", input: BASE, logo: "yatay" },
  B: { key: "varyant-B", label: "B · Uzman İmzalı (kare logo)", input: BASE, logo: "kare" },
  C: { key: "varyant-C", label: "C · Minimal (şeffaf logo)", input: BASE, logo: "seffaf" },
};
const EDGE_PROFILES: Profile[] = [
  { key: "uc-uzun-kurum", label: "Uzun kurum adı", input: { ...BASE, organization: "Ayşe Yılmaz Bütüncül Sağlık, Refleksoloji, Aromaterapi ve Kişisel Gelişim Danışmanlık Merkezi Limited Şirketi — Kadıköy / İstanbul Şubesi" }, logo: "kare" },
  { key: "uc-turkce-unvan", label: "Türkçe karakterli uzun unvan", input: { ...BASE, title: "Uzm. Psikolojik Danışman · Çocuk ve Ergen Gelişimi Eğitmeni (İĞÜŞÖÇ ığüşöç)" }, logo: "kare" },
  { key: "uc-uzun-dipnot", label: "Uzun çok paragraflı dipnot", input: { ...BASE, note: LONG_NOTE }, logo: "kare" },
  { key: "uc-ozel-karakter", label: "Özel karakterler (<script>, &, emoji, kontrol karakteri)", input: { ...BASE, name: "Ayşe <script>alert(1)</script> Yılmaz & Ortakları 🌿", organization: "A&B <Merkez> \"Şifa\" 'Evi' 🌸", note: "Not: 5 < 7 & 7 > 5 \u0001 — emoji 🙏 ve yalnız vekil \uD800 temizlenir." }, logo: "kare" },
  { key: "uc-logo-yok", label: "Logo yok", input: BASE, logo: null },
  { key: "uc-yalniz-unvan", label: "Yalnız unvan", input: { title: "Refleksoloji Uzmanı" }, logo: null },
  { key: "uc-yalniz-kurum", label: "Yalnız kurum", input: { organization: "Ayşe Yılmaz Yaşam Merkezi" }, logo: null },
  { key: "uc-dikey-logo", label: "Dikey logo", input: BASE, logo: "dikey" },
  { key: "uc-seffaf-logo", label: "Şeffaf PNG logo", input: BASE, logo: "seffaf" },
];

// Modül başına bir temsilci senaryo (örnekler için).
const SAMPLE_CASES = ["dy-tam", "nkb-tek", "klasik-kisi-tam", "hd-pro1-hazirlayan", "hd-iliski-hazirlayan", "beslenme-plan"];

function escapedText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function xmlParts(buf: Buffer): Promise<{ parts: Record<string, string>; parseErrors: string[] }> {
  const zip = await JSZip.loadAsync(buf);
  const parts: Record<string, string> = {};
  const parseErrors: string[] = [];
  for (const f of Object.keys(zip.files)) {
    if (zip.files[f]!.dir || !/\.(xml|rels)$/.test(f)) continue;
    const x = await zip.file(f)!.async("string");
    parts[f] = x;
    const p = sax.parser(true);
    try { p.write(x).close(); } catch (e) { parseErrors.push(`${f}: ${(e as Error).message.split("\n")[0]}`); }
  }
  return { parts, parseErrors };
}

type SampleRow = { file: string; caseName: string; module: string; profile: string; variant: ExpertBrandingVariant; expectations: string[] };

async function main() {
  const cases = await allReportCases();
  const byName = new Map(cases.map((c) => [c.name, c] as [string, ReportCase]));
  const logos: Record<SyntheticLogoKind, Buffer> = {
    yatay: await syntheticLogo("yatay"), dikey: await syntheticLogo("dikey"), kare: await syntheticLogo("kare"), seffaf: await syntheticLogo("seffaf"),
  };
  mkdirSync(path.join(OUT!, "logolar"), { recursive: true });
  for (const [k, v] of Object.entries(logos)) writeFileSync(path.join(OUT!, "logolar", `sentetik-logo-${k}.png`), v);

  const brandingOf = (p: Profile): ExpertBranding => {
    const b = normalizeExpertBranding({ ...p.input, logoPng: p.logo ? logos[p.logo] : null });
    if (!b) throw new Error(`profil boş: ${p.key}`);
    return b;
  };
  const rows: SampleRow[] = [];

  const produce = async (c: ReportCase, p: Profile, variant: ExpertBrandingVariant, tag: string) => {
    const b = brandingOf(p);
    const buf = await c.render({ branding: b, brandingVariant: variant });
    const file = `${c.name}__${tag}.docx`;
    writeFileSync(path.join(DOCX_DIR, file), buf);
    const { parts, parseErrors } = await xmlParts(buf);
    ok(`${file}: tüm XML parçaları katı ayrıştırılır`, parseErrors.length === 0, parseErrors.join("; "));
    const all = Object.values(parts).join("\n");
    const doc = parts["word/document.xml"] ?? "";
    const isHd = c.name.startsWith("hd-");
    const expectations: string[] = [];
    // Kimlik metni: HD'de ad preparedBy'dan gelir (profil adı otomatik yazılmaz).
    if (isHd) {
      if (b.title) { ok(`${file}: HD — unvan (preparedBy dolu)`, doc.includes(escapedText(b.title))); expectations.push("unvan"); }
    } else {
      if (b.name && variant !== "C") { ok(`${file}: ad`, doc.includes(escapedText(b.name))); expectations.push("ad"); }
      if (b.title) { ok(`${file}: unvan`, doc.includes(escapedText(b.title))); expectations.push("unvan"); }
      if (b.organization && variant !== "C") { ok(`${file}: kurum (gövde/alt bilgi)`, all.includes(escapedText(b.organization))); expectations.push("kurum"); }
      if (b.note) {
        const firstLine = b.note.split("\n")[0]!;
        ok(`${file}: dipnot`, doc.includes(escapedText(firstLine)));
        expectations.push("dipnot");
      }
      if (b.contactLine && variant !== "C") { ok(`${file}: iletişim satırı`, doc.includes(escapedText(b.contactLine))); expectations.push("iletişim"); }
      // Bilgilendirme metni korunur (dipnot ek satırdır).
      ok(`${file}: "Bilgilendirme" bölümü korunur`, doc.includes("Bilgilendirme"));
      const zip = await JSZip.loadAsync(buf);
      const media = await Promise.all(Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !zip.files[f]!.dir).map((f) => zip.file(f)!.async("nodebuffer")));
      if (b.logoPng) { ok(`${file}: uzman logosu bayt-bayt gömülü`, media.some((m) => m.equals(b.logoPng!.data))); expectations.push("logo"); }
    }
    ok(`${file}: ham <script> YOK (kaçışlı)`, !/<script>/i.test(all));
    ok(`${file}: XML kontrol karakteri YOK`, !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(all));
    rows.push({ file, caseName: c.name, module: c.module, profile: p.label, variant, expectations });
  };

  for (const name of SAMPLE_CASES) {
    const c = byName.get(name)!;
    for (const v of ["A", "B", "C"] as const) await produce(c, VARIANT_PROFILES[v], v, VARIANT_PROFILES[v].key);
    for (const p of EDGE_PROFILES) await produce(c, p, "B", p.key);
  }

  // Boş profil → normalize null → çıktı null ile BİREBİR.
  ok("boş profil normalizeExpertBranding → null", normalizeExpertBranding({ name: "  ", title: "", organization: "\u0001", note: "\n\n", logoPng: Buffer.from("x") }) === null);
  for (const c of cases) {
    const a = await normalizeDocx(await c.render({ branding: null }));
    const e = await normalizeDocx(await c.render({ branding: { name: " ", title: "", organization: null, contactLine: "", note: "\n" } }));
    ok(`${c.name}: tüm alanları boş branding → null çıktısıyla birebir`, JSON.stringify(a) === JSON.stringify(e));
  }

  // HD: profil adı (branding.name) OTOMATİK yazılmaz; preparedBy değeri değişmez.
  for (const name of ["hd-pro1-hazirlayan", "hd-iliski-hazirlayan", "hd-grup-hazirlayan"]) {
    const c = byName.get(name)!;
    for (const v of ["A", "B", "C"] as const) {
      const x = Object.values(await xmlParts(await c.render({ branding: normalizeExpertBranding({ ...BASE, name: "PROFIL_ADI_OTOMATIK_YAZILMAZ" }), brandingVariant: v }))).map((q) => JSON.stringify(q)).join("");
      ok(`${name} (${v}): profil adı otomatik yazılmaz; preparedBy aynen`, !x.includes("PROFIL_ADI_OTOMATIK_YAZILMAZ") && x.includes("Ayşe Yılmaz"));
      // L (10.11): HD'de iletişim + dipnot YOK; HD ilişki/grup raporunda uzman logosu YOK (Owner güvenli varsayılanları).
      ok(`${name} (${v}): iletişim satırı ve dipnot HD raporuna yazılmaz`, !x.includes("ayse.yilmaz@example.invalid") && !x.includes("seans sürecinizi desteklemek"));
      if (name !== "hd-pro1-hazirlayan") {
        const zip = await JSZip.loadAsync(await c.render({ branding: normalizeExpertBranding({ ...BASE, logoPng: logos.kare }), brandingVariant: v }));
        const media = await Promise.all(Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !zip.files[f]!.dir).map((f) => zip.file(f)!.async("nodebuffer")));
        ok(`${name} (${v}): HD ilişki/grup raporunda uzman logosu gömülmez`, !media.some((m) => m.equals(logos.kare)));
      }
    }
  }

  // HD: preparedBy boşsa markalama HİÇBİR şey eklemez.
  for (const name of ["hd-pro1-hazirlayansiz", "hd-iliski-hazirlayansiz", "hd-eski-duzen"]) {
    const c = byName.get(name)!;
    const a = await normalizeDocx(await c.render({ branding: null }));
    for (const v of ["A", "B", "C"] as const) {
      const e = await normalizeDocx(await c.render({ branding: brandingOf(VARIANT_PROFILES[v]), brandingVariant: v }));
      ok(`${name} (${v}): preparedBy boş / eski düzen → markalama eklenmez (birebir)`, JSON.stringify(a) === JSON.stringify(e));
    }
  }

  writeFileSync(path.join(OUT!, "samples.json"), JSON.stringify(rows, null, 1));
  console.log(`${rows.length} örnek → ${DOCX_DIR}`);
  if (fails.length) console.log("FAILURES:\n" + fails.map((f) => `  - ${f}`).join("\n"));
  console.log(`\nF3A örnek/yapı denetimi: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
